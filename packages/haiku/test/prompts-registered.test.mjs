#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U registered prompts — verifies migration to skills
// All prompts were migrated to skills (plugin/skills/). The prompt registry should be empty.
// Run: npx tsx test/prompts-registered.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

// Import the prompt registry BEFORE side-effect imports
import { listPrompts, getPrompt, completeArgument } from "../src/prompts/index.ts"

// Side-effect imports — these used to register prompts but no longer do
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

// ── Post-migration: prompt registry should be empty ───────────────────────

console.log("\n=== Post-migration: prompt registry ===")

test("prompt list returns empty array after migration to skills", () => {
  const prompts = listPrompts()
  assert.strictEqual(prompts.length, 0, `Expected 0 prompts after migration, got ${prompts.length}`)
})

test("no core prompts registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  const corePrompts = ["haiku:start", "haiku:resume", "haiku:refine", "haiku:review", "haiku:reflect"]
  for (const name of corePrompts) {
    assert.ok(!names.includes(name), `Core prompt ${name} should NOT be registered (migrated to skill)`)
  }
})

test("no simple prompts registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  const simplePrompts = [
    "haiku:dashboard", "haiku:backlog", "haiku:capacity", "haiku:release-notes",
    "haiku:version", "haiku:scaffold", "haiku:migrate", "haiku:seed", "haiku:ideate", "haiku:setup",
  ]
  for (const name of simplePrompts) {
    assert.ok(!names.includes(name), `Simple prompt ${name} should NOT be registered (migrated to skill)`)
  }
})

test("no complex prompts registered", () => {
  const prompts = listPrompts()
  const names = prompts.map((p) => p.name)
  assert.ok(!names.includes("haiku:autopilot"), `Complex prompt haiku:autopilot should NOT be registered (migrated to skill)`)
})

// ── Error handling: getPrompt for removed prompts ─────────────────────────

console.log("\n=== Error handling for removed prompts ===")

await testAsync("getPrompt throws for migrated prompt names", async () => {
  try {
    await getPrompt("haiku:start", { description: "test" })
    assert.fail("Should have thrown for removed prompt")
  } catch (e) {
    assert.ok(e.message.includes("Unknown prompt"), `Expected 'Unknown prompt' error, got: ${e.message}`)
  }
})

// ── Completions: empty for unknown prompts ────────────────────────────────

console.log("\n=== Completions ===")

await testAsync("returns empty completions for removed prompts", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "haiku:resume" },
    argument: { name: "intent", value: "test" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

// ── Cleanup ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
  process.exit(failed > 0 ? 1 : 0)
}
