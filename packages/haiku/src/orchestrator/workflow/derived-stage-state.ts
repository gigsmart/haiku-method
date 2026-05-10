// orchestrator/workflow/derived-stage-state.ts — Derive per-stage workflow
// state from per-unit FM + branch-merge state. Replaces the per-stage
// `state.json` read path in v4.
//
// In v4, `state.json` is dead. The migrator deletes the file on first
// read of any pre-v4 intent, and the workflow engine MUST NOT recreate
// it. Stage status, phase, and gate outcome are derived on demand from
// the artifacts that actually carry the signal:
//
//   status      → branch-merge state (`isBranchMerged(stage→intent main)`)
//                 falls back to per-unit completion when git is absent.
//   phase       → "earliest milestone the stage hasn't cleared":
//                   - elaboration.md missing/unverified → "elaborate"
//                   - units missing → "elaborate" (decompose pending)
//                   - any unit not past terminal hat advance → "execute"
//                   - any unit missing required reviews → "review"
//                   - any unit missing required approvals → "gate"
//                 Per the design: a NEW unit that lands after the gate
//                 implicitly invalidates the stage because that unit
//                 has no `approvals.user`. No separate stage stamp can
//                 hide drift.
//   gate_outcome → "advanced" iff every unit has every required
//                  approval signed; else null. Pulled from per-unit
//                  `approvals.<role>` so unit-level mutations re-derive
//                  the stage signal in the same tick.
//   started_at  → earliest `started_at` across units.
//   completed_at → latest terminal-advance `completed_at` across units,
//                  only when `status === "completed"`.
//   visits      → `max(unit.iterations.length)` — a per-stage "how many
//                  times has any work been redone" indicator.
//
// This file is pure: reads disk (FM + branch state via `isBranchMerged`),
// no writes. Anyone can call `deriveStageState`; same disk → same answer.

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import matter from "gray-matter"
import { isGitRepo } from "../../state/shared.js"
import { readReviewAgentPaths } from "../../studio-reader.js"
import { resolveStageHats } from "../studio.js"

export type DerivedStageStatus = "pending" | "active" | "completed"
export type DerivedStagePhase = "elaborate" | "execute" | "review" | "gate"
export type DerivedGateOutcome = "advanced" | "rejected" | null

export interface DerivedStageState {
	stage: string
	status: DerivedStageStatus
	/** null when status === "pending" (stage hasn't started yet) or
	 *  when status === "completed" (no in-flight phase). */
	phase: DerivedStagePhase | null
	started_at: string | null
	completed_at: string | null
	gate_outcome: DerivedGateOutcome
	visits: number
}

interface UnitView {
	name: string
	fm: Record<string, unknown>
}

interface IterationView {
	hat?: string
	completed_at?: string | null
	result: "advance" | "reject" | null
}

function readFm(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, "utf8")
		return matter(raw).data as Record<string, unknown>
	} catch {
		return null
	}
}

function listUnits(stageDir: string): UnitView[] {
	const dir = join(stageDir, "units")
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((e) => {
			const fm = readFm(join(dir, e.name)) ?? {}
			return { name: basename(e.name, ".md"), fm }
		})
}

function pickIterations(fm: Record<string, unknown>): IterationView[] {
	if (!Array.isArray(fm.iterations)) return []
	return fm.iterations as IterationView[]
}

function pickReviews(
	fm: Record<string, unknown>,
): Record<string, { at: string } | null> {
	const r = fm.reviews
	if (r === null || typeof r !== "object" || Array.isArray(r)) return {}
	return r as Record<string, { at: string } | null>
}

function pickApprovals(
	fm: Record<string, unknown>,
): Record<string, { at: string } | null> {
	const a = fm.approvals
	if (a === null || typeof a !== "object" || Array.isArray(a)) return {}
	return a as Record<string, { at: string } | null>
}

/** Reviewer roles for a stage. Mirrors `walkIntentTrack` in cursor.ts.
 *  Autopilot trims to the engine-built minimum (no agents, no user
 *  gate); other modes get the full chain. */
function reviewRolesFor(
	studio: string,
	stage: string,
	intentMode: string,
): string[] {
	if (intentMode === "autopilot") return ["spec"]
	const reviewAgents = Object.keys(readReviewAgentPaths(studio, stage)).sort()
	return ["spec", ...reviewAgents, "user"]
}

