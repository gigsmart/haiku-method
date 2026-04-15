---
name: research-notes
unit: unit-02-archive-tools-and-fsm-refusal
hat: researcher
---

# Research Notes — unit-02-archive-tools-and-fsm-refusal

## Tool declaration — where to add specs

- **File:** `packages/haiku/src/orchestrator.ts`
- **Array:** `export const orchestratorToolDefs = [ ... ]` — starts at **line 2710**, closes at **line 2819**
- **Reference entry (`haiku_intent_reset`):** lines **2807–2818**
  - Shape: `{ name, description, inputSchema: { type, properties: { intent: { type, description } }, required: ["intent"] } }`
- **Insertion point:** append two new specs immediately after the `haiku_intent_reset` object (before the closing `]` at line 2819). Mirror the `haiku_intent_reset` schema exactly — required `intent` slug, no other params.

## Handler switch — where to add case branches

- **File:** `packages/haiku/src/orchestrator.ts`
- **Function:** `handleOrchestratorTool(name, args)` — opens at **line 2854**
- **Reference handler (`haiku_intent_reset`):** `if (name === "haiku_intent_reset")` at **line 3713**, body runs through ~line 3800+
- **Insertion point:** add two new `if (name === "haiku_intent_archive")` / `if (name === "haiku_intent_unarchive")` branches near (before or after) the `haiku_intent_reset` branch at 3713. Insert before the final catch-all return.

## server.ts routing

- **File:** `packages/haiku/src/server.ts`
- **Block:** `if ( name === "haiku_run_next" || ... || name === "haiku_intent_reset" )` — lines **397–403**
- **Change:** add `|| name === "haiku_intent_archive" || name === "haiku_intent_unarchive"` to this disjunction so the two new tools route through `handleOrchestratorTool`.

## `haiku_intent_reset` structure (reference pattern)

`orchestrator.ts:3713–3800+`:

1. Read `args.intent as string` -> `slug`
2. Resolve `root = findHaikuRoot()`, `iDir = join(root, "intents", slug)`, `intentFile = join(iDir, "intent.md")`
3. Existence check — return `isError: true` content block on missing intent
4. Read + parse frontmatter via `readFileSync(intentFile, "utf8")` + `parseFrontmatter(raw)`
5. **Uses elicitation** via `_elicitInput(...)` — **skip this step for archive/unarchive per the unit spec**
6. Mutates state (for reset: `rmSync(iDir, ...)` + `gitCommitState(...)`)
7. Return `text(JSON.stringify({ action, slug, message }, null, 2))` — the `text(s)` helper wraps as MCP content

**For archive/unarchive tools:**
- Drop the elicitation block entirely.
- Replace the destructive `rmSync` with a single `setFrontmatterField(intentFile, "archived", true)` (or `false` for unarchive).
- Idempotency: read current `archived` field first; if already in target state, return `{ action: "noop", slug, message: "... already archived/unarchived" }` (success, not isError).
- On success return `{ action: "intent_archived" | "intent_unarchived", slug, path: intentFile, message: "..." }`.
- Call `gitCommitState(\`haiku: archive intent ${slug}\`)` for parity with reset's git commit discipline.

## `setFrontmatterField` signature

- **File:** `packages/haiku/src/state-tools.ts`
- **Line:** **1558–1574**
- **Signature:** `export function setFrontmatterField(filePath: string, field: string, value: unknown): void`
- **Import already present** in `orchestrator.ts` at **line 47** — no new import needed.
- Idempotent write: reads, mutates `parsed.data[field]`, writes back via `matter.stringify`. Passing `false` writes the literal `archived: false` (does not delete the field). Unit spec allows either; writing `false` is simpler and clearer in the file.

## FSM refusal — `haiku_run_next`

- **File:** `packages/haiku/src/orchestrator.ts`
- **Function:** `runNext(slug)` — opens at **line 829**
- **Frontmatter read:** `const intent = readFrontmatter(intentFile)` at **line 838** — note the variable is **`intent`**, not `data`. The unit spec says "how `data` is read" — that's a minor terminology drift; in this file it's `intent`.
- **Existing status check:** lines **863–872**
  - `status === "completed"` -> `action: "complete"` (line 863–868)
  - `status === "archived"` -> `action: "error"` (line 870–872) — confirmed exact line
- **New check insertion point:** immediately after line 872 (before the composite block at line 874). Suggested code:
  ```ts
  if (intent.archived === true) {
      return {
          action: "error",
          message: `Intent '${slug}' is archived. Call haiku_intent_unarchive to restore it.`,
      }
  }
  ```
- Matches existing style (const destructure of `intent`, same return shape, same `action: "error"`).

## `archived` field collisions — safe

Audit of every `archived` reference in `packages/haiku/src/`:

- **`orchestrator.ts:870–871`** — the existing `status === "archived"` check. This checks the **status field value**, not a separate `archived` field. The new `intent.archived === true` check is field-based and orthogonal. No collision.
- **`state-tools.ts:1051–1471`** (~40 matches) — all references are to `/repair`'s **derived** "archived intents on mainline" concept. Variables named `archivedSummary`, `archivedSlugs`, `archivedRepairPR`, etc. None of them read or write an `archived` field on intent frontmatter. They come from `mainlineSlugs.filter((s) => !activeSet.has(s))` at `state-tools.ts:1294`. No collision.
- **`state-tools.ts:3417–3428`** — calls `repairArchivedOnMainline` (repair pass). Same derived concept. No collision.
- No other call sites read or write `.archived` as a frontmatter field. The new `archived: boolean` field is free to claim.

## Existing tests to protect (no-regression)

- **`packages/haiku/test/orchestrator.test.mjs`**
  - **Line 169–173** — `"haiku_intent_reset tool defined with intent required"` — validates tool is in `orchestratorToolDefs` with `intent` in `required`. New tools should follow the same test pattern.
  - **Line 198–204** — `"returns error for archived intent"` — exercises `runNext` with `createProject(..., { status: "archived" })`. This is the **status**-based path and must keep passing. The new field-based check is additive and does not conflict.
  - **Line 191–196** — `"returns complete for already-completed intent"` — upstream guardrail; new check must be inserted **after** the completed check (otherwise completed intents that happen to also have `archived: true` would hit the wrong branch — unlikely but worth ordering correctly).
- `test/orchestrator.test.mjs` is the only test file under `packages/haiku/test/` that touches `runNext` + archive behavior — no other regression surface.

## Summary of exact edit locations

| Change | File | Line |
|---|---|---|
| Add 2 tool specs | `packages/haiku/src/orchestrator.ts` | after 2818, before 2819 |
| Add 2 handler branches | `packages/haiku/src/orchestrator.ts` | near 3713 (intent_reset branch) |
| Add `archived: true` field check | `packages/haiku/src/orchestrator.ts` | after 872, before 874 |
| Extend server routing disjunction | `packages/haiku/src/server.ts` | 402 (add two `||` clauses) |
| Reuse `setFrontmatterField` | `packages/haiku/src/state-tools.ts` | 1558 (existing import at orchestrator.ts:47) |
| Add tool-registration test | `packages/haiku/test/orchestrator.test.mjs` | near 169 (mirror reset test) |
| Add field-based refusal test | `packages/haiku/test/orchestrator.test.mjs` | near 198 (mirror status test, use `{ archived: true }`) |
