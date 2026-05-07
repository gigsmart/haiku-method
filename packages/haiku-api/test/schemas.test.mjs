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
	WS_MAX_FRAME_BYTES,
	WsAckMessageSchema,
	WsAnswerMessageSchema,
	// websocket
	WsClientMessageSchema,
	WsDecideMessageSchema,
	WsErrorMessageSchema,
	WsSelectMessageSchema,
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
	test("parses valid with location", () => {
		assertValid(InlineCommentSchema, {
			selectedText: "the quick brown",
			comment: "why?",
			paragraph: 2,
			location: "knowledge/DISCOVERY.md",
		})
	})
	test("rejects invalid", () => {
		assertInvalid(InlineCommentSchema, {
			selectedText: "x",
			paragraph: 2,
		})
	})
	test("rejects location > 500 chars", () => {
		assertInvalid(InlineCommentSchema, {
			selectedText: "x",
			comment: "c",
			paragraph: 0,
			location: "a".repeat(501),
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

// ─── Cap-boundary coverage for annotation primitives (FB-28) ────────────

describe("schemas/common.ts — PinSchema text cap", () => {
	test("accepts max-length text (1,000 chars)", () => {
		assertValid(PinSchema, { x: 0, y: 0, text: "a".repeat(1_000) })
	})
	test("rejects text > 1,000 chars", () => {
		assertInvalid(PinSchema, { x: 0, y: 0, text: "a".repeat(1_001) })
	})
})

describe("schemas/common.ts — InlineCommentSchema caps", () => {
	test("accepts max-length selectedText (2,000) + comment (10,000)", () => {
		assertValid(InlineCommentSchema, {
			selectedText: "s".repeat(2_000),
			comment: "c".repeat(10_000),
			paragraph: 0,
		})
	})
	test("rejects selectedText > 2,000 chars", () => {
		assertInvalid(InlineCommentSchema, {
			selectedText: "s".repeat(2_001),
			comment: "c",
			paragraph: 0,
		})
	})
	test("rejects comment > 10,000 chars", () => {
		assertInvalid(InlineCommentSchema, {
			selectedText: "s",
			comment: "c".repeat(10_001),
			paragraph: 0,
		})
	})
})

describe("schemas/common.ts — ReviewAnnotationsSchema screenshot cap", () => {
	test("accepts max-length screenshot (65,536 chars)", () => {
		assertValid(ReviewAnnotationsSchema, { screenshot: "s".repeat(65_536) })
	})
	test("rejects screenshot > 65,536 chars", () => {
		assertInvalid(ReviewAnnotationsSchema, { screenshot: "s".repeat(65_537) })
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
	// DirectionSelectRequestSchema is a discriminated union on `mode`:
	// { mode: "select", archetype, comments?, annotations? } |
	// { mode: "regenerate", keep, comments? } |
	// { mode: "upload", files[], comments? } |
	// { mode: "generate", comments? }. The intake-first flow (upload +
	// generate modes) was added 2026-05-06 — the picker opens with no
	// archetypes so the user can either upload finished designs or
	// signal they want the agent to produce variants. The legacy
	// `parameters` field on the original shape no longer exists.
	test("parses valid", () => {
		assertValid(DirectionSelectRequestSchema, {
			mode: "select",
			archetype: "minimalist",
		})
	})
	test("parses valid (regenerate)", () => {
		assertValid(DirectionSelectRequestSchema, {
			mode: "regenerate",
			keep: ["minimalist"],
		})
	})
	test("parses valid (upload)", () => {
		assertValid(DirectionSelectRequestSchema, {
			mode: "upload",
			files: [
				{
					filename: "mobile-dashboard.png",
					data_url: "data:image/png;base64,iVBORw0KGgo=",
					caption: "logged-in state",
				},
			],
		})
	})
	test("parses valid (generate intake signal)", () => {
		assertValid(DirectionSelectRequestSchema, {
			mode: "generate",
			comments: "lean minimal",
		})
	})
	test("rejects missing mode", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			archetype: "minimalist",
		})
	})
	test("rejects archetype longer than 64 chars", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			mode: "select",
			archetype: "x".repeat(65),
		})
	})
	test("rejects comments longer than 10,000 chars", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			mode: "select",
			archetype: "minimalist",
			comments: "x".repeat(10_001),
		})
	})
	test("rejects upload with zero files", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			mode: "upload",
			files: [],
		})
	})
	test("rejects upload with more than 20 files", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			mode: "upload",
			files: Array.from({ length: 21 }, (_, i) => ({
				filename: `f-${i}.png`,
				data_url: "data:image/png;base64,iVBORw0KGgo=",
			})),
		})
	})
	test("rejects upload file exceeding data_url cap", () => {
		assertInvalid(DirectionSelectRequestSchema, {
			mode: "upload",
			files: [
				{
					filename: "huge.png",
					data_url: `data:image/png;base64,${"x".repeat(1_500_001)}`,
				},
			],
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

describe("schemas/feedback.ts — FeedbackItemSchema string caps", () => {
	test("accepts max-length title/body/author/source_ref/closed_by", () => {
		assertValid(FeedbackItemSchema, {
			...validFeedbackItem,
			title: "a".repeat(200),
			body: "b".repeat(10_000),
			author: "c".repeat(200),
			source_ref: "d".repeat(1_000),
			closed_by: "e".repeat(200),
		})
	})
	test("rejects title > 200", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			title: "a".repeat(201),
		})
	})
	test("rejects body > 10_000", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			body: "b".repeat(10_001),
		})
	})
	test("rejects author > 200", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			author: "c".repeat(201),
		})
	})
	test("rejects source_ref > 1_000", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			source_ref: "d".repeat(1_001),
		})
	})
	test("rejects closed_by > 200", () => {
		assertInvalid(FeedbackItemSchema, {
			...validFeedbackItem,
			closed_by: "e".repeat(201),
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

describe("schemas/feedback.ts — FeedbackCreateRequestSchema string caps", () => {
	test("accepts max-length title/body/author/source_ref", () => {
		assertValid(FeedbackCreateRequestSchema, {
			title: "a".repeat(200),
			body: "b".repeat(10_000),
			author: "c".repeat(200),
			source_ref: "d".repeat(1_000),
		})
	})
	test("rejects title > 200", () => {
		assertInvalid(FeedbackCreateRequestSchema, {
			title: "a".repeat(201),
			body: "b",
		})
	})
	test("rejects body > 10_000", () => {
		assertInvalid(FeedbackCreateRequestSchema, {
			title: "t",
			body: "b".repeat(10_001),
		})
	})
	test("rejects author > 200", () => {
		assertInvalid(FeedbackCreateRequestSchema, {
			title: "t",
			body: "b",
			author: "c".repeat(201),
		})
	})
	test("rejects source_ref > 1_000", () => {
		assertInvalid(FeedbackCreateRequestSchema, {
			title: "t",
			body: "b",
			source_ref: "d".repeat(1_001),
		})
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

describe("schemas/feedback.ts — FeedbackUpdateRequestSchema closed_by cap", () => {
	test("accepts max-length closed_by", () => {
		assertValid(FeedbackUpdateRequestSchema, {
			closed_by: "u".repeat(200),
		})
	})
	test("rejects closed_by > 200", () => {
		assertInvalid(FeedbackUpdateRequestSchema, {
			closed_by: "u".repeat(201),
		})
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
			mode: "select",
			archetype: "minimalist",
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

// ─── Cap-boundary coverage for WS envelopes (FB-28) ─────────────────────

describe("schemas/websocket.ts — WS_MAX_FRAME_BYTES constant", () => {
	test("equals 65,536 (matches socket-layer cap)", () => {
		if (WS_MAX_FRAME_BYTES !== 65_536) {
			throw new Error(`WS_MAX_FRAME_BYTES drift: ${WS_MAX_FRAME_BYTES}`)
		}
	})
})

describe("schemas/websocket.ts — WsDecideMessageSchema caps", () => {
	test("accepts max-length decision (32) + feedback (10,000)", () => {
		assertValid(WsDecideMessageSchema, {
			type: "decide",
			decision: "a".repeat(32),
			feedback: "f".repeat(10_000),
		})
	})
	test("rejects decision > 32", () => {
		assertInvalid(WsDecideMessageSchema, {
			type: "decide",
			decision: "a".repeat(33),
		})
	})
	test("rejects feedback > 10,000", () => {
		assertInvalid(WsDecideMessageSchema, {
			type: "decide",
			decision: "approved",
			feedback: "f".repeat(10_001),
		})
	})
})

describe("schemas/websocket.ts — WsAnswerMessageSchema feedback cap", () => {
	test("accepts max-length feedback (10,000)", () => {
		assertValid(WsAnswerMessageSchema, {
			type: "answer",
			answers: [],
			feedback: "f".repeat(10_000),
		})
	})
	test("rejects feedback > 10,000", () => {
		assertInvalid(WsAnswerMessageSchema, {
			type: "answer",
			answers: [],
			feedback: "f".repeat(10_001),
		})
	})
})

describe("schemas/websocket.ts — WsSelectMessageSchema caps", () => {
	// WsSelectMessageSchema requires `mode: "select" | "regenerate"`. No
	// `parameters` or `annotations.screenshot` field — those were removed
	// when the schema migrated to discriminated-union semantics.
	test("accepts max-length archetype (64) + comments (10,000) + nested pin caps", () => {
		assertValid(WsSelectMessageSchema, {
			type: "select",
			mode: "select",
			archetype: "a".repeat(64),
			comments: "c".repeat(10_000),
			annotations: {
				pins: [{ x: 0, y: 0, text: "p".repeat(1_000) }],
			},
		})
	})
	test("rejects archetype > 64", () => {
		assertInvalid(WsSelectMessageSchema, {
			type: "select",
			mode: "select",
			archetype: "a".repeat(65),
		})
	})
	test("rejects comments > 10,000", () => {
		assertInvalid(WsSelectMessageSchema, {
			type: "select",
			mode: "select",
			archetype: "a",
			comments: "c".repeat(10_001),
		})
	})
	test("rejects annotations.pins[].text > 1,000", () => {
		assertInvalid(WsSelectMessageSchema, {
			type: "select",
			mode: "select",
			archetype: "a",
			annotations: { pins: [{ x: 0, y: 0, text: "p".repeat(1_001) }] },
		})
	})
})

describe("schemas/websocket.ts — WsAckMessageSchema caps", () => {
	test("accepts max-length decision (32) + feedback (10,000)", () => {
		assertValid(WsAckMessageSchema, {
			type: "ack",
			ok: true,
			decision: "a".repeat(32),
			feedback: "f".repeat(10_000),
		})
	})
	test("rejects decision > 32", () => {
		assertInvalid(WsAckMessageSchema, {
			type: "ack",
			ok: true,
			decision: "a".repeat(33),
		})
	})
	test("rejects feedback > 10,000", () => {
		assertInvalid(WsAckMessageSchema, {
			type: "ack",
			ok: true,
			feedback: "f".repeat(10_001),
		})
	})
})

describe("schemas/websocket.ts — WsErrorMessageSchema error cap", () => {
	test("accepts max-length error (500)", () => {
		assertValid(WsErrorMessageSchema, {
			type: "error",
			error: "e".repeat(500),
		})
	})
	test("rejects error > 500", () => {
		assertInvalid(WsErrorMessageSchema, {
			type: "error",
			error: "e".repeat(501),
		})
	})
})

describe("schemas/websocket.ts — WsSessionUpdateMessageSchema caps", () => {
	test("accepts max-length session_id (64) + status (32) + decision (32) + feedback (10,000)", () => {
		assertValid(WsSessionUpdateMessageSchema, {
			type: "session-update",
			session_id: "s".repeat(64),
			status: "t".repeat(32),
			decision: "d".repeat(32),
			feedback: "f".repeat(10_000),
		})
	})
	test("rejects session_id > 64", () => {
		assertInvalid(WsSessionUpdateMessageSchema, {
			type: "session-update",
			session_id: "s".repeat(65),
			status: "pending",
		})
	})
	test("rejects status > 32", () => {
		assertInvalid(WsSessionUpdateMessageSchema, {
			type: "session-update",
			session_id: "s",
			status: "t".repeat(33),
		})
	})
})

// ─── Frame-size superRefine boundary (FB-28) ────────────────────────────

describe("schemas/websocket.ts — WsClientMessageSchema frame-size refine", () => {
	test("accepts payload at exactly the frame-size cap (screenshot-padded)", () => {
		// Build a decide payload whose serialized size lands at exactly
		// WS_MAX_FRAME_BYTES. Use annotations.screenshot as the padding
		// knob; it is capped at 65,536 chars (same as the frame cap), so
		// the per-field cap and the frame cap fire at the same boundary.
		const shellBase = {
			type: "decide",
			decision: "approved",
			annotations: { screenshot: "" },
		}
		const shellSize = JSON.stringify(shellBase).length
		const padLen = WS_MAX_FRAME_BYTES - shellSize
		const payload = {
			...shellBase,
			annotations: { screenshot: "x".repeat(padLen) },
		}
		if (JSON.stringify(payload).length !== WS_MAX_FRAME_BYTES) {
			throw new Error(
				`boundary payload size drift: ${JSON.stringify(payload).length}`,
			)
		}
		assertValid(WsClientMessageSchema, payload)
	})

	test("rejects payload whose serialized size > frame cap via pin array overflow", () => {
		// Pins array has no length cap; PinSchema.text is capped at 1,000.
		// 100 pins × ~1,030 bytes each ≈ ~103 KB — exceeds the 64 KB frame
		// cap without tripping any per-field cap, exercising the superRefine.
		const pins = Array.from({ length: 100 }, () => ({
			x: 0,
			y: 0,
			text: "x".repeat(1_000),
		}))
		const payload = {
			type: "decide",
			decision: "approved",
			annotations: { pins },
		}
		if (JSON.stringify(payload).length <= WS_MAX_FRAME_BYTES) {
			throw new Error(
				`frame-overflow test payload too small: ${JSON.stringify(payload).length}`,
			)
		}
		assertInvalid(WsClientMessageSchema, payload)
	})
})

describe("schemas/websocket.ts — WsServerMessageSchema frame-size refine", () => {
	test("accepts well-formed frame whose size is under the cap", () => {
		// Server envelopes have no unbounded-array escape hatch once field
		// caps are installed — a lone server frame cannot exceed the 64 KB
		// frame cap. This test verifies the refine is installed (doesn't
		// reject the happy path) by round-tripping a maximum-size ack.
		assertValid(WsServerMessageSchema, {
			type: "ack",
			ok: true,
			feedback: "f".repeat(10_000),
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
	FEEDBACK_CREATE_MAX_BYTES,
	RevisitReasonSchema,
	RevisitRequestSchema,
	RevisitResponseSchema,
	ROUTE_BODY_LIMITS,
	RouteTransportSchema,
	routeBodyLimit,
	routes,
	SessionTokenSchema,
	TransportInvariantSchema,
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

describe("schemas/revisit.ts — RevisitReasonSchema string caps", () => {
	test("accepts max-length title/body", () => {
		assertValid(RevisitReasonSchema, {
			title: "t".repeat(200),
			body: "b".repeat(10_000),
		})
	})
	test("rejects title > 200", () => {
		assertInvalid(RevisitReasonSchema, {
			title: "t".repeat(201),
			body: "b",
		})
	})
	test("rejects body > 10_000", () => {
		assertInvalid(RevisitReasonSchema, {
			title: "t",
			body: "b".repeat(10_001),
		})
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

describe("schemas/revisit.ts — RevisitRequestSchema caps", () => {
	test("accepts 50 reasons", () => {
		const reasons = Array.from({ length: 50 }, () => ({
			title: "t",
			body: "b",
		}))
		assertValid(RevisitRequestSchema, { reasons })
	})
	test("rejects 51 reasons", () => {
		const reasons = Array.from({ length: 51 }, () => ({
			title: "t",
			body: "b",
		}))
		assertInvalid(RevisitRequestSchema, { reasons })
	})
	test("accepts max-length stage", () => {
		assertValid(RevisitRequestSchema, { stage: "s".repeat(200) })
	})
	test("rejects stage > 200", () => {
		assertInvalid(RevisitRequestSchema, { stage: "s".repeat(201) })
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

describe("schemas/auth.ts — TransportInvariantSchema", () => {
	test("parses 'loopback'", () => {
		assertValid(TransportInvariantSchema, "loopback")
	})
	test("parses 'token'", () => {
		assertValid(TransportInvariantSchema, "token")
	})
	test("rejects other variants", () => {
		assertInvalid(TransportInvariantSchema, "public")
		assertInvalid(TransportInvariantSchema, "")
	})
})

describe("schemas/auth.ts — SessionTokenSchema", () => {
	test("parses minimum valid (token + issued_at)", () => {
		assertValid(SessionTokenSchema, {
			token: "t",
			issued_at: "2026-04-21T00:00:00Z",
		})
	})
	test("parses full valid (with expires_at)", () => {
		assertValid(SessionTokenSchema, {
			token: "t".repeat(512),
			issued_at: "2026-04-21T00:00:00Z",
			expires_at: "2026-04-22T00:00:00Z",
		})
	})
	test("rejects empty token", () => {
		assertInvalid(SessionTokenSchema, {
			token: "",
			issued_at: "2026-04-21T00:00:00Z",
		})
	})
	test("rejects oversize token (> 512 chars)", () => {
		assertInvalid(SessionTokenSchema, {
			token: "t".repeat(513),
			issued_at: "2026-04-21T00:00:00Z",
		})
	})
	test("rejects missing issued_at", () => {
		assertInvalid(SessionTokenSchema, { token: "t" })
	})
	test("rejects oversize issued_at (> 64 chars)", () => {
		assertInvalid(SessionTokenSchema, {
			token: "t",
			issued_at: "x".repeat(65),
		})
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
		if (ROUTE_BODY_LIMITS.feedbackCreate !== FEEDBACK_CREATE_MAX_BYTES) {
			throw new Error("ROUTE_BODY_LIMITS.feedbackCreate drift")
		}
		if (DEFAULT_BODY_MAX_BYTES !== 1_048_576) {
			throw new Error("DEFAULT_BODY_MAX_BYTES drift")
		}
		if (FEEDBACK_BODY_MAX_BYTES !== 131_072) {
			throw new Error("FEEDBACK_BODY_MAX_BYTES drift")
		}
		if (FEEDBACK_CREATE_MAX_BYTES !== 8_388_608) {
			throw new Error("FEEDBACK_CREATE_MAX_BYTES drift")
		}
	})

	test("feedback POST advertises create cap, PUT advertises update cap", () => {
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
		if (post?.maxBodyBytes !== FEEDBACK_CREATE_MAX_BYTES) {
			throw new Error("POST /api/feedback cap drift (expected create cap)")
		}
		if (put?.maxBodyBytes !== FEEDBACK_BODY_MAX_BYTES) {
			throw new Error("PUT /api/feedback cap drift")
		}
	})

	test("routeBodyLimit() returns create cap for feedback POST", () => {
		const cap = routeBodyLimit("POST", "/api/feedback/{intent}/{stage}")
		if (cap !== FEEDBACK_CREATE_MAX_BYTES) {
			throw new Error(`feedback POST cap drift: ${cap}`)
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
