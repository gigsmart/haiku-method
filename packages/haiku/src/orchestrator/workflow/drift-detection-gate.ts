// orchestrator/workflow/drift-detection-gate.ts — Pre-tick drift-detection gate.
//
// Responsibilities:
//   - `runDriftDetectionGate(ctx)` — synchronous gate that:
//       1. Checks the kill-switch (`settings.drift_detection === false` → no-op).
//       2. Reads the pending-assessment marker store.
//       3. Reads the per-stage baseline (null → establish-mode; corrupt → error).
//       4. Enumerates the tracked surface.
//       5. Compares current SHA against baseline per file.
//       6. Applies marker suppression / stale-marker handling.
//       7. Emits `DriftFinding[]` per DATA-CONTRACTS.md §3.1.
//       8. Applies the out-of-sync heuristic (>50% surface drifted).
//       9. Returns the result (action: 'manual_change_assessment' | null).
//
// All I/O is synchronous so that `runWorkflowTick` stays synchronous.
//
// Position in the pre-tick gate chain (ARCHITECTURE.md §2.1 / AC-G13):
//   tamper-detection → feedback-triage → drift-detection → per-state dispatch
//
// Spec references: unit-04-pre-tick-drift-gate.md, ARCHITECTURE.md §3, §8,
// DATA-CONTRACTS.md §3.1, ACCEPTANCE-CRITERIA.md AC-G1 through AC-G13.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	type AuthorClass,
	type Baseline,
	type BaselineEntry,
	baselineContentPath,
	baselineIntentContentPath,
	clearBaselineAckMarker,
	computeFileSha256Sync,
	enumerateTrackedSurface,
	isBaselineThrashing,
	isBinarySync,
	isDriftDetectionDisabled,
	isImageBinarySync,
	readActionLogSync,
	readBaseline,
	readBaselineAckMarker,
	readBaselineContentWithFallback,
	readIntentScopeActionLogSync,
	recordBaselineCorruption,
	recordBaselineEstablishedMarker,
	type TrackingClass,
	wasBaselinePreviouslyEstablished,
	writeBaselineContentSync,
	writeBaselineIntentContentSync,
	writeBaselineSync,
} from "./drift-baseline.js"

// Re-export so callers that import isDriftDetectionDisabled from this module
// continue to work (e.g. drift-detection-gate.test.mjs).
export { isDriftDetectionDisabled }

import { emitTelemetry } from "../../telemetry.js"
import {
	findOpenMarker,
	isStaleMarker,
	readMarkers,
	removeMarkersSync,
} from "./drift-markers.js"

// ── Telemetry helpers ──────────────────────────────────────────────────────
//
// The four golden signals (latency / traffic / errors / saturation) plus a
// runtime PII guarantee live on top of `emitTelemetry` from telemetry.ts.
// `gateAttrs(ctx)` produces the correlation triple {intent_slug, stage,
// tick_iteration} that every emit in this file MUST spread into its
// attribute object — without it, downstream consumers can't tie an event
// back to the intent + stage + tick that produced it.

/** Correlation-ID triple emitted on every drift-gate event. */
function gateAttrs(ctx: DriftGateCtx): Record<string, string> {
	return {
		intent_slug: ctx.intentSlug,
		stage: ctx.activeStage,
		tick_iteration: String(ctx.tickCounter),
	}
}

/** Elapsed milliseconds between a process.hrtime.bigint() reading and now. */
function elapsedMs(startedNs: bigint): string {
	const deltaNs = process.hrtime.bigint() - startedNs
	// Bigint → number with millisecond precision. Safe for any realistic
	// drift-gate duration (< ~285 thousand years before Number loses ms-level
	// precision).
	return String(Number(deltaNs / 1_000n) / 1_000)
}

// ── Types ──────────────────────────────────────────────────────────────────

/** One detected divergence between baseline and disk (DATA-CONTRACTS.md §3.1). */
export interface DriftFinding {
	path: string
	change_kind: "new-file-detected" | "modified" | "file-removed"
	is_binary: boolean
	diff_unified: string | null
	before_sha256: string | null
	after_sha256: string | null
	before_bytes: number | null
	after_bytes: number | null
	tracking_class: TrackingClass
	stage: string | null
	context_unit: string | null
	/** True when this is a synthetic out-of-sync finding (ARCHITECTURE.md §8.3). */
	is_baseline_oom?: boolean
	/** Author class attributed to this finding (ARCHITECTURE.md §6.2).
	 *  Set by the gate from the action log; carried through dispatch so
	 *  haiku_classify_drift can write the correct author_class on the
	 *  baseline entry without re-reading the log. */
	author_class?: AuthorClass
}

/** Return type of `runDriftDetectionGate`. */
export interface DriftDetectionGateResult {
	findings: DriftFinding[]
	baselineEstablished: boolean
	action: "manual_change_assessment" | null
	error?: "baseline_corrupt"
	errorMessage?: string
}

