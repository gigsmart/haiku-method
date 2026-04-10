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
 * Report an error to Sentry with session context.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
	if (!SENTRY_DSN) return
	const sessionCtx = getSessionContext()
	Sentry.withScope((scope) => {
		scope.setContext("session", sessionCtx)
		if (sessionCtx.CLAUDE_CODE_IS_COWORK) scope.setTag("cowork", sessionCtx.CLAUDE_CODE_IS_COWORK)
		if (sessionCtx.CLAUDE_MODEL) scope.setTag("model", sessionCtx.CLAUDE_MODEL)
		Sentry.captureException(err, { extra: context })
	})
}

/** Collect session metadata from environment for Sentry context. */
export function getSessionContext(): Record<string, string> {
	const ctx: Record<string, string> = {}
	const vars = [
		"CLAUDE_SESSION_ID",
		"CLAUDE_CODE_IS_COWORK",
		"CLAUDE_MODEL",
		"CLAUDE_CODE_VERSION",
		"CLAUDE_CONFIG_DIR",
		"CLAUDE_PLUGIN_ROOT",
	]
	for (const key of vars) {
		const val = process.env[key]
		if (val) ctx[key] = val
	}
	ctx.platform = process.platform
	ctx.node_version = process.version
	return ctx
}

/**
 * Submit user feedback to Sentry with session context.
 */
export function reportFeedback(message: string, contactEmail?: string, name?: string): void {
	if (!SENTRY_DSN) return
	const sessionCtx = getSessionContext()
	Sentry.withScope((scope) => {
		scope.setContext("session", sessionCtx)
		scope.setTag("feedback", "true")
		if (sessionCtx.CLAUDE_CODE_IS_COWORK) scope.setTag("cowork", sessionCtx.CLAUDE_CODE_IS_COWORK)
		if (sessionCtx.CLAUDE_MODEL) scope.setTag("model", sessionCtx.CLAUDE_MODEL)
		Sentry.captureFeedback({
			message,
			email: contactEmail,
			name: name || "H·AI·K·U User",
		})
	})
}
