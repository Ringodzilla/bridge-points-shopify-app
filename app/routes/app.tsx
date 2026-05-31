import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { getBridgePointsBillingGate } from "../lib/billing.server";
import { authenticate } from "../shopify.server";

const BILLING_OPEN_PATHS = new Set([
  "/app/billing",
  "/app/release-readiness",
]);

function isBillingOpenPath(pathname: string) {
  return BILLING_OPEN_PATHS.has(pathname);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  if (!isBillingOpenPath(url.pathname)) {
    const gate = await getBridgePointsBillingGate({
      billing,
      shop: session.shop,
    });

    if (!gate.hasActivePayment) {
      const params = new URLSearchParams({
        billingRequired: "1",
        returnTo: `${url.pathname}${url.search}`,
      });

      if (gate.error) {
        params.set("billingError", gate.error);
      }

      throw redirect(`/app/billing?${params.toString()}`);
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app">ダッシュボード</a>
        <a href="/app/manual-credit">手動付与</a>
        <a href="/app/settings">設定</a>
        <a href="/app/flow-setup">Flow 自動付与</a>
        <a href="/app/billing">プラン</a>
        <a href="/app/release-readiness">公開準備</a>
      </NavMenu>
      <div className="rnk-nav-note">
        この段階では BridgePoint の最初の縦切りとして、
        Store Credit の手動付与、顧客詳細からの特別付与、ログ保存、課金導線、
        開発ストアでの検証基盤を優先しています。
      </div>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
