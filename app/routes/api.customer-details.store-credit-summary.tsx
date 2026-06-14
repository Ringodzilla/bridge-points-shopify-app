import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCustomerStoreCreditSummary } from "../lib/store-credit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const cursor = url.searchParams.get("cursor");

  if (!customerId) {
    return cors(
      Response.json(
        {
          error: "customerId が指定されていません。",
        },
        { status: 400 },
      ),
    );
  }

  try {
    const summary = await getCustomerStoreCreditSummary({
      admin,
      shop: session.shop,
      customerId,
      transactionCursor: cursor,
    });

    return cors(Response.json(summary));
  } catch (error) {
    return cors(
      Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "顧客の Store Credit 情報を取得できませんでした。",
        },
        { status: 500 },
      ),
    );
  }
};
