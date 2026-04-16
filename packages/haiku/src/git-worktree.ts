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

/** Detect the mainline branch.
 *  Order of resolution:
 *    1. `origin/HEAD` symbolic ref — the remote's actual default branch (handles `dev`, `trunk`, etc.)
 *    2. `main`, `master` as local or remote refs
 *    3. `git config init.defaultBranch`
 *    4. `"main"` as a last-resort string (also used in non-git environments).
 */
export function getMainlineBranch(): string {
	if (!isGitRepo()) return "main"
	const originHead = tryRun([
		"git",
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	])
	if (originHead) {
		const m = originHead.match(/^origin\/(.+)$/)
		if (m) return m[1]
	}
	for (const candidate of ["main", "master"]) {
		if (tryRun(["git", "rev-parse", "--verify", candidate])) return candidate
		if (tryRun(["git", "rev-parse", "--verify", `origin/${candidate}`]))
			return candidate
	}
	const configured = tryRun(["git", "config", "--get", "init.defaultBranch"])
	return configured || "main"
}

/** Fetch from origin so subsequent ref lookups and worktree creations see the
 *  current remote state. Non-fatal — returns false on failure (offline, no remote). */
export function fetchOrigin(): boolean {
	if (!isGitRepo()) return false
	try {
		execFileSync("git", ["fetch", "--prune", "origin"], { stdio: "pipe" })
		return true
	} catch {
		return false
	}
}

/** List all H·AI·K·U intent branches (`haiku/<slug>/main`) — local + remote, deduped.
 *  Returns intent slugs in stable sort order. */
export function listIntentBranches(): string[] {
	if (!isGitRepo()) return []
	const slugs = new Set<string>()
	// Local
	const local = tryRun([
		"git",
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/heads/haiku",
	])
	for (const line of local.split("\n").filter(Boolean)) {
		const match = line.match(/^haiku\/([^/]+)\/main$/)
		if (match) slugs.add(match[1])
	}
	// Remote
	const remote = tryRun([
		"git",
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/remotes/origin/haiku",
	])
	for (const line of remote.split("\n").filter(Boolean)) {
		const match = line.match(/^origin\/haiku\/([^/]+)\/main$/)
		if (match) slugs.add(match[1])
	}
	return Array.from(slugs).sort()
}

/** List intent slugs that have haiku/<slug>/<stage> branches but NO haiku/<slug>/main.
 *  These are discrete-mode intents created before the hub-branch convention.
 *  Returns { slug, branches } pairs so the caller knows what stage branches exist. */
