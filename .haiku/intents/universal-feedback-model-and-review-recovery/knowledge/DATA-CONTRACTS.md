# Data Contracts: Universal Feedback Model and Review Recovery

Every field, every type, every error shape. This is the single source of truth for implementors and reviewers.

---

## 1. MCP Tool Contracts

All MCP tools return `{ content: [{ type: "text", text: string }], isError?: boolean }`. The `text` field contains JSON (success) or an error message (failure). All tools that mutate feedback files call `gitCommitState` after writing.

### 1.1 `haiku_feedback` (create)

Replaces the former Sentry bug-report tool (renamed to `haiku_report`).

**Input Schema:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | Must match existing intent slug (alphanumeric + hyphens) | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | yes | Must match a declared stage directory under the intent | `"development"` |
| `title` | string | yes | Non-empty, max 120 chars, used to derive filename slug | `"Missing null check in writeFeedbackFile"` |
| `body` | string | yes | Non-empty markdown, no max length | `"The function at state-tools.ts:1720 does not handle the case where..."` |
| `origin` | string | no | Enum: `adversarial-review`, `external-pr`, `external-mr`, `user-visual`, `user-chat`, `agent`. Defaults to `"agent"` | `"adversarial-review"` |
| `source_ref` | string | no | Free-form reference (PR URL, review agent name, annotation ID) | `"https://github.com/org/repo/pull/42"` |
| `author` | string | no | Who created it. Defaults to `"agent"` for agent callers, `"user"` for human-origin items | `"security-review-agent"` |

**MCP inputSchema (TypeScript):**

```typescript
{
  type: "object",
  properties: {
    intent:     { type: "string", description: "Intent slug" },
    stage:      { type: "string", description: "Stage name" },
    title:      { type: "string", description: "Short title for the feedback item (max 120 chars)" },
    body:       { type: "string", description: "Markdown body describing the finding" },
    origin:     { type: "string", description: "Source: adversarial-review | external-pr | external-mr | user-visual | user-chat | agent (default: agent)" },
    source_ref: { type: "string", description: "Optional reference — PR URL, review agent name, annotation ID" },
    author:     { type: "string", description: "Who created it (default: agent)" },
  },
  required: ["intent", "stage", "title", "body"],
}
```

**Success Response:**

```json
{
  "feedback_id": "FB-03",
  "file": ".haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/03-missing-null-check-in-write-feedback-file.md",
  "status": "pending",
  "message": "Feedback FB-03 created."
}
```

**Error Responses:**

| Condition | `isError` | Text |
|---|---|---|
| Missing `intent` | `true` | `"Error: intent is required"` |
| Missing `stage` | `true` | `"Error: stage is required"` |
| Missing `title` | `true` | `"Error: title is required"` |
| Missing `body` | `true` | `"Error: body is required"` |
| `title` exceeds 120 chars | `true` | `"Error: title must be 120 characters or fewer"` |
| Intent not found | `true` | `"Error: intent 'bad-slug' not found"` |
| Invalid `origin` enum value | `true` | `"Error: origin must be one of: adversarial-review, external-pr, external-mr, user-visual, user-chat, agent"` |

**Side Effects:**

1. Creates file at `.haiku/intents/{intent}/stages/{stage}/feedback/NN-{slug}.md`
2. `NN` is auto-incremented from the highest existing numeric prefix in the directory + 1 (starts at `01`)
3. `{slug}` is derived from `title`: lowercased, non-alphanumeric replaced with hyphens, truncated to 60 chars
4. Calls `gitCommitState("feedback: create FB-NN in {stage}")` -- adds `.haiku/`, commits, pushes

---

### 1.2 `haiku_feedback_update`

Update mutable fields on an existing feedback item.

