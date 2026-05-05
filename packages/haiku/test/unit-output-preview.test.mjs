#!/usr/bin/env npx tsx
// Test suite for buildUnitOutputPreviews — verifies per-unit output
// classification, URL stamping, popover-body rendering, and the
// path-safety guard.

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildUnitOutputPreviews } from "../src/unit-output-preview.ts"

const tmp = mkdtempSync(join(tmpdir(), "haiku-unit-output-preview-"))
const SESSION = "sess-abc"
let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		await fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

function setupIntent() {
	const intentDir = mkdtempSync(join(tmp, "intent-"))
	mkdirSync(join(intentDir, "product"), { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "artifacts"), { recursive: true })
	writeFileSync(
		join(intentDir, "product", "ACCEPTANCE-CRITERIA.md"),
		"---\ntitle: AC\n---\n# Acceptance criteria\n\nA bunch of words go here that describe what success looks like.",
	)
	writeFileSync(
		join(intentDir, "stages", "design", "artifacts", "icon.png"),
		Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic, won't decode but the entry should still surface
	)
	writeFileSync(
		join(intentDir, "stages", "design", "artifacts", "wireframe.html"),
		"<!doctype html><html><body><h1>wireframe</h1></body></html>",
	)
	writeFileSync(
		join(intentDir, "stages", "design", "artifacts", "tokens.json"),
		'{"primary": "#000"}',
	)
	return intentDir
}

await test("returns empty array when unit has no outputs declared", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, undefined)
	assert.deepStrictEqual(out, [])
})

await test("returns empty array when outputs is empty", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [])
	assert.deepStrictEqual(out, [])
})

await test("classifies markdown outputs and inlines preview body", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"product/ACCEPTANCE-CRITERIA.md",
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].type, "markdown")
	assert.strictEqual(out[0].path, "product/ACCEPTANCE-CRITERIA.md")
	assert.strictEqual(out[0].name, "ACCEPTANCE-CRITERIA")
	assert.strictEqual(out[0].exists, true)
	assert.ok(out[0].previewBody?.includes("Acceptance criteria"))
	assert.ok(
		!out[0].previewBody?.includes("title: AC"),
		"frontmatter is stripped from preview body",
	)
})

await test("classifies html outputs and inlines preview body", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"stages/design/artifacts/wireframe.html",
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].type, "html")
	assert.ok(out[0].previewBody?.includes("<h1>wireframe</h1>"))
})

await test("classifies image outputs without inlining preview body", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"stages/design/artifacts/icon.png",
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].type, "image")
	assert.strictEqual(out[0].previewBody, undefined)
})

await test("unknown extensions classify as type:file", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"stages/design/artifacts/tokens.json",
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].type, "file")
	assert.strictEqual(out[0].previewBody, undefined)
})

await test("stamps a /stage-artifacts/{sessionId}/{path} URL on every entry", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"product/ACCEPTANCE-CRITERIA.md",
		"stages/design/artifacts/icon.png",
	])
	assert.strictEqual(
		out[0].url,
		`/stage-artifacts/${SESSION}/product/ACCEPTANCE-CRITERIA.md`,
	)
	assert.strictEqual(
		out[1].url,
		`/stage-artifacts/${SESSION}/stages/design/artifacts/icon.png`,
	)
})

await test("workspace-relative declared paths collapse to intent-relative", async () => {
	const intentDir = setupIntent()
	const intentName = intentDir.split("/").pop()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		`.haiku/intents/${intentName}/product/ACCEPTANCE-CRITERIA.md`,
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].path, "product/ACCEPTANCE-CRITERIA.md")
	assert.strictEqual(
		out[0].url,
		`/stage-artifacts/${SESSION}/product/ACCEPTANCE-CRITERIA.md`,
	)
})

await test("declared output that does not exist on disk surfaces with exists:false", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"product/MISSING.md",
	])
	assert.strictEqual(out.length, 1)
	assert.strictEqual(out[0].exists, false)
	assert.strictEqual(out[0].previewBody, undefined)
	assert.strictEqual(out[0].sizeBytes, undefined)
})

await test("path-safety: traversal paths are silently dropped", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"../../etc/passwd",
		"product/ACCEPTANCE-CRITERIA.md",
	])
	assert.strictEqual(
		out.length,
		1,
		"only the in-intent-dir entry survives the containment check",
	)
	assert.strictEqual(out[0].path, "product/ACCEPTANCE-CRITERIA.md")
})

await test("sizeBytes is populated for files that exist on disk", async () => {
	const intentDir = setupIntent()
	const out = await buildUnitOutputPreviews(intentDir, SESSION, [
		"stages/design/artifacts/tokens.json",
	])
	assert.strictEqual(out.length, 1)
	assert.ok(typeof out[0].sizeBytes === "number" && out[0].sizeBytes > 0)
})

console.log(`\n${passed} passed, ${failed} failed\n`)
rmSync(tmp, { recursive: true, force: true })
process.exit(failed > 0 ? 1 : 0)
