#!/usr/bin/env node
/**
 * Build the H·AI·K·U MCP server bundle.
 *
 * Bundles with esbuild and injects Sentry DSNs via --define so they're
 * baked into the binary rather than read from env vars at runtime.
 *
 * Pre-build steps (CSS, review SPA) are handled by package.json's
 * "prebuild" hook — this script only handles the esbuild step.
 */
import { spawnSync } from "node:child_process"
import { chmodSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, "..")
const repoRoot = join(root, "..", "..")
const outfile = join(repoRoot, "plugin", "bin", "haiku")

// Build define flags — inline env vars at compile time
const sentryDsn = process.env.HAIKU_SENTRY_DSN_MCP || ""

// Read plugin version and bake it into the binary
const pluginJson = JSON.parse(
	readFileSync(
		join(repoRoot, "plugin", ".claude-plugin", "plugin.json"),
		"utf8",
	),
)
const mcpVersion = pluginJson.version

const args = [
	"src/main.ts",
	"--bundle",
	"--platform=node",
	"--format=esm",
	"--tree-shaking=true",
	"--sourcemap=external",
	`--outfile=${outfile}`,
	'--banner:js=import{createRequire}from"module";const require=createRequire(import.meta.url);',
	`--define:process.env.HAIKU_SENTRY_DSN_MCP=${JSON.stringify(sentryDsn)}`,
	`--define:process.env.HAIKU_MCP_VERSION=${JSON.stringify(mcpVersion)}`,
]

const result = spawnSync("npx", ["esbuild", ...args], {
	cwd: root,
	stdio: "inherit",
})
if (result.status !== 0) {
	process.exit(result.status || 1)
}
chmodSync(outfile, 0o755)

console.error(`MCP server built -> ${outfile}`)
console.error(`MCP version: ${mcpVersion} (baked in)`)
if (sentryDsn) {
	console.error("Sentry DSN: baked in")
} else {
	console.error("Sentry DSN: not set (HAIKU_SENTRY_DSN_MCP empty)")
}
