/**
 * Routes coverage test — structurally asserts that every concrete HTTP handler
 * in packages/haiku/src/http.ts has a matching entry in routes.ts.
 *
 * We scan http.ts for path-template literals (the `path.match(/...$/)` blocks
 * in handleRequest) and compare against the routes array. This is a grep-based
 * check, not an import — unit-01 must not pull haiku into its dependency graph.
 */

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { routes } from "../dist/index.js"
import { describe, summary, test } from "./helpers.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..", "..", "..")

// Route literals were originally all in packages/haiku/src/http.ts. After
// the god-file breakup (#245) they moved into packages/haiku/src/http/*.ts
// — read both so the fingerprint scan still covers the full surface.
import { readdirSync } from "node:fs"

const httpTsPath = join(repoRoot, "packages", "haiku", "src", "http.ts")
const httpDir = join(repoRoot, "packages", "haiku", "src", "http")
let httpSrc = readFileSync(httpTsPath, "utf8")
for (const entry of readdirSync(httpDir, { withFileTypes: true })) {
	if (entry.isFile() && entry.name.endsWith(".ts")) {
		httpSrc += "\n" + readFileSync(join(httpDir, entry.name), "utf8")
	}
}

/**
 * Path templates we expect to see represented in routes.ts. Keep this list
 * in lockstep with the concrete handlers in handleRequest() (http.ts lines
 * 1376-1520) and the WebSocket upgrade path in handleUpgrade (~line 799).
 *
 * Pattern: each entry is a `[method, template]` pair. `template` is the
 * OpenAPI-style path used by the routes array.
 */
const EXPECTED = [
	["GET", "/files/{sessionId}/{path}"],
	["GET", "/api/session/{sessionId}"],
	["HEAD", "/api/session/{sessionId}/heartbeat"],
	["GET", "/review/{sessionId}"],
	["POST", "/review/{sessionId}/decide"],
	["GET", "/mockups/{sessionId}/{path}"],
	["GET", "/wireframe/{sessionId}/{path}"],
	["GET", "/stage-artifacts/{sessionId}/{path}"],
	["GET", "/direction/{sessionId}"],
	["POST", "/direction/{sessionId}/select"],
	["GET", "/question-image/{sessionId}/{index}"],
	["GET", "/question/{sessionId}"],
	["POST", "/question/{sessionId}/answer"],
	["POST", "/api/revisit/{sessionId}"],
	["GET", "/api/feedback/{intent}/{stage}"],
	["POST", "/api/feedback/{intent}/{stage}"],
	["PUT", "/api/feedback/{intent}/{stage}/{feedbackId}"],
	["DELETE", "/api/feedback/{intent}/{stage}/{feedbackId}"],
	["POST", "/api/feedback/{intent}/{stage}/{feedbackId}/replies"],
	["GET", "/api/feedback-attachment/{intent}/{stage}/{filename}"],
	["GET", "/health"],
	["WS", "/ws/session/{sessionId}"],
]

/**
 * Each expected route should be rooted in http.ts. We spot-check via a small
 * fingerprint — the Fastify route path literal used when registering the
 * handler. Keep these in lockstep with the `instance.{get,post,…}(…)` calls
 * in http.ts.
 */
const HTTP_FINGERPRINTS = [
	'"/files/:sessionId/*"',
	'"/api/session/:sessionId"',
	'"/api/session/:sessionId/heartbeat"',
	'"/review/:sessionId"',
	'"/review/:sessionId/decide"',
	'"/mockups/:sessionId/*"',
	'"/wireframe/:sessionId/*"',
	'"/stage-artifacts/:sessionId/*"',
	'"/direction/:sessionId"',
	'"/direction/:sessionId/select"',
	'"/question-image/:sessionId/:index"',
	'"/question/:sessionId"',
	'"/question/:sessionId/answer"',
	'"/api/revisit/:sessionId"',
	'"/api/feedback/:intent/:stage"',
	'"/api/feedback/:intent/:stage/:feedbackId"',
	'"/api/feedback/:intent/:stage/:feedbackId/replies"',
	'"/api/feedback-attachment/:intent/:stage/:filename"',
	'"/health"',
	'"/ws/session/:sessionId"',
]

describe("routes.ts — coverage vs packages/haiku/src/http.ts", () => {
	test("every expected route is present in routes.ts", () => {
		const have = new Set(routes.map((r) => `${r.method} ${r.pathTemplate}`))
		const missing = []
		for (const [m, t] of EXPECTED) {
			if (!have.has(`${m} ${t}`)) missing.push(`${m} ${t}`)
		}
		if (missing.length > 0) {
			throw new Error(`Missing routes.ts entries: ${missing.join(", ")}`)
		}
	})

	test("routes.ts contains no extras beyond the expected set", () => {
		const expected = new Set(EXPECTED.map(([m, t]) => `${m} ${t}`))
		const extras = routes
			.map((r) => `${r.method} ${r.pathTemplate}`)
			.filter((k) => !expected.has(k))
		if (extras.length > 0) {
			throw new Error(`Unexpected routes.ts entries: ${extras.join(", ")}`)
		}
	})

	test("every route has a unique operationId", () => {
		const ids = routes.map((r) => r.operationId)
		const seen = new Set()
		for (const id of ids) {
			if (seen.has(id)) throw new Error(`Duplicate operationId: ${id}`)
			seen.add(id)
		}
	})

	test("every route has a non-empty summary", () => {
		for (const r of routes) {
			if (!r.summary || r.summary.length < 5) {
				throw new Error(
					`Route ${r.method} ${r.pathTemplate} has a missing/short summary`,
				)
			}
		}
	})

	test("http.ts contains each expected handler fingerprint", () => {
		const missing = HTTP_FINGERPRINTS.filter((fp) => !httpSrc.includes(fp))
		if (missing.length > 0) {
			throw new Error(
				`Fingerprints missing from http.ts — the route table may be stale: ${missing.join(", ")}`,
			)
		}
	})
})

summary()
