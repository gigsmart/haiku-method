---
title: "Data Contracts — MCP Prompts Migration"
unit: unit-02-data-contracts
stage: product
---

# Data Contracts

Defines every type that crosses a boundary in the MCP prompts subsystem: wire protocol shapes (MCP spec), internal registry types, and error contracts. Verified against `@modelcontextprotocol/sdk` v1.28.0+ (`types.d.ts`).

---

## 1. MCP Protocol Contracts (Wire Format)

These types are defined by the MCP specification. We do not own them but document our exact usage subset and constraints.

### 1.1 `prompts/list` Response

**Schema:** `ListPromptsResultSchema`
**Method:** `prompts/list`

```typescript
interface ListPromptsResult {
  _meta?: Record<string, unknown>        // Protocol metadata — pass through, do not produce
  nextCursor?: string                     // Pagination cursor — omit (we return all 21 prompts in one page)
  prompts: Prompt[]                       // The prompt definitions
}

interface Prompt {
  name: string                            // REQUIRED. Unique identifier, e.g. "haiku:resume"
  title?: string                          // Display name, e.g. "Run Intent"
  description?: string                    // One-line summary for client UI
  arguments?: PromptArgument[]            // Argument definitions; omit if prompt takes no args
  _meta?: Record<string, unknown>         // Per-prompt metadata — not used
  icons?: Icon[]                          // Prompt icons — not used
}

interface PromptArgument {
  name: string                            // REQUIRED. Argument identifier, e.g. "intent"
  description?: string                    // Human-readable description
  required?: boolean                      // Default: false if omitted
}
```

**Our constraints:**
- `name` — always set, always prefixed `haiku:` (21 prompts total)
- `title` — always set (human-readable display name)
- `description` — always set (one-line summary)
- `arguments` — set when the prompt accepts arguments; omit the field (not empty array) when it takes none
- `nextCursor` — never set; all prompts returned in a single page
- `icons`, `_meta` — not used

### 1.2 `prompts/get` Request

**Schema:** `GetPromptRequestSchema`
**Method:** `prompts/get`

```typescript
interface GetPromptRequest {
  method: "prompts/get"
  params: GetPromptRequestParams
}

interface GetPromptRequestParams {
  name: string                            // REQUIRED. The prompt name from prompts/list
  arguments?: Record<string, string>      // Key-value pairs; all values are strings per MCP spec
  _meta?: {                               // Protocol metadata — ignored by handler
    progressToken?: string | number
  }
}
```

**Our constraints:**
- `name` — must match a registered prompt name exactly; unknown names produce an error
- `arguments` — all values are strings (MCP spec mandate); handlers must parse/validate internally
- Missing required arguments produce an error (validated by our handler, not the SDK)

### 1.3 `prompts/get` Response

**Schema:** `GetPromptResultSchema`
**Method:** `prompts/get`

```typescript
interface GetPromptResult {
  _meta?: Record<string, unknown>         // Protocol metadata — not produced
  description?: string                    // Optional prompt description (may differ from list description)
  messages: PromptMessage[]               // REQUIRED. Non-empty array of messages
}
```

### 1.4 `PromptMessage`

**Schema:** `PromptMessageSchema`

```typescript
interface PromptMessage {
  role: "user" | "assistant"              // REQUIRED. Message role
  content: TextContent | ImageContent | AudioContent | ResourceLinkContent | EmbeddedResourceContent
}
```

**Our usage subset — TextContent only:**

```typescript
interface TextContent {
  type: "text"                            // REQUIRED. Literal discriminant
  text: string                            // REQUIRED. The message text
  annotations?: Annotations               // Optional audience/priority hints
  _meta?: Record<string, unknown>         // Per-content metadata — not used
}

interface Annotations {
  audience?: Array<"user" | "assistant">  // Who this content is for
  priority?: number                       // Relative priority (0-1 range by convention)
  lastModified?: string                   // ISO 8601 datetime — not used
}
```

**Our constraints:**
- Content type is always `"text"` — we never produce `image`, `audio`, `resource_link`, or `resource` content
- `annotations.audience` is used to mark context messages as `["assistant"]` (consumed by model, not shown to user)
- Messages follow the 3-message pattern for action prompts or 1-message pattern for state-reading prompts (see PROMPT-CATALOG.md)

