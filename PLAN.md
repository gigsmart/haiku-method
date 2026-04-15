# PLAN — unit-03-open-review-mcp-apps-branch

**Hat:** planner
**Bolt:** 1
**Date:** 2026-04-15
**Commit-message note:** every commit on this unit MUST include `unit-02-outcome: blocking` in the message body.

---

## Summary

Two deliverables, in dependency order:

1. **Branch `setOpenReviewHandler` on `hostSupportsMcpApps()`** — the non-MCP-Apps arm
   stays byte-identical to main inside an `else` block; the new MCP Apps arm skips local
   I/O, returns a tool result with `_meta.ui.resourceUri`, and blocks on a
   `waitForSession` promise (30 min, single await, no retry loop).
2. **`haiku_cowork_review_submit` tool** — one append to `ListToolsRequestSchema` array,
   one `case` in `handleToolCall` dispatch. `review` variant is wired end-to-end;
   `question` and `design_direction` variants get schema slots but return
   `"unimplemented — see unit-04"`.

Foundation from unit-01 (`hostSupportsMcpApps`) and unit-02 (`buildUiResourceMeta`,
`REVIEW_RESOURCE_URI`, `ui-resource.ts`) is present in this worktree after merging
`haiku/cowork-mcp-apps-integration/main` at 37456cb8.

---

## Files to Modify

| File | Change | Rationale |
|---|---|---|
| `packages/haiku/src/server.ts` | Modify | (1) Thread `extra.signal` into `handleToolCall`. (2) Branch `setOpenReviewHandler` body on `hostSupportsMcpApps()`. (3) Add `haiku_cowork_review_submit` to `ListToolsRequestSchema` array. (4) Add dispatch case in `handleToolCall`. |
| `packages/haiku/test/open-review-mcp-apps.test.mjs` | Create (new) | All in-scope Vitest scenarios. |

**Must not touch:** `orchestrator.ts` (keep changes confined to `server.ts`),
`sessions.ts`, `state-tools.ts`, `ui-resource.ts`, `http.ts`.

---

## Implementation Steps (dependency order)

### Step 1 — Thread `extra.signal` into `handleToolCall`

`server.ts:417` currently registers `CallToolRequestSchema` with `async (request)`.
The MCP SDK passes a `RequestHandlerExtra` with `signal: AbortSignal` as the
second parameter (confirmed in `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts:177`).

Changes:
1. Change the handler to `async (request, extra) =>`.
2. Pass `extra.signal` into `handleToolCall`: `handleToolCall(request, extra.signal)`.
3. Update `handleToolCall` signature to `async function handleToolCall(request, signal?: AbortSignal)`.
4. **Do not** pass `signal` deeper into `handleOrchestratorTool` (that would
   require touching `orchestrator.ts`). Instead, capture the signal in a
   closure-local variable inside `setOpenReviewHandler` — see Step 3.

### Step 2 — Add `haiku_cowork_review_submit` tool registration

Append one entry to the `tools: [...]` array inside
`server.setRequestHandler(ListToolsRequestSchema, ...)` at `server.ts:232`.

Tool spec (JSON Schema form — derived from DATA-CONTRACTS.md Zod source):

```json
{
  "name": "haiku_cowork_review_submit",
  "description": "Submit a review decision, question answer, or design-direction selection from the MCP Apps review SPA. Called by the host bridge when the user completes the review form.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_type": {
        "type": "string",
        "enum": ["review", "question", "design_direction"]
      },
      "session_id": { "type": "string", "format": "uuid" },
      "decision": {
        "type": "string",
        "enum": ["approved", "changes_requested", "external_review"],
        "description": "Required when session_type is 'review'"
      },
      "feedback": {
        "type": "string",
        "description": "Required (may be empty) when session_type is 'review'"
      },
      "answers": {
        "type": "array",
        "items": { "type": "object" },
        "description": "Required (min 1) when session_type is 'question'"
      },
      "archetype": {
        "type": "string",
        "description": "Required (non-empty) when session_type is 'design_direction'"
      },
      "parameters": {
        "type": "object",
        "additionalProperties": { "type": "number" },
        "description": "Required when session_type is 'design_direction'"
      },
      "annotations": { "type": "object", "description": "Optional" },
      "comments": { "type": "string", "description": "Optional, design_direction only" }
    },
    "required": ["session_type", "session_id"]
  }
}
```

