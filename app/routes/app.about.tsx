import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getShopOperationalStatus } from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return getShopOperationalStatus(admin);
};

export default function AboutPage() {
  const shopStatus = useLoaderData<typeof loader>();

  return (
    <s-page heading="About BridgePoint">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">BridgePoint</span>
          <h1 className="rnk-title">迷わず、壊さず、すぐ回せるポイント運用のための About</h1>
          <p className="rnk-subtitle">
            BridgePoint は Shopify ネイティブの Store Credit を土台にして、まず
            「貯める・管理する」を安全に始めるための v1 です。失敗しにくい導線と、あとで育てやすい移行前提を重視しています。
          </p>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>1. Store Credit 前提</h2>
            <p className="rnk-muted">
              ポイント残高の正本は BridgePoint 独自 ledger ではなく Shopify Store Credit に置きます。BridgePoint は設定、
              実行ガード、履歴の見え方、運用補助を担当します。
            </p>
          </article>

          <article className="rnk-card">
            <h2>2. 付与ルール</h2>
            <p className="rnk-muted">
              手動付与はスタッフ操作で実行し、`orders/paid` 自動付与は Shopify Flow と webhook の安全策を前提に扱います。
              自動付与通貨は常にショップ通貨固定です。
            </p>
          </article>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>3. 失効ルール</h2>
            <p className="rnk-muted">
              付与時に期限を持たせ、失効予定残高と次回失効日を顧客単位で追えるようにしています。手動付与と自動付与は既定期限を別で持てます。
            </p>
          </article>

          <article className="rnk-card">
            <h2>4. v1 でできること / できないこと</h2>
            <p className="rnk-muted">
              できることは、手動付与、顧客残高確認、直近履歴確認、注文起点の自動付与ガードです。複数通貨最適化、返品自動相殺、
              Store Credit 全量分析は v1 対象外です。
            </p>
          </article>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>5. checkout 利用条件</h2>
            <p className="rnk-muted">
              checkout で Store Credit を使うには New customer accounts が必要です。現在の診断は
              {shopStatus.newCustomerAccountsEnabled ? " 有効" : " 未有効"} です。
            </p>
          </article>

          <article className="rnk-card">
            <h2>6. 運用上の注意事項</h2>
            <p className="rnk-muted">
              v1 は単一通貨ストア前提です。Flow が未利用なら自動付与を無効化し、手動付与から始めます。失敗しない設計を優先し、
              複雑化する前に運用ルールを固められるようにしています。
            </p>
          </article>
        </section>

        <section className="rnk-card">
          <h2>このストアの現在診断</h2>
          <ul className="rnk-list">
            <li>
              単一通貨要件:{" "}
              {shopStatus.singleCurrencySupported
                ? `満たしています (${shopStatus.shopCurrency})`
                : `未達です (${shopStatus.enabledPresentmentCurrencies.join(", ")})`}
            </li>
            <li>
              Shopify Flow: {shopStatus.flowAppInstalled ? "利用可能" : "未利用または未有効"}
            </li>
            <li>
              New customer accounts:{" "}
              {shopStatus.newCustomerAccountsEnabled ? "有効" : "未有効"}
            </li>
          </ul>
          <p className="rnk-muted" style={{ marginTop: 12 }}>
            {shopStatus.newCustomerAccountsEnabled
              ? "このストアでは「貯める・管理する」に加えて checkout 利用条件も案内できます。"
              : "このストアでは checkout 利用はまだ案内せず、「貯める・管理する」を中心価値として導入できます。"}
          </p>
        </section>

        <div className="rnk-actions">
          <Link className="rnk-button" to="/app/settings">
            設定を開く
          </Link>
          <Link className="rnk-button-secondary" to="/app/flow-setup">
            Flow 導線を見る
          </Link>
          <Link className="rnk-button-secondary" to="/app/manual-credit">
            手動付与へ進む
          </Link>
        </div>
      </div>
    </s-page>
  );
}
