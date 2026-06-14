import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  getConfiguredGrantCurrencyCode,
  getShopOperationalStatus,
  updateShopSettings,
} from "../lib/store-credit.server";
import { authenticate } from "../shopify.server";

type SettingsFormValues = {
  autoGrantEnabled: boolean;
  grantRateNumerator: string;
  grantRateDenominator: string;
  defaultGrantCurrencyCode: string;
  defaultExpiryDays: string;
  manualDefaultExpiryDays: string;
  operationsAlertEmail: string;
};

type SettingsFormErrors = Partial<Record<keyof SettingsFormValues | "form", string>>;

function normalizeCurrencyCode(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function isValidCurrencyCode(value: string) {
  return /^[A-Z]{3}$/.test(value);
}

function uniqueCurrencyCodes(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeCurrencyCode(value ?? ""))
        .filter((value) => isValidCurrencyCode(value)),
    ),
  );
}

function getCurrencyLabel(code: string) {
  try {
    const displayNames = new Intl.DisplayNames(["ja", "en"], {
      type: "currency",
    });
    return `${code} - ${displayNames.of(code) ?? code}`;
  } catch {
    return code;
  }
}

function getSupportedCurrencyCodes() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  return intlWithSupportedValues.supportedValuesOf?.("currency") ?? ["JPY", "USD", "EUR"];
}

function formatSavedAt(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function areSettingsFormValuesEqual(left: SettingsFormValues, right: SettingsFormValues) {
  return (
    left.autoGrantEnabled === right.autoGrantEnabled &&
    left.grantRateNumerator === right.grantRateNumerator &&
    left.grantRateDenominator === right.grantRateDenominator &&
    left.defaultGrantCurrencyCode === right.defaultGrantCurrencyCode &&
    left.defaultExpiryDays === right.defaultExpiryDays &&
    left.manualDefaultExpiryDays === right.manualDefaultExpiryDays &&
    left.operationsAlertEmail === right.operationsAlertEmail
  );
}

function buildCurrencyOptions(currentCurrencyCode: string, shopCurrency: string) {
  const supportedCurrencyCodes = getSupportedCurrencyCodes().map((code) =>
    normalizeCurrencyCode(code),
  );
  const recommendedCurrencyCodes = uniqueCurrencyCodes([
    currentCurrencyCode,
    shopCurrency,
    "JPY",
    "USD",
  ]);
  const recommendedSet = new Set(recommendedCurrencyCodes);
  const otherCurrencyCodes = supportedCurrencyCodes.filter((code) => !recommendedSet.has(code));

  return {
    recommendedCurrencyOptions: recommendedCurrencyCodes.map((code) => ({
      code,
      label: getCurrencyLabel(code),
    })),
    otherCurrencyOptions: otherCurrencyCodes.map((code) => ({
      code,
      label: getCurrencyLabel(code),
    })),
  };
}

function buildSettingsFormValues({
  autoGrantEnabled,
  grantRateNumerator,
  grantRateDenominator,
  defaultGrantCurrencyCode,
  defaultExpiryDays,
  manualDefaultExpiryDays,
  operationsAlertEmail,
}: {
  autoGrantEnabled: boolean;
  grantRateNumerator: number;
  grantRateDenominator: number;
  defaultGrantCurrencyCode: string;
  defaultExpiryDays: number;
  manualDefaultExpiryDays: number;
  operationsAlertEmail: string | null;
}): SettingsFormValues {
  return {
    autoGrantEnabled,
    grantRateNumerator: String(grantRateNumerator),
    grantRateDenominator: String(grantRateDenominator),
    defaultGrantCurrencyCode,
    defaultExpiryDays: String(defaultExpiryDays),
    manualDefaultExpiryDays: String(manualDefaultExpiryDays),
    operationsAlertEmail: operationsAlertEmail?.trim() ?? "",
  };
}

function isValidOptionalEmail(value: string) {
  if (!value.trim()) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parsePositiveInteger(value: string, fallbackLabel: string, max = 3650) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return {
      ok: false as const,
      error: `${fallbackLabel}は 1 から ${max} の整数で入力してください。`,
    };
  }

  return {
    ok: true as const,
    value: parsed,
  };
}

