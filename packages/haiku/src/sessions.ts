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

// Cap total in-memory sessions and apply a 30-minute TTL to prevent unbounded growth
const MAX_SESSIONS = 100
const SESSION_TTL_MS = 30 * 60 * 1000
const sessionCreatedAt = new Map<string, number>()

function evictSessions(): void {
	const now = Date.now()
	// Evict expired sessions
	for (const [id, ts] of sessionCreatedAt) {
		if (now - ts > SESSION_TTL_MS) {
			sessions.delete(id)
			sessionCreatedAt.delete(id)
			clearHeartbeat(id)
		}
	}
	// If still over cap, evict oldest
	while (sessions.size >= MAX_SESSIONS) {
		const oldest = sessionCreatedAt.entries().next().value
		if (!oldest) break
		sessions.delete(oldest[0])
		sessionCreatedAt.delete(oldest[0])
		clearHeartbeat(oldest[0])
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
