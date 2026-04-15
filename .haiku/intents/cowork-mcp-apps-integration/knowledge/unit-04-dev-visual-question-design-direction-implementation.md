# unit-04: ask_user_visual_question + pick_design_direction MCP Apps branches

## What was built

Applied the unit-03 pattern to the two remaining review handlers in server.ts.

### New modules

- `packages/haiku/src/ask-visual-question-mcp-apps.ts` — Extracted MCP Apps arm for `ask_user_visual_question`. Creates a QuestionSession, sets `_meta.ui.resourceUri`, blocks on `waitForSession()`, returns `{ status, answers, feedback?, annotations? }` shape matching the HTTP arm's `questionResult` object. V5-10 timeout returns synthetic `{ status: "timeout", answers: [], feedback: "Question timed out" }`.

- `packages/haiku/src/pick-design-direction-mcp-apps.ts` — Extracted MCP Apps arm for `pick_design_direction`. Creates a DesignDirectionSession, blocks on `waitForSession()`. On success: writes `design_direction_selected: true` + selection to stage state (identical path to HTTP arm at `server.ts:828-852`), returns conversational text. V5-10 timeout returns synthetic first-archetype selection with "Timed out" comment.

Both modules structurally prohibit `./http.js`, `./tunnel.js`, and `node:child_process` imports.

### server.ts changes

- Added `updateQuestionSession`, `updateDesignDirectionSession` to sessions.js import
- Added imports for two new modules
- Inserted `hostSupportsMcpApps()` branch in `ask_user_visual_question` handler (after input parsing, before HTTP session creation)
- Inserted `hostSupportsMcpApps()` branch in `pick_design_direction` handler (after archetype/parameter resolution, before HTTP session creation)
- Replaced "unimplemented — see unit-04" stub in `haiku_cowork_review_submit` with real `question` and `design_direction` handlers using `updateQuestionSession`/`updateDesignDirectionSession`

### Tests

- `packages/haiku/test/ask-visual-question-mcp-apps.test.mjs` — 7 tests covering structural guarantee, round-trips, V5-10 timeout, _meta callback
- `packages/haiku/test/pick-design-direction-mcp-apps.test.mjs` — 7 tests covering structural guarantee, round-trips with stage-state write verification, V5-10 timeout, _meta callback
- `packages/haiku/test/open-review-mcp-apps.test.mjs` — Updated Group J (removed stubs, added real round-trip tests), added Group L (end-to-end with all three session types)

## Completion criteria status

All 11 criteria pass:
1. `hostSupportsMcpApps` hits ≥ 3 in server.ts (4 hits)
2. MCP Apps arm skips HTTP/tunnel (structural + behavioral tests)
3. ask_user_visual_question round-trip passes
4. pick_design_direction round-trip + stage-state write passes
5. Single polymorphic tool: 3 `session_type: z.literal` hits
6. No new submit tools: 0 hits for alternate tool names
7. HTTP path byte-identical (only additive changes in diff)
8. V5-10 fallback tested on both handlers
9. End-to-end test: all three session types via haiku_cowork_review_submit
10. No env-var coupling: 0 grep hits
11. 308 tests, 0 failed; typecheck + biome clean

## Architectural notes

The `_reviewResultMeta` module-scoped slot (set by `setOpenReviewHandler` for review sessions) is reused for question and design_direction sessions. The MCP Apps arm sets it via a callback before the await, then the caller reads and clears it immediately after the arm returns, attaching it to the tool result. This avoids adding new module-level slots while maintaining the same attachment pattern.
