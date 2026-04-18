import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { estimateInviteCharge, parsePreviewCustomers } from "../lib/invite-jobs";
import {
  ensureLegacyCustomerAccounts,
  getCustomerAccountsStatus,
  queueInviteJob,
  requireInviteJob,
} from "../lib/invite-jobs.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    throw redirect("/app/notifications/new");
  }

  const job = await requireInviteJob(session.shop, jobId);
  const customerAccounts = await getCustomerAccountsStatus(admin);

  return {
    jobId: job.id,
    jobName: job.name,
    status: job.status,
    subject: job.subject,
    body: job.body,
    customMessage: job.customMessage,
    from: job.from,
    previewCount: job.previewCount,
    previewPrecision: job.previewPrecision,
    segmentQuery: job.segmentQuery,
    sampleCustomers: parsePreviewCustomers(job.previewCustomersJson),
    estimate: estimateInviteCharge(job.previewCount),
    customerAccounts,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const jobId = String(formData.get("jobId") || "");

  if (!jobId) {
    return {
      formError: "対象ジョブが見つかりません。招待作成からやり直してください。",
    };
  }

  try {
    await ensureLegacyCustomerAccounts(admin);
    await queueInviteJob(session.shop, jobId);
  } catch (error) {
    return {
      formError:
        error instanceof Error ? error.message : "ジョブの queued 化に失敗しました。",
    };
  }

  return redirect(`/app/history?jobId=${jobId}`);
};

export default function ReviewPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="送信確認">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Step 3</span>
          <h1 className="rnk-title">queued 化の前に、件数と文面を固定する</h1>
          <p className="rnk-subtitle">
            この画面では preview 結果と招待文面を固定し、history で順次処理できるジョブへ変換します。
            まだ background worker は入れず、最小限の実運用動線を優先します。
          </p>
        </section>

        <section className="rnk-grid">
          <article className="rnk-card">
            <span className="rnk-eyebrow">Audience</span>
            <h2>対象件数</h2>
            <p className="rnk-kpi">{data.previewCount.toLocaleString("ja-JP")} 件</p>
            <p className="rnk-muted">精度: {data.previewPrecision}</p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Subject</span>
            <h2>件名</h2>
            <p className="rnk-note">{data.subject}</p>
          </article>
          <article className="rnk-card">
            <span className="rnk-eyebrow">Billing</span>
            <h2>概算従量</h2>
            <p className="rnk-kpi">約 ¥{data.estimate.toLocaleString("ja-JP")}</p>
            <p className="rnk-muted">1 件あたり 10 円の前提表示です。</p>
          </article>
        </section>

        <section className="rnk-card">
          <h2>Shopify 前提条件</h2>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="warning">
              legacy customer accounts: {data.customerAccounts.legacyCustomerAccountsEnabled ? "有効" : "未対応"}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              account version: {data.customerAccounts.version}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              現在ステータス: {data.status}
            </span>
          </div>
          {!data.customerAccounts.legacyCustomerAccountsEnabled ? (
            <p className="rnk-note" style={{ marginTop: 16 }}>
              このストアは new customer accounts です。Shopify 管理画面で legacy customer accounts に切り替えるまで queued 化をブロックします。
            </p>
          ) : null}
        </section>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>保存済み query</h2>
            <pre className="rnk-code">{data.segmentQuery || "未保存"}</pre>
          </article>
          <article className="rnk-card">
            <h2>本文プレビュー</h2>
            <pre className="rnk-code">{`${data.body}\n\n${data.customMessage || ""}`.trim()}</pre>
            {data.from ? (
              <p className="rnk-muted" style={{ marginTop: 12 }}>
                差出人メールアドレス: {data.from}
              </p>
            ) : null}
          </article>
        </section>

        <section className="rnk-table-wrap">
          <h2>代表サンプル顧客</h2>
          {data.sampleCustomers.length > 0 ? (
            <table className="rnk-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>メール</th>
                  <th>購買回数</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {data.sampleCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.displayName}</td>
                    <td>{customer.email || "未設定"}</td>
                    <td>{customer.numberOfOrders}</td>
                    <td>{customer.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rnk-muted">まだ対象顧客プレビューがありません。</p>
          )}
        </section>

        <section className="rnk-card">
          <h2>この段階のステータス</h2>
          {actionData?.formError ? (
            <p className="rnk-note" style={{ marginBottom: 16 }}>
              {actionData.formError}
            </p>
          ) : null}
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="success">対象件数 preview: Ready</span>
            <span className="rnk-pill" data-tone="success">queued 化: Ready</span>
            <span className="rnk-pill" data-tone="warning">背景ジョブ: 未実装</span>
          </div>
          <div className="rnk-actions" style={{ marginTop: 16 }}>
            <Form method="post">
              <input name="jobId" type="hidden" value={data.jobId} />
              <button className="rnk-button" type="submit">
                履歴へ送り、実行準備を完了する
              </button>
            </Form>
            <Link className="rnk-button-secondary" to={`/app/segments?jobId=${data.jobId}`}>
              対象顧客へ戻る
            </Link>
          </div>
        </section>
      </div>
    </s-page>
  );
}
