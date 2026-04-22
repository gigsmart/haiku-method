/**
 * Schema round-trip tests — one "parses valid" + one "rejects invalid" case
 * for every exported Zod schema. Traversed-by comments map each group to the
 * .feature files that cross the wire for that contract, so unit-02+ wiring
 * step-definitions has a direct handle.
 */

import {
	// common
	AuthorTypeSchema,
	// review
	buildOpenApi,
	// direction
	DirectionSelectRequestSchema,
	DirectionSelectResponseSchema,
	// feedback
	FeedbackCreateRequestSchema,
	FeedbackCreateResponseSchema,
	FeedbackDeleteResponseSchema,
	FeedbackItemSchema,
	FeedbackListResponseSchema,
	FeedbackOriginSchema,
	FeedbackStatusSchema,
	FeedbackSummarySchema,
	FeedbackUpdateRequestSchema,
	FeedbackUpdateResponseSchema,
	// files
	FileServeParamsSchema,
	GateTypeSchema,
	HeartbeatResponseSchema,
	InlineCommentSchema,
	PinSchema,
	QuestionAnnotationsSchema,
	// question
	QuestionAnswerRequestSchema,
	QuestionAnswerResponseSchema,
	QuestionImageParamsSchema,
	ReviewAnnotationsSchema,
	ReviewCurrentPayloadSchema,
	ReviewDecisionRequestSchema,
	ReviewDecisionResponseSchema,
	// session
	SessionPayloadSchema,
	SessionStatusSchema,
	SessionTypeSchema,
	WsAckMessageSchema,
	// websocket
	WsClientMessageSchema,
	WsErrorMessageSchema,
	WsServerMessageSchema,
	WsSessionUpdateMessageSchema,
} from "../dist/index.js"

import {
	assertInvalid,
	assertValid,
	describe,
	summary,
	test,
} from "./helpers.mjs"

// ─── common ──────────────────────────────────────────────────────────────
// Traversed by: every feature that crosses HTTP — these are shared primitives.

describe("schemas/common.ts — FeedbackOriginSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackOriginSchema, "adversarial-review")
		assertValid(FeedbackOriginSchema, "user-visual")
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackOriginSchema, "nope")
	})
})

describe("schemas/common.ts — FeedbackStatusSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackStatusSchema, "pending")
		assertValid(FeedbackStatusSchema, "fixing")
		assertValid(FeedbackStatusSchema, "closed")
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackStatusSchema, "done")
	})
})

describe("schemas/common.ts — AuthorTypeSchema", () => {
	test("parses valid", () => {
		assertValid(AuthorTypeSchema, "human")
		assertValid(AuthorTypeSchema, "agent")
	})
	test("rejects invalid", () => {
		assertInvalid(AuthorTypeSchema, "bot")
	})
})

describe("schemas/common.ts — PinSchema", () => {
	test("parses valid", () => {
		assertValid(PinSchema, { x: 0.5, y: 0.25, text: "fix this" })
	})
	test("rejects invalid", () => {
		assertInvalid(PinSchema, { x: "half", y: 0.25, text: "fix this" })
	})
})

describe("schemas/common.ts — InlineCommentSchema", () => {
	test("parses valid", () => {
		assertValid(InlineCommentSchema, {
			selectedText: "the quick brown",
			comment: "why?",
			paragraph: 2,
		})
	})
	test("rejects invalid", () => {
		assertInvalid(InlineCommentSchema, {
			selectedText: "x",
			paragraph: 2,
		})
	})
})

describe("schemas/common.ts — ReviewAnnotationsSchema", () => {
	test("parses valid", () => {
		assertValid(ReviewAnnotationsSchema, {
			pins: [{ x: 0.1, y: 0.2, text: "hi" }],
			comments: [],
		})
		assertValid(ReviewAnnotationsSchema, {})
	})
	test("rejects invalid", () => {
		assertInvalid(ReviewAnnotationsSchema, {
			pins: [{ x: 0.1, text: "hi" }],
		})
	})
})

