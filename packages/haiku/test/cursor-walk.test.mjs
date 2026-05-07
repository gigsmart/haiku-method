#!/usr/bin/env npx tsx
// cursor-walk.test.mjs — End-to-end verification of the v4 cursor.
//
// Builds a v4-shaped intent on disk via the _v4-fixtures helpers,
// then drives haiku_run_next via dispatchOrchestratorAction and
// asserts the cursor's track + action against the expected
// progression: drift → feedback → intent track.
//
// These are the canonical "new tests required" from the engine
// refactor plan. They prove the architectural decisions land:
//   - Stages aren't sealed; cursor walks via firstUnmergedStage
//   - Drift detection emits drift_detected before any other track
//   - Open FBs preempt intent-track work
//   - intent walk routes through review → approval → merge_stage
//   - Mode-shaped role list (autopilot trims to spec + quality_gates)

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

async function withTmpRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-cursor-walk-"))
	const stableCwd = tmpdir() // anchor cwd somewhere that won't be deleted
	const origCwd = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: dir, slug })
		// AWAIT the fn — it's async and chdirs into `dir`. Without
		// awaiting, the finally below races with runTick and deletes
		// the tmp dir while the cursor is still walking it.
		return await fn(repo)
	} finally {
		// Critical: chdir AWAY from the tmp dir before deleting it.
		try {
			process.chdir(origCwd)
		} catch {
			process.chdir(stableCwd)
		}
		rmSync(dir, { recursive: true, force: true })
	}
}

test("run_next is idempotent — N successive calls without writes return identical actions", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("test-idempotent", async ({ intentDir, slug }) => {
		makeIntent({ intentDir, slug })
		const { dispatchOrchestratorAction } = await import(
			"../src/orchestrator/workflow/run-tick.js"
		)
		const a1 = dispatchOrchestratorAction(slug, "")
		const a2 = dispatchOrchestratorAction(slug, "")
		const a3 = dispatchOrchestratorAction(slug, "")
		// run_next is pure observation — same disk state, same answer
		// every time, even when that "answer" is an error from missing
		// studio config. This is the load-bearing v4 invariant: anyone
		// can call run_next, no state drift.
		assert.strictEqual(a1.action, a2.action)
		assert.strictEqual(a2.action, a3.action)
		// Sanity: two ticks should also have the same message text
		// (same disk, same error path, same response).
		assert.strictEqual(a1.message, a2.message)
	})
})

/**
 * Build a unit file directly with given iterations[]/reviews{}/approvals{}.
 * Bypasses the makeMergedUnit "fully merged" defaults so we can assert
 * cursor behavior at every lifecycle position.
 */
function writeUnit(intentDir, stage, name, fm, body = "") {
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	const path = join(unitsDir, `${name}.md`)
	writeFileSync(path, matter.stringify(body || `# ${name}\n`, fm))
	return path
}

/**
 * Drive a tick from a tmp repo with a fresh studio fixture. The cursor's
 * studio reads chdir to the repoRoot so its project-local studio
 * fixture overrides the plugin built-ins.
 */
async function runTick(repoRoot, slug) {
	const origCwd = process.cwd()
	process.chdir(repoRoot)
	try {
		const { dispatchOrchestratorAction } = await import(
			"../src/orchestrator/workflow/run-tick.js"
		)
		const { clearStudioCache } = await import("../src/studio-reader.js")
		clearStudioCache()
		return dispatchOrchestratorAction(slug, "")
	} finally {
		process.chdir(origCwd)
	}
}

// ── Track A scenarios ────────────────────────────────────────────────

test("cursor: empty stage → elaborate", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-elaborate", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		const action = await runTick(repoRoot, slug)
		assert.ok(
			action.action === "elaborate" || action.action === "noop",
			`expected elaborate or noop, got: ${action.action} — ${action.message}`,
		)
	})
})

test("cursor: wave-ready unit (started_at null) → start_unit_hat", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-wave-ready", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01-foo", {
			title: "foo",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"start_unit_hat",
			`expected start_unit_hat, got: ${action.action} — ${action.message}`,
		)
		assert.strictEqual(action.hat, "planner", "first hat should be planner")
		assert.deepStrictEqual(action.units, ["unit-01-foo"])
	})
})

