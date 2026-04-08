#!/usr/bin/env node
// Test suite for H·AI·K·U state MCP tools
// Run: node test/state-tools.test.mjs

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

// We test the tool handlers directly by importing the built server
// For now, test the state file operations via haiku-parse.mjs
import { execSync } from "node:child_process"

const PARSE = join(import.meta.dirname, "../../bin/haiku-parse.mjs")

function run(args) {
  return execSync(`node ${PARSE} ${args}`, { encoding: "utf8" }).trim()
}

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-test-"))
const haikuDir = join(tmp, ".haiku", "intents", "test-intent")

// Create intent structure
mkdirSync(join(haikuDir, "stages", "inception", "units"), { recursive: true })
mkdirSync(join(haikuDir, "stages", "development", "units"), { recursive: true })
mkdirSync(join(haikuDir, "knowledge"), { recursive: true })

// Write intent.md
writeFileSync(join(haikuDir, "intent.md"), `---
title: Test Intent
studio: software
mode: continuous
active_stage: inception
status: active
started_at: 2026-04-04T18:00:00Z
completed_at: null
---

This is a test intent.
`)

// Write stage state
writeFileSync(join(haikuDir, "stages", "inception", "state.json"), JSON.stringify({
  stage: "inception",
  status: "active",
  phase: "elaborate",
  started_at: "2026-04-04T18:05:00Z",
  completed_at: null,
  gate_entered_at: null,
  gate_outcome: null,
}))

// Write units
writeFileSync(join(haikuDir, "stages", "inception", "units", "unit-01-discovery.md"), `---
name: unit-01-discovery
type: research
status: active
depends_on: []
bolt: 2
hat: architect
started_at: 2026-04-04T18:10:00Z
completed_at: null
---

## Completion Criteria

- [x] Domain model documented
- [ ] Technical constraints identified
`)

writeFileSync(join(haikuDir, "stages", "inception", "units", "unit-02-elaborate.md"), `---
name: unit-02-elaborate
type: research
status: pending
depends_on: [unit-01-discovery]
bolt: 0
hat: ""
---

## Completion Criteria

- [ ] Units elaborated with DAG
`)

// Write knowledge
writeFileSync(join(haikuDir, "knowledge", "discovery.md"), "# Discovery Document\n\nContent here.")

// ── Tests ──────────────────────────────────────────────────────────────────

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

console.log("\n=== haiku-parse: Intent ===")

test("get intent title", () => {
  const result = run(`get "${join(haikuDir, "intent.md")}" title`)
  assert.strictEqual(result, "Test Intent")
})

test("get intent studio", () => {
  const result = run(`get "${join(haikuDir, "intent.md")}" studio`)
  assert.strictEqual(result, "software")
})

test("get intent status", () => {
  const result = run(`get "${join(haikuDir, "intent.md")}" status`)
  assert.strictEqual(result, "active")
})

test("set intent active_stage", () => {
  run(`set "${join(haikuDir, "intent.md")}" active_stage development`)
  const result = run(`get "${join(haikuDir, "intent.md")}" active_stage`)
  assert.strictEqual(result, "development")
  // Reset
  run(`set "${join(haikuDir, "intent.md")}" active_stage inception`)
})

test("dump intent as JSON", () => {
  const result = JSON.parse(run(`dump "${join(haikuDir, "intent.md")}"`))
  assert.strictEqual(result.studio, "software")
  assert.strictEqual(result.mode, "continuous")
})

console.log("\n=== haiku-parse: Stage State ===")

test("get stage phase from JSON", () => {
  const result = run(`get "${join(haikuDir, "stages/inception/state.json")}" phase`)
  assert.strictEqual(result, "elaborate")
})

test("set stage phase", () => {
  run(`set "${join(haikuDir, "stages/inception/state.json")}" phase execute`)
  const result = run(`get "${join(haikuDir, "stages/inception/state.json")}" phase`)
  assert.strictEqual(result, "execute")
})

test("set stage status to completed", () => {
  run(`set "${join(haikuDir, "stages/inception/state.json")}" status completed`)
  const result = run(`get "${join(haikuDir, "stages/inception/state.json")}" status`)
  assert.strictEqual(result, "completed")
})

console.log("\n=== haiku-parse: Unit ===")

test("get unit status", () => {
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" status`)
  assert.strictEqual(result, "active")
})

test("get unit bolt", () => {
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" bolt`)
  assert.strictEqual(result, "2")
})

test("get unit hat", () => {
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" hat`)
  assert.strictEqual(result, "architect")
})

test("set unit hat to elaborator", () => {
  run(`set "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" hat elaborator`)
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" hat`)
  assert.strictEqual(result, "elaborator")
})

test("increment unit bolt", () => {
  run(`set "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" bolt 3`)
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" bolt`)
  assert.strictEqual(result, "3")
})

test("set unit status to completed", () => {
  run(`set "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" status completed`)
  const result = run(`get "${join(haikuDir, "stages/inception/units/unit-01-discovery.md")}" status`)
  assert.strictEqual(result, "completed")
})

test("set preserves body content", () => {
  run(`set "${join(haikuDir, "stages/inception/units/unit-02-elaborate.md")}" status active`)
  const raw = readFileSync(join(haikuDir, "stages/inception/units/unit-02-elaborate.md"), "utf8")
  assert.ok(raw.includes("## Completion Criteria"), "Body content preserved")
  assert.ok(raw.includes("Units elaborated with DAG"), "Criteria text preserved")
})

console.log("\n=== haiku-parse: Stdin JSON ===")

test("get from stdin JSON", () => {
  const result = execSync(
    `echo '{"tool_name":"Edit","hat":"builder","bolt":5}' | node ${PARSE} get --stdin tool_name`,
    { encoding: "utf8" }
  ).trim()
  assert.strictEqual(result, "Edit")
})

test("get number from stdin JSON", () => {
  const result = execSync(
    `echo '{"bolt":5}' | node ${PARSE} get --stdin bolt`,
    { encoding: "utf8" }
  ).trim()
  assert.strictEqual(result, "5")
})

// ── Cleanup ────────────────────────────────────────────────────────────────

rmSync(tmp, { recursive: true })

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
