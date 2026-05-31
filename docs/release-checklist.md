# BridgePoint リリース前チェックリスト

## 1. リポジトリ内で完了させる項目

- [x] 手動付与ページ
- [x] customer details block / action
- [x] 設定画面
- [x] KPI ダッシュボード
- [x] 二重付与防止 lock 基盤
- [x] `orders/paid` webhook 起点の自動付与
- [x] Flow テンプレート画面
- [x] 4 プラン billing config
  - Free: 月 100 件まで
  - Advanced: $9 / 月 500 件まで
  - Premium: $19 / 月 1000 件まで
  - Unlimited: $39 / 無制限
  - limited plan の超過は $0.10 / 件、cap $100
- [x] subscription と usage overage の実地確認
- [x] 公開用 legal pages
- [x] Partner Dashboard / listing 用ドラフト文案
- [x] `.env.example`
- [x] 開発 preview の固定導線
- [x] Fly.io + Supabase Postgres 用のデプロイ土台
- [x] privacy / compliance webhook の保存データ export / redact / shop delete 実装
- [x] 課金未承認ショップ向け gate
  - `/app/billing` と `/app/release-readiness` 以外のアプリ画面はプラン承認後に利用可能
  - customer details action の手動付与 API は未承認時 402
  - `orders/paid` webhook は未承認時に自動付与を skip
- [x] Shopify API version を本番向け stable `2026-04` に統一
- [x] 本番環境変数 / Partner Dashboard 反映前の `release:precheck`

## 2. 本番インフラで必要な項目

- [ ] Fly.io app を作成し、本番 URL を確定する
- [ ] Fly.io trial 停止制限を解除するため、クレジットカードを追加する
  - Fly の trial 制限で「5 分以上動かすには credit card が必要」と出る場合、コードでは回避できない
  - 本番で止めたくない場合はカード登録を必須にする
  - 2026-05-10 時点で Fly API は `trial has ended`、公開 URL は 502 を返している
  - 2026-05-12 時点でも `trial has ended` により `fly status` / `fly secrets list` がブロックされている
  - 2026-05-14 時点でも `fly status` は trial 終了でブロック、公開 URL は 502
  - 2026-05-16 時点でも `fly status` は trial 終了でブロック、公開 URL は 502
- [ ] TLS/SSL を有効にする
- [x] Supabase Postgres project を作成する
  - project: `bridgepoint-production`
  - ref: `djpauhwujzrpnvqfhyxv`
  - region: `ap-northeast-1`
  - 2026-05-10 に restore 済み、status は `ACTIVE_HEALTHY`
- [x] Supabase は v1 では direct connection を使う
  - `DATABASE_URL` / `DIRECT_URL` はどちらも `db.djpauhwujzrpnvqfhyxv.supabase.co:5432/postgres` に統一済み
  - pooled connection は未採用
  - pooler username / host の本番検証後に再検討する
- [x] Supabase project を active に戻し、direct connection の Prisma 接続確認を通す
  - DNS: direct host は IPv6 で解決
  - TCP: `db.djpauhwujzrpnvqfhyxv.supabase.co:5432` 接続成功
  - Prisma: `migrate status` で `Database schema is up to date!`
- [ ] Fly.io secrets に `DATABASE_URL` / `DIRECT_URL` / Shopify secrets を設定する
- [x] Fly.io secrets に入れる本番値のローカル事前確認
  - `.env.production.local` に Shopify env / direct DB URL / `SHOPIFY_BILLING_TEST_MODE=false` を集約済み
  - `npm run release:precheck -- --env-file .env.production.local --strict-env` は 2026-05-12 に PASS
- [ ] 環境変数を本番値へ切り替える
- [x] `SHOPIFY_BILLING_TEST_MODE=false` を本番値として使う方針を確定する

## 3. Shopify Partner Dashboard で必要な項目

- [ ] Distribution method を確定する
- [ ] App name / branding を BridgePoint に更新する
- [x] App URL を `https://bridgepoint-shopify-app.fly.dev` に更新する
- [x] Redirect URL を `https://bridgepoint-shopify-app.fly.dev/auth/callback` に更新する
- [ ] App listing を作成する
- [ ] Pricing を Partner Dashboard に反映する
  - Free
  - Advanced $9
  - Premium $19
  - Unlimited $39
  - limited plan の超過は $0.10 / 件、cap $100
- [ ] Protected customer data request を完了する
- [ ] Data protection details を入力する
- [ ] Partner Dashboard の各入力欄へドラフト文案を反映する
  - 2026-05-14 に `docs/partner-dashboard-copy.md` と `docs/app-store-listing-copy.md` を最新化済み
- [x] Shopify app config を production URL 前提で deploy する
  - 2026-05-10 に `bridgepoint-3` をリリース済み
- [ ] Test credentials をレビュー向けに用意する
- [ ] Screencast を用意する

## 4. 追加検証

- [ ] 本番 URL で embedded app が開くことを確認する
- [ ] 本番 URL 経由で OAuth が通ることを確認する
- [ ] 本番 URL 経由で手動付与が成功することを確認する
- [ ] 本番 URL 経由で `orders/paid` webhook が動くことを確認する
- [ ] legal pages の公開 URL を listing に設定する
- [ ] billing の課金導線を最終確認する
- [ ] 本番環境で usage record が auto grant の注文超過時だけ積まれることを確認する

## 5. 次にやるべき最小ステップ

1. Fly.io trial 停止制限解除のカード登録を、本番で継続稼働させる直前に実施する
2. Fly.io secrets に本番値を設定し、`SHOPIFY_BILLING_TEST_MODE=false` を反映する
3. Fly.io へ web app を deploy する
4. 管理画面から BridgePoint を開いて OAuth と主要機能を 1 周確認する

カード登録直後の実行順は `docs/deployment.md` の `Fly.io Post-Card Release Sequence` を正本にする。

## 6. 公開判断

以下が揃った時点で、public release の最終判断に進む。

- 本番 URL が安定している
- Protected customer data review が通っている
- listing と pricing が揃っている
- review 用情報が揃っている
- 本番 URL で embedded app / legal page / billing 導線が通っている
