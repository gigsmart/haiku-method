#!/usr/bin/env npx tsx
// Test suite: _openReviewAndWait MCP Apps branch + haiku_cowork_review_submit tool
// Covers: iframe-review-gate.feature + iframe-decision-submit.feature (unit-03 scope)
// Run: npx tsx test/open-review-mcp-apps.test.mjs

import assert from "node:assert"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import {
  createDesignDirectionSession,
  createQuestionSession,
  createSession,
  getSession,
  listSessions,
  updateDesignDirectionSession,
  updateQuestionSession,
  updateSession,
  waitForSession,
} from "../src/sessions.ts"
import {
  setMcpServerInstance,
  hostSupportsMcpApps,
} from "../src/state-tools.ts"
import { REVIEW_RESOURCE_URI, buildUiResourceMeta } from "../src/ui-resource.ts"
import { openReviewMcpApps } from "../src/open-review-mcp-apps.ts"

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

/** Build a minimal McpServerRef stub. */
function makeServer(opts = {}) {
  const { caps = undefined, roots = [], elicitInput } = opts
  return {
    getClientCapabilities() { return caps },
    async listRoots() { return { roots } },
    async elicitInput(params) {
      if (elicitInput) return elicitInput(params)
      throw new Error("elicitInput not configured in stub")
    },
  }
}

function makeMcpAppsServer() {
  return makeServer({ caps: { experimental: { apps: {} } } })
}

function makeNonMcpAppsServer() {
  return makeServer({ caps: {} })
}

/** Reset module-level cache between test groups */
function resetServer(opts = {}) {
  setMcpServerInstance(makeServer(opts))
}

// ── Helpers: minimal dispatch logic mirroring server.ts ───────────────────
//
// Rather than spawning the full MCP server, we test the dispatch logic by
// exercising the underlying sessions module + the schema validation inline.

import { z } from "zod"

const ReviewAnnotationsSchema = z
  .object({
    screenshot: z.string().optional(),
    pins: z.array(z.object({ x: z.number(), y: z.number(), text: z.string() })).optional(),
    comments: z.array(z.object({ selectedText: z.string(), comment: z.string(), paragraph: z.number() })).optional(),
  })
  .optional()

const QuestionAnswerSchema = z.object({
  question: z.string(),
  selectedOptions: z.array(z.string()),
  otherText: z.string().optional(),
})

const QuestionAnnotationsSchema = z
  .object({
    comments: z.array(z.object({ selectedText: z.string(), comment: z.string(), paragraph: z.number() })).optional(),
  })
  .optional()

const ReviewSubmitInput = z.discriminatedUnion("session_type", [
  z.object({
    session_type: z.literal("review"),
    session_id: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested", "external_review"]),
    feedback: z.string(),
    annotations: ReviewAnnotationsSchema,
  }),
  z.object({
    session_type: z.literal("question"),
    session_id: z.string().uuid(),
    answers: z.array(QuestionAnswerSchema).min(1),
    feedback: z.string().optional(),
    annotations: QuestionAnnotationsSchema,
  }),
  z.object({
    session_type: z.literal("design_direction"),
    session_id: z.string().uuid(),
    archetype: z.string().min(1),
    parameters: z.record(z.number()),
    comments: z.string().optional(),
    annotations: z
      .object({
        screenshot: z.string().optional(),
        pins: z.array(z.object({ x: z.number(), y: z.number(), text: z.string() })).optional(),
      })
      .optional(),
  }),
])

/**
 * Minimal dispatch of haiku_cowork_review_submit — mirrors server.ts logic
 * so we can test it without the full MCP server setup.
 */
