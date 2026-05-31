import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  buildManualGrantFormValues,
  validateManualGrantForm,
} from "../lib/store-credit";
import { getBridgePointsBillingGate } from "../lib/billing.server";
import {
  getConfiguredGrantCurrencyCode,
  issueManualStoreCreditByCustomerId,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticate.admin(request);
  return cors(
    Response.json(
      {
        error: "POST で実行してください。",
      },
      { status: 405 },
    ),
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session, cors } = await authenticate.admin(request);
  const gate = await getBridgePointsBillingGate({
    billing,
    shop: session.shop,
  });

  if (!gate.hasActivePayment) {
    return cors(
      Response.json(
        {
          error: "BridgePoint で Store Credit を付与するには、先にプランを承認してください。",
        },
        { status: 402 },
      ),
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return cors(
      Response.json(
        {
          error: "リクエスト形式が不正です。",
        },
        { status: 400 },
      ),
    );
  }

  const customerId = String(payload.customerId || "").trim();
  const values = buildManualGrantFormValues({
    customerEmail: String(payload.customerEmail || "").trim(),
    amount: String(payload.amount || "").trim(),
    expiresInDays: String(payload.expiresInDays || "").trim(),
    notifyCustomer: payload.notifyCustomer === true,
    reason: String(payload.reason || "").trim(),
  });
  const errors = validateManualGrantForm(values);
  delete errors.customerEmail;

  if (!customerId) {
    errors.form = "顧客 ID を解決できませんでした。顧客詳細画面から再度開いてください。";
  }

  if (Object.keys(errors).length > 0) {
    return cors(
      Response.json(
        {
          errors,
        },
        { status: 400 },
      ),
    );
  }

  const { grantCurrencyCode } = await getConfiguredGrantCurrencyCode({
    admin,
    shop: session.shop,
  });

  try {
    const { customer, transaction } = await issueManualStoreCreditByCustomerId({
      admin,
      shop: session.shop,
      customerId,
      amount: values.amount,
      currencyCode: grantCurrencyCode,
      expiresInDays: Number(values.expiresInDays),
      notifyCustomer: values.notifyCustomer,
      reason: values.reason,
    });

    return cors(
      Response.json({
        ok: true,
        customer: {
          id: customer.id,
          displayName: customer.displayName,
          email: null,
        },
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          balance: transaction.account.balance,
          expiresAt: transaction.expiresAt,
          createdAt: transaction.createdAt,
        },
      }),
    );
  } catch (error) {
    return cors(
      Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Store Credit の付与中に予期しないエラーが発生しました。",
        },
        { status: 400 },
      ),
    );
  }
};
