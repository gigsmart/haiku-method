#!/usr/bin/env node
// haiku — The H·AI·K·U binary
//
// Usage:
//   haiku mcp            → MCP server mode (stdio)
//   haiku hook <name>    → Hook execution mode
//
// Built from packages/haiku/, compiled to plugin/bin/haiku.mjs (the bash
// dispatcher at plugin/bin/haiku selects bundle vs source at invocation time).

import { flush as flushSentry, reportError } from "./sentry.js"

// Global safety net: report any uncaught error or unhandled rejection from any
// subcommand (mcp / hook / migrate) before the process exits. Without this,
// async errors that escape handler catches die silently in the stderr log.
process.on("uncaughtException", (err) => {
	reportError(err, { context: "uncaughtException" })
	console.error("uncaughtException:", err)
	// Best-effort flush, then exit — Node treats uncaughtException as fatal.
	flushSentry().finally(() => process.exit(1))
})

process.on("unhandledRejection", (reason) => {
	const err = reason instanceof Error ? reason : new Error(String(reason))
	reportError(err, { context: "unhandledRejection" })
	console.error("unhandledRejection:", reason)
	// Match the uncaughtException path: flush queued Sentry events, then exit.
	// Without this, short-lived subcommands (hook, migrate) would exit before the
	// in-memory event is sent, and the long-lived MCP server would keep running
	// in a degraded state with no Sentry breadcrumb of the rejection.
	flushSentry().finally(() => process.exit(1))
})

const [cmd, ...args] = process.argv.slice(2)

if (cmd === "mcp") {
	// Dev-mode SPA freshness check: when running from a checkout, if any
	// haiku-ui source file is newer than the inlined `haiku-ui-html.ts`,
	// run the bundle script before the server imports `HAIKU_UI_HTML`.
	// Production-installed binaries don't ship the haiku-ui sources, so
	// this short-circuits to a no-op. Disable with
	// HAIKU_DEV_SPA_AUTO_REBUILD=0.
	const spaRebuildReady = import("./dev-spa-rebuild.js")
		.then((m) => {
			m.maybeRebuildSpaForDev(import.meta.url)
		})
		.catch((err) => {
			reportError(err instanceof Error ? err : new Error(String(err)), {
				context: "dev-spa-rebuild",
			})
			console.error(
				`haiku mcp: SPA dev-rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
			)
			return flushSentry().finally(() => process.exit(1))
		})

	// Parse --harness <name> from args before loading the server module.
	// Remaining args are forwarded in case future flags are added.
	let harnessName = ""
	const filteredArgs: string[] = []
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--harness" && i + 1 < args.length) {
			harnessName = args[++i]
		} else if (args[i].startsWith("--harness=")) {
			harnessName = args[i].split("=", 2)[1]
		} else {
			filteredArgs.push(args[i])
		}
	}

	// Also check env var as fallback (useful for non-configurable harnesses)
	if (!harnessName) {
		harnessName = process.env.HAIKU_HARNESS || ""
	}

	// Set harness BEFORE importing server — server.ts module-level code reads
	// capabilities at init time (skill bridging, tool filtering).
	const harnessReady = harnessName
		? import("./harness.js").then((m) => m.setHarness(harnessName))
		: Promise.resolve()

	Promise.all([spaRebuildReady, harnessReady])
		.then(() => import("./server.js"))
		.catch((err) => {
			reportError(err, { context: "mcp-bootstrap" })
			console.error(`haiku mcp: ${err.message}`)
			flushSentry().finally(() => process.exit(1))
		})
} else if (cmd === "hook") {
	const hookName = args[0]
	if (!hookName) {
		console.error("Usage: haiku hook <name>")
		process.exit(1)
	}
	import("./hooks/index.js")
		.then((m) => m.runHook(hookName, args.slice(1)))
		.catch((err) => {
			reportError(err, { context: `hook:${hookName}` })
			console.error(`haiku hook ${hookName}: ${err.message}`)
			flushSentry().finally(() => process.exit(1))
		})
} else if (cmd === "migrate") {
	import("./migrate.js")
		.then((m) => m.runMigrate(args))
		.catch((err) => {
			reportError(err, { context: "migrate" })
			console.error(`haiku migrate: ${err.message}`)
			flushSentry().finally(() => process.exit(1))
		})
} else {
	console.error("Usage: haiku <mcp|hook|migrate> [args...]")
	process.exit(1)
}