/** Context passed to the gate by `runWorkflowTick`. */
export interface DriftGateCtx {
	/** Absolute path to the intent directory (.haiku/intents/{slug}). */
	intentDir: string
	/** Intent slug. */
	intentSlug: string
	/** Currently active stage name. */
	activeStage: string
	/** Absolute path to the .haiku root directory (for settings.yml). */
	haikuRoot: string
	/** Current tick counter (from stage state.json or 0 if unavailable). */
	tickCounter: number
}

// ── Diff generation ────────────────────────────────────────────────────────

const MAX_DIFF_LINES = 200

/** Retrieve the "before" file content from the content sidecar and produce
 *  a unified diff against the current file content. Returns null when the
 *  sidecar is absent (not yet written) or any error occurs.
 *
 *  The sidecar lives at `stages/{stage}/baseline-content/{sha256}` and is
 *  written by `writeBaselineSync` / `writeBaseline` at baseline-write time
 *  and lazily during steady-state scans. This avoids relying on git's
 *  SHA-1 object store (git cat-file blob requires a SHA-1 address, not a
 *  SHA-256 digest). */
function buildUnifiedDiff(
	intentDir: string,
	activeStage: string,
	pathRel: string,
	beforeSha256: string,
	afterAbsPath: string,
): string | null {
	try {
		// Try stage path first, fall back to intent-level for knowledge/ files.
		const beforeBuf = readBaselineContentWithFallback(
			intentDir,
			activeStage,
			beforeSha256,
		)
		if (beforeBuf === null) return null

		const afterBuf = readFileSync(afterAbsPath)

		const before = beforeBuf.toString("utf-8").split("\n")
		const after = afterBuf.toString("utf-8").split("\n")

		const diffLines = generateUnifiedDiff(before, after, pathRel)
		if (diffLines.length === 0) return null

		const truncated =
			diffLines.length > MAX_DIFF_LINES
				? [
						...diffLines.slice(0, MAX_DIFF_LINES),
						`... (truncated, full diff at ${pathRel})`,
					]
				: diffLines

		return truncated.join("\n")
	} catch {
		return null
	}
}

/** Diff operation: equal, delete, or insert. */
type DiffOp =
	| { type: "equal"; bi: number; ai: number }
	| { type: "delete"; bi: number }
	| { type: "insert"; ai: number }

/** Compute LCS-based edit sequence via standard DP table.
 *  Returns a sequence of equal/delete/insert ops.
 *  O(N*M) space — capped by the caller to avoid pathological inputs. */
function lcsEditScript(before: string[], after: string[]): DiffOp[] {
	const N = before.length
	const M = after.length
	// Build LCS lengths table.
	const dp: number[][] = Array.from({ length: N + 1 }, () =>
		new Array(M + 1).fill(0),
	)
	for (let i = 1; i <= N; i++) {
		for (let j = 1; j <= M; j++) {
			if (before[i - 1] === after[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
			}
		}
	}
	// Backtrack to produce ops.
	const ops: DiffOp[] = []
	let i = N
	let j = M
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
			ops.push({ type: "equal", bi: i - 1, ai: j - 1 })
			i--
			j--
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			ops.push({ type: "insert", ai: j - 1 })
			j--
		} else {
			ops.push({ type: "delete", bi: i - 1 })
			i--
		}
	}
	ops.reverse()
	return ops
}

/** LCS-based unified diff generator with 3 lines of context.
 *  Produces a readable diff suitable for agent classification.
 *  Returns empty array when there are no differences. */
