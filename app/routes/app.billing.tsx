import {
  SEND_UNIT_PRICE_JPY,
  SEND_USAGE_CAP_JPY,
  SEND_USAGE_PLAN,
} from "../lib/billing";

export default function BillingPage() {
  return (
    <s-page heading="課金とテスト方針">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Billing</span>
          <h1 className="rnk-title">Bridge Points の課金は、付与処理件数ベースで軽く始める</h1>
          <p className="rnk-subtitle">
            App Store 掲載を前提にするため、課金は Shopify Billing API へ寄せます。
            この骨格では、ポイント付与処理数ベースの usage plan をコード側に定義しています。
          </p>
        </section>

        <section className="rnk-grid">
          <article className="rnk-card">
            <span className="rnk-eyebrow">Plan Key</span>
            <h2>Billing config</h2>
            <p className="rnk-kpi">{SEND_USAGE_PLAN}</p>
            <p className="rnk-muted">
              Shopify App Store 配布で使う Billing API 側の plan key です。
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Usage</span>
            <h2>単価</h2>
            <p className="rnk-kpi">¥{SEND_UNIT_PRICE_JPY}</p>
            <p className="rnk-muted">ポイント付与処理 1 件ごとの想定単価です。</p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Cap</span>
            <h2>上限</h2>
            <p className="rnk-kpi">¥{SEND_USAGE_CAP_JPY}</p>
            <p className="rnk-muted">
              30 日ごとの capped amount としてコードに定義しています。
            </p>
          </article>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>開発ストアでの王道テスト</h2>
            <ol className="rnk-list">
              <li>Partner Dashboard で開発ストアを用意する</li>
              <li>`npm install` と `npm run setup` を実行する</li>
              <li>`npm run config:link` でアプリ設定をリンクする</li>
              <li>`npm run dev` で `shopify app dev` を起動する</li>
              <li>開発ストアへインストールし、埋め込みアプリ画面を確認する</li>
            </ol>
          </article>

          <article className="rnk-card">
            <h2>課金の検証スタンス</h2>
            <ul className="rnk-list">
              <li>開発ストアでは test charge 前提で確認する</li>
              <li>`SHOPIFY_BILLING_TEST_MODE=true` の間は usage record も test mode で作成する</li>
              <li>まずは手動付与の成功件数だけ usage billing を記録する想定で設計する</li>
            </ul>
          </article>
        </section>

        <section className="rnk-card">
          <h2>現段階の判断</h2>
          <p className="rnk-note">
            Bridge Points は高機能ロイヤルティアプリの手前にある橋渡しアプリなので、
            まずはポイント付与処理件数ベースでの収益化を想定します。Billing API の usage plan は
            先に定義し、本番課金切り替えは実運用が見えてから行います。
            本番請求へ切り替えるときは `SHOPIFY_BILLING_TEST_MODE=false` を明示してください。
          </p>
        </section>
      </div>
    </s-page>
  );
}
