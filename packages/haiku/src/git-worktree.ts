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
import {
	existsSync,
	writeFileSync as fsWriteFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
} from "node:fs"
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
	if (!(path && existsSync(path))) return
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
 * Ensure the intent's consolidation branch `haiku/<slug>/main` exists.
 * Does NOT check it out — if main already exists, this is a no-op; if
 * it doesn't, we create it with `git branch <name>` (pointing at the
 * current HEAD, which the caller is responsible for positioning —
 * `haiku_intent_create` checks out the repo mainline first so main is
 * forked from a neutral base).
 *
 * The no-checkout contract is load-bearing: this function runs at the
 * top of every `fsmStartStage` tick, and earlier revisions that used
 * `checkoutOrCreate` here would shove HEAD back to `haiku/<slug>/main`
 * on every FSM tick, even while work was in-flight on a stage branch.
 * That wiped editor state, threw away test runs, and forced manual
 * `git switch` every time the session resumed. Merging main is the
 * caller's job (via `mergeStageBranchIntoMain`'s temp-worktree path or
 * `mergeStageBranchForward`) — never by flipping the working tree here.
 *
 * No-op in non-git environments. Returns the branch name.
 */
export function createIntentBranch(slug: string): string {
	const branch = `haiku/${slug}/main`
	if (!isGitRepo()) return branch
	if (branchExists(branch)) return branch
	// Create the branch pointing at the current HEAD without switching.
	run(["git", "branch", branch])
	return branch
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
	const current = getCurrentBranch()

	try {
		run(["git", "rev-parse", "--verify", fromBranch])
		run(["git", "rev-parse", "--verify", toBranch])
	} catch (err) {
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}

	// Checkout may fail with dirty tree — auto-commit on current branch and retry.
	try {
		run(["git", "checkout", toBranch])
	} catch (checkoutErr) {
		const raw =
			checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)
		const looksLikeDirtyTree =
			raw.includes("would be overwritten by checkout") ||
			raw.includes("Please commit your changes or stash them")
		if (looksLikeDirtyTree && current) {
			const committed = autoCommitDirtyTree(current)
			if (!committed.ok) {
				return {
					success: false,
					message: `dirty tree blocks checkout of ${toBranch} from ${current} and auto-commit failed: ${committed.message}`,
				}
			}
			try {
				run(["git", "checkout", toBranch])
			} catch (retryErr) {
				return {
					success: false,
					message: `auto-committed WIP on ${current} but checkout of ${toBranch} still failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
				}
			}
		} else {
			return { success: false, message: raw }
		}
	}

	try {
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

/**
 * Absolute path to a fix-chain's worktree —
 * `.haiku/worktrees/{slug}/fix-{scope}-{FB-NN}` where `scope` is either a
 * stage name (stage-level `review_fix`) or the literal string `"intent"`
 * (studio-level `intent_completion_fix`). Each parallel fix chain gets its
 * own worktree so concurrent chains can't clobber each other's edits.
 */
export function fixChainWorktreePath(
	slug: string,
	scope: string,
	feedbackId: string,
): string {
	return join(
		process.cwd(),
		".haiku",
		"worktrees",
		slug,
		`fix-${scope}-${feedbackId}`,
	)
}

/** Branch name for a fix chain's isolation worktree. */
export function fixChainBranchName(
	slug: string,
	scope: string,
	feedbackId: string,
): string {
	return `haiku/${slug}/fix-${scope}-${feedbackId}`
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
): {
	ok: boolean
	branch: string
	message: string
	switched: boolean
	/** When ok=false and the block is dirty-tree, this is set so callers can
	 *  emit a `commit_wip` action rather than a hard error requiring a human.
	 *  Values: "dirty_tree" — uncommitted changes blocked a branch switch;
	 *  "merge_conflict" — the merge left conflicts to resolve;
	 *  "merge_in_progress" — MERGE_HEAD/REBASE_HEAD etc present. */
	block?: "dirty_tree" | "merge_conflict" | "merge_in_progress"
	/** For block=dirty_tree: the paths git reported as "would be overwritten". */
	dirty_files?: string[]
	/** The branch we were trying to reach when blocked. */
	target_branch?: string
} {
	if (!isGitRepo())
		return { ok: true, branch: "", message: "no git", switched: false }

	const intentMain = `haiku/${slug}/main`
	const stageBranch = stage ? `haiku/${slug}/${stage}` : ""
	const targetBranch =
		stage && branchExists(stageBranch) ? stageBranch : intentMain
	const current = getCurrentBranch()

	if (!branchExists(targetBranch)) {
		// Pre-init state: the intent's branches haven't been created yet.
		// We can't enforce what doesn't exist, but we MUST avoid leaving the
		// agent on a foreign intent's branch — otherwise the caller
		// (fsmStartStage → createIntentBranch) would fork haiku/{slug}/main
		// off that foreign branch and inherit its history. Fall back to the
		// repo mainline (main/master/etc.) so branch creation forks from a
		// clean, neutral base.
		const mainlineBranch = getMainlineBranch()
		if (
			mainlineBranch &&
			branchExists(mainlineBranch) &&
			current !== mainlineBranch
		) {
			try {
				run(["git", "checkout", mainlineBranch])
				return {
					ok: true,
					branch: mainlineBranch,
					message: `target branch '${targetBranch}' not yet created — fell back to repo mainline '${mainlineBranch}' for safe branch creation`,
					switched: true,
				}
			} catch (err) {
				const raw = err instanceof Error ? err.message : String(err)
				const looksLikeDirtyTree =
					raw.includes("would be overwritten by checkout") ||
					raw.includes("Please commit your changes or stash them")
				if (looksLikeDirtyTree) {
					const committed = autoCommitDirtyTree(current)
					if (committed.ok) {
						try {
							run(["git", "checkout", mainlineBranch])
							return {
								ok: true,
								branch: mainlineBranch,
								message: `target branch '${targetBranch}' not yet created — auto-committed WIP on '${current}' (${committed.committed_files.length} file(s)) and fell back to repo mainline '${mainlineBranch}'`,
								switched: true,
							}
						} catch (retryErr) {
							return {
								ok: false,
								branch: current,
								message: `auto-committed WIP on '${current}' but retry fallback to '${mainlineBranch}' still failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
								switched: false,
								target_branch: mainlineBranch,
							}
						}
					}
				}
				return {
					ok: false,
					branch: current,
					message: `target branch '${targetBranch}' not yet created, and failed to fall back to mainline '${mainlineBranch}': ${raw}`,
					switched: false,
					target_branch: mainlineBranch,
				}
			}
		}
		return {
			ok: true,
			branch: targetBranch,
			message: `target branch '${targetBranch}' not yet created — skipping enforcement`,
			switched: false,
		}
	}
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
					block: "merge_in_progress",
					target_branch: targetBranch,
				}
			}
		}
	}

	// Recovery case: switching to stage branch but intent main has drifted ahead.
	// Merge main → stage FIRST so any work mis-written to main (feedback files,
	// state.json mutations) travels with the stage branch. On merge conflict
	// we leave the repo in the merging state so the agent can resolve and
	// commit. On dirty-tree during the initial checkout, auto-commit the WIP
	// on the current branch (where it belongs) and retry.
	if (targetBranch === stageBranch && branchExists(intentMain)) {
		const aheadCount = tryRun([
			"git",
			"rev-list",
			"--count",
			`${stageBranch}..${intentMain}`,
		])
		if (aheadCount && Number.parseInt(aheadCount, 10) > 0) {
			// Stage 1: checkout stage branch. Dirty tree on this step is
			// auto-recoverable.
			try {
				run(["git", "checkout", stageBranch])
			} catch (checkoutErr) {
				const raw =
					checkoutErr instanceof Error
						? checkoutErr.message
						: String(checkoutErr)
				const looksLikeDirtyTree =
					raw.includes("would be overwritten by checkout") ||
					raw.includes("Please commit your changes or stash them")
				if (looksLikeDirtyTree) {
					const committed = autoCommitDirtyTree(current)
					if (committed.ok) {
						try {
							run(["git", "checkout", stageBranch])
						} catch (retryErr) {
							return {
								ok: false,
								branch: getCurrentBranch() || current,
								message: `auto-committed WIP on '${current}' but retry checkout of '${stageBranch}' failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
								switched: false,
								target_branch: stageBranch,
							}
						}
					} else {
						return {
							ok: false,
							branch: current,
							message: `Uncommitted changes on '${current}' block switch to '${stageBranch}' and auto-commit failed: ${committed.message}`,
							switched: false,
							block: "dirty_tree",
							dirty_files: parseOverwrittenFiles(raw),
							target_branch: stageBranch,
						}
					}
				} else {
					return {
						ok: false,
						branch: getCurrentBranch() || current,
						message: `failed to checkout '${stageBranch}' before merging main: ${raw}`,
						switched: false,
						target_branch: stageBranch,
					}
				}
			}
			// Stage 2: merge main into the (now checked-out) stage branch.
			// A failure here is a real conflict — leave it for human resolution.
			try {
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
				const raw = err instanceof Error ? err.message : String(err)
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
					branch: stageBranch,
					message:
						conflicts.length > 0
							? `Merge intent-main → stage '${stage}' left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on '${stageBranch}' (edit files, \`git add\`, \`git commit\`), then retry.`
							: `failed to merge main into stage: ${raw}. Resolve manually on '${stageBranch}', then retry.`,
					switched: false,
					block: conflicts.length > 0 ? "merge_conflict" : undefined,
					dirty_files: conflicts.length > 0 ? conflicts : undefined,
					target_branch: stageBranch,
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
		const looksLikeDirtyTree =
			raw.includes("would be overwritten by checkout") ||
			raw.includes("Please commit your changes or stash them")
		if (looksLikeDirtyTree) {
			// Auto-commit the dirty tree on the CURRENT branch (where the
			// edits happened), then retry the checkout. These changes belong
			// on `current` by definition — git refused to overwrite them
			// because they differ from what `targetBranch` has. Committing
			// them on `current` is the correct resolution and requires no
			// human involvement.
			const committed = autoCommitDirtyTree(current)
			if (committed.ok) {
				try {
					run(["git", "checkout", targetBranch])
					return {
						ok: true,
						branch: targetBranch,
						message: `auto-committed WIP on '${current}' (${committed.committed_files.length} file(s)), then checked out ${targetBranch}`,
						switched: true,
					}
				} catch (retryErr) {
					const retryRaw =
						retryErr instanceof Error ? retryErr.message : String(retryErr)
					return {
						ok: false,
						branch: current,
						message: `auto-committed WIP on '${current}' but retry checkout still failed: ${retryRaw}`,
						switched: false,
						target_branch: targetBranch,
					}
				}
			}
			return {
				ok: false,
				branch: current,
				message: `Uncommitted changes on '${current}' block switch to '${targetBranch}' and auto-commit failed: ${committed.message}`,
				switched: false,
				block: "dirty_tree",
				dirty_files: parseOverwrittenFiles(raw),
				target_branch: targetBranch,
			}
		}
		return {
			ok: false,
			branch: current,
			message: `failed to checkout ${targetBranch}: ${raw}`,
			switched: false,
			target_branch: targetBranch,
		}
	}
}

/** Auto-commit the working tree and index on the current branch with a
 *  generic WIP message. Used by stage-branch enforcement to resolve
 *  dirty-tree blocks without agent/human involvement: the changes belong
 *  on the current branch by definition, so committing them there is the
 *  correct outcome. Returns ok=false only if git itself refuses (e.g.
 *  nothing staged after `git add -A`, which would mean the dirty-tree
 *  detection was a false positive). */
function autoCommitDirtyTree(
	branch: string,
): { ok: true; committed_files: string[] } | { ok: false; message: string } {
	try {
		// Stage everything tracked and untracked. Submodule pointer drift
		// (the "m" status entries) is included — those point at committed
		// submodule refs and are safe to commit here; reverting them would
		// throw away legitimate submodule updates.
		run(["git", "add", "-A"])
		// List what we're about to commit so the return value is accurate.
		const staged = tryRun(["git", "diff", "--cached", "--name-only"])
		const files = staged.split("\n").filter(Boolean)
		if (files.length === 0) {
			return {
				ok: false,
				message:
					"nothing to commit after git add -A (dirty-tree signal may have been spurious)",
			}
		}
		run([
			"git",
			"commit",
			"-m",
			`haiku: auto-commit wip on ${branch} (FSM branch enforcement)`,
		])
		return { ok: true, committed_files: files }
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Parse `git checkout`/`git merge` error output to extract the list of file
 *  paths that would be overwritten by the operation. Used to surface a
 *  precise `dirty_files` list to agents so they can commit exactly the
 *  right paths rather than guessing or running `git add -A`. */
function parseOverwrittenFiles(rawError: string): string[] {
	const lines = rawError.split("\n")
	const files: string[] = []
	let capturing = false
	for (const line of lines) {
		if (
			line.includes("would be overwritten by") ||
			line.includes("Please commit your changes or stash them")
		) {
			capturing = true
			continue
		}
		if (line.trim() === "Aborting" || line.trim().startsWith("error: ")) {
			capturing = false
			continue
		}
		if (capturing) {
			const trimmed = line.replace(/^\t+/, "").trim()
			if (
				trimmed &&
				!trimmed.startsWith("error:") &&
				!trimmed.startsWith("hint:")
			) {
				files.push(trimmed)
			}
		}
	}
	return files
}

/** Write a single file (relative to repo root) onto `haiku/<slug>/main` via
 *  a temp worktree + commit, without touching the current checkout. Used for
 *  state writes that must land on main regardless of which stage branch is
 *  currently checked out — intent.md, stage state.json resets on revisit.
 *
 *  `content` is the full new file content. Returns ok=false if main doesn't
 *  exist or the write fails. The commit is local; push policy is the
 *  caller's decision.
 */
export function writeOnIntentMain(
	slug: string,
	relPath: string,
	content: string,
	commitMessage: string,
): { ok: boolean; message: string } {
	if (!isGitRepo()) return { ok: true, message: "no git" }
	const mainBranch = `haiku/${slug}/main`
	if (!branchExists(mainBranch))
		return { ok: false, message: `${mainBranch} does not exist` }

	try {
		withTempWorktree(mainBranch, (tmpPath) => {
			const fullPath = join(tmpPath, relPath)
			const dir = fullPath.replace(/\/[^/]+$/, "")
			mkdirSync(dir, { recursive: true })
			// Cannot use writeFileSync from node:fs here directly in this
			// file's current imports — but existsSync/mkdirSync from node:fs
			// are already imported. Add writeFileSync via require workaround
			// would be ugly. The file already imports from node:fs at top, so
			// import writeFileSync there.
			fsWriteFileSync(fullPath, content)
			// Stage + commit. --allow-empty handles the no-op write case
			// gracefully; we'd rather have a no-op commit than bail.
			run(["git", "-C", tmpPath, "add", relPath])
			const status = tryRun(["git", "-C", tmpPath, "status", "--porcelain"])
			if (status.trim()) {
				run(["git", "-C", tmpPath, "commit", "-m", commitMessage])
			}
		})
		return { ok: true, message: `wrote ${relPath} on ${mainBranch}` }
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Scan all `haiku/<slug>/*` branches (except main and unit-*) and delete
 *  any that are already merged into `haiku/<slug>/main`. Also deletes the
 *  matching remote branch if it exists. Called before entering a stage and
 *  after a stage completes, so orphan stage branches never accumulate.
 *
 *  Returns the list of deleted branches. Safe to call when no orphans
 *  exist — it's a no-op. Non-fatal on individual delete failures.
 */
export function cleanupOrphanedStageBranches(slug: string): {
	deleted_local: string[]
	deleted_remote: string[]
} {
	const result = {
		deleted_local: [] as string[],
		deleted_remote: [] as string[],
	}
	if (!isGitRepo()) return result
	const mainBranch = `haiku/${slug}/main`
	if (!branchExists(mainBranch)) return result

	// Local pass
	const local = tryRun([
		"git",
		"for-each-ref",
		"--format=%(refname:short)",
		`refs/heads/haiku/${slug}`,
	])
	for (const line of local.split("\n").filter(Boolean)) {
		// Skip main + unit-* branches; only touch stage branches.
		if (line === mainBranch) continue
		const segment = line.slice(`haiku/${slug}/`.length)
		if (segment.startsWith("unit-")) continue
		if (!isBranchMerged(line, mainBranch)) continue
		if (tryRun(["git", "branch", "-D", line])) {
			result.deleted_local.push(line)
		} else {
			// branch -D can fail if the branch is checked out in another
			// worktree; record and continue.
			result.deleted_local.push(line)
		}
	}

	// Remote pass — best-effort. We don't fetch first (caller decides).
	const remote = tryRun([
		"git",
		"for-each-ref",
		"--format=%(refname:short)",
		`refs/remotes/origin/haiku/${slug}`,
	])
	for (const line of remote.split("\n").filter(Boolean)) {
		const stripped = line.startsWith("origin/")
			? line.slice("origin/".length)
			: line
		if (stripped === mainBranch) continue
		const segment = stripped.slice(`haiku/${slug}/`.length)
		if (segment.startsWith("unit-")) continue
		if (!isBranchMerged(stripped, mainBranch)) continue
		// git push origin --delete is destructive; wrap in tryRun so a
		// permission or network issue doesn't crash the FSM.
		if (tryRun(["git", "push", "origin", "--delete", stripped])) {
			result.deleted_remote.push(stripped)
		}
	}

	return result
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

		// Merge strategy: if the MCP's current checkout is already on the
		// stage branch, merge directly here (temp-worktree would fail with
		// "branch already used by worktree"). Otherwise use a temp worktree
		// so we don't disturb whatever branch the user happens to be on.
		//
		// Conflict handling: the unit .md file under stages/<stage>/units/
		// routinely conflicts because the FSM writes iteration/hat state to
		// it from the stage-branch side while the unit branch carries a
		// frozen-at-fork copy. For those files only, take the stage side
		// (the live FSM state) — the unit worktree has no business mutating
		// its own state file. Non-unit-md conflicts still surface as real
		// conflicts the agent must resolve.
		const onStageBranch = getCurrentBranch() === stageBranch
		const mergeHere = (cwd?: string) => {
			const mergeArgs = [
				"git",
				...(cwd ? ["-C", cwd] : []),
				"merge",
				unitBranch,
				"--no-edit",
				"-m",
				`haiku: merge ${unit} into ${stage}`,
			]
			try {
				run(mergeArgs)
			} catch (err) {
				const unitMdRel = `.haiku/intents/${slug}/stages/${stage}/units/${unit}.md`
				const conflicts = tryRun([
					"git",
					...(cwd ? ["-C", cwd] : []),
					"diff",
					"--name-only",
					"--diff-filter=U",
				])
					.split("\n")
					.filter(Boolean)
				// Only auto-resolve the unit-md conflict. Any other conflict
				// is real — abort and surface.
				const nonUnitMd = conflicts.filter((p) => p !== unitMdRel)
				if (conflicts.length > 0 && nonUnitMd.length === 0) {
					run([
						"git",
						...(cwd ? ["-C", cwd] : []),
						"checkout",
						"--ours",
						unitMdRel,
					])
					run(["git", ...(cwd ? ["-C", cwd] : []), "add", unitMdRel])
					run(["git", ...(cwd ? ["-C", cwd] : []), "commit", "--no-edit"])
				} else {
					throw err
				}
			}
		}
		if (onStageBranch) {
			mergeHere()
		} else {
			withTempWorktree(stageBranch, (tmpPath) => mergeHere(tmpPath))
		}

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
 * Absolute path to a discovery subagent's worktree —
 * `.haiku/worktrees/{slug}/discovery-{stage}-{template}`. Each parallel
 * discovery subagent gets its own worktree so concurrent writes don't
 * step on each other (and so each subagent's git ops are pinned to the
 * right branch — same branch-hygiene concern that motivated fix-chain
 * isolation).
 */
export function discoveryWorktreePath(
	slug: string,
	stage: string,
	template: string,
): string {
	return join(
		process.cwd(),
		".haiku",
		"worktrees",
		slug,
		`discovery-${stage}-${template}`,
	)
}

/** Branch name for a discovery subagent's isolation worktree. */
export function discoveryBranchName(
	slug: string,
	stage: string,
	template: string,
): string {
	return `haiku/${slug}/discovery-${stage}-${template}`
}

/**
 * Create a discovery worktree off the stage branch. Idempotent: returns
 * the existing path if already allocated. No-op (null) in non-git mode.
 */
export function createDiscoveryWorktree(
	slug: string,
	stage: string,
	template: string,
): string | null {
	if (!isGitRepo()) return null
	if (!stage || !template)
		throw new Error("createDiscoveryWorktree requires `stage` and `template`")

	const baseBranch = ensureStageBranch(slug, stage)
	const discBranch = discoveryBranchName(slug, stage, template)
	const worktreePath = discoveryWorktreePath(slug, stage, template)
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)

	try {
		if (existsSync(worktreePath)) return worktreePath
		mkdirSync(worktreeBase, { recursive: true })
		if (!branchExists(discBranch)) {
			tryRun(["git", "branch", discBranch, baseBranch])
		}
		run(["git", "worktree", "add", worktreePath, discBranch])
		return worktreePath
	} catch {
		return null
	}
}

/**
 * Merge a discovery worktree back into the stage branch. Same conflict-
 * handling contract as `mergeFixChainWorktree` — on MERGE_HEAD with
 * unresolved markers, returns `{isConflict: true, conflictFiles}` so
 * the caller can dispatch the integrator. In practice discovery
 * conflicts are rare because each subagent writes a different file,
 * but we handle them the same way for consistency.
 */
export function mergeDiscoveryWorktree(
	slug: string,
	stage: string,
	template: string,
): {
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
	if (!isGitRepo()) return { success: true, message: "no worktree" }
	const baseBranch = ensureStageBranch(slug, stage)
	const discBranch = discoveryBranchName(slug, stage, template)
	const worktreePath = discoveryWorktreePath(slug, stage, template)

	if (!existsSync(worktreePath)) {
		if (branchExists(discBranch)) tryRun(["git", "branch", "-D", discBranch])
		return { success: true, message: "no worktree" }
	}

	const mergeInProgress = !!tryRun([
		"git",
		"-C",
		worktreePath,
		"rev-parse",
		"--verify",
		"-q",
		"MERGE_HEAD",
	])
	const unresolved = tryRun([
		"git",
		"-C",
		worktreePath,
		"diff",
		"--name-only",
		"--diff-filter=U",
	])
		.split("\n")
		.filter(Boolean)
	if (unresolved.length > 0) {
		return {
			success: false,
			isConflict: true,
			conflictFiles: unresolved,
			message: `${unresolved.length} file(s) with unresolved conflict markers in discovery worktree ${template} — integrator work incomplete`,
		}
	}

	try {
		if (mergeInProgress) {
			tryRun(["git", "-C", worktreePath, "add", "-A"])
			run([
				"git",
				"-C",
				worktreePath,
				"commit",
				"--no-edit",
				"-m",
				`haiku: integrate ${stage} into discovery ${template}`,
			])
		} else {
			tryRun(["git", "-C", worktreePath, "add", "-A"])
			tryRun([
				"git",
				"-C",
				worktreePath,
				"commit",
				"-m",
				`haiku: complete discovery ${template}`,
				"--allow-empty",
			])

			try {
				run([
					"git",
					"-C",
					worktreePath,
					"merge",
					baseBranch,
					"--no-edit",
					"-m",
					`haiku: sync ${stage} into discovery ${template}`,
				])
			} catch (mergeErr) {
				const freshConflicts = tryRun([
					"git",
					"-C",
					worktreePath,
					"diff",
					"--name-only",
					"--diff-filter=U",
				])
					.split("\n")
					.filter(Boolean)
				if (freshConflicts.length > 0) {
					return {
						success: false,
						isConflict: true,
						conflictFiles: freshConflicts,
						message: `merge conflict in ${freshConflicts.length} file(s) while pulling ${baseBranch} into discovery ${template}`,
					}
				}
				tryRun(["git", "-C", worktreePath, "merge", "--abort"])
				throw mergeErr
			}
		}

		const onBaseBranch = getCurrentBranch() === baseBranch
		const mergeHere = (cwd?: string) => {
			run([
				"git",
				...(cwd ? ["-C", cwd] : []),
				"merge",
				discBranch,
				"--no-edit",
				"-m",
				`haiku: merge discovery ${template} into ${stage}`,
			])
		}
		if (onBaseBranch) {
			mergeHere()
		} else {
			withTempWorktree(baseBranch, (tmpPath) => mergeHere(tmpPath))
		}

		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		tryRun(["git", "branch", "-D", discBranch])

		return {
			success: true,
			message: `merged ${discBranch} → ${baseBranch}`,
		}
	} catch (err) {
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Discard a discovery worktree without merging. */
export function cleanupDiscoveryWorktree(
	slug: string,
	stage: string,
	template: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no git" }
	const discBranch = discoveryBranchName(slug, stage, template)
	const worktreePath = discoveryWorktreePath(slug, stage, template)
	if (existsSync(worktreePath)) {
		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
	}
	if (branchExists(discBranch)) {
		tryRun(["git", "branch", "-D", discBranch])
	}
	return { success: true, message: `cleaned up ${discBranch}` }
}

/**
 * Create a fix-chain worktree off the stage branch (or intent main for
 * studio-level intent-completion fix loops). Idempotent: returns the
 * existing path if the worktree already exists for this chain.
 *
 * `scope` is either a stage name (for `review_fix`) or `"intent"` (for
 * `intent_completion_fix`). The resulting branch is
 * `haiku/{slug}/fix-{scope}-{FB-NN}`, forked from the base branch at the
 * moment of creation. Subsequent bolts that reuse the same feedback ID
 * pick up the existing branch unless the prior bolt cleaned it up.
 *
 * No-op in non-git environments (returns null) — filesystem mode has no
 * branches/worktrees to isolate; parallel fix-chain subagents run
 * directly in the current working tree, same as today.
 */
export function createFixChainWorktree(
	slug: string,
	scope: string,
	feedbackId: string,
): string | null {
	if (!isGitRepo()) return null
	if (!scope)
		throw new Error(
			"createFixChainWorktree requires `scope` — stage name or 'intent'",
		)
	if (!feedbackId)
		throw new Error(
			"createFixChainWorktree requires `feedbackId` — the FB-NN of the chain",
		)

	const baseBranch =
		scope === "intent" ? `haiku/${slug}/main` : ensureStageBranch(slug, scope)
	const fixBranch = fixChainBranchName(slug, scope, feedbackId)
	const worktreePath = fixChainWorktreePath(slug, scope, feedbackId)
	const worktreeBase = join(process.cwd(), ".haiku", "worktrees", slug)

	try {
		if (existsSync(worktreePath)) return worktreePath
		mkdirSync(worktreeBase, { recursive: true })
		// Recreate the branch at the current base HEAD if it doesn't exist.
		// If it does exist (e.g., a prior bolt allocated it and didn't clean
		// up), leave its commits alone — the worktree add below will check
		// it out unchanged.
		if (!branchExists(fixBranch)) {
			tryRun(["git", "branch", fixBranch, baseBranch])
		}
		run(["git", "worktree", "add", worktreePath, fixBranch])
		return worktreePath
	} catch {
		return null
	}
}

/**
 * Merge a fix-chain's branch into its base (stage branch for `review_fix`,
 * intent main for `intent_completion_fix`). Called when the chain's final
 * hat has signed off — i.e. the feedback was closed by the assessor.
 *
 * Commits any pending edits in the worktree first (the fix hats normally
 * commit as they go, but belt-and-suspenders), then merges the fix branch
 * forward. Conflicts other than FB-file-state leave the worktree in place
 * and surface an error for the human. Successful merges reap both the
 * worktree and the fix-chain branch — a subsequent bolt for the same
 * finding would start fresh from the (now-advanced) base branch.
 *
 * Caller must ensure no subagent is still running in the worktree — this
 * function commits and removes the tree.
 */
export function mergeFixChainWorktree(
	slug: string,
	scope: string,
	feedbackId: string,
): {
	success: boolean
	message: string
	/** True when the merge failed specifically due to content conflicts that
	 *  an integrator agent should resolve — distinguishes from "merge aborted
	 *  because of a broken repo state" or similar. */
	isConflict?: boolean
	/** Paths (repo-relative) that have unresolved conflict markers. Populated
	 *  only when isConflict is true. The integrator subagent reads this list
	 *  to know which files to open. */
	conflictFiles?: string[]
} {
	if (!isGitRepo()) return { success: true, message: "no worktree" }
	const baseBranch =
		scope === "intent" ? `haiku/${slug}/main` : ensureStageBranch(slug, scope)
	const fixBranch = fixChainBranchName(slug, scope, feedbackId)
	const worktreePath = fixChainWorktreePath(slug, scope, feedbackId)

	if (!existsSync(worktreePath)) {
		// Nothing to merge — either never created, or previous tick cleaned
		// up. Also defensively delete the branch if it's still around with
		// no worktree backing it.
		if (branchExists(fixBranch)) tryRun(["git", "branch", "-D", fixBranch])
		return { success: true, message: "no worktree" }
	}

	// If a prior tick left a merge in progress (integrator was dispatched),
	// the current state is one of:
	//   (a) all conflicts resolved, index updated — commit the merge, then
	//       forward-merge into base.
	//   (b) some conflicts still unresolved — return isConflict so the
	//       caller re-dispatches the integrator.
	const mergeInProgress = !!tryRun([
		"git",
		"-C",
		worktreePath,
		"rev-parse",
		"--verify",
		"-q",
		"MERGE_HEAD",
	])
	const unresolved = tryRun([
		"git",
		"-C",
		worktreePath,
		"diff",
		"--name-only",
		"--diff-filter=U",
	])
		.split("\n")
		.filter(Boolean)
	if (unresolved.length > 0) {
		return {
			success: false,
			isConflict: true,
			conflictFiles: unresolved,
			message: `${unresolved.length} file(s) with unresolved conflict markers in fix-chain ${feedbackId} — integrator work incomplete`,
		}
	}

	try {
		if (mergeInProgress) {
			// (a) — integrator already resolved, just commit the merge.
			tryRun(["git", "-C", worktreePath, "add", "-A"])
			run([
				"git",
				"-C",
				worktreePath,
				"commit",
				"--no-edit",
				"-m",
				`haiku: integrate ${scope} into fix-chain ${feedbackId}`,
			])
		} else {
			// Fresh merge path: commit any pending work in the worktree,
			// then pull the base branch in. The sync merge lands any conflict
			// markers in the worktree — the natural place for the integrator
			// subagent to resolve them. Done here (not in a temp tree) so
			// that state persists for the next tick if conflicts emerge.
			tryRun(["git", "-C", worktreePath, "add", "-A"])
			tryRun([
				"git",
				"-C",
				worktreePath,
				"commit",
				"-m",
				`haiku: complete fix-chain ${feedbackId}`,
				"--allow-empty",
			])

			try {
				run([
					"git",
					"-C",
					worktreePath,
					"merge",
					baseBranch,
					"--no-edit",
					"-m",
					`haiku: sync ${scope} into fix-chain ${feedbackId}`,
				])
			} catch (mergeErr) {
				const freshConflicts = tryRun([
					"git",
					"-C",
					worktreePath,
					"diff",
					"--name-only",
					"--diff-filter=U",
				])
					.split("\n")
					.filter(Boolean)
				if (freshConflicts.length > 0) {
					return {
						success: false,
						isConflict: true,
						conflictFiles: freshConflicts,
						message: `merge conflict in ${freshConflicts.length} file(s) while pulling ${baseBranch} into fix-chain ${feedbackId}`,
					}
				}
				tryRun(["git", "-C", worktreePath, "merge", "--abort"])
				throw mergeErr
			}
		}

		// Forward-merge the (now-reconciled) fix-chain into the base branch.
		const onBaseBranch = getCurrentBranch() === baseBranch
		const mergeHere = (cwd?: string) => {
			run([
				"git",
				...(cwd ? ["-C", cwd] : []),
				"merge",
				fixBranch,
				"--no-edit",
				"-m",
				`haiku: merge fix-chain ${feedbackId} into ${scope}`,
			])
		}
		if (onBaseBranch) {
			mergeHere()
		} else {
			withTempWorktree(baseBranch, (tmpPath) => mergeHere(tmpPath))
		}

		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		tryRun(["git", "branch", "-D", fixBranch])

		return {
			success: true,
			message: `merged ${fixBranch} → ${baseBranch}`,
		}
	} catch (err) {
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Discard a fix-chain's worktree and branch without merging. Used when:
 *   - the feedback-assessor didn't close the finding (next bolt starts fresh)
 *   - the fix loop hit the bolt cap and escalated
 *   - a chain produced nothing useful and should be reaped before retry
 *
 * No-op if the worktree doesn't exist. Best-effort — never throws.
 */
export function cleanupFixChainWorktree(
	slug: string,
	scope: string,
	feedbackId: string,
): { success: boolean; message: string } {
	if (!isGitRepo()) return { success: true, message: "no git" }
	const fixBranch = fixChainBranchName(slug, scope, feedbackId)
	const worktreePath = fixChainWorktreePath(slug, scope, feedbackId)

	if (existsSync(worktreePath)) {
		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
	}
	if (branchExists(fixBranch)) {
		tryRun(["git", "branch", "-D", fixBranch])
	}
	return {
		success: true,
		message: `cleaned up ${fixBranch}`,
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

	// If main doesn't exist yet there's nothing to merge. Caller (e.g. a
	// revisit invoked before the intent has been branched, or a test harness
	// running without real git state) should treat this as a no-op rather
	// than a hard failure.
	if (!branchExists(mainBranch))
		return {
			success: true,
			message: `${mainBranch} does not exist — nothing to merge`,
		}

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
		if (mainAhead && Number.parseInt(mainAhead, 10) > 0) {
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
			if (fromAhead && Number.parseInt(fromAhead, 10) > 0) {
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
