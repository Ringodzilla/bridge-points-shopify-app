import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readTextFile(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function readJsonFile(relativePath) {
  return JSON.parse(readTextFile(relativePath));
}

function extractTomlString(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  return match?.[1] ?? null;
}

function getStablePreviewUrl() {
  const config = readTextFile("shopify.app.bridgepoint.toml");
  const project = readJsonFile(".shopify/project.json");
  const clientId = extractTomlString(config, "client_id");

  if (!clientId) {
    throw new Error("shopify.app.bridgepoint.toml から client_id を取得できませんでした。");
  }

  const projectEntry = project?.[clientId];
  const devStoreUrl = projectEntry?.dev_store_url;

  if (!devStoreUrl) {
    throw new Error(".shopify/project.json から dev_store_url を取得できませんでした。");
  }

  const storeHandle = devStoreUrl.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/apps/${clientId}?dev-console=show`;
}

function getCurrentTunnelUrl() {
  const manifestPath = resolve(projectRoot, ".shopify/dev-bundle/manifest.json");

  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifest = readJsonFile(".shopify/dev-bundle/manifest.json");
  const appHome = manifest.modules?.find((module) => module.type === "app_home");
  return appHome?.config?.app_url ?? null;
}

async function getTunnelHealth(url) {
  if (!url) {
    return "unavailable";
  }

  try {
    const host = new URL(url).hostname;
    await lookup(host);
    return "resolvable";
  } catch {
    return "unresolvable";
  }
}

function openUrl(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  spawn(command, [url], {
    stdio: "ignore",
    detached: true,
  }).unref();
}

async function main() {
  const stablePreviewUrl = getStablePreviewUrl();
  const currentTunnelUrl = getCurrentTunnelUrl();
  const tunnelHealth = await getTunnelHealth(currentTunnelUrl);
  const shouldOpen = process.argv.includes("--open");

  console.log("BridgePoint dev preview");
  console.log("");
  console.log(`Stable preview URL: ${stablePreviewUrl}`);
  console.log(`Current tunnel URL: ${currentTunnelUrl ?? "未起動"}`);
  console.log(
    `Tunnel status: ${
      tunnelHealth === "resolvable"
        ? "利用可能"
        : tunnelHealth === "unresolvable"
          ? "名前解決不可"
          : "未確認"
    }`,
  );
  console.log("");
  console.log("Tips:");
  console.log("- ブックマークするのは trycloudflare URL ではなく Stable preview URL にしてください。");
  console.log("- 読み込みが止まるときは、まずハードリロード、その次に Dev Console の「開発プレビューをクリーンアップ」です。");
  console.log("- Tunnel status が名前解決不可なら、`npm run dev:bridge` を再起動してください。");

  if (shouldOpen) {
    openUrl(stablePreviewUrl);
    console.log("");
    console.log("Stable preview URL を開きました。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
