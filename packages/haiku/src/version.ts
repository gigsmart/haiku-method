// version.ts — Baked-in and runtime version constants for H·AI·K·U
//
// MCP_VERSION is injected at build time via esbuild --define from plugin.json.
// getPluginVersion() reads plugin.json at runtime (may differ if the plugin
// files were updated but the binary wasn't rebuilt).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePluginRoot } from "./config.js"

/** MCP binary version — baked in at build time. "dev" in unbundled dev runs. */
export const MCP_VERSION: string =
	typeof process.env.HAIKU_MCP_VERSION === "string" &&
	process.env.HAIKU_MCP_VERSION !== ""
		? process.env.HAIKU_MCP_VERSION
		: "dev"

/** Read the plugin version from plugin.json at runtime. */
export function getPluginVersion(): string {
	try {
		const pluginRoot = resolvePluginRoot()
		if (pluginRoot) {
			const pkg = JSON.parse(
				readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"),
			)
			return pkg.version ?? "unknown"
		}
	} catch {
		/* */
	}
	return "unknown"
}
