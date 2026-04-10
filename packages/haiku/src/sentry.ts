// sentry.ts — Sentry integration for H·AI·K·U MCP server

import * as Sentry from "@sentry/node"

const SENTRY_DSN = process.env.HAIKU_SENTRY_DSN_MCP || ""

// Read version for release tagging — tries plugin.json at CLAUDE_PLUGIN_ROOT
function getRelease(): string {
	try {
		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
		if (pluginRoot) {
			const { readFileSync } = require("node:fs")
			const { join } = require("node:path")
			const pkg = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"))
			return `haiku-mcp@${pkg.version}`
		}
	} catch { /* */ }
	return "haiku-mcp@dev"
}

if (SENTRY_DSN) {
	Sentry.init({
		dsn: SENTRY_DSN,
		release: getRelease(),
		tracesSampleRate: 0,
	})
}

/**
 * Report an error to Sentry.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
	if (!SENTRY_DSN) return
	Sentry.captureException(err, { extra: context })
}

/**
 * Submit user feedback to Sentry.
 */
export function reportFeedback(message: string, contactEmail?: string, name?: string): void {
	if (!SENTRY_DSN) return
	Sentry.captureFeedback({
		message,
		email: contactEmail,
		name: name || "H·AI·K·U User",
	})
}
