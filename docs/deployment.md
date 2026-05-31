# BridgePoint Production Deployment

## Target

- Web app: Fly.io
- Database: Supabase Postgres
- Local development DB: SQLite
- Production DB schema: `prisma-postgres/schema.prisma`

This keeps local development fast while using Postgres in production for safer growth into tiers, ranks, history, and analytics.

## Required Production Environment Variables

Set these as Fly.io secrets.

```bash
fly secrets set SHOPIFY_API_KEY="..."
fly secrets set SHOPIFY_API_SECRET="..."
fly secrets set SCOPES="read_customers,read_orders,read_store_credit_accounts,read_store_credit_account_transactions,write_store_credit_account_transactions"
fly secrets set SHOPIFY_APP_URL="https://YOUR-FLY-APP.fly.dev"
fly secrets set SHOPIFY_BILLING_TEST_MODE="false"
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set DIRECT_URL="postgresql://..."
```

For the first production release, set both `DATABASE_URL` and `DIRECT_URL` to the Supabase direct connection.
The pooled connection can be revisited after the pooler username/host is verified in production.

## Supabase Connection Notes

- `DATABASE_URL`: use the Supabase direct connection for v1 stability.
- `DIRECT_URL`: Supabase direct connection is preferred for `prisma migrate deploy`.
- For the current production project, both values should use `db.djpauhwujzrpnvqfhyxv.supabase.co:5432/postgres`.
- Supabase pooled connection is useful later, but a misconfigured pooler URL can fail with `tenant/user ... not found`.
- Keep test and production projects separate before App Store review.

## Fly.io Setup

```bash
fly auth login
fly apps create bridgepoint-shopify-app
fly secrets set SHOPIFY_API_KEY="..."
fly secrets set SHOPIFY_API_SECRET="..."
fly secrets set SHOPIFY_APP_URL="https://bridgepoint-shopify-app.fly.dev"
fly secrets set SHOPIFY_BILLING_TEST_MODE="false"
fly secrets set DATABASE_URL="..."
fly secrets set DIRECT_URL="..."
fly deploy
```

If Fly logs say that running longer than five minutes requires a credit card, add a card to the Fly.io account before relying on this app for production. This is a Fly trial account limit and cannot be fixed in application code.

## Fly.io Post-Card Release Sequence

Keep the Fly.io credit card step as late as possible. Immediately after the card is added and the trial limit is lifted, run the release sequence below from this repository root.

```bash
npm run release:precheck -- --env-file .env.production.local --strict-env
grep -E '^(SHOPIFY_API_KEY|SHOPIFY_API_SECRET|SCOPES|SHOPIFY_APP_URL|SHOPIFY_BILLING_TEST_MODE|DATABASE_URL|DIRECT_URL)=' .env.production.local \
  | fly secrets import --app bridgepoint-shopify-app
npm run setup:prod
fly deploy --app bridgepoint-shopify-app
fly status --app bridgepoint-shopify-app
curl -I https://bridgepoint-shopify-app.fly.dev
```

Do not print or paste secret values into chat. `.env.production.local` is the local source for Fly secrets, and `release:precheck` verifies that it is aligned with the production URL and Shopify scopes.

As of 2026-05-16, Fly.io still returns `trial has ended` for `fly status --app bridgepoint-shopify-app`, and the public app URL still returns HTTP 502. Continue to defer deploy and smoke tests until the trial limit is lifted.

`fly.toml` intentionally keeps one machine running:

- `auto_stop_machines = false`
- `min_machines_running = 1`

This avoids the development-only failure mode where a temporary tunnel URL disappears or a sleeping app cannot serve Shopify admin, OAuth, or webhooks.

## Shopify Partner Dashboard

After Fly deploy succeeds, update the app configuration and Partner Dashboard values to the fixed production URL.

- App URL: `https://bridgepoint-shopify-app.fly.dev`
- Redirect URL: `https://bridgepoint-shopify-app.fly.dev/auth/callback`
- Webhook / Admin API version: stable `2026-04`
- Legal pages: use the same production host.
- Webhooks: keep relative app config paths and deploy the Shopify app config.

Deploy the Shopify app configuration after the production URL is set:

```bash
npm run release:precheck
npm run release:validate-config
npm run deploy
```

Do not submit for review until the Partner Dashboard App URL and Redirect URL match the deployed Shopify app config.

## Production Smoke Test

Run this smoke test through the production Fly URL before App Store submission:

- Open BridgePoint from Shopify Admin and confirm OAuth completes.
- Confirm the embedded app loads at the production URL.
- Create a small manual store credit grant from the app or customer details action.
- Trigger or replay an `orders/paid` flow and confirm the webhook grants once.
- Confirm legal pages load from the production host.
- Confirm billing approval opens in live mode with `SHOPIFY_BILLING_TEST_MODE=false`.

### Smoke test evidence to capture

- OAuth callback returns to the embedded `/app` UI.
- `/app/billing` shows live mode plans and opens Shopify billing approval.
- Customer details block loads balance and recent history.
- Customer details action or `/app/manual-credit` creates a Store Credit transaction.
- A paid test order triggers exactly one `orders/paid` grant and one lock record.
- Legal pages return 200 from the Fly URL.

## Local Verification Before Deploy

```bash
npm run release:precheck
npm run release:validate-config
npm test
npm run prisma:prod:generate
npm run build:prod
```

Do not use `trycloudflare.com` URLs in App Store listing, review notes, legal pages, or production Partner Dashboard settings.
