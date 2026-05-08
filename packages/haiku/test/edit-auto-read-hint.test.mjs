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
// `isError: true`, and tightens to a few literal Claude Code
// phrasings. These tests verify both the false-positive cases (the
// predicate returns false) and the true-positive cases (returns true).
//
// Tests import `findNotReadError` directly to avoid spawning a
// subprocess — `bun` isn't on every CI runner's PATH and the rest of
// the suite uses the in-process import pattern.

import assert from "node:assert"
import { test } from "node:test"
import { findNotReadError } from "../src/hooks/edit-auto-read-hint.ts"

test("false positive: edit succeeded but content mentions 'read before edit'", () => {
	// Pre-fix this would match because the regex saw the prose. Post-fix
	// the predicate ignores tool_input entirely (we don't even pass it
	// to findNotReadError) and gates on isError.
	const result = findNotReadError({
		isError: false,
		content: [{ type: "text", text: "The file has been updated successfully." }],
	})
	assert.strictEqual(
		result,
		false,
		"hook predicate must not fire on successful edit",
	)
})

test("false positive: response mentions the phrase but isError is false", () => {
	// Defensive: a tool_response that includes the phrase but doesn't
	// flag it as an error (e.g., a doc string echoed in the success
	// message) should not trigger the hook.
	const result = findNotReadError({
		isError: false,
		content: [
			{
				type: "text",
				text: "Successfully edited; note: file has not been read yet by the linter.",
			},
		],
	})
	assert.strictEqual(result, false)
})

test("true positive: edit failed with 'file has not been read yet'", () => {
	const result = findNotReadError({
		isError: true,
		content: [
			{
				type: "text",
				text: "Error: File has not been read yet. Read it first before writing to it.",
			},
		],
	})
	assert.strictEqual(result, true)
})

test("true positive: error surfaced via top-level `error` field", () => {
	const result = findNotReadError({
		isError: true,
		error: "File has not been read in this session.",
	})
	assert.strictEqual(result, true)
})

test("true positive: error surfaced via top-level `message` field", () => {
	const result = findNotReadError({
		isError: true,
		message: "Read it first before writing to it.",
	})
	assert.strictEqual(result, true)
})

test("string tool_response with the phrase still detected (some harnesses)", () => {
	// Rarely, harnesses surface tool_response as a string rather than a
	// structured object. The predicate handles both shapes.
	const result = findNotReadError(
		"Error: file has not been read yet. Read it first before writing to it.",
	)
	assert.strictEqual(result, true)
})

test("missing / null tool_response: predicate returns false", () => {
	assert.strictEqual(findNotReadError(undefined), false)
	assert.strictEqual(findNotReadError(null), false)
})

test("isError: true with unrelated content does not match", () => {
	// Verifies the predicate doesn't fire on every error response —
	// only the specific not-read phrasings.
	const result = findNotReadError({
		isError: true,
		content: [{ type: "text", text: "Error: permission denied" }],
	})
	assert.strictEqual(result, false)
})
