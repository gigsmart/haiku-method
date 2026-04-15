#!/usr/bin/env npx tsx
// Test suite: MCP Apps capability negotiation + workspace handshake
// Covers: mcp-apps-capability-negotiation.feature + workspace-handshake.feature
// Run: npx tsx test/capability-negotiation.test.mjs

import assert from "node:assert"

import {
  setMcpServerInstance,
  hostSupportsMcpApps,
  getMcpHostWorkspacePaths,
  requestHostWorkspace,
  resolveWorkspaceRoot,
} from "../src/state-tools.ts"

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === "function") {
      // async test — we can't handle these inline; caller must use testAsync
      throw new Error("Use testAsync() for async tests")
    }
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

/**
 * Build a minimal McpServerRef stub.
 *
 * @param {object} opts
 * @param {unknown}  opts.caps            - value returned by getClientCapabilities()
 * @param {Array}    opts.roots           - roots array (each {uri: string})
 * @param {Function} opts.elicitInput     - optional elicitInput stub
 * @param {Function} opts.onGetCaps       - spy called every time getClientCapabilities() is called
 */
function makeServer({ caps = undefined, roots = [], elicitInput, onGetCaps } = {}) {
  return {
    getClientCapabilities() {
      if (onGetCaps) onGetCaps()
      return caps
    },
    async listRoots() {
      return { roots }
    },
    async elicitInput(params) {
      if (elicitInput) return elicitInput(params)
      throw new Error("elicitInput not configured in stub")
    },
  }
}

/** Reset module-level cache between test groups by re-injecting with a new server stub. */
function reset(opts) {
  setMcpServerInstance(makeServer(opts))
}

// ── Section 1: hostSupportsMcpApps() ──────────────────────────────────────

console.log("\n=== hostSupportsMcpApps — capability detection ===")

// Scenario: Client advertises experimental.apps → returns true
test("returns true when client echoes experimental.apps: {}", () => {
  reset({ caps: { experimental: { apps: {} } } })
  assert.strictEqual(hostSupportsMcpApps(), true)
})