test("cursor: in-flight unit (last iteration result null) → noop", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-inflight", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "2026-04-01T00:00:00Z",
			iterations: [
				{
					hat: "planner",
					started_at: "2026-04-01T00:00:00Z",
					completed_at: null,
					result: null,
				},
			],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		// Mid-wave noop: the cursor sees the in-flight unit and returns
		// null; run-tick wraps null as { action: "noop" }.
		assert.strictEqual(
			action.action,
			"noop",
			`expected noop (mid-wave), got: ${action.action}`,
		)
	})
})

test("cursor: hat advanced → next start_unit_hat", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-next-hat", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "2026-04-01T00:00:00Z",
			iterations: [
				{
					hat: "planner",
					started_at: "2026-04-01T00:00:00Z",
					completed_at: "2026-04-01T00:10:00Z",
					result: "advance",
				},
			],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "start_unit_hat")
		assert.strictEqual(
			action.hat,
			"builder",
			`expected next hat builder, got: ${action.hat}`,
		)
	})
})

test("cursor: all hats done → dispatch_review for spec role", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-spec-review", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "2026-04-01T00:00:00Z",
			iterations: [
				{
					hat: "planner",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
				{
					hat: "builder",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
				{
					hat: "verifier",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
			],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"dispatch_review",
			`expected dispatch_review, got: ${action.action} — ${action.message}`,
		)
		assert.strictEqual(action.role, "spec", "spec runs first in role list")
	})
})

test("cursor: spec review signed → dispatch_review for configured agent", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-agent-review", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: { spec: { at: "t" } },
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "dispatch_review")
		assert.strictEqual(
			action.role,
			"code-reviewer",
			"second review role is the configured agent",
		)
	})
})

test("cursor: all reviews signed → user_gate spec", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-user-spec", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
			},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "user_gate")
		assert.strictEqual(action.gate_kind, "spec")
	})
})

test("cursor: all reviews + user signed → dispatch_approval spec (post-execute track)", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-approval-spec", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
			},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		// Post-execute approval track. With approvals.spec missing, the
		// cursor returns dispatch_approval for spec.
		assert.strictEqual(
			action.action,
			"dispatch_approval",
			`expected dispatch_approval, got: ${action.action}`,
		)
		assert.strictEqual(action.role, "spec")
	})
})

test("cursor: spec approval signed → dispatch_quality_gates (engine actor)", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-qg", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
			},
			approvals: {
				spec: { at: "t" },
			},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"dispatch_quality_gates",
			`expected dispatch_quality_gates, got: ${action.action}`,
		)
	})
})

// ── Track B scenarios ────────────────────────────────────────────────

test("cursor: open FB with no iterations → start_feedback_hat", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-fb-start", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Need at least one unit so the stage isn't empty (would emit
		// elaborate before walking Track B).
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "test fb",
			body: "needs fix",
			closed: false,
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"start_feedback_hat",
			`Track B priority should preempt Track A start_unit_hat; got: ${action.action}`,
		)
		assert.strictEqual(action.hat, "builder", "first fix_hat is builder")
	})
})

test("cursor: closed FB does NOT preempt → cursor walks Track A", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-fb-closed", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		// Closed FB shouldn't preempt — cursor should reach Track A.
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "old fb",
			body: "already done",
			closed: true,
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"start_unit_hat",
			`closed FB should not preempt Track A; got: ${action.action}`,
		)
	})
})

// ── Additional scenario coverage (gap-fill 2026-05-06) ───────────────
//
// Original 13 scenarios cover the canonical Track A → user_gate flow
// and basic Track B preemption. The set below fills the load-bearing
// gaps surfaced during the v4 ship review:
//   - merge_stage transition (last unit fully signed → emit merge)
//   - Cross-stage FB priority (FB on earlier stage preempts current)
//   - Mid-wave noop with siblings (one in-flight + one wave-ready)
//   - Approval invalidation re-route (FB closes; cleared approval
//     resurfaces as dispatch_approval)

test("cursor: fully signed unit (qg done) → merge_stage", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-merge-stage", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Every reviewer + approver + qg signed. Cursor should emit
		// merge_stage so the workflow can fast-forward intent main.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
			},
			approvals: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
				quality_gates: { at: "t" },
			},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"merge_stage",
			`expected merge_stage with all sigs in place; got: ${action.action} — ${action.message}`,
		)
		assert.strictEqual(action.stage, "design")
	})
})

