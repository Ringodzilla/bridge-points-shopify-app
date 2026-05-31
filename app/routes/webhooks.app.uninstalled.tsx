import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteShopPrivacyData } from "../lib/privacy.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  const result = await deleteShopPrivacyData({ shop });
  console.log(`Received ${topic} webhook for ${shop}`, result);

  return new Response();
};