// Scenario: Client does not advertise experimental.apps → returns false
test("returns false when client has no experimental key", () => {
  reset({ caps: {} })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("returns false when experimental exists but no apps key", () => {
  reset({ caps: { experimental: {} } })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("returns false when capabilities are null", () => {
  reset({ caps: null })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("returns false when no MCP server is injected (null)", () => {
  // Directly inject null — setMcpServerInstance is the official API
  // We simulate no server by observing the false path
  setMcpServerInstance(null)
  assert.strictEqual(hostSupportsMcpApps(), false)
})

// CLAUDE_CODE_IS_COWORK set but no experimental.apps → env var must be ignored
test("returns false when CLAUDE_CODE_IS_COWORK is set but capability absent", () => {
  const prev = process.env.CLAUDE_CODE_IS_COWORK
  process.env.CLAUDE_CODE_IS_COWORK = "1"
  try {
    reset({ caps: {} })
    assert.strictEqual(hostSupportsMcpApps(), false)
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_IS_COWORK
    else process.env.CLAUDE_CODE_IS_COWORK = prev
  }
})

// Partial/malformed capability shapes (per feature file Examples table)
console.log("\n=== hostSupportsMcpApps — partial/malformed capabilities ===")

test("caps = {} → false", () => {
  reset({ caps: {} })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("caps = { experimental: {} } → false (apps key absent)", () => {
  reset({ caps: { experimental: {} } })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("caps = { experimental: { apps: 1 } } → true (key exists, value doesn't matter)", () => {
  reset({ caps: { experimental: { apps: 1 } } })
  assert.strictEqual(hostSupportsMcpApps(), true)
})

test("caps = null → false", () => {
  reset({ caps: null })
  assert.strictEqual(hostSupportsMcpApps(), false)
})

test("caps = { experimental: { apps: null } } → true (key exists)", () => {
  // per spec: key presence is what matters, not value
  reset({ caps: { experimental: { apps: null } } })
  // null still means the key exists — returns true
  assert.strictEqual(hostSupportsMcpApps(), true)
})

// ── Section 2: Caching ─────────────────────────────────────────────────────

console.log("\n=== hostSupportsMcpApps — caching ===")

test("getClientCapabilities is called at most once across 10 invocations", () => {
  let callCount = 0
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      onGetCaps: () => { callCount++ },
    }),
  )

  for (let i = 0; i < 10; i++) {
    hostSupportsMcpApps()
  }

  assert.strictEqual(callCount, 1, `Expected 1 call, got ${callCount}`)
})

test("caching is reset on setMcpServerInstance", () => {
  let callCount = 0
  const serverA = makeServer({
    caps: { experimental: { apps: {} } },
    onGetCaps: () => { callCount++ },
  })
  setMcpServerInstance(serverA)
  hostSupportsMcpApps()
  hostSupportsMcpApps()

  // Reset to new server — cache should be cleared
  const serverB = makeServer({
    caps: {},
    onGetCaps: () => { callCount++ },
  })
  setMcpServerInstance(serverB)
  const result = hostSupportsMcpApps()

  assert.strictEqual(result, false)
  // serverA: 1 call, serverB: 1 call = 2 total
  assert.strictEqual(callCount, 2, `Expected 2 calls total, got ${callCount}`)
})

// ── Section 3: getMcpHostWorkspacePaths() ─────────────────────────────────

console.log("\n=== getMcpHostWorkspacePaths ===")

await testAsync("returns empty array when no server is injected", async () => {
  setMcpServerInstance(null)
  const paths = await getMcpHostWorkspacePaths()
  assert.deepStrictEqual(paths, [])
})

await testAsync("returns paths from roots with file:// stripped", async () => {
  reset({ roots: [{ uri: "file:///home/user/project", name: "project" }] })
  const paths = await getMcpHostWorkspacePaths()
  assert.deepStrictEqual(paths, ["/home/user/project"])
})

await testAsync("returns multiple paths when multiple roots", async () => {
  reset({
    roots: [
      { uri: "file:///home/user/project-a" },
      { uri: "file:///home/user/project-b" },
    ],
  })
  const paths = await getMcpHostWorkspacePaths()
  assert.deepStrictEqual(paths, ["/home/user/project-a", "/home/user/project-b"])
})

await testAsync("returns empty array when listRoots throws", async () => {
  const server = {
    getClientCapabilities() { return { experimental: { apps: {} } } },
    async listRoots() { throw new Error("roots not supported") },
  }
  setMcpServerInstance(server)
  const paths = await getMcpHostWorkspacePaths()
  assert.deepStrictEqual(paths, [])
})

await testAsync("returns empty array when roots array is empty", async () => {
  reset({ roots: [] })
  const paths = await getMcpHostWorkspacePaths()
  assert.deepStrictEqual(paths, [])
})

// ── Section 4: Workspace handshake branches ────────────────────────────────

console.log("\n=== resolveWorkspaceRoot — handshake branches ===")

await testAsync("one root → auto-select, no elicitInput call", async () => {
  let elicitCalled = false
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [{ uri: "file:///home/user/project" }],
      elicitInput: () => { elicitCalled = true },
    }),
  )

  const path = await resolveWorkspaceRoot()
  assert.strictEqual(path, "/home/user/project")
  assert.strictEqual(elicitCalled, false, "elicitInput should NOT be called for single root")
})

await testAsync("zero roots + apps supported → requestHostWorkspace called", async () => {
  let elicitCalled = false
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [],
      elicitInput: (_params) => {
        elicitCalled = true
        return { action: "submit", content: { workspace_path: "/home/user/chosen" } }
      },
    }),
  )

  const path = await resolveWorkspaceRoot()
  assert.strictEqual(path, "/home/user/chosen")
  assert.strictEqual(elicitCalled, true, "elicitInput MUST be called when zero roots")
})

await testAsync("multiple roots → elicitInput called with both paths", async () => {
  let elicitParams = null
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [
        { uri: "file:///home/user/project-a" },
        { uri: "file:///home/user/project-b" },
      ],
      elicitInput: (params) => {
        elicitParams = params
        return {
          action: "submit",
          content: { workspace_path: "/home/user/project-a" },
        }
      },
    }),
  )

  const path = await resolveWorkspaceRoot()
  assert.strictEqual(path, "/home/user/project-a")
  assert.ok(elicitParams !== null, "elicitInput should be called for multiple roots")
  const enumValues = elicitParams.requestedSchema.properties.workspace_path.enum
  assert.deepStrictEqual(enumValues, ["/home/user/project-a", "/home/user/project-b"])
})

