# BridgePoint Data Retention Policy

最終更新: 2026-05-16

## 1. 目的

BridgePoint は Shopify Store Credit を残高正本として利用し、アプリ側には運用に必要な最小限の補助データのみを保持する。

## 2. 保持対象

### ShopSettings

- 用途: 付与設定、通貨設定、billing 関連表示
- 保持期間: アプリ導入中

### ManualGrantLog

- 用途: 手動付与の監査、サポート、課金照合
- 保持期間: 最大 24 か月を目安

### GrantExecutionLock

- 用途: Order paid 自動付与の重複防止、監査
- 保持期間: 最大 24 か月を目安
- 保持内容: 注文 ID、顧客 ID、注文金額、処理状態など、自動付与の重複防止と確認に必要な最小限の情報

### Shopify Session

- 用途: 認証維持
- 保持期間: Shopify 認証要件と運用要件に従う

## 3. 削除ポリシー

- アンインストール時は Shopify privacy / uninstall webhook に従って削除対応する
- 法令、課金照合、サポート対応で必要な期間を超えて保持しない

## 4. 正本データ

- 顧客残高の正本は Shopify Store Credit
- BridgePoint は独自の残高 ledger を正本として保持しない
