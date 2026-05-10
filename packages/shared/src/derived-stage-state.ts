// shared/src/derived-stage-state.ts — Pure derivation of per-stage
// workflow state. Single source of truth for the v4 cursor's stage
// status / phase / gate-outcome model.
//
// In v4 there is no per-stage `state.json` — stage position lives in
// per-unit FM + branch-merge state. The MCP engine (Node, disk-driven)
// and the website browse UI (Next.js, VCS-API-driven) both compute the
// same thing from the same shape; this file is what they share so
// they can't drift.
//
// **Pure**: no I/O, no env reads, no globals. Caller hands in
// already-loaded data; the function decides. Same input → same answer.
//
// Engine wrapper: `packages/haiku/src/orchestrator/workflow/derived-stage-state.ts`
// Website wrapper: `website/lib/browse/intent-parsing.ts`

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

/** A single unit's frontmatter as the derivation needs it. Both the
 *  engine and the website load this from disk / API; the shape they
 *  hand in matches the on-disk YAML decoded into a plain object. */
export interface DerivedUnitView {
	/** Filename without `.md`. Used for diagnostics; the derivation
	 *  itself doesn't care about identity. */
	name: string
	fm: Record<string, unknown>
}

interface IterationView {
	hat?: string
	/** May arrive as a `Date` from the website's VCS-API path (raw
	 *  gray-matter, no normalization). Engine path normalizes to ISO
	 *  string before reaching the pure function. Always coerce via
	 *  `coerceTimestamp` — never write `typeof === "string"` guards. */
	completed_at?: string | Date | null
	result: "advance" | "reject" | null
}

/** Inputs the caller hands the derivation. Every field except
 *  `units` and `intentMode` is independently fetchable — engine reads
 *  from disk, website reads from VCS API — and every field is
 *  optional with sensible defaults so callers don't have to
 *  precompute pieces they don't have. */
export interface DerivedStageStateInputs {
	stage: string
	units: ReadonlyArray<DerivedUnitView>
	intentMode: string

	/** Ordered hat list from STAGE.md. Two valid reasons to pass empty:
	 *    1. The stage genuinely declares no hats (research-style stages
	 *       that consist only of artifact production).
	 *    2. The caller doesn't have STAGE.md available (e.g., the
	 *       website browse UI fetches per-unit FM via VCS API and
	 *       intentionally chooses "any advance result counts as
	 *       terminal"). The website does this on purpose.
	 *  When non-empty, `deriveStatus` and `derivePhase` require the
	 *  last iteration's `hat` field to match `hats[hats.length - 1]`
	 *  for the unit to count as past-terminal-advance. When empty,
	 *  any `result === "advance"` qualifies — be sure that's the
	 *  semantic you want before passing `[]` from a caller that
	 *  *does* know the hats. */
	hats?: ReadonlyArray<string>

	/** Reviewer role list (mode-shaped). Engine builds this from the
	 *  studio's review-agents/. Website builds it from the same
	 *  source over the VCS tree. */
	reviewRoles?: ReadonlyArray<string>

	/** Approval role list (mode-shaped). Differs from reviewRoles by
	 *  the inclusion of `quality_gates` (engine-run, not subagent-
	 *  dispatched). */
	approvalRoles?: ReadonlyArray<string>

	/** Has the stage's branch been merged into intent main? When true,
	 *  status flips to "completed". Caller decides:
	 *    - engine: query intent main's tree for `stages/<stage>/units/*.md`
	 *    - website: same check via VCS API
	 *  Pass `null` for filesystem-only mode (no branches). */
	stageMergedIntoMain?: boolean | null