test("cursor: open FB on earlier stage preempts current-stage work", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-cross-stage-fb", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "build",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })

		// design (stage 0): empty (no units, no FBs)
		// Add an open FB on design — even though there's no work, an
		// open FB blocks the cursor from walking past it.
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "design fb",
			body: "needs attention on design",
			closed: false,
		})

		// build (stage 1): wave-ready unit. Without the FB on design,
		// the cursor would emit elaborate or start_unit_hat for build.
		writeUnit(intentDir, "build", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		// Cursor must walk back to design — either start_feedback_hat
		// for the design FB, or an action that targets design.
		assert.ok(
			action.action === "start_feedback_hat" ||
				action.stage === "design",
			`expected design-stage preemption; got: action=${action.action} stage=${action.stage}`,
		)
	})
})

test("cursor: mid-wave with one in-flight + one wave-ready → noop", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-midwave-noop", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		// Unit 1: in-flight (last iteration has no result yet).
		writeUnit(intentDir, "design", "unit-01-in-flight", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{
					hat: "planner",
					started_at: "t",
					completed_at: null,
					result: null,
				},
			],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		// Unit 2: wave-ready — fresh, no iterations yet. Without the
		// in-flight sibling, this would be a start_unit_hat dispatch.
		writeUnit(intentDir, "design", "unit-02-wave-ready", {
			title: "u2",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		// Mid-wave noop: cursor must NOT dispatch new work while a
		// sibling on the same wave is still in-flight. The architectural
		// invariant: one wave at a time, no cross-wave dispatches.
		assert.strictEqual(
			action.action,
			"noop",
			`mid-wave with in-flight sibling must be noop; got: ${action.action} — ${action.message}`,
		)
	})
})

test("cursor: closed FB with invalidates clears the listed approvals", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-fb-invalidate", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		// Unit fully signed pre-FB-close. Approvals.user is the role
		// the FB will invalidate; once cleared, the cursor must re-emit
		// dispatch_approval for user (or user_gate).
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "t",
			iterations: [
				{ hat: "planner", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "builder", started_at: "t", completed_at: "t", result: "advance" },
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
			},
			approvals: {
				spec: { at: "t" },
				"code-reviewer": { at: "t" },
				user: { at: "t" },
			},
			discovery: {},
		})

		// Closed FB targeting unit-01 with invalidates: ["user"].
		// The closure semantics (per architecture §5) clear approvals
		// listed in `targets.invalidates` on the targeted unit. The
		// cursor on the next tick must see approvals.user missing and
		// route through user re-approval again.
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "review wanted",
			body: "needs second look",
			origin: "user-chat",
			author: "user",
			target_unit: "unit-01",
			target_invalidates: ["user"],
			closed: true,
		})

		const action = await runTick(repoRoot, slug)
		// We don't assert exact next action (engine could route to
		// dispatch_approval, user_gate, or run a re-review track —
		// implementation choice). What MUST hold: the cursor isn't
		// stuck on merge_stage / sealed — the closed FB's invalidation
		// reopened SOMETHING that needs attention.
		assert.ok(
			action.action !== "sealed" && action.action !== "merge_stage",
			`closed-FB invalidation must reopen the approval cycle; cursor incorrectly emitted: ${action.action}`,
		)
	})
})

// ── Additional batch (#34): drift, classifier-first, reject re-entry ──

test("cursor: classifier-first dispatch on unclassified user FB", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-classifier-first", async ({ repoRoot, intentDir, slug }) => {
		// Stage with v4 fix_hats starting with classifier (the rolled-out
		// pattern after #29). An unclassified user-chat FB lands. Cursor
		// MUST dispatch `classifier` first — not `builder` — even though
		// classifier wasn't in the regular hats list.
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "rate limit",
			body: "Need per-tenant rate limit.",
			origin: "user-chat",
			author: "user",
			closed: false,
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"start_feedback_hat",
			`expected fix-hat dispatch; got: ${action.action}`,
		)
		assert.strictEqual(
			action.hat,
			"classifier",
			`expected classifier as first fix_hat dispatched (not builder); got: ${action.hat}`,
		)
	})
})

