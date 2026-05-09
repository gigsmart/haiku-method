// test/_v4-fixtures.mjs — Shared test fixture helpers for the v4
// engine. Replaces the v3 pattern of writing `status: completed`
// directly into unit frontmatter.
//
// In v4 a unit is "complete" iff its branch is merged into the
// stage branch AND every required reviewer/approval role has
// signed. These helpers create the right git state + frontmatter
// so tests can assert on derived behavior without manually
// composing iterations[] / approvals{} / reviews{} every time.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

/**
 * Derive `{ repoRoot, slug }` from an intentDir of shape
 * `<repoRoot>/.haiku/intents/<slug>/` — that's the layout `initTestRepo`
 * produces, so every fixture helper that takes `intentDir` can recover
 * the branch context from it without the caller passing them
 * separately.
 */
function repoContextFromIntentDir(intentDir) {
	const slug = intentDir.split("/").pop() ?? ""
	// .haiku/intents/<slug>/ → strip three trailing segments
	const repoRoot = intentDir.split("/").slice(0, -3).join("/")
	return { repoRoot, slug }
}

function getCurrentBranch(repoRoot) {
	try {
		return git(repoRoot, "branch", "--show-current")
	} catch {
		return ""
	}
}

function branchExists(repoRoot, branch) {
	try {
		git(repoRoot, "rev-parse", "--verify", branch)
		return true
	} catch {
		return false
	}
}

/**
 * Run `fn` on the stage branch, commit any writes there, then return
 * to the original branch. The new cursor model (cursor-disk-state-stage-walk)
 * says stage-scoped writes (units, per-stage feedback, reviews,
 * approvals) live on the stage branch; intent main only holds
 * intent-creation + intent-review writes. Tests must respect this
 * invariant or `firstUnmergedStage` (which reads intent main's tree
 * to name the active stage) will see fixture state where production
 * sees only merged content.
 *
 * No-op if the test isn't a git repo (filesystem mode tests use this
 * helper too — falls through to just running `fn`).
 */
export function onStageBranch(repoRoot, slug, stage, fn) {
	if (!existsSync(join(repoRoot, ".git"))) {
		return fn()
	}
	const stageBranch = `haiku/${slug}/${stage}`
	const intentMain = `haiku/${slug}/main`
	const orig = getCurrentBranch(repoRoot)
	if (!branchExists(repoRoot, stageBranch)) {
		// Fork stage branch from intent main without changing checkout.
		git(repoRoot, "branch", stageBranch, intentMain)
	}
	if (orig !== stageBranch) {
		git(repoRoot, "checkout", stageBranch)
	}
	try {
		const result = fn()
		try {
			git(repoRoot, "add", "-A")
		} catch {
			/* nothing staged — fine */
		}
		try {
			git(repoRoot, "commit", "-m", `test: stage ${stage} fixture`)
		} catch {
			/* nothing to commit — fine */
		}
		return result
	} finally {
		// Restore the original branch even if `fn()` throws or the
		// add/commit fails. Without this, a fixture-setup throw leaves
		// the worktree on the stage branch and subsequent test code
		// runs against the wrong tree.
		if (orig && orig !== getCurrentBranch(repoRoot)) {
			try {
				git(repoRoot, "checkout", orig)
			} catch {
				/* best-effort — caller's branch enforcement will catch */
			}
		}
	}
}

/**
 * Create a unit's `.md` file at `stages/<stage>/units/<unit>.md` with
 * a v4-shaped frontmatter that simulates a fully-completed unit:
 *   - iterations[] terminating in `result: "advance"` on the LAST hat
 *   - reviews/approvals signed for every role passed in `roles`
 *   - the unit branch merged into the stage branch (or skipped if
 *     `mergeIntoStage: false` for in-flight tests)
 *
 * Defaults to a 3-hat sequence (researcher / distiller / verifier)
 * matching the canonical software-studio inception stage. Pass
 * `hats: [...]` to override.
 */
export function makeMergedUnit({
	intentDir,
	stage,
	unit,
	repoRoot,
	hats = ["researcher", "distiller", "verifier"],
	roles = ["spec", "user"],
	body = "",
	mergeIntoStage = true,
}) {
	const ctx = repoContextFromIntentDir(intentDir)
	const repo = repoRoot ?? ctx.repoRoot
	const slug = ctx.slug

	const at = new Date().toISOString()
	const iterations = hats.map((hat) => ({
		hat,
		started_at: at,
		completed_at: at,
		result: "advance",
	}))

	const reviews = {}
	const approvals = {}
	for (const role of roles) {
		reviews[role] = { at }
		approvals[role] = { at }
	}

	const frontmatter = {
		title: unit,
		started_at: at,
		iterations,
		reviews,
		approvals,
	}

	const unitPath = join(intentDir, "stages", stage, "units", `${unit}.md`)
	const content = matter.stringify(body || `# ${unit}\n`, frontmatter)

	// Stage-scoped: lives on the stage branch. The `mergeIntoStage`
	// flag is now misleading — every unit lives on its stage's branch
	// regardless. Kept as a knob for tests that opt out of git
	// commits entirely (filesystem-only fixtures).
	if (mergeIntoStage) {
		onStageBranch(repo, slug, stage, () => {
			mkdirSync(join(intentDir, "stages", stage, "units"), { recursive: true })
			writeFileSync(unitPath, content)
		})
	} else {
		mkdirSync(join(intentDir, "stages", stage, "units"), { recursive: true })
		writeFileSync(unitPath, content)
	}

	return { path: unitPath, frontmatter }
}

