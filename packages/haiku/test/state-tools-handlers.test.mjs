#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U state tool MCP handlers — handleStateTool for every tool
// Run: npx tsx test/state-tools-handlers.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import { handleStateTool, stateToolDefs, setFrontmatterField, unitPath } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-state-handlers-"))
const origCwd = process.cwd()

// Create a fake project with .haiku structure
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)

mkdirSync(join(intentDirPath, "stages", "inception", "units"), { recursive: true })
mkdirSync(join(intentDirPath, "stages", "development", "units"), { recursive: true })
mkdirSync(join(intentDirPath, "knowledge"), { recursive: true })

writeFileSync(join(intentDirPath, "intent.md"), `---
title: Test Intent
studio: software
mode: continuous
active_stage: inception
status: active
started_at: 2026-04-04T18:00:00Z
completed_at: null
---

This is a test intent body.
`)

writeFileSync(join(intentDirPath, "stages", "inception", "state.json"), JSON.stringify({
  stage: "inception",
  status: "active",
  phase: "elaborate",
  started_at: "2026-04-04T18:05:00Z",
  completed_at: null,
  gate_entered_at: null,
  gate_outcome: null,
}, null, 2))

writeFileSync(join(intentDirPath, "stages", "inception", "units", "unit-01-discovery.md"), `---
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
- [x] Technical constraints identified
`)

writeFileSync(join(intentDirPath, "stages", "inception", "units", "unit-02-elaborate.md"), `---
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

writeFileSync(join(intentDirPath, "knowledge", "discovery.md"), "# Discovery Document\n\nKey findings here.")
writeFileSync(join(intentDirPath, "knowledge", "architecture.md"), "# Architecture\n\nTech stack decisions.")

// Create second intent for list testing
const intent2Dir = join(haikuRoot, "intents", "second-intent")
mkdirSync(intent2Dir, { recursive: true })
writeFileSync(join(intent2Dir, "intent.md"), `---
title: Second Intent
studio: ideation
mode: discrete
active_stage: ""
status: completed
---

Second intent body.
`)

// Create settings
writeFileSync(join(haikuRoot, "settings.yml"), `studio: software
stack:
  compute: lambda
  db: postgres
providers:
  ticketing: linear
`)

// Stub git so gitCommitState doesn't fail or actually commit
process.env.PATH = join(tmp, "fake-bin") + ":" + process.env.PATH
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

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

function getTextResult(result) {
  return result.content[0].text
}

// ── stateToolDefs ─────────────────────────────────────────────────────────

try {

console.log("\n=== stateToolDefs ===")

test("all tools have name and inputSchema", () => {
  for (const tool of stateToolDefs) {
    assert.ok(tool.name, `Tool missing name`)
    assert.ok(tool.description, `${tool.name} missing description`)
    assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`)
    assert.strictEqual(tool.inputSchema.type, "object", `${tool.name} inputSchema type should be object`)
  }
})

test("has expected number of tools", () => {
  assert.ok(stateToolDefs.length >= 15, `Expected at least 15 tools, got ${stateToolDefs.length}`)
})

test("tool names all start with haiku_", () => {
  for (const tool of stateToolDefs) {
    assert.ok(tool.name.startsWith("haiku_"), `${tool.name} should start with haiku_`)
  }
})

test("required fields are specified for each tool", () => {
  for (const tool of stateToolDefs) {
    if (tool.inputSchema.required) {
      assert.ok(Array.isArray(tool.inputSchema.required), `${tool.name}: required should be an array`)
      for (const req of tool.inputSchema.required) {
        assert.ok(tool.inputSchema.properties[req], `${tool.name}: required field '${req}' not in properties`)
      }
    }
  }
})

// ── haiku_intent_get ──────────────────────────────────────────────────────

console.log("\n=== haiku_intent_get ===")

test("reads title from intent frontmatter", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "title" })
  assert.strictEqual(getTextResult(result), "Test Intent")
})

test("reads studio from intent", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "studio" })
  assert.strictEqual(getTextResult(result), "software")
})

test("reads status from intent", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "status" })
  assert.strictEqual(getTextResult(result), "active")
})

test("reads mode from intent", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "mode" })
  assert.strictEqual(getTextResult(result), "continuous")
})

test("returns empty string for missing field", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "nonexistent" })
  assert.strictEqual(getTextResult(result), "")
})

test("returns empty string for missing intent", () => {
  const result = handleStateTool("haiku_intent_get", { slug: "does-not-exist", field: "title" })
  assert.strictEqual(getTextResult(result), "")
})

test("returns null fields as empty string", () => {
  const result = handleStateTool("haiku_intent_get", { slug: intentSlug, field: "completed_at" })
  assert.strictEqual(getTextResult(result), "")
})

// ── haiku_intent_list ─────────────────────────────────────────────────────

console.log("\n=== haiku_intent_list ===")

