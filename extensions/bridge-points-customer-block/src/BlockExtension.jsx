import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

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

function formatDate(value) {
  if (!value) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTransactionType(type) {
  switch (type) {
    case "credit":
      return "付与";
    case "debit":
      return "利用";
    case "expiration":
      return "失効";
    case "debit_revert":
      return "利用取消";
    default:
      return "不明";
  }
}

async function fetchCustomerSummary(customerId) {
  const response = await fetch(
    `/api/customer-details/store-credit-summary?customerId=${encodeURIComponent(customerId)}`,
  );
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || "顧客の Store Credit 情報を取得できませんでした。");
  }

  return json;
}

function Extension() {
  const customerId = shopify.data.selected?.[0]?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      } catch (fetchError) {
        if (!mounted) {
          return;
        }

        setSummary(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "顧客の Store Credit 情報を取得できませんでした。",
        );
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

  const currencyCode = summary?.account?.balance?.currencyCode ?? summary?.shopCurrency ?? "JPY";
  const manualCreditHref = summary?.customer?.email
    ? `/app/manual-credit?customerEmail=${encodeURIComponent(summary.customer.email)}`
    : "/app/manual-credit";

  return (
    <s-admin-block heading="Bridge Points">
      <s-stack direction="block">
        <s-text type="strong">顧客ポイント概要</s-text>

        {loading ? <s-text>Store Credit 情報を読み込んでいます...</s-text> : null}

        {error ? (
          <s-banner id="bridge-points-block-error" tone="critical">
            {error}
          </s-banner>
        ) : null}

        {summary ? (
          <>
            <s-text>
              現在残高:{" "}
              {summary.account
                ? formatMoney(summary.account.balance)
                : formatMoney({ amount: "0", currencyCode })}
            </s-text>
            <s-text>
              失効予定残高:{" "}
              {summary.account
                ? formatMoney(summary.account.expiringBalance)
                : formatMoney({ amount: "0", currencyCode })}
            </s-text>
            <s-text>
              次回失効:{" "}
              {summary.nextExpiration
                ? `${formatDate(summary.nextExpiration.expiresAt)} / ${formatMoney(summary.nextExpiration.remainingAmount)}`
                : "予定なし"}
            </s-text>
            <s-text>
              顧客: {summary.customer.displayName || "名前未設定"} /{" "}
              {summary.customer.email || "メール未設定"}
            </s-text>

            {summary.recentTransactions.slice(0, 3).map((transaction) => (
              <s-text key={transaction.id}>
                {formatDate(transaction.createdAt)} / {formatTransactionType(transaction.type)} /{" "}
                {formatMoney(transaction.amount)}
              </s-text>
            ))}

            <s-button href={manualCreditHref}>手動付与ページを開く</s-button>
            <s-text>
              顧客詳細の More actions にある「Bridge Points 特別付与」から、この顧客へ直接ポイント付与できます。
            </s-text>
          </>
        ) : null}
      </s-stack>
    </s-admin-block>
  );
}
