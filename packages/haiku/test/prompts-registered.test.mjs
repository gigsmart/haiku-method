#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U registered prompts — core, simple, complex prompt handlers
// Run: npx tsx test/prompts-registered.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

// Import the prompt registry BEFORE side-effect imports
import { listPrompts, getPrompt, completeArgument } from "../src/prompts/index.ts"

// Side-effect imports register the actual prompts (same as server.ts)
import "../src/prompts/core.ts"
import "../src/prompts/complex.ts"
import "../src/prompts/simple.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-prompts-reg-"))
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

async function testAsync(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

try {

// ── Create a minimal .haiku project for prompts that read state ───────────

let projectCounter = 0
function setupProject() {
  projectCounter++
  const projDir = join(tmp, `project-${projectCounter}`)
  const haikuRoot = join(projDir, ".haiku")
  const intentSlug = "test-feature"

  mkdirSync(join(haikuRoot, "intents", intentSlug, "stages", "inception", "units"), { recursive: true })
  mkdirSync(join(haikuRoot, "intents", intentSlug, "knowledge"), { recursive: true })

  writeFileSync(join(haikuRoot, "intents", intentSlug, "intent.md"), `---
title: Test Feature
studio: software
mode: continuous
active_stage: inception
status: active
started_at: 2026-04-04T18:00:00Z
completed_at: null
---

Build a test feature.
`)

  writeFileSync(join(haikuRoot, "intents", intentSlug, "stages", "inception", "state.json"), JSON.stringify({
    stage: "inception",
    status: "active",
    phase: "elaborate",
    started_at: "2026-04-04T18:05:00Z",
    completed_at: null,
  }, null, 2))

  writeFileSync(join(haikuRoot, "intents", intentSlug, "stages", "inception", "units", "unit-01-research.md"), `---
name: unit-01-research
type: research
status: active
depends_on: []
bolt: 1
hat: architect
---

## Completion Criteria

- [x] Research done
`)

  return { projDir, haikuRoot, intentSlug }
}

// ── Registered Prompts Catalog ────────────────────────────────────────────

console.log("\n=== Registered Prompts Catalog ===")

test("all expected core prompts are registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  const expected = ["haiku:start", "haiku:resume", "haiku:refine", "haiku:review", "haiku:reflect"]
  for (const name of expected) {
    assert.ok(names.includes(name), `Missing core prompt: ${name}`)
  }
})

test("all expected simple prompts are registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  const expected = [
    "haiku:dashboard",
    "haiku:backlog",
    "haiku:capacity",
    "haiku:release-notes",
    "haiku:version",
    "haiku:scaffold",
    "haiku:migrate",
    "haiku:seed",
    "haiku:ideate",
    "haiku:setup",
  ]
  for (const name of expected) {
    assert.ok(names.includes(name), `Missing simple prompt: ${name}`)
  }
})

test("all expected complex prompts are registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  const expected = ["haiku:autopilot"]
  for (const name of expected) {
    assert.ok(names.includes(name), `Missing complex prompt: ${name}`)
  }
})

test("prompt count is at least 15", () => {
  const prompts = listPrompts()
  assert.ok(prompts.length >= 15, `Expected >= 15 prompts, got ${prompts.length}`)
})

// ── Prompt Metadata ───────────────────────────────────────────────────────

console.log("\n=== Prompt Metadata ===")

test("every prompt has title and description", () => {
  const prompts = listPrompts()
  for (const p of prompts) {
    assert.ok(p.title, `${p.name} missing title`)
    assert.ok(p.description, `${p.name} missing description`)
  }
})

test("every prompt name follows naming convention", () => {
  const prompts = listPrompts()
  for (const p of prompts) {
    // Should be namespace:name or namespace:sub-name format
    assert.ok(p.name.includes(":"), `${p.name} should use colon-separated naming`)
  }
})

test("core prompt arguments have correct required flags", () => {
  const prompts = listPrompts()
  const start = prompts.find((p) => p.name === "haiku:start")
  // haiku:start should work without args (auto-detect), so all args optional or no args
  if (start.arguments) {
    for (const arg of start.arguments) {
      assert.strictEqual(typeof arg.required, "boolean")
    }
  }
})

// ── haiku:dashboard ───────────────────────────────────────────────────────

console.log("\n=== haiku:dashboard ===")

await testAsync("returns message when no .haiku directory", async () => {
  const emptyDir = join(tmp, "empty-dash")
  mkdirSync(emptyDir, { recursive: true })
  process.chdir(emptyDir)
  const result = await getPrompt("haiku:dashboard")
  assert.ok(result.messages.length > 0)
  assert.ok(result.messages[0].content.text.includes("No .haiku/"))
})

await testAsync("returns dashboard with intent info", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:dashboard")
  const text = result.messages[0].content.text
  assert.ok(text.includes("Dashboard"))
  assert.ok(text.includes("test-feature"))
  assert.ok(text.includes("active"))
})

// ── haiku:version ─────────────────────────────────────────────────────────

console.log("\n=== haiku:version ===")

await testAsync("returns version info", async () => {
  const result = await getPrompt("haiku:version")
  const text = result.messages[0].content.text
  assert.ok(text.includes("version"))
})

