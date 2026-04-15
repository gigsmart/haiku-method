# Data Contracts — cowork-mcp-apps-integration

Canonical contract reference for the MCP Apps transport layer. All new
schemas and shapes are specified here; existing schemas are cited by
file:line. Implementation must not drift from these contracts.

---

## MCP Server Capabilities

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

`hostSupportsMcpApps()` (`packages/haiku/src/state-tools.ts`, added by
unit-01) reads `server.getClientCapabilities()` after `initialize` completes
and returns `true` iff `clientCapabilities.experimental?.apps` is defined.
Result is cached for the life of the connection.

---

## MCP Resources (`ui://`)

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
interfaces (see Existing Schemas section).

---

## Setup-Handler Return Contract

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

Key fields consumed by the SPA via `_meta.ui` content hydration:
- `session_id: string` (UUID)
- `session_type: "review"`
- `review_type: "intent" | "unit"`
- `status: "pending" | "approved" | "changes_requested" | "decided"`
- `decision: string`
- `feedback: string`
- `annotations?: ReviewAnnotations`
- `gate_type?: string`
- `parsedIntent?: unknown`
- `parsedUnits?: unknown[]`
- `parsedCriteria?: unknown[]`
- `parsedMermaid?: string`
- `stageStates?: Record<string, unknown>`
- `knowledgeFiles?: Array<{ name: string; content: string }>`
- `stageArtifacts?: Array<{ stage: string; name: string; content: string }>`
- `outputArtifacts?: Array<{ stage: string; name: string; type: string; content?: string; relativePath?: string }>`

### `QuestionSession` (`sessions.ts:157-170`)

Key fields:
- `session_id: string` (UUID)
- `session_type: "question"`
- `title: string`
- `questions: QuestionDef[]`
- `context: string`
- `imagePaths: string[]`
- `status: "pending" | "answered"`
- `answers: QuestionAnswer[]` (empty array until answered)
- `feedback: string`
- `annotations?: QuestionAnnotations`

### `DesignDirectionSession` (`sessions.ts:190-207`)

Key fields:
- `session_id: string` (UUID)
- `session_type: "design_direction"`
- `intent_slug: string`
- `archetypes: DesignArchetypeData[]`
- `parameters: DesignParameterData[]`
- `status: "pending" | "answered"`
- `selection: { archetype: string; parameters: Record<string, number>; comments?: string; annotations?: { screenshot?: string; pins?: Array<{x: number; y: number; text: string}> } } | null`

---

## Validation Rules Summary

- **`session_id` must exist**: `getSession(session_id)` returns non-null.
  Missing → 404 error.
- **`session_type` discriminator must match**: submitted `session_type` must
  equal `getSession(id).session_type`. Mismatch → 400 error.
- **`decision` enum constraint**: for `session_type: "review"`, value must
  be `"approved"`, `"changes_requested"`, or `"external_review"`. Any other
  string → 400 error.
- **`feedback` required for review**: must be a `string` (empty string is
  valid; `null`/`undefined` → 400 error).
- **`answers` non-empty for question**: `answers.length >= 1` → 400 if
  empty array.
- **`archetype` non-empty for design_direction**: `archetype.length >= 1` →
  400 if empty string.
- **Session must be pending**: submitting to a session with
  `status !== "pending"` → 409 error.
- **Touch targets ≥ 44px**: all interactive elements in the review SPA
  (drag handle, decision buttons, retry CTA) must have a minimum hit zone of
  44 × 44px. This is a rendering contract, not a server contract — enforced
  in the SPA and verified by design-stage mockup inspection.
- **`experimental.apps` required**: `haiku_cowork_review_submit` is only
  reachable when `hostSupportsMcpApps() === true`. Calling it from a host
  that did not negotiate the capability is not a defined error; the tool
  simply won't appear in the review flow.

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
