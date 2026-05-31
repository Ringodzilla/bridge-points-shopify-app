# BridgePoint MVP仕様

## 1. アプリ名

- 仮称: BridgePoint
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

### 9.1 自動付与の発火条件と確定タイミング（v1 固定）

- 発火イベントは `orders/paid` のみ採用する
- `orders/paid` 到達時点を「付与確定タイミング」と定義する
- `orders/authorized` と `orders/partially_paid` では付与しない
- 1 注文あたり付与判定は 1 回のみ実行する（冪等キーで強制）
- 再オーソリや追加入金で同一注文が再度更新されても、初回の `orders/paid` 起点以外では付与しない
- キャンセル / 返品による自動控除は v1 対象外（運用で手動調整）

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

直近履歴の v1 固定仕様:

- 初期表示件数は 20 件
- 並び順は `transaction occurredAt DESC`（新しい順）
- ページングはカーソル方式（`next` のみ、無限スクロール可）
- 取得対象期間は過去 365 日
- 365 日より古い履歴は v1 では画面表示対象外（バックエンド保持は別途運用ポリシーに従う）

### 10.3 手動付与アクション

- 付与額
- 有効期限
- 理由メモ
- 実行確認

手動付与の権限制御（v1）:

- 実行可能者は `Shopify 管理画面のスタッフ` かつ `顧客閲覧権限 + 本アプリ権限` を持つユーザーのみ
- 1 回あたり付与上限は 10,000pt
- 1 顧客あたり 1 日上限は 20,000pt
- 上限超過時は実行不可にし、エラーメッセージを表示する
- 承認ワークフロー（ダブルチェック）は v1 対象外
- 全手動付与は `実行者 / 顧客 / 付与額 / 理由 / 実行時刻` を監査ログとして保存する

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
- v1 対応ストアは `単一通貨運用` であること（導入チェックで検証）
- Flow が未利用または未有効な場合、注文起点の自動付与は利用不可として UI で明示すること

導入時ガード（v1）:

- 初回セットアップ時に `shop.currency` と Market 設定を確認し、複数通貨運用が検知された場合はセットアップを中断する
- 中断時は「v1 は単一通貨ストアのみ対応」の診断メッセージと対処案（単一通貨化 or v2 待ち）を表示する
- Flow 未対応ストアでは自動付与設定セクションを disabled 表示し、手動付与のみ有効化する

## 13. 非機能要件

- 初回導入から 1 営業日以内に運用開始できる
- 同一注文への二重付与を防ぐ
- 手動付与は 5 秒以内を目標とする
- ダッシュボード主要 KPI は 10 秒以内表示を目標とする
- 失敗時に再実行できる設計にする
- 運用担当がエラーを認識できるようにする

### 13.1 二重付与防止キー仕様（必須）

- キー名: `auto_grant_dedupe_key`
- 構成: `shop_id + order_id + rule_version`
- `rule_version` は付与率や対象条件の変更ごとに更新する
- 永続化先: アプリ DB（ユニーク制約付き）
- 保存期間: 400 日（最長返品・調査期間を考慮）
- リトライ時の扱い: 同一キーが存在する場合は付与処理をスキップして成功扱いにする
- 付与 API タイムアウト時は「結果不明」として再照会し、既存キーまたは取引記録を確認後に再実行可否を決定する

### 13.2 失敗時再実行の運用設計（v1）

- 再実行トリガーは `管理画面の再実行ボタン` と `日次自動リトライジョブ` の 2 系統
- 自動リトライ対象は `一時障害（5xx / timeout / rate limit）` のみ
- 恒久エラー（権限不足、対象顧客なし、設定不備）は自動リトライ対象外
- 再実行可能期間はエラー発生から 30 日
- 失敗理由は `TEMPORARY` / `PERMANENT` / `UNKNOWN` に分類して保存する
- 通知先はアプリ内通知と運用担当メール（設定値）とし、`PERMANENT` は即時通知する

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

KPI 集計定義（画面間で共通）:

- 集計タイムゾーンは `ストア管理タイムゾーン` で固定
- 月次の境界は `毎月 1 日 00:00:00` から `末日 23:59:59`（ストア管理タイムゾーン）
- 付与額は `付与トランザクション作成日` 基準で計上
- 利用額は `利用トランザクション発生日` 基準で計上
- 失効額は `失効トランザクション発生日` 基準で計上
- 金額表示は税抜税込の概念を持たず `Store Credit 通貨額` をそのまま集計
- キャンセル / 返品の控除は v1 では自動相殺せず、手動調整トランザクション発生日で計上

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
