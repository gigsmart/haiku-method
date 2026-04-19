#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U helpers — frontmatter parsing, path resolution, validation
// Run: npx tsx test/helpers.test.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import {
  parseFrontmatter,
  setFrontmatterField,
  readJson,
  writeJson,
  timestamp,
  findHaikuRoot,
  intentDir,
  stageDir,
  unitPath,
  stageStatePath,
} from "../src/state-tools.ts"
import { validateIdentifier, textMsg, singleMessage, studioSearchPaths } from "../src/prompts/helpers.ts"
import { computeFeedbackSignature } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-helpers-test-"))
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

try {

// ── parseFrontmatter ──────────────────────────────────────────────────────

console.log("\n=== parseFrontmatter ===")

test("parses YAML frontmatter and body", () => {
  const raw = `---
title: Hello World
status: active
---

Body content here.`
  const { data, body } = parseFrontmatter(raw)
  assert.strictEqual(data.title, "Hello World")
  assert.strictEqual(data.status, "active")
  assert.strictEqual(body, "Body content here.")
})

test("handles empty frontmatter", () => {
  const raw = `---
---

Just a body.`
  const { data, body } = parseFrontmatter(raw)
  assert.deepStrictEqual(data, {})
  assert.strictEqual(body, "Just a body.")
})

test("normalizes Date objects to ISO date strings", () => {
  const raw = `---
started_at: 2026-04-04
completed_at: 2026-04-05
---
`
  const { data } = parseFrontmatter(raw)
  // gray-matter parses YYYY-MM-DD as Date objects; our normalizer converts them
  assert.strictEqual(typeof data.started_at, "string")
  assert.ok(data.started_at.includes("2026-04-0"))
})

test("preserves null values", () => {
  const raw = `---
completed_at: null
---
`
  const { data } = parseFrontmatter(raw)
  assert.strictEqual(data.completed_at, null)
})

test("preserves arrays", () => {
  const raw = `---
depends_on: [unit-01-foo, unit-02-bar]
---
`
  const { data } = parseFrontmatter(raw)
  assert.ok(Array.isArray(data.depends_on))
  assert.deepStrictEqual(data.depends_on, ["unit-01-foo", "unit-02-bar"])
})

test("handles numeric fields", () => {
  const raw = `---
bolt: 3
---
`
  const { data } = parseFrontmatter(raw)
  assert.strictEqual(data.bolt, 3)
})

test("handles nested objects", () => {
  const raw = `---
stack:
  compute: lambda
  db: postgres
---
`
  const { data } = parseFrontmatter(raw)
  assert.deepStrictEqual(data.stack, { compute: "lambda", db: "postgres" })
})

test("handles frontmatter with no body", () => {
  const raw = `---
title: No body
---`
  const { data, body } = parseFrontmatter(raw)
  assert.strictEqual(data.title, "No body")
  assert.strictEqual(body, "")
})

test("handles body with markdown headings and lists", () => {
  const raw = `---
title: Complex
---

## Completion Criteria

- [x] Done
- [ ] Pending
`
  const { data, body } = parseFrontmatter(raw)
  assert.strictEqual(data.title, "Complex")
  assert.ok(body.includes("## Completion Criteria"))
  assert.ok(body.includes("- [x] Done"))
  assert.ok(body.includes("- [ ] Pending"))
})

// ── setFrontmatterField ───────────────────────────────────────────────────

console.log("\n=== setFrontmatterField ===")

test("sets a string field", () => {
  const file = join(tmp, "set-string.md")
  writeFileSync(file, `---\ntitle: Original\nstatus: active\n---\n\nBody text.\n`)
  setFrontmatterField(file, "status", "completed")
  const { data } = parseFrontmatter(readFileSync(file, "utf8"))
  assert.strictEqual(data.status, "completed")
})

test("adds a new field", () => {
  const file = join(tmp, "add-field.md")
  writeFileSync(file, `---\ntitle: Test\n---\n\nBody.\n`)
  setFrontmatterField(file, "studio", "software")
  const { data } = parseFrontmatter(readFileSync(file, "utf8"))
  assert.strictEqual(data.studio, "software")
})

test("preserves body when setting field", () => {
  const file = join(tmp, "preserve-body.md")
  writeFileSync(file, `---\ntitle: Test\n---\n\n## Criteria\n\n- [x] Done\n- [ ] Pending\n`)
  setFrontmatterField(file, "title", "Updated")
  const raw = readFileSync(file, "utf8")
  assert.ok(raw.includes("## Criteria"))
  assert.ok(raw.includes("- [x] Done"))
  assert.ok(raw.includes("- [ ] Pending"))
})

test("sets numeric field", () => {
  const file = join(tmp, "set-number.md")
  writeFileSync(file, `---\nbolt: 1\n---\n`)
  setFrontmatterField(file, "bolt", 5)
  const { data } = parseFrontmatter(readFileSync(file, "utf8"))
  assert.strictEqual(data.bolt, 5)
})

test("overwrites existing value", () => {
  const file = join(tmp, "overwrite.md")
  writeFileSync(file, `---\nhat: architect\n---\n`)
  setFrontmatterField(file, "hat", "builder")
  const { data } = parseFrontmatter(readFileSync(file, "utf8"))
  assert.strictEqual(data.hat, "builder")
})

// ── readJson / writeJson ──────────────────────────────────────────────────

console.log("\n=== readJson / writeJson ===")

test("writeJson creates file with JSON content", () => {
  const file = join(tmp, "json-test", "state.json")
  writeJson(file, { stage: "inception", status: "active", phase: "elaborate" })
  const data = readJson(file)
  assert.strictEqual(data.stage, "inception")
  assert.strictEqual(data.status, "active")
  assert.strictEqual(data.phase, "elaborate")
})

test("readJson returns empty object for missing file", () => {
  const data = readJson(join(tmp, "nonexistent.json"))
  assert.deepStrictEqual(data, {})
})

test("writeJson creates parent directories", () => {
  const file = join(tmp, "deep", "nested", "dir", "data.json")
  writeJson(file, { key: "value" })
  const data = readJson(file)
  assert.strictEqual(data.key, "value")
})

test("writeJson overwrites existing file", () => {
  const file = join(tmp, "overwrite.json")
  writeJson(file, { version: 1 })
  writeJson(file, { version: 2 })
  const data = readJson(file)
  assert.strictEqual(data.version, 2)
})

test("writeJson produces formatted JSON with trailing newline", () => {
  const file = join(tmp, "formatted.json")
  writeJson(file, { a: 1, b: 2 })
  const raw = readFileSync(file, "utf8")
  assert.ok(raw.endsWith("\n"))
  assert.ok(raw.includes("  ")) // 2-space indent
})

// ── timestamp ─────────────────────────────────────────────────────────────

console.log("\n=== timestamp ===")

test("returns ISO string without milliseconds", () => {
  const ts = timestamp()
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts), `Expected ISO without ms, got: ${ts}`)
})

