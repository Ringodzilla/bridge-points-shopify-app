# Bridge Points

Shopify アプリ「Bridge Points」専用の作業フォルダです。

## 目的

- 高機能ロイヤルティアプリ導入前の橋渡しとして、最小のポイント基盤を提供する
- Store Credit を正本に寄せ、checkout で使えるポイント体験を日本語 UI で整える
- 導入初期に必要な自動付与、手動付与、残高可視化、失効可視化だけに絞る

## 現在の状態

- Shopify 公式 React Router テンプレートをベースに埋め込みアプリ骨格を作成済み
- Prisma セッション保存、開発ストア接続、`shopify app dev` による起動確認まで完了済み
- ただし、現行コード本体には過去の `一括招待くん` spike が残っている
- **2026-04-17 時点で、仕様の正本は招待アプリではなく Bridge Points 側へ切り替えた**
- これから実装を Bridge Points 用に置き換える

## 開発補助

- Codex のユーザー設定 `~/.codex/config.toml` に `shopify-dev-mcp` を追加済み
- 反映には Codex の再起動が必要

## 仕様書

- MVP 仕様: `docs/mvp-spec.md`
- 技術設計: `docs/technical-design.md`
- 開発・テスト方針: `docs/testing.md`

## 技術スタック

- Shopify App React Router
- Shopify CLI
- React Router 7
- Prisma + SQLite
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
npm run config:link
npm run dev
```

- `npm test` は `lint + typecheck + build` の静的検証です
- 埋め込みアプリとしての確認は `npm run dev` で `shopify app dev` を使います
- もし `npm run setup` が Prisma の `Schema engine error` で止まる場合は、暫定的に `npm run setup:local` を使います

## 実装メモ

- 残高の正本は Shopify Store Credit に寄せる
- `invite` 前提の route / schema / billing scaffolding は段階的に撤去または置換する
- 自動付与は Flow を主軸にし、App Home と customer details block で運用体験を作る

## 次に着手すること

1. Store Credit 付与 mutation と設定モデルへデータ設計を切り替える
2. Order paid 起点の Flow 自動付与を設計どおり実装する
3. customer details block / action と App Home を Bridge Points 向けに置き換える