**Input Schema:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | Existing intent slug | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | yes | Existing stage name | `"development"` |
| `feedback_id` | string | yes | `FB-NN` identifier (e.g., `"FB-03"`) or numeric prefix (e.g., `"03"`) | `"FB-03"` |
| `status` | string | no | Enum: `pending`, `addressed`, `closed`, `rejected` | `"addressed"` |
| `addressed_by` | string | no | Unit slug that claims to address this item | `"unit-04-fix-null-check"` |

**MCP inputSchema (TypeScript):**

```typescript
{
  type: "object",
  properties: {
    intent:       { type: "string", description: "Intent slug" },
    stage:        { type: "string", description: "Stage name" },
    feedback_id:  { type: "string", description: "FB-NN identifier or numeric prefix" },
    status:       { type: "string", description: "New status: pending | addressed | closed | rejected" },
    addressed_by: { type: "string", description: "Unit slug that addresses this feedback" },
  },
  required: ["intent", "stage", "feedback_id"],
}
```

**Guards:**

- Agents (`author_type: agent` on the calling context) **cannot** set `status: closed` on feedback where `author_type: human`. Only the user (via the review UI or MCP tools in a human-origin context) can close human-authored feedback.
- At least one of `status` or `addressed_by` must be provided (otherwise the call is a no-op error).

**Success Response:**

```json
{
  "feedback_id": "FB-03",
  "file": ".haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/03-missing-null-check-in-write-feedback-file.md",
  "updated_fields": ["status", "addressed_by"],
  "message": "Feedback FB-03 updated."
}
```

**Error Responses:**

| Condition | `isError` | Text |
|---|---|---|
| Feedback file not found | `true` | `"Error: feedback 'FB-03' not found in stage 'development'"` |
| Agent tries to close human-authored | `true` | `"Error: agents cannot set status 'closed' on human-authored feedback. Only the original author can close it."` |
| No updatable fields provided | `true` | `"Error: at least one of 'status' or 'addressed_by' must be provided"` |
| Invalid `status` enum | `true` | `"Error: status must be one of: pending, addressed, closed, rejected"` |

**Side Effects:**

1. Patches frontmatter fields in the existing `.md` file (preserves body and unchanged fields)
2. Calls `gitCommitState("feedback: update FB-NN in {stage}")`

---

### 1.3 `haiku_feedback_delete`

Remove a feedback file from disk.

**Input Schema:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | Existing intent slug | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | yes | Existing stage name | `"development"` |
| `feedback_id` | string | yes | `FB-NN` identifier or numeric prefix | `"FB-07"` |

**MCP inputSchema (TypeScript):**

```typescript
{
  type: "object",
  properties: {
    intent:      { type: "string", description: "Intent slug" },
    stage:       { type: "string", description: "Stage name" },
    feedback_id: { type: "string", description: "FB-NN identifier or numeric prefix" },
  },
  required: ["intent", "stage", "feedback_id"],
}
```

**Guards:**

- **Cannot delete `status: pending` items.** This prevents agents from bypassing the structural gate by deleting feedback instead of addressing it. The item must first be moved to `addressed`, `closed`, or `rejected`.
- **Author-type enforcement:** Agent-authored items (`author_type: agent`) can only be deleted by agents. Human-authored items (`author_type: human`) can only be deleted via the review UI (HTTP endpoint). The MCP tool context determines the caller type.

**Success Response:**

```json
{
  "feedback_id": "FB-07",
  "deleted": true,
  "message": "Feedback FB-07 deleted from stage 'development'."
}
```

**Error Responses:**

| Condition | `isError` | Text |
|---|---|---|
| Feedback file not found | `true` | `"Error: feedback 'FB-07' not found in stage 'development'"` |
| Item is `status: pending` | `true` | `"Error: cannot delete pending feedback. Address, close, or reject it first."` |
| Agent tries to delete human-authored | `true` | `"Error: agents cannot delete human-authored feedback. Use the review UI."` |

**Side Effects:**

1. Removes the `.md` file from disk
2. Calls `gitCommitState("feedback: delete FB-NN from {stage}")`

---

### 1.4 `haiku_feedback_reject`

