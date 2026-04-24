/**
 * OpenAPI emitter tests — verify the built OpenAPI document is 3.1, exposes
 * every expected path and operationId, and registers schemas under
 * components.schemas. External consumers cited in
 * external-review-feedback.feature (GitHub / GitLab integrations) read this
 * document as the published contract.
 */

import { buildOpenApi, routes } from "../dist/index.js"
import { describe, summary, test } from "./helpers.mjs"

const doc = buildOpenApi()

describe("openapi.ts — buildOpenApi()", () => {
	test('openapi version is "3.1.0"', () => {
		if (doc.openapi !== "3.1.0") {
			throw new Error(`expected 3.1.0, got ${doc.openapi}`)
		}
	})

	test("info.title and info.version are populated", () => {
		if (!doc.info?.title) throw new Error("info.title missing")
		if (!doc.info?.version) throw new Error("info.version missing")
	})

	test("every route's pathTemplate is in paths", () => {
		const missing = []
		for (const r of routes) {
			if (!doc.paths[r.pathTemplate]) missing.push(r.pathTemplate)
		}
		if (missing.length > 0) {
			throw new Error(`paths missing entries: ${missing.join(", ")}`)
		}
	})

	test("every HTTP route has an operation keyed by its method", () => {
		const missing = []
		for (const r of routes) {
			if (r.method === "WS") continue
			const pathItem = doc.paths[r.pathTemplate]
			const op = pathItem?.[r.method.toLowerCase()]
			if (!op) missing.push(`${r.method} ${r.pathTemplate}`)
			else if (op.operationId !== r.operationId) {
				throw new Error(
					`operationId mismatch on ${r.method} ${r.pathTemplate}: expected ${r.operationId}, got ${op.operationId}`,
				)
			}
		}
		if (missing.length > 0) {
			throw new Error(`Missing operations: ${missing.join(", ")}`)
		}
	})

	test("WebSocket routes are surfaced via x-websocket extension", () => {
		const ws = routes.find((r) => r.method === "WS")
		if (!ws) throw new Error("no WS route in routes.ts")
		const pathItem = doc.paths[ws.pathTemplate]
		if (!pathItem?.get?.["x-websocket"]) {
			throw new Error("WebSocket path missing x-websocket marker")
		}
	})

	test("components.schemas is populated", () => {
		const keys = Object.keys(doc.components.schemas)
		if (keys.length === 0) {
			throw new Error("components.schemas is empty")
		}
		// Spot-check a few expected schemas
		const expected = [
			"ListFeedbackResponse",
			"CreateFeedbackRequest",
			"CreateFeedbackResponse",
			"UpdateFeedbackRequest",
			"DeleteFeedbackResponse",
			"PostReviewDecideRequest",
			"PostReviewDecideResponse",
			"PostQuestionAnswerRequest",
			"PostDirectionSelectRequest",
			"GetReviewCurrentResponse",
			"GetSessionResponse",
		]
		const missing = expected.filter((k) => !(k in doc.components.schemas))
		if (missing.length > 0) {
			throw new Error(
				`components.schemas missing expected keys: ${missing.join(", ")}`,
			)
		}
	})

	test("every operationId on a body-having route is unique", () => {
		const ids = []
		for (const pathItem of Object.values(doc.paths)) {
			for (const [k, v] of Object.entries(pathItem)) {
				if (k === "parameters") continue
				const op = v
				if (op?.operationId) ids.push(op.operationId)
			}
		}
		const seen = new Set()
		for (const id of ids) {
			if (seen.has(id)) throw new Error(`Duplicate operationId in doc: ${id}`)
			seen.add(id)
		}
	})

	test("custom title/version flow through", () => {
		const custom = buildOpenApi({
			title: "Test API",
			version: "9.9.9",
			description: "test",
		})
		if (custom.info.title !== "Test API") throw new Error("title override lost")
		if (custom.info.version !== "9.9.9")
			throw new Error("version override lost")
	})
})

summary()
