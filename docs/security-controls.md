# BridgePoint Security Controls

最終更新: 2026-05-16

## 1. 基本方針

- 残高の正本は Shopify Store Credit を利用する
- BridgePoint 側には設定、補助ログ、重複防止キーのみを保持する
- Protected customer data は最小限の field だけ要求する
- v1 で要求する protected customer fields は Name / Email に限定する

## 2. 最小データ保持

- ShopSettings
- ManualGrantLog
- GrantExecutionLock
- Shopify セッション情報
- `orders/paid` 自動付与に必要な注文 ID / 顧客 ID / 金額の処理記録

独自の顧客残高 ledger は保持しない。

## 3. 通信と保存

- 本番環境は HTTPS/TLS を必須とする
- 本番 DB は at-rest encryption または同等の managed encryption を使う
- バックアップは暗号化された managed backup を前提とする

## 4. アクセス管理

- 本番データへアクセスできる運用者は必要最小限に絞る
- GitHub / hosting / database / Shopify Partner Dashboard は MFA を必須にする
- 監査ログを有効にし、アクセス履歴を確認できる状態にする

## 5. 環境分離

- development store と production store を分ける
- local / staging / production の DB とシークレットを分離する

## 6. 運用上の注意

- `SHOPIFY_BILLING_TEST_MODE=false` を本番で確認する
- `Protected customer data` で要求する field は Name / Email など実装で必要な最小限にとどめる
- app uninstall や privacy webhook に対応し、不要データを削除できる状態を維持する
