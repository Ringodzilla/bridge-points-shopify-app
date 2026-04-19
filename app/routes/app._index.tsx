import { Link } from "react-router";

export default function Index() {
  return (
    <s-page heading="Bridge Points">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Bridge Points</span>
          <h1 className="rnk-title">
            Shopify ネイティブの Store Credit で、
            軽く始めるポイント基盤をつくる。
          </h1>
          <p className="rnk-subtitle">
            高機能ロイヤルティアプリの手前で必要になる、手動付与、自動付与、
            残高可視化、失効可視化だけに絞った Bridge Points の骨格です。
          </p>
          <div className="rnk-actions">
            <Link className="rnk-button" to="/app/manual-credit">
              手動付与を試す
            </Link>
            <Link className="rnk-button-secondary" to="/app/billing">
              課金と検証方針を確認
            </Link>
          </div>
        </section>

        <section className="rnk-grid">
          <article className="rnk-card">
            <span className="rnk-eyebrow">Status</span>
            <h2>アプリ基盤</h2>
            <p className="rnk-kpi">Ready</p>
            <p className="rnk-muted">
              React Router テンプレート、Prisma、埋め込みアプリ構成を採用。
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Scope</span>
            <h2>Store Credit 権限</h2>
            <p className="rnk-kpi">4 scopes</p>
            <p className="rnk-muted">
              `read_customers` に加えて、Store Credit の参照・付与に必要な scope を使います。
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Ledger</span>
            <h2>残高の正本</h2>
            <p className="rnk-kpi">Native</p>
            <p className="rnk-muted">
              ポイント残高の正本は独自 DB ではなく Shopify Store Credit に寄せます。
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Billing</span>
            <h2>収益化前提</h2>
            <p className="rnk-kpi">Usage</p>
            <p className="rnk-muted">
              App Store 前提で、ポイント付与処理件数に応じた従量課金の骨格を準備済みです。
            </p>
          </article>
        </section>

        <section className="rnk-split">
          <article className="rnk-callout">
            <h2>今の骨格に入っているもの</h2>
            <ul className="rnk-list">
              <li>Shopify 公開アプリ前提の `AppStore` 配布設定</li>
              <li>Compliance webhook の受け口</li>
              <li>Bridge Points 用の日本語ダッシュボード導線</li>
              <li>Store Credit 手動付与 route</li>
              <li>customer details block / action からの特別付与</li>
              <li>手動付与ログ保存</li>
              <li>ポイント基盤向け usage billing の plan 定義</li>
              <li>Prisma + SQLite の標準セッション保存</li>
            </ul>
          </article>

          <article className="rnk-callout">
            <h2>まだ入れていないもの</h2>
            <ul className="rnk-list">
              <li>Order paid 起点の Flow 自動付与</li>
              <li>失効予定の集計表示</li>
              <li>従量課金の本番請求切り替え</li>
              <li>ポイント付与ルールの設定画面</li>
            </ul>
          </article>
        </section>

        <section className="rnk-card">
          <h2>次の実装順</h2>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="success">1. 手動付与 route</span>
            <span className="rnk-pill" data-tone="success">2. 顧客詳細 block / action</span>
            <span className="rnk-pill" data-tone="warning">3. 設定モデル</span>
            <span className="rnk-pill" data-tone="warning">4. Flow 自動付与</span>
            <span className="rnk-pill" data-tone="warning">5. KPI 集計</span>
          </div>
        </section>
      </div>
    </s-page>
  );
}
