import type { ActionFunctionArgs } from "react-router";
import { redactCustomerPrivacyData } from "../lib/privacy.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const result = await redactCustomerPrivacyData({
    shop,
    payload: payload ?? {},
  });

  console.log(`Received ${topic} compliance webhook for ${shop}`, result);

  return Response.json({
    ok: true,
    shop,
    result,
  });
};