Reject an agent-authored feedback item with a reason. Shorthand for `haiku_feedback_update` with `status: rejected`, but adds rejection reason to the body and enforces the agent-only constraint.

**Input Schema:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | Existing intent slug | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | yes | Existing stage name | `"development"` |
| `feedback_id` | string | yes | `FB-NN` identifier or numeric prefix | `"FB-02"` |
| `reason` | string | yes | Non-empty explanation for the rejection | `"This is a false positive -- the null check exists at line 45"` |

**MCP inputSchema (TypeScript):**

```typescript
{
  type: "object",
  properties: {
    intent:      { type: "string", description: "Intent slug" },
    stage:       { type: "string", description: "Stage name" },
    feedback_id: { type: "string", description: "FB-NN identifier or numeric prefix" },
    reason:      { type: "string", description: "Explanation for why this feedback is being rejected" },
  },
  required: ["intent", "stage", "feedback_id", "reason"],
}
```

**Guards:**

- **Only works on agent-authored feedback** (`author_type: agent`). Human-authored feedback cannot be rejected by agents -- only by the user through the review UI.
- Item must be in `status: pending` or `status: addressed` (rejecting an already-closed item is a no-op error).

**Success Response:**

```json
{
  "feedback_id": "FB-02",
  "status": "rejected",
  "message": "Feedback FB-02 rejected: This is a false positive -- the null check exists at line 45"
}
```

**Error Responses:**

| Condition | `isError` | Text |
|---|---|---|
| Feedback file not found | `true` | `"Error: feedback 'FB-02' not found in stage 'development'"` |
| Human-authored item | `true` | `"Error: agents cannot reject human-authored feedback. Only the user can reject it via the review UI."` |
| Missing `reason` | `true` | `"Error: reason is required when rejecting feedback"` |
| Already `closed` or `rejected` | `true` | `"Error: feedback 'FB-02' is already 'rejected' -- cannot reject again"` |

**Side Effects:**

1. Sets `status: rejected` in frontmatter
2. Appends `\n\n---\n\n**Rejection reason:** {reason}` to the body
3. Calls `gitCommitState("feedback: reject FB-NN in {stage}")`

---

### 1.5 `haiku_feedback_list`

List feedback items with optional filtering.

**Input Schema:**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | Existing intent slug | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | no | Stage name. If omitted, lists feedback across all stages. | `"development"` |
| `status` | string | no | Filter by status: `pending`, `addressed`, `closed`, `rejected`. If omitted, returns all. | `"pending"` |

**MCP inputSchema (TypeScript):**

```typescript
{
  type: "object",
  properties: {
    intent: { type: "string", description: "Intent slug" },
    stage:  { type: "string", description: "Stage name (optional -- omit to list all stages)" },
    status: { type: "string", description: "Filter by status: pending | addressed | closed | rejected" },
  },
  required: ["intent"],
}
```

**Success Response (with items):**

```json
{
  "intent": "universal-feedback-model-and-review-recovery",
  "stage": "development",
  "count": 3,
  "items": [
    {
      "feedback_id": "FB-01",
      "file": "stages/development/feedback/01-error-handling-missing.md",
      "title": "Error handling missing in gate check",
      "status": "pending",
      "origin": "adversarial-review",
      "author": "security-review-agent",
      "author_type": "agent",
      "created_at": "2026-04-15T21:15:00Z",
      "visit": 0,
      "source_ref": null,
      "addressed_by": null
    },
    {
      "feedback_id": "FB-02",
      "file": "stages/development/feedback/02-race-condition-in-numbering.md",
      "title": "Race condition in feedback numbering",
      "status": "addressed",
      "origin": "adversarial-review",
      "author": "concurrency-review-agent",
      "author_type": "agent",
      "created_at": "2026-04-15T21:15:12Z",
      "visit": 0,
      "source_ref": null,
      "addressed_by": "unit-05-fix-race-condition"
    },
    {
      "feedback_id": "FB-03",
      "file": "stages/development/feedback/03-ui-alignment-off.md",
      "title": "UI alignment off on feedback panel",
      "status": "pending",
      "origin": "user-visual",
      "author": "user",
      "author_type": "human",
      "created_at": "2026-04-15T22:00:00Z",
      "visit": 1,
      "source_ref": null,
      "addressed_by": null
    }
  ]
}
```

