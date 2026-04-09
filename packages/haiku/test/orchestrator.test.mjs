#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U orchestrator — FSM runNext, stage transitions, validation
// Run: npx tsx test/orchestrator.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { chmodSync } from "node:fs"
import assert from "node:assert"

import { runNext, orchestratorToolDefs } from "../src/orchestrator.ts"
import { readJson, writeJson, parseFrontmatter } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-orch-test-"))
const origCwd = process.cwd()

// Stub git
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)
process.env.PATH = join(tmp, "fake-bin") + ":" + process.env.PATH

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

try {

// Helper: create a full project with .haiku, studio, stages
function createProject(name, opts = {}) {
  const projDir = join(tmp, name)
  const haikuRoot = join(projDir, ".haiku")
  const slug = opts.slug || "test-intent"
  const intentDirPath = join(haikuRoot, "intents", slug)
  const studio = opts.studio || "test-studio"

  // Create intent
  mkdirSync(join(intentDirPath, "stages"), { recursive: true })
  writeFileSync(join(intentDirPath, "intent.md"), `---
title: ${opts.title || "Test Intent"}
studio: ${studio}
mode: ${opts.mode || "continuous"}
active_stage: ${opts.active_stage || ""}
status: ${opts.status || "active"}
started_at: 2026-04-04T18:00:00Z
completed_at: null
${opts.skip_stages ? `skip_stages: [${opts.skip_stages.join(", ")}]` : ""}
---

Test intent body.
`)

  // Create studio definition
  const studioDir = join(haikuRoot, "studios", studio)
  const stages = opts.stages || ["plan", "build", "review"]
  mkdirSync(studioDir, { recursive: true })
  writeFileSync(join(studioDir, "STUDIO.md"), `---
name: ${studio}
description: Test studio
stages: [${stages.join(", ")}]
---

A test studio.
`)

  // Create stage definitions
  for (const stage of stages) {
    const stageDir = join(studioDir, "stages", stage)
    mkdirSync(stageDir, { recursive: true })
    const stageOpts = opts.stageConfig?.[stage] || {}
    writeFileSync(join(stageDir, "STAGE.md"), `---
name: ${stage}
description: ${stage} stage
hats: [${(stageOpts.hats || ["worker"]).join(", ")}]
review: ${stageOpts.review || "auto"}
${stageOpts.unit_types ? `unit_types: [${stageOpts.unit_types.join(", ")}]` : ""}
${stageOpts.elaboration ? `elaboration: ${stageOpts.elaboration}` : ""}
---

${stage} stage instructions.
`)
  }

  return { projDir, haikuRoot, intentDirPath, slug, studio }
}

// Helper: create stage state
function createStageState(intentDirPath, stage, state) {
  const stageDir = join(intentDirPath, "stages", stage)
  mkdirSync(join(stageDir, "units"), { recursive: true })
  writeJson(join(stageDir, "state.json"), {
    stage,
    status: "active",
    phase: "elaborate",
    started_at: "2026-04-04T18:05:00Z",
    completed_at: null,
    gate_entered_at: null,
    gate_outcome: null,
    ...state,
  })
}

// Helper: create unit file
function createUnit(intentDirPath, stage, unitName, opts = {}) {
  const unitsDir = join(intentDirPath, "stages", stage, "units")
  mkdirSync(unitsDir, { recursive: true })
  writeFileSync(join(unitsDir, `${unitName}.md`), `---
name: ${unitName}
type: ${opts.type || "task"}
status: ${opts.status || "pending"}
depends_on: [${(opts.depends_on || []).join(", ")}]
bolt: ${opts.bolt || 0}
hat: ${opts.hat || ""}
---

## Completion Criteria

${(opts.criteria || ["- [ ] Default criteria"]).join("\n")}
`)
}

// ── orchestratorToolDefs ──────────────────────────────────────────────────

console.log("\n=== orchestratorToolDefs ===")

test("has 3 orchestration tools", () => {
  assert.strictEqual(orchestratorToolDefs.length, 3)
})

test("haiku_run_next tool defined with intent required", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_run_next")
  assert.ok(tool)
  assert.ok(tool.inputSchema.required.includes("intent"))
})

test("haiku_intent_create tool defined with description required", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_intent_create")
  assert.ok(tool)
  assert.ok(tool.inputSchema.required.includes("description"))
})

test("haiku_go_back tool defined with intent required", () => {
  const tool = orchestratorToolDefs.find((t) => t.name === "haiku_go_back")
  assert.ok(tool)
  assert.ok(tool.inputSchema.required.includes("intent"))
})

// ── runNext: missing intent ───────────────────────────────────────────────

console.log("\n=== runNext: missing intent ===")

test("returns error for nonexistent intent", () => {
  const { projDir } = createProject("missing-intent")
  process.chdir(projDir)
  const result = runNext("nonexistent")
  assert.strictEqual(result.action, "error")
  assert.ok(result.message.includes("not found"))
})

