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

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import matter from "gray-matter"
import { primaryRepoRoot } from "../../state-tools.js"
import { isBranchMerged } from "../../git-worktree.js"
import {
	resolveStageFixHats,
	resolveStageHats,
	resolveStageMetadata,
	resolveStudioStages,
} from "../studio.js"
import {
	readReviewAgentPaths,
	readStageArtifactDefs,
} from "../../studio-reader.js"
import { runDriftSweep, type DriftEvent } from "./drift-sweep.js"

// ── CursorAction discriminated union ─────────────────────────────────

export type CursorAction =
	| { kind: "drift_detected"; events: DriftEvent[] }
	| {
			kind: "discovery_required"
			stage: string
			agent: string
			units: string[]
	  }
	| {
			kind: "design_direction_required"
			stage: string
	  }
	| {
			kind: "clarify_required"
			stage: string
			questions: Array<{ id: string; prompt: string; body: string }>
	  }
	| { kind: "elaborate"; stage: string }
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

/**
 * Read clarify-question files from a stage's `clarify/` directory.
 * Each file is a markdown doc with frontmatter — the FM `prompt` field
 * (or filename as fallback) is the short prompt; the body is the
 * elaboration. Returns one entry per file, sorted by filename.
 *
 * Search path: project-local `.haiku/studios/<studio>/stages/<stage>/clarify/`
 * first, then plugin-shipped `<plugin>/studios/<studio>/stages/<stage>/clarify/`.
 *
 * Empty array when the dir doesn't exist (which is the common case —
 * stages opt in by adding the directory).
 */
function readClarifyQuestions(
	studio: string,
	stage: string,
): Array<{ id: string; prompt: string; body: string }> {
	const candidates = [
		join(process.cwd(), ".haiku", "studios", studio, "stages", stage, "clarify"),
	]
	const root = primaryRepoRoot()
	if (root) {
		candidates.push(
			join(root, "plugin", "studios", studio, "stages", stage, "clarify"),
		)
	}
	for (const dir of candidates) {
		if (!existsSync(dir)) continue
		const entries = readdirSync(dir).filter((f) => f.endsWith(".md"))
		const out: Array<{ id: string; prompt: string; body: string }> = []
		for (const f of entries.sort()) {
			const path = join(dir, f)
			try {
				const raw = readFileSync(path, "utf8")
				const parsed = matter(raw)
				const data = parsed.data as Record<string, unknown>
				out.push({
					id: f.replace(/\.md$/, ""),
					prompt:
						(data.prompt as string) || f.replace(/\.md$/, "").replace(/-/g, " "),
					body: parsed.content.trim(),
				})
			} catch {
				/* skip malformed clarify file rather than crash the cursor */
			}
		}
		if (out.length > 0) return out
	}
	return []
}

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

