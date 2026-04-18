import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  // TODO: 実データ保存を始めたら、顧客単位の削除処理をここへ実装する。
  return new Response();
};
