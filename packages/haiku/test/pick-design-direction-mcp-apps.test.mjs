#!/usr/bin/env npx tsx
// Test suite: pickDesignDirectionMcpApps (unit-04)
// Covers: pick_design_direction MCP Apps branch — round-trips, stage-state write, timeout
// Run: npx tsx test/pick-design-direction-mcp-apps.test.mjs

import assert from "node:assert"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chdir, cwd as getCwd } from "node:process"
import { rmSync } from "node:fs"
import { readFileSync as readFs } from "node:fs"
import { setTimeout as delay } from "node:timers/promises"

import {
  createDesignDirectionSession,
  getSession,
  listSessions,
  updateDesignDirectionSession,
} from "../src/sessions.ts"
import { setMcpServerInstance, hostSupportsMcpApps } from "../src/state-tools.ts"
import { REVIEW_RESOURCE_URI } from "../src/ui-resource.ts"
import { pickDesignDirectionMcpApps } from "../src/pick-design-direction-mcp-apps.ts"

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

// ── Fixtures ───────────────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    name: "minimal",
    description: "Clean and minimal",
    preview_html: "<div>minimal</div>",
    default_parameters: { contrast: 0.5, spacing: 1.0 },
  },
  {
    name: "bold",
    description: "Bold and expressive",
    preview_html: "<div>bold</div>",
    default_parameters: { contrast: 0.9, spacing: 0.5 },
  },
]

const PARAMETERS = [
  { name: "contrast", label: "Contrast", description: "Visual contrast", min: 0, max: 1, step: 0.1, default: 0.5, labels: { low: "Low", high: "High" } },
  { name: "spacing", label: "Spacing", description: "Element spacing", min: 0, max: 2, step: 0.1, default: 1.0, labels: { low: "Tight", high: "Loose" } },
]

// ── Minimal haiku root setup for stage-state write tests ──────────────────

const _origCwd = getCwd()

function setupHaikuRoot(intentSlug, activeStage) {
  const root = join(tmpdir(), `haiku-dd-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const intentsDir = join(root, ".haiku", "intents", intentSlug)
  const stageDir = join(intentsDir, "stages", activeStage)
  mkdirSync(stageDir, { recursive: true })

  // Write intent.md with active_stage in frontmatter
  writeFileSync(
    join(intentsDir, "intent.md"),
    `---\ntitle: Test Intent\nstatus: active\nactive_stage: ${activeStage}\n---\n\n# Test\n`,
  )

  // Write stage state.json
  const stateJson = join(stageDir, "state.json")
  writeFileSync(stateJson, JSON.stringify({ phase: "execute", iteration: 1 }, null, 2) + "\n")

  return { root, intentsDir, stageDir, stateJson }
}

function enterRoot(root) { chdir(root) }
function restoreCwd() { chdir(_origCwd) }
function cleanup(root) {
  try { rmSync(root, { recursive: true, force: true }) } catch { /* */ }
}

// ── Structural guarantee ───────────────────────────────────────────────────

