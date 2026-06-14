import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

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

async function fetchCustomerSummary(customerId, cursor) {
  const searchParams = new URLSearchParams({
    customerId,
  });
  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  const response = await fetch(
    `/api/customer-details/store-credit-summary?${searchParams.toString()}`,
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
  const customerId = shopify.data.selected?.[0]?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pageInfo, setPageInfo] = useState({
    hasNextPage: false,
    nextCursor: null,
  });

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
        setTransactions(nextSummary.recentTransactions ?? []);
        setPageInfo(nextSummary.recentTransactionsPageInfo ?? { hasNextPage: false, nextCursor: null });
      } catch (fetchError) {
        if (!mounted) {
          return;
        }

        setSummary(null);
        setTransactions([]);
        setPageInfo({ hasNextPage: false, nextCursor: null });
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
  const manualCreditHref = summary?.customer?.email
    ? `/app/manual-credit?customerEmail=${encodeURIComponent(summary.customer.email)}`
    : "/app/manual-credit";
  const historyPolicy = summary?.recentHistoryPolicy;
  const shopStatus = summary?.shopStatus;
  const historyLines = useMemo(() => transactions ?? [], [transactions]);

  async function handleLoadMore() {
    if (!customerId || !pageInfo.nextCursor) {
      return;
    }

    try {
      setLoadingMore(true);
      setError("");
      const nextSummary = await fetchCustomerSummary(customerId, pageInfo.nextCursor);
      setSummary((current) => current ?? nextSummary);
      setTransactions((current) => [...current, ...(nextSummary.recentTransactions ?? [])]);
      setPageInfo(nextSummary.recentTransactionsPageInfo ?? { hasNextPage: false, nextCursor: null });
    } catch (fetchError) {
      setError(toReadableError(fetchError, "追加の履歴を取得できませんでした。"));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <s-admin-block heading="BridgePoint">
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
            <s-text>付与通貨設定: {currencyCode}</s-text>
            <s-text>
              手動付与の既定期限: {summary.settings?.manualDefaultExpiryDays ?? "365"} 日
            </s-text>
            <s-text>
              直近履歴: {historyPolicy?.pageSize ?? 20} 件ずつ / {historyPolicy?.retentionDays ?? 365} 日以内 / 新しい順
            </s-text>
            {!shopStatus?.newCustomerAccountsEnabled ? (
              <s-banner id="bridge-points-block-checkout-note" tone="warning">
                このストアでは New customer accounts が未有効です。BridgePoint で「貯める・管理する」は使えますが、
                checkout での Store Credit 利用は有効化後に利用できます。
              </s-banner>
            ) : null}

            {historyLines.map((transaction) => (
              <s-text key={transaction.id}>
                {formatDate(transaction.createdAt)} / {formatTransactionType(transaction.type)} /{" "}
                {formatMoney(transaction.amount)}
              </s-text>
            ))}

            {pageInfo.hasNextPage ? (
              <s-button onClick={handleLoadMore}>
                {loadingMore ? "履歴を読み込み中..." : "さらに 20 件を読み込む"}
              </s-button>
            ) : null}

            <s-button href={manualCreditHref}>手動付与ページを開く</s-button>
            <s-text>
              顧客詳細の More actions にある「BridgePoint 特別付与」から、この顧客へ直接ポイント付与できます。
            </s-text>
          </>
        ) : null}
      </s-stack>
    </s-admin-block>
  );
}