describe("schemas/common.ts — QuestionAnnotationsSchema", () => {
	test("parses valid", () => {
		assertValid(QuestionAnnotationsSchema, { comments: [] })
		assertValid(QuestionAnnotationsSchema, {})
	})
	test("rejects invalid", () => {
		assertInvalid(QuestionAnnotationsSchema, { comments: "string" })
	})
})

describe("schemas/common.ts — SessionTypeSchema", () => {
	test("parses valid", () => {
		assertValid(SessionTypeSchema, "review")
		assertValid(SessionTypeSchema, "question")
		assertValid(SessionTypeSchema, "design_direction")
	})
	test("rejects invalid", () => {
		assertInvalid(SessionTypeSchema, "chat")
	})
})

describe("schemas/common.ts — SessionStatusSchema", () => {
	test("parses valid", () => {
		assertValid(SessionStatusSchema, "pending")
		assertValid(SessionStatusSchema, "decided")
		assertValid(SessionStatusSchema, "answered")
	})
	test("rejects invalid", () => {
		assertInvalid(SessionStatusSchema, "unknown")
	})
})

// ─── review ─────────────────────────────────────────────────────────────
// Traversed by: review-ui-feedback.feature, revisit-with-reasons.feature,
//               auto-revisit.feature.

describe("schemas/review.ts — ReviewDecisionRequestSchema", () => {
	test("parses valid", () => {
		assertValid(ReviewDecisionRequestSchema, {
			decision: "approved",
		})
		assertValid(ReviewDecisionRequestSchema, {
			decision: "changes_requested",
			feedback: "needs work",
			annotations: { pins: [{ x: 0, y: 0, text: "here" }] },
		})
	})
	test("rejects invalid", () => {
		assertInvalid(ReviewDecisionRequestSchema, { feedback: "only" })
	})
})

describe("schemas/review.ts — ReviewDecisionResponseSchema", () => {
	test("parses valid", () => {
		assertValid(ReviewDecisionResponseSchema, {
			ok: true,
			decision: "approved",
			feedback: "",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(ReviewDecisionResponseSchema, {
			ok: false,
			decision: "approved",
			feedback: "",
		})
	})
})

// ─── direction ─────────────────────────────────────────────────────────
// Traversed by: additive-elaborate.feature (design direction selection).

describe("schemas/direction.ts — DirectionSelectRequestSchema", () => {
	test("parses valid", () => {
		assertValid(DirectionSelectRequestSchema, {
			archetype: "minimalist",
			parameters: { density: 3, contrast: 7 },
		})
	})
	test("rejects invalid", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			archetype: "minimalist",
			parameters: { density: "three" },
		})
	})
})

describe("schemas/direction.ts — DirectionSelectResponseSchema", () => {
	test("parses valid", () => {
		assertValid(DirectionSelectResponseSchema, { ok: true })
	})
	test("rejects invalid", () => {
		assertInvalid(DirectionSelectResponseSchema, { ok: false })
	})
})

// ─── question ─────────────────────────────────────────────────────────
// Traversed by: additive-elaborate.feature, revisit-with-reasons.feature.

describe("schemas/question.ts — QuestionAnswerRequestSchema", () => {
	test("parses valid", () => {
		assertValid(QuestionAnswerRequestSchema, {
			answers: [
				{
					question: "q1",
					selectedOptions: ["a", "b"],
					otherText: "free",
				},
			],
			feedback: "notes",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(QuestionAnswerRequestSchema, {
			answers: [{ question: "q1" }],
		})
	})
})

describe("schemas/question.ts — QuestionAnswerResponseSchema", () => {
	test("parses valid", () => {
		assertValid(QuestionAnswerResponseSchema, { ok: true })
	})
	test("rejects invalid", () => {
		assertInvalid(QuestionAnswerResponseSchema, {})
	})
})

// ─── feedback ─────────────────────────────────────────────────────────
// Traversed by: feedback-crud.feature, review-ui-feedback.feature,
//               external-review-feedback.feature, auto-revisit.feature,
//               enforce-iteration-fix.feature.

const validFeedbackItem = {
	feedback_id: "FB-01",
	title: "Missing error handling",
	body: "The POST handler throws on malformed JSON.",
	status: "pending",
	origin: "adversarial-review",
	author: "agent",
	author_type: "agent",
	created_at: "2026-04-20T00:00:00.000Z",
	visit: 0,
	source_ref: null,
	closed_by: null,
}

describe("schemas/feedback.ts — FeedbackItemSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackItemSchema, validFeedbackItem)
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			status: "bogus",
		})
	})
})

