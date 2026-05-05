import { EventEmitter } from "node:events"
import { newSessionId } from "./session-id.js"

const sessionEvents = new EventEmitter()
// Prevent warnings when many sessions are active concurrently
sessionEvents.setMaxListeners(200)

// ─── Presence / heartbeat tracking ───────────────────────────────────
// Browser clients HEAD /api/session/:id/heartbeat every 10s. If no
// heartbeat arrives within HEARTBEAT_GRACE_MS we mark the session as
// disconnected and wake up any waiting handler so it can react.
//
// Grace is deliberately generous (2 min) because modern browsers
// aggressively throttle setInterval in backgrounded tabs — Chrome can
// drop the effective heartbeat cadence to once per minute or slower
// when a tab loses focus. A tighter grace causes spurious presence-lost
// events on alive-but-backgrounded tabs, which previously triggered a
// browser re-open loop that orphaned in-progress comments on the
// original tab.
const HEARTBEAT_GRACE_MS = 120_000
const HEARTBEAT_SWEEP_INTERVAL = 5_000
const lastHeartbeatAt = new Map<string, number>()
const presenceLost = new Set<string>()

export function recordHeartbeat(sessionId: string): boolean {
	if (!sessions.has(sessionId)) return false
	lastHeartbeatAt.set(sessionId, Date.now())
	if (presenceLost.delete(sessionId)) {
		console.error(`[haiku] Presence restored for session ${sessionId}`)
	}
	return true
}

export function hasPresenceLost(sessionId: string): boolean {
	return presenceLost.has(sessionId)
}

export function clearHeartbeat(sessionId: string): void {
	lastHeartbeatAt.delete(sessionId)
	presenceLost.delete(sessionId)
}

function sweepPresence(): void {
	const now = Date.now()
	for (const [id, ts] of lastHeartbeatAt) {
		if (now - ts <= HEARTBEAT_GRACE_MS) continue
		const session = sessions.get(id)
		if (!session) {
			lastHeartbeatAt.delete(id)
			presenceLost.delete(id)
			continue
		}
		// Only interesting while a handler is still blocking on the session
		if (
			(session.session_type === "review" && session.status !== "pending") ||
			(session.session_type === "question" && session.status !== "pending") ||
			(session.session_type === "design_direction" &&
				session.status !== "pending")
		) {
			continue
		}
		if (!presenceLost.has(id)) {
			presenceLost.add(id)
			console.error(
				`[haiku] Presence lost for session ${id} — no heartbeat in ${Math.round(
					(now - ts) / 1000,
				)}s`,
			)
			sessionEvents.emit(`session:${id}`)
		}
	}
}

// Watchdog sweeps every HEARTBEAT_SWEEP_INTERVAL. unref() so the timer
// never prevents the MCP process from exiting cleanly.
setInterval(sweepPresence, HEARTBEAT_SWEEP_INTERVAL).unref()

/**
 * Notify that a session's status has been updated.
 * Tool handlers awaiting waitForSession() will resolve.
 */
export function notifySessionUpdate(sessionId: string): void {
	sessionEvents.emit(`session:${sessionId}`)
}

/**
 * Await a session status change. Resolves when notifySessionUpdate is called
 * for the given session, rejects on timeout, or rejects if `signal` aborts.
 *
 * Signal support is how tool cancellation propagates — when the MCP
 * client cancels an in-flight tool call, its abort signal fires; the
 * handler's finally block needs to unwind promptly so the session can
 * be cleaned up. Without signal support the handler would spin inside
 * this promise for the full 30-minute timeout.
 */
export function waitForSession(
	sessionId: string,
	timeoutMs: number = 30 * 60 * 1000,
	signal?: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			sessionEvents.removeListener(`session:${sessionId}`, handler)
			signal?.removeEventListener("abort", onAbort)
			reject(new Error("Session timeout"))
		}, timeoutMs)

		function handler() {
			clearTimeout(timer)
			signal?.removeEventListener("abort", onAbort)
			resolve()
		}

		function onAbort() {
			clearTimeout(timer)
			sessionEvents.removeListener(`session:${sessionId}`, handler)
			reject(
				new Error(
					`Session wait aborted${signal?.reason ? `: ${String(signal.reason)}` : ""}`,
				),
			)
		}

		if (signal?.aborted) {
			clearTimeout(timer)
			reject(new Error("Session wait aborted before start"))
			return
		}

		signal?.addEventListener("abort", onAbort, { once: true })
		sessionEvents.once(`session:${sessionId}`, handler)
	})
}

