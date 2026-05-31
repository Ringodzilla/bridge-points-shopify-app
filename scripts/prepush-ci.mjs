import { spawnSync } from "node:child_process";

if (process.env.BRIDGEPOINT_SKIP_PREPUSH === "1") {
  console.log("BRIDGEPOINT_SKIP_PREPUSH=1 set; skipping local pre-push CI.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "ci:local"], { stdio: "inherit" });

process.exit(result.status ?? 1);
