// http/session-api.ts — GET /api/session/:id response shaper.
//
// Maps the in-memory session record (review / question / design-direction
// shapes) to the wire-format JSON the SPA expects. Mostly pure projection
// from the cached session object, plus a fresh-on-every-request
// `current_state` field that calls getCurrentState(slug) to defeat the
// stale-cache divergence the SPA's stage stepper used to suffer from.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { FastifyReply } from "fastify"
import type { ApproveAction, IntentCurrentState } from "haiku-api"
import { getCurrentState } from "../current-state.js"
import { discoverReviewUrl } from "../discover-review-url.js"
import {
	resolveIntentStages,
	resolveStudioStages,
} from "../orchestrator/studio.js"
import { getSession, type ReviewSession } from "../sessions.js"
import { intentDir, parseFrontmatter } from "../state-tools.js"

function titleCase(s: string): string {
	return s
		.split(/[-_]/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

/**
 * Strip engine witness fields from a frontmatter snapshot before it
 * reaches the review SPA. The cursor's drift-sweep witnesses
 * (`reviews.<role>.body_sha256`, `approvals.<role>.witnesses[].sha256`,
 * etc.) are load-bearing for the engine but visual noise to a human
 * reviewer who sees them as "scary sha artifacts." We keep the
 * timestamp + role name so the "approved" / "reviewed at" surface
 * still works; we drop the hashes themselves.
 */
function scrubEngineWitnessFields(
	fm: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!fm || typeof fm !== "object") return fm
	const out: Record<string, unknown> = { ...fm }
	for (const key of ["reviews", "approvals"] as const) {
		const v = out[key]
		if (!v || typeof v !== "object") continue
		const cleaned: Record<string, unknown> = {}
		for (const [role, record] of Object.entries(v as Record<string, unknown>)) {
			if (record && typeof record === "object") {
				const r = record as Record<string, unknown>
				const { body_sha256: _bs, witnesses: _w, ...rest } = r
				cleaned[role] = rest
			} else {
				cleaned[role] = record
			}
		}
		out[key] = cleaned
	}
	return out
}

interface ParsedUnitLike {
	frontmatter?: Record<string, unknown>
	rawContent?: string
}

/**
 * Strip witness fields from every unit's frontmatter before the SPA
 * sees them. Mirrors `scrubEngineWitnessFields` but walks an array of
 * parsed units in one pass — used for the `data.units` projection.
 * Also strips the rawContent's frontmatter section so the YAML
 * preview (when rendered in raw mode by any consumer) doesn't leak
 * the same fields back through that side channel.
 */
function scrubUnitsForWire<T extends ParsedUnitLike>(units: T[]): T[] {
	return units.map((u) => ({
		...u,
		frontmatter: scrubEngineWitnessFields(u.frontmatter) ?? u.frontmatter,
	}))
}

/** Read intent.md frontmatter fresh from disk. Mirrors getCurrentState's
 *  philosophy — the cached `session.parsedIntent.frontmatter` was captured
 *  at session creation, and fields like `intent_completion_review` could
 *  in principle be edited mid-flow. Returns an empty object when the
 *  file or slug is missing so callers can read fields with `||` fallbacks. */
function readIntentFrontmatterFresh(
	slug: string | undefined,
): Record<string, unknown> {
	if (!slug) return {}
	const file = join(intentDir(slug), "intent.md")
	if (!existsSync(file)) return {}
	try {
		return parseFrontmatter(readFileSync(file, "utf8")).data
	} catch {
		return {}
	}
}

/** Decide what the Approve button should say based on what approval will
 *  actually trigger. Server-authoritative — the SPA renders the string and
 *  doesn't reimplement workflow rules. `current` is passed from the caller
 *  so we don't double-read stage state from disk on every API hit (the
 *  surrounding `respondSessionApi` already resolves it for `current_state`). */
function computeApproveAction(
	session: ReviewSession,
	current: IntentCurrentState | null,
): ApproveAction {
	if (session.ad_hoc) {
		return { label: "Done", kind: "ad_hoc_done" }
	}

	const gateContext = session.gate_context || "stage_gate"
	const gateType = session.gate_type || "ask"
	const gateParts = gateType.split(",").map((p) => p.trim())
	const hasExternal = gateParts.some((p) => p === "external")
	// Compound = `external` + at least one local-approve type (`ask`,
	// `auto`). The compound case has TWO buttons in the SPA: the main
	// approve closes locally (decision=approved), the secondary
	// "External" button submits the PR (decision=external_review).
	const isPureExternal = hasExternal && gateParts.length === 1

	const stage = current?.stage || session.stage || ""
	const stageTitle = stage ? titleCase(stage) : ""

	// Intent-completion review (terminal review after every stage gate
	// passed and the studio-level reviewers — if any — have approved).
	if (gateContext === "intent_completion") {
		return { label: "Mark Intent Done", kind: "complete_intent" }
	}

	// Pure external gate (non-compound) — there is no local approve
	// path. The single approve button submits decision="external_review"
	// which routes through `gh pr create` / `glab mr create`.
	if (isPureExternal) {
		return {
			label: stageTitle
				? `Open ${stageTitle} Pull Request`
				: "Open Pull Request",
			kind: "open_pr",
		}
	}

	// Compound external `[external, ask]` falls through to the same
	// label-resolution as a pure `ask` gate. The main approve button
	// submits decision="approved" — which advances/completes the stage
	// LOCALLY (no PR). The secondary "External" button (rendered by
	// the SPA when gate_type.includes("external")) is the PR-open
	// path. Reusing the local labels matches what the main button
	// actually does — the previous "Submit … for Review" wording was
	// an external-path label slapped on the local button, which read
	// as nonsense to a reviewer already inside the review pane.

	// First-stage elaborate gate — approving kicks off the intent.
	if (gateContext === "intent_review") {
		return {
			label: stageTitle ? `Start ${stageTitle}` : "Start Intent",
			kind: "start_intent",
		}
	}

	// Pre-execution gate (after elaborate, before execute) on a non-first
	// stage — approving begins building.
	if (gateContext === "elaborate_to_execute") {
		return {
			label: stageTitle ? `Start ${stageTitle} Execution` : "Start Execution",
			kind: "start_execution",
		}
	}

	// Default stage gate (post-execution review). When this is the last
	// stage in the studio's stage list, approval routes the intent toward
	// final completion review (or completion outright if disabled). Read
	// the intent FM fresh from disk so we don't act on stale "completion
	// review on/off" cached at session creation.
	const intentFm = readIntentFrontmatterFresh(session.intent_slug)
	// Primary signal: the orchestrator sets next_stage explicitly to null
	// when there's no next stage (gate.ts computes it from the studio's
	// ordered stage list). Trust that signal directly. The studio-list
	// lookup below is a fallback for sessions that were never tagged with
	// next_stage (older sessions, or paths that bypass the gate handler).
	let isLastStage = session.next_stage === null
	if (!isLastStage && session.next_stage === undefined) {
		const studio =
			(current?.studio as string) || (intentFm.studio as string) || ""
		if (studio) {
			const intentStages = resolveIntentStages(intentFm, studio)
			const stages =
				intentStages.length > 0 ? intentStages : resolveStudioStages(studio)
			isLastStage = stages.length > 0 && stages[stages.length - 1] === stage
		}
	}
	if (isLastStage) {
		const completionReviewEnabled = intentFm.intent_completion_review !== false
		if (completionReviewEnabled) {
			return {
				label: "Submit Intent for Final Review",
				kind: "submit_intent_review",
			}
		}
		return { label: "Complete Intent", kind: "complete_intent" }
	}

	if (stageTitle) {
		// Keep the label short — sidebars are narrow and the "Anyway"
		// suffix appended client-side adds 7 more chars. The omitted
		// "→ Start <next>" hint lives in the stage stepper anyway.
		return {
			label: `Complete ${stageTitle} Stage`,
			kind: "complete_stage",
		}
	}
	return { label: "Approve", kind: "approve" }
}

/** Send the JSON response for `GET /api/session/:sessionId`. Returns
 *  404 when the session is unknown. */
export function respondSessionApi(
	reply: FastifyReply,
	sessionId: string,
): void {
	const session = getSession(sessionId)
	if (!session) {
		reply.status(404).send({ error: "Session not found" })
		return
	}
	const data: Record<string, unknown> = {
		session_id: session.session_id,
		session_type: session.session_type,
		status: session.status,
	}
	if (session.session_type === "review") {
		data.intent_slug = session.intent_slug
		data.gate_type = session.gate_type || "ask"
		data.target = session.target
		data.decision = session.decision
		data.feedback = session.feedback
		if (session.annotations) data.annotations = session.annotations
		if (session.parsedIntent) {
			// Scrub engine witness fields (sha256 hashes, witness arrays)
			// from intent FM before sending to the SPA — they're load-
			// bearing for the cursor's drift sweep but visual noise to a
			// human reviewer.
			const pi = session.parsedIntent as ParsedUnitLike
			data.intent = {
				...pi,
				frontmatter: scrubEngineWitnessFields(pi.frontmatter),
			}
		}
		if (session.parsedUnits)
			data.units = scrubUnitsForWire(session.parsedUnits as ParsedUnitLike[])
		if (session.parsedCriteria) data.criteria = session.parsedCriteria
		if (session.parsedMermaid) data.mermaid = session.parsedMermaid
		if (session.intentMockups) data.intent_mockups = session.intentMockups
		if (session.unitMockups) {
			const obj: Record<string, unknown> = {}
			if (session.unitMockups instanceof Map) {
				for (const [k, v] of session.unitMockups) obj[k] = v
			} else {
				Object.assign(obj, session.unitMockups)
			}
			data.unit_mockups = obj
		}
		if (session.stageStates) data.stage_states = session.stageStates
		// Read current_state fresh from disk on every request so the
		// SPA's stage stepper can never disagree with the workflow
		// engine's view of "which stage are we on?". The cached
		// session.parsedIntent.frontmatter.active_stage was captured
		// when the session was first built and goes stale as ticks land.
		// computeApproveAction reuses this same `current` so we don't
		// double-read stage state from disk.
		const current = session.intent_slug
			? getCurrentState(session.intent_slug)
			: null
		if (current) data.current_state = current
		// Best-effort PR/MR discovery via raw git plumbing
		// (`git ls-remote origin 'refs/pull/*/head'` for GitHub,
		// `refs/merge-requests/*/head` for GitLab). The engine never
		// gates on this — `isBranchMerged` against intent main is the
		// only gate signal — but the SPA surfaces the link
		// informationally on terminal intents and the browse interface.
		// Returns null when the branch is unpushed, no PR/MR exists,
		// or the host isn't a recognised provider.
		if (session.intent_slug) {
			const discovered = discoverReviewUrl(session.intent_slug)
			if (discovered) data.discovered_review_url = discovered
		}
		if (session.knowledgeFiles) data.knowledge_files = session.knowledgeFiles
		if (session.stageArtifacts) data.stage_artifacts = session.stageArtifacts
		if (session.outputArtifacts) data.output_artifacts = session.outputArtifacts
		if (session.unitOutputs) data.unit_outputs = session.unitOutputs
		if (session.outputDeclaredBy)
			data.output_declared_by = session.outputDeclaredBy
		if (session.previousReview) data.previous_review = session.previousReview
		if (session.ad_hoc) data.ad_hoc = true
		if (session.stage) data.stage = session.stage
		if (session.gate_context) data.gate_context = session.gate_context
		if (session.next_stage !== undefined) data.next_stage = session.next_stage
		if (session.next_phase !== undefined) data.next_phase = session.next_phase
		// Live-session fields. The SPA gates the Approve button on
		// await_active and pending_decision: when no await is currently
		// blocking AND nothing is queued, Approve is disabled and the
		// SPA shows "leave feedback to force a decision next tick".
		data.await_active = session.await_active === true
		data.await_count = session.await_count ?? 0
		if (session.pending_decision)
			data.pending_decision = session.pending_decision
		if (session.last_await_started_at)
			data.last_await_started_at = session.last_await_started_at
		if (session.last_await_ended_at)
			data.last_await_ended_at = session.last_await_ended_at
		data.approve_action = computeApproveAction(session, current)
	}
	if (session.session_type === "question") {
		data.title = session.title
		data.context = session.context
		data.questions = session.questions
		data.answers = session.answers
		const imagePaths = session.imagePaths ?? []
		data.image_urls = imagePaths.map(
			(_: string, i: number) => `/question-image/${session.session_id}/${i}`,
		)
	}
	if (session.session_type === "design_direction") {
		data.title = "Design Direction"
		data.intent_slug = session.intent_slug
		data.archetypes = session.archetypes
		data.selection = session.selection
	}
	if (session.session_type === "picker") {
		data.intent_slug = session.intent_slug
		data.kind = session.kind
		data.title = session.title
		data.prompt = session.prompt
		data.options = session.options
		data.selection = session.selection
	}
	reply.send(data)
}