test("lists all intents", () => {
  const result = handleStateTool("haiku_intent_list", {})
  const intents = JSON.parse(getTextResult(result))
  assert.ok(Array.isArray(intents))
  assert.ok(intents.length >= 2, `Expected at least 2 intents, got ${intents.length}`)
})

test("intent list includes slug and status", () => {
  const result = handleStateTool("haiku_intent_list", {})
  const intents = JSON.parse(getTextResult(result))
  const testIntent = intents.find((i) => i.slug === intentSlug)
  assert.ok(testIntent, "test-intent should be in the list")
  assert.strictEqual(testIntent.status, "active")
  assert.strictEqual(testIntent.studio, "software")
})

test("intent list includes completed intents", () => {
  const result = handleStateTool("haiku_intent_list", {})
  const intents = JSON.parse(getTextResult(result))
  const second = intents.find((i) => i.slug === "second-intent")
  assert.ok(second, "second-intent should be in the list")
  assert.strictEqual(second.status, "completed")
})

// ── haiku_stage_get ───────────────────────────────────────────────────────

console.log("\n=== haiku_stage_get ===")

test("reads phase from stage state", () => {
  const result = handleStateTool("haiku_stage_get", { intent: intentSlug, stage: "inception", field: "phase" })
  assert.strictEqual(getTextResult(result), "elaborate")
})

test("reads status from stage state", () => {
  const result = handleStateTool("haiku_stage_get", { intent: intentSlug, stage: "inception", field: "status" })
  assert.strictEqual(getTextResult(result), "active")
})

test("returns empty for missing stage field", () => {
  const result = handleStateTool("haiku_stage_get", { intent: intentSlug, stage: "inception", field: "nonexistent" })
  assert.strictEqual(getTextResult(result), "")
})

test("returns empty for missing stage directory", () => {
  const result = handleStateTool("haiku_stage_get", { intent: intentSlug, stage: "nonexistent", field: "phase" })
  assert.strictEqual(getTextResult(result), "")
})

// ── haiku_unit_get ────────────────────────────────────────────────────────

console.log("\n=== haiku_unit_get ===")

test("reads status from unit frontmatter", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery", field: "status" })
  assert.strictEqual(getTextResult(result), "active")
})

test("reads bolt count from unit", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery", field: "bolt" })
  assert.strictEqual(getTextResult(result), "2")
})

test("reads hat from unit", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery", field: "hat" })
  assert.strictEqual(getTextResult(result), "architect")
})

test("reads type from unit", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery", field: "type" })
  assert.strictEqual(getTextResult(result), "research")
})

test("reads depends_on as JSON", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-02-elaborate", field: "depends_on" })
  const deps = JSON.parse(getTextResult(result))
  assert.deepStrictEqual(deps, ["unit-01-discovery"])
})

test("returns empty for missing unit", () => {
  const result = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-99-missing", field: "status" })
  assert.strictEqual(getTextResult(result), "")
})

// ── haiku_unit_set ────────────────────────────────────────────────────────

console.log("\n=== haiku_unit_set ===")

test("sets a field on a unit", () => {
  const result = handleStateTool("haiku_unit_set", { intent: intentSlug, stage: "inception", unit: "unit-02-elaborate", field: "hat", value: "elaborator" })
  assert.strictEqual(getTextResult(result), "ok")
  // Verify
  const check = handleStateTool("haiku_unit_get", { intent: intentSlug, stage: "inception", unit: "unit-02-elaborate", field: "hat" })
  assert.strictEqual(getTextResult(check), "elaborator")
})

test("set preserves body content", () => {
  handleStateTool("haiku_unit_set", { intent: intentSlug, stage: "inception", unit: "unit-02-elaborate", field: "status", value: "active" })
  const raw = readFileSync(join(intentDirPath, "stages", "inception", "units", "unit-02-elaborate.md"), "utf8")
  assert.ok(raw.includes("## Completion Criteria"), "Body heading preserved")
  assert.ok(raw.includes("Units elaborated with DAG"), "Body criteria preserved")
})

// ── haiku_unit_list ───────────────────────────────────────────────────────

console.log("\n=== haiku_unit_list ===")

test("lists units in a stage with status", () => {
  const result = handleStateTool("haiku_unit_list", { intent: intentSlug, stage: "inception" })
  const units = JSON.parse(getTextResult(result))
  assert.ok(Array.isArray(units))
  assert.strictEqual(units.length, 2)
})

test("each unit has name, status, bolt, hat", () => {
  const result = handleStateTool("haiku_unit_list", { intent: intentSlug, stage: "inception" })
  const units = JSON.parse(getTextResult(result))
  const u1 = units.find((u) => u.name === "unit-01-discovery")
  assert.ok(u1)
  assert.strictEqual(u1.status, "active")
  assert.strictEqual(u1.bolt, 2)
  assert.strictEqual(u1.hat, "architect")
})

test("returns empty array for stage with no units", () => {
  const result = handleStateTool("haiku_unit_list", { intent: intentSlug, stage: "development" })
  const units = JSON.parse(getTextResult(result))
  assert.deepStrictEqual(units, [])
})