	/** Has the stage's `elaboration.md` artifact been signed by a
	 *  verifier (`verified_at` stamped)? Tri-state:
	 *    - true:  artifact exists AND verified_at is set
	 *    - false: artifact exists but verified_at is empty
	 *    - null:  artifact doesn't exist (skipped or grandfathered)
	 *  Pass `null` for autopilot mode — the gate is bypassed. */
	elaborationVerified?: boolean | null
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

/** A unit counts as "started" when it has a `started_at` stamp OR
 *  any iteration appended. Either signal proves the workflow engine
 *  began processing it. Used to distinguish pending (no work yet)
 *  from active (work in flight).
 *
 *  `started_at` may be a string (when explicitly quoted in YAML or
 *  written via `setFrontmatterField`) or a `Date` (when gray-matter's
 *  YAML 1.1 parser auto-promotes an unquoted ISO timestamp). Accept
 *  both so the derivation doesn't depend on serializer choice. */
function isUnitStarted(u: DerivedUnitView): boolean {
	const s = u.fm.started_at
	if (typeof s === "string" && s.length > 0) return true
	if (s instanceof Date && !Number.isNaN(s.getTime())) return true
	return pickIterations(u.fm).length > 0
}

function deriveStatus(
	units: ReadonlyArray<DerivedUnitView>,
	hats: ReadonlyArray<string>,
	approvalRoles: ReadonlyArray<string>,
	stageMergedIntoMain: boolean | null,
): DerivedStageStatus {
	if (stageMergedIntoMain === true) return "completed"
	// Branch-aware mode but not merged: active iff any unit has
	// actually started; bare unit specs that never ran are still
	// pending.
	if (stageMergedIntoMain === false) {
		if (units.length === 0) return "pending"
		return units.some(isUnitStarted) ? "active" : "pending"
	}
	// Filesystem mode (no branch signal). Derive completion from
	// per-unit terminal-advance + every required approval signed.
	if (units.length === 0) return "pending"
	if (!units.some(isUnitStarted)) return "pending"
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
	units: ReadonlyArray<DerivedUnitView>,
	hats: ReadonlyArray<string>,
	reviewRoles: ReadonlyArray<string>,
	approvalRoles: ReadonlyArray<string>,
	intentMode: string,
	elaborationVerified: boolean | null,
): DerivedStagePhase | null {
	// 1. Elaborate gate. Skipped under autopilot. Mirrors cursor.ts:684-700:
	//    artifact missing & units exist → grandfather (fall through).
	//    Artifact present but unverified → "elaborate".
	if (intentMode !== "autopilot") {
		if (elaborationVerified === false) return "elaborate"
		// elaborationVerified === null means "artifact missing"; only
		// fire if we also have no units (fresh stage).
		if (elaborationVerified === null && units.length === 0) return "elaborate"
	}

	// 2. Decompose pending. Lump into "elaborate" for v3-shape
	//    consumers (the SPA, telemetry) that key off four canonical
	//    phase names.
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

	// All approvals signed. Stage is past gate, awaiting merge_stage.
	return null
}

function deriveGateOutcome(
	units: ReadonlyArray<DerivedUnitView>,
	approvalRoles: ReadonlyArray<string>,
): DerivedGateOutcome {
	if (units.length === 0) return null
	// Per the v4 design: gate is a per-unit aggregate, not a stage-
	// level stamp. A new unit added post-approval has empty
	// `approvals.*` and implicitly re-opens the gate — no stale stage
	// stamp can hide drift.
	const allApproved = units.every((u) => {
		const approvals = pickApprovals(u.fm)
		return approvalRoles.every((r) => approvals[r])
	})
	return allApproved ? "advanced" : null
}

/** Coerce a YAML timestamp value (string or auto-promoted Date) into
 *  the canonical ISO-8601 string. Returns null when the value is
 *  neither a non-empty string nor a valid Date — gray-matter's YAML 1.1
 *  parser auto-promotes unquoted ISO timestamps to `Date`, so callers
 *  that compare or display these stamps as strings have to normalize. */
function coerceTimestamp(v: unknown): string | null {
	if (typeof v === "string" && v.length > 0) return v
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
	return null
}

function deriveStartedAt(units: ReadonlyArray<DerivedUnitView>): string | null {
	const stamps = units
		.map((u) => coerceTimestamp(u.fm.started_at))
		.filter((s): s is string => s !== null)
		.sort()
	return stamps[0] ?? null
}

function deriveCompletedAt(
	units: ReadonlyArray<DerivedUnitView>,
	status: DerivedStageStatus,
): string | null {
	if (status !== "completed") return null
	let latest: string | null = null
	for (const u of units) {
		const its = pickIterations(u.fm)
		if (its.length === 0) continue
		const last = its[its.length - 1]
		if (last.result !== "advance") continue
		const at = coerceTimestamp(last.completed_at)
		if (at !== null && (latest === null || at > latest)) latest = at
	}
	return latest
}

function deriveVisits(units: ReadonlyArray<DerivedUnitView>): number {
	let max = 0
	for (const u of units) {
		const its = pickIterations(u.fm)
		if (its.length > max) max = its.length
	}
	return max
}

/** Compute the v4 derived stage state. Pure: same inputs → same
 *  outputs. Engine and website both call this — see the wrapper
 *  modules for the I/O each one performs to gather the inputs. */
export function deriveStageStatePure(
	args: DerivedStageStateInputs,
): DerivedStageState {
	const {
		stage,
		units,
		intentMode,
		hats = [],
		reviewRoles = [],
		approvalRoles = [],
		stageMergedIntoMain = null,
		elaborationVerified = null,
	} = args

	const status = deriveStatus(units, hats, approvalRoles, stageMergedIntoMain)
	const phase =
		status === "completed"
			? null
			: derivePhase(
					units,
					hats,
					reviewRoles,
					approvalRoles,
					intentMode,
					elaborationVerified,
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
