# BridgePoint App Store Listing 文案ドラフト

最終更新: 2026-05-16

## 1. App name

- BridgePoint

## 2. Tagline 候補

- Shopify Store Credit を使って、軽量ポイント運用をすぐ始める
- Store Credit ベースの軽量ポイント基盤
- フルロイヤルティ導入前の、シンプルな BridgePoint

## 2.1 App card subtitle / introduction

Partner Dashboard の app introduction / subtitle は短く、キーワード詰め込みや保証表現を避けます。

### 日本語

```text
Store Credit で始めるシンプルなポイント運用
```

### 英語

```text
Simple points operations powered by Shopify Store Credit
```

## 3. Short description 候補

### 日本語

```text
Shopify Store Credit を正本にした軽量ポイントアプリ。自動付与、手動付与、残高確認、シンプルな料金プランに対応。
```

### 英語

```text
Lightweight points app powered by Shopify Store Credit, with auto grants, manual grants, balance visibility, and simple usage-based pricing.
```

## 4. Full description 候補

### 日本語

```text
BridgePoint は、Shopify Store Credit を正本として使う軽量ポイントアプリです。

高機能なロイヤルティ SaaS を入れる前に、まずはシンプルなポイント運用を始めたいマーチャント向けに設計しています。

できること:
- Order paid を起点にした自動ポイント付与
- 顧客詳細画面やアプリ画面からの手動付与
- 顧客ごとの残高と履歴の確認
- 失効日つきの付与
- Shopify 管理画面に埋め込まれた運用画面

BridgePoint は独自の残高 ledger を持たず、Shopify Store Credit を残高の正本として利用します。これにより checkout 利用や将来の移行を妨げにくく、シンプルな運用を保てます。

料金:
- Free: 月 100 件まで
- Advanced: $9 / 月 500 件まで
- Premium: $19 / 月 1000 件まで
- Unlimited: $39 / 無制限
- Free / Advanced / Premium は上限超過後 $0.10 / 件、usage cap は $100
```

### 英語

```text
BridgePoint is a lightweight points app built on Shopify Store Credit.

It is designed for merchants who want a simple rewards bridge before adopting a full-scale loyalty platform.

Features:
- Automatic point grants on Order paid
- Manual grants from the customer details page or app admin
- Customer balance and recent history visibility
- Per-grant expiration dates
- Embedded Shopify admin workflow

BridgePoint uses Shopify Store Credit as the source of truth instead of maintaining a separate customer balance ledger. This keeps checkout compatibility, reduces operational complexity, and makes future migration easier.

Pricing:
- Free: up to 100 monthly processed orders
- Advanced: $9 for up to 500 monthly processed orders
- Premium: $19 for up to 1000 monthly processed orders
- Unlimited: $39 with unlimited monthly processed orders
- Free / Advanced / Premium include $0.10 per order overage after the included limit, capped at $100 in monthly usage charges
```

## 5. Pricing explanation copy

### 日本語

```text
課金対象は、BridgePoint が自動付与を処理した月間注文数です。Free / Advanced / Premium は含み件数を超えたぶんだけ 1 件あたり $0.10 の追加料金が発生し、月間の usage 上限は $100 です。Unlimited は overage なしで無制限です。
```

### 英語

```text
Billing is based on the number of monthly orders processed by BridgePoint auto grants. Free, Advanced, and Premium include a monthly order allowance and charge $0.10 per additional order, capped at $100 in monthly usage charges. Unlimited has no overage.
```

## 5.1 Pricing plans for Partner Dashboard

| Plan | Recurring charge | Included processed orders | Usage charge |
| --- | ---: | ---: | --- |
| Free | $0 / 30 days | 100 / month | $0.10 per additional processed order, capped at $100 / 30 days |
| Advanced | $9 / 30 days | 500 / month | $0.10 per additional processed order, capped at $100 / 30 days |
| Premium | $19 / 30 days | 1000 / month | $0.10 per additional processed order, capped at $100 / 30 days |
| Unlimited | $39 / 30 days | Unlimited | No overage |

### Additional charges description

```text
Free, Advanced, and Premium include a monthly allowance of BridgePoint-processed order-paid automatic grants. After the included allowance, BridgePoint records a $0.10 usage charge per additional processed order, capped at $100 per 30-day billing period. Manual grants are not usage-billed. Unlimited has no usage overage.
```

## 5.2 Requirements / permissions note

```text
BridgePoint requires access to Shopify Store Credit APIs and limited protected customer data fields (Name and Email) to show balances, display recent history, and create merchant-initiated Store Credit grants. Store Credit redemption at checkout depends on Shopify Store Credit and customer account availability for the merchant's store.
```

## 5.3 Feature list

```text
- Automatic Store Credit grants from order-paid events
- Manual Store Credit grants from Shopify admin and customer details
- Customer balance, recent history, and expiration visibility
- Duplicate grant prevention for safer operations
- Plan-aware billing and usage visibility
```

## 6. Support / onboarding note

```text
Add the real support email, support URL, and onboarding contact before publishing.
```

## 6.1 Listing assets checklist

- App icon: 1200 x 1200 JPEG or PNG, no Shopify trademark, no text-heavy screenshot
- Feature media: 1600 x 900, one clear focal point, no pricing/review/testimonial claims
- Screenshots: 3-6 desktop screenshots, each 1600 x 900, cropped to app UI without browser chrome or personal data
- Alt text: provide clear alt text for each image
- Demo store URL: direct link to the best demo state, with review instructions

## 7. Screencast outline

1. App install and embedded app open
2. Settings page and plan selection
3. Customer details block / action
4. Manual grant flow
5. Order paid auto grant
6. Billing page with projected charge and usage

## 8. Test credentials checklist

- dev store URL
- test merchant account
- sample customer with store credit history
- sample paid order for auto grant demonstration
- test plan approval steps
