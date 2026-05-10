// filesystem-mode-e2e.test.mjs — same flows as the git-backed e2e
// suite, run with NO git repo backing. Filesystem persistence mode is
// detected by `isGitRepo()` and the engine is supposed to work
// without git for users who haven't run git init.
//
// Mirrors:
//   - multi-tick-pipeline (continuous mode end-to-end)
//   - multi-mode-e2e (autopilot + mode change)
//   - feedback-mid-flight (FB opens after stage merge)
//   - drift-mid-flight is git-only because the test exercises a
//     real git commit; the drift system itself works in fs mode and
//     is covered by drift-no-false-positives.
//
// Stage progression in fs mode is determined by per-unit signature
// state. The cursor's `firstUnmergedStage` uses `isStageFullySigned`
// (terminal hat advance + every required approval role signed) to
// walk past completed stages. The `merge_stage` handler in fs mode
// is a no-op that re-ticks without writing anything; the cursor
// observes the next call's input as already-signed and advances.

import assert from "node:assert/strict"
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
import { makeFeedback, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

const { buildApprovalRecord, buildReviewRecord } = await import(
	`${SRC}/orchestrator/workflow/sign-slot.ts`
)

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}

function writeFm(path, fm, body = "") {
	writeFileSync(path, matter.stringify(body, fm))
}