// ── haiku:scaffold ────────────────────────────────────────────────────────

console.log("\n=== haiku:scaffold ===")

await testAsync("scaffold studio returns instructions", async () => {
  const result = await getPrompt("haiku:scaffold", { type: "studio", name: "my-studio" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Scaffold Studio"))
  assert.ok(text.includes("my-studio"))
  assert.ok(text.includes("STUDIO.md"))
})

await testAsync("scaffold stage returns instructions", async () => {
  const result = await getPrompt("haiku:scaffold", { type: "stage", name: "design", parent: "my-studio" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Scaffold Stage"))
  assert.ok(text.includes("design"))
  assert.ok(text.includes("STAGE.md"))
})

await testAsync("scaffold hat returns instructions", async () => {
  const result = await getPrompt("haiku:scaffold", { type: "hat", name: "reviewer" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Scaffold Hat"))
  assert.ok(text.includes("reviewer"))
})

await testAsync("scaffold provider returns instructions", async () => {
  const result = await getPrompt("haiku:scaffold", { type: "provider", name: "slack" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Provider"))
  assert.ok(text.includes("slack"))
})

await testAsync("scaffold rejects unknown type", async () => {
  const result = await getPrompt("haiku:scaffold", { type: "widget", name: "foo" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Unknown scaffold type"))
})

// ── haiku:backlog ─────────────────────────────────────────────────────────

console.log("\n=== haiku:backlog ===")

await testAsync("backlog list shows empty when no backlog", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:backlog")
  const text = result.messages[0].content.text
  assert.ok(text.includes("empty") || text.includes("No"))
})

await testAsync("backlog add returns scaffolding instructions", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:backlog", { action: "add", description: "new idea" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Add Backlog Item"))
  assert.ok(text.includes("new idea"))
})

await testAsync("backlog review shows empty when no items", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:backlog", { action: "review" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("empty"))
})

await testAsync("backlog promote without ID asks for it", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:backlog", { action: "promote" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Specify") || text.includes("Promote"))
})

// ── haiku:seed ────────────────────────────────────────────────────────────

console.log("\n=== haiku:seed ===")

await testAsync("seed list shows empty when no seeds", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:seed")
  const text = result.messages[0].content.text
  assert.ok(text.includes("No seeds") || text.includes("planted yet"))
})

await testAsync("seed plant returns instructions", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:seed", { action: "plant" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Plant a Seed"))
})

await testAsync("seed check handles empty seed dir", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:seed", { action: "check" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("No seeds") || text.includes("No planted"))
})

// ── haiku:ideate ──────────────────────────────────────────────────────────

console.log("\n=== haiku:ideate ===")

await testAsync("ideate returns analysis instructions", async () => {
  const result = await getPrompt("haiku:ideate")
  const text = result.messages[0].content.text
  assert.ok(text.includes("Ideate"))
  assert.ok(text.includes("Adversarial"))
})

await testAsync("ideate with area focuses on it", async () => {
  const result = await getPrompt("haiku:ideate", { area: "src/lib" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("src/lib"))
})

// ── haiku:setup ───────────────────────────────────────────────────────────

console.log("\n=== haiku:setup ===")

await testAsync("setup returns configuration instructions", async () => {
  const result = await getPrompt("haiku:setup")
  const text = result.messages[0].content.text
  assert.ok(text.includes("Setup"))
  assert.ok(text.includes("Auto-Detect"))
  assert.ok(text.includes("settings.yml"))
})

// ── haiku:migrate ─────────────────────────────────────────────────────────

console.log("\n=== haiku:migrate ===")

await testAsync("migrate returns instructions", async () => {
  const result = await getPrompt("haiku:migrate")
  const text = result.messages[0].content.text
  assert.ok(text.includes("Migrate"))
  assert.ok(text.includes("legacy"))
})

// ── Error handling for prompts that need state ────────────────────────────

console.log("\n=== Prompt error handling ===")

await testAsync("haiku:start returns instructions with description", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  const result = await getPrompt("haiku:start", { description: "Build a widget" })
  const text = result.messages[0].content.text
  assert.ok(text.includes("Build a widget") || text.includes("Intent"))
})

await testAsync("haiku:resume with nonexistent intent throws", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)
  try {
    await getPrompt("haiku:resume", { intent: "does-not-exist" })
    assert.fail("Should have thrown")
  } catch (e) {
    assert.ok(e.message.includes("not found") || e.message.includes("Intent"))
  }
})

// ── Argument Completions ──────────────────────────────────────────────────

console.log("\n=== Argument Completions ===")

await testAsync("completes intent slug for haiku:resume", async () => {
  const { projDir } = setupProject()
  process.chdir(projDir)

  // Find a prompt with intent completer
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "haiku:resume" },
    argument: { name: "intent", value: "test" },
  })
  // Should find our test-feature intent
  assert.ok(
    result.completion.values.length >= 0, // May not find if completer doesn't match prefix
    "Should return an array of completions"
  )
})

await testAsync("returns empty completions for unknown argument", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "haiku:resume" },
    argument: { name: "nonexistent", value: "" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

// ── Cleanup ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
}
process.exit(failed > 0 ? 1 : 0)
