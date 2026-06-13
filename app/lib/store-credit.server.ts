import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
  recordProcessedOrderUsageCharge,
  type BillingContextLike,
} from "./billing.server";

type AdminGraphqlClient = {
  graphql: (
    operation: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type Money = {
  amount: string;
  currencyCode: string;
};

type CustomerMatch = {
  id: string;
  displayName: string | null;
  defaultEmailAddress: {
    emailAddress: string | null;
  } | null;
};

type CustomerReference = {
  id: string;
  displayName: string | null;
  defaultEmailAddress: {
    emailAddress: string | null;
  } | null;
};

type CreditTransactionNode = {
  __typename: "StoreCreditAccountCreditTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  expiresAt: string | null;
  remainingAmount: Money | null;
};

type DebitTransactionNode = {
  __typename: "StoreCreditAccountDebitTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
};

type DebitRevertTransactionNode = {
  __typename: "StoreCreditAccountDebitRevertTransaction";
  id: string;
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  debitTransaction: {
    id: string;
  } | null;
};

type ExpirationTransactionNode = {
  __typename: "StoreCreditAccountExpirationTransaction";
  amount: Money;
  balanceAfterTransaction: Money;
  createdAt: string;
  creditTransaction: {
    id: string;
  } | null;
};

type SummaryTransactionNode =
  | CreditTransactionNode
  | DebitTransactionNode
  | DebitRevertTransactionNode
  | ExpirationTransactionNode;

type StoreCreditAccountSummary = {
  id: string;
  balance: Money;
  recentTransactions: {
    edges: Array<{
      node: SummaryTransactionNode;
    }>;
  };
  expiringTransactions: {
    edges: Array<{
      node: CreditTransactionNode;
    }>;
  };
};

type CustomerSummaryRecord = CustomerMatch & {
  storeCreditAccounts: {
    edges: Array<{
      node: StoreCreditAccountSummary;
    }>;
  };
};

type ManualGrantRequest = {
  admin: AdminGraphqlClient;
  shop: string;
  customerEmail: string;
  amount: string;
  currencyCode: string;
  expiresInDays: number;
  notifyCustomer: boolean;
  reason: string;
};

type ManualGrantByCustomerIdRequest = Omit<ManualGrantRequest, "customerEmail"> & {
  customerId: string;
};

export const ORDER_PAID_TRIGGER_TOPIC = "orders/paid";
const ORDER_PAID_GRANT_RULE_VERSION = "2026-06-v1";
const ORDER_PAID_LOCK_RETENTION_DAYS = 400;
const ORDER_PAID_LOCK_PREFIX = "order_paid";

function buildExpiryAt(expiresInDays: number) {
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt.toISOString();
}

function parseMoneyAmount(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrencyCode(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function isValidCurrencyCode(value: string | null | undefined) {
  return /^[A-Z]{3}$/.test(normalizeCurrencyCode(value));
}

function normalizePositiveInteger(
  value: number | string | null | undefined,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOrderPaidGrantLockKey({
  orderId,
  ruleVersion = ORDER_PAID_GRANT_RULE_VERSION,
}: {
  orderId: string;
  ruleVersion?: string;
}) {
  return `${ORDER_PAID_LOCK_PREFIX}:${ruleVersion}:${orderId.trim()}`;
}

function extractGraphqlErrorMessage(json: Record<string, unknown>) {
  const errors = Array.isArray(json.errors) ? json.errors : [];
  const messages = errors
    .map((error) =>
      typeof error === "object" && error && "message" in error
        ? String(error.message ?? "")
        : "",
    )
    .filter(Boolean);

  return messages[0] ?? "";
}

function classifyOrderPaidGrantError(message: string): "failed" | "unknown" {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("network") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("ehostunreach") ||
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("500")
  ) {
    return "unknown";
  }

  return "failed";
}

function calculateOrderPaidGrantAmount({
  orderTotalAmount,
  grantRateNumerator,
  grantRateDenominator,
}: {
  orderTotalAmount: string;
  grantRateNumerator: number;
  grantRateDenominator: number;
}) {
  const parsedOrderTotalAmount = Number(orderTotalAmount);

  if (!Number.isFinite(parsedOrderTotalAmount) || parsedOrderTotalAmount <= 0) {
    throw new Error("注文金額は 0 より大きい数値で入力してください。");
  }

  return Math.floor((parsedOrderTotalAmount * grantRateNumerator) / grantRateDenominator);
}

async function buildOrderPaidGrantPreview({
  admin,
  shop,
  orderId,
  customerId,
  orderTotalAmount,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  orderId: string;
  customerId: string;
  orderTotalAmount: string;
}) {
  const normalizedOrderId = orderId.trim();
  const normalizedCustomerId = customerId.trim();

  if (!normalizedOrderId) {
    throw new Error("注文 ID を入力してください。");
  }

  if (!normalizedCustomerId) {
    throw new Error("顧客 ID を入力してください。");
  }

  const { shopCurrency, settings } =
    await getConfiguredGrantCurrencyCode({
      admin,
      shop,
    });
  const grantAmount = calculateOrderPaidGrantAmount({
    orderTotalAmount,
    grantRateNumerator: settings.grantRateNumerator,
    grantRateDenominator: settings.grantRateDenominator,
  });
  const key = buildOrderPaidGrantLockKey({
    orderId: normalizedOrderId,
  });

  return {
    normalizedOrderId,
    normalizedCustomerId,
    grantAmount,
    settings,
    preview: {
      key,
      triggerTopic: ORDER_PAID_TRIGGER_TOPIC,
      grantRuleVersion: ORDER_PAID_GRANT_RULE_VERSION,
      dedupeRetentionDays: ORDER_PAID_LOCK_RETENTION_DAYS,
      orderId: normalizedOrderId,
      customerId: normalizedCustomerId,
      orderTotalAmount,
      shopCurrency,
      grantCurrencyCode: shopCurrency,
      grantAmount: String(grantAmount),
      defaultExpiryDays: settings.defaultExpiryDays,
      grantRateNumerator: settings.grantRateNumerator,
      grantRateDenominator: settings.grantRateDenominator,
    },
  };
}

function serializeManualGrantLog(log: {
  id: string;
  customerEmail: string;
  customerDisplayName: string | null;
  amount: string;
  currencyCode: string;
  createdAt: Date;
  expiresAt: Date | null;
  reason: string | null;
  notifyCustomer: boolean;
  balanceAfterAmount: string | null;
}) {
  return {
    id: log.id,
    customerEmail: log.customerEmail,
    customerDisplayName: log.customerDisplayName,
    amount: log.amount,
    currencyCode: log.currencyCode,
    createdAt: log.createdAt.toISOString(),
    expiresAt: log.expiresAt?.toISOString() ?? null,
    reason: log.reason,
    notifyCustomer: log.notifyCustomer,
    balanceAfterAmount: log.balanceAfterAmount,
  };
}

function serializeGrantExecutionLock(lock: {
  id: string;
  key: string;
  sourceType: string;
  sourceId: string | null;
  status: string;
  payloadJson: string | null;
  processedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: lock.id,
    key: lock.key,
    sourceType: lock.sourceType,
    sourceId: lock.sourceId,
    status: lock.status,
    payloadJson: lock.payloadJson,
    processedAt: lock.processedAt?.toISOString() ?? null,
    createdAt: lock.createdAt.toISOString(),
  };
}

function serializeShopSettings(settings: {
  autoGrantEnabled: boolean;
  grantRateNumerator: number;
  grantRateDenominator: number;
  defaultGrantCurrencyCode: string | null;
  defaultExpiryDays: number;
  manualDefaultExpiryDays: number;
}) {
  return {
    autoGrantEnabled: settings.autoGrantEnabled,
    grantRateNumerator: settings.grantRateNumerator,
    grantRateDenominator: settings.grantRateDenominator,
    defaultGrantCurrencyCode:
      normalizeCurrencyCode(settings.defaultGrantCurrencyCode) || "JPY",
    defaultExpiryDays: settings.defaultExpiryDays,
    manualDefaultExpiryDays: settings.manualDefaultExpiryDays,
  };
}

function mapTransactionType(typeName: SummaryTransactionNode["__typename"]) {
  switch (typeName) {
    case "StoreCreditAccountCreditTransaction":
      return "credit";
    case "StoreCreditAccountDebitTransaction":
      return "debit";
    case "StoreCreditAccountDebitRevertTransaction":
      return "debit_revert";
    case "StoreCreditAccountExpirationTransaction":
      return "expiration";
    default:
      return "unknown";
  }
}

function isProtectedCustomerDataError(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("not approved to access the customer object") ||
    normalized.includes("protected customer data") ||
    normalized.includes("access_denied")
  );
}

async function findCustomerByEmail(
  admin: AdminGraphqlClient,
  email: string,
): Promise<CustomerMatch | null> {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsCustomerByEmail($query: String!) {
        customers(first: 5, query: $query) {
          nodes {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
          }
        }
      }
    `,
    {
      variables: {
        query: `email:${JSON.stringify(email)}`,
      },
    },
  );

  const json = await response.json();
  const nodes = (json.data?.customers?.nodes ?? []) as CustomerMatch[];
  return (
    nodes.find(
      (customer) =>
        customer.defaultEmailAddress?.emailAddress?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

async function createManualGrantLog({
  shop,
  customer,
  transaction,
  customerEmailFallback,
  notifyCustomer,
  reason,
}: {
  shop: string;
  customer: CustomerReference;
  transaction: {
    id: string;
    amount: Money;
    expiresAt: string | null;
    account: {
      id: string;
      balance: Money;
    };
  };
  customerEmailFallback?: string;
  notifyCustomer: boolean;
  reason: string;
}) {
  await prisma.manualGrantLog.create({
    data: {
      shop,
      customerId: customer.id,
      customerEmail:
        customer.defaultEmailAddress?.emailAddress ?? customerEmailFallback ?? "unknown",
      customerDisplayName: customer.displayName,
      amount: transaction.amount.amount,
      currencyCode: transaction.amount.currencyCode,
      expiresAt: transaction.expiresAt ? new Date(transaction.expiresAt) : null,
      notifyCustomer,
      reason: reason || null,
      storeCreditAccountId: transaction.account.id,
      storeCreditTxnId: transaction.id,
      balanceAfterAmount: transaction.account.balance.amount,
    },
  });
}

async function creditStoreCreditAccount({
  admin,
  customerId,
  amount,
  currencyCode,
  expiresInDays,
}: {
  admin: AdminGraphqlClient;
  customerId: string;
  amount: string;
  currencyCode: string;
  expiresInDays: number;
}) {
  const expiresAt = buildExpiryAt(expiresInDays);
  const response = await admin.graphql(
    `#graphql
      mutation BridgePointsManualCredit(
        $id: ID!
        $creditInput: StoreCreditAccountCreditInput!
      ) {
        storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
          storeCreditAccountTransaction {
            id
            amount {
              amount
              currencyCode
            }
            createdAt
            expiresAt
            account {
              id
              balance {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        id: customerId,
        creditInput: {
          creditAmount: {
            amount,
            currencyCode,
          },
          expiresAt,
        },
      },
    },
  );

  const json = await response.json();
  const graphqlErrorMessage = extractGraphqlErrorMessage(json);

  if (!response.ok || graphqlErrorMessage) {
    throw new Error(
      graphqlErrorMessage ||
        `Store Credit の付与に失敗しました。(HTTP ${response.status})`,
    );
  }

  const payload = json.data?.storeCreditAccountCredit;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors[0]?.message ?? "Store Credit の付与に失敗しました。");
  }

  const transaction = payload?.storeCreditAccountTransaction;
  if (!transaction) {
    throw new Error("Store Credit transaction の作成結果を取得できませんでした。");
  }

  return transaction as {
    id: string;
    amount: Money;
    createdAt: string;
    expiresAt: string | null;
    account: {
      id: string;
      balance: Money;
    };
  };
}

export async function getShopCurrency(admin: AdminGraphqlClient) {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsShopCurrency {
        shop {
          currencyCode
        }
      }
    `,
  );
  const json = await response.json();
  return json.data?.shop?.currencyCode ?? "JPY";
}

export async function getShopSettings({
  shop,
  fallbackGrantCurrencyCode,
}: {
  shop: string;
  fallbackGrantCurrencyCode: string;
}) {
  const normalizedFallback = normalizeCurrencyCode(fallbackGrantCurrencyCode) || "JPY";
  const existing = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!existing) {
    return prisma.shopSettings.create({
      data: {
        shop,
        autoGrantEnabled: true,
        grantRateNumerator: 1,
        grantRateDenominator: 100,
        defaultGrantCurrencyCode: normalizedFallback,
        defaultExpiryDays: 365,
        manualDefaultExpiryDays: 365,
      },
    });
  }

  const normalizedSettings = {
    autoGrantEnabled: existing.autoGrantEnabled,
    grantRateNumerator: normalizePositiveInteger(existing.grantRateNumerator, 1),
    grantRateDenominator: normalizePositiveInteger(existing.grantRateDenominator, 100),
    defaultGrantCurrencyCode: isValidCurrencyCode(existing.defaultGrantCurrencyCode)
      ? normalizeCurrencyCode(existing.defaultGrantCurrencyCode)
      : normalizedFallback,
    defaultExpiryDays: normalizePositiveInteger(existing.defaultExpiryDays, 365),
    manualDefaultExpiryDays: normalizePositiveInteger(existing.manualDefaultExpiryDays, 365),
  };

  if (
    existing.autoGrantEnabled !== normalizedSettings.autoGrantEnabled ||
    existing.grantRateNumerator !== normalizedSettings.grantRateNumerator ||
    existing.grantRateDenominator !== normalizedSettings.grantRateDenominator ||
    existing.defaultGrantCurrencyCode !== normalizedSettings.defaultGrantCurrencyCode ||
    existing.defaultExpiryDays !== normalizedSettings.defaultExpiryDays ||
    existing.manualDefaultExpiryDays !== normalizedSettings.manualDefaultExpiryDays
  ) {
    return prisma.shopSettings.update({
      where: { shop },
      data: normalizedSettings,
    });
  }

  return existing;
}

export async function getConfiguredGrantCurrencyCode({
  admin,
  shop,
}: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const shopCurrency = await getShopCurrency(admin);
  const settings = await getShopSettings({
    shop,
    fallbackGrantCurrencyCode: shopCurrency,
  });

  return {
    shopCurrency,
    grantCurrencyCode: normalizeCurrencyCode(
      settings.defaultGrantCurrencyCode ?? shopCurrency,
    ),
    settings,
  };
}

export async function updateDefaultGrantCurrencyCode({
  shop,
  currencyCode,
}: {
  shop: string;
  currencyCode: string;
}) {
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode);

  if (!isValidCurrencyCode(normalizedCurrencyCode)) {
    throw new Error("通貨コードは 3 文字の ISO コードで入力してください。");
  }

  return prisma.shopSettings.upsert({
    where: { shop },
    update: {
      defaultGrantCurrencyCode: normalizedCurrencyCode,
    },
    create: {
      shop,
      defaultGrantCurrencyCode: normalizedCurrencyCode,
    },
  });
}

export async function updateShopSettings({
  shop,
  settings,
}: {
  shop: string;
  settings: {
    autoGrantEnabled: boolean;
    grantRateNumerator: number;
    grantRateDenominator: number;
    defaultGrantCurrencyCode: string;
    defaultExpiryDays: number;
    manualDefaultExpiryDays: number;
  };
}) {
  const normalizedCurrencyCode = normalizeCurrencyCode(settings.defaultGrantCurrencyCode);

  if (!isValidCurrencyCode(normalizedCurrencyCode)) {
    throw new Error("通貨コードは 3 文字の ISO コードで入力してください。");
  }

  const normalizedSettings = {
    autoGrantEnabled: settings.autoGrantEnabled,
    grantRateNumerator: normalizePositiveInteger(settings.grantRateNumerator, 1),
    grantRateDenominator: normalizePositiveInteger(settings.grantRateDenominator, 100),
    defaultGrantCurrencyCode: normalizedCurrencyCode,
    defaultExpiryDays: normalizePositiveInteger(settings.defaultExpiryDays, 365),
    manualDefaultExpiryDays: normalizePositiveInteger(
      settings.manualDefaultExpiryDays,
      365,
    ),
  };

  return prisma.shopSettings.upsert({
    where: { shop },
    update: normalizedSettings,
    create: {
      shop,
      ...normalizedSettings,
    },
  });
}

export async function reserveGrantExecutionLock({
  shop,
  key,
  sourceType,
  sourceId,
  payload,
}: {
  shop: string;
  key: string;
  sourceType: string;
  sourceId?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  const payloadJson = payload ? JSON.stringify(payload) : null;

  try {
    const created = await prisma.grantExecutionLock.create({
      data: {
        shop,
        key,
        sourceType,
        sourceId: sourceId ?? null,
        payloadJson,
      },
    });

    return {
      created: true,
      lock: serializeGrantExecutionLock(created),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.grantExecutionLock.findUnique({
        where: {
          shop_key: {
            shop,
            key,
          },
        },
      });

      if (existing?.status === "failed") {
        return {
          created: false,
          lock: serializeGrantExecutionLock(existing),
        };
      }

      return {
        created: false,
        lock: existing ? serializeGrantExecutionLock(existing) : null,
      };
    }

    throw error;
  }
}

async function finalizeGrantExecutionLock({
  shop,
  key,
  status,
  payload,
  processedAt,
}: {
  shop: string;
  key: string;
  status: string;
  payload?: Record<string, unknown> | null;
  processedAt?: Date | null;
}) {
  const updated = await prisma.grantExecutionLock.update({
    where: {
      shop_key: {
        shop,
        key,
      },
    },
    data: {
      status,
      ...(payload !== undefined
        ? {
            payloadJson: payload ? JSON.stringify(payload) : null,
          }
        : {}),
      ...(processedAt !== undefined ? { processedAt } : {}),
    },
  });

  return serializeGrantExecutionLock(updated);
}

export async function markGrantExecutionLockProcessed({
  shop,
  key,
  status = "processed",
}: {
  shop: string;
  key: string;
  status?: string;
}) {
  return finalizeGrantExecutionLock({
    shop,
    key,
    status,
    processedAt: new Date(),
  });
}

export async function simulateOrderPaidGrantExecution({
  admin,
  shop,
  orderId,
  customerId,
  orderTotalAmount,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  orderId: string;
  customerId: string;
  orderTotalAmount: string;
}) {
  const { normalizedOrderId, preview, settings, grantAmount } =
    await buildOrderPaidGrantPreview({
      admin,
      shop,
      orderId,
      customerId,
      orderTotalAmount,
    });

  if (!settings.autoGrantEnabled) {
    return {
      status: "disabled" as const,
      preview,
      lock: null,
    };
  }

  if (preview.grantCurrencyCode !== preview.shopCurrency) {
    return {
      status: "currency_mismatch" as const,
      preview,
      lock: null,
    };
  }

  if (grantAmount <= 0) {
    return {
      status: "zero_amount" as const,
      preview,
      lock: null,
    };
  }

  const reserved = await reserveGrantExecutionLock({
    shop,
    key: preview.key,
    sourceType: "order_paid_simulation",
    sourceId: normalizedOrderId,
    payload: preview,
  });

  if (!reserved.created) {
    return {
      status: "duplicate" as const,
      preview,
      lock: reserved.lock,
    };
  }

  const lock = await markGrantExecutionLockProcessed({
    shop,
    key: preview.key,
    status: "simulated",
  });

  return {
    status: "simulated" as const,
    preview,
    lock,
  };
}

export async function processOrderPaidGrant({
  admin,
  billing,
  shop,
  orderId,
  customerId,
  orderTotalAmount,
}: {
  admin: AdminGraphqlClient;
  billing?: BillingContextLike;
  shop: string;
  orderId: string;
  customerId: string;
  orderTotalAmount: string;
}) {
  const { normalizedOrderId, normalizedCustomerId, preview, settings, grantAmount } =
    await buildOrderPaidGrantPreview({
      admin,
      shop,
      orderId,
      customerId,
      orderTotalAmount,
    });

  if (!settings.autoGrantEnabled) {
    return {
      status: "disabled" as const,
      preview,
      lock: null,
      transaction: null,
      usageCharge: null,
    };
  }

  if (preview.grantCurrencyCode !== preview.shopCurrency) {
    return {
      status: "currency_mismatch" as const,
      preview,
      lock: null,
      transaction: null,
      usageCharge: null,
    };
  }

  if (grantAmount <= 0) {
    return {
      status: "zero_amount" as const,
      preview,
      lock: null,
      transaction: null,
      usageCharge: null,
    };
  }

  const reserved = await reserveGrantExecutionLock({
    shop,
    key: preview.key,
    sourceType: "order_paid",
    sourceId: normalizedOrderId,
    payload: preview,
  });

  if (!reserved.created) {
    return {
      status: "duplicate" as const,
      preview,
      lock: reserved.lock,
      transaction: null,
      usageCharge: null,
    };
  }

  let transaction:
    | {
        id: string;
        amount: Money;
        createdAt: string;
        expiresAt: string | null;
        account: {
          id: string;
          balance: Money;
        };
      }
    | null = null;

  try {
    transaction = await creditStoreCreditAccount({
      admin,
      customerId: normalizedCustomerId,
      amount: String(grantAmount),
      currencyCode: preview.grantCurrencyCode,
      expiresInDays: settings.defaultExpiryDays,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Order paid 自動付与中に予期しないエラーが発生しました。";
    const status = classifyOrderPaidGrantError(message);

    const lock = await finalizeGrantExecutionLock({
      shop,
      key: preview.key,
      status,
      payload: {
        ...preview,
        errorMessage: message,
        retryDisposition:
          status === "unknown"
            ? "do_not_auto_retry_without_manual_reconciliation"
            : "fix_and_replay_with_new_rule_version",
      },
      processedAt: null,
    });

    return {
      status,
      preview,
      lock,
      transaction: null,
      usageCharge: null,
      errorMessage: message,
    };
  }

  const lock = await finalizeGrantExecutionLock({
    shop,
    key: preview.key,
    status: "processed",
    payload: {
      ...preview,
      storeCreditTransactionId: transaction.id,
      balanceAfterAmount: transaction.account.balance.amount,
    },
    processedAt: new Date(),
  });

  let usageCharge:
    | Awaited<ReturnType<typeof recordProcessedOrderUsageCharge>>
    | {
        status: "error";
        errorMessage: string;
      }
    | null = null;

  try {
    usageCharge = billing
      ? await recordProcessedOrderUsageCharge({
          billing,
          shop,
          orderId: normalizedOrderId,
        })
      : await recordProcessedOrderUsageCharge({
          admin,
          shop,
          orderId: normalizedOrderId,
        });
  } catch (error) {
    usageCharge = {
      status: "error",
      errorMessage:
        error instanceof Error
          ? error.message
          : "usage record の作成中に予期しないエラーが発生しました。",
    };
  }

  return {
    status: "processed" as const,
    preview,
    lock,
    transaction,
    usageCharge,
  };
}

export async function getShopDashboardSummary({
  admin,
  shop,
}: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const { shopCurrency, grantCurrencyCode, settings } = await getConfiguredGrantCurrencyCode({
    admin,
    shop,
  });
  const [manualGrantLogs, recentGrantLocks] = await Promise.all([
    prisma.manualGrantLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
    prisma.grantExecutionLock.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const totalCustomerIds = new Set<string>();
  const currentMonthCustomerIds = new Set<string>();
  const totalsByCurrency = new Map<
    string,
    {
      currencyCode: string;
      totalAmount: number;
      currentMonthAmount: number;
      previousMonthAmount: number;
      totalCount: number;
    }
  >();

  for (const log of manualGrantLogs) {
    totalCustomerIds.add(log.customerId);

    const amount = parseMoneyAmount(log.amount);
    const currencyCode = normalizeCurrencyCode(log.currencyCode) || grantCurrencyCode;
    const existing =
      totalsByCurrency.get(currencyCode) ??
      {
        currencyCode,
        totalAmount: 0,
        currentMonthAmount: 0,
        previousMonthAmount: 0,
        totalCount: 0,
      };

    existing.totalAmount += amount;
    existing.totalCount += 1;

    if (log.createdAt >= currentMonthStart) {
      currentMonthCustomerIds.add(log.customerId);
      existing.currentMonthAmount += amount;
    } else if (log.createdAt >= previousMonthStart) {
      existing.previousMonthAmount += amount;
    }

    totalsByCurrency.set(currencyCode, existing);
  }

  const currentMonthLogs = manualGrantLogs.filter((log) => log.createdAt >= currentMonthStart);

  return {
    shopCurrency,
    grantCurrencyCode,
    settings: serializeShopSettings(settings),
    metrics: {
      totalManualGrantCount: manualGrantLogs.length,
      totalManualGrantCustomerCount: totalCustomerIds.size,
      currentMonthManualGrantCount: currentMonthLogs.length,
      currentMonthManualGrantCustomerCount: currentMonthCustomerIds.size,
      recentIdempotencyLockCount: recentGrantLocks.length,
    },
    currencyBreakdown: Array.from(totalsByCurrency.values()).sort((left, right) =>
      left.currencyCode.localeCompare(right.currencyCode),
    ),
    recentManualGrants: manualGrantLogs
      .slice(0, 5)
      .map(serializeManualGrantLog),
    recentGrantLocks: recentGrantLocks.map(serializeGrantExecutionLock),
  };
}

export async function getCustomerStoreCreditSummary({
  admin,
  shop,
  customerId,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  customerId: string;
}) {
  const { shopCurrency, grantCurrencyCode, settings } = await getConfiguredGrantCurrencyCode({
    admin,
    shop,
  });

  const [response, recentManualGrants] = await Promise.all([
    admin.graphql(
      `#graphql
        query BridgePointsCustomerStoreCreditSummary($id: ID!) {
          customer(id: $id) {
            id
            displayName
            defaultEmailAddress {
              emailAddress
            }
            storeCreditAccounts(first: 20) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                  recentTransactions: transactions(first: 10, sortKey: CREATED_AT, reverse: true) {
                    edges {
                      node {
                        __typename
                        amount {
                          amount
                          currencyCode
                        }
                        balanceAfterTransaction {
                          amount
                          currencyCode
                        }
                        createdAt
                        ... on StoreCreditAccountCreditTransaction {
                          id
                          expiresAt
                          remainingAmount {
                            amount
                            currencyCode
                          }
                        }
                        ... on StoreCreditAccountDebitTransaction {
                          id
                        }
                        ... on StoreCreditAccountDebitRevertTransaction {
                          id
                          debitTransaction {
                            id
                          }
                        }
                        ... on StoreCreditAccountExpirationTransaction {
                          creditTransaction {
                            id
                          }
                        }
                      }
                    }
                  }
                  expiringTransactions: transactions(first: 20, query: "type:credit AND expires_at:*") {
                    edges {
                      node {
                        __typename
                        ... on StoreCreditAccountCreditTransaction {
                          id
                          expiresAt
                          remainingAmount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          id: customerId,
        },
      },
    ),
    prisma.manualGrantLog.findMany({
      where: {
        shop,
        customerId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
  ]);

  const json = await response.json();
  const graphqlErrors = (json.errors ?? []) as Array<{ message?: string }>;
  const topLevelGraphqlError = graphqlErrors[0]?.message;

  if (topLevelGraphqlError && isProtectedCustomerDataError(topLevelGraphqlError)) {
    return {
      shopCurrency,
      grantCurrencyCode,
      settings: serializeShopSettings(settings),
      customer: {
        id: customerId,
        displayName: null,
        email: null,
      },
      account: null,
      nextExpiration: null,
      recentTransactions: [],
      recentManualGrants: recentManualGrants.map(serializeManualGrantLog),
    };
  }

  const customer = (json.data?.customer as CustomerSummaryRecord | null) ?? null;

  if (!customer) {
    throw new Error("顧客情報を取得できませんでした。");
  }

  const account =
    customer.storeCreditAccounts.edges.find(
      ({ node }) => node.balance.currencyCode === grantCurrencyCode,
    )?.node ?? null;
  const expiringCredits = (account?.expiringTransactions.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is CreditTransactionNode => Boolean(node?.id));

  const nextExpiration =
    expiringCredits
      .filter(
        (transaction) =>
          Boolean(transaction.expiresAt) &&
          parseMoneyAmount(transaction.remainingAmount?.amount) > 0,
      )
      .sort((left, right) => {
        return (
          new Date(left.expiresAt ?? "").getTime() -
          new Date(right.expiresAt ?? "").getTime()
        );
      })[0] ?? null;

  const expiringBalance = expiringCredits.reduce((total, transaction) => {
    return total + parseMoneyAmount(transaction.remainingAmount?.amount);
  }, 0);

  return {
    shopCurrency,
    grantCurrencyCode,
    settings: serializeShopSettings(settings),
    customer: {
      id: customer.id,
      displayName: customer.displayName,
      email: customer.defaultEmailAddress?.emailAddress ?? null,
    },
    account: account
      ? {
          id: account.id,
          balance: account.balance,
          expiringBalance: {
            amount: expiringBalance.toFixed(2),
            currencyCode: account.balance.currencyCode,
          },
        }
      : null,
    nextExpiration: nextExpiration
      ? {
          expiresAt: nextExpiration.expiresAt,
          remainingAmount: nextExpiration.remainingAmount,
        }
      : null,
    recentTransactions: (account?.recentTransactions.edges ?? []).map(({ node }) => ({
      id:
        "id" in node && node.id
          ? node.id
          : `${node.__typename}-${node.createdAt}`,
      type: mapTransactionType(node.__typename),
      createdAt: node.createdAt,
      amount: node.amount,
      balanceAfterTransaction: node.balanceAfterTransaction,
      expiresAt:
        node.__typename === "StoreCreditAccountCreditTransaction" ? node.expiresAt : null,
      remainingAmount:
        node.__typename === "StoreCreditAccountCreditTransaction"
          ? node.remainingAmount
          : null,
    })),
    recentManualGrants: recentManualGrants.map(serializeManualGrantLog),
  };
}

export async function issueManualStoreCredit({
  admin,
  shop,
  customerEmail,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantRequest) {
  const customer = await findCustomerByEmail(admin, customerEmail);

  if (!customer) {
    throw new Error("該当する顧客が見つかりません。メールアドレスを確認してください。");
  }

  const transaction = await creditStoreCreditAccount({
    admin,
    customerId: customer.id,
    amount,
    currencyCode,
    expiresInDays,
  });

  await createManualGrantLog({
    shop,
    customer,
    transaction,
    customerEmailFallback: customerEmail,
    notifyCustomer,
    reason,
  });

  return {
    customer,
    transaction,
  };
}

export async function issueManualStoreCreditByCustomerId({
  admin,
  shop,
  customerId,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantByCustomerIdRequest) {
  const transaction = await creditStoreCreditAccount({
    admin,
    customerId,
    amount,
    currencyCode,
    expiresInDays,
  });

  await createManualGrantLog({
    shop,
    customer: {
      id: customerId,
      displayName: null,
      defaultEmailAddress: null,
    },
    transaction,
    notifyCustomer,
    reason,
  });

  return {
    customer: {
      id: customerId,
      displayName: null,
      defaultEmailAddress: null,
    },
    transaction,
  };
}