function generateUnifiedDiff(
	before: string[],
	after: string[],
	path: string,
): string[] {
	const CONTEXT = 3
	const MAX_LCS_CELLS = 200_000 // ~200 k cells ≈ 447×447 lines each side

	// Fall back to a simple full-replace diff for very large files to avoid
	// O(N*M) memory blow-up. This is intentionally conservative.
	let ops: DiffOp[]
	if (before.length * after.length > MAX_LCS_CELLS) {
		// Simple fallback: treat the whole file as replaced.
		ops = [
			...before.map((_, bi) => ({ type: "delete" as const, bi })),
			...after.map((_, ai) => ({ type: "insert" as const, ai })),
		]
	} else {
		ops = lcsEditScript(before, after)
	}

	// Check if there are any changes at all.
	const hasChanges = ops.some((op) => op.type !== "equal")
	if (!hasChanges) return []

	// Group ops into hunks (runs of non-equal ops, each padded with CONTEXT equal
	// lines on either side, with adjacent hunks merged when their context windows
	// overlap).
	type Hunk = { ops: DiffOp[]; bStart: number; aStart: number }
	const hunks: Hunk[] = []
	let hunk: Hunk | null = null
	// Track trailing equal-op count to trim excess context from a closed hunk.
	let trailingEqual = 0

	for (const op of ops) {
		if (op.type === "equal") {
			if (hunk !== null) {
				hunk.ops.push(op)
				trailingEqual++
				// If we've accumulated more than 2*CONTEXT equal lines since the
				// last change, close the hunk (keep only CONTEXT trailing lines).
				if (trailingEqual > 2 * CONTEXT) {
					// Trim excess trailing equal ops from the END, keeping CONTEXT.
					hunk.ops.splice(hunk.ops.length - (trailingEqual - CONTEXT))
					hunks.push(hunk)
					hunk = null
					trailingEqual = 0
				}
			}
			// Outside a hunk: track for leading context.
			// We don't buffer pre-hunk ops here; we reconstruct from indices below.
		} else {
			trailingEqual = 0
			if (hunk === null) {
				hunk = { ops: [], bStart: 0, aStart: 0 }
				// Back-fill up to CONTEXT leading equal ops.
				const bIdx = op.type === "delete" ? op.bi : -1
				const aIdx = op.type === "insert" ? op.ai : -1
				// Determine where we are in before/after.
				const leadBi = bIdx >= 0 ? bIdx : aIdx >= 0 ? aIdx : 0
				const leadAi = aIdx >= 0 ? aIdx : bIdx >= 0 ? bIdx : 0
				const leadStart = Math.max(0, Math.min(leadBi, leadAi) - CONTEXT)
				hunk.bStart = Math.max(0, leadBi - CONTEXT)
				hunk.aStart = Math.max(0, leadAi - CONTEXT)
				for (let k = leadStart; k < Math.min(leadBi, leadAi); k++) {
					if (k < before.length && k < after.length) {
						hunk.ops.push({ type: "equal", bi: k, ai: k })
					}
				}
			}
			hunk.ops.push(op)
		}
	}
	if (hunk !== null) {
		// Trim trailing equal ops beyond CONTEXT (remove excess from the END).
		if (trailingEqual > CONTEXT) {
			hunk.ops.splice(hunk.ops.length - (trailingEqual - CONTEXT))
		}
		hunks.push(hunk)
	}

	if (hunks.length === 0) return []

	const lines: string[] = []
	lines.push(`--- a/${path}`)
	lines.push(`+++ b/${path}`)

	for (const h of hunks) {
		// Count old/new lines in hunk for @@ header.
		let oldCount = 0
		let newCount = 0
		let oldStart = -1
		let newStart = -1
		for (const op of h.ops) {
			if (op.type === "equal") {
				if (oldStart < 0) oldStart = op.bi
				if (newStart < 0) newStart = op.ai
				oldCount++
				newCount++
			} else if (op.type === "delete") {
				if (oldStart < 0) oldStart = op.bi
				oldCount++
			} else {
				if (newStart < 0) newStart = op.ai
				newCount++
			}
		}
		if (oldStart < 0) oldStart = 0
		if (newStart < 0) newStart = 0
		lines.push(
			`@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`,
		)
		for (const op of h.ops) {
			if (op.type === "equal") {
				lines.push(` ${before[op.bi] ?? ""}`)
			} else if (op.type === "delete") {
				lines.push(`-${before[op.bi] ?? ""}`)
			} else {
				lines.push(`+${after[op.ai] ?? ""}`)
			}
		}
	}

	return lines
}

// ── State.json stamping ────────────────────────────────────────────────────

/** Stamp `drift_baseline_established_at` in the stage's state.json when the
 *  gate runs in establish-mode (AC-G8). Non-fatal if state.json is absent. */
function stampBaselineEstablished(intentDir: string, stage: string): void {
	const stateFile = join(intentDir, "stages", stage, "state.json")
	try {
		let existing: Record<string, unknown> = {}
		if (existsSync(stateFile)) {
			try {
				existing = JSON.parse(readFileSync(stateFile, "utf-8")) as Record<
					string,
					unknown
				>
			} catch {
				return
			}
		}
		existing.drift_baseline_established_at = new Date().toISOString()
		writeFileSync(stateFile, `${JSON.stringify(existing, null, 2)}\n`, "utf-8")
	} catch {
		// Non-fatal.
	}
}

// ── Gate ───────────────────────────────────────────────────────────────────

/** Run the pre-tick drift-detection gate.
 *
 *  Returns a `DriftDetectionGateResult`:
 *   - `findings: []` + `action: null` when there is nothing to assess.
 *   - `findings: [...]` + `action: 'manual_change_assessment'` when drift found.
 *   - `baselineEstablished: true` + `action: null` on first-tick establish.
 *   - `error: 'baseline_corrupt'` when the baseline file is corrupt.
 *
 *  The function is synchronous so that `runWorkflowTick` stays synchronous.
 *
 *  @param ctx Gate context. See `DriftGateCtx`.
 */
