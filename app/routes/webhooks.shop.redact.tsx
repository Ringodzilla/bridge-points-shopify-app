import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  // TODO: Shop 単位で保存しているデータを削除する処理をここへ実装する。
  return new Response();
};
