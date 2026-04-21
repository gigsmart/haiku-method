# Fix FB-41 — Tactical Plan (planner, bolt 1)

**Finding:** N+1 disk read in feedback-assessor dispatch — `readFeedbackFiles`
called per element of `closes[]`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/41-n-1-disk-read-in-feedback-assessor-dispatch-readfeedbackfile.md`

## Root cause

Two identical callsites in `packages/haiku/src/orchestrator.ts` (feedback-assessor
dispatch in both the non-parallel and parallel/wave code paths) call
`readFeedbackFiles(slug, stage)` **inside** a `for (const fbId of closes)` loop.

`readFeedbackFiles` (defined at `packages/haiku/src/state-tools.ts:3114-3158`) is
synchronous and expensive:
- `readdirSync` on the feedback directory
- for each `.md` file: `readFileSync` + `parseFrontmatter` (gray-matter YAML)

For K closes against N feedback files on disk, the loop performs K × N disk reads
and K × N YAML parses while blocking the orchestrator's single event loop. The
correct pattern is a single hoisted call (K independent of N in per-iteration
cost) — `readFeedbackFiles` already returns everything in one shot.

## Fix approach

Apply **Option A from the feedback body** — hoist the `readFeedbackFiles` call
out of the loop and reuse the resulting array across all `closes` lookups.

Option A is preferred over Option B (`findFeedbackFile` per item) because:
- Option A is one directory listing + N file reads total (independent of K).
- Option B is K directory listings + K file reads — worse when K is large and
  N is small, and identical or worse in the common case.
- Option A matches the pattern used elsewhere in the file for batch lookups.

No API or behavior change — callers still receive `{ id, file }` entries in the
same shape and ordering.

## Files to modify

1. **`packages/haiku/src/orchestrator.ts`** (two hunks)
   - **Hunk 1 — around lines 4958-4970** (feedback-assessor dispatch, non-parallel
     path): hoist `const allFeedback = readFeedbackFiles(slug, stage)` above the
     `for (const fbId of closes)` loop. Replace the per-iteration
     `readFeedbackFiles(slug, stage).find(...)` with `allFeedback.find(...)`.
   - **Hunk 2 — around lines 5510-5523** (feedback-assessor dispatch, parallel/wave
     path): same transformation. Hoist `const allFeedback = readFeedbackFiles(slug, stage)`
     above the loop. Replace the in-loop call with `allFeedback.find(...)`.
   - Keep the `feedbackFiles.push({ id: found.id, file: ... })` logic unchanged
     — only the source array changes from per-iteration to hoisted.
   - **Do NOT** switch to `findFeedbackFile`. Do NOT change the outer control
     flow, the `feedbackFiles` shape, or the `buildFeedbackAssessorPrompt` call
     signature.

## Implementation steps (for the builder in bolt 2)

1. Re-read `packages/haiku/src/orchestrator.ts` lines 4945-4985 and 5500-5540
   immediately before editing — parallel fix chains may have shifted line
   numbers. Anchor on the code shape (`if (hat === "feedback-assessor")` + the
   `for (const fbId of closes)` loop), not line numbers.
2. Hunk 1: insert `const allFeedback = readFeedbackFiles(slug, stage)` on the
   line immediately after `const feedbackFiles: Array<{ id: string; file: string }> = []`.
   Then change `readFeedbackFiles(slug, stage).find(` to `allFeedback.find(` inside
   the loop.
3. Hunk 2: apply the identical transformation at the second callsite.
4. Verify there are no remaining occurrences of `readFeedbackFiles(slug, stage).find(`
   in the file (grep).
5. Build + typecheck: `cd packages/haiku && npm run build` (or `npx tsc --noEmit`).
   Must exit 0.
6. Smoke-run the orchestrator test suite for this module:
   `cd packages/haiku && npx vitest run src/orchestrator` (or the nearest
   existing test file for the feedback-assessor dispatch path).
7. Commit with `haiku: fix FB-41 bolt 1 (planner)`. Do not push.

## Verification commands

```bash
# From repo root:
cd packages/haiku && npx tsc --noEmit
cd packages/haiku && npm test -- --run 2>&1 | tail -40

# Grep to prove the pattern is gone:
grep -n "readFeedbackFiles(slug, stage).find" packages/haiku/src/orchestrator.ts
# expected: zero matches
```

TypeScript must exit 0. Tests that touched the feedback-assessor dispatch path
before must still pass.

## Risks

- **Parallel chain clobber** — other fix bolts in this batch may be editing
  `orchestrator.ts`. Re-read the file immediately before each hunk; anchor on
  surrounding code shape (the `if (hat === "feedback-assessor")` block + the
  `for (const fbId of closes)` pattern), not on hardcoded line numbers. The
  feedback body's line references are 4958-4970 and 5510-5523 — treat as hints.
- **Missed callsite** — there may be a third callsite if someone added one.
  After the two hunks, grep for `readFeedbackFiles(slug, stage).find` across
  `packages/haiku/src/` to confirm zero remaining hits.
- **Behavioral drift** — hoisting is semantically identical *only if*
  `readFeedbackFiles` is not mutated between iterations. The loop body only
  pushes into `feedbackFiles` (a local array) — no disk writes, no mutation of
  feedback files. Safe.
- **Wave-dispatch closure scope** — Hunk 2 is inside a `for (const unitName ...)`
  outer loop over units. The hoisted `allFeedback` must be scoped *inside* the
  unit iteration so that each unit gets a fresh read (feedback state may change
  between units in a wave). Declare `allFeedback` inside the `if (hat === "feedback-assessor")`
  block, **not** above the outer unit loop. This preserves correctness without
  sacrificing the N+1 win (the N+1 is K × N per unit, not across units).

## Out of scope

- Refactoring `readFeedbackFiles` itself (caching, memoization, index files).
- Reworking `findFeedbackFile` or consolidating the two feedback lookup helpers.
- Touching any other N+1 patterns elsewhere in `orchestrator.ts` or `state-tools.ts`.
- Changing the `buildFeedbackAssessorPrompt` signature or the `feedbackFiles`
  payload shape.

## Done when

- Both callsites in `orchestrator.ts` read feedback once per dispatch, not K
  times.
- `grep -n "readFeedbackFiles(slug, stage).find" packages/haiku/src/orchestrator.ts`
  returns zero matches.
- `npx tsc --noEmit` from `packages/haiku` exits 0.
- Existing orchestrator tests still pass.
- A commit `haiku: fix FB-41 bolt 1 (planner)` exists on the current branch (no push).
