import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import db from "../db.server";
import { INVITE_BATCH_SIZE } from "../lib/invite-jobs";
import {
  ensureLegacyCustomerAccounts,
  requireInviteBilling,
  runInviteJobBatch,
  syncInviteUsageBilling,
} from "../lib/invite-jobs.server";
import { authenticate } from "../shopify.server";

function getTone(status: string) {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "queued" || status === "running") {
    return "warning";
  }

  return "neutral";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await db.inviteJob.findMany({
    where: { shop: session.shop },
    include: {
      deliveries: {
        orderBy: { processedAt: "desc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    jobs: jobs.map((job) => ({
      id: job.id,
      createdAt: formatDate(job.createdAt),
      name: job.name,
      audience: `${job.previewCount.toLocaleString("ja-JP")} 件 / ${job.segmentQuery || "query 未保存"}`,
      status: job.status,
      tone: getTone(job.status),
      attemptedCount: job.attemptedCount,
      successCount: job.successCount,
      failureCount: job.failureCount,
      billedCount: job.billedCount,
      lastError: job.lastError,
      lastBillingError: job.lastBillingError,
      deliveries: job.deliveries.map((delivery) => ({
        id: delivery.id,
        displayName: delivery.displayName || "名称未設定",
        email: delivery.email || "未設定",
        status: delivery.status,
        errorMessage: delivery.errorMessage,
      })),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const jobId = String(formData.get("jobId") || "");

  if (!jobId) {
    return {
      formError: "対象ジョブが見つかりません。",
    };
  }

  try {
    await ensureLegacyCustomerAccounts(admin);
    await requireInviteBilling({
      billing,
      request,
      returnPath: `/app/history?jobId=${jobId}`,
    });

    const result = await runInviteJobBatch({
      admin,
      shop: session.shop,
      jobId,
    });
    const billingResult = await syncInviteUsageBilling({
      billing,
      shop: session.shop,
      jobId,
    });

    return {
      formError: null,
      summary: `${result.processedCount} 件を順次処理しました。成功 ${result.successCount} 件、失敗 ${result.failureCount} 件。${
        result.hasNextPage
          ? `次の ${INVITE_BATCH_SIZE} 件を続けて実行できます。`
          : "このジョブの処理は完了しました。"
      }`,
      billingSummary:
        billingResult.chargedCount > 0
          ? `usage billing を ${billingResult.chargedCount} 件分記録しました。`
          : billingResult.warning
            ? `招待送信は完了しましたが、usage billing 記録に失敗しました: ${billingResult.warning}`
            : "新規の usage billing 対象はありませんでした。",
    };
  } catch (error) {
    return {
      formError:
        error instanceof Error ? error.message : "招待ジョブの実行に失敗しました。",
    };
  }
};

export default function HistoryPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="招待履歴">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">History</span>
          <h1 className="rnk-title">queued した招待ジョブを、順次安全に流す</h1>
          <p className="rnk-subtitle">
            MVP の実行方式は background worker ではなく、履歴画面から 20 件ずつ順次送る方式です。
            失敗理由と進捗だけ先に見えるようにしています。
          </p>
        </section>

        {actionData?.formError ? (
          <section className="rnk-card">
            <p className="rnk-note">{actionData.formError}</p>
          </section>
        ) : null}

        {actionData?.summary ? (
          <section className="rnk-card">
            <p className="rnk-note">{actionData.summary}</p>
            {actionData.billingSummary ? (
              <p className="rnk-muted" style={{ marginTop: 10 }}>
                {actionData.billingSummary}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rnk-table-wrap">
          <h2>招待ジョブ一覧</h2>
          {jobs.length > 0 ? (
            <table className="rnk-table">
              <thead>
                <tr>
                  <th>作成日時</th>
                  <th>ジョブ名</th>
                  <th>条件サマリ</th>
                  <th>進捗</th>
                  <th>ステータス</th>
                  <th>実行</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.createdAt}</td>
                    <td>{job.name}</td>
                    <td>{job.audience}</td>
                    <td>
                      成功 {job.successCount} / 失敗 {job.failureCount} / 試行 {job.attemptedCount}
                      <br />
                      請求記録 {job.billedCount}
                    </td>
                    <td>
                      <span className="rnk-pill" data-tone={job.tone}>
                        {job.status}
                      </span>
                      {job.lastError ? (
                        <p className="rnk-muted" style={{ marginTop: 8 }}>
                          {job.lastError}
                        </p>
                      ) : null}
                      {job.lastBillingError ? (
                        <p className="rnk-muted" style={{ marginTop: 8 }}>
                          課金: {job.lastBillingError}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {(job.status === "queued" || job.status === "running") ? (
                        <Form method="post">
                          <input name="jobId" type="hidden" value={job.id} />
                          <button className="rnk-button-secondary" type="submit">
                            次の {INVITE_BATCH_SIZE} 件を実行
                          </button>
                        </Form>
                      ) : (
                        <Link
                          className="rnk-button-secondary"
                          to={`/app/review?jobId=${job.id}`}
                        >
                          詳細確認
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rnk-muted">
              まだ招待ジョブがありません。招待作成からジョブを作成してください。
            </p>
          )}
        </section>

        {jobs.some((job) => job.deliveries.length > 0) ? (
          <section className="rnk-card">
            <h2>直近の送信結果</h2>
            {jobs.flatMap((job) => job.deliveries).slice(0, 5).map((delivery) => (
              <p className="rnk-muted" key={delivery.id} style={{ marginBottom: 10 }}>
                {delivery.displayName} / {delivery.email} / {delivery.status}
                {delivery.errorMessage ? ` / ${delivery.errorMessage}` : ""}
              </p>
            ))}
          </section>
        ) : null}

        <section className="rnk-card">
          <h2>次に繋ぐ実装</h2>
          <ul className="rnk-list">
            <li>background worker へ切り出して自動連続実行する</li>
            <li>失敗した顧客だけを再送する</li>
            <li>legacy customer accounts の有効状態を事前チェックする</li>
          </ul>
          <div className="rnk-actions">
            <Link className="rnk-button" to="/app/billing">
              課金設計を確認
            </Link>
            <Link className="rnk-button-secondary" to="/app">
              ダッシュボードへ戻る
            </Link>
          </div>
        </section>
      </div>
    </s-page>
  );
}