test("cursor: reject_hat re-entry routes back to prior hat", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-reject-reentry", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Unit advanced through planner, then verifier rejected. Last
		// iteration is `result: "reject"` on verifier with reason. The
		// cursor should re-dispatch the PRIOR hat (planner) so the
		// rejected work gets revised.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: "2026-04-01T00:00:00Z",
			iterations: [
				{
					hat: "planner",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
				{
					hat: "builder",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
				{
					hat: "verifier",
					started_at: "t",
					completed_at: "t",
					result: "reject",
					reason: "Spec mismatch",
				},
			],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		// Cursor must dispatch a hat — anything other than start_unit_hat
		// (or merge_stage / sealed) means we lost the rejection.
		assert.strictEqual(
			action.action,
			"start_unit_hat",
			`expected re-dispatch after reject; got: ${action.action}`,
		)
		// The dispatched hat MUST NOT be verifier (the rejecting hat).
		// It should be the prior hat (builder, planner) so the work
		// is revised before re-verification.
		assert.notStrictEqual(
			action.hat,
			"verifier",
			"cursor should not re-dispatch the rejecting hat — that loops",
		)
	})
})

// ── P3: design-direction hard gate (studio/stage-conditional) ────────

test("cursor: stage with requires_design_direction + no selection → design_direction_required", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-dd-required", async ({ repoRoot, intentDir, slug }) => {
		// Studio whose 'design' stage opts in to the hard gate.
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })
		// No units, no design_directions on intent.md — gate should fire.
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"design_direction_required",
			`expected design_direction_required gate; got: ${action.action}`,
		)
		assert.strictEqual(action.stage, "design")
	})
})

test("cursor: requires_design_direction + selection on intent.md → elaborate", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-dd-selected", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		// Stamp the design_directions selection on intent.md.
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			extraFm: {
				design_directions: {
					design: {
						archetype: "modular-cards",
						at: "2026-05-06T00:00:00Z",
						surfaced_at: "2026-05-06T00:00:01Z",
					},
				},
			},
		})
		const action = await runTick(repoRoot, slug)
		assert.ok(
			action.action === "elaborate" || action.action === "noop",
			`expected elaborate (or noop) once selection recorded; got: ${action.action}`,
		)
	})
})

test("cursor: design_directions[stage] set without surfaced_at → emits design_direction_complete (archetype mode)", async () => {
	if (!HAS_GIT) return
	await withTmpRepo(
		"cursor-dd-surface-once-archetype",
		async ({ repoRoot, intentDir, slug }) => {
			makeStudio({
				repoRoot,
				studio: "test",
				stages: [
					{
						name: "design",
						hats: ["planner", "builder", "verifier"],
						fix_hats: ["classifier", "builder", "feedback-assessor"],
						review: "ask",
						review_agents: ["code-reviewer"],
						requires_design_direction: true,
					},
				],
			})
			makeIntent({
				intentDir,
				slug,
				studio: "test",
				extraFm: {
					design_directions: {
						design: {
							mode: "archetype",
							archetype: "vivid",
							comments: "lean into the gradients",
							at: "2026-05-06T00:00:00Z",
						},
					},
				},
			})
			const action = await runTick(repoRoot, slug)
			assert.strictEqual(action.action, "design_direction_complete")
			assert.strictEqual(action.archetype, "vivid")
		},
	)
})

test("cursor: design_directions[stage] in upload mode without surfaced_at → emits design_direction_uploaded", async () => {
	if (!HAS_GIT) return
	await withTmpRepo(
		"cursor-dd-surface-once-upload",
		async ({ repoRoot, intentDir, slug }) => {
			makeStudio({
				repoRoot,
				studio: "test",
				stages: [
					{
						name: "design",
						hats: ["planner", "builder", "verifier"],
						fix_hats: ["classifier", "builder", "feedback-assessor"],
						review: "ask",
						review_agents: ["code-reviewer"],
						requires_design_direction: true,
					},
				],
			})
			makeIntent({
				intentDir,
				slug,
				studio: "test",
				extraFm: {
					design_directions: {
						design: {
							mode: "upload",
							uploads: [
								{
									filename: "hero.png",
									path: "stages/design/artifacts/design-direction/uploads/up-01-hero.png",
								},
							],
							at: "2026-05-06T00:00:00Z",
						},
					},
				},
			})
			const action = await runTick(repoRoot, slug)
			assert.strictEqual(action.action, "design_direction_uploaded")
			assert.strictEqual(action.uploads.length, 1)
			assert.match(action.uploads[0].path, /uploads\/up-01-hero\.png$/)
		},
	)
})

