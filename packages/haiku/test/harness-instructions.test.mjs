#!/usr/bin/env npx tsx
// Integration tests for adaptInstructions() — catches regressions when
// orchestrator prose is rephrased and the harness-instructions regexes
// fall out of sync.
//
// Each test pins a known orchestrator-emitted fixture string and verifies
// that adaptInstructions() rewrites it correctly for the target harness.
// When the orchestrator rephrasing changes, this suite fails fast and
// tells you which regex needs updating.

import assert from "node:assert"

import { adaptInstructions } from "../src/harness-instructions.ts"
import { setHarness } from "../src/harness.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

// ── claude-code: near-noop ───────────────────────────────────────────────

console.log("\n=== adaptInstructions — claude-code (noop) ===")

test("claude-code passes orchestrator output through unchanged", () => {
	setHarness("claude-code")
	const input =
		'<subagent tool="Agent" type="builder">\n' +
		"## Unit Spec\n\nDo the thing.\n" +
		"</subagent>\n\n" +
		"Use `AskUserQuestion` for structured decisions.\n"
	assert.strictEqual(adaptInstructions(input), input)
})

// ── cursor: subagent-capable, hookless ───────────────────────────────────

console.log("\n=== adaptInstructions — cursor ===")

test('cursor keeps <subagent tool="Agent"> (primary tool = Agent)', () => {
	setHarness("cursor")
	const input = '<subagent tool="Agent" type="builder">\nbody\n</subagent>'
	const out = adaptInstructions(input)
	assert.match(out, /tool="Agent"/, "cursor still uses Agent as primary tool")
})

test("cursor strips subagent-context hook references", () => {
	setHarness("cursor")
	const input =
		"Each subagent inherits worktree scoping via the `subagent-context` hook. Proceed."
	const out = adaptInstructions(input)
	assert.doesNotMatch(
		out,
		/subagent-context/,
		"cursor is hookless — hook reference should be rewritten",
	)
})

// ── gemini-cli: subagents via @subagent token ────────────────────────────

console.log("\n=== adaptInstructions — gemini-cli ===")

test('gemini-cli rewrites <subagent tool="Agent"> to its primary tool', () => {
	setHarness("gemini-cli")
	const input = '<subagent tool="Agent" type="builder">\nbody\n</subagent>'
	const out = adaptInstructions(input)
	assert.doesNotMatch(
		out,
		/tool="Agent"/,
		"gemini-cli primary tool is not Agent — XML attribute must be rewritten",
	)
})

test('gemini-cli rewrites <subagent tool="Task"> to its primary tool', () => {
	setHarness("gemini-cli")
	const input = '<subagent tool="Task" type="builder">\nbody\n</subagent>'
	const out = adaptInstructions(input)
	assert.doesNotMatch(
		out,
		/tool="Task"/,
		"gemini-cli primary tool is not Task — XML attribute must be rewritten",
	)
})

test("gemini-cli rewrites backtick `Agent` references in prose", () => {
	setHarness("gemini-cli")
	const input = "Spawn a `Agent` subagent to handle this."
	const out = adaptInstructions(input)
	assert.doesNotMatch(
		out,
		/`Agent`/,
		"prose backtick `Agent` must be rewritten for gemini-cli",
	)
})

// ── opencode: subagent-capable, distinct spawn token ─────────────────────

console.log("\n=== adaptInstructions — opencode ===")

test("opencode rewrites XML tool= attribute consistently", () => {
	setHarness("opencode")
	const input =
		'<subagent tool="Agent" type="builder">\nbody\n</subagent>\n\n' +
		"Spawn with `Agent` for this task."
	const out = adaptInstructions(input)
	// Either primary tool IS Agent (passthrough) OR both prose and XML are rewritten
	const proseHasAgent = /`Agent`/.test(out)
	const xmlHasAgent = /tool="Agent"/.test(out)
	assert.strictEqual(
		proseHasAgent,
		xmlHasAgent,
		"prose and XML must be rewritten in lockstep — they cannot disagree",
	)
})

// ── windsurf: subagentless ────────────────────────────────────────────────

console.log("\n=== adaptInstructions — windsurf (subagentless) ===")

test("windsurf rewrites 'Spawn one `Task` subagent per artifact' to sequential", () => {
	setHarness("windsurf")
	const input =
		"Spawn one `Task` subagent per artifact declared above. Work in parallel."
	const out = adaptInstructions(input)
	assert.match(
		out,
		/sequentially|one at a time/i,
		"subagentless harness must downgrade parallel subagent prose to sequential",
	)
})

test("windsurf rewrites 'Spawn a subagent for the \"X\" hat' to direct execution", () => {
	setHarness("windsurf")
	const input = 'Spawn a subagent for the "builder" hat.'
	const out = adaptInstructions(input)
	assert.match(
		out,
		/directly/i,
		"subagentless harness must instruct direct hat execution",
	)
})

// ── Reset to claude-code for subsequent test files ───────────────────────

setHarness("claude-code")

// ── Summary ──────────────────────────────────────────────────────────────

console.log("")
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
