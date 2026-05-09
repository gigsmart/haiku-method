// orchestrator/workflow/cursor.ts — The single virtual cursor over an
// intent's aggregate state.
//
// On every haiku_run_next call, derivePosition(slug) reads disk:
//   - intent.md
//   - every unit.md across every stage
//   - every feedback file across every stage + intent-scope
//   - studio config (cached)
//   - drift sweep (Track C)
//
// And returns ONE action describing the next thing the agent should
// do, OR null when there's nothing to do (mid-wave noop, all
// in-flight subagents still working).
//
// No side effects. Anyone can call run_next; same disk → same answer.
//
// Track priority:
//   1. Track C — drift sweep. Any drift event → drift_detected.
//   2. Track B — feedback. Any open FB → feedback-cycle action.
//   3. Track A — intent. Walk stages in order; return first non-null
//      action.
//   4. All stages merged into intent main + intent.approvals.* signed
//      → sealed.
//
// Stages are NEVER sealed — only intents are. A previously-merged
// stage that gains a new unit (e.g. because the feedback engine added
// corrective work) becomes ahead-of-main and the cursor automatically
// rewinds to it via firstUnmergedStage. merge_stage is a recurring
// event, not a terminal one. Forward-only applies to existing units'
// bytes (immutable post-merge), not to whether a stage is "done."
//
// State sources of truth (no state.json anywhere):
//   - "active stage" = first stage whose branch is not merged into
//     intent main (derived from git --is-ancestor)
//   - "in-flight unit" = unit with started_at != null and
//     iterations[-1].result == null
//   - "wave-ready unit" = unit with started_at == null whose
//     depends_on are all merged (their branch is in stage branch)
//   - "stage ready to merge" = every unit merged + every spec review
//     signed + quality_gates signed + every configured agent signed
//     + user signed (mode-dependent — autopilot skips agents and user)
//
// Mode shaping (read from intent.mode):
//   - continuous: full role list [spec, quality_gates, <agents>, user]
//   - discrete:   same role list; user_gate triggers MR opening + wait
//                 for merge into intent main as the approval signal
//   - autopilot:  trimmed role list [spec, quality_gates]; no user
//                 gate, no agent gates, merge_stage auto-fires once
//                 quality_gates is signed

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import matter from "gray-matter"
import { primaryRepoRoot } from "../../state-tools.js"
import {
	readReviewAgentPaths,
	readStageArtifactDefs,
} from "../../studio-reader.js"
import {
	resolveStageFixHats,
	resolveStageHats,
	resolveStudioStages,
} from "../studio.js"
import { type DriftEvent, runDriftSweep } from "./drift-sweep.js"

// ── CursorAction discriminated union ─────────────────────────────────

export type CursorAction =
	| { kind: "drift_detected"; events: DriftEvent[] }
	| {
			kind: "discovery_required"
			stage: string
			agent: string
			units: string[]
	  }
	// design_direction_* and clarify_required cursor actions deleted
	// 2026-05-08: collapsed into the discovery-agent model. Studios
	// now declare a discovery template with `tool:` (e.g., the
	// software studio's `discovery/DESIGN-DIRECTION.md` declares
	// `tool: pick_design_direction`) and the cursor's existence
	// check on the artifact location passes the gate. See
	// `prompts/discovery_required.ts` for the tool-driven branch.
	// `elaborate` is the per-stage human-conversation gate. Fires
	// whenever (a) `intent.mode !== "autopilot"` and
	// (b) `stages/<stage>/elaboration.md` is missing on a fresh stage
	// (units.length === 0). The agent's job during this action is the
	// conversation: read intent + STAGE.md + prior outputs, surface
	// informed questions to the user, and capture the agreement via
	// `haiku_stage_elaboration_record`. The artifact-present-but-
	// unverified case emits `elaborate_review` instead, NOT this
	// action — so this action's payload doesn't need to convey
	// "where in the gate cycle we are." Just `stage` is enough.
	// Autopilot bypasses this clause entirely.
	| { kind: "elaborate"; stage: string }
	// `elaborate_review` dispatches the substance verifier on a captured
	// elaboration artifact. Two scopes:
	//   - per-stage (stage field present): reads
	//     `stages/<stage>/elaboration.md` + intent.md + STAGE.md.
	//     Pass stamps `verified_at` via `haiku_stage_elaboration_seal`.
	//   - pre-intent (no stage): reads intent.md and grades whether
	//     the body reflects a meaningful conversation about what the
	//     user wants. Pass stamps `verified_at` via
	//     `haiku_intent_seal`. Fires immediately after intent_create
	//     (before any stage walk) when mode != autopilot.
	// Fail returns gaps so the agent re-engages the user and re-records.
	| { kind: "elaborate_review"; stage?: string }
	// `decompose` is the unit-spec writing phase. Fires when (a) the
	// elaborate gate has passed (or autopilot bypassed it) and
	// (b) `units.length === 0`. The agent dispatches stage-scoped
	// discovery subagents and writes unit specs informed by the
	// captured conversation + discovery output. Renamed from the legacy
	// `elaborate` cursor action; the old name is reserved for the
	// conversation gate above.
	| { kind: "decompose"; stage: string }
	| {
			kind: "start_unit_hat"
			stage: string
			hat: string
			units: string[]
			terminal: boolean
	  }
	| {
			kind: "start_feedback_hat"
			stage: string
			hat: string
			feedback_ids: string[]
			terminal: boolean
	  }
	| {
			kind: "dispatch_review"
			stage: string
			role: string
			units: string[]
	  }
	| {
			kind: "dispatch_approval"
			stage: string
			role: string
			units: string[]
	  }
	| {
			kind: "dispatch_quality_gates"
			stage: string
			units: string[]
	  }
	| {
			kind: "user_gate"
			stage: string
			gate_kind: "spec" | "approval"
			units: string[]
	  }
	| { kind: "close_feedback"; stage: string; feedback_id: string }
	| { kind: "merge_stage"; stage: string }
	| { kind: "intent_review"; role: string }
	| { kind: "merge_intent" }
	| { kind: "sealed" }

