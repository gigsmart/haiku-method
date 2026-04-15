// MCP Apps arm of pick_design_direction (unit-04).
//
// Extracted from server.ts so it can be unit-tested directly. The body here
// is the *real* MCP Apps arm — server.ts calls this function when
// hostSupportsMcpApps() is true. This file intentionally does NOT import
// ./http.js, ./tunnel.js, or node:child_process — that is the structural
// guarantee that the MCP Apps arm cannot call startHttpServer, openTunnel,
// or openBrowser.

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
	clearHeartbeat,
	createDesignDirectionSession,
	getSession,
	waitForSession,
} from "./sessions.js"
import type { DesignArchetypeData, DesignParameterData } from "./sessions.js"
import {
	findHaikuRoot,
	parseFrontmatter,
	readJson,
	stageStatePath,
	writeJson,
} from "./state-tools.js"
import { REVIEW_RESOURCE_URI, buildUiResourceMeta } from "./ui-resource.js"

/**
 * Result shape returned by the MCP Apps arm of pick_design_direction.
 * Matches the conversational-text content returned by the HTTP arm.
 */
export interface PickDesignDirectionMcpAppsResult {
	/** Conversational text to return to the agent — same format as HTTP arm */
	text: string
}

/**
 * Dependencies injected by server.ts.
 */
export interface PickDesignDirectionMcpAppsDeps {
	title: string
	archetypes: DesignArchetypeData[]
	parameters: DesignParameterData[]
	/** intent_slug — needed for stage-state write */
	intentSlug: string
	/**
	 * AbortSignal from the current tool call. When aborted, the arm takes the
	 * V5-10 host-timeout fallback path (synthetic first-archetype selection).
	 */
	signal: AbortSignal | undefined
	/**
	 * Callback to store the `_meta.ui` payload. Invoked once before the await
	 * begins so handleToolCall can attach it to the tool result.
	 */
	setDesignDirectionResultMeta: (meta: { ui: { resourceUri: string } }) => void
}

/**
 * MCP Apps arm of pick_design_direction.
 *
 * Contract:
 *  - Never calls startHttpServer, openTunnel, or openBrowser (structural —
 *    no imports for those modules in this file).
 *  - Creates a design direction session and blocks on waitForSession() /
 *    signal abort.
 *  - On normal resolution: writes design_direction_selected to stage state
 *    (identical to HTTP arm at server.ts:828-852), then returns conversational
 *    text matching the HTTP arm format.
 *  - On signal abort (host_timeout): returns synthetic first-archetype
 *    selection with "Timed out" comment. Stage-state write is skipped for
 *    timeout path.
 */
export async function pickDesignDirectionMcpApps(
	deps: PickDesignDirectionMcpAppsDeps,
): Promise<PickDesignDirectionMcpAppsResult> {
	const {
		title: _title,
		archetypes,
		parameters: _parameters,
		intentSlug,
		signal,
		setDesignDirectionResultMeta,
	} = deps

	// Create design direction session (no HTML needed for MCP Apps path)
	const session = createDesignDirectionSession({
		intent_slug: intentSlug,
		archetypes,
		parameters: _parameters,
		html: "",
	})

	// Store _meta for handleToolCall to attach to the tool result.
	setDesignDirectionResultMeta(buildUiResourceMeta(REVIEW_RESOURCE_URI))

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
			// V5-10: synthetic fallback — first archetype with default parameters
			clearHeartbeat(session.session_id)
			const firstArchetype = archetypes[0]
			return {
				text: `The user selected the **${firstArchetype?.name ?? "default"}** direction.\nComments: Timed out`,
			}
		}
		throw err
	}

	const updated = getSession(session.session_id)
	clearHeartbeat(session.session_id)
	if (
		updated &&
		updated.session_type === "design_direction" &&
		updated.status === "answered" &&
		updated.selection
	) {
		// Stage-state write — MUST run on Cowork branch (same as HTTP arm, server.ts:828-852)
		try {
			const root = findHaikuRoot()
			const intentFile = join(root, "intents", intentSlug, "intent.md")
			const intentRaw = await readFile(intentFile, "utf-8")
			const intentFm = parseFrontmatter(intentRaw)
			const activeStage = (intentFm.data.active_stage as string) || ""
			if (activeStage) {
				const ssPath = stageStatePath(intentSlug, activeStage)
				const ssData = readJson(ssPath)
				ssData.design_direction_selected = true
				ssData.design_direction = {
					archetype: updated.selection.archetype,
					parameters: updated.selection.parameters,
					...(updated.selection.comments
						? { comments: updated.selection.comments }
						: {}),
					...(updated.selection.annotations
						? { annotations: updated.selection.annotations }
						: {}),
				}
				writeJson(ssPath, ssData)
			}
		} catch {
			/* non-fatal — orchestrator flag may need manual set */
		}

		// Return conversational context only — same format as HTTP arm
		const sel = updated.selection
		const parts: string[] = [
			`The user selected the **${sel.archetype}** direction.`,
		]
		if (sel.comments) {
			parts.push(`\nComments: ${sel.comments}`)
		}
		if (sel.annotations?.pins?.length) {
			parts.push(`\nVisual annotations (${sel.annotations.pins.length} pins):`)
			for (const pin of sel.annotations.pins) {
				parts.push(
					`  - [${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%]: ${pin.text || "(no text)"}`,
				)
			}
		}
		return { text: parts.join("\n") }
	}

	throw new Error("Session resolved but no selection found")
}