function validateSettingsForm(values: SettingsFormValues): SettingsFormErrors {
  const errors: SettingsFormErrors = {};

  if (!isValidCurrencyCode(values.defaultGrantCurrencyCode)) {
    errors.defaultGrantCurrencyCode = "通貨コードは 3 文字の ISO コードを選択してください。";
  }

  const grantRateNumerator = parsePositiveInteger(
    values.grantRateNumerator,
    "付与率の分子",
    100000,
  );
  if (!grantRateNumerator.ok) {
    errors.grantRateNumerator = grantRateNumerator.error;
  }

  const grantRateDenominator = parsePositiveInteger(
    values.grantRateDenominator,
    "付与率の分母",
    100000,
  );
  if (!grantRateDenominator.ok) {
    errors.grantRateDenominator = grantRateDenominator.error;
  }

  const defaultExpiryDays = parsePositiveInteger(values.defaultExpiryDays, "自動付与の期限日数");
  if (!defaultExpiryDays.ok) {
    errors.defaultExpiryDays = defaultExpiryDays.error;
  }

  const manualDefaultExpiryDays = parsePositiveInteger(
    values.manualDefaultExpiryDays,
    "手動付与の既定期限日数",
  );
  if (!manualDefaultExpiryDays.ok) {
    errors.manualDefaultExpiryDays = manualDefaultExpiryDays.error;
  }

  if (!isValidOptionalEmail(values.operationsAlertEmail)) {
    errors.operationsAlertEmail = "通知先メールアドレスの形式を確認してください。";
  }

  return errors;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [{ shopCurrency, grantCurrencyCode, settings }, shopStatus] = await Promise.all([
    getConfiguredGrantCurrencyCode({
      admin,
      shop: session.shop,
    }),
    getShopOperationalStatus(admin),
  ]);
  const currencyOptions = buildCurrencyOptions(grantCurrencyCode, shopCurrency);

  return {
    shopCurrency,
    shopStatus,
    initialValues: buildSettingsFormValues({
      autoGrantEnabled: settings.autoGrantEnabled,
      grantRateNumerator: settings.grantRateNumerator,
      grantRateDenominator: settings.grantRateDenominator,
      defaultGrantCurrencyCode: grantCurrencyCode,
      defaultExpiryDays: settings.defaultExpiryDays,
      manualDefaultExpiryDays: settings.manualDefaultExpiryDays,
      operationsAlertEmail: settings.operationsAlertEmail,
    }),
    ...currencyOptions,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [{ shopCurrency }, shopStatus] = await Promise.all([
    getConfiguredGrantCurrencyCode({
      admin,
      shop: session.shop,
    }),
    getShopOperationalStatus(admin),
  ]);
  const formData = await request.formData();
  const values: SettingsFormValues = {
    autoGrantEnabled: formData.get("autoGrantEnabled") === "on",
    grantRateNumerator: String(formData.get("grantRateNumerator") ?? "").trim(),
    grantRateDenominator: String(formData.get("grantRateDenominator") ?? "").trim(),
    defaultGrantCurrencyCode: normalizeCurrencyCode(formData.get("defaultGrantCurrencyCode")),
    defaultExpiryDays: String(formData.get("defaultExpiryDays") ?? "").trim(),
    manualDefaultExpiryDays: String(formData.get("manualDefaultExpiryDays") ?? "").trim(),
    operationsAlertEmail: String(formData.get("operationsAlertEmail") ?? "").trim(),
  };
  const errors = validateSettingsForm(values);

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values,
      shopCurrency,
      shopStatus,
    };
  }

  if (!shopStatus.singleCurrencySupported) {
    return {
      ok: false,
      errors: {
        form: `BridgePoint v1 は単一通貨ストアのみ対応です。現在の有効通貨: ${shopStatus.enabledPresentmentCurrencies.join(", ")}`,
      },
      values,
      shopCurrency,
      shopStatus,
    };
  }

  try {
    const saved = await updateShopSettings({
      shop: session.shop,
      settings: {
        autoGrantEnabled: values.autoGrantEnabled,
        grantRateNumerator: Number(values.grantRateNumerator),
        grantRateDenominator: Number(values.grantRateDenominator),
        defaultGrantCurrencyCode: values.defaultGrantCurrencyCode,
        defaultExpiryDays: Number(values.defaultExpiryDays),
        manualDefaultExpiryDays: Number(values.manualDefaultExpiryDays),
        operationsAlertEmail: values.operationsAlertEmail,
      },
    });

    return {
      ok: true,
      errors: {},
      savedAt: new Date().toISOString(),
      values: buildSettingsFormValues({
        autoGrantEnabled: saved.autoGrantEnabled,
        grantRateNumerator: saved.grantRateNumerator,
        grantRateDenominator: saved.grantRateDenominator,
        defaultGrantCurrencyCode:
          normalizeCurrencyCode(saved.defaultGrantCurrencyCode) ||
          values.defaultGrantCurrencyCode,
        defaultExpiryDays: saved.defaultExpiryDays,
        manualDefaultExpiryDays: saved.manualDefaultExpiryDays,
        operationsAlertEmail: saved.operationsAlertEmail,
      }),
      shopCurrency,
      shopStatus,
    };
  } catch (error) {
    return {
      ok: false,
      errors: {
        form:
          error instanceof Error
            ? error.message
            : "設定の保存中に予期しないエラーが発生しました。",
      },
      values,
      shopCurrency,
      shopStatus,
    };
  }
};

