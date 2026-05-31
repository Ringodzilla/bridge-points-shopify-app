import type { ActionFunctionArgs } from "react-router";
import { deleteShopPrivacyData } from "../lib/privacy.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  const result = await deleteShopPrivacyData({ shop });

  console.log(`Received ${topic} compliance webhook for ${shop}`, result);

  return Response.json({
    ok: true,
    shop,
    result,
  });
};
