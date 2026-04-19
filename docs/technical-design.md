# Bridge Points 技術設計書

## 1. 現状と方針

- 現在のコードベースは `一括招待くん` 用の spike が残っている
- `customerSendAccountInviteEmail` は legacy customer accounts 前提であり、新規ストアでは前提が崩れる
- Bridge Points では Store Credit を正本に寄せ、現行 Shopify に素直に乗る

設計方針:

- 残高は Shopify に持たせる
- アプリ DB は設定と補助ログだけに絞る
- 自動付与は Flow を主軸にし、アプリは可視化と手動運用を担う
- まずは壊れない最小構成を優先する

## 2. 全体アーキテクチャ

### 2.1 構成要素

- App Home
  - KPI ダッシュボード
  - 設定画面
- Admin UI Extension
  - 顧客詳細ブロック
  - 手動付与アクション
- Admin GraphQL API
  - Store Credit 付与
  - 顧客残高 / 取引履歴取得
- Shopify Flow
  - Order paid 起点の自動付与
  - 任意で customer created / customer tagged 起点の付与
- App DB
  - 設定
  - 手動付与ログ
  - 補助ログ

### 2.2 正本の境界

- 正本:
  - `StoreCreditAccount`
  - `StoreCreditAccountTransaction`
- 補助:
  - `ShopSettings`
  - `ManualGrantLog`
  - `AppEventLog`
  - 自動付与の idempotency 情報

### 2.3 期限リセットの再定義

- v1 では既存 transaction の期限更新をしない
- 対象アクション時に、新しい `credit transaction` を発行する
- expiration は Shopify の自動 transaction に委ねる

## 3. 画面一覧

## 3.1 App Home `/app`

目的:

- ストア全体の KPI を把握する
- 設定と運用導線を集約する

主要セクション:

- KPI カード
  - 総残高
  - 今月の付与額
  - 今月の利用額
  - 今月の失効額
- 月次サマリー
  - 先月 / 今月比較
- 失効予定サマリー
  - 7 日以内
  - 30 日以内
- 直近手動付与
- Flow セットアップ状況
- 設定ショートカット

利用する App Home パターン:

- Homepage template
- Metrics card composition

## 3.2 設定画面 `/app/settings`

目的:

- 付与率と有効期限を最小限で管理する

入力項目:

- 自動付与 ON/OFF
- 付与率
- 付与基準金額
- デフォルト有効期限日数
- 手動付与デフォルト期限
- ウェルカム付与 ON/OFF
- タグ起点付与 ON/OFF

## 3.3 顧客詳細ブロック `admin.customer-details.block.render`

目的:

- 顧客単位の残高と直近履歴をその場で確認する

表示項目:

- 現在残高
- 次回失効日
- 失効予定残高
- 直近 20 件の transaction
- 手動付与ボタン

## 3.4 顧客詳細アクション `admin.customer-details.action.render`

目的:

- 顧客ごとの手動付与を modal で安全に実行する

入力項目:

- 付与額
- 有効期限日数または日時
- 理由メモ
- 顧客への通知 ON/OFF

備考:

- ブロック内フォームだけで済ませず、実行は action modal に寄せる
- 誤操作防止と確認導線を優先する

## 4. API 一覧

## 4.1 Shopify Admin GraphQL

### 残高付与

- `storeCreditAccountCredit`
  - 用途: 自動付与、手動付与
  - 主入力:
    - `id`
    - `creditInput.creditAmount`
    - `creditInput.expiresAt`
    - `creditInput.notify`

補足:

- `id` には customer ID も渡せる
- 対象通貨の account が無ければ自動作成される

### 顧客別残高取得

- `customer(id) { storeCreditAccounts { ... } }`
  - 用途: 顧客詳細表示
- `storeCreditAccount(id)`
  - 用途: balance / transactions / expirable credit 取得

### 顧客別履歴取得

- `storeCreditAccount.transactions`
  - 用途:
    - 直近履歴
    - 失効予定 credit
    - 失効 transaction 表示
  - 代表 filter:
    - `type:credit AND expires_at:*`
    - `type:expiration`

### 顧客取得

- `customer(id)`
  - 顧客詳細ブロック / 手動付与対象の顧客名表示に使用

## 4.2 アプリ backend route 一覧

### App Home

- `GET /app`
  - KPI と最新ログの表示
- `GET /app/settings`
  - 現在設定の表示
- `POST /app/settings`
  - 設定保存

### 顧客向け補助 API

- `GET /api/customers/:customerId/store-credit-summary`
  - balance
  - next expiration
  - expirable buckets
  - latest transactions
- `POST /api/customers/:customerId/manual-credit`
  - 手動付与を実行
  - 手動付与ログを保存

### ログ / 集計 API

- `GET /api/dashboard/summary`
  - KPI カード用集計
- `GET /api/dashboard/trends`
  - 月次 / 30 日推移

## 4.3 現時点で使わない API

- `customerSendAccountInviteEmail`
- 独自残高管理用 metafield API
- 顧客向けフロント独自認証 API

## 5. Flow 一覧

## 5.1 Flow 1: Order paid 自動付与

目的:

- 支払完了済み注文に対して自動でポイントを付与する

トリガー:

- `Order paid`

処理:

1. 顧客が存在する注文だけ通す
2. 対象外注文を条件で除外する
3. 付与額を算出する
4. `Send Admin API request` で `storeCreditAccountCredit` を実行する
5. 成功後に二重付与防止マーカーを保存する

v1 の推奨実装:

- 二重付与防止は order metafield を最小限で使う
- 残高そのものの正本には一切使わない

理由:

- Flow 単独でも mutation 実行と最低限の idempotency を成立させやすい
- アプリ DB に Flow 実行ログを完全同期するには別経路が必要で、v1 では重い

