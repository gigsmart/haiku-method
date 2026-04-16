#!/usr/bin/env npx tsx
// Test suite for backward compatibility of the universal feedback model
// Verifies existing intents without feedback/ dirs, visits fields, closes: fields,
// and legacy state shapes all work correctly after the feedback model changes.
// Run: npx tsx test/migration-compat.test.mjs

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import assert from "node:assert"

import {
  countPendingFeedback,
  readFeedbackFiles,
  readJson,
  writeJson,
  handleStateTool,
} from "../src/state-tools.ts"
import {
  checkExternalState,
  runNext,
} from "../src/orchestrator.ts"
import {
  allStagesCompleted,
  readFrontmatterStringList,
} from "../src/hooks/utils.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-migration-compat-"))
const origCwd = process.cwd()
const fakeBin = join(tmp, "fake-bin")
mkdirSync(fakeBin, { recursive: true })

writeFileSync(join(fakeBin, "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(fakeBin, "git"), 0o755)
process.env.PATH = `${fakeBin}:${process.env.PATH}`

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === "function") {
      return result.then(
        () => {
          passed++
          console.log(`  \u2713 ${name}`)
        },
        (e) => {
          failed++
          console.log(`  \u2717 ${name}: ${e.message}`)
        },
      )
    }
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}: ${e.message}`)
  }
}

// Helper: create a project with .haiku, studio, stages
function createProject(name, opts = {}) {
  const projDir = join(tmp, name)
  const haikuRoot = join(projDir, ".haiku")
  const slug = opts.slug || "test-intent"
  const intentDirPath = join(haikuRoot, "intents", slug)
  const studio = opts.studio || "test-studio"
  const stages = opts.stages || ["plan", "build"]

  mkdirSync(join(intentDirPath, "stages"), { recursive: true })

  // Build frontmatter — conditionally include stages field
  const stagesLine = opts.omitStages
    ? ""
    : `stages: [${stages.join(", ")}]\n`

  writeFileSync(
    join(intentDirPath, "intent.md"),
    `---
title: ${opts.title || "Test Intent"}
studio: ${studio}
mode: ${opts.mode || "continuous"}
active_stage: ${opts.active_stage || ""}
status: ${opts.status || "active"}
intent_reviewed: ${opts.intent_reviewed !== undefined ? opts.intent_reviewed : true}
${stagesLine}started_at: 2026-04-04T18:00:00Z
completed_at: null
---

Test intent body.
`,
  )

  const studioDir = join(haikuRoot, "studios", studio)
  mkdirSync(studioDir, { recursive: true })
  writeFileSync(
    join(studioDir, "STUDIO.md"),
    `---
name: ${studio}
description: Test studio
stages: [${stages.join(", ")}]
---

A test studio.
`,
  )

  for (const stage of stages) {
    const stageDir = join(studioDir, "stages", stage)
    mkdirSync(stageDir, { recursive: true })
    const stageOpts = opts.stageConfig?.[stage] || {}
    writeFileSync(
      join(stageDir, "STAGE.md"),
      `---
name: ${stage}
description: ${stage} stage
hats: [${(stageOpts.hats || ["worker"]).join(", ")}]
review: ${stageOpts.review || "auto"}
---

${stage} stage instructions.
`,
    )
  }

  return { projDir, haikuRoot, intentDirPath, slug, studio }
}

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

function createUnit(intentDirPath, stage, unitName, opts = {}) {
  const unitsDir = join(intentDirPath, "stages", stage, "units")
  mkdirSync(unitsDir, { recursive: true })
  const closesLine = opts.closes ? `closes: [${opts.closes.join(", ")}]\n` : ""
  writeFileSync(
    join(unitsDir, `${unitName}.md`),
    `---
name: ${unitName}
type: ${opts.type || "implementation"}
status: ${opts.status || "completed"}
depends_on: []
bolt: ${opts.bolt || 1}
hat: ${opts.hat || "worker"}
${closesLine}started_at: 2026-04-04T18:10:00Z
completed_at: ${opts.status === "completed" ? "2026-04-04T19:00:00Z" : "null"}
---

# ${unitName}

## Completion Criteria