**Success Response (empty):**

```json
{
  "intent": "universal-feedback-model-and-review-recovery",
  "stage": "development",
  "count": 0,
  "items": []
}
```

**Success Response (all stages, no filter):**

```json
{
  "intent": "universal-feedback-model-and-review-recovery",
  "stage": null,
  "count": 5,
  "items": [
    { "feedback_id": "FB-01", "stage": "inception", "..." : "..." },
    { "feedback_id": "FB-01", "stage": "development", "..." : "..." },
    { "feedback_id": "FB-02", "stage": "development", "..." : "..." },
    { "feedback_id": "FB-03", "stage": "development", "..." : "..." },
    { "feedback_id": "FB-01", "stage": "security", "..." : "..." }
  ]
}
```

Note: `feedback_id` values (e.g., `FB-01`) are scoped per-stage. The same `FB-01` can exist in different stages. When listing across stages, each item includes a `stage` field to disambiguate.

**Error Responses:**

| Condition | `isError` | Text |
|---|---|---|
| Intent not found | `true` | `"Error: intent 'bad-slug' not found"` |
| Invalid `status` filter | `true` | `"Error: status must be one of: pending, addressed, closed, rejected"` |

**Side Effects:** None (read-only).

---

### 1.6 Extended `haiku_revisit`

The existing `haiku_revisit` tool gains an optional `reasons` parameter. The rest of its contract is unchanged.

**Input Schema (extended fields only):**

| Field | Type | Required | Validation | Example |
|---|---|---|---|---|
| `intent` | string | yes | (unchanged) | `"universal-feedback-model-and-review-recovery"` |
| `stage` | string | no | (unchanged) | `"development"` |
| `reasons` | array | no | Array of `{ title: string, body: string }`. Each becomes a feedback file. | `[{"title": "Missed edge case", "body": "The empty-directory case is not handled."}]` |

**MCP inputSchema addition:**

```typescript
reasons: {
  type: "array",
  description: "Optional feedback reasons. Each creates a feedback file before the revisit.",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "Feedback title" },
      body:  { type: "string", description: "Feedback body (markdown)" },
    },
    required: ["title", "body"],
  },
}
```

**With reasons -- Success Response:**

```json
{
  "action": "revisit",
  "from_stage": "development",
  "from_phase": "execute",
  "to_stage": "development",
  "to_phase": "elaborate",
  "visits": 1,
  "feedback_created": [
    { "feedback_id": "FB-04", "title": "Missed edge case" },
    { "feedback_id": "FB-05", "title": "API contract mismatch" }
  ],
  "message": "Revisited development (elaborate). Created 2 feedback items."
}
```

**Without reasons -- Stopgap Response:**

```json
{
  "action": "revisit_needs_reasons",
  "message": "To revisit, provide reasons as feedback. Call haiku_revisit with reasons: [{title, body}] so the feedback is recorded before rolling back."
}
```

The stopgap does NOT execute the revisit. The FSM phase does not change. The agent must retry with reasons.

**Side Effects (with reasons):**

1. Creates one feedback file per reason entry (origin: `user-chat` if triggered by user, `agent` if triggered by agent)
2. Sets the FSM phase back to `elaborate` for the target stage
3. Increments `visits` in `state.json`
4. Calls `gitCommitState` for each feedback file and for the state change

---

## 2. Review Server HTTP API

All endpoints are served by the HTTP server in `http.ts`. Paths are relative to the MCP server's HTTP root (e.g., `http://localhost:{port}`). No authentication -- the server is localhost-only (or behind a tunnel with E2E encryption for remote review).