**CC-4 constraint:** after this change,
`rg 'haiku_cowork_review_submit' packages/haiku/src/server.ts | wc -l`
must return exactly `2` (one in the `tools` array, one in the dispatch case).

### Step 3 — Add dispatch case in `handleToolCall`

Add an `if` block for `haiku_cowork_review_submit` before the final
`Unknown tool` fallthrough (around line 806).

#### Zod schema (paste into server.ts)

```typescript
const ReviewAnnotationsSchema = z.object({
  screenshot: z.string().optional(),
  pins: z.array(z.object({
    x: z.number(), y: z.number(), text: z.string(),
  })).optional(),
  comments: z.array(z.object({
    selectedText: z.string(), comment: z.string(), paragraph: z.number(),
  })).optional(),
}).optional()

const QuestionAnswerSchema = z.object({
  question: z.string(),
  selectedOptions: z.array(z.string()),
  otherText: z.string().optional(),
})

const QuestionAnnotationsSchema = z.object({
  comments: z.array(z.object({
    selectedText: z.string(), comment: z.string(), paragraph: z.number(),
  })).optional(),
}).optional()

const ReviewSubmitInput = z.discriminatedUnion("session_type", [
  z.object({
    session_type: z.literal("review"),
    session_id: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested", "external_review"]),
    feedback: z.string(),
    annotations: ReviewAnnotationsSchema,
  }),
  z.object({
    session_type: z.literal("question"),
    session_id: z.string().uuid(),
    answers: z.array(QuestionAnswerSchema).min(1),
    feedback: z.string().optional(),
    annotations: QuestionAnnotationsSchema,
  }),
  z.object({
    session_type: z.literal("design_direction"),
    session_id: z.string().uuid(),
    archetype: z.string().min(1),
    parameters: z.record(z.number()),
    comments: z.string().optional(),
    annotations: z.object({
      screenshot: z.string().optional(),
      pins: z.array(z.object({ x: z.number(), y: z.number(), text: z.string() })).optional(),
    }).optional(),
  }),
])
```

Note: `.min(1)` on `answers` and `.min(1)` on `archetype` are required per
DATA-CONTRACTS.md spec review (observations 3 and 4).

#### Dispatch logic

