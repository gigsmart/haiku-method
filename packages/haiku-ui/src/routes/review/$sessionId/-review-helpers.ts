/**
 * Helpers shared between the review layout and its child routes.
 *
 * Gate / phase labels used to live in `pages/review/ReviewPage.tsx`.
 * Extracted here so the layout route and per-stage routes can format
 * badges without re-importing across module boundaries.
 *
 * TanStack Router convention: `-` prefix excludes from the route tree.
 */

import type { ReviewPageSessionData } from "../../../pages/review/shared/session-data"

export type GateMode = "ask" | "external" | "auto" | "await"

/**
 * v4: an intent is "terminal" when `sealed_at` is set in the frontmatter
 * (cursor walk drops the cursor as soon as the seal is recorded).
 * v3 fallback: legacy intents used `status: "completed"` and the
 * `awaiting_completion_review` / `intent_completion` phase to signal the
 * same state. Both paths must agree so deep links to `/stages/<X>` on
 * either schema redirect to the IntentCompleteView under `/intent`.
 */
export function isIntentTerminal(session: ReviewPageSessionData): boolean {
	const fm = (session.intent?.frontmatter ?? {}) as Record<string, unknown>
	if (typeof fm.sealed_at === "string" && fm.sealed_at) return true
	const status = typeof fm.status === "string" ? fm.status : ""
	if (status === "completed") return true
	const phase = typeof fm.phase === "string" ? fm.phase : ""
	if (phase === "awaiting_completion_review" || phase === "intent_completion") {
		return true
	}
	return false
}

export function resolveActiveStage(
	session: ReviewPageSessionData,
): string | null {
	// Server is authoritative — it computed `current_state` fresh from
	// per-stage state.json on this very request via getCurrentState(slug)
	// in http/session-api.ts. Trust it and bail out.
	const current = session.current_state?.stage
	if (typeof current === "string" && current) return current
	// Backwards-compat fallback (only fires if the server is older than
	// the current_state field): walk the cached stage_states and frontmatter
	// in the same preference order the server uses internally. Slated for
	// removal once every deployed server emits current_state.
	const stageStates = session.stage_states ?? {}
	const names = Object.keys(stageStates)
	// v4: active = first stage NOT yet merged into intent main.
	// Fall back to v3 status === "active" for un-migrated sessions.
	const active = names.find((s) => {
		const ss = stageStates[s] as
			| { mergedIntoMain?: boolean; status?: string }
			| undefined
		if (!ss) return false
		if (ss.mergedIntoMain === false) return true
		if (ss.status === "active") return true
		return false
	})
	if (active) return active
	const fm = (session.intent?.frontmatter ?? {}) as Record<string, unknown>
	const activeFromFrontmatter = fm.active_stage
	if (typeof activeFromFrontmatter === "string" && activeFromFrontmatter) {
		return activeFromFrontmatter
	}
	const stagesList = fm.stages
	if (Array.isArray(stagesList) && stagesList.length > 0) {
		const last = stagesList[stagesList.length - 1]
		if (typeof last === "string") return last
	}
	return names[0] ?? null
}

/**
 * Parse the raw `gate_type` string into the ordered list of review
 * mechanisms the gate accepts. H·AI·K·U encodes compound gates as
 * comma-separated tokens (see orchestrator.ts — "external,ask" means
 * either a merged PR OR a local approval satisfies the gate). Order
 * matches the stage author's STAGE.md.
 */
export function resolveGateModes(gate: string | undefined): GateMode[] {
	if (!gate) return ["auto"]
	const tokens = gate
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)
	const modes: GateMode[] = []
	for (const t of tokens) {
		if (t === "ask" || t === "external" || t === "auto" || t === "await") {
			if (!modes.includes(t)) modes.push(t)
		}
	}
	return modes.length > 0 ? modes : ["auto"]
}

export function gateBadgeCopy(mode: GateMode): {
	label: string
	classes: string
} {
	switch (mode) {
		case "ask":
			return {
				label: "Local Review",
				classes:
					"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
			}
		case "external":
			return {
				label: "External Review",
				classes:
					"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
			}
		case "await":
			return {
				label: "Awaits Event",
				classes:
					"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
			}
		default:
			return {
				label: "Auto Gate",
				classes:
					"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
			}
	}
}

export const STAGE_PHASES = ["elaborate", "execute", "review", "gate"] as const

export const PHASE_TOOLTIPS: Record<(typeof STAGE_PHASES)[number], string> = {
	elaborate: "Elaborate — specify the work (hats plan unit files)",
	execute: "Execute — hats land code and artifacts for each unit",
	review: "Review — adversarial agents + quality gates",
	gate: "Gate — final review checkpoint; human or external approval",
}

export function phaseBadgeCopy(
	phase: string | undefined,
	stageStatus: string | undefined,
	mergedIntoMain?: boolean,
): { label: string; classes: string } | null {
	// v4: stageStatus may be undefined; mergedIntoMain is the new
	// completion signal. "completed" still wins from v3 fallback.
	if (mergedIntoMain === true || stageStatus === "completed") {
		return {
			label: "All Gates Closed",
			classes:
				"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
		}
	}
	if (phase === "gate") {
		return {
			label: "Final Review Gate",
			classes:
				"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700",
		}
	}
	if (phase === "review") {
		return {
			label: "In Review",
			classes:
				"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
		}
	}
	if (phase === "execute") {
		return {
			label: "Executing",
			classes:
				"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
		}
	}
	if (phase === "elaborate") {
		return {
			label: "Elaborating",
			classes: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
		}
	}
	return null
}
