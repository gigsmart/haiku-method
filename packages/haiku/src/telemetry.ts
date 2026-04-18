// telemetry.ts — OTEL telemetry for H·AI·K·U
//
// Sends structured log events to an OTLP/HTTP+JSON endpoint. Honors the
// standard OpenTelemetry environment variables (per-signal overrides take
// precedence over generic ones) plus Claude Code's `otelHeadersHelper`
// settings field for dynamic auth headers. Fire-and-forget — never blocks,
// never throws.

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { features } from "./config.js"

const ENABLED = features.telemetry

// Read the env directly — not via config.observability — so the resolvers
// below reflect the current process env rather than a snapshot taken when
// config.ts was first imported. This matters for tests that manipulate env.
function env(name: string): string {
	return (process.env[name] ?? "").trim()
}

// ── Header parsing ────────────────────────────────────────────────────────
//
// OTEL spec says OTLP header values are W3C-Baggage-encoded: percent-decode the
// value, leave the key as-is. A single `=` splits key from value; subsequent
// `=` characters belong to the value (e.g. base64 padding).

function parseHeaders(raw: string): Record<string, string> {
	const out: Record<string, string> = {}
	if (!raw) return out
	for (const pair of raw.split(",")) {
		const trimmed = pair.trim()
		if (!trimmed) continue
		const eq = trimmed.indexOf("=")
		if (eq <= 0) continue
		const key = trimmed.slice(0, eq).trim()
		const valueRaw = trimmed.slice(eq + 1).trim()
		if (!key) continue
		let value = valueRaw
		try {
			value = decodeURIComponent(valueRaw)
		} catch {
			// Leave value unchanged if it isn't valid percent-encoding.
		}
		out[key] = value
	}
	return out
}

// ── Resolved OTLP settings ────────────────────────────────────────────────
//
// Per OTEL spec, per-signal variables REPLACE the generic ones when set.
// Endpoints follow two different rules:
//   - OTEL_EXPORTER_OTLP_ENDPOINT: base URL — we append `/v1/logs`
//   - OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: full URL — used as-is, no appending

function resolveEndpoint(): string {
	const signal = env("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT")
	if (signal) return signal
	const base =
		(env("OTEL_EXPORTER_OTLP_ENDPOINT") || "http://localhost:4318").replace(
			/\/$/,
			"",
		)
	return `${base}/v1/logs`
}

function resolveHeaders(): Record<string, string> {
	const signalRaw = env("OTEL_EXPORTER_OTLP_LOGS_HEADERS")
	if (signalRaw) return parseHeaders(signalRaw)
	return parseHeaders(env("OTEL_EXPORTER_OTLP_HEADERS"))
}

function resolveProtocol(): string {
	const signal = env("OTEL_EXPORTER_OTLP_LOGS_PROTOCOL")
	if (signal) return signal
	const generic = env("OTEL_EXPORTER_OTLP_PROTOCOL")
	// When unset, treat as http/json since that is what this exporter emits.
	// The OTEL spec default is http/protobuf, but we only implement JSON and
	// defaulting to skip would silently disable telemetry for most users.
	return generic || "http/json"
}

function resolveTimeoutMs(): number {
	const signal = Number(env("OTEL_EXPORTER_OTLP_LOGS_TIMEOUT"))
	if (Number.isFinite(signal) && signal > 0) return signal
	const generic = Number(env("OTEL_EXPORTER_OTLP_TIMEOUT"))
	if (Number.isFinite(generic) && generic > 0) return generic
	return 10_000 // OTEL spec default
}

function resolveLogsExporter(): string {
	return env("OTEL_LOGS_EXPORTER").toLowerCase() || "otlp"
}

// ── Claude Code settings ──────────────────────────────────────────────────
//
// Claude Code lets users configure `otelHeadersHelper` in settings.json — a
// path to a script whose stdout is a JSON object of header key/value pairs.
// This is the standard mechanism for rotating auth tokens (Authorization
// bearer, short-lived API keys). We merge those headers on top of the env-
// var headers so the helper wins on conflict.
//
// Settings resolution matches Claude Code's precedence for non-managed
// scopes: local > project > user. Missing files or JSON parse errors are
// silently skipped so broken settings.json doesn't kill telemetry.

