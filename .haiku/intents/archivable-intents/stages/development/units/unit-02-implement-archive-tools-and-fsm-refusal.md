---
name: unit-02-implement-archive-tools-and-fsm-refusal
type: backend
depends_on:
  - unit-01-implement-archived-flag-and-filter
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ARCHITECTURE.md
  - stages/inception/units/unit-02-archive-tools-and-fsm-refusal.md
outputs:
  - stages/development/artifacts/unit-02-implementation-notes.md
---

# unit-02-implement-archive-tools-and-fsm-refusal

## Description
Implement the specification in `stages/inception/units/unit-02-archive-tools-and-fsm-refusal.md`. That document is the source of truth for scope, line numbers, and success criteria. Read it end-to-end before writing code.

## Scope
- Add `haiku_intent_archive` and `haiku_intent_unarchive` tool specs to `orchestratorToolDefs` in `packages/haiku/src/orchestrator.ts`, adjacent to `haiku_intent_reset`.
- Add matching handler branches in `handleOrchestratorTool`, delegating to `setFrontmatterField` and `gitCommitState`. No elicitation. Second-call idempotency returns `action: "noop"`, not `isError`.
- Extend the server-side routing disjunction in `packages/haiku/src/server.ts` to dispatch both new tools to `handleOrchestratorTool`.
- Insert the field-archived refusal guard in `runNext` between the existing `status === "archived"` branch and the composite block. Ordering is load-bearing: `status === "completed"` must still win over `archived: true`.
- Do NOT touch `types.ts` (unit-01), list/dashboard filter logic (unit-01), skills (unit-03), prototype (unit-04), or docs (unit-05).

## Success Criteria
- [ ] `haiku_intent_archive` and `haiku_intent_unarchive` are declared in `orchestratorToolDefs` with `intent` as the only required property. A new tool-registration test mirroring `orchestrator.test.mjs:169-173` (the `haiku_intent_reset` registration test) passes for both new tools.
- [ ] `packages/haiku/src/server.ts:402` routes `haiku_intent_archive` and `haiku_intent_unarchive` to `handleOrchestratorTool`. Calling either tool end-to-end through the MCP server does not fall through to the default "unknown tool" path.
- [ ] Calling `haiku_intent_archive { intent: "<slug>" }` sets `archived: true` in `.haiku/intents/<slug>/intent.md` and leaves every other frontmatter field (including `status`, `bolt`, `hat`, `started_at`, `hat_started_at`, `completed_at`, `active_stage`) byte-identical. Verified by reading the file before and after via a test fixture.
- [ ] Calling the tool a second time returns `action: "noop"` (not `isError: true`) with a message indicating the intent is already archived.
- [ ] Calling `haiku_intent_unarchive { intent: "<slug>" }` writes `archived: false` (or removes the field); the intent reappears in default `haiku_intent_list` output (relies on unit-01's filter helper).
- [ ] A new regression test in `orchestrator.test.mjs`, patterned after the status-archived test at lines 198-204 but using a fixture with `{ archived: true }` in frontmatter, asserts that `runNext` returns `action: "error"` and a message containing the literal substring `"unarchive"`. No state is mutated.
- [ ] No regression on existing tests: `orchestrator.test.mjs:169-173`, `:191-196`, and `:198-204` all pass unchanged.
- [ ] New ordering regression test: a fixture with `{ status: "completed", archived: true }` MUST return `action: "complete"` from `runNext`, NOT `action: "error"`.
- [ ] `bun run typecheck` and `bun test` both green. Manual end-to-end: archive → list (hidden) → run_next (error with "unarchive") → unarchive → list (visible) → run_next (advances).

## Notes
The inception spec pins every line number: `orchestratorToolDefs` at 2710-2819, `haiku_intent_reset` spec at 2807-2818, handler branch at 3713, `runNext` at 829 with the frontmatter read at 838 (variable is `intent`, not `data`), guard insertion between 872 and 874, server routing at 397-403. `setFrontmatterField` is already imported at `orchestrator.ts:47`. Archive is reversible — no `_elicitInput` call on either handler.
