import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  recordProcessedOrderUsageCharge,
  type BillingContextLike,
} from "./billing.server";
import {
  MANUAL_GRANT_DAILY_CUSTOMER_LIMIT,
  MANUAL_GRANT_MAX_AMOUNT,
} from "./store-credit";

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

type ShopContext = {
  shopCurrency: string;
  shopTimezone: string;
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

type ManualGrantActor = {
  staffUserId: string;
  staffEmail: string;
};

export const ORDER_PAID_TRIGGER_TOPIC = "orders/paid";
const ORDER_PAID_GRANT_RULE_VERSION = "2026-06-v1";
const ORDER_PAID_LOCK_RETENTION_DAYS = 400;
const ORDER_PAID_LOCK_PREFIX = "order_paid";
const ORDER_PAID_RETRY_WINDOW_DAYS = 30;
const ORDER_PAID_AUTO_RETRY_INTERVAL_HOURS = 24;

type GrantFailureCategory = "TEMPORARY" | "PERMANENT" | "UNKNOWN";

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

function classifyOrderPaidGrantError(message: string): {
  status: "failed" | "unknown";
  failureCategory: GrantFailureCategory;
} {
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
    return {
      status: "failed",
      failureCategory: "TEMPORARY",
    };
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("throttle") ||
    normalized.includes("too many requests")
  ) {
    return {
      status: "failed",
      failureCategory: "TEMPORARY",
    };
  }

  if (
    normalized.includes("not approved to access the customer object") ||
    normalized.includes("protected customer data") ||
    normalized.includes("access_denied") ||
    normalized.includes("customer") && normalized.includes("not found") ||
    normalized.includes("権限") ||
    normalized.includes("見つかりません") ||
    normalized.includes("通貨") ||
    normalized.includes("currency")
  ) {
    return {
      status: "failed",
      failureCategory: "PERMANENT",
    };
  }

  return {
    status: "unknown",
    failureCategory: "UNKNOWN",
  };
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
  staffUserId: string;
  staffEmail: string;
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
    staffUserId: log.staffUserId,
    staffEmail: log.staffEmail,
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
  failureCategory: string | null;
  lastErrorMessage: string | null;
  retryEligibleUntil: Date | null;
  nextRetryAt: Date | null;
  retryCount: number;
  lastNotifiedAt: Date | null;
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
    failureCategory: lock.failureCategory,
    lastErrorMessage: lock.lastErrorMessage,
    retryEligibleUntil: lock.retryEligibleUntil?.toISOString() ?? null,
    nextRetryAt: lock.nextRetryAt?.toISOString() ?? null,
    retryCount: lock.retryCount,
    lastNotifiedAt: lock.lastNotifiedAt?.toISOString() ?? null,
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
  operationsAlertEmail: string | null;
}) {
  return {
    autoGrantEnabled: settings.autoGrantEnabled,
    grantRateNumerator: settings.grantRateNumerator,
    grantRateDenominator: settings.grantRateDenominator,
    defaultGrantCurrencyCode:
      normalizeCurrencyCode(settings.defaultGrantCurrencyCode) || "JPY",
    defaultExpiryDays: settings.defaultExpiryDays,
    manualDefaultExpiryDays: settings.manualDefaultExpiryDays,
    operationsAlertEmail: settings.operationsAlertEmail?.trim() ?? "",
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
  actor,
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
  actor: ManualGrantActor;
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
      staffUserId: actor.staffUserId,
      staffEmail: actor.staffEmail,
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

function normalizeManualGrantAmount(amount: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("付与額は 0 より大きい数値で入力してください。");
  }

  return parsed;
}

function getMonthKeyInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function shiftMonthKey(monthKey: string, deltaMonths: number) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const shifted = new Date(Date.UTC(year, monthIndex + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildOrderPaidRetryWindow(now = new Date()) {
  const retryEligibleUntil = new Date(now);
  retryEligibleUntil.setUTCDate(retryEligibleUntil.getUTCDate() + ORDER_PAID_RETRY_WINDOW_DAYS);

  const nextRetryAt = new Date(now);
  nextRetryAt.setUTCHours(nextRetryAt.getUTCHours() + ORDER_PAID_AUTO_RETRY_INTERVAL_HOURS);

  return {
    retryEligibleUntil,
    nextRetryAt,
  };
}

function parseGrantLockPayload(payloadJson: string | null) {
  if (!payloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.orderId === "string" &&
      typeof parsed.customerId === "string" &&
      typeof parsed.orderTotalAmount === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
}

function getManualGrantDayRange(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

async function assertManualGrantWithinLimits({
  shop,
  customerId,
  amount,
}: {
  shop: string;
  customerId: string;
  amount: string;
}) {
  const requestedAmount = normalizeManualGrantAmount(amount);

  if (requestedAmount > MANUAL_GRANT_MAX_AMOUNT) {
    throw new Error(
      `手動付与は 1 回あたり ${MANUAL_GRANT_MAX_AMOUNT.toLocaleString("ja-JP")}pt までです。`,
    );
  }

  const { start, end } = getManualGrantDayRange();
  const logs = await prisma.manualGrantLog.findMany({
    where: {
      shop,
      customerId,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    select: {
      amount: true,
    },
  });

  const alreadyGranted = logs.reduce((total, log) => {
    return total + normalizeManualGrantAmount(log.amount);
  }, 0);

  if (alreadyGranted + requestedAmount > MANUAL_GRANT_DAILY_CUSTOMER_LIMIT) {
    const remaining = Math.max(MANUAL_GRANT_DAILY_CUSTOMER_LIMIT - alreadyGranted, 0);
    throw new Error(
      `この顧客への手動付与は 1 日あたり ${MANUAL_GRANT_DAILY_CUSTOMER_LIMIT.toLocaleString("ja-JP")}pt までです。残り付与可能額は ${remaining.toLocaleString("ja-JP")}pt です。`,
    );
  }
}

export async function getShopCurrency(admin: AdminGraphqlClient) {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsShopCurrency {
        shop {
          currencyCode
          ianaTimezone
        }
      }
    `,
  );
  const json = await response.json();
  return json.data?.shop?.currencyCode ?? "JPY";
}

export async function getShopContext(admin: AdminGraphqlClient): Promise<ShopContext> {
  const response = await admin.graphql(
    `#graphql
      query BridgePointsShopContext {
        shop {
          currencyCode
          ianaTimezone
        }
      }
    `,
  );
  const json = await response.json();

  return {
    shopCurrency: json.data?.shop?.currencyCode ?? "JPY",
    shopTimezone: json.data?.shop?.ianaTimezone ?? "UTC",
  };
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
        operationsAlertEmail: null,
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
    operationsAlertEmail: existing.operationsAlertEmail?.trim() || null,
  };

  if (
    existing.autoGrantEnabled !== normalizedSettings.autoGrantEnabled ||
    existing.grantRateNumerator !== normalizedSettings.grantRateNumerator ||
    existing.grantRateDenominator !== normalizedSettings.grantRateDenominator ||
    existing.defaultGrantCurrencyCode !== normalizedSettings.defaultGrantCurrencyCode ||
    existing.defaultExpiryDays !== normalizedSettings.defaultExpiryDays ||
    existing.manualDefaultExpiryDays !== normalizedSettings.manualDefaultExpiryDays ||
    (existing.operationsAlertEmail?.trim() || null) !== normalizedSettings.operationsAlertEmail
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
  const { shopCurrency, shopTimezone } = await getShopContext(admin);
  const settings = await getShopSettings({
    shop,
    fallbackGrantCurrencyCode: shopCurrency,
  });

  return {
    shopCurrency,
    shopTimezone,
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
    operationsAlertEmail?: string;
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
    operationsAlertEmail: settings.operationsAlertEmail?.trim() || null,
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
  failureCategory,
  lastErrorMessage,
  retryEligibleUntil,
  nextRetryAt,
  retryCount,
  lastNotifiedAt,
}: {
  shop: string;
  key: string;
  status: string;
  payload?: Record<string, unknown> | null;
  processedAt?: Date | null;
  failureCategory?: GrantFailureCategory | null;
  lastErrorMessage?: string | null;
  retryEligibleUntil?: Date | null;
  nextRetryAt?: Date | null;
  retryCount?: number;
  lastNotifiedAt?: Date | null;
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
      ...(failureCategory !== undefined ? { failureCategory } : {}),
      ...(lastErrorMessage !== undefined ? { lastErrorMessage } : {}),
      ...(retryEligibleUntil !== undefined ? { retryEligibleUntil } : {}),
      ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
      ...(retryCount !== undefined ? { retryCount } : {}),
      ...(lastNotifiedAt !== undefined ? { lastNotifiedAt } : {}),
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
    failureCategory: null,
    lastErrorMessage: null,
    retryEligibleUntil: null,
    nextRetryAt: null,
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

async function finalizeFailedOrderPaidLock({
  shop,
  key,
  preview,
  message,
  retryCount,
  notifyImmediately,
}: {
  shop: string;
  key: string;
  preview: Record<string, unknown>;
  message: string;
  retryCount?: number;
  notifyImmediately?: boolean;
}) {
  const classification = classifyOrderPaidGrantError(message);
  const retryWindow = buildOrderPaidRetryWindow();
  const retryDisposition =
    classification.failureCategory === "TEMPORARY"
      ? "eligible_for_manual_and_daily_retry"
      : classification.failureCategory === "PERMANENT"
        ? "fix_configuration_or_data_before_retry"
        : "manual_reconciliation_required_before_retry";

  return finalizeGrantExecutionLock({
    shop,
    key,
    status: classification.status,
    failureCategory: classification.failureCategory,
    lastErrorMessage: message,
    retryEligibleUntil:
      classification.failureCategory === "UNKNOWN" || classification.failureCategory === "TEMPORARY"
        ? retryWindow.retryEligibleUntil
        : retryWindow.retryEligibleUntil,
    nextRetryAt:
      classification.failureCategory === "TEMPORARY" ? retryWindow.nextRetryAt : null,
    retryCount,
    lastNotifiedAt: notifyImmediately ? new Date() : undefined,
    payload: {
      ...preview,
      errorMessage: message,
      retryDisposition,
    },
    processedAt: null,
  });
}

async function executeOrderPaidGrantForReservedLock({
  admin,
  billing,
  shop,
  normalizedCustomerId,
  normalizedOrderId,
  preview,
  settings,
  grantAmount,
  retryCount,
}: {
  admin: AdminGraphqlClient;
  billing?: BillingContextLike;
  shop: string;
  normalizedCustomerId: string;
  normalizedOrderId: string;
  preview: Record<string, unknown> & {
    key: string;
    grantCurrencyCode: string;
  };
  settings: {
    defaultExpiryDays: number;
  };
  grantAmount: number;
  retryCount?: number;
}) {
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

    const lock = await finalizeFailedOrderPaidLock({
      shop,
      key: preview.key,
      preview,
      message,
      retryCount,
      notifyImmediately: true,
    });

    return {
      status: lock.status as "failed" | "unknown",
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
    failureCategory: null,
    lastErrorMessage: null,
    retryEligibleUntil: null,
    nextRetryAt: null,
    retryCount,
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

  return executeOrderPaidGrantForReservedLock({
    admin,
    billing,
    shop,
    normalizedCustomerId,
    normalizedOrderId,
    preview,
    settings,
    grantAmount,
    retryCount: 0,
  });
}

export async function retryFailedOrderPaidGrant({
  admin,
  billing,
  shop,
  key,
  allowUnknown = false,
}: {
  admin: AdminGraphqlClient;
  billing?: BillingContextLike;
  shop: string;
  key: string;
  allowUnknown?: boolean;
}) {
  const existing = await prisma.grantExecutionLock.findUnique({
    where: {
      shop_key: {
        shop,
        key,
      },
    },
  });

  if (!existing) {
    throw new Error("再実行対象の lock が見つかりませんでした。");
  }

  if (existing.sourceType !== "order_paid") {
    throw new Error("この lock は orders/paid 自動付与の再実行対象ではありません。");
  }

  if (!existing.retryEligibleUntil || existing.retryEligibleUntil < new Date()) {
    throw new Error("この失敗は再実行可能期間を過ぎています。");
  }

  if (existing.failureCategory === "PERMANENT") {
    throw new Error("恒久エラーはそのまま再実行できません。設定やデータを修正してください。");
  }

  if (existing.failureCategory === "UNKNOWN" && !allowUnknown) {
    throw new Error("結果不明の失敗です。確認後に再実行してください。");
  }

  const preview = parseGrantLockPayload(existing.payloadJson);
  if (!preview) {
    throw new Error("再実行に必要な payload を復元できませんでした。");
  }

  const { normalizedOrderId, normalizedCustomerId, settings, grantAmount } =
    await buildOrderPaidGrantPreview({
      admin,
      shop,
      orderId: String(preview.orderId),
      customerId: String(preview.customerId),
      orderTotalAmount: String(preview.orderTotalAmount),
    });

  await prisma.grantExecutionLock.update({
    where: {
      shop_key: {
        shop,
        key,
      },
    },
    data: {
      status: "retrying",
      nextRetryAt: null,
      retryCount: existing.retryCount + 1,
    },
  });

  return executeOrderPaidGrantForReservedLock({
    admin,
    billing,
    shop,
    normalizedCustomerId,
    normalizedOrderId,
    preview: {
      ...preview,
      key,
    } as Record<string, unknown> & {
      key: string;
      grantCurrencyCode: string;
    },
    settings,
    grantAmount,
    retryCount: existing.retryCount + 1,
  });
}

export async function processDueOrderPaidRetries({
  shop,
}: {
  shop?: string;
}) {
  const locks = await prisma.grantExecutionLock.findMany({
    where: {
      ...(shop ? { shop } : {}),
      sourceType: "order_paid",
      failureCategory: "TEMPORARY",
      retryEligibleUntil: {
        gte: new Date(),
      },
      nextRetryAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      nextRetryAt: "asc",
    },
  });

  const results: Array<{
    shop: string;
    key: string;
    status: string;
  }> = [];

  for (const lock of locks) {
    try {
      const { admin } = await unauthenticated.admin(lock.shop);
      const result = await retryFailedOrderPaidGrant({
        admin,
        shop: lock.shop,
        key: lock.key,
      });

      results.push({
        shop: lock.shop,
        key: lock.key,
        status: result.status,
      });
    } catch (error) {
      results.push({
        shop: lock.shop,
        key: lock.key,
        status: error instanceof Error ? error.message : "retry_failed",
      });
    }
  }

  return results;
}

export async function getShopDashboardSummary({
  admin,
  shop,
}: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const { shopCurrency, shopTimezone, grantCurrencyCode, settings } =
    await getConfiguredGrantCurrencyCode({
      admin,
      shop,
    });
  const [manualGrantLogs, recentGrantLocks, activeGrantFailureLocks] = await Promise.all([
    prisma.manualGrantLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    }),
    prisma.grantExecutionLock.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.grantExecutionLock.findMany({
      where: {
        shop,
        sourceType: "order_paid",
        status: {
          in: ["failed", "unknown", "retrying"],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const now = new Date();
  const currentMonthKey = getMonthKeyInTimezone(now, shopTimezone);
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1);

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
    const logMonthKey = getMonthKeyInTimezone(log.createdAt, shopTimezone);
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

    if (logMonthKey === currentMonthKey) {
      currentMonthCustomerIds.add(log.customerId);
      existing.currentMonthAmount += amount;
    } else if (logMonthKey === previousMonthKey) {
      existing.previousMonthAmount += amount;
    }

    totalsByCurrency.set(currencyCode, existing);
  }

  const currentMonthLogs = manualGrantLogs.filter(
    (log) => getMonthKeyInTimezone(log.createdAt, shopTimezone) === currentMonthKey,
  );
  return {
    shopCurrency,
    shopTimezone,
    grantCurrencyCode,
    settings: serializeShopSettings(settings),
    kpiDefinition: {
      timeZone: shopTimezone,
      monthlyBoundary: "month_start_to_month_end_in_shop_timezone",
      grantedAmountBasis: "manual_grant_log_created_at",
      currencyBasis: "store_credit_amount_raw",
      cancellationAdjustment: "manual_adjustment_only_in_v1",
    },
    metrics: {
      totalManualGrantCount: manualGrantLogs.length,
      totalManualGrantCustomerCount: totalCustomerIds.size,
      currentMonthManualGrantCount: currentMonthLogs.length,
      currentMonthManualGrantCustomerCount: currentMonthCustomerIds.size,
      recentIdempotencyLockCount: recentGrantLocks.length,
      activeGrantFailureCount: activeGrantFailureLocks.length,
    },
    currencyBreakdown: Array.from(totalsByCurrency.values()).sort((left, right) =>
      left.currencyCode.localeCompare(right.currencyCode),
    ),
    recentManualGrants: manualGrantLogs
      .slice(0, 5)
      .map(serializeManualGrantLog),
    recentGrantLocks: recentGrantLocks.map(serializeGrantExecutionLock),
    activeGrantFailures: activeGrantFailureLocks.map(serializeGrantExecutionLock),
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
  actor,
  customerEmail,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantRequest & { actor: ManualGrantActor }) {
  const customer = await findCustomerByEmail(admin, customerEmail);

  if (!customer) {
    throw new Error("該当する顧客が見つかりません。メールアドレスを確認してください。");
  }

  await assertManualGrantWithinLimits({
    shop,
    customerId: customer.id,
    amount,
  });

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
    actor,
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
  actor,
  customerId,
  amount,
  currencyCode,
  expiresInDays,
  notifyCustomer,
  reason,
}: ManualGrantByCustomerIdRequest & { actor: ManualGrantActor }) {
  await assertManualGrantWithinLimits({
    shop,
    customerId,
    amount,
  });

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
    actor,
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
