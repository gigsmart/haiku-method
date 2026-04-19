// git-worktree.ts — Git branch and worktree management for H·AI·K·U
//
// Branching model (fan-in/fan-out):
//
//   main < stage < unit > stage > main
//
// - Intent main (`haiku/{slug}/main`) is the stable base for an intent.
// - Stage branches (`haiku/{slug}/{stage}`) fan out from intent main. They
//   are the fan-in point for every unit in that stage.
// - Unit branches/worktrees (`haiku/{slug}/{unit}`) fan out from the
//   STAGE branch (not from intent main). When a unit completes, it merges
//   back into the stage branch and the unit branch is deleted.
// - When a stage completes, the stage branch merges back into intent main
//   and the stage branch is deleted.
//
// All merges happen through **temporary worktrees** so the FSM never
// mutates the currently-checked-out branch of the main repo worktree —
// scope discipline is enforced at the filesystem level. The MCP's cwd
// stays put; we create ephemeral worktrees for each merge target.
//
// All operations are non-fatal — git failures never crash the MCP.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
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
 * Merge a completed stage branch back into the intent hub branch
 * (`haiku/{slug}/main`) using a temporary worktree — the MCP's checkout is
 * never touched. Called when a stage is approved and the next stage is
 * about to start (or at intent completion for the final stage).
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

		withTempWorktree(mainBranch, (tmpPath) => {
			run([
				"git",
				"-C",
				tmpPath,
				"merge",
				stageBranch,
				"--no-edit",
				"-m",
				`haiku: merge stage ${stage} into main`,
			])
		})

		return {
			success: true,
			message: `merged ${stageBranch} → ${mainBranch}`,
		}
	} catch (err) {
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

/** Absolute path to a unit's worktree under `.haiku/worktrees/{slug}/{unit}`. */
export function unitWorktreePath(slug: string, unit: string): string {
	return join(process.cwd(), ".haiku", "worktrees", slug, unit)
}

/** Absolute path to the unit's spec file INSIDE its own worktree, so writes
 *  land in the scope that will be merged back. */
export function unitSpecInWorktree(
	slug: string,
	stage: string,
	unit: string,
): string {
	const wt = unitWorktreePath(slug, unit)
	const fname = unit.endsWith(".md") ? unit : `${unit}.md`
	return join(wt, ".haiku", "intents", slug, "stages", stage, "units", fname)
}

/** Ensure the stage branch exists, forking it from intent main if not.
 *  Returns the branch name. Safe to call repeatedly. */
export function ensureStageBranch(slug: string, stage: string): string {
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`
	if (!isGitRepo()) return stageBranch
	if (branchExists(stageBranch)) return stageBranch
	// Intent main must exist first; a healthy FSM always creates it before any stage.
	if (!branchExists(mainBranch)) createIntentBranch(slug)
	tryRun(["git", "branch", stageBranch, mainBranch])
	return stageBranch
}

/**
 * Ensure the MCP's current git checkout is on the correct branch for
 * writing stage-scoped state. This is the steady-state guard that runs
 * before every stage-scoped state-mutating tool (feedback, run_next,
 * unit advance/reject, etc.) so stage work never leaks onto the intent
 * main branch.
 *
 * Contract:
 *   - Non-git: no-op.
 *   - `haiku/{slug}/{stage}` exists: ensure we're on it. If intent main has
 *     commits not yet on the stage branch (drift / recovery case), merge
 *     main → stage BEFORE switching so feedback files and state writes
 *     that leaked to main travel with the work.
 *   - Stage branch doesn't exist: fall back to ensuring we're on intent
 *     main (`haiku/{slug}/main`). This covers continuous-mode intents and
 *     pre-stage-start calls.
 *
 * Non-fatal: returns { ok: false } on any failure and leaves the repo in
 * the best-effort state — callers log the warning but never crash.
 *
 * WHY: the FSM must reside on the stage branch for the full lifetime of
 * the stage. Main is only updated at stage exit (merge stage → main).
 * Without this guard, any drift — user checkout, hook side-effect, an
 * earlier FSM bug — causes subsequent state writes to land on the wrong
 * branch, producing the exact "stage work shipped to dev without the
 * sweep fixes" problem.
 */
export function ensureOnStageBranch(
	slug: string,
	stage: string | undefined,
): { ok: boolean; branch: string; message: string; switched: boolean } {
	if (!isGitRepo())
		return { ok: true, branch: "", message: "no git", switched: false }

	const intentMain = `haiku/${slug}/main`
	const stageBranch = stage ? `haiku/${slug}/${stage}` : ""
	const targetBranch =
		stage && branchExists(stageBranch) ? stageBranch : intentMain

	if (!branchExists(targetBranch)) {
		// Can't enforce what doesn't exist — caller (e.g. fsmStartStage) will
		// create branches as needed. This is a pre-init state; skip the guard.
		return {
			ok: true,
			branch: targetBranch,
			message: `target branch '${targetBranch}' not yet created — skipping enforcement`,
			switched: false,
		}
	}

	const current = getCurrentBranch()
	if (current === targetBranch) {
		return {
			ok: true,
			branch: targetBranch,
			message: "already on target",
			switched: false,
		}
	}

	// Detect an in-progress merge/rebase/cherry-pick before attempting
	// checkout. git's error messages are cryptic; surface the state clearly
	// so the agent knows to finish the in-progress operation first.
	const gitDir = tryRun(["git", "rev-parse", "--git-dir"])
	if (gitDir) {
		for (const marker of [
			"MERGE_HEAD",
			"REBASE_HEAD",
			"CHERRY_PICK_HEAD",
			"REVERT_HEAD",
		]) {
			if (existsSync(join(gitDir, marker))) {
				return {
					ok: false,
					branch: current,
					message: `A git operation is in progress (${marker} present). Finish or abort it before stage-branch enforcement can realign the checkout.`,
					switched: false,
				}
			}
		}
	}

	// Recovery case: switching to stage branch but intent main has drifted ahead.
	// Merge main → stage FIRST so any work mis-written to main (feedback files,
	// state.json mutations) travels with the stage branch. On conflict, leave
	// the repo in the merging state so the agent can resolve and commit, then
	// retry — the next call detects main is already merged and skips.
	if (targetBranch === stageBranch && branchExists(intentMain)) {
		const aheadCount = tryRun([
			"git",
			"rev-list",
			"--count",
			`${stageBranch}..${intentMain}`,
		])
		if (aheadCount && parseInt(aheadCount, 10) > 0) {
			try {
				run(["git", "checkout", stageBranch])
				run([
					"git",
					"merge",
					intentMain,
					"--no-edit",
					"-m",
					`haiku: merge intent-main → stage ${stage} (FSM branch enforcement)`,
				])
				return {
					ok: true,
					branch: stageBranch,
					message: `merged main → stage, now on ${stageBranch}`,
					switched: true,
				}
			} catch (err) {
				// Detect conflicts via git status so the agent sees exactly
				// which files to resolve. Do NOT abort — leaving the merge
				// in progress lets the agent fix and commit, then retry.
				const status = tryRun(["git", "status", "--porcelain"])
				const conflicts = (status || "")
					.split("\n")
					.filter(
						(l) =>
							l.startsWith("UU ") ||
							l.startsWith("AA ") ||
							l.startsWith("DD ") ||
							l.startsWith("AU ") ||
							l.startsWith("UA ") ||
							l.startsWith("DU ") ||
							l.startsWith("UD "),
					)
					.map((l) => l.slice(3).trim())
				return {
					ok: false,
					branch: getCurrentBranch() || current,
					message:
						conflicts.length > 0
							? `Merge intent-main → stage '${stage}' left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on '${stageBranch}' (edit files, \`git add\`, \`git commit\`), then retry. A clean retry will detect main is already merged and skip this step.`
							: `failed to merge main into stage: ${err instanceof Error ? err.message : String(err)}. Resolve manually on '${stageBranch}', then retry.`,
					switched: false,
				}
			}
		}
	}

	// Plain checkout — no merge needed.
	try {
		run(["git", "checkout", targetBranch])
		return {
			ok: true,
			branch: targetBranch,
			message: `checked out ${targetBranch}`,
			switched: true,
		}
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err)
		// Give a clearer hint when the user has uncommitted modifications
		// that would be clobbered by the checkout — the raw git message is
		// long and the action ("stash or commit") isn't obvious to an agent.
		const looksLikeDirtyTree =
			raw.includes("would be overwritten by checkout") ||
			raw.includes("Please commit your changes or stash them")
		return {
			ok: false,
			branch: current,
			message: looksLikeDirtyTree
				? `Uncommitted changes on branch '${current}' would be overwritten by switching to '${targetBranch}'. Stash (\`git stash\`) or commit them, then retry. Raw git error: ${raw}`
				: `failed to checkout ${targetBranch}: ${raw}`,
			switched: false,
		}
	}
}