### 1.5 `completion/complete` Request

**Schema:** `CompleteRequestSchema`
**Method:** `completion/complete`

```typescript
interface CompleteRequest {
  method: "completion/complete"
  params: CompleteRequestParams
}

interface CompleteRequestParams {
  ref: PromptReference | ResourceReference  // What is being completed
  argument: {
    name: string                            // REQUIRED. The argument being completed
    value: string                           // REQUIRED. Partial input (prefix typed so far)
  }
  context?: {
    arguments?: Record<string, string>      // Previously-resolved argument values
  }
  _meta?: {                                 // Protocol metadata — ignored by handler
    progressToken?: string | number
  }
}

interface PromptReference {
  type: "ref/prompt"                        // REQUIRED. Literal discriminant
  name: string                              // REQUIRED. The prompt name
}

interface ResourceReference {
  type: "ref/resource"                      // Literal discriminant
  uri: string                               // Resource URI
}
```

**Our constraints:**
- `ref.type` — we only handle `"ref/prompt"`; `"ref/resource"` returns empty completions
- `argument.value` — the partial string to match against; may be empty string
- `context.arguments` — used for context-aware completions (e.g., filtering stages by the intent's studio)

### 1.6 `completion/complete` Response

**Schema:** `CompleteResultSchema`

```typescript
interface CompleteResult {
  _meta?: Record<string, unknown>         // Protocol metadata — not produced
  completion: {
    values: string[]                      // REQUIRED. Completion suggestions; max 100 items per MCP spec
    total?: number                        // Total available completions (may exceed values.length)
    hasMore?: boolean                     // Whether more completions exist beyond those returned
  }
}
```

**Our constraints:**
- `values` — always capped at 100 entries (MCP spec maximum); sorted by relevance
- `total` — set when total exceeds 100; omitted otherwise
- `hasMore` — set to `true` when total exceeds 100; omitted otherwise

---

## 2. Internal Types (Prompt Registry)

These types exist only in our codebase. They are never serialized over the wire. The registry maps internal prompt definitions to MCP wire format at the handler boundaries.

### 2.1 `PromptDef`

The primary internal type representing a registered prompt.

```typescript
interface PromptDef {
  name: string                            // REQUIRED. Unique prompt name, e.g. "haiku:resume"
                                          // Validation: non-empty, must start with "haiku:"
  title: string                           // REQUIRED. Human-readable display name
                                          // Validation: non-empty string
  description: string                     // REQUIRED. One-line summary
                                          // Validation: non-empty string
  arguments: PromptArgDef[]               // REQUIRED. Argument definitions (empty array if none)
                                          // Unlike the wire Prompt.arguments which is optional,
                                          // internally we always have the array (may be empty)
  handler: PromptHandler                  // REQUIRED. Function that produces the prompt messages
}

type PromptHandler = (args: Record<string, string>) => Promise<GetPromptResult>
```

**Key difference from wire `Prompt`:**
- `title` and `description` are required internally (optional on the wire)
- `arguments` is always an array internally (optional on the wire; converted at the list boundary)
- `handler` exists only internally; never serialized

### 2.2 `PromptArgDef`

Internal argument definition with optional completion support.

```typescript
interface PromptArgDef {
  name: string                            // REQUIRED. Argument identifier
                                          // Validation: non-empty, no whitespace
  description: string                     // REQUIRED. Human-readable description
                                          // Validation: non-empty string
  required: boolean                       // REQUIRED. Whether the argument must be provided
                                          // Explicit boolean — no implicit default
  completer?: ArgumentCompleter           // OPTIONAL. Completion provider for this argument
                                          // If absent, completion/complete returns empty values
}

type ArgumentCompleter = (
  value: string,                          // Partial input (prefix typed so far)
  context?: Record<string, string>        // Previously-resolved argument values from other args
) => Promise<string[]>
```

**Key difference from wire `PromptArgument`:**
- `description` and `required` are required internally (optional on the wire)
- `completer` exists only internally; never serialized; drives the completion/complete handler

### 2.3 Registry API

The prompt registry is a `Map<string, PromptDef>` with the following public surface:

```typescript
// Registration (called at server startup, once per prompt)
function registerPrompt(def: PromptDef): void

// List all prompts — transforms PromptDef[] to wire Prompt[]
function listPrompts(): Prompt[]

// Get a prompt by name — validates name + required args, delegates to handler
function getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult>

// Complete an argument — dispatches to the appropriate PromptArgDef.completer
function completeArgument(params: CompleteRequestParams): Promise<CompleteResult>
```

**Transformation rules (internal to wire):**

| Internal field | Wire field | Transformation |
|---|---|---|
| `PromptDef.name` | `Prompt.name` | Pass through |
| `PromptDef.title` | `Prompt.title` | Pass through |
| `PromptDef.description` | `Prompt.description` | Pass through |
| `PromptDef.arguments` | `Prompt.arguments` | If empty array, omit field; otherwise map each `PromptArgDef` to `PromptArgument` (drop `completer`) |
| `PromptDef.handler` | (none) | Not serialized |
| `PromptArgDef.completer` | (none) | Not serialized; used only by `completeArgument()` |

---

## 3. Error Contracts

All prompt-related errors use the JSON-RPC error response format via the SDK's `McpError` class.

### 3.1 Error Class

```typescript
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

class McpError extends Error {
  readonly code: number                   // JSON-RPC error code
  readonly data?: unknown                 // Optional structured error data
  constructor(code: number, message: string, data?: unknown)
}
```

### 3.2 Error Code

All prompt validation errors use a single error code:

```typescript
ErrorCode.InvalidParams = -32602          // JSON-RPC "Invalid params" standard code
```

We do not use `MethodNotFound` (-32601), `InternalError` (-32603), or custom codes for prompt errors. The error code is always `-32602` because prompt errors are fundamentally parameter validation failures.

### 3.3 Error Catalog

#### Protocol-Level Errors (McpError -32602)

These represent invalid requests that the registry can reject before any handler logic runs.
The server throws `McpError(ErrorCode.InvalidParams, message)`.

| Error Condition | Thrown By | Code | Message Format |
|---|---|---|---|
| Unknown prompt name | `getPrompt()` | -32602 | `Unknown prompt: {name}` |
| Missing required argument | `getPrompt()` | -32602 | `Missing required argument: {argName} for prompt {promptName}` |
| Invalid argument value | prompt handler | -32602 | `Invalid value for {argName}: {value}. Expected: {expected}` |
| Intent not found | prompt handler | -32602 | `Intent not found: {slug}` |

#### Application-Level Errors (prompt messages)

These represent valid requests that encounter a state problem. The handler returns a
`GetPromptResult` with a single user-role message describing the error and a recovery action.
No `McpError` is thrown.

| Error Condition | Returned By | Response Type | Message Format |
|---|---|---|---|
| No active intent (when required) | prompt handler | `GetPromptResult` (1 user message) | `No active intent found. Create one with /haiku:new` |

"No active intent" is a state resolution failure, not a parameter validation failure: the user
did not provide an explicit slug, and the system cannot auto-resolve one. Contrast with "Intent
not found" above, where the user explicitly provides a non-existent slug (parameter validation).
See BEHAVIORAL-SPEC.md scenario 2.7 for the authoritative behavior.

**Error flow (protocol-level):**

1. SDK deserializes request and validates JSON-RPC envelope
2. Our handler validates prompt name (throws `McpError` if unknown)
3. Our handler validates required arguments (throws `McpError` if missing)
4. Prompt-specific handler validates argument values and explicit lookups (throws `McpError` on failure)
5. SDK catches `McpError`, serializes as JSON-RPC error response

**Error flow (application-level):**

1. SDK deserializes request and validates JSON-RPC envelope (passes)
2. Our handler validates prompt name and required arguments (passes)
3. Prompt-specific handler encounters a state problem (e.g., no active intent to auto-resolve)
4. Handler returns `GetPromptResult` with a single user-role message describing the error

**Wire format of a protocol error response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Missing required argument: intent for prompt haiku:resume"
  }
}
```

**Wire format of an application error response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "messages": [
      {
        "role": "user",
        "content": { "type": "text", "text": "No active intent found. Create one with /haiku:new" }
      }
    ]
  }
}
```