describe("schemas/feedback.ts — FeedbackListResponseSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackListResponseSchema, {
			intent: "universal-feedback-model-and-review-recovery",
			stage: "development",
			count: 1,
			items: [validFeedbackItem],
		})
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackListResponseSchema, {
			intent: "x",
			stage: "y",
			count: "one",
			items: [],
		})
	})
})

describe("schemas/feedback.ts — FeedbackCreateRequestSchema", () => {
	test("parses valid", () => {
		const parsed = assertValid(FeedbackCreateRequestSchema, {
			title: "t",
			body: "b",
		})
		// default applied
		if (parsed.origin !== "user-visual") {
			throw new Error(
				`expected default origin user-visual, got ${parsed.origin}`,
			)
		}
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackCreateRequestSchema, { title: "", body: "b" })
	})
})

describe("schemas/feedback.ts — FeedbackCreateResponseSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackCreateResponseSchema, {
			feedback_id: "FB-02",
			file: ".haiku/intents/x/stages/y/feedback/02-z.md",
			status: "pending",
			message: "created",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackCreateResponseSchema, {
			feedback_id: "FB-02",
			file: "x",
			status: "addressed",
			message: "no",
		})
	})
})

describe("schemas/feedback.ts — FeedbackUpdateRequestSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackUpdateRequestSchema, { status: "addressed" })
		assertValid(FeedbackUpdateRequestSchema, { closed_by: "unit-07" })
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackUpdateRequestSchema, {})
	})
})

describe("schemas/feedback.ts — FeedbackUpdateResponseSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackUpdateResponseSchema, {
			feedback_id: "FB-01",
			updated_fields: ["status"],
			message: "updated",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackUpdateResponseSchema, {
			feedback_id: "FB-01",
			updated_fields: "status",
			message: "updated",
		})
	})
})

describe("schemas/feedback.ts — FeedbackDeleteResponseSchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackDeleteResponseSchema, {
			feedback_id: "FB-01",
			deleted: true,
			message: "deleted",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackDeleteResponseSchema, {
			feedback_id: "FB-01",
			deleted: false,
			message: "kept",
		})
	})
})

// ─── files ─────────────────────────────────────────────────────────────
// Traversed by: review-ui-feedback.feature (mockup serving), all features
//                that render rendered artifacts.

describe("schemas/files.ts — FileServeParamsSchema", () => {
	test("parses valid relative path", () => {
		assertValid(FileServeParamsSchema, {
			sessionId: "00000000-0000-0000-0000-000000000000",
			path: "artifacts/foo.html",
		})
	})

	// Unit-01 spec completion criterion
	// (unit-01-extract-haiku-api-package.md:109): every fixture in this list
	// must fail safeParse. Do NOT drop any; the reviewer asserts the full list.
	const adversarialFixtures = [
		"../",
		"%2e%2e%2f",
		"/etc/passwd",
		"foo\x00.png",
		"\\..\\",
		".",
		"",
		"a\0b",
	]

	for (const fixture of adversarialFixtures) {
		test(`rejects adversarial path: ${JSON.stringify(fixture)}`, () => {
			assertInvalid(FileServeParamsSchema, {
				sessionId: "00000000-0000-0000-0000-000000000000",
				path: fixture,
			})
		})
	}
})

describe("schemas/files.ts — QuestionImageParamsSchema", () => {
	test("parses valid", () => {
		assertValid(QuestionImageParamsSchema, {
			sessionId: "abc",
			index: 0,
		})
	})
	test("rejects invalid", () => {
		assertInvalid(QuestionImageParamsSchema, {
			sessionId: "abc",
			index: -1,
		})
	})
})