export interface ReviewAnnotations {
	screenshot?: string // base64 PNG of annotated canvas
	pins?: Array<{ x: number; y: number; text: string }>
	comments?: Array<{ selectedText: string; comment: string; paragraph: number }>
	// Revisit channel: set by the HTTP revisit endpoint
	// (POST /api/revisit/:sessionId) when waking awaitGateReviewSession
	// via pending_decision. haiku_await_gate's revisit-dispatch short-
	// circuit reads these to route the rewind. Distinct from the
	// reviewer-annotation fields above — populated only on the revisit
	// path, never via the WS `decide` frame.
	revisit_action?: string
	revisit_stage?: string
	revisit_message?: string
}

/** Snapshot of a decided review for delta comparison on the next re-review. */
export interface PreviousReviewSnapshot {
	feedback: string
	reviewedAt: string
	intentRawContent: string
	unitRawContents: Record<string, string>
}

export interface ReviewSession {
	session_type: "review"
	session_id: string
	intent_dir: string
	intent_slug: string
	target: string
	status: "pending" | "approved" | "changes_requested" | "decided"
	/** Ad-hoc sessions are opened on-demand via `haiku_review_open` (not a
	 *  gate). The UI hides Approve, swaps the primary button to
	 *  Done/Close (no feedback) or Request Changes (with feedback), and
	 *  shows an "Ad-hoc review" badge in the header. The workflow engine does not
	 *  treat an ad-hoc session's status as a gate decision — durable
	 *  feedback left on the session routes through the usual fix-loop on
	 *  the next `run_next`. */
	ad_hoc?: boolean
	/** For ad-hoc sessions: the stage the reviewer was browsing when the
	 *  pane was opened. Used so the session-scoped URL can land on the
	 *  right stage without guessing. */
	stage?: string
	decision: string
	feedback: string
	annotations?: ReviewAnnotations
	gate_type?: string
	/** Where in the lifecycle this gate fires. Drives the Approve button
	 *  label so the user sees the actual consequence ("Complete Development
	 *  Stage", "Start Inception", "Mark Intent Done"). Set when the
	 *  orchestrator opens a review; absent for ad-hoc sessions. */
	gate_context?: string
	/** The stage that begins after approval, when one exists. Null/omit on
	 *  the final stage gate so the label resolver can switch to intent-
	 *  completion phrasing. */
	next_stage?: string | null
	/** The phase that begins after approval (e.g. "execute" after the
	 *  elaborate→execute gate). Used to generate "Start Execution"-style
	 *  labels for mid-stage gates. */
	next_phase?: string | null
	/** If this review follows a prior changes_requested decision for the same
	 *  intent, a snapshot of the prior review's content is attached here so
	 *  the SPA can render a delta and show the previous feedback. */
	previousReview?: PreviousReviewSnapshot
	/** A queued decision the SPA submitted while no haiku_await_gate was
	 *  blocking on this session. The next await drains this slot before
	 *  subscribing to a fresh waitForSession. Last-write-wins: a second
	 *  submit overwrites the first. Cleared when an await consumes it or
	 *  when a fresh await opens (defensive). Independent of `status` —
	 *  the session itself stays "pending" between awaits, since the
	 *  decision is per-await-cycle, not per-session. */
	pending_decision?: {
		decision: string
		feedback: string
		annotations?: ReviewAnnotations
		submitted_at: string
	} | null
	/** True while a haiku_await_gate call is currently blocked on this
	 *  session. The SPA reads this to decide whether the Approve button
	 *  should be active (await_active=true) or disabled with a "leave
	 *  feedback to force a decision next tick" empty state
	 *  (await_active=false). Set by awaitGateReviewSession on entry and
	 *  cleared on exit. */
	await_active?: boolean
	/** Cumulative number of awaits that have run on this session. Useful
	 *  for telemetry and for the SPA to detect "engine is back, new
	 *  await round started." */
	await_count?: number
	/** ISO timestamp set when the most recent await began blocking. */
	last_await_started_at?: string | null
	/** ISO timestamp set when the most recent await ended (decision,
	 *  timeout, or abort). */
	last_await_ended_at?: string | null
	/** Parsed data for the SPA — stored at session creation so /api/session can return it */
	parsedIntent?: unknown
	parsedUnits?: unknown[]
	parsedCriteria?: unknown[]
	parsedMermaid?: string
	intentMockups?: unknown[]
	unitMockups?: Map<string, unknown[]> | Record<string, unknown[]>
	stageStates?: Record<string, unknown>
	knowledgeFiles?: Array<{ name: string; content: string }>
	stageArtifacts?: Array<{ stage: string; name: string; content: string }>
	outputArtifacts?: Array<{
		stage: string
		name: string
		type: string
		content?: string
		relativePath?: string
		intentRelativePath?: string
	}>
	/** Per-unit output preview entries keyed by unit slug. The SPA's
	 *  Units tab renders each entry as a click-out link with a hover
	 *  popover preview. Built server-side at session creation so the
	 *  SPA doesn't have to per-row-fetch each output's bytes. */
	unitOutputs?: Record<
		string,
		Array<{
			path: string
			name: string
			type: string
			url: string
			previewBody?: string
			sizeBytes?: number
			exists: boolean
		}>
	>
	/** Inverse map: keyed by intent-dir-relative output path, lists
	 *  the unit slugs that declared it. The review UI surfaces this
	 *  as a banner above output content. */
	outputDeclaredBy?: Record<string, string[]>
}

