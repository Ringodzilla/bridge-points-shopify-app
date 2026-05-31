import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const DEFAULT_FORM = {
  amount: "100",
  expiresInDays: "365",
  notifyCustomer: true,
  reason: "移行対応の特別ポイント付与",
};

function buildDefaultForm(summary) {
  return {
    ...DEFAULT_FORM,
    expiresInDays: String(summary?.settings?.manualDefaultExpiryDays ?? DEFAULT_FORM.expiresInDays),
  };
}

export default async () => {
  render(<Extension />, document.body);
};

function formatMoney(money) {
  if (!money) {
    return "-";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: money.currencyCode,
    maximumFractionDigits: 2,
  }).format(Number(money.amount ?? 0));
}

async function fetchCustomerSummary(customerId) {
  const response = await fetch(
    `/api/customer-details/store-credit-summary?customerId=${encodeURIComponent(customerId)}`,
    {},
  );
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json?.error || "顧客の Store Credit 情報を取得できませんでした。");
  }

  return json;
}

async function submitManualGrant(payload) {
  const response = await fetch("/api/customer-details/manual-credit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorMessage = json.errors
      ? Object.values(json.errors).find(Boolean)
      : json.error;
    throw new Error(errorMessage || "Store Credit の付与に失敗しました。");
  }

  return json;
}

function toReadableError(error, fallbackMessage) {
  if (error instanceof Error && /failed to fetch/i.test(error.message)) {
    return "BridgePoint バックエンドへ接続できませんでした。`npm run dev:bridge` の起動状態を確認してください。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

function Extension() {
  const { close } = shopify;
  const customerId = shopify.data.selected?.[0]?.id ?? null;
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let mounted = true;

    if (!customerId) {
      setSummary(null);
      setError("顧客 ID を取得できませんでした。ページを再読み込みしてください。");
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      try {
        setLoading(true);
        setError("");
        const nextSummary = await fetchCustomerSummary(customerId);
        if (!mounted) {
          return;
        }

        setSummary(nextSummary);
        setForm((current) => ({
          ...buildDefaultForm(nextSummary),
          amount: current.amount,
          reason: current.reason,
        }));
      } catch (fetchError) {
        if (!mounted) {
          return;
        }

        setSummary(null);
        setError(toReadableError(fetchError, "顧客の Store Credit 情報を取得できませんでした。"));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [customerId]);

  const currencyCode =
    summary?.grantCurrencyCode ??
    summary?.account?.balance?.currencyCode ??
    summary?.shopCurrency ??
    "JPY";

  async function handleSubmit() {
    if (!customerId) {
      setError("顧客 ID を取得できませんでした。ページを再読み込みしてください。");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccessMessage("");
      const result = await submitManualGrant({
        customerId,
        customerEmail: summary?.customer?.email ?? "",
        amount: form.amount,
        expiresInDays: form.expiresInDays,
        notifyCustomer: form.notifyCustomer,
        reason: form.reason,
      });
      setSuccessMessage(
        `${formatMoney(result.transaction.amount)} を付与しました。現在残高は ${formatMoney(result.transaction.balance)} です。`,
      );

      const refreshedSummary = await fetchCustomerSummary(customerId);
      setSummary(refreshedSummary);
      setForm(buildDefaultForm(refreshedSummary));
    } catch (submitError) {
      setError(toReadableError(submitError, "Store Credit の付与に失敗しました。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <s-admin-action heading="BridgePoint 特別付与">
      <s-stack direction="block">
        <s-text type="strong">顧客へ特別ポイントを付与</s-text>

        {loading ? <s-text>Store Credit 情報を読み込んでいます...</s-text> : null}

        {summary ? (
          <>
            <s-text>
              対象顧客: {summary.customer.displayName || "名前未設定"} /{" "}
              {summary.customer.email || "メール未設定"}
            </s-text>
            <s-text>
              現在残高:{" "}
              {summary.account
                ? formatMoney(summary.account.balance)
                : formatMoney({ amount: "0", currencyCode })}
            </s-text>
            <s-text>付与通貨設定: {currencyCode}</s-text>
            <s-text>
              手動付与の既定期限: {summary.settings?.manualDefaultExpiryDays ?? DEFAULT_FORM.expiresInDays} 日
            </s-text>
          </>
        ) : null}

        {successMessage ? (
          <s-banner id="bridge-points-action-success" tone="success">
            {successMessage}
          </s-banner>
        ) : null}

        {error ? (
          <s-banner id="bridge-points-action-error" tone="critical">
            {error}
          </s-banner>
        ) : null}

        <s-text-field
          id="bridge-points-grant-amount"
          label={`付与額 (${currencyCode})`}
          value={form.amount}
          onInput={(event) =>
            setForm((current) => ({
              ...current,
              amount: event.currentTarget.value,
            }))
          }
        />

        <s-text-field
          id="bridge-points-grant-expiry-days"
          label="有効期限日数"
          value={form.expiresInDays}
          onInput={(event) =>
            setForm((current) => ({
              ...current,
              expiresInDays: event.currentTarget.value,
            }))
          }
        />

        <s-text-field
          id="bridge-points-grant-reason"
          label="理由メモ"
          value={form.reason}
          onInput={(event) =>
            setForm((current) => ({
              ...current,
              reason: event.currentTarget.value,
            }))
          }
        />

        <s-text>
          この操作は Shopify Store Credit に credit transaction を追加し、BridgePoint の手動付与ログにも残します。
        </s-text>
        <s-text>顧客通知メールは Shopify Store Credit API の制約により v1 では未対応です。</s-text>
      </s-stack>

      <s-button
        slot="primary-action"
        disabled={loading || submitting || !customerId}
        loading={submitting}
        onClick={handleSubmit}
      >
        付与する
      </s-button>
      <s-button slot="secondary-actions" onClick={() => close()}>
        閉じる
      </s-button>
    </s-admin-action>
  );
}