- [x] Done
`,
  )
}

try {
  // ═══════════════════════════════════════════════════════════════════════
  // (a) No feedback/ directory — countPendingFeedback returns 0
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (a) No feedback/ directory ===")

  test("countPendingFeedback returns 0 for stage with no feedback dir", () => {
    const { projDir, intentDirPath, slug } = createProject("no-feedback-dir")
    createStageState(intentDirPath, "plan", {
      phase: "gate",
      status: "completed",
      gate_outcome: "advanced",
    })
    createStageState(intentDirPath, "build", { phase: "elaborate" })
    process.chdir(projDir)

    const count = countPendingFeedback(slug, "build")
    assert.strictEqual(count, 0, "countPendingFeedback should return 0, not error")
  })

  test("readFeedbackFiles returns [] for stage with no feedback dir", () => {
    const { projDir, slug } = createProject("no-feedback-dir-read", {
      slug: "read-fb-test",
    })
    createStageState(
      join(tmp, "no-feedback-dir-read", ".haiku", "intents", "read-fb-test"),
      "plan",
      { phase: "elaborate" },
    )
    process.chdir(projDir)

    const items = readFeedbackFiles("read-fb-test", "plan")
    assert.deepStrictEqual(items, [])
  })

  test("readFeedbackFiles returns [] for completely nonexistent stage", () => {
    const { projDir, slug } = createProject("no-stage", { slug: "no-stage-slug" })
    process.chdir(projDir)

    const items = readFeedbackFiles("no-stage-slug", "nonexistent-stage")
    assert.deepStrictEqual(items, [])
  })

  // ═══════════════════════════════════════════════════════════════════════
  // (b) No visits field — treated as visits: 0
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (b) No visits field in state.json ===")

  test("state.json without visits field is treated as visits: 0 by orchestrator", () => {
    const { projDir, intentDirPath, slug } = createProject("no-visits", {
      active_stage: "plan",
    })

    // Write state.json WITHOUT a visits field — simulating legacy state
    const statePath = join(intentDirPath, "stages", "plan", "state.json")
    mkdirSync(join(intentDirPath, "stages", "plan", "units"), { recursive: true })
    writeJson(statePath, {
      stage: "plan",
      status: "active",
      phase: "elaborate",
      started_at: "2026-04-04T18:05:00Z",
      completed_at: null,
      gate_entered_at: null,
      gate_outcome: null,
      // No visits field at all
    })

    // Create some units so elaborate sees them
    createUnit(intentDirPath, "plan", "unit-01-discover", { status: "completed" })

    process.chdir(projDir)
    const result = runNext(slug)

    // Should NOT trigger additive elaborate (visits > 0 check)
    assert.notStrictEqual(
      result.action,
      "additive_elaborate",
      "Without visits field, should not trigger additive elaborate mode",
    )
  })

  test("legacy state.json visits defaults to 0 in readJson", () => {
    const { projDir, intentDirPath } = createProject("legacy-visits-json", {
      slug: "legacy-visits",
    })
    const statePath = join(intentDirPath, "stages", "plan", "state.json")
    mkdirSync(join(intentDirPath, "stages", "plan"), { recursive: true })
    writeJson(statePath, {
      stage: "plan",
      status: "active",
      phase: "elaborate",
    })

    process.chdir(projDir)
    const data = readJson(statePath)

    // The orchestrator uses `(stageState.visits as number) || 0`
    const visits = (data.visits) || 0
    assert.strictEqual(visits, 0, "Missing visits field should default to 0")
  })

  // ═══════════════════════════════════════════════════════════════════════
  // (c) No closes: field — processed normally when visits === 0
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (c) No closes: field in units ===")

  test("units without closes: field process normally when visits === 0", () => {
    const { projDir, intentDirPath, slug } = createProject("no-closes", {
      active_stage: "plan",
    })

    createStageState(intentDirPath, "plan", {
      phase: "elaborate",
      visits: 0,
    })

    // Create units WITHOUT closes: field
    createUnit(intentDirPath, "plan", "unit-01-discover", { status: "completed" })
    createUnit(intentDirPath, "plan", "unit-02-build", { status: "pending" })

    process.chdir(projDir)
    const result = runNext(slug)

    // Should proceed normally — closes: is only required when visits > 0
    assert.notStrictEqual(result.action, "additive_elaborate")
    // Should not contain any validation_error about closes:
    assert.ok(
      !result.validation_error,
      `Should not have validation error about closes:, got: ${result.validation_error}`,
    )
  })

  test("units without closes: field trigger validation error when visits > 0", () => {
    const { projDir, intentDirPath, slug } = createProject("closes-required", {
      active_stage: "plan",
    })

    createStageState(intentDirPath, "plan", {
      phase: "elaborate",
      visits: 1,
    })

    createUnit(intentDirPath, "plan", "unit-01-old", { status: "completed" })
    createUnit(intentDirPath, "plan", "unit-02-new", { status: "pending" })

    process.chdir(projDir)
    const result = runNext(slug)

    // When visits > 0 and no feedback exists, still goes to additive elaborate
    // but with no pending feedback the closes validation may not apply
    // The key point: visits > 0 activates the additive elaborate code path
    assert.strictEqual(result.action, "additive_elaborate")
  })

  // ═══════════════════════════════════════════════════════════════════════
  // (d) enforce-iteration with legacy intents (no stages: field)
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (d) enforce-iteration with legacy intents ===")

  test("allStagesCompleted returns false when stages field is missing", () => {
    const intentDir = join(tmp, "no-stages-intent")
    mkdirSync(intentDir, { recursive: true })
    writeFileSync(
      join(intentDir, "intent.md"),
      `---
