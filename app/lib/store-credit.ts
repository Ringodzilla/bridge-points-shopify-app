export const DEFAULT_MANUAL_EXPIRY_DAYS = 365;
export const MANUAL_GRANT_MAX_AMOUNT = 10_000;
export const MANUAL_GRANT_DAILY_CUSTOMER_LIMIT = 20_000;

export const DEFAULT_MANUAL_GRANT_FORM = {
  customerEmail: "",
  amount: "100",
  expiresInDays: String(DEFAULT_MANUAL_EXPIRY_DAYS),
  notifyCustomer: false,
  reason: "移行対応の特別ポイント付与",
};

export type ManualGrantFormValues = typeof DEFAULT_MANUAL_GRANT_FORM;

export type ManualGrantFormErrors = Partial<
  Record<keyof ManualGrantFormValues | "form", string>
>;

export function buildManualGrantFormValues(
  overrides: Partial<ManualGrantFormValues> = {},
): ManualGrantFormValues {
  return {
    customerEmail: overrides.customerEmail?.trim() ?? DEFAULT_MANUAL_GRANT_FORM.customerEmail,
    amount: overrides.amount?.trim() ?? DEFAULT_MANUAL_GRANT_FORM.amount,
    expiresInDays:
      overrides.expiresInDays?.trim() ?? DEFAULT_MANUAL_GRANT_FORM.expiresInDays,
    notifyCustomer:
      overrides.notifyCustomer ?? DEFAULT_MANUAL_GRANT_FORM.notifyCustomer,
    reason: overrides.reason?.trim() ?? DEFAULT_MANUAL_GRANT_FORM.reason,
  };
}

export function validateManualGrantForm(
  values: ManualGrantFormValues,
): ManualGrantFormErrors {
  const errors: ManualGrantFormErrors = {};

  if (!values.customerEmail.trim()) {
    errors.customerEmail = "顧客メールアドレスを入力してください。";
  }

  const parsedAmount = Number(values.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errors.amount = "付与額は 0 より大きい数値で入力してください。";
  } else if (parsedAmount > MANUAL_GRANT_MAX_AMOUNT) {
    errors.amount = `付与額は 1 回あたり ${MANUAL_GRANT_MAX_AMOUNT.toLocaleString("ja-JP")} までです。`;
  }

  const parsedDays = Number(values.expiresInDays);
  if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
    errors.expiresInDays = "有効期限日数は 1 から 3650 の整数で入力してください。";
  }

  if (values.reason.length > 200) {
    errors.reason = "理由メモは 200 文字以内で入力してください。";
  }

  return errors;
}
