// Multi-mode e2e: discrete, autopilot, and mid-flight mode change.
//
// `dispatchOrchestratorAction` doesn't actually MOVE the working
// tree, so most modes can be exercised in cursor-walk style. The
// substantive thing each mode tests:
//
//   - discrete: same role list as continuous; the external provider's
//     approval is the merge of the stage branch into intent main.
//     Simulated here by a hand-merge in applyResponse — that's
//     literally what GitHub/GitLab does when the user clicks "merge."
//
//   - autopilot: trimmed role list ([spec] for reviews, [spec,
//     quality_gates] for approvals). No user gate, no agent gates.
//     Pipeline reaches sealed faster.
//
//   - mode change: intent starts as continuous, flips to autopilot
//     mid-flight. Subsequent ticks must observe the new mode and
//     stop emitting user_gate / agent gates.

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
import { initTestRepo, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

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

function buildThreeStageStudio(repoRoot, studio = "multi3") {
	makeStudio({
		repoRoot,
		studio,
		stages: [
			{
				name: "a",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "b",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "c",
				hats: ["planner", "builder", "verifier"],
				fix_hats: ["builder", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
		],
	})
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `mode-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")
		// Disable drift detection: applyResponse stamps lifecycle
		// fields (reviews/approvals) on units after the cursor signs
		// reviews — drift sweep flags those as "agent edited approved
		// content." Real signal but simulated harness; drift coverage
		// lives in drift-scenarios.test.mjs.
		const haikuDir = join(repoRoot, ".haiku")
		mkdirSync(haikuDir, { recursive: true })
		writeFileSync(join(haikuDir, "settings.yml"), "drift_detection: false\n")
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

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

	switch (action.action) {
		case "elaborate": {
			// Conversation gate (2026-05-08). Write a verified
			// elaboration artifact so the cursor advances. Tests don't
			// simulate the verifier subagent.
			mkdirSync(stageDir, { recursive: true })
			const elabPath = join(stageDir, "elaboration.md")
			writeFm(
				elabPath,
				{
					recorded_at: at,
					intent: action.intent ?? "",
					stage,
					verified_at: at,
					verified_notes: "test fixture — gate simulated",
				},
				"Test elaboration body.",
			)
			break
		}
		case "elaborate_review": {
			const elabPath = join(stageDir, "elaboration.md")
			if (existsSync(elabPath)) {
				const fm = readFm(elabPath)
				writeFm(elabPath, { ...fm, verified_at: at })
			}
			break
		}
		case "decompose": {
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
		case "merge_stage": {
			// Discrete & continuous both reach this — for discrete, the
			// external provider performs the merge; for continuous, the
			// engine does. Either way the test simulates the resulting
			// branch topology: stage branch merged into main with --no-ff.
			//
			// Sequence: switch to the stage branch (creating it if
			// missing), commit pending state, switch to main, merge.
			// Each step is independently try-caught because state
			// from earlier ticks (e.g., createDiscoveryWorktree creating
			// the stage branch, prior commits) leaves the repo in
			// various legal-but-different starting positions.
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
					// Nothing to commit. Force a divergent commit so
					// merge --no-ff has something to merge.
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
				/* may already be merged or in a state where the merge
				   is a no-op — leave it; the cursor will diagnose */
			}
			break
		}
		default:
			break
	}
}

async function runTick(slug) {
	const { runTickWithBranchAlignment } = await import("./_v4-fixtures.mjs")
	const { buildRunInstructions } = await import(`${SRC}/orchestrator.ts`)
	const action = await runTickWithBranchAlignment(slug)
	try {
		buildRunInstructions(slug, "multi3", action, "")
	} catch {
		/* prompt builder may need disk state we don't have; not load-bearing */
	}
	return action
}

async function driveToSealed(slug, intentDir, repoRoot, maxTicks = 100) {
	const seen = []
	for (let i = 0; i < maxTicks; i++) {
		const action = await runTick(slug)
		seen.push(
			`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
		)
		if (action.action === "sealed") return { action, seen }
		if (action.action === "error") {
			throw new Error(`dispatch returned error: ${action.message}`)
		}
		applyResponse(intentDir, action, repoRoot, slug)
		// Auto-stamp sealed_at when merge_intent fires (mirrors run_next's
		// auto-seal — we're testing the cursor here, not run_next).
		if (action.action === "merge_intent") {
			const intentMd = join(intentDir, "intent.md")
			const fm = readFm(intentMd)
			writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
		}
	}
	throw new Error(
		`pipeline did not seal in ${maxTicks} ticks. Last 10 tuples: ${seen.slice(-10).join(" → ")}`,
	)
}

// ── Discrete mode ────────────────────────────────────────────────────

test("discrete mode: pipeline seals; user_gate fires per stage; external merge simulated", async () => {
	if (!HAS_GIT) return
	await withRepo("disc", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "multi3",
			mode: "discrete",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const { seen } = await driveToSealed(slug, intentDir, repoRoot)

		// Discrete still has user_gate per stage (the cursor lists "user"
		// in approvalRoles). The simulated merge in applyResponse stands
		// in for the GitHub/GitLab merge.
		const userGates = seen.filter((t) => t.startsWith("user_gate/"))
		assert.ok(
			userGates.length >= 3,
			`expected ≥3 user_gate ticks (one per stage); got ${userGates.length} of ${seen.length}: ${userGates.join(", ")}`,
		)
		// And the pipeline reaches sealed.
		assert.equal(seen[seen.length - 1], "sealed//")
	})
})

