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
import type {
	DerivedGateOutcome,
	DerivedStagePhase,
	DerivedStageState,
	DerivedStageStatus,
	DerivedUnitView,
} from "@haiku/shared/derived-stage-state"
import { deriveStageStatePure } from "@haiku/shared/derived-stage-state"
import matter from "gray-matter"
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

/** Walk a parsed FM object and convert every Date value (top-level or
 *  nested in arrays/objects) to an ISO-8601 string. Raw `gray-matter`
 *  parses YAML 1.1 unquoted timestamps as JS `Date` objects; the pure
 *  derivation in `@haiku/shared` will accept either via `coerceTimestamp`,
 *  but normalizing at the boundary keeps the comparisons in
 *  `deriveCompletedAt` (`at > latest`) lexical-string operations.
 *
 *  Related but NOT a substitute: `state/shared.ts:normalizeDates` is
 *  shallow (top-level keys only) AND date-only
 *  (`toISOString().split("T")[0]` → `"2026-05-09"`). This version is
 *  recursive (descends into `iterations[].completed_at`,
 *  `reviews.<role>.at`, `approvals.<role>.at`, etc.) AND preserves the
 *  full ISO-8601 string. Don't replace one with the other — they solve
 *  different problems. */
function normalizeDates(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) return value.map(normalizeDates)
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = normalizeDates(v)
		}
		return out
	}
	return value
}

function parseFm(raw: string): Record<string, unknown> | null {
	try {
		const data = matter(raw).data as Record<string, unknown>
		return normalizeDates(data) as Record<string, unknown>
	} catch {
		return null
	}
}

function readFmFromDisk(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null
	try {
		return parseFm(readFileSync(path, "utf8"))
	} catch {
		return null
	}
}

function listUnitsFromDisk(stageDir: string): DerivedUnitView[] {
	const dir = join(stageDir, "units")
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((e) => {
			const fm = readFmFromDisk(join(dir, e.name)) ?? {}
			return { name: basename(e.name, ".md"), fm }
		})
}

/** Read a file's contents from a specific git ref without touching
 *  the working tree. Returns null when the path doesn't exist on
 *  that ref or git fails. */
function readFromGitRef(ref: string, path: string): string | null {
	if (!isGitRepo()) return null
	try {
		return execFileSync("git", ["show", `${ref}:${path}`], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch {
		return null
	}
}

/** Parse FM from a path on a specific git ref. Lets `derivePhase`
 *  read `elaboration.md` from the stage branch even when the working
 *  tree is parked on intent main. */
function readFmFromGitRef(
	ref: string,
	path: string,
): Record<string, unknown> | null {
	const raw = readFromGitRef(ref, path)
	if (raw == null) return null
	return parseFm(raw)
}

/** List `*.md` filenames in a directory on a specific git ref. */
function listMdFilesFromGitRef(ref: string, dirPath: string): string[] {
	if (!isGitRepo()) return []
	try {
		const output = execFileSync(
			"git",
			["ls-tree", "--name-only", `${ref}:${dirPath}`],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		)
		return output
			.split("\n")
			.map((s) => s.trim())
			.filter((s) => s.endsWith(".md"))
			.sort((a, b) => a.localeCompare(b))
	} catch {
		return []
	}
}

/** List units from a specific git ref. Used in git mode so unit
 *  loading is checkout-independent — when the working tree is on
 *  intent main, the stage branch's in-flight units would otherwise
 *  be invisible and `derivePhase` would falsely report `elaborate`.
 *  Returns `[]` when the units directory is missing or empty on
 *  the ref. The disk fallback for fs-mode lives in `deriveStageState`
 *  (when `refForPhase` is null), not here. */
function listUnitsFromGitRef(
	ref: string,
	slug: string,
	stage: string,
): DerivedUnitView[] {
	const dirPath = `.haiku/intents/${slug}/stages/${stage}/units`
	const filenames = listMdFilesFromGitRef(ref, dirPath)
	if (filenames.length === 0) return []
	return filenames.map((filename) => {
		const fm = readFmFromGitRef(ref, `${dirPath}/${filename}`) ?? {}
		return { name: basename(filename, ".md"), fm }
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
		// `git rev-parse --verify <ref>` exits 0 with empty stdout on
		// some platforms when the underlying repo can't actually
		// resolve the ref but git fails silently — we treat empty
		// output as "branch missing" to avoid `intentMainHasStageUnits`
		// returning false for refs that branchHeadExists falsely
		// reported true on.
		const out = execFileSync("git", ["rev-parse", "--verify", branch], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim()
		return out.length > 0
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
	const hats = resolveStageHats(studio, stage)
	const reviewRoles = reviewRolesFor(studio, stage, intentMode)
	const approvalRoles = approvalRolesFor(studio, stage, intentMode)

	// Determine whether we can use git-ref reads (checkout-independent).
	// Prefer the stage branch when it exists — that's where the
	// in-flight unit work lives. When the stage branch doesn't exist
	// yet, fall back to disk reads (which on intent main return the
	// already-merged units, exactly what `firstUnmergedStage`
	// observes).
	const intentMain = `haiku/${slug}/main`
	const stageBranch = `haiku/${slug}/${stage}`
	const inGit = isGitRepo()
	const intentMainExists = inGit && branchHeadExists(intentMain)
	const stageBranchExists = inGit && branchHeadExists(stageBranch)
	const refForPhase = stageBranchExists
		? stageBranch
		: intentMainExists
			? intentMain
			: null

	// Unit loading. In git mode, read from the canonical ref so the
	// working-tree checkout doesn't change the answer. In fs mode,
	// fall back to the working tree (it IS the canonical view).
	const units = refForPhase
		? listUnitsFromGitRef(refForPhase, slug, stage)
		: listUnitsFromDisk(stageDir)

	// Branch-merge signal. Tri-state from the pure function's POV:
	//   - true  → intent main has the stage's units → "completed"
	//   - false → branch exists but not merged → "active" if units
	//   - null  → fs mode (no branch signal); pure falls back to
	//             per-unit completion derivation
	const stageMergedIntoMain = intentMainExists
		? intentMainHasStageUnits(slug, stage)
		: null

	// Elaboration-verified signal. Tri-state:
	//   - true  → artifact exists AND verified_at stamped
	//   - false → artifact exists but unverified → phase is "elaborate"
	//   - null  → artifact missing → grandfather (cursor.ts:684-700)
	const elabPathOnDisk = join(stageDir, "elaboration.md")
	const elabPathOnRef = `.haiku/intents/${slug}/stages/${stage}/elaboration.md`
	const elabFm = refForPhase
		? readFmFromGitRef(refForPhase, elabPathOnRef)
		: readFmFromDisk(elabPathOnDisk)
	let elaborationVerified: boolean | null = null
	if (elabFm !== null) {
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