async function withRepo(slug, fn) {
	// NO git init. Pure filesystem persistence mode.
	const repoRoot = mkdtempSync(join(tmpdir(), `fs-mode-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const intentDir = join(repoRoot, ".haiku", "intents", slug)
		mkdirSync(intentDir, { recursive: true })
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

function buildThreeStageStudio(repoRoot, studio = "fs3") {
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

function applyResponse(intentDir, action) {
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
			// Conversation gate (2026-05-08). Write a verified
			// elaboration artifact so the cursor advances past the gate.
			// Tests don't simulate the verifier subagent.
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
				reviews[action.role] = buildReviewRecord(path)
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
				const outputs = Array.isArray(fm.outputs) ? fm.outputs : []
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				approvals[action.role] = buildApprovalRecord(intentDir, outputs)
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
				const outputs = Array.isArray(fm.outputs) ? fm.outputs : []
				const reviews =
					fm.reviews && typeof fm.reviews === "object" ? fm.reviews : {}
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				reviews.user = reviews.user || buildReviewRecord(path)
				approvals.user =
					approvals.user || buildApprovalRecord(intentDir, outputs)
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
				const outputs = Array.isArray(fm.outputs) ? fm.outputs : []
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				approvals.quality_gates = buildApprovalRecord(intentDir, outputs)
				writeFm(path, { ...fm, approvals })
			}
			break
		}
		case "merge_stage": {
			// In fs mode this is a no-op. The cursor's `isStageFullySigned`
			// already returns true (terminal hat advance + approvals all
			// signed), so the next tick walks past via `firstUnmergedStage`
			// without anything written here. Kept as an explicit case to
			// document the contract.
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

async function driveToSealed(slug, intentDir, maxTicks = 100) {
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
		applyResponse(intentDir, action)
		if (action.action === "merge_intent") {
			const intentMd = join(intentDir, "intent.md")
			const fm = readFm(intentMd)
			writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
		}
	}
	throw new Error(
		`pipeline did not seal in ${maxTicks} ticks. last 10: ${seen.slice(-10).join(" → ")}`,
	)
}

// ── Continuous mode (no git) ─────────────────────────────────────────

test("fs-mode continuous: 3-stage pipeline reaches sealed without git", async () => {
	await withRepo("fs-cont", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fs3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const { seen } = await driveToSealed(slug, intentDir)
		assert.equal(seen[seen.length - 1], "sealed//")
		// Pipeline traversed every configured stage and reached
		// intent-level review. Under the new disk-state cursor model,
		// fs mode walks naturally past fully-signed stages — there's
		// no physical merge to perform, so no `merge_stage` action is
		// emitted. The cursor's progression IS visible by the
		// per-stage actions plus the intent-level finale.
		const stagesSeen = new Set(
			seen
				.map((t) => t.split("/")[1])
				.filter((s) => s === "a" || s === "b" || s === "c"),
		)
		assert.deepStrictEqual(
			[...stagesSeen].sort(),
			["a", "b", "c"],
			`pipeline must touch every stage; saw: ${[...stagesSeen].sort().join(", ")}`,
		)
		const intentReviews = seen.filter((t) => t.startsWith("intent_review/"))
		assert.ok(
			intentReviews.length >= 1,
			`pipeline must reach intent-level review; got: ${seen.slice(-5).join(" → ")}`,
		)
	})
})

// ── Autopilot mode (no git) ──────────────────────────────────────────

test("fs-mode autopilot: pipeline seals with trimmed role list", async () => {
	await withRepo("fs-auto", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fs3",
			mode: "autopilot",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const { seen } = await driveToSealed(slug, intentDir)
		assert.equal(seen[seen.length - 1], "sealed//")
		const userGates = seen.filter((t) => t.startsWith("user_gate/"))
		assert.equal(
			userGates.length,
			0,
			`autopilot must not emit user_gate; got: ${userGates.join(", ")}`,
		)
	})
})

// ── Mode change mid-flight (no git) ──────────────────────────────────

test("fs-mode change: continuous → autopilot mid-flight; pipeline seals", async () => {
	await withRepo("fs-modechg", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fs3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const seenAfter = []
		let flipped = false
		for (let i = 0; i < 100; i++) {
			const action = await runTick(slug)
			const tuple = `${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`
			if (flipped) seenAfter.push(tuple)
			if (!flipped && action.action === "user_gate" && action.stage === "a") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, mode: "autopilot" })
				flipped = true
				continue
			}
			if (action.action === "sealed") break
			applyResponse(intentDir, action)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}
		assert.ok(flipped, "test never flipped mode")
		assert.equal(seenAfter[seenAfter.length - 1], "sealed//")
		const postFlipUserGates = seenAfter.filter((t) =>
			t.startsWith("user_gate/"),
		)
		assert.equal(postFlipUserGates.length, 0)
	})
})

// ── Feedback mid-flight (no git) ─────────────────────────────────────

test("fs-mode FB mid-flight: opens after stage A merge, fix loop runs, pipeline seals", async () => {
	await withRepo("fs-fb-mid", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fs3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const seen = []
		let injectedFb = false
		let fbClosedSeen = false
		for (let i = 0; i < 200; i++) {
			const action = await runTick(slug)
			seen.push(
				`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
			)
			// Inject the FB once stage A reaches its final approval gate
			// (dispatch_quality_gates for stage A). Under the new
			// disk-state model, fs mode doesn't emit a separate
			// `merge_stage` action — it walks past fully-signed stages
			// naturally — so we hook the last per-stage action instead.
			if (
				!injectedFb &&
				action.action === "dispatch_quality_gates" &&
				action.stage === "a"
			) {
				applyResponse(intentDir, action)
				makeFeedback({
					intentDir,
					stage: "a",
					id: "FB-001",
					title: "stage-a regression",
					body: "found a bug after merge",
					origin: "user-chat",
					author: "user",
				})
				injectedFb = true
				continue
			}
			if (action.action === "close_feedback") fbClosedSeen = true
			if (action.action === "sealed") break
			applyResponse(intentDir, action)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}
		assert.ok(injectedFb, "FB never injected")
		assert.equal(seen[seen.length - 1], "sealed//")
		assert.ok(fbClosedSeen, "close_feedback never fired")
		const fbTicks = seen.filter((t) => t.startsWith("start_feedback_hat/a/"))
		assert.ok(fbTicks.length >= 2)
	})
})
