# Bridge Points MVP仕様

## 1. アプリ名

- 仮称: Bridge Points
- 位置づけ: 高機能ロイヤルティアプリ導入前の橋渡しとなる、軽量ポイント基盤

## 2. 目的

Shopify マーチャントが、低コストかつ短期間でポイント施策を開始できる状態を作る。

MVP の成立条件は以下とする。

- Shopify アプリとして起動できる
- Store Credit を使って顧客へポイント相当額を付与できる
- checkout で利用できる残高として成立する
- 付与単位ごとに有効期限を持てる
- 顧客別の残高と直近履歴を確認できる
- 管理画面から手動付与できる
- ストア全体の付与・利用・失効を可視化できる
- 実装範囲と未実装範囲が明確である

## 3. プロダクトコンセプト

- 重いロイヤルティアプリの手前にある、最小で使えるポイント基盤
- 残高の正本は Shopify ネイティブの Store Credit に寄せる
- 日本語 UI で導入障壁を下げる
- 高頻度利用ではなく、導入初期と運用初期に効く橋渡しアプリとして設計する

## 4. 主要ユーザー

- マーチャント管理者
- CS / 店舗運用担当
- checkout でポイントを利用したい顧客

## 5. MVP スコープ

### In Scope

- 注文起点の自動ポイント付与
- 顧客詳細からの手動ポイント付与
- 付与ごとの有効期限設定
- 顧客別残高表示
- 顧客別履歴表示
- アプリホームでの KPI 可視化
- 月次の付与額 / 利用額 / 失効額の表示
- 最小限の設定画面

### Out of Scope

- 会員ランク
- 複雑な倍率キャンペーン
- 紹介制度
- ゲーム化
- 複雑な商品別ルール
- POS 高度連携
- 外部会員基盤との完全同期
- 監査特化の高度台帳 UI

## 6. 基本アーキテクチャ

- 残高の正本: Store Credit
- 自動化: Shopify Flow
- 付与 / 参照: Admin GraphQL API
- 顧客画面導線: Admin UI Extension
- ダッシュボード: Polaris App Home
- 補助データ: アプリ DB に最小限だけ保存

metafield は残高の正本には使わない。
ただし二重付与防止や運用メモなど、補助目的に限って最小限の利用は許容する。

## 7. ポイント仕様

- 1pt = 1円相当
- 100円につき 1pt
- 小数点は切り捨て
- 推奨基準額: 割引後商品小計、送料・税は除外
- デフォルト有効期限: 365 日

UI 上は「ポイント」として見せるが、内部実体は通貨付き Store Credit 残高として扱う。

## 8. 有効期限の扱い

- `storeCreditAccountCredit` で credit transaction を作成する
- 付与時に `expiresAt` を設定する
- 期限切れ時は Shopify 側の expiration transaction に委ねる

重要方針:

- v1 では「既存 credit の期限を後から直接更新する」設計にしない
- 「期限リセット」は厳密な再設定ではなく、新規 credit 付与による延命として再定義する

## 9. 主要ユースケース

1. 管理者がアプリホームで KPI を確認する
2. 顧客詳細画面で現在残高と失効予定を確認する
3. 顧客詳細から特別ポイントを手動付与する
4. 注文支払い完了時に自動でポイントを付与する
5. 顧客が checkout でポイントを利用する
6. 運用担当が付与 / 利用 / 失効の履歴を確認する

## 10. 主要画面

### 10.1 アプリホーム

- KPI カード
- 月次推移
- 失効予定サマリー
- 直近手動付与履歴
- 設定ショートカット

### 10.2 顧客詳細ブロック

- 現在残高
- 期限別残高
- 次回失効予定
- 直近履歴
- 手動付与導線

### 10.3 手動付与アクション

- 付与額
- 有効期限
- 理由メモ
- 実行確認

### 10.4 設定画面

- 基本設定
- 付与ルール
- 有効期限
- 手動付与設定
- 注意事項

## 11. データ方針

### Shopify 側の正本

- Store Credit Account
- Store Credit transactions

### アプリ DB の最小保存対象

- shop 設定値
- 手動付与ログ
- 処理ログ
- 自動付与の二重実行防止キー

残高そのものはアプリ DB に複製しない。

## 12. 権限と前提

想定する主要スコープ:

- `read_customers`
- `read_store_credit_accounts`
- `read_store_credit_account_transactions`
- `write_store_credit_account_transactions`

前提条件:

- Store Credit が使えるストアであること
- 顧客が checkout で Store Credit を利用するには new customer accounts 認証が前提になること
- Flow が利用可能なプランであること
- 顧客プロフィールでの残高確認には該当する staff permissions が必要であること

## 13. 非機能要件

- 初回導入から 1 営業日以内に運用開始できる
- 同一注文への二重付与を防ぐ
- 手動付与は 5 秒以内を目標とする
- ダッシュボード主要 KPI は 10 秒以内表示を目標とする
- 失敗時に再実行できる設計にする
- 運用担当がエラーを認識できるようにする

## 14. エッジケース

- 顧客未紐付け注文は対象外
- 返品 / キャンセルの自動回収は v1 対象外
- 部分返品の自動調整は v1 対象外
- 過去注文への一括遡及付与は v1 対象外
- 多通貨・複数国最適化は v1 対象外
- 複数施策の競合は v1 対象外

## 15. 成功指標

- インストールから初回付与までの完了率
- 月間アクティブマーチャント数
- 月間総付与額
- 月間総利用額
- 手動付与利用率
- 設定完了率
- 問い合わせ率
- エラー率

## 16. v1 の最終定義

以下を満たせば v1 は成功とみなす。

- 注文でポイントが貯まる
- checkout で使える
- 付与ごとに有効期限が持てる
- 顧客ごとの残高と履歴が見える
- 管理画面から手動付与できる
- ストア全体の付与・利用・失効が見える
- 過剰機能なしで軽く導入できる

## 17. 参考にした Shopify 公式情報

- Store Credit: https://help.shopify.com/en/manual/customers/store-credit
- StoreCreditAccount: https://shopify.dev/docs/api/admin-graphql/latest/objects/StoreCreditAccount
- storeCreditAccountCredit: https://shopify.dev/docs/api/admin-graphql/latest/mutations/storeCreditAccountCredit
- StoreCreditAccountExpirationTransaction: https://shopify.dev/docs/api/admin-graphql/latest/objects/StoreCreditAccountExpirationTransaction
- Shopify Flow: https://help.shopify.com/en/manual/shopify-flow
- Send Admin API request: https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-admin-api-request
- Customer targets for Admin UI extensions: https://shopify.dev/docs/api/admin-extensions/latest/targets/customers
- App Home homepage pattern: https://shopify.dev/docs/api/app-home/patterns/templates/homepage
