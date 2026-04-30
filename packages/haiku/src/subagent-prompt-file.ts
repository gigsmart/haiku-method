// subagent-prompt-file — Write subagent prompts to tmpfiles
//
// Instead of embedding the full prompt inline in the `haiku_run_next` response
// (which forces the parent to copy N kb of text verbatim into the Agent tool
// call, and leaks prompt specifics into parent context), the workflow engine writes the
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

/** Result type for action-prompt writes (e.g. elaborate). Only `path` is
 *  returned because action-prompt callers set the action's `message` field
 *  themselves — they never consume the pre-built instruction string. */
export interface ActionPromptFile {
	/** Absolute path to the written prompt file. */
	path: string
}

/** Result type for subagent-prompt writes. Includes `parentInstruction` so
 *  the parent Agent tool call can relay the "Read this file" directive
 *  verbatim without re-constructing it. */
export interface SubagentPromptFile extends ActionPromptFile {
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

	const parentInstruction = `Read the file at \`${path}\` and execute its instructions exactly. The file is the complete, canonical subagent prompt authored by the workflow engine — do not paraphrase or skip any of it.`

	return { path, parentInstruction }
}

/**
 * Write a per-action prompt body to a tmpfile and return `{ path }`. Mirrors
 * `writeSubagentPrompt` but is keyed by action+intent+stage instead of
 * unit+hat+bolt — used when an orchestrator action emission carries an
 * authoritative prompt body too large to inline in the tool response (e.g.
 * `elaborate`). Callers set their own `message` field on the action object
 * and never need the pre-built instruction string, so only `path` is
 * returned (see `ActionPromptFile`).
 */
export function writeActionPromptFile(opts: {
	action: string
	intent: string
	stage?: string
	content: string
	tickHint?: string | number
}): ActionPromptFile {
	const { action, intent, stage, content } = opts
	const tickHint =
		opts.tickHint !== undefined && opts.tickHint !== null
			? String(opts.tickHint)
			: String(Date.now())
	const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-")
	const stagePart = stage ? `-${safe(stage)}` : ""
	const slug = `action-${safe(action)}-${safe(intent)}${stagePart}-${safe(tickHint)}`
	const dir = promptDir()
	const path = join(dir, `${slug}.prompt.md`)
	atomicWrite(path, content)
	maybePeriodicOwnSessionCleanup(dir)

	return { path }
}

/**
 * Result path for the workflow response tmpfile. advance_hat/reject_hat write
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

/**
 * Build a `<subagent>` dispatch-block markup string for a prompt file that
 * ALREADY exists on disk (no write side effect). Used by the dispatch
 * builder to format markup, AND by tool handlers reading sidecar files.
 *
 * Lives here (not in orchestrator/prompts/_helpers.ts) to avoid a circular
 * import: state-tools imports this; _helpers imports state-tools.
 */
export function formatSubagentDispatchBlock(opts: {
	path: string
	parentInstruction?: string
	agentType: string
	model?: string | null
	heading?: string
	toolAttr?: boolean
	/** When true, emit `background="true"` on the `<subagent>` block. The
	 *  parent's only job after dispatch is wait → read result file → call
	 *  `haiku_run_next`, so background dispatch frees the parent thread to
	 *  keep talking to the user. Caller must gate this on the active
	 *  harness's `subagents.backgroundSpawn` capability — passing it for a
	 *  harness that doesn't support background spawning would emit guidance
	 *  the parent can't follow. */
	background?: boolean
}): string {
	const {
		path,
		parentInstruction,
		agentType,
		model,
		heading,
		toolAttr,
		background = false,
	} = opts
	const instruction =
		parentInstruction ??
		`Read the file at \`${path}\` and execute its instructions exactly. The file is the complete, canonical subagent prompt authored by the workflow engine — do not paraphrase or skip any of it.`
	const tool = toolAttr ? ` tool="Agent"` : ""
	const modelAttr = model ? ` model="${model}"` : ""
	const bgAttr = background ? ` background="true"` : ""
	const h = heading ?? "## Subagent Dispatch (MANDATORY — relay verbatim)"
	return (
		`${h}\n\n<subagent${tool} type="${agentType}"${modelAttr}${bgAttr}` +
		` prompt_file="${path}">\n${instruction}\n</subagent>`
	)
}

/**
 * Path for a "next-hat relay" sidecar file. The fix-loop dispatch builder
 * writes the FULLY-FORMATTED next-hat `<subagent>` markup here at dispatch
 * time, keyed by the CURRENT hat (the one whose prompt would have embedded
 * the relay). `haiku_feedback_advance_hat` reads the sidecar after the
 * current hat advances and returns its contents in the tool response —
 * so the agent never sees the relay block in a prompt, only as a tool
 * return value they only get on the actionable path. If the agent calls
 * `haiku_feedback_reject` instead, no read happens, no block is returned,
 * nothing to mistakenly emit.
 */
export function nextRelayPath(opts: {
	unit: string
	hat: string
	bolt: number
}): string {
	const { unit, hat, bolt } = opts
	const slug = `${unit.replace(/\.md$/, "")}-${hat}-${bolt}`
	return join(promptDir(), `${slug}.next-relay.md`)
}

/**
 * Write a next-hat relay sidecar file. Best-effort: the file is treated
 * as advisory by readers — if the write fails, advance_hat falls back to
 * just returning `next_dispatched_hat` without the prebuilt block.
 */
export function writeNextRelaySidecar(
	opts: { unit: string; hat: string; bolt: number },
	content: string,
): void {
	atomicWrite(nextRelayPath(opts), content)
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
