#!/usr/bin/env node
// haiku — The H·AI·K·U binary
//
// Usage:
//   haiku mcp            → MCP server mode (stdio)
//   haiku hook <name>    → Hook execution mode
//
// Built from packages/haiku/, compiled to plugin/bin/haiku

const [cmd, ...args] = process.argv.slice(2)

if (cmd === "mcp") {
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
