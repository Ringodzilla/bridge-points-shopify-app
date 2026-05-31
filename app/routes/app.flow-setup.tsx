import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { previewProcessedOrderUsageCharge } from "../lib/billing.server";
import {
  getConfiguredGrantCurrencyCode,
  getShopSettings,
  simulateOrderPaidGrantExecution,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

type SimulationFormValues = {
  orderId: string;
  customerId: string;
  orderTotalAmount: string;
};

type SimulationFormErrors = Partial<Record<keyof SimulationFormValues | "form", string>>;

const SAMPLE_SIMULATION_ORDER_ID = "gid://shopify/Order/100000000001";
const SAMPLE_SIMULATION_CUSTOMER_ID = "gid://shopify/Customer/100000000001";

const DEFAULT_SIMULATION_FORM: SimulationFormValues = {
  orderId: SAMPLE_SIMULATION_ORDER_ID,
  customerId: SAMPLE_SIMULATION_CUSTOMER_ID,
  orderTotalAmount: "10000",
};

function buildFlowMutation() {
  return `mutation BridgePointsFlowCredit(
  $id: ID!
  $creditInput: StoreCreditAccountCreditInput!
) {
  storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
    storeCreditAccountTransaction {
      id
      amount {
        amount
        currencyCode
      }
      expiresAt
      account {
        id
        balance {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`;
}

function buildFlowMutationInputs({
  grantRateNumerator,
  grantRateDenominator,
  defaultExpiryDays,
  grantCurrencyCode,
}: {
  grantRateNumerator: number;
  grantRateDenominator: number;
  defaultExpiryDays: number;
  grantCurrencyCode: string;
}) {
  return `{
  "id": "{{ order.customer.id }}",
  "creditInput": {
    "creditAmount": {
      "amount": {% assign bridge_points_grant_amount = order.totalPriceSet.shopMoney.amount | times: ${grantRateNumerator} | divided_by: ${grantRateDenominator} | floor %}{{ bridge_points_grant_amount | json }},
      "currencyCode": "${grantCurrencyCode}"
    },
    "expiresAt": {{ "now" | date_plus: "${defaultExpiryDays} days" | json }}
  }
}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const { shopCurrency, grantCurrencyCode } = await getConfiguredGrantCurrencyCode({
    admin,
    shop: session.shop,
  });
  const settings = await getShopSettings({
    shop: session.shop,
    fallbackGrantCurrencyCode: shopCurrency,
  });

  return {
    shopCurrency,
    grantCurrencyCode: shopCurrency,
    manualGrantCurrencyCode: grantCurrencyCode,
    autoGrantEnabled: settings.autoGrantEnabled,
    grantRateNumerator: settings.grantRateNumerator,
    grantRateDenominator: settings.grantRateDenominator,
    defaultExpiryDays: settings.defaultExpiryDays,
    flowMutation: buildFlowMutation(),
    flowMutationInputs: buildFlowMutationInputs({
      grantRateNumerator: settings.grantRateNumerator,
      grantRateDenominator: settings.grantRateDenominator,
      defaultExpiryDays: settings.defaultExpiryDays,
      grantCurrencyCode: shopCurrency,
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const values: SimulationFormValues = {
    orderId: String(formData.get("orderId") ?? "").trim(),
    customerId: String(formData.get("customerId") ?? "").trim(),
    orderTotalAmount: String(formData.get("orderTotalAmount") ?? "").trim(),
  };
  const errors: SimulationFormErrors = {};

  if (!values.orderId) {
    errors.orderId = "注文 ID を入力してください。";
  }

  if (!values.customerId) {
    errors.customerId = "顧客 ID を入力してください。";
  }

  const parsedOrderTotalAmount = Number(values.orderTotalAmount);
  if (!Number.isFinite(parsedOrderTotalAmount) || parsedOrderTotalAmount <= 0) {
    errors.orderTotalAmount = "注文金額は 0 より大きい数値で入力してください。";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values,
      simulation: null,
    };
  }

  try {
    const simulation = await simulateOrderPaidGrantExecution({
      admin,
      shop: session.shop,
      orderId: values.orderId,
      customerId: values.customerId,
      orderTotalAmount: values.orderTotalAmount,
    });
    const billingPreview = await previewProcessedOrderUsageCharge({
      billing,
      shop: session.shop,
      additionalProcessedOrderCount: 1,
    });

    return {
      ok: true,
      errors: {},
      values,
      simulation,
      billingPreview,
    };
  } catch (error) {
    return {
      ok: false,
      errors: {
        form:
          error instanceof Error
            ? error.message
            : "Flow シミュレーション中に予期しないエラーが発生しました。",
      },
      values,
      simulation: null,
      billingPreview: null,
    };
  }
};

export default function FlowSetupPage() {
  const {
    shopCurrency,
    grantCurrencyCode,
    manualGrantCurrencyCode,
    autoGrantEnabled,
    grantRateNumerator,
    grantRateDenominator,
    defaultExpiryDays,
    flowMutation,
    flowMutationInputs,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const simulationValues = actionData?.values ?? DEFAULT_SIMULATION_FORM;
  const simulationErrors: SimulationFormErrors = actionData?.errors ?? {};
  const simulation = actionData?.simulation;
  const billingPreview = actionData?.billingPreview;
  const isSubmitting = navigation.state === "submitting";
  const simulationStatusLabel =
    simulation?.status === "simulated"
      ? "lock を作成して simulated として記録しました。"
      : simulation?.status === "duplicate"
        ? "同じ注文 ID の lock が既に存在します。"
      : simulation?.status === "disabled"
          ? "自動付与が無効なので lock は作っていません。"
        : simulation?.status === "currency_mismatch"
            ? "自動付与通貨がショップ通貨と一致しないため、v1 の Flow 自動付与は安全に実行できません。"
            : simulation?.status === "zero_amount"
              ? "計算結果が 0 なので付与対象外です。"
              : null;

  return (
    <s-page heading="Flow 自動付与">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">BridgePoint</span>
          <h1 className="rnk-title">Order paid の自動付与を、今の設定値で組む</h1>
          <p className="rnk-subtitle">
            Shopify Flow の `Send Admin API request` に貼り付ける mutation と input を、
            現在の BridgePoint 設定から生成します。
          </p>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="success">
              自動付与通貨: {grantCurrencyCode}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              ショップ通貨: {shopCurrency}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              手動付与通貨: {manualGrantCurrencyCode}
            </span>
            <span className="rnk-pill" data-tone={autoGrantEnabled ? "success" : "warning"}>
              自動付与: {autoGrantEnabled ? "有効" : "無効"}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              付与率: {grantRateNumerator}/{grantRateDenominator}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              有効期限: {defaultExpiryDays} 日
            </span>
          </div>
        </section>

        <p className="rnk-note">
          現在の最小構成では、Flow は app DB を直接読めません。そのため、この画面は
          「いま保存されている設定値でそのまま使える Flow テンプレート」を出します。
          自動付与通貨は常にショップ通貨へ固定し、付与率や期限を変えた後はこの画面を開き直して
          workflow 側も更新してください。
        </p>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>Order paid シミュレーション</h2>
            <p className="rnk-muted">
              このストアでは Shopify Flow を使えないため、まずは app 側で
              「付与額の計算」と「二重付与防止 lock」の動きを確認できます。
            </p>

            {simulationErrors.form ? <p className="rnk-note">{simulationErrors.form}</p> : null}

            <Form className="rnk-form" method="post">
              <input name="orderId" type="hidden" value={simulationValues.orderId} />
              <input name="customerId" type="hidden" value={simulationValues.customerId} />

              <ul className="rnk-list">
                <li>サンプル注文 ID: {simulationValues.orderId}</li>
                <li>サンプル顧客 ID: {simulationValues.customerId}</li>
                <li>同じサンプル注文 ID で再実行すると duplicate の動きを確認できます</li>
              </ul>

              {simulationErrors.orderId ? (
                <p className="rnk-muted">{simulationErrors.orderId}</p>
              ) : null}
              {simulationErrors.customerId ? (
                <p className="rnk-muted">{simulationErrors.customerId}</p>
              ) : null}

              <label className="rnk-field" style={{ marginTop: 14 }}>
                <span className="rnk-label">注文金額（ショップ通貨ベース）</span>
                <input
                  className="rnk-input"
                  defaultValue={simulationValues.orderTotalAmount}
                  inputMode="decimal"
                  name="orderTotalAmount"
                  placeholder="10000"
                />
                <span className="rnk-muted">
                  Flow テンプレートと同じく `order.totalPriceSet.shopMoney.amount` を前提に計算します。
                </span>
                {simulationErrors.orderTotalAmount ? (
                  <span className="rnk-muted">{simulationErrors.orderTotalAmount}</span>
                ) : null}
              </label>

              <div className="rnk-actions" style={{ marginTop: 16 }}>
                <button className="rnk-button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "シミュレーション中..." : "シミュレーションする"}
                </button>
              </div>
            </Form>
          </article>

          <article className="rnk-card">
            <h2>シミュレーション結果</h2>
            {!simulation ? (
              <p className="rnk-muted">
                注文 ID / 顧客 ID / 注文金額を入れると、現在設定から付与額と lock key を計算します。
              </p>
            ) : (
              <>
                <div className="rnk-pill-row">
                  <span
                    className="rnk-pill"
                    data-tone={
                      simulation.status === "simulated"
                        ? "success"
                        : simulation.status === "duplicate"
                          ? "warning"
                          : simulation.status === "currency_mismatch"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {simulation.status}
                  </span>
                  <span className="rnk-pill" data-tone="neutral">
                    付与額: {simulation.preview.grantAmount} {simulation.preview.grantCurrencyCode}
                  </span>
                </div>
                <p className="rnk-muted" style={{ marginTop: 12 }}>
                  {simulationStatusLabel}
                </p>
                <ul className="rnk-list">
                  <li>lock key: {simulation.preview.key}</li>
                  <li>
                    付与率: {simulation.preview.grantRateNumerator}/
                    {simulation.preview.grantRateDenominator}
                  </li>
                  <li>有効期限: {simulation.preview.defaultExpiryDays} 日</li>
                  <li>
                    ショップ通貨: {simulation.preview.shopCurrency} / 付与通貨:{" "}
                    {simulation.preview.grantCurrencyCode}
                  </li>
                  <li>注文金額: {simulation.preview.orderTotalAmount}</li>
                  <li>lock status: {simulation.lock?.status ?? "未作成"}</li>
                </ul>
                {billingPreview ? (
                  <>
                    <h3 style={{ marginBottom: 8 }}>billing preview</h3>
                    <ul className="rnk-list">
                      <li>
                        現在件数: {billingPreview.currentProcessedOrderCount} 件 / 次の処理後:{" "}
                        {billingPreview.nextProcessedOrderCount} 件
                      </li>
                      <li>
                        現在プラン: {billingPreview.plan?.label ?? "未選択"}
                      </li>
                      <li>
                        {billingPreview.status === "would_charge"
                          ? `この注文は overage 対象で、${billingPreview.chargeAmountUsd.toFixed(2)} USD の usage が発生見込みです。`
                          : billingPreview.status === "within_included"
                            ? "この注文は現在プランの含み枠内なので追加料金は発生しません。"
                            : billingPreview.status === "unlimited"
                              ? "Unlimited は overage なしです。"
                              : billingPreview.status === "usage_cap_reached"
                                ? "usage cap に達しているため、この注文では追加 usage は積まれません。"
                                : billingPreview.status === "no_usage_line_item"
                                  ? "usage line item がまだ無いため、課金 preview は保留です。"
                                  : "まだ有効なプランが無いため、課金 preview は出せません。"}
                      </li>
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </article>
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>Flow の組み方</h2>
            <ol className="rnk-list">
              <li>Trigger に `Order paid` を選ぶ</li>
              <li>Condition で `order.customer.id` が存在する注文だけ通す</li>
              <li>Order metafield を変数化して、`bridge_points.order_paid_granted_v1` が空のときだけ実行する</li>
              <li>`Send Admin API request` に下の mutation と inputs を貼る</li>
              <li>成功後に `Update order metafield` で `bridge_points.order_paid_granted_v1 = true` を保存する</li>
            </ol>
          </article>

          <article className="rnk-card">
            <h2>このテンプレートの前提</h2>
            <ul className="rnk-list">
              <li>支払済み注文の `order.totalPriceSet.shopMoney.amount` を付与原資に使う</li>
              <li>付与額は `floor(total * {grantRateNumerator} / {grantRateDenominator})` で丸める</li>
              <li>自動付与通貨はショップ通貨の {shopCurrency} に固定する</li>
              <li>有効期限は実行時点から {defaultExpiryDays} 日後</li>
              <li>手動付与通貨の設定は customer details / app 内の手動付与にだけ使う</li>
            </ul>
          </article>
        </section>

        <section className="rnk-card">
          <h2>Mutation</h2>
          <pre className="rnk-code">{flowMutation}</pre>
        </section>

        <section className="rnk-card">
          <h2>Mutation inputs</h2>
          <pre className="rnk-code">{flowMutationInputs}</pre>
        </section>

        <section className="rnk-split">
          <article className="rnk-callout">
            <h2>idempotency メモ</h2>
            <p className="rnk-muted">
              残高の正本は Store Credit に置きつつ、二重付与防止だけ order metafield を使う方針です。
              namespace は `bridge_points`、key は `order_paid_granted_v1` を推奨します。
            </p>
          </article>

          <article className="rnk-callout">
            <h2>次に整える候補</h2>
            <ul className="rnk-list">
              <li>設定画面から付与率と有効期限も編集可能にする</li>
              <li>Flow 実行結果を app home に可視化する</li>
              <li>設定値を shop metafield に同期して Flow と完全共有する</li>
            </ul>
          </article>
        </section>

        <div className="rnk-actions">
          <Link className="rnk-button" to="/app/settings">
            設定を開く
          </Link>
          <Link className="rnk-button-secondary" to="/app/manual-credit">
            手動付与へ戻る
          </Link>
        </div>
      </div>
    </s-page>
  );
}
