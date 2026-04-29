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

/** Parse raw `intent.md` text into a `HaikuIntent`. Identical between
 *  GitLab + GitHub; the only provider-specific input is the string
 *  passed to `parseFrontmatter`'s `provider` arg (used for telemetry
 *  on malformed-frontmatter recovery). Malformed frontmatter recovers
 *  to empty data so a broken intent still appears in the list (title
 *  falls back to slug) instead of silently disappearing. */
export function parseIntentFromRaw(
	provider: "gitlab" | "github",
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

	return {
		slug,
		title: (data.title as string) || slug,
		studio,
		activeStage: (data.active_stage as string) || "",
		mode: (data.mode as string) || "continuous",
		createdAt: (data.created_at as string) || (data.created as string) || null,
		startedAt: (data.started_at as string) || null,
		completedAt: (data.completed_at as string) || null,
		studioStages: (data.stages as string[]) || [],
		composite:
			(data.composite as Array<{ studio: string; stages: string[] }>) || null,
		...normalizeIntentStatus(
			(data.status as string) || "active",
			(data.completed_at as string) || null,
			stages.length > 0 ? stages.indexOf(data.active_stage as string) : 0,
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
