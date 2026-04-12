// git-worktree.ts — Git branch and worktree management for H·AI·K·U
//
// Intent isolation: each intent gets branch haiku/{slug}/main (continuous)
//                   or haiku/{slug}/{stage} per stage (discrete)
// Unit isolation: each unit gets a worktree off the parent branch
// All operations are non-fatal — git failures never crash the MCP.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { isGitRepo } from "./state-tools.js"

function run(args: string[], cwd?: string): string {
	return execFileSync(args[0], args.slice(1), {
		encoding: "utf8",
		stdio: "pipe",
		cwd,
	}).trim()
}

function tryRun(args: string[], cwd?: string): string {
	try {
		return run(args, cwd)
	} catch {
		return ""
	}
}

/** Get the current branch name */
export function getCurrentBranch(): string {
	return tryRun(["git", "rev-parse", "--abbrev-ref", "HEAD"])
}

/** Check if a branch exists (local) */
export function branchExists(branch: string): boolean {
	if (!isGitRepo()) return false
	return tryRun(["git", "rev-parse", "--verify", branch]) !== ""
}

/** Check if we're on the intent's main branch (continuous mode) */
export function isOnIntentBranch(slug: string): boolean {
	return getCurrentBranch() === `haiku/${slug}/main`
}

/** Check if we're on a stage branch for the intent (discrete mode) */
export function isOnStageBranch(slug: string, stage: string): boolean {
	return getCurrentBranch() === `haiku/${slug}/${stage}`
}

/** Checkout an existing branch or create it. Returns the branch name. */
function checkoutOrCreate(branch: string, baseBranch?: string): string {
	const exists = tryRun(["git", "rev-parse", "--verify", branch])
	if (exists) {
		if (getCurrentBranch() !== branch) {
			run(["git", "checkout", branch])
		}
	} else if (baseBranch) {
		// baseBranch must exist — let it throw if not so the caller knows
		run(["git", "checkout", baseBranch])
		run(["git", "checkout", "-b", branch])
	} else {
		try {
			run(["git", "checkout", "-b", branch])
		} catch {
			/* already on it or can't create */
		}
	}
	return branch
}

/**
 * Create the intent branch (continuous mode) and switch to it.
 * If branch already exists, just switch.
 * No-op in non-git environments.
 * Returns the branch name.
 */
export function createIntentBranch(slug: string): string {
	if (!isGitRepo()) return `haiku/${slug}/main`
	return checkoutOrCreate(`haiku/${slug}/main`)
}

/**
 * Create a stage branch (discrete mode) and switch to it.
 * Chains from the previous stage branch if provided, otherwise from current HEAD.
 * No-op in non-git environments.
 * Returns the branch name.
 */
export function createStageBranch(
	slug: string,
	stage: string,
	prevStage?: string,
): string {
	if (stage === "main")
		throw new Error(
			`Stage name 'main' is reserved — it would collide with the continuous-mode intent branch`,
		)
	if (!isGitRepo()) return `haiku/${slug}/${stage}`
	const baseBranch = prevStage ? `haiku/${slug}/${prevStage}` : undefined
	return checkoutOrCreate(`haiku/${slug}/${stage}`, baseBranch)
}

/**
 * Merge changes from one stage branch forward into the next stage branch.
 * Used after go-backs to propagate fixes into later stages.
 * Returns merge result.
 */
