---
title: get_review_status doc scrub + VALIDATION.md + end-to-end smoke
type: cleanup
model: haiku
depends_on:
  - unit-04-visual-question-design-direction-branches
  - unit-06-spa-iframe-layout
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - .haiku/knowledge/ARCHITECTURE.md
status: active
bolt: 1
hat: planner
started_at: '2026-04-15T17:32:26Z'
hat_started_at: '2026-04-15T17:32:26Z'
---

# Doc scrub + VALIDATION.md + end-to-end smoke

## Scope

Three small cleanup tasks that block the development stage gate: remove stale `get_review_status` references from `.haiku/intents/**`, `.ai-dlc/**`, `website/content/**`, and `CHANGELOG.md`; create `packages/haiku/VALIDATION.md` documenting both review transports; and wire up an end-to-end smoke test that exercises the MCP Apps path against an in-process stub host.

### In scope

- **`get_review_status` doc scrub.** `rg -n 'get_review_status' . --glob '!CHANGELOG.md' --glob '!**/unit-07*.md'` must return zero hits. Where a reference describes a polling pattern, rewrite to the current blocking review-gate flow. `CHANGELOG.md` and this unit's own spec are the only allowed self-references.
- **`packages/haiku/VALIDATION.md`** — create or extend this file with:
  - **MCP Apps capability negotiation** section explaining how `hostSupportsMcpApps()` works, how the client echoes `experimental.apps`, and the atomic `resources: {}` + `experimental: { apps: {} }` prerequisite.
  - **Cowork review transport** section listing both paths (MCP Apps vs HTTP+tunnel), the branching point in `_openReviewAndWait`, the V5-10 host-timeout fallback, and the `blocking_timeout_observed` frontmatter flag.
- **End-to-end smoke test.** `packages/haiku/scripts/smoke-mcp-apps-review.ts` (or similar) — spawns an in-process MCP server with a stub client that advertises `experimental.apps`, drives a `/haiku:start` equivalent that hits a review gate, submits a decision via `haiku_cowork_review_submit`, asserts the orchestrator advances the phase. Runnable via `npx tsx scripts/smoke-mcp-apps-review.ts`.

### Out of scope

- Actually running the smoke in Cowork (that's unit-08 of inception, a validation unit — already covered).
- Changes to the HTTP transport (unchanged).
- Removing `localtunnel` as a dependency (out of scope for this intent; the HTTP path still uses it).
- Modifying the `.ai-dlc/` legacy mirror beyond the doc scrub.

## Completion Criteria

1. **Doc scrub clean.** `rg -n 'get_review_status' . --glob '!CHANGELOG.md' --glob '!**/unit-07*.md'` returns zero hits. `CHANGELOG.md` keeps its one historical self-reference.
2. **Replacement text accuracy.** Where polling context was removed, the new text describes the current blocking review-gate flow — verified by manual review citation in commit message.
3. **VALIDATION.md created.** `test -f packages/haiku/VALIDATION.md && rg -n '## MCP Apps capability negotiation' packages/haiku/VALIDATION.md && rg -n '## Cowork review transport' packages/haiku/VALIDATION.md` all succeed.
4. **Smoke script exists.** `test -f packages/haiku/scripts/smoke-mcp-apps-review.ts`.
5. **Smoke runs clean.** `cd packages/haiku && npx tsx scripts/smoke-mcp-apps-review.ts` exits 0 and prints a `PASS` line on stdout.
6. **Smoke asserts the FSM advance.** The script's final assertion reads `.haiku/intents/<fixture-slug>/stages/inception/state.json` and confirms `phase === "execute"` after the approval.
7. **No regressions.** `cd packages/haiku && npm run build && npm test` exits 0.
8. **CHANGELOG entry.** Add a brief bullet under the next unreleased section noting the MCP Apps integration and the doc scrub.