// ─── session ─────────────────────────────────────────────────────────
// Traversed by: additive-elaborate.feature, auto-revisit.feature,
//               review-ui-feedback.feature, revisit-with-reasons.feature,
//               feedback-crud.feature.

describe("schemas/session.ts — GateTypeSchema", () => {
	test("parses valid", () => {
		assertValid(GateTypeSchema, "auto")
		assertValid(GateTypeSchema, "ask")
		assertValid(GateTypeSchema, "external")
		assertValid(GateTypeSchema, "await")
	})
	test("rejects invalid", () => {
		assertInvalid(GateTypeSchema, "manual")
	})
})

describe("schemas/session.ts — HeartbeatResponseSchema", () => {
	test("parses valid", () => {
		assertValid(HeartbeatResponseSchema, {})
	})
	test("rejects invalid", () => {
		// z.object({}) accepts any object by default, so rejection requires a non-object
		assertInvalid(HeartbeatResponseSchema, "not-an-object")
	})
})

describe("schemas/session.ts — FeedbackSummarySchema", () => {
	test("parses valid", () => {
		assertValid(FeedbackSummarySchema, {
			pending: 1,
			addressed: 0,
			closed: 2,
			rejected: 0,
		})
	})
	test("rejects invalid", () => {
		assertInvalid(FeedbackSummarySchema, {
			pending: -1,
			addressed: 0,
			closed: 0,
			rejected: 0,
		})
	})
})

describe("schemas/session.ts — ReviewCurrentPayloadSchema", () => {
	test("parses valid", () => {
		assertValid(ReviewCurrentPayloadSchema, {
			intent: "x",
			stage: "development",
			phase: "execute",
			units: [{ slug: "unit-01", title: "Extract API", status: "completed" }],
			feedback_summary: { pending: 0, addressed: 0, closed: 0, rejected: 0 },
			stages: [{ name: "development", status: "active", phase: "execute" }],
		})
		assertValid(ReviewCurrentPayloadSchema, {
			intent: "x",
			stage: null,
			units: [],
			feedback_summary: { pending: 0, addressed: 0, closed: 0, rejected: 0 },
			stages: [],
		})
	})
	test("rejects invalid", () => {
		assertInvalid(ReviewCurrentPayloadSchema, {
			intent: "x",
			stage: null,
			units: [],
			feedback_summary: { pending: 0 }, // missing fields
			stages: [],
		})
	})
})