await testAsync("cached selection reused across multiple calls", async () => {
  let elicitCallCount = 0
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [],
      elicitInput: (_params) => {
        elicitCallCount++
        return { action: "submit", content: { workspace_path: "/home/user/cached" } }
      },
    }),
  )

  const path1 = await resolveWorkspaceRoot()
  const path2 = await resolveWorkspaceRoot()
  const path3 = await resolveWorkspaceRoot()

  assert.strictEqual(path1, "/home/user/cached")
  assert.strictEqual(path2, "/home/user/cached")
  assert.strictEqual(path3, "/home/user/cached")
  assert.strictEqual(elicitCallCount, 1, "elicitInput should only be called once (cached)")
})

await testAsync("workspace selection cancelled → throws", async () => {
  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [],
      elicitInput: (_params) => ({ action: "cancel" }),
    }),
  )

  await assert.rejects(
    () => resolveWorkspaceRoot(),
    /Workspace selection cancelled/,
  )
})

// ── Section 5: requestHostWorkspace() directly ─────────────────────────────

console.log("\n=== requestHostWorkspace ===")

await testAsync("calls elicitInput with workspace prompt and returns path", async () => {
  setMcpServerInstance(
    makeServer({
      elicitInput: (_params) => ({
        action: "submit",
        content: { workspace_path: "/workspace/selected" },
      }),
    }),
  )

  const path = await requestHostWorkspace()
  assert.strictEqual(path, "/workspace/selected")
})

await testAsync("throws when no server injected", async () => {
  setMcpServerInstance(null)
  await assert.rejects(() => requestHostWorkspace(), /MCP server not injected/)
})

await testAsync("throws when elicitInput returns no content", async () => {
  setMcpServerInstance(
    makeServer({
      elicitInput: (_params) => ({ action: "submit", content: null }),
    }),
  )

  await assert.rejects(() => requestHostWorkspace(), /Workspace selection cancelled/)
})

// ── Section 6: Handshake precedes first .haiku/ write (call-order) ─────────

console.log("\n=== Handshake precedes .haiku/ write ===")

await testAsync("resolveWorkspaceRoot resolves before simulated write function is invoked", async () => {
  const callOrder = []

  setMcpServerInstance(
    makeServer({
      caps: { experimental: { apps: {} } },
      roots: [],
      elicitInput: (_params) => {
        callOrder.push("requestHostWorkspace")
        return { action: "submit", content: { workspace_path: "/workspace" } }
      },
    }),
  )

  // Simulate intent-creation flow: resolve workspace first, then write
  const simulatedWrite = async () => {
    callOrder.push("haiku-write")
  }

  await resolveWorkspaceRoot()
  await simulatedWrite()

  const handshakeIdx = callOrder.indexOf("requestHostWorkspace")
  const writeIdx = callOrder.indexOf("haiku-write")

  assert.ok(handshakeIdx !== -1, "requestHostWorkspace should have been called")
  assert.ok(writeIdx !== -1, "simulated write should have been called")
  assert.ok(
    handshakeIdx < writeIdx,
    `requestHostWorkspace (${handshakeIdx}) must precede write (${writeIdx})`,
  )
})

// ── Section 7: No env-var coupling (runtime check) ────────────────────────

console.log("\n=== No env-var coupling ===")

test("CLAUDE_CODE_IS_COWORK=1 with no apps capability still returns false", () => {
  const prev = process.env.CLAUDE_CODE_IS_COWORK
  process.env.CLAUDE_CODE_IS_COWORK = "1"
  try {
    reset({ caps: { tools: {} } }) // no experimental.apps
    assert.strictEqual(hostSupportsMcpApps(), false)
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_IS_COWORK
    else process.env.CLAUDE_CODE_IS_COWORK = prev
  }
})

test("CLAUDE_CODE_IS_COWORK unset with apps capability returns true", () => {
  delete process.env.CLAUDE_CODE_IS_COWORK
  reset({ caps: { experimental: { apps: {} } } })
  assert.strictEqual(hostSupportsMcpApps(), true)
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
