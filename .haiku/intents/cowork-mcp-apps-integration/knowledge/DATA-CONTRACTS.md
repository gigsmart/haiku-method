# Data Contracts — cowork-mcp-apps-integration

Canonical contract reference for the MCP Apps transport layer. All new
schemas and shapes are specified here; existing schemas are cited by
file:line. Implementation must not drift from these contracts.

---

## MCP Server Capabilities

Source: unit-01-cowork-env-probe (capability negotiation), unit-03-ui-resource-registration (resources capability)

The `Server` constructor at `packages/haiku/src/server.ts:157` adds
`experimental: { apps: {} }` to the capabilities block:

```json
{
  "capabilities": {
    "tools": {},
    "prompts": { "listChanged": true },
    "completions": {},
    "resources": {},
    "experimental": {
      "apps": {}
    }
  }
}
```

During the `initialize` handshake (MCP spec §3.1), the client echoes back
any subset of the server-advertised capabilities it supports. The MCP Apps
extension (modelcontextprotocol.io/extensions/overview#negotiation) uses
`experimental.apps` as the negotiation key. A client that supports MCP Apps
echoes:

```json
{
  "experimental": {
    "apps": {}
  }
}
```

**Spec confirmation:** `experimental.apps: {}` (an empty object, not `true`
or a non-empty object) is the correct negotiation shape per the MCP Apps
extension spec. An empty object signals support without version pinning — the
host decides which features to surface. No additional fields are required or
expected in the negotiation payload.

`hostSupportsMcpApps()` (`packages/haiku/src/state-tools.ts`, added by
unit-01) reads `server.getClientCapabilities()` after `initialize` completes
and returns `true` iff `clientCapabilities.experimental?.apps` is defined
(i.e. the key exists, regardless of the value). Result is cached for the life
of the connection.

### Errors

The capabilities block is exchanged during `initialize` — not a tool call.
No JSON-RPC error is defined for a missing `experimental.apps` key. The
server silently falls back to the HTTP+tunnel path when
`hostSupportsMcpApps()` returns `false`.

---

## MCP Resources (`ui://`)

Source: unit-03-ui-resource-registration

### Capability prerequisite

`resources: {}` must appear in the server capabilities block (same
`server.ts:158` block). Without it the SDK rejects `resources/*` requests.

### `resources/list`

**JSON-RPC request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {}
}
```

**JSON-RPC response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resources": [
      {
        "uri": "ui://haiku/review/<REVIEW_APP_VERSION>",
        "name": "Haiku Review App",
        "mimeType": "text/html"
      }
    ]
  }
}
```

`REVIEW_APP_VERSION` is a 12-character lowercase hex string (sha256 of the
inlined HTML, computed at build time in
`packages/haiku/scripts/build-review-app.mjs`). Pattern:
`/^[0-9a-f]{12}$/`.

### `resources/read`

**JSON-RPC request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "ui://haiku/review/<REVIEW_APP_VERSION>"
  }
}
```

**JSON-RPC response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "ui://haiku/review/<REVIEW_APP_VERSION>",
        "mimeType": "text/html",
        "text": "<REVIEW_APP_HTML>"
      }
    ]
  }
}
```

`REVIEW_APP_HTML` is the inlined single-file SPA (~5.15 MB, 5,402,978 bytes
on `main`). The `text` field is the raw HTML string — not base64, not
JSON-encoded. `contents[0].text.length === REVIEW_APP_HTML.length` must hold
byte-for-byte.

