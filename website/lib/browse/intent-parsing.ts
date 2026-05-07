/**
 * Shared parsing helpers consumed by both `gitlab-provider.ts` and
 * `github-provider.ts`. Each VCS provider exposes its own API surface
 * for fetching content, but once content is in hand the parsing rules
 * are identical — single source of truth lives here so the two
 * providers can't drift on what an "intent" or "stage" looks like.
 */

import type { HaikuArtifact, HaikuIntent, HaikuKnowledgeFile } from "./types"
import { normalizeIntentStatus, parseFrontmatter } from "./types"

/** Map a filename to the artifact-type the SPA renders. */
export function classifyArtifact(name: string): HaikuArtifact["type"] {
	const lower = name.toLowerCase()
	if (lower.endsWith(".md")) return "markdown"
	if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html"
	if (/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/.test(lower)) return "image"
	return "other"
}

/** Parsed `state.json` slice the providers attach to each stage. */
export interface StageStateJson {
	phase: string
	startedAt: string | null
	completedAt: string | null
	gateOutcome: string | null
	/** Raw `status` field from state.json — authoritative source for stage
	 *  status when present (written by the orchestrator on the stage branch).
	 *  Providers prefer this over the `active_stage` field in intent.md,
	 *  which may lag for the first stage or when the intent branch hasn't
	 *  been updated yet. */
	stateStatus: "active" | "completed" | null
}

export const EMPTY_STAGE_STATE: StageStateJson = {
	phase: "",
	startedAt: null,
	completedAt: null,
	gateOutcome: null,
	stateStatus: null,
}

/** Decode a stage's `state.json` text. Returns the empty default when
 *  the JSON is missing or malformed — the caller still renders the
 *  stage, just without status detail. */
export function parseStageStateJson(
	rawJson: string | null | undefined,
): StageStateJson {
	if (!rawJson) return EMPTY_STAGE_STATE
	try {
		const s = JSON.parse(rawJson) as Record<string, unknown>
		const rawStatus = typeof s.status === "string" ? s.status : null
		const stateStatus: "active" | "completed" | null =
			rawStatus === "active"
				? "active"
				: rawStatus === "completed"
					? "completed"
					: null
		return {
			phase: typeof s.phase === "string" ? s.phase : "",
			startedAt: typeof s.started_at === "string" ? s.started_at : null,
			completedAt: typeof s.completed_at === "string" ? s.completed_at : null,
			gateOutcome: typeof s.gate_outcome === "string" ? s.gate_outcome : null,
			stateStatus,
		}
	} catch {
		return EMPTY_STAGE_STATE
	}
}

/** Merge knowledge files — overlay wins on filename collision, new
 *  files are added. Used to layer per-branch knowledge on top of
 *  default-branch knowledge. */
export function mergeKnowledge(
	base: HaikuKnowledgeFile[],
	overlay: HaikuKnowledgeFile[],
): HaikuKnowledgeFile[] {
	const byName = new Map<string, HaikuKnowledgeFile>()
	for (const f of base) byName.set(f.name, f)
	for (const f of overlay) byName.set(f.name, f)
	return Array.from(byName.values())
}

/** Optional branch / PR metadata attached when an intent was loaded
 *  from a haiku/<slug>/main branch (or a PR/MR linked to it). */
export interface IntentRefMeta {
	branch?: string
	prUrl?: string | null
	prStatus?: string | null
	prNumber?: number | null
}

/**
 * Detect whether the intent was written under the v4 schema.
 *
 * v4 stamps `plugin_version: "4.x.y"` on intent.md. Pre-v4 (the
 * "v3" schema in the migrator's terminology) has no plugin_version
 * field. The detection is used to swap parsing strategy without
 * breaking pre-migration data: v3 reads `active_stage` / `status` /
 * `phase` directly, v4 derives the same logical values from
 * `sealed_at` and (eventually) per-unit iterations[].
 */
function isV4Intent(data: Record<string, unknown>): boolean {
	const ver = data.plugin_version
	if (typeof ver !== "string") return false
	const major = Number.parseInt(ver.split(".")[0] ?? "", 10)
	return Number.isFinite(major) && major >= 4
}

/** Parse raw `intent.md` text into a `HaikuIntent`. Identical between
 *  GitLab + GitHub; the only provider-specific input is the string
 *  passed to `parseFrontmatter`'s `provider` arg (used for telemetry
 *  on malformed-frontmatter recovery). Malformed frontmatter recovers
 *  to empty data so a broken intent still appears in the list (title
 *  falls back to slug) instead of silently disappearing. */
