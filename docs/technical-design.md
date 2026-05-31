# BridgePoint 技術設計書

## 1. 現状と方針

- 過去実験の route / schema / billing scaffolding は撤去済み
- BridgePoint では Store Credit を正本に寄せ、現行 Shopify に素直に乗る

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
- 付与通貨コード
- デフォルト有効期限日数
- 手動付与デフォルト期限
- ウェルカム付与 ON/OFF
- タグ起点付与 ON/OFF

通貨方針:

- v1 は `手動付与通貨` と `自動付与通貨` を分けて考える
- 手動付与通貨は ShopSettings で 1 ショップ 1 つ選べるようにする
- `Order paid` 自動付与通貨は常に `shop currency` と同一に固定する
- 手動付与 API / Flow には常に明示的な `currencyCode` を渡す
- 将来の複数通貨対応を考慮し、顧客詳細と KPI は通貨別に扱える構造にする

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
    - `creditInput.creditAmount.currencyCode`

補足:

- `id` には customer ID も渡せる
- 対象通貨の account が無ければ自動作成される
- 付与通貨は API 呼び出し側で明示的に決める

### 顧客別残高取得

- `customer(id) { storeCreditAccounts { ... } }`
  - 用途: 顧客詳細表示
- `storeCreditAccount(id)`
  - 用途: balance / transactions / expirable credit 取得

通貨に関する注意:

- 顧客は通貨別に複数の Store Credit account を持ちうる
- v1 の顧客詳細では「先頭 account 1 件」ではなく、対象通貨を明示して表示する

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
- `GET /app/flow-setup`
  - Order paid 向け Flow テンプレート表示
  - 現在設定値から mutation / inputs を生成

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
- v1 では、Flow で使う付与通貨は shop currency と一致させる

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
- `defaultGrantCurrencyCode`
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

### `GrantExecutionLock`

- `id`
- `shop`
- `key`
- `sourceType`
- `sourceId`
- `status`
- `payloadJson`
- `processedAt`
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

## 6.3 過去実験から再利用したもの

再利用済み:

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

## 7.2 staff permissions

- 顧客の Store Credit 残高閲覧
- transaction history 閲覧
- 手動付与実行
- 設定変更

## 7.3 billing 方針

課金モデル:

- `Free`
  - 月額 `$0`
  - 月間注文数 `100` 件まで含む
  - `101` 件目以降は `$0.10 / 件`
  - usage cap は `$100`
- `Advanced`
  - 月額 `$9`
  - 月間注文数 `500` 件まで含む
  - `501` 件目以降は `$0.10 / 件`
  - usage cap は `$100`
- `Premium`
  - 月額 `$19`
  - 月間注文数 `1000` 件まで含む
  - `1001` 件目以降は `$0.10 / 件`
  - usage cap は `$100`
- `Unlimited`
  - 月額 `$39`
  - 月間注文数は無制限
  - overage なし

課金メーター:

- 課金対象は `Order paid` 自動付与で処理した月間注文数とする
- 手動付与は billing 対象外
- 同一注文は 1 回だけ課金対象に数える
- カウントの正本は `GrantExecutionLock(sourceType=order_paid, status=processed)` を使う

merchant への見せ方:

- 現在プラン
- 現在 billing cycle の処理件数
- 30 日換算の見込み件数
- このままの月額見込み
- 「このままだとどのプランの方が安いか」の推奨

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

- app home ではまず `ManualGrantLog` 由来の KPI を出す
- 金額は通貨を混ぜず、通貨別に累計 / 今月 / 先月を表示する
- `GrantExecutionLock` を追加して、将来の order paid 自動付与で二重付与防止キーを永続化できるようにする
- billing meter も `GrantExecutionLock` を使って order paid の処理件数を集計する

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

## 10. 現在の到達点

1. Store Credit 手動付与
2. 顧客詳細 block / action
3. App Home の KPI ダッシュボード
4. `orders/paid` webhook 起点の自動付与
5. `GrantExecutionLock` による二重付与防止
6. 4 プラン billing と overage usage record
7. 公開用の legal / release readiness 導線

## 11. 既知のリスク

- Flow テンプレート画面は残しているが、自動付与の正本は `orders/paid` webhook なので二重管理に注意が必要
- shop currency と異なる付与通貨を Flow で扱う場合、換算ロジックが別途必要
- 返品 / キャンセルの自動調整は v1 外のため、運用ルールが必要
- Protected customer data review と本番ホスティングは repo 外作業なので、公開判断は Partner Dashboard 側の完了待ちになる

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