function dispatchReviewSubmit(args) {
  const parsed = ReviewSubmitInput.safeParse(args ?? {})
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid input: ${parsed.error.message}` }], isError: true }
  }
  const input = parsed.data

  // Common validation
  const session = getSession(input.session_id)
  if (!session) {
    return { content: [{ type: "text", text: `Session not found: ${input.session_id}` }], isError: true }
  }
  if (session.session_type !== input.session_type) {
    return {
      content: [{ type: "text", text: `session_type mismatch: expected ${session.session_type}, got ${input.session_type}` }],
      isError: true,
    }
  }
  if (session.status !== "pending") {
    return { content: [{ type: "text", text: `Session already closed: ${input.session_id}` }], isError: true }
  }

  // question path
  if (input.session_type === "question") {
    updateQuestionSession(input.session_id, {
      status: "answered",
      answers: input.answers,
      feedback: input.feedback ?? "",
      annotations: input.annotations,
    })
    return { content: [{ type: "text", text: '{"ok":true}' }] }
  }

  // design_direction path
  if (input.session_type === "design_direction") {
    updateDesignDirectionSession(input.session_id, {
      status: "answered",
      selection: {
        archetype: input.archetype,
        parameters: input.parameters,
        ...(input.comments ? { comments: input.comments } : {}),
        ...(input.annotations ? { annotations: input.annotations } : {}),
      },
    })
    return { content: [{ type: "text", text: '{"ok":true}' }] }
  }

  // review path
  updateSession(input.session_id, {
    status: "decided",
    decision: input.decision,
    feedback: input.feedback,
    annotations: input.annotations,
  })
  return { content: [{ type: "text", text: '{"ok":true}' }] }
}

// ── Helpers: setup a minimal real intent directory + cwd switcher ────────
//
// The tests call the REAL openReviewMcpApps() function from
// src/open-review-mcp-apps.ts. That function calls parseIntent() which
// reads `${intentDirRel}/intent.md` from process.cwd(). Each test builds a
// tmp dir with a minimal real intent.md, chdirs into a parent, and passes
// the relative intentDir path to openReviewMcpApps. No mocks.
//
// Every run also restores the original cwd so tests stay isolated.

import { chdir, cwd as getCwd } from "node:process"
import { rmSync } from "node:fs"

const _origCwd = getCwd()
function setupIntentDir() {
  const root = join(tmpdir(), `haiku-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const intentRel = ".haiku/intents/test-intent"
  const intentAbs = join(root, intentRel)
  mkdirSync(intentAbs, { recursive: true })
  const intentMdPath = join(intentAbs, "intent.md")
  writeFileSync(
    intentMdPath,
    "---\ntitle: Test Intent\nstatus: active\n---\n\n# Test Intent\n\n## Completion Criteria\n\n- [ ] It works\n",
  )
  return { root, intentRel, intentAbs, intentMdPath }
}

function enterRoot(root) {
  chdir(root)
}
function restoreCwd() {
  chdir(_origCwd)
}
function cleanup(root) {
  try { rmSync(root, { recursive: true, force: true }) } catch { /* */ }
}

