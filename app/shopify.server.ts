import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  BillingReplacementBehavior,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  ADVANCED_PLAN_KEY,
  BILLING_CURRENCY_CODE,
  FREE_PLAN_KEY,
  OVERAGE_UNIT_PRICE_USD,
  PREMIUM_PLAN_KEY,
  UNLIMITED_PLAN_KEY,
  USAGE_CAP_USD,
} from "./lib/billing";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [FREE_PLAN_KEY]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 0,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Every30Days,
        },
        {
          amount: USAGE_CAP_USD,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Usage,
          terms:
            `月 100 件までは追加料金なし。101 件目以降の注文処理は 1 件あたり $${OVERAGE_UNIT_PRICE_USD.toFixed(2)} で、` +
            `30 日ごとの従量課金上限は $${USAGE_CAP_USD.toFixed(2)} です。`,
        },
      ],
    },
    [ADVANCED_PLAN_KEY]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 9,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Every30Days,
        },
        {
          amount: USAGE_CAP_USD,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Usage,
          terms:
            `月 500 件までは追加料金なし。501 件目以降の注文処理は 1 件あたり $${OVERAGE_UNIT_PRICE_USD.toFixed(2)} で、` +
            `30 日ごとの従量課金上限は $${USAGE_CAP_USD.toFixed(2)} です。`,
        },
      ],
    },
    [PREMIUM_PLAN_KEY]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 19,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Every30Days,
        },
        {
          amount: USAGE_CAP_USD,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Usage,
          terms:
            `月 1000 件までは追加料金なし。1001 件目以降の注文処理は 1 件あたり $${OVERAGE_UNIT_PRICE_USD.toFixed(2)} で、` +
            `30 日ごとの従量課金上限は $${USAGE_CAP_USD.toFixed(2)} です。`,
        },
      ],
    },
    [UNLIMITED_PLAN_KEY]: {
      replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
      lineItems: [
        {
          amount: 39,
          currencyCode: BILLING_CURRENCY_CODE,
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