test("returns a reasonable current time", () => {
  const ts = timestamp()
  const date = new Date(ts)
  const now = Date.now()
  assert.ok(Math.abs(date.getTime() - now) < 5000, "Timestamp should be within 5 seconds of now")
})

// ── Path resolution ───────────────────────────────────────────────────────

console.log("\n=== Path resolution ===")

test("findHaikuRoot finds .haiku directory", () => {
  const projDir = join(tmp, "project-root")
  mkdirSync(join(projDir, ".haiku"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const root = findHaikuRoot()
    assert.ok(root.endsWith(".haiku"), `Expected path ending with .haiku, got: ${root}`)
  } finally {
    process.chdir(origDir)
  }
})

test("findHaikuRoot walks up directories", () => {
  const projDir = join(tmp, "project-walk")
  mkdirSync(join(projDir, ".haiku"), { recursive: true })
  mkdirSync(join(projDir, "src", "lib"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(join(projDir, "src", "lib"))
  try {
    const root = findHaikuRoot()
    assert.ok(root.endsWith(".haiku"))
  } finally {
    process.chdir(origDir)
  }
})

test("findHaikuRoot throws when no .haiku exists", () => {
  const emptyDir = join(tmp, "no-haiku")
  mkdirSync(emptyDir, { recursive: true })
  const origDir = process.cwd()
  process.chdir(emptyDir)
  try {
    assert.throws(() => findHaikuRoot(), /No .haiku\/ directory found/)
  } finally {
    process.chdir(origDir)
  }
})

test("intentDir returns correct path", () => {
  const projDir = join(tmp, "intent-dir-test")
  mkdirSync(join(projDir, ".haiku", "intents"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const dir = intentDir("my-feature")
    assert.ok(dir.endsWith(".haiku/intents/my-feature"))
  } finally {
    process.chdir(origDir)
  }
})

test("stageDir returns correct path", () => {
  const projDir = join(tmp, "stage-dir-test")
  mkdirSync(join(projDir, ".haiku", "intents"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const dir = stageDir("my-feature", "inception")
    assert.ok(dir.endsWith(".haiku/intents/my-feature/stages/inception"))
  } finally {
    process.chdir(origDir)
  }
})

test("unitPath returns correct path with .md extension", () => {
  const projDir = join(tmp, "unit-path-test")
  mkdirSync(join(projDir, ".haiku", "intents"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const path = unitPath("feat", "inception", "unit-01-discovery")
    assert.ok(path.endsWith("units/unit-01-discovery.md"))
  } finally {
    process.chdir(origDir)
  }
})

test("unitPath handles .md suffix gracefully", () => {
  const projDir = join(tmp, "unit-path-md-test")
  mkdirSync(join(projDir, ".haiku", "intents"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const path = unitPath("feat", "inception", "unit-01-discovery.md")
    assert.ok(path.endsWith("units/unit-01-discovery.md"))
    assert.ok(!path.endsWith(".md.md"), "Should not double the .md extension")
  } finally {
    process.chdir(origDir)
  }
})

test("stageStatePath returns correct path", () => {
  const projDir = join(tmp, "ss-path-test")
  mkdirSync(join(projDir, ".haiku", "intents"), { recursive: true })
  const origDir = process.cwd()
  process.chdir(projDir)
  try {
    const path = stageStatePath("feat", "inception")
    assert.ok(path.endsWith("stages/inception/state.json"))
  } finally {
    process.chdir(origDir)
  }
})

// ── validateIdentifier ────────────────────────────────────────────────────

console.log("\n=== validateIdentifier ===")

test("allows simple slugs", () => {
  assert.strictEqual(validateIdentifier("my-feature", "test"), "my-feature")
})

test("allows slugs with numbers", () => {
  assert.strictEqual(validateIdentifier("unit-01-discovery", "test"), "unit-01-discovery")
})

test("allows single word", () => {
  assert.strictEqual(validateIdentifier("inception", "test"), "inception")
})

test("rejects forward slash", () => {
  assert.throws(() => validateIdentifier("../../etc/passwd", "slug"), /Invalid/)
})

test("rejects backslash", () => {
  assert.throws(() => validateIdentifier("foo\\bar", "slug"), /Invalid/)
})

test("rejects double dot traversal", () => {
  assert.throws(() => validateIdentifier("foo..bar", "slug"), /Invalid/)
})

test("rejects path with slash", () => {
  assert.throws(() => validateIdentifier("a/b", "slug"), /Invalid/)
})

// ── textMsg / singleMessage ───────────────────────────────────────────────

console.log("\n=== textMsg / singleMessage ===")

test("textMsg creates user message", () => {
  const msg = textMsg("user", "hello")
  assert.strictEqual(msg.role, "user")
  assert.strictEqual(msg.content.type, "text")
  assert.strictEqual(msg.content.text, "hello")
})

test("textMsg creates assistant message", () => {
  const msg = textMsg("assistant", "reply")
  assert.strictEqual(msg.role, "assistant")
  assert.strictEqual(msg.content.text, "reply")
})

test("singleMessage creates GetPromptResult with one user message", () => {
  const result = singleMessage("test content")
  assert.strictEqual(result.messages.length, 1)
  assert.strictEqual(result.messages[0].role, "user")
  assert.strictEqual(result.messages[0].content.text, "test content")
})

// ── studioSearchPaths ─────────────────────────────────────────────────────

console.log("\n=== studioSearchPaths ===")

test("returns array of paths", () => {
  const paths = studioSearchPaths()
  assert.ok(Array.isArray(paths))
  assert.ok(paths.length >= 1)
})

test("includes project-local studios path first", () => {
  const paths = studioSearchPaths()
  assert.ok(paths[0].includes(".haiku/studios"))
})

// ── computeFeedbackSignature (loop-detection canonicalization) ────────────

console.log("\n=== computeFeedbackSignature canonicalization ===")

test("signature is identical regardless of title input order", () => {
  const a = computeFeedbackSignature(["Finding B", "Finding A", "Finding C"])
  const b = computeFeedbackSignature(["Finding C", "Finding A", "Finding B"])
  assert.strictEqual(a, b)
})

test("signature ignores case and surrounding whitespace", () => {
  const a = computeFeedbackSignature(["  Finding A  ", "finding b"])
  const b = computeFeedbackSignature(["FINDING A", "  Finding B"])
  assert.strictEqual(a, b)
})

test("signature differs when titles differ", () => {
  const a = computeFeedbackSignature(["Finding A", "Finding B"])
  const b = computeFeedbackSignature(["Finding A", "Finding C"])
  assert.notStrictEqual(a, b)
})

test("signature for empty or all-blank input is empty string", () => {
  assert.strictEqual(computeFeedbackSignature([]), "")
  assert.strictEqual(computeFeedbackSignature(["", "  ", "\t"]), "")
})

test("signature has a stable prefix format", () => {
  const sig = computeFeedbackSignature(["Finding X"])
  assert.ok(sig.startsWith("sig:"), `expected sig: prefix, got: ${sig}`)
  assert.ok(sig.length > 4, `expected hex body, got: ${sig}`)
})

} finally {
  // ── Cleanup ───────────────────────────────────────────────────────────────

  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}
