import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import {
  getShopDashboardSummary,
  getShopOperationalStatus,
  retryFailedOrderPaidGrant,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null, timeZone?: string) {
  if (!value) {
    return "未処理";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [summary, shopStatus] = await Promise.all([
    getShopDashboardSummary({
      admin,
      shop: session.shop,
    }),
    getShopOperationalStatus(admin),
  ]);

  return {
    ...summary,
    shopStatus,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "retry-order-paid-grant") {
    return {
      ok: false,
      error: "不明な操作です。",
    };
  }

  const key = String(formData.get("key") ?? "").trim();
  const allowUnknown = formData.get("allowUnknown") === "true";

  if (!key) {
    return {
      ok: false,
      error: "再実行対象の key が必要です。",
    };
  }

  try {
    const result = await retryFailedOrderPaidGrant({
      admin,
      billing,
      shop: session.shop,
      key,
      allowUnknown,
    });

    return {
      ok: true,
      retriedKey: key,
      status: result.status,
    };
  } catch (error) {
    return {
      ok: false,
      retriedKey: key,
      error:
        error instanceof Error ? error.message : "再実行中に予期しないエラーが発生しました。",
    };
  }
};

export default function Index() {
  const {
    grantCurrencyCode,
    shopTimezone,
    kpiDefinition,
    settings,
    metrics,
    currencyBreakdown,
    recentManualGrants,
    recentGrantLocks,
    activeGrantFailures,
    shopStatus,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const setupBlockedByMultiCurrency = !shopStatus.singleCurrencySupported;
  const flowGuardActive = !shopStatus.flowAppInstalled;

  return (
    <s-page heading="BridgePoint">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">BridgePoint</span>
          <h1 className="rnk-title">
            Shopify ネイティブの Store Credit で、
            軽く始めるポイント基盤をつくる。
          </h1>
          <p className="rnk-subtitle">
            手動付与、customer details、`orders/paid` 自動付与、二重付与防止、
            そして最小の billing / KPI ダッシュボードまでを小さく積み上げています。
          </p>
          <div className="rnk-actions">
            <Link className="rnk-button" to="/app/manual-credit">
              手動付与を試す
            </Link>
            <Link className="rnk-button-secondary" to="/app/settings">
              設定を整える
            </Link>
            <Link className="rnk-button-secondary" to="/app/flow-setup">
              Flow テンプレートを見る
            </Link>
            <Link className="rnk-button-secondary" to="/app/release-readiness">
              公開準備を見る
            </Link>
            <Link className="rnk-button-secondary" to="/app/about">
              About を見る
            </Link>
          </div>
        </section>

        {(setupBlockedByMultiCurrency || flowGuardActive || !shopStatus.newCustomerAccountsEnabled) ? (
          <section className="rnk-card">
            <h2>導入診断</h2>
            <ul className="rnk-list">
              <li>
                通貨:{" "}
                {setupBlockedByMultiCurrency
                  ? `v1 対象外（有効通貨: ${shopStatus.enabledPresentmentCurrencies.join(", ")}）`
                  : `単一通貨で利用可能 (${shopStatus.shopCurrency})`}
              </li>
              <li>
                Shopify Flow:{" "}
                {flowGuardActive
                  ? "未利用または未有効。自動付与 UI はロックし、手動付与のみ継続利用できます。"
                  : "利用可能"}
              </li>
              <li>
                New customer accounts:{" "}
                {shopStatus.newCustomerAccountsEnabled
                  ? "有効。checkout 利用条件を満たす方向です。"
                  : "未有効。v1 でも「貯める・管理する」は利用できますが、checkout 利用は有効化後です。"}
              </li>
            </ul>
          </section>
        ) : null}

        <section className="rnk-grid">
          <article className="rnk-card">
            <span className="rnk-eyebrow">Manual Grants</span>
            <h2>累計手動付与件数</h2>
            <p className="rnk-kpi">{metrics.totalManualGrantCount}</p>
            <p className="rnk-muted">
              付与対象顧客数: {metrics.totalManualGrantCustomerCount}
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">This Month</span>
            <h2>今月の手動付与件数</h2>
            <p className="rnk-kpi">{metrics.currentMonthManualGrantCount}</p>
            <p className="rnk-muted">
              付与対象顧客数: {metrics.currentMonthManualGrantCustomerCount}
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Settings</span>
            <h2>現在の手動付与通貨</h2>
            <p className="rnk-kpi">{grantCurrencyCode}</p>
            <p className="rnk-muted">
              自動付与通貨はショップ通貨固定 / 手動期限 {settings.manualDefaultExpiryDays} 日 / 自動期限 {settings.defaultExpiryDays} 日
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Idempotency</span>
            <h2>二重付与防止基盤</h2>
            <p className="rnk-kpi">Ready</p>
            <p className="rnk-muted">
              最近の lock 件数: {metrics.recentIdempotencyLockCount} / 要対応障害:{" "}
              {metrics.activeGrantFailureCount}
            </p>
          </article>
        </section>

        {actionData?.error ? <p className="rnk-note">{actionData.error}</p> : null}
        {actionData?.ok ? (
          <p className="rnk-note">
            `orders/paid` 自動付与の再実行を開始しました。key: {actionData.retriedKey}
          </p>
        ) : null}

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>設定の要点</h2>
            <ul className="rnk-list">
              <li>手動付与通貨: {grantCurrencyCode}</li>
              <li>自動付与通貨: ショップ通貨固定</li>
              <li>
                自動付与テンプレート: {settings.autoGrantEnabled ? "有効" : "無効"}
              </li>
              <li>
                付与率: {settings.grantRateNumerator}/{settings.grantRateDenominator}
              </li>
              <li>手動付与の既定期限: {settings.manualDefaultExpiryDays} 日</li>
              <li>自動付与の既定期限: {settings.defaultExpiryDays} 日</li>
            </ul>
          </article>

          <article className="rnk-card">
            <h2>いまのダッシュボードの前提</h2>
            <ul className="rnk-list">
              <li>KPI の月次境界はストア管理タイムゾーン `{shopTimezone}` で固定</li>
              <li>付与額は `ManualGrantLog.createdAt` を計上基準に集計</li>
              <li>異なる通貨を混ぜないよう、金額は Store Credit 額を通貨別に分けて表示</li>
              <li>キャンセルや返品の控除は v1 では自動相殺せず、手動調整の実行日で反映</li>
              <li>Store Credit 全体残高のネイティブ集計は次段階</li>
              <li>`orders/paid` 自動付与と usage billing は開発ストアで実地確認済み</li>
            </ul>
            <p className="rnk-muted" style={{ marginTop: 12 }}>
              Basis: {kpiDefinition.grantedAmountBasis} / TZ: {kpiDefinition.timeZone}
            </p>
          </article>
        </section>

        <section className="rnk-card">
          <h2>要対応の自動付与障害</h2>
          {activeGrantFailures.length === 0 ? (
            <p className="rnk-muted">
              現在、再実行や確認が必要な `orders/paid` 自動付与障害はありません。
            </p>
          ) : (
            <table className="rnk-table">
              <thead>
                <tr>
                  <th>作成日時</th>
                  <th>分類</th>
                  <th>key</th>
                  <th>次回再実行</th>
                  <th>通知先</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {activeGrantFailures.map((lock) => (
                  <tr key={lock.id}>
                    <td>{formatDate(lock.createdAt, shopTimezone)}</td>
                    <td>{lock.failureCategory ?? lock.status}</td>
                    <td>{lock.key}</td>
                    <td>{formatDate(lock.nextRetryAt, shopTimezone)}</td>
                    <td>{settings.operationsAlertEmail || "app 内通知のみ"}</td>
                    <td>
                      <Form method="post">
                        <input type="hidden" name="intent" value="retry-order-paid-grant" />
                        <input type="hidden" name="key" value={lock.key} />
                        <input
                          type="hidden"
                          name="allowUnknown"
                          value={lock.failureCategory === "UNKNOWN" ? "true" : "false"}
                        />
                        <button className="rnk-button-secondary" type="submit">
                          {lock.failureCategory === "UNKNOWN" ? "確認後に再実行" : "再実行"}
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rnk-card">
          <h2>通貨別の手動付与 KPI</h2>
          {currencyBreakdown.length === 0 ? (
            <p className="rnk-muted">まだ手動付与ログはありません。</p>
          ) : (
            <table className="rnk-table">
              <thead>
                <tr>
                  <th>通貨</th>
                  <th>累計付与額</th>
                  <th>今月付与額</th>
                  <th>先月付与額</th>
                  <th>累計件数</th>
                </tr>
              </thead>
              <tbody>
                {currencyBreakdown.map((item) => (
                  <tr key={item.currencyCode}>
                    <td>{item.currencyCode}</td>
                    <td>{formatMoney(item.totalAmount, item.currencyCode)}</td>
                    <td>{formatMoney(item.currentMonthAmount, item.currencyCode)}</td>
                    <td>{formatMoney(item.previousMonthAmount, item.currencyCode)}</td>
                    <td>{item.totalCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>直近の手動付与</h2>
            {recentManualGrants.length === 0 ? (
              <p className="rnk-muted">まだ手動付与ログはありません。</p>
            ) : (
              <table className="rnk-table">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>顧客</th>
                    <th>付与額</th>
                    <th>理由</th>
                  </tr>
                </thead>
                <tbody>
                  {recentManualGrants.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt, shopTimezone)}</td>
                      <td>{log.customerDisplayName || log.customerEmail}</td>
                      <td>{formatMoney(Number(log.amount), log.currencyCode)}</td>
                      <td>{log.reason ?? "未設定"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="rnk-card">
            <h2>直近の idempotency lock</h2>
            {recentGrantLocks.length === 0 ? (
              <p className="rnk-muted">
                まだ lock はありません。Order paid 自動付与を入れるとここで重複検知の履歴を追えます。
              </p>
            ) : (
              <table className="rnk-table">
                <thead>
                  <tr>
                    <th>作成日時</th>
                    <th>source</th>
                    <th>key</th>
                    <th>status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGrantLocks.map((lock) => (
                    <tr key={lock.id}>
                      <td>{formatDate(lock.createdAt, shopTimezone)}</td>
                      <td>{lock.sourceType}</td>
                      <td>{lock.key}</td>
                      <td>{lock.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </section>
      </div>
    </s-page>
  );
}
