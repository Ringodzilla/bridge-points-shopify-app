import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { BillingReplacementBehavior } from "@shopify/shopify-app-react-router/server";
import {
  type BillingPlanDefinition,
  OVERAGE_UNIT_PRICE_USD,
  isBillingPlanKey,
} from "../lib/billing";
import {
  getShopBillingOverview,
  isBillingTestModeEnabled,
} from "../lib/billing.server";
import { authenticate } from "../shopify.server";

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "未確定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPlanIncludedLabel(plan: BillingPlanDefinition) {
  if (plan.isUnlimited) {
    return "無制限";
  }

  return `${plan.includedMonthlyOrders} 件まで`;
}

function buildBillingReturnUrl({
  request,
  shop,
}: {
  request: Request;
  shop: string;
}) {
  const shopHandle = shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY;

  if (apiKey) {
    return `https://admin.shopify.com/store/${shopHandle}/apps/${apiKey}/app/billing`;
  }

  const url = new URL("/app/billing", request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    url.host = forwardedHost.split(",")[0].trim();
  }

  if (forwardedProto) {
    url.protocol = `${forwardedProto.split(",")[0].trim()}:`;
  } else if (url.hostname.endsWith("trycloudflare.com")) {
    url.protocol = "https:";
  } else if (process.env.SHOPIFY_APP_URL) {
    const appUrl = new URL(process.env.SHOPIFY_APP_URL);
    url.protocol = appUrl.protocol;
    url.host = appUrl.host;
  }

  return url.toString();
}

function getBillingErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "errorData" in error) {
    const errorData = (error as { errorData?: unknown }).errorData;

    if (Array.isArray(errorData)) {
      const messages = errorData
        .map((entry) => {
          if (
            entry &&
            typeof entry === "object" &&
            "message" in entry &&
            typeof entry.message === "string"
          ) {
            return entry.message;
          }

          return null;
        })
        .filter((message): message is string => Boolean(message));

      if (
        messages.some((message) =>
          message.includes("Apps without a public distribution cannot use the Billing API"),
        )
      ) {
        return "このアプリはまだ Public distribution ではないため Shopify Billing API を使えません。Partner Dashboard で distribution を Public に設定してから、もう一度プラン選択を行ってください。";
      }

      if (messages.length > 0) {
        return messages.join(" / ");
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "課金承認ページを開けませんでした。";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  return getShopBillingOverview({
    billing,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const planKey = String(formData.get("planKey") || "");

  if (intent !== "request-plan") {
    return {
      error: "不明な操作です。",
    };
  }

  if (!isBillingPlanKey(planKey)) {
    return {
      error: "選択されたプランが不正です。",
    };
  }

  try {
    return await billing.request({
      plan: planKey,
      isTest: isBillingTestModeEnabled(),
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      returnUrl: buildBillingReturnUrl({
        request,
        shop: session.shop,
      }),
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return {
      error: getBillingErrorMessage(error),
    };
  }
};

export default function BillingPage() {
  const overview = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const activeSubmittingPlanKey = navigation.formData?.get("planKey");
  const activeTestOverrides = overview.planSummaries.filter(
    (plan) => plan.testIncludedOrderOverride !== null,
  );
  const billingRequired = searchParams.get("billingRequired") === "1";
  const billingError = searchParams.get("billingError");

  return (
    <s-page heading="プラン">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Plans</span>
          <h1 className="rnk-title">月間注文数ベースで、merchant が自分に合うプランを選べるようにする</h1>
          <p className="rnk-subtitle">
            課金対象は BridgePoint が `Order paid` 自動付与で処理した月間注文数です。
            `Free / Advanced / Premium / Unlimited` の 4 プランから選べて、
            `Free / Advanced / Premium` は上限超過分だけ 1 件あたり
            {` ${formatUsd(OVERAGE_UNIT_PRICE_USD)} `}の従量課金が発生します。
          </p>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone={overview.isTestMode ? "warning" : "success"}>
              {overview.isTestMode ? "Billing Test Mode" : "Billing Live Mode"}
            </span>
            <span className="rnk-pill" data-tone={overview.currentPlan ? "success" : "neutral"}>
              {overview.currentPlan ? `現在プラン: ${overview.currentPlan.label}` : "プラン未選択"}
            </span>
          </div>
        </section>

        {billingRequired ? (
          <p className="rnk-note">
            BridgePoint を利用するには、先に Shopify Billing のプラン承認が必要です。
            Free プランでも Shopify の承認画面で subscription を有効化してください。
          </p>
        ) : null}

        {billingError ? (
          <p className="rnk-note">
            課金状態を確認できませんでした: {billingError}
          </p>
        ) : null}

        {actionData?.error ? <p className="rnk-note">{actionData.error}</p> : null}

        {overview.isTestMode && activeTestOverrides.length > 0 ? (
          <p className="rnk-note">
            Billing test override が有効です。
            {activeTestOverrides.map((plan) => `${plan.label}: 月 ${plan.includedMonthlyOrders} 件`).join(" / ")}
            までを含み枠として扱います。
          </p>
        ) : null}

        {overview.recommendation ? (
          <p className="rnk-note">
            このままの注文ペースだと、
            <strong>{overview.recommendation.planLabel}</strong>
            {overview.recommendation.direction === "downgrade"
              ? "へ戻す方が安い見込みです。"
              : "へ変更する方が安い見込みです。"}
            想定節約額は {formatUsd(overview.recommendation.projectedSavingsUsd)} です。
          </p>
        ) : !overview.currentPlan ? (
          <p className="rnk-note">
            まだプラン未選択です。現在のペースでは
            <strong>{overview.suggestedStartingPlan.label}</strong>
            が最も自然な開始プランです。
          </p>
        ) : null}

        <section className="rnk-grid">
          <article className="rnk-card">
            <span className="rnk-eyebrow">Meter</span>
            <h2>現在の処理件数</h2>
            <p className="rnk-kpi">{overview.metrics.currentCycleProcessedOrderCount} 件</p>
            <p className="rnk-muted">
              {overview.usageWindow.mode === "billing_cycle"
                ? `現在の billing cycle: ${formatDate(overview.usageWindow.startedAt)} - ${formatDate(overview.usageWindow.endsAt)}`
                : "まだ購読がないため、当月起点の見込みを表示しています。"}
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Forecast</span>
            <h2>30日換算の見込み</h2>
            <p className="rnk-kpi">{overview.metrics.projectedMonthlyOrderCount} 件</p>
            <p className="rnk-muted">
              現在のペース倍率: x{overview.metrics.projectedRunRateMultiplier}
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Current</span>
            <h2>現在プランの予測請求</h2>
            <p className="rnk-kpi">
              {overview.currentPlan
                ? formatUsd(overview.currentPlan.projectedTotalChargeUsd)
                : "未選択"}
            </p>
            <p className="rnk-muted">
              {overview.currentPlan
                ? `${overview.currentPlan.label} のこのままの月額見込み`
                : "まずは 1 つプランを選んでください。"}
            </p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Usage</span>
            <h2>Shopify usage 実績</h2>
            <p className="rnk-kpi">
              {overview.usageLineItem
                ? formatUsd(overview.usageLineItem.balanceUsed.amount)
                : formatUsd(0)}
            </p>
            <p className="rnk-muted">
              {overview.usageLineItem
                ? `cap ${formatUsd(overview.usageLineItem.cappedAmount.amount)}`
                : "usage line item はまだありません。"}
            </p>
          </article>
        </section>

        <section className="rnk-card">
          <h2>プラン一覧</h2>
          <div className="rnk-grid">
            {overview.planSummaries.map((plan) => {
              const isSubmittingThisPlan =
                navigation.state === "submitting" && activeSubmittingPlanKey === plan.key;

              return (
                <article className="rnk-card" key={plan.key}>
                  <div className="rnk-pill-row" style={{ marginBottom: 12 }}>
                    <span className="rnk-pill" data-tone={plan.isCurrentPlan ? "success" : "neutral"}>
                      {plan.label}
                    </span>
                    {plan.isCurrentPlan ? (
                      <span className="rnk-pill" data-tone="warning">
                        Current
                      </span>
                    ) : null}
                    {overview.recommendation?.planKey === plan.key ? (
                      <span className="rnk-pill" data-tone="success">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <h3 style={{ marginTop: 0 }}>{formatUsd(plan.monthlyPriceUsd)}</h3>
                  <p className="rnk-muted" style={{ marginTop: 0 }}>
                    {plan.isUnlimited
                      ? "無制限の月間注文数"
                      : `月 ${getPlanIncludedLabel(plan)} は追加料金なし`}
                  </p>

                  <ul className="rnk-list">
                    <li>All features!</li>
                    <li>
                      現在件数ベースの超過: {plan.currentCycleOverageOrderCount} 件
                    </li>
                    <li>
                      30日換算の超過: {plan.projectedOverageOrderCount} 件
                    </li>
                    <li>
                      このままの月額見込み: {formatUsd(plan.projectedTotalChargeUsd)}
                    </li>
                    <li>
                      {plan.isUnlimited
                        ? "overage なし"
                        : `超過分は ${formatUsd(plan.overageUnitPriceUsd)} / 件、cap は ${formatUsd(
                            plan.usageCapUsd,
                          )}`}
                    </li>
                  </ul>

                  <Form method="post" reloadDocument>
                    <input name="intent" type="hidden" value="request-plan" />
                    <input name="planKey" type="hidden" value={plan.key} />
                    <button
                      className={plan.isCurrentPlan ? "rnk-button-secondary" : "rnk-button"}
                      disabled={plan.isCurrentPlan || navigation.state === "submitting"}
                      type="submit"
                    >
                      {plan.isCurrentPlan
                        ? "現在のプラン"
                        : isSubmittingThisPlan
                          ? "課金承認ページへ移動中..."
                          : overview.currentPlan
                            ? `${plan.label} へ変更する`
                            : `${plan.label} を選ぶ`}
                    </button>
                  </Form>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>いまの設計で大事なこと</h2>
            <ul className="rnk-list">
              <li>課金対象は手動付与ではなく、Order paid 自動付与で処理した注文数</li>
              <li>Free でも 101 件目以降は overage が発生する</li>
              <li>Unlimited は固定 {formatUsd(39)} で overage なし</li>
              <li>merchant には常に「このままだとどのプランが安いか」を見せる</li>
            </ul>
          </article>

          <article className="rnk-card">
            <h2>公開前に残ること</h2>
            <ul className="rnk-list">
              <li>課金未承認ショップに対する gate を route 単位で詰める</li>
              <li>Partner Dashboard の pricing 文言を 4 プラン構成に揃える</li>
              <li>本番環境では test mode を外し、実課金の監視フローを決める</li>
            </ul>
          </article>
        </section>

        <section className="rnk-card">
          <h2>次に確認する場所</h2>
          <div className="rnk-actions">
            <Link className="rnk-button-secondary" to="/app/release-readiness">
              公開準備を見る
            </Link>
            <Link className="rnk-button-secondary" to="/app/flow-setup">
              Flow テンプレートを見る
            </Link>
          </div>
        </section>
      </div>
    </s-page>
  );
}
