#!/usr/bin/env npx tsx
// Test suite: ui:// resource registration + REVIEW_APP_VERSION build stamp + _meta.ui helper
// Covers: mcp-apps-capability-negotiation.feature + iframe-review-gate.feature (unit-02 scope)
// Run: npx tsx test/ui-resource.test.mjs

import assert from "node:assert"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import {
  ErrorCode,
  ListResourcesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { REVIEW_APP_HTML } from "../src/review-app-html.ts"
import {
  REVIEW_RESOURCE_URI,
  buildUiResourceMeta,
} from "../src/ui-resource.ts"

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Build an in-process MCP server that registers only the resource handlers
 * and return a connected Client ready to send JSON-RPC requests.
 */
async function buildTestServer() {
  const server = new Server(
    { name: "test-ui-resource", version: "0.0.1" },
    {
      capabilities: {
        resources: {},
        experimental: { apps: {} },
      },
    },
  )

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: REVIEW_RESOURCE_URI,
        name: "Haiku Review App",
        mimeType: "text/html",
      },
    ],
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params
    if (uri !== REVIEW_RESOURCE_URI) {
      throw new McpError(ErrorCode.InvalidParams, "Unknown resource URI")
    }
    return {
      contents: [
        {
          uri: REVIEW_RESOURCE_URI,
          mimeType: "text/html",
          text: REVIEW_APP_HTML,
        },
      ],
    }
  })

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  const client = new Client(
    { name: "test-client", version: "0.0.1" },
    { capabilities: { experimental: { apps: {} } } },
  )

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])

  return { client, server }
}

// ── Section 1: buildUiResourceMeta (pure unit tests) ─────────────────────

console.log("\n=== buildUiResourceMeta — pure unit tests ===")

test("returns correct shape for a valid URI", () => {
  const result = buildUiResourceMeta("ui://x")
  assert.deepStrictEqual(result, { ui: { resourceUri: "ui://x" } })
})

test("resourceUri property matches the input URI", () => {
  const uri = "ui://haiku/review/abc123def456"
  const result = buildUiResourceMeta(uri)
  assert.strictEqual(result.ui.resourceUri, uri)
})

test("does not throw for empty string URI", () => {
  assert.doesNotThrow(() => buildUiResourceMeta(""))
})

test("returns a new object each call (no shared reference)", () => {
  const a = buildUiResourceMeta("ui://x")
  const b = buildUiResourceMeta("ui://x")
  assert.notStrictEqual(a, b)
})

// ── Section 2: REVIEW_RESOURCE_URI format ────────────────────────────────

console.log("\n=== REVIEW_RESOURCE_URI — format check ===")

test("matches expected pattern ui://haiku/review/<12 hex chars>", () => {
  assert.match(
    REVIEW_RESOURCE_URI,
    /^ui:\/\/haiku\/review\/[0-9a-f]{12}$/,
    `REVIEW_RESOURCE_URI "${REVIEW_RESOURCE_URI}" does not match expected pattern`,
  )
})

test("starts with ui://haiku/review/", () => {
  assert.ok(
    REVIEW_RESOURCE_URI.startsWith("ui://haiku/review/"),
    `Expected prefix ui://haiku/review/, got: ${REVIEW_RESOURCE_URI}`,
  )
})

// ── Section 3: resources/list integration tests ──────────────────────────

console.log("\n=== resources/list — integration tests ===")

await testAsync("returns exactly one resource", async () => {
  const { client } = await buildTestServer()
  const response = await client.listResources()
  assert.strictEqual(
    response.resources.length,
    1,
    `Expected 1 resource, got ${response.resources.length}`,
  )
})

await testAsync("resource URI matches ui://haiku/review/<12 hex> pattern", async () => {
  const { client } = await buildTestServer()
  const response = await client.listResources()
  assert.match(
    response.resources[0].uri,
    /^ui:\/\/haiku\/review\/[0-9a-f]{12}$/,
    `URI "${response.resources[0].uri}" does not match expected pattern`,
  )
})

await testAsync("resource mimeType is text/html", async () => {
  const { client } = await buildTestServer()
  const response = await client.listResources()
  assert.strictEqual(response.resources[0].mimeType, "text/html")
})

await testAsync("resource URI equals REVIEW_RESOURCE_URI constant", async () => {
  const { client } = await buildTestServer()
  const response = await client.listResources()
  assert.strictEqual(response.resources[0].uri, REVIEW_RESOURCE_URI)
})

// ── Section 4: resources/read integration tests ──────────────────────────

console.log("\n=== resources/read — integration tests ===")

await testAsync("correct URI returns contents with mimeType text/html", async () => {
  const { client } = await buildTestServer()
  const response = await client.readResource({ uri: REVIEW_RESOURCE_URI })
  assert.strictEqual(response.contents[0].mimeType, "text/html")
})

await testAsync("correct URI returns byte-identical content to REVIEW_APP_HTML", async () => {
  const { client } = await buildTestServer()
  const response = await client.readResource({ uri: REVIEW_RESOURCE_URI })
  const text = response.contents[0].text
  assert.strictEqual(
    text.length,
    REVIEW_APP_HTML.length,
    `Expected ${REVIEW_APP_HTML.length} chars, got ${text.length}`,
  )
  assert.strictEqual(text, REVIEW_APP_HTML)
})

await testAsync("correct URI returns exactly one content entry", async () => {
  const { client } = await buildTestServer()
  const response = await client.readResource({ uri: REVIEW_RESOURCE_URI })
  assert.strictEqual(response.contents.length, 1)
})

await testAsync("unknown URI returns JSON-RPC error code -32602", async () => {
  const { client } = await buildTestServer()
  try {
    await client.readResource({ uri: "ui://haiku/bogus/xxx" })
    assert.fail("Expected error but none thrown")
  } catch (e) {
    assert.ok(
      e instanceof McpError,
      `Expected McpError, got: ${e.constructor.name}: ${e.message}`,
    )
    assert.strictEqual(
      e.code,
      -32602,
      `Expected code -32602, got ${e.code}`,
    )
    // The SDK may wrap the message — check it contains the expected phrase
    assert.ok(
      e.message.includes("Unknown resource URI"),
      `Expected message to include "Unknown resource URI", got: "${e.message}"`,
    )
  }
})

await testAsync("unknown URI error message contains 'Unknown resource URI'", async () => {
  const { client } = await buildTestServer()
  let caughtError = null
  try {
    await client.readResource({ uri: "ui://haiku/bogus/xxx" })
  } catch (e) {
    caughtError = e
  }
  assert.ok(caughtError !== null, "Expected an error to be thrown")
  assert.ok(
    caughtError.message.includes("Unknown resource URI"),
    `Expected message to include "Unknown resource URI", got: "${caughtError.message}"`,
  )
})

// ── Section 5: No _meta leakage snapshot test ────────────────────────────

console.log("\n=== _meta leakage — snapshot test ===")

test("buildUiResourceMeta result has no _meta property", () => {
  const result = buildUiResourceMeta("ui://x")
  assert.strictEqual(
    result._meta,
    undefined,
    "_meta should not be present on buildUiResourceMeta result",
  )
})

test("buildUiResourceMeta result only has 'ui' key at top level", () => {
  const result = buildUiResourceMeta("ui://x")
  const keys = Object.keys(result)
  assert.deepStrictEqual(keys, ["ui"], `Expected only ['ui'], got: ${JSON.stringify(keys)}`)
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
