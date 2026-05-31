import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const EXPECTED_APP_URL = "https://bridgepoint-shopify-app.fly.dev";
const EXPECTED_REDIRECT_URL = `${EXPECTED_APP_URL}/auth/callback`;
const EXPECTED_API_VERSION = "2026-04";
const EXPECTED_CONFIG_NAME = "bridgepoint";
const EXPECTED_UI_EXTENSION_PACKAGE = "2026.4";
const EXPECTED_SCOPES = [
  "read_customers",
  "read_orders",
  "read_store_credit_accounts",
  "read_store_credit_account_transactions",
  "write_store_credit_account_transactions",
];

const strictEnv = process.argv.includes("--strict-env");
const envFileArgIndex = process.argv.indexOf("--env-file");
const requestedEnvFile =
  envFileArgIndex >= 0 && process.argv[envFileArgIndex + 1]
    ? process.argv[envFileArgIndex + 1]
    : null;

const results = [];

function readTextFile(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function readJsonFile(relativePath) {
  return JSON.parse(readTextFile(relativePath));
}

function addResult(status, label, detail) {
  results.push({ status, label, detail });
}

function pass(label, detail = "") {
  addResult("pass", label, detail);
}

function warn(label, detail = "") {
  addResult("warn", label, detail);
}

function fail(label, detail = "") {
  addResult("fail", label, detail);
}

function extractTomlString(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  return match?.[1] ?? null;
}

function extractTomlArray(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escapedKey}\\s*=\\s*\\[(.*)\\]\\s*$`, "m"));

  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function normalizeScopes(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

function sameScopeSet(actualValue) {
  const actual = normalizeScopes(actualValue);

  if (actual.size !== EXPECTED_SCOPES.length) {
    return false;
  }

  return EXPECTED_SCOPES.every((scope) => actual.has(scope));
}

function parseEnvFile(relativePath) {
  const absolutePath = resolve(projectRoot, relativePath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(absolutePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    env[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return env;
}

function getReleaseEnv() {
  const envFiles = requestedEnvFile ? [requestedEnvFile] : [".env.production", ".env"];
  const fileEnv = envFiles.reduce(
    (accumulator, envFile) => ({
      ...accumulator,
      ...parseEnvFile(envFile),
    }),
    {},
  );

  return {
    ...fileEnv,
    ...process.env,
  };
}

function envIssue(label, detail) {
  if (strictEnv) {
    fail(label, detail);
  } else {
    warn(label, `${detail} (--strict-env では失敗扱い)`);
  }
}

function checkRequiredEnv(env, key) {
  if (!env[key]) {
    envIssue(`env:${key}`, "本番 secret として設定してください。");
    return;
  }

  pass(`env:${key}`, "値は設定されています。");
}

function getLinkedSupabaseProjectRef() {
  const linkedProjectPath = resolve(projectRoot, "supabase/.temp/linked-project.json");

  if (!existsSync(linkedProjectPath)) {
    return null;
  }

  try {
    const linkedProject = JSON.parse(readFileSync(linkedProjectPath, "utf8"));
    return typeof linkedProject.ref === "string" ? linkedProject.ref : null;
  } catch {
    return null;
  }
}

function checkSupabaseDirectUrl(env, key, projectRef) {
  if (!env[key]) {
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(env[key]);
  } catch {
    envIssue(`env:${key} direct`, "Postgres URL として解釈できません。");
    return;
  }

  const expectedHost = projectRef ? `db.${projectRef}.supabase.co` : null;
  const isDirectHost = expectedHost ? parsedUrl.hostname === expectedHost : /^db\..+\.supabase\.co$/.test(parsedUrl.hostname);
  const isDirectPort = parsedUrl.port === "5432";
  const isPostgresUser = parsedUrl.username === "postgres";
  const isPostgresDatabase = parsedUrl.pathname === "/postgres";

  if (isDirectHost && isDirectPort && isPostgresUser && isPostgresDatabase) {
    pass(`env:${key} direct`, `${parsedUrl.hostname}:5432/postgres`);
    return;
  }

  envIssue(
    `env:${key} direct`,
    `expected ${expectedHost ?? "db.[PROJECT_REF].supabase.co"}:5432 as postgres/postgres, got ${parsedUrl.username}@${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`,
  );
}

function checkConfigToml() {
  const config = readTextFile("shopify.app.bridgepoint.toml");
  const applicationUrl = extractTomlString(config, "application_url");
  const apiVersion = extractTomlString(config, "api_version");
  const scopes = extractTomlString(config, "scopes");
  const redirectUrls = extractTomlArray(config, "redirect_urls");

  applicationUrl === EXPECTED_APP_URL
    ? pass("app config application_url", applicationUrl)
    : fail("app config application_url", `expected ${EXPECTED_APP_URL}, got ${applicationUrl}`);

  apiVersion === EXPECTED_API_VERSION
    ? pass("webhook api_version", apiVersion)
    : fail("webhook api_version", `expected ${EXPECTED_API_VERSION}, got ${apiVersion}`);

  redirectUrls.length === 1 && redirectUrls[0] === EXPECTED_REDIRECT_URL
    ? pass("auth redirect_urls", EXPECTED_REDIRECT_URL)
    : fail("auth redirect_urls", `expected only ${EXPECTED_REDIRECT_URL}, got ${redirectUrls.join(", ")}`);

  sameScopeSet(scopes)
    ? pass("access scopes", scopes)
    : fail("access scopes", `expected ${EXPECTED_SCOPES.join(",")}, got ${scopes}`);

  for (const topic of [
    'topics = [ "orders/paid" ]',
    'compliance_topics = [ "customers/data_request" ]',
    'compliance_topics = [ "customers/redact" ]',
    'compliance_topics = [ "shop/redact" ]',
  ]) {
    config.includes(topic) ? pass(`webhook ${topic}`) : fail(`webhook ${topic}`, "subscription missing");
  }
}

function checkShopifyServer() {
  const server = readTextFile("app/shopify.server.ts");

  server.includes("ApiVersion.April26")
    ? pass("shopify.server apiVersion", "ApiVersion.April26")
    : fail("shopify.server apiVersion", "ApiVersion.April26 が見つかりません。");

  if (server.includes("ApiVersion.October25")) {
    fail("shopify.server old apiVersion", "ApiVersion.October25 が残っています。");
  }
}

function checkExtensions() {
  for (const extension of [
    "extensions/bridge-points-customer-action",
    "extensions/bridge-points-customer-block",
  ]) {
    const tomlPath = `${extension}/shopify.extension.toml`;
    const packagePath = `${extension}/package.json`;
    const toml = readTextFile(tomlPath);
    const packageJson = readJsonFile(packagePath);
    const apiVersion = extractTomlString(toml, "api_version");
    const uiExtensionsVersion = packageJson.dependencies?.["@shopify/ui-extensions"];

    apiVersion === EXPECTED_API_VERSION
      ? pass(`${tomlPath} api_version`, apiVersion)
      : fail(`${tomlPath} api_version`, `expected ${EXPECTED_API_VERSION}, got ${apiVersion}`);

    uiExtensionsVersion?.startsWith(EXPECTED_UI_EXTENSION_PACKAGE)
      ? pass(`${packagePath} @shopify/ui-extensions`, uiExtensionsVersion)
      : fail(
          `${packagePath} @shopify/ui-extensions`,
          `expected ${EXPECTED_UI_EXTENSION_PACKAGE}.x, got ${uiExtensionsVersion}`,
        );
  }
}

function checkPackageScripts() {
  const packageJson = readJsonFile("package.json");
  const scripts = packageJson.scripts ?? {};

  for (const scriptName of ["dev:bridge", "config:link", "deploy", "env"]) {
    const script = scripts[scriptName] ?? "";

    script.includes(`--config ${EXPECTED_CONFIG_NAME}`)
      ? pass(`script:${scriptName}`, script)
      : fail(`script:${scriptName}`, `--config ${EXPECTED_CONFIG_NAME} が必要です。`);
  }

  scripts["config:use"] === `npm run shopify -- app config use ${EXPECTED_CONFIG_NAME}`
    ? pass("script:config:use", scripts["config:use"])
    : fail("script:config:use", `app config use ${EXPECTED_CONFIG_NAME} を使ってください。`);

  scripts["release:validate-config"]?.includes(`--config ${EXPECTED_CONFIG_NAME}`)
    ? pass("script:release:validate-config", scripts["release:validate-config"])
    : fail("script:release:validate-config", "Shopify CLI config validate script が必要です。");
}

function checkFlyConfig() {
  const flyConfig = readTextFile("fly.toml");

  flyConfig.includes('app = "bridgepoint-shopify-app"')
    ? pass("fly app name", "bridgepoint-shopify-app")
    : fail("fly app name", "bridgepoint-shopify-app になっていません。");

  flyConfig.includes("auto_stop_machines = false")
    ? pass("fly auto_stop_machines", "false")
    : warn("fly auto_stop_machines", "false 推奨です。");

  flyConfig.includes("min_machines_running = 1")
    ? pass("fly min_machines_running", "1")
    : warn("fly min_machines_running", "1 推奨です。");
}

function checkProductionEnv() {
  const env = getReleaseEnv();
  const supabaseProjectRef = env.SUPABASE_PROJECT_REF || getLinkedSupabaseProjectRef();

  for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "DATABASE_URL", "DIRECT_URL"]) {
    checkRequiredEnv(env, key);
  }

  if (!env.SHOPIFY_APP_URL) {
    envIssue("env:SHOPIFY_APP_URL", `本番では ${EXPECTED_APP_URL} を設定してください。`);
  } else if (env.SHOPIFY_APP_URL === EXPECTED_APP_URL) {
    pass("env:SHOPIFY_APP_URL", EXPECTED_APP_URL);
  } else {
    envIssue("env:SHOPIFY_APP_URL", `expected ${EXPECTED_APP_URL}, got ${env.SHOPIFY_APP_URL}`);
  }

  if (!env.SCOPES) {
    envIssue("env:SCOPES", `本番では ${EXPECTED_SCOPES.join(",")} を設定してください。`);
  } else if (sameScopeSet(env.SCOPES)) {
    pass("env:SCOPES", env.SCOPES);
  } else {
    envIssue("env:SCOPES", `expected ${EXPECTED_SCOPES.join(",")}, got ${env.SCOPES}`);
  }

  if (!env.SHOPIFY_BILLING_TEST_MODE) {
    envIssue("env:SHOPIFY_BILLING_TEST_MODE", "本番では false を設定してください。");
  } else if (env.SHOPIFY_BILLING_TEST_MODE === "false") {
    pass("env:SHOPIFY_BILLING_TEST_MODE", "false");
  } else {
    envIssue(
      "env:SHOPIFY_BILLING_TEST_MODE",
      `本番課金では false が必要です。got ${env.SHOPIFY_BILLING_TEST_MODE}`,
    );
  }

  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!env[key]) {
      continue;
    }

    if (/^postgres(ql)?:\/\//.test(env[key])) {
      pass(`env:${key} postgres`, "Postgres URL 形式です。");
    } else {
      envIssue(`env:${key} postgres`, "本番では Supabase Postgres URL を設定してください。");
    }
  }

  checkSupabaseDirectUrl(env, "DATABASE_URL", supabaseProjectRef);
  checkSupabaseDirectUrl(env, "DIRECT_URL", supabaseProjectRef);

  if (env.DATABASE_URL && env.DIRECT_URL) {
    env.DATABASE_URL === env.DIRECT_URL
      ? pass("env:DATABASE_URL equals DIRECT_URL", "v1 direct connection 方針どおりです。")
      : envIssue("env:DATABASE_URL equals DIRECT_URL", "v1 では両方を direct connection に揃えてください。");
  }
}

function printResults() {
  console.log("BridgePoint release precheck");
  console.log("");

  for (const result of results) {
    const marker = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(`${marker} ${result.label}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  console.log("");
  console.log("Partner Dashboard に反映する値");
  console.log(`App URL: ${EXPECTED_APP_URL}`);
  console.log(`Redirect URL: ${EXPECTED_REDIRECT_URL}`);
  console.log(`Webhook API version: ${EXPECTED_API_VERSION}`);
  console.log(`Scopes: ${EXPECTED_SCOPES.join(",")}`);
  console.log("");
  console.log(
    strictEnv
      ? "strict-env: enabled"
      : "strict-env: disabled。環境変数も失敗扱いにする場合は `npm run release:precheck -- --strict-env` を使ってください。",
  );
}

checkConfigToml();
checkShopifyServer();
checkExtensions();
checkPackageScripts();
checkFlyConfig();
checkProductionEnv();
printResults();

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}
