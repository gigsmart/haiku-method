#!/usr/bin/env npx tsx
// Test suite for enforce-iteration hook — allComplete / stage-based completion logic
// Run: npx tsx test/enforce-iteration.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import {
  readFrontmatterStringList,
  allStagesCompleted,
  readJson,
} from "../src/hooks/utils.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-enforce-iteration-test-"))

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}: ${e.message}`)
  }
}

/** Create a minimal intent directory with stages frontmatter */
function makeIntent(dir, stages, extraFm = "") {
  mkdirSync(dir, { recursive: true })
  const stagesList = stages.length > 0 ? `[${stages.join(", ")}]` : "[]"
  writeFileSync(
    join(dir, "intent.md"),
    `---\ntitle: Test Intent\nstatus: active\nstages: ${stagesList}\nactive_stage: ${stages[0] || ""}\n${extraFm}---\n\nTest intent body.\n`,
  )
}

/** Create a stage state.json with given status */
function makeStageState(intentDir, stageName, status) {
  const stageDir = join(intentDir, "stages", stageName)
  mkdirSync(stageDir, { recursive: true })
  writeFileSync(join(stageDir, "state.json"), JSON.stringify({ status }))
}

/** Create a unit file in a stage */
function makeUnit(intentDir, stageName, unitName, status = "completed") {
  const unitsDir = join(intentDir, "stages", stageName, "units")
  mkdirSync(unitsDir, { recursive: true })
  writeFileSync(
    join(unitsDir, `${unitName}.md`),
    `---\ntitle: ${unitName}\nstatus: ${status}\n---\n\nUnit body.\n`,
  )
}

try {

// ── readFrontmatterStringList ─────────────────────────────────────────────

console.log("\n=== readFrontmatterStringList ===")

test("parses inline array [a, b, c]", () => {
  const f = join(tmp, "list-test.md")
  writeFileSync(f, "---\nstages: [inception, design, development, security]\n---\n")
  const list = readFrontmatterStringList(f, "stages")
  assert.deepStrictEqual(list, ["inception", "design", "development", "security"])
})

test("returns empty array for empty inline array []", () => {
  const f = join(tmp, "list-empty.md")
  writeFileSync(f, "---\nstages: []\n---\n")
  const list = readFrontmatterStringList(f, "stages")
  assert.deepStrictEqual(list, [])
})

test("returns empty array for missing field", () => {
  const f = join(tmp, "list-missing.md")
  writeFileSync(f, "---\ntitle: No stages\n---\n")
  const list = readFrontmatterStringList(f, "stages")
  assert.deepStrictEqual(list, [])
})

test("returns empty array for missing file", () => {
  const list = readFrontmatterStringList(join(tmp, "nonexistent.md"), "stages")
  assert.deepStrictEqual(list, [])
})

test("handles single-item array", () => {
  const f = join(tmp, "list-single.md")
  writeFileSync(f, "---\nstages: [inception]\n---\n")
  const list = readFrontmatterStringList(f, "stages")
  assert.deepStrictEqual(list, ["inception"])
})

// ── allStagesCompleted ────────────────────────────────────────────────────

console.log("\n=== allStagesCompleted ===")

test("REGRESSION: does NOT complete when only one stage has units", () => {
  // This is the original bug: inception has all completed units,
  // but design/development/security haven't been elaborated yet.
  // The old code would see N completed / N total and flip allComplete = true.
  const dir = join(tmp, "regression-bug")
  makeIntent(dir, ["inception", "design", "development", "security"])

  // Only inception is completed
  makeStageState(dir, "inception", "completed")
  makeUnit(dir, "inception", "unit-01-research", "completed")
  makeUnit(dir, "inception", "unit-02-analysis", "completed")

  // Other stages: no state.json, no units (not elaborated yet)

  const result = allStagesCompleted(dir)
  assert.strictEqual(result, false, "Should NOT be complete — 3 stages have no state.json")
})

test("all stages completed -> true", () => {
  const dir = join(tmp, "all-done")
  makeIntent(dir, ["inception", "design", "development", "security"])

  makeStageState(dir, "inception", "completed")
  makeStageState(dir, "design", "completed")
  makeStageState(dir, "development", "completed")
  makeStageState(dir, "security", "completed")

  assert.strictEqual(allStagesCompleted(dir), true)
})

test("one stage missing state.json -> false", () => {
  const dir = join(tmp, "missing-state")
  makeIntent(dir, ["inception", "design", "development"])

  makeStageState(dir, "inception", "completed")
  makeStageState(dir, "design", "completed")
  // development has no state.json at all

  assert.strictEqual(allStagesCompleted(dir), false)
})

test("one stage active -> false", () => {
  const dir = join(tmp, "one-active")
  makeIntent(dir, ["inception", "design", "development"])

  makeStageState(dir, "inception", "completed")
  makeStageState(dir, "design", "active")
  makeStageState(dir, "development", "completed")

  assert.strictEqual(allStagesCompleted(dir), false)
})

test("stages field missing from intent.md -> false (graceful fallback)", () => {
  const dir = join(tmp, "no-stages-field")
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "intent.md"),
    "---\ntitle: No stages field\nstatus: active\n---\n\nBody.\n",
  )

  assert.strictEqual(allStagesCompleted(dir), false)
})

test("stages field is empty array -> false", () => {
  const dir = join(tmp, "empty-stages")
  makeIntent(dir, [])

  assert.strictEqual(allStagesCompleted(dir), false)
})

test("intent.md missing entirely -> false", () => {
  const dir = join(tmp, "no-intent-file")
  mkdirSync(dir, { recursive: true })
  // No intent.md created

  assert.strictEqual(allStagesCompleted(dir), false)
})

test("single stage completed -> true", () => {
  const dir = join(tmp, "single-stage")
  makeIntent(dir, ["research"])

  makeStageState(dir, "research", "completed")

  assert.strictEqual(allStagesCompleted(dir), true)
})

test("stage with empty state.json -> false", () => {
  const dir = join(tmp, "empty-state-json")
  makeIntent(dir, ["inception", "design"])

  makeStageState(dir, "inception", "completed")
  // design has state.json but no status field
  const designDir = join(dir, "stages", "design")
  mkdirSync(designDir, { recursive: true })
  writeFileSync(join(designDir, "state.json"), JSON.stringify({}))

  assert.strictEqual(allStagesCompleted(dir), false)
})

} finally {
  rmSync(tmp, { recursive: true })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}