/**
 * Create a v4-shaped intent.md at `<intentDir>/intent.md`.
 *
 * 2026-05-08: pre-intent verifier added (cursor returns
 * `elaborate_review` (no stage) when intent.md lacks `verified_at`).
 * Test fixtures default to `verified_at` set so downstream tests walk
 * past the gate. Tests that ARE exercising the pre-intent gate should
 * pass `verifyOnCreate: false` to leave the field unset. Autopilot
 * bypasses the gate at the cursor level, so the field is irrelevant
 * there.
 */
export function makeIntent({
	intentDir,
	slug,
	studio = "software",
	mode = "continuous",
	approvals = {},
	sealed = false,
	verifyOnCreate = true,
	extraFm = {},
}) {
	mkdirSync(intentDir, { recursive: true })
	const at = new Date().toISOString()
	const fm = {
		title: slug,
		studio,
		mode,
		plugin_version: "4.0.0",
		started_at: at,
		approvals,
		sealed_at: sealed ? at : null,
		...(verifyOnCreate
			? { verified_at: at, verified_notes: "test fixture" }
			: {}),
		...extraFm,
	}
	const path = join(intentDir, "intent.md")
	writeFileSync(path, matter.stringify(`# ${slug}\n`, fm))
	// Commit on intent main so subsequent stage-branch forks inherit
	// intent.md as a tracked file. Without this, when `onStageBranch`
	// commits stage-scoped writes (which sweeps `git add -A`), the
	// uncommitted intent.md gets pulled along to the stage branch and
	// vanishes from intent main on the switch back.
	const { repoRoot } = repoContextFromIntentDir(intentDir)
	if (existsSync(join(repoRoot, ".git"))) {
		try {
			git(repoRoot, "add", path)
			git(repoRoot, "commit", "-m", `test: create intent ${slug}`)
		} catch {
			/* nothing to commit (e.g., reused fixture) */
		}
	}
	return { path, frontmatter: fm }
}

/**
 * Create a v4-shaped feedback file. `closed: true` synthesizes a
 * closed FB (terminal feedback-assessor advance landed). Default is
 * an open FB on the first fix-hat (no iterations[] yet).
 */
export function makeFeedback({
	intentDir,
	stage,
	id, // number (1, 8, 47) or any digit-prefixed string ("8", "08", "FB-008")
	title = "test feedback",
	body = "test body",
	origin = "user-chat",
	author = "user",
	target_unit = null,
	target_invalidates = [],
	closed = false,
}) {
	const fbDir = stage
		? join(intentDir, "stages", stage, "feedback")
		: join(intentDir, "feedback")
	mkdirSync(fbDir, { recursive: true })
	const at = new Date().toISOString()
	const fm = {
		title,
		origin,
		author,
		author_type: author === "user" ? "human" : "agent",
		created_at: at,
		source_ref: null,
		targets: { unit: target_unit, invalidates: target_invalidates },
		iterations: closed
			? [
					{
						hat: "researcher",
						started_at: at,
						completed_at: at,
						result: "advance",
					},
					{
						hat: "feedback-assessor",
						started_at: at,
						completed_at: at,
						result: "advance",
					},
				]
			: [],
		closed_at: closed ? at : null,
	}
	// Normalise the input id to a number, then 3-digit pad to match the
	// engine's on-disk convention. Accepts numbers (1, 8, 47), digit
	// strings ("8", "08", "008"), or "FB-NN" forms ("FB-8", "FB-008").
	// Some legacy tests use "FB-DRIFT-NN" or other non-standard prefixes
	// to tag specific FB classes — for those we extract the trailing
	// digits and warn loudly so future maintainers know the test relies
	// on the engine's prefix-match parser, not the fixture's.
	const idStr = String(id)
	let num
	if (typeof id === "number") {
		num = id
	} else {
		const m = idStr.match(/(\d+)\s*$/)
		num = m ? Number.parseInt(m[1], 10) : NaN
	}
	if (!Number.isFinite(num) || num < 1) {
		throw new Error(
			`makeFeedback: could not derive a positive integer id from ${JSON.stringify(id)}; pass a number or a digit-suffixed string`,
		)
	}
	const nnn = num.toString().padStart(3, "0")
	const fileSlug = title.replace(/[^a-z0-9]/gi, "-").toLowerCase()
	const path = join(fbDir, `${nnn}-${fileSlug}.md`)
	mkdirSync(fbDir, { recursive: true })
	writeFileSync(path, matter.stringify(body, fm))
	// FB lifecycle (mirrors production): the FB file lands on whatever
	// branch is checked out at creation time. The path
	// (`stages/<X>/feedback/<NNN>.md`) classifies which stage it
	// targets — the branch is incidental. In production, the agent
	// calls `haiku_feedback` while the engine has them on a stage
	// branch, so the FB lands there; the cursor on that same branch
	// reads it.
	const { repoRoot } = repoContextFromIntentDir(intentDir)
	if (existsSync(join(repoRoot, ".git"))) {
		try {
			git(repoRoot, "add", path)
			git(repoRoot, "commit", "-m", `test: feedback FB-${nnn}`)
		} catch {
			/* nothing to commit (e.g., already committed) */
		}
	}
	return { path, frontmatter: fm, num }
}

