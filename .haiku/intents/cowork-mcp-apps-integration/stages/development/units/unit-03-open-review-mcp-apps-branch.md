---
title: _openReviewAndWait MCP Apps branch + haiku_cowork_review_submit tool
type: feature
model: sonnet
depends_on:
  - unit-01-capability-negotiation-probe
  - unit-02-ui-resource-registration
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - features/iframe-review-gate.feature
  - features/iframe-decision-submit.feature
  - .haiku/knowledge/ARCHITECTURE.md
status: active
bolt: 1
hat: planner
started_at: '2026-04-15T16:05:33Z'
hat_started_at: '2026-04-15T16:05:33Z'
---

# _openReviewAndWait MCP Apps branch + haiku_cowork_review_submit tool

## Scope

Branch `setOpenReviewHandler` on `hostSupportsMcpApps()`. The non-MCP-Apps arm stays byte-identical to today's HTTP+tunnel+browser implementation. The MCP Apps arm skips all local I/O, returns a tool result carrying `_meta.ui.resourceUri` from `buildUiResourceMeta()`, and awaits a decision submitted via the new `haiku_cowork_review_submit` tool. Default outcome per unit-02 of inception is **blocking**, with the V5-10 host-timeout fallback.

### In scope

- **Branch on `hostSupportsMcpApps()`** inside the handler registered at `setOpenReviewHandler` (`packages/haiku/src/server.ts:~768`). Non-MCP-Apps arm is **diff-checkable** against `main` — zero behavioral change.
- **MCP Apps arm skips** `startHttpServer`, `openTunnel`, `openBrowser`. Immediately builds a session via `createSession`, attaches the `_meta.ui.resourceUri` from `buildUiResourceMeta('ui://haiku/review/<version>')`, and awaits the pending-decision promise keyed on `session.session_id`.
- **`haiku_cowork_review_submit` tool** registered by a one-append to the flat `ListToolsRequestSchema` array (`server.ts:~189`) plus one `case` in the dispatch. Input is `z.discriminatedUnion('session_type', [...])` with three variants per `DATA-CONTRACTS.md`. For this unit, only the `review` variant is wired up end-to-end; `question` and `design_direction` variants get schema slots but throw `"unimplemented — see unit-04"` on invocation. Unit-04 implements those.
- **V5-10 host-timeout fallback.** The handler observes the MCP SDK `AbortSignal` threaded through the tool call. On cancel, log `gate_review_host_timeout` to `stFile`, clear the pending promise, resolve with synthetic `{decision: "changes_requested", feedback: "Review timed out before decision was submitted. Please retry.", annotations: undefined}`, and write `blocking_timeout_observed: true` to the intent.md frontmatter.
- **V5-11 state untouched on timeout.** State.json is byte-identical pre and post timeout.
- **Tests.** Three decision paths (`approved`, `changes_requested`, `external_review`) × both host modes (MCP Apps + HTTP). Plus a host-timeout test that asserts the V5-10 / V5-11 behavior.

### Out of scope

- `ask_user_visual_question` and `pick_design_direction` Cowork branches (unit-04 — and the submit tool's `question` / `design_direction` variants).
- HTTP-path behavior — must stay byte-identical.
- The SPA host-bridge module (unit-05).
- Telemetry tagging.

## Completion Criteria

1. **Non-MCP-Apps byte-identity.** `git diff main -- packages/haiku/src/server.ts` shows the pre-intent HTTP branch body unchanged inside an `if (hostSupportsMcpApps())` else-arm — diff-checkable.
2. **MCP Apps arm skips local I/O.** Vitest with stub client advertising `experimental.apps` spies on `startHttpServer`, `openTunnel`, `openBrowser`, asserts `callCount === 0` for each.
3. **Entry tool result carries envelope.** Assertion: `result._meta.ui.resourceUri === "ui://haiku/review/" + REVIEW_APP_VERSION`.
4. **Tool registered once.** `rg 'haiku_cowork_review_submit' packages/haiku/src/server.ts | wc -l` returns exactly `2` (array entry + dispatch case).
5. **Review variant round-trip.** Vitest: submit `{session_type: "review", session_id, decision: "approved", feedback: ""}` → pending promise resolves → orchestrator sees `{decision: "approved", feedback: "", annotations: undefined}` identical to HTTP snapshot.
6. **Changes/external variants.** Similar round-trip tests for `decision: "changes_requested"` (with non-empty feedback) and `decision: "external_review"`.
7. **V5-10 host-timeout fallback.** Vitest injects `AbortSignal` that fires after 100ms; asserts:
   - Handler resolves with `{decision: "changes_requested", feedback: "Review timed out...", annotations: undefined}`.
   - `stFile` gains a `gate_review_host_timeout` event with `detected_at_seconds`.
   - `intent.md` frontmatter gains `blocking_timeout_observed: true`.
   - Handler does NOT call itself again, does NOT write a resume token.
8. **V5-11 state byte-identity.** Snapshot `.haiku/intents/<slug>/stages/<stage>/state.json` before and after timeout; bytes are identical.
9. **Unit-02 outcome recorded.** Commit message contains `unit-02-outcome: blocking`.
10. **No env-var coupling in server.ts changes.** `git diff main -- packages/haiku/src/server.ts | grep -E 'CLAUDE_CODE_IS_COWORK|isCoworkHost'` returns zero.
11. **Question/direction variants stubbed.** Submitting `session_type: "question"` via the tool returns an `isError: true` tool result with message containing `"unimplemented — see unit-04"`. Same for `"design_direction"`.
12. **Typecheck + lint + full test suite** clean.
