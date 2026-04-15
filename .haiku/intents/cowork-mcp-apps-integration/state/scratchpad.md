# unit-03-open-review-mcp-apps-branch scratchpad

## Status: complete (bolt 1, builder hat)

## What was done

### server.ts changes
1. **New imports**: Added `logSessionEvent` from `./session-metadata.js`, `notifySessionUpdate` + `updateSession` from `./sessions.js`, `hostSupportsMcpApps` + `setFrontmatterField` from `./state-tools.js`, `buildUiResourceMeta` added to `./ui-resource.js` import.
2. **Module-level variables**: `_currentReviewSignal: AbortSignal | undefined` and `_reviewResultMeta: { ui: { resourceUri: string } } | undefined`
3. **CallToolRequestSchema handler**: Now receives `extra` second param, passes `extra.signal` to `handleToolCall`
4. **handleToolCall**: Updated signature to accept optional `signal: AbortSignal`. Orchestrator tool branch now threads signal via `_currentReviewSignal` with try/finally cleanup.
5. **haiku_cowork_review_submit tool**: Added to ListToolsRequestSchema tools array (1 of 2 occurrences)
6. **haiku_cowork_review_submit dispatch**: Added before final Unknown tool fallthrough (2 of 2 occurrences). Uses discriminated union Zod schema. `review` variant wired end-to-end; `question`/`design_direction` return `"unimplemented — see unit-04"`.
7. **setOpenReviewHandler branched**: `if (hostSupportsMcpApps())` MCP Apps arm + fallthrough HTTP arm (byte-identical to main).

### Test file
- `packages/haiku/test/open-review-mcp-apps.test.mjs`
- 26 tests across Groups A-K covering all CCs
- All passing

## CC Status
- CC-1: ✅ Non-MCP-Apps arm byte-identical (fallthrough)
- CC-2: ✅ MCP Apps arm skips local I/O (Group A/G tests)
- CC-3: ✅ _meta.ui.resourceUri threading via _reviewResultMeta (Group B tests)
- CC-4: ✅ exactly 2 occurrences of haiku_cowork_review_submit in server.ts
- CC-5: ✅ approved round-trip (Group C)
- CC-6: ✅ changes_requested + external_review (Groups D/E)
- CC-7: ✅ V5-10 timeout fallback (Group H)
- CC-8: ✅ V5-11 state byte-identity (Group I)
- CC-9: ✅ commit message contains `unit-02-outcome: blocking`
- CC-10: ✅ no env-var coupling in diff
- CC-11: ✅ question/design_direction stubbed (Group J)
- CC-12: ✅ typecheck + biome + full test suite (286 tests, all pass)
