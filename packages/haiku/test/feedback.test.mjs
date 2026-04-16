#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U feedback helpers and haiku_feedback tool
// Run: npx tsx test/feedback.test.mjs

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  chmodSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import assert from "node:assert"

import {
  handleStateTool,
  writeFeedbackFile,
  readFeedbackFiles,
  countPendingFeedback,
  updateFeedbackFile,
  deleteFeedbackFile,
  findFeedbackFile,
  feedbackDir,
  slugifyTitle,
  deriveAuthorType,
  FEEDBACK_ORIGINS,
  FEEDBACK_STATUSES,
} from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-feedback-test-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-feedback-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), { recursive: true })

writeFileSync(
  join(intentDirPath, "intent.md"),
  `---
title: Test Feedback Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

This is a test intent for feedback testing.
`
)

writeFileSync(
  join(intentDirPath, "stages", stageName, "state.json"),
  JSON.stringify(
    {
      stage: stageName,
      status: "active",
      phase: "elaborate",
      started_at: "2026-04-15T18:05:00Z",
      completed_at: null,
      gate_entered_at: null,
      gate_outcome: null,
      visits: 0,
    },
    null,
    2
  )
)

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
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}: ${e.message}`)
  }
}

function getTextResult(result) {
  return result.content[0].text
}

// ── Tests ──────────────────────────────────────────────────────────────────

try {
  // ── slugifyTitle ──────────────────────────────────────────────────────────

  console.log("\n=== slugifyTitle ===")

  test("basic slugification", () => {
    assert.strictEqual(slugifyTitle("Missing null check"), "missing-null-check")
  })

  test("collapses consecutive hyphens", () => {
    assert.strictEqual(
      slugifyTitle("Hello   World!!!   Test"),
      "hello-world-test"
    )
  })

  test("truncates to max length", () => {
    const long = "a".repeat(100)
    const result = slugifyTitle(long, 60)
    assert.ok(result.length <= 60)
  })

  test("strips trailing hyphens", () => {
    assert.strictEqual(slugifyTitle("test---"), "test")
  })

  // ── deriveAuthorType ─────────────────────────────────────────────────────

  console.log("\n=== deriveAuthorType ===")

  test("agent origins return agent", () => {
    assert.strictEqual(deriveAuthorType("agent"), "agent")
    assert.strictEqual(deriveAuthorType("adversarial-review"), "agent")
  })

  test("human origins return human", () => {
    assert.strictEqual(deriveAuthorType("user-visual"), "human")
    assert.strictEqual(deriveAuthorType("user-chat"), "human")
    assert.strictEqual(deriveAuthorType("external-pr"), "human")
    assert.strictEqual(deriveAuthorType("external-mr"), "human")
  })

  // ── writeFeedbackFile ────────────────────────────────────────────────────

  console.log("\n=== writeFeedbackFile ===")

  test("creates feedback file with correct frontmatter", () => {
    const result = writeFeedbackFile(intentSlug, stageName, {
      title: "Missing null check in handler",
      body: "The handler at line 42 does not check for null.",
      origin: "adversarial-review",
      author: "security-review-agent",
      source_ref: "https://github.com/org/repo/pull/42",
    })

    assert.strictEqual(result.feedback_id, "FB-01")
    assert.ok(result.file.includes("01-missing-null-check-in-handler.md"))

    const dir = feedbackDir(intentSlug, stageName)
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
    assert.strictEqual(files.length, 1)
    assert.ok(files[0].startsWith("01-"))

    // Verify frontmatter content
    const raw = readFileSync(join(dir, files[0]), "utf8")
    assert.ok(raw.includes("title: Missing null check in handler"))
    assert.ok(raw.includes("status: pending"))
    assert.ok(raw.includes("origin: adversarial-review"))
    assert.ok(raw.includes("author: security-review-agent"))
    assert.ok(raw.includes("author_type: agent"))
    assert.ok(raw.includes("visit: 0"))
    assert.ok(
      raw.includes("source_ref: 'https://github.com/org/repo/pull/42'") ||
      raw.includes("source_ref: \"https://github.com/org/repo/pull/42\"") ||
      raw.includes("source_ref: https://github.com/org/repo/pull/42"),
      `source_ref not found in frontmatter: ${raw.split("---")[1]}`
    )
    assert.ok(raw.includes("addressed_by: null"))
    assert.ok(raw.includes("The handler at line 42 does not check for null."))
  })

  test("auto-increments sequential numbering", () => {
    const result = writeFeedbackFile(intentSlug, stageName, {
      title: "Second feedback item",
      body: "Another finding.",
    })

    assert.strictEqual(result.feedback_id, "FB-02")
    assert.ok(result.file.includes("02-second-feedback-item.md"))
  })

  test("defaults origin to agent and author to agent", () => {
    const result = writeFeedbackFile(intentSlug, stageName, {
      title: "Third item with defaults",
      body: "Testing defaults.",
    })

    assert.strictEqual(result.feedback_id, "FB-03")

    const dir = feedbackDir(intentSlug, stageName)
    const file = readdirSync(dir)
      .filter((f) => f.startsWith("03-"))
      .pop()
    const raw = readFileSync(join(dir, file), "utf8")
    assert.ok(raw.includes("origin: agent"))
    assert.ok(raw.includes("author: agent"))
    assert.ok(raw.includes("author_type: agent"))
  })

  test("human origin sets correct author_type and default author", () => {
    const result = writeFeedbackFile(intentSlug, stageName, {
      title: "Visual issue from user",
      body: "Button overlaps.",
      origin: "user-visual",
    })

    assert.strictEqual(result.feedback_id, "FB-04")

    const dir = feedbackDir(intentSlug, stageName)
    const file = readdirSync(dir)
      .filter((f) => f.startsWith("04-"))
      .pop()
    const raw = readFileSync(join(dir, file), "utf8")
    assert.ok(raw.includes("origin: user-visual"))
    assert.ok(raw.includes("author: user"))
    assert.ok(raw.includes("author_type: human"))
  })

  test("auto-creates feedback directory if missing", () => {
    // Create a new stage without a feedback dir
    const newStage = "security"
    mkdirSync(join(intentDirPath, "stages", newStage), { recursive: true })
    writeFileSync(
      join(intentDirPath, "stages", newStage, "state.json"),
      JSON.stringify({ stage: newStage, status: "active", phase: "elaborate", visits: 2 }, null, 2)
    )

    const dir = feedbackDir(intentSlug, newStage)
    assert.ok(!existsSync(dir), "feedback dir should not exist yet")

    const result = writeFeedbackFile(intentSlug, newStage, {
      title: "Security finding",
      body: "XSS vulnerability found.",
    })

    assert.strictEqual(result.feedback_id, "FB-01")
    assert.ok(existsSync(dir), "feedback dir should be created")

    // Verify visit count is read from state.json
    const file = readdirSync(dir).filter((f) => f.endsWith(".md"))[0]
    const raw = readFileSync(join(dir, file), "utf8")
    assert.ok(raw.includes("visit: 2"))
  })

  // ── readFeedbackFiles ────────────────────────────────────────────────────

  console.log("\n=== readFeedbackFiles ===")

  test("returns all parsed feedback items sorted by number", () => {
    const items = readFeedbackFiles(intentSlug, stageName)
    assert.strictEqual(items.length, 4)
    assert.strictEqual(items[0].id, "FB-01")
    assert.strictEqual(items[1].id, "FB-02")
    assert.strictEqual(items[2].id, "FB-03")
    assert.strictEqual(items[3].id, "FB-04")
  })

  test("parsed items have all expected fields", () => {
    const items = readFeedbackFiles(intentSlug, stageName)
    const first = items[0]
    assert.strictEqual(first.title, "Missing null check in handler")
    assert.strictEqual(first.status, "pending")
    assert.strictEqual(first.origin, "adversarial-review")
    assert.strictEqual(first.author, "security-review-agent")
    assert.strictEqual(first.author_type, "agent")
    assert.strictEqual(first.visit, 0)
    assert.ok(first.body.includes("The handler at line 42"))
    assert.ok(first.file.includes("feedback/01-"))
  })

  test("returns empty array for nonexistent directory", () => {
    const items = readFeedbackFiles(intentSlug, "nonexistent-stage")
    assert.deepStrictEqual(items, [])
  })

  // ── countPendingFeedback ─────────────────────────────────────────────────

  console.log("\n=== countPendingFeedback ===")

  test("counts all pending items", () => {
    const count = countPendingFeedback(intentSlug, stageName)
    assert.strictEqual(count, 4) // all 4 items are pending
  })

  test("returns 0 for empty stage", () => {
    const count = countPendingFeedback(intentSlug, "nonexistent-stage")
    assert.strictEqual(count, 0)
  })

  // ── findFeedbackFile ─────────────────────────────────────────────────────

  console.log("\n=== findFeedbackFile ===")

  test("finds by FB-NN identifier", () => {
    const found = findFeedbackFile(intentSlug, stageName, "FB-01")
    assert.ok(found)
    assert.ok(found.filename.startsWith("01-"))
    assert.strictEqual(found.data.title, "Missing null check in handler")
  })

  test("finds by bare numeric prefix", () => {
    const found = findFeedbackFile(intentSlug, stageName, "02")
    assert.ok(found)
    assert.ok(found.filename.startsWith("02-"))
  })

  test("returns null for nonexistent id", () => {
    const found = findFeedbackFile(intentSlug, stageName, "FB-99")
    assert.strictEqual(found, null)
  })

  // ── updateFeedbackFile ───────────────────────────────────────────────────

  console.log("\n=== updateFeedbackFile ===")

  test("updates status field", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-01", {
      status: "addressed",
    })
    assert.ok(result.ok)
    if (result.ok) {
      assert.deepStrictEqual(result.updated_fields, ["status"])
    }

    const found = findFeedbackFile(intentSlug, stageName, "FB-01")
    assert.strictEqual(found.data.status, "addressed")
  })

  test("updates addressed_by field", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-02", {
      addressed_by: "unit-05-fix-null",
    })
    assert.ok(result.ok)
    if (result.ok) {
      assert.deepStrictEqual(result.updated_fields, ["addressed_by"])
    }

    const found = findFeedbackFile(intentSlug, stageName, "FB-02")
    assert.strictEqual(found.data.addressed_by, "unit-05-fix-null")
  })

  test("updates multiple fields at once", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-03", {
      status: "addressed",
      addressed_by: "unit-06-defaults",
    })
    assert.ok(result.ok)
    if (result.ok) {
      assert.ok(result.updated_fields.includes("status"))
      assert.ok(result.updated_fields.includes("addressed_by"))
    }
  })

  test("rejects when no updatable fields provided", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-01", {})
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("at least one"))
    }
  })

  test("rejects invalid status enum", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-01", {
      status: "invalid-status",
    })
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("status must be one of"))
    }
  })

  test("rejects nonexistent feedback id", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-99", {
      status: "addressed",
    })
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("not found"))
    }
  })

  test("agent cannot close human-authored feedback", () => {
    // FB-04 is human-authored (origin: user-visual)
    const result = updateFeedbackFile(
      intentSlug,
      stageName,
      "FB-04",
      { status: "closed" },
      "agent"
    )
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("agents cannot set status"))
    }
  })

  test("human can close human-authored feedback", () => {
    const result = updateFeedbackFile(
      intentSlug,
      stageName,
      "FB-04",
      { status: "closed" },
      "human"
    )
    assert.ok(result.ok)
  })

  // ── deleteFeedbackFile ───────────────────────────────────────────────────

  console.log("\n=== deleteFeedbackFile ===")

  test("cannot delete pending feedback", () => {
    // FB-02 was updated to have addressed_by but its status is still pending
    // Let's make sure FB-02 is pending first
    updateFeedbackFile(intentSlug, stageName, "FB-02", { status: "pending" })
    const result = deleteFeedbackFile(intentSlug, stageName, "FB-02")
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("cannot delete pending"))
    }
  })

  test("agent cannot delete human-authored feedback", () => {
    // FB-04 has been closed, but it's human-authored
    const result = deleteFeedbackFile(intentSlug, stageName, "FB-04", "agent")
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("agents cannot delete human-authored"))
    }
  })

  test("human can delete non-pending human-authored feedback", () => {
    // FB-04 is closed and human-authored
    const result = deleteFeedbackFile(intentSlug, stageName, "FB-04", "human")
    assert.ok(result.ok)

    // Verify file is gone
    const found = findFeedbackFile(intentSlug, stageName, "FB-04")
    assert.strictEqual(found, null)
  })

  test("deletes addressed agent-authored feedback", () => {
    // FB-01 was set to addressed earlier
    const result = deleteFeedbackFile(intentSlug, stageName, "FB-01", "agent")
    assert.ok(result.ok)

    const found = findFeedbackFile(intentSlug, stageName, "FB-01")
    assert.strictEqual(found, null)
  })

  test("returns error for nonexistent feedback id", () => {
    const result = deleteFeedbackFile(intentSlug, stageName, "FB-99")
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("not found"))
    }
  })

  // ── countPendingFeedback after mutations ─────────────────────────────────

  console.log("\n=== countPendingFeedback after mutations ===")

  test("count reflects deletions and status changes", () => {
    // FB-01: deleted, FB-02: pending, FB-03: addressed, FB-04: deleted
    const count = countPendingFeedback(intentSlug, stageName)
    assert.strictEqual(count, 1) // only FB-02 remains pending
  })

  // ── haiku_feedback MCP tool (end-to-end) ─────────────────────────────────

  console.log("\n=== haiku_feedback MCP tool ===")

  test("creates feedback via MCP tool", () => {
    // After deletions: FB-01 deleted, FB-04 deleted. Remaining: FB-02, FB-03.
    // Highest prefix is 03, so next number is 04.
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: stageName,
      title: "MCP test feedback",
      body: "Created via the MCP tool.",
      origin: "agent",
    })

    assert.ok(!result.isError, `Expected success, got error: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.feedback_id, "FB-04")
    assert.strictEqual(parsed.status, "pending")
    assert.ok(parsed.file.includes("04-mcp-test-feedback.md"))
    assert.ok(parsed.message.includes("FB-04 created"))
  })

  test("MCP tool rejects missing intent", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: "",
      stage: stageName,
      title: "Test",
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("intent is required"))
  })

  test("MCP tool rejects missing stage", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: "",
      title: "Test",
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("stage is required"))
  })

  test("MCP tool rejects missing title", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: stageName,
      title: "",
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("title is required"))
  })

  test("MCP tool rejects missing body", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: stageName,
      title: "Test",
      body: "",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("body is required"))
  })

  test("MCP tool rejects title over 120 chars", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: stageName,
      title: "x".repeat(121),
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("120 characters"))
  })

  test("MCP tool rejects nonexistent intent", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: "nonexistent-intent",
      stage: stageName,
      title: "Test",
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("intent 'nonexistent-intent' not found"))
  })

  test("MCP tool rejects invalid origin", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: stageName,
      title: "Test",
      body: "Test",
      origin: "invalid-origin",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("origin must be one of"))
  })

  test("MCP tool rejects nonexistent stage", () => {
    const result = handleStateTool("haiku_feedback", {
      intent: intentSlug,
      stage: "nonexistent-stage",
      title: "Test",
      body: "Test",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("stage 'nonexistent-stage' not found"))
  })

  test("MCP tool accepts all valid origins", () => {
    for (const origin of FEEDBACK_ORIGINS) {
      const result = handleStateTool("haiku_feedback", {
        intent: intentSlug,
        stage: stageName,
        title: `Origin test ${origin}`,
        body: "Testing origin.",
        origin,
      })
      assert.ok(
        !result.isError,
        `Origin '${origin}' should be valid but got error: ${getTextResult(result)}`
      )
    }
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
  process.exit(failed > 0 ? 1 : 0)
}
