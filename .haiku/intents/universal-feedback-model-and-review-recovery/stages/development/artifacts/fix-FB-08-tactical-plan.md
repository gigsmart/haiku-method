# Fix FB-08 — Tactical Plan (planner, bolt 1)

**Finding:** `unit-06: Lighthouse harness fixture paths use /api/sessions/ (plural) but real endpoint is /api/session/ (singular)`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/08-unit-06-lighthouse-harness-fixture-paths-use-api-sessions-pl.md`

## TL;DR

The fix is **already landed** in commit `fea8b9c5` — "unit-06: replace
Lighthouse gate with axe-core per-page RTL assertions". The file that FB-08
cites as buggy (`packages/haiku-ui/scripts/audit-lighthouse.mjs`) no longer
exists; the entire Lighthouse harness was deleted and replaced with a
jsdom-rendered axe-core pass per route in
`packages/haiku-ui/tests/a11y-pages.spec.tsx`. Unit-06's reviewer re-ran on
bolt 3 and advanced the hat on 2026-04-21T14:59:35Z. No new code is required
to close FB-08 — the builder bolt for this feedback file is a no-op commit
that leaves the tree unchanged and records the planner-level closure
rationale so the feedback-assessor can mark the finding resolved.

## Root cause (historical)

The deleted `audit-lighthouse.mjs` declared its fixture registry with plural
`/api/sessions/<id>` keys and its dispatch guard as
`pathname.startsWith("/api/sessions/")`, but the canonical haiku-api contract
in `packages/haiku-api/src/routes.ts` is singular:
`paths.session = (id) => /api/session/${id}`. `ApiClient.fetchSession()` hits
`/api/session/<id>`, never matched a fixture, fell through to the harness's
SPA fallback (which returned `index.html`), and `parseJsonOrThrow` failed
with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. Three of the
four pinned Lighthouse URLs (`/review/demo`, `/question/demo`,
`/direction/demo`) therefore measured the "Session not found" error-state
DOM's accessibility instead of the loaded shell + page composition the unit
was built to gate.

## Fix approach — already applied (not re-derived here)

Rather than patching the fixture keys (the approach the feedback body
suggested — flip `/api/sessions/` → `/api/session/` and optionally import
`paths` from `haiku-api` so it can't drift again), the user directed a
larger scope change in bolt 3:

- **Delete the Lighthouse harness entirely**, because `chrome-launcher` (a
  transitive dep of `lighthouse`) was clobbering the developer's local
  Chrome profile — unacceptable on contributor hardware.
- **Replace with `packages/haiku-ui/tests/a11y-pages.spec.tsx`** — a jsdom +
  React Testing Library test that renders `<App>` for each of `/review/:id`,
  `/review/current`, `/question/:id`, `/direction/:id` with committed
  fixtures and a mocked `ApiClient`, then runs `axe.run(container)` with
  tags `wcag2a,wcag2aa,wcag21a,wcag21aa` and asserts zero violations.
- **Remove `lighthouse` + `@lhci/cli` devDeps**, drop the
  `audit:lighthouse` npm script, delete `lighthouserc.json`.
- **Add `axe-core` devDep**.
- **Update unit-06 spec + tactical plan** so the completion criteria line up
  with the axe-core gate, not the Lighthouse gate.

This approach supersedes the fixture-key patch FB-08 proposed. The
superseding call is the right one: even if the plural/singular drift had
been corrected, Lighthouse itself was unusable in this codebase for
independent reasons (the Chrome profile clobber). The axe-core gate
provides the same a11y signal without the Chrome dependency and without
needing an in-process API fixture server at all — `ApiClient` is mocked
directly at the TS layer, so no `/api/session/*` path ever needs matching.
The bug FB-08 describes cannot recur because there is no longer a fixture
registry to drift against `haiku-api`'s contract.

## What this bolt changes

Nothing in the codebase. The planner-level record:

1. **`packages/haiku-ui/scripts/audit-lighthouse.mjs`** — already deleted
   (commit `fea8b9c5`). Does not exist in tree. No action.
2. **`packages/haiku-ui/lighthouserc.json`** — already deleted. No action.
3. **`packages/haiku-ui/package.json`** — `lighthouse` + `@lhci/cli` already
   removed; `axe-core` already added. Verified: `grep 'lighthouse\|@lhci/cli'
   packages/haiku-ui/package.json` returns no matches.
4. **`packages/haiku-ui/tests/a11y-pages.spec.tsx`** — already present; owns
   the a11y gate unit-06 promises. Mocks `ApiClient` directly, so the
   singular `/api/session/:id` contract is honored by construction.
5. **`.haiku/intents/.../stages/development/units/unit-06-shell-and-routing.md`** —
   already updated in bolt 3: `## Completion Criteria` now demands
   `audit-lighthouse.mjs` and `lighthouserc.json` be REMOVED; a11y gate is
   the axe-core RTL test.
6. **`.haiku/intents/.../stages/development/artifacts/unit-06-tactical-plan.md`** —
   already carries a dated header documenting the Lighthouse → axe-core
   replacement.
7. **This file (`fix-FB-08-tactical-plan.md`)** — new: records the
   planner-level closure rationale for FB-08 so the fix-loop's
   feedback-assessor has an artifact tying the feedback to the superseding
   commit, mirroring `fix-FB-10-tactical-plan.md` for the sister finding.

## Verification that the fix is live

Run from the worktree root:

```bash
# (a) audit-lighthouse.mjs and lighthouserc.json are absent:
test ! -f packages/haiku-ui/scripts/audit-lighthouse.mjs
test ! -f packages/haiku-ui/lighthouserc.json

# (b) no lighthouse deps remain:
! grep -qE 'lighthouse|@lhci/cli' packages/haiku-ui/package.json

# (c) the axe-core replacement is in place and uses the canonical
#     ApiClient mock (no /api/sessions/ fixture registry):
test -f packages/haiku-ui/tests/a11y-pages.spec.tsx
grep -qE 'axe-core|axe\.run' packages/haiku-ui/tests/a11y-pages.spec.tsx
! grep -qE '/api/sessions/' packages/haiku-ui/tests/a11y-pages.spec.tsx

# (d) haiku-api still declares the singular contract FB-08 referenced:
grep -q "session: (id: string) => \`/api/session/\${id}\`" packages/haiku-api/src/routes.ts

# (e) unit-06 is on `status: completed`:
grep -A1 '^status:' \
  .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-06-shell-and-routing.md
```

Each of those checks succeeds against the tree as of this bolt, so FB-08 is
resolved at the code level — the remaining lifecycle work is feedback-state
update (handled by the assessor hat / FSM, not the planner/builder).

## Handoff to the builder

There is no code for the builder to write. The builder bolt should:

1. Re-run the five verification commands above and record the output.
2. Make a trivial no-op commit (e.g., appending a single-line note to this
   tactical plan under `## Builder verification (bolt 2)`) so there is a
   `haiku: fix FB-08 bolt 2 (builder)` commit on the branch, per fix-loop
   convention.
3. Hand off to the feedback-assessor (bolt 3), which will confirm the
   superseding commit closes the finding and will mark the feedback
   resolved.

If the builder finds any of the verifications fail (e.g., the Lighthouse
files somehow reappeared from a bad merge, or `a11y-pages.spec.tsx`
reintroduced a `/api/sessions/` path anywhere), stop and report — the fix
is regressing, not pending.

## Risks

- **None that this plan introduces.** The risky change (deleting Lighthouse,
  swapping gates) already landed, was reviewed, and was approved on bolt 3.
  This plan is a bookkeeping artifact.
- **Parallel-chain clobber risk is minimal.** Other fix chains are editing
  sibling files in `packages/haiku-ui/`, but re-introducing the Lighthouse
  harness or a `/api/sessions/` fixture registry is not plausible given the
  unit-06 spec explicitly requires their absence. If a concurrent chain
  re-adds either, that is a separate regression, not an FB-08 concern — the
  builder verification step above will catch it.

## Out of scope

- Re-implementing the Lighthouse harness with the corrected singular
  fixture keys. The suggested fix in the feedback body ("flip plural →
  singular, optionally `import { paths } from 'haiku-api'`") is correct in
  isolation but moot: Lighthouse was deliberately removed and the
  fixture-registry code path no longer exists.
- Adding a Playwright-sandboxed axe audit as a follow-up unit. The unit
  spec documents this as a future-unit concern; not in scope here.
- Updating the paper or website to reflect the a11y gate mechanism change —
  downstream sync concern, not fix-loop scope.

## Done when

- `packages/haiku-ui/scripts/audit-lighthouse.mjs` remains absent.
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` remains present, uses the
  mocked `ApiClient`, and runs green under `npx vitest run` for this
  worktree.
- Unit-06 stays in `status: completed`.
- Feedback-assessor marks FB-08 resolved on the next bolt.