export function runDriftDetectionGate(
	ctx: DriftGateCtx,
): DriftDetectionGateResult {
	const { intentDir, activeStage, haikuRoot, tickCounter } = ctx
	const startedNs = process.hrtime.bigint()

	// 1. Kill-switch: if disabled, the gate is a complete no-op (AC-G1-KS).
	if (isDriftDetectionDisabled(haikuRoot)) {
		emitTelemetry("haiku.drift.gate.kill_switch_hit", { ...gateAttrs(ctx) })
		return { findings: [], baselineEstablished: false, action: null }
	}

	// Traffic signal — every (non-killed) drift-gate tick increments this.
	emitTelemetry("haiku.drift.gate.tick", { ...gateAttrs(ctx) })

	// 2. Read pending-assessment markers (non-fatal on missing/corrupt).
	const markerStore = readMarkers(intentDir)
	// Saturation — marker-store size, both the open subset (drives the
	// runbook's "stuck assessments" check) and the total (drives the
	// "marker-file growth unbounded" check).
	{
		const total = markerStore.markers.length
		let open = 0
		for (const m of markerStore.markers) {
			if (m.cleared_at === null) open++
		}
		emitTelemetry("haiku.drift.markers.open_count", {
			...gateAttrs(ctx),
			open_count: String(open),
		})
		emitTelemetry("haiku.drift.markers.total_count", {
			...gateAttrs(ctx),
			total_count: String(total),
		})
	}

	// 3. Read the baseline. null → establish mode. Corrupt → error.
	let baseline: Baseline | null
	try {
		baseline = readBaseline(intentDir, activeStage)
	} catch (err) {
		// BaselineCorruptError (ARCHITECTURE.md §8.2 / AC-EE4).
		// V-11: also record the corruption event for the thrash counter
		// and emit thrash telemetry if we've crossed the threshold.
		const recentCount = recordBaselineCorruption(
			intentDir,
			activeStage,
			tickCounter,
		)
		emitTelemetry("haiku.drift.baseline.corrupt", {
			...gateAttrs(ctx),
			error: err instanceof Error ? err.message : String(err),
			recent_corrupt_count: String(recentCount),
		})
		const thrash = isBaselineThrashing(intentDir, activeStage, tickCounter)
		if (thrash.thrashing) {
			// V-11 layer 4: thrash telemetry. Operators key on this for
			// the "auto-recovery disabled" alarm. Fired here (in the gate)
			// so it surfaces on every subsequent corrupt tick — not just
			// the threshold-crossing one.
			emitTelemetry("haiku.security.baseline_thrash", {
				...gateAttrs(ctx),
				recent_count: String(thrash.recentCount),
			})
		}
		// Latency signal even on the error path so dashboards see the cost.
		emitTelemetry("haiku.drift.gate.duration_ms", {
			...gateAttrs(ctx),
			duration_ms: elapsedMs(startedNs),
			outcome: "baseline_corrupt",
		})
		const baseMsg =
			err instanceof Error
				? err.message
				: `Baseline file for stage '${activeStage}' is corrupt.`
		const msg = thrash.thrashing
			? `${baseMsg} ⚠ Thrash detected (${thrash.recentCount} corruption events in the last ${10} ticks). Auto-recovery is disabled — operator must run /haiku:repair --confirm-baseline-reset --override-thrash-circuit-breaker.`
			: `${baseMsg} Run /haiku:repair --confirm-baseline-reset --diff-shown to review the diff and confirm a reset; the agent has no path to silent-establish.`
		return {
			findings: [],
			baselineEstablished: false,
			action: null,
			error: "baseline_corrupt",
			errorMessage: msg,
		}
	}

	// 4. Enumerate the tracked surface.
	const surface = enumerateTrackedSurface(intentDir, activeStage)
	emitTelemetry("haiku.drift.surface.size", {
		...gateAttrs(ctx),
		file_count: String(surface.length),
	})

	// 5. Establish mode (AC-G8 / ARCHITECTURE.md §3.4).
	if (baseline === null) {
		// V-11 GATE: refuse silent-establish when this stage has previously
		// established a baseline. The legitimate path is "first tick on
		// this stage ever" — that case has no `drift_baseline_established_at`
		// stamp in state.json. If the stamp IS present, the baseline has
		// gone missing AFTER establish — that's the V-11 attacker primitive
		// (corrupt baseline.json → next tick silent-establishes attacker
		// content). We refuse unless the operator has placed an ack marker
		// (`stages/{stage}/.baseline-ack`) with a matching diff hash.
		if (wasBaselinePreviouslyEstablished(intentDir, activeStage)) {
			// Record this as a corruption event for the thrash counter.
			// Missing-after-establish is the same threat class as actively
			// corrupted JSON.
			const recentCount = recordBaselineCorruption(
				intentDir,
				activeStage,
				tickCounter,
			)
			emitTelemetry("haiku.drift.baseline.missing_after_established", {
				...gateAttrs(ctx),
				recent_corrupt_count: String(recentCount),
			})
			const thrash = isBaselineThrashing(intentDir, activeStage, tickCounter)
			if (thrash.thrashing) {
				emitTelemetry("haiku.security.baseline_thrash", {
					...gateAttrs(ctx),
					recent_count: String(thrash.recentCount),
				})
			}

			// Check the operator-only ack marker. The agent has no MCP-tool
			// path to write this; only `haiku_repair --confirm-baseline-reset`
			// (operator-driven) can place it.
			const ack = readBaselineAckMarker(intentDir, activeStage)
			if (!ack || thrash.thrashing) {
				emitTelemetry("haiku.drift.gate.duration_ms", {
					...gateAttrs(ctx),
					duration_ms: elapsedMs(startedNs),
					outcome: "baseline_missing_refused",
				})
				const reason = thrash.thrashing
					? "Auto-recovery disabled (baseline thrash). Operator must use /haiku:repair --confirm-baseline-reset --override-thrash-circuit-breaker."
					: "Operator must run /haiku:repair --confirm-baseline-reset --diff-shown and confirm the reconstructed-vs-on-disk diff. The agent CANNOT silent-establish a missing baseline once one has been established for this stage."
				return {
					findings: [],
					baselineEstablished: false,
					action: null,
					error: "baseline_corrupt",
					errorMessage: `Baseline for stage '${activeStage}' is missing after a prior establish. ${reason}`,
				}
			}
			// Ack marker present and not thrashing — proceed to establish.
			// Single-use semantics: clear the marker after we use it so it
			// can't authorise a second silent re-establish.
			clearBaselineAckMarker(intentDir, activeStage)
			emitTelemetry("haiku.drift.baseline.operator_ack_consumed", {
				...gateAttrs(ctx),
				ack_diff_hash: ack.diff_hash,
				ack_created_at: ack.created_at,
			})
		}

		const now = new Date().toISOString()
		const newEntries = new Map<string, BaselineEntry>()

		for (const entry of surface) {
			try {
				const sha256 = computeFileSha256Sync(entry.absPath)
				const binary = isBinarySync(entry.absPath)
				const st = statSync(entry.absPath)
				const mtime_ns = Math.round(st.mtimeMs * 1_000_000)
				const bytes = st.size

				newEntries.set(entry.pathRel, {
					path: entry.pathRel,
					sha256,
					bytes,
					mtime_ns,
					is_binary: binary,
					author_class: "agent",
					acknowledged_at: now,
					acknowledged_via: "baseline-init",
					stage: entry.stageOwner,
					tracking_class: entry.trackingClass,
				})
			} catch {
				// Unreadable file during establish — skip it.
			}
		}

		const newBaseline: Baseline = { entries: newEntries }
		try {
			writeBaselineSync(intentDir, activeStage, newBaseline)
		} catch (err) {
			// Errors signal — emit BEFORE rethrow so the failure is visible
			// even when the rethrow gets swallowed at a higher layer. The
			// rethrow itself is intentional: silently continuing on baseline
			// write failure (the prior behaviour) hid OOM, ENOSPC, and
			// permission errors that the runbook now needs to surface.
			emitTelemetry("haiku.drift.baseline.write_failed", {
				...gateAttrs(ctx),
				error: err instanceof Error ? err.message : String(err),
				site: "establish",
			})
			emitTelemetry("haiku.drift.gate.duration_ms", {
				...gateAttrs(ctx),
				duration_ms: elapsedMs(startedNs),
				outcome: "establish_write_failed",
			})
			throw err
		}

		stampBaselineEstablished(intentDir, activeStage)

		// V-11 blue-team (unit-03 bolt 1): mirror the establish event onto
		// the append-only action-log so the "previously established" signal
		// is anchored on a tamper-evident surface, not just state.json
		// (which the red-team RT1/RT6 showed an OOB attacker can disarm
		// by stealth-deleting or stealth-truncating).
		recordBaselineEstablishedMarker(intentDir, activeStage, tickCounter)

		// Traffic / lifecycle: this is the silent-establish path
		// (first-tick on an existing intent or after a baseline reset).
		emitTelemetry("haiku.drift.baseline.established", {
			...gateAttrs(ctx),
			file_count: String(newEntries.size),
		})
		emitTelemetry("haiku.drift.gate.duration_ms", {
			...gateAttrs(ctx),
			duration_ms: elapsedMs(startedNs),
			outcome: "established",
		})
		return { findings: [], baselineEstablished: true, action: null }
	}

	// 6. Read the action log for this tick (for author-class attribution).
	// V-05 consumer fix: SPA uploads with `stage === null` are stamped at
	// the intent-scope tick (deterministic, monotonic at the intent
	// level), NOT at any stage's tick. The drift gate fires per-stage,
	// so a per-tick filter alone misses those entries — the file change
	// then falls back to `baselineEntry.author_class` (typically "agent"
	// via the silent auto-add path) and the `human-via-mcp` provenance is
	// lost. Union per-stage entries (this tick) AND intentScopeActionLog
	// (every intent-scope entry, regardless of tick number) for the
	// path-based author-class lookup below.
	const stageActionLogEntries = readActionLogSync(intentDir, tickCounter)
	const intentScopeActionLog = readIntentScopeActionLogSync(intentDir)
	const actionLogEntries = [...stageActionLogEntries, ...intentScopeActionLog]

	// 7. Steady-state scan.
	const findings: DriftFinding[] = []
	const surfacePaths = new Set<string>()

	// Stale marker paths — collected for async removal after the loop.
	const staleMarkerPaths: string[] = []

	// Counters drive saturation telemetry at scan end.
	let silentAutoAddCount = 0
	let suppressedByMarkerCount = 0

	// Baseline-dirty flag — set when we silently auto-add previously-unseen
	// files. Persisted at end of scan so subsequent ticks see them as known.
	let baselineDirty = false

	for (const entry of surface) {
		surfacePaths.add(entry.pathRel)

		let currentSha: string
		let currentBytes: number
		let currentBinary: boolean
		let currentMtimeNs: number

		try {
			currentSha = computeFileSha256Sync(entry.absPath)
			const st = statSync(entry.absPath)
			currentBytes = st.size
			currentBinary = isBinarySync(entry.absPath)
			currentMtimeNs = Math.round(st.mtimeMs * 1_000_000)
		} catch {
			// File disappeared between enumeration and hashing — treated as
			// deleted in the baseline-entry check below.
			continue
		}

		const baselineEntry = baseline.entries.get(entry.pathRel)

		if (baselineEntry === undefined) {
			// File present on disk but no baseline entry — sha was effectively
			// null in our records. Per the gate contract (only previously-known
			// SHAs that change become drift findings), silently establish a
			// baseline entry and continue. This prevents existing intents from
			// flooding with synthetic out-of-band findings the first time a
			// freshly-added portion of the tracked surface is observed.
			baseline.entries.set(entry.pathRel, {
				path: entry.pathRel,
				sha256: currentSha,
				bytes: currentBytes,
				mtime_ns: currentMtimeNs,
				is_binary: currentBinary,
				author_class: "agent",
				acknowledged_at: new Date().toISOString(),
				acknowledged_via: "baseline-init",
				stage: entry.stageOwner,
				tracking_class: entry.trackingClass,
			})
			baselineDirty = true
			silentAutoAddCount++
			continue
		}

		if (baselineEntry.sha256 === currentSha) {
			// No change — happy path. Lazily write the content sidecar so that
			// "before" content is available the next time this file changes.
			// Intent-scope entries (stageOwner === null) get a sidecar at the
			// intent level to survive stage transitions. Images bypass the
			// "is_binary" guard — opaque binaries (fonts, archives, PDFs)
			// still skip because there's nothing useful to render diff-side.
			const sidecarEligible =
				(!currentBinary && !baselineEntry.is_binary) ||
				isImageBinarySync(entry.absPath)
			if (sidecarEligible) {
				const isIntentScope = entry.stageOwner === null
				const sidecarPath = isIntentScope
					? baselineIntentContentPath(intentDir, currentSha)
					: baselineContentPath(intentDir, activeStage, currentSha)
				if (!existsSync(sidecarPath)) {
					try {
						const buf = readFileSync(entry.absPath)
						if (isIntentScope) {
							writeBaselineIntentContentSync(intentDir, currentSha, buf)
						} else {
							writeBaselineContentSync(intentDir, activeStage, currentSha, buf)
						}
					} catch {
						// Non-fatal.
					}
				}
			}
			continue
		}

		// SHA differs. Check markers before emitting.
		const openMarker = findOpenMarker(markerStore, entry.pathRel)

		if (openMarker !== null) {
			if (isStaleMarker(openMarker, currentSha)) {
				// Double-edit: SHA changed since marker was created (AC-EE6).
				staleMarkerPaths.push(entry.pathRel)
				// Fall through to emit a fresh finding.
			} else {
				// Marker is current — suppress (AC-SF2).
				suppressedByMarkerCount++
				continue
			}
		}

		// Determine author class from action log (ARCHITECTURE.md §6.2).
		// `agent_write` (stamped by the stamp-agent-write PostToolUse hook
		// when the agent uses Write/Edit/MultiEdit on a tracked-surface
		// path) closes the bleed window where the agent's own edit to a
		// human-originated file would otherwise inherit the baseline's
		// `human-implicit` attribution. When the agent's stamped SHA
		// matches the on-disk SHA, the agent has already accounted for
		// the write — silently update the baseline and skip emitting a
		// finding (the agent doesn't need to classify its own deliberate
		// writes, the same way `haiku_unit_write` writes never enter the
		// surface in the first place).
		// Walk the log backwards (newest first) so the most recent entry
		// per type wins. The action log is append-only, so on a multi-
		// tick or same-tick re-write the *latest* SHA is what matches the
		// on-disk bytes. Earlier rev used `Array.find` which returned the
		// oldest match — that broke same-tick double-writes (agent
		// stamps SHA_A then SHA_B; current bytes are SHA_B; find picked
		// SHA_A; SHA mismatch → false positive) and cross-tick intent-
		// scope writes through `readIntentScopeActionLogSync` (which
		// unions every tick's entries). `findLast` would be cleaner but
		// requires ES2023 lib; this hand-rolled loop works on the
		// current ES2022 target.
		let humanLogEntry: (typeof actionLogEntries)[number] | undefined
		let agentLogEntry: (typeof actionLogEntries)[number] | undefined
		for (let i = actionLogEntries.length - 1; i >= 0; i--) {
			const e = actionLogEntries[i]
			if (e.path !== entry.pathRel) continue
			if (!humanLogEntry && e.entry_type === "human_write") humanLogEntry = e
			else if (!agentLogEntry && e.entry_type === "agent_write")
				agentLogEntry = e
			if (humanLogEntry && agentLogEntry) break
		}
		if (!humanLogEntry && agentLogEntry && agentLogEntry.sha === currentSha) {
			// Agent stamped this write and the file still matches that SHA —
			// silently absorb into the baseline, no finding emitted. The
			// `markBaselineDirty + writeBaselineSync` post-loop already
			// covers the persistence side.
			baseline.entries.set(entry.pathRel, {
				...baselineEntry,
				sha256: currentSha,
				bytes: currentBytes,
				mtime_ns: currentMtimeNs,
				is_binary: currentBinary,
				author_class: "agent",
				acknowledged_at: new Date().toISOString(),
				acknowledged_via: "agent-write",
			})
			baselineDirty = true
			continue
		}
		// authorClass is carried into the finding so the assessment handler
		// can populate the DriftFinding and Assessment records accurately.
		// Priority: human_write (MCP) > agent_write (stale, e.g. agent wrote
		// then human re-edited) > baseline fallback.
		const authorClass = humanLogEntry
			? "human-via-mcp"
			: agentLogEntry
				? "agent"
				: baselineEntry.author_class

		// Build diff for text files. Write a lazy sidecar for unchanged files
		// so "before" content is available when the file eventually changes.
		const bothText = !currentBinary && !baselineEntry.is_binary
		const diffUnified = bothText
			? buildUnifiedDiff(
					intentDir,
					activeStage,
					entry.pathRel,
					baselineEntry.sha256,
					entry.absPath,
				)
			: null

		// For image findings, persist the after-side bytes to a sidecar
		// addressed by the new SHA so the SPA's assessment view can render
		// before/after thumbnails immediately — without waiting for
		// classification to update the baseline. Cheap (one fs write per
		// modified image), and the bytes are already in memory's path
		// (we just hashed them). Skips text files (the unified diff is
		// the visual diff) and opaque binaries (nothing to render).
		if (currentBinary && isImageBinarySync(entry.absPath)) {
			const isIntentScope = entry.stageOwner === null
			const afterSidecar = isIntentScope
				? baselineIntentContentPath(intentDir, currentSha)
				: baselineContentPath(intentDir, activeStage, currentSha)
			if (!existsSync(afterSidecar)) {
				try {
					const buf = readFileSync(entry.absPath)
					if (isIntentScope) {
						writeBaselineIntentContentSync(intentDir, currentSha, buf)
					} else {
						writeBaselineContentSync(intentDir, activeStage, currentSha, buf)
					}
				} catch {
					// Non-fatal — the SPA will fall back to "image preview not
					// available" if the after-sidecar is absent.
				}
			}
		}

		findings.push({
			path: entry.pathRel,
			change_kind: "modified",
			is_binary: currentBinary || baselineEntry.is_binary,
			diff_unified: bothText ? diffUnified : null,
			before_sha256: baselineEntry.sha256,
			after_sha256: currentSha,
			before_bytes: baselineEntry.bytes,
			after_bytes: currentBytes,
			tracking_class: entry.trackingClass,
			stage: entry.stageOwner,
			context_unit: null,
			author_class: authorClass,
		})
	}

	// Remove stale markers in one synchronous batch write. The earlier
	// fire-and-forget loop raced with subsequent ticks: rapid successive
	// runs would re-detect the same stale marker before the async removal
	// landed and dispatch a duplicate `manual_change_assessment` for the
	// same file. Sync + dedup eliminates both windows.
	if (staleMarkerPaths.length > 0) {
		emitTelemetry("haiku.drift.markers.stale_removed", {
			...gateAttrs(ctx),
			removed_count: String(staleMarkerPaths.length),
		})
		try {
			removeMarkersSync(intentDir, staleMarkerPaths)
		} catch {
			// Non-fatal: the stale markers will be detected again on the next
			// tick. The marker store write is best-effort here — the dispatch
			// has already been recorded for the agent to act on.
		}
	}

	// 7b. Persist any silent auto-adds from step 7 so the next tick sees them
	//     as known and we don't re-add them on every tick. The post-write
	//     site MUST surface its failure (errors-signal contract) — silent
	//     swallow here previously hid disk-full / permission errors that
	//     the operations runbook needs to alarm on.
	if (baselineDirty) {
		try {
			writeBaselineSync(intentDir, activeStage, baseline)
		} catch (err) {
			emitTelemetry("haiku.drift.baseline.write_failed", {
				...gateAttrs(ctx),
				error: err instanceof Error ? err.message : String(err),
				site: "post-write",
			})
			emitTelemetry("haiku.drift.gate.duration_ms", {
				...gateAttrs(ctx),
				duration_ms: elapsedMs(startedNs),
				outcome: "post_write_failed",
			})
			throw err
		}
	}

	// Saturation: silent auto-adds (signals "agent backfilling baseline" —
	// a runaway count is a signal we picked up a new dir we shouldn't have).
	if (silentAutoAddCount > 0) {
		emitTelemetry("haiku.drift.silent_auto_add.count", {
			...gateAttrs(ctx),
			count: String(silentAutoAddCount),
		})
	}
	if (suppressedByMarkerCount > 0) {
		emitTelemetry("haiku.drift.markers.suppressed_count", {
			...gateAttrs(ctx),
			count: String(suppressedByMarkerCount),
		})
	}

	// 8. Check for baseline entries whose files no longer exist (AC-EE2).
	for (const [pathRel, baselineEntry] of baseline.entries) {
		if (surfacePaths.has(pathRel)) continue
		// File was in baseline but not found in the surface scan.
		const absPath = join(intentDir, pathRel)
		if (!existsSync(absPath)) {
			findings.push({
				path: pathRel,
				change_kind: "file-removed",
				is_binary: baselineEntry.is_binary,
				diff_unified: null,
				before_sha256: baselineEntry.sha256,
				after_sha256: null,
				before_bytes: baselineEntry.bytes,
				after_bytes: null,
				tracking_class: baselineEntry.tracking_class,
				stage: baselineEntry.stage,
				context_unit: null,
			})
		}
	}

	// 9. Mass-drift synthesis heuristic (ARCHITECTURE.md §8.3):
	//    When > 50% of the effective surface has drifted in a single tick,
	//    emit a single synthetic finding instead of the full list. This is
	//    NOT a memory/size-cap downgrade — it triggers on drift volume
	//    relative to surface, regardless of absolute surface size. Typical
	//    causes: bulk regenerate, git rebase, refactor that touched the
	//    majority of tracked files.
	const effectiveSurfaceSize = Math.max(
		surface.length,
		baseline.entries.size,
		1,
	)
	if (findings.length > 0 && findings.length > effectiveSurfaceSize * 0.5) {
		const syntheticFinding: DriftFinding = {
			path: `<${activeStage}>`,
			change_kind: "modified",
			is_binary: false,
			diff_unified: null,
			before_sha256: null,
			after_sha256: null,
			before_bytes: null,
			after_bytes: null,
			tracking_class: "stage-output",
			stage: activeStage,
			context_unit: null,
			is_baseline_oom: true,
		}
		emitTelemetry("haiku.drift.findings.mass_synthesized", {
			...gateAttrs(ctx),
			raw_findings_count: String(findings.length),
			effective_surface_size: String(effectiveSurfaceSize),
			drift_ratio: String(findings.length / effectiveSurfaceSize),
		})
		emitTelemetry("haiku.drift.findings.count", {
			...gateAttrs(ctx),
			count: "1",
			synthetic: "true",
		})
		emitTelemetry("haiku.drift.gate.duration_ms", {
			...gateAttrs(ctx),
			duration_ms: elapsedMs(startedNs),
			outcome: "mass_synthesized",
		})
		return {
			findings: [syntheticFinding],
			baselineEstablished: false,
			action: "manual_change_assessment",
		}
	}

	emitTelemetry("haiku.drift.findings.count", {
		...gateAttrs(ctx),
		count: String(findings.length),
		synthetic: "false",
	})

	if (findings.length === 0) {
		emitTelemetry("haiku.drift.gate.duration_ms", {
			...gateAttrs(ctx),
			duration_ms: elapsedMs(startedNs),
			outcome: "clean",
		})
		return { findings: [], baselineEstablished: false, action: null }
	}

	emitTelemetry("haiku.drift.gate.duration_ms", {
		...gateAttrs(ctx),
		duration_ms: elapsedMs(startedNs),
		outcome: "findings",
	})
	return {
		findings,
		baselineEstablished: false,
		action: "manual_change_assessment",
	}
}
