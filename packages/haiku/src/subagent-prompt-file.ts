// subagent-prompt-file — Write subagent prompts to tmpfiles
//
// Instead of embedding the full prompt inline in the `haiku_run_next` response
// (which forces the parent to copy N kb of text verbatim into the Agent tool
// call, and leaks prompt specifics into parent context), the FSM writes the
// complete prompt to a tmpfile and the parent only tells the subagent to read
// that file.
//
// Benefits:
//   - Parent context stays thin (one path, not N kb of prompt)
//   - Single source of truth: FSM owns the prompt, parent cannot paraphrase
//   - Subagent reads one file instead of fanning out to N reads (hat, unit,
//     inputs, upstream artifacts) — the FSM inlines or references as needed
//   - Deterministic cleanup: session-scoped tmpfiles wiped on SessionStart
//
// File layout:
//   $TMPDIR/haiku-prompts/{session_id}/{unit}-{hat}-{bolt}.prompt.md
//
// Cleanup is handled by a SessionStart hook that wipes stale session dirs
// older than 24h.

import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function sessionIdOrPid(): string {
	return process.env.CLAUDE_SESSION_ID || String(process.pid)
}

function promptDir(): string {
	const dir = join(tmpdir(), "haiku-prompts", sessionIdOrPid())
	mkdirSync(dir, { recursive: true })
	return dir
}

export interface SubagentPromptFile {
	/** Absolute path to the written prompt file. */
	path: string
	/** The minimal parent-facing instruction — "Read this file and execute its instructions." */
	parentInstruction: string
}

/**
 * Write a subagent prompt to a tmpfile and return the path + parent-facing
 * instruction. The parent's Agent tool call only needs to include the
 * parentInstruction as the prompt; the subagent reads the file itself.
 */
export function writeSubagentPrompt(opts: {
	unit: string
	hat: string
	bolt: number
	content: string
}): SubagentPromptFile {
	const { unit, hat, bolt, content } = opts
	const slug = `${unit.replace(/\.md$/, "")}-${hat}-${bolt}`
	const path = join(promptDir(), `${slug}.prompt.md`)
	writeFileSync(path, content, "utf8")

	const parentInstruction =
		`Read the file at \`${path}\` and execute its instructions exactly. ` +
		`The file is the complete, canonical subagent prompt authored by the FSM — ` +
		`do not paraphrase or skip any of it.`

	return { path, parentInstruction }
}

/**
 * Result path for the FSM response tmpfile. advance_hat/reject_hat write
 * their JSON response here; the subagent's final message is just a path line.
 * The parent reads this file instead of parsing prose.
 */
export function resultPathFor(opts: {
	unit: string
	hat: string
	bolt: number
}): string {
	const { unit, hat, bolt } = opts
	const slug = `${unit.replace(/\.md$/, "")}-${hat}-${bolt}`
	return join(promptDir(), `${slug}.result.json`)
}

export function writeResultFile(resultPath: string, payload: unknown): void {
	writeFileSync(resultPath, JSON.stringify(payload, null, 2), "utf8")
}