**Error (unknown URI):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "Unknown resource URI"
  }
}
```

---

## Tool: `haiku_cowork_review_submit`

Source: unit-05-cowork-open-review-handler (tool registration + review variant),
unit-06-visual-question-design-direction (question + design_direction variants)

Single polymorphic submit tool added by unit-05 (inception), extended to
three session types by unit-06 (inception). One `ListTools` entry, one
`CallTool` dispatch case.

### Input schema (Zod)

```typescript
const ReviewSubmitInput = z.discriminatedUnion("session_type", [
  // --- review ---
  z.object({
    session_type: z.literal("review"),
    session_id: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested", "external_review"]),
    feedback: z.string(),                          // required, may be empty
    annotations: ReviewAnnotationsSchema.optional(),
  }),

  // --- question ---
  z.object({
    session_type: z.literal("question"),
    session_id: z.string().uuid(),
    answers: z.array(QuestionAnswerSchema),        // at least one entry
    feedback: z.string().optional(),
    annotations: QuestionAnnotationsSchema.optional(),
  }),

  // --- design_direction ---
  z.object({
    session_type: z.literal("design_direction"),
    session_id: z.string().uuid(),
    archetype: z.string(),
    parameters: z.record(z.number()),
    comments: z.string().optional(),
    annotations: z.object({
      screenshot: z.string().optional(),           // base64 PNG
      pins: z.array(
        z.object({ x: z.number(), y: z.number(), text: z.string() })
      ).optional(),
    }).optional(),
  }),
])
```

### Output schema

**Success:**

```typescript
{ ok: true }
```

Encoded as MCP tool result:

```json
{
  "content": [{ "type": "text", "text": "{\"ok\":true}" }]
}
```

**Failure:**

```typescript
{ ok: false; error: string }
```

Encoded as MCP tool result with `isError: true` (see Error Response Shapes
section).

### Validation rules

- `session_id` MUST exist in the in-memory session store (`getSession(id)`
  returns non-null). If not found → 404-equivalent error.
- `session_type` in the submitted payload MUST match
  `getSession(id).session_type`. Mismatch → 400-equivalent error.
- For `review`: `decision` MUST be one of `"approved"`,
  `"changes_requested"`, `"external_review"`.
- For `review`: `feedback` MUST be a string (may be empty string `""`).
- For `question`: `answers` MUST be a non-empty array.
- For `design_direction`: `archetype` MUST be a non-empty string;
  `parameters` MUST be a `Record<string, number>`.
- Session MUST be in `status: "pending"`. Submitting to a session that is
  already `"decided"` / `"answered"` → 409-equivalent error.

### Errors

All errors are returned as successful JSON-RPC responses with `isError: true`
(see Error Response Shapes section). No JSON-RPC protocol-level errors are
thrown by this tool.

| Condition | HTTP analog | `text` value |
|---|---|---|
| `session_id` UUID not found in store | 404 | `"Session not found: <session_id>"` |
| Submitted `session_type` ≠ stored `session_type` | 400 | `"session_type mismatch: expected <stored>, got <submitted>"` |
| Zod schema validation failure | 400 | `"Invalid input: <zod error summary>"` |
| Session `status !== "pending"` | 409 | `"Session already closed: <session_id>"` |

### Side effects

On success the tool handler:
1. Updates the in-memory session via `updateSession` / `updateQuestionSession`
   / `updateDesignDirectionSession` (from `packages/haiku/src/sessions.ts`).
2. Calls `notifySessionUpdate(session_id)`, resolving the `waitForSession`
   promise that `_openReviewAndWait` (or the visual-question / design-direction
   handler) is blocked on.
3. For `design_direction`: writes `design_direction_selected: true` and the
   selection payload to stage state (same `findHaikuRoot` / `stageStatePath`
   path as the HTTP branch, `server.ts:700-721`).

---

## Tool Result `_meta.ui` Envelope

Source: unit-03-ui-resource-registration (buildUiResourceMeta helper),
unit-05-cowork-open-review-handler (first consumer)

`buildUiResourceMeta(resourceUri: string)` (new in
`packages/haiku/src/ui-resource.ts`, unit-03) returns:

```typescript
{ ui: { resourceUri: string } }
```

This object is spread into the `_meta` field of a tool result. Per the MCP
spec, `_meta` is a reserved extension field on tool results. The full
envelope for a tool result that triggers MCP Apps rendering:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{ ...session data JSON... }"
    }
  ],
  "_meta": {
    "ui": {
      "resourceUri": "ui://haiku/review/<REVIEW_APP_VERSION>"
    }
  }
}
```

**Where it attaches:** The `_meta.ui` field is set on the tool result
returned by:
- `setOpenReviewHandler` (unit-05) — the MCP Apps branch of
  `server.ts:774-948`.
- `ask_user_visual_question` (unit-06) — MCP Apps branch of
  `server.ts:468`.
- `pick_design_direction` (unit-06) — MCP Apps branch of `server.ts:595`.

It is NOT attached to unrelated tool results (e.g. `haiku_version_info`,
`haiku_run_next`).

The `text` content field carries the session data payload so the SPA can
hydrate without an HTTP fetch to `/api/session/:id`. The exact JSON shape
mirrors the `ReviewSession` / `QuestionSession` / `DesignDirectionSession`
interfaces (`sessions.ts:108`, `sessions.ts:157`, `sessions.ts:190` — see
Existing Schemas section).


---

## Setup-Handler Return Contract

Source: unit-05-cowork-open-review-handler

