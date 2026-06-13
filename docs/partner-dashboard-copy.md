# BridgePoint Partner Dashboard 入力ドラフト

最終更新: 2026-05-16

この文書は Partner Dashboard の以下入力欄にそのまま転記しやすいように整理したドラフトです。

- Protected customer data request
- Data protection details
- review 補足説明

## 1. Protected customer data request

### Partner Dashboard path

```text
Apps > BridgePoint > API access requests > Protected customer data access > Request access
```

Before this request can be submitted, the app distribution method must be selected in Partner Dashboard.

### Request scope / fields

BridgePoint should request Level 2 access because it uses customer email/name in merchant-facing admin workflows.

- Protected customer data
- Customer object / customer-linked records needed for Store Credit workflows
- Protected customer fields: Name, Email

Do not request Address or Phone for v1. The app does not need them.

### Reason for access

```text
BridgePoint needs limited customer-linked data to show Shopify Store Credit balances and recent transaction history inside Shopify admin, let merchants manually grant store credit from the customer details page, and process order-paid automatic grants. BridgePoint uses Shopify Store Credit as the source of truth and stores only the minimum supporting settings, manual grant logs, and duplicate-execution keys needed to operate safely.
```

### Shorter fallback copy

```text
BridgePoint needs customer-linked data to display Store Credit balances, show recent history, grant Store Credit from Shopify admin, and prevent duplicate order-paid grants.
```

### Evidence in this repository

- Access scopes: `shopify.app.bridgepoint.toml`
- Customer details block/action: `extensions/bridge-points-customer-block`, `extensions/bridge-points-customer-action`
- Store Credit Admin GraphQL usage: `app/lib/store-credit.server.ts`
- Privacy/compliance webhook handlers: `app/routes/webhooks.customers.data_request.tsx`, `app/routes/webhooks.customers.redact.tsx`, `app/routes/webhooks.shop.redact.tsx`
- Data minimization policy: `docs/data-retention.md`, `docs/security-controls.md`

## 2. Data protection details

Partner Dashboard での回答候補です。`推奨回答` は BridgePoint の現在方針に沿っていますが、`前提` に書いた運用条件が実際に満たせることを確認してから送信してください。

| 項目 | 推奨回答 | 前提 / 補足 |
| --- | --- | --- |
| マーチャントに価値を提供するために必要な最低限の個人データを処理していますか？ | Yes | Store Credit を Shopify 正本に寄せ、アプリ DB には設定・補助ログ・重複防止キーのみ保持する前提です。 |
| マーチャントには処理する個人データとその処理目的を伝えていますか？ | Yes | Privacy Policy と listing の説明文、必要なら onboarding 文言を公開している前提です。 |
| 個人データの使用をその目的に限定していますか？ | Yes | 用途は残高表示、手動付与、自動付与、ログ、サポートに限定します。 |
| マーチャントとプライバシーおよびデータ保護に関する契約を締結していますか？ | Yes | Terms of Service / Privacy Policy を listing から参照可能にし、運用上その内容に従う前提です。 |
| お客様の同意に関する意思決定を尊重し、適用していますか？ | Yes | BridgePoint 自体は顧客向け独自マーケティング配信を行わず、Shopify / merchant 側の同意状態を上書きしません。 |
| データの売却をオプトアウトするお客様の意思決定を尊重し、適用していますか？ | N/A | 個人データの売却を行わない前提です。 |
| 自動化された意思決定に個人データを使用し、その決定が法的または重大な影響を及ぼす場合、お客様はオプトアウトできますか？ | N/A | BridgePoint の自動処理は store credit 付与であり、法的または重大な影響を及ぼす自動意思決定を行いません。 |
| 個人データが必要以上に長く保管されないようにするための保管期間を定めていますか？ | Yes | 下の retention schedule を採用する前提です。 |
| 保存時や転送時のデータを暗号化していますか？ | Yes | 本番環境で HTTPS/TLS と、保存先 DB の暗号化またはホスティング事業者の at-rest encryption を使う前提です。 |
| データのバックアップを暗号化していますか？ | Yes | 本番バックアップが暗号化されるインフラを採用する前提です。 |
| テストデータと本番環境データは区別していますか？ | Yes | dev store / test DB / production DB を分離運用する前提です。 |
| データ損失の防止策をとっていますか？ | Yes | DB バックアップと restore 手順を持つ前提です。 |
| スタッフが顧客の個人データにアクセスすることを制限していますか？ | Yes | 運用担当者を必要最小限に絞り、ホスティング / DB の権限管理を使う前提です。 |
| スタッフのパスワードに強力なパスワードを要求していますか？ | Yes | Google / GitHub / hosting / database のアカウントで MFA と強い認証を強制する前提です。 |
| 個人データへのアクセスを記録していますか？ | Yes | ホスティング / DB provider / Shopify / application logs の監査ログを有効にする前提です。 |
| セキュリティ事象への対応ポリシーがありますか？ | Yes | `docs/incident-response.md` の手順を運用に乗せる前提です。 |

### Data protection details summary

```text
BridgePoint processes the minimum customer-linked data required to display Shopify Store Credit balances, show recent Store Credit history, grant Store Credit from Shopify admin, process order-paid automatic grants, prevent duplicate execution, and support merchant troubleshooting. The app does not sell personal data, does not use customer data for unrelated advertising or profiling, and does not maintain a separate customer balance ledger. Shopify Store Credit remains the source of truth.
```

### Operational controls summary

```text
Production uses HTTPS/TLS, a production Supabase Postgres database separate from local development, encrypted managed infrastructure, limited operator access, Shopify privacy/compliance webhooks, and incident response procedures. Manual grant logs and duplicate-execution keys are retained only for operational, support, billing reconciliation, and audit needs.
```

### Retention schedule

- ShopSettings: アプリ導入中は保持。アンインストール後はサポート・法令対応を除き削除対象。
- ManualGrantLog: サポート・不正調査・課金照合のため最大 24 か月を目安に保持。
- GrantExecutionLock: 重複防止と監査のため 400 日保持。
- Shopify 由来の正本残高: Shopify Store Credit が正本。BridgePoint 側に独自残高 ledger は持たない。

## 3. Security / operations summary

```text
BridgePoint uses Shopify Store Credit as the source of truth for balances and stores only the minimum supporting settings, logs, and duplicate-execution keys needed to operate safely. Customer-linked data is processed only to display balances, show recent transaction history, grant store credit from Shopify admin, prevent duplicate grant execution, and support merchant-facing billing and troubleshooting. Production deployments must use HTTPS/TLS, separate production and test environments, restricted operator access, encrypted backups, and provider audit logs.
```

## 4. Reviewer note

```text
BridgePoint is a lightweight store-credit-based points app for merchants who want a simple bridge before adopting a full-scale loyalty platform. The app is embedded in Shopify admin, uses Shopify Store Credit as the source of truth, and avoids maintaining a separate customer balance ledger.
```

## 5. Submission status

As of 2026-05-16, the local code and configuration are ready for this Partner Dashboard step. The remaining action is browser-side submission in Partner Dashboard by an authenticated app owner.