// ── runNext: completed intent ─────────────────────────────────────────────

console.log("\n=== runNext: completed/archived intent ===")

test("returns complete for already-completed intent", () => {
  const { projDir, slug } = createProject("completed-intent", { status: "completed" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "complete")
})

test("returns error for archived intent", () => {
  const { projDir, slug } = createProject("archived-intent", { status: "archived" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "error")
  assert.ok(result.message.includes("archived"))
})

// ── runNext: start first stage ────────────────────────────────────────────

console.log("\n=== runNext: start stage ===")

test("starts first stage when no active_stage set", () => {
  const { projDir, slug } = createProject("start-first-stage", { active_stage: "" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "start_stage")
  assert.strictEqual(result.stage, "plan")
  assert.ok(result.hats)
})

test("start_stage sets phase to elaborate", () => {
  const { projDir, slug, intentDirPath } = createProject("start-stage-phase")
  process.chdir(projDir)
  runNext(slug)
  const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
  assert.strictEqual(state.phase, "elaborate")
  assert.strictEqual(state.status, "active")
})

test("start_stage sets intent active_stage", () => {
  const { projDir, slug, intentDirPath } = createProject("start-stage-active")
  process.chdir(projDir)
  runNext(slug)
  const raw = readFileSync(join(intentDirPath, "intent.md"), "utf8")
  const { data } = parseFrontmatter(raw)
  assert.strictEqual(data.active_stage, "plan")
})

// ── runNext: elaborate phase ──────────────────────────────────────────────

console.log("\n=== runNext: elaborate ===")

test("returns elaborate when stage has no units", () => {
  const { projDir, slug, intentDirPath } = createProject("elaborate-no-units", { active_stage: "plan" })
  createStageState(intentDirPath, "plan", { phase: "elaborate" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "elaborate")
  assert.strictEqual(result.stage, "plan")
})

test("enforces collaborative elaboration minimum turns", () => {
  const { projDir, slug, intentDirPath } = createProject("elaborate-collab", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "collaborative" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 0 })
  createUnit(intentDirPath, "plan", "unit-01-first")
  process.chdir(projDir)

  // First call — turn 1, should be insufficient
  const result = runNext(slug)
  assert.strictEqual(result.action, "elaboration_insufficient")
  assert.strictEqual(result.turns, 1)
})

// ── runNext: unit naming validation ───────────────────────────────────────

console.log("\n=== runNext: unit naming validation ===")

test("rejects units with bad naming", () => {
  const { projDir, slug, intentDirPath } = createProject("bad-naming", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  // Create a badly named unit file directly
  mkdirSync(join(intentDirPath, "stages", "plan", "units"), { recursive: true })
  writeFileSync(join(intentDirPath, "stages", "plan", "units", "bad-name.md"), `---
name: bad-name
type: task
status: pending
depends_on: []
bolt: 0
hat: ""
---

## Completion Criteria

- [ ] Something
`)
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "unit_naming_invalid")
  assert.ok(result.violations.length > 0)
})

test("accepts properly named units", () => {
  const { projDir, slug, intentDirPath } = createProject("good-naming", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-first-task")
  process.chdir(projDir)
  const result = runNext(slug)
  // Should pass naming validation (might hit gate_review or similar)
  assert.notStrictEqual(result.action, "unit_naming_invalid")
})

// ── runNext: unit type validation ─────────────────────────────────────────

console.log("\n=== runNext: unit type validation ===")

test("rejects units with wrong type for stage", () => {
  const { projDir, slug, intentDirPath } = createProject("bad-type", {
    active_stage: "plan",
    stageConfig: { plan: { unit_types: ["research", "analysis"], elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-code-stuff", { type: "implementation" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "spec_validation_failed")
})

test("accepts units with correct type", () => {
  const { projDir, slug, intentDirPath } = createProject("good-type", {
    active_stage: "plan",
    stageConfig: { plan: { unit_types: ["task"], elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-proper-task", { type: "task" })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.notStrictEqual(result.action, "spec_validation_failed")
})

// ── runNext: DAG validation ───────────────────────────────────────────────

console.log("\n=== runNext: DAG validation ===")

test("detects unresolved dependencies", () => {
  const { projDir, slug, intentDirPath } = createProject("unresolved-deps", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-first", { depends_on: ["unit-99-phantom"] })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "unresolved_dependencies")
})

test("detects circular dependencies", () => {
  const { projDir, slug, intentDirPath } = createProject("circular-deps", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-alpha", { depends_on: ["unit-02-beta"] })
  createUnit(intentDirPath, "plan", "unit-02-beta", { depends_on: ["unit-01-alpha"] })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "dag_cycle_detected")
})

test("accepts valid DAG", () => {
  const { projDir, slug, intentDirPath } = createProject("valid-dag", {
    active_stage: "plan",
    stageConfig: { plan: { elaboration: "directed" } },
  })
  createStageState(intentDirPath, "plan", { phase: "elaborate", elaboration_turns: 5 })
  createUnit(intentDirPath, "plan", "unit-01-first")
  createUnit(intentDirPath, "plan", "unit-02-second", { depends_on: ["unit-01-first"] })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.notStrictEqual(result.action, "unresolved_dependencies")
  assert.notStrictEqual(result.action, "dag_cycle_detected")
})

// ── runNext: execute phase ────────────────────────────────────────────────

console.log("\n=== runNext: execute phase ===")

test("starts first ready unit (wave scheduling)", () => {
  const { projDir, slug, intentDirPath } = createProject("execute-assign", {
    active_stage: "plan",
  })
  createStageState(intentDirPath, "plan", { phase: "execute" })
  createUnit(intentDirPath, "plan", "unit-01-first", { status: "pending" })
  createUnit(intentDirPath, "plan", "unit-02-second", { status: "pending", depends_on: ["unit-01-first"] })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "start_unit")
  assert.strictEqual(result.unit, "unit-01-first")
})

test("skips completed units and starts next ready", () => {
  const { projDir, slug, intentDirPath } = createProject("execute-skip-done", {
    active_stage: "plan",
  })
  createStageState(intentDirPath, "plan", { phase: "execute" })
  createUnit(intentDirPath, "plan", "unit-01-first", { status: "completed" })
  createUnit(intentDirPath, "plan", "unit-02-second", { status: "pending", depends_on: ["unit-01-first"] })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "start_unit")
  assert.strictEqual(result.unit, "unit-02-second")
})

test("does not start unit with incomplete dependency", () => {
  const { projDir, slug, intentDirPath } = createProject("execute-blocked", {
    active_stage: "plan",
  })
  createStageState(intentDirPath, "plan", { phase: "execute" })
  createUnit(intentDirPath, "plan", "unit-01-first", { status: "active" })
  createUnit(intentDirPath, "plan", "unit-02-second", { status: "pending", depends_on: ["unit-01-first"] })
  const prevCwd = process.cwd()
  try {
    process.chdir(projDir)
    const result = runNext(slug)
    // unit-02-second depends on unit-01-first which is active (not completed),
    // so the orchestrator must never start unit-02-second
    if (result.unit) {
      assert.notStrictEqual(result.unit, "unit-02-second", "Should not start unit with incomplete dependency")
    }
    // The active unit (unit-01-first) should be the one acted on
    assert.strictEqual(result.unit, "unit-01-first", "Should continue the active unit, not the blocked one")
  } finally {
    process.chdir(prevCwd)
  }
})

// ── runNext: all units completed → gate_review ────────────────────────────

console.log("\n=== runNext: stage completion ===")

test("advances phase when all units completed (auto review)", () => {
  const { projDir, slug, intentDirPath } = createProject("all-done", {
    active_stage: "plan",
    stageConfig: { plan: { review: "auto" } },
  })
  createStageState(intentDirPath, "plan", { phase: "execute" })
  createUnit(intentDirPath, "plan", "unit-01-only", { status: "completed", criteria: ["- [x] Done"] })
  process.chdir(projDir)
  const result = runNext(slug)
  // Auto review advances phase or stage automatically
  assert.ok(
    result.action === "gate_review" || result.action === "advance_stage" || result.action === "start_stage" || result.action === "advance_phase",
    `Expected gate_review/advance_stage/start_stage/advance_phase, got: ${result.action}`
  )
})

// ── runNext: skip_stages ──────────────────────────────────────────────────

console.log("\n=== runNext: skip_stages ===")

test("skips stages listed in skip_stages", () => {
  const { projDir, slug, intentDirPath } = createProject("skip-stages", {
    active_stage: "",
    skip_stages: ["plan"],
  })
  process.chdir(projDir)
  const result = runNext(slug)
  assert.strictEqual(result.action, "start_stage")
  assert.strictEqual(result.stage, "build", "Should skip 'plan' and start 'build'")
})

// ── runNext: studio with no stages ────────────────────────────────────────

console.log("\n=== runNext: edge cases ===")

test("returns error for studio with no stages", () => {
  const projDir = join(tmp, "no-stages-project")
  mkdirSync(join(projDir, ".haiku", "intents", "feat"), { recursive: true })
  writeFileSync(join(projDir, ".haiku", "intents", "feat", "intent.md"), `---
title: No Stages
studio: empty-studio
mode: continuous
active_stage: ""
status: active
---
`)
  mkdirSync(join(projDir, ".haiku", "studios", "empty-studio"), { recursive: true })
  writeFileSync(join(projDir, ".haiku", "studios", "empty-studio", "STUDIO.md"), `---
name: empty-studio
stages: []
---
`)
  process.chdir(projDir)
  const result = runNext("feat")
  assert.strictEqual(result.action, "error")
  assert.ok(result.message.includes("no stages"))
})

// ── Cleanup ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
}
process.exit(failed > 0 ? 1 : 0)
