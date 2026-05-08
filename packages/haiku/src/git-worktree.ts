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
// All merges happen through **temporary worktrees** so the workflow engine never
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
	readFileSync,
	rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isGitRepo, primaryRepoRoot } from "./state-tools.js"

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

/** Resolve the best ref to fork a new branch from. Prefers local `<mainline>`
 *  (matches `addTempWorktree`'s default — local may have commits not yet on
 *  origin), falls back to `origin/<mainline>`. Returns an empty string when
 *  no mainline ref can be located, leaving the caller to fork from HEAD. */
export function resolveMainlineRef(): string {
	if (!isGitRepo()) return ""
	// `getMainlineBranch()` always returns a non-empty string (`"main"` is the
	// hardcoded last resort), so we don't guard against empty here.
	const mainline = getMainlineBranch()
	if (tryRun(["git", "rev-parse", "--verify", mainline])) {
		return mainline
	}
	if (tryRun(["git", "rev-parse", "--verify", `origin/${mainline}`])) {
		return `origin/${mainline}`
	}
	return ""
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

/** Push a branch to its origin (creates upstream if missing). Returns
 *  ok:true on success, ok:false with the raw error on failure. */
export function pushBranchToOrigin(branch: string): {
	ok: boolean
	error?: string
} {
	try {
		execFileSync("git", ["push", "-u", "origin", branch], {
			encoding: "utf8",
			stdio: "pipe",
		})
		return { ok: true }
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Build a provider-specific URL that opens the "new PR/MR" form
 *  pre-filled with the head + base branches. Used as a last-resort
 *  fallback when neither gh nor glab is on PATH (or the CLI fails) — the
 *  user clicks the URL and lands directly on the create-PR page with
 *  the right branches selected, no compare-then-create dance.
 *
 *  Reads `origin` from `git remote get-url origin`, parses host/owner/repo,
 *  and constructs:
 *    GitHub  → https://github.com/<owner>/<repo>/compare/<base>...<head>?expand=1
 *              (the `?expand=1` makes GitHub open the create-PR form
 *              instead of just the diff)
 *    GitLab  → https://gitlab.com/<owner>/<repo>/-/merge_requests/new?
 *              merge_request[source_branch]=<head>&merge_request[target_branch]=<base>
 *              (GitLab's "new MR" form pre-fills source + target)
 *
 *  Returns null when the origin URL can't be parsed or the host isn't
 *  recognised (the caller should print the branch name + base instead). */
export function buildCompareUrl(
	headBranch: string,
	baseBranch: string,
): string | null {
	let originRaw = ""
	try {
		originRaw = execFileSync("git", ["remote", "get-url", "origin"], {
			encoding: "utf8",
			stdio: "pipe",
		}).trim()
	} catch {
		return null
	}
	if (!originRaw) return null
	let host = ""
	let path = ""
	const sshMatch = originRaw.match(/^[^@\s]+@([^:]+):(.+?)(?:\.git)?$/)
	if (sshMatch) {
		host = sshMatch[1]
		path = sshMatch[2]
	} else {
		try {
			const u = new URL(originRaw)
			host = u.hostname
			path = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "")
		} catch {
			return null
		}
	}
	const segments = path.split("/").filter(Boolean)
	if (segments.length < 2) return null
	const owner = segments[0]
	const repo = segments.slice(1).join("/")
	const head = encodeURIComponent(headBranch)
	const base = encodeURIComponent(baseBranch)
	if (host === "github.com") {
		return `https://github.com/${owner}/${repo}/compare/${base}...${head}?expand=1`
	}
	if (host === "gitlab.com") {
		// new-MR form pre-fills source + target; lands on a page where
		// "Create merge request" is one click away (no compare-then-
		// create round trip).
		return `https://gitlab.com/${owner}/${repo}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${head}&merge_request%5Btarget_branch%5D=${base}`
	}
	return null
}

/** Result of openStagePullRequest: either a created PR URL, a fallback
 *  compare-URL the user can click to open a PR manually, or a hard
 *  failure with a message naming what went wrong. */
export interface OpenStageMrResult {
	branch: string
	base: string
	createdUrl?: string
	compareUrl?: string
	pushed?: boolean
	pushError?: string
	prError?: string
	message: string
}

/** End-to-end "open the change request for this stage" helper. Pushes
 *  the stage branch to origin (best-effort), tries `openPullRequest()`
 *  (gh/glab CLI), and falls back to a provider-specific compare URL on
 *  failure. The agent's external_review_requested response surfaces
 *  whichever URL we produced — programmatic when possible, manual link
 *  when not. */
export function openStagePullRequest(opts: {
	slug: string
	stage: string
	title?: string
	body?: string
}): OpenStageMrResult {
	const branch = `haiku/${opts.slug}/${opts.stage}`
	const base = `haiku/${opts.slug}/main`
	const title =
		opts.title ?? `H·AI·K·U: ${opts.slug} — stage ${opts.stage} review`
	const body =
		opts.body ??
		`Stage \`${opts.stage}\` is ready for review on intent \`${opts.slug}\`.\n\nMerging this PR signals approval to the H·AI·K·U workflow engine.`

	if (!isGitRepo()) {
		return {
			branch,
			base,
			message:
				"This is not a git repo — the stage merge happens via on-disk stages_merged. Nothing to open.",
		}
	}

	const push = pushBranchToOrigin(branch)
	const result: OpenStageMrResult = {
		branch,
		base,
		pushed: push.ok,
		pushError: push.ok ? undefined : push.error,
		message: "",
	}

	if (push.ok) {
		const pr = openPullRequest(branch, base, title, body)
		if (pr.ok && pr.url) {
			result.createdUrl = pr.url
			result.message = `Stage PR opened: ${pr.url}`
			return result
		}
		result.prError = pr.error
	}

	const compare = buildCompareUrl(branch, base)
	if (compare) {
		result.compareUrl = compare
		result.message = push.ok
			? `Stage branch \`${branch}\` is pushed. The gh/glab CLI didn't create the PR (${result.prError ?? "no tool found"}). Click here to open the MR manually: ${compare}`
			: `Failed to push \`${branch}\` (${push.error}). After resolving the push, open the MR at: ${compare}`
		return result
	}

	result.message = push.ok
		? `Stage branch \`${branch}\` is pushed but no provider-specific compare URL could be built (origin host not recognised). Open the MR manually from \`${branch}\` into \`${base}\` via your provider's web UI.`
		: `Failed to push \`${branch}\` (${push.error}) and no compare URL could be built. Resolve the push, then open the MR from \`${branch}\` into \`${base}\` via your provider's web UI.`
	return result
}

/** Result of `reconcileMisroutedStageMerges`: per-stage reconciliation
 *  outcome. Used by haiku_run_next's pre-cursor reconciliation step to
 *  surface either a clean fix or a structured error to the agent. */
export interface MisroutedStageReconciliation {
	stage: string
	stageBranch: string
	intentMain: string
	mainline: string
	/** True when the stage's commits were detected on the repo mainline
	 *  but not yet on intent main. */
	misrouted: boolean
	/** True when intent main was successfully fast-forwarded to pick up
	 *  the merge. False when reconciliation failed (divergence, etc.). */
	reconciled: boolean
	/** Push-to-origin status after reconciliation (best-effort). */
	pushed: boolean
	error?: string
}

/**
 * Detect and recover from the "User A merged their stage PR into the
 * repo default branch instead of `haiku/<slug>/main`" case. The
 * symptom: `haiku/<slug>/<stage>` is merged into `main` (or whatever
 * the repo default is) but NOT into `haiku/<slug>/main`, so the cursor's
 * `firstUnmergedStage` keeps the stage pinned and pickup wedges.
 *
 * Recovery: fast-forward `haiku/<slug>/main` to the repo mainline so
 * the merge propagates. Only safe when `haiku/<slug>/main` is a strict
 * ancestor of mainline — otherwise the FF fails and we surface the
 * divergence so the operator can resolve manually. Best-effort push to
 * origin after the FF so other clones see the fix.
 *
 * Idempotent: if intent main already has the merge (the canonical
 * happy path), this is a no-op and returns `misrouted: false`.
 */
export function reconcileMisroutedStageMerges(
	slug: string,
	stages: ReadonlyArray<string>,
): MisroutedStageReconciliation[] {
	if (!isGitRepo()) return []
	const out: MisroutedStageReconciliation[] = []
	const mainline = getMainlineBranch()
	const intentMain = `haiku/${slug}/main`
	if (!mainline || !branchExists(intentMain)) return out

	for (const stage of stages) {
		const stageBranch = `haiku/${slug}/${stage}`
		const result: MisroutedStageReconciliation = {
			stage,
			stageBranch,
			intentMain,
			mainline,
			misrouted: false,
			reconciled: false,
			pushed: false,
		}
		// Resolve refs we'll need (local + remote-tracking variants).
		const stageRef =
			tryRun(["git", "rev-parse", "--verify", stageBranch]) ||
			tryRun(["git", "rev-parse", "--verify", `origin/${stageBranch}`])
		if (!stageRef) continue
		const intentMainRef =
			tryRun(["git", "rev-parse", "--verify", intentMain]) ||
			tryRun(["git", "rev-parse", "--verify", `origin/${intentMain}`])
		if (!intentMainRef) continue
		// Already merged into intent main? No reconciliation needed.
		if (isAncestor(stageRef, intentMainRef)) {
			const aheadOfBranch = countAheadCommits(stageRef, intentMainRef)
			if (aheadOfBranch > 0) continue // canonical happy path
		}
		// Look for the stage's commits on the repo mainline (local or
		// remote-tracking). If the stage branch is an ancestor of
		// mainline, the merge happened — just on the wrong target.
		const mainlineRef =
			tryRun(["git", "rev-parse", "--verify", `origin/${mainline}`]) ||
			tryRun(["git", "rev-parse", "--verify", mainline])
		if (!mainlineRef) continue
		if (!isAncestor(stageRef, mainlineRef)) continue
		const mainlineAheadOfStage = countAheadCommits(stageRef, mainlineRef)
		if (mainlineAheadOfStage <= 0) continue
		result.misrouted = true

		// Fast-forward intent main to mainline. Only safe when intent
		// main is itself an ancestor of mainline (otherwise we'd
		// silently drop divergent commits).
		if (!isAncestor(intentMainRef, mainlineRef)) {
			result.error = `Stage \`${stageBranch}\` was merged into \`${mainline}\` (the repo default) instead of \`${intentMain}\`, but \`${intentMain}\` has commits that aren't on \`${mainline}\` — fast-forward isn't safe. Resolve manually: \`git checkout ${intentMain} && git merge ${mainline}\` (or \`origin/${mainline}\`), resolve any conflicts, then re-run /haiku:pickup.`
			out.push(result)
			continue
		}
		// Check out intent main (transient) and FF to mainline.
		// Skip when intent main is held by another worktree — we
		// can't switch into it from here. The user will need to
		// reconcile from that worktree.
		const currentBranch = getCurrentBranch()
		let restoreBranch = ""
		try {
			if (currentBranch !== intentMain) {
				try {
					execFileSync("git", ["checkout", intentMain], { stdio: "pipe" })
					restoreBranch = currentBranch
				} catch (checkoutErr) {
					result.error = `Could not check out \`${intentMain}\` to fast-forward (${checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)}). Reconcile manually: \`git checkout ${intentMain} && git merge --ff-only origin/${mainline}\`.`
					out.push(result)
					continue
				}
			}
			try {
				execFileSync("git", ["merge", "--ff-only", `origin/${mainline}`], {
					stdio: "pipe",
				})
				result.reconciled = true
			} catch {
				// Try the local mainline as a fallback (some repos may
				// not have origin/<mainline> tracked).
				try {
					execFileSync("git", ["merge", "--ff-only", mainline], {
						stdio: "pipe",
					})
					result.reconciled = true
				} catch (mergeErr) {
					result.error = `Fast-forward of \`${intentMain}\` to \`${mainline}\` failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}. Reconcile manually: \`git checkout ${intentMain} && git merge origin/${mainline}\`, resolve any conflicts, then re-run /haiku:pickup.`
				}
			}
			if (result.reconciled) {
				const push = pushBranchToOrigin(intentMain)
				result.pushed = push.ok
				if (!push.ok) {
					result.error = `Reconciled \`${intentMain}\` locally but push to origin failed: ${push.error}. The next agent on this branch needs to push manually.`
				}
			}
		} catch (err) {
			result.error = `Misrouted-merge reconciliation threw: ${err instanceof Error ? err.message : String(err)}`
		} finally {
			// Restore the original branch unconditionally. If a throw
			// lands between checkout and the merge, restoring inside
			// the try block (where it lived previously) gets skipped
			// and the worktree is left on intentMain — every
			// subsequent write from the agent then lands on the wrong
			// branch. `finally` guarantees the restore runs.
			if (restoreBranch) {
				try {
					execFileSync("git", ["checkout", restoreBranch], { stdio: "pipe" })
				} catch {
					/* non-fatal — caller's branch enforcement will catch */
				}
			}
		}
		out.push(result)
	}
	return out
}

/** Helpers used by reconcileMisroutedStageMerges. Internal — not exported. */
function isAncestor(maybeAncestor: string, descendant: string): boolean {
	if (!maybeAncestor || !descendant) return false
	try {
		execFileSync(
			"git",
			["merge-base", "--is-ancestor", maybeAncestor, descendant],
			{ stdio: "ignore" },
		)
		return true
	} catch {
		return false
	}
}

function countAheadCommits(behindRef: string, aheadRef: string): number {
	const out = tryRun([
		"git",
		"rev-list",
		"--count",
		`${behindRef}..${aheadRef}`,
	])
	const n = Number.parseInt(out, 10)
	return Number.isFinite(n) ? n : 0
}

/** Check if we're on the intent's main branch (continuous mode) */
export function isOnIntentBranch(slug: string): boolean {
	return getCurrentBranch() === `haiku/${slug}/main`
}

/**
 * Ensure the working tree is on `haiku/<slug>/main`. Defensive helper
 * for terminal intent paths (intent_complete, already-completed) where
 * any prior subagent or merge resolution may have left HEAD on a stage
 * branch. No-op when already on intent main, when not a git repo, or
 * when intent main does not exist.
 *
 * Returns true on success (or no-op), false when the checkout failed.
 */
export function ensureOnIntentMain(slug: string): boolean {
	if (!isGitRepo()) return true
	const branch = `haiku/${slug}/main`
	if (!branchExists(branch)) return true
	if (getCurrentBranch() === branch) return true
	try {
		safeCheckout(["checkout", branch])
		return true
	} catch {
		return false
	}
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
			safeCheckout(["checkout", branch])
		}
	} else if (baseBranch) {
		// Fork from baseBranch in a single command so we never bounce the
		// working tree through baseBranch first. baseBranch must exist —
		// let `git checkout -b` throw if not so the caller knows.
		safeCheckout(["checkout", "-b", branch, baseBranch])
	} else {
		try {
			safeCheckout(["checkout", "-b", branch])
		} catch {
			/* already on it, can't create, or worktree locked */
		}
	}
	return branch
}

/**
 * Ensure the intent's consolidation branch `haiku/<slug>/main` exists.
 * Does NOT check it out — if main already exists, this is a no-op; if
 * it doesn't, we create it with `git branch <name> [<baseRef>]`. When
 * `baseRef` is provided we fork from that ref directly (no working-tree
 * change required); otherwise we fork from current HEAD.
 *
 * The no-checkout contract is load-bearing: this function runs at the
 * top of every `workflowStartStage` tick, and earlier revisions that used
 * `checkoutOrCreate` here would shove HEAD back to `haiku/<slug>/main`
 * on every workflow engine tick, even while work was in-flight on a stage branch.
 * That wiped editor state, threw away test runs, and forced manual
 * `git switch` every time the session resumed. Merging main is the
 * caller's job (via `mergeStageBranchIntoMain`'s temp-worktree path or
 * `mergeStageBranchForward`) — never by flipping the working tree here.
 *
 * No-op in non-git environments. Returns the branch name.
 */
export function createIntentBranch(slug: string, baseRef?: string): string {
	const branch = `haiku/${slug}/main`
	if (!isGitRepo()) return branch
	if (branchExists(branch)) return branch
	if (baseRef) {
		run(["git", "branch", branch, baseRef])
	} else {
		run(["git", "branch", branch])
	}
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
): {
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
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

	// Standard engine-merge contract: run the merge, classify any
	// failure as conflict-vs-other, return structured `isConflict` /
	// `conflictFiles` so callers can dispatch a resolver subagent or
	// surface a precise error.
	const mergeFn = (cwd?: string): { conflictFiles: string[] } => {
		const cwdArgs = cwd ? ["-C", cwd] : []
		try {
			run([
				"git",
				...cwdArgs,
				"merge",
				fromBranch,
				"--no-ff",
				"--no-edit",
				"-m",
				`haiku: merge forward ${fromStage} → ${toStage}`,
			])
			return { conflictFiles: [] }
		} catch (mergeErr) {
			const conflicts = tryRun([
				"git",
				...cwdArgs,
				"diff",
				"--name-only",
				"--diff-filter=U",
			])
				.split("\n")
				.filter(Boolean)
			if (conflicts.length === 0) {
				tryRun(["git", ...cwdArgs, "merge", "--abort"])
				throw mergeErr
			}
			return { conflictFiles: conflicts }
		}
	}

	// Three primary-checkout positions, mirroring `mergeStageBranchIntoMain`:
	//
	//   - Primary already on toBranch → merge in-place.
	//   - Primary on something else → reuse the worktree that owns
	//     toBranch if one exists (e.g. the user has it checked out), or
	//     fall back to a transient temp worktree. Don't checkout
	//     directly — `git worktree add` would refuse if toBranch is
	//     held elsewhere, and a direct checkout of toBranch into the
	//     primary mutates the user's working tree on a branch they
	//     didn't ask to switch to.
	try {
		const outcome =
			current === toBranch
				? mergeFn()
				: withWorktreeOnBranch(toBranch, (tmpPath) => mergeFn(tmpPath))

		if (outcome.conflictFiles.length > 0) {
			return {
				success: false,
				isConflict: true,
				conflictFiles: outcome.conflictFiles,
				message: `Merge ${fromBranch} → ${toBranch} left ${outcome.conflictFiles.length} conflicted file(s): ${outcome.conflictFiles.join(", ")}. Resolve the conflicts on '${toBranch}' (edit files, \`git add\`, \`git commit\`), then retry the forward merge.`,
			}
		}
		return { success: true, message: `merged ${fromBranch} → ${toBranch}` }
	} catch (err) {
		// `mergeFn` aborts on non-conflict failures; this is a
		// last-ditch defensive cleanup for throws from other layers
		// (e.g. `withWorktreeOnBranch` failing because of a dirty
		// foreign checkout).
		tryRun(["git", "merge", "--abort"])
		return {
			success: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Merge a completed stage branch back into the intent hub branch
 * (`haiku/{slug}/main`). Called when a stage is approved and the next stage
 * is about to start (or at intent completion for the final stage).
 *
 * Worktree strategy (handles all three primary-checkout positions):
 *
 *   - Primary already on intent-main → merge in-place. A temp-worktree
 *     attempt would fail with "branch already used by worktree."
 *   - Primary on the completing stage branch → switch primary to intent-main
 *     first (auto-committing engine-owned dirty files if needed), then merge
 *     in-place. This is the steady-state workflow position when stage work
 *     just finished, and is the post-stage transition the user sees.
 *   - Primary anywhere else → use a temp worktree on intent-main so the
 *     primary's checkout is undisturbed.
 *
 * Without this branch matrix, the function trips git's "already used by
 * worktree" guard whenever the primary is on intent-main, leaving the stage
 * stuck mid-completion.
 */
export function mergeStageBranchIntoMain(
	slug: string,
	stage: string,
): {
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
	if (!isGitRepo()) return { success: true, message: "no git" }
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`
	const mergeMessage = `haiku: merge stage ${stage} into main`

	try {
		run(["git", "rev-parse", "--verify", stageBranch])
		run(["git", "rev-parse", "--verify", mainBranch])

		const current = getCurrentBranch()

		// Run the merge and surface conflicts as structured data —
		// matches the contract used by every other engine merge site
		// so callers can dispatch a resolver subagent or surface a
		// precise error message uniformly.
		const mergeInTree = (cwd?: string): { conflictFiles: string[] } => {
			const cwdArgs = cwd ? ["-C", cwd] : []
			try {
				run([
					"git",
					...cwdArgs,
					"merge",
					stageBranch,
					"--no-ff",
					"--no-edit",
					"-m",
					mergeMessage,
				])
				return { conflictFiles: [] }
			} catch (mergeErr) {
				const conflicts = tryRun([
					"git",
					...cwdArgs,
					"diff",
					"--name-only",
					"--diff-filter=U",
				])
					.split("\n")
					.filter(Boolean)
				if (conflicts.length === 0) {
					tryRun(["git", ...cwdArgs, "merge", "--abort"])
					throw mergeErr
				}
				return { conflictFiles: conflicts }
			}
		}

		let mergeOutcome: { conflictFiles: string[] }
		if (current === mainBranch) {
			// Primary already on the target. Merge here.
			mergeOutcome = mergeInTree()
		} else if (current === stageBranch) {
			// Primary on the stage branch — the steady-state position for
			// in-progress stage work. Switch primary to intent-main, then merge.
			// Auto-commit any engine-owned dirty files first so the checkout
			// doesn't refuse with "would be overwritten."
			autoCommitDirtyTree(stageBranch)
			try {
				safeCheckout(["checkout", mainBranch])
			} catch (checkoutErr) {
				const raw =
					checkoutErr instanceof Error
						? checkoutErr.message
						: String(checkoutErr)
				return {
					success: false,
					message: `cannot switch primary worktree from '${stageBranch}' to '${mainBranch}' for stage merge: ${raw}`,
				}
			}
			mergeOutcome = mergeInTree()
		} else {
			// Primary on something else (foreign branch, mainline, etc.) —
			// don't disturb it. Prefer an existing worktree on
			// `mainBranch` (handles the "user has intent main checked out
			// in their own worktree" case); fall back to a temp worktree.
			mergeOutcome = withWorktreeOnBranch(mainBranch, (tmpPath) =>
				mergeInTree(tmpPath),
			)
		}

		if (mergeOutcome.conflictFiles.length > 0) {
			return {
				success: false,
				isConflict: true,
				conflictFiles: mergeOutcome.conflictFiles,
				message: `Merge ${stageBranch} → ${mainBranch} left ${mergeOutcome.conflictFiles.length} conflicted file(s): ${mergeOutcome.conflictFiles.join(", ")}. Resolve the conflicts on '${mainBranch}' (edit files, \`git add\`, \`git commit\`), then retry the stage completion.`,
			}
		}

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
 * Consolidate discrete stage branches into haiku/{slug}/main.
 * Used for orphan discrete intents that have per-stage branches but no main.
 * Creates the main branch from the last stage branch.
 *
 * Returns the main branch name plus a structured result. On merge
 * conflict, returns `{success: false, isConflict: true, conflictFiles}`
 * so callers can dispatch a resolver subagent or surface a precise
 * error — matches the contract used by `mergeFixChainWorktree` and
 * `mergeDiscoveryWorktree`. Routes the merge through
 * `withWorktreeOnBranch` so a foreign checkout of mainBranch doesn't
 * silently fail.
 */
export function consolidateStageBranches(
	slug: string,
	stages: string[],
): {
	branch: string
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
	const mainBranch = `haiku/${slug}/main`
	if (!isGitRepo())
		return { branch: mainBranch, success: true, message: "no git" }
	if (stages.length === 0)
		return { branch: mainBranch, success: true, message: "no stages" }

	try {
		const lastStageBranch = `haiku/${slug}/${stages[stages.length - 1]}`
		run(["git", "rev-parse", "--verify", lastStageBranch])

		// Path 1: main doesn't exist yet — create it from the last
		// stage branch. Pure ref creation, can't conflict.
		if (!branchExists(mainBranch)) {
			return {
				branch: checkoutOrCreate(mainBranch, lastStageBranch),
				success: true,
				message: `created ${mainBranch} from ${lastStageBranch}`,
			}
		}

		// Path 2: main exists — merge the latest stage into it.
		// Use a worktree on mainBranch (the user's, if they have one;
		// else a transient temp worktree) so a foreign checkout of
		// mainBranch doesn't break the merge. After the merge, run
		// the standard conflict-detection sweep so callers get the
		// same shape they'd get from any other engine merge.
		const mergeFn = (cwd: string): { conflictFiles: string[] } => {
			try {
				run([
					"git",
					"-C",
					cwd,
					"merge",
					lastStageBranch,
					"--no-ff",
					"--no-edit",
					"-m",
					"haiku: consolidate discrete stages into main",
				])
				return { conflictFiles: [] }
			} catch (mergeErr) {
				const conflicts = tryRun([
					"git",
					"-C",
					cwd,
					"diff",
					"--name-only",
					"--diff-filter=U",
				])
					.split("\n")
					.filter(Boolean)
				if (conflicts.length === 0) {
					tryRun(["git", "-C", cwd, "merge", "--abort"])
					throw mergeErr
				}
				return { conflictFiles: conflicts }
			}
		}

		const current = getCurrentBranch()
		const result =
			current === mainBranch
				? mergeFn(primaryRepoRoot())
				: withWorktreeOnBranch(mainBranch, (tmpPath) => mergeFn(tmpPath))

		if (result.conflictFiles.length > 0) {
			return {
				branch: mainBranch,
				success: false,
				isConflict: true,
				conflictFiles: result.conflictFiles,
				message: `merge conflict in ${result.conflictFiles.length} file(s) while consolidating ${lastStageBranch} into ${mainBranch}: ${result.conflictFiles.join(", ")}. Resolve the conflicts on '${mainBranch}' (edit files, \`git add\`, \`git commit\`), then retry.`,
			}
		}
		return {
			branch: mainBranch,
			success: true,
			message: `merged ${lastStageBranch} into ${mainBranch}`,
		}
	} catch (err) {
		// Defensive abort — `mergeFn` already aborts on non-conflict
		// failures, but a throw from a different layer (e.g.
		// `withWorktreeOnBranch` failing because of a dirty foreign
		// checkout) could leave a half-finished merge somewhere.
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
	return join(primaryRepoRoot(), ".haiku", "worktrees", slug, unit)
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
		primaryRepoRoot(),
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
	// Intent main must exist first; a healthy workflow engine always creates it before any stage.
	if (!branchExists(mainBranch)) createIntentBranch(slug)
	// Seed `.gitattributes` on intent main BEFORE the fork so the new
	// stage branch inherits the merge=union directive. Otherwise the
	// stage branch starts without it, every fix-chain / discovery
	// fork inherits the gap, and the integrator hits the same JSONL
	// conflicts that motivated the attribute in the first place.
	ensureIntentGitAttributes(slug)
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
 * WHY: the workflow engine must reside on the stage branch for the full lifetime of
 * the stage. Main is only updated at stage exit (merge stage → main).
 * Without this guard, any drift — user checkout, hook side-effect, an
 * earlier workflow engine bug — causes subsequent state writes to land on the wrong
 * branch, producing the exact "stage work shipped to dev without the
 * sweep fixes" problem.
 */
/**
 * Wrap a branch-switching `git checkout` with a worktree-lock guard.
 * P10 (2026-05-06): every checkout that switches branches must go
 * through this helper so locked worktrees can't be hijacked. The
 * file-level `git checkout <ref> -- <path>` form is NOT a branch
 * switch and doesn't need this guard — it's a content fetch.
 *
 * Throws on a locked worktree with a descriptive error so callers
 * surface the failure to the user. Callers that catch in turn
 * (ensureOnStageBranch, mergeStageBranchIntoMain, etc.) translate
 * the throw into their own structured "block: worktree_locked"
 * response.
 */
function safeCheckout(args: string[]): void {
	if (isCurrentWorktreeLocked()) {
		const targetHint = args[args.length - 1] ?? "<unknown>"
		throw new Error(
			`Refusing to \`git checkout ${args.join(" ")}\` — current worktree is locked. ` +
				`Locked worktrees are reserved for in-flight work and must not be hijacked ` +
				`by a parallel intent's branch enforcement. Run from a different worktree, ` +
				`or unlock with \`git worktree unlock\` if the lock is stale. ` +
				`(Target branch: ${targetHint})`,
		)
	}
	run(["git", ...args])
}

/**
 * Detect whether the current worktree is git-locked. P9 (2026-05-06):
 * a locked worktree is sacred — the engine must never `git checkout`
 * a branch on it, because that's how a parallel run_next from a
 * different intent hijacks the working tree of an in-flight
 * refactor. The lock file lives at `<git-dir>/worktrees/<name>/locked`
 * for added worktrees, or `<git-dir>/locked` for the primary repo.
 *
 * Best-effort: returns `false` on any read error rather than throwing,
 * because the lock check is a guard, not the main path.
 */
export function isCurrentWorktreeLocked(): boolean {
	try {
		const out = execFileSync("git", ["rev-parse", "--git-dir"], {
			encoding: "utf8",
			stdio: "pipe",
		}).trim()
		if (!out) return false
		// `git rev-parse --git-dir` may return a relative path. Resolve
		// against process.cwd() so the existsSync check works regardless.
		const absGitDir = out.startsWith("/") ? out : join(process.cwd(), out)
		const lockedPath = join(absGitDir, "locked")
		return existsSync(lockedPath)
	} catch {
		return false
	}
}

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
	 *  "merge_in_progress" — MERGE_HEAD/REBASE_HEAD etc present;
	 *  "worktree_locked" — current worktree is locked, refusing to checkout. */
	block?:
		| "dirty_tree"
		| "merge_conflict"
		| "merge_in_progress"
		| "worktree_locked"
	/** For block=dirty_tree: the paths git reported as "would be overwritten". */
	dirty_files?: string[]
	/** The branch we were trying to reach when blocked. */
	target_branch?: string
} {
	if (!isGitRepo())
		return { ok: true, branch: "", message: "no git", switched: false }

	// P9 (2026-05-06): hard refuse on locked worktrees. If the current
	// working tree is locked (typically because another in-flight
	// engine run or a manual `git worktree lock` reserved it for a
	// specific purpose), DO NOT switch branches under it. Surface a
	// clear error so the caller (or the user) sees what happened
	// instead of a silently-hijacked tree.
	if (isCurrentWorktreeLocked()) {
		const targetBranchHint = stage
			? `haiku/${slug}/${stage}`
			: `haiku/${slug}/main`
		const current = getCurrentBranch()
		// Already on the target — no checkout needed; locked tree is
		// fine because we're not switching anything.
		if (current === targetBranchHint) {
			return {
				ok: true,
				branch: current,
				message: `worktree locked; already on '${current}', no switch needed`,
				switched: false,
			}
		}
		return {
			ok: false,
			branch: current,
			message: `Refusing to checkout '${targetBranchHint}' on a locked worktree (current: '${current}'). Locked worktrees are reserved for in-flight work and must not be hijacked by a parallel intent's branch enforcement. Run from a different worktree, or unlock this one with \`git worktree unlock\` if the lock is stale.`,
			switched: false,
			block: "worktree_locked",
			target_branch: targetBranchHint,
		}
	}

	const intentMain = `haiku/${slug}/main`
	const stageBranch = stage ? `haiku/${slug}/${stage}` : ""
	const targetBranch =
		stage && branchExists(stageBranch) ? stageBranch : intentMain
	const current = getCurrentBranch()

	if (!branchExists(targetBranch)) {
		// Pre-init state: the intent's branches haven't been created yet.
		// We can't enforce what doesn't exist, but we MUST avoid leaving the
		// agent on a foreign intent's branch — otherwise the caller
		// (workflowStartStage → createIntentBranch) would fork haiku/{slug}/main
		// off that foreign branch and inherit its history. Fall back to the
		// repo mainline (main/master/etc.) so branch creation forks from a
		// clean, neutral base.
		const mainlineBranch = getMainlineBranch()
		if (
			mainlineBranch &&
			branchExists(mainlineBranch) &&
			current !== mainlineBranch
		) {
			// Refuse if mainline is held by a foreign worktree —
			// `git checkout mainline` would fail with the cryptic
			// "branch already checked out at <path>" error. Surface a
			// clear, actionable message instead so the agent can ask
			// the user to move their checkout (or so the operator
			// running interactively sees the problem).
			const mainlineHolder = findWorktreeForBranch(mainlineBranch)
			if (mainlineHolder && mainlineHolder !== process.cwd()) {
				return {
					ok: false,
					branch: current,
					message: `target branch '${targetBranch}' not yet created, and the fallback (repo mainline '${mainlineBranch}') is checked out at another worktree '${mainlineHolder}'. Move that checkout to a different branch or remove the worktree (\`git worktree remove --force ${mainlineHolder}\`), then retry.`,
					switched: false,
					target_branch: mainlineBranch,
				}
			}
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
					"--no-ff",
					"--no-edit",
					"-m",
					`haiku: merge intent-main → stage ${stage} (workflow engine branch enforcement)`,
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
			`haiku: auto-commit wip on ${branch} (workflow engine branch enforcement)`,
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
		// Worktree strategy mirrors mergeStageBranchIntoMain:
		//   - Primary already on intent-main → write in-place. A temp-worktree
		//     attempt would fail with "branch already used by worktree."
		//     Use a path-restricted commit (`git commit -- <relPath>`) so only
		//     the targeted file is committed, leaving any other dirty state
		//     on the primary worktree untouched.
		//   - Primary anywhere else → use a temp worktree (current behavior)
		//     so the primary's checkout is undisturbed.
		const current = getCurrentBranch()
		if (current === mainBranch) {
			const primaryRoot = primaryRepoRoot()
			const fullPath = join(primaryRoot, relPath)
			const dir = fullPath.replace(/\/[^/]+$/, "")
			mkdirSync(dir, { recursive: true })
			fsWriteFileSync(fullPath, content)
			// Stage just this file (in case there's other unrelated dirty state).
			run(["git", "-C", primaryRoot, "add", relPath])
			// Path-restricted commit: only this file's diff is committed,
			// even if the index has other staged changes from concurrent work.
			const diff = tryRun([
				"git",
				"-C",
				primaryRoot,
				"diff",
				"--cached",
				"--name-only",
				"--",
				relPath,
			])
			if (diff.trim()) {
				run([
					"git",
					"-C",
					primaryRoot,
					"commit",
					"-m",
					commitMessage,
					"--",
					relPath,
				])
			}
		} else {
			withWorktreeOnBranch(mainBranch, (tmpPath) => {
				const fullPath = join(tmpPath, relPath)
				const dir = fullPath.replace(/\/[^/]+$/, "")
				mkdirSync(dir, { recursive: true })
				fsWriteFileSync(fullPath, content)
				// Stage + commit. --allow-empty handles the no-op write case
				// gracefully; we'd rather have a no-op commit than bail.
				run(["git", "-C", tmpPath, "add", relPath])
				const status = tryRun(["git", "-C", tmpPath, "status", "--porcelain"])
				if (status.trim()) {
					run(["git", "-C", tmpPath, "commit", "-m", commitMessage])
				}
			})
		}
		return { ok: true, message: `wrote ${relPath} on ${mainBranch}` }
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Surgically copy files matching a path prefix from a source branch
 *  onto intent main, then commit. Used by the revisit flow to carry
 *  feedback files forward from stage branches without merging the
 *  rest of those branches' (possibly unreviewed) work.
 *
 *  Behavior:
 *   - No-op when not in a git repo, or when the source branch / intent
 *     main branch don't exist, or when the source branch has no files
 *     matching the prefix.
 *   - In-place when current branch is intent main; temp-worktree
 *     otherwise (mirrors writeOnIntentMain's strategy).
 *   - Uses `git checkout <sourceBranch> -- <pathPrefix>` to materialise
 *     the files, then `git add` + `git commit` only the matched paths
 *     so other dirty state is left untouched.
 *
 *  Returns { ok, message } describing what happened (paths copied,
 *  no-op reason, or error). */
export function checkoutFromBranchOnIntentMain(
	slug: string,
	sourceBranch: string,
	pathPrefix: string,
	commitMessage: string,
): { ok: boolean; message: string; paths_copied: string[] } {
	const empty = { paths_copied: [] as string[] }
	if (!isGitRepo()) return { ok: true, message: "no git", ...empty }
	const mainBranch = `haiku/${slug}/main`
	if (!branchExists(mainBranch))
		return { ok: false, message: `${mainBranch} does not exist`, ...empty }
	if (!branchExists(sourceBranch))
		return {
			ok: true,
			message: `source branch ${sourceBranch} does not exist — skipping`,
			...empty,
		}
	const matched = tryRun([
		"git",
		"ls-tree",
		"-r",
		"--name-only",
		sourceBranch,
		"--",
		pathPrefix,
	])
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
	if (matched.length === 0)
		return {
			ok: true,
			message: `no files under ${pathPrefix} on ${sourceBranch} — skipping`,
			...empty,
		}

	const runCheckout = (cwd: string) => {
		run(["git", "-C", cwd, "checkout", sourceBranch, "--", pathPrefix])
		run(["git", "-C", cwd, "add", "--", pathPrefix])
		const status = tryRun([
			"git",
			"-C",
			cwd,
			"diff",
			"--cached",
			"--name-only",
			"--",
			pathPrefix,
		])
		if (status.trim()) {
			run(["git", "-C", cwd, "commit", "-m", commitMessage, "--", pathPrefix])
		}
	}

	try {
		const current = getCurrentBranch()
		if (current === mainBranch) {
			runCheckout(primaryRepoRoot())
		} else {
			withWorktreeOnBranch(mainBranch, (tmpPath) => {
				runCheckout(tmpPath)
			})
		}
		return {
			ok: true,
			message: `copied ${matched.length} file(s) from ${sourceBranch} (${pathPrefix})`,
			paths_copied: matched,
		}
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
			...empty,
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
		// permission or network issue doesn't crash the workflow engine.
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

/** Idempotently seed an intent dir's `.gitattributes` so engine-owned
 *  append-only event streams (`action-log.jsonl`, `write-audit.jsonl`)
 *  use git's `merge=union` strategy. These files are written from
 *  every branch the engine touches; without `merge=union`, every
 *  fix-chain merge conflicts on the JSONL append and an integrator
 *  has to hand-resolve a file the engine fully owns — eventually
 *  tripping the integrator cap and stranding the chain's real
 *  content on a dead worktree.
 *
 *  Called from the merge functions (discovery, unit, fix-chain) so
 *  intents created before this fix get auto-repaired on the next
 *  tick. The intent-create path also seeds the file at intent
 *  creation. Idempotent: writes only when the file is missing OR
 *  doesn't already include the union directive (catches the
 *  upgrade-an-old-intent case). */
function ensureIntentGitAttributes(slug: string): void {
	if (!isGitRepo()) return
	try {
		const intentDir = join(primaryRepoRoot(), ".haiku", "intents", slug)
		if (!existsSync(intentDir)) return
		const wantedLines = [
			"action-log.jsonl merge=union",
			"write-audit.jsonl merge=union",
		]
		const banner = [
			"# Engine-owned append-only event streams. `merge=union` tells git",
			"# to concatenate both sides on conflict — these files are pure",
			"# event streams and never benefit from manual conflict resolution.",
		]
		const desiredContent = `${[...banner, ...wantedLines].join("\n")}\n`

		const intentMain = `haiku/${slug}/main`
		const rel = `.haiku/intents/${slug}/.gitattributes`

		// Stamp the attribute on intent main specifically — that's the
		// parent of every stage / unit / fix-chain / discovery branch,
		// so every fork inherits it. Stamping on whatever's currently
		// checked out (e.g. a stage branch) leaves intent main without
		// the attribute, so the next NEW stage forked off main starts
		// without it and the integrator gets the same conflicts.
		const stamp = (cwd?: string): void => {
			const cwdArgs = cwd ? ["-C", cwd] : []
			const absPath = cwd ? join(cwd, rel) : join(primaryRepoRoot(), rel)
			let existing = ""
			try {
				if (existsSync(absPath)) existing = readFileSync(absPath, "utf8")
			} catch {
				/* missing or unreadable — fall through and overwrite */
			}
			if (wantedLines.every((l) => existing.includes(l))) return
			fsWriteFileSync(absPath, desiredContent)
			tryRun(["git", ...cwdArgs, "add", "--", rel])
			tryRun([
				"git",
				...cwdArgs,
				"commit",
				"-m",
				`haiku: seed .gitattributes (merge=union for engine event streams) for ${slug}`,
				"--",
				rel,
			])
		}

		if (!branchExists(intentMain)) return // pre-init; intent-create path handles it
		// Stamp 1/2: intent main. Future forks (stage branches /
		// fix-chains / discovery / units) inherit from here, so this
		// is the load-bearing stamp. Use a worktree on intent main
		// (the user's, if they have one; else transient) so we don't
		// disturb the engine's current checkout.
		const current = getCurrentBranch()
		if (current === intentMain) {
			stamp()
		} else {
			try {
				withWorktreeOnBranch(intentMain, (tmpPath) => stamp(tmpPath))
			} catch {
				/* Foreign worktree dirty etc. — fall through to the
				 *  current-branch stamp; intent main will get the
				 *  attribute on the next merge through. */
			}
		}
		// Stamp 2/2: the currently checked-out branch (if not intent
		// main itself, already done above). Why both: a legacy intent
		// already has stage / fix-chain branches FORKED off intent
		// main without the attribute. Stamping on intent main alone
		// fixes future forks but leaves the existing branches blind.
		// The current branch is the one about to merge (caller is
		// about to execute a merge into a base branch), so stamping
		// here is what un-strands the in-flight chain.
		if (current && current !== intentMain) {
			stamp()
		}
	} catch {
		/* never crash a merge over a best-effort attribute seed */
	}
}

/** Force-delete a branch and warn (to stderr) when the delete is
 *  silently skipped because the branch is held by another worktree.
 *  Returns true when the branch is gone (deleted now or already
 *  absent), false when something held it back.
 *
 *  Use this instead of bare `tryRun(["git", "branch", "-D", b])` at
 *  cleanup sites that own the branch lifecycle (post-merge reap of
 *  fix-chain / discovery / unit branches). The bare tryRun pattern
 *  swallows the "branch is checked out at <path>" error silently;
 *  the branch leaks and a future re-creation collides with the
 *  zombie. The warning surfaces the leak in MCP stderr so operators
 *  can investigate. */
function deleteBranchWithWarning(branch: string, context: string): boolean {
	if (!isGitRepo()) return true
	if (!branchExists(branch)) return true
	const ok = tryRun(["git", "branch", "-D", branch]) !== ""
	if (ok) return true
	// Diagnose so the stderr line is actionable.
	const holder = findWorktreeForBranch(branch)
	if (holder) {
		console.error(
			`[haiku] could not delete branch '${branch}' (${context}) — held by worktree '${holder}'. The branch will leak; remove the worktree (\`git worktree remove --force ${holder}\`) and rerun cleanup, or delete the branch manually.`,
		)
	} else {
		console.error(
			`[haiku] could not delete branch '${branch}' (${context}). The branch will leak; investigate via \`git branch -D ${branch}\`.`,
		)
	}
	return false
}

/** Find the path of an existing worktree currently checked out on
 *  `branch`, or null when no worktree owns the branch. Parses
 *  `git worktree list --porcelain`, matching the canonical
 *  `refs/heads/<branch>` shape git emits.
 *
 *  Used by `withWorktreeOnBranch` to avoid the "branch is already
 *  checked out elsewhere" failure mode `git worktree add` hits when a
 *  user (or a sibling clone / sandbox) is parked on the same branch
 *  the engine wants to merge into. */
function findWorktreeForBranch(branch: string): string | null {
	if (!isGitRepo() || !branch) return null
	let raw: string
	try {
		raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch {
		return null
	}
	const target = `refs/heads/${branch}`
	let curPath: string | null = null
	for (const line of raw.split("\n")) {
		if (line.startsWith("worktree ")) {
			curPath = line.slice("worktree ".length).trim()
		} else if (line.startsWith("branch ") && curPath) {
			const b = line.slice("branch ".length).trim()
			if (b === target) return curPath
		} else if (line === "") {
			curPath = null
		}
	}
	return null
}

/** Inspect the worktree at `path` and report whether it has anything
 *  blocking a safe merge. Returns null when clean; otherwise returns a
 *  struct describing what's dirty so `withWorktreeOnBranch` can build
 *  an actionable error message that names what the user needs to deal
 *  with (uncommitted tracked changes vs. untracked files have
 *  different remediation paths — `git stash` covers tracked, but
 *  untracked needs `git clean` or `git add`).
 *
 *  Fails closed: when git can't be queried at all, returns "unknown"
 *  so the caller refuses the merge rather than risk stomping on edits. */
function inspectWorktreeDirtyState(path: string): {
	tracked: boolean
	untracked: boolean
	unknown?: boolean
} | null {
	let raw: string
	try {
		raw = execFileSync("git", ["-C", path, "status", "--porcelain"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch {
		return { tracked: false, untracked: false, unknown: true }
	}
	if (raw.trim().length === 0) return null
	let tracked = false
	let untracked = false
	for (const line of raw.split("\n")) {
		if (!line) continue
		// `git status --porcelain` rows start with a 2-char status:
		// "??" = untracked, "!!" = ignored (we don't ask for these),
		// any other combination = tracked change in index/worktree.
		if (line.startsWith("??")) untracked = true
		else tracked = true
	}
	return { tracked, untracked }
}

/** Run `fn` in a worktree on `branch`. Prefers an existing worktree
 *  already checked out at `branch` (e.g. the user's own checkout, or
 *  a sibling sandbox); falls back to a transient temp worktree.
 *
 *  WHY: `git worktree add` refuses when `branch` is already checked
 *  out at any worktree on the machine — `withTempWorktree(branch)`
 *  throws in that case, leaving merges silently stuck (the discovery
 *  / unit / fix-chain merge functions catch the throw and log to
 *  stderr). Using the existing worktree lets the merge land in
 *  whatever path already owns the branch, which is what `git` itself
 *  would do.
 *
 *  Throws when an existing worktree on `branch` is dirty — landing a
 *  merge there would clobber the user's WIP. The caller's catch
 *  block returns `{success: false, message}` so the agent surfaces
 *  the error and the user can commit/stash and retry. */
function withWorktreeOnBranch<T>(branch: string, fn: (path: string) => T): T {
	const existing = findWorktreeForBranch(branch)
	if (existing) {
		const dirty = inspectWorktreeDirtyState(existing)
		if (dirty) {
			// Build an actionable message that names exactly what's
			// blocking — tracked changes need commit/stash, untracked
			// files need add or clean. Naming both keeps the user from
			// trying `git stash` and getting the surprise that it
			// didn't help.
			let kinds: string
			let remediation: string
			if (dirty.unknown) {
				kinds = "an indeterminate state"
				remediation = "inspect the worktree manually"
			} else if (dirty.tracked && dirty.untracked) {
				kinds = "uncommitted changes and untracked files"
				remediation =
					"commit or stash the tracked changes AND add or clean the untracked files"
			} else if (dirty.tracked) {
				kinds = "uncommitted changes"
				remediation = "commit or stash them"
			} else {
				kinds = "untracked files"
				remediation = "add them to a commit or `git clean` them"
			}
			throw new Error(
				`branch '${branch}' is checked out at '${existing}' with ${kinds} — ${remediation} so the workflow engine can merge into it`,
			)
		}
		return fn(existing)
	}
	return withTempWorktree(branch, fn)
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
	// Seed `.gitattributes` BEFORE the fork — see notes in
	// `createFixChainWorktree`.
	ensureIntentGitAttributes(slug)
	const unitBranch = `haiku/${slug}/${unit}`
	const worktreeBase = join(primaryRepoRoot(), ".haiku", "worktrees", slug)
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
): {
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
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

	// Auto-repair legacy intents — see notes on the same call in
	// `mergeFixChainWorktree`.
	ensureIntentGitAttributes(slug)

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
		// State-overwrite handling (engine-owned files always take stage side):
		// the unit branch carries frozen-at-fork copies of stage state files
		// — `stages/<stage>/units/<unit>.md`, `stages/<stage>/state.json`,
		// `stages/<stage>/baseline.json`. When git merges and there's no
		// conflict marker (because, say, the unit branch never touched them
		// after fork), git silently takes one side or the other based on
		// 3-way merge math, and we've seen the unit-branch's stale state.json
		// overwrite the stage's advanced state.json — regressing phase from
		// `review` back to `elaborate`. To prevent that, we use
		// `git merge --no-commit --no-ff` to stage the merge without committing,
		// then force-checkout the engine-owned files to "ours" (the stage
		// side, which is the authoritative live workflow engine state), then
		// commit. This makes state regression impossible regardless of
		// whether git would have flagged a conflict.
		//
		// True conflicts on agent-authored content (e.g. an artifact file
		// edited differently on both sides) still surface as unresolved
		// `--diff-filter=U` paths, and the merge fails loudly so the caller
		// can return a structured `merge_conflict` action listing them.
		const onStageBranch = getCurrentBranch() === stageBranch
		const engineOwnedRelPaths = [
			`.haiku/intents/${slug}/stages/${stage}/units/${unit}.md`,
			`.haiku/intents/${slug}/stages/${stage}/state.json`,
			`.haiku/intents/${slug}/stages/${stage}/baseline.json`,
		]
		const mergeHere = (cwd?: string) => {
			const gitC = (cwd ? ["-C", cwd] : []) as string[]
			const mergeArgs = [
				"git",
				...gitC,
				"merge",
				unitBranch,
				"--no-commit",
				"--no-ff",
			]
			let mergeErr: unknown = null
			try {
				run(mergeArgs)
			} catch (err) {
				mergeErr = err
			}

			// Always force engine-owned files back to stage ("ours") side
			// before committing — independent of whether they appear in the
			// conflict list. This closes the silent-overwrite path that bit
			// us when the unit branch's frozen state.json overwrote the
			// stage's advanced state.json on a conflict-free merge.
			for (const relPath of engineOwnedRelPaths) {
				// `checkout --ours` is a no-op when the path doesn't exist
				// in the merge result; tryRun swallows that.
				tryRun(["git", ...gitC, "checkout", "--ours", "--", relPath])
				tryRun(["git", ...gitC, "add", "--", relPath])
			}

			// If git refused the merge before applying it (e.g. dirty
			// working tree on the parent), `git status` will report no
			// in-progress merge — re-throw the original error so the
			// caller can classify it.
			const inProgress = tryRun([
				"git",
				...gitC,
				"rev-parse",
				"--quiet",
				"--verify",
				"MERGE_HEAD",
			])
			if (!inProgress) {
				if (mergeErr) throw mergeErr
				// No in-progress merge AND no error — already up-to-date.
				return
			}

			// After auto-resolving engine-owned paths, look for remaining
			// real conflicts. Any unmerged path that isn't engine-owned is
			// agent-authored content the workflow engine cannot resolve;
			// surface it as a real conflict.
			const conflicts = tryRun([
				"git",
				...gitC,
				"diff",
				"--name-only",
				"--diff-filter=U",
			])
				.split("\n")
				.filter(Boolean)
			const realConflicts = conflicts.filter(
				(p) => !engineOwnedRelPaths.includes(p),
			)
			if (realConflicts.length > 0) {
				const e = new Error(
					`merge_conflict: real conflicts on agent-authored content require resolution: ${realConflicts.join(", ")}`,
				)
				;(e as unknown as { conflictPaths: string[] }).conflictPaths =
					realConflicts
				throw e
			}

			run([
				"git",
				...gitC,
				"commit",
				"--no-edit",
				"-m",
				`haiku: merge ${unit} into ${stage}`,
			])
		}
		if (onStageBranch) {
			mergeHere()
		} else {
			withWorktreeOnBranch(stageBranch, (tmpPath) => mergeHere(tmpPath))
		}

		// Reap the unit worktree and local branch — its work is now on the
		// stage branch. Do NOT delete the remote unit branch here: if the
		// team opened a PR/MR against it for review, deletion would yank
		// the source out from under the review. Remote branch cleanup, if
		// desired, should happen at stage-complete (after fan-in) or be
		// driven by the review provider.
		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		deleteBranchWithWarning(unitBranch, `unit-merge cleanup for ${unit}`)

		return {
			success: true,
			message: `merged ${unitBranch} → ${stageBranch}`,
		}
	} catch (err) {
		// Match the structured envelope every other engine merge site
		// returns: when this is a real merge_conflict on agent content,
		// surface `isConflict: true`, the file paths, and a resolution
		// message naming `git add` and `git commit`. Anything else is
		// returned with the bare message (corruption, missing branch,
		// dirty tree) — same shape as before.
		const message = err instanceof Error ? err.message : String(err)
		const conflictPaths = (err as { conflictPaths?: string[] } | null)
			?.conflictPaths
		if (Array.isArray(conflictPaths) && conflictPaths.length > 0) {
			return {
				success: false,
				isConflict: true,
				conflictFiles: conflictPaths,
				message: `Merge ${unitBranch} → ${stageBranch} left ${conflictPaths.length} conflicted file(s): ${conflictPaths.join(", ")}. Resolve the conflicts on '${stageBranch}' (edit files, \`git add\`, \`git commit\`), then retry the unit merge.`,
			}
		}
		return { success: false, message }
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
		primaryRepoRoot(),
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
	// Seed `.gitattributes` BEFORE the fork — see notes in
	// `createFixChainWorktree`.
	ensureIntentGitAttributes(slug)
	const discBranch = discoveryBranchName(slug, stage, template)
	const worktreePath = discoveryWorktreePath(slug, stage, template)
	const worktreeBase = join(primaryRepoRoot(), ".haiku", "worktrees", slug)

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

	// Auto-repair legacy intents — see notes on the same call in
	// `mergeFixChainWorktree`. Discovery worktrees write to the same
	// engine event streams during their tick, so they hit the same
	// merge=union need.
	ensureIntentGitAttributes(slug)

	if (!existsSync(worktreePath)) {
		deleteBranchWithWarning(
			discBranch,
			`discovery cleanup (no worktree) for ${slug}/${stage}/${template}`,
		)
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
					"--no-ff",
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
				"--no-ff",
				"--no-edit",
				"-m",
				`haiku: merge discovery ${template} into ${stage}`,
			])
		}
		if (onBaseBranch) {
			// Discovery branches commit engine-owned state inside
			// `.haiku/intents/{slug}/` (action-log.jsonl, baseline.json).
			// If the base worktree has those same files untracked or modified,
			// `git merge` aborts with "untracked working tree files would be
			// overwritten" — a non-conflict error the caller silently swallows,
			// re-emitting the same fan-out instructions every tick. Snapshot
			// any pending engine state first so the merge has a clean tree.
			const intentDir = `.haiku/intents/${slug}`
			tryRun(["git", "add", "--", intentDir])
			const staged = tryRun([
				"git",
				"diff",
				"--cached",
				"--name-only",
				"--",
				intentDir,
			])
			if (staged) {
				// Use `run()` (not `tryRun()`) so a commit failure (pre-commit
				// hook rejection, index lock, etc.) surfaces the real error via
				// the outer try/catch rather than silently falling through to
				// `mergeHere()` with staged-but-uncommitted files (which would
				// produce a confusing "you have uncommitted changes" merge
				// error instead of the actual commit failure cause).
				run([
					"git",
					"commit",
					"-m",
					`haiku: snapshot engine state before merging discovery ${template} into ${stage}`,
				])
			}
			mergeHere()
		} else {
			withWorktreeOnBranch(baseBranch, (tmpPath) => mergeHere(tmpPath))
		}

		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		deleteBranchWithWarning(
			discBranch,
			`discovery merge cleanup for ${slug}/${stage}/${template}`,
		)

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
	deleteBranchWithWarning(
		discBranch,
		`discovery cleanup for ${slug}/${stage}/${template}`,
	)
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
	// Seed `.gitattributes` on the base branch BEFORE forking so the
	// fork inherits the union-merge directive on engine event streams.
	// Without this, a fork created before the attribute existed gets
	// no merge=union when it later merges back, and any concurrent
	// JSONL appends still trip the integrator cap.
	ensureIntentGitAttributes(slug)
	const fixBranch = fixChainBranchName(slug, scope, feedbackId)
	const worktreePath = fixChainWorktreePath(slug, scope, feedbackId)
	const worktreeBase = join(primaryRepoRoot(), ".haiku", "worktrees", slug)

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

	// Auto-repair: legacy intents (created before the merge=union
	// .gitattributes seed) get the file written + committed now, so
	// the upcoming JSONL append merges union-resolve instead of
	// stranding the chain.
	ensureIntentGitAttributes(slug)

	if (!existsSync(worktreePath)) {
		// Nothing to merge — either never created, or previous tick cleaned
		// up. Also defensively delete the branch if it's still around with
		// no worktree backing it.
		deleteBranchWithWarning(
			fixBranch,
			`fix-chain cleanup (no worktree) for ${slug}/${scope}/${feedbackId}`,
		)
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
					"--no-ff",
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
				"--no-ff",
				"--no-edit",
				"-m",
				`haiku: merge fix-chain ${feedbackId} into ${scope}`,
			])
		}
		if (onBaseBranch) {
			mergeHere()
		} else {
			withWorktreeOnBranch(baseBranch, (tmpPath) => mergeHere(tmpPath))
		}

		tryRun(["git", "worktree", "remove", worktreePath, "--force"])
		deleteBranchWithWarning(
			fixBranch,
			`fix-chain merge cleanup for ${slug}/${scope}/${feedbackId}`,
		)

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
	deleteBranchWithWarning(
		fixBranch,
		`fix-chain cleanup for ${slug}/${scope}/${feedbackId}`,
	)
	return {
		success: true,
		message: `cleaned up ${fixBranch}`,
	}
}

/**
 * Clean up all worktrees for an intent.
 */
export function cleanupIntentWorktrees(slug: string): void {
	const worktreeBase = join(primaryRepoRoot(), ".haiku", "worktrees", slug)
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
 *      (handles the final stage which workflowStartStage never got to consolidate).
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
			safeCheckout(["checkout", mainBranch])
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
 * Per workflow engine contract: on revisit from fromStage → targetStage, the target
 * stage merges in BOTH intent main (approved upstream changes) AND the
 * fromStage branch (unapproved future work — feedback files, in-flight
 * artifacts, state notes). This ensures feedback and artifacts from the
 * stage we are currently on survive the revisit even when those changes
 * haven't been merged into intent main yet.
 *
 * Non-destructive: never deletes branches. All commits on fromStage and
 * targetStage are preserved. Unit state reset (re-queueing to pending) is
 * the caller's responsibility and happens in a separate step via the workflow engine
 * state-writing code path.
 *
 * No-op in non-git environments.
 */
export function prepareRevisitBranch(
	slug: string,
	fromStage: string,
	targetStage: string,
): {
	success: boolean
	message: string
	isConflict?: boolean
	conflictFiles?: string[]
} {
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
			safeCheckout(["checkout", targetBranch])
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
					"--no-ff",
					"--no-edit",
					"-m",
					`haiku: merge main → ${targetStage} (revisit prep)`,
				])
			} catch (mergeErr) {
				const conflicts = listConflicts()
				if (conflicts.length > 0) {
					return {
						success: false,
						isConflict: true,
						conflictFiles: conflicts,
						message: `Merge main → ${targetStage} left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on branch '${targetBranch}' (edit files, \`git add\`, \`git commit\`), then retry the revisit — the workflow engine will detect main is already merged and continue with the ${fromStage} merge.`,
					}
				}
				return {
					success: false,
					message: `Merge main → ${targetStage} failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`,
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
						"--no-ff",
						"--no-edit",
						"-m",
						`haiku: merge ${fromStage} → ${targetStage} (revisit carries future-stage work back)`,
					])
				} catch (mergeErr) {
					const conflicts = listConflicts()
					if (conflicts.length > 0) {
						return {
							success: false,
							isConflict: true,
							conflictFiles: conflicts,
							message: `Merge ${fromStage} → ${targetStage} left ${conflicts.length} conflicted file(s): ${conflicts.join(", ")}. Resolve conflicts on branch '${targetBranch}' (edit files, \`git add\`, \`git commit\`), then retry the revisit. Main has already been merged cleanly and won't be remerged.`,
						}
					}
					return {
						success: false,
						message: `Merge ${fromStage} → ${targetStage} failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`,
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