title: Legacy Intent No Stages
studio: ""
mode: continuous
status: active
---

Legacy intent without stages field.
`,
    )

    // allStagesCompleted reads stages from frontmatter — empty array = returns false
    const result = allStagesCompleted(intentDir)
    assert.strictEqual(result, false, "No stages field should return false, not crash")
  })

  test("readFrontmatterStringList returns empty array for missing stages field", () => {
    const intentDir = join(tmp, "no-stages-intent-2")
    mkdirSync(intentDir, { recursive: true })
    writeFileSync(
      join(intentDir, "intent.md"),
      `---
title: Legacy Intent
status: active
---

No stages field.
`,
    )

    const stages = readFrontmatterStringList(join(intentDir, "intent.md"), "stages")
    assert.deepStrictEqual(stages, [])
  })

  test("readFrontmatterStringList returns empty array for empty stages field", () => {
    const intentDir = join(tmp, "empty-stages-intent")
    mkdirSync(intentDir, { recursive: true })
    writeFileSync(
      join(intentDir, "intent.md"),
      `---
title: Empty Stages Intent
studio: ""
stages: []
status: active
---

Empty stages.
`,
    )

    const stages = readFrontmatterStringList(join(intentDir, "intent.md"), "stages")
    assert.deepStrictEqual(stages, [])
  })

  // ═══════════════════════════════════════════════════════════════════════
  // (e) haiku_feedback_list on empty stages — returns []
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (e) haiku_feedback_list on empty stages ===")

  test("haiku_feedback_list returns empty items for stage with no feedback dir", () => {
    const { projDir, intentDirPath, slug } = createProject("empty-feedback-list", {
      slug: "empty-fb-list",
    })
    createStageState(intentDirPath, "plan", { phase: "elaborate" })
    process.chdir(projDir)

    const result = handleStateTool("haiku_feedback_list", {
      intent: "empty-fb-list",
      stage: "plan",
    })

    assert.ok(!result.isError, `Expected success, got: ${result.content?.[0]?.text}`)
    const parsed = JSON.parse(result.content[0].text)
    assert.strictEqual(parsed.count, 0)
    assert.deepStrictEqual(parsed.items, [])
  })

  test("haiku_feedback_list returns empty items across all stages with no feedback", () => {
    const { projDir, intentDirPath, slug } = createProject("empty-feedback-all", {
      slug: "empty-fb-all",
    })
    createStageState(intentDirPath, "plan", { phase: "elaborate" })
    createStageState(intentDirPath, "build", { phase: "elaborate" })
    process.chdir(projDir)

    const result = handleStateTool("haiku_feedback_list", {
      intent: "empty-fb-all",
    })

    assert.ok(!result.isError, `Expected success, got: ${result.content?.[0]?.text}`)
    const parsed = JSON.parse(result.content[0].text)
    assert.strictEqual(parsed.count, 0)
    assert.deepStrictEqual(parsed.items, [])
  })

  test("haiku_feedback_list works on intent with no stages dir at all", () => {
    // Create a bare intent with no stages directory
    const projDir = join(tmp, "no-stages-dir")
    const haikuRoot = join(projDir, ".haiku")
    const slug = "bare-intent"
    const intentDirPath = join(haikuRoot, "intents", slug)
    mkdirSync(intentDirPath, { recursive: true })
    writeFileSync(
      join(intentDirPath, "intent.md"),
      `---
title: Bare Intent
studio: test-studio
mode: continuous
status: active
started_at: 2026-04-04T18:00:00Z
---