### 2.1 `GET /api/feedback/{intent}/{stage}`

List feedback items for a stage.

**Request:**

```
GET /api/feedback/universal-feedback-model-and-review-recovery/development HTTP/1.1
```

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `status` | string | no | Filter: `pending`, `addressed`, `closed`, `rejected` |

**Success Response (`200`):**

```json
{
  "intent": "universal-feedback-model-and-review-recovery",
  "stage": "development",
  "count": 2,
  "items": [
    {
      "feedback_id": "FB-01",
      "title": "Error handling missing in gate check",
      "body": "The function at orchestrator.ts:1669...",
      "status": "pending",
      "origin": "adversarial-review",
      "author": "security-review-agent",
      "author_type": "agent",
      "created_at": "2026-04-15T21:15:00Z",
      "visit": 0,
      "source_ref": null,
      "addressed_by": null
    },
    {
      "feedback_id": "FB-02",
      "title": "Race condition in feedback numbering",
      "body": "Concurrent subagents could...",
      "status": "pending",
      "origin": "adversarial-review",
      "author": "concurrency-review-agent",
      "author_type": "agent",
      "created_at": "2026-04-15T21:15:12Z",
      "visit": 0,
      "source_ref": null,
      "addressed_by": null
    }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| `404` | `{ "error": "Intent not found" }` | Intent slug does not exist |
| `404` | `{ "error": "Stage not found" }` | Stage directory does not exist under the intent |

---

### 2.2 `POST /api/feedback/{intent}/{stage}`

Create a feedback item from the review UI.

**Request:**

```
POST /api/feedback/universal-feedback-model-and-review-recovery/development HTTP/1.1
Content-Type: application/json

{
  "title": "Button alignment broken on mobile",
  "body": "The approve button overlaps the sidebar on viewports < 640px.",
  "origin": "user-visual",
  "source_ref": null
}
```

**Request Body (Zod schema):**

```typescript
z.object({
  title:      z.string().min(1).max(120),
  body:       z.string().min(1),
  origin:     z.enum(["adversarial-review", "external-pr", "external-mr", "user-visual", "user-chat", "agent"]).optional().default("user-visual"),
  source_ref: z.string().nullable().optional(),
})
```

**Success Response (`201`):**

```json
{
  "feedback_id": "FB-04",
  "file": ".haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/04-button-alignment-broken-on-mobile.md",
  "status": "pending",
  "message": "Feedback FB-04 created."
}
```

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Invalid request body", "details": "..." }` | Zod validation failure |
| `404` | `{ "error": "Intent not found" }` | Intent slug does not exist |
| `404` | `{ "error": "Stage not found" }` | Stage directory does not exist |

**Side Effects:** Same as `haiku_feedback` MCP tool -- writes file, calls `gitCommitState`. Items created via this endpoint always have `author: "user"` and `author_type: "human"`.

---

### 2.3 `PUT /api/feedback/{intent}/{stage}/{id}`

Update a feedback item.

**Request:**

```
PUT /api/feedback/universal-feedback-model-and-review-recovery/development/FB-03 HTTP/1.1
Content-Type: application/json

{
  "status": "closed"
}
```

**Request Body (Zod schema):**

```typescript
z.object({
  status:       z.enum(["pending", "addressed", "closed", "rejected"]).optional(),
  addressed_by: z.string().optional(),
}).refine(data => data.status !== undefined || data.addressed_by !== undefined, {
  message: "At least one of 'status' or 'addressed_by' must be provided",
})
```

**Success Response (`200`):**

```json
{
  "feedback_id": "FB-03",
  "updated_fields": ["status"],
  "message": "Feedback FB-03 updated."
}
```

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Invalid request body", "details": "..." }` | Zod validation failure |
| `400` | `{ "error": "At least one of 'status' or 'addressed_by' must be provided" }` | No fields to update |
| `404` | `{ "error": "Feedback 'FB-99' not found in stage 'development'" }` | File not found |

