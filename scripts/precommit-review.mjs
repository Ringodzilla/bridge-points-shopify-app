import { execFileSync, spawnSync } from "node:child_process";

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const stagedFiles = git(["diff", "--cached", "--name-status"]);

if (!stagedFiles) {
  console.log("pre-commit review: staged files are empty; skipping.");
  process.exit(0);
}

console.log("pre-commit review: staged changes");
console.log(stagedFiles);
console.log("");

run("git", ["diff", "--cached", "--check"]);

console.log("Review checklist:");
console.log("- diff is intentional and scoped");
console.log("- tests or verification fit the risk");
console.log("- Shopify config/API changes were validated when applicable");
console.log("");

if (process.env.BRIDGEPOINT_REVIEWED === "1") {
  console.log("BRIDGEPOINT_REVIEWED=1 set; review acknowledged.");
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("Set BRIDGEPOINT_REVIEWED=1 to acknowledge review in non-interactive commits.");
  process.exit(1);
}

process.stdout.write("Commit前レビューは完了していますか？ [y/N] ");

process.stdin.setEncoding("utf8");
process.stdin.resume();
process.stdin.once("data", (answer) => {
  const accepted = answer.trim().toLowerCase();

  if (accepted === "y" || accepted === "yes") {
    process.exit(0);
  }

  console.error("Commit aborted. Review the staged diff, then try again.");
  process.exit(1);
});