### 3.4 Completion Error Behavior

Completion requests do NOT throw errors for unknown prompts or arguments. Instead, they return empty results:

```typescript
// Unknown prompt or argument → graceful empty response, no error
{ completion: { values: [] } }
```

This matches MCP convention: completions are best-effort suggestions, not strict lookups. A missing completer or unknown reference is not an error condition.

---

## 4. SDK Import Map

All MCP protocol types are imported from a single module:

```typescript
import {
  // Request schemas (for server.setRequestHandler)
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CompleteRequestSchema,

  // Result types (for handler return values)
  type GetPromptResult,
  type CompleteResult,
  type Prompt,
  type PromptMessage,
  type PromptArgument,
  type CompleteRequestParams,

  // Error handling
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js"
```

No other SDK modules are needed for the prompts subsystem. The `Server` class itself comes from `@modelcontextprotocol/sdk/server/index.js` (already imported in `server.ts`).

---

## 5. Boundary Summary

| Boundary | Direction | Types Used |
|---|---|---|
| Client sends `prompts/list` | In | (no params beyond cursor) |
| Server responds `prompts/list` | Out | `Prompt`, `PromptArgument` |
| Client sends `prompts/get` | In | `name: string`, `arguments?: Record<string, string>` |
| Server responds `prompts/get` | Out | `GetPromptResult`, `PromptMessage`, `TextContent` |
| Client sends `completion/complete` | In | `CompleteRequestParams`, `PromptReference` |
| Server responds `completion/complete` | Out | `CompleteResult` |
| Server responds with error | Out | `McpError` (code + message) |
| Internal registration | Internal only | `PromptDef`, `PromptArgDef`, `PromptHandler`, `ArgumentCompleter` |

