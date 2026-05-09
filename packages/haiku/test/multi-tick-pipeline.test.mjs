#!/usr/bin/env npx tsx
// multi-tick-pipeline.test.mjs — Multi-tick pipeline scenario.
//
// Existing cursor tests are single-tick: each builds a static disk
// fixture and asserts the next action. This one drives the cursor
// through MANY ticks against a 3-stage studio (a, b, c) and asserts
// the pipeline reaches `sealed`.
//
// On every tick we read the action and simulate the agent/engine
// response by writing the appropriate frontmatter to disk:
//   - elaborate            → record the conversation artifact (gate
//                            simulator: in real code the agent talks
//                            to the user; here we just stamp a
//                            verified body)
//   - elaborate_review     → seal the artifact (verifier simulator)
//   - decompose            → write a wave-ready unit (formerly the
//                            elaborate action's job)
//   - start_unit_hat       → append iteration with result=advance
//   - dispatch_review      → stamp reviews.<role>.at
//   - user_gate            → stamp reviews.user.at OR approvals.user.at
//   - dispatch_approval    → stamp approvals.<role>.at
//   - dispatch_quality_gates → stamp approvals.quality_gates.at
//   - merge_stage          → commit + fast-forward stage branch into intent main
//   - intent_review        → stamp intent.approvals.<role>.at
//   - merge_intent         → stamp sealed_at on intent.md
//   - sealed               → break
//
// Cap: 100 ticks. If the loop exits without sealing, fail and dump
// the action sequence so the regression is debuggable.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import { initTestRepo, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

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

async function withTmpRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-multi-tick-"))
	const stableCwd = tmpdir()
	const origCwd = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: dir, slug })
		return await fn(repo)
	} finally {
		try {
			process.chdir(origCwd)
		} catch {
			process.chdir(stableCwd)
		}
		rmSync(dir, { recursive: true, force: true })
	}
}

async function runTick(repoRoot, slug) {
	const { runTickWithBranchAlignment } = await import("./_v4-fixtures.mjs")
	return runTickWithBranchAlignment(repoRoot, slug)
}

function unitsDirOf(intentDir, stage) {
	return join(intentDir, "stages", stage, "units")
}

function readUnitFm(intentDir, stage, unitName) {
	const path = join(unitsDirOf(intentDir, stage), `${unitName}.md`)
	const raw = readFileSync(path, "utf8")
	return { path, parsed: matter(raw) }
}

function writeUnitFm(path, fm, body) {
	writeFileSync(path, matter.stringify(body || `# unit\n`, fm))
}

function readIntentFm(intentDir) {
	const path = join(intentDir, "intent.md")
	const raw = readFileSync(path, "utf8")
	return { path, parsed: matter(raw) }
}

function writeIntentFm(path, fm, body) {
	writeFileSync(path, matter.stringify(body || "# intent\n", fm))
}

/**
 * Create a wave-ready unit (started_at: null, no iterations).
 */
function createWaveReadyUnit(intentDir, stage, name) {
	const dir = unitsDirOf(intentDir, stage)
	mkdirSync(dir, { recursive: true })
	const path = join(dir, `${name}.md`)
	const fm = {
		title: name,
		depends_on: [],
		started_at: null,
		iterations: [],
		reviews: {},
		approvals: {},
		discovery: {},
	}
	writeFileSync(path, matter.stringify(`# ${name}\n`, fm))
	return path
}

/**
 * Stamp a hat-advance iteration on every unit named in `units`.
 */
function stampHatAdvance(intentDir, stage, units, hat) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		// First hat lands started_at if it's missing.
		if (fm.started_at == null) fm.started_at = at
		const its = Array.isArray(fm.iterations) ? [...fm.iterations] : []
		its.push({
			hat,
			started_at: at,
			completed_at: at,
			result: "advance",
		})
		fm.iterations = its
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Stamp `reviews.<role>.at` on every unit listed.
 */
function stampReviewRole(intentDir, stage, units, role) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		fm.reviews = { ...(fm.reviews || {}), [role]: { at } }
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Stamp `approvals.<role>.at` on every unit listed.
 */
function stampApprovalRole(intentDir, stage, units, role) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		fm.approvals = { ...(fm.approvals || {}), [role]: { at } }
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Materialise a merged stage branch.
 *
 * Cursor's `firstUnmergedStage` walks intent main's filesystem and
 * returns the first stage whose `stages/<name>/units/` is empty.
 * Merging the stage branch into intent main with `--no-ff` brings
 * the unit files onto intent main's tree — that's the merged signal
 * the cursor reads.
 */
