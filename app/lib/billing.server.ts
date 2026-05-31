import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  BILLING_CURRENCY_CODE,
  BILLING_PLAN_KEYS,
  BILLING_PLANS,
  type BillingPlanDefinition,
  type BillingPlanKey,
  calculatePlanOverageOrderCount,
  calculatePlanProjectedChargeUsd,
  calculatePlanUsageChargeUsd,
  findCheapestPlan,
  findRecommendedPlanChange,
  getBillingTestIncludedOrderOverride,
  getBillingPlan,
  isBillingPlanKey,
} from "./billing";

type BillingCheckResult = {
  hasActivePayment: boolean;
  appSubscriptions: Array<{
    id: string;
    name: string;
    test: boolean;
    status: string;
    currentPeriodEnd: string;
    lineItems: Array<{
      id: string;
      plan: {
        pricingDetails:
          | {
              balanceUsed: {
                amount: number;
                currencyCode: string;
              };
              cappedAmount: {
                amount: number;
                currencyCode: string;
              };
              terms: string;
            }
          | {
              interval: string;
              price: {
                amount: number;
                currencyCode: string;
              };
            };
      };
    }>;
  }>;
};

type AdminGraphqlClient = {
  graphql: (
    operation: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

export type BillingContextLike = Awaited<
  ReturnType<typeof authenticate.admin>
>["billing"];

type BillingStateAccess =
  | {
      billing: BillingContextLike;
      admin?: never;
    }
  | {
      billing?: never;
      admin: AdminGraphqlClient;
    };

const ACTIVE_BRIDGE_POINTS_SUBSCRIPTIONS_QUERY = `#graphql
  query BridgePointsActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        test
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
              ... on AppUsagePricing {
                balanceUsed {
                  amount
                  currencyCode
                }
                cappedAmount {
                  amount
                  currencyCode
                }
                terms
              }
            }
          }
        }
      }
    }
  }
`;

const CREATE_USAGE_RECORD_MUTATION = `#graphql
  mutation BridgePointsCreateUsageRecord(
    $description: String!
    $price: MoneyInput!
    $subscriptionLineItemId: ID!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      description: $description
      price: $price
      subscriptionLineItemId: $subscriptionLineItemId
      idempotencyKey: $idempotencyKey
    ) {
      userErrors {
        field
        message
      }
      appUsageRecord {
        id
        description
        price {
          amount
          currencyCode
        }
      }
    }
  }
`;

function hasBillingContext(
  access: BillingStateAccess,
): access is Extract<BillingStateAccess, { billing: BillingContextLike }> {
  return Boolean(access.billing);
}

async function parseAdminGraphqlResponse<T>(
  response: Response,
  fallbackMessage: string,
) {
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{
      message?: string;
    }>;
  };

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).filter(Boolean).join(" / ") ||
        fallbackMessage,
    );
  }

  if (!json.data) {
    throw new Error(fallbackMessage);
  }

  return json.data;
}

async function fetchBridgePointsBillingCheckByAdmin({
  admin,
  isTestMode,
}: {
  admin: AdminGraphqlClient;
  isTestMode: boolean;
}): Promise<BillingCheckResult> {
  const data = await parseAdminGraphqlResponse<{
    currentAppInstallation?: {
      activeSubscriptions?: Array<{
        id: string;
        name: string;
        test: boolean;
        status: string;
        currentPeriodEnd: string;
        lineItems: Array<{
          id: string;
          plan: {
            pricingDetails:
              | {
                  balanceUsed: {
                    amount: string;
                    currencyCode: string;
                  };
                  cappedAmount: {
                    amount: string;
                    currencyCode: string;
                  };
                  terms: string;
                }
              | {
                  interval: string;
                  price: {
                    amount: string;
                    currencyCode: string;
                  };
                };
          };
        }>;
      }>;
    };
  }>(
    await admin.graphql(ACTIVE_BRIDGE_POINTS_SUBSCRIPTIONS_QUERY),
    "BridgePoint の課金状態を取得できませんでした。",
  );

  const appSubscriptions = (data.currentAppInstallation?.activeSubscriptions ?? [])
    .filter(
      (subscription) =>
        isBillingPlanKey(subscription.name) && (isTestMode || !subscription.test),
    )
    .map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      test: subscription.test,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      lineItems: subscription.lineItems.map((lineItem) => {
        const pricingDetails = lineItem.plan.pricingDetails;
        if ("balanceUsed" in pricingDetails) {
          return {
            id: lineItem.id,
            plan: {
              pricingDetails: {
                balanceUsed: {
                  amount: Number(pricingDetails.balanceUsed.amount),
                  currencyCode: pricingDetails.balanceUsed.currencyCode,
                },
                cappedAmount: {
                  amount: Number(pricingDetails.cappedAmount.amount),
                  currencyCode: pricingDetails.cappedAmount.currencyCode,
                },
                terms: pricingDetails.terms,
              },
            },
          };
        }

        return {
          id: lineItem.id,
          plan: {
            pricingDetails: {
              interval: pricingDetails.interval,
              price: {
                amount: Number(pricingDetails.price.amount),
                currencyCode: pricingDetails.price.currencyCode,
              },
            },
          },
        };
      }),
    }));

  return {
    hasActivePayment: appSubscriptions.some(
      (subscription) => subscription.status === "ACTIVE",
    ),
    appSubscriptions,
  };
}

