// subagent-prompt-file — Write subagent prompts to tmpfiles
//
// Instead of embedding the full prompt inline in the `haiku_run_next` response
// (which forces the parent to copy N kb of text verbatim into the Agent tool
// call, and leaks prompt specifics into parent context), the FSM writes the
// complete prompt to a tmpfile and the parent only tells the subagent to read
// that file.
//
// File layout:
//   $TMPDIR/haiku-prompts/{session_id}/{unit}-{hat}-{bolt}.prompt.md
//   $TMPDIR/haiku-prompts/{session_id}/{unit}-{hat}-{bolt}.result.json
//
// Cleanup policy (all best-effort, never blocks):
//   - First write per MCP process: sweep cross-session dirs older than 24h.
//   - Every Nth write: sweep own-session files older than 1h.

import {
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Explicit session identity, set at MCP bootstrap when available. */
let explicitSessionId: string | null = null

/**
 * Set the session identity used for per-session tmpfile directories.
 * Call from MCP tool handlers when `_session_context.CLAUDE_SESSION_ID` is
 * available (injected by the inject-state-file hook). Safe to call with
 * the same value repeatedly; ignored if a different id would clobber.
 */
export function setSessionId(id: string | undefined | null): void {
	if (!id) return
	if (explicitSessionId && explicitSessionId !== id) return
	explicitSessionId = id
}

function sessionIdOrFallback(): string {
	return (
		explicitSessionId ||
		process.env.CLAUDE_SESSION_ID ||
		process.env.HAIKU_SESSION_ID ||
		String(process.pid)
	)
}

// Cross-session cleanup: one-shot per MCP process.
let crossSessionCleanupAttempted = false

// Own-session cleanup: periodic sweep every N writes.
const PERIODIC_CLEANUP_EVERY_N_WRITES = 100
const OWN_SESSION_MAX_AGE_MS = 60 * 60 * 1000 // 1h
let writesSinceCleanup = 0

function promptDir(): string {
	if (!crossSessionCleanupAttempted) {
		crossSessionCleanupAttempted = true
		try {
			cleanupStaleTmpfiles(24)
		} catch {
			/* best-effort */
		}
	}
	const dir = join(tmpdir(), "haiku-prompts", sessionIdOrFallback())
	mkdirSync(dir, { recursive: true })
	return dir
}

function maybePeriodicOwnSessionCleanup(dir: string): void {
	writesSinceCleanup++
	if (writesSinceCleanup < PERIODIC_CLEANUP_EVERY_N_WRITES) return
	writesSinceCleanup = 0
	try {
		const now = Date.now()
		for (const f of readdirSync(dir)) {
			const p = join(dir, f)
			try {
				const st = statSync(p)
				if (now - st.mtimeMs > OWN_SESSION_MAX_AGE_MS) {
					rmSync(p, { force: true })
				}
			} catch {
				/* ignore */
			}
		}
	} catch {
		/* best-effort */
	}
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
	const dir = promptDir()
	const path = join(dir, `${slug}.prompt.md`)
	atomicWrite(path, content)
	maybePeriodicOwnSessionCleanup(dir)

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
	atomicWrite(resultPath, JSON.stringify(payload, null, 2))
}

/**
 * Write-then-rename for atomicity. Prevents readers from seeing a partial
 * file if the writer is interrupted mid-write. The rename is atomic on
 * POSIX filesystems IF the temp path and final path share a filesystem —
 * enforced here by placing the temp next to the final path inside the
 * same promptDir.
 */
function atomicWrite(path: string, content: string): void {
	const tmp = `${path}.${process.pid}.tmp`
	writeFileSync(tmp, content, "utf8")
	try {
		renameSync(tmp, path)
	} catch (err) {
		try {
			rmSync(tmp, { force: true })
		} catch {
			/* ignore cleanup failure */
		}
		throw new Error(
			`atomicWrite: rename failed — tmp and final must share a filesystem. Original: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
}

/**
 * Clean up stale session prompt/result tmpfiles older than `maxAgeHours`.
 */
export function cleanupStaleTmpfiles(maxAgeHours = 24): void {
	const root = join(tmpdir(), "haiku-prompts")
	try {
		const now = Date.now()
		const maxMs = maxAgeHours * 60 * 60 * 1000
		for (const sessionDir of readdirSync(root)) {
			const p = join(root, sessionDir)
			try {
				const stat = statSync(p)
				if (now - stat.mtimeMs > maxMs) {
					rmSync(p, { recursive: true, force: true })
				}
			} catch {
				/* ignore */
			}
		}
	} catch {
		/* root doesn't exist yet — nothing to clean */
	}
}
