// git-worktree.ts — Git branch and worktree management for H·AI·K·U
//
// Intent isolation: each intent gets branch haiku/{slug}/main
// Unit isolation: each unit gets a worktree off the intent branch
// All operations are non-fatal — git failures never crash the MCP.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { isGitRepo } from "./state-tools.js"

function run(args: string[], cwd?: string): string {
	return execFileSync(args[0], args.slice(1), { encoding: "utf8", stdio: "pipe", cwd }).trim()
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

/** Check if we're on the intent's branch */
export function isOnIntentBranch(slug: string): boolean {
	return getCurrentBranch() === `haiku/${slug}/main`
}

/**
 * Create the intent branch and switch to it.
 * If branch already exists, just switch.
 * No-op in non-git environments.
 * Returns the branch name.
 */
export function createIntentBranch(slug: string): string {
	if (!isGitRepo()) return `haiku/${slug}/main`
	const branch = `haiku/${slug}/main`
	try {
		// Check if branch exists
		tryRun(["git", "rev-parse", "--verify", branch])
		if (getCurrentBranch() !== branch) {
			run(["git", "checkout", branch])
		}
	} catch {
		try {
			run(["git", "checkout", "-b", branch])
		} catch { /* already on it or can't create */ }
	}
	return branch
}

/**
 * Create a worktree for a unit, branched from the intent branch.
 * Returns the absolute worktree path, or null if not in a git repo or creation failed.
 */
export function createUnitWorktree(slug: string, unit: string): string | null {
	if (!isGitRepo()) return null // Units work in-place in filesystem mode
	const intentBranch = `haiku/${slug}/main`
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)
	const worktreePath = join(worktreeBase, unit)

	try {
		if (existsSync(worktreePath)) {
			// Worktree already exists — return it
			return worktreePath
		}

		mkdirSync(worktreeBase, { recursive: true })

		// Create unit branch from intent branch
		tryRun(["git", "branch", unitBranch, intentBranch])

		// Create worktree
		run(["git", "worktree", "add", worktreePath, unitBranch])

		return worktreePath
	} catch {
		return null
	}
}

/**
 * Merge a unit's worktree back to the intent branch and clean up.
 * No-op in non-git environments.
 * Returns merge result.
 */
export function mergeUnitWorktree(slug: string, unit: string): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no worktree" }
	const intentBranch = `haiku/${slug}/main`
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreePath = join(process.cwd(), ".haiku", "worktrees", slug, unit)

	try {
		if (!existsSync(worktreePath)) {
			// No worktree — unit was working in the main tree, nothing to merge
			return { success: true, message: "no worktree" }
		}

		// Commit any uncommitted changes in the worktree
		tryRun(["git", "-C", worktreePath, "add", "-A"])
		tryRun(["git", "-C", worktreePath, "commit", "-m", `haiku: complete ${unit}`, "--allow-empty"])

		// Make sure we're on the intent branch
		if (getCurrentBranch() !== intentBranch) {
			run(["git", "checkout", intentBranch])
		}

		// Merge the unit branch
		run(["git", "merge", unitBranch, "--no-edit", "-m", `haiku: merge ${unit}`])

		// Push intent branch to keep remote in sync
		let pushFailed = ""
		try {
			run(["git", "push"])
		} catch (pushErr) {
			pushFailed = pushErr instanceof Error ? pushErr.message : String(pushErr)
		}

		// Clean up worktree and branch
		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		tryRun(["git", "branch", "-d", unitBranch])

		if (pushFailed) {
			return { success: true, message: `merged ${unitBranch} (⚠️ push failed: ${pushFailed}. Run git pull --rebase && git push to sync.)` }
		}
		return { success: true, message: `merged ${unitBranch}` }
	} catch (err) {
		return { success: false, message: err instanceof Error ? err.message : String(err) }
	}
}

/**
 * Clean up all worktrees for an intent.
 */
export function cleanupIntentWorktrees(slug: string): void {
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)
	try { rmSync(worktreeBase, { recursive: true, force: true }) } catch { /* non-fatal */ }
	tryRun(["git", "worktree", "prune"])
}

