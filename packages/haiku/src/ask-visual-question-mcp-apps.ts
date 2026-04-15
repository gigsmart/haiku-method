// MCP Apps arm of ask_user_visual_question (unit-04).
//
// Extracted from server.ts so it can be unit-tested directly. The body here
// is the *real* MCP Apps arm — server.ts calls this function when
// hostSupportsMcpApps() is true. This file intentionally does NOT import
// ./http.js, ./tunnel.js, or node:child_process — that is the structural
// guarantee that the MCP Apps arm cannot call startHttpServer, openTunnel,
// or openBrowser.

import {
	clearHeartbeat,
	createQuestionSession,
	getSession,
	waitForSession,
} from "./sessions.js"
import type {
	QuestionAnnotations,
	QuestionAnswer,
	QuestionDef,
} from "./sessions.js"
import { REVIEW_RESOURCE_URI, buildUiResourceMeta } from "./ui-resource.js"

/**
 * Result shape returned by the MCP Apps arm of ask_user_visual_question.
 * Matches the `questionResult` object shape from the HTTP arm in server.ts.
 */
export interface AskVisualQuestionMcpAppsResult {
	status: "answered" | "timeout"
	answers: QuestionAnswer[]
	feedback?: string
	annotations?: QuestionAnnotations
}

/**
 * Dependencies injected by server.ts.
 */
export interface AskVisualQuestionMcpAppsDeps {
	title: string
	questions: QuestionDef[]
	context: string
	imagePaths: string[]
	imageBaseDirs: string[]
	/**
	 * AbortSignal from the current tool call. When aborted, the arm takes the
	 * V5-10 host-timeout fallback path (synthetic empty-answers response).
	 */
	signal: AbortSignal | undefined
	/**
	 * Callback to store the `_meta.ui` payload. Invoked once before the await
	 * begins so handleToolCall can attach it to the tool result.
	 */
	setQuestionResultMeta: (meta: { ui: { resourceUri: string } }) => void
}

/**
 * MCP Apps arm of ask_user_visual_question.
 *
 * Contract:
 *  - Never calls startHttpServer, openTunnel, or openBrowser (structural —
 *    no imports for those modules in this file).
 *  - Creates a question session and blocks on waitForSession() / signal abort.
 *  - On normal resolution: returns { status: "answered", answers, feedback?,
 *    annotations? } from the session after the user submits via
 *    haiku_cowork_review_submit with session_type: "question".
 *  - On signal abort (host_timeout): clears heartbeat and returns synthetic
 *    { status: "timeout", answers: [], feedback: "Question timed out" }.
 */
export async function askVisualQuestionMcpApps(
	deps: AskVisualQuestionMcpAppsDeps,
): Promise<AskVisualQuestionMcpAppsResult> {
	const {
		title,
		questions,
		context,
		imagePaths,
		imageBaseDirs,
		signal,
		setQuestionResultMeta,
	} = deps

	// Create question session (no HTML needed for MCP Apps path)
	const session = createQuestionSession({
		title,
		questions,
		context,
		imagePaths,
		imageBaseDirs,
		html: "",
	})

	// Store _meta for handleToolCall to attach to the tool result.
	setQuestionResultMeta(buildUiResourceMeta(REVIEW_RESOURCE_URI))

	// Single await — blocking path (V5-10 pattern)
	const abortPromise = new Promise<never>((_, reject) => {
		if (signal?.aborted) {
			reject(new Error("host_timeout"))
			return
		}
		signal?.addEventListener("abort", () => reject(new Error("host_timeout")), {
			once: true,
		})
	})

	try {
		await Promise.race([
			waitForSession(session.session_id, 30 * 60 * 1000),
			abortPromise,
		])
	} catch (err) {
		if (signal?.aborted || (err as Error).message === "host_timeout") {
			// V5-10: synthetic fallback — empty answers, timeout feedback
			clearHeartbeat(session.session_id)
			return {
				status: "timeout",
				answers: [],
				feedback: "Question timed out",
			}
		}
		throw err
	}

	const updated = getSession(session.session_id)
	clearHeartbeat(session.session_id)
	if (
		updated &&
		updated.session_type === "question" &&
		updated.status === "answered" &&
		updated.answers
	) {
		const result: AskVisualQuestionMcpAppsResult = {
			status: "answered",
			answers: updated.answers,
		}
		if (updated.feedback) {
			result.feedback = updated.feedback
		}
		if (updated.annotations?.comments?.length) {
			result.annotations = updated.annotations
		}
		return result
	}

	throw new Error("Session resolved but no answers found")
}
