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
    assert.ok(raw.includes("closed_by: null"))
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

  test("updates closed_by field", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-02", {
      closed_by: "unit-05-fix-null",
    })
    assert.ok(result.ok)
    if (result.ok) {
      assert.deepStrictEqual(result.updated_fields, ["closed_by"])
    }

    const found = findFeedbackFile(intentSlug, stageName, "FB-02")
    assert.strictEqual(found.data.closed_by, "unit-05-fix-null")
  })

  test("updates multiple fields at once", () => {
    const result = updateFeedbackFile(intentSlug, stageName, "FB-03", {
      status: "addressed",
      closed_by: "unit-06-defaults",
    })
    assert.ok(result.ok)
    if (result.ok) {
      assert.ok(result.updated_fields.includes("status"))
      assert.ok(result.updated_fields.includes("closed_by"))
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
    // FB-04 is human-authored (origin: user-visual).
    // Agents close via `closed_by`; the FSM forbids setting it on
    // human-authored items.
    const result = updateFeedbackFile(
      intentSlug,
      stageName,
      "FB-04",
      { closed_by: "unit-05-fix-null" },
      "agent"
    )
    assert.ok(!result.ok)
    if (!result.ok) {
      assert.ok(result.error.includes("agents cannot close human-authored feedback"))
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
    // FB-02 was updated to have closed_by but its status is still pending
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
    // FB-01: deleted. FB-02: status=pending but closed_by set → counted
    // resolved because any closed_by signals closure. FB-03: status=addressed
    // (also resolved). FB-04: deleted. No pending items remain.
    const count = countPendingFeedback(intentSlug, stageName)
    assert.strictEqual(count, 0)
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

  // ── haiku_feedback_update MCP tool ────────────────────────────────────────

  console.log("\n=== haiku_feedback_update MCP tool ===")

  test("updates status via MCP tool", () => {
    // FB-02 is pending. Set it to addressed.
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-02",
      status: "addressed",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.feedback_id, "FB-02")
    assert.deepStrictEqual(parsed.updated_fields, ["status"])
    assert.ok(parsed.message.includes("FB-02 updated"))

    // Verify on disk
    const found = findFeedbackFile(intentSlug, stageName, "FB-02")
    assert.strictEqual(found.data.status, "addressed")
  })

  test("updates closed_by via MCP tool", () => {
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-02",
      closed_by: "unit-99-mcp-fix",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.ok(parsed.updated_fields.includes("closed_by"))

    const found = findFeedbackFile(intentSlug, stageName, "FB-02")
    assert.strictEqual(found.data.closed_by, "unit-99-mcp-fix")
  })

  test("MCP update rejects missing feedback_id", () => {
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "",
      status: "addressed",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("feedback_id is required"))
  })

  test("MCP update rejects no updatable fields", () => {
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-02",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("at least one"))
  })

  test("MCP update rejects invalid status", () => {
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-02",
      status: "bogus",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("status must be one of"))
  })

  test("MCP update rejects nonexistent feedback", () => {
    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-99",
      status: "addressed",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("not found"))
  })

  test("MCP update: agent cannot close human-authored feedback", () => {
    // Create a human-authored item for testing
    writeFeedbackFile(intentSlug, stageName, {
      title: "Human item for update guard test",
      body: "Human authored.",
      origin: "user-visual",
    })
    // Find the last item created (highest number)
    const items = readFeedbackFiles(intentSlug, stageName)
    const humanItem = items.find((i) => i.title === "Human item for update guard test")
    assert.ok(humanItem, "Expected human item to exist")

    const result = handleStateTool("haiku_feedback_update", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: humanItem.id,
      closed_by: "unit-99-fix",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("agents cannot close human-authored feedback"))
  })

  // ── haiku_feedback_delete MCP tool ──────────────────────────────────────

  console.log("\n=== haiku_feedback_delete MCP tool ===")

  test("MCP delete rejects pending feedback", () => {
    // FB-04 is pending (from the MCP create test)
    const result = handleStateTool("haiku_feedback_delete", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-04",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("cannot delete pending"))
  })

  test("MCP delete rejects human-authored feedback (agent context)", () => {
    // The human item we created above — mark it addressed first so pending guard passes
    const items = readFeedbackFiles(intentSlug, stageName)
    const humanItem = items.find((i) => i.title === "Human item for update guard test")
    updateFeedbackFile(intentSlug, stageName, humanItem.id, { status: "addressed" }, "human")

    const result = handleStateTool("haiku_feedback_delete", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: humanItem.id,
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("agents cannot delete human-authored"))
  })

  test("MCP delete removes addressed agent-authored feedback", () => {
    // FB-02 is addressed and agent-authored
    const result = handleStateTool("haiku_feedback_delete", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-02",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.feedback_id, "FB-02")
    assert.strictEqual(parsed.deleted, true)
    assert.ok(parsed.message.includes("FB-02 deleted"))

    // Verify file is gone
    const found = findFeedbackFile(intentSlug, stageName, "FB-02")
    assert.strictEqual(found, null)
  })

  test("MCP delete rejects nonexistent feedback", () => {
    const result = handleStateTool("haiku_feedback_delete", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-99",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("not found"))
  })

  test("MCP delete rejects missing feedback_id", () => {
    const result = handleStateTool("haiku_feedback_delete", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("feedback_id is required"))
  })

  // ── haiku_feedback_reject MCP tool ──────────────────────────────────────

  console.log("\n=== haiku_feedback_reject MCP tool ===")

  test("rejects agent-authored feedback with reason", () => {
    // FB-04 is pending, agent-authored
    const result = handleStateTool("haiku_feedback_reject", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-04",
      reason: "False positive -- already handled",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.feedback_id, "FB-04")
    assert.strictEqual(parsed.status, "rejected")
    assert.ok(parsed.message.includes("FB-04 rejected"))
    assert.ok(parsed.message.includes("False positive"))

    // Verify on disk
    const found = findFeedbackFile(intentSlug, stageName, "FB-04")
    assert.strictEqual(found.data.status, "rejected")
    assert.ok(found.body.includes("**Rejection reason:** False positive -- already handled"))
  })

  test("MCP reject fails on human-authored feedback", () => {
    const items = readFeedbackFiles(intentSlug, stageName)
    const humanItem = items.find((i) => i.author_type === "human")
    assert.ok(humanItem, "Expected a human-authored item")

    const result = handleStateTool("haiku_feedback_reject", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: humanItem.id,
      reason: "Should not work",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("agents cannot reject human-authored"))
  })

  test("MCP reject fails on already rejected feedback", () => {
    // FB-04 was just rejected
    const result = handleStateTool("haiku_feedback_reject", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-04",
      reason: "Double reject",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("already 'rejected'"))
  })

  test("MCP reject fails without reason", () => {
    // Create a new agent item to test this
    writeFeedbackFile(intentSlug, stageName, {
      title: "Agent item for reject reason test",
      body: "Test body.",
    })
    const items = readFeedbackFiles(intentSlug, stageName)
    const newItem = items.find((i) => i.title === "Agent item for reject reason test")

    const result = handleStateTool("haiku_feedback_reject", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: newItem.id,
      reason: "",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("reason is required"))
  })

  test("MCP reject fails for nonexistent feedback", () => {
    const result = handleStateTool("haiku_feedback_reject", {
      intent: intentSlug,
      stage: stageName,
      feedback_id: "FB-99",
      reason: "Does not exist",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("not found"))
  })

  // ── haiku_feedback_list MCP tool ────────────────────────────────────────

  console.log("\n=== haiku_feedback_list MCP tool ===")

  test("lists all feedback for a specific stage", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: intentSlug,
      stage: stageName,
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.intent, intentSlug)
    assert.strictEqual(parsed.stage, stageName)
    assert.ok(parsed.count > 0, "Expected at least some items")
    assert.ok(Array.isArray(parsed.items))

    // Each item should have expected fields
    const first = parsed.items[0]
    assert.ok(first.feedback_id)
    assert.ok(first.title)
    assert.ok(first.status)
    assert.ok(first.origin)
    assert.ok(first.author)
    assert.ok(first.author_type)
  })

  test("lists feedback filtered by status", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: intentSlug,
      stage: stageName,
      status: "pending",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    for (const item of parsed.items) {
      assert.strictEqual(item.status, "pending", `Expected pending, got ${item.status}`)
    }
  })

  test("lists feedback across all stages", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: intentSlug,
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.stage, null)
    assert.ok(parsed.count > 0)

    // Cross-stage items should include a 'stage' field
    const hasStageField = parsed.items.some((i) => i.stage !== undefined)
    assert.ok(hasStageField, "Cross-stage listing should include stage field on items")
  })

  test("returns empty when no matching feedback", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: intentSlug,
      stage: stageName,
      status: "closed",
    })
    assert.ok(!result.isError, `Expected success, got: ${getTextResult(result)}`)
    const parsed = JSON.parse(getTextResult(result))
    assert.strictEqual(parsed.count, 0)
    assert.deepStrictEqual(parsed.items, [])
  })

  test("MCP list rejects nonexistent intent", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: "nonexistent-intent",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("intent 'nonexistent-intent' not found"))
  })

  test("MCP list rejects invalid status filter", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: intentSlug,
      status: "bogus",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("status must be one of"))
  })

  test("MCP list rejects missing intent", () => {
    const result = handleStateTool("haiku_feedback_list", {
      intent: "",
    })
    assert.ok(result.isError)
    assert.ok(getTextResult(result).includes("intent is required"))
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
  process.chdir(origCwd)
  rmSync(tmp, { recursive: true })
  process.exit(failed > 0 ? 1 : 0)
}
