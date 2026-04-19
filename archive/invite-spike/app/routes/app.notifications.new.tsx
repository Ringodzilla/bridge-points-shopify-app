import type { ActionFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData } from "react-router";
import { DEFAULT_INVITE_DRAFT, validateInviteDraft } from "../lib/invite-jobs";
import { createInviteDraft } from "../lib/invite-jobs.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const input = {
    name: String(formData.get("name") || ""),
    subject: String(formData.get("subject") || ""),
    body: String(formData.get("body") || ""),
    customMessage: String(formData.get("customMessage") || ""),
    from: String(formData.get("from") || ""),
  };
  const errors = validateInviteDraft(input);

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values: input,
    };
  }

  const job = await createInviteDraft({
    shop: session.shop,
    ...input,
  });

  return redirect(`/app/segments?jobId=${job.id}`);
};

export default function NotificationNewPage() {
  const actionData = useActionData<typeof action>();
  const values = actionData?.values ?? DEFAULT_INVITE_DRAFT;
  const errors = actionData?.errors;

  return (
    <s-page heading="招待作成">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">Step 1</span>
          <h1 className="rnk-title">アカウント招待文面の骨格を先に固める</h1>
          <p className="rnk-subtitle">
            MVP では `customerSendAccountInviteEmail` の入力に合わせて、件名、本文、
            補足メッセージ、差出人メールアドレスだけに絞ります。差し込み変数はまだ未実装です。
          </p>
        </section>

        <Form className="rnk-form" method="post">
          <h2>招待ドラフト</h2>
          {errors ? (
            <p className="rnk-note" style={{ marginBottom: 16 }}>
              入力内容を見直してください。MVP では固定文面のみ対応しています。
            </p>
          ) : null}
          <div className="rnk-form-grid">
            <label className="rnk-field">
              <span className="rnk-label">招待ジョブ名</span>
              <input
                className="rnk-input"
                defaultValue={values.name}
                name="name"
              />
              {errors?.name ? <span className="rnk-muted">{errors.name}</span> : null}
            </label>
            <label className="rnk-field">
              <span className="rnk-label">件名</span>
              <input
                className="rnk-input"
                defaultValue={values.subject}
                name="subject"
              />
              {errors?.subject ? <span className="rnk-muted">{errors.subject}</span> : null}
            </label>
          </div>

          <div className="rnk-form-grid" style={{ marginTop: 14 }}>
            <label className="rnk-field">
              <span className="rnk-label">本文</span>
              <textarea
                className="rnk-textarea"
                defaultValue={values.body}
                name="body"
              />
              {errors?.body ? <span className="rnk-muted">{errors.body}</span> : null}
            </label>
            <label className="rnk-field">
              <span className="rnk-label">補足メッセージ</span>
              <textarea
                className="rnk-textarea"
                defaultValue={values.customMessage}
                name="customMessage"
              />
              {errors?.customMessage ? (
                <span className="rnk-muted">{errors.customMessage}</span>
              ) : null}
            </label>
          </div>

          <div className="rnk-form-grid" style={{ marginTop: 14 }}>
            <label className="rnk-field">
              <span className="rnk-label">差出人メールアドレス（任意）</span>
              <input
                className="rnk-input"
                defaultValue={values.from}
                name="from"
                placeholder="support@example.jp"
                type="email"
              />
              {errors?.from ? <span className="rnk-muted">{errors.from}</span> : null}
            </label>
          </div>

          <div className="rnk-actions" style={{ marginTop: 16 }}>
            <button className="rnk-button" type="submit">
              対象顧客指定へ進む
            </button>
            <Link className="rnk-button-secondary" to="/app">
              ダッシュボードへ戻る
            </Link>
          </div>
        </Form>

        <section className="rnk-split">
          <article className="rnk-card">
            <h2>現段階の注意</h2>
            <div className="rnk-pill-row">
              <span className="rnk-pill" data-tone="warning">差し込み変数: 未実装</span>
              <span className="rnk-pill" data-tone="neutral">固定文面のみ</span>
            </div>
            <p className="rnk-muted" style={{ marginTop: 12 }}>
              Shopify 標準の招待メール基盤に合わせるため、まずは固定文面と補足メッセージだけを安全に送れる状態を優先します。
            </p>
          </article>

          <article className="rnk-card">
            <h2>プレビュー例</h2>
            <pre className="rnk-code">{`件名:
【ストア移行のお知らせ】新しい顧客アカウント有効化のお願い

本文:
いつもご利用ありがとうございます。

このたび Shopify への移行に伴い、新しい顧客アカウントをご利用いただけるようになりました。
この招待メールからアカウントを有効化のうえ、今後のご注文確認や会員情報の確認にご利用ください。`}</pre>
          </article>
        </section>
      </div>
    </s-page>
  );
}
