#!/usr/bin/env npx tsx
// Test suite: askVisualQuestionMcpApps (unit-04)
// Covers: ask_user_visual_question MCP Apps branch — round-trips, timeout, _meta
// Run: npx tsx test/ask-visual-question-mcp-apps.test.mjs

import assert from "node:assert"
import { readFileSync } from "node:fs"
import { setTimeout as delay } from "node:timers/promises"

import {
  createQuestionSession,
  getSession,
  listSessions,
  updateQuestionSession,
} from "../src/sessions.ts"
import { setMcpServerInstance, hostSupportsMcpApps } from "../src/state-tools.ts"
import { REVIEW_RESOURCE_URI } from "../src/ui-resource.ts"
import { askVisualQuestionMcpApps } from "../src/ask-visual-question-mcp-apps.ts"

// ── Test infrastructure ────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === "function") {
      throw new Error("Use testAsync() for async tests")
    }
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}: ${e.message}`)
    if (process.env.DEBUG_TESTS) console.error(e)
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
    if (process.env.DEBUG_TESTS) console.error(e)
  }
}

function makeServer(opts = {}) {
  const { caps = undefined } = opts
  return {
    getClientCapabilities() { return caps },
    async listRoots() { return { roots: [] } },
    async elicitInput() { throw new Error("elicitInput not configured in stub") },
  }
}

function makeMcpAppsServer() {
  return makeServer({ caps: { experimental: { apps: {} } } })
}

// ── Structural guarantee ───────────────────────────────────────────────────

function assertNoHttpImports() {
  const src = readFileSync(
    new URL("../src/ask-visual-question-mcp-apps.ts", import.meta.url),
    "utf8",
  )
  if (/from\s+["']\.\/http\.js["']/.test(src)) {
    throw new Error("ask-visual-question-mcp-apps.ts imports ./http.js — MCP Apps arm must not touch HTTP")
  }
  if (/from\s+["']\.\/tunnel\.js["']/.test(src)) {
    throw new Error("ask-visual-question-mcp-apps.ts imports ./tunnel.js — MCP Apps arm must not touch tunnel")
  }
  if (/from\s+["']node:child_process["']/.test(src)) {
    throw new Error("ask-visual-question-mcp-apps.ts imports node:child_process — MCP Apps arm must not spawn processes")
  }
}

// ── Group A: Structural guarantee ─────────────────────────────────────────

console.log("\n=== Group A: Structural guarantee — no http/tunnel/child_process imports ===")

test("ask-visual-question-mcp-apps.ts does NOT import http.js / tunnel.js / child_process", () => {
  assertNoHttpImports()
})

// ── Group B: Round-trip — answers submitted resolve the arm ───────────────

console.log("\n=== Group B: Round-trip — answers submitted resolve the arm ===")

await testAsync("round-trip: answers submitted via updateQuestionSession resolve the arm", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  assert.ok(hostSupportsMcpApps(), "precondition: MCP Apps mode must be active")

  const idsBefore = new Set(listSessions().map((s) => s.session_id))
  let capturedMeta = undefined

  const armPromise = askVisualQuestionMcpApps({
    title: "Pick a color",
    questions: [{ question: "What color?", options: ["Red", "Blue", "Green"] }],
    context: "Pick one",
    imagePaths: [],
    imageBaseDirs: [],
    signal: undefined,
    setQuestionResultMeta: (m) => { capturedMeta = m },
  })

  // Discover the created session
  let newSession = null
  for (let i = 0; i < 200; i++) {
    await delay(5)
    const current = listSessions()
    newSession = current.find(
      (s) => !idsBefore.has(s.session_id) && s.session_type === "question",
    )
    if (newSession) break
  }
  assert.ok(newSession, "askVisualQuestionMcpApps should have created a new session")
  assert.ok(capturedMeta, "setQuestionResultMeta must be called before the arm awaits")
  assert.strictEqual(capturedMeta.ui.resourceUri, REVIEW_RESOURCE_URI)

  // Submit answers to unblock the arm
  updateQuestionSession(newSession.session_id, {
    status: "answered",
    answers: [{ question: "What color?", selectedOptions: ["Red"] }],
    feedback: "Nice!",
  })

  const result = await armPromise
  assert.strictEqual(result.status, "answered")
  assert.deepStrictEqual(result.answers, [{ question: "What color?", selectedOptions: ["Red"] }])
  assert.strictEqual(result.feedback, "Nice!")
})

await testAsync("round-trip: multiple questions, multiple answers", async () => {
  const idsBefore = new Set(listSessions().map((s) => s.session_id))

  const armPromise = askVisualQuestionMcpApps({
    title: "Survey",
    questions: [
      { question: "Q1?", options: ["A", "B"] },
      { question: "Q2?", options: ["X", "Y"], multiSelect: true },
    ],
    context: "",
    imagePaths: [],
    imageBaseDirs: [],
    signal: undefined,
    setQuestionResultMeta: () => {},
  })

  let newSession = null
  for (let i = 0; i < 200; i++) {
    await delay(5)
    const current = listSessions()
    newSession = current.find(
      (s) => !idsBefore.has(s.session_id) && s.session_type === "question",
    )
    if (newSession) break
  }
  assert.ok(newSession)

  updateQuestionSession(newSession.session_id, {
    status: "answered",
    answers: [
      { question: "Q1?", selectedOptions: ["A"] },
      { question: "Q2?", selectedOptions: ["X", "Y"] },
    ],
    feedback: "",
  })

  const result = await armPromise
  assert.strictEqual(result.status, "answered")
  assert.strictEqual(result.answers.length, 2)
  assert.deepStrictEqual(result.answers[1].selectedOptions, ["X", "Y"])
  // Empty feedback should not appear in result
  assert.strictEqual(result.feedback, undefined)
})

await testAsync("round-trip: annotations included when present", async () => {
  const idsBefore = new Set(listSessions().map((s) => s.session_id))

  const armPromise = askVisualQuestionMcpApps({
    title: "Annotated Q",
    questions: [{ question: "Q?", options: ["A"] }],
    context: "",
    imagePaths: [],
    imageBaseDirs: [],
    signal: undefined,
    setQuestionResultMeta: () => {},
  })

  let newSession = null
  for (let i = 0; i < 200; i++) {
    await delay(5)
    const current = listSessions()
    newSession = current.find(
      (s) => !idsBefore.has(s.session_id) && s.session_type === "question",
    )
    if (newSession) break
  }
  assert.ok(newSession)

  updateQuestionSession(newSession.session_id, {
    status: "answered",
    answers: [{ question: "Q?", selectedOptions: ["A"] }],
    feedback: "",
    annotations: { comments: [{ selectedText: "text", comment: "note", paragraph: 1 }] },
  })

  const result = await armPromise
  assert.ok(result.annotations, "annotations should be present")
  assert.strictEqual(result.annotations.comments.length, 1)
})

// ── Group C: V5-10 timeout fallback ───────────────────────────────────────

console.log("\n=== Group C: V5-10 host-timeout fallback ===")

await testAsync("AbortSignal.abort() returns synthetic timeout payload", async () => {
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 100)

  const result = await askVisualQuestionMcpApps({
    title: "Should timeout",
    questions: [{ question: "Q?", options: ["A"] }],
    context: "",
    imagePaths: [],
    imageBaseDirs: [],
    signal: controller.signal,
    setQuestionResultMeta: () => {},
  })

  clearTimeout(abortTimer)

  assert.strictEqual(result.status, "timeout")
  assert.deepStrictEqual(result.answers, [])
  assert.strictEqual(result.feedback, "Question timed out")
})

await testAsync("pre-aborted signal returns timeout immediately", async () => {
  const controller = new AbortController()
  controller.abort() // already aborted

  const result = await askVisualQuestionMcpApps({
    title: "Pre-aborted",
    questions: [{ question: "Q?", options: ["A"] }],
    context: "",
    imagePaths: [],
    imageBaseDirs: [],
    signal: controller.signal,
    setQuestionResultMeta: () => {},
  })

  assert.strictEqual(result.status, "timeout")
  assert.deepStrictEqual(result.answers, [])
})

// ── Group D: _meta.ui.resourceUri set before await ────────────────────────

console.log("\n=== Group D: _meta.ui.resourceUri set before await ===")

await testAsync("setQuestionResultMeta called with correct URI before arm awaits", async () => {
  const idsBefore = new Set(listSessions().map((s) => s.session_id))
  let metaCallCount = 0
  let capturedUri = null

  const armPromise = askVisualQuestionMcpApps({
    title: "Meta test",
    questions: [{ question: "Q?", options: ["A"] }],
    context: "",
    imagePaths: [],
    imageBaseDirs: [],
    signal: undefined,
    setQuestionResultMeta: (m) => {
      metaCallCount++
      capturedUri = m.ui.resourceUri
    },
  })

  // Wait for session to appear — meta must be set by this point
  let newSession = null
  for (let i = 0; i < 200; i++) {
    await delay(5)
    const current = listSessions()
    newSession = current.find(
      (s) => !idsBefore.has(s.session_id) && s.session_type === "question",
    )
    if (newSession) break
  }
  assert.ok(newSession)
  assert.strictEqual(metaCallCount, 1, "setQuestionResultMeta must be called exactly once")
  assert.strictEqual(capturedUri, REVIEW_RESOURCE_URI)

  // Clean up by submitting
  updateQuestionSession(newSession.session_id, {
    status: "answered",
    answers: [{ question: "Q?", selectedOptions: ["A"] }],
    feedback: "",
  })
  await armPromise
})

// ── Group E: No HTTP/tunnel imports (structural) ──────────────────────────
// Covered by Group A structural test

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
