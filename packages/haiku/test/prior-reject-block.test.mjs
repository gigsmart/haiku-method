#!/usr/bin/env npx tsx
// Test suite for buildPriorRejectBlock and the background dispatch attribute.
// Covers the two churn-reduction fixes that ship together:
//   1. The next bolt's prompt surfaces the prior bolt's reject reason.
//   2. The <subagent> dispatch markup carries `background="true"` when the
//      active harness supports background spawning.
// Run: npx tsx test/prior-reject-block.test.mjs

import assert from "node:assert"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	buildPriorFeedbackRejectBlock,
	buildPriorRejectBlock,
} from "../src/orchestrator/prompts/_helpers.ts"
import { formatSubagentDispatchBlock } from "../src/subagent-prompt-file.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

const tmp = mkdtempSync(join(tmpdir(), "haiku-prior-reject-"))

function writeUnit(name, frontmatter) {
	const unitPath = join(tmp, `${name}.md`)
	const fm = Object.entries(frontmatter)
		.map(([k, v]) => {
			if (Array.isArray(v)) {
				return `${k}:\n${v
					.map(
						(item) =>
							`  - ${Object.entries(item)
								.map(([ik, iv]) => `${ik}: ${JSON.stringify(iv)}`)
								.join("\n    ")}`,
					)
					.join("\n")}`
			}
			return `${k}: ${JSON.stringify(v)}`
		})
		.join("\n")
	writeFileSync(unitPath, `---\n${fm}\n---\n\n# Unit body\n`, "utf8")
	return unitPath
}