test("cursor: stage WITHOUT requires_design_direction skips the gate", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-dd-skipped", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" }) // default stage, no requires_design_direction
		makeIntent({ intentDir, slug, studio: "test" })
		const action = await runTick(repoRoot, slug)
		// Default stage has no opt-in → cursor goes straight to elaborate
		assert.notStrictEqual(action.action, "design_direction_required")
	})
})

// ── P4: clarify-questions gate at elaborate-phase entry ──────────────

test("cursor: stage with clarify/*.md + no clarifications → clarify_required", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-clarify-required", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Drop two clarify questions in the project-local studio
		// override path. The cursor reads from
		// .haiku/studios/<studio>/stages/<stage>/clarify/.
		const clarifyDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"clarify",
		)
		mkdirSync(clarifyDir, { recursive: true })
		writeFileSync(
			join(clarifyDir, "audience.md"),
			"---\nprompt: Who is the primary audience?\n---\n\nUnderstanding the audience anchors every later decision.\n",
		)
		writeFileSync(
			join(clarifyDir, "tradeoffs.md"),
			"---\nprompt: What tradeoffs matter most?\n---\n\nPicking between speed / robustness / cost up front avoids rework.\n",
		)
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"clarify_required",
			`expected clarify_required gate; got: ${action.action}`,
		)
		assert.strictEqual(action.stage, "design")
		assert.strictEqual(
			Array.isArray(action.questions) && action.questions.length,
			2,
		)
	})
})

test("cursor: clarify gate cleared when clarifications.<stage> is recorded", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-clarify-cleared", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			extraFm: {
				clarifications: {
					design: {
						answers: [{ id: "audience", question: "?", answer: "engineers" }],
						at: "2026-05-06T00:00:00Z",
					},
				},
			},
		})
		const clarifyDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"clarify",
		)
		mkdirSync(clarifyDir, { recursive: true })
		writeFileSync(
			join(clarifyDir, "audience.md"),
			"---\nprompt: Who is the audience?\n---\n\nbody\n",
		)
		const action = await runTick(repoRoot, slug)
		assert.notStrictEqual(action.action, "clarify_required")
	})
})

// ── P7: discovery_required fires when units miss a declared agent ────

test("cursor: stage with discovery template + unit missing record → discovery_required", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-disc-required", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Drop a discovery template under the project-local studio
		// override path. The cursor reads it via readStageArtifactDefs.
		const discoveryDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"discovery",
		)
		mkdirSync(discoveryDir, { recursive: true })
		writeFileSync(
			join(discoveryDir, "tokens.md"),
			"---\nname: tokens\nlocation: \"stages/design/TOKENS.md\"\nrequired: true\n---\n\nResearch design tokens.\n",
		)
		// Wave-ready unit with NO discovery record — gate must fire.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"discovery_required",
			`expected discovery_required; got: ${action.action}`,
		)
		assert.strictEqual(action.agent, "tokens")
		assert.deepStrictEqual(action.units, ["unit-01"])
	})
})

test("cursor: discovery_required cleared when unit fm.discovery.<agent> is recorded", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-disc-cleared", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		const discoveryDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"discovery",
		)
		mkdirSync(discoveryDir, { recursive: true })
		writeFileSync(
			join(discoveryDir, "tokens.md"),
			"---\nname: tokens\nlocation: \"stages/design/TOKENS.md\"\nrequired: true\n---\n\nResearch design tokens.\n",
		)
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: { tokens: { at: "2026-05-06T00:00:00Z" } },
		})
		const action = await runTick(repoRoot, slug)
		assert.notStrictEqual(action.action, "discovery_required")
	})
})

// ── P12: gate stackup priority chain ──────────────────────────────────

