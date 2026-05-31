import type { ActionFunctionArgs } from "react-router";
import { collectCustomerPrivacyData } from "../lib/privacy.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const data = await collectCustomerPrivacyData({
    shop,
    payload: payload ?? {},
  });

  console.log(`Received ${topic} compliance webhook for ${shop}`, {
    manualGrantLogCount: data.manualGrantLogs.length,
    grantExecutionLockCount: data.grantExecutionLocks.length,
  });

  return Response.json({
    ok: true,
    shop,
    data,
  });
};
