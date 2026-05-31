import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    localReadyItems: [
      "BridgePoint への命名統一を進める土台",
      "手動付与 / customer details / settings / dashboard",
      "`orders/paid` webhook 起点の自動付与",
      "GrantExecutionLock による二重付与防止",
      "Free / Advanced / Premium / Unlimited の 4 プラン billing config",
      "注文数メーター前提の billing UI",
      "subscription と usage overage の実地確認",
      "Flow テンプレートとシミュレーション",
      "公開用 legal pages",
      "privacy / compliance webhook の保存データ export / redact / shop delete",
      "課金未承認ショップ向け gate",
      "Shopify API version の本番向け stable 2026-04 統一",
      "本番環境変数 / Partner Dashboard 反映前の release precheck",
      "Partner Dashboard / listing 用ドラフト文案",
      "開発 preview の固定導線",
      "本番用 .env.example",
    ],
    externalRequiredItems: [
      "Fly.io trial 停止制限の解除と本番ホスティング",
      "Protected customer data review",
      "Partner Dashboard の App URL / Redirect URL / listing / pricing / distribution",
      "Shopify app config の production URL 前提 deploy",
      "review 用テスト資格情報と screencast",
      "本番 URL での OAuth / embedded app / 手動付与 / orders/paid webhook 最終確認",
    ],
    legalPages: [
      { label: "Privacy Policy", href: "/privacy-policy.html" },
      { label: "Terms of Service", href: "/terms-of-service.html" },
      { label: "Data Protection Summary", href: "/data-protection.html" },
    ],
    launchDraftPages: [
      { label: "Partner Dashboard 入力ドラフト", href: "/partner-dashboard-copy.html" },
      { label: "App Store listing 文案", href: "/app-store-listing-copy.html" },
      { label: "Screencast 台本", href: "/screencast-script.html" },
    ],
  };
};

export default function ReleaseReadinessPage() {
  const { localReadyItems, externalRequiredItems, legalPages, launchDraftPages } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="公開準備">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Release</span>
          <h1 className="rnk-title">BridgePoint を本番公開へ近づけるための整理</h1>
          <p className="rnk-subtitle">
            repo 内で埋められる要素はここまで揃え、最後に残る Partner Dashboard と本番環境の作業を
            目立つ形で切り出しています。
          </p>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>repo 側で揃ったもの</h2>
            <ul className="rnk-list">
              {localReadyItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="rnk-card">
            <h2>外部で必要なもの</h2>
            <ul className="rnk-list">
              {externalRequiredItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="rnk-card">
          <h2>公開用ページ</h2>
          <div className="rnk-actions">
            {legalPages.map((page) => (
              <a key={page.href} className="rnk-button-secondary" href={page.href} rel="noreferrer">
                {page.label}
              </a>
            ))}
          </div>
          <p className="rnk-muted" style={{ marginTop: 12 }}>
            これらは Shopify App Store listing や review 提出時の URL 候補として使えます。
          </p>
        </section>

        <section className="rnk-card">
          <h2>申請用ドラフト</h2>
          <div className="rnk-actions">
            {launchDraftPages.map((page) => (
              <a key={page.href} className="rnk-button-secondary" href={page.href} rel="noreferrer">
                {page.label}
              </a>
            ))}
          </div>
          <p className="rnk-muted" style={{ marginTop: 12 }}>
            Partner Dashboard の Protected customer data / data protection details /
            listing 文言を、repo で管理できる下書きに寄せています。
          </p>
        </section>

        <section className="rnk-card">
          <h2>次の最短ルート</h2>
          <ol className="rnk-list">
            <li>`npm run release:precheck` と `npm run release:validate-config` を通す</li>
            <li>本番ホスティング URL を `https://bridgepoint-shopify-app.fly.dev` に確定する</li>
            <li>
              Partner Dashboard で App URL / Redirect URL / app name / listing / pricing を BridgePoint へ揃える
              <br />
              Free / Advanced $9 / Premium $19 / Unlimited $39 を mirror する
            </li>
            <li>Shopify app config を production URL 前提で deploy する</li>
            <li>Protected customer data と data protection details を送信する</li>
            <li>本番 URL で OAuth / embedded app / 手動付与 / orders/paid webhook / legal pages を最終確認する</li>
            <li>Fly.io trial 停止制限解除のカード登録は、本番で継続稼働させる直前までに実施する</li>
          </ol>
        </section>

        <div className="rnk-actions">
          <Link className="rnk-button" to="/app/settings">
            設定へ戻る
          </Link>
          <a className="rnk-button-secondary" href="/release-checklist.html">
            release checklist を開く
          </a>
        </div>
      </div>
    </s-page>
  );
}