export default function SettingsPage() {
  const {
    initialValues,
    shopCurrency,
    shopStatus,
    recommendedCurrencyOptions,
    otherCurrencyOptions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const savedValues = actionData?.ok === true ? actionData.values : initialValues;
  const nextVisibleValues = actionData?.values ?? savedValues;
  const [formValues, setFormValues] = useState<SettingsFormValues>(nextVisibleValues);
  const errors: SettingsFormErrors = actionData?.errors ?? {};
  const success = actionData?.ok === true;
  const isSubmitting = navigation.state === "submitting";
  const savedAtLabel = formatSavedAt(actionData?.savedAt);
  const hasUnsavedChanges = !areSettingsFormValuesEqual(formValues, savedValues);
  const setupBlockedByMultiCurrency = !shopStatus.singleCurrencySupported;
  const flowGuardActive = !shopStatus.flowAppInstalled;
  const saveDisabled =
    isSubmitting || !hasUnsavedChanges || setupBlockedByMultiCurrency;

  useEffect(() => {
    setFormValues(nextVisibleValues);
  }, [nextVisibleValues]);

  function updateFormValue<Key extends keyof SettingsFormValues>(
    key: Key,
    value: SettingsFormValues[Key],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <s-page heading="設定">
      <div className="rnk-page">
        <section className="rnk-hero">
          <span className="rnk-eyebrow">BridgePoint</span>
          <h1 className="rnk-title">付与ルールの最小設定</h1>
          <p className="rnk-subtitle">
            v1 では、手動付与通貨、付与率、自動付与の既定期限、手動付与の既定期限だけを app 側で持ちます。
            自動付与通貨は常にショップ通貨へ固定し、手動付与だけ別通貨を選べるようにします。
          </p>
          <div className="rnk-pill-row">
            <span className="rnk-pill" data-tone="success">
              手動付与通貨: {formValues.defaultGrantCurrencyCode}
            </span>
            <span
              className="rnk-pill"
              data-tone={
                flowGuardActive
                  ? "warning"
                  : formValues.autoGrantEnabled
                    ? "success"
                    : "warning"
              }
            >
              自動付与テンプレート:{" "}
              {flowGuardActive
                ? "Flow 未設定"
                : formValues.autoGrantEnabled
                  ? "有効"
                  : "無効"}
            </span>
            <span className="rnk-pill" data-tone="neutral">
              ショップ通貨: {shopCurrency}
            </span>
            <span
              className="rnk-pill"
              data-tone={setupBlockedByMultiCurrency ? "danger" : "success"}
            >
              通貨診断: {setupBlockedByMultiCurrency ? "v1 対象外" : "単一通貨"}
            </span>
          </div>
        </section>

        {setupBlockedByMultiCurrency ? (
          <p className="rnk-note">
            このストアは複数通貨運用のため、BridgePoint v1 のセットアップをここで停止します。
            対処案: 単一通貨運用にそろえるか、複数通貨対応の v2 を待ってください。
          </p>
        ) : null}

        {flowGuardActive ? (
          <p className="rnk-note">
            Shopify Flow が未利用または未有効のため、自動付与設定はロックしています。まず
            `/app/flow-setup` で導入手順を確認し、Flow を利用できる状態にしてから有効化してください。
          </p>
        ) : null}

        {success ? (
          <p className="rnk-note">
            ShopSettings を更新しました。手動付与画面と customer details はこの手動付与通貨を参照し、
            Order paid 自動付与はショップ通貨を参照します。
          </p>
        ) : null}

        {errors?.form ? <p className="rnk-note">{errors.form}</p> : null}

        <Form className="rnk-form" method="post">
          <h2>付与通貨と自動付与</h2>

          <label className="rnk-field">
            <span className="rnk-label">手動付与通貨コード</span>
            <select
              className="rnk-select"
              value={formValues.defaultGrantCurrencyCode}
              name="defaultGrantCurrencyCode"
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                updateFormValue("defaultGrantCurrencyCode", nextValue);
              }}
            >
              <optgroup label="よく使う通貨">
                {recommendedCurrencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="その他の通貨">
                {otherCurrencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="rnk-muted">
              customer details と app 内の手動付与で使う通貨です。自動付与通貨は常にショップ通貨になります。
            </span>
            {errors?.defaultGrantCurrencyCode ? (
              <span className="rnk-muted">{errors.defaultGrantCurrencyCode}</span>
            ) : null}
          </label>

          <label className="rnk-checkbox" style={{ marginTop: 14 }}>
            <input name="autoGrantEnabled" type="hidden" value={formValues.autoGrantEnabled ? "on" : ""} />
            <input
              checked={formValues.autoGrantEnabled}
              disabled={flowGuardActive}
              name="autoGrantEnabled"
              type="checkbox"
              onChange={(event) => {
                const nextChecked = event.currentTarget.checked;
                updateFormValue("autoGrantEnabled", nextChecked);
              }}
            />
            <span>Flow 用の自動付与テンプレートを有効として扱う</span>
          </label>
          <p className="rnk-muted">
            {flowGuardActive
              ? "Shopify Flow の利用確認ができるまで、自動付与設定は変更できません。手動付与はそのまま利用できます。"
              : "Shopify Flow の実行確認が取れている前提で、この設定を自動付与テンプレートに反映します。"}
          </p>

          <h2 style={{ marginTop: 24 }}>付与率と期限</h2>
          <div className="rnk-form-grid">
            <label className="rnk-field">
              <span className="rnk-label">付与率の分子</span>
              <input
                className="rnk-input"
                value={formValues.grantRateNumerator}
                inputMode="numeric"
                name="grantRateNumerator"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  updateFormValue("grantRateNumerator", nextValue);
                }}
                placeholder="1"
              />
              <span className="rnk-muted">例: 1%</span>
              {errors?.grantRateNumerator ? (
                <span className="rnk-muted">{errors.grantRateNumerator}</span>
              ) : null}
            </label>

            <label className="rnk-field">
              <span className="rnk-label">付与率の分母</span>
              <input
                className="rnk-input"
                value={formValues.grantRateDenominator}
                inputMode="numeric"
                name="grantRateDenominator"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  updateFormValue("grantRateDenominator", nextValue);
                }}
                placeholder="100"
              />
              <span className="rnk-muted">例: 1/100 = 購入額の 1%</span>
              {errors?.grantRateDenominator ? (
                <span className="rnk-muted">{errors.grantRateDenominator}</span>
              ) : null}
            </label>
          </div>

          <div className="rnk-form-grid" style={{ marginTop: 14 }}>
            <label className="rnk-field">
              <span className="rnk-label">自動付与の既定期限日数</span>
              <input
                className="rnk-input"
                value={formValues.defaultExpiryDays}
                inputMode="numeric"
                name="defaultExpiryDays"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  updateFormValue("defaultExpiryDays", nextValue);
                }}
                placeholder="365"
              />
              {errors?.defaultExpiryDays ? (
                <span className="rnk-muted">{errors.defaultExpiryDays}</span>
              ) : null}
            </label>

            <label className="rnk-field">
              <span className="rnk-label">手動付与の既定期限日数</span>
              <input
                className="rnk-input"
                value={formValues.manualDefaultExpiryDays}
                inputMode="numeric"
                name="manualDefaultExpiryDays"
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  updateFormValue("manualDefaultExpiryDays", nextValue);
                }}
                placeholder="365"
              />
              {errors?.manualDefaultExpiryDays ? (
                <span className="rnk-muted">{errors.manualDefaultExpiryDays}</span>
              ) : null}
            </label>
          </div>

          <label className="rnk-field" style={{ marginTop: 14 }}>
            <span className="rnk-label">障害通知先メールアドレス</span>
            <input
              className="rnk-input"
              value={formValues.operationsAlertEmail}
              type="email"
              name="operationsAlertEmail"
              onChange={(event) => {
                updateFormValue("operationsAlertEmail", event.currentTarget.value);
              }}
              placeholder="ops@example.com"
            />
            <span className="rnk-muted">
              `PERMANENT` 障害の通知先として表示します。未設定時は app 内通知のみになります。
            </span>
            {errors?.operationsAlertEmail ? (
              <span className="rnk-muted">{errors.operationsAlertEmail}</span>
            ) : null}
          </label>

          <div className="rnk-actions" style={{ marginTop: 16 }}>
            <button className="rnk-button" disabled={saveDisabled} type="submit">
              {setupBlockedByMultiCurrency
                ? "単一通貨化が必要"
                : isSubmitting
                  ? "保存中..."
                  : hasUnsavedChanges
                    ? "保存する"
                    : "変更なし"}
            </button>
            <span
              className="rnk-pill"
              data-tone={
                setupBlockedByMultiCurrency
                  ? "danger"
                  : isSubmitting
                  ? "warning"
                  : hasUnsavedChanges
                    ? "warning"
                    : success
                      ? "success"
                      : "neutral"
              }
            >
              {isSubmitting
                ? "保存中..."
                : hasUnsavedChanges
                  ? "未保存の変更あり"
                  : success
                  ? `保存済み${savedAtLabel ? ` (${savedAtLabel})` : ""}`
                  : "現在の保存内容"}
            </span>
          </div>
          <p className="rnk-muted" style={{ marginTop: 10 }}>
            {setupBlockedByMultiCurrency
              ? `このストアでは ${shopStatus.enabledPresentmentCurrencies.join(", ")} が有効なため、v1 セットアップを保存できません。`
              : isSubmitting
              ? "ShopSettings を保存しています。完了するまで少し待ってください。"
              : hasUnsavedChanges
                ? "フォームに未保存の変更があります。内容を確認してから「保存する」を押してください。"
                : success
                ? `設定を保存しました。${savedAtLabel ? `${savedAtLabel} 時点の内容です。` : ""}`
                : "現在は保存済みの内容を表示しています。変更すると、ここに未保存ステータスを出します。"}
          </p>

          <p className="rnk-muted" style={{ marginTop: 10 }}>
            checkout 利用条件:{" "}
            {shopStatus.newCustomerAccountsEnabled
              ? "New customer accounts が有効です。Store Credit 利用条件を満たす方向です。"
              : "New customer accounts が未有効です。v1 でも「貯める・管理する」は使えますが、checkout 利用はこの有効化後です。"}
          </p>
        </Form>
      </div>
    </s-page>
  );
}