export interface QuestionDef {
	question: string
	header?: string
	options: string[]
	multiSelect?: boolean
}

export interface QuestionAnswer {
	question: string
	selectedOptions: string[]
	otherText?: string
}

export interface QuestionAnnotations {
	comments?: Array<{ selectedText: string; comment: string; paragraph: number }>
	pins?: Array<{ x: number; y: number; text: string; image_index: number }>
	screenshots?: Array<{
		comment: string
		screenshot_data_url: string
		image_index: number
	}>
}

export interface QuestionSession {
	session_type: "question"
	session_id: string
	title: string
	questions: QuestionDef[]
	context: string
	imagePaths: string[]
	imageBaseDirs?: string[]
	status: "pending" | "answered"
	answers: QuestionAnswer[]
	feedback: string
	annotations?: QuestionAnnotations
}

export interface DesignArchetypeData {
	name: string
	description: string
	preview_html: string
}

/** A user's response to a design-direction picker. Either a final
 *  selection (`mode: "select"`) or a regenerate request asking the
 *  agent for more variants (`mode: "regenerate"`). */
export type DirectionSelection =
	| {
			mode: "select"
			archetype: string
			comments?: string
			annotations?: {
				pins?: Array<{ x: number; y: number; text: string }>
				screenshots?: Array<{
					comment: string
					screenshot_data_url: string
				}>
			}
	  }
	| {
			mode: "regenerate"
			keep: string[]
			comments?: string
	  }

export interface DesignDirectionSession {
	session_type: "design_direction"
	session_id: string
	intent_slug: string
	archetypes: DesignArchetypeData[]
	status: "pending" | "answered"
	selection: DirectionSelection | null
}

const sessions = new Map<
	string,
	ReviewSession | QuestionSession | DesignDirectionSession
>()

// ─── Previous-review snapshots (for re-review delta) ────────────────
// Keyed by intent_dir absolute path. When a review ends in
// changes_requested, we stash the intent/unit content the user just saw so
// that the next review session for the same intent can attach it and render
// a delta. Cleared on approved/external decisions.
const previousReviewByIntentDir = new Map<string, PreviousReviewSnapshot>()

export function getPreviousReviewSnapshot(
	intentDir: string,
): PreviousReviewSnapshot | undefined {
	return previousReviewByIntentDir.get(intentDir)
}

export function setPreviousReviewSnapshot(
	intentDir: string,
	snapshot: PreviousReviewSnapshot,
): void {
	previousReviewByIntentDir.set(intentDir, snapshot)
}

export function clearPreviousReviewSnapshot(intentDir: string): void {
	previousReviewByIntentDir.delete(intentDir)
}

