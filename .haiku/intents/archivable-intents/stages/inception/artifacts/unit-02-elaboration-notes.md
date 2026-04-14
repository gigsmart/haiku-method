---
name: unit-02-elaboration-notes
unit: unit-02-archive-tools-and-fsm-refusal
stage: inception
hat: elaborator
created: 2026-04-14
---

# Elaboration notes — unit-02 (archive tools + FSM refusal)

Elaborator-level record of the scope decisions applied to `unit-02-archive-tools-and-fsm-refusal.md` after reading the researcher's verified line numbers. The authoritative spec is the unit md itself; this file records the rationale for the edits.

## Line-number pinning

Discovery used approximate refs like `~orchestrator.ts:1984` and `~2555`. Researcher verified every site against the current tree. Replaced all approximate refs with exact pinned ranges so the development stage has no scavenger hunt:

| Concern | Verified location |
|---|---|
| `orchestratorToolDefs` array | `orchestrator.ts:2710–2819` |
| `haiku_intent_reset` spec (template) | `orchestrator.ts:2807–2818` |
| `handleOrchestratorTool` opens | `orchestrator.ts:2854` |
| `haiku_intent_reset` handler branch | `orchestrator.ts:3713` |
| `runNext(slug)` opens | `orchestrator.ts:829` |
| `const intent = readFrontmatter(...)` | `orchestrator.ts:838` |
| `status === "completed"` branch | `orchestrator.ts:863–868` |
| `status === "archived"` branch | `orchestrator.ts:870–872` |
| New `intent.archived` guard insertion | between 872 and 874 |
| `setFrontmatterField` definition | `state-tools.ts:1558–1574` |
| `setFrontmatterField` import in orchestrator | `orchestrator.ts:47` |
| `server.ts` orchestrator-tool disjunction | `server.ts:397–403` (add at 402) |

## Scope additions the researcher found

**`server.ts` routing was missing from discovery.** Discovery described the tool spec and handler work but never mentioned that `packages/haiku/src/server.ts` has its own explicit allow-list of orchestrator tools (`if (name === "haiku_run_next" || … || name === "haiku_intent_reset")` at lines 397–403). Without extending that disjunction, the two new tools would route to the catch-all "unknown tool" branch instead of `handleOrchestratorTool`. This is the most likely regression if a developer follows discovery-only guidance, so it is now an explicit in-scope bullet and a dedicated success-criterion line.

## Order-of-checks constraint

The unit spec originally said "after the `status === "archived"` check, add `data.archived === true`." That's under-specified. There are three checks that need to sit in a specific order in `runNext`:

1. `status === "completed"` → returns `action: "complete"` (lines 863–868).
2. `status === "archived"` → returns `action: "error"` (lines 870–872).
3. **New** `intent.archived === true` → returns `action: "error"` with "unarchive" message.
4. Composite block (line 874+).

**Why the order matters:**

- **Completed before archived** — a historical intent that was completed and later got `archived: true` tacked on should resolve as `complete`, not `error`. Otherwise the harness would lie about the intent's terminal state.
- **Status-archived before field-archived** — the existing regression test at `orchestrator.test.mjs:198–204` exercises the status path with `createProject(..., { status: "archived" })`. Keeping the status check first preserves its code path unchanged.
- **Both archived branches before composite** — composite resolution assumes the intent is advancable; archived intents must not reach composite fan-out.

The unit spec now spells out all four checks in numbered order.

## Variable name correction

Discovery called the frontmatter variable `data`. It's actually `intent` (line 838). Minor but important — a developer grepping for `data.archived` would find nothing. The spec now uses `intent.archived` throughout, matching the existing `intent.status === "archived"` idiom.

## Test protection explicit in success criteria

Researcher identified three existing tests that must not regress:

- `orchestrator.test.mjs:169–173` — `haiku_intent_reset` tool registration shape (template for the new tool-registration tests).
- `orchestrator.test.mjs:191–196` — "returns complete for already-completed intent" (ordering guardrail).
- `orchestrator.test.mjs:198–204` — "returns error for archived intent" (status-based path).

These are now named line-by-line in Success Criteria so the developer knows exactly what to protect. The new field-based refusal test is also called out as a required addition, patterned after the status test but with `{ archived: true }` in fixture frontmatter.

## `setFrontmatterField` signature inline

The signature and import location are now in the Notes / References section of the spec so the developer doesn't need to grep `state-tools.ts`. Key facts pinned:

- `export function setFrontmatterField(filePath: string, field: string, value: unknown): void`
- Already imported in `orchestrator.ts:47` — no new import needed.
- Writing `false` persists `archived: false` (does not delete the field). The spec explicitly allows either semantic but recommends writing `false` for clarity.

## Idempotency semantics

Clarified that calling `haiku_intent_archive` on an already-archived intent (or `haiku_intent_unarchive` on a non-archived one) returns `action: "noop"` with `isError: false`, not an error. This matches the unit's original intent ("caller can ignore") but is now explicit so the development stage doesn't implement error-on-duplicate by default.

## Non-interference with FSM-controlled fields

Added an explicit note that archive handlers only touch the single `archived` field — they must not write to `status`, `bolt`, `hat`, `started_at`, `hat_started_at`, `completed_at`, or `active_stage`. A hook enforces this, so deviation would block the developer's own commit. Better to call it out up-front than to discover it via hook failure.

## Model assignment

`sonnet`. Standard additive feature following a known template (`haiku_intent_reset` minus elicitation). Multi-file coordination (orchestrator + server + tests), but no architectural judgment. Not purely mechanical — idempotency semantics, ordering of FSM checks, and the server routing bullet each involve a small judgment call. Default tier per the decision heuristic.

## Downstream handoff

- **Design stage** — no intervention needed. Data shape lands in unit-01; tool contract is fully specified here.
- **Development stage** (planner → builder → reviewer) has pinned line numbers, an ordering constraint, a `setFrontmatterField` signature, and a named set of tests to protect. Build surface: `packages/haiku/src/orchestrator.ts`, `packages/haiku/src/server.ts`, `packages/haiku/test/orchestrator.test.mjs`.
- **unit-03** (skills) depends on the tool names being exactly `haiku_intent_archive` and `haiku_intent_unarchive` as declared here — skill thin-wrappers will call these directly.
