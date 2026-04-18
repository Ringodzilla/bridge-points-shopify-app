# 開発・テスト方針

## 基本方針

このアプリでは、Shopify アプリの王道に寄せて以下の 2 層で検証します。

1. ローカル静的検証
2. 開発ストアでの埋め込みアプリ検証

補足:

- 現在のコードには旧 `一括招待くん` spike が残っています
- 本ドキュメントは Bridge Points へ置き換えた後の検証方針です

## 1. ローカル静的検証

```bash
npm install
npm run setup
npm test
```

`npm test` は現時点では以下をまとめて実行します。

- lint
- typecheck
- build

まだ unit test は未導入です。

### `npm run setup` が失敗する場合

このローカル環境では Prisma の `migrate deploy` が `Schema engine error` になることがありました。
その場合だけ、初回セットアップ用のフォールバックとして以下を使います。

```bash
npm run setup:local
```

これは SQLite にローカル開発用テーブルを作り、既存 `dev.sqlite` に不足カラムがあれば追記するための暫定手段です。
標準ルートは引き続き `npm run setup` です。

## 2. 開発ストアでの王道検証

```bash
npm run config:link
npm run dev
```

`npm run dev` は Shopify 公式 CLI の `shopify app dev` を使います。

### 確認する項目

- 埋め込みアプリとして開くか
- Shopify 認証が通るか
- アプリナビゲーションが表示されるか
- App Home が表示崩れせず遷移できるか
- customer details block が表示されるか
- customer details action から手動付与できるか
- Store Credit 残高が反映されるか
- checkout で利用可能な残高として扱われるか

## 3. Store Credit 検証

- `storeCreditAccountCredit` が成功するか
- `expiresAt` 付き credit transaction が生成されるか
- expiration transaction が履歴上で確認できるか
- 顧客別の balance と recent transactions が取得できるか

## 4. Flow 検証

- `Order paid` 起点の自動付与が 1 回だけ走るか
- 顧客未紐付け注文が除外されるか
- 二重付与防止マーカーが効くか
- 失敗時の再試行運用が成立するか

`Send HTTP request` は Plus / Advanced / Grow の制約があるため、v1 では極力 `Send Admin API request` を優先します。

## 参考

- Shopify CLI for apps: https://shopify.dev/docs/apps/build/cli-for-apps
- App structure: https://shopify.dev/docs/apps/build/cli-for-apps/app-structure
- Store Credit: https://help.shopify.com/en/manual/customers/store-credit
- Shopify Flow: https://help.shopify.com/en/manual/shopify-flow
- Send Admin API request: https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-admin-api-request
