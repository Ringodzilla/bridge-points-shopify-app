import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const { errors } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="BridgePoint">
          <s-text>
            BridgePoint は Shopify 管理画面または Shopify App Store から起動します。
            直接ログインするためのショップ URL 入力フォームは提供していません。
          </s-text>
          {errors.shop ? (
            <s-banner tone="critical">
              Shopify 管理画面の Apps から BridgePoint を開いてください。
            </s-banner>
          ) : null}
        </s-section>
      </s-page>
    </AppProvider>
  );
}