// ── Autopilot mode ───────────────────────────────────────────────────

test("autopilot mode: pipeline seals without user_gate or agent reviews", async () => {
	if (!HAS_GIT) return
	await withRepo("auto", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "multi3",
			mode: "autopilot",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const { seen } = await driveToSealed(slug, intentDir, repoRoot)

		// Autopilot trims the role list: NO user_gate, NO agent reviews
		// (e.g. code-reviewer), only spec + quality_gates.
		const userGates = seen.filter((t) => t.startsWith("user_gate/"))
		assert.equal(
			userGates.length,
			0,
			`autopilot must not emit user_gate; got: ${userGates.join(", ")}`,
		)
		const agentReviews = seen.filter(
			(t) =>
				t.startsWith("dispatch_review/") &&
				!t.endsWith("/spec") &&
				t.includes("/code-reviewer"),
		)
		assert.equal(
			agentReviews.length,
			0,
			`autopilot must not emit agent dispatch_review; got: ${agentReviews.join(", ")}`,
		)
		// And spec review fires per stage.
		const specReviews = seen.filter((t) => t === "dispatch_review/a/spec")
		assert.ok(specReviews.length >= 1, "expected spec review on stage a")
		assert.equal(seen[seen.length - 1], "sealed//")
	})
})

// ── Mode change mid-flight ──────────────────────────────────────────

test("mode change: continuous → autopilot mid-flight; subsequent ticks honor new mode", async () => {
	if (!HAS_GIT) return
	await withRepo("modechg", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "multi3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		// Drive a few ticks under continuous, then flip to autopilot
		// before stage a finishes — confirm the cursor stops emitting
		// user_gate from the moment the mode changes.
		const seenBefore = []
		const seenAfter = []
		let flipped = false
		const MAX = 100
		for (let i = 0; i < MAX; i++) {
			const action = await runTick(slug)
			const tuple = `${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`
			if (!flipped) seenBefore.push(tuple)
			else seenAfter.push(tuple)

			// Flip when stage a's first user_gate fires — that's after
			// reviews are done in continuous mode, well before merge_stage.
			if (!flipped && action.action === "user_gate" && action.stage === "a") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, mode: "autopilot" })
				flipped = true
				// Don't apply this user_gate — autopilot won't need it.
				continue
			}

			if (action.action === "sealed") break
			applyResponse(intentDir, action, repoRoot, slug)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}

		assert.ok(
			flipped,
			"test never flipped mode — continuous never reached user_gate",
		)
		// After the flip, no user_gate ticks should fire.
		const postFlipUserGates = seenAfter.filter((t) =>
			t.startsWith("user_gate/"),
		)
		assert.equal(
			postFlipUserGates.length,
			0,
			`autopilot post-flip must not emit user_gate; got: ${postFlipUserGates.join(", ")}`,
		)
		// And the pipeline still sealed.
		assert.equal(
			seenAfter[seenAfter.length - 1],
			"sealed//",
			`expected sealed after mode flip; last: ${seenAfter.slice(-3).join(" → ")}`,
		)
	})
})
