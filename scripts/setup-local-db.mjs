import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const prismaDir = path.join(projectRoot, "prisma");
const dbPath = path.join(prismaDir, "dev.sqlite");
const bootstrapPath = path.join(prismaDir, "local-session-bootstrap.sql");

const upgrades = [
  {
    table: "ShopSettings",
    column: "defaultGrantCurrencyCode",
    sql: 'ALTER TABLE "ShopSettings" ADD COLUMN "defaultGrantCurrencyCode" TEXT;',
  },
];

function runSql(sql) {
  execFileSync("sqlite3", [dbPath], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function hasColumn(table, column) {
  const result = execFileSync("sqlite3", [dbPath, `PRAGMA table_info("${table}");`], {
    encoding: "utf8",
  });

  return result.split("\n").some((line) => line.includes(`|${column}|`));
}

mkdirSync(prismaDir, { recursive: true });
runSql(readFileSync(bootstrapPath, "utf8"));
runSql(`
  DROP TABLE IF EXISTS "InviteDelivery";
  DROP TABLE IF EXISTS "InviteJob";
`);

for (const upgrade of upgrades) {
  if (!hasColumn(upgrade.table, upgrade.column)) {
    runSql(upgrade.sql);
  }
}