// Cap total in-memory sessions and apply a 30-minute TTL to prevent unbounded growth
const MAX_SESSIONS = 100
const SESSION_TTL_MS = 30 * 60 * 1000
const sessionCreatedAt = new Map<string, number>()

/** Drop the previous-review snapshot for an intent_dir if no remaining
 *  review session still references that intent. Called when a review
 *  session is evicted so abandoned snapshots don't pile up. */
function maybeClearOrphanedSnapshot(intentDir: string): void {
	if (!previousReviewByIntentDir.has(intentDir)) return
	for (const s of sessions.values()) {
		if (s.session_type === "review" && s.intent_dir === intentDir) return
	}
	previousReviewByIntentDir.delete(intentDir)
}

function evictSessions(): void {
	const now = Date.now()
	// Evict expired sessions
	for (const [id, ts] of sessionCreatedAt) {
		if (now - ts > SESSION_TTL_MS) {
			const evicted = sessions.get(id)
			sessions.delete(id)
			sessionCreatedAt.delete(id)
			clearHeartbeat(id)
			if (evicted?.session_type === "review") {
				maybeClearOrphanedSnapshot(evicted.intent_dir)
			}
		}
	}
	// If still over cap, evict oldest
	while (sessions.size >= MAX_SESSIONS) {
		const oldest = sessionCreatedAt.entries().next().value
		if (!oldest) break
		const evicted = sessions.get(oldest[0])
		sessions.delete(oldest[0])
		sessionCreatedAt.delete(oldest[0])
		clearHeartbeat(oldest[0])
		if (evicted?.session_type === "review") {
			maybeClearOrphanedSnapshot(evicted.intent_dir)
		}
	}
}

export function createSession(
	params: Omit<
		ReviewSession,
		"session_type" | "session_id" | "status" | "decision" | "feedback"
	>,
): ReviewSession {
	evictSessions()
	const session_id = newSessionId()
	const session: ReviewSession = {
		...params,
		session_type: "review",
		session_id,
		status: "pending",
		decision: "",
		feedback: "",
	}
	sessions.set(session_id, session)
	sessionCreatedAt.set(session_id, Date.now())
	return session
}

export function createQuestionSession(
	params: Omit<
		QuestionSession,
		"session_type" | "session_id" | "status" | "answers" | "feedback"
	> & { imagePaths?: string[] },
): QuestionSession {
	evictSessions()
	const session_id = newSessionId()
	const session: QuestionSession = {
		...params,
		session_type: "question",
		session_id,
		imagePaths: params.imagePaths ?? [],
		status: "pending",
		answers: [],
		feedback: "",
	}
	sessions.set(session_id, session)
	sessionCreatedAt.set(session_id, Date.now())
	return session
}

export function createDesignDirectionSession(
	params: Omit<
		DesignDirectionSession,
		"session_type" | "session_id" | "status" | "selection"
	>,
): DesignDirectionSession {
	evictSessions()
	const session_id = newSessionId()
	const session: DesignDirectionSession = {
		...params,
		session_type: "design_direction",
		session_id,
		status: "pending",
		selection: null,
	}
	sessions.set(session_id, session)
	sessionCreatedAt.set(session_id, Date.now())
	return session
}

export function getSession(
	sessionId: string,
): ReviewSession | QuestionSession | DesignDirectionSession | undefined {
	return sessions.get(sessionId)
}

/**
 * Find a non-ad-hoc review session for the given intent slug whose
 * presence has NOT been lost (the SPA tab is still alive). Used by
 * prepareGateReviewSession to reuse an existing tab across gate cycles
 * within a single agent session — same URL, same session_id, refreshed
 * parsed data and gate_meta.
 *
 * Returns the most recently created matching session. Returns undefined
 * when none exists.
 */
export function findLiveReviewSessionForIntent(
	intentSlug: string,
): ReviewSession | undefined {
	let best: ReviewSession | undefined
	let bestCreatedAt = 0
	for (const [id, s] of sessions) {
		if (s.session_type !== "review") continue
		if (s.intent_slug !== intentSlug) continue
		if (s.ad_hoc) continue
		if (presenceLost.has(id)) continue
		const createdAt = sessionCreatedAt.get(id) ?? 0
		if (createdAt > bestCreatedAt) {
			best = s
			bestCreatedAt = createdAt
		}
	}
	return best
}

