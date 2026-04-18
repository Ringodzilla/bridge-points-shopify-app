import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import {
  buildCustomerSearchQuery,
  DEFAULT_SEGMENT_FILTERS,
  parsePreviewCustomers,
  validateSegmentFilters,
  type SegmentFilters,
} from "../lib/invite-jobs";
import {
  fetchInviteAudiencePreview,
  requireInviteJob,
  saveInvitePreview,
} from "../lib/invite-jobs.server";
import { authenticate } from "../shopify.server";

function toFilters(input: Partial<Record<keyof SegmentFilters, string>>) {
  return {
    tagInput: input.tagInput ?? DEFAULT_SEGMENT_FILTERS.tagInput,
    emailFilter:
      input.emailFilter === "all" ? "all" : DEFAULT_SEGMENT_FILTERS.emailFilter,
    purchaseFilter:
      input.purchaseFilter === "purchased" || input.purchaseFilter === "none"
        ? input.purchaseFilter
        : DEFAULT_SEGMENT_FILTERS.purchaseFilter,
    purchasedAfter: input.purchasedAfter ?? DEFAULT_SEGMENT_FILTERS.purchasedAfter,
  } satisfies SegmentFilters;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    throw redirect("/app/notifications/new");
  }

  const job = await requireInviteJob(session.shop, jobId);
  const filters = toFilters({
    tagInput: job.tagInput ?? undefined,
    emailFilter: job.emailFilter,
    purchaseFilter: job.purchaseFilter,
    purchasedAfter: job.purchasedAfter ?? undefined,
  });

  return {
    jobId: job.id,
    jobName: job.name,
    filters,
    segmentQuery: job.segmentQuery,
    previewCount: job.previewCount,
    previewPrecision: job.previewPrecision,
    sampleCustomers: parsePreviewCustomers(job.previewCustomersJson),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const jobId = String(formData.get("jobId") || "");

  if (!jobId) {
    return {
      formError: "対象ジョブが見つかりません。招待作成からやり直してください。",
      values: DEFAULT_SEGMENT_FILTERS,
      errors: {},
    };
  }

  await requireInviteJob(session.shop, jobId);

  const values = toFilters({
    tagInput: String(formData.get("tagInput") || ""),
    emailFilter: String(formData.get("emailFilter") || ""),
    purchaseFilter: String(formData.get("purchaseFilter") || ""),
    purchasedAfter: String(formData.get("purchasedAfter") || ""),
  });
  const errors = validateSegmentFilters(values);

  if (Object.keys(errors).length > 0) {
    return {
      formError: null,
      values,
      errors,
    };
  }

  try {
    const preview = await fetchInviteAudiencePreview(admin, values);

    await saveInvitePreview({
      jobId,
      shop: session.shop,
      filters: values,
      preview,
    });

    return redirect(`/app/review?jobId=${jobId}`);
  } catch (error) {
    return {
      formError: error instanceof Error ? error.message : "対象顧客の取得に失敗しました。",
      values,
      errors: {},
    };
  }
};

export default function SegmentsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionValues: SegmentFilters | undefined =
    actionData && "values" in actionData
      ? toFilters(
          actionData.values as Partial<Record<keyof SegmentFilters, string>>,
        )
      : undefined;
  const actionErrors =
    actionData && "errors" in actionData
      ? (actionData.errors as Partial<Record<keyof SegmentFilters, string>>)
      : undefined;
  const filters = actionValues ?? loaderData.filters;
  const errors = actionErrors;
  const segmentQuery =
    actionValues && !actionData?.formError
      ? buildCustomerSearchQuery(actionValues)
      : loaderData.segmentQuery || buildCustomerSearchQuery(filters);
  const sampleCustomers = loaderData.sampleCustomers;

  return (
    <s-page heading="対象顧客指定">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Step 2</span>
          <h1 className="rnk-title">customers query で招待対象を絞り込む</h1>
          <p className="rnk-subtitle">
            `customers` と `customersCount` を使って、対象件数と代表サンプルを先に保存します。
            本番招待は review で queued 化し、history から順次実行する構成です。
          </p>
        </section>

        <Form className="rnk-form" method="post">
          <input name="jobId" type="hidden" value={loaderData.jobId} />
          <h2>フィルタ入力</h2>
          <p className="rnk-muted" style={{ marginBottom: 14 }}>
            対象ジョブ: {loaderData.jobName}
          </p>
          {actionData?.formError ? (
            <p className="rnk-note" style={{ marginBottom: 16 }}>
              {actionData.formError}
            </p>
          ) : null}
          <div className="rnk-form-grid">
            <label className="rnk-field">
              <span className="rnk-label">顧客タグ</span>
              <input className="rnk-input" defaultValue={filters.tagInput} name="tagInput" />
            </label>
            <label className="rnk-field">
              <span className="rnk-label">メールアドレス</span>
              <select className="rnk-select" defaultValue={filters.emailFilter} name="emailFilter">
                <option value="present">ありのみ</option>
                <option value="all">条件なし</option>
              </select>
              {errors?.emailFilter ? (
                <span className="rnk-muted">{errors.emailFilter}</span>
              ) : null}
            </label>
            <label className="rnk-field">
              <span className="rnk-label">購入有無</span>
              <select
                className="rnk-select"
                defaultValue={filters.purchaseFilter}
                name="purchaseFilter"
              >
                <option value="purchased">購入あり</option>
                <option value="none">購入なし</option>
                <option value="all">条件なし</option>
              </select>
            </label>
            <label className="rnk-field">
              <span className="rnk-label">購入日条件</span>
              <input
                className="rnk-input"
                defaultValue={filters.purchasedAfter}
                name="purchasedAfter"
                type="date"
              />
              {errors?.purchasedAfter ? (
                <span className="rnk-muted">{errors.purchasedAfter}</span>
              ) : null}
            </label>
          </div>

          <div className="rnk-actions" style={{ marginTop: 16 }}>
            <button className="rnk-button" type="submit">
              対象件数を確認する
            </button>
            <Link className="rnk-button-secondary" to="/app/notifications/new">
              招待文面へ戻る
            </Link>
          </div>
        </Form>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>変換結果</h2>
            <pre className="rnk-code">{segmentQuery || "query 未生成"}</pre>
            <p className="rnk-muted" style={{ marginTop: 12 }}>
              この query を保存して、history で次バッチを実行するたびに同じ条件で `customers` を再取得します。
            </p>
          </article>

          <article className="rnk-card">
            <h2>対象件数プレビュー</h2>
            <div className="rnk-pill-row">
              <span className="rnk-pill" data-tone="success">
                対象件数 {loaderData.previewCount.toLocaleString("ja-JP")} 件
              </span>
              <span className="rnk-pill" data-tone="neutral">
                精度 {loaderData.previewPrecision}
              </span>
            </div>
            {sampleCustomers.length > 0 ? (
              <table className="rnk-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>メール</th>
                    <th>タグ</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.displayName}</td>
                      <td>{customer.email || "未設定"}</td>
                      <td>{customer.tags.join(", ") || "なし"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rnk-muted" style={{ marginTop: 12 }}>
                まだ対象プレビューを保存していません。条件を入力して確認してください。
              </p>
            )}
          </article>
        </section>

        <section className="rnk-card">
          <h2>次の導線</h2>
          <div className="rnk-actions">
            <Link className="rnk-button" to={`/app/review?jobId=${loaderData.jobId}`}>
              送信確認へ進む
            </Link>
            <Link className="rnk-button-secondary" to="/app/history">
              招待履歴を見る
            </Link>
          </div>
        </section>
      </div>
    </s-page>
  );
}
