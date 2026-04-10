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

/** Apply session context as Sentry scope tags and context. */
function applySessionContext(scope: Sentry.Scope, sessionCtx?: Record<string, string>): void {
	if (!sessionCtx || Object.keys(sessionCtx).length === 0) return
	scope.setContext("session", sessionCtx)
	if (sessionCtx.CLAUDE_CODE_IS_COWORK) scope.setTag("cowork", sessionCtx.CLAUDE_CODE_IS_COWORK)
	if (sessionCtx.CLAUDE_MODEL) scope.setTag("model", sessionCtx.CLAUDE_MODEL)
	if (sessionCtx.CLAUDE_SESSION_ID) scope.setTag("session_id", sessionCtx.CLAUDE_SESSION_ID)
	if (sessionCtx.CLAUDE_CODE_ENTRYPOINT) scope.setTag("entrypoint", sessionCtx.CLAUDE_CODE_ENTRYPOINT)
}

/**
 * Report an error to Sentry with session context.
 * Session context is injected by the PreToolUse hook from the Claude Code process.
 */
export function reportError(err: unknown, context?: Record<string, unknown>, sessionCtx?: Record<string, string>): void {
	if (!SENTRY_DSN) return
	Sentry.withScope((scope) => {
		applySessionContext(scope, sessionCtx)
		Sentry.captureException(err, { extra: context })
	})
}

/**
 * Submit user feedback to Sentry with session context.
 * Session context is injected by the PreToolUse hook from the Claude Code process.
 */
export function reportFeedback(message: string, sessionCtx?: Record<string, string>, contactEmail?: string, name?: string): void {
	if (!SENTRY_DSN) return
	Sentry.withScope((scope) => {
		applySessionContext(scope, sessionCtx)
		scope.setTag("feedback", "true")
		Sentry.captureFeedback({
			message,
			email: contactEmail,
			name: name || "H·AI·K·U User",
		})
	})
}

/** Whether Sentry is configured. */
export function isSentryConfigured(): boolean {
	return SENTRY_DSN !== ""
}

/** Flush buffered Sentry events before shutdown. */
export async function flush(timeoutMs = 2000): Promise<void> {
	if (!SENTRY_DSN) return
	await Sentry.flush(timeoutMs)
}