function mergeStageBranch(repoRoot, slug, stage) {
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`

	// Under the disk-state cursor model, runTickWithBranchAlignment
	// puts the working tree on the stage branch BEFORE the cursor
	// walk, so all per-stage writes (units, reviews, approvals)
	// landed there. Commit them on the stage branch first.
	try {
		git(repoRoot, "add", "-A")
		git(repoRoot, "commit", "-m", `stage ${stage} content`)
	} catch {
		/* nothing to commit */
	}

	// Switch to intent main and merge the stage branch with --no-ff
	// so a merge commit lands. The cursor's "stage merged" signal is
	// the presence of stage content on intent main, so the merge
	// brings the units across.
	git(repoRoot, "checkout", mainBranch)
	git(
		repoRoot,
		"merge",
		"--no-ff",
		"--no-edit",
		"-m",
		`haiku: merge stage ${stage} into main`,
		stageBranch,
	)
}

test("multi-tick: 3-stage continuous intent walks from elaborate to sealed", {
	timeout: 30_000,
}, async (t) => {
	if (!HAS_GIT) return

	await withTmpRepo(
		"multi-tick-pipeline",
		async ({ repoRoot, intentDir, slug }) => {
			// 3 stages, each with planner→builder→verifier hats and one
			// configured review agent (code-reviewer). No design-direction,
			// no clarify, no discovery — those are tested separately.
			makeStudio({
				repoRoot,
				studio: "multi3",
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
			makeIntent({
				intentDir,
				slug,
				studio: "multi3",
				mode: "continuous",
				extraFm: { stages: ["a", "b", "c"] },
			})

			// Plant exactly one unit per stage so each elaborate dispatch has
			// a concrete unit to seed. We don't seed them up front — the
			// cursor returns `elaborate` per stage and the test reacts.

			const seenActions = []
			let noopStreak = 0
			let finalAction = null

			for (let tick = 0; tick < 100; tick++) {
				const action = await runTick(repoRoot, slug)
				seenActions.push({
					tick,
					action: action.action,
					stage: action.stage,
					hat: action.hat,
					role: action.role,
					gate_kind: action.gate_kind,
				})

				// Bail-out: 3 consecutive noops with no progress = stuck.
				if (action.action === "noop") {
					noopStreak++
					if (noopStreak >= 3) {
						console.error(
							"Action sequence:",
							JSON.stringify(seenActions, null, 2),
						)
						assert.fail(
							`Cursor stuck in noop for 3 consecutive ticks (tick ${tick})`,
						)
					}
					continue
				}
				noopStreak = 0

				if (action.action === "sealed") {
					finalAction = action
					break
				}

				// React to the action. Each branch mutates disk so the next
				// tick sees fresh state.
				switch (action.action) {
					case "elaborate": {
						// Conversation gate (2026-05-08). Write a verified
						// elaboration artifact to flip both the record + seal
						// halves at once. Real agents go through the verifier
						// subagent; tests don't need that fidelity.
						const stageDir = join(intentDir, "stages", action.stage)
						mkdirSync(stageDir, { recursive: true })
						const at = new Date().toISOString()
						const fm = {
							recorded_at: at,
							intent: action.intent ?? slug,
							stage: action.stage,
							verified_at: at,
							verified_notes: "test fixture — gate simulated",
						}
						writeFileSync(
							join(stageDir, "elaboration.md"),
							matter.stringify("Test elaboration body.", fm),
						)
						break
					}
					case "elaborate_review": {
						// Already verified above — but if we land here (artifact
						// present, no verified_at), seal it now.
						const elabPath = join(
							intentDir,
							"stages",
							action.stage,
							"elaboration.md",
						)
						const raw = readFileSync(elabPath, "utf8")
						const parsed = matter(raw)
						const fm = {
							...parsed.data,
							verified_at: new Date().toISOString(),
						}
						writeFileSync(elabPath, matter.stringify(parsed.content, fm))
						break
					}
					case "decompose": {
						// Write one unit for this stage. Was the per-stage
						// elaborate action's job pre-2026-05-08.
						const unitName = `unit-01-${action.stage}`
						createWaveReadyUnit(intentDir, action.stage, unitName)
						break
					}
					case "start_unit_hat": {
						// Append `result: advance` for each unit on this hat.
						stampHatAdvance(intentDir, action.stage, action.units, action.hat)
						break
					}
					case "dispatch_review": {
						stampReviewRole(intentDir, action.stage, action.units, action.role)
						break
					}
					case "user_gate": {
						// gate_kind = "spec" → reviews.user.at
						// gate_kind = "approval" → approvals.user.at
						if (action.gate_kind === "spec") {
							stampReviewRole(intentDir, action.stage, action.units, "user")
						} else {
							stampApprovalRole(intentDir, action.stage, action.units, "user")
						}
						break
					}
					case "dispatch_approval": {
						stampApprovalRole(
							intentDir,
							action.stage,
							action.units,
							action.role,
						)
						break
					}
					case "dispatch_quality_gates": {
						stampApprovalRole(
							intentDir,
							action.stage,
							action.units,
							"quality_gates",
						)
						break
					}
					case "merge_stage": {
						mergeStageBranch(repoRoot, slug, action.stage)
						break
					}
					case "intent_review": {
						// Stamp intent-level approval for the named role.
						const { path, parsed } = readIntentFm(intentDir)
						const fm = { ...parsed.data }
						const approvals = { ...(fm.approvals || {}) }
						approvals[action.role] = { at: new Date().toISOString() }
						fm.approvals = approvals
						writeIntentFm(path, fm, parsed.content)
						break
					}
					case "merge_intent": {
						// Engine response: stamp sealed_at on intent.md.
						const { path, parsed } = readIntentFm(intentDir)
						const fm = { ...parsed.data }
						fm.sealed_at = new Date().toISOString()
						writeIntentFm(path, fm, parsed.content)
						break
					}
					case "drift_detected":
					case "discovery_required":
					case "design_direction_required":
					case "clarify_required":
					case "start_feedback_hat":
					case "close_feedback":
					case "select_studio":
					case "error": {
						console.error("Unexpected action:", action)
						console.error(
							"Action sequence:",
							JSON.stringify(seenActions, null, 2),
						)
						assert.fail(
							`Unexpected action '${action.action}' at tick ${tick}: ${action.message}`,
						)
					}
					default: {
						console.error("Unknown action:", action)
						console.error(
							"Action sequence:",
							JSON.stringify(seenActions, null, 2),
						)
						assert.fail(`Unknown action '${action.action}' at tick ${tick}`)
					}
				}
			}

			if (!finalAction || finalAction.action !== "sealed") {
				console.error("Action sequence:", JSON.stringify(seenActions, null, 2))
				assert.fail(
					`Pipeline did not reach 'sealed' within 100 ticks. Final: ${JSON.stringify(finalAction)}`,
				)
			}

			// Post-conditions: every stage's single unit should have all
			// reviews + approvals signed.
			// Switch to intent main to read the merged-state of every stage.
			git(repoRoot, "checkout", `haiku/${slug}/main`)
			for (const stage of ["a", "b", "c"]) {
				const unitName = `unit-01-${stage}`
				const { parsed } = readUnitFm(intentDir, stage, unitName)
				const fm = parsed.data
				assert.ok(fm.reviews?.spec?.at, `${stage}: spec review`)
				assert.ok(
					fm.reviews?.["code-reviewer"]?.at,
					`${stage}: code-reviewer review`,
				)
				assert.ok(fm.reviews?.user?.at, `${stage}: user review`)
				assert.ok(fm.approvals?.spec?.at, `${stage}: spec approval`)
				assert.ok(
					fm.approvals?.quality_gates?.at,
					`${stage}: quality_gates approval`,
				)
				assert.ok(
					fm.approvals?.["code-reviewer"]?.at,
					`${stage}: code-reviewer approval`,
				)
				assert.ok(fm.approvals?.user?.at, `${stage}: user approval`)
			}

			// Useful for debugging when the test passes too — pipe the action
			// sequence on success so the canonical multi-tick path is logged.
			t.diagnostic(
				`Pipeline sealed in ${seenActions.length} ticks. Action sequence: ${seenActions
					.map(
						(s) =>
							`${s.action}${s.stage ? `(${s.stage}${s.hat ? `/${s.hat}` : ""}${s.role ? `/${s.role}` : ""})` : ""}`,
					)
					.join(" → ")}`,
			)
		},
	)
})
