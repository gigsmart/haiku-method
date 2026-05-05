#!/usr/bin/env npx tsx
// Tests for the FM-mutation tools: haiku_intent_set, haiku_stage_set,
// haiku_settings_set. These tools enforce schema validation on every
// write so the workflow-managed file boundary stays honest — agents
// can't slip past validation by hand-editing.

import assert from "node:assert"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.CLAUDE_PLUGIN_ROOT = resolve(__dirname, "..", "..", "..", "plugin")

const { handleStateTool, parseFrontmatter } = await import(
	"../src/state-tools.ts"
)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (err) {
		failed++
		console.log(`  ✗ ${name}`)
		console.log(`    ${err.message}`)
		if (err.stack)
			console.log(`    ${err.stack.split("\n").slice(1, 4).join("\n    ")}`)
	}
}

function projectRoot() {
	const root = mkdtempSync(join(tmpdir(), "haiku-fm-set-"))
	const haiku = join(root, ".haiku")
	mkdirSync(haiku, { recursive: true })
	return { root, haiku }
}

function withCwd(dir, fn) {
	const prev = process.cwd()
	process.chdir(dir)
	try {
		return fn()
	} finally {
		process.chdir(prev)
	}
}

function call(name, args) {
	const result = handleStateTool(name, args)
	const text = result.content?.[0]?.text || "{}"
	return {
		isError: !!result.isError,
		structured: result.structuredContent,
		parsed: JSON.parse(text),
	}
}

console.log("=== haiku_settings_set ===")

test("creates settings.yml when missing + writes simple field", () => {
	const { root, haiku } = projectRoot()
	withCwd(root, () => {
		const r = call("haiku_settings_set", {
			field: "studio",
			value: "software",
		})
		assert.strictEqual(r.isError, false, r.parsed.message)
		assert.strictEqual(r.parsed.ok, true)
	})
	const written = readFileSync(join(haiku, "settings.yml"), "utf8")
	assert.match(written, /studio:\s*software/)
	rmSync(root, { recursive: true, force: true })
})

test("rejects field that fails schema (mockup_format must be ascii|html)", () => {
	const { root, haiku } = projectRoot()
	writeFileSync(join(haiku, "settings.yml"), "studio: software\n")
	withCwd(root, () => {
		const r = call("haiku_settings_set", {
			field: "mockup_format",
			value: "pdf",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "settings_field_validation_failed")
	})
	// Original file unchanged.
	const written = readFileSync(join(haiku, "settings.yml"), "utf8")
	assert.match(written, /studio:\s*software/)
	assert.doesNotMatch(written, /mockup_format/)
	rmSync(root, { recursive: true, force: true })
})

test("null deletes the field", () => {
	const { root, haiku } = projectRoot()
	writeFileSync(
		join(haiku, "settings.yml"),
		"studio: software\nmockup_format: ascii\n",
	)
	withCwd(root, () => {
		const r = call("haiku_settings_set", {
			field: "mockup_format",
			value: null,
		})
		assert.strictEqual(r.isError, false)
	})
	const after = readFileSync(join(haiku, "settings.yml"), "utf8")
	assert.match(after, /studio:\s*software/)
	assert.doesNotMatch(after, /mockup_format/)
	rmSync(root, { recursive: true, force: true })
})

test("missing field returns error", () => {
	const { root } = projectRoot()
	withCwd(root, () => {
		const r = call("haiku_settings_set", { value: "software" })
		assert.strictEqual(r.isError, true)
		// AJV input gate fires before the handler — `field` is a required
		// schema property, so the missing-field rejection now surfaces as
		// the stable `<tool>_input_invalid` code with the field path
		// pinned in `errors[]`.
		assert.strictEqual(r.parsed.error, "haiku_settings_set_input_invalid")
		assert.ok(
			r.parsed.errors.some(
				(e) =>
					e.keyword === "required" && e.params?.missingProperty === "field",
			),
			"Expected required-property violation on /field",
		)
	})
	rmSync(root, { recursive: true, force: true })
})

console.log("\n=== haiku_intent_set ===")

function makeIntent(haiku, slug) {
	const iDir = join(haiku, "intents", slug)
	mkdirSync(iDir, { recursive: true })
	writeFileSync(
		join(iDir, "intent.md"),
		`---
title: Test
studio: software
mode: continuous
status: active
created_at: '2026-04-30'
---

Body.
`,
	)
	return iDir
}

test("sets a writable field (title)", () => {
	const { root, haiku } = projectRoot()
	const iDir = makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "title",
			value: "Renamed",
		})
		assert.strictEqual(r.isError, false, r.parsed.message)
		assert.strictEqual(r.parsed.ok, true)
	})
	const fm = parseFrontmatter(
		readFileSync(join(iDir, "intent.md"), "utf8"),
	).data
	assert.strictEqual(fm.title, "Renamed")
	rmSync(root, { recursive: true, force: true })
})

test("rejects engine-only field (status)", () => {
	const { root, haiku } = projectRoot()
	const iDir = makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "status",
			value: "completed",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_field_engine_only")
	})
	// File unchanged.
	const fm = parseFrontmatter(
		readFileSync(join(iDir, "intent.md"), "utf8"),
	).data
	assert.strictEqual(fm.status, "active")
	rmSync(root, { recursive: true, force: true })
})

test("rejects engine-only completion_review_dispatched", () => {
	const { root, haiku } = projectRoot()
	makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "completion_review_dispatched",
			value: true,
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_field_engine_only")
	})
	rmSync(root, { recursive: true, force: true })
})

test("rejects immutable studio", () => {
	const { root, haiku } = projectRoot()
	makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "studio",
			value: "ideation",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_field_immutable")
	})
	rmSync(root, { recursive: true, force: true })
})

test("rejects unknown field", () => {
	const { root, haiku } = projectRoot()
	makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "made_up_field",
			value: "yes",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_field_unknown")
	})
	rmSync(root, { recursive: true, force: true })
})

test("rejects type mismatch on mode", () => {
	const { root, haiku } = projectRoot()
	makeIntent(haiku, "x")
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "x",
			field: "mode",
			value: "warp-speed",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_field_type_mismatch")
	})
	rmSync(root, { recursive: true, force: true })
})

test("rejects missing intent", () => {
	const { root } = projectRoot()
	withCwd(root, () => {
		const r = call("haiku_intent_set", {
			intent: "ghost",
			field: "title",
			value: "Whatever",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "intent_not_found")
	})
	rmSync(root, { recursive: true, force: true })
})

console.log("\n=== haiku_stage_set ===")

test("rejects every field — engine-only", () => {
	const { root, haiku } = projectRoot()
	makeIntent(haiku, "x")
	mkdirSync(join(haiku, "intents", "x", "stages", "design"), {
		recursive: true,
	})
	writeFileSync(
		join(haiku, "intents", "x", "stages", "design", "state.json"),
		JSON.stringify({ stage: "design", status: "active", phase: "elaborate" }),
	)
	withCwd(root, () => {
		const r = call("haiku_stage_set", {
			intent: "x",
			stage: "design",
			field: "status",
			value: "completed",
		})
		assert.strictEqual(r.isError, true)
		assert.strictEqual(r.parsed.error, "stage_field_engine_only")
	})
	const after = JSON.parse(
		readFileSync(
			join(haiku, "intents", "x", "stages", "design", "state.json"),
			"utf8",
		),
	)
	assert.strictEqual(after.status, "active", "state.json unchanged")
	rmSync(root, { recursive: true, force: true })
})

console.log("")
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
