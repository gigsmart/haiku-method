---
name: unit-02-archive-tools-and-fsm-refusal
type: backend
depends_on:
  - unit-01-archived-flag-and-filter-helper
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:29:21Z'
hat_started_at: '2026-04-14T20:31:15Z'
outputs:
  - stages/inception/artifacts/unit-02-elaboration-notes.md
completed_at: '2026-04-14T20:37:39Z'
---

# unit-02-archive-tools-and-fsm-refusal

## Description
Add two new MCP tools — `haiku_intent_archive` and `haiku_intent_unarchive` — that set and clear the `archived` frontmatter field on an intent's `intent.md`. Both tools operate via the existing `setFrontmatterField` helper; neither uses elicitation (archival is reversible, so no confirmation is needed). Update `haiku_run_next` to refuse advancement on field-archived intents with a clear "unarchive first" message, in addition to the existing `status === "archived"` check. Extend the server.ts routing disjunction so the two new tools dispatch to `handleOrchestratorTool`.

## Discipline
backend — TypeScript changes in `packages/haiku/src/orchestrator.ts`, `packages/haiku/src/server.ts`, and tests in `packages/haiku/test/orchestrator.test.mjs`. No changes to `state-tools.ts` beyond re-using `setFrontmatterField` (already imported into `orchestrator.ts` at line 47).

## Scope

**In scope:**

