# BridgePoint 審査用 Screencast 台本

最終更新: 2026-04-29

## 1. 目的

Shopify App Store review 向けに、BridgePoint の主要機能が短時間で伝わる 3〜5 分の動画を収録するための台本です。

レビュアーに見せたいポイントは次です。

- Shopify admin に埋め込まれたアプリであること
- プラン選択ができること
- customer details block / action が使えること
- 手動付与ができること
- `orders/paid` 自動付与が動くこと
- billing meter / usage が確認できること

## 2. 収録前チェック

- `npm run dev:bridge` が起動している
- dev store の管理画面から BridgePoint を開ける
- `BridgePoint` 表示名が反映済み
- テスト用 customer が 1 件ある
- その customer に紐づく paid 注文を 1 件作れる
- プラン画面で test subscription が承認済み
- customer details block / action が表示される

## 3. 推奨動画構成

- 目標尺: 3〜5 分
- BGM なし
- 倍速なし
- 画面録画 + 必要に応じて短い口頭説明

## 4. 台本

### 0:00 - 0:20 導入

画面:
- Shopify admin の `Apps` から `BridgePoint` を開く
- App Home を表示する

話す内容:
- `This is BridgePoint, a lightweight points app built on Shopify Store Credit.`
- `I’ll show the embedded admin workflow, manual grants, order-paid auto grants, and plan-based billing.`

### 0:20 - 0:50 Settings

画面:
- `Settings` を開く
- 自動付与設定、手動付与通貨、失効日数が見える状態にする

話す内容:
- `BridgePoint lets merchants configure auto grant behavior, manual grant defaults, and currency settings.`
- `For order-paid auto grants, the app uses the shop currency.`

見せるポイント:
- 保存状態の表示
- manual grant currency dropdown
- auto grant enabled
- grant rate

### 0:50 - 1:20 Plans

画面:
- `Plans` を開く
- 現在プラン、月間件数、予測請求、usage 実績を表示する

話す内容:
- `Merchants can choose from Free, Advanced, Premium, and Unlimited plans.`
- `Billing is based on the number of monthly orders processed by BridgePoint auto grants.`
- `The Plans page shows projected charges and Shopify usage records.`

見せるポイント:
- current plan
- projected charge
- usage cap
- next-best plan suggestion が出ていればそれも見せる

### 1:20 - 2:10 Customer details block / action

画面:
- 顧客詳細ページを開く
- block を表示
- action モーダルを開く

話す内容:
- `BridgePoint adds an embedded customer details block and action inside Shopify admin.`
- `Staff can review the balance and create a manual grant without leaving the customer page.`

見せるポイント:
- current balance
- recent history
- action modal

### 2:10 - 2:50 Manual grant

画面:
- action または app 内 manual grant 画面から少額の store credit を付与
- 成功メッセージを表示

話す内容:
- `Here is a manual store credit grant with an expiration period.`
- `BridgePoint records the grant and updates the customer’s Store Credit balance.`

見せるポイント:
- amount
- expiry days
- success toast / success banner
- customer store credit balance change

### 2:50 - 3:50 Order paid auto grant

画面:
- 注文一覧または注文詳細を開く
- 対象 customer の注文を `paid` にした状態を見せる
- その後 customer の Store Credit 画面に戻る

話す内容:
- `BridgePoint also grants credit automatically when an order is paid.`
- `The app uses duplicate-execution protection so the same order is not granted twice.`

見せるポイント:
- paid order
- customer balance increase
- recent transaction / order-driven grant
- 可能なら dashboard の meter も更新後に見せる

### 3:50 - 4:30 Dashboard and billing confirmation

画面:
- App Home または `Plans` に戻る
- meter / usage / projected billing を確認

話す内容:
- `The dashboard summarizes grant activity, and the Plans page reflects processed order counts and usage billing.`
- `This helps merchants understand when another plan may be more cost-effective.`

見せるポイント:
- processed order count
- usage amount
- projected charge

### 4:30 - 4:45 締め

画面:
- BridgePoint Home または Plans の全景

話す内容:
- `That is the end-to-end BridgePoint workflow: embedded admin usage, manual grants, automatic order-paid grants, and plan-aware billing.`

## 5. 収録時の注意

- customer email や個人情報はテストデータを使う
- 注文番号や金額もレビュー用のテストデータに寄せる
- 1テイクで詰まりそうなら、画面遷移だけ先に確認してから録画する
- `trycloudflare` URL やローカル事情は動画で強調しない
- レビュアーが見たいのはアプリ価値と主要導線

## 6. 動画説明文の短い案

```text
BridgePoint review screencast covering embedded admin workflow, settings, customer details block/action, manual grants, order-paid auto grants, and plan-based billing.
```

## 7. URL 反映タイミング

- Loom / YouTube 限定公開 / Google Drive 共有 URL を発行したら、`Screencast URL` にそのまま貼る
- 公開後は Partner Dashboard の `Screencast URL` と listing 用メモを同じ URL に揃える