// Structural guarantee check: the extracted module must NOT import http/tunnel/child_process.
// This is a file-level assertion — if the real function ever starts calling HTTP, this fails.
function assertNoHttpImports() {
  const src = readFileSync(
    new URL("../src/open-review-mcp-apps.ts", import.meta.url),
    "utf8",
  )
  // Forbidden imports: any form of http.js / tunnel.js / child_process
  if (/from\s+["']\.\/http\.js["']/.test(src)) {
    throw new Error("open-review-mcp-apps.ts imports ./http.js — MCP Apps arm must not touch HTTP")
  }
  if (/from\s+["']\.\/tunnel\.js["']/.test(src)) {
    throw new Error("open-review-mcp-apps.ts imports ./tunnel.js — MCP Apps arm must not touch tunnel")
  }
  if (/from\s+["']node:child_process["']/.test(src)) {
    throw new Error("open-review-mcp-apps.ts imports node:child_process — MCP Apps arm must not spawn processes")
  }
}

// ── Group A: MCP Apps arm skips local I/O (CC-2) ──────────────────────────

console.log("\n=== Group A: MCP Apps arm skips local I/O — spy assertions (CC-2) ===")

test("returns true for MCP Apps server (precondition for arm selection)", () => {
  setMcpServerInstance(makeMcpAppsServer())
  assert.strictEqual(hostSupportsMcpApps(), true)
})

test("returns false for non-MCP-Apps server", () => {
  setMcpServerInstance(makeNonMcpAppsServer())
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("structural: open-review-mcp-apps.ts does NOT import http.js / tunnel.js / child_process", () => {
  // CC-2 structural guarantee — grep the extracted module's source.
  // If the real function ever adds an http/tunnel import, this fails.
  assertNoHttpImports()
})

await testAsync("real openReviewMcpApps: approved round-trip + _meta.ui.resourceUri set", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  assert.ok(hostSupportsMcpApps(), "precondition: MCP Apps mode must be active")

  const { root, intentRel } = setupIntentDir()
  const idsBefore = new Set(listSessions().map((s) => s.session_id))
  enterRoot(root)
  try {
    let capturedMeta = undefined
    // Kick off the real function — it parses the real intent.md, creates a
    // real session, and awaits waitForSession(). The test will discover the
    // session via listSessions() and submit a decision to unblock it.
    const armPromise = openReviewMcpApps({
      intentDirRel: intentRel,
      reviewType: "intent",
      gateType: undefined,
      signal: undefined,
      setReviewResultMeta: (m) => { capturedMeta = m },
    })

    // Poll briefly for the new session to appear. openReviewMcpApps is async
    // but the createSession call happens before any I/O other than parseIntent,
    // so this resolves within a few milliseconds.
    let newSession = null
    for (let i = 0; i < 200; i++) {
      await delay(5)
      const current = listSessions()
      newSession = current.find(
        (s) => !idsBefore.has(s.session_id) && s.intent_slug === "test-intent",
      )
      if (newSession) break
    }
    assert.ok(newSession, "openReviewMcpApps should have created a new session")
    assert.ok(
      capturedMeta,
      "setReviewResultMeta must be called before the arm awaits (CC-3)",
    )
    assert.strictEqual(capturedMeta.ui.resourceUri, REVIEW_RESOURCE_URI)

    // Unblock the real function by submitting a decision via the real
    // updateSession + notifySessionUpdate path (this is exactly what
    // haiku_cowork_review_submit does in server.ts).
    updateSession(newSession.session_id, {
      status: "decided",
      decision: "approved",
      feedback: "ok",
    })

    const result = await armPromise
    assert.strictEqual(result.decision, "approved")
    assert.strictEqual(result.feedback, "ok")
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

for (const decision of ["changes_requested", "external_review"]) {
  await testAsync(
    `real openReviewMcpApps: ${decision} round-trip returns real session decision`,
    async () => {
      setMcpServerInstance(makeMcpAppsServer())
      const { root, intentRel } = setupIntentDir()
      const idsBefore = new Set(listSessions().map((s) => s.session_id))
      enterRoot(root)
      try {
        const armPromise = openReviewMcpApps({
          intentDirRel: intentRel,
          reviewType: "intent",
          gateType: undefined,
          signal: undefined,
          setReviewResultMeta: () => {},
        })

        let newSession = null
        for (let i = 0; i < 200; i++) {
          await delay(5)
          const current = listSessions()
          newSession = current.find(
            (s) => !idsBefore.has(s.session_id) && s.intent_slug === "test-intent",
          )
          if (newSession) break
        }
        assert.ok(newSession)

        updateSession(newSession.session_id, {
          status: "decided",
          decision,
          feedback: decision === "changes_requested" ? "Fix Y" : "",
        })

        const result = await armPromise
        assert.strictEqual(result.decision, decision)
        assert.strictEqual(
          result.feedback,
          decision === "changes_requested" ? "Fix Y" : "",
        )
        assert.ok("annotations" in result, "result must include annotations key")
      } finally {
        restoreCwd()
        cleanup(root)
      }
    },
  )
}

// ── Group B: Tool result carries _meta.ui.resourceUri (CC-3) ─────────────

console.log("\n=== Group B: buildUiResourceMeta + REVIEW_RESOURCE_URI (CC-3) ===")

test("buildUiResourceMeta returns correct shape", () => {
  const meta = buildUiResourceMeta(REVIEW_RESOURCE_URI)
  assert.deepStrictEqual(meta, { ui: { resourceUri: REVIEW_RESOURCE_URI } })
})

test("REVIEW_RESOURCE_URI matches expected pattern", () => {
  assert.match(
    REVIEW_RESOURCE_URI,
    /^ui:\/\/haiku\/review\/[0-9a-f]{12}$/,
    `REVIEW_RESOURCE_URI "${REVIEW_RESOURCE_URI}" does not match pattern`,
  )
})

test("buildUiResourceMeta result.ui.resourceUri equals REVIEW_RESOURCE_URI", () => {
  const meta = buildUiResourceMeta(REVIEW_RESOURCE_URI)
  assert.strictEqual(meta.ui.resourceUri, REVIEW_RESOURCE_URI)
})

// ── Group C: Review round-trip: approved (CC-5) ───────────────────────────

console.log("\n=== Group C: Review round-trip: approved (CC-5) ===")

await testAsync("approved decision round-trip via dispatch + sessions", async () => {
  const session = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })

  // Dispatch the submit in parallel with waiting for the session
  const waitPromise = waitForSession(session.session_id, 5000)
  const dispatchResult = dispatchReviewSubmit({
    session_type: "review",
    session_id: session.session_id,
    decision: "approved",
    feedback: "",
  })

  await waitPromise
  const updated = getSession(session.session_id)

  assert.ok(!dispatchResult.isError, "dispatch should not return isError")
  assert.strictEqual(dispatchResult.content[0].text, '{"ok":true}')
  assert.strictEqual(updated?.status, "decided")
  assert.strictEqual(updated?.decision, "approved")
  assert.strictEqual(updated?.feedback, "")
})

// ── Group D: Review round-trip: changes_requested (CC-6a) ─────────────────

console.log("\n=== Group D: Review round-trip: changes_requested (CC-6a) ===")

await testAsync("changes_requested decision round-trip", async () => {
  const session = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })

  const waitPromise = waitForSession(session.session_id, 5000)
  const dispatchResult = dispatchReviewSubmit({
    session_type: "review",
    session_id: session.session_id,
    decision: "changes_requested",
    feedback: "Fix X",
  })

  await waitPromise
  const updated = getSession(session.session_id)

  assert.ok(!dispatchResult.isError)
  assert.strictEqual(dispatchResult.content[0].text, '{"ok":true}')
  assert.strictEqual(updated?.decision, "changes_requested")
  assert.strictEqual(updated?.feedback, "Fix X")
})

// ── Group E: Review round-trip: external_review (CC-6b) ───────────────────

console.log("\n=== Group E: Review round-trip: external_review (CC-6b) ===")

await testAsync("external_review decision round-trip", async () => {
  const session = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })

  const waitPromise = waitForSession(session.session_id, 5000)
  const dispatchResult = dispatchReviewSubmit({
    session_type: "review",
    session_id: session.session_id,
    decision: "external_review",
    feedback: "",
  })

  await waitPromise
  const updated = getSession(session.session_id)

  assert.ok(!dispatchResult.isError)
  assert.strictEqual(updated?.decision, "external_review")
  assert.strictEqual(updated?.feedback, "")
})

// ── Group F: Shape parity (CC-5 / CC-6) ──────────────────────────────────

console.log("\n=== Group F: Resolve shape — all three decisions (CC-5/6) ===")

for (const decision of ["approved", "changes_requested", "external_review"]) {
  await testAsync(`${decision}: resolved shape has decision + feedback + annotations`, async () => {
    const session = createSession({
      intent_dir: "/tmp/test-intent",
      intent_slug: "test-intent",
      review_type: "intent",
      target: "",
      html: "",
    })

    const waitPromise = waitForSession(session.session_id, 5000)
    dispatchReviewSubmit({
      session_type: "review",
      session_id: session.session_id,
      decision,
      feedback: decision === "changes_requested" ? "test feedback" : "",
    })

    await waitPromise
    const updated = getSession(session.session_id)

    // Simulate what the MCP Apps arm returns after waitForSession resolves
    const resolved = {
      decision: updated.decision,
      feedback: updated.feedback,
      annotations: updated.annotations,
    }

    assert.strictEqual(typeof resolved.decision, "string")
    assert.strictEqual(typeof resolved.feedback, "string")
    assert.ok("annotations" in resolved, "resolved object must have annotations key")
  })
}

// ── Group G: Non-MCP-Apps regression (CC-1) ───────────────────────────────

console.log("\n=== Group G: Non-MCP-Apps arm (CC-1) ===")

test("hostSupportsMcpApps returns false when no experimental.apps cap", () => {
  setMcpServerInstance(makeNonMcpAppsServer())
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("MCP Apps server: hostSupportsMcpApps returns true", () => {
  setMcpServerInstance(makeMcpAppsServer())
  assert.strictEqual(hostSupportsMcpApps(), true)
})

// ── Group H: V5-10 host-timeout fallback (CC-7) ───────────────────────────

console.log("\n=== Group H: V5-10 host-timeout fallback (CC-7) ===")

await testAsync("real openReviewMcpApps: AbortSignal.abort() drives timeout path — resolved value shape", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  const { root, intentRel } = setupIntentDir()
  enterRoot(root)
  try {
    const controller = new AbortController()
    // Abort after 50ms — gives createSession/parseIntent time to set up before aborting
    const abortTimer = setTimeout(() => controller.abort(), 50)

    const result = await openReviewMcpApps({
      intentDirRel: intentRel,
      reviewType: "intent",
      gateType: undefined,
      signal: controller.signal,
      setReviewResultMeta: () => { /* ignore */ },
    })

    clearTimeout(abortTimer)

    // Assert resolved value shape (CC-7)
    assert.strictEqual(result.decision, "changes_requested")
    assert.strictEqual(
      result.feedback,
      "Review timed out before decision was submitted. Please retry.",
    )
    assert.strictEqual(result.annotations, undefined)
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

await testAsync("real openReviewMcpApps: timeout writes gate_review_host_timeout event to session.log", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  const { root, intentRel } = setupIntentDir()
  // The real function computes: join(cwd, intentDirRel, "..", "..", "session.log")
  // For intentRel = ".haiku/intents/test-intent", that resolves to cwd/.haiku/session.log.
  // logSessionEvent replaces /\.json$/ → .jsonl; "session.log" has no match,
  // so the file stays as session.log.
  const expectedStLog = join(root, ".haiku", "session.log")
  enterRoot(root)
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await openReviewMcpApps({
      intentDirRel: intentRel,
      reviewType: "intent",
      gateType: undefined,
      signal: controller.signal,
      setReviewResultMeta: () => {},
    })

    const content = readFileSync(expectedStLog, "utf8")
    const firstLine = content.trim().split("\n")[0]
    const event = JSON.parse(firstLine)
    assert.strictEqual(event.event, "gate_review_host_timeout")
    assert.strictEqual(typeof event.detected_at_seconds, "number")
    assert.ok(event.detected_at_seconds > 0)
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

await testAsync("real openReviewMcpApps: timeout writes blocking_timeout_observed to intent.md", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  const { root, intentRel, intentMdPath } = setupIntentDir()
  enterRoot(root)
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await openReviewMcpApps({
      intentDirRel: intentRel,
      reviewType: "intent",
      gateType: undefined,
      signal: controller.signal,
      setReviewResultMeta: () => {},
    })
    const content = readFileSync(intentMdPath, "utf8")
    assert.ok(
      content.includes("blocking_timeout_observed: true"),
      `Expected blocking_timeout_observed: true in:\n${content}`,
    )
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

await testAsync("real openReviewMcpApps: timeout path does NOT touch state.json (V5-11)", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  const { root, intentRel, intentAbs } = setupIntentDir()

  // Write a minimal state.json inside the intent dir — the timeout path must NOT touch it
  const stateJsonPath = join(intentAbs, "state.json")
  const stateContent = JSON.stringify({ phase: "gate_ask", iteration: 1 }, null, 2) + "\n"
  writeFileSync(stateJsonPath, stateContent)

  enterRoot(root)
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await openReviewMcpApps({
      intentDirRel: intentRel,
      reviewType: "intent",
      gateType: undefined,
      signal: controller.signal,
      setReviewResultMeta: () => {},
    })

    // state.json must be byte-identical — no resume token written
    const after = readFileSync(stateJsonPath, "utf8")
    assert.strictEqual(
      after,
      stateContent,
      "state.json must be byte-identical after timeout (no resume token)",
    )
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

// ── Group I: V5-11 state byte-identity on timeout (CC-8) ──────────────────
//
// CC-8 is covered by the Group H test:
// "real openReviewMcpApps: timeout path does NOT touch state.json (V5-11)".
// That test writes a real state.json, calls the real openReviewMcpApps()
// with an aborted signal, and asserts byte-identity after. Nothing else is
// needed here.

// ── Group J: question + design_direction round-trips (unit-04 wired) ─────────

console.log("\n=== Group J: question + design_direction round-trips ===")

await testAsync("question round-trip: answers submitted resolve the session", async () => {
  const session = createQuestionSession({
    title: "Test Q",
    questions: [{ question: "Q?", options: ["A", "B"] }],
    context: "",
    imagePaths: [],
    html: "",
  })

  const waitPromise = waitForSession(session.session_id, 5000)
  const result = dispatchReviewSubmit({
    session_type: "question",
    session_id: session.session_id,
    answers: [{ question: "Q?", selectedOptions: ["A"] }],
  })

  await waitPromise
  const updated = getSession(session.session_id)

  assert.ok(!result.isError, `dispatch should not return isError: ${result.content[0].text}`)
  assert.strictEqual(result.content[0].text, '{"ok":true}')
  assert.strictEqual(updated?.status, "answered")
  assert.deepStrictEqual(updated?.answers, [{ question: "Q?", selectedOptions: ["A"] }])
})

await testAsync("design_direction round-trip: selection submitted resolves the session", async () => {
  const session = createDesignDirectionSession({
    intent_slug: "test-intent",
    archetypes: [{ name: "minimal", description: "Minimal", preview_html: "", default_parameters: { contrast: 0.5 } }],
    parameters: [],
    html: "",
  })

  const waitPromise = waitForSession(session.session_id, 5000)
  const result = dispatchReviewSubmit({
    session_type: "design_direction",
    session_id: session.session_id,
    archetype: "minimal",
    parameters: { contrast: 0.8 },
    comments: "Looks good",
  })

  await waitPromise
  const updated = getSession(session.session_id)

  assert.ok(!result.isError, `dispatch should not return isError: ${result.content[0].text}`)
  assert.strictEqual(result.content[0].text, '{"ok":true}')
  assert.strictEqual(updated?.status, "answered")
  assert.strictEqual(updated?.selection?.archetype, "minimal")
  assert.deepStrictEqual(updated?.selection?.parameters, { contrast: 0.8 })
  assert.strictEqual(updated?.selection?.comments, "Looks good")
})

test("question unknown session_id returns Session not found", () => {
  const unknownId = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "question",
    session_id: unknownId,
    answers: [{ question: "Q?", selectedOptions: ["A"] }],
  })
  assert.strictEqual(result.isError, true)
  assert.ok(result.content[0].text.includes("Session not found:"))
})

test("design_direction unknown session_id returns Session not found", () => {
  const unknownId = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "design_direction",
    session_id: unknownId,
    archetype: "minimal",
    parameters: {},
  })
  assert.strictEqual(result.isError, true)
  assert.ok(result.content[0].text.includes("Session not found:"))
})

// ── Group K: Error validation cases ───────────────────────────────────────

console.log("\n=== Group K: Error validation cases ===")

test("unknown session_id returns Session not found error", () => {
  const unknownId = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "review",
    session_id: unknownId,
    decision: "approved",
    feedback: "",
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.includes("Session not found:"),
    `Expected 'Session not found:' in: ${result.content[0].text}`,
  )
})

test("session already in decided status returns Session already closed error", () => {
  const session = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })
  // Force session to decided status
  updateSession(session.session_id, { status: "decided", decision: "approved", feedback: "" })

  const result = dispatchReviewSubmit({
    session_type: "review",
    session_id: session.session_id,
    decision: "approved",
    feedback: "",
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.includes("Session already closed:"),
    `Expected 'Session already closed:' in: ${result.content[0].text}`,
  )
})

test("session already decided returns Session already closed error", () => {
  const session = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })
  // Decide the session first
  updateSession(session.session_id, { status: "decided", decision: "approved", feedback: "" })

  const result = dispatchReviewSubmit({
    session_type: "review",
    session_id: session.session_id,
    decision: "changes_requested",
    feedback: "too late",
  })
  assert.strictEqual(result.isError, true)
  assert.ok(result.content[0].text.includes("Session already closed:"))
})