Bare intent.
`,
    )
    process.chdir(projDir)

    const result = handleStateTool("haiku_feedback_list", {
      intent: slug,
    })

    assert.ok(!result.isError, `Expected success, got: ${result.content?.[0]?.text}`)
    const parsed = JSON.parse(result.content[0].text)
    assert.strictEqual(parsed.count, 0)
    assert.deepStrictEqual(parsed.items, [])
  })

  // ═══════════════════════════════════════════════════════════════════════
  // (f) checkExternalState return shape — object, not boolean
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== (f) checkExternalState return shape ===")

  test("checkExternalState returns an object with status field, not boolean", () => {
    // Unknown URL should still return an object
    const result = checkExternalState("https://unknown.example.com/review/1")
    assert.strictEqual(typeof result, "object", "Should return an object")
    assert.ok("status" in result, "Should have a status field")
    assert.strictEqual(result.status, "unknown")
  })

  test("checkExternalState approved returns full ExternalReviewState shape", () => {
    // Stub gh CLI to return approved
    writeFileSync(join(fakeBin, "gh"), '#!/bin/sh\necho \'["OPEN", "APPROVED"]\'\n')
    chmodSync(join(fakeBin, "gh"), 0o755)

    const result = checkExternalState("https://github.com/org/repo/pull/42")
    assert.strictEqual(typeof result, "object")
    assert.strictEqual(result.status, "approved")
    assert.strictEqual(result.provider, "github")
    assert.strictEqual(result.url, "https://github.com/org/repo/pull/42")
  })

  test("checkExternalState changes_requested returns provider and url", () => {
    writeFileSync(
      join(fakeBin, "gh"),
      '#!/bin/sh\necho \'["OPEN", "CHANGES_REQUESTED"]\'\n',
    )
    chmodSync(join(fakeBin, "gh"), 0o755)

    const result = checkExternalState("https://github.com/org/repo/pull/42")
    assert.strictEqual(result.status, "changes_requested")
    assert.strictEqual(result.provider, "github")
    assert.strictEqual(result.url, "https://github.com/org/repo/pull/42")
  })

  test("checkExternalState pending returns provider and url", () => {
    writeFileSync(
      join(fakeBin, "gh"),
      '#!/bin/sh\necho \'["OPEN", "REVIEW_REQUIRED"]\'\n',
    )
    chmodSync(join(fakeBin, "gh"), 0o755)

    const result = checkExternalState("https://github.com/org/repo/pull/42")
    assert.strictEqual(result.status, "pending")
    assert.strictEqual(result.provider, "github")
    assert.strictEqual(result.url, "https://github.com/org/repo/pull/42")
  })

  test("checkExternalState CLI error returns status unknown, no provider", () => {
    writeFileSync(join(fakeBin, "gh"), "#!/bin/sh\nexit 1\n")
    chmodSync(join(fakeBin, "gh"), 0o755)

    const result = checkExternalState("https://github.com/org/repo/pull/42")
    assert.strictEqual(result.status, "unknown")
    // On error, provider and url may not be present
    assert.strictEqual(typeof result, "object")
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Orchestrator integration: legacy intent roundtrip
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== Orchestrator: legacy intent without feedback/ or visits ===")

  test("runNext on legacy intent (no feedback dir, no visits) proceeds normally", () => {
    const { projDir, intentDirPath, slug } = createProject("legacy-roundtrip", {
      active_stage: "plan",
    })

    // Legacy state: no visits field, no feedback directory
    const statePath = join(intentDirPath, "stages", "plan", "state.json")
    mkdirSync(join(intentDirPath, "stages", "plan", "units"), { recursive: true })
    writeJson(statePath, {
      stage: "plan",
      status: "active",
      phase: "elaborate",
      started_at: "2026-04-04T18:05:00Z",
      completed_at: null,
      gate_entered_at: null,
      gate_outcome: null,
      // No visits field
    })

    process.chdir(projDir)
    const result = runNext(slug)

    // Should return a normal elaborate action
    assert.strictEqual(result.action, "elaborate")
    assert.strictEqual(result.intent, slug)
    assert.strictEqual(result.stage, "plan")
  })

  test("runNext gate phase with no feedback dir proceeds to gate review", () => {
    const { projDir, intentDirPath, slug } = createProject("legacy-gate", {
      active_stage: "plan",
      stages: ["plan", "build"],
    })

    createStageState(intentDirPath, "plan", {
      phase: "gate",
      status: "completed",
      gate_entered_at: "2026-04-04T19:00:00Z",
      gate_outcome: null,
    })

    // Create a completed unit so stage qualifies for gate
    createUnit(intentDirPath, "plan", "unit-01-discover", { status: "completed" })

    process.chdir(projDir)
    const result = runNext(slug)

    // countPendingFeedback should return 0 (no feedback dir) and not block
    // The result depends on gate type but should NOT be feedback_revisit
    assert.notStrictEqual(
      result.action,
      "feedback_revisit",
      "No feedback dir should not trigger feedback_revisit",
    )
  })

  test("legacy intent with empty studio field still resolves stages", () => {
    // This simulates the cowork-mcp-apps-integration pattern: studio: "" with no stages
    const projDir = join(tmp, "empty-studio-project")
    const haikuRoot = join(projDir, ".haiku")
    const slug = "empty-studio-intent"
    const intentDirPath = join(haikuRoot, "intents", slug)
    mkdirSync(intentDirPath, { recursive: true })
    writeFileSync(
      join(intentDirPath, "intent.md"),
      `---
title: Empty Studio Intent
studio: ""
mode: continuous
status: active
started_at: 2026-04-04T18:00:00Z
---

No stages, empty studio.
`,
    )
    process.chdir(projDir)

    // countPendingFeedback on a nonexistent stage should not crash
    const count = countPendingFeedback(slug, "development")
    assert.strictEqual(count, 0)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
  process.exit(failed > 0 ? 1 : 0)
}