/** Create a temporary worktree checked out on `branch`, run `fn` with its
 *  absolute path, then always remove the worktree. Used for merges that must
 *  not disturb the main repo checkout. */
function withTempWorktree<T>(branch: string, fn: (path: string) => T): T {
	const path = mkdtempSync(join(tmpdir(), "haiku-merge-"))
	try {
		run(["git", "worktree", "add", path, branch])
		try {
			return fn(path)
		} finally {
			tryRun(["git", "worktree", "remove", "--force", path])
		}
	} finally {
		try {
			rmSync(path, { recursive: true, force: true })
		} catch {
			/* non-fatal */
		}
	}
}

/**
 * Create a worktree for a unit, forked from the STAGE branch (always).
 * Ensures the stage branch exists before forking — if missing, creates it
 * from intent main. The unit branch (`haiku/{slug}/{unit}`) is created off
 * the stage branch; a unit worktree is added at
 * `.haiku/worktrees/{slug}/{unit}`.
 *
 * Returns the absolute worktree path, or null when not in a git repo.
 */
export function createUnitWorktree(
	slug: string,
	unit: string,
	stage: string,
): string | null {
	if (!isGitRepo()) return null // Units work in-place in filesystem mode
	if (!stage)
		throw new Error(
			"createUnitWorktree requires `stage` — units always fork from the stage branch",
		)
	const stageBranch = ensureStageBranch(slug, stage)
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)
	const worktreePath = join(worktreeBase, unit)

	try {
		if (existsSync(worktreePath)) return worktreePath
		mkdirSync(worktreeBase, { recursive: true })
		tryRun(["git", "branch", unitBranch, stageBranch])
		run(["git", "worktree", "add", worktreePath, unitBranch])
		return worktreePath
	} catch {
		return null
	}
}

