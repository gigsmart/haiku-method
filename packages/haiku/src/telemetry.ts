// telemetry.ts — OTEL telemetry for H·AI·K·U
//
// Sends structured log events to an OTLP/JSON endpoint.
// Replaces plugin/lib/telemetry.sh — all telemetry now lives in the binary.
//
// Automatically called by state tool handlers — no manual invocation needed.
// The caller changes state; telemetry is a side effect.

import { features, observability } from "./config.js"

const ENABLED = features.telemetry
const ENDPOINT = observability.otlpEndpoint
const HEADERS = parseHeaders(observability.otlpHeadersRaw)
const RESOURCE_ATTRS = parseResourceAttrs(observability.resourceAttrsRaw)

function parseHeaders(raw: string): Record<string, string> {
	const h: Record<string, string> = {}
	for (const pair of raw.split(",").filter(Boolean)) {
		const [k, v] = pair.split("=", 2)
		if (k && v) h[k] = v
	}
	return h
}

function parseResourceAttrs(
	raw: string,
): Array<{ key: string; value: { stringValue: string } }> {
	const attrs = [{ key: "service.name", value: { stringValue: "haiku" } }]
	for (const pair of raw.split(",").filter(Boolean)) {
		const [k, v] = pair.split("=", 2)
		if (k && v) attrs.push({ key: k, value: { stringValue: v } })
	}
	return attrs
}

/**
 * Emit a telemetry event. Fire-and-forget — never blocks, never throws.
 */
export function emitTelemetry(
	eventName: string,
	attributes: Record<string, string> = {},
): void {
	if (!ENABLED) return

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

	// Fire and forget — use fetch (available in Node 18+)
	fetch(`${ENDPOINT}/v1/logs`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...HEADERS },
		body: payload,
		signal: AbortSignal.timeout(5000),
	}).catch(() => {}) // Silently swallow errors
}