try {
	// ── buildPriorRejectBlock ─────────────────────────────────────────────────

	console.log("\n=== buildPriorRejectBlock ===")

	test("returns empty string when unit file does not exist", () => {
		const out = buildPriorRejectBlock(join(tmp, "no-such-file.md"))
		assert.strictEqual(out, "")
	})

	test("returns empty string when iterations array is empty", () => {
		const path = writeUnit("u-empty", {
			name: "u-empty",
			hat: "planner",
			bolt: 1,
			iterations: [],
		})
		assert.strictEqual(buildPriorRejectBlock(path), "")
	})

	test("returns empty string when no completed reject iteration exists", () => {
		const path = writeUnit("u-only-advance", {
			name: "u-only-advance",
			hat: "builder",
			bolt: 2,
			iterations: [
				{
					hat: "planner",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "advance",
				},
				{
					hat: "builder",
					started_at: "2026-04-30T00:02:00Z",
					completed_at: null,
					result: null,
				},
			],
		})
		assert.strictEqual(buildPriorRejectBlock(path), "")
	})

	test("surfaces the reject reason from the most recent completed reject", () => {
		const path = writeUnit("u-rejected", {
			name: "u-rejected",
			hat: "builder",
			bolt: 4,
			iterations: [
				{
					hat: "planner",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "advance",
				},
				{
					hat: "builder",
					started_at: "2026-04-30T00:02:00Z",
					completed_at: "2026-04-30T00:03:00Z",
					result: "advance",
				},
				{
					hat: "reviewer",
					started_at: "2026-04-30T00:04:00Z",
					completed_at: "2026-04-30T00:05:00Z",
					result: "reject",
					reason:
						"Two defects: enumerateTrackedSurface absPath bug; baseline keys not sorted.",
				},
				{
					hat: "builder",
					started_at: "2026-04-30T00:06:00Z",
					completed_at: null,
					result: null,
				},
			],
		})
		const out = buildPriorRejectBlock(path)
		assert.match(out, /Prior rejection/)
		assert.match(out, /reviewer/)
		assert.match(out, /enumerateTrackedSurface absPath bug/)
		assert.match(out, /baseline keys not sorted/)
		// Hard requirement language must be present so the next bolt
		// understands these are not optional follow-ups.
		assert.match(out, /haiku_unit_reject_hat/)
	})

	test("ignores the open in-flight iteration even if it has a reason", () => {
		// Defensive: if an iteration is still open (completed_at: null) but
		// somehow has a `reason`, we must not surface it as the prior reject.
		const path = writeUnit("u-open-with-reason", {
			name: "u-open-with-reason",
			hat: "builder",
			bolt: 2,
			iterations: [
				{
					hat: "builder",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: null,
					result: null,
					reason: "should not be surfaced",
				},
			],
		})
		assert.strictEqual(buildPriorRejectBlock(path), "")
	})

	test("returns empty when the reject iteration has no reason text", () => {
		const path = writeUnit("u-reject-no-reason", {
			name: "u-reject-no-reason",
			hat: "builder",
			bolt: 2,
			iterations: [
				{
					hat: "builder",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "reject",
				},
			],
		})
		assert.strictEqual(buildPriorRejectBlock(path), "")
	})

	test("picks the LAST completed reject when multiple exist", () => {
		const path = writeUnit("u-multi-reject", {
			name: "u-multi-reject",
			hat: "builder",
			bolt: 5,
			iterations: [
				{
					hat: "builder",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "reject",
					reason: "older reason",
				},
				{
					hat: "builder",
					started_at: "2026-04-30T00:02:00Z",
					completed_at: "2026-04-30T00:03:00Z",
					result: "advance",
				},
				{
					hat: "reviewer",
					started_at: "2026-04-30T00:04:00Z",
					completed_at: "2026-04-30T00:05:00Z",
					result: "reject",
					reason: "newer reason",
				},
				{
					hat: "builder",
					started_at: "2026-04-30T00:06:00Z",
					completed_at: null,
					result: null,
				},
			],
		})
		const out = buildPriorRejectBlock(path)
		assert.match(out, /newer reason/)
		assert.ok(!out.includes("older reason"), "must not surface older reason")
	})

	// ── buildPriorFeedbackRejectBlock (fix-loop iteration shape) ──────────────

	console.log("\n=== buildPriorFeedbackRejectBlock ===")

	test("returns empty string when feedback file does not exist", () => {
		assert.strictEqual(
			buildPriorFeedbackRejectBlock(join(tmp, "no-such-fb.md")),
			"",
		)
	})

	test("surfaces the most recent rejected fix-loop iteration", () => {
		const path = writeUnit("fb-rejected", {
			id: "FB-007",
			status: "pending",
			iterations: [
				{
					bolt: 1,
					hat: "fix-implementer",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "advanced",
				},
				{
					bolt: 1,
					hat: "fix-assessor",
					started_at: "2026-04-30T00:02:00Z",
					completed_at: "2026-04-30T00:03:00Z",
					result: "rejected",
					reason: "Validation guard still missing on payload.qty",
				},
			],
		})
		const out = buildPriorFeedbackRejectBlock(path)
		assert.match(out, /Prior fix-bolt rejection/)
		assert.match(out, /fix-assessor/)
		assert.match(out, /bolt 1/)
		assert.match(out, /Validation guard still missing on payload\.qty/)
	})

	test("returns empty when no rejected iteration exists (only advanced/closed)", () => {
		const path = writeUnit("fb-no-reject", {
			id: "FB-008",
			status: "closed",
			iterations: [
				{
					bolt: 1,
					hat: "fix-implementer",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "advanced",
				},
				{
					bolt: 1,
					hat: "fix-assessor",
					started_at: "2026-04-30T00:02:00Z",
					completed_at: "2026-04-30T00:03:00Z",
					result: "closed",
				},
			],
		})
		assert.strictEqual(buildPriorFeedbackRejectBlock(path), "")
	})

	test("returns empty when the rejected iteration has no reason text", () => {
		const path = writeUnit("fb-rejected-no-reason", {
			id: "FB-010",
			status: "pending",
			iterations: [
				{
					bolt: 1,
					hat: "fix-assessor",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "rejected",
				},
			],
		})
		assert.strictEqual(buildPriorFeedbackRejectBlock(path), "")
	})

	test("uses 'rejected' (feedback shape) not 'reject' (unit shape)", () => {
		// Defensive: feedback iteration uses different result vocabulary.
		// "reject" is unit-shape; the feedback block must NOT match it.
		const path = writeUnit("fb-wrong-result", {
			id: "FB-009",
			status: "pending",
			iterations: [
				{
					bolt: 1,
					hat: "fix-assessor",
					started_at: "2026-04-30T00:00:00Z",
					completed_at: "2026-04-30T00:01:00Z",
					result: "reject", // unit-shape, should not match
					reason: "should not surface — wrong result token",
				},
			],
		})
		assert.strictEqual(buildPriorFeedbackRejectBlock(path), "")
	})

	// ── formatSubagentDispatchBlock background attribute ──────────────────────

	console.log("\n=== formatSubagentDispatchBlock background attribute ===")

	test("omits background attribute by default (callers must opt in)", () => {
		const block = formatSubagentDispatchBlock({
			path: "/tmp/example.prompt.md",
			agentType: "general-purpose",
			toolAttr: true,
		})
		assert.ok(
			!block.includes("background="),
			"default emission must not carry background attribute",
		)
		assert.match(
			block,
			/<subagent tool="Agent" type="general-purpose" prompt_file=/,
		)
	})

	test('emits background="true" when caller passes background: true', () => {
		const block = formatSubagentDispatchBlock({
			path: "/tmp/example.prompt.md",
			agentType: "general-purpose",
			toolAttr: true,
			background: true,
		})
		assert.match(block, /background="true"/)
	})

	test("omits background attribute when caller passes background: false explicitly", () => {
		const block = formatSubagentDispatchBlock({
			path: "/tmp/example.prompt.md",
			agentType: "general-purpose",
			toolAttr: true,
			background: false,
		})
		assert.ok(
			!block.includes("background="),
			"background: false must not emit attribute",
		)
	})

	test("background attribute follows model attribute in declaration order", () => {
		const block = formatSubagentDispatchBlock({
			path: "/tmp/example.prompt.md",
			agentType: "general-purpose",
			model: "opus",
			toolAttr: true,
			background: true,
		})
		const modelIdx = block.indexOf('model="opus"')
		const bgIdx = block.indexOf('background="true"')
		const promptIdx = block.indexOf("prompt_file=")
		assert.ok(modelIdx > 0 && bgIdx > 0 && promptIdx > 0)
		assert.ok(modelIdx < bgIdx, "model must come before background")
		assert.ok(bgIdx < promptIdx, "background must come before prompt_file")
	})
} finally {
	rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
