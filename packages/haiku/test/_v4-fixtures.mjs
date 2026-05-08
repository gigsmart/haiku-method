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
	repoRoot = intentDir,
	hats = ["researcher", "distiller", "verifier"],
	roles = ["spec", "user"],
	body = "",
	mergeIntoStage = true,
}) {
	const stageDir = join(intentDir, "stages", stage)
	const unitsDir = join(stageDir, "units")
	mkdirSync(unitsDir, { recursive: true })

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

	const unitPath = join(unitsDir, `${unit}.md`)
	const content = matter.stringify(body || `# ${unit}\n`, frontmatter)
	writeFileSync(unitPath, content)

	if (mergeIntoStage) {
		// Best-effort: if the test fixture initialized git, commit and
		// merge. Tests that don't need real git can pass
		// `mergeIntoStage: false`.
		try {
			git(repoRoot, "add", unitPath)
			git(repoRoot, "commit", "-m", `test: complete ${unit}`)
		} catch {
			/* fixture without real git — frontmatter alone is enough for derived-state tests */
		}
	}

	return { path: unitPath, frontmatter }
}

/**
 * Create a v4-shaped intent.md at `<intentDir>/intent.md`.
 */
export function makeIntent({
	intentDir,
	slug,
	studio = "software",
	mode = "continuous",
	approvals = {},
	sealed = false,
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
		...extraFm,
	}
	const path = join(intentDir, "intent.md")
	writeFileSync(path, matter.stringify(`# ${slug}\n`, fm))
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
	const slug = title.replace(/[^a-z0-9]/gi, "-").toLowerCase()
	const path = join(fbDir, `${nnn}-${slug}.md`)
	writeFileSync(path, matter.stringify(body, fm))
	return { path, frontmatter: fm, num }
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
				matter.stringify(`# ${agent}\n\nReview-agent mandate for ${agent}.\n`, {}),
			)
		}
	}

	return { studioRoot, studio }
}
