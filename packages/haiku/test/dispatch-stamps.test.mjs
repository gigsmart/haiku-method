// dispatch-stamps.test.mjs — Unit coverage for the dispatch-stamps
// helper that fills four engine gaps (see dispatch-stamps.ts header):
//   - dispatch_review stamping (per-unit reviews.<role>)
//   - dispatch_approval stamping (per-unit approvals.<role>)
//   - intent_review stamping for non-user roles (intent.approvals.<role>)
//   - close_feedback invalidations (clearing role keys)
//
// These tests stub the disk layout directly without driving the full
// run_next path. They lock the contract of stash → drain → stamp and
// the targets.invalidates application.

import assert from "node:assert"
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

async function withRepo(fn) {
	const root = mkdtempSync(join(tmpdir(), "haiku-dispatch-stamps-"))
	const orig = process.cwd()
	try {
		mkdirSync(join(root, ".haiku", "intents", "test-intent"), { recursive: true })
		process.chdir(root)
		return await fn(root)
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(root, { recursive: true, force: true })
	}
}

function writeIntent(root, fm = {}) {
	const path = join(root, ".haiku", "intents", "test-intent", "intent.md")
	writeFileSync(
		path,
		matter.stringify("# test\n", {
			title: "test",
			studio: "software",
			mode: "continuous",
			plugin_version: "4.0.0",
			started_at: null,
			sealed_at: null,
			approvals: {},
			...fm,
		}),
	)
	return path
}

function writeUnit(root, stage, name, fm = {}) {
	const dir = join(
		root,
		".haiku",
		"intents",
		"test-intent",
		"stages",
		stage,
		"units",
	)
	mkdirSync(dir, { recursive: true })
	const path = join(dir, `${name}.md`)
	writeFileSync(
		path,
		matter.stringify(`# ${name}\n`, {
			title: name,
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			...fm,
		}),
	)
	return path
}

function writeFeedback(root, stage, num, fm = {}) {
	const dir = stage
		? join(root, ".haiku", "intents", "test-intent", "stages", stage, "feedback")
		: join(root, ".haiku", "intents", "test-intent", "feedback")
	mkdirSync(dir, { recursive: true })
	const path = join(dir, `${num}-stub.md`)
	writeFileSync(
		path,
		matter.stringify("body\n", {
			title: "stub",
			origin: "adversarial-review",
			author: "test",
			author_type: "agent",
			created_at: new Date().toISOString(),
			source_ref: "spec",
			targets: { unit: null, invalidates: [] },
			...fm,
		}),
	)
	return path
}

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}

test("dispatch_review: stash + drain stamps reviews.<role> on each unit", async () => {
	await withRepo(async (root) => {
		const intentPath = writeIntent(root)
		const u1 = writeUnit(root, "inception", "unit-01")
		const u2 = writeUnit(root, "inception", "unit-02")

		const { stashPendingDispatch, drainPendingDispatches } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		stashPendingDispatch(
			"test-intent",
			"review",
			"inception",
			"spec",
			["unit-01", "unit-02"],
		)

		// Stash should land on intent.md.
		const intentFm = readFm(intentPath)
		assert.ok(intentFm._pending_review_dispatches?.inception?.spec?.dispatched_at)
		assert.deepStrictEqual(
			intentFm._pending_review_dispatches.inception.spec.units,
			["unit-01", "unit-02"],
		)

		const stamped = drainPendingDispatches("test-intent")
		assert.strictEqual(stamped, true)

		// Both units now have reviews.spec stamped.
		assert.ok(readFm(u1).reviews?.spec?.at)
		assert.ok(readFm(u2).reviews?.spec?.at)

		// Pending field cleared.
		assert.deepStrictEqual(readFm(intentPath)._pending_review_dispatches, {})
	})
})