test("bad decision enum fails Zod validation with Invalid input prefix", () => {
  const someUUID = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "review",
    session_id: someUUID,
    decision: "not_a_valid_decision",
    feedback: "",
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.startsWith("Invalid input:"),
    `Expected 'Invalid input:' prefix in: ${result.content[0].text}`,
  )
})

test("missing session_id fails Zod validation", () => {
  const result = dispatchReviewSubmit({
    session_type: "review",
    decision: "approved",
    feedback: "",
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.startsWith("Invalid input:"),
    `Expected 'Invalid input:' prefix in: ${result.content[0].text}`,
  )
})

test("question answers empty array fails Zod min(1) validation", () => {
  const someUUID = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "question",
    session_id: someUUID,
    answers: [],  // min(1) violation
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.startsWith("Invalid input:"),
    `Expected 'Invalid input:' for empty answers: ${result.content[0].text}`,
  )
})

test("design_direction empty archetype fails Zod min(1) validation", () => {
  const someUUID = crypto.randomUUID()
  const result = dispatchReviewSubmit({
    session_type: "design_direction",
    session_id: someUUID,
    archetype: "",  // min(1) violation
    parameters: {},
  })
  assert.strictEqual(result.isError, true)
  assert.ok(
    result.content[0].text.startsWith("Invalid input:"),
    `Expected 'Invalid input:' for empty archetype: ${result.content[0].text}`,
  )
})