export function parseIntentFromRaw(
	provider: "gitlab" | "github" | "local",
	slug: string,
	rawText: string,
	meta?: IntentRefMeta,
): HaikuIntent {
	const { data, content } = parseFrontmatter(rawText, {
		provider,
		path: `.haiku/intents/${slug}/intent.md`,
		slug,
		branch: meta?.branch,
	})
	const studio = (data.studio as string) || "ideation"
	const stages = (data.stages as string[]) || []

	// v4 dual-path:
	//   - active_stage was removed → without per-unit iterations[]
	//     visibility from the intent-list call, default to the first
	//     declared stage. Per-stage status drilldown still happens via
	//     deriveStageStatusFromUnits() during the detail load.
	//   - intent status: sealed_at → completed; else active.
	//   - completed_at proxy: sealed_at when present.
	//   - composite: removed entirely under v4 (intents are flat).
	const v4 = isV4Intent(data)
	const activeStage = v4
		? // v4: no stored active_stage; the detail loader will refine
			// the cursor position per-stage. List view defaults to first
			// declared stage so the chrome doesn't render blank.
			(stages[0] as string) || ""
		: (data.active_stage as string) || ""
	const sealedAt = v4 ? ((data.sealed_at as string) || null) : null
	const v3Status = (data.status as string) || ""
	const computedStatus = v4
		? sealedAt
			? "completed"
			: "active"
		: v3Status || "active"
	const completedAtForStatus = v4 ? sealedAt : (data.completed_at as string) || null
	const composite = v4
		? null
		: (data.composite as Array<{ studio: string; stages: string[] }>) || null

	return {
		slug,
		title: (data.title as string) || slug,
		studio,
		activeStage,
		mode: (data.mode as string) || "continuous",
		createdAt: (data.created_at as string) || (data.created as string) || null,
		startedAt: (data.started_at as string) || null,
		completedAt: completedAtForStatus,
		studioStages: (data.stages as string[]) || [],
		composite,
		...normalizeIntentStatus(
			computedStatus,
			completedAtForStatus,
			stages.length > 0 ? stages.indexOf(activeStage) : 0,
			stages.length,
		),
		stagesTotal: stages.length,
		archived: data.archived === true,
		follows: (data.follows as string) || null,
		content,
		raw: data,
		branch: meta?.branch,
		prUrl: meta?.prUrl ?? null,
		prStatus: meta?.prStatus ?? null,
		prNumber: meta?.prNumber ?? null,
	}
}

/**
 * Refine the v4 active stage by walking stages in declaration order
 * and returning the first stage whose unit set isn't fully complete.
 * If all stages are complete, returns the last declared stage (the
 * intent is awaiting seal). Falls back to stages[0] when no per-stage
 * derivation is possible.
 *
 * Mirrors the SPA's `resolveActiveStage` derivation. The list view
 * (which doesn't load units) can't call this; the detail view does.
 */
export function deriveV4ActiveStage(
	stages: ReadonlyArray<string>,
	stageStatusByName: Record<string, "pending" | "active" | "complete">,
): string {
	if (stages.length === 0) return ""
	for (const s of stages) {
		const status = stageStatusByName[s]
		if (status !== "complete") return s
	}
	// Every stage is "complete" — the cursor will seal next. Surface
	// the last declared stage so the chrome doesn't render blank.
	return stages[stages.length - 1] ?? ""
}

/**
 * Derive a stage's "v3-style" status from its unit list. v4 stages no
 * longer have a state.json; the providers walk the per-unit FMs and
 * fold them into a single status string the existing UI knows how to
 * paint.
 *
 *   - "complete"  — every unit has a terminal-advance iteration AND a
 *                   user approval signed (the cursor's completion sig)
 *   - "active"    — at least one unit has started but not all complete
 *   - "pending"   — no units, or every unit has empty iterations[]
 *
 * Pure function so the providers can call it after loading units.
 */
export function deriveStageStatusFromUnits(
	units: ReadonlyArray<{ raw: Record<string, unknown> }>,
): "pending" | "active" | "complete" {
	if (units.length === 0) return "pending"
	let anyStarted = false
	let allComplete = true
	for (const u of units) {
		const fm = u.raw
		const iterations = fm.iterations
		const hasAnyIteration = Array.isArray(iterations) && iterations.length > 0
		const lastIter = hasAnyIteration
			? (iterations as Array<{ result?: string }>)[iterations.length - 1]
			: undefined
		const lastIsAdvance = lastIter?.result === "advance"
		const approvals =
			fm.approvals && typeof fm.approvals === "object"
				? (fm.approvals as Record<string, unknown>)
				: {}
		const userApproved = approvals.user != null
		if (hasAnyIteration) anyStarted = true
		if (!(lastIsAdvance && userApproved)) allComplete = false
	}
	if (allComplete) return "complete"
	if (anyStarted) return "active"
	return "pending"
}