// ── Helpers ──────────────────────────────────────────────────────────

type UnitFm = Record<string, unknown>
type FbFm = Record<string, unknown>

type Iteration = {
	hat: string
	started_at: string
	completed_at: string | null
	result: "advance" | "reject" | null
	reason?: string | null
}

type ApprovalRecord = { at: string; migrated?: boolean } | null

function readFm(path: string): { data: UnitFm; body: string } | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, "utf8")
		const parsed = matter(raw)
		return { data: parsed.data as UnitFm, body: parsed.content }
	} catch {
		return null
	}
}

// readClarifyQuestions deleted 2026-05-08 along with the
// clarify_required cursor action. Stages that need pre-decompose Q&A
// now declare a discovery template with `tool:` (any tool that
// captures user input). Zero studios shipped clarify dirs at deletion.

function pickIterations(fm: UnitFm | FbFm): Iteration[] {
	if (!Array.isArray(fm.iterations)) return []
	return (fm.iterations as Iteration[]) ?? []
}

function pickApprovals(fm: UnitFm): Record<string, ApprovalRecord> {
	const a = fm.approvals
	if (a === null || typeof a !== "object" || Array.isArray(a)) return {}
	return a as Record<string, ApprovalRecord>
}

function pickReviews(fm: UnitFm): Record<string, ApprovalRecord> {
	const r = fm.reviews
	if (r === null || typeof r !== "object" || Array.isArray(r)) return {}
	return r as Record<string, ApprovalRecord>
}

function unitName(unitPath: string): string {
	return basename(unitPath).replace(/\.md$/, "")
}

function listUnitPaths(stageDir: string): string[] {
	const dir = join(stageDir, "units")
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => join(dir, e.name))
		.sort()
}

function listFbPaths(scopeDir: string): string[] {
	const dir = join(scopeDir, "feedback")
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => join(dir, e.name))
		.sort()
}

/**
 * Derive the next-hat instruction for a unit based on its iterations
 * history. Returns null when the unit is past terminal advance (done).
 */
export function nextHatForUnit(
	fm: UnitFm,
	configuredHats: string[],
): { hat: string; terminal: boolean; rejected?: boolean } | null {
	if (configuredHats.length === 0) return null
	const iterations = pickIterations(fm)
	if (iterations.length === 0) {
		// Not started — first hat.
		return {
			hat: configuredHats[0],
			terminal: configuredHats.length === 1,
		}
	}
	const last = iterations[iterations.length - 1]
	if (last.result === null) {
		// In-flight on the last appended hat. No new dispatch.
		return null
	}
	if (last.result === "advance") {
		const idx = configuredHats.indexOf(last.hat)
		if (idx < 0) return null // last hat name not in configured set — drift
		const nextIdx = idx + 1
		if (nextIdx >= configuredHats.length) {
			// Terminal advance landed. Unit's hat sequence is done.
			return null
		}
		return {
			hat: configuredHats[nextIdx],
			terminal: nextIdx === configuredHats.length - 1,
		}
	}
	if (last.result === "reject") {
		const idx = configuredHats.indexOf(last.hat)
		if (idx <= 0) {
			// Reject on first hat — re-dispatch first hat.
			return {
				hat: configuredHats[0],
				terminal: configuredHats.length === 1,
				rejected: true,
			}
		}
		const prevIdx = idx - 1
		return {
			hat: configuredHats[prevIdx],
			terminal: prevIdx === configuredHats.length - 1,
			rejected: true,
		}
	}
	return null
}

/**
 * Returns the role keys that have NOT been signed yet on the unit.
 */
export function pendingReviewSlots(
	fm: UnitFm,
	configuredRoles: string[],
): string[] {
	const reviews = pickReviews(fm)
	return configuredRoles.filter((r) => !reviews[r])
}

export function pendingApprovalSlots(
	fm: UnitFm,
	configuredRoles: string[],
): string[] {
	const approvals = pickApprovals(fm)
	return configuredRoles.filter((r) => !approvals[r])
}

