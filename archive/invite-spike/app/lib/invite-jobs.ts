import { SEND_UNIT_PRICE_JPY } from "./billing";

export type SegmentFilters = {
  tagInput: string;
  emailFilter: "present" | "all";
  purchaseFilter: "all" | "purchased" | "none";
  purchasedAfter: string;
};

export type PreviewCustomer = {
  id: string;
  displayName: string;
  email: string | null;
  tags: string[];
  numberOfOrders: number;
  state: string;
};

export const DEFAULT_INVITE_DRAFT = {
  name: "既存顧客一括招待 2026 春",
  subject: "【ストア移行のお知らせ】新しい顧客アカウント有効化のお願い",
  body:
    "いつもご利用ありがとうございます。\n\nこのたび Shopify への移行に伴い、新しい顧客アカウントをご利用いただけるようになりました。\nこの招待メールからアカウントを有効化のうえ、今後のご注文確認や会員情報の確認にご利用ください。",
  customMessage:
    "旧サイトをご利用いただいていたお客様向けのご案内です。ご不明点があればサポート窓口までご連絡ください。",
  from: "",
};

export const DEFAULT_SEGMENT_FILTERS: SegmentFilters = {
  tagInput: "replace-2026, vip",
  emailFilter: "present",
  purchaseFilter: "purchased",
  purchasedAfter: "2026-01-01",
};

export const INVITE_PREVIEW_LIMIT = 5;
export const INVITE_BATCH_SIZE = 20;

function stripUnsupportedTemplateTokens(value: string) {
  return value.includes("{{");
}

function sanitizeTag(value: string) {
  return value.replace(/['"]/g, " ").trim();
}

export function parseTagInput(tagInput: string) {
  return tagInput
    .split(",")
    .map((item) => sanitizeTag(item))
    .filter(Boolean);
}

export function validateInviteDraft(input: {
  name: string;
  subject: string;
  body: string;
  customMessage: string;
  from: string;
}) {
  const errors: Partial<Record<keyof typeof input, string>> = {};

  if (!input.name.trim()) {
    errors.name = "ジョブ名は必須です。";
  }

  if (!input.subject.trim()) {
    errors.subject = "件名は必須です。";
  }

  if (!input.body.trim()) {
    errors.body = "本文は必須です。";
  }

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && stripUnsupportedTemplateTokens(value)) {
      errors[key as keyof typeof input] =
        "差し込み変数はまだ未実装です。固定文面で入力してください。";
    }
  }

  return errors;
}

export function validateSegmentFilters(filters: SegmentFilters) {
  const errors: Partial<Record<keyof SegmentFilters, string>> = {};

  if (!filters.emailFilter) {
    errors.emailFilter = "メール条件を選択してください。";
  }

  if (filters.purchasedAfter && !/^\d{4}-\d{2}-\d{2}$/.test(filters.purchasedAfter)) {
    errors.purchasedAfter = "購入日は YYYY-MM-DD 形式で入力してください。";
  }

  return errors;
}

export function buildCustomerSearchQuery(filters: SegmentFilters) {
  const queryParts: string[] = [];
  const tags = parseTagInput(filters.tagInput);

  if (filters.emailFilter === "present") {
    queryParts.push("email:*");
  }

  for (const tag of tags) {
    queryParts.push(`tag:'${tag}'`);
  }

  if (filters.purchaseFilter === "purchased") {
    queryParts.push("orders_count:>0");
  }

  if (filters.purchaseFilter === "none") {
    queryParts.push("orders_count:0");
  }

  if (filters.purchasedAfter && filters.purchaseFilter !== "none") {
    queryParts.push(`order_date:>='${filters.purchasedAfter}'`);
  }

  return queryParts.join(" ").trim();
}

export function parsePreviewCustomers(value: string | null) {
  if (!value) {
    return [] as PreviewCustomer[];
  }

  try {
    return JSON.parse(value) as PreviewCustomer[];
  } catch {
    return [] as PreviewCustomer[];
  }
}

export function estimateInviteCharge(count: number) {
  return count * SEND_UNIT_PRICE_JPY;
}