---

## 6. Side-Effect Contracts

Prompt handlers may trigger side effects beyond returning messages. These are not part of the MCP prompts protocol itself but are internal contracts that prompt handlers rely on.

### 6.1 Elicitation Contract

The server uses elicitation to gather structured input from the user mid-handler, before constructing the final prompt messages. Elicitation is an MCP capability, not a prompts-specific feature.

**Invocation:**

```typescript
const result = await server.elicitInput({
  message: string,                          // Human-readable question or instruction
  requestedSchema: {
    type: "object",
    properties: {
      [field: string]: {
        type: string,                       // "string", "number", "boolean"
        title: string,                      // Display label
        description: string,                // Help text
        enum?: string[]                     // Constrained choices (renders as select/radio)
      }
    },
    required: string[]                      // Which fields must be answered
  }
})
```

**Response:**

```typescript
interface ElicitationResult {
  action: "accept" | "decline" | "cancel"   // User's disposition
  content?: Record<string, string>          // Field values (present when action = "accept")
}
```

**Wire method:** `elicitation/create` (server-to-client request)

**Used by:**
- `haiku:new` — studio selection when no project-level override
- `haiku:new` — active intent conflict resolution
- `haiku:new` — template parameter gathering
- `haiku:refine` — target selection when no target argument provided
- `haiku:composite` — multi-studio selection
- `haiku:setup` — provider configuration
- `haiku:adopt` — existing feature identification

**Fallback behavior:**

If the client does not support the `elicitation` capability, the handler catches the capability error and falls back to including the question in the prompt messages instead. The agent is then instructed to ask the user via `ask_user_visual_question`. See BEHAVIORAL-SPEC.md scenario 5.5 for the authoritative behavior.

### 6.2 `open_review` Contract

The `open_review` MCP tool creates a visual review session. Prompt handlers call it internally as a side effect before returning messages.

**Input:**

```typescript
interface OpenReviewInput {
  intent_dir: string                        // Absolute path to .haiku/intents/{slug}/
  review_type: "intent" | "unit"            // Scope of the review
  target?: string                           // Specific unit or stage name (for unit reviews)
}
```

**Output:**

```typescript
interface OpenReviewOutput {
  review_url: string                        // URL for the visual review session
  session_id: string                        // Unique session identifier for polling
}
```

**Used by:**
- `haiku:resume` — when the orchestrator returns `gate_ask` action. The handler calls `open_review` before constructing the gate prompt messages. The returned `review_url` is embedded in the instruction message so the agent can direct the user to it.

**Error handling:**
- If `open_review` fails (e.g., port conflict), the handler falls back to a text-only gate prompt. See BEHAVIORAL-SPEC.md scenario 4.3 for the authoritative fallback behavior.

**Note:** `open_review` already exists as a registered MCP tool. Prompt handlers invoke it internally via the tool dispatch mechanism, not by importing a function directly.
