// orchestrator/workflow/stamp-agent-write.ts — Shared stamping core
// for the agent_write action-log entry.
//
// Two surfaces call this module:
//   1. The `stamp-agent-write` PostToolUse hook (Claude Code harness),
//      which fires automatically after every Write/Edit/MultiEdit.
//   2. The `haiku_record_agent_write` MCP tool, which the agent calls
//      explicitly on harnesses that don't fire PostToolUse hooks.
//
// Both routes converge on the same on-disk effect: a single
// `entry_type: "agent_write"` row appended to `action-log.jsonl`,
// carrying the post-write file SHA. The next drift-gate tick reads
// these rows and silently absorbs them into the baseline (no
// `manual_change_assessment` finding for the agent to classify against
// itself), closing the bleed window where an agent edit to a
// human-originated file would otherwise inherit `human-implicit`
// attribution.
//
// Tracked-surface check mirrors `enumerateTrackedSurface` exactly. The
// path patterns are hand-coded here rather than calling the enumerator
// because the enumerator does a directory walk we don't need —
// classification by path is sufficient for the stamping decision.

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { actionLogPath, appendActionLogEntry } from "./action-log.js"
import { canonicalisePath, getCurrentTickCounter } from "./drift-baseline.js"

export interface StampAgentWriteResult {
	stamped: boolean
	/** Reason a write wasn't stamped — present iff `stamped: false`. The
	 *  hook silently ignores these; the MCP tool surfaces them so the
	 *  agent learns which paths don't need stamping. */
	reason?:
		| "not_in_intent_dir"
		| "not_in_tracked_surface"
		| "file_missing"
		| "read_failed"
	/** The resolved relative path used for the action-log entry. Useful
	 *  for tool callers that want to confirm the canonical path. */
	pathRel?: string
	/** The post-write SHA-256 hex of the file. */
	sha?: string
	/** Tick counter the entry was stamped against. */
	tickCounter?: number
	/** "stage" for stage-scoped paths, "intent" for intent-scope. */
	tickScope?: "stage" | "intent"
}

interface PathDecomposition {
	intentDir: string
	pathRel: string
	stageOwner: string | null
}

/** Decompose an absolute path into intentDir + intent-relative path,
 *  or null when the path is not inside an `.haiku/intents/<slug>/` tree. */
function decomposePath(absPath: string): PathDecomposition | null {
	const m = absPath.match(/^(.*\/\.haiku\/intents\/[^/]+)\/(.+)$/)
	if (!m) return null
	const pathRel = m[2]
	const stageMatch = pathRel.match(/^stages\/([^/]+)\//)
	return {
		intentDir: m[1],
		pathRel,
		stageOwner: stageMatch ? stageMatch[1] : null,
	}
}

/** Decide whether a path falls inside the drift gate's tracked surface
 *  (mirror of `enumerateTrackedSurface`). The surface is:
 *   - `stages/<X>/{artifacts,outputs,knowledge,discovery}/...`
 *   - `knowledge/...` at intent root
 *  Other intent-dir paths (`units/`, `feedback/`, `state.json`,
 *  `intent.md`, `drift-assessments/`) are workflow-managed; generic
 *  Write on those is denied by the `guard-workflow-fields` PreToolUse
 *  hook anyway. */
function isInTrackedSurface(pathRel: string): boolean {
	if (
		/^stages\/[^/]+\/(?:artifacts|outputs|knowledge|discovery)\//.test(pathRel)
	) {
		return true
	}
	if (/^knowledge\//.test(pathRel)) return true
	return false
}

/** Best-effort sequence number for the entry_id label. Counts existing
 *  action-log lines + 1; the entry_id is human-readable only and need
 *  not be globally unique. */
function nextActionLogSequenceNumber(intentDir: string): number {
	const path = actionLogPath(intentDir)
	if (!existsSync(path)) return 1
	try {
		return (
			readFileSync(path, "utf8")
				.split("\n")
				.filter((l) => l.trim() !== "").length + 1
		)
	} catch {
		return 1
	}
}

/** Stamp an `agent_write` action-log entry for `absPath` if it lives
 *  inside a tracked-surface location. Idempotent: a follow-up call with
 *  the same SHA will append a duplicate (the gate dedupes by SHA-match,
 *  not by entry-id), but disk cost is bounded by the action-log
 *  per-file caps. Returns a structured result the caller can act on or
 *  ignore. Never throws. */
export async function stampAgentWriteForPath(
	absPath: string,
): Promise<StampAgentWriteResult> {
	const decomp = decomposePath(absPath)
	if (!decomp) return { stamped: false, reason: "not_in_intent_dir" }

	if (!isInTrackedSurface(decomp.pathRel)) {
		return { stamped: false, reason: "not_in_tracked_surface" }
	}
	if (!existsSync(absPath)) {
		return { stamped: false, reason: "file_missing" }
	}

	let sha: string
	try {
		sha = createHash("sha256").update(readFileSync(absPath)).digest("hex")
	} catch {
		return { stamped: false, reason: "read_failed" }
	}

	const tickCounter = decomp.stageOwner
		? getCurrentTickCounter(decomp.intentDir, decomp.stageOwner)
		: getCurrentTickCounter(decomp.intentDir)
	const seq = nextActionLogSequenceNumber(decomp.intentDir)
	// `AGW-` prefix (Agent Write) keeps the audit trail unambiguous —
	// the `human_write` path uses `HWM-`, and mixing prefixes would
	// require disambiguating against `entry_type` on every read.
	const nn = String(seq).padStart(2, "0")
	const entryId = `AGW-${tickCounter}-${nn}`
	const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
	const tickScope: "stage" | "intent" = decomp.stageOwner ? "stage" : "intent"
	const canonical = canonicalisePath(decomp.pathRel)

	await appendActionLogEntry(decomp.intentDir, tickCounter, {
		entry_type: "agent_write",
		path: canonical,
		sha,
		author_class: "agent",
		timestamp,
		claimed_author_id: null,
		human_author_id: null,
		entry_id: entryId,
		tick_counter: tickCounter,
		tick_scope: tickScope,
	})

	return {
		stamped: true,
		pathRel: canonical,
		sha,
		tickCounter,
		tickScope,
	}
}