- **Tool spec declarations** — add two entries to `export const orchestratorToolDefs = [...]` in `packages/haiku/src/orchestrator.ts` (array at **lines 2710-2819**). Insert immediately after the `haiku_intent_reset` spec (lines **2807-2818**) and before the closing `]` at line 2819. Mirror the `haiku_intent_reset` shape exactly: `{ name, description, inputSchema: { type: "object", properties: { intent: { type: "string", description } }, required: ["intent"] } }`. No extra parameters.
- **Handler branches** — add two `if (name === "haiku_intent_archive")` / `if (name === "haiku_intent_unarchive")` branches to `handleOrchestratorTool(name, args)` in `orchestrator.ts` (function opens at **line 2854**). Insert adjacent to the `haiku_intent_reset` branch at **line 3713**, before the final catch-all return. Each handler:
  1. Resolve `slug = args.intent as string`, `root = findHaikuRoot()`, `intentFile = join(root, "intents", slug, "intent.md")`.
  2. Existence-check `intentFile`; return an `isError: true` text block on miss (same shape as reset's missing-intent path).
  3. Read current frontmatter via `readFrontmatter(intentFile)` (or `parseFrontmatter(readFileSync(...))`, matching reset's idiom).
  4. **Idempotency:** if `current.archived === true` on archive (or strictly not-true on unarchive), return a success payload with `action: "noop"`, `slug`, and a `"… already archived/unarchived"` message. Do **not** return `isError: true`.
  5. Otherwise call `setFrontmatterField(intentFile, "archived", true | false)`.
  6. Call `gitCommitState(\`haiku: archive intent ${slug}\`)` (or `unarchive`) for parity with reset's commit discipline.
  7. Return `text(JSON.stringify({ action: "intent_archived" | "intent_unarchived", slug, path: intentFile, message }, null, 2))`.
  8. **Do NOT** invoke `_elicitInput(...)` — archive/unarchive are reversible and must not prompt the user.
- **Server routing** — extend the orchestrator-tool disjunction in `packages/haiku/src/server.ts` at **lines 397-403** (the `if (name === "haiku_run_next" || … || name === "haiku_intent_reset")` block). Add `|| name === "haiku_intent_archive" || name === "haiku_intent_unarchive"` to the disjunction at **line 402** so both tools route through `handleOrchestratorTool`. Missing this wire-up is the most likely regression, so it is explicitly part of this unit.
- **FSM refusal in `haiku_run_next`** — in `runNext(slug)` in `orchestrator.ts` (opens at **line 829**; frontmatter read `const intent = readFrontmatter(intentFile)` at **line 838**; note the local variable is `intent`, not `data`), insert a new guard **between line 872 and line 874**, i.e. immediately after the existing `status === "archived"` branch and before the composite block. The required **order of checks** is:
  1. `status === "completed"` → returns `action: "complete"` (lines **863-868**, unchanged)
  2. `status === "archived"` → returns `action: "error"` (lines **870-872**, unchanged)
  3. **NEW:** `intent.archived === true` → returns `action: "error"` with message `` `Intent '${slug}' is archived. Call haiku_intent_unarchive to restore it.` ``
  4. Composite block (line **874**+, unchanged)

  The ordering is load-bearing: completed intents that happen to also carry `archived: true` must resolve as `complete`, not `error`. The status-archived branch must still fire before the field-archived branch so the existing status-based test (`orchestrator.test.mjs:198-204`) keeps its current code path.

**Out of scope:**

- Adding the `archived` field to `IntentFrontmatter` in `types.ts` — done by unit-01.
- Filter logic in list/dashboard/capacity handlers — unit-01.
- Skill wrappers (`plugin/skills/haiku-intent-archive.md`, etc.) — unit-03.
- Prototype runtime-map (`website/public/prototype-stage-flow.html`) sync — unit-04.
- Docs / paper / website updates — unit-05.
- `/repair` scan loops (`state-tools.ts:930`, `state-tools.ts:1290`) — they must continue to see archived intents.
- Hook-side `status === "active"` scanners (`hooks/inject-context.ts:52`, `hooks/utils.ts:66`, `hooks/workflow-guard.ts:9`) — orthogonal to the `archived` field by design.

## Success Criteria

- [x] `haiku_intent_archive` and `haiku_intent_unarchive` are declared in `orchestratorToolDefs` with `intent` as the only required property. A new tool-registration test mirroring `orchestrator.test.mjs:169-173` (the `haiku_intent_reset` registration test) passes for both new tools.
- [x] `packages/haiku/src/server.ts:402` routes `haiku_intent_archive` and `haiku_intent_unarchive` to `handleOrchestratorTool`. Calling either tool end-to-end through the MCP server does not fall through to the default "unknown tool" path.
- [x] Calling `haiku_intent_archive { intent: "<slug>" }` sets `archived: true` in `.haiku/intents/<slug>/intent.md` and leaves every other frontmatter field (including `status`, `bolt`, `hat`, `started_at`, `hat_started_at`, `completed_at`, `active_stage`) byte-identical. Verified by reading the file before and after via a test fixture.
- [x] Calling the tool a second time returns `action: "noop"` (not `isError: true`) with a message indicating the intent is already archived.
- [x] Calling `haiku_intent_unarchive { intent: "<slug>" }` writes `archived: false` (or removes the field); the intent reappears in default `haiku_intent_list` output (relies on unit-01's filter helper).
- [x] A new regression test in `orchestrator.test.mjs`, patterned after the status-archived test at **lines 198-204** but using a fixture with `{ archived: true }` in frontmatter, asserts that `runNext` returns `action: "error"` and a message containing the literal substring `"unarchive"`. No state is mutated.
- [x] **No regression** on the following existing tests — they must still pass unchanged: `orchestrator.test.mjs:169-173` (tool-registration shape guardrail), `orchestrator.test.mjs:191-196` (completed must win over archived — ordering guardrail), `orchestrator.test.mjs:198-204` (status-based archived path must keep firing independently of the new field-based check).
- [x] `bun run typecheck` and `bun test` both green. Manual end-to-end loop: archive → `haiku_intent_list` (hidden) → `haiku_run_next` (error with "unarchive") → `haiku_intent_unarchive` → `haiku_intent_list` (visible) → `haiku_run_next` (advances) behaves as described.

## Notes / References

- **`setFrontmatterField`** — `packages/haiku/src/state-tools.ts:1558-1574`. Signature: `export function setFrontmatterField(filePath: string, field: string, value: unknown): void`. Idempotent read-mutate-write; passing `false` writes the literal `archived: false` (does not delete the field). Already imported in `orchestrator.ts:47`, no new import required.
- **Reference handler** — `haiku_intent_reset` at `orchestrator.ts:3713` and its spec at `orchestrator.ts:2807-2818` are the structural template. Copy the top-level shape (resolve → exists → read frontmatter → mutate → gitCommitState → return `text(...)`); **omit** the `_elicitInput` block entirely.
- **Variable naming** — in `runNext`, the frontmatter read is `const intent = readFrontmatter(intentFile)` at line **838**. Do **not** introduce a `data` alias; use `intent.archived === true` directly, matching the existing `intent.status === "archived"` style at lines **870-872**.
- **Collision audit (from research)** — the string `"archived"` appears in ~40 call-sites across `state-tools.ts:1051-1471` and `state-tools.ts:3417-3428`, but all of those are `/repair`'s derived "archived intents on mainline" concept (`archivedSummary`, `archivedSlugs`, `archivedRepairPR`, …), not a frontmatter field. No collision. The `archived: boolean` field on intent frontmatter is free to claim.
- **Protected frontmatter fields** — do not touch FSM-controlled fields (`status`, `bolt`, `hat`, `started_at`, `hat_started_at`, `completed_at`) from the archive handlers; a hook enforces this and will block writes. The archive tools only set/clear the single `archived` field.