test("returns empty array for nonexistent stage", () => {
  const result = handleStateTool("haiku_unit_list", { intent: intentSlug, stage: "nonexistent" })
  const units = JSON.parse(getTextResult(result))
  assert.deepStrictEqual(units, [])
})

// ── haiku_unit_increment_bolt ─────────────────────────────────────────────

console.log("\n=== haiku_unit_increment_bolt ===")

test("increments bolt counter", () => {
  // unit-01 starts at bolt 2
  const result = handleStateTool("haiku_unit_increment_bolt", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery" })
  assert.strictEqual(getTextResult(result), "3")
})

test("increments again correctly", () => {
  const result = handleStateTool("haiku_unit_increment_bolt", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery" })
  assert.strictEqual(getTextResult(result), "4")
})

test("enforces max bolt limit", () => {
  // Explicitly set bolt to 4 so this test doesn't depend on prior test side effects.
  // Use setFrontmatterField directly to store bolt as a proper number (haiku_unit_set stores strings).
  const uPath = unitPath(intentSlug, "inception", "unit-01-discovery")
  setFrontmatterField(uPath, "bolt", 4)

  // Incrementing from 4 should go to 5 (the limit).
  const result = handleStateTool("haiku_unit_increment_bolt", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery" })
  assert.strictEqual(getTextResult(result), "5")

  // Next increment should fail (exceeds max of 5)
  const exceeded = handleStateTool("haiku_unit_increment_bolt", { intent: intentSlug, stage: "inception", unit: "unit-01-discovery" })
  const parsed = JSON.parse(getTextResult(exceeded))
  assert.strictEqual(parsed.error, "max_bolts_exceeded")
})

// ── haiku_unit_reject_hat ─────────────────────────────────────────────────

console.log("\n=== haiku_unit_reject_hat ===")

test("returns error for missing unit", () => {
  const result = handleStateTool("haiku_unit_reject_hat", { intent: intentSlug, unit: "unit-99-missing" })
  const parsed = JSON.parse(getTextResult(result))
  assert.strictEqual(parsed.error, "unit_not_found")
})

// ── haiku_knowledge_list ──────────────────────────────────────────────────

console.log("\n=== haiku_knowledge_list ===")

test("lists knowledge files", () => {
  const result = handleStateTool("haiku_knowledge_list", { intent: intentSlug })
  const files = JSON.parse(getTextResult(result))
  assert.ok(Array.isArray(files))
  assert.ok(files.includes("discovery.md"))
  assert.ok(files.includes("architecture.md"))
})

test("returns empty for intent with no knowledge", () => {
  const result = handleStateTool("haiku_knowledge_list", { intent: "second-intent" })
  const files = JSON.parse(getTextResult(result))
  assert.deepStrictEqual(files, [])
})

// ── haiku_knowledge_read ──────────────────────────────────────────────────

console.log("\n=== haiku_knowledge_read ===")

test("reads knowledge file content", () => {
  const result = handleStateTool("haiku_knowledge_read", { intent: intentSlug, name: "discovery.md" })
  const text = getTextResult(result)
  assert.ok(text.includes("# Discovery Document"))
  assert.ok(text.includes("Key findings here"))
})

test("returns empty for missing knowledge file", () => {
  const result = handleStateTool("haiku_knowledge_read", { intent: intentSlug, name: "nonexistent.md" })
  assert.strictEqual(getTextResult(result), "")
})

// ── haiku_settings_get ────────────────────────────────────────────────────

console.log("\n=== haiku_settings_get ===")

test("reads top-level setting", () => {
  const result = handleStateTool("haiku_settings_get", { field: "studio" })
  assert.strictEqual(getTextResult(result), "software")
})

test("reads nested setting with dot notation", () => {
  const result = handleStateTool("haiku_settings_get", { field: "stack.compute" })
  assert.strictEqual(getTextResult(result), "lambda")
})

test("reads nested setting deep", () => {
  const result = handleStateTool("haiku_settings_get", { field: "stack.db" })
  assert.strictEqual(getTextResult(result), "postgres")
})

test("returns empty for missing setting", () => {
  const result = handleStateTool("haiku_settings_get", { field: "nonexistent" })
  assert.strictEqual(getTextResult(result), "")
})

test("returns JSON for object settings", () => {
  const result = handleStateTool("haiku_settings_get", { field: "stack" })
  const parsed = JSON.parse(getTextResult(result))
  assert.strictEqual(parsed.compute, "lambda")
  assert.strictEqual(parsed.db, "postgres")
})

// ── unknown tool ──────────────────────────────────────────────────────────

console.log("\n=== unknown tool ===")

test("returns error for unknown tool name", () => {
  const result = handleStateTool("haiku_nonexistent", {})
  assert.ok(getTextResult(result).includes("Unknown tool"))
})

// ── Cleanup ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
}
process.exit(failed > 0 ? 1 : 0)
