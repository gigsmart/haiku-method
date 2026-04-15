// MCP Apps arm of setOpenReviewHandler (unit-03).
//
// Extracted from server.ts so it can be unit-tested directly. The body here
// is the *real* MCP Apps arm — server.ts calls this function when
// hostSupportsMcpApps() is true. This file intentionally does NOT import
// ./http.js, ./tunnel.js, or node:child_process — that is the structural
// guarantee that the MCP Apps arm cannot call startHttpServer, openTunnel,
// or openBrowser. CC-2 asserts both the behavioral outcome (running the
// function with real inputs succeeds without touching HTTP) and the
// structural outcome (grep over this file's source).

import { join, resolve } from "node:path"
import {
	buildDAG,
	parseAllUnits,
	parseCriteria,
	parseIntent,
	parseKnowledgeFiles,
	parseOutputArtifacts,
	parseStageArtifacts,
	parseStageStates,
	toMermaidDefinition,
} from "./index.js"
import { logSessionEvent } from "./session-metadata.js"
import {
	clearHeartbeat,
	createSession,
	getSession,
	waitForSession,
} from "./sessions.js"
import { setFrontmatterField } from "./state-tools.js"
import { REVIEW_RESOURCE_URI, buildUiResourceMeta } from "./ui-resource.js"

/**
 * Result shape returned by the MCP Apps arm of _openReviewAndWait.
 * Matches the contract in orchestrator.ts `_openReviewAndWait` signature.
 */
export interface OpenReviewMcpAppsResult {
	decision: string
	feedback: string
	annotations?: unknown
}

/**
 * Dependencies injected by server.ts. Only the things that genuinely live at
 * module scope in server.ts need to be passed in — everything else is
 * imported directly above.
 */
export interface OpenReviewMcpAppsDeps {
	/**
	 * Relative path (from cwd) to the intent directory — e.g.
	 * `.haiku/intents/my-intent`.
	 */
	intentDirRel: string
	/** "intent" | "unit" */
	reviewType: string
	/** Optional gate type (passed through to createSession). */
	gateType?: string
	/**
	 * AbortSignal from the current tool call. When aborted, the arm takes the
	 * V5-10 host-timeout fallback path (synthetic changes_requested decision).
	 */
	signal: AbortSignal | undefined
	/**
	 * Callback to store the `_meta.ui` payload on the server's module-scoped
	 * `_reviewResultMeta`. Invoked once before the await begins so
	 * handleToolCall can attach it to the tool result when the arm resolves.
	 */
	setReviewResultMeta: (meta: { ui: { resourceUri: string } }) => void
}

/**
 * MCP Apps arm of _openReviewAndWait.
 *
 * Contract (CC-2, CC-5/6, CC-7, CC-8):
 *  - Never calls startHttpServer, openTunnel, or openBrowser (structural — no
 *    imports for those modules in this file).
 *  - Creates a review session and blocks on waitForSession() / signal abort.
 *  - On normal resolution: returns { decision, feedback, annotations } from
 *    the session after the user submits via haiku_cowork_review_submit.
 *  - On signal abort (host_timeout): logs gate_review_host_timeout, writes
 *    blocking_timeout_observed: true to intent.md frontmatter, does NOT
 *    touch state.json, and returns synthetic changes_requested.
 *  - Stores _meta.ui.resourceUri on the caller's module-scoped slot so the
 *    tool result carries the ui resource pointer (CC-3).
 */
export async function openReviewMcpApps(
	deps: OpenReviewMcpAppsDeps,
): Promise<OpenReviewMcpAppsResult> {
	const { intentDirRel, reviewType, gateType, signal, setReviewResultMeta } =
		deps

	const intentDirAbs = resolve(process.cwd(), intentDirRel)
	const intent = await parseIntent(intentDirAbs)
	if (!intent) throw new Error("Could not parse intent")

	const units = await parseAllUnits(intentDirAbs)
	const dag = buildDAG(units)
	const mermaid = toMermaidDefinition(dag, units)
	const criteriaSection = intent.sections.find(
		(s) =>
			s.heading?.toLowerCase().includes("completion criteria") ||
			s.heading?.toLowerCase().includes("success criteria"),
	)
	const criteria = criteriaSection ? parseCriteria(criteriaSection.content) : []

	const session = createSession({
		intent_dir: intentDirAbs,
		intent_slug: intent.slug,
		review_type: reviewType as "intent" | "unit",
		gate_type: gateType,
		target: "",
		html: "",
	})

	// Set _meta synchronously before any further awaits so the session and
	// the meta callback are visible to observers (tests, handleToolCall) at
	// the same time. Delaying this past subsequent awaits introduced a race
	// where listSessions() returned the session before _meta was populated.
	setReviewResultMeta(buildUiResourceMeta(REVIEW_RESOURCE_URI))

	// Store parsed data on session for the SPA
	Object.assign(session, {
		parsedIntent: intent,
		parsedUnits: units,
		parsedCriteria: criteria,
		parsedMermaid: mermaid,
	})

	// Parse stage states + knowledge
	const stageStates = await parseStageStates(intentDirAbs)
	const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
	const stageArtifacts = await parseStageArtifacts(intentDirAbs)
	const outputArtifacts = await parseOutputArtifacts(intentDirAbs)

	// Resolve image output artifact URLs now that we have a session ID
	for (const oa of outputArtifacts) {
		if (oa.type === "image" && oa.relativePath) {
			oa.relativePath = `/stage-artifacts/${session.session_id}/stages/${oa.relativePath}`
		}
	}

	Object.assign(session, {
		stageStates,
		knowledgeFiles,
		stageArtifacts,
		outputArtifacts,
	})

	// Single await — blocking path (unit-02-outcome: blocking)
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
			// V5-10: log timeout event
			try {
				const stFile = join(
					process.cwd(),
					intentDirRel,
					"..",
					"..",
					"session.log",
				)
				logSessionEvent(stFile, {
					event: "gate_review_host_timeout",
					detected_at_seconds: Date.now() / 1000,
				})
			} catch {
				/* non-fatal */
			}
			// V5-11: do NOT touch state.json
			clearHeartbeat(session.session_id)
			// Write blocking_timeout_observed to intent.md frontmatter
			try {
				const intentFilePath = join(process.cwd(), intentDirRel, "intent.md")
				setFrontmatterField(intentFilePath, "blocking_timeout_observed", true)
			} catch {
				/* non-fatal */
			}
			return {
				decision: "changes_requested",
				feedback:
					"Review timed out before decision was submitted. Please retry.",
				annotations: undefined,
			}
		}
		throw err
	}

	const updated = getSession(session.session_id)
	clearHeartbeat(session.session_id)
	if (
		updated &&
		updated.session_type === "review" &&
		updated.status === "decided"
	) {
		return {
			decision: updated.decision,
			feedback: updated.feedback,
			annotations: updated.annotations,
		}
	}
	throw new Error("Session resolved but no decision found")
}