test("dispatch_review: drain skips units with open invalidating FBs filed since dispatch", async () => {
	await withRepo(async (root) => {
		writeIntent(root)
		const u1 = writeUnit(root, "inception", "unit-01")
		const u2 = writeUnit(root, "inception", "unit-02")

		const { stashPendingDispatch, drainPendingDispatches } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		stashPendingDispatch(
			"test-intent",
			"review",
			"inception",
			"spec",
			["unit-01", "unit-02"],
		)

		// File an open FB targeting unit-02 with target_invalidates: ["spec"].
		writeFeedback(root, "inception", "001", {
			source_ref: "spec",
			targets: { unit: "unit-02", invalidates: ["spec"] },
			created_at: new Date(Date.now() + 1000).toISOString(),
		})

		drainPendingDispatches("test-intent")

		// unit-01 stamped, unit-02 skipped.
		assert.ok(readFm(u1).reviews?.spec?.at)
		assert.strictEqual(readFm(u2).reviews?.spec, undefined)
	})
})

test("dispatch_approval: stash + drain stamps approvals.<role>", async () => {
	await withRepo(async (root) => {
		writeIntent(root)
		const u1 = writeUnit(root, "inception", "unit-01")

		const { stashPendingDispatch, drainPendingDispatches } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		stashPendingDispatch(
			"test-intent",
			"approval",
			"inception",
			"code-reviewer",
			["unit-01"],
		)
		drainPendingDispatches("test-intent")

		assert.ok(readFm(u1).approvals?.["code-reviewer"]?.at)
	})
})

test("intent_review: stash + drain stamps intent.approvals.<role> for non-user roles", async () => {
	await withRepo(async (root) => {
		const intentPath = writeIntent(root)

		const { stashPendingIntentReview, drainPendingDispatches } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		stashPendingIntentReview("test-intent", "spec")
		stashPendingIntentReview("test-intent", "user") // should be a no-op

		const fmAfterStash = readFm(intentPath)
		assert.ok(fmAfterStash._pending_intent_review_dispatches?.spec)
		assert.strictEqual(
			fmAfterStash._pending_intent_review_dispatches?.user,
			undefined,
		)

		drainPendingDispatches("test-intent")
		const fmAfterDrain = readFm(intentPath)
		assert.ok(fmAfterDrain.approvals?.spec?.at)
		assert.strictEqual(fmAfterDrain.approvals?.user, undefined)
		assert.deepStrictEqual(fmAfterDrain._pending_intent_review_dispatches, {})
	})
})

test("intent_review: drain skips role with open invalidating intent-scope FB", async () => {
	await withRepo(async (root) => {
		const intentPath = writeIntent(root)

		const { stashPendingIntentReview, drainPendingDispatches } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		stashPendingIntentReview("test-intent", "spec")

		writeFeedback(root, null, "001", {
			source_ref: "spec",
			targets: { unit: null, invalidates: ["spec"] },
			created_at: new Date(Date.now() + 1000).toISOString(),
		})

		drainPendingDispatches("test-intent")
		const fm = readFm(intentPath)
		assert.strictEqual(fm.approvals?.spec, undefined)
	})
})

test("applyFeedbackInvalidations: clears named role keys from reviews and approvals", async () => {
	await withRepo(async (root) => {
		writeIntent(root)
		const u1 = writeUnit(root, "inception", "unit-01", {
			reviews: { spec: { at: "2026-01-01T00:00:00Z" } },
			approvals: {
				spec: { at: "2026-01-01T00:00:00Z" },
				"code-reviewer": { at: "2026-01-01T00:00:00Z" },
			},
		})

		const { applyFeedbackInvalidations } = await import(
			"../src/orchestrator/workflow/dispatch-stamps.js"
		)
		applyFeedbackInvalidations({
			slug: "test-intent",
			stage: "inception",
			targetUnit: "unit-01",
			invalidates: ["spec"],
		})

		const fm = readFm(u1)
		assert.strictEqual(fm.reviews?.spec, undefined)
		assert.strictEqual(fm.approvals?.spec, undefined)
		assert.ok(
			fm.approvals?.["code-reviewer"]?.at,
			"non-invalidated keys preserved",
		)
	})
})
