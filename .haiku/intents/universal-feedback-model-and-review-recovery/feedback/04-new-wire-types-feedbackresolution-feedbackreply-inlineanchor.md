---
title: New wire types FeedbackResolution/FeedbackReply/FeedbackInlineAnchor shipped
  in haiku-api with no product-stage spec coverage
status: closed
origin: studio-review
author: cross-stage-consistency
author_type: agent
created_at: '2026-04-24T19:30:00Z'
visit: 0
source_ref: null
addressed_by: null
closed_by: intent-fix:FB-04:bolt-1
---

Three substantial new types are present in the shipped `packages/haiku-api/src/schemas/` that have no corresponding specification in the product-stage artifacts:

**1. `FeedbackResolutionSchema`** (`common.ts:56–61`): `question | inline_fix | stage_revisit | upstream_rewind`
- Routing hint for the FSM's feedback resolver. Controls how the feedback fix loop is dispatched.
- Not in `knowledge/DATA-CONTRACTS.md`, not in `knowledge/ACCEPTANCE-CRITERIA.md`, not in any Gherkin feature file.
- Appears on both `FeedbackItemSchema` (GET response) and `FeedbackCreateRequestSchema` (POST body) and `FeedbackUpdateRequestSchema` (PUT body).

**2. `FeedbackReplySchema`** (`common.ts:66–80`): threaded reply on a feedback item
- Has its own `author`, `author_type`, `body`, `created_at` fields.
- Corresponds to `POST /api/feedback/:intent/:stage/:id/replies` endpoint (`FeedbackReplyCreateRequestSchema`, `FeedbackReplyCreateResponseSchema` in `feedback.ts:262–297`).
- No product acceptance criteria for reply threading. Not in any feature file. The DATA-CONTRACTS spec lists exactly 4 HTTP endpoints (GET/POST/PUT/DELETE on `/api/feedback/`) — the replies endpoint is a 5th.

**3. `FeedbackInlineAnchorSchema`** (`feedback.ts:41–68`): inline text-anchor for comments on specific text spans
- `selected_text`, `paragraph`, `location`, `comment_id`, `file_path`, `content_sha` fields.
- Distinct from `FeedbackAnchorSchema` (pin annotations). Represents a text selection comment rather than a viewport pin.
- Not described in design artifacts (design brief describes pin annotations but not inline-text anchors as a separate concept from `InlineCommentSchema`).
- The design's `InlineCommentSchema` in `common.ts:106–128` and `FeedbackInlineAnchorSchema` overlap in purpose but have different fields — the relationship is not specified.

**Files:**
- `packages/haiku-api/src/schemas/common.ts:56–81` — FeedbackResolutionSchema, FeedbackReplySchema
- `packages/haiku-api/src/schemas/feedback.ts:41–68` — FeedbackInlineAnchorSchema
- `packages/haiku-api/src/schemas/feedback.ts:262–297` — replies endpoint schemas
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DATA-CONTRACTS.md` — no coverage of these types
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/ACCEPTANCE-CRITERIA.md` — no coverage

**Impact:** These types are part of the shipped public API surface of `haiku-api`. External consumers have no spec to work from. The security stage's threat model did not analyze the `/replies` endpoint (security FB-07 flagged the reply endpoint missing from STRIDE analysis, confirming this gap propagated through security). The operations stage similarly could not audit an endpoint that wasn't in the product spec.

This is a cross-stage seam failure: development added features not in the product scope, and those features were therefore not reviewed for security (STRIDE) or operations (observability, runbooks) concerns.

**Fix:** Either add product-stage AC and Gherkin coverage for FeedbackResolution routing, reply threading, and inline-anchor comments — or explicitly scope these as v2 additions in the intent documentation with a note that security/operations review of these surfaces is pending.