describe("schemas/session.ts — SessionPayloadSchema (discriminated union)", () => {
	test("parses valid (review branch)", () => {
		assertValid(SessionPayloadSchema, {
			session_id: "abc",
			session_type: "review",
			status: "pending",
		})
	})
	test("parses valid (question branch)", () => {
		assertValid(SessionPayloadSchema, {
			session_id: "abc",
			session_type: "question",
			status: "pending",
		})
	})
	test("parses valid (design_direction branch)", () => {
		assertValid(SessionPayloadSchema, {
			session_id: "abc",
			session_type: "design_direction",
			status: "pending",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(SessionPayloadSchema, {
			session_id: "abc",
			session_type: "unknown",
			status: "pending",
		})
	})
})

// ─── websocket ─────────────────────────────────────────────────────────
// Traversed by: review-ui-feedback.feature (live decide/answer/select over ws).

describe("schemas/websocket.ts — WsClientMessageSchema", () => {
	test("parses valid (decide)", () => {
		assertValid(WsClientMessageSchema, {
			type: "decide",
			decision: "approved",
		})
	})
	test("parses valid (answer)", () => {
		assertValid(WsClientMessageSchema, {
			type: "answer",
			answers: [{ question: "q", selectedOptions: ["a"] }],
		})
	})
	test("parses valid (select)", () => {
		assertValid(WsClientMessageSchema, {
			type: "select",
			archetype: "minimalist",
			parameters: { density: 3 },
		})
	})
	test("rejects invalid", () => {
		assertInvalid(WsClientMessageSchema, { type: "unknown" })
	})
})

describe("schemas/websocket.ts — WsServerMessageSchema", () => {
	test("parses valid (ack)", () => {
		assertValid(WsServerMessageSchema, {
			type: "ack",
			ok: true,
			decision: "approved",
			feedback: "",
		})
	})
	test("parses valid (error)", () => {
		assertValid(WsServerMessageSchema, {
			type: "error",
			error: "Direction already selected",
		})
	})
	test("parses valid (session-update)", () => {
		assertValid(WsServerMessageSchema, {
			type: "session-update",
			session_id: "abc",
			status: "decided",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(WsServerMessageSchema, { type: "ack", ok: false })
	})
})

describe("schemas/websocket.ts — individual envelope schemas", () => {
	test("WsAckMessageSchema parses valid", () => {
		assertValid(WsAckMessageSchema, { type: "ack", ok: true })
	})
	test("WsAckMessageSchema rejects invalid", () => {
		assertInvalid(WsAckMessageSchema, { type: "ack", ok: "true" })
	})
	test("WsErrorMessageSchema parses valid", () => {
		assertValid(WsErrorMessageSchema, { type: "error", error: "bad" })
	})
	test("WsErrorMessageSchema rejects invalid", () => {
		assertInvalid(WsErrorMessageSchema, { type: "error" })
	})
	test("WsSessionUpdateMessageSchema parses valid", () => {
		assertValid(WsSessionUpdateMessageSchema, {
			type: "session-update",
			session_id: "abc",
			status: "pending",
		})
	})
	test("WsSessionUpdateMessageSchema rejects invalid", () => {
		assertInvalid(WsSessionUpdateMessageSchema, {
			type: "session-update",
			session_id: 123,
			status: "pending",
		})
	})
})

// buildOpenApi imported just to make sure it's wired up via the barrel
if (typeof buildOpenApi !== "function") {
	throw new Error("buildOpenApi not exported from haiku-api barrel")
}

// ─── revisit / validation / route metadata ───────────────────────────────

import {
	DEFAULT_BODY_MAX_BYTES,
	FEEDBACK_BODY_MAX_BYTES,
	routeBodyLimit,
	routes,
	RevisitReasonSchema,
	RevisitRequestSchema,
	RevisitResponseSchema,
	ROUTE_BODY_LIMITS,
	RouteTransportSchema,
	ValidationErrorSchema,
	ZodIssueWireSchema,
} from "../dist/index.js"

describe("schemas/revisit.ts — RevisitReasonSchema", () => {
	test("parses valid", () => {
		assertValid(RevisitReasonSchema, { title: "t", body: "b" })
	})
	test("rejects invalid", () => {
		assertInvalid(RevisitReasonSchema, { title: "", body: "b" })
		assertInvalid(RevisitReasonSchema, { title: "t" })
	})
})

describe("schemas/revisit.ts — RevisitRequestSchema", () => {
	test("parses valid (empty)", () => {
		assertValid(RevisitRequestSchema, {})
	})
	test("parses valid (with stage + reasons)", () => {
		assertValid(RevisitRequestSchema, {
			stage: "development",
			reasons: [{ title: "t", body: "b" }],
		})
	})
	test("rejects invalid (stage not a string)", () => {
		assertInvalid(RevisitRequestSchema, { stage: 5 })
	})
})

describe("schemas/revisit.ts — RevisitResponseSchema", () => {
	test("parses valid (minimum)", () => {
		assertValid(RevisitResponseSchema, {
			ok: true,
			action: "revisit",
			message: "rolled back",
		})
	})
	test("parses valid (full)", () => {
		assertValid(RevisitResponseSchema, {
			ok: true,
			action: "revisit",
			stage: "design",
			feedback_created: ["FB-01", "FB-02"],
			message: "rolled back",
		})
	})
	test("rejects invalid (missing action)", () => {
		assertInvalid(RevisitResponseSchema, { ok: true, message: "bad" })
	})
})

describe("schemas/common.ts — ValidationErrorSchema", () => {
	test("parses valid", () => {
		assertValid(ValidationErrorSchema, {
			error: "validation_failed",
			issues: [{ code: "invalid_type", message: "bad", path: ["title"] }],
		})
		assertValid(ValidationErrorSchema, {
			error: "validation_failed",
			issues: [],
		})
	})
	test("rejects invalid", () => {
		assertInvalid(ValidationErrorSchema, { error: "other", issues: [] })
	})
})

describe("schemas/common.ts — ZodIssueWireSchema", () => {
	test("parses valid (extra keys passthrough)", () => {
		assertValid(ZodIssueWireSchema, {
			code: "invalid_type",
			message: "bad",
			path: ["a", 0],
			expected: "string",
		})
	})
	test("rejects invalid (missing code)", () => {
		assertInvalid(ZodIssueWireSchema, { message: "bad", path: [] })
	})
})

describe("schemas/common.ts — RouteTransportSchema", () => {
	test("parses valid", () => {
		assertValid(RouteTransportSchema, "loopback")
	})
	test("rejects invalid", () => {
		assertInvalid(RouteTransportSchema, "public")
	})
})

describe("routes.ts — transport invariant + body caps", () => {
	test("every route declares transport='loopback'", () => {
		for (const r of routes) {
			if (r.transport !== "loopback") {
				throw new Error(`Route ${r.operationId} has non-loopback transport`)
			}
		}
	})

	test("ROUTE_BODY_LIMITS is sane", () => {
		if (ROUTE_BODY_LIMITS.default !== DEFAULT_BODY_MAX_BYTES) {
			throw new Error("ROUTE_BODY_LIMITS.default drift")
		}
		if (ROUTE_BODY_LIMITS.feedback !== FEEDBACK_BODY_MAX_BYTES) {
			throw new Error("ROUTE_BODY_LIMITS.feedback drift")
		}
		if (DEFAULT_BODY_MAX_BYTES !== 1_048_576) {
			throw new Error("DEFAULT_BODY_MAX_BYTES drift")
		}
		if (FEEDBACK_BODY_MAX_BYTES !== 131_072) {
			throw new Error("FEEDBACK_BODY_MAX_BYTES drift")
		}
	})

	test("feedback POST/PUT routes advertise 128 KiB cap", () => {
		const post = routes.find(
			(r) =>
				r.method === "POST" &&
				r.pathTemplate === "/api/feedback/{intent}/{stage}",
		)
		const put = routes.find(
			(r) =>
				r.method === "PUT" &&
				r.pathTemplate === "/api/feedback/{intent}/{stage}/{feedbackId}",
		)
		if (post?.maxBodyBytes !== FEEDBACK_BODY_MAX_BYTES) {
			throw new Error("POST /api/feedback cap drift")
		}
		if (put?.maxBodyBytes !== FEEDBACK_BODY_MAX_BYTES) {
			throw new Error("PUT /api/feedback cap drift")
		}
	})

	test("routeBodyLimit() returns feedback cap for feedback POST", () => {
		const cap = routeBodyLimit("POST", "/api/feedback/{intent}/{stage}")
		if (cap !== FEEDBACK_BODY_MAX_BYTES) {
			throw new Error(`feedback cap drift: ${cap}`)
		}
	})

	test("routeBodyLimit() returns default for non-feedback POST", () => {
		const cap = routeBodyLimit("POST", "/review/{sessionId}/decide")
		if (cap !== DEFAULT_BODY_MAX_BYTES) {
			throw new Error(`review decide cap drift: ${cap}`)
		}
	})

	test("routeBodyLimit() returns default for unknown route", () => {
		const cap = routeBodyLimit("POST", "/does/not/exist")
		if (cap !== DEFAULT_BODY_MAX_BYTES) {
			throw new Error(`unknown cap drift: ${cap}`)
		}
	})

	test("revisit route exists with RevisitRequestSchema", () => {
		const r = routes.find(
			(route) =>
				route.method === "POST" &&
				route.pathTemplate === "/api/revisit/{sessionId}",
		)
		if (!r) throw new Error("missing revisit route")
		if (r.request !== RevisitRequestSchema) {
			throw new Error("revisit request schema drift")
		}
		if (r.response !== RevisitResponseSchema) {
			throw new Error("revisit response schema drift")
		}
	})
})

summary()
