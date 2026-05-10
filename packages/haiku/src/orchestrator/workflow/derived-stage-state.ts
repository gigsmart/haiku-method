// orchestrator/workflow/derived-stage-state.ts — Engine-side wrapper
// for the v4 stage-state derivation. Reads disk + git, then delegates
// the actual decision to the pure function in `@haiku/shared` so the
// website browse UI computes the same answer from the same inputs.
//
// Why a wrapper: the pure function takes already-loaded data —
// `units[]`, `hats[]`, `reviewRoles[]`, `approvalRoles[]`,
// `stageMergedIntoMain`, `elaborationVerified`. The engine fetches
// those from local disk + git (`isBranchMerged`, `git ls-tree`,
// `readFm`, etc.); the website fetches the same shapes from the VCS
// API (`gitlab-provider.ts`, `github-provider.ts`). Both call
// `deriveStageStatePure` to get a `DerivedStageState`.
//
// The on-disk per-stage `state.json` is dead in v4. The migrator
// deletes it on first read and the engine no longer recreates it —
// see `side-effects.ts` for the four functions that used to write it.

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import matter from "gray-matter"
import { deriveStageStatePure } from "@haiku/shared/derived-stage-state"
import type {
	DerivedGateOutcome,
	DerivedStagePhase,
	DerivedStageState,
	DerivedStageStatus,
	DerivedUnitView,
} from "@haiku/shared/derived-stage-state"
import { isGitRepo } from "../../state/shared.js"
import { readReviewAgentPaths } from "../../studio-reader.js"
import { resolveStageHats } from "../studio.js"

// Re-export the shared types so call sites already importing from
// here keep working. The pure function lives in @haiku/shared.
export type {
	DerivedGateOutcome,
	DerivedStagePhase,
	DerivedStageState,
	DerivedStageStatus,
}

function readFm(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, "utf8")
		return matter(raw).data as Record<string, unknown>
	} catch {
		return null
	}
}

function listUnits(stageDir: string): DerivedUnitView[] {
	const dir = join(stageDir, "units")
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((e) => {
			const fm = readFm(join(dir, e.name)) ?? {}
			return { name: basename(e.name, ".md"), fm }
		})
}

/** Reviewer roles for a stage. Mirrors `walkIntentTrack` in cursor.ts.
 *  Autopilot trims to the engine-built minimum (no agents, no user
 *  gate); other modes get the full chain. */
function reviewRolesFor(
	studio: string,
	stage: string,
	intentMode: string,
): string[] {
	if (intentMode === "autopilot") return ["spec"]
	const reviewAgents = Object.keys(readReviewAgentPaths(studio, stage)).sort()
	return ["spec", ...reviewAgents, "user"]
}

/** Approval roles for a stage. Differs from review roles by the
 *  inclusion of `quality_gates` (engine-run, not subagent-dispatched).
 *  Mirrors `walkIntentTrack` in cursor.ts. */
function approvalRolesFor(
	studio: string,
	stage: string,
	intentMode: string,
): string[] {
	if (intentMode === "autopilot") return ["spec", "quality_gates"]
	const reviewAgents = Object.keys(readReviewAgentPaths(studio, stage)).sort()
	return ["spec", "quality_gates", ...reviewAgents, "user"]
}

/** Does intent main's tree carry `stages/<stage>/units/*.md`?
 *  Mirrors `firstUnmergedStage` in cursor.ts — intent main's filesystem
 *  IS the canonical "stage's work has merged" signal. We can't use raw
 *  `isBranchMerged(stageBranch, intentMain)` because a freshly-forked
 *  stage branch shares its tip with intent main and would falsely report
 *  "merged" before any work landed. Querying intent main's tree
 *  directly via `git ls-tree` is checkout-independent — works whether
 *  the working tree is on intent main, on the stage branch, or on a
 *  unit worktree. */
function intentMainHasStageUnits(slug: string, stage: string): boolean {
	if (!isGitRepo()) return false
	const intentMain = `haiku/${slug}/main`
	const path = `.haiku/intents/${slug}/stages/${stage}/units`
	try {
		const output = execFileSync(
			"git",
			["ls-tree", "--name-only", `${intentMain}:${path}`],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		)
		return output.split("\n").some((f) => f.trim().endsWith(".md"))
	} catch {
		// Path doesn't exist on intent main, or branch missing — both
		// mean "stage hasn't merged yet."
		return false
	}
}

/** Does the named branch resolve to a real commit? Used to gate the
 *  git-mode status derivation: when there's no `haiku/<slug>/main`
 *  branch, the test fixture is fs-shaped even if the working dir is
 *  inside a git repo. */
function branchHeadExists(branch: string): boolean {
	if (!isGitRepo()) return false
	try {
		execFileSync("git", ["rev-parse", "--verify", branch], {
			stdio: ["ignore", "pipe", "pipe"],
		})
		return true
	} catch {
		return false
	}
}

/** Compute the v4 stage state from per-unit FM + branch-merge state.
 *  Wrapper around `deriveStageStatePure` that gathers the engine's
 *  inputs from disk + git. Call this from any engine site that used
 *  to read state.json; pass the result through where the v3 record
 *  shape is expected. */
export function deriveStageState(args: {
	slug: string
	studio: string
	stage: string
	intentDir: string
	intentMode: string
}): DerivedStageState {
	const { slug, studio, stage, intentDir, intentMode } = args
	const stageDir = join(intentDir, "stages", stage)
	const units = listUnits(stageDir)
	const hats = resolveStageHats(studio, stage)
	const reviewRoles = reviewRolesFor(studio, stage, intentMode)
	const approvalRoles = approvalRolesFor(studio, stage, intentMode)

	// Branch-merge signal. Tri-state from the pure function's POV:
	//   - true  → intent main has the stage's units → "completed"
	//   - false → branch exists but not merged → "active" if units
	//   - null  → fs mode (no branch signal); pure falls back to
	//             per-unit completion derivation
	const intentMain = `haiku/${slug}/main`
	const stageMergedIntoMain =
		isGitRepo() && branchHeadExists(intentMain)
			? intentMainHasStageUnits(slug, stage)
			: null

	// Elaboration-verified signal. Tri-state:
	//   - true  → artifact exists AND verified_at stamped
	//   - false → artifact exists but unverified → phase is "elaborate"
	//   - null  → artifact missing → grandfather (cursor.ts:684-700)
	const elabPath = join(stageDir, "elaboration.md")
	let elaborationVerified: boolean | null = null
	if (existsSync(elabPath)) {
		const elabFm = readFm(elabPath) ?? {}
		const verifiedAt =
			typeof elabFm.verified_at === "string" ? elabFm.verified_at : ""
		elaborationVerified = verifiedAt.length > 0
	}

	return deriveStageStatePure({
		stage,
		units,
		intentMode,
		hats,
		reviewRoles,
		approvalRoles,
		stageMergedIntoMain,
		elaborationVerified,
	})
}