export function listOrphanDiscreteIntents(): {
	slug: string
	branches: string[]
}[] {
	if (!isGitRepo()) return []

	const mainSlugs = new Set(listIntentBranches())
	// Collect all haiku/<slug>/<not-main> branches
	const stageMap = new Map<string, string[]>()
	for (const prefix of ["refs/heads/haiku", "refs/remotes/origin/haiku"]) {
		const out = tryRun([
			"git",
			"for-each-ref",
			"--format=%(refname:short)",
			prefix,
		])
		for (const line of out.split("\n").filter(Boolean)) {
			const stripped = line.startsWith("origin/")
				? line.slice("origin/".length)
				: line
			const match = stripped.match(/^haiku\/([^/]+)\/(.+)$/)
			if (!match) continue
			const [, slug, segment] = match
			if (segment === "main") continue
			if (mainSlugs.has(slug)) continue
			if (!stageMap.has(slug)) stageMap.set(slug, [])
			const branches = stageMap.get(slug) ?? []
			const branchName = `haiku/${slug}/${segment}`
			if (!branches.includes(branchName)) branches.push(branchName)
		}
	}

	return Array.from(stageMap.entries())
		.map(([slug, branches]) => ({ slug, branches }))
		.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Check whether `branch` has been merged into `mainline` (i.e., its tip is an ancestor).
 *  Falls back to VCS platform (gh/glab) to detect squash merges where the
 *  original commits are no longer ancestors of the target. */
export function isBranchMerged(branch: string, mainline: string): boolean {
	if (!isGitRepo()) return false
	// Try local first, then origin/<mainline>
	const targets = [mainline, `origin/${mainline}`]
	const branchRef =
		tryRun(["git", "rev-parse", "--verify", branch]) ||
		tryRun(["git", "rev-parse", "--verify", `origin/${branch}`])
	if (!branchRef) return false
	for (const target of targets) {
		const targetRef = tryRun(["git", "rev-parse", "--verify", target])
		if (!targetRef) continue
		// merge-base --is-ancestor <branch> <target> exits 0 if branch is reachable from target
		try {
			execFileSync(
				"git",
				["merge-base", "--is-ancestor", branchRef, targetRef],
				{ stdio: "ignore" },
			)
			return true
		} catch {
			// not merged into this target — try next
		}
	}

	// Squash merges rewrite history so --is-ancestor fails.
	// Fall back to VCS platform to check for a merged PR/MR from this branch.
	const tool = detectPrTool()
	const branchName = branch.startsWith("origin/")
		? branch.slice("origin/".length)
		: branch
	if (tool === "gh") {
		const out = tryRun([
			"gh",
			"pr",
			"list",
			"--head",
			branchName,
			"--base",
			mainline,
			"--state",
			"merged",
			"--json",
			"number",
			"--limit",
			"1",
		])
		if (out && out.trim() !== "[]") return true
	} else if (tool === "glab") {
		const out = tryRun([
			"glab",
			"mr",
			"list",
			"--source-branch",
			branchName,
			"--target-branch",
			mainline,
			"--state",
			"merged",
			"--per-page",
			"1",
		])
		if (out && /^!(\d+)\b/m.test(out)) return true
	}
	return false
}

/** Add a temporary worktree for an existing branch. Returns the worktree path.
 *  When `preferRemote` is true, resolves to `origin/<branch>` first so the
 *  worktree reflects the current remote state rather than a stale local ref. */
export function addTempWorktree(
	branch: string,
	label = "haiku-repair",
	preferRemote = false,
): string {
	if (!isGitRepo()) throw new Error("not a git repo")
	const path = join(
		"/tmp",
		`${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
	)
	const localRef = tryRun(["git", "rev-parse", "--verify", branch])
	const remoteRef = tryRun(["git", "rev-parse", "--verify", `origin/${branch}`])
	let ref: string
	if (preferRemote) {
		ref = remoteRef ? `origin/${branch}` : localRef ? branch : ""
	} else {
		ref = localRef ? branch : remoteRef ? `origin/${branch}` : ""
	}
	if (!ref) throw new Error(`branch '${branch}' not found locally or on origin`)
	run(["git", "worktree", "add", "--detach", path, ref])
	return path
}

/** Remove a temporary worktree. Non-fatal — never throws. */
export function removeTempWorktree(path: string): void {
	if (!path || !existsSync(path)) return
	tryRun(["git", "worktree", "remove", "--force", path])
}

/** Commit and push changes in a temporary worktree on the given branch.
 *  Stages all changes (including untracked), commits with the given message, and pushes to origin.
 *  Returns true if a commit was made, false if there was nothing to commit. */
export function commitAndPushFromWorktree(
	worktreePath: string,
	branch: string,
	message: string,
): { committed: boolean; pushed: boolean; pushError?: string } {
	if (!isGitRepo())
		return { committed: false, pushed: false, pushError: "not a git repo" }
	// The worktree is created with `--detach`, so HEAD is a detached snapshot
	// of the target branch tip. We deliberately do NOT run `git checkout -B`
	// to create or move the local branch ref — doing so would force-overwrite
	// any local commits the user had on that branch and would collide with
	// the branch being checked out in another worktree. Instead, we commit in
	// the detached state and push the commit directly to `refs/heads/<branch>`
	// on origin via an explicit refspec. No local ref is touched.
	tryRun(["git", "-C", worktreePath, "add", "-A"])
	const status = tryRun(["git", "-C", worktreePath, "status", "--porcelain"])
	if (!status) return { committed: false, pushed: false }
	try {
		execFileSync("git", ["-C", worktreePath, "commit", "-m", message], {
			stdio: "pipe",
		})
	} catch (err) {
		return {
			committed: false,
			pushed: false,
			pushError: err instanceof Error ? err.message : String(err),
		}
	}
	const tryPush = (): { ok: boolean; error?: string } => {
		try {
			execFileSync(
				"git",
				["-C", worktreePath, "push", "origin", `HEAD:refs/heads/${branch}`],
				{ stdio: "pipe" },
			)
			return { ok: true }
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			}
		}
	}

	const first = tryPush()
	if (first.ok) return { committed: true, pushed: true }

	// Non-fast-forward recovery: fetch + rebase onto origin/<branch>, retry push.
	// Without this, a stale-ref repair run loops forever — each run re-applies
	// fixes, push rejects as non-fast-forward, and the worktree's stale view of
	// the repo keeps reporting issues that are already fixed on the remote. (#206)
	//
	// Matching is intentionally narrow: we only recover from genuine NFF errors.
	// A bare "rejected" would also match protected-branch rejections, pre-receive
	// hook failures, and permission errors — rebasing on those would be wrong.
	const isNonFastForward =
		/non-fast-forward|fetch first|behind the remote/i.test(first.error ?? "")
	if (isNonFastForward) {
		tryRun(["git", "-C", worktreePath, "fetch", "origin", branch])
		try {
			execFileSync("git", ["-C", worktreePath, "rebase", `origin/${branch}`], {
				stdio: "pipe",
			})
		} catch (err) {
			tryRun(["git", "-C", worktreePath, "rebase", "--abort"])
			return {
				committed: true,
				pushed: false,
				pushError: `non-fast-forward; rebase onto origin/${branch} failed: ${
					err instanceof Error ? err.message : String(err)
				}`,
			}
		}
		const retry = tryPush()
		if (retry.ok) return { committed: true, pushed: true }
		return { committed: true, pushed: false, pushError: retry.error }
	}

	return { committed: true, pushed: false, pushError: first.error }
}

/** Detect a PR/MR creation tool (`gh` or `glab`) on PATH. */
export function detectPrTool(): "gh" | "glab" | null {
	if (tryRun(["which", "gh"])) return "gh"
	if (tryRun(["which", "glab"])) return "glab"
	return null
}

/** Open a PR/MR from `branch` into `mainline` using the detected tool.
 *  Returns the PR URL on success, an error message on failure. */
export function openPullRequest(
	branch: string,
	mainline: string,
	title: string,
	body: string,
): { ok: boolean; url?: string; error?: string } {
	const tool = detectPrTool()
	if (!tool) return { ok: false, error: "no PR tool (gh/glab) found on PATH" }
	try {
		if (tool === "gh") {
			// Check for an existing PR for this branch first to avoid duplicates
			const existing = tryRun([
				"gh",
				"pr",
				"list",
				"--head",
				branch,
				"--state",
				"open",
				"--json",
				"url",
				"--jq",
				".[0].url",
			])
			if (existing) return { ok: true, url: existing }
			const out = execFileSync(
				"gh",
				[
					"pr",
					"create",
					"--base",
					mainline,
					"--head",
					branch,
					"--title",
					title,
					"--body",
					body,
				],
				{ encoding: "utf8" },
			).trim()
			return { ok: true, url: out }
		}
		// glab: `glab mr list` returns a tabular row like `!123  title  branch  ...`,
		// not JSON, so we extract the MR number via a !NNN regex (not a substring
		// includes, which would false-positive on labels or error text) and then
		// call `glab mr view --output json` to get a proper URL.
		const existing = tryRun([
			"glab",
			"mr",
			"list",
			"--source-branch",
			branch,
			"--state",
			"opened",
			"--per-page",
			"1",
		])
		const mrNumberMatch = existing.match(/^!(\d+)\b/m)
		if (mrNumberMatch) {
			const mrNum = mrNumberMatch[1]
			const viewJson = tryRun(["glab", "mr", "view", mrNum, "--output", "json"])
			if (viewJson) {
				try {
					const parsed = JSON.parse(viewJson) as { web_url?: string }
					if (parsed.web_url) return { ok: true, url: parsed.web_url }
				} catch {
					// Fall through and create a new MR
				}
			}
		}
		const out = execFileSync(
			"glab",
			[
				"mr",
				"create",
				"--target-branch",
				mainline,
				"--source-branch",
				branch,
				"--title",
				title,
				"--description",
				body,
			],
			{ encoding: "utf8" },
		).trim()
		return { ok: true, url: out }
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}
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
 * Always branches from `haiku/<slug>/main` (the intent hub branch).
 * No-op in non-git environments.
 * Returns the branch name.
 */
export function createStageBranch(slug: string, stage: string): string {
	if (stage === "main")
		throw new Error(
			`Stage name 'main' is reserved — it would collide with the intent hub branch`,
		)
	if (!isGitRepo()) return `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`
	return checkoutOrCreate(`haiku/${slug}/${stage}`, mainBranch)
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
 * Merge a completed stage branch back into the intent hub branch (haiku/{slug}/main).
 * Called when a discrete stage is approved and the next stage is about to start.
 * Returns merge result.
 */
export function mergeStageBranchIntoMain(
	slug: string,
	stage: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no git" }
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`

	try {
		run(["git", "rev-parse", "--verify", stageBranch])
		run(["git", "rev-parse", "--verify", mainBranch])

		run(["git", "checkout", mainBranch])
		run([
			"git",
			"merge",
			stageBranch,
			"--no-edit",
			"-m",
			`haiku: merge stage ${stage} into main`,
		])

		return {
			success: true,
			message: `merged ${stageBranch} → ${mainBranch}`,
		}
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
		tryRun(["git", "push", "origin", "--delete", unitBranch])

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