`setOpenReviewHandler` at `packages/haiku/src/orchestrator.ts:3152` types
the injected handler:

```typescript
(
  intentDir: string,
  reviewType: string,
  gateType?: string,
) => Promise<{
  decision: string;
  feedback: string;
  annotations?: unknown;
}>
```

(Full type declaration: `orchestrator.ts:3133-3139`.)

The MCP Apps branch resolves this promise with an **identical 3-field
object** to the HTTP branch (current resolution at `server.ts:889-893`):

```typescript
{
  decision: updatedSession.decision,   // "approved" | "changes_requested" | "external_review"
  feedback: updatedSession.feedback,   // string, may be empty
  annotations: updatedSession.annotations, // ReviewAnnotations | undefined
}
```

The `gate_review` action in `handleOrchestratorTool`
(`orchestrator.ts:2980-3067`) branches solely on `reviewResult.decision`:
- `"approved"` → `orchestrator.ts:3016` writes `intent_reviewed: true`;
  `:3017` calls `fsmAdvancePhase`.
- `"external_review"` → `orchestrator.ts:3032` calls `fsmAdvancePhase`.
- implicit else (`"changes_requested"`) → refine path.

No shape change is permitted here. The MCP Apps branch must produce exactly
the same resolved value as the HTTP path.

### Errors

The `setOpenReviewHandler` callback itself does not return errors directly —
it returns a `Promise` that either resolves with the 3-field decision object
or rejects. Rejection causes are:

| Condition | Rejection message |
|---|---|
| `waitForSession` timeout (blocking path, 30 min) | `"Session timeout"` (thrown by `sessions.ts:88`) |
| Intent parse failure | `"Could not parse intent"` |

On rejection the orchestrator's `gate_review` handler at
`orchestrator.ts:2980` propagates the error to the FSM.

### Resumable branch (DEFERRED)

**DEFERRED — used only if unit-02 spike measures host timeout < 30 min.**
Canonical path is **blocking** (above). If the spike confirms timeout
headroom is insufficient, the alternate `pending_review` shape applies:

```typescript
// DEFERRED — alternate path only
const PendingReviewResult = z.object({
  action: z.literal("pending_review"),
  session_id: z.string().uuid(),
  resource_uri: z.string(), // "ui://haiku/review/<REVIEW_APP_VERSION>"
})
```

Tool result carries `_meta.ui.resourceUri` as usual. The FSM persists
`cowork_review_session_id` in stage state; a subsequent
`haiku_cowork_review_submit` call triggers the next FSM tick and preserves
the `{decision, feedback, annotations?}` handler contract. **Do not implement
until unit-02 outcome is recorded.**

---

## Existing Schemas (Unchanged, Reference)

All interfaces live in `packages/haiku/src/sessions.ts`.

### `ReviewAnnotations` (`sessions.ts:102-106`)

```typescript
interface ReviewAnnotations {
  screenshot?: string;   // base64 PNG of annotated canvas
  pins?: Array<{ x: number; y: number; text: string }>;
  comments?: Array<{ selectedText: string; comment: string; paragraph: number }>;
}
```

### `QuestionAnswer` (`sessions.ts:147-151`)

```typescript
interface QuestionAnswer {
  question: string;
  selectedOptions: string[];
  otherText?: string;
}
```

### `QuestionAnnotations` (`sessions.ts:153-155`)

```typescript
interface QuestionAnnotations {
  comments?: Array<{ selectedText: string; comment: string; paragraph: number }>;
}
```

### `DesignArchetypeData` (`sessions.ts:172-177`)

```typescript
interface DesignArchetypeData {
  name: string;
  description: string;
  preview_html: string;
  default_parameters: Record<string, number>;
}
```

### `DesignParameterData` (`sessions.ts:179-188`)

```typescript
interface DesignParameterData {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  labels: { low: string; high: string };
}
```

### `ReviewSession` (`sessions.ts:108-138`)

Key fields consumed by the SPA via `_meta.ui` content hydration
(`sessions.ts:108-138`):
- `session_id: string` (UUID), `session_type: "review"`, `review_type: "intent" | "unit"`
- `status: "pending" | "approved" | "changes_requested" | "decided"`
- `decision: string`, `feedback: string`, `annotations?: ReviewAnnotations` — `sessions.ts:116-118`
- `gate_type?: string`, `parsedIntent?: unknown`, `parsedUnits?: unknown[]`, `parsedCriteria?: unknown[]`, `parsedMermaid?: string`
- `stageStates?: Record<string, unknown>` — `sessions.ts:128`
- `knowledgeFiles?: Array<{ name: string; content: string }>` — `sessions.ts:129`
- `stageArtifacts?: Array<{ stage: string; name: string; content: string }>` — `sessions.ts:130`
- `outputArtifacts?: Array<{ stage: string; name: string; type: string; content?: string; relativePath?: string }>` — `sessions.ts:131-137`