/**
 * Merge a unit's branch into its STAGE branch, using a temporary worktree
 * so the MCP's parent checkout is never touched. Cleans up the unit
 * worktree and the unit branch when done.
 *
 * Caller must ensure every state write for the unit has been flushed to
 * the unit worktree BEFORE calling this — we commit whatever is pending
 * in the unit worktree, then merge the unit branch into the stage branch.
 *
 * No-op in non-git environments.
 */
export function mergeUnitWorktree(
	slug: string,
	unit: string,
	stage: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no worktree" }
	if (!stage)
		return {
			success: false,
			message:
				"mergeUnitWorktree requires `stage` — units always merge into the stage branch",
		}
	const stageBranch = ensureStageBranch(slug, stage)
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreePath = unitWorktreePath(slug, unit)

	if (!existsSync(worktreePath)) {
		return { success: true, message: "no worktree" }
	}

	try {
		// Commit any pending state writes in the unit worktree first.
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

		// Merge in a temp worktree for the stage branch. Never touch the
		// main repo's checked-out branch.
		withTempWorktree(stageBranch, (tmpPath) => {
			run([
				"git",
				"-C",
				tmpPath,
				"merge",
				unitBranch,
				"--no-edit",
				"-m",
				`haiku: merge ${unit} into ${stage}`,
			])
		})

		// Reap the unit worktree and local branch — its work is now on the
		// stage branch. Do NOT delete the remote unit branch here: if the
		// team opened a PR/MR against it for review, deletion would yank
		// the source out from under the review. Remote branch cleanup, if
		// desired, should happen at stage-complete (after fan-in) or be
		// driven by the review provider.
		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		tryRun(["git", "branch", "-D", unitBranch])

		return {
			success: true,
			message: `merged ${unitBranch} → ${stageBranch}`,
		}
	} catch (err) {
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

/**
 * Delete a local branch. Non-fatal. Will not delete the branch you are
 * currently on (caller must checkout something else first). Force-delete is
 * used so already-merged-via-squash branches can still be reaped.
 */
export function deleteBranch(branch: string): boolean {
	if (!isGitRepo()) return false
	if (getCurrentBranch() === branch) return false
	if (!branchExists(branch)) return false
	return tryRun(["git", "branch", "-D", branch]) !== ""
}

/**
 * Delete a stage branch (`haiku/{slug}/{stage}`) and any worktrees backing it.
 * Also prunes the worktree registry so the branch is actually removable.
 * Non-fatal — never throws.
 */
export function deleteStageBranch(slug: string, stage: string): boolean {
	if (!isGitRepo()) return false
	if (stage === "main") return false
	const branch = `haiku/${slug}/${stage}`
	// Any unit worktrees tied to this stage should already be removed by
	// mergeUnitWorktree, but prune defensively so branch -D succeeds.
	tryRun(["git", "worktree", "prune"])
	return deleteBranch(branch)
}

/**
 * Finalize an intent's branches when the intent completes:
 *   1. Merge any unmerged stage branches forward into `haiku/{slug}/main`
 *      (handles the final stage which fsmStartStage never got to consolidate).
 *   2. Checkout `haiku/{slug}/main` so the user lands on the intent hub.
 *   3. Delete every merged `haiku/{slug}/{stage}` branch.
 *   4. Prune worktrees.
 *
 * No-op in non-git environments.
 */
export function finalizeIntentBranches(
	slug: string,
	stages: string[],
): { success: boolean; merged: string[]; deleted: string[]; message: string } {
	const mainBranch = `haiku/${slug}/main`
	if (!isGitRepo())
		return { success: true, merged: [], deleted: [], message: "no git" }
	if (!branchExists(mainBranch))
		return {
			success: true,
			merged: [],
			deleted: [],
			message: `no intent main branch (${mainBranch})`,
		}

	const merged: string[] = []
	const deleted: string[] = []

	// 1. Merge any unmerged stage branches into intent main, in stage order.
	for (const stage of stages) {
		const stageBranch = `haiku/${slug}/${stage}`
		if (!branchExists(stageBranch)) continue
		if (isBranchMerged(stageBranch, mainBranch)) continue
		const res = mergeStageBranchIntoMain(slug, stage)
		if (!res.success) {
			return {
				success: false,
				merged,
				deleted,
				message: `merge of '${stage}' into main failed: ${res.message}`,
			}
		}
		merged.push(stageBranch)
	}

	// 2. Make sure we end up on intent main.
	if (getCurrentBranch() !== mainBranch) {
		try {
			run(["git", "checkout", mainBranch])
		} catch (err) {
			return {
				success: false,
				merged,
				deleted,
				message: `checkout ${mainBranch} failed: ${err instanceof Error ? err.message : String(err)}`,
			}
		}
	}

	// 3. Delete every merged stage branch.
	for (const stage of stages) {
		const stageBranch = `haiku/${slug}/${stage}`
		if (!branchExists(stageBranch)) continue
		if (!isBranchMerged(stageBranch, mainBranch)) continue
		if (deleteBranch(stageBranch)) deleted.push(stageBranch)
	}

	// 4. Prune any lingering worktree entries.
	tryRun(["git", "worktree", "prune"])

	return {
		success: true,
		merged,
		deleted,
		message: `finalized ${slug}: merged ${merged.length}, deleted ${deleted.length}`,
	}
}

/**
 * Recreate a stage branch fresh off intent main, discarding any prior work.
 * Used by revisit to guarantee the stage starts from a clean, current base
 * (no stale commits from a prior attempt at the same stage).
 *
 * Caller is responsible for removing any unit worktrees tied to this stage
 * *before* calling this — blow those away via cleanupIntentWorktrees first,
 * otherwise `git branch -D` can't delete a branch that's checked out in a
 * worktree.
 *
 * No-op in non-git environments.
 */
/**
 * Prepare the target stage branch for a go-back revisit.
 *
 * Per FSM contract: on revisit from fromStage → targetStage, the target
 * stage merges in BOTH intent main (approved upstream changes) AND the
 * fromStage branch (unapproved future work — feedback files, in-flight
 * artifacts, state notes). This ensures feedback and artifacts from the
 * stage we are currently on survive the revisit even when those changes
 * haven't been merged into intent main yet.
 *
 * Non-destructive: never deletes branches. All commits on fromStage and
 * targetStage are preserved. Unit state reset (re-queueing to pending) is
 * the caller's responsibility and happens in a separate step via the FSM
 * state-writing code path.
 *
 * No-op in non-git environments.
 */
export function prepareRevisitBranch(
	slug: string,
	fromStage: string,
	targetStage: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no git" }
	if (targetStage === "main")
		return { success: false, message: "cannot revisit 'main'" }

	const targetBranch = `haiku/${slug}/${targetStage}`
	const fromBranch = fromStage ? `haiku/${slug}/${fromStage}` : ""
	const mainBranch = `haiku/${slug}/main`

	if (!branchExists(mainBranch))
		return { success: false, message: `${mainBranch} does not exist` }

	// List conflicted files by reading git's unmerged index entries (code U*/AA/DD).
	function listConflicts(): string[] {
		const status = tryRun(["git", "status", "--porcelain"])
		if (!status) return []
		return status
			.split("\n")
			.filter(
				(l) =>
					l.startsWith("UU ") ||
					l.startsWith("AA ") ||
					l.startsWith("DD ") ||
					l.startsWith("AU ") ||
					l.startsWith("UA ") ||
					l.startsWith("DU ") ||
					l.startsWith("UD "),
			)
			.map((l) => l.slice(3).trim())
	}

	try {
		// 1. Ensure target branch exists — fork from main if missing.
		if (!branchExists(targetBranch)) {
			run(["git", "branch", targetBranch, mainBranch])
		}

		// 2. Switch to target branch so merges land there.
		if (getCurrentBranch() !== targetBranch) {
			run(["git", "checkout", targetBranch])
		}

		// 3. Merge main → target (approved upstream changes). On conflict,
		//    leave the repo in the merging state so the agent can resolve
		//    files and commit, then retry the revisit (idempotent — a clean
		//    retry will see main as already merged and skip).
		const mainAhead = tryRun([
			"git",
			"rev-list",
			"--count",
			`${targetBranch}..${mainBranch}`,
		])
		if (mainAhead && parseInt(mainAhead, 10) > 0) {
			try {
				run([
					"git",
					"merge",
					mainBranch,
					"--no-edit",
					"-m",
					`haiku: merge main → ${targetStage} (revisit prep)`,
				])
			} catch (mergeErr) {
				const conflicts = listConflicts()
				return {
					success: false,
					message:
						conflicts.length > 0
							? `Merge main → ${targetStage} left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on branch '${targetBranch}' (edit files, \`git add\`, \`git commit\`), then retry the revisit — the FSM will detect main is already merged and continue with the ${fromStage} merge.`
							: `Merge main → ${targetStage} failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`,
				}
			}
		}

		// 4. Merge fromStage → target (carry unapproved future-stage work
		//    like feedback files and in-flight artifacts forward so they
		//    survive the revisit). On conflict, leave the repo merging and
		//    return a detailed error — the agent resolves and retries. The
		//    main merge from step 3 is NOT rolled back: partial progress is
		//    valuable, and the retry is idempotent.
		if (fromBranch && fromStage !== targetStage && branchExists(fromBranch)) {
			const fromAhead = tryRun([
				"git",
				"rev-list",
				"--count",
				`${targetBranch}..${fromBranch}`,
			])
			if (fromAhead && parseInt(fromAhead, 10) > 0) {
				try {
					run([
						"git",
						"merge",
						fromBranch,
						"--no-edit",
						"-m",
						`haiku: merge ${fromStage} → ${targetStage} (revisit carries future-stage work back)`,
					])
				} catch (mergeErr) {
					const conflicts = listConflicts()
					return {
						success: false,
						message:
							conflicts.length > 0
								? `Merge ${fromStage} → ${targetStage} left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on branch '${targetBranch}' (edit files, \`git add\`, \`git commit\`), then retry the revisit. Main has already been merged cleanly and won't be remerged.`
								: `Merge ${fromStage} → ${targetStage} failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`,
					}
				}
			}
		}

		return {
			success: true,
			message: `prepared ${targetBranch} with main${fromBranch && fromStage !== targetStage ? ` + ${fromStage}` : ""} merged in`,
		}
	} catch (err) {
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}
