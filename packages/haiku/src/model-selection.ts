// model-selection.ts — Cascading model selection for H·AI·K·U
//
// Single source of truth for:
//   - Valid model tier names
//   - Cascade resolution (unit > hat > stage > studio)
//   - Auto-escalation on hat rejection
//   - Input sanitization
//
// Consumers (orchestrator, state-tools, templates) import from here instead
// of hardcoding tier names or re-implementing resolution logic.

/** Known model tiers, ordered from cheapest to most capable. */
export const MODEL_TIERS = ["haiku", "sonnet", "opus"] as const
export type ModelTier = (typeof MODEL_TIERS)[number]

const TIER_SET: ReadonlySet<string> = new Set(MODEL_TIERS)

/** Escalation chain: each tier maps to the next one up. Opus has no successor. */
const ESCALATION: Readonly<Record<ModelTier, ModelTier | undefined>> = {
	haiku: "sonnet",
	sonnet: "opus",
	opus: undefined,
}

/** Type guard: is this string a valid model tier? */
export function isValidModel(s: string | undefined | null): s is ModelTier {
	return typeof s === "string" && TIER_SET.has(s)
}

/**
 * Sanitize a raw model value from untrusted frontmatter.
 * Returns the value only if it's a known tier — prevents prompt injection
 * via arbitrary strings interpolated into spawn instructions.
 */
export function sanitizeModel(
	raw: string | undefined | null,
): ModelTier | undefined {
	return isValidModel(raw) ? raw : undefined
}

/** Where the resolved model came from in the cascade. */
export type ModelSource = "unit" | "hat" | "stage" | "studio" | "none"

export interface ResolvedModel {
	model: ModelTier | undefined
	source: ModelSource
}

/**
 * Resolve the model for a hat spawn via the cascade:
 *   unit > hat > stage > studio
 *
 * Each input is the raw value from its respective frontmatter — undefined
 * if not set. The first valid tier wins. Unknown/invalid values at any level
 * are treated as unset and fall through to the next level.
 */
export function resolveModel(inputs: {
	unit?: string
	hat?: string
	stage?: string
	studio?: string
}): ResolvedModel {
	const candidates: Array<[ModelSource, string | undefined]> = [
		["unit", inputs.unit],
		["hat", inputs.hat],
		["stage", inputs.stage],
		["studio", inputs.studio],
	]
	for (const [source, raw] of candidates) {
		const model = sanitizeModel(raw)
		if (model) return { model, source }
	}
	return { model: undefined, source: "none" }
}

/**
 * Escalate a model one tier up after a hat rejection.
 * Returns undefined if the current model is already at the top (opus) or
 * if the current value isn't a known tier.
 */
export function escalate(
	current: string | undefined | null,
): ModelTier | undefined {
	if (!isValidModel(current)) return undefined
	return ESCALATION[current]
}
