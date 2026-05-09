// E2E: feedback opens mid-flight, fix loop runs, FB closes, pipeline reseals.
//
// Real flow: pipeline drives stage A through to merge, then while
// stage B is in flight (or even after B is done), the user opens an
// FB on stage A. Cursor walks Track B back to A on the next tick,
// dispatches A's `fix_hats` against the FB. When the terminal fix-hat
// (feedback-assessor) advances, cursor returns close_feedback. Then
// the pipeline resumes Track A on stage B (or wherever it was).
//
// This is the load-bearing FB lifecycle covered by feedback-flow
// scenarios in pieces — but never end-to-end as a single seal.

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
	const repoRoot = mkdtempSync(join(tmpdir(), `fb-mid-${slug}-`))
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
		case "start_feedback_hat": {
			// Apply terminal fix-hat advance. The cursor's `fixHats:` for
			// this stage is [builder, feedback-assessor]; each tick
			// stamps one. Stamping just the named hat for the FB id.
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

function buildThreeStageStudio(repoRoot) {
	makeStudio({
		repoRoot,
		studio: "fb3",
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

test("e2e: FB opens after stage A merged, fix loop runs, FB closes, pipeline seals", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-mid", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		const seen = []
		let injectedFb = false
		let fbClosedSeen = false
		const MAX_TICKS = 200

		for (let i = 0; i < MAX_TICKS; i++) {
			const action = await runTick(slug)
			seen.push(
				`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
			)

			// Inject an FB on stage A right after stage A merges (i.e.,
			// when we see merge_stage/a/) — before stage B starts. That
			// forces the cursor to walk Track B back to A on the next
			// tick.
			if (
				!injectedFb &&
				action.action === "merge_stage" &&
				action.stage === "a"
			) {
				applyResponse(intentDir, action, repoRoot, slug)
				makeFeedback({
					intentDir,
					stage: "a",
					id: "FB-001",
					title: "stage-a needs revision",
					body: "found a bug after merge",
					origin: "user-chat",
					author: "user",
				})
				injectedFb = true
				continue
			}
			if (action.action === "close_feedback") fbClosedSeen = true
			if (action.action === "sealed") break
			applyResponse(intentDir, action, repoRoot, slug)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}

		// Hard assertions:
		assert.ok(injectedFb, "FB never injected (test setup bug)")
		assert.equal(
			seen[seen.length - 1],
			"sealed//",
			`pipeline did not seal: ${seen.slice(-5).join(" → ")}`,
		)

		// FB-track ticks fired against stage a after the inject.
		const fbTicks = seen.filter((t) => t.startsWith("start_feedback_hat/a/"))
		assert.ok(
			fbTicks.length >= 2,
			`expected ≥2 fix-hat ticks on stage a (builder + feedback-assessor); got ${fbTicks.length}: ${fbTicks.join(", ")}`,
		)
		assert.ok(fbClosedSeen, "close_feedback action never fired")
	})
})