function isUsagePricingDetails(
  pricingDetails: BillingCheckResult["appSubscriptions"][number]["lineItems"][number]["plan"]["pricingDetails"],
): pricingDetails is {
  balanceUsed: {
    amount: number;
    currencyCode: string;
  };
  cappedAmount: {
    amount: number;
    currencyCode: string;
  };
  terms: string;
} {
  return "balanceUsed" in pricingDetails;
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getDaysInMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getBillingCycleStart(periodEndIso: string) {
  const start = new Date(periodEndIso);
  start.setUTCDate(start.getUTCDate() - 30);
  return start;
}

function getActiveBridgePointsSubscription(check: BillingCheckResult) {
  return (
    check.appSubscriptions.find(
      (subscription) =>
        subscription.status === "ACTIVE" && isBillingPlanKey(subscription.name),
    ) ?? null
  );
}

function getUsageLineItem(
  subscription: NonNullable<ReturnType<typeof getActiveBridgePointsSubscription>>,
) {
  return (
    subscription.lineItems.find((lineItem) =>
      isUsagePricingDetails(lineItem.plan.pricingDetails),
    ) ?? null
  );
}

function buildUsageWindow(subscription: ReturnType<typeof getActiveBridgePointsSubscription>) {
  const now = new Date();

  if (subscription?.currentPeriodEnd) {
    const cycleStart = getBillingCycleStart(subscription.currentPeriodEnd);
    const daysElapsed = Math.max(
      1,
      Math.min(
        30,
        Math.ceil((now.getTime() - cycleStart.getTime()) / (24 * 60 * 60 * 1000)),
      ),
    );

    return {
      mode: "billing_cycle" as const,
      startedAt: cycleStart,
      endsAt: new Date(subscription.currentPeriodEnd),
      windowDays: 30,
      daysElapsed,
    };
  }

  const monthStart = getMonthStart(now);
  return {
    mode: "calendar_month" as const,
    startedAt: monthStart,
    endsAt: null,
    windowDays: getDaysInMonth(now),
    daysElapsed: Math.max(
      1,
      Math.ceil((now.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    ),
  };
}

function buildPlanSummary({
  plan,
  currentCycleProcessedOrderCount,
  projectedMonthlyOrderCount,
  currentPlanKey,
}: {
  plan: BillingPlanDefinition;
  currentCycleProcessedOrderCount: number;
  projectedMonthlyOrderCount: number;
  currentPlanKey: BillingPlanKey | null;
}) {
  const effectivePlan = getBillingPlan(plan.key);

  return {
    ...effectivePlan,
    isCurrentPlan: currentPlanKey === plan.key,
    testIncludedOrderOverride: getBillingTestIncludedOrderOverride(plan.key),
    currentCycleOverageOrderCount: calculatePlanOverageOrderCount(
      effectivePlan,
      currentCycleProcessedOrderCount,
    ),
    projectedOverageOrderCount: calculatePlanOverageOrderCount(
      effectivePlan,
      projectedMonthlyOrderCount,
    ),
    currentCycleUsageChargeUsd: calculatePlanUsageChargeUsd(
      effectivePlan,
      currentCycleProcessedOrderCount,
    ),
    projectedUsageChargeUsd: calculatePlanUsageChargeUsd(
      effectivePlan,
      projectedMonthlyOrderCount,
    ),
    currentCycleProjectedTotalChargeUsd: calculatePlanProjectedChargeUsd(
      effectivePlan,
      currentCycleProcessedOrderCount,
    ),
    projectedTotalChargeUsd: calculatePlanProjectedChargeUsd(
      effectivePlan,
      projectedMonthlyOrderCount,
    ),
  };
}

async function getCurrentCycleProcessedOrderCount({
  shop,
  usageWindow,
}: {
  shop: string;
  usageWindow: ReturnType<typeof buildUsageWindow>;
}) {
  return prisma.grantExecutionLock.count({
    where: {
      shop,
      sourceType: "order_paid",
      status: "processed",
      processedAt: {
        not: null,
        gte: usageWindow.startedAt,
        ...(usageWindow.endsAt ? { lte: usageWindow.endsAt } : {}),
      },
    },
  });
}

async function loadCurrentBridgePointsBillingState({
  shop,
  ...access
}: BillingStateAccess & {
  shop: string;
}) {
  const isTestMode = isBillingTestModeEnabled();
  const billingCheck = hasBillingContext(access)
    ? await access.billing.check({
        plans: [...BILLING_PLAN_KEYS],
        isTest: isTestMode,
      })
    : await fetchBridgePointsBillingCheckByAdmin({
        admin: access.admin,
        isTestMode,
      });
  const subscription = getActiveBridgePointsSubscription(billingCheck);
  const currentPlanKey =
    subscription && isBillingPlanKey(subscription.name) ? subscription.name : null;
  const currentPlan = currentPlanKey ? getBillingPlan(currentPlanKey) : null;
  const usageWindow = buildUsageWindow(subscription);
  const currentCycleProcessedOrderCount = await getCurrentCycleProcessedOrderCount({
    shop,
    usageWindow,
  });
  const usageLineItem = subscription ? getUsageLineItem(subscription) : null;
  const usagePricing = usageLineItem?.plan.pricingDetails;

  return {
    isTestMode,
    billingCheck,
    subscription,
    currentPlanKey,
    currentPlan,
    usageWindow,
    currentCycleProcessedOrderCount,
    usageLineItem,
    usagePricing:
      usagePricing && isUsagePricingDetails(usagePricing) ? usagePricing : null,
  };
}

export function isBillingTestModeEnabled() {
  return process.env.SHOPIFY_BILLING_TEST_MODE !== "false";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "課金状態を確認できませんでした。";
}

export async function getBridgePointsBillingGate({
  shop,
  ...access
}: BillingStateAccess & {
  shop: string;
}) {
  try {
    const { isTestMode, billingCheck, currentPlanKey, currentPlan, subscription } =
      await loadCurrentBridgePointsBillingState({
        shop,
        ...access,
      });

    return {
      ok: true as const,
      isTestMode,
      hasActivePayment: billingCheck.hasActivePayment && Boolean(currentPlanKey),
      currentPlanKey,
      currentPlanLabel: currentPlan?.label ?? null,
      subscriptionStatus: subscription?.status ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      isTestMode: isBillingTestModeEnabled(),
      hasActivePayment: false,
      currentPlanKey: null,
      currentPlanLabel: null,
      subscriptionStatus: null,
      error: getErrorMessage(error),
    };
  }
}

export async function getShopBillingOverview({
  billing,
  shop,
}: {
  billing: BillingContextLike;
  shop: string;
}) {
  const {
    isTestMode,
    billingCheck,
    subscription,
    currentPlanKey,
    usageWindow,
    currentCycleProcessedOrderCount,
    usageLineItem,
    usagePricing,
  } = await loadCurrentBridgePointsBillingState({
    billing,
    shop,
  });
  const projectedMonthlyOrderCount = Math.max(
    currentCycleProcessedOrderCount,
    Math.ceil((currentCycleProcessedOrderCount / usageWindow.daysElapsed) * usageWindow.windowDays),
  );
  const planSummaries = BILLING_PLANS.map((plan) =>
    buildPlanSummary({
      plan,
      currentCycleProcessedOrderCount,
      projectedMonthlyOrderCount,
      currentPlanKey,
    }),
  );
  const recommendedPlanChange = findRecommendedPlanChange({
    currentPlanKey,
    projectedMonthlyOrderCount,
  });
  const suggestedStartingPlan = findCheapestPlan(projectedMonthlyOrderCount);

  return {
    isTestMode,
    hasActivePayment: billingCheck.hasActivePayment,
    currentPlan:
      currentPlanKey
        ? buildPlanSummary({
            plan: BILLING_PLANS.find((plan) => plan.key === currentPlanKey) ?? BILLING_PLANS[0],
            currentCycleProcessedOrderCount,
            projectedMonthlyOrderCount,
            currentPlanKey,
          })
        : null,
    subscription: subscription
      ? {
          id: subscription.id,
          name: subscription.name,
          status: subscription.status,
          test: subscription.test,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    usageWindow: {
      mode: usageWindow.mode,
      startedAt: usageWindow.startedAt.toISOString(),
      endsAt: usageWindow.endsAt?.toISOString() ?? null,
      windowDays: usageWindow.windowDays,
      daysElapsed: usageWindow.daysElapsed,
    },
    metrics: {
      currentCycleProcessedOrderCount,
      projectedMonthlyOrderCount,
      projectedRunRateMultiplier: Math.round(
        (usageWindow.windowDays / usageWindow.daysElapsed) * 100,
      ) / 100,
    },
    usageLineItem:
      usagePricing && isUsagePricingDetails(usagePricing)
        ? {
            id: usageLineItem?.id ?? null,
            balanceUsed: usagePricing.balanceUsed,
            cappedAmount: usagePricing.cappedAmount,
            terms: usagePricing.terms,
          }
        : null,
    planSummaries,
    suggestedStartingPlan: {
      key: suggestedStartingPlan.key,
      label: suggestedStartingPlan.label,
      projectedTotalChargeUsd: calculatePlanProjectedChargeUsd(
        suggestedStartingPlan,
        projectedMonthlyOrderCount,
      ),
    },
    recommendation: recommendedPlanChange
      ? {
          planKey: recommendedPlanChange.plan.key,
          planLabel: recommendedPlanChange.plan.label,
          direction: recommendedPlanChange.direction,
          projectedSavingsUsd: recommendedPlanChange.projectedSavingsUsd,
          currentPlanProjectedChargeUsd: recommendedPlanChange.currentPlanProjectedChargeUsd,
          recommendedPlanProjectedChargeUsd:
            recommendedPlanChange.recommendedPlanProjectedChargeUsd,
        }
      : null,
    pricing: {
      currencyCode: BILLING_CURRENCY_CODE,
    },
  };
}

export async function previewProcessedOrderUsageCharge({
  shop,
  additionalProcessedOrderCount = 1,
  ...access
}: BillingStateAccess & {
  shop: string;
  additionalProcessedOrderCount?: number;
}) {
  const {
    subscription,
    currentPlan,
    currentCycleProcessedOrderCount,
    usageLineItem,
    usagePricing,
  } = await loadCurrentBridgePointsBillingState({
    shop,
    ...access,
  });
  const normalizedAdditionalCount = Math.max(
    0,
    Math.floor(additionalProcessedOrderCount),
  );
  const nextProcessedOrderCount =
    currentCycleProcessedOrderCount + normalizedAdditionalCount;

  if (!subscription || !currentPlan) {
    return {
      status: "no_active_plan" as const,
      currentProcessedOrderCount: currentCycleProcessedOrderCount,
      nextProcessedOrderCount,
      plan: null,
      chargeAmountUsd: 0,
    };
  }

  if (currentPlan.isUnlimited) {
    return {
      status: "unlimited" as const,
      currentProcessedOrderCount: currentCycleProcessedOrderCount,
      nextProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      chargeAmountUsd: 0,
    };
  }

  if (nextProcessedOrderCount <= currentPlan.includedMonthlyOrders) {
    return {
      status: "within_included" as const,
      currentProcessedOrderCount: currentCycleProcessedOrderCount,
      nextProcessedOrderCount,
      includedMonthlyOrders: currentPlan.includedMonthlyOrders,
      remainingIncludedOrders: Math.max(
        0,
        currentPlan.includedMonthlyOrders - nextProcessedOrderCount,
      ),
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      chargeAmountUsd: 0,
    };
  }

  if (!usageLineItem || !usagePricing) {
    return {
      status: "no_usage_line_item" as const,
      currentProcessedOrderCount: currentCycleProcessedOrderCount,
      nextProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      chargeAmountUsd: 0,
    };
  }

  if (usagePricing.balanceUsed.amount >= usagePricing.cappedAmount.amount) {
    return {
      status: "usage_cap_reached" as const,
      currentProcessedOrderCount: currentCycleProcessedOrderCount,
      nextProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      chargeAmountUsd: 0,
    };
  }

  return {
    status: "would_charge" as const,
    currentProcessedOrderCount: currentCycleProcessedOrderCount,
    nextProcessedOrderCount,
    overageOrderCount: nextProcessedOrderCount - currentPlan.includedMonthlyOrders,
    plan: {
      key: currentPlan.key,
      label: currentPlan.label,
    },
    chargeAmountUsd: currentPlan.overageUnitPriceUsd,
  };
}

export async function recordProcessedOrderUsageCharge({
  shop,
  orderId,
  ...access
}: BillingStateAccess & {
  shop: string;
  orderId: string;
}) {
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    throw new Error("orderId は必須です。");
  }

  const {
    isTestMode,
    subscription,
    currentPlan,
    currentCycleProcessedOrderCount,
    usageLineItem,
    usagePricing,
  } = await loadCurrentBridgePointsBillingState({
    shop,
    ...access,
  });

  if (!subscription || !currentPlan) {
    return {
      status: "skipped_no_active_plan" as const,
      processedOrderCount: currentCycleProcessedOrderCount,
      plan: null,
      usageRecord: null,
    };
  }

  if (currentPlan.isUnlimited) {
    return {
      status: "skipped_unlimited" as const,
      processedOrderCount: currentCycleProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      usageRecord: null,
    };
  }

  if (currentCycleProcessedOrderCount <= currentPlan.includedMonthlyOrders) {
    return {
      status: "skipped_included" as const,
      processedOrderCount: currentCycleProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      usageRecord: null,
    };
  }

  if (!usageLineItem || !usagePricing) {
    return {
      status: "skipped_no_usage_line_item" as const,
      processedOrderCount: currentCycleProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      usageRecord: null,
    };
  }

  if (usagePricing.balanceUsed.amount >= usagePricing.cappedAmount.amount) {
    return {
      status: "skipped_usage_cap_reached" as const,
      processedOrderCount: currentCycleProcessedOrderCount,
      plan: {
        key: currentPlan.key,
        label: currentPlan.label,
      },
      usageRecord: null,
    };
  }

  const usageRecord = hasBillingContext(access)
    ? await access.billing.createUsageRecord({
        description: `BridgePoint order overage for ${normalizedOrderId}`,
        price: {
          amount: currentPlan.overageUnitPriceUsd,
          currencyCode: BILLING_CURRENCY_CODE,
        },
        isTest: isTestMode,
        subscriptionLineItemId: usageLineItem.id,
        idempotencyKey: `bridge-points-order-overage:${normalizedOrderId}`,
      })
    : await (async () => {
        const data = await parseAdminGraphqlResponse<{
          appUsageRecordCreate: {
            userErrors: Array<{
              field: string[] | null;
              message: string;
            }>;
            appUsageRecord: {
              id: string;
              description: string;
              price: {
                amount: string;
                currencyCode: string;
              };
            } | null;
          };
        }>(
          await access.admin.graphql(CREATE_USAGE_RECORD_MUTATION, {
            variables: {
              description: `BridgePoint order overage for ${normalizedOrderId}`,
              price: {
                amount: currentPlan.overageUnitPriceUsd,
                currencyCode: BILLING_CURRENCY_CODE,
              },
              subscriptionLineItemId: usageLineItem.id,
              idempotencyKey: `bridge-points-order-overage:${normalizedOrderId}`,
            },
          }),
          "BridgePoint の usage record を作成できませんでした。",
        );

        const userErrors = data.appUsageRecordCreate.userErrors ?? [];
        if (userErrors.length > 0 || !data.appUsageRecordCreate.appUsageRecord) {
          throw new Error(
            userErrors.map((error) => error.message).join(" / ") ||
              "BridgePoint の usage record を作成できませんでした。",
          );
        }

        return {
          id: data.appUsageRecordCreate.appUsageRecord.id,
          description: data.appUsageRecordCreate.appUsageRecord.description,
          price: {
            amount: Number(data.appUsageRecordCreate.appUsageRecord.price.amount),
            currencyCode:
              data.appUsageRecordCreate.appUsageRecord.price.currencyCode,
          },
        };
      })();

  return {
    status: "charged" as const,
    processedOrderCount: currentCycleProcessedOrderCount,
    plan: {
      key: currentPlan.key,
      label: currentPlan.label,
    },
    usageRecord: {
      id: usageRecord.id,
      description: usageRecord.description,
      price: usageRecord.price,
    },
  };
}
