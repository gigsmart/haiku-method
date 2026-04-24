---
title: FeedbackCreateRequestSchema `author` field — trust boundary not characterized
status: closed
origin: adversarial-review
author: threat-coverage
author_type: agent
created_at: '2026-04-24T14:41:35Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-04:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

The `FeedbackCreateRequestSchema` in `packages/haiku-api/src/schemas/feedback.ts:116-123` exposes an optional `author` field with the comment: *"The server currently overwrites this with the authenticated session author; the field is reserved for future use when the handler begins to honor it."*

The http.ts handler at line 1526 does indeed hardcode `author: "user"`, so the field is inert today. However:

1. **The threat model does not document this as an intentional suppressed field.** A future developer could see the schema field, see the handler ignoring it, and "fix" it by wiring `parsed.data.author` through — inadvertently re-opening an author-spoofing vector where a caller could supply an arbitrary `author` string (e.g. `"admin"`, `"orchestrator"`) to the feedback item.

2. **The expanded threat model's S2 analysis (http.ts SPA identity spoofing) focuses on `author_type` hardening but does not mention the `author` free-text field.** While `author_type` is the enforcement-bearing field, `author` appears in git commit messages and audit displays — spoofed author strings could create misleading audit trails.

**Specific gap:** The threat model's coverage of the S/Spoofing category should note that `FeedbackCreateRequestSchema.author` is intentionally ignored by the handler today, document the rationale, and flag the risk of a future change wiring it through. Without this, the threat model does not cover the full input surface of the create endpoint.

**Files:** `packages/haiku-api/src/schemas/feedback.ts:116-123`, `packages/haiku/src/http.ts:1522-1530`, `stages/security/THREAT-MODEL.md §1/S`.

**Mitigation required:** Document in the threat model (Spoofing section) that the `author` field in `FeedbackCreateRequestSchema` is intentionally suppressed and explain why `author_type` (not `author`) is the security-bearing field.