/**
 * Pre-write a verified per-stage elaboration artifact so the cursor's
 * elaborate gate (introduced 2026-05-08) doesn't trip in tests that
 * are exercising downstream behavior (discovery, decompose, waves,
 * reviews). Without this, every non-autopilot test would have to
 * manually emit the conversation cycle (`elaborate` → record →
 * `elaborate_review` → seal) before reaching the action under test.
 *
 * Tests that ARE testing the elaborate gate itself should not call
 * this — they want the gate to fire naturally.
 */
export function seedVerifiedElaboration({
	intentDir,
	stage,
	body = "Verified test elaboration.",
}) {
	const { repoRoot, slug } = repoContextFromIntentDir(intentDir)
	const at = new Date().toISOString()
	const fm = {
		recorded_at: at,
		intent: slug,
		stage,
		verified_at: at,
		verified_notes: "test fixture — bypasses gate",
	}
	const path = join(intentDir, "stages", stage, "elaboration.md")
	// Stage-scoped artifact: lives on the stage branch, not intent main.
	return onStageBranch(repoRoot, slug, stage, () => {
		mkdirSync(join(intentDir, "stages", stage), { recursive: true })
		writeFileSync(path, matter.stringify(body, fm))
		return path
	})
}

/**
 * Initialize a bare-bones git repo + intent dir layout for a test.
 * Returns { repoRoot, intentDir, slug }.
 */
export function initTestRepo({ repoRoot, slug }) {
	if (!existsSync(repoRoot)) mkdirSync(repoRoot, { recursive: true })
	try {
		git(repoRoot, "init")
		git(repoRoot, "config", "user.email", "test@haiku.test")
		git(repoRoot, "config", "user.name", "haiku test")
		git(repoRoot, "commit", "--allow-empty", "-m", "initial")
		git(repoRoot, "checkout", "-b", `haiku/${slug}/main`)
	} catch {
		/* git might already be initialized in the temp dir */
	}
	const intentDir = join(repoRoot, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })
	return { repoRoot, intentDir, slug }
}

/**
 * Build a project-local studio fixture under `<repoRoot>/.haiku/studios/<studio>/`.
 * The studio search path is project-local first, so this overrides the
 * plugin's built-in studios for tests.
 *
 * Layout:
 *   .haiku/studios/<studio>/STUDIO.md
 *   .haiku/studios/<studio>/stages/<stage>/STAGE.md
 *   .haiku/studios/<studio>/stages/<stage>/hats/<hat>.md
 *   .haiku/studios/<studio>/stages/<stage>/review-agents/<agent>.md
 *
 * Default stages declare a 3-hat sequence (planner / builder / verifier)
 * and one review agent (`code-reviewer`) with `review: ask`.
 */