function pickDiscovery(fm: UnitFm): Record<string, ApprovalRecord> {
	const d = fm.discovery
	if (d === null || typeof d !== "object" || Array.isArray(d)) return {}
	return d as Record<string, ApprovalRecord>
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
			return { hat: configuredHats[0], terminal: configuredHats.length === 1, rejected: true }
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
 * Returns discovery agents whose record on this unit is missing.
 */
export function discoveryGaps(
	fm: UnitFm,
	configuredAgents: string[],
): string[] {
	const discovery = pickDiscovery(fm)
	return configuredAgents.filter((a) => !discovery[a])
}

/**
 * First stage whose branch is not yet merged into intent main.
 * Single source of truth: git history. Stage branches lazy-create.
 */
export function firstUnmergedStage(
	slug: string,
	studio: string,
): string | null {
	const stages = resolveStudioStages(studio)
	for (const stage of stages) {
		const stageBranch = `haiku/${slug}/${stage}`
		const intentMain = `haiku/${slug}/main`
		if (!isBranchMerged(stageBranch, intentMain)) {
			return stage
		}
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
	const toWalk =
		cutoff >= 0 ? stages.slice(0, cutoff + 1) : stages.slice()

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
		if (
			last.result === "advance" &&
			last.hat === fixHats[fixHats.length - 1]
		) {
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

function parseFbIdFromFilename(fbPath: string): string {
	const m = basename(fbPath).match(/^(\d+)-/)
	return m ? `FB-${m[1].padStart(2, "0")}` : basename(fbPath, ".md")
}

// ── Track A: intent walk ─────────────────────────────────────────────

function walkIntentTrack(args: {
	intentDir: string
	studio: string
	stage: string
	mode: string
}): CursorAction | null {
	const { intentDir, studio, stage, mode } = args
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

	// 1. Discovery (P7, 2026-05-06). When the studio declares
	//    discovery artifacts for the stage, each wave-ready unit must
	//    carry a `fm.discovery: { <agent>: { at } }` record for every
	//    declared agent before the cursor dispatches a hat. Missing
	//    records trigger `discovery_required` for the FIRST unit /
	//    FIRST agent missing a record — agent-by-agent, unit-by-unit.
	//    The agent runs the discovery template, produces the artifact,
	//    stamps the record, and the cursor moves on.
	//
	//    The "first missing" approach (vs batched) keeps the dispatch
	//    serial within a unit: discovery agents have ordered semantics
	//    (one builds on another). When the studio wants parallel
	//    discovery, the prompt builder fans out — but the cursor
	//    drives one at a time.
	const discoveryDefs = readStageArtifactDefs(studio, stage).filter(
		(d) => d.kind === "discovery",
	)
	if (discoveryDefs.length > 0 && units.length > 0) {
		for (const u of units) {
			const fmDiscovery =
				u.fm.discovery && typeof u.fm.discovery === "object"
					? (u.fm.discovery as Record<string, unknown>)
					: {}
			for (const def of discoveryDefs) {
				if (!def.required) continue
				if (!fmDiscovery[def.name]) {
					return {
						kind: "discovery_required",
						stage,
						agent: def.name,
						units: [u.name],
					}
				}
			}
		}
	}

	// 1a. Design direction (P3, 2026-05-06). Hard gate: when the
	//     stage's STAGE.md declares `requires_design_direction: true`,
	//     the cursor refuses to advance until the user has selected a
	//     direction. Selection is recorded on intent.md frontmatter as
	//     `design_directions: { <stage>: { archetype, at } }`. Stages
	//     that don't declare the flag never see this gate. No autopilot
	//     bypass — autopilot is for the execute track, not for skipping
	//     the design-direction conversation.
	const stageMeta = resolveStageMetadata(studio, stage)
	if (stageMeta?.requires_design_direction === true) {
		const intentMdPath = join(intentDir, "intent.md")
		if (existsSync(intentMdPath)) {
			const intentFm = readFm(intentMdPath)?.data ?? {}
			const directions =
				intentFm.design_directions &&
				typeof intentFm.design_directions === "object"
					? (intentFm.design_directions as Record<string, unknown>)
					: {}
			if (!directions[stage]) {
				return { kind: "design_direction_required", stage }
			}
		}
	}

	// 1b. Clarify (P4, 2026-05-06). Every stage that ships
	//     `clarify/*.md` question files gets a hard gate at elaborate
	//     entry — the cursor refuses to advance until the user has
	//     answered. Answers are recorded on intent.md as
	//     `clarifications: { <stage>: { answers, at } }`. Stages with
	//     no clarify/ dir never see this gate. Collaboration belongs in
	//     elaborate; this enforces it instead of leaving it to the
	//     agent's discretion. No autopilot bypass.
	const clarifyQuestions = readClarifyQuestions(studio, stage)
	if (clarifyQuestions.length > 0) {
		const intentMdPath = join(intentDir, "intent.md")
		if (existsSync(intentMdPath)) {
			const intentFm = readFm(intentMdPath)?.data ?? {}
			const clarifications =
				intentFm.clarifications &&
				typeof intentFm.clarifications === "object"
					? (intentFm.clarifications as Record<string, unknown>)
					: {}
			if (!clarifications[stage]) {
				return {
					kind: "clarify_required",
					stage,
					questions: clarifyQuestions,
				}
			}
		}
	}

	// 2. No units → elaborate.
	if (units.length === 0) {
		return { kind: "elaborate", stage }
	}

	// 3. Wave logic. A unit is "in-flight" if started AND its last
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

	// 4. Wave-ready: started_at == null and all depends_on completed
	//    (their last iteration is terminal advance).
	const completedNames = new Set(
		units
			.filter((u) => {
				const its = pickIterations(u.fm)
				if (its.length === 0) return false
				const last = its[its.length - 1]
				return (
					last.result === "advance" && last.hat === hats[hats.length - 1]
				)
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

	// 5. Units that need their next hat (started but not yet done).
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

	// 6. All units' hat sequences done → spec review track. Walk
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

	// 7. All spec reviews signed → output approval track. Walk
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
	const intentMdPath = join(intentDir, "intent.md")
	const intentResult = readFm(intentMdPath)
	const mode =
		typeof intentResult?.data.mode === "string"
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

	// Determine the active stage (first NOT merged into intent main).
	// Stages are never sealed — feedback can rewind the cursor by
	// adding new units to a previously-merged stage; that stage
	// becomes ahead-of-main and firstUnmergedStage returns it.
	const activeStage = firstUnmergedStage(slug, studio)
	const stage = activeStage ?? resolveStudioStages(studio)[0] ?? ""

	// Track C — drift sweep first.
	if (stage) {
		const drift = runDriftSweep({ intentDir, stage, studio })
		if (drift.events.length > 0) {
			return {
				track: "drift",
				action: { kind: "drift_detected", events: drift.events },
			}
		}
	}

	// Track B — feedback walk across stages 0..currentStage + intent.
	if (stage) {
		const fbAction = walkFeedbackTrack({
			intentDir,
			studio,
			currentStage: stage,
		})
		if (fbAction) return { track: "feedback", action: fbAction }
	}

	// Track A — intent track on the active stage.
	if (stage) {
		const intentAction = walkIntentTrack({ intentDir, studio, stage, mode })
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