/**
 * Determine the active stage for the cursor walk.
 *
 *   - When the working tree is on a stage branch
 *     (`haiku/<slug>/<stage>` where stage != "main"), the branch name
 *     is the source of truth. Calling `firstUnmergedStage` here would
 *     lie — the stage branch's tree carries the in-flight unit work
 *     that intent main doesn't, so `firstUnmergedStage` would walk
 *     past the active stage.
 *   - Otherwise (intent main, repo default, anywhere else), walk
 *     intent main's filesystem via `firstUnmergedStage`.
 *
 * The caller (`haiku_run_next` / `runTickWithBranchAlignment`)
 * arranges for the working tree to be on the appropriate branch
 * before the cursor walk. This shortcut just reads the branch name
 * the caller already set up.
 */
function activeStageFromBranchOrFilesystem(
	slug: string,
	studio: string,
): string | null {
	const stagePrefix = `haiku/${slug}/`
	const currentBranch = currentBranchName()
	if (currentBranch.startsWith(stagePrefix)) {
		const tail = currentBranch.slice(stagePrefix.length)
		if (tail !== "main" && tail.length > 0) {
			// Confirm the branch name matches a configured stage; otherwise
			// fall through to the filesystem walk so a misnamed branch
			// doesn't pin the cursor to a non-existent stage.
			const stages = resolveStudioStages(studio)
			if (stages.includes(tail)) return tail
		}
	}
	return firstUnmergedStage(slug, studio)
}

