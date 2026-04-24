#!/usr/bin/env npx tsx
// Drift tests for @haiku/shared/frontmatter.
// - isDuplicateKeyError must recognize the real error thrown by gray-matter
//   when YAML contains duplicate mapping keys. gray-matter delegates to
//   js-yaml v4; if either dependency changes the error format, the MCP
//   server and the browse UI both silently lose duplicate-key recovery.
// - dedupeFrontmatterKeys/dedupeTopLevelYamlKeys round-trip and preserve
//   nested blocks as a unit.
// Run: npx tsx test/frontmatter-shared.test.mjs

import assert from "node:assert"
import {
	dedupeFrontmatterKeys,
	dedupeTopLevelYamlKeys,
	isDuplicateKeyError,
} from "@haiku/shared/frontmatter"
import matter from "gray-matter"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		console.log(`  ✓ ${name}`)
		passed++
	} catch (err) {
		console.error(`  ✗ ${name}`)
		console.error(`    ${err.message}`)
		failed++
	}
}

console.log("=== shared/frontmatter: drift & dedupe ===")

test("isDuplicateKeyError recognizes the real error gray-matter throws", () => {
	const raw = `---
title: test
active_stage: a
active_stage: b
---
`
	let caught
	try {
		matter(raw)
	} catch (err) {
		caught = err
	}
	assert.ok(
		caught,
		"gray-matter should throw on duplicate mapping keys — if this fires, the upstream behavior changed and the recovery path is dead code",
	)
	assert.strictEqual(
		isDuplicateKeyError(caught),
		true,
		`isDuplicateKeyError did not match error message "${caught?.message}" — check js-yaml's error text`,
	)
})

test("isDuplicateKeyError returns false for unrelated errors", () => {
	assert.strictEqual(
		isDuplicateKeyError(new Error("some other yaml error")),
		false,
	)
	assert.strictEqual(isDuplicateKeyError("not an Error instance"), false)
	assert.strictEqual(isDuplicateKeyError(undefined), false)
})

test("dedupeFrontmatterKeys keeps last occurrence of duplicated top-level key", () => {
	const raw = `---
title: test
active_stage: a
active_stage: b
---

# body
`
	const { text, removed } = dedupeFrontmatterKeys(raw)
	assert.deepStrictEqual(removed, ["active_stage"])
	assert.ok(text.includes("active_stage: b"))
	assert.ok(!text.includes("active_stage: a\n"))
	assert.ok(text.includes("# body"))
})

test("dedupeFrontmatterKeys leaves clean frontmatter untouched", () => {
	const raw = `---
title: test
active_stage: a
---
`
	const result = dedupeFrontmatterKeys(raw)
	assert.strictEqual(result.text, raw)
	assert.deepStrictEqual(result.removed, [])
})

test("dedupeFrontmatterKeys returns input as-is when no frontmatter", () => {
	const raw = "# just a body\n\nno frontmatter here"
	const result = dedupeFrontmatterKeys(raw)
	assert.strictEqual(result.text, raw)
	assert.deepStrictEqual(result.removed, [])
})

test("dedupeTopLevelYamlKeys treats indented blocks as part of the parent key", () => {
	const yamlBlock = `title: t
composite:
  - studio: old
    stages: [a, b]
composite:
  - studio: new
    stages: [x, y]
`
	const { cleaned, removed } = dedupeTopLevelYamlKeys(yamlBlock)
	assert.deepStrictEqual(removed, ["composite"])
	// Only the second block should remain
	assert.ok(cleaned.includes("studio: new"))
	assert.ok(!cleaned.includes("studio: old"))
	// Indented lines should move with their parent key
	assert.ok(cleaned.includes("stages: [x, y]"))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
