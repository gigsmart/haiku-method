#!/usr/bin/env node
/**
 * Build the H·AI·K·U MCP server bundle.
 *
 * Runs pre-build steps (CSS, review SPA), then bundles with esbuild.
 * Injects Sentry DSNs via --define so they're baked into the binary
 * rather than read from env vars at runtime.
 */
import { execSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const repoRoot = join(root, "..", "..");
const outfile = join(repoRoot, "plugin", "bin", "haiku");

// Pre-build steps
execSync("node scripts/build-css.mjs", { cwd: root, stdio: "inherit" });
execSync("node scripts/build-review-app.mjs", { cwd: root, stdio: "inherit" });

// Build define flags — inline env vars at compile time
const defines = [];
const sentryDsn = process.env.HAIKU_SENTRY_DSN_MCP || "";
defines.push(`--define:process.env.HAIKU_SENTRY_DSN_MCP=${JSON.stringify(sentryDsn)}`);

const args = [
  "src/main.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--tree-shaking=true",
  "--sourcemap=external",
  `--outfile=${outfile}`,
  '--banner:js=import{createRequire}from"module";const require=createRequire(import.meta.url);',
  ...defines,
];

execSync(`npx esbuild ${args.join(" ")}`, { cwd: root, stdio: "inherit" });
chmodSync(outfile, 0o755);

console.error(`MCP server built -> ${outfile}`);
if (sentryDsn) {
  console.error(`Sentry DSN: baked in`);
} else {
  console.error(`Sentry DSN: not set (HAIKU_SENTRY_DSN_MCP empty)`);
}
