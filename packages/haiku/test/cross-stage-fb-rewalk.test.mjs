// E2E: cross-stage feedback re-walk.
//
// User scenario: pipeline drives stages 1 → 2 → 3 → 4 to merge. While
// at stage 4 (the active stage), user files a feedback item against
// stage 1. The fix loop on stage 1 closes the FB, and the engine
// must walk back to stage 1, re-merge stage 1, and progress through
// stages 2, 3, 4 again — not stop at stage 1, not skip stages 2-3,
// not deadlock.
//
// This is the architectural invariant from CLAUDE.md memory:
//   "active_stage = earliest stage with non-complete status; no
//    future stage may be complete while current isn't"
//
// In v4 the cursor reads `firstUnmergedStage` from branch state, so
// once stage 1's branch advances past intent main (via the fix-loop
// commits), the cursor returns "1" until 1 re-merges. Then "2" until
// 2's state validates, and so on.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const _SRC = join(HERE, "..", "src")

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}
function writeFm(path, fm, body = "") {
	writeFileSync(path, matter.stringify(body, fm))
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `cross-fb-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")
		const haikuDir = join(repoRoot, ".haiku")
		writeFileSync(join(haikuDir, "settings.yml"), "drift_detection: false\n")
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

// Mirror of the applyResponse helper from feedback-mid-flight-e2e.test.mjs.
// Kept inline so the two tests can evolve independently when their
// hat-sequence expectations diverge.
function applyResponse(intentDir, action, repoRoot, slug) {
	const at = new Date().toISOString()
	const stage = action.stage
	if (!stage) {
		if (action.action === "intent_review") {
			const intentMd = join(intentDir, "intent.md")
			const fm = readFm(intentMd)
			const apps =
				fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
			apps[action.role] = { at }
			writeFm(intentMd, { ...fm, approvals: apps })
		}
		return
	}
	const stageDir = join(intentDir, "stages", stage)
	const unitsDir = join(stageDir, "units")
	const fbDir = join(stageDir, "feedback")
	switch (action.action) {
		case "elaborate": {
			mkdirSync(unitsDir, { recursive: true })
			const path = join(unitsDir, "unit-01.md")
			if (!existsSync(path)) {
				writeFm(path, {
					title: "u1",
					depends_on: [],
					started_at: null,
					iterations: [],
					reviews: {},
					approvals: {},
					discovery: {},
				})
			}
			break
		}
		case "start_unit_hat": {
			for (const u of action.units || []) {
				const unitPath = join(unitsDir, `${u}.md`)
				if (!existsSync(unitPath)) continue
				const fm = readFm(unitPath)
				const its = Array.isArray(fm.iterations) ? fm.iterations : []
				its.push({
					hat: action.hat,
					started_at: at,
					completed_at: at,
					result: "advance",
				})
				writeFm(unitPath, {
					...fm,
					started_at: fm.started_at || at,
					iterations: its,
				})
			}
			break
		}
		case "start_feedback_hat": {
			for (const fbId of action.feedback_ids || []) {
				const files = readdirSync(fbDir).filter((f) => {
					const n = Number.parseInt(String(fbId).replace(/^FB-/i, ""), 10)
					const m = f.match(/^(\d+)-/)
					return m && Number.parseInt(m[1], 10) === n
				})
				for (const f of files) {
					const path = join(fbDir, f)
					const fm = readFm(path)
					const its = Array.isArray(fm.iterations) ? fm.iterations : []
					its.push({
						hat: action.hat,
						started_at: at,
						completed_at: at,
						result: "advance",
					})
					writeFm(path, { ...fm, iterations: its })
				}
			}
			break
		}
		case "close_feedback": {
			const files = readdirSync(fbDir).filter((f) => {
				const n = Number.parseInt(
					String(action.feedback_id).replace(/^FB-/i, ""),
					10,
				)
				const m = f.match(/^(\d+)-/)
				return m && Number.parseInt(m[1], 10) === n
			})
			for (const f of files) {
				const path = join(fbDir, f)
				const fm = readFm(path)
				writeFm(path, { ...fm, closed_at: at })
			}
			break
		}
		case "dispatch_review": {
			const unitFiles = existsSync(unitsDir)
				? readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
				: []
			for (const f of unitFiles) {
				const path = join(unitsDir, f)
				const fm = readFm(path)
				const reviews =
					fm.reviews && typeof fm.reviews === "object" ? fm.reviews : {}
				reviews[action.role] = { at }
				writeFm(path, { ...fm, reviews })
			}
			break
		}
		case "dispatch_approval": {
			const unitFiles = existsSync(unitsDir)
				? readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
				: []
			for (const f of unitFiles) {
				const path = join(unitsDir, f)
				const fm = readFm(path)
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				approvals[action.role] = { at }
				writeFm(path, { ...fm, approvals })
			}
			break
		}
		case "user_gate": {
			const unitFiles = existsSync(unitsDir)
				? readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
				: []
			for (const f of unitFiles) {
				const path = join(unitsDir, f)
				const fm = readFm(path)
				const reviews =
					fm.reviews && typeof fm.reviews === "object" ? fm.reviews : {}
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				reviews.user = reviews.user || { at }
				approvals.user = approvals.user || { at }
				writeFm(path, { ...fm, reviews, approvals })
			}
			break
		}
		case "dispatch_quality_gates": {
			const unitFiles = existsSync(unitsDir)
				? readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
				: []
			for (const f of unitFiles) {
				const path = join(unitsDir, f)
				const fm = readFm(path)
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				approvals.quality_gates = { at }
				writeFm(path, { ...fm, approvals })
			}
			break
		}
		case "merge_stage": {
			const stageBranch = `haiku/${slug}/${stage}`
			const mainBranch = `haiku/${slug}/main`
			try {
				try {
					git(repoRoot, "checkout", "-q", stageBranch)
				} catch {
					git(repoRoot, "checkout", "-q", "-b", stageBranch)
				}
				try {
					git(repoRoot, "add", "-A")
					git(repoRoot, "commit", "-m", `complete ${stage}`)
				} catch {
					git(
						repoRoot,
						"commit",
						"--allow-empty",
						"-m",
						`complete ${stage} (sentinel)`,
					)
				}
				git(repoRoot, "checkout", "-q", mainBranch)
				git(
					repoRoot,
					"merge",
					"--no-ff",
					"--no-edit",
					"-m",
					`merge ${stage}`,
					stageBranch,
				)
			} catch {
				/* may already be merged */
			}
			break
		}
		default:
			break
	}
}

async function runTick(slug) {
	const { runTickWithBranchAlignment } = await import("./_v4-fixtures.mjs")
	return runTickWithBranchAlignment(slug)
}

function buildFourStageStudio(repoRoot) {
	makeStudio({
		repoRoot,
		studio: "fb4",
		stages: [
			{
				name: "s1",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "s2",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "s3",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "s4",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
		],
	})
}

test("e2e (interpretation A): FB on s1 lands while s4 is in flight → cursor walks Track B back, fix loop closes, pipeline seals", async () => {
	// Common interpretation of "user on stage 4 leaves FB on stage 1":
	// stages 1-3 are merged, stage 4 is the active (in-progress) stage,
	// the user notices a gap on stage 1's output. activeStage=s4 while
	// FB lands, so Track B (which walks 0..activeStage) picks it up
	// before Track A continues s4. This is the working path.
	if (!HAS_GIT) return
	await withRepo("cross-fb-A", async ({ repoRoot, intentDir, slug }) => {
		buildFourStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb4",
			mode: "continuous",
			extraFm: { stages: ["s1", "s2", "s3", "s4"] },
		})

		const seen = []
		let injectedFb = false
		let s3MergedBeforeInject = false
		let fbClosedSeen = false
		let postInjectS1FixHats = 0
		const MAX_TICKS = 400

		for (let i = 0; i < MAX_TICKS; i++) {
			const action = await runTick(slug)
			seen.push(
				`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
			)

			// Inject FB on s1 once s3 has merged AND s4 has started a
			// hat — that puts activeStage at s4 with Track B coverage of
			// s1.
			if (
				!injectedFb &&
				s3MergedBeforeInject &&
				action.action === "start_unit_hat" &&
				action.stage === "s4"
			) {
				applyResponse(intentDir, action, repoRoot, slug)
				makeFeedback({
					intentDir,
					stage: "s1",
					id: "FB-001",
					title: "stage-s1 needs revision",
					body: "user-noticed gap on s1 while s4 was in flight",
					origin: "user-chat",
					author: "user",
				})
				injectedFb = true
				continue
			}

			if (
				!s3MergedBeforeInject &&
				action.action === "merge_stage" &&
				action.stage === "s3"
			) {
				applyResponse(intentDir, action, repoRoot, slug)
				s3MergedBeforeInject = true
				continue
			}

			if (injectedFb) {
				if (action.action === "start_feedback_hat" && action.stage === "s1") {
					postInjectS1FixHats++
				}
				if (action.action === "close_feedback") fbClosedSeen = true
			}

			if (action.action === "sealed") break
			applyResponse(intentDir, action, repoRoot, slug)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}

		assert.ok(s3MergedBeforeInject, "s3 never merged before FB inject")
		assert.ok(injectedFb, "FB never injected")
		assert.ok(
			fbClosedSeen,
			`close_feedback never fired; recent ticks: ${seen.slice(-15).join(" → ")}`,
		)
		assert.ok(
			postInjectS1FixHats >= 2,
			`expected ≥2 fix-hat ticks on s1 (builder + feedback-assessor); got ${postInjectS1FixHats}`,
		)
		assert.equal(
			seen[seen.length - 1],
			"sealed//",
			`pipeline did not seal; recent ticks: ${seen.slice(-10).join(" → ")}`,
		)
	})
})