### `QuestionSession` (`sessions.ts:157-170`)

Key fields (`sessions.ts:157-170`):
- `session_id: string` (UUID), `session_type: "question"`, `title: string`
- `questions: QuestionDef[]`, `context: string`, `imagePaths: string[]`
- `status: "pending" | "answered"`, `answers: QuestionAnswer[]` (empty until answered)
- `feedback: string`, `annotations?: QuestionAnnotations`

### `DesignDirectionSession` (`sessions.ts:190-207`)

Key fields (`sessions.ts:190-207`):
- `session_id: string` (UUID), `session_type: "design_direction"`, `intent_slug: string`
- `archetypes: DesignArchetypeData[]`, `parameters: DesignParameterData[]`
- `status: "pending" | "answered"`
- `selection: { archetype: string; parameters: Record<string, number>; comments?: string; annotations?: { screenshot?: string; pins?: Array<{x: number; y: number; text: string}> } } | null` — `sessions.ts:197-205`

---

## Validation Rules Summary

Source: unit-05-cowork-open-review-handler, unit-06-visual-question-design-direction

This section is the single authoritative checklist for all contracts in this
document. Each rule maps to a verifiable test assertion.

### Server-side tool validation

- **`session_id` existence** (`sessions.ts:302-306`): `getSession(session_id)`
  must return non-null. Missing or expired session → 404-equivalent error
  (`"Session not found: <id>"`).
- **`session_type` discriminator match**: submitted `session_type` must equal
  `getSession(id).session_type`. Mismatch → 400 error
  (`"session_type mismatch: expected <stored>, got <submitted>"`).
- **`decision` enum** (review path only): value must be one of `"approved"`,
  `"changes_requested"`, `"external_review"`. Any other string fails Zod
  `.enum(...)` → 400 error.
- **`feedback` shape parity with HTTP path**: for `session_type: "review"`,
  `feedback` is a required `string` (empty string `""` is valid). The MCP
  Apps branch resolves the handler with `{ decision, feedback, annotations? }`
  — identical shape to the HTTP branch at `server.ts:889-893`. Shape drift
  between branches is a hard contract violation.
- **`answers` non-empty** (question path): `answers.length >= 1` required.
  Empty array → 400 error.
- **`archetype` non-empty** (design_direction path): `archetype.length >= 1`
  required. Empty string → 400 error.
- **Session must be pending**: `status !== "pending"` → 409 error
  (`"Session already closed: <id>"`).

### SPA rendering contract

- **Touch target floor ≥ 44px**: all interactive elements in the review SPA
  (drag handle, decision buttons, annotation pins, retry CTA) must have a
  minimum hit zone of 44 × 44px. This is a rendering contract verified by
  design-stage mockup inspection, not a server-side rule.

### Capability contract

- **`experimental.apps` negotiated**: `haiku_cowork_review_submit` is only
  reachable when `hostSupportsMcpApps() === true`
  (`packages/haiku/src/state-tools.ts`). A host that did not echo
  `experimental.apps` during `initialize` will not see this tool in the
  review flow — no error defined.

---

## Error Response Shapes

Per MCP spec, tool errors are returned as a successful JSON-RPC response
with `isError: true` in the tool result:

```json
{
  "content": [
    {
      "type": "text",
      "text": "<human-readable error message>"
    }
  ],
  "isError": true
}
```

### Standard error messages

| Condition | HTTP analog | `text` |
|---|---|---|
| `session_id` not found | 404 | `"Session not found: <session_id>"` |
| Validation failure | 400 | `"Invalid input: <zod error summary>"` |
| `session_type` mismatch | 400 | `"session_type mismatch: expected <type>, got <type>"` |
| Session already decided | 409 | `"Session already closed: <session_id>"` |
| Unknown tool name | — | `"Unknown tool: <name>"` (existing pattern, `server.ts:765-768`) |

These use the existing error response pattern in `server.ts` — the
`{ content: [{ type: "text", text }], isError: true }` literal shape used
throughout (e.g. `server.ts:453-466`). No new error shape is introduced.
