import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <main className="rnk-page" style={{ maxWidth: 760, margin: "0 auto", padding: 32 }}>
      <section className="rnk-hero">
        <span className="rnk-eyebrow">BridgePoint</span>
        <h1 className="rnk-title">Shopify 管理画面から起動してください</h1>
        <p className="rnk-subtitle">
          BridgePoint は Shopify Admin に埋め込まれるアプリです。インストールと起動は
          Shopify App Store または Shopify 管理画面の Apps から行います。
        </p>
      </section>
    </main>
  );
}