/** True when the SPA tab is actively heartbeating for the given session.
 *  Distinct from "session exists" — a session can exist (in-memory map)
 *  without an attached browser. Used by prepareGateReviewSession to set
 *  browser_attached on the prepared payload so the agent prompt can
 *  skip "post the URL to the user" when the user is already watching.
 *
 *  Threshold is tighter than HEARTBEAT_GRACE_MS (which is generous to
 *  account for backgrounded-tab throttling) — the question here is "is
 *  the tab in the foreground RIGHT NOW," not "is the tab still
 *  reachable in principle." 30s is roughly 3 SPA heartbeat ticks. */
const BROWSER_ATTACHED_FRESHNESS_MS = 30_000
export function isBrowserAttached(sessionId: string): boolean {
	if (!sessions.has(sessionId)) return false
	if (presenceLost.has(sessionId)) return false
	const ts = lastHeartbeatAt.get(sessionId)
	if (!ts) return false
	return Date.now() - ts <= BROWSER_ATTACHED_FRESHNESS_MS
}

/**
 * Drop a session from the in-memory registry. Callers should use this
 * when the session's purpose is complete (tool call returned, user
 * abandoned the review, MCP process shutting down) so subsequent
 * `getSession` lookups return 404 and the SPA's polling fallback
 * transitions to the session-ended overlay on reload.
 */
export function deleteSession(sessionId: string): boolean {
	const had = sessions.delete(sessionId)
	sessionCreatedAt.delete(sessionId)
	clearHeartbeat(sessionId)
	return had
}

export function updateSession(
	sessionId: string,
	updates: Partial<
		Pick<
			ReviewSession,
			| "status"
			| "decision"
			| "feedback"
			| "annotations"
			| "pending_decision"
			| "await_active"
			| "await_count"
			| "last_await_started_at"
			| "last_await_ended_at"
		>
	>,
): ReviewSession | undefined {
	const session = sessions.get(sessionId)
	if (!session || session.session_type !== "review") return undefined
	Object.assign(session, updates)

	// When the user requests changes, stash a snapshot of the content they
	// just reviewed, keyed by intent_dir, so the NEXT review session for the
	// same intent can attach it as `previousReview` and render a delta. On
	// any other terminal decision, drop any prior snapshot so we don't show
	// a stale "previous review" banner.
	//
	// Ad-hoc sessions skip snapshot stashing/clearing entirely — their
	// decision is a UX signal (Done / Request Changes) not a gate
	// outcome, so they must not disturb the next gate review's delta.
	if (updates.status === "decided" && !session.ad_hoc) {
		if (session.decision === "changes_requested") {
			const intent = session.parsedIntent as { rawContent?: string } | undefined
			const units =
				(session.parsedUnits as
					| Array<{ slug?: string; rawContent?: string }>
					| undefined) ?? []
			const unitRawContents: Record<string, string> = {}
			for (const u of units) {
				if (u?.slug && typeof u.rawContent === "string") {
					unitRawContents[u.slug] = u.rawContent
				}
			}
			setPreviousReviewSnapshot(session.intent_dir, {
				feedback: session.feedback ?? "",
				reviewedAt: new Date().toISOString(),
				intentRawContent: intent?.rawContent ?? "",
				unitRawContents,
			})
		} else {
			clearPreviousReviewSnapshot(session.intent_dir)
		}
	}

	notifySessionUpdate(sessionId)
	return session
}

export function updateQuestionSession(
	sessionId: string,
	updates: Partial<
		Pick<QuestionSession, "status" | "answers" | "feedback" | "annotations">
	>,
): QuestionSession | undefined {
	const session = sessions.get(sessionId)
	if (!session || session.session_type !== "question") return undefined
	Object.assign(session, updates)
	notifySessionUpdate(sessionId)
	return session
}

export function updateDesignDirectionSession(
	sessionId: string,
	updates: Partial<Pick<DesignDirectionSession, "status" | "selection">>,
): DesignDirectionSession | undefined {
	const session = sessions.get(sessionId)
	if (!session || session.session_type !== "design_direction") return undefined
	Object.assign(session, updates)
	notifySessionUpdate(sessionId)
	return session
}