function readJsonFile(path: string): Record<string, unknown> | null {
	try {
		const raw = readFileSync(path, "utf8")
		const parsed = JSON.parse(raw)
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>
		}
	} catch {
		// missing file or parse error
	}
	return null
}

function loadClaudeCodeSettings(): Record<string, unknown> {
	const merged: Record<string, unknown> = {}
	const home = homedir()
	const cwd = process.cwd()
	const candidates = [
		home ? join(home, ".claude", "settings.json") : null,
		join(cwd, ".claude", "settings.json"),
		join(cwd, ".claude", "settings.local.json"),
	].filter((p): p is string => p !== null)
	for (const p of candidates) {
		const parsed = readJsonFile(p)
		if (parsed) Object.assign(merged, parsed)
	}
	return merged
}

function resolveOtelHeadersHelperPath(): string {
	const settings = loadClaudeCodeSettings()
	const value = settings.otelHeadersHelper
	return typeof value === "string" ? value.trim() : ""
}

// Helper cache — Claude Code defaults to a 29-minute debounce, overridable
// via CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS. Matches upstream behavior
// so users who already tuned that env var see the same effect here.
const HELPER_DEBOUNCE_DEFAULT_MS = 1_740_000
let helperHeadersCache: Record<string, string> | null = null
let helperHeadersFetchedAt = 0

function helperDebounceMs(): number {
	const raw = Number(env("CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS"))
	if (Number.isFinite(raw) && raw > 0) return raw
	return HELPER_DEBOUNCE_DEFAULT_MS
}