/** Approval roles for a stage. Differs from review roles by the
 *  inclusion of `quality_gates` (engine-run, not subagent-dispatched).
 *  Mirrors `walkIntentTrack` in cursor.ts. */
function approvalRolesFor(
	studio: string,
	stage: string,
	intentMode: string,
): string[] {
	if (intentMode === "autopilot") return ["spec", "quality_gates"]
	const reviewAgents = Object.keys(readReviewAgentPaths(studio, stage)).sort()
	return ["spec", "quality_gates", ...reviewAgents, "user"]
}

/** Does intent main's tree carry `stages/<stage>/units/*.md`?
 *  Mirrors `firstUnmergedStage` in cursor.ts — intent main's filesystem
 *  IS the canonical "stage's work has merged" signal. We can't use raw
 *  `isBranchMerged(stageBranch, intentMain)` because a freshly-forked
 *  stage branch shares its tip with intent main and would falsely report
 *  "merged" before any work landed. Querying intent main's tree
 *  directly via `git ls-tree` is checkout-independent — works whether
 *  the working tree is on intent main, on the stage branch, or on a
 *  unit worktree. */
function intentMainHasStageUnits(slug: string, stage: string): boolean {
	if (!isGitRepo()) return false
	const intentMain = `haiku/${slug}/main`
	const path = `.haiku/intents/${slug}/stages/${stage}/units`
	try {
		const output = execFileSync(
			"git",
			["ls-tree", "--name-only", `${intentMain}:${path}`],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		)
		return output.split("\n").some((f) => f.trim().endsWith(".md"))
	} catch {
		// Path doesn't exist on intent main, or branch missing — both
		// mean "stage hasn't merged yet."
		return false
	}
}

/** Does the named branch resolve to a real commit? Used to gate the
 *  git-mode status derivation: when there's no `haiku/<slug>/main`
 *  branch, the test fixture is fs-shaped even if the working dir is
 *  inside a git repo. */
function branchHeadExists(branch: string): boolean {
	if (!isGitRepo()) return false
	try {
		execFileSync("git", ["rev-parse", "--verify", branch], {
			stdio: ["ignore", "pipe", "pipe"],
		})
		return true
	} catch {
		return false
	}
}

function deriveStatus(
	slug: string,
	stage: string,
	units: UnitView[],
	hats: string[],
	approvalRoles: string[],
): DerivedStageStatus {
	const intentMain = `haiku/${slug}/main`
	if (isGitRepo() && branchHeadExists(intentMain)) {
		// Git mode (intent main exists): intent main's tree is the
		// source of truth. Same signal `firstUnmergedStage` uses —
		// units present on intent main means the stage merged.
		// `merge_stage` is a recurring event so a previously-merged
		// stage that gains a new unit re-opens (status stays
		// "completed" until the merge boundary is crossed again; the
		// gate signal flips first via per-unit approvals).
		if (intentMainHasStageUnits(slug, stage)) return "completed"
		if (units.length > 0) return "active"
		return "pending"
	}
	// FS mode (no git): derive from per-unit completion. A stage is
	// "completed" iff every unit reached terminal-hat-advance AND has
	// every required approval signed. Otherwise "active" if any unit
	// exists, else "pending".
	if (units.length === 0) return "pending"
	const allComplete = units.every((u) => {
		const its = pickIterations(u.fm)
		if (its.length === 0) return false
		const last = its[its.length - 1]
		if (last.result !== "advance") return false
		if (hats.length > 0 && last.hat !== hats[hats.length - 1]) return false
		const approvals = pickApprovals(u.fm)
		return approvalRoles.every((r) => approvals[r])
	})
	return allComplete ? "completed" : "active"
}