export function mergeStageBranchForward(
	slug: string,
	fromStage: string,
	toStage: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no git" }
	const fromBranch = `haiku/${slug}/${fromStage}`
	const toBranch = `haiku/${slug}/${toStage}`

	try {
		run(["git", "rev-parse", "--verify", fromBranch])
		run(["git", "rev-parse", "--verify", toBranch])

		run(["git", "checkout", toBranch])
		run([
			"git",
			"merge",
			fromBranch,
			"--no-edit",
			"-m",
			`haiku: merge forward ${fromStage} → ${toStage}`,
		])

		return { success: true, message: `merged ${fromBranch} → ${toBranch}` }
	} catch (err) {
		// Abort any in-progress merge to leave the repo clean
		tryRun(["git", "merge", "--abort"])
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Consolidate discrete stage branches into haiku/{slug}/main for hybrid mode.
 * Creates the main branch from the last stage branch.
 * Returns the main branch name.
 */
export function consolidateStageBranches(
	slug: string,
	stages: string[],
): { branch: string; success: boolean; message: string } {
	const mainBranch = `haiku/${slug}/main`
	if (!isGitRepo())
		return { branch: mainBranch, success: true, message: "no git" }
	if (stages.length === 0)
		return { branch: mainBranch, success: true, message: "no stages" }

	try {
		const lastStageBranch = `haiku/${slug}/${stages[stages.length - 1]}`
		run(["git", "rev-parse", "--verify", lastStageBranch])

		// If main already exists, check it out and merge the latest stage into it
		if (branchExists(mainBranch)) {
			checkoutOrCreate(mainBranch)
			run([
				"git",
				"merge",
				lastStageBranch,
				"--no-edit",
				"-m",
				"haiku: consolidate discrete stages into main",
			])
			return {
				branch: mainBranch,
				success: true,
				message: `merged ${lastStageBranch} into ${mainBranch}`,
			}
		}
		// Otherwise create main from the last stage branch
		return {
			branch: checkoutOrCreate(mainBranch, lastStageBranch),
			success: true,
			message: `created ${mainBranch} from ${lastStageBranch}`,
		}
	} catch (err) {
		// Abort any in-progress merge to leave the repo clean
		tryRun(["git", "merge", "--abort"])
		return {
			branch: mainBranch,
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Read a file from a specific branch ref without checking it out.
 * Returns file contents or null if not found.
 */
export function readFileFromBranch(
	branch: string,
	filePath: string,
): string | null {
	if (!isGitRepo()) return null
	try {
		return run(["git", "show", `${branch}:${filePath}`])
	} catch {
		return null
	}
}

/**
 * Create a worktree for a unit, branched from the parent branch.
 * In continuous mode, parent is haiku/{slug}/main.
 * In discrete mode, parent is haiku/{slug}/{stage}.
 * Returns the absolute worktree path, or null if not in a git repo or creation failed.
 */
export function createUnitWorktree(
	slug: string,
	unit: string,
	stage?: string,
): string | null {
	if (!isGitRepo()) return null // Units work in-place in filesystem mode
	const parentBranch = stage ? `haiku/${slug}/${stage}` : `haiku/${slug}/main`
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)
	const worktreePath = join(worktreeBase, unit)

	try {
		if (existsSync(worktreePath)) {
			return worktreePath
		}

		mkdirSync(worktreeBase, { recursive: true })
		tryRun(["git", "branch", unitBranch, parentBranch])
		run(["git", "worktree", "add", worktreePath, unitBranch])

		return worktreePath
	} catch {
		return null
	}
}

/**
 * Merge a unit's worktree back to the parent branch and clean up.
 * In continuous mode, parent is haiku/{slug}/main.
 * In discrete mode, parent is haiku/{slug}/{stage}.
 * No-op in non-git environments.
 * Returns merge result.
 */
export function mergeUnitWorktree(
	slug: string,
	unit: string,
	stage?: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no worktree" }
	const parentBranch = stage ? `haiku/${slug}/${stage}` : `haiku/${slug}/main`
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreePath = join(process.cwd(), ".haiku", "worktrees", slug, unit)

	try {
		if (!existsSync(worktreePath)) {
			return { success: true, message: "no worktree" }
		}

		tryRun(["git", "-C", worktreePath, "add", "-A"])
		tryRun([
			"git",
			"-C",
			worktreePath,
			"commit",
			"-m",
			`haiku: complete ${unit}`,
			"--allow-empty",
		])

		if (getCurrentBranch() !== parentBranch) {
			run(["git", "checkout", parentBranch])
		}

		run(["git", "merge", unitBranch, "--no-edit", "-m", `haiku: merge ${unit}`])

		let pushFailed = ""
		try {
			run(["git", "push"])
		} catch (pushErr) {
			pushFailed = pushErr instanceof Error ? pushErr.message : String(pushErr)
		}

		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		tryRun(["git", "branch", "-d", unitBranch])

		if (pushFailed) {
			return {
				success: true,
				message: `merged ${unitBranch} (⚠️ push failed: ${pushFailed}. Run git pull --rebase && git push to sync.)`,
			}
		}
		return { success: true, message: `merged ${unitBranch}` }
	} catch (err) {
		// Abort any in-progress merge to leave the repo clean
		tryRun(["git", "merge", "--abort"])
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Clean up all worktrees for an intent.
 */
export function cleanupIntentWorktrees(slug: string): void {
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)
	try {
		rmSync(worktreeBase, { recursive: true, force: true })
	} catch {
		/* non-fatal */
	}
	tryRun(["git", "worktree", "prune"])
}
