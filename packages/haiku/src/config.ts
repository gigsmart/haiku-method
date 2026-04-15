// config.ts — Centralized configuration for H·AI·K·U
//
// All user-facing feature flags and tunable defaults live here. Environment
// variables are read once at module load. Import this module instead of
// reading process.env directly for Haiku-specific config.
//
// Plugin root resolution is centralized here so all consumers use the same
// logic: CLAUDE_PLUGIN_ROOT env var first, then self-resolve from the
// binary's own location (plugin/bin/haiku → plugin/).

import { dirname, join } from "node:path"
import { existsSync } from "node:fs"

function flag(name: string, defaultValue: boolean): boolean {
	const raw = process.env[name]
	if (raw === undefined) return defaultValue
	const v = raw.trim().toLowerCase()
	if (v === "1" || v === "true" || v === "yes" || v === "on") return true
	if (v === "0" || v === "false" || v === "no" || v === "off" || v === "")
		return false
	return defaultValue
}

function str(name: string, defaultValue: string): string {
	const raw = process.env[name]
	if (raw === undefined || raw === "") return defaultValue
	return raw
}

// ── Plugin root resolution ─────────────────────────────────────────────────
//
// Claude Code sets CLAUDE_PLUGIN_ROOT automatically. Other harnesses don't.
// When unset, we derive it from the running binary's path:
//   binary at: /path/to/plugin/bin/haiku
//   plugin root: /path/to/plugin/
//
// Cached after first resolution. All consumers should import pluginRoot
// from this module instead of reading CLAUDE_PLUGIN_ROOT directly.

let _pluginRoot: string | null = null

export function resolvePluginRoot(): string {
	if (_pluginRoot !== null) return _pluginRoot

	// 1. Explicit env var (Claude Code, or user-set)
	const envRoot = process.env.CLAUDE_PLUGIN_ROOT
	if (envRoot) {
		_pluginRoot = envRoot
		return _pluginRoot
	}

	// 2. Self-resolve from binary location
	// The esbuild bundle runs as plugin/bin/haiku. In the bundled binary,
	// process.argv[1] is the absolute path to the binary.
	const binaryPath = process.argv[1]
	if (binaryPath) {
		// binary at plugin/bin/haiku → plugin root is dirname(dirname(binary))
		const candidate = dirname(dirname(binaryPath))
		// Validate by checking for a known marker file
		if (
			existsSync(join(candidate, "studios")) ||
			existsSync(join(candidate, ".claude-plugin", "plugin.json"))
		) {
			_pluginRoot = candidate
			// Also set the env var so hooks and child processes pick it up
			process.env.CLAUDE_PLUGIN_ROOT = candidate
			console.error(`[haiku] Self-resolved plugin root: ${candidate}`)
			return _pluginRoot
		}
	}

	// 3. Fallback: empty string (graceful degradation — project studios still work)
	_pluginRoot = ""
	return _pluginRoot
}

/** Feature flags. */
export const features = {
	/** Cascading model selection: unit > hat > stage > studio resolution. */
	modelSelection: flag("HAIKU_MODEL_SELECTION", true),
	/** Remote review via tunnel. */
	remoteReview: flag("HAIKU_REMOTE_REVIEW", false),
	/** OTEL telemetry export. */
	telemetry: flag("CLAUDE_CODE_ENABLE_TELEMETRY", false),
}

/** Review-related configuration. */
export const review = {
	siteUrl: str("HAIKU_REVIEW_SITE_URL", "https://haikumethod.ai"),
}

/** Auto-update configuration. */
export const autoUpdate = {
	/** Kill-switch: set HAIKU_AUTO_UPDATE=0 to disable. */
	enabled: flag("HAIKU_AUTO_UPDATE", true),
	/** How often to poll GitHub releases (ms). Default 30 min. */
	intervalMs: Number(str("HAIKU_UPDATE_INTERVAL_MS", "1800000")) || 1_800_000,
	/** Delay before the first check (ms). Default 60 s. */
	initialDelayMs:
		Number(str("HAIKU_UPDATE_INITIAL_DELAY_MS", "60000")) || 60_000,
}

/** Observability configuration. */
export const observability = {
	// Read via literal dot-notation so esbuild's --define can inline the baked-in
	// DSN at build time. Using str("HAIKU_SENTRY_DSN_MCP", "") here would route
	// through process.env[name] (dynamic access), which --define cannot rewrite,
	// leaving shipped binaries with an empty DSN.
	sentryDsn: process.env.HAIKU_SENTRY_DSN_MCP ?? "",
	otlpEndpoint: str(
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"http://localhost:4317",
	).replace(/\/$/, ""),
	otlpHeadersRaw: str("OTEL_EXPORTER_OTLP_HEADERS", ""),
	resourceAttrsRaw: str("OTEL_RESOURCE_ATTRIBUTES", ""),
}
