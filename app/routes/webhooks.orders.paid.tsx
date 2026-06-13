import type { ActionFunctionArgs } from "react-router";
import { getBridgePointsBillingGate } from "../lib/billing.server";
import {
  ORDER_PAID_TRIGGER_TOPIC,
  processOrderPaidGrant,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

type OrderPaidWebhookPayload = {
  id?: number | string | null;
  admin_graphql_api_id?: string | null;
  current_total_price?: string | null;
  current_total_price_set?: {
    shop_money?: {
      amount?: string | null;
      currency_code?: string | null;
    } | null;
  } | null;
  customer?: {
    id?: number | string | null;
    admin_graphql_api_id?: string | null;
  } | null;
};

function buildOrderGid(payload: OrderPaidWebhookPayload) {
  if (payload.admin_graphql_api_id?.trim()) {
    return payload.admin_graphql_api_id.trim();
  }

  if (payload.id) {
    return `gid://shopify/Order/${payload.id}`;
  }

  return "";
}

function buildCustomerGid(payload: OrderPaidWebhookPayload) {
  if (payload.customer?.admin_graphql_api_id?.trim()) {
    return payload.customer.admin_graphql_api_id.trim();
  }

  if (payload.customer?.id) {
    return `gid://shopify/Customer/${payload.customer.id}`;
  }

  return "";
}

function extractOrderTotalAmount(payload: OrderPaidWebhookPayload) {
  return (
    payload.current_total_price_set?.shop_money?.amount?.trim() ??
    payload.current_total_price?.trim() ??
    ""
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload, webhookId } =
    await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, { webhookId });

  if (String(topic ?? "").toLowerCase() !== ORDER_PAID_TRIGGER_TOPIC) {
    console.log("Skipping webhook because it did not match the single auto-grant trigger.", {
      shop,
      webhookId,
      topic,
      expectedTopic: ORDER_PAID_TRIGGER_TOPIC,
    });
    return new Response();
  }

  if (!session || !admin) {
    console.log("Skipping orders/paid webhook because offline session is unavailable.", {
      shop,
      webhookId,
    });
    return new Response();
  }

  const gate = await getBridgePointsBillingGate({
    admin,
    shop,
  });

  if (!gate.hasActivePayment) {
    console.log("Skipping orders/paid webhook because billing is not active.", {
      shop,
      webhookId,
      billingError: gate.error,
    });
    return new Response();
  }

  const orderPayload = payload as OrderPaidWebhookPayload;
  const orderId = buildOrderGid(orderPayload);
  const customerId = buildCustomerGid(orderPayload);
  const orderTotalAmount = extractOrderTotalAmount(orderPayload);

  if (!orderId || !customerId || !orderTotalAmount) {
    console.log("Skipping orders/paid webhook because required payload fields were missing.", {
      shop,
      webhookId,
      orderId,
      customerId,
      orderTotalAmount,
    });
    return new Response();
  }

  const result = await processOrderPaidGrant({
    admin,
    shop,
    orderId,
    customerId,
    orderTotalAmount,
  });

  console.log("Processed orders/paid webhook.", {
    shop,
    webhookId,
    orderId,
    status: result.status,
    usageChargeStatus: result.usageCharge?.status ?? null,
  });

  return new Response();
};