```typescript
if (name === "haiku_cowork_review_submit") {
  const parsed = ReviewSubmitInput.safeParse(args ?? {})
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid input: ${parsed.error.message}` }],
      isError: true,
    }
  }
  const input = parsed.data

  // session_type: "question" and "design_direction" are stubbed for unit-04
  if (input.session_type === "question" || input.session_type === "design_direction") {
    return {
      content: [{ type: "text", text: "unimplemented — see unit-04" }],
      isError: true,
    }
  }

  // review path
  const session = getSession(input.session_id)
  if (!session) {
    return {
      content: [{ type: "text", text: `Session not found: ${input.session_id}` }],
      isError: true,
    }
  }
  if (session.session_type !== input.session_type) {
    return {
      content: [{
        type: "text",
        text: `session_type mismatch: expected ${session.session_type}, got ${input.session_type}`,
      }],
      isError: true,
    }
  }
  if (session.status !== "pending") {
    return {
      content: [{ type: "text", text: `Session already closed: ${input.session_id}` }],
      isError: true,
    }
  }
  updateSession(input.session_id, {
    status: "decided",
    decision: input.decision,
    feedback: input.feedback,
    annotations: input.annotations,
  })
  notifySessionUpdate(input.session_id)
  return { content: [{ type: "text", text: '{"ok":true}' }] }
}
```

### Step 4 — Branch `setOpenReviewHandler` on `hostSupportsMcpApps()`

Wrap the entire existing handler body in `else { ... }`. Add the new MCP Apps
arm above it.

```typescript
setOpenReviewHandler(
  async (intentDirRel: string, reviewType: string, gateType?: string) => {
    if (hostSupportsMcpApps()) {
      // ── MCP Apps arm (unit-03) ──────────────────────────────────────────
      // Capture the AbortSignal from the current tool call.
      // _currentReviewSignal is set by handleToolCall before calling
      // handleOrchestratorTool and cleared in a finally block.
      const signal = _currentReviewSignal

      const intentDirAbs = resolve(process.cwd(), intentDirRel)
      const intent = await parseIntent(intentDirAbs)
      if (!intent) throw new Error("Could not parse intent")

      const units = await parseAllUnits(intentDirAbs)
      const dag = buildDAG(units)
      const mermaid = toMermaidDefinition(dag, units)
      const criteriaSection = intent.sections.find(
        (s) => s.heading?.toLowerCase().includes("completion criteria") ||
               s.heading?.toLowerCase().includes("success criteria"),
      )
      const criteria = criteriaSection ? parseCriteria(criteriaSection.content) : []

      const session = createSession({
        intent_dir: intentDirAbs,
        intent_slug: intent.slug,
        review_type: reviewType as "intent" | "unit",
        gate_type: gateType,
        target: "",
        html: "",
      })
      Object.assign(session, { parsedIntent: intent, parsedUnits: units, parsedCriteria: criteria, parsedMermaid: mermaid })

      const stageStates = await parseStageStates(intentDirAbs)
      const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
      const stageArtifacts = await parseStageArtifacts(intentDirAbs)
      const outputArtifacts = await parseOutputArtifacts(intentDirAbs)
      for (const oa of outputArtifacts) {
        if (oa.type === "image" && oa.relativePath) {
          oa.relativePath = `/stage-artifacts/${session.session_id}/stages/${oa.relativePath}`
        }
      }
      Object.assign(session, { stageStates, knowledgeFiles, stageArtifacts, outputArtifacts })

      const sessionDataJSON = JSON.stringify(session)

      // Store _meta for handleToolCall to attach to the tool result.
      // handleToolCall sets _reviewResultMeta = undefined after the call.
      _reviewResultMeta = buildUiResourceMeta(REVIEW_RESOURCE_URI)

      // Single await — blocking path (unit-02-outcome: blocking)
      const abortPromise = new Promise<never>((_, reject) => {
        if (signal?.aborted) { reject(new Error("host_timeout")); return }
        signal?.addEventListener("abort", () => reject(new Error("host_timeout")), { once: true })
      })

      try {
        await Promise.race([
          waitForSession(session.session_id, 30 * 60 * 1000),
          abortPromise,
        ])
      } catch (err) {
        if (signal?.aborted || (err as Error).message === "host_timeout") {
          // V5-10: log timeout event
          try {
            const stFile = join(process.cwd(), intentDirRel, "..", "..", "session.log")
            logSessionEvent(stFile, {
              event: "gate_review_host_timeout",
              detected_at_seconds: Date.now() / 1000,
            })
          } catch { /* non-fatal */ }
          // V5-11: do NOT touch state.json
          clearHeartbeat(session.session_id)
          // Write blocking_timeout_observed to intent.md frontmatter
          try {
            const intentFilePath = join(process.cwd(), intentDirRel, "intent.md")
            setFrontmatterField(intentFilePath, "blocking_timeout_observed", true)
          } catch { /* non-fatal */ }
          return {
            decision: "changes_requested",
            feedback: "Review timed out before decision was submitted. Please retry.",
            annotations: undefined,
          }
        }
        throw err
      }

      const updated = getSession(session.session_id)
      clearHeartbeat(session.session_id)
      if (updated && updated.session_type === "review" && updated.status === "decided") {
        return {
          decision: updated.decision,
          feedback: updated.feedback,
          annotations: updated.annotations,
        }
      }
      throw new Error("Session resolved but no decision found")
    } else {
      // ── HTTP + tunnel + browser arm (existing — byte-identical to main) ──
      const intentDirAbs = resolve(process.cwd(), intentDirRel)
      // ... [entire existing body, unchanged] ...
    }
  },
)
```

**Important:** the `else` arm body must be byte-identical to the current
handler body in `main`. The builder must not reformat or reindent the existing
code — only wrap it in `} else {`.

#### Module-level variables for signal and _meta threading

Add two module-level `let` declarations near the top of `server.ts`
(after the import block, before `setMcpServerInstance`):

```typescript
// Threading: AbortSignal from the current haiku_run_next tool call,
// captured before handleOrchestratorTool so _openReviewAndWait can observe it.
let _currentReviewSignal: AbortSignal | undefined = undefined

// Threading: _meta.ui to attach to the tool result after _openReviewAndWait resolves.
// Set by the MCP Apps branch of setOpenReviewHandler, cleared by handleToolCall.
let _reviewResultMeta: { ui: { resourceUri: string } } | undefined = undefined
```

In `handleToolCall`, wrap the orchestrator tool call:

```typescript
if (name === "haiku_run_next" || ...) {
  _currentReviewSignal = signal
  try {
    const result = await handleOrchestratorTool(name, args ?? {})
    // Attach _meta if the MCP Apps review path set it
    if (_reviewResultMeta) {
      return { ...result, _meta: _reviewResultMeta }
    }
    return result
  } finally {
    _currentReviewSignal = undefined
    _reviewResultMeta = undefined
  }
}
```

### Step 5 — Imports and exports

Add to `server.ts` imports:
- `hostSupportsMcpApps` from `./state-tools.js` (may already be imported)
- `buildUiResourceMeta`, `REVIEW_RESOURCE_URI` from `./ui-resource.js` (already imported post-merge)
- `logSessionEvent` from `./session-metadata.js`
- `setFrontmatterField` from `./state-tools.js`
- `getSession`, `updateSession`, `notifySessionUpdate`, `clearHeartbeat` from `./sessions.js`
- `join` from `node:path` (for stFile derivation)

Verify each import is not already present before adding duplicates.

### Step 6 — Typecheck, lint, test

```bash
cd packages/haiku
npx tsc --noEmit                                    # must be clean
npx biome check src/server.ts                       # must be clean
npx vitest run test/open-review-mcp-apps.test.mjs   # all tests pass
npx vitest run                                       # full suite, all pass
```

---

## Test Coverage

New file: `packages/haiku/test/open-review-mcp-apps.test.mjs`

Follow the pattern from `capability-negotiation.test.mjs` — plain Node.js
`assert`, minimal in-process stubs. Use Vitest (`import { test, expect, vi } from "vitest"`).

### Group A — MCP Apps arm skips local I/O (CC-2)

- Stub `hostSupportsMcpApps()` → true.
- Spy on `startHttpServer`, `openTunnel`, and `spawn` (the `openBrowser` function).
- Invoke the `setOpenReviewHandler` callback.
- Assert `callCount === 0` for each of the three spies.

### Group B — Tool result carries `_meta.ui.resourceUri` (CC-3)

- Trigger the handler on the MCP Apps path.
- Assert the MCP tool result (as returned by `handleToolCall`) has
  `result._meta.ui.resourceUri === REVIEW_RESOURCE_URI`.
- Assert `REVIEW_RESOURCE_URI` matches `/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/`.

### Group C — Review round-trip: approved (CC-5)

- Stub a pending `ReviewSession`.
- Trigger the handler; in parallel, call the `haiku_cowork_review_submit`
  dispatch with `{ session_type: "review", session_id, decision: "approved", feedback: "" }`.
- Assert handler resolves with `{ decision: "approved", feedback: "", annotations: undefined }`.
- Assert tool returns `{ content: [{ type: "text", text: '{"ok":true}' }] }`.

### Group D — Review round-trip: changes_requested (CC-6a)

- Same as Group C but `decision: "changes_requested"`, `feedback: "Fix X"`.
- Assert handler resolves with `{ decision: "changes_requested", feedback: "Fix X", ... }`.

### Group E — Review round-trip: external_review (CC-6b)

- Same as Group C but `decision: "external_review"`.
- Assert handler resolves with `{ decision: "external_review", feedback: "", annotations: undefined }`.

### Group F — Shape parity with HTTP snapshot (CC-5 / CC-6)

- Invoke HTTP path handler with stubbed session → capture resolved object.
- Invoke MCP Apps path handler → capture resolved object.
- Assert `JSON.stringify(mcpResult) === JSON.stringify(httpResult)`.

### Group G — Non-MCP-Apps regression (CC-1)

- `hostSupportsMcpApps()` → false.
- Assert `startHttpServer` IS called.
- Assert tool result does NOT have `_meta.ui.resourceUri`.

### Group H — V5-10 host-timeout fallback (CC-7)

- Inject an `AbortSignal` that fires after 100ms (`AbortSignal.timeout(100)`).
- Assert handler resolves with:
  - `decision === "changes_requested"`
  - `feedback === "Review timed out before decision was submitted. Please retry."`
  - `annotations === undefined`
- Assert session log (`stFile`) gains a `gate_review_host_timeout` event with
  `detected_at_seconds` field (number).
- Assert `intent.md` frontmatter has `blocking_timeout_observed: true`.
- Assert handler returns exactly once (no retry).
- Assert no resume token was written.

### Group I — V5-11 state byte-identity on timeout (CC-8)

- Snapshot `state.json` content before the AbortSignal fires.
- After handler resolves, snapshot `state.json` again.
- Assert byte-identical strings.

### Group J — Stubbed question/design_direction variants (CC-11)

- Submit `{ session_type: "question", session_id: someUUID, answers: [...] }`.
- Assert `isError: true`.
- Assert `content[0].text` contains `"unimplemented — see unit-04"`.
- Repeat for `session_type: "design_direction"`.

### Group K — Error validation cases

- Unknown `session_id` → `isError: true`, message contains `"Session not found:"`.
- `session_type` mismatch → `isError: true`, message contains `"session_type mismatch:"`.
- Session status already `"decided"` → `isError: true`, message contains `"Session already closed:"`.
- Zod validation failure (bad `decision` enum) → `isError: true`, message starts with `"Invalid input:"`.

---

## Verification Commands for All 12 Completion Criteria

```bash
# CC-1: Non-MCP-Apps byte-identity (visual diff check)
git diff main -- packages/haiku/src/server.ts \
  | grep -A 200 '^\+.*hostSupportsMcpApps' \
  | head -100
# Visually confirm the else-arm body is unchanged

# CC-2, CC-3: Vitest Group A + B
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  --reporter=verbose 2>&1 | grep -E 'PASS|FAIL|skip'

# CC-4: Exactly 2 occurrences of haiku_cowork_review_submit
rg 'haiku_cowork_review_submit' packages/haiku/src/server.ts | wc -l
# expected output: 2

# CC-5: Vitest Group C
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  -t "approved"

# CC-6: Vitest Group D + E
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  -t "changes_requested|external_review"

# CC-7: Vitest Group H
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  -t "timeout"

# CC-8: Vitest Group I
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  -t "state.json"

# CC-9: Commit message contains unit-02-outcome
git log --oneline | head -20 | grep 'unit-02-outcome: blocking'
# expected: at least one hit

# CC-10: No env-var coupling in server.ts diff
git diff main -- packages/haiku/src/server.ts \
  | grep -E 'CLAUDE_CODE_IS_COWORK|isCoworkHost'
# expected: zero output

# CC-11: Vitest Group J
cd packages/haiku && npx vitest run test/open-review-mcp-apps.test.mjs \
  -t "unimplemented"

# CC-12: Full typecheck + lint + test suite
cd packages/haiku && npx tsc --noEmit && npx biome check src/ && npx vitest run
# expected: all exit 0
```

---

## Risks

### R1 — `_meta` threading from handler to tool result (HIGH)

The `_openReviewAndWait` callback's return type is
`Promise<{ decision, feedback, annotations? }>`. The `_meta.ui.resourceUri` must
appear on the MCP tool result, not on the decision object. The module-level
`_reviewResultMeta` variable approach (Option B from the architectural analysis)
avoids orchestrator changes. The builder MUST clear this variable in a `finally`
block to prevent leaking state across calls.

### R2 — AbortSignal threading (MEDIUM)

`extra.signal` is only available in the `setRequestHandler` callback. The
module-level `_currentReviewSignal` variable (set before calling
`handleOrchestratorTool`, cleared in `finally`) must be closure-safe — only one
`gate_review` can be in flight at a time per MCP connection, so a single
module-level variable is safe for sequential calls. If the server ever handles
concurrent requests (it doesn't today due to stdio transport serialization),
this would need a Map keyed on session ID.

### R3 — `stFile` path derivation (MEDIUM)

The session log path must be derived from `intentDirRel` inside the handler.
Confirm the path convention from `orchestrator.ts:3173` — `stFile` is passed
from `args.state_file`. The handler does not receive this. Derive it as:
`join(process.cwd(), intentDirRel, "..", "..", "session.log")` and verify
this resolves to `.haiku/session.log` for a typical intent dir of
`.haiku/intents/<slug>`. If the path is wrong, the `gate_review_host_timeout`
log event is silently skipped (wrapped in `try/catch`) — CC-7 timeout log
assertion will fail. Fix the path derivation first.

### R4 — Byte-identity of non-MCP-Apps arm (HIGH)

The entire existing handler body must be byte-identical to main inside the
`else` branch. Do not reformat or reindent. The biome formatter MUST NOT be
run on the `else` block's contents. Run `git diff main -- packages/haiku/src/server.ts`
and confirm no diff lines appear within the `else { ... }` body other than
the added `} else {` wrapper lines.

### R5 — Pending-promise lifecycle (LOW)

`waitForSession` is keyed on `session.session_id` (UUID). Concurrent review
sessions would have distinct UUIDs and distinct promises. The AbortSignal
race in the MCP Apps arm must reject cleanly without leaving orphaned listeners.
Use `{ once: true }` on the `addEventListener` call to auto-remove on first fire.

### R6 — Zod discriminated union `.min(1)` constraints (LOW)

DATA-CONTRACTS.md spec review requires `.min(1)` on `answers` array and
`.min(1)` on `archetype` string. The builder MUST include these. CC-11
stubs both variants, but a future test that calls `question` with an empty
`answers: []` must get a Zod validation error, not a 409. The constraint
must be in the schema, not a runtime check.

### R7 — `logSessionEvent` import in `server.ts` (LOW)

`session-metadata.ts` exports `logSessionEvent`. Confirm it is not already
imported into `server.ts` before adding a new import. The worktree's current
`server.ts` does not import it — add it.

---

## Commit Requirements

All commits on this unit MUST include `unit-02-outcome: blocking` in the body.

Suggested implementation commit message:
```
feat(unit-03): branch setOpenReviewHandler on hostSupportsMcpApps + haiku_cowork_review_submit tool

- Branch setOpenReviewHandler on hostSupportsMcpApps(). Non-MCP-Apps arm
  is byte-identical to main inside an else block.
- MCP Apps arm skips startHttpServer/openTunnel/openBrowser; creates session,
  sets _reviewResultMeta, awaits waitForSession (single 30-min await, no retry).
- V5-10: AbortSignal race resolves with synthetic changes_requested payload;
  logs gate_review_host_timeout event; writes blocking_timeout_observed to
  intent.md frontmatter. State.json untouched (V5-11).
- haiku_cowork_review_submit tool: discriminated union schema (review wired
  end-to-end; question/design_direction stubbed for unit-04).
- Thread extra.signal from CallTool handler into _openReviewAndWait via
  module-level _currentReviewSignal variable.

unit-02-outcome: blocking
```
