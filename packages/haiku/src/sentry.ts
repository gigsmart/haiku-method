// sentry.ts — Lightweight Sentry error reporting for H·AI·K·U MCP server
//
// Uses Sentry's HTTP store API directly to avoid pulling in @sentry/node,
// which would significantly increase the compiled binary size.
// All calls are fire-and-forget — errors in reporting are silently swallowed.

const SENTRY_DSN = process.env.SENTRY_DSN_MCP

/**
 * Report an error to Sentry via the HTTP store API.
 * Fire-and-forget — never blocks, never throws.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
	if (!SENTRY_DSN) return
	try {
		const { protocol, host, pathname, username } = new URL(SENTRY_DSN)
		const projectId = pathname.replace("/", "")
		const url = `${protocol}//${host}/api/${projectId}/store/`
		const message = err instanceof Error ? err.message : String(err)
		const stack = err instanceof Error ? err.stack : undefined

		fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${username}`,
			},
			body: JSON.stringify({
				event_id: crypto.randomUUID().replace(/-/g, ""),
				timestamp: new Date().toISOString(),
				platform: "node",
				level: "error",
				logger: "haiku-mcp",
				message: { formatted: message },
				exception: stack
					? {
							values: [
								{
									type: err instanceof Error ? err.constructor.name : "Error",
									value: message,
									stacktrace: { frames: parseStack(stack) },
								},
							],
						}
					: undefined,
				extra: context,
			}),
			signal: AbortSignal.timeout(5000),
		}).catch(() => {}) // fire-and-forget
	} catch {
		/* non-fatal */
	}
}

function parseStack(
	stack: string,
): Array<{ filename: string; lineno: number; function: string }> {
	return stack
		.split("\n")
		.slice(1)
		.map((line) => {
			const m =
				line.match(/at (.+?) \((.+?):(\d+):\d+\)/) ||
				line.match(/at (.+?):(\d+):\d+/)
			if (!m) return { filename: "unknown", lineno: 0, function: "unknown" }
			return {
				filename: m[2] || m[1],
				lineno: parseInt(m[3] || m[2], 10),
				function: m[1] || "anonymous",
			}
		})
		.reverse()
}
