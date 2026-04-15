#!/usr/bin/env node
// haiku — The H·AI·K·U binary
//
// Usage:
//   haiku mcp            → MCP server mode (stdio)
//   haiku hook <name>    → Hook execution mode
//
// Built from packages/haiku/, compiled to plugin/bin/haiku

import { reportError } from "./sentry.js"

const [cmd, ...args] = process.argv.slice(2)

if (cmd === "mcp") {
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

	if (harnessName) {
		import("./harness.js").then((m) => m.setHarness(harnessName))
	}

	import("./server.js")
} else if (cmd === "hook") {
	const hookName = args[0]
	if (!hookName) {
		console.error("Usage: haiku hook <name>")
		process.exit(1)
	}
	import("./hooks/index.js")
		.then((m) => m.runHook(hookName, args.slice(1)))
		.catch((err) => {
			console.error(`haiku hook ${hookName}: ${err.message}`)
			process.exit(1)
		})
} else if (cmd === "migrate") {
	import("./migrate.js")
		.then((m) => m.runMigrate(args))
		.catch((err) => {
			console.error(`haiku migrate: ${err.message}`)
			process.exit(1)
		})
} else {
	console.error("Usage: haiku <mcp|hook|migrate> [args...]")
	process.exit(1)
}
