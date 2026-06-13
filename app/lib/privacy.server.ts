import prisma from "../db.server";

type PrivacyCustomer = {
  id?: number | string | null;
  email?: string | null;
  phone?: string | null;
};

type PrivacyWebhookPayload = {
  customer?: PrivacyCustomer | null;
  orders_requested?: Array<number | string> | null;
  orders_to_redact?: Array<number | string> | null;
};

type SerializedManualGrantLog = {
  id: string;
  customerId: string;
  customerEmail: string;
  customerDisplayName: string | null;
  staffUserId: string;
  staffEmail: string;
  amount: string;
  currencyCode: string;
  expiresAt: string | null;
  reason: string | null;
  storeCreditTxnId: string | null;
  createdAt: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function buildGid(resource: "Customer" | "Order", value: string) {
  if (!value || value.startsWith("gid://")) {
    return value;
  }

  return `gid://shopify/${resource}/${value}`;
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function getCustomerIdentifiers(payload: PrivacyWebhookPayload) {
  const customer = payload.customer ?? {};
  const rawId = normalizeText(customer.id);
  const customerIds = uniqueNonEmpty([
    rawId,
    rawId ? buildGid("Customer", rawId) : "",
  ]);
  const emails = uniqueNonEmpty([normalizeText(customer.email).toLowerCase()]);

  return {
    customerIds,
    emails,
  };
}

function getOrderIdentifiers(values: Array<number | string> | null | undefined) {
  return uniqueNonEmpty(
    (values ?? []).flatMap((value) => {
      const rawId = normalizeText(value);
      return [rawId, rawId ? buildGid("Order", rawId) : ""];
    }),
  );
}

function buildManualGrantLogCustomerWhere({
  shop,
  payload,
}: {
  shop: string;
  payload: PrivacyWebhookPayload;
}) {
  const { customerIds, emails } = getCustomerIdentifiers(payload);
  const OR = [
    ...customerIds.map((customerId) => ({ customerId })),
    ...emails.map((customerEmail) => ({ customerEmail })),
  ];

  return OR.length > 0 ? { shop, OR } : null;
}

function buildGrantLockWhere({
  shop,
  payload,
  orderPayloadKey,
}: {
  shop: string;
  payload: PrivacyWebhookPayload;
  orderPayloadKey: "orders_requested" | "orders_to_redact";
}) {
  const { customerIds, emails } = getCustomerIdentifiers(payload);
  const orderIds = getOrderIdentifiers(payload[orderPayloadKey]);
  const payloadMatches = [...customerIds, ...emails].map((value) => ({
    payloadJson: { contains: value },
  }));
  const orderMatches = orderIds.flatMap((orderId) => [
    { key: { contains: orderId } },
    { sourceId: { contains: orderId } },
    { payloadJson: { contains: orderId } },
  ]);
  const OR = [...payloadMatches, ...orderMatches];

  return OR.length > 0 ? { shop, OR } : null;
}

function serializeManualGrantLog(log: {
  id: string;
  customerId: string;
  customerEmail: string;
  customerDisplayName: string | null;
  staffUserId: string;
  staffEmail: string;
  amount: string;
  currencyCode: string;
  expiresAt: Date | null;
  reason: string | null;
  storeCreditTxnId: string | null;
  createdAt: Date;
}): SerializedManualGrantLog {
  return {
    id: log.id,
    customerId: log.customerId,
    customerEmail: log.customerEmail,
    customerDisplayName: log.customerDisplayName,
    staffUserId: log.staffUserId,
    staffEmail: log.staffEmail,
    amount: log.amount,
    currencyCode: log.currencyCode,
    expiresAt: log.expiresAt?.toISOString() ?? null,
    reason: log.reason,
    storeCreditTxnId: log.storeCreditTxnId,
    createdAt: log.createdAt.toISOString(),
  };
}

export async function collectCustomerPrivacyData({
  shop,
  payload,
}: {
  shop: string;
  payload: PrivacyWebhookPayload;
}) {
  const manualGrantWhere = buildManualGrantLogCustomerWhere({
    shop,
    payload,
  });
  const grantLockWhere = buildGrantLockWhere({
    shop,
    payload,
    orderPayloadKey: "orders_requested",
  });
  const [manualGrantLogs, grantExecutionLocks] = await Promise.all([
    manualGrantWhere
      ? prisma.manualGrantLog.findMany({
          where: manualGrantWhere,
          orderBy: { createdAt: "desc" },
        })
      : [],
    grantLockWhere
      ? prisma.grantExecutionLock.findMany({
          where: grantLockWhere,
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  return {
    manualGrantLogs: manualGrantLogs.map(serializeManualGrantLog),
    grantExecutionLocks: grantExecutionLocks.map((lock) => ({
      id: lock.id,
      key: lock.key,
      sourceType: lock.sourceType,
      sourceId: lock.sourceId,
      status: lock.status,
      payloadJson: lock.payloadJson,
      processedAt: lock.processedAt?.toISOString() ?? null,
      createdAt: lock.createdAt.toISOString(),
    })),
  };
}

export async function redactCustomerPrivacyData({
  shop,
  payload,
}: {
  shop: string;
  payload: PrivacyWebhookPayload;
}) {
  const manualGrantWhere = buildManualGrantLogCustomerWhere({
    shop,
    payload,
  });
  const grantLockWhere = buildGrantLockWhere({
    shop,
    payload,
    orderPayloadKey: "orders_to_redact",
  });
  const manualGrantDeleteResult = manualGrantWhere
    ? await prisma.manualGrantLog.deleteMany({
        where: manualGrantWhere,
      })
    : { count: 0 };
  const grantLockUpdateResult = grantLockWhere
    ? await prisma.grantExecutionLock.updateMany({
        where: grantLockWhere,
        data: {
          sourceId: null,
          payloadJson: JSON.stringify({
            redacted: true,
            reason: "customer_privacy_redact",
            redactedAt: new Date().toISOString(),
          }),
        },
      })
    : { count: 0 };

  return {
    manualGrantLogsDeleted: manualGrantDeleteResult.count,
    grantExecutionLocksRedacted: grantLockUpdateResult.count,
  };
}

export async function deleteShopPrivacyData({ shop }: { shop: string }) {
  const [
    manualGrantLogsDeleted,
    grantExecutionLocksDeleted,
    shopSettingsDeleted,
    sessionsDeleted,
  ] = await prisma.$transaction([
    prisma.manualGrantLog.deleteMany({ where: { shop } }),
    prisma.grantExecutionLock.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return {
    manualGrantLogsDeleted: manualGrantLogsDeleted.count,
    grantExecutionLocksDeleted: grantExecutionLocksDeleted.count,
    shopSettingsDeleted: shopSettingsDeleted.count,
    sessionsDeleted: sessionsDeleted.count,
  };
}