function invokeHelper(path: string): Record<string, string> | null {
	const result = spawnSync(path, [], {
		encoding: "utf8",
		shell: true,
		timeout: 10_000,
	})
	if (result.status !== 0) {
		const stderr = (result.stderr || "").trim()
		console.error(
			`[haiku/telemetry] otelHeadersHelper exited ${result.status}${stderr ? `: ${stderr}` : ""}`,
		)
		return null
	}
	const stdout = (result.stdout || "").trim()
	if (!stdout) {
		console.error(
			"[haiku/telemetry] otelHeadersHelper did not return a valid value",
		)
		return null
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(stdout)
	} catch (e) {
		console.error(
			`[haiku/telemetry] otelHeadersHelper output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
		)
		return null
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		console.error(
			"[haiku/telemetry] otelHeadersHelper must return a JSON object with string key-value pairs",
		)
		return null
	}
	const validated: Record<string, string> = {}
	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value !== "string") {
			console.error(
				`[haiku/telemetry] otelHeadersHelper returned non-string value for key "${key}": ${typeof value}`,
			)
			return null
		}
		validated[key] = value
	}
	return validated
}

function resolveHelperHeaders(): Record<string, string> {
	const path = resolveOtelHeadersHelperPath()
	if (!path) return {}
	const ttl = helperDebounceMs()
	if (
		helperHeadersCache &&
		Date.now() - helperHeadersFetchedAt < ttl
	) {
		return helperHeadersCache
	}
	const fresh = invokeHelper(path)
	if (fresh) {
		helperHeadersCache = fresh
		helperHeadersFetchedAt = Date.now()
		return fresh
	}
	// Fall back to last known good value so a transient helper failure doesn't
	// drop auth headers for the rest of the debounce window.
	return helperHeadersCache ?? {}
}

/** Reset the helper cache. Exposed for tests. */
function resetHelperCache(): void {
	helperHeadersCache = null
	helperHeadersFetchedAt = 0
}

function resolveResourceAttrs(): Array<{
	key: string
	value: { stringValue: string }
}> {
	const map = new Map<string, string>()
	map.set("service.name", "haiku")
	// OTEL_RESOURCE_ATTRIBUTES first — may set service.name.
	for (const pair of env("OTEL_RESOURCE_ATTRIBUTES").split(",")) {
		const trimmed = pair.trim()
		if (!trimmed) continue
		const eq = trimmed.indexOf("=")
		if (eq <= 0) continue
		const key = trimmed.slice(0, eq).trim()
		const valueRaw = trimmed.slice(eq + 1).trim()
		if (!key) continue
		let value = valueRaw
		try {
			value = decodeURIComponent(valueRaw)
		} catch {
			// keep raw
		}
		map.set(key, value)
	}
	// OTEL_SERVICE_NAME overrides any service.name in resource attrs.
	const serviceName = env("OTEL_SERVICE_NAME")
	if (serviceName) map.set("service.name", serviceName)

	const attrs: Array<{ key: string; value: { stringValue: string } }> = []
	for (const [key, value] of map) {
		attrs.push({ key, value: { stringValue: value } })
	}
	return attrs
}

const ENDPOINT = resolveEndpoint()
const HEADERS = resolveHeaders()
const PROTOCOL = resolveProtocol()
const TIMEOUT_MS = resolveTimeoutMs()
const RESOURCE_ATTRS = resolveResourceAttrs()

// ── Guardrails ────────────────────────────────────────────────────────────
//
// Decide at module load whether this process will ever emit telemetry. We
// silently disable in two cases:
//   1. OTEL_LOGS_EXPORTER is explicitly "none" (or any non-otlp value other
//      than the empty string / "otlp").
//   2. The resolved protocol is anything other than "http/json". We don't
//      ship a protobuf or gRPC encoder, so emitting JSON to a collector
//      configured for protobuf would just produce 4xx errors.
//
// We warn once (to stderr) when telemetry is disabled due to protocol
// mismatch, so users troubleshooting auth issues can tell the difference
// between "exporter skipped my request" and "endpoint rejected it".

const exporterKind = resolveLogsExporter()
const EXPORTER_SENDS = exporterKind === "otlp"
const PROTOCOL_SENDS = PROTOCOL === "http/json"

if (ENABLED && !EXPORTER_SENDS && exporterKind !== "none") {
	console.error(
		`[haiku/telemetry] OTEL_LOGS_EXPORTER="${exporterKind}" not supported — telemetry disabled. Use "otlp" or unset.`,
	)
}
if (ENABLED && EXPORTER_SENDS && !PROTOCOL_SENDS) {
	console.error(
		`[haiku/telemetry] OTLP protocol "${PROTOCOL}" not supported — only http/json is implemented. Telemetry disabled.`,
	)
}

const WILL_SEND = ENABLED && EXPORTER_SENDS && PROTOCOL_SENDS

/**
 * Emit a telemetry event. Fire-and-forget — never blocks, never throws.
 */
export function emitTelemetry(
	eventName: string,
	attributes: Record<string, string> = {},
): void {
	if (!WILL_SEND) return

	const timeNanos = `${Date.now()}000000`
	const logAttrs = [
		{ key: "event.name", value: { stringValue: eventName } },
		...Object.entries(attributes).map(([k, v]) => ({
			key: k,
			value: { stringValue: v },
		})),
	]

	const payload = JSON.stringify({
		resourceLogs: [
			{
				resource: { attributes: RESOURCE_ATTRS },
				scopeLogs: [
					{
						scope: { name: "haiku" },
						logRecords: [
							{
								timeUnixNano: timeNanos,
								severityNumber: 9,
								severityText: "INFO",
								body: { stringValue: eventName },
								attributes: logAttrs,
							},
						],
					},
				],
			},
		],
	})

	// Merge env-var headers with helper-provided headers each send. The helper
	// cache debounces invocations, so a hot path still only spawns the helper
	// once per debounce window.
	const helperHeaders = resolveHelperHeaders()
	const mergedHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		...HEADERS,
		...helperHeaders,
	}

	fetch(ENDPOINT, {
		method: "POST",
		headers: mergedHeaders,
		body: payload,
		signal: AbortSignal.timeout(TIMEOUT_MS),
	}).catch(() => {}) // Silently swallow errors
}

// ── Exposed for tests ─────────────────────────────────────────────────────

export const __test = {
	parseHeaders,
	resolveEndpoint,
	resolveHeaders,
	resolveProtocol,
	resolveTimeoutMs,
	resolveResourceAttrs,
	resolveHelperHeaders,
	resolveOtelHeadersHelperPath,
	loadClaudeCodeSettings,
	resetHelperCache,
}
