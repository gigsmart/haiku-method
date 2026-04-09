#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U prompt registry — registration, listing, getting, completions
// Run: npx tsx test/prompts.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import { registerPrompt, listPrompts, getPrompt, completeArgument } from "../src/prompts/index.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-prompts-test-"))
const origCwd = process.cwd()

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

// ── Register test prompts ─────────────────────────────────────────────────

// Register a minimal prompt for testing
registerPrompt({
  name: "test:minimal",
  title: "Test Minimal",
  description: "A minimal test prompt",
  arguments: [],
  handler: async () => ({
    messages: [{ role: "user", content: { type: "text", text: "minimal response" } }],
  }),
})

registerPrompt({
  name: "test:with-args",
  title: "Test With Args",
  description: "A prompt that takes arguments",
  arguments: [
    { name: "intent", description: "Intent slug", required: true },
    { name: "stage", description: "Stage name", required: false },
  ],
  handler: async (args) => ({
    messages: [
      {
        role: "user",
        content: { type: "text", text: `intent=${args.intent}, stage=${args.stage || "none"}` },
      },
    ],
  }),
})

registerPrompt({
  name: "test:with-completer",
  title: "Test Completer",
  description: "A prompt with argument completion",
  arguments: [
    {
      name: "color",
      description: "A color",
      required: true,
      completer: async (value) => {
        const colors = ["red", "green", "blue", "yellow", "purple", "orange"]
        if (!value) return colors
        return colors.filter((c) => c.startsWith(value.toLowerCase()))
      },
    },
  ],
  handler: async (args) => ({
    messages: [{ role: "user", content: { type: "text", text: `color=${args.color}` } }],
  }),
})

registerPrompt({
  name: "test:multi-message",
  title: "Test Multi",
  description: "Returns multiple messages",
  arguments: [],
  handler: async () => ({
    messages: [
      { role: "user", content: { type: "text", text: "message 1" } },
      { role: "assistant", content: { type: "text", text: "message 2" } },
      { role: "user", content: { type: "text", text: "message 3" } },
    ],
  }),
})

// ── listPrompts ───────────────────────────────────────────────────────────

console.log("\n=== listPrompts ===")

test("returns array of prompts", () => {
  const prompts = listPrompts()
  assert.ok(Array.isArray(prompts))
  assert.ok(prompts.length >= 4, `Expected at least 4 prompts, got ${prompts.length}`)
})

test("each prompt has name, title, description", () => {
  const prompts = listPrompts()
  const minimal = prompts.find((p) => p.name === "test:minimal")
  assert.ok(minimal, "test:minimal should be in the list")
  assert.strictEqual(minimal.title, "Test Minimal")
  assert.strictEqual(minimal.description, "A minimal test prompt")
})

test("prompts without arguments have no arguments field", () => {
  const prompts = listPrompts()
  const minimal = prompts.find((p) => p.name === "test:minimal")
  assert.strictEqual(minimal.arguments, undefined)
})

test("prompts with arguments list them", () => {
  const prompts = listPrompts()
  const withArgs = prompts.find((p) => p.name === "test:with-args")
  assert.ok(withArgs.arguments, "Should have arguments")
  assert.strictEqual(withArgs.arguments.length, 2)
  assert.strictEqual(withArgs.arguments[0].name, "intent")
  assert.strictEqual(withArgs.arguments[0].required, true)
  assert.strictEqual(withArgs.arguments[1].name, "stage")
  assert.strictEqual(withArgs.arguments[1].required, false)
})

// ── getPrompt ─────────────────────────────────────────────────────────────

console.log("\n=== getPrompt ===")

await testAsync("returns messages for minimal prompt", async () => {
  const result = await getPrompt("test:minimal")
  assert.ok(result.messages)
  assert.strictEqual(result.messages.length, 1)
  assert.strictEqual(result.messages[0].content.text, "minimal response")
})

await testAsync("passes arguments to handler", async () => {
  const result = await getPrompt("test:with-args", { intent: "my-feature" })
  assert.strictEqual(result.messages[0].content.text, "intent=my-feature, stage=none")
})