test("e2e (interpretation B): FB on s1 lands AFTER s4 merged → cursor walks Track B even with no active stage, fix loop closes, pipeline re-seals", async () => {
	// "User finished the pipeline, then opened an FB on an earlier
	// stage from the post-pipeline review" path. Pre-fix: cursor's
	// Track B was gated on activeStage being non-null, so once every
	// stage merged, FBs on prior stages were silently ignored and the
	// pipeline sealed over them.
	//
	// Post-fix: Track B walks every stage even when all are merged,
	// dispatches the fix-hat sequence against the FB, closes it, and
	// the pipeline re-seals (because intent-level approvals haven't
	// regressed — the seal happens after FB closure since the FB
	// itself was the only blocker).
	if (!HAS_GIT) return
	await withRepo("cross-fb-B", async ({ repoRoot, intentDir, slug }) => {
		buildFourStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb4",
			mode: "continuous",
			extraFm: { stages: ["s1", "s2", "s3", "s4"] },
		})

		const seen = []
		let injectedFb = false
		let s4MergedBeforeInject = false
		let fbClosedSeen = false
		let postInjectS1FixHats = 0
		const MAX_TICKS = 400

		for (let i = 0; i < MAX_TICKS; i++) {
			const action = await runTick(slug)
			seen.push(
				`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
			)

			if (
				!s4MergedBeforeInject &&
				action.action === "merge_stage" &&
				action.stage === "s4"
			) {
				applyResponse(intentDir, action, repoRoot, slug)
				s4MergedBeforeInject = true
				continue
			}

			if (
				!injectedFb &&
				s4MergedBeforeInject &&
				action.action !== "merge_stage"
			) {
				makeFeedback({
					intentDir,
					stage: "s1",
					id: "FB-001",
					title: "stage-s1 needs revision",
					body: "found a gap after s4 merged",
					origin: "user-chat",
					author: "user",
				})
				injectedFb = true
				continue
			}

			if (injectedFb) {
				if (action.action === "start_feedback_hat" && action.stage === "s1") {
					postInjectS1FixHats++
				}
				if (action.action === "close_feedback") fbClosedSeen = true
			}

			if (action.action === "sealed") break
			applyResponse(intentDir, action, repoRoot, slug)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}

		assert.ok(s4MergedBeforeInject, "s4 never merged")
		assert.ok(injectedFb, "FB never injected")
		assert.ok(
			fbClosedSeen,
			`close_feedback never fired post-inject — Track B may not be walking merged stages; recent: ${seen.slice(-15).join(" → ")}`,
		)
		assert.ok(
			postInjectS1FixHats >= 2,
			`expected ≥2 fix-hat ticks on s1 (builder + feedback-assessor); got ${postInjectS1FixHats}`,
		)
		assert.equal(
			seen[seen.length - 1],
			"sealed//",
			`pipeline didn't seal after cross-stage fix; recent: ${seen.slice(-10).join(" → ")}`,
		)
		// FB-on-disk closure check: closed_at must be set after the
		// terminal fix-hat advance.
		const fbDir = join(intentDir, "stages", "s1", "feedback")
		const fbFiles = existsSync(fbDir)
			? readdirSync(fbDir).filter((f) => f.endsWith(".md"))
			: []
		assert.ok(fbFiles.length >= 1, "FB file vanished from disk")
		const closedFb = readFm(join(fbDir, fbFiles[0]))
		assert.ok(
			typeof closedFb.closed_at === "string" && closedFb.closed_at.length > 0,
			`FB still open after pipeline seal: ${JSON.stringify(closedFb)}`,
		)
	})
})