## 5.2 Flow 2: ウェルカム付与

トリガー:

- `Customer created`

用途:

- 初回登録時の定額ボーナス

状態:

- v1 任意

## 5.3 Flow 3: タグ起点付与

トリガー:

- customer tag 変更系

用途:

- VIP 移行時などの特別付与

状態:

- v1 任意

## 5.4 Flow と app の責務分担

- Flow:
  - イベント検知
  - 自動 credit 実行
  - 最小限の idempotency
- App:
  - 設定 UI
  - 残高 / 履歴表示
  - 手動付与
  - KPI 集計
  - 補助ログ

## 6. データモデル一覧

## 6.1 Shopify 側

- `StoreCreditAccount`
- `StoreCreditAccountCreditTransaction`
- `StoreCreditAccountDebitTransaction`
- `StoreCreditAccountDebitRevertTransaction`
- `StoreCreditAccountExpirationTransaction`

## 6.2 アプリ DB

### `Session`

- 既存 Prisma セッションテーブルを継続利用

### `ShopSettings`

- `shop`
- `autoGrantEnabled`
- `grantRateNumerator`
- `grantRateDenominator`
- `baseAmountMode`
- `defaultExpiryDays`
- `manualDefaultExpiryDays`
- `welcomeGrantEnabled`
- `welcomeGrantAmount`
- `tagGrantEnabled`
- `updatedAt`

### `ManualGrantLog`

- `id`
- `shop`
- `customerId`
- `customerEmail`
- `staffUserId`
- `staffEmail`
- `amount`
- `currencyCode`
- `expiresAt`
- `notifyCustomer`
- `reason`
- `storeCreditTransactionId`
- `createdAt`

### `AppEventLog`

- `id`
- `shop`
- `eventType`
- `status`
- `referenceId`
- `message`
- `payloadJson`
- `createdAt`

### `FlowSetupState` 任意

- `shop`
- `orderPaidFlowEnabled`
- `welcomeFlowEnabled`
- `tagFlowEnabled`
- `updatedAt`

## 6.3 現行 spike からの整理

削除または置換対象:

- `InviteJob`
- `InviteDelivery`
- 招待文面関連ロジック
- 招待用 usage billing 文言

再利用するもの:

- Shopify app skeleton
- Prisma session storage
- Embedded app ルーティング
- App Home のベース UI
- 顧客向け route / server 構成

## 7. 権限一覧

## 7.1 アプリスコープ

- `read_customers`
- `read_store_credit_accounts`
- `read_store_credit_account_transactions`
- `write_store_credit_account_transactions`

追加は後回し:

- `read_orders`
  - アプリ自身が注文情報を直接照会する設計に寄せる時だけ検討

## 7.2 staff permissions

- 顧客の Store Credit 残高閲覧
- transaction history 閲覧
- 手動付与実行
- 設定変更

## 8. KPI 集計方針

## 8.1 MVP で出す指標

- 現在総残高
- 今月の付与額
- 今月の利用額
- 今月の失効額
- 先月の付与額
- 先月の利用額
- 先月の失効額
- 7 日以内 / 30 日以内の失効予定額

## 8.2 集計ソース

- Shopify の Store Credit reports
- `storeCreditAccount.transactions`
- 必要最小限の app 側集計

## 8.3 v1 の現実的な実装

- まずは表示時集計を優先する
- 重くなったら日次スナップショットを追加する
- いきなり複雑な BI テーブルは持たない

## 9. テスト設計

## 9.1 ローカル静的検証

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 9.2 開発ストア検証

- `shopify app dev`
- App Home 表示
- 顧客詳細 block / action 表示
- 手動付与成功
- Store Credit 残高反映
- checkout での利用確認

## 9.3 Flow 検証

- `Order paid` 起点で credit が 1 回だけ付与される
- 同一注文再試行で二重付与されない
- `expiresAt` 付き credit が生成される

## 10. 実装優先順位

1. Store Credit 付与 mutation 実装
2. Order paid 起点の Flow 自動付与
3. 顧客詳細 block で残高表示
4. 顧客詳細 action で手動付与
5. App Home の KPI ダッシュボード
6. 失効予定表示
7. ログ / 監視 / 再実行

## 11. 既知のリスク

- Flow 単独運用では、アプリ DB への厳密な自動付与ログ同期が弱い
- 二重付与防止を app DB ではなく order metafield に寄せる設計判断が必要
- 返品 / キャンセルの自動調整は v1 外のため、運用ルールが必要
- 現行コードはまだ invite 前提のままなので、実装フェーズで route / schema / billing を整理し直す必要がある

## 12. 参考にした Shopify 公式情報

- StoreCreditAccount: https://shopify.dev/docs/api/admin-graphql/latest/objects/StoreCreditAccount
- StoreCreditAccountCreditInput: https://shopify.dev/docs/api/admin-graphql/latest/input-objects/StoreCreditAccountCreditInput
- storeCreditAccountCredit: https://shopify.dev/docs/api/admin-graphql/latest/mutations/storeCreditAccountCredit
- storeCreditAccount: https://shopify.dev/docs/api/admin-graphql/latest/queries/storeCreditAccount
- StoreCreditAccountExpirationTransaction: https://shopify.dev/docs/api/admin-graphql/latest/objects/StoreCreditAccountExpirationTransaction
- Customer targets: https://shopify.dev/docs/api/admin-extensions/latest/targets/customers
- App Home homepage pattern: https://shopify.dev/docs/api/app-home/patterns/templates/homepage
- Metrics card: https://shopify.dev/docs/api/app-home/patterns/compositions/metrics-card
- Shopify Flow overview: https://help.shopify.com/en/manual/shopify-flow
- Send Admin API request: https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-admin-api-request