function assertNoHttpImports() {
  const src = readFileSync(
    new URL("../src/pick-design-direction-mcp-apps.ts", import.meta.url),
    "utf8",
  )
  if (/from\s+["']\.\/http\.js["']/.test(src)) {
    throw new Error("pick-design-direction-mcp-apps.ts imports ./http.js — MCP Apps arm must not touch HTTP")
  }
  if (/from\s+["']\.\/tunnel\.js["']/.test(src)) {
    throw new Error("pick-design-direction-mcp-apps.ts imports ./tunnel.js — MCP Apps arm must not touch tunnel")
  }
  if (/from\s+["']node:child_process["']/.test(src)) {
    throw new Error("pick-design-direction-mcp-apps.ts imports node:child_process — MCP Apps arm must not spawn processes")
  }
}

// ── Group A: Structural guarantee ─────────────────────────────────────────

console.log("\n=== Group A: Structural guarantee ===")

test("pick-design-direction-mcp-apps.ts does NOT import http.js / tunnel.js / child_process", () => {
  assertNoHttpImports()
})

// ── Group B: Round-trip + stage-state write ───────────────────────────────

console.log("\n=== Group B: Round-trip + stage-state write ===")

await testAsync("round-trip: selection resolves arm and stage-state write fires", async () => {
  setMcpServerInstance(makeMcpAppsServer())
  const { root, stateJson } = setupHaikuRoot("test-intent", "design")
  enterRoot(root)
  try {
    const idsBefore = new Set(listSessions().map((s) => s.session_id))
    let capturedMeta = undefined

    const armPromise = pickDesignDirectionMcpApps({
      title: "Design Direction",
      archetypes: ARCHETYPES,
      parameters: PARAMETERS,
      intentSlug: "test-intent",
      signal: undefined,
      setDesignDirectionResultMeta: (m) => { capturedMeta = m },
    })

    // Discover session
    let newSession = null
    for (let i = 0; i < 200; i++) {
      await delay(5)
      const current = listSessions()
      newSession = current.find(
        (s) => !idsBefore.has(s.session_id) && s.session_type === "design_direction",
      )
      if (newSession) break
    }
    assert.ok(newSession, "pickDesignDirectionMcpApps should have created a session")
    assert.ok(capturedMeta, "setDesignDirectionResultMeta called before await")
    assert.strictEqual(capturedMeta.ui.resourceUri, REVIEW_RESOURCE_URI)

    // Submit selection to unblock arm
    updateDesignDirectionSession(newSession.session_id, {
      status: "answered",
      selection: {
        archetype: "bold",
        parameters: { contrast: 0.9, spacing: 0.5 },
        comments: "Love it",
      },
    })

    const result = await armPromise

    // Arm returns conversational text
    assert.ok(result.text.includes("**bold**"), `Expected bold archetype in: ${result.text}`)
    assert.ok(result.text.includes("Love it"), `Expected comments in: ${result.text}`)

    // Stage-state write ran
    const ssData = JSON.parse(readFs(stateJson, "utf8"))
    assert.strictEqual(ssData.design_direction_selected, true)
    assert.strictEqual(ssData.design_direction.archetype, "bold")
    assert.deepStrictEqual(ssData.design_direction.parameters, { contrast: 0.9, spacing: 0.5 })
    assert.strictEqual(ssData.design_direction.comments, "Love it")
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

await testAsync("stage-state write: design_direction_selected equals submitted payload", async () => {
  const { root, stateJson } = setupHaikuRoot("my-intent", "product")
  enterRoot(root)
  try {
    const idsBefore = new Set(listSessions().map((s) => s.session_id))

    const armPromise = pickDesignDirectionMcpApps({
      title: "Pick",
      archetypes: ARCHETYPES,
      parameters: PARAMETERS,
      intentSlug: "my-intent",
      signal: undefined,
      setDesignDirectionResultMeta: () => {},
    })

    let newSession = null
    for (let i = 0; i < 200; i++) {
      await delay(5)
      const current = listSessions()
      newSession = current.find(
        (s) => !idsBefore.has(s.session_id) && s.session_type === "design_direction",
      )
      if (newSession) break
    }
    assert.ok(newSession)

    updateDesignDirectionSession(newSession.session_id, {
      status: "answered",
      selection: {
        archetype: "minimal",
        parameters: { contrast: 0.3, spacing: 1.5 },
      },
    })

    await armPromise

    const ssData = JSON.parse(readFs(stateJson, "utf8"))
    assert.strictEqual(ssData.design_direction_selected, true)
    assert.strictEqual(ssData.design_direction.archetype, "minimal")
    assert.deepStrictEqual(ssData.design_direction.parameters, { contrast: 0.3, spacing: 1.5 })
    // No comments field when not provided
    assert.strictEqual(ssData.design_direction.comments, undefined)
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

await testAsync("annotations included in stage-state write when provided", async () => {
  const { root, stateJson } = setupHaikuRoot("pin-intent", "design")
  enterRoot(root)
  try {
    const idsBefore = new Set(listSessions().map((s) => s.session_id))

    const armPromise = pickDesignDirectionMcpApps({
      title: "Pin test",
      archetypes: ARCHETYPES,
      parameters: PARAMETERS,
      intentSlug: "pin-intent",
      signal: undefined,
      setDesignDirectionResultMeta: () => {},
    })

    let newSession = null
    for (let i = 0; i < 200; i++) {
      await delay(5)
      const current = listSessions()
      newSession = current.find(
        (s) => !idsBefore.has(s.session_id) && s.session_type === "design_direction",
      )
      if (newSession) break
    }
    assert.ok(newSession)

    updateDesignDirectionSession(newSession.session_id, {
      status: "answered",
      selection: {
        archetype: "bold",
        parameters: { contrast: 0.8 },
        annotations: {
          pins: [{ x: 50.0, y: 25.5, text: "Change this" }],
        },
      },
    })

    const result = await armPromise

    // Pins in conversational text
    assert.ok(result.text.includes("pin"), `Expected pin mention in: ${result.text}`)

    // Pins in stage-state write
    const ssData = JSON.parse(readFs(stateJson, "utf8"))
    assert.ok(ssData.design_direction.annotations?.pins?.length === 1)
    assert.strictEqual(ssData.design_direction.annotations.pins[0].text, "Change this")
  } finally {
    restoreCwd()
    cleanup(root)
  }
})

// ── Group C: V5-10 timeout fallback ───────────────────────────────────────

console.log("\n=== Group C: V5-10 host-timeout fallback ===")

await testAsync("AbortSignal.abort() returns synthetic first-archetype selection", async () => {
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 100)

  const result = await pickDesignDirectionMcpApps({
    title: "Should timeout",
    archetypes: ARCHETYPES,
    parameters: PARAMETERS,
    intentSlug: "test-intent",
    signal: controller.signal,
    setDesignDirectionResultMeta: () => {},
  })

  clearTimeout(abortTimer)

  // Returns text mentioning first archetype
  assert.ok(result.text.includes("minimal"), `Expected first archetype 'minimal' in: ${result.text}`)
  assert.ok(result.text.includes("Timed out"), `Expected 'Timed out' in: ${result.text}`)
})

await testAsync("pre-aborted signal returns timeout immediately", async () => {
  const controller = new AbortController()
  controller.abort()

  const result = await pickDesignDirectionMcpApps({
    title: "Pre-aborted",
    archetypes: ARCHETYPES,
    parameters: PARAMETERS,
    intentSlug: "test-intent",
    signal: controller.signal,
    setDesignDirectionResultMeta: () => {},
  })

  assert.ok(result.text.includes("minimal"))
  assert.ok(result.text.includes("Timed out"))
})

// ── Group D: _meta.ui.resourceUri set before await ────────────────────────

console.log("\n=== Group D: _meta.ui.resourceUri set before await ===")

await testAsync("setDesignDirectionResultMeta called exactly once before arm awaits", async () => {
  const idsBefore = new Set(listSessions().map((s) => s.session_id))
  let metaCallCount = 0
  let capturedUri = null

  const armPromise = pickDesignDirectionMcpApps({
    title: "Meta test",
    archetypes: ARCHETYPES,
    parameters: PARAMETERS,
    intentSlug: "test-intent",
    signal: undefined,
    setDesignDirectionResultMeta: (m) => {
      metaCallCount++
      capturedUri = m.ui.resourceUri
    },
  })

  let newSession = null
  for (let i = 0; i < 200; i++) {
    await delay(5)
    const current = listSessions()
    newSession = current.find(
      (s) => !idsBefore.has(s.session_id) && s.session_type === "design_direction",
    )
    if (newSession) break
  }
  assert.ok(newSession)
  assert.strictEqual(metaCallCount, 1)
  assert.strictEqual(capturedUri, REVIEW_RESOURCE_URI)

  // Clean up
  updateDesignDirectionSession(newSession.session_id, {
    status: "answered",
    selection: { archetype: "minimal", parameters: {} },
  })
  await armPromise.catch(() => {}) // may throw due to missing haiku root; ignore
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