function currentBranchName(): string {
	try {
		return execFileSync("git", ["branch", "--show-current"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim()
	} catch {
		return ""
	}
}

/**
 * Is every unit in this stage fully signed-off? "Fully signed" =
 * every unit has its last iteration as a terminal advance on the
 * last hat AND every required role on `approvals.<role>.at` carries
 * a timestamp.
 *
 * In git mode this is a redundant signal — intent main only carries
 * stages whose branches were merged, and merging only happens after
 * every gate signs. But in fs mode (no branches) it's the only way
 * to distinguish "merged-state" from "in-flight" without falling
 * back to a stamp: the cursor's per-stage cascade itself wouldn't
 * fire if `firstUnmergedStage` walked past unsigned stages.
 */
function isStageFullySigned(
	intentDir: string,
	studio: string,
	stage: string,
	mode: string,
): boolean {
	const unitsDir = join(intentDir, "stages", stage, "units")
	if (!existsSync(unitsDir)) return false
	const unitFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	if (unitFiles.length === 0) return false

	const hats = resolveStageHats(studio, stage)
	// No hats configured = stage definition broken or unloaded.
	// Conservative answer: not fully signed (don't walk past). Without
	// this guard, `lastHat` is `undefined` and `last.hat !== undefined`
	// is always true — every unit fails the iteration check, the
	// function always returns false, and the cursor pins to the stage
	// forever. Same gap exists in walkUnitApprovalTrack's terminal-hat
	// check (~line 617) and is fixed there too.
	if (hats.length === 0) return false
	const lastHat = hats[hats.length - 1]
	const reviewAgentPaths = readReviewAgentPaths(studio, stage)
	const reviewAgents = Object.keys(reviewAgentPaths).sort()
	const isAutopilot = mode === "autopilot"
	const approvalRoles: string[] = isAutopilot
		? ["spec", "quality_gates"]
		: ["spec", "quality_gates", ...reviewAgents, "user"]

	for (const file of unitFiles) {
		const fm = readFm(join(unitsDir, file))?.data
		if (!fm) return false
		// Last hat advanced?
		const its = pickIterations(fm)
		if (its.length === 0) return false
		const last = its[its.length - 1]
		if (last.result !== "advance" || last.hat !== lastHat) return false
		// Every approval role signed?
		const approvals = pickApprovals(fm)
		for (const role of approvalRoles) {
			const record = approvals[role]
			if (
				!record ||
				typeof record !== "object" ||
				typeof (record as { at?: unknown }).at !== "string"
			) {
				return false
			}
		}
	}
	return true
}

/**
 * First stage whose work hasn't landed on intent main yet — the stage
 * the cursor is currently positioned in.
 *
 * **The signal is intent main's own filesystem.** A stage's work
 * lives in `stages/<stage>/units/*.md`; when the stage merges into
 * intent main, those files come with it. So:
 *
 *   - first stage whose `units/` is missing or empty on intent main
 *     = the stage that hasn't been finished yet.
 *
 * That's the entire derivation. No `git log`, no `merge-base`, no
 * `stages_merged` stamp, no commit-message grep. The disk state of
 * intent main IS the truth of which stages are done.
 *
 * **Caller contract**: the working tree must be checked out on
 * `haiku/<slug>/main`. `haiku_run_next` enforces this before calling
 * the cursor — that's the whole point of the two-step branch dance:
 *   1. on intent main, walk filesystem → name the active stage
 *   2. switch to that stage's branch → walk the per-stage cascade
 *      against the in-flight unit work that lives there
 *
 * Reading from any other branch lies: a stage branch carries
 * in-flight unit work that hasn't been merged yet, so it would name
 * the wrong "current" stage. The caller-on-intent-main invariant is
 * load-bearing.
 *
 * Same logic applies in filesystem-only (non-git) mode — the
 * "intent main filesystem" just IS the working tree.
 */
export function firstUnmergedStage(
	slug: string,
	studio: string,
): string | null {
	const stages = resolveStudioStages(studio)
	if (stages.length === 0) return null
	const root = primaryRepoRoot()
	const intentDir = join(root, ".haiku", "intents", slug)
	const isGit = (() => {
		try {
			return existsSync(join(root, ".git"))
		} catch {
			return false
		}
	})()

	if (!isGit) {
		// Fs mode: no branches, so "stage X has units on disk" doesn't
		// distinguish merged from in-flight — they live in the same
		// tree throughout the stage's lifecycle. Derive the merged
		// signal from per-unit signature state instead: a stage is
		// "merged-state" iff every unit's last iteration is terminal
		// advance on the last hat AND every required approval role is
		// signed. Pure disk read on existing FM, no stamp needed.
		const intentMdPath = join(intentDir, "intent.md")
		const intentFm = readFm(intentMdPath)?.data
		const mode =
			typeof intentFm?.mode === "string" && intentFm.mode.length > 0
				? (intentFm.mode as string)
				: "continuous"
		for (const stage of stages) {
			if (!isStageFullySigned(intentDir, studio, stage, mode)) return stage
		}
		return null
	}

	// Git mode: walk intent main's filesystem. The caller's branch
	// dance has put us on intent main (or on a stage branch, in
	// which case this function isn't the active-stage source —
	// `activeStageFromBranchOrFilesystem` short-circuits before
	// calling here).
	for (const stage of stages) {
		const unitsDir = join(intentDir, "stages", stage, "units")
		if (!existsSync(unitsDir)) return stage
		const mdFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
		if (mdFiles.length === 0) return stage
	}
	return null
}

// ── Track B: feedback walk ───────────────────────────────────────────

function walkFeedbackTrack(args: {
	intentDir: string
	studio: string
	currentStage: string
}): CursorAction | null {
	const { intentDir, studio, currentStage } = args
	// Walk feedback in stage order: every prior stage's open FBs come
	// before the current stage's open FBs come before intent-scope.
	const stages = resolveStudioStages(studio)
	const cutoff = stages.indexOf(currentStage)
	// `cutoff === -1` means `currentStage` isn't in this studio's
	// configured stage list (renamed stage, misconfigured studio).
	// Falling back to `stages.slice()` (all stages) would surface FBs
	// from future stages the agent isn't even working on yet — the
	// opposite of what "walk up to current" means. Walk no stages
	// when we can't locate the current one; the caller can still see
	// intent-scope FBs below.
	const toWalk = cutoff >= 0 ? stages.slice(0, cutoff + 1) : []

	for (const stage of toWalk) {
		const fbPaths = listFbPaths(join(intentDir, "stages", stage))
		for (const fbPath of fbPaths) {
			const action = nextActionForFeedback(stage, fbPath, studio)
			if (action) return action
		}
	}
	// Intent-scope feedback last.
	const intentFbPaths = listFbPaths(intentDir)
	for (const fbPath of intentFbPaths) {
		// For intent-scope FBs we still walk fix_hats from the
		// originating stage if it's listed in targets.unit's path; for
		// truly scope-less intent-FBs we'd need an intent-level
		// fix_hats list. Defer; treat as the current stage's fix_hats
		// for now.
		const action = nextActionForFeedback(currentStage, fbPath, studio)
		if (action) return action
	}
	return null
}

function nextActionForFeedback(
	stage: string,
	fbPath: string,
	studio: string,
): CursorAction | null {
	const result = readFm(fbPath)
	if (!result) return null
	const fm = result.data
	if (typeof fm.closed_at === "string" && fm.closed_at.length > 0) {
		// Closed — skip.
		return null
	}
	const fbId = parseFbIdFromFilename(fbPath)
	if (!fbId) {
		// Filename doesn't follow the `NN(N)-slug.md` convention.
		// Skip rather than emit an unresolvable dispatch ID — see
		// parseFbIdFromFilename's docstring for why this matters.
		return null
	}
	const fixHats = resolveStageFixHats(studio, stage)
	if (fixHats.length === 0) {
		// Stage doesn't define a fix loop. The FB is unresolvable
		// without manual intervention. Cursor surfaces it as a
		// review-track signal so the user sees it.
		return {
			kind: "user_gate",
			stage,
			gate_kind: "approval",
			units: [], // FB-only, no unit slots
		}
	}
	const next = nextHatForUnit(fm, fixHats)
	if (next === null) {
		// Either in-flight (no action) or terminal advance landed
		// (close FB with invalidations).
		const iterations = pickIterations(fm)
		if (iterations.length === 0) return null
		const last = iterations[iterations.length - 1]
		if (last.result === null) return null // in-flight
		if (last.result === "advance" && last.hat === fixHats[fixHats.length - 1]) {
			return { kind: "close_feedback", stage, feedback_id: fbId }
		}
		return null
	}
	return {
		kind: "start_feedback_hat",
		stage,
		hat: next.hat,
		feedback_ids: [fbId],
		terminal: next.terminal,
	}
}

/**
 * Extract the canonical wire-form FB id (`FB-NNN`) from an on-disk
 * filename like `008-some-slug.md`. Returns null when the filename
 * doesn't start with the expected `<digits>-` prefix — a non-numeric
 * fallback (raw basename) would propagate into `start_feedback_hat`
 * actions whose `feedback_id` then fails `findFeedbackFile`'s
 * `^(?:FB-)?(\d+)$` regex, producing `feedback_not_found` errors
 * every tick → cursor re-emits → infinite loop.
 *
 * Width-flexible: 2-digit (`08-…`) and 3-digit (`008-…`) names both
 * resolve, since the regex is `\d+` not `\d{N}`. Padding to 3 digits
 * is the v4 default (numeric-id refactor 2026-05-07).
 */
function parseFbIdFromFilename(fbPath: string): string | null {
	const m = basename(fbPath).match(/^(\d+)-/)
	if (!m) return null
	return `FB-${m[1].padStart(3, "0")}`
}

// ── Track A: intent walk ─────────────────────────────────────────────

function walkIntentTrack(args: {
	slug: string
	intentDir: string
	studio: string
	stage: string
	mode: string
}): CursorAction | null {
	const { slug, intentDir, studio, stage, mode } = args
	const stageDir = join(intentDir, "stages", stage)
	const unitPaths = listUnitPaths(stageDir)
	const units = unitPaths
		.map((p) => ({ path: p, name: unitName(p), fm: readFm(p)?.data ?? {} }))
		.filter((u) => u.fm)

	const hats = resolveStageHats(studio, stage)
	const reviewAgentPaths = readReviewAgentPaths(studio, stage)
	const reviewAgents = Object.keys(reviewAgentPaths).sort()
	// Order of reviewer roles per track. Spec is engine-built (always
	// present). quality_gates is engine-built (post-execute only).
	// Configured agents come from the studio. User is the human gate.
	//
	// Mode-shaped role lists:
	//   - autopilot: minimal — spec only on reviews, [spec, quality_gates]
	//                on approvals. No agent gates, no user gate.
	//   - discrete + continuous: full role lists. Discrete differs only
	//                in HOW the user gate dispatches (MR open vs internal
	//                pop) — handled at dispatch time, not in the role list.
	const isAutopilot = mode === "autopilot"
	const reviewRoles: string[] = isAutopilot
		? ["spec"]
		: ["spec", ...reviewAgents, "user"]
	const approvalRoles: string[] = isAutopilot
		? ["spec", "quality_gates"]
		: ["spec", "quality_gates", ...reviewAgents, "user"]

	// Gate priority chain (collaboration before computation):
	//   1. elaborate (conversation gate, mode-aware) — the human
	//      conversation that orbits the rest of the stage.
	//   2. discovery_required — agents run to gather knowledge,
	//      including user-input-driven discovery templates
	//      (e.g., the reframed design-direction picker) that
	//      replace the bespoke design_direction_required and
	//      clarify_required gates retired on 2026-05-08.
	//   3. decompose / wave logic.

	// 2.5. Elaborate gate (mode-aware). Every non-autopilot intent gets a
	//      per-stage human conversation gate. The agent reads intent +
	//      STAGE.md + prior outputs, surfaces informed questions, and
	//      captures the agreement at `stages/<stage>/elaboration.md`.
	//      The cursor blocks until the artifact exists AND a verifier
	//      has stamped `verified_at` on its frontmatter (substance check
	//      — the agent can't self-certify a one-line "user said go").
	//
	//      Grandfather rule: if the artifact is missing AND the stage
	//      already has units, treat the stage as legacy work that
	//      pre-dates this gate. Don't retroactively rewind the user to
	//      do a conversation about work already shipped. Once an
	//      artifact exists (even unverified), it's tracked normally —
	//      the verifier still has to seal it before advancement.
	//
	//      Concurrent-work case: when units exist alongside a missing
	//      artifact, the cursor can't tell "legacy intent" from "agent
	//      drafted units before recording elaboration." We err toward
	//      grandfathering (fall through) because (a) re-running on a
	//      legacy intent that was already happy is the worse failure
	//      mode and (b) the elaborate prompt explicitly tells fresh
	//      agents to record before writing units, so the concurrent
	//      pattern is rare in practice.
	//
	//      Autopilot bypasses this gate entirely — there's no human
	//      conversation to capture. Pre-intent elaborate (intent.md
	//      creation) still applies in autopilot; only the per-stage gate
	//      is mode-skipped here.
	if (mode !== "autopilot") {
		const elabPath = join(stageDir, "elaboration.md")
		if (existsSync(elabPath)) {
			const elabFm = readFm(elabPath)?.data ?? {}
			const verifiedAt =
				typeof elabFm.verified_at === "string" ? elabFm.verified_at : ""
			if (!verifiedAt) {
				return { kind: "elaborate_review", stage }
			}
			// verified — fall through to discovery / decompose / waves
		} else if (units.length === 0) {
			// Fresh stage, no artifact, no units — fire the gate.
			return { kind: "elaborate", stage }
		}
		// Else: artifact missing but units exist → grandfathered.
		// Falls through past the gate without firing.
	}

	// 3. Discovery (P7). When the studio declares discovery artifacts
	//    for the stage, the cursor checks the artifact's `location` on
	//    disk. Missing file → `discovery_required`. The output IS the
	//    signal — no FM bookkeeping. (FM state is reserved for actions
	//    that DON'T produce a file: review approvals, user gates.)
	//
	// 2026-05-08: discovery now fires when units.length === 0 too IF the
	// template declares a `tool:` field (tool-driven discovery — the
	// reframed design_direction picker is the canonical case). Without
	// `tool:`, discovery still gates on `units.length > 0` because
	// research-style discovery agents need a representative unit for
	// prompt context. The `units` field on the action is empty when
	// units don't yet exist; empty array is fine because the tool's
	// output is stage-scoped.
	//
	// Defs are sorted by `name` so dispatch order is deterministic
	// across filesystems — `readdirSync` returns templates in
	// platform-dependent order, which makes idempotent retries surface
	// the gaps in different sequences and complicates debugging.
	const discoveryDefs = readStageArtifactDefs(studio, stage)
		.filter((d) => d.kind === "discovery")
		.sort((a, b) => a.name.localeCompare(b.name))
	if (discoveryDefs.length > 0) {
		for (const def of discoveryDefs) {
			// Skip non-tool discovery agents when units don't exist —
			// they need a representative unit for prompt context.
			if (units.length === 0 && !def.tool) continue
			if (!def.required) continue
			if (!def.location) {
				// `required: true` with no `location:` is a studio
				// configuration error — the gate cannot fire because
				// there's no path to check. Surface the misconfiguration
				// rather than silently letting the intent skip discovery.
				console.error(
					`[haiku] Studio configuration error: discovery template '${def.name}' in stage '${stage}' is required but declares no 'location:' field. The gate is being skipped — fix the template.`,
				)
				continue
			}
			const resolved = def.location.replace(/\{intent-slug\}/g, slug)
			const absPath = join(process.cwd(), resolved)
			const exists = resolved.endsWith("/")
				? existsSync(absPath) &&
					readdirSync(absPath).filter((e) => e !== ".gitkeep").length > 0
				: existsSync(absPath)
			if (!exists) {
				// Discovery artifacts are stage- or intent-scoped.
				// `units` is a representative unit for prompt context
				// when units exist; empty array when the stage hasn't
				// been decomposed yet (the discovery output informs
				// decomposition).
				return {
					kind: "discovery_required",
					stage,
					agent: def.name,
					units: units.length > 0 ? [units[0].name] : [],
				}
			}
		}
	}

	// 4. No units → decompose. Agent dispatches stage-scoped discovery
	//    subagents (when configured) and writes unit specs informed by
	//    the captured elaboration + discovery output. The cursor only
	//    reaches this clause once the elaborate gate has passed (or
	//    autopilot bypassed it).
	if (units.length === 0) {
		return { kind: "decompose", stage }
	}

	// 5. Wave logic. A unit is "in-flight" if started AND its last
	//    iteration's result is null. Mid-wave noop until in-flight
	//    units terminate.
	const inFlight = units.filter((u) => {
		if (u.fm.started_at == null) return false
		const its = pickIterations(u.fm)
		if (its.length === 0) return false
		return its[its.length - 1].result === null
	})
	if (inFlight.length > 0) {
		return null
	}

	// 6. Wave-ready: started_at == null and all depends_on completed
	//    (their last iteration is terminal advance).
	const completedNames = new Set(
		units
			.filter((u) => {
				if (hats.length === 0) return false
				const its = pickIterations(u.fm)
				if (its.length === 0) return false
				const last = its[its.length - 1]
				return last.result === "advance" && last.hat === hats[hats.length - 1]
			})
			.map((u) => u.name),
	)
	const waveReady = units.filter((u) => {
		if (u.fm.started_at != null) return false
		const deps = Array.isArray(u.fm.depends_on)
			? (u.fm.depends_on as string[])
			: []
		return deps.every((d) => completedNames.has(d))
	})
	if (waveReady.length > 0) {
		return {
			kind: "start_unit_hat",
			stage,
			hat: hats[0],
			units: waveReady.map((u) => u.name),
			terminal: hats.length === 1,
		}
	}

	// 7. Units that need their next hat (started but not yet done).
	const needNextHat: { unit: string; hat: string; terminal: boolean }[] = []
	for (const u of units) {
		if (u.fm.started_at == null) continue
		const next = nextHatForUnit(u.fm, hats)
		if (next === null) continue
		needNextHat.push({
			unit: u.name,
			hat: next.hat,
			terminal: next.terminal,
		})
	}
	if (needNextHat.length > 0) {
		// Group by hat — main agent dispatches all units on the same
		// hat as a parallel batch.
		const byHat = new Map<string, string[]>()
		for (const r of needNextHat) {
			const list = byHat.get(r.hat) ?? []
			list.push(r.unit)
			byHat.set(r.hat, list)
		}
		// Take the first hat (smallest hat-index) in this batch.
		// Subsequent ticks pick up the others.
		const sorted = [...byHat.entries()].sort(
			([a], [b]) => hats.indexOf(a) - hats.indexOf(b),
		)
		const [hat, unitsForHat] = sorted[0]
		const idx = hats.indexOf(hat)
		return {
			kind: "start_unit_hat",
			stage,
			hat,
			units: unitsForHat,
			terminal: idx === hats.length - 1,
		}
	}

	// 8. All units' hat sequences done → spec review track. Walk
	//    review roles in declared order.
	for (const role of reviewRoles) {
		const missing = units
			.filter((u) => {
				const reviews = pickReviews(u.fm)
				return !reviews[role]
			})
			.map((u) => u.name)
		if (missing.length === 0) continue
		if (role === "user") {
			return { kind: "user_gate", stage, gate_kind: "spec", units: missing }
		}
		return { kind: "dispatch_review", stage, role, units: missing }
	}

	// 9. All spec reviews signed → output approval track. Walk
	//    approvalRoles which may include `quality_gates` (engine-run,
	//    not subagent-dispatched) before configured agents.
	for (const role of approvalRoles) {
		const missing = units
			.filter((u) => {
				const approvals = pickApprovals(u.fm)
				return !approvals[role]
			})
			.map((u) => u.name)
		if (missing.length === 0) continue
		if (role === "user") {
			return {
				kind: "user_gate",
				stage,
				gate_kind: "approval",
				units: missing,
			}
		}
		if (role === "quality_gates") {
			return { kind: "dispatch_quality_gates", stage, units: missing }
		}
		return { kind: "dispatch_approval", stage, role, units: missing }
	}

	// 8. Every approval signed. Merge stage branch into intent main.
	return { kind: "merge_stage", stage }
}

// ── Top-level derivePosition ─────────────────────────────────────────

export type CursorPosition = {
	track: "drift" | "feedback" | "intent" | "sealed" | "noop"
	action: CursorAction | null
}

export function derivePosition(args: {
	slug: string
	intentDir: string
	studio: string
}): CursorPosition {
	const { slug, intentDir, studio } = args

	// Read intent.md once — needed for mode (cursor walk shape) and
	// for intent-scope approvals (terminal leg).
	//
	// `mode` is guaranteed to be set by the time the cursor walks: the
	// pre-cursor gates in run-tick.ts emit `select_mode` when missing,
	// and haiku_run_next blocks on the picker until it's set. If we
	// reach here with no mode, a non-haiku_run_next caller bypassed the
	// gate — fall back to "continuous" to keep the walk deterministic
	// rather than crashing, but the gate is the real contract.
	const intentMdPath = join(intentDir, "intent.md")
	const intentResult = readFm(intentMdPath)
	const mode =
		typeof intentResult?.data.mode === "string" &&
		(intentResult.data.mode as string).length > 0
			? (intentResult.data.mode as string)
			: "continuous"

	// Sealed intent short-circuit: once intent.sealed_at is set, the
	// intent is write-locked — no further cursor work. Architectural
	// invariant: sealed = terminal forever, no walk.
	if (
		intentResult &&
		typeof intentResult.data.sealed_at === "string" &&
		(intentResult.data.sealed_at as string).length > 0
	) {
		return { track: "sealed", action: { kind: "sealed" } }
	}

	// Pre-intent verifier (2026-05-08). The conversation that produced
	// intent.md needs the same substance check as per-stage elaborate.
	// Fires right after intent_create on a fresh intent: reads
	// intent.md, grades whether the body reflects a meaningful
	// conversation about what the user wants. Pass stamps `verified_at`
	// on intent FM via `haiku_intent_seal`; fail returns gaps so the
	// agent re-engages the user and re-creates / updates intent.md.
	//
	// Mode bypass: autopilot skips this gate. The user's intent for
	// autopilot is "the agent runs everything autonomously" — there's
	// no human to converse with for the substance check. Pre-intent
	// elaborate still happens (the user creates the intent in chat),
	// but its rigor isn't enforced by an extra verifier seal.
	//
	// Grandfather rule (mirrors per-stage gate): only fire on a truly
	// fresh intent — first stage active, no units written yet. Any
	// existing in-flight intent that was created before this PR
	// (lacking `verified_at`) but has already shipped stage work is
	// grandfathered. Without this, every legacy non-autopilot intent
	// would block permanently at `elaborate_review` on first tick
	// after the plugin upgrade.
	if (intentResult && mode !== "autopilot") {
		const verifiedAt =
			typeof intentResult.data.verified_at === "string"
				? (intentResult.data.verified_at as string)
				: ""
		if (!verifiedAt) {
			const stages = resolveStudioStages(studio)
			const firstStage = stages[0] ?? ""
			const firstStageDir = firstStage
				? join(intentDir, "stages", firstStage)
				: ""
			const firstStageHasUnits =
				firstStageDir && existsSync(firstStageDir)
					? listUnitPaths(firstStageDir).length > 0
					: false
			const activeForGate = activeStageFromBranchOrFilesystem(slug, studio)
			const isTrulyFresh = activeForGate === firstStage && !firstStageHasUnits
			if (isTrulyFresh) {
				return {
					track: "intent",
					action: { kind: "elaborate_review" },
				}
			}
			// Grandfathered — fall through.
		}
	}

	// Determine the active stage. The new disk-state cursor model
	// (cursor-disk-state-stage-walk) says intent main's filesystem is
	// the canonical source for "which stages have landed":
	//
	//   - When the working tree is on intent main, walk the filesystem.
	//   - When the working tree is on a stage branch (where the
	//     in-flight unit work lives), the branch name itself names
	//     the active stage — `firstUnmergedStage` would lie if called
	//     here because the stage branch's tree HAS the units that
	//     intent main does not.
	//
	// `haiku_run_next` ensures the working tree is on the right
	// branch before this function runs, so the branch-name shortcut
	// is reliable. Tests use `runTickWithBranchAlignment` to do the
	// same dance.
	//
	// When every stage is merged, `firstUnmergedStage` returns null
	// and we fall through to intent-level approvals (Track A only
	// fires when there's an active stage).
	const activeStage = activeStageFromBranchOrFilesystem(slug, studio)

	// Track C — drift sweep, only against the active stage.
	if (activeStage) {
		const drift = runDriftSweep({
			intentDir,
			stage: activeStage,
			studio,
		})
		if (drift.events.length > 0) {
			return {
				track: "drift",
				action: { kind: "drift_detected", events: drift.events },
			}
		}
	}

	// Track B — feedback walk across stages 0..currentStage + intent.
	//
	// Also runs when activeStage is null (every stage merged). That's
	// the "user finished the pipeline, then opened an FB on an earlier
	// stage from the post-pipeline review" path. Without this branch,
	// the cursor would fall through to "intent-level approvals" and
	// silently seal over the open FB. We walk every stage in that case
	// so the FB gets dispatched into the owning stage's fix loop. The
	// fix-hat work commits to that stage's branch, naturally putting it
	// ahead of intent main; once the FB closes, the merge_stage tick
	// re-merges it and the cursor resumes downstream walks.
	{
		const fbAction = walkFeedbackTrack({
			intentDir,
			studio,
			// When every stage is merged, treat the LAST stage as the
			// cutoff so walkFeedbackTrack walks all of them. When a
			// stage is active, walk 0..active inclusive (existing
			// behaviour).
			currentStage:
				activeStage ?? resolveStudioStages(studio).slice(-1)[0] ?? "",
		})
		if (fbAction) return { track: "feedback", action: fbAction }
	}

	// Track A — intent track on the active stage.
	if (activeStage) {
		const intentAction = walkIntentTrack({
			slug,
			intentDir,
			studio,
			stage: activeStage,
			mode,
		})
		if (intentAction !== null) {
			return { track: "intent", action: intentAction }
		}
		// walkIntentTrack returned null → mid-wave noop. The active
		// stage exists but everything in flight is still working.
		// Don't fall through to the intent-level walk — that's only
		// reached when there's no active stage (every stage merged).
		return { track: "noop", action: null }
	}

	// All stages merged → intent-level approvals.
	if (intentResult) {
		const intentApprovals = pickApprovals(intentResult.data)
		// Mode-shaped intent role list:
		//   autopilot: spec + continuity only (no agents, no user)
		//   discrete + continuous: full list including configured
		//     intent-completion review agents + user
		//
		// M3 wires the intent-completion agent set from studio config
		// via readStudioReviewAgentPaths(studio).
		const isAutopilot = mode === "autopilot"
		const intentRoles: string[] = isAutopilot
			? ["spec", "continuity"]
			: ["spec", "continuity", "user"]
		for (const role of intentRoles) {
			if (!intentApprovals[role]) {
				return {
					track: "intent",
					action: { kind: "intent_review", role },
				}
			}
		}
		// All intent-level approvals signed → seal.
		if (intentResult.data.sealed_at == null) {
			return {
				track: "intent",
				action: { kind: "merge_intent" },
			}
		}
	}

	return { track: "sealed", action: { kind: "sealed" } }
}

// Test-only escape hatch.
export const __testOnly = {
	walkIntentTrack,
	walkFeedbackTrack,
	nextActionForFeedback,
	parseFbIdFromFilename,
}