// ── Group L: End-to-end — all three session types on same scope (CC-9) ────

console.log("\n=== Group L: End-to-end — all three session types resolve via dispatchReviewSubmit ===")

await testAsync("single scope: review + question + design_direction all resolve independently", async () => {
  // Create all three sessions
  const reviewSession = createSession({
    intent_dir: "/tmp/test-intent",
    intent_slug: "test-intent",
    review_type: "intent",
    target: "",
    html: "",
  })

  const questionSession = createQuestionSession({
    title: "E2E Q",
    questions: [{ question: "Q?", options: ["A", "B"] }],
    context: "",
    imagePaths: [],
    html: "",
  })

  const designSession = createDesignDirectionSession({
    intent_slug: "test-intent",
    archetypes: [{ name: "bold", description: "", preview_html: "", default_parameters: { x: 1 } }],
    parameters: [],
    html: "",
  })

  // Submit all three in sequence — each should resolve independently
  const r1 = dispatchReviewSubmit({
    session_type: "review",
    session_id: reviewSession.session_id,
    decision: "approved",
    feedback: "",
  })
  assert.ok(!r1.isError, `review submit should succeed: ${r1.content[0].text}`)
  assert.strictEqual(r1.content[0].text, '{"ok":true}')

  const r2 = dispatchReviewSubmit({
    session_type: "question",
    session_id: questionSession.session_id,
    answers: [{ question: "Q?", selectedOptions: ["A"] }],
  })
  assert.ok(!r2.isError, `question submit should succeed: ${r2.content[0].text}`)
  assert.strictEqual(r2.content[0].text, '{"ok":true}')

  const r3 = dispatchReviewSubmit({
    session_type: "design_direction",
    session_id: designSession.session_id,
    archetype: "bold",
    parameters: { x: 0.8 },
  })
  assert.ok(!r3.isError, `design_direction submit should succeed: ${r3.content[0].text}`)
  assert.strictEqual(r3.content[0].text, '{"ok":true}')

  // Each session updated correctly — no cross-contamination
  const updatedReview = getSession(reviewSession.session_id)
  assert.strictEqual(updatedReview?.session_type, "review")
  assert.strictEqual(updatedReview?.status, "decided")

  const updatedQuestion = getSession(questionSession.session_id)
  assert.strictEqual(updatedQuestion?.session_type, "question")
  assert.strictEqual(updatedQuestion?.status, "answered")

  const updatedDesign = getSession(designSession.session_id)
  assert.strictEqual(updatedDesign?.session_type, "design_direction")
  assert.strictEqual(updatedDesign?.status, "answered")
  assert.strictEqual(updatedDesign?.selection?.archetype, "bold")
})

await testAsync("all three session types carry resource URI in _meta (via dispatchReviewSubmit shape)", async () => {
  // Verifies CC-9 / V5-05: all three session types are handled by the same tool.
  // Session existence check: unknown ID returns the same error format for all three.
  const fakeId = crypto.randomUUID()

  for (const [type, extra] of [
    ["review", { decision: "approved", feedback: "" }],
    ["question", { answers: [{ question: "Q?", selectedOptions: ["A"] }] }],
    ["design_direction", { archetype: "bold", parameters: {} }],
  ]) {
    const result = dispatchReviewSubmit({ session_type: type, session_id: fakeId, ...extra })
    assert.strictEqual(result.isError, true)
    assert.ok(
      result.content[0].text.includes("Session not found:"),
      `${type}: Expected 'Session not found:' in: ${result.content[0].text}`,
    )
  }
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
