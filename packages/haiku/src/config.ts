// config.ts — Centralized configuration for H·AI·K·U
//
// All user-facing feature flags and tunable defaults live here. Environment
// variables are read once at module load. Import this module instead of
// reading process.env directly for Haiku-specific config.
//
// Harness-provided env vars (CLAUDE_PLUGIN_ROOT, CLAUDE_CONFIG_DIR,
// CLAUDE_SESSION_ID, HOME) are NOT centralized — they're environment inputs,
// not configuration, and are read inline where needed.

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
	return process.env[name] ?? defaultValue
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

/** Observability configuration. */
export const observability = {
	sentryDsn: str("HAIKU_SENTRY_DSN_MCP", ""),
	otlpEndpoint: str(
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"http://localhost:4317",
	).replace(/\/$/, ""),
	otlpHeadersRaw: str("OTEL_EXPORTER_OTLP_HEADERS", ""),
	resourceAttrsRaw: str("OTEL_RESOURCE_ATTRIBUTES", ""),
}
