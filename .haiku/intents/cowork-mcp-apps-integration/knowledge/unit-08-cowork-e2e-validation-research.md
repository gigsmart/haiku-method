# Unit 08 Research — Cowork E2E Validation Checkpoints

Researcher hat, read-only. Test-plan scaffold only — no execution, no code.

## 1. Observable checkpoints for `/haiku:start` → approve → advance

Flow inside Cowork with built binary, walking through the inception gate. `[M]` = manual step performed by validator, `[A]` = automated assertion against disk state.

1. **[M]** Launch Cowork session with `CLAUDE_CODE_IS_COWORK=1` set by host; workspace folder opened so `CLAUDE_CODE_WORKSPACE_HOST_PATHS` is non-empty (see `unit-01-cowork-env-contract.md §1`). If empty, `request_cowork_directory` fires first.
2. **[M]** Invoke `/haiku:start` with a throwaway description → agent calls `haiku_intent_create`.
3. **[A]** `.haiku/intents/<slug>/intent.md` exists; frontmatter has `intent_reviewed` **absent or false** (`orchestrator.ts:3016` is the writer).
4. **[A]** `.haiku/intents/<slug>/stages/inception/state.json` → `phase: "elaborate"`, `gate_outcome: null` (shape per current file).
5. **[M]** Agent runs elaborator hat turns; proceeds until FSM emits `gate_review` action at `orchestrator.ts:2980` with `gate_context: "intent_review"`.
6. **[A]** `stFile` session log contains `event: "gate_review_opened"` (`orchestrator.ts:2988`).
7. **[A]** Tool result envelope carries `_meta.ui.resourceUri` (unit-03 helper) — confirms MCP Apps path chosen, not HTTP.
8. **[M]** Cowork renders inline iframe. Capture screenshot (a) = iframe visible in conversation.
9. **[A]** Iframe console logs a line from `host-bridge.ts#isMcpAppsHost()` confirming `window.parent !== window` **and** `new App({...})` succeeded (unit-04 §Detection probe). This is the PR #213 heartbeat's Cowork-mode sibling — not PR #213 itself; PR #213 rewrote `website/app/components/review/hooks/useReviewSession.ts`, which is **not** bundled (see `unit-04-host-bridge-research.md §1`). The load-bearing logger is the new bridge module.
10. **[M]** Validator clicks Approve. Screenshot (b) = decision submitted.
11. **[A]** `haiku_cowork_review_submit` tool call lands; session resolves with `{decision: "approved", feedback, annotations}` (contract at `orchestrator.ts:2827-2833`).
12. **[A]** Session log gains `event: "gate_decision", decision: "approved"` (`orchestrator.ts:3001`).
13. **[A]** `intent.md` frontmatter now has `intent_reviewed: true` (`orchestrator.ts:3016`).
14. **[A]** `state.json` → `phase: "execute"` (via `fsmAdvancePhase` at `:3017`); `gate_outcome` reflects advancement.
15. **[M]** Screenshot (c) = next FSM tick surfaced in conversation after `haiku_run_next`.

## 2. Cowork setup minimum

- Env: `CLAUDE_CODE_IS_COWORK=1`, `CLAUDE_CODE_WORKSPACE_HOST_PATHS=<host-path>` (`unit-01 §1`).
- Binary: built from this branch — required for `_meta.ui` envelope (greenfield; `server.ts` has zero `_meta` hits today per `unit-03-resource-registration-research.md`).
- Fixture intent: any short description that elaborates in one pass; keep under Cowork's unresolved tool-call ceiling (`unit-02 §5` — empirical ceiling still deferred).
- Genuine iframe vs fallback: assert `_meta.ui.resourceUri` present in tool result **and** iframe console emits `isMcpAppsHost() == true`. Absence of either = fallback path → test fails.

## 3. Regression against local Claude Code

- Same `/haiku:start` description, `CLAUDE_CODE_IS_COWORK` unset, run against same binary.
- **Bit-identical**: `intent.md` frontmatter fields, `state.json` `phase`/`gate_outcome`, session log `gate_review_opened` + `gate_decision` events.
- **Expected divergence**: local path hits `startHttpServer()` (`server.ts:835`) and `openBrowser()` (`:846-859`); Cowork path skips both (unit-05 §1). Tool result in local mode lacks `_meta.ui`. Log line from `host-bridge.ts` reports `false`.

## 4. Blockers flagged

- Unit-05 §5.1 blocking-vs-resumable unresolved → if resumable lands, checkpoint 11 splits into "submit tool call" + "next FSM tick resolves pending_review". Test plan must branch on the landed shape.
