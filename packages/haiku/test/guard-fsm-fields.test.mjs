#!/usr/bin/env npx tsx
// Tests for the guard-fsm-fields PreToolUse hook.
// Covers both the status=completed guard AND the intent-completion
// phase-flag guards, plus the Edit/MultiEdit projected-content reconstruction
// that prevents slice-only bypasses.

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { guardFsmFields } from "../src/hooks/guard-fsm-fields.ts"

const tmp = mkdtempSync(join(tmpdir(), "haiku-guard-test-"))
const origCwd = process.cwd()
process.chdir(tmp)

// Seed a fake intent file so Edit-based tests can project against it.
const intentDir = join(tmp, ".haiku/intents/test-intent")
mkdirSync(intentDir, { recursive: true })
const intentFile = join(intentDir, "intent.md")
writeFileSync(
	intentFile,
	`---
title: Test
studio: software
status: active
phase: active
active_stage: plan
started_at: 2026-04-20T00:00:00Z
completed_at: null
---

Body.
`,
)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const r = fn()
		if (r && typeof r.then === "function") {
			return r.then(
				() => {
					passed++
					console.log(`  \u2713 ${name}`)
				},
				(e) => {
					failed++
					console.log(`  \u2717 ${name}: ${e.message}`)
				},
			)
		}
		passed++
		console.log(`  \u2713 ${name}`)
	} catch (e) {
		failed++
		console.log(`  \u2717 ${name}: ${e.message}`)
	}
}

// The hook calls process.exit(2) on block. We wrap it to capture instead.
function runGuard(input) {
	const origExit = process.exit
	const origStderr = process.stderr.write.bind(process.stderr)
	let exited = false
	let stderr = ""
	process.exit = (code) => {
		exited = true
		throw new Error(`EXIT:${code}`)
	}
	process.stderr.write = (chunk) => {
		stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8")
		return true
	}
	let error = null
	try {
		const r = guardFsmFields(input)
		if (r && typeof r.then === "function")
			return r
				.finally(() => {
					process.exit = origExit
					process.stderr.write = origStderr
				})
				.then(
					() => ({ blocked: exited, stderr }),
					(e) => {
						if (e?.message?.startsWith("EXIT:")) {
							return { blocked: true, stderr }
						}
						throw e
					},
				)
	} catch (e) {
		error = e
	}
	process.exit = origExit
	process.stderr.write = origStderr
	if (error) {
		if (error.message.startsWith("EXIT:")) return { blocked: true, stderr }
		throw error
	}
	return { blocked: exited, stderr }
}

try {
	console.log("\n=== guard-fsm-fields: status=completed block ===")

	await test("Write status: completed is blocked on intent.md", async () => {
		const r = await runGuard({
			tool_name: "Write",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				content: "---\nstatus: completed\n---\n",
			},
		})
		assert.ok(r.blocked, "expected blocked")
		assert.ok(r.stderr.includes("completed"))
	})

	await test("Edit that rewrites status to completed via slice is caught", async () => {
		// Agent tries the bypass: old_string="active", new_string="completed".
		// The new_string slice alone doesn't contain "status:", but projecting
		// the edit onto the real file DOES produce status: completed.
		const r = await runGuard({
			tool_name: "Edit",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				old_string: "status: active",
				new_string: "status: completed",
			},
		})
		assert.ok(r.blocked, "expected blocked — slice-only bypass must be caught")
	})

	await test("Edit on non-haiku file passes through", async () => {
		const r = await runGuard({
			tool_name: "Edit",
			tool_input: {
				file_path: "some/other/file.md",
				old_string: "x",
				new_string: "status: completed",
			},
		})
		assert.ok(!r.blocked, "non-haiku files should not be guarded")
	})

	console.log("\n=== guard-fsm-fields: intent-completion phase spoofing ===")

	await test("Edit that sets phase: awaiting_completion_review via slice is blocked", async () => {
		// Bypass attempt: old_string="active" (matching the phase: active line),
		// new_string="awaiting_completion_review". Without projected-content
		// reconstruction, the hook sees only "awaiting_completion_review" with
		// no "phase:" prefix and the regex misses it. With projection, it
		// matches the realized line in the file.
		const r = await runGuard({
			tool_name: "Edit",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				old_string: "phase: active",
				new_string: "phase: awaiting_completion_review",
			},
		})
		assert.ok(r.blocked, "phase spoofing via slice must be caught")
	})

	await test("Edit setting completion_review_dispatched: true is blocked", async () => {
		const r = await runGuard({
			tool_name: "Edit",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				old_string: "phase: active\n",
				new_string: "phase: active\ncompletion_review_dispatched: true\n",
			},
		})
		assert.ok(r.blocked, "dispatched=true spoofing must be caught")
	})

	await test("MultiEdit with a spoofing edit is blocked", async () => {
		const r = await runGuard({
			tool_name: "MultiEdit",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				edits: [
					{ old_string: "Body.", new_string: "Body updated." },
					{
						old_string: "phase: active",
						new_string: "phase: awaiting_completion_review",
					},
				],
			},
		})
		assert.ok(r.blocked, "MultiEdit must be guarded the same as Edit")
	})

	await test("legitimate phase: active edit is NOT blocked", async () => {
		const r = await runGuard({
			tool_name: "Edit",
			tool_input: {
				file_path: ".haiku/intents/test-intent/intent.md",
				old_string: "phase: active",
				new_string: "phase: active", // no-op write
			},
		})
		assert.ok(!r.blocked, "legitimate writes should pass")
	})

	console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}