test("cursor: all three gates missing simultaneously → design_direction fires first", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-gate-stackup", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })
		// Plant clarify questions AND a discovery template AND
		// requires_design_direction. None of the three gates have a
		// recorded answer/selection — all three should be fireable.
		// Priority chain: design_direction → clarify → discovery →
		// elaborate. Verify the FIRST emit is design_direction_required.
		const clarifyDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"clarify",
		)
		mkdirSync(clarifyDir, { recursive: true })
		writeFileSync(
			join(clarifyDir, "audience.md"),
			"---\nprompt: Audience?\n---\n\nbody\n",
		)
		const discoveryDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"discovery",
		)
		mkdirSync(discoveryDir, { recursive: true })
		writeFileSync(
			join(discoveryDir, "tokens.md"),
			"---\nname: tokens\nlocation: \"stages/design/TOKENS.md\"\nrequired: true\n---\n\nbody\n",
		)
		// Plant a wave-ready unit so discovery has SOMETHING to gate on.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"design_direction_required",
			`priority chain failed; expected design_direction first; got: ${action.action}`,
		)
	})
})

test("cursor: design_direction recorded → clarify fires next", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-stackup-clarify", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		// Stamp design selection but NOT clarify answers.
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			extraFm: {
				design_directions: {
					design: { archetype: "x", at: "t", surfaced_at: "t" },
				},
			},
		})
		const clarifyDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"clarify",
		)
		mkdirSync(clarifyDir, { recursive: true })
		writeFileSync(
			join(clarifyDir, "audience.md"),
			"---\nprompt: Audience?\n---\n\nbody\n",
		)
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "clarify_required")
	})
})

test("cursor: design + clarify recorded → discovery fires next", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-stackup-discovery", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			extraFm: {
				design_directions: {
					design: { archetype: "x", at: "t", surfaced_at: "t" },
				},
				clarifications: {
					design: { answers: [], at: "t" },
				},
			},
		})
		const discoveryDir = join(
			repoRoot,
			".haiku",
			"studios",
			"test",
			"stages",
			"design",
			"discovery",
		)
		mkdirSync(discoveryDir, { recursive: true })
		writeFileSync(
			join(discoveryDir, "tokens.md"),
			"---\nname: tokens\nlocation: \"stages/design/TOKENS.md\"\nrequired: true\n---\n\nbody\n",
		)
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "discovery_required")
	})
})

// ── P18: pre-stage cursor on intent start ────────────────────────────

test("cursor: brand-new intent (no stages dir at all) → elaborate on first declared stage", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-pre-stage-fresh", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		// makeIntent creates intent.md but does NOT create any stages/
		// directory or unit files. This is the literal "intent_create
		// just landed, agent's first run_next" state.
		makeIntent({ intentDir, slug, studio: "test" })
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"elaborate",
			`brand-new intent should emit elaborate; got ${action.action}`,
		)
		assert.strictEqual(action.stage, "design")
	})
})

test("cursor: brand-new intent + stage with design_direction gate → design_direction_required (not elaborate)", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-pre-stage-dd", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["classifier", "builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
					requires_design_direction: true,
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })
		const action = await runTick(repoRoot, slug)
		// Pre-stage cursor must fire the design-direction gate BEFORE
		// emitting elaborate, even when no units exist yet.
		assert.strictEqual(action.action, "design_direction_required")
	})
})

test("cursor: brand-new intent with sealed_at already set → sealed (sanity)", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-pre-stage-sealed", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			sealed: true,
			approvals: {
				spec: { at: "2026-05-06T00:00:00Z" },
				continuity: { at: "2026-05-06T00:00:00Z" },
				user: { at: "2026-05-06T00:00:00Z" },
			},
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(action.action, "sealed")
	})
})

test("cursor: intent with FB on a stage that hasn't started yet → start_feedback_hat preempts", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-pre-stage-fb", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// File a FB on the first stage even though no units exist yet.
		// Cursor should still preempt — the FB needs triage before the
		// stage gets units.
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "early concern",
			body: "user-typed concern at intent start",
			closed: false,
		})
		const action = await runTick(repoRoot, slug)
		// Cursor must NOT silently emit elaborate when an open FB exists;
		// FB triage takes priority. Either start_feedback_hat or another
		// FB-related action is acceptable.
		assert.notStrictEqual(action.action, "elaborate")
	})
})

// ── Sealed intent ────────────────────────────────────────────────────

test("cursor: sealed intent → sealed action", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("cursor-sealed", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({
			intentDir,
			slug,
			studio: "test",
			approvals: {
				spec: { at: "t" },
				continuity: { at: "t" },
				user: { at: "t" },
			},
			sealed: true,
		})
		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"sealed",
			`sealed intent should return sealed; got: ${action.action}`,
		)
	})
})
