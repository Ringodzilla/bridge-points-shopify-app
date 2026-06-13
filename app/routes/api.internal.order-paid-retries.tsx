import type { ActionFunctionArgs } from "react-router";
import { processDueOrderPaidRetries } from "../lib/store-credit.server";

function isAuthorized(request: Request) {
  const expected = process.env.ORDER_PAID_RETRY_JOB_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";

  if (!expected) {
    return false;
  }

  return authorization === `Bearer ${expected}`;
}

export const loader = async () => {
  return Response.json(
    {
      error: "POST で実行してください。",
    },
    { status: 405 },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!isAuthorized(request)) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  const shop = new URL(request.url).searchParams.get("shop")?.trim() || undefined;
  const results = await processDueOrderPaidRetries({ shop });

  return Response.json({
    ok: true,
    processedCount: results.length,
    results,
  });
};
