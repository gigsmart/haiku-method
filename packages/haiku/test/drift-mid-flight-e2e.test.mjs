// E2E: drift introduced mid-flight → cursor surfaces drift_detected →
// agent files FB → cursor walks Track B → fix loop → pipeline seals.
//
// Drift-scenarios.test.mjs covers the sweep in isolation. This test
// drives the full lifecycle end-to-end: a real out-of-band edit to a
// signed unit triggers drift_detected, which the agent translates
// into a feedback file, which routes through the fix loop, which
// closes, which lets the pipeline reach sealed.

import { test } from "node:test"
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
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

// Promoted to module scope so applyResponse and helpers can use it
// without re-importing per call.
const { buildApprovalRecord, buildReviewRecord } = await import(
	`${join(dirname(fileURLToPath(import.meta.url)), "..", "src")}/orchestrator/workflow/sign-slot.ts`
)

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

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `drift-mid-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")
		// Drift detection ON for this test.
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
		} else if (action.action === "drift_detected") {
			// Translate drift events into FBs on the affected stage.
			// Each FB carries source_ref="drift:<kind>:<file>" so the
			// drift sweep dedup can suppress re-emission until close.
			const events = action.events || []
			for (let i = 0; i < events.length; i++) {
				const e = events[i]
				const stageOfDrift =
					e.file && e.file.includes("/stages/")
						? e.file.split("/stages/")[1].split("/")[0]
						: "a"
				const num = i + 1
				const fbDir = join(intentDir, "stages", stageOfDrift, "feedback")
				mkdirSync(fbDir, { recursive: true })
				const fbPath = join(fbDir, `${String(num).padStart(3, "0")}-drift.md`)
				const sourceRef = `drift:${e.kind}:${e.file}`
				writeFm(fbPath, {
					title: `drift on ${e.unit}/${e.role}`,
					origin: "drift",
					author: "drift-sweep",
					author_type: "agent",
					created_at: at,
					source_ref: sourceRef,
					targets: { unit: e.unit, invalidates: [] },
					iterations: [],
					closed_at: null,
				}, `Out-of-band edit on ${e.file} since ${e.since}`)
			}
			// Commit the FB write so the next drift sweep doesn't re-flag
			// the same drift forever (the sweep walks `git log --since=<at>`).
			try {
				git(repoRoot, "add", "-A")
				git(repoRoot, "commit", "-m", "drift: file FB for out-of-band edit")
			} catch {
				/* nothing to commit */
			}
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
				const files = readdirSync(fbDir).filter((f) => { const n = Number.parseInt(String(fbId).replace(/^FB-/i, ""), 10); const m = f.match(/^(\d+)-/); return m && Number.parseInt(m[1], 10) === n; })
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
			const files = readdirSync(fbDir).filter((f) =>
				{ const n = Number.parseInt(String(action.feedback_id).replace(/^FB-/i, ""), 10); const m = f.match(/^(\d+)-/); return m && Number.parseInt(m[1], 10) === n; },
			)
			for (const f of files) {
				const path = join(fbDir, f)
				const fm = readFm(path)
				writeFm(path, { ...fm, closed_at: at })
				// Mirror haiku_run_next's drift-close behavior: refresh
				// witnessed signed_at on the targeted unit so the drift
				// sweep stops flagging the same commit.
				if (fm.origin === "drift") {
					const targetUnit = fm.targets?.unit
					if (targetUnit) {
						const unitPath = join(unitsDir, `${targetUnit}.md`)
						if (existsSync(unitPath)) {
							const ufm = readFm(unitPath)
							const reviews = ufm.reviews ? { ...ufm.reviews } : {}
							for (const role of Object.keys(reviews))
								reviews[role] = { at }
							const approvals = ufm.approvals ? { ...ufm.approvals } : {}
							for (const role of Object.keys(approvals))
								approvals[role] = { at }
							writeFm(unitPath, { ...ufm, reviews, approvals })
						}
					}
				}
			}
			break
		}
		case "drift_detected": {
			// Translate drift events into feedback files (matches what
			// the drift_detected prompt instructs the agent to do).
			const events = action.events || []
			for (let i = 0; i < events.length; i++) {
				const e = events[i]
				const id = `FB-DRIFT-${String(i + 1).padStart(2, "0")}`
				makeFeedback({
					intentDir,
					stage: e.kind === "spec" || e.kind === "output" ? stage || "a" : null,
					id,
					title: `drift on ${e.unit}/${e.role}`,
					body: `Out-of-band edit detected on ${e.file} since ${e.since}`,
					origin: "drift",
					target_unit: e.unit,
					target_invalidates: [],
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
				const outputs = Array.isArray(fm.outputs)
					? fm.outputs
					: []
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
				const outputs = Array.isArray(fm.outputs)
					? fm.outputs
					: []
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
				const outputs = Array.isArray(fm.outputs)
					? fm.outputs
					: []
				const approvals =
					fm.approvals && typeof fm.approvals === "object" ? fm.approvals : {}
				approvals.quality_gates = buildApprovalRecord(intentDir, outputs)
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
	const { dispatchOrchestratorAction } = await import(
		`${SRC}/orchestrator/workflow/run-tick.ts`
	)
	const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
	clearStudioCache()
	return dispatchOrchestratorAction(slug, "")
}

function buildThreeStageStudio(repoRoot) {
	makeStudio({
		repoRoot,
		studio: "drift3",
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
		],
	})
}

// 2026-05-07: drift sweep dedups against open drift FBs by source_ref.
// Once the agent files an FB with `origin: "drift"` and
// `source_ref: "drift:<kind>:<file>"`, the sweep filters that event
// from subsequent ticks until the FB closes. That lets Track B (the
// fix loop) actually run instead of Track C looping on the same
// drift commit forever.
test("e2e: drift introduced after stage A signed → FB → fix loop → seal", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-mid", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "drift3",
			mode: "continuous",
			extraFm: { stages: ["a", "b"] },
		})

		const seen = []
		let driftInjected = false
		let driftSurfaced = false
		let fbFiled = false
		let fbClosed = false
		let driftSilenced = false
		const MAX_TICKS = 200

		for (let i = 0; i < MAX_TICKS; i++) {
			const action = await runTick(slug)
			seen.push(
				`${action.action}/${action.stage ?? ""}/${action.hat ?? action.role ?? action.agent ?? ""}`,
			)

			// Inject out-of-band drift while stage A is still the active
			// stage (drift sweep is per active stage; once stage A
			// merges into main the active stage advances to B and A's
			// drift would be invisible). dispatch_quality_gates is the
			// last per-unit action before merge_stage and reviews/
			// approvals are stamped on the unit by then.
			if (
				!driftInjected &&
				action.action === "dispatch_quality_gates" &&
				action.stage === "a"
			) {
				applyResponse(intentDir, action, repoRoot, slug)
				// Stage the unit signing as a real commit so the drift
				// sweep has a baseline timestamp to compare against.
				git(repoRoot, "add", "-A")
				git(repoRoot, "commit", "-m", "stage a unit signed")
				// Now wait one second so the drift commit's timestamp
				// is strictly after the signing.
				await new Promise((r) => setTimeout(r, 1100))
				// Out-of-band edit + commit. This is the drift.
				const unitPath = join(
					intentDir,
					"stages",
					"a",
					"units",
					"unit-01.md",
				)
				const raw = readFileSync(unitPath, "utf8")
				writeFileSync(unitPath, `${raw}\n\nOut-of-band note (drift simulation).\n`)
				git(repoRoot, "add", "-A")
				git(repoRoot, "commit", "-m", "drift: edit unit-01 after signing")
				driftInjected = true
				continue
			}
			if (action.action === "drift_detected") {
				driftSurfaced = true
				if (!fbFiled) {
					applyResponse(intentDir, action, repoRoot, slug)
					fbFiled = true
					continue
				}
			}
			if (action.action === "close_feedback") fbClosed = true
			if (action.action === "sealed") break
			applyResponse(intentDir, action, repoRoot, slug)
			if (action.action === "merge_intent") {
				const intentMd = join(intentDir, "intent.md")
				const fm = readFm(intentMd)
				writeFm(intentMd, { ...fm, sealed_at: new Date().toISOString() })
			}
		}

		assert.ok(driftInjected, `drift never injected (test setup bug). recent: ${seen.slice(-20).join(" → ")}`)
		assert.ok(
			driftSurfaced,
			`drift_detected never fired despite drift commit. recent: ${seen.slice(-15).join(" → ")}`,
		)
		assert.ok(
			fbFiled,
			"FB never filed in response to drift_detected (translation step missing)",
		)
		assert.ok(
			fbClosed,
			`close_feedback never fired — fix loop didn't terminate. recent: ${seen.slice(-30).join(" → ")}`,
		)
		assert.equal(
			seen[seen.length - 1],
			"sealed//",
			`pipeline did not seal after drift→FB→fix loop. recent: ${seen.slice(-10).join(" → ")}`,
		)
		const fbTicks = seen.filter((t) => t.startsWith("start_feedback_hat/a/"))
		assert.ok(
			fbTicks.length >= 2,
			`expected ≥2 fix-hat ticks on stage a; got ${fbTicks.length}: ${fbTicks.join(", ")}`,
		)
	})
})
