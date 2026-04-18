import type { ActionFunctionArgs } from "react-router";
import {
  buildManualGrantFormValues,
  validateManualGrantForm,
} from "../lib/store-credit";
import {
  getShopCurrency,
  issueManualStoreCreditByCustomerId,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);

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
    notifyCustomer: payload.notifyCustomer !== false,
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

  const currencyCode = await getShopCurrency(admin);

  try {
    const { customer, transaction } = await issueManualStoreCreditByCustomerId({
      admin,
      shop: session.shop,
      customerId,
      amount: values.amount,
      currencyCode,
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
          email: customer.defaultEmailAddress?.emailAddress ?? null,
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
