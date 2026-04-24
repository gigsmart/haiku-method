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

export function resolveActiveStage(
	session: ReviewPageSessionData,
): string | null {
	const stageStates = session.stage_states ?? {}
	const names = Object.keys(stageStates)
	// Canonical: one of the stages has status === "active".
	const active = names.find((s) => stageStates[s]?.status === "active")
	if (active) return active
	// Fallbacks, in preference order:
	//   1. `intent.frontmatter.active_stage` — authoritative on disk,
	//      still set after the intent moves to awaiting_completion_review
	//      (every stage's status is "completed" by then).
	//   2. The LAST stage in intent.stages — that's the final stage the
	//      intent reached.
	//   3. First stage_state key — last-resort when nothing else is
	//      available.
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
): { label: string; classes: string } | null {
	if (stageStatus === "completed") {
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