function derivePhase(
	stageDir: string,
	units: UnitView[],
	hats: string[],
	reviewRoles: string[],
	approvalRoles: string[],
	intentMode: string,
): DerivedStagePhase | null {
	// 1. Per-stage elaborate gate (skipped under autopilot). Mirrors
	//    cursor.ts:684-700: artifact missing & units exist →
	//    grandfather (fall through). Artifact present but unverified
	//    → phase is "elaborate".
	if (intentMode !== "autopilot") {
		const elabPath = join(stageDir, "elaboration.md")
		if (existsSync(elabPath)) {
			const elabFm = readFm(elabPath) ?? {}
			const verifiedAt =
				typeof elabFm.verified_at === "string" ? elabFm.verified_at : ""
			if (!verifiedAt) return "elaborate"
		} else if (units.length === 0) {
			return "elaborate"
		}
	}

	// 2. Decompose pending. Lump into "elaborate" for v3-shape consumers
	//    (the SPA, telemetry, etc. that key off four canonical phase
	//    names). The cursor's "decompose" action fires here.
	if (units.length === 0) return "elaborate"

	// 3. Execute: any unit not past terminal hat advance.
	if (hats.length > 0) {
		const allHatsDone = units.every((u) => {
			const its = pickIterations(u.fm)
			if (its.length === 0) return false
			const last = its[its.length - 1]
			return last.result === "advance" && last.hat === hats[hats.length - 1]
		})
		if (!allHatsDone) return "execute"
	}

	// 4. Review: any unit missing a required review role.
	for (const role of reviewRoles) {
		const missing = units.some((u) => !pickReviews(u.fm)[role])
		if (missing) return "review"
	}

	// 5. Gate: any unit missing a required approval role.
	for (const role of approvalRoles) {
		const missing = units.some((u) => !pickApprovals(u.fm)[role])
		if (missing) return "gate"
	}

	// All approvals signed — stage is past gate, awaiting `merge_stage`.
	// The status check above will return "completed" on the next tick
	// once the merge lands. Until then, phase is null (no in-flight
	// phase) and the cursor emits `merge_stage`.
	return null
}

function deriveGateOutcome(
	units: UnitView[],
	approvalRoles: string[],
): DerivedGateOutcome {
	if (units.length === 0) return null
	// Per the design: gate is a per-unit aggregate, not a stage-level
	// stamp. A new unit added post-approval has empty `approvals.*` and
	// implicitly re-opens the gate.
	const allApproved = units.every((u) => {
		const approvals = pickApprovals(u.fm)
		return approvalRoles.every((r) => approvals[r])
	})
	return allApproved ? "advanced" : null
}

function deriveStartedAt(units: UnitView[]): string | null {
	const stamps = units
		.map((u) =>
			typeof u.fm.started_at === "string" ? (u.fm.started_at as string) : null,
		)
		.filter((s): s is string => s !== null)
		.sort()
	return stamps[0] ?? null
}

function deriveCompletedAt(
	units: UnitView[],
	status: DerivedStageStatus,
): string | null {
	if (status !== "completed") return null
	let latest: string | null = null
	for (const u of units) {
		const its = pickIterations(u.fm)
		if (its.length === 0) continue
		const last = its[its.length - 1]
		if (last.result !== "advance") continue
		const at = typeof last.completed_at === "string" ? last.completed_at : null
		if (at !== null && (latest === null || at > latest)) latest = at
	}
	return latest
}

function deriveVisits(units: UnitView[]): number {
	let max = 0
	for (const u of units) {
		const its = pickIterations(u.fm)
		if (its.length > max) max = its.length
	}
	return max
}

/** Compute the v4 stage state from per-unit FM + branch-merge state.
 *  Returns the v3-shape record (`status`, `phase`, `gate_outcome`,
 *  etc.) so existing callers can read derived values without changing
 *  their consumption shape. */
export function deriveStageState(args: {
	slug: string
	studio: string
	stage: string
	intentDir: string
	intentMode: string
}): DerivedStageState {
	const { slug, studio, stage, intentDir, intentMode } = args
	const stageDir = join(intentDir, "stages", stage)
	const units = listUnits(stageDir)
	const hats = resolveStageHats(studio, stage)
	const reviewRoles = reviewRolesFor(studio, stage, intentMode)
	const approvalRoles = approvalRolesFor(studio, stage, intentMode)

	const status = deriveStatus(slug, stage, units, hats, approvalRoles)
	const phase =
		status === "completed"
			? null
			: derivePhase(
					stageDir,
					units,
					hats,
					reviewRoles,
					approvalRoles,
					intentMode,
				)
	const gate_outcome = deriveGateOutcome(units, approvalRoles)
	const started_at = deriveStartedAt(units)
	const completed_at = deriveCompletedAt(units, status)
	const visits = deriveVisits(units)

	return {
		stage,
		status,
		phase,
		started_at,
		completed_at,
		gate_outcome,
		visits,
	}
}