**Guards:** The HTTP endpoint is used by the review UI (human context). No author-type restrictions apply -- humans can close any feedback item, including agent-authored ones. This is the inverse of the MCP tool constraint (agents can't close human-authored items).

**Side Effects:** Patches frontmatter, calls `gitCommitState`.

---

### 2.4 `DELETE /api/feedback/{intent}/{stage}/{id}`

Delete a feedback item.

**Request:**

```
DELETE /api/feedback/universal-feedback-model-and-review-recovery/development/FB-07 HTTP/1.1
```

**No request body.**

**Success Response (`200`):**

```json
{
  "feedback_id": "FB-07",
  "deleted": true,
  "message": "Feedback FB-07 deleted."
}
```

**Error Responses:**

| Status | Body | Condition |
|---|---|---|
| `404` | `{ "error": "Feedback 'FB-07' not found in stage 'development'" }` | File not found |
| `409` | `{ "error": "Cannot delete pending feedback. Address, close, or reject it first." }` | `status: pending` |

**Guards:** Like the MCP tool, cannot delete `status: pending` items. The HTTP endpoint is human-context -- no author-type restriction (humans can delete any item).

**Side Effects:** Removes file, calls `gitCommitState`.

---

## 3. Feedback File Schema

### 3.1 File Location

```
.haiku/intents/{intent-slug}/stages/{stage}/feedback/NN-{descriptive-slug}.md
```

**Examples:**

```
.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/01-error-handling-missing.md
.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/02-race-condition-in-numbering.md
.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/03-ui-alignment-off.md
```

### 3.2 Naming Convention

- `NN`: Zero-padded two-digit sequential number (`01`, `02`, ..., `99`). Auto-incremented from the highest existing prefix in the directory.
- `{descriptive-slug}`: Derived from `title` -- lowercased, non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, truncated to 60 characters, trailing hyphens stripped.
- The `FB-NN` identifier used in `closes:` references and tool arguments maps directly to the `NN` prefix (e.g., `FB-03` = file `03-*.md`).

### 3.3 Frontmatter Fields

```yaml
---
title: "Missing null check in writeFeedbackFile"
status: pending
origin: adversarial-review
author: security-review-agent
author_type: agent
created_at: "2026-04-15T21:15:00Z"
visit: 0
source_ref: null
addressed_by: null
---
```

| Field | Type | Required | Default | Enum Values | Validation | Example |
|---|---|---|---|---|---|---|
| `title` | string | yes | -- | -- | Non-empty, max 120 chars | `"Missing null check in writeFeedbackFile"` |
| `status` | string | yes | `"pending"` | `pending`, `addressed`, `closed`, `rejected` | Must be one of the enum values | `"pending"` |
| `origin` | string | yes | `"agent"` | `adversarial-review`, `external-pr`, `external-mr`, `user-visual`, `user-chat`, `agent` | Must be one of the enum values | `"adversarial-review"` |
| `author` | string | yes | `"agent"` or `"user"` | -- | Non-empty. `"user"` for all human-sourced feedback (v1 -- no identity resolution). Agent name for agent-sourced. | `"security-review-agent"` |
| `author_type` | string | yes | derived | `human`, `agent` | Derived from context: `"human"` when origin is `user-visual`, `user-chat`, `external-pr`, `external-mr`; `"agent"` when origin is `adversarial-review`, `agent` | `"agent"` |
| `created_at` | string (ISO 8601) | yes | current timestamp | -- | ISO 8601 format, no milliseconds (matches `timestamp()` helper: `2026-04-15T21:15:00Z`) | `"2026-04-15T21:15:00Z"` |
| `visit` | number | yes | current `state.visits` value | -- | Non-negative integer. Captures which visit cycle this feedback was created in. | `0` |
| `source_ref` | string \| null | no | `null` | -- | Free-form. PR URL, review agent name, annotation ID, etc. | `"https://github.com/org/repo/pull/42#discussion_r123"` |
| `addressed_by` | string \| null | no | `null` | -- | Unit slug (e.g., `"unit-04-fix-null-check"`) or null. Set when a unit claims to address this feedback. | `"unit-04-fix-null-check"` |

### 3.4 `author_type` Derivation Rules

| `origin` value | `author_type` | `author` default |
|---|---|---|
| `adversarial-review` | `agent` | agent name (e.g., `"security-review-agent"`) |
| `agent` | `agent` | `"agent"` |
| `user-visual` | `human` | `"user"` |
| `user-chat` | `human` | `"user"` |
| `external-pr` | `human` | `"user"` |
| `external-mr` | `human` | `"user"` |

### 3.5 Body Format

The body is freeform markdown following the frontmatter. No structural requirements beyond being non-empty.

**Example -- agent-authored finding:**

```markdown
---
title: "Missing null check in writeFeedbackFile"
status: pending
origin: adversarial-review
author: security-review-agent
author_type: agent
created_at: "2026-04-15T21:15:00Z"
visit: 0
source_ref: null
addressed_by: null
---

**Severity:** HIGH

The `writeFeedbackFile` function does not check whether the feedback directory exists before calling `readdirSync`. When a stage has never received feedback, the directory does not exist and the call throws `ENOENT`.

**File:** `packages/haiku/src/state-tools.ts`
**Line:** ~1745

**Recommendation:** Add `mkdirSync(feedbackDir, { recursive: true })` before the read, consistent with the pattern at `state-tools.ts:1702`.
```

**Example -- human-authored visual annotation:**

```markdown
---
title: "Approve button overlaps sidebar on mobile"
status: pending
origin: user-visual
author: user
author_type: human
created_at: "2026-04-15T22:00:00Z"
visit: 1
source_ref: null
addressed_by: null
---

The approve button text wraps and overlaps with the comment count badge on viewports below 640px. Tested on iPhone 14 viewport emulation in Chrome DevTools.
```

**Example -- rejected item (body with appended reason):**

```markdown
---
title: "Potential XSS in feedback body rendering"
status: rejected
origin: adversarial-review
author: security-review-agent
author_type: agent
created_at: "2026-04-15T21:15:30Z"
visit: 0
source_ref: null
addressed_by: null
---

The feedback body is rendered as raw HTML in the review panel, which could allow XSS injection if an agent writes malicious markdown.

---

**Rejection reason:** False positive -- the review app uses `prose` class with React's JSX rendering which auto-escapes HTML entities. Raw HTML is not rendered.
```

### 3.6 Status Lifecycle

```
                  +-> addressed --+
                  |               |
pending ----------+               +-> closed
                  |               |
                  +-> rejected ---+
```

- `pending`: Initial state. Blocks the review-to-gate transition.
- `addressed`: A unit claims to fix this. Still subject to re-review verification. Does NOT block the gate (only `pending` blocks).
- `rejected`: Dismissed with a reason. Does not block the gate.
- `closed`: Verified resolved. Terminal state. Does not block the gate.

Transitions allowed:

| From | To | Who |
|---|---|---|
| `pending` | `addressed` | Agent or human |
| `pending` | `rejected` | Agent (agent-authored only) or human (any) |
| `pending` | `closed` | Human only |
| `addressed` | `closed` | Human only (verification) |
| `addressed` | `pending` | Human (re-open) or agent |
| `rejected` | `pending` | Human (re-open) |
| `closed` | `pending` | Human (re-open) |

---

## 4. State.json Additions

### 4.1 Per-Stage `state.json`

**Location:** `.haiku/intents/{intent-slug}/stages/{stage}/state.json`

**New field:**

| Field | Type | Default | Description |
|---|---|---|---|
| `visits` | number | `0` | Incremented each time the FSM rolls the review-to-gate transition back to elaborate due to pending feedback. |

**Current schema (existing fields preserved):**

```json
{
  "stage": "development",
  "status": "active",
  "phase": "elaborate",
  "started_at": "2026-04-15T19:37:45Z",
  "completed_at": null,
  "gate_entered_at": null,
  "gate_outcome": null,
  "elaboration_turns": 4,
  "visits": 0
}
```

**Example after one feedback-driven revisit:**

```json
{
  "stage": "development",
  "status": "active",
  "phase": "elaborate",
  "started_at": "2026-04-15T19:37:45Z",
  "completed_at": null,
  "gate_entered_at": "2026-04-15T22:10:00Z",
  "gate_outcome": null,
  "elaboration_turns": 4,
  "visits": 1
}
```

**Example after two feedback-driven revisits:**

```json
{
  "stage": "development",
  "status": "active",
  "phase": "execute",
  "started_at": "2026-04-15T19:37:45Z",
  "completed_at": null,
  "gate_entered_at": "2026-04-15T23:45:00Z",
  "gate_outcome": null,
  "elaboration_turns": 4,
  "visits": 2
}
```

**Backward compatibility:** When `visits` is absent from an existing `state.json`, all code treats it as `0`. The `readJson` helper returns `{}` for missing fields, so `(stageState.visits as number) || 0` is the safe read pattern.

### 4.2 TypeScript Interface Update

The `StageState` interface in `types.ts` gains the new field:

```typescript
export interface StageState {
  stage: string
  status: string        // pending | active | completed
  phase: string         // elaborate | execute | review | gate
  started_at?: string
  completed_at?: string | null
  gate_entered_at?: string | null
  gate_outcome?: string | null  // advanced | paused | blocked | awaiting
  elaboration_turns?: number
  visits?: number       // NEW -- feedback-driven revisit count, default 0
}
```

---

## 5. Unit Frontmatter Additions

### 5.1 New Field: `closes`

| Field | Type | Required | Default | Validation | Example |
|---|---|---|---|---|---|
| `closes` | string[] | conditional | `[]` | Required on new units when `visits > 0` (additive elaborate mode). Each entry must be a valid `FB-NN` reference for a pending feedback item in the same stage. | `["FB-01", "FB-03"]` |

### 5.2 Updated `UnitFrontmatter` Interface

```typescript
export interface UnitFrontmatter {
  name?: string
  type: string
  status: string
  depends_on: string[]
  bolt: number
  hat: string
  model?: string
  started_at?: string
  completed_at?: string | null
  closes?: string[]     // NEW -- feedback IDs this unit addresses
  // ... existing fields unchanged
}
```

### 5.3 Example Unit With `closes`

```yaml
---
title: Fix null check in writeFeedbackFile
type: fix
depends_on: []
quality_gates: []
status: pending
bolt: 1
hat: implementer
closes:
  - FB-01
  - FB-03
---

# Fix null check in writeFeedbackFile

Add directory existence check before `readdirSync` in the feedback writer, and fix the mobile viewport overlap on the approve button.

## Completion Criteria

- `writeFeedbackFile` creates the feedback directory if it does not exist
- Approve button does not overlap sidebar on viewports < 640px
- Both FB-01 and FB-03 can be marked as `addressed`
```

### 5.4 Validation Rules

- **When `visits > 0`:** Every new unit (units added during the additive elaborate phase) MUST have a non-empty `closes` array. Units from prior visits (already `completed`) are exempt.
- **When `visits == 0`:** The `closes` field is optional and defaults to `[]`. Normal elaboration does not require feedback references.
- **Each `FB-NN` reference** must correspond to an existing feedback file in the same stage's `feedback/` directory with `status: pending`.
- **A single feedback item can be referenced by multiple units** (one finding might need work in multiple places).
- **A single unit can close multiple feedback items** (one fix might address several related findings).

### 5.5 Backward Compatibility

Existing units have no `closes` field. All code that reads unit frontmatter treats a missing `closes` as `[]`. The field is only validated during additive elaborate mode (`visits > 0`).
