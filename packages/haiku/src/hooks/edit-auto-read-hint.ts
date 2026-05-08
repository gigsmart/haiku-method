// edit-auto-read-hint — P6 (2026-05-06).
//
// Claude Code's Edit/MultiEdit tools refuse to operate on a file the
// session hasn't Read yet. The error is "File has not been read yet."
// Without intervention the agent burns a turn trying again with the
// same args, gets the same error, and only then thinks to Read first.
// Session log evidence: this happened multiple times in one run.
//
// This hook fires PostToolUse on Edit/MultiEdit, detects the
// not-read error string in the tool response, and surfaces a clear
// "Read first, then retry" nudge to the agent. Claude Code doesn't
// allow tool-call injection via hooks (that would be the cleanest
// fix — auto-Read + auto-retry in one tool call), so this is the
// next-best contract layer: make the error noisy and actionable.
//
// 2026-05-08 — false-positive fix: the prior implementation
// stringified the entire hook input and pattern-matched against the
// blob, including `tool_input.old_string` / `new_string`. Edits to
// files whose content happened to mention "read" / "before" / "edit"
// (the haiku codebase itself, every blog post about workflow,
// markdown docs about file edits) tripped a loose regex
// `read.*before.*edit` and fired a spurious "Read first" error on
// SUCCESSFUL edits. The fix scopes the inspection to
// `tool_response` only, gates on `tool_response.isError`, and
// tightens the pattern to two known Claude Code phrasings.

import { defineHook } from "./define.js"

// Two literal phrasings Claude Code emits when an Edit hits an
// unread file. Anchored on enough surrounding tokens that random
// prose can't trigger them.
const NOT_READ_PHRASES = [
	"file has not been read yet",
	"file has not been read in this session",
	"read it first before writing to it",
] as const

/**
 * True iff `toolResponse` represents a Claude Code "file has not been
 * read yet" error from Edit/MultiEdit. Exported so tests can lock the
 * predicate without spawning a subprocess.
 */
export function findNotReadError(toolResponse: unknown): boolean {
	if (toolResponse === null || toolResponse === undefined) return false
	if (typeof toolResponse === "string") {
		const lower = toolResponse.toLowerCase()
		return NOT_READ_PHRASES.some((phrase) => lower.includes(phrase))
	}
	if (typeof toolResponse !== "object") return false
	const obj = toolResponse as Record<string, unknown>
	// Gate on the explicit error flag — Claude Code sets `isError: true`
	// on tool-call failures. Successful edits never carry it, so this
	// short-circuits the false-positive path before we ever look at
	// the content.
	if (obj.isError !== true) return false
	// The error text lives in `content[0].text` for Edit/MultiEdit.
	// Inspect content entries for the exact phrasings.
	if (Array.isArray(obj.content)) {
		for (const entry of obj.content) {
			if (entry && typeof entry === "object") {
				const text = (entry as Record<string, unknown>).text
				if (typeof text === "string") {
					const lower = text.toLowerCase()
					if (NOT_READ_PHRASES.some((phrase) => lower.includes(phrase))) {
						return true
					}
				}
			}
		}
	}
	// Some harnesses surface the error on a top-level `error` /
	// `message` field instead of structured content. Check both.
	for (const field of ["error", "message"] as const) {
		const value = obj[field]
		if (typeof value === "string") {
			const lower = value.toLowerCase()
			if (NOT_READ_PHRASES.some((phrase) => lower.includes(phrase))) {
				return true
			}
		}
	}
	return false
}

export default defineHook({
	name: "edit-auto-read-hint",
	description:
		"PostToolUse: when Edit/MultiEdit fails with 'file not read yet', surface a Read-first hint so the agent recovers in one turn instead of retrying blindly.",
	async handle(input, _ctx) {
		const inputAny = (input ?? {}) as Record<string, unknown>
		// Only inspect the tool_response — the tool_input contains
		// agent-supplied strings (old_string / new_string) which
		// might legitimately mention "read" / "before" / "edit" in
		// prose or code comments and would trigger false positives.
		if (!findNotReadError(inputAny.tool_response)) return

		const toolInput = inputAny.tool_input as Record<string, unknown> | undefined
		const filePath =
			(toolInput?.file_path as string | undefined) ?? "<the file>"

		process.stderr.write(
			`⚠️ Edit failed: file not read yet.\n\n` +
				`The Edit/MultiEdit tool requires the file to be Read in this session before any modification. The retry pattern is:\n\n` +
				`  1. Call \`Read\` on \`${filePath}\` (no offset / limit unless the file is large).\n` +
				`  2. Re-issue the same Edit call with the same args.\n\n` +
				`Do NOT re-issue the Edit without Read first — it will fail with the same error and burn another turn.\n`,
		)
		process.exit(2)
	},
})
