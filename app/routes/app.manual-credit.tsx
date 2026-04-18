import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import prisma from "../db.server";
import {
  buildManualGrantFormValues,
  DEFAULT_MANUAL_GRANT_FORM,
  validateManualGrantForm,
} from "../lib/store-credit";
import { getShopCurrency, issueManualStoreCredit } from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

function formatDate(value: string | null) {
  if (!value) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const initialValues = buildManualGrantFormValues({
    customerEmail: url.searchParams.get("customerEmail") ?? DEFAULT_MANUAL_GRANT_FORM.customerEmail,
  });
  const [shopCurrency, recentLogs] = await Promise.all([
    getShopCurrency(admin),
    prisma.manualGrantLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    initialValues,
    shopCurrency,
    recentLogs: recentLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
      expiresAt: log.expiresAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopCurrency = await getShopCurrency(admin);
  const formData = await request.formData();
  const values = {
    customerEmail: String(formData.get("customerEmail") || "").trim(),
    amount: String(formData.get("amount") || "").trim(),
    expiresInDays: String(formData.get("expiresInDays") || "").trim(),
    notifyCustomer: formData.get("notifyCustomer") === "on",
    reason: String(formData.get("reason") || "").trim(),
  };
  const errors = validateManualGrantForm(values);

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values,
      shopCurrency,
    };
  }

  try {
    await issueManualStoreCredit({
      admin,
      shop: session.shop,
      customerEmail: values.customerEmail,
      amount: values.amount,
      currencyCode: shopCurrency,
      expiresInDays: Number(values.expiresInDays),
      notifyCustomer: values.notifyCustomer,
      reason: values.reason,
    });
  } catch (error) {
    return {
      errors: {
        form:
          error instanceof Error
            ? error.message
            : "Store Credit の付与中に予期しないエラーが発生しました。",
      },
      values,
      shopCurrency,
    };
  }

  return redirect(
    `/app/manual-credit?success=1&customerEmail=${encodeURIComponent(values.customerEmail)}`,
  );
};

export default function ManualCreditPage() {
  const { initialValues, shopCurrency, recentLogs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const values = actionData?.values ?? initialValues;
  const errors = actionData?.errors;
  const activeCurrency = actionData?.shopCurrency ?? shopCurrency;
  const success = searchParams.get("success") === "1";

  return (
    <s-page heading="手動ポイント付与">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Bridge Points</span>
          <h1 className="rnk-title">Store Credit へ、まず 1 件だけ安全に付与できる状態を作る</h1>
          <p className="rnk-subtitle">
            この画面では顧客メールアドレスを起点に Store Credit を手動付与します。
            Bridge Points の最初の縦切りとして、付与実行、期限設定、通知、実行ログ保存までを先に通します。
          </p>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="success">
              通貨: {activeCurrency}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              実体は Shopify Store Credit
            </span>
          </div>
        </section>

        {success ? (
          <p className="rnk-note">
            Store Credit の手動付与に成功しました。下の履歴から、付与額と有効期限、transaction ID を確認できます。
          </p>
        ) : null}

        {errors?.form ? <p className="rnk-note">{errors.form}</p> : null}

        <Form className="rnk-form" method="post">
          <h2>手動付与フォーム</h2>
          <div className="rnk-form-grid">
            <label className="rnk-field">
              <span className="rnk-label">顧客メールアドレス</span>
              <input
                className="rnk-input"
                defaultValue={values.customerEmail}
                name="customerEmail"
                placeholder="customer@example.jp"
                type="email"
              />
              {errors?.customerEmail ? (
                <span className="rnk-muted">{errors.customerEmail}</span>
              ) : null}
            </label>

            <label className="rnk-field">
              <span className="rnk-label">付与額（{activeCurrency}）</span>
              <input
                className="rnk-input"
                defaultValue={values.amount}
                inputMode="decimal"
                name="amount"
                placeholder="100"
              />
              {errors?.amount ? <span className="rnk-muted">{errors.amount}</span> : null}
            </label>
          </div>

          <div className="rnk-form-grid" style={{ marginTop: 14 }}>
            <label className="rnk-field">
              <span className="rnk-label">有効期限日数</span>
              <input
                className="rnk-input"
                defaultValue={values.expiresInDays}
                inputMode="numeric"
                name="expiresInDays"
                placeholder="365"
              />
              {errors?.expiresInDays ? (
                <span className="rnk-muted">{errors.expiresInDays}</span>
              ) : null}
            </label>

            <label className="rnk-field">
              <span className="rnk-label">理由メモ</span>
              <input
                className="rnk-input"
                defaultValue={values.reason}
                name="reason"
                placeholder="移行対応の特別ポイント付与"
              />
              {errors?.reason ? <span className="rnk-muted">{errors.reason}</span> : null}
            </label>
          </div>

          <label
            className="rnk-field"
            style={{ marginTop: 14, gridTemplateColumns: "auto 1fr", alignItems: "center" }}
          >
            <input
              defaultChecked={values.notifyCustomer}
              name="notifyCustomer"
              type="checkbox"
            />
            <span className="rnk-label">顧客へ通知する</span>
          </label>

          <div className="rnk-actions" style={{ marginTop: 16 }}>
            <button className="rnk-button" type="submit">
              Store Credit を付与する
            </button>
          </div>
        </Form>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>この縦切りで確認できること</h2>
            <ul className="rnk-list">
              <li>顧客メールアドレスから customer を解決できる</li>
              <li>`storeCreditAccountCredit` を使って credit transaction を作成できる</li>
              <li>`expiresAt` と `notify` を指定して付与できる</li>
              <li>アプリ DB に手動付与ログを残せる</li>
            </ul>
          </article>

          <article className="rnk-card">
            <h2>まだ未対応のこと</h2>
            <ul className="rnk-list">
              <li>Flow による注文起点の自動付与</li>
              <li>ストア全体 KPI のリアルタイム集計</li>
              <li>複数通貨ストア向けの詳細最適化</li>
              <li>ポイント付与ルールを設定画面から編集すること</li>
            </ul>
          </article>
        </section>

        <section className="rnk-table-wrap">
          <h2 style={{ marginTop: 0 }}>直近の手動付与ログ</h2>
          {recentLogs.length === 0 ? (
            <p className="rnk-muted">まだ手動付与ログはありません。</p>
          ) : (
            <table className="rnk-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>顧客</th>
                  <th>付与額</th>
                  <th>有効期限</th>
                  <th>通知</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>
                      <strong>{log.customerDisplayName || "名前未設定"}</strong>
                      <br />
                      <span className="rnk-muted">{log.customerEmail}</span>
                    </td>
                    <td>
                      {log.amount} {log.currencyCode}
                      <br />
                      <span className="rnk-muted">残高: {log.balanceAfterAmount ?? "-"} </span>
                    </td>
                    <td>{formatDate(log.expiresAt)}</td>
                    <td>{log.notifyCustomer ? "あり" : "なし"}</td>
                    <td>
                      {log.reason || "-"}
                      <br />
                      <span className="rnk-muted">{log.storeCreditTxnId ?? "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </s-page>
  );
}
