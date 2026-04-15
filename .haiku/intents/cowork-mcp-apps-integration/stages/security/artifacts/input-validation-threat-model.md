---
title: Input Validation Threat Model — Unit 02
unit: unit-02-input-validation-audit
hat: threat-modeler
created_at: '2026-04-15'
status: pass
---

# Input Validation Threat Model — Unit 02

## Attack Surface

The `haiku_cowork_review_submit` tool is the only external input path for the MCP Apps review flow. All three session types flow through one discriminated union validator.

## Threat Vectors

### TV-1: Missing or unknown `session_type`
Attack: Omit `session_type` or pass an unknown value (e.g., `"admin"`)
Defense: `z.discriminatedUnion("session_type", [...])` — only three literal values accepted; anything else fails Zod parsing immediately before reaching handler logic.

### TV-2: Non-UUID `session_id`
Attack: Pass `session_id: "../../etc/passwd"` or empty string
Defense: `z.string().uuid()` on every branch — only RFC 4122 UUID format accepted.

### TV-3: Empty `answers` array in question branch
Attack: Pass `answers: []` to bypass `.min(1)` validation
Defense: `z.array(QuestionAnswerSchema).min(1)` rejects empty arrays. Empty string as archetype in design_direction branch also rejected by `.min(1)`.

### TV-4: XSS payload in `feedback` field
Attack: `feedback: "<script>alert(1)</script>"`
Defense: `feedback` is a free-form `z.string()` — schema accepts it (correct behavior; feedback is text data). Server stores it in-memory only. It never reaches `innerHTML` in any server-side template path (templates use `escapeHtml()`).

### TV-5: Tampered `session_id` pointing to another session
Attack: Craft a valid UUID that belongs to a different session type
Defense: `session.session_type !== input.session_type` check at server.ts:1060 returns error. Also `session.status !== "pending"` check prevents double-submission.

### TV-6: Extra fields injected into payload
Attack: Add fields like `admin: true` to influence session state
Defense: Zod schemas use `.object()` which strips unknown keys by default in Zod v3. The `input` object only contains validated fields from the schema.

## Assessment

All identified input validation attack vectors are covered by the schema design. No injection path to session state mutation via raw input exists. The audit hat can proceed to verify the evidence directly.
