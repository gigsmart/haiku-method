// edit-auto-read-hint.test.mjs — locks the false-positive guard on
// the PostToolUse:Edit hint hook.
//
// Pre-fix the hook stringified the entire input blob and matched
// against a permissive regex (`read.*before.*edit`). Edits whose
// `tool_input.old_string` / `new_string` happened to mention any of
// those words tripped the hook on SUCCESSFUL edits — every haiku
// codebase edit got hit because the prose is full of "read first",
// "edit before", "before writing", etc.
//
// The fix scopes the inspection to `tool_response`, gates on
// `isError: true`, and tightens to two literal Claude Code phrasings.
// These tests verify both the false-positive cases (hook stays
// silent) and the true-positive cases (hook fires).

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK_ENTRY = join(HERE, "..", "src", "main.ts")

function runHook(input) {
	try {
		const out = execFileSync("bun", [HOOK_ENTRY, "hook", "edit-auto-read-hint"], {
			input: JSON.stringify(input),
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		})
		return { exit: 0, stderr: "", stdout: out }
	} catch (err) {
		return {
			exit: err.status ?? -1,
			stderr: err.stderr?.toString?.() ?? "",
			stdout: err.stdout?.toString?.() ?? "",
		}
	}
}

test("false positive: edit succeeded but content mentions 'read before edit'", () => {
	const result = runHook({
		tool_name: "Edit",
		tool_input: {
			file_path: "/tmp/foo.md",
			old_string: "## How to use\nRead the docs before you edit the config.",
			new_string: "## How to use\nRead the docs first.",
		},
		tool_response: {
			isError: false,
			content: [{ type: "text", text: "The file has been updated successfully." }],
		},
	})
	assert.strictEqual(
		result.exit,
		0,
		`hook must not fire on successful edit; got exit=${result.exit}, stderr: ${result.stderr}`,
	)
	assert.strictEqual(
		result.stderr.includes("Edit failed"),
		false,
		"hook must not emit the Read-first nudge on success",
	)
})

test("false positive: tool_input contains the phrase, response does not", () => {
	const result = runHook({
		tool_name: "Edit",
		tool_input: {
			file_path: "/tmp/foo.ts",
			old_string: "// file has not been read yet — TODO add Read call",
			new_string: "// added Read call",
		},
		tool_response: {
			isError: false,
			content: [{ type: "text", text: "The file has been updated successfully." }],
		},
	})
	assert.strictEqual(
		result.exit,
		0,
		`hook must inspect tool_response only; got exit=${result.exit}`,
	)
})

test("true positive: edit failed with 'file has not been read yet'", () => {
	const result = runHook({
		tool_name: "Edit",
		tool_input: { file_path: "/tmp/unread.md" },
		tool_response: {
			isError: true,
			content: [
				{
					type: "text",
					text: "Error: File has not been read yet. Read it first before writing to it.",
				},
			],
		},
	})
	assert.strictEqual(
		result.exit,
		2,
		`hook must fire on the true error; got exit=${result.exit}, stderr: ${result.stderr}`,
	)
	assert.ok(
		result.stderr.includes("Edit failed: file not read yet"),
		`expected nudge in stderr; got: ${result.stderr}`,
	)
	assert.ok(
		result.stderr.includes("/tmp/unread.md"),
		"hook nudge should name the file path",
	)
})

test("true positive: error surfaced via top-level `error` field", () => {
	const result = runHook({
		tool_name: "MultiEdit",
		tool_input: { file_path: "/tmp/unread.md" },
		tool_response: {
			isError: true,
			error: "File has not been read in this session.",
		},
	})
	assert.strictEqual(result.exit, 2)
	assert.ok(result.stderr.includes("Edit failed"))
})

test("isError: false with the literal phrase still doesn't fire", () => {
	// Defensive: a tool_response that includes the phrase but doesn't
	// flag it as an error (e.g., a doc string echoed in the success
	// message) should not trigger the hook.
	const result = runHook({
		tool_name: "Edit",
		tool_input: { file_path: "/tmp/foo.md" },
		tool_response: {
			isError: false,
			content: [
				{
					type: "text",
					text: "Successfully edited; note: file has not been read yet by the linter.",
				},
			],
		},
	})
	assert.strictEqual(result.exit, 0)
})

test("missing tool_response: hook stays silent", () => {
	const result = runHook({ tool_name: "Edit", tool_input: { file_path: "/tmp/foo.md" } })
	assert.strictEqual(result.exit, 0)
})