await testAsync("passes all arguments to handler", async () => {
  const result = await getPrompt("test:with-args", { intent: "feat", stage: "inception" })
  assert.strictEqual(result.messages[0].content.text, "intent=feat, stage=inception")
})

await testAsync("throws McpError for unknown prompt", async () => {
  try {
    await getPrompt("nonexistent:prompt")
    assert.fail("Should have thrown")
  } catch (e) {
    assert.ok(e.message.includes("Unknown prompt"), `Expected 'Unknown prompt' error, got: ${e.message}`)
  }
})

await testAsync("throws McpError for missing required argument", async () => {
  try {
    await getPrompt("test:with-args", {})
    assert.fail("Should have thrown")
  } catch (e) {
    assert.ok(e.message.includes("Missing required argument"), `Expected 'Missing required argument', got: ${e.message}`)
  }
})

await testAsync("allows missing optional argument", async () => {
  const result = await getPrompt("test:with-args", { intent: "feat" })
  assert.ok(result.messages[0].content.text.includes("stage=none"))
})

await testAsync("returns multiple messages", async () => {
  const result = await getPrompt("test:multi-message")
  assert.strictEqual(result.messages.length, 3)
  assert.strictEqual(result.messages[0].role, "user")
  assert.strictEqual(result.messages[1].role, "assistant")
  assert.strictEqual(result.messages[2].role, "user")
})

// ── completeArgument ──────────────────────────────────────────────────────

console.log("\n=== completeArgument ===")

await testAsync("returns empty for non-prompt ref type", async () => {
  const result = await completeArgument({
    ref: { type: "ref/resource" },
    argument: { name: "color", value: "" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

await testAsync("returns empty for unknown prompt", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "nonexistent" },
    argument: { name: "color", value: "" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

await testAsync("returns empty for argument without completer", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "test:with-args" },
    argument: { name: "intent", value: "" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

await testAsync("returns completions for argument with completer", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "test:with-completer" },
    argument: { name: "color", value: "" },
  })
  assert.ok(result.completion.values.length === 6, `Expected 6 colors, got ${result.completion.values.length}`)
})

await testAsync("filters completions by prefix", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "test:with-completer" },
    argument: { name: "color", value: "re" },
  })
  assert.ok(result.completion.values.includes("red"))
  assert.ok(!result.completion.values.includes("blue"))
})

await testAsync("returns empty for no-match prefix", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "test:with-completer" },
    argument: { name: "color", value: "zzz" },
  })
  assert.strictEqual(result.completion.values.length, 0)
})

await testAsync("returns empty for missing ref name", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt" },
    argument: { name: "color", value: "" },
  })
  assert.deepStrictEqual(result.completion.values, [])
})

await testAsync("includes total and hasMore fields", async () => {
  const result = await completeArgument({
    ref: { type: "ref/prompt", name: "test:with-completer" },
    argument: { name: "color", value: "" },
  })
  assert.strictEqual(result.completion.total, 6)
  assert.strictEqual(result.completion.hasMore, false)
})

// ── Prompt re-registration ────────────────────────────────────────────────

console.log("\n=== Prompt re-registration ===")

test("overwriting a prompt replaces it", () => {
  registerPrompt({
    name: "test:overwrite",
    title: "Original",
    description: "Will be overwritten",
    arguments: [],
    handler: async () => ({ messages: [{ role: "user", content: { type: "text", text: "original" } }] }),
  })

  registerPrompt({
    name: "test:overwrite",
    title: "Replaced",
    description: "Was overwritten",
    arguments: [],
    handler: async () => ({ messages: [{ role: "user", content: { type: "text", text: "replaced" } }] }),
  })

  const prompts = listPrompts()
  const prompt = prompts.find((p) => p.name === "test:overwrite")
  assert.strictEqual(prompt.title, "Replaced")
})

await testAsync("overwritten prompt uses new handler", async () => {
  const result = await getPrompt("test:overwrite")
  assert.strictEqual(result.messages[0].content.text, "replaced")
})

// ── Cleanup ───────────────────────────────────────────────────────────────

process.chdir(origCwd)
rmSync(tmp, { recursive: true })

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
