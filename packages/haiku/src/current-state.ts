// current-state.ts — Unified current-state resolver.
//
// Single source of truth for "where is this intent right now?". Every
// consumer (orchestrator pre-tick, HTTP API, browse SPA via the API)
// reads through this function so the displayed stage and the workflow
// engine can never disagree.
//
// Resolution rule (matches preTickConsistency#syncActiveStageFromStateJson):
//   - Walk the studio-declared stage list in order
//   - First stage whose state.json is NOT done is the current stage
//   - "Done" means:
//       status === "completed" AND
//       gate_outcome !== "blocked" (legacy shape; pre-merge gate state
//         under the old per-stage external flow) AND
//       (no git OR the stage branch is merged into intent main)
//     The merge requirement is the user's "raw git+fs" contract: a
//     stage is fully done only when its branch has landed in intent
//     main. Pre-merge, a completed+advanced stage stays current so
//     active_stage doesn't auto-bump and the next stage doesn't start
//     from a base that's missing the prior stage's work. The merge IS
//     the user's "yes, this stage is approved" signal.
//   - If every stage is done, the last stage is current (intent
//     awaiting completion review or fully complete)
//
// intent.md.active_stage is intentionally not read here. It is a
// write-only cache that pre-tick keeps in sync with this derivation
// for legacy shell tooling. Reading it would re-introduce the
// divergence this function exists to eliminate.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { branchExists, isBranchMerged } from "./git-worktree.js"
import {
	resolveIntentStages,
	resolveStudioStages,
} from "./orchestrator/studio.js"
import { deriveStageState } from "./orchestrator/workflow/derived-stage-state.js"
import { isGitRepo } from "./state/shared.js"
import { intentDir, parseFrontmatter } from "./state-tools.js"
import type { IntentCurrentState, IntentPhase } from "./types.js"

const VALID_PHASES = new Set<IntentPhase>([
	"elaborate",
	"execute",
	"review",
	"gate",
])

function resolveIntentDir(slug: string, root?: string): string {
	return root ? join(root, "intents", slug) : intentDir(slug)
}

function readIntentFm(
	slug: string,
	root?: string,
): Record<string, unknown> | null {
	const intentFile = join(resolveIntentDir(slug, root), "intent.md")
	if (!existsSync(intentFile)) return null
	const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
	return data
}

// readStageState removed (v4): per-stage state is derived from
// per-unit FM + branch-merge state via `deriveStageState`. The
// state.json file is migrator-deleted and the engine no longer
// recreates it.

/** Resolve the current state of an intent from per-stage derived state
 *  (v4: per-unit FM + branch-merge state via `deriveStageState`).
 *  Returns null when the intent does not exist or has no studio set
 *  (callers can treat this as "intent not found").
 *
 *  `root` is an optional override used by the test fixture machinery —
 *  production callers omit it and the function reads from the project's
 *  default `.haiku/` location via intentDir(). */
export function getCurrentState(
	slug: string,
	root?: string,
): IntentCurrentState | null {
	const intent = readIntentFm(slug, root)
	if (!intent) return null
	const studio = (intent.studio as string) || ""
	if (!studio) return null
	// Composite intents have their own per-studio state machinery in
	// runNextComposite — this resolver doesn't model that shape. Mirror the
	// pre-tick guard (orchestrator/workflow/pre-tick.ts) and bail out so
	// the API doesn't return a stage from a single-studio walk that
	// doesn't apply.
	if (intent.composite) return null

	const stages = resolveIntentStages(intent, studio)
	const fallbackStages =
		stages.length > 0 ? stages : resolveStudioStages(studio)
	if (fallbackStages.length === 0) {
		return { studio, stage: "", phase: "" }
	}

	let current = fallbackStages[fallbackStages.length - 1]
	const gitAvailable = isGitRepo()
	const intentMainBranch = `haiku/${slug}/main`
	const intentMainExists = gitAvailable && branchExists(intentMainBranch)
	const intentMode =
		typeof intent.mode === "string" && (intent.mode as string).length > 0
			? (intent.mode as string)
			: "continuous"
	for (const stage of fallbackStages) {
		const derived = deriveStageState({
			slug,
			studio,
			stage,
			intentDir: resolveIntentDir(slug, root),
			intentMode,
		})
		const status = derived.status
		// v4 derivation never returns "blocked" — that was a v3
		// state.json shape. Treat completed as done outright.
		const stateLooksDone = status === "completed"
		// Merge gate: in git mode (with both stage branch and intent
		// main present), a completed+advanced stage stays "current"
		// until its branch has landed in intent main. The merge is the
		// user's approval signal — pre-merge, the next stage shouldn't
		// start from a base that's missing this stage's work.
		//
		// Fall back to state.json's verdict when:
		//   - we're not in a git repo (filesystem-only intents), or
		//   - intent main branch doesn't exist yet (early-lifecycle
		//     intents before branching, test fixtures with fake slugs),
		//   - the stage branch doesn't exist (similarly applies).
		// In all those cases there's no merge concept to gate on.
		const stageBranch = `haiku/${slug}/${stage}`
		const canCheckMerge =
			intentMainExists && gitAvailable && branchExists(stageBranch)
		const isDone =
			stateLooksDone &&
			(!canCheckMerge || isBranchMerged(stageBranch, intentMainBranch))
		if (!isDone) {
			current = stage
			break
		}
	}

	const derivedCurrent = deriveStageState({
		slug,
		studio,
		stage: current,
		intentDir: resolveIntentDir(slug, root),
		intentMode,
	})
	const rawPhase = derivedCurrent.phase ?? ""
	const phase: IntentPhase | "" = VALID_PHASES.has(rawPhase as IntentPhase)
		? (rawPhase as IntentPhase)
		: ""

	return {
		studio,
		stage: current,
		phase,
	}
}
