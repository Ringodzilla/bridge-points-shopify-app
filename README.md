# BridgePoint

Shopify アプリ「BridgePoint」専用の作業フォルダです。

## 目的

- 高機能ロイヤルティアプリ導入前の橋渡しとして、最小のポイント基盤を提供する
- Store Credit を正本に寄せ、checkout で使えるポイント体験を日本語 UI で整える
- 導入初期に必要な自動付与、手動付与、残高可視化、失効可視化だけに絞る

## 現在の状態

- Shopify 公式 React Router テンプレートをベースに埋め込みアプリ骨格を作成済み
- Prisma セッション保存、開発ストア接続、`shopify app dev` による起動確認まで完了済み
- 手動付与ページ、customer details block / action、設定画面、KPI ダッシュボードを実装済み
- `orders/paid` webhook 起点の自動付与、二重付与防止、usage billing の実地確認まで完了済み
- 過去実験の route / schema / billing scaffolding は撤去済みで、現行仕様の正本は BridgePoint
- 本番公開に向けて、命名・設定・法務導線・リリース手順を BridgePoint へ統一していく

## 開発補助

- Codex のユーザー設定 `~/.codex/config.toml` に `shopify-dev-mcp` を追加済み
- 反映には Codex の再起動が必要

## 仕様書

- MVP 仕様: `docs/mvp-spec.md`
- 技術設計: `docs/technical-design.md`
- 開発・テスト方針: `docs/testing.md`
- Partner Dashboard 入力ドラフト: `docs/partner-dashboard-copy.md`
- App Store listing 文案: `docs/app-store-listing-copy.md`

## 技術スタック

- Shopify App React Router
- Shopify CLI
- React Router 7
- Prisma + SQLite（local）
- Prisma + Supabase Postgres（production）
- Fly.io
- TypeScript
- Shopify Admin GraphQL `storeCreditAccountCredit`
- Shopify Flow
- Polaris App Home
- Admin UI Extensions

## 起動と検証

```bash
npm install
npm run setup
npm test
npm run release:precheck
npm run release:validate-config
npm run config:link
npm run dev:bridge
npm run preview:info
```

- `npm test` は `lint + typecheck + build` の静的検証です
- `npm run release:precheck` は、本番 URL / scope / API version / billing production mode の反映前チェックです
- `npm run release:validate-config` は Shopify CLI で app config と extensions を schema 検証します
- 埋め込みアプリとしての確認は `npm run dev:bridge` を使います
- `npm run dev` と `npm run dev:bridge` はどちらも `bridgepoint` app configuration（`shopify.app.bridgepoint.toml`）を使って起動します
- `npm run preview:info` は、固定で使うべき Shopify 管理画面の preview URL と、現在の `trycloudflare` URL の状態を表示します
- ブックマークするのは `trycloudflare.com` ではなく、`preview:info` が出す Shopify 管理画面側の preview URL にしてください
- 読み込みが止まるときは、まずハードリロード、その次に Dev Console の `開発プレビューをクリーンアップ` を使います
- もし `npm run setup` が Prisma の `Schema engine error` で止まる場合は、暫定的に `npm run setup:local` を使います

## 本番デプロイ方針

本番は `trycloudflare.com` を使わず、Fly.io の固定 URL と Supabase Postgres を使います。

```bash
npm run prisma:prod:generate
npm run prisma:prod:migrate
npm run build:prod
```

- local 開発は既存の `prisma/schema.prisma` と SQLite を使います
- production は `prisma-postgres/schema.prisma` と Supabase Postgres を使います
- Fly.io の起動は `Dockerfile` と `fly.toml` を使います
- Fly.io では `auto_stop_machines = false` / `min_machines_running = 1` にして、Shopify 管理画面・OAuth・webhook が sleep で止まるリスクを避けます
- Supabase は runtime 用の `DATABASE_URL` と migration 用の `DIRECT_URL` を分けます
- 本番 URL が決まったら `SHOPIFY_APP_URL`、Partner Dashboard の App URL、Redirect URL、legal pages URL を同じ固定 URL へ揃えます

## 実装メモ

- 残高の正本は Shopify Store Credit に寄せる
- 現行仕様に不要な route / schema / billing scaffolding は残さない
- 自動付与の正本実行経路は `orders/paid` webhook とする
- 自動付与通貨は shop currency 固定、手動付与通貨だけ設定可能にする
- billing の課金対象は、BridgePoint が自動付与を処理した月間注文数とする

## 次に着手すること

1. Protected customer data / data protection details を Partner Dashboard で完了する
2. 本番 URL / TLS / 本番 DB を確定する
3. App Store listing / pricing / review credentials / screencast を仕上げる
