import { EventEmitter } from "node:events"

const sessionEvents = new EventEmitter()
// Prevent warnings when many sessions are active concurrently
sessionEvents.setMaxListeners(200)

// ─── Presence / heartbeat tracking ───────────────────────────────────
// Browser clients HEAD /api/session/:id/heartbeat every 10s. If no
// heartbeat arrives within HEARTBEAT_GRACE_MS we mark the session as
// disconnected and wake up any waiting handler so it can reopen the
// browser or bail out. This replaces the WebSocket-based presence
// detection that didn't work across tunnel proxies.
const HEARTBEAT_GRACE_MS = 25_000
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

/** True if the client has sent a heartbeat within the grace window. */
export function isClientPresent(sessionId: string): boolean {
	const ts = lastHeartbeatAt.get(sessionId)
	if (ts === undefined) return false
	if (presenceLost.has(sessionId)) return false
	return Date.now() - ts <= HEARTBEAT_GRACE_MS
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
 * for the given session, or rejects on timeout.
 */
export function waitForSession(
	sessionId: string,
	timeoutMs: number = 30 * 60 * 1000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			sessionEvents.removeListener(`session:${sessionId}`, handler)
			reject(new Error("Session timeout"))
		}, timeoutMs)

		function handler() {
			clearTimeout(timer)
			resolve()
		}

		sessionEvents.once(`session:${sessionId}`, handler)
	})
}

export interface ReviewAnnotations {
	screenshot?: string // base64 PNG of annotated canvas
	pins?: Array<{ x: number; y: number; text: string }>
	comments?: Array<{ selectedText: string; comment: string; paragraph: number }>
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
	review_type: "intent" | "unit"
	target: string
	status: "pending" | "approved" | "changes_requested" | "decided"
	decision: string
	feedback: string
	annotations?: ReviewAnnotations
	gate_type?: string
	html: string
	/** If this review follows a prior changes_requested decision for the same
	 *  intent, a snapshot of the prior review's content is attached here so
	 *  the SPA can render a delta and show the previous feedback. */
	previousReview?: PreviousReviewSnapshot
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
	}>
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
	html: string
}

export interface DesignArchetypeData {
	name: string
	description: string
	preview_html: string
	default_parameters: Record<string, number>
}

export interface DesignParameterData {
	name: string
	label: string
	description: string
	min: number
	max: number
	step: number
	default: number
	labels: { low: string; high: string }
}

export interface DesignDirectionSession {
	session_type: "design_direction"
	session_id: string
	intent_slug: string
	archetypes: DesignArchetypeData[]
	parameters: DesignParameterData[]
	status: "pending" | "answered"
	selection: {
		archetype: string
		parameters: Record<string, number>
		comments?: string
		annotations?: {
			screenshot?: string
			pins?: Array<{ x: number; y: number; text: string }>
		}
	} | null
	html: string
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
	const session_id = crypto.randomUUID()
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
	const session_id = crypto.randomUUID()
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
	const session_id = crypto.randomUUID()
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

export function updateSession(
	sessionId: string,
	updates: Partial<
		Pick<ReviewSession, "status" | "decision" | "feedback" | "annotations">
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
	if (updates.status === "decided") {
		if (session.decision === "changes_requested") {
			const intent = session.parsedIntent as
				| { rawContent?: string }
				| undefined
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