export function makeStudio({
	repoRoot,
	studio = "test-studio",
	stages = [
		{
			name: "design",
			hats: ["planner", "builder", "verifier"],
			fix_hats: ["builder", "feedback-assessor"],
			review: "ask",
			review_agents: ["code-reviewer"],
		},
	],
}) {
	const studioRoot = join(repoRoot, ".haiku", "studios", studio)
	mkdirSync(studioRoot, { recursive: true })

	// STUDIO.md — declare stage list
	const studioFm = {
		stages: stages.map((s) => s.name),
		default_model: "sonnet",
	}
	writeFileSync(
		join(studioRoot, "STUDIO.md"),
		matter.stringify(`# ${studio}\n`, studioFm),
	)

	for (const stage of stages) {
		const stageRoot = join(studioRoot, "stages", stage.name)
		mkdirSync(join(stageRoot, "hats"), { recursive: true })
		mkdirSync(join(stageRoot, "review-agents"), { recursive: true })

		// STAGE.md
		const stageFm = {
			hats: stage.hats,
			fix_hats: stage.fix_hats ?? [],
			review: stage.review ?? "ask",
			...(stage.requires_design_direction
				? { requires_design_direction: true }
				: {}),
		}
		writeFileSync(
			join(stageRoot, "STAGE.md"),
			matter.stringify(`# ${stage.name}\n`, stageFm),
		)

		// Hat files
		for (const hat of stage.hats) {
			writeFileSync(
				join(stageRoot, "hats", `${hat}.md`),
				matter.stringify(`# ${hat}\n\nMandate body for ${hat} hat.\n`, {}),
			)
		}
		// Fix hats too (may overlap with hats)
		for (const hat of stage.fix_hats ?? []) {
			const path = join(stageRoot, "hats", `${hat}.md`)
			if (!existsSync(path)) {
				writeFileSync(
					path,
					matter.stringify(`# ${hat}\n\nFix-hat mandate for ${hat}.\n`, {}),
				)
			}
		}

		// Review-agent files
		for (const agent of stage.review_agents ?? []) {
			writeFileSync(
				join(stageRoot, "review-agents", `${agent}.md`),
				matter.stringify(
					`# ${agent}\n\nReview-agent mandate for ${agent}.\n`,
					{},
				),
			)
		}
	}

	// Commit on the current branch (typically intent main) so studio
	// config is tracked. Subsequent stage-branch forks inherit it.
	if (existsSync(join(repoRoot, ".git"))) {
		try {
			git(repoRoot, "add", studioRoot)
			git(repoRoot, "commit", "-m", `test: studio fixture ${studio}`)
		} catch {
			/* nothing to commit or already committed */
		}
	}

	return { studioRoot, studio }
}

/**
 * Drive a cursor tick the same way `haiku_run_next` does pre-cursor:
 *
 *   1. `reconcileIntentBranches` — fetch + FF intent main + FF stage
 *   2. `ensureOnStageBranch(slug, undefined)` — switch to intent main
 *      so `firstUnmergedStage` reads the authoritative tree
 *   3. `firstUnmergedStage` names the active stage from intent main's
 *      filesystem
 *   4. `ensureOnStageBranch(slug, activeStage)` — switch to the
 *      stage's branch where in-flight unit work lives
 *   5. `dispatchOrchestratorAction` — the cursor walk
 *
 * Tests that previously called `dispatchOrchestratorAction` directly
 * should call this helper instead — it gets them the same branch
 * dance the production engine performs, so fixture state written via
 * `onStageBranch` is correctly read by the cursor.
 */
export async function runTickWithBranchAlignment(repoRootOrSlug, maybeSlug) {
	// Two call shapes: (repoRoot, slug) or (slug) — when slug-only the
	// caller has already chdir'd to repoRoot.
	const slug = maybeSlug ?? repoRootOrSlug
	const repoRoot = maybeSlug ? repoRootOrSlug : process.cwd()
	const origCwd = process.cwd()
	process.chdir(repoRoot)
	try {
		const { dispatchOrchestratorAction } = await import(
			"../src/orchestrator/workflow/run-tick.js"
		)
		const { clearStudioCache } = await import("../src/studio-reader.js")
		const { ensureOnStageBranch, reconcileIntentBranches } = await import(
			"../src/git-worktree.js"
		)
		const { firstUnmergedStage } = await import(
			"../src/orchestrator/workflow/cursor.js"
		)
		const { parseFrontmatter } = await import("../src/state-tools.js")
		const { existsSync, readFileSync } = await import("node:fs")
		const { join } = await import("node:path")
		clearStudioCache()
		// Step 1: reconcile (no-op when there's no remote; cheap).
		reconcileIntentBranches(slug)
		// Step 2-4: branch dance.
		const intentFile = join(repoRoot, ".haiku", "intents", slug, "intent.md")
		if (existsSync(intentFile)) {
			const im = parseFrontmatter(readFileSync(intentFile, "utf8")).data
			const studio = im.studio || ""
			ensureOnStageBranch(slug, undefined)
			let activeStage = ""
			if (studio) {
				try {
					activeStage = firstUnmergedStage(slug, studio) || ""
				} catch {
					activeStage = im.active_stage || ""
				}
			} else {
				activeStage = im.active_stage || ""
			}
			ensureOnStageBranch(slug, activeStage || undefined)
		}
		return dispatchOrchestratorAction(slug, "")
	} finally {
		process.chdir(origCwd)
	}
}
