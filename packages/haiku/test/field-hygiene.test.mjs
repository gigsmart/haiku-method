#!/usr/bin/env npx tsx
// field-hygiene.test.mjs — Verify the post-migration cruft detector.

import assert from "node:assert"
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import {
	auditIntentFields,
	renderHygieneReport,
} from "../src/orchestrator/migrations/field-hygiene.ts"

function makeIntentDir() {
	const root = mkdtempSync(join(tmpdir(), "haiku-hygiene-"))
	const intentDir = join(root, ".haiku", "intents", "test")
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "feedback"), {
		recursive: true,
	})
	return { root, intentDir }
}

test("auditIntentFields: clean v4 intent has zero unknown fields", () => {
	const { root, intentDir } = makeIntentDir()
	try {
		writeFileSync(
			join(intentDir, "intent.md"),
			matter.stringify("# t\n", {
				title: "t",
				studio: "software",
				mode: "discrete",
				plugin_version: "4.0.0",
				started_at: null,
				approvals: {},
				sealed_at: null,
				stages: ["design"],
			}),
		)
		writeFileSync(
			join(intentDir, "stages", "design", "units", "unit-01.md"),
			matter.stringify("# u\n", {
				title: "u",
				started_at: null,
				iterations: [],
				reviews: {},
				approvals: {},
				discovery: {},
			}),
		)
		const report = auditIntentFields(intentDir)
		assert.deepStrictEqual(report.intent, [])
		assert.deepStrictEqual(report.units, [])
		assert.deepStrictEqual(report.feedback, [])
		assert.strictEqual(renderHygieneReport(report), "")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("auditIntentFields: flags abandoned-experimental intent fields", () => {
	const { root, intentDir } = makeIntentDir()
	try {
		// Intent carries a couple of fields the v4 schema doesn't know
		// about — typical of a long-lived v3 intent that accumulated
		// experimental keys. The script should flag both.
		writeFileSync(
			join(intentDir, "intent.md"),
			matter.stringify("# t\n", {
				title: "t",
				studio: "software",
				mode: "discrete",
				plugin_version: "4.0.0",
				started_at: null,
				approvals: {},
				sealed_at: null,
				stages: ["design"],
				experimental_orchestration: "v2",
				deprecated_legacy_field: 42,
			}),
		)
		const report = auditIntentFields(intentDir)
		assert.deepStrictEqual(report.intent.sort(), [
			"deprecated_legacy_field",
			"experimental_orchestration",
		])
		const md = renderHygieneReport(report)
		assert.match(md, /experimental_orchestration/)
		assert.match(md, /deprecated_legacy_field/)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("auditIntentFields: flags unknown unit + FB keys, including stage path", () => {
	const { root, intentDir } = makeIntentDir()
	try {
		writeFileSync(
			join(intentDir, "intent.md"),
			matter.stringify("# t\n", { title: "t", plugin_version: "4.0.0" }),
		)
		writeFileSync(
			join(intentDir, "stages", "design", "units", "unit-01.md"),
			matter.stringify("# u\n", {
				title: "u",
				iterations: [],
				custom_metric_v3: "yes",
			}),
		)
		writeFileSync(
			join(intentDir, "stages", "design", "feedback", "01-fb.md"),
			matter.stringify("body\n", {
				title: "fb",
				origin: "user-chat",
				abandoned_field: true,
			}),
		)
		const report = auditIntentFields(intentDir)
		assert.strictEqual(report.units.length, 1)
		assert.strictEqual(report.units[0].unit, "design/unit-01.md")
		assert.deepStrictEqual(report.units[0].unknown, ["custom_metric_v3"])
		assert.strictEqual(report.feedback.length, 1)
		assert.strictEqual(report.feedback[0].fb, "design/01-fb.md")
		assert.deepStrictEqual(report.feedback[0].unknown, ["abandoned_field"])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("auditIntentFields: handles intent-scope feedback (no stage path)", () => {
	const { root, intentDir } = makeIntentDir()
	try {
		mkdirSync(join(intentDir, "feedback"), { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			matter.stringify("# t\n", { title: "t", plugin_version: "4.0.0" }),
		)
		writeFileSync(
			join(intentDir, "feedback", "01-cross.md"),
			matter.stringify("body\n", {
				title: "cross",
				origin: "studio-review",
				ghost_field: "v3 leftover",
			}),
		)
		const report = auditIntentFields(intentDir)
		assert.strictEqual(report.feedback.length, 1)
		assert.strictEqual(report.feedback[0].fb, "_intent/01-cross.md")
		assert.deepStrictEqual(report.feedback[0].unknown, ["ghost_field"])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
