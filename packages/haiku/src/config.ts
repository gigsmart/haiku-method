// config.ts — Centralized configuration for H·AI·K·U
//
// All user-facing feature flags and tunable defaults live here. Environment
// variables are read once at module load. Import this module instead of
// reading process.env directly for Haiku-specific config.
//
// Plugin root resolution is centralized here so all consumers use the same
// logic: CLAUDE_PLUGIN_ROOT env var first, then self-resolve from the
// binary's own location (plugin/bin/haiku → plugin/).

import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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

/**
 * Return the plugin root directory, using this resolution order:
 *
 *   1. `CLAUDE_PLUGIN_ROOT` env var (set by Claude Code, or manually).
 *   2. Self-resolved from `process.argv[1]` — walks up from the bundled
 *      binary path (`plugin/bin/haiku` → plugin root) and validates the
 *      candidate by checking for `studios/` or `.claude-plugin/plugin.json`.
 *   3. Self-resolved from `import.meta.url` — same walk, but anchored on
 *      the running module file. Catches the Windows case where Claude
 *      Code does not inject `CLAUDE_PLUGIN_ROOT` and `argv[1]` is mangled
 *      by a `.cmd` shim or symlink.
 *   4. Empty string — graceful degradation so project-local studios still work.
 *
 * Memoized after the first call.
 *
 * **Side effect:** when path (2) or (3) succeeds, this function also
 * writes `process.env.CLAUDE_PLUGIN_ROOT = <resolved>` so that child
 * processes (hooks, spawned shells) inherit the same value without
 * re-running discovery. This is intentional — hooks rely on the env
 * var — but callers should be aware the function is not purely
 * functional.
 */
export function resolvePluginRoot(): string {
	if (_pluginRoot !== null) return _pluginRoot

	// 1. Explicit env var (Claude Code, or user-set)
	const envRoot = process.env.CLAUDE_PLUGIN_ROOT
	if (envRoot) {
		_pluginRoot = envRoot
		return _pluginRoot
	}

	// 2. Self-resolve from binary location
	// The esbuild bundle runs as plugin/bin/haiku.mjs. In the bundled
	// binary, process.argv[1] is the absolute path to the bundle file.
	const fromArgv = tryResolveFromPath(process.argv[1])
	if (fromArgv) {
		_pluginRoot = fromArgv
		process.env.CLAUDE_PLUGIN_ROOT = fromArgv
		console.error(`[haiku] Self-resolved plugin root from argv: ${fromArgv}`)
		return _pluginRoot
	}

	// 3. Self-resolve from import.meta.url — covers Windows cases where
	// Claude Code does not inject CLAUDE_PLUGIN_ROOT and argv[1] is mangled
	// by a `.cmd` shim or a symlink. import.meta.url always points at the
	// real on-disk module location.
	try {
		const modulePath = fileURLToPath(import.meta.url)
		const fromModule = tryResolveFromPath(modulePath)
		if (fromModule) {
			_pluginRoot = fromModule
			process.env.CLAUDE_PLUGIN_ROOT = fromModule
			console.error(
				`[haiku] Self-resolved plugin root from module: ${fromModule}`,
			)
			return _pluginRoot
		}
	} catch {
		/* fileURLToPath throws on non-file URLs; fall through to empty */
	}

	// 4. Fallback: empty string (graceful degradation — project studios still work)
	_pluginRoot = ""
	return _pluginRoot
}

/** Walk up from a binary or module path until we find a directory that
 *  looks like the plugin root (has `studios/` or `.claude-plugin/plugin.json`).
 *  Returns null when no candidate validates. Walks up to 6 levels so the
 *  same helper handles both the bundled binary (`plugin/bin/haiku.mjs`,
 *  2 levels up) and the source layout during dev
 *  (`packages/haiku/src/config.ts`, more levels up). */
function tryResolveFromPath(start: string | undefined): string | null {
	if (!start) return null
	let current = dirname(start)
	for (let i = 0; i < 6; i++) {
		if (
			existsSync(join(current, "studios")) ||
			existsSync(join(current, ".claude-plugin", "plugin.json"))
		) {
			return current
		}
		const parent = dirname(current)
		if (parent === current) return null
		current = parent
	}
	return null
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
	/**
	 * Origins permitted to make cross-origin requests to the MCP server when
	 * remote review is enabled. Populate with a comma-separated list of
	 * explicit origins via `HAIKU_REVIEW_ALLOWED_ORIGINS` (e.g.
	 * `https://haikumethod.ai,https://staging.haikumethod.ai`). When the env
	 * var is empty (the default), the effective allow-list collapses to
	 * `[siteUrl]`, which is the zero-config single-origin path.
	 *
	 * NEVER set this to `*` — the MCP server performs mutating actions and a
	 * wildcard here combined with the session-token-in-URL auth model would
	 * let any site the reviewer visits cross-origin mutate their state. The
	 * startup guard in `stripWildcardAllowedOrigins()` logs a warning and
	 * strips any `*` entry before it can be honored. Changes require a
	 * process restart because env vars are read once at module load.
	 */
	allowedOrigins: str("HAIKU_REVIEW_ALLOWED_ORIGINS", "")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean),
}

/**
 * Defense-in-depth: if the operator set `HAIKU_REVIEW_ALLOWED_ORIGINS=*` (or
 * included `*` in the CSV), warn loudly and strip it. Wildcard CORS combined
 * with this server's auth model is the exact attack pattern FB-36 closed.
 * Call this once at server startup after the config module has loaded.
 *
 * Returns the number of wildcard entries that were stripped, primarily for
 * test assertions.
 */
export function stripWildcardAllowedOrigins(): number {
	const before = review.allowedOrigins.length
	const cleaned = review.allowedOrigins.filter((o) => o !== "*")
	const stripped = before - cleaned.length
	if (stripped > 0) {
		console.warn(
			'[haiku] WARN: HAIKU_REVIEW_ALLOWED_ORIGINS contained "*". Ignoring — wildcard CORS is unsafe with this server\'s auth model. Set an explicit allow-list.',
		)
		review.allowedOrigins.length = 0
		review.allowedOrigins.push(...cleaned)
	}
	return stripped
}

/**
 * Observability configuration.
 *
 * OTEL/OTLP environment variables (`OTEL_EXPORTER_OTLP_*`, `OTEL_SERVICE_NAME`,
 * `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_LOGS_EXPORTER`) are read directly inside
 * `telemetry.ts` so tests can manipulate the env without re-importing this
 * module. This file only owns configuration that other modules consume.
 */
export const observability = {
	// Read via literal dot-notation so esbuild's --define can inline the baked-in
	// DSN at build time. Using str("HAIKU_SENTRY_DSN_MCP", "") here would route
	// through process.env[name] (dynamic access), which --define cannot rewrite,
	// leaving shipped binaries with an empty DSN.
	sentryDsn: process.env.HAIKU_SENTRY_DSN_MCP ?? "",
}
