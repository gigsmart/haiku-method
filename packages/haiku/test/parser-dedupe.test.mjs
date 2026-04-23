#!/usr/bin/env npx tsx
// Test suite for parser.ts duplicate-YAML-key recovery.
// Run: npx tsx test/parser-dedupe.test.mjs

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import { parseIntent, parseUnit, parseDiscovery } from "../src/parser.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	return fn()
		.then(() => {
			console.log(`  ✓ ${name}`)
			passed++
		})
		.catch((err) => {
			console.error(`  ✗ ${name}`)
			console.error(`    ${err.message}`)
			failed++
		})
}

console.log("=== parser: duplicate-key recovery ===")

const tmp = mkdtempSync(join(tmpdir(), "haiku-parser-dedupe-"))

// Silence warn output from the recovery code path — expected during these tests
const origWarn = console.warn
console.warn = () => {}

try {
	await test("parseIntent: duplicate active_stage keeps last occurrence", async () => {
		const dir = join(tmp, "intent-1")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			`---
title: Test Intent
studio: software
active_stage: discovery
active_stage: development
status: active
---

# Test Intent

Some body.
`,
		)
		const result = await parseIntent(dir)
		assert.ok(result, "expected parse result, got null")
		assert.strictEqual(
			result.frontmatter.active_stage,
			"development",
			"last occurrence should win",
		)
		assert.strictEqual(result.frontmatter.title, "Test Intent")
		assert.strictEqual(result.frontmatter.studio, "software")
		assert.strictEqual(result.frontmatter.status, "active")
	})

	await test("parseIntent: duplicate key with nested block keeps last block", async () => {
		const dir = join(tmp, "intent-2")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			`---
title: Test
composite:
  - studio: old
    stages: [a, b]
composite:
  - studio: new
    stages: [x, y]
---

# Test
`,
		)
		const result = await parseIntent(dir)
		assert.ok(result, "expected parse result")
		assert.ok(Array.isArray(result.frontmatter.composite))
		assert.strictEqual(result.frontmatter.composite[0].studio, "new")
	})

	await test("parseUnit: duplicate status keeps last occurrence", async () => {
		const dir = join(tmp, "unit-1")
		mkdirSync(dir, { recursive: true })
		const filePath = join(dir, "unit-01-something.md")
		writeFileSync(
			filePath,
			`---
status: pending
status: complete
hat: builder
---

# Unit
`,
		)
		const result = await parseUnit(filePath)
		assert.ok(result, "expected parse result")
		assert.strictEqual(result.frontmatter.status, "complete")
		assert.strictEqual(result.frontmatter.hat, "builder")
	})

	await test("parseDiscovery: recovers from duplicate keys", async () => {
		const dir = join(tmp, "intent-3")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "discovery.md"),
			`---
decision: yes
decision: no
---

# Discovery
`,
		)
		const result = await parseDiscovery(dir)
		assert.ok(result, "expected parse result")
		assert.strictEqual(result.frontmatter.decision, "no")
	})

	await test("parseIntent: clean frontmatter still parses normally", async () => {
		const dir = join(tmp, "intent-clean")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			`---
title: Clean
studio: software
active_stage: development
---

# Clean
`,
		)
		const result = await parseIntent(dir)
		assert.ok(result, "expected parse result")
		assert.strictEqual(result.frontmatter.active_stage, "development")
	})
} finally {
	console.warn = origWarn
	rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
