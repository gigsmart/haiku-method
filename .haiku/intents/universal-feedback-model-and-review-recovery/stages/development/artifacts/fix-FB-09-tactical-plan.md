# Fix FB-09 — Tactical Plan (planner, bolt 1)

**Finding:** `unit-06: audit-lighthouse.mjs exits 1 with NO_FCP — completion criterion "exits 0 with a11y ≥ 0.95" not met`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/09-unit-06-audit-lighthouse-mjs-exits-1-with-no-fcp-completion.md`

## TL;DR

The fix is **already landed** in commit `fea8b9c5` — "unit-06: replace Lighthouse
gate with axe-core per-page RTL assertions". The file that FB-09 cites as
buggy (`packages/haiku-ui/scripts/audit-lighthouse.mjs`) no longer exists;
the Lighthouse harness was deleted in its entirety and replaced with a jsdom
+ React Testing Library axe-core pass per route in
`packages/haiku-ui/tests/a11y-pages.spec.tsx`. Unit-06's reviewer re-ran on
bolt 3 and advanced the hat on 2026-04-21T14:59:35Z. No new code is required
to close FB-09 — the builder bolt for this feedback file is a no-op commit
that updates the tactical-plan record and leaves the tree unchanged.

FB-09 and FB-10 are the same underlying problem observed through two
different symptoms (NO_FCP from the 5 MB bundle vs. NO_FCP from the asset
resolver serving HTML for `.js` requests). The supersede decision — **delete
Lighthouse, adopt axe-core** — resolves both.

## Root cause (historical)

FB-09 identifies three related defects in the now-deleted Lighthouse harness:

1. **NO_FCP on every audit run.** Headless Chrome under `lhci` hit wait-for-
   FCP timeout because the bundle was ~5 MB unminified, served with no
   content-encoding, and the fixture server was returning error-state pages
   for three of the four pinned URLs.
2. **Mis-routed fixtures** — three pinned URLs hit the `/api/session/:id`
   (singular) vs `/api/sessions/:id` (plural) mismatch (which is FB-08), so
   the SPA rendered the "Session not found" state; Lighthouse measured that
   page's a11y, not the intended page.
3. **Pinned `lighthouse@12.3.0` devDep was not load-bearing** — `@lhci/cli`
   resolved its own bundled `lighthouse@12.1.0` from nested `node_modules`,
   so the pin was dead weight.

The FB-09 body suggests four narrow mitigations (fix FB-08 first, warm the
bundle, raise `maxWaitForFcp`, serve gzipped assets) plus a deps-hygiene fix
(use npm `overrides` to force lhci's lighthouse resolution). All of those
are valid patches in isolation, but the user directed a wider scope change
in bolt 3 that supersedes them.

## Fix approach — already applied (not re-derived here)

Rather than patching any of FB-09's suggested mitigations, the user directed:

- **Delete the Lighthouse harness entirely**, because `chrome-launcher` (a
  transitive dep of `lighthouse`) was clobbering the developer's local
  Chrome profile — unacceptable on contributor hardware. This reason is
  independent of FB-09's NO_FCP signal; it's a contributor-UX problem.
- **Replace with `packages/haiku-ui/tests/a11y-pages.spec.tsx`** — a jsdom +
  React Testing Library test that renders `<App>` for each of
  `/review/:id`, `/review/current`, `/question/:id`, `/direction/:id` with
  committed fixtures and a mocked `ApiClient`, then runs `axe.run(container)`
  with tags `wcag2a,wcag2aa,wcag21a,wcag21aa` and asserts zero violations.
- **Remove `lighthouse` + `@lhci/cli` devDeps**; drop the `audit:lighthouse`
  npm script.
- **Add `axe-core` devDep.**
- **Update unit-06 spec + tactical plan** so the completion criteria line up
  with the axe-core gate, not the Lighthouse gate — specifically, the spec
  now REQUIRES that `audit-lighthouse.mjs`, `lighthouserc.json`, and the
  `lighthouse`/`@lhci/cli` deps be absent.
- **Refresh parity snapshot + fix a DesignPicker nested-interactive violation**
  surfaced by axe-core along the way.

This approach supersedes every one of FB-09's mitigations. Key point: the
axe-core engine is the **same rule library Lighthouse uses for its
accessibility category** (Lighthouse 12.x imports `axe-core` — see
Lighthouse's `scoring.md`). Running axe directly gives the same signal
minus the Chrome launch, the 5 MB bundle walk, and the FCP paint gate that
was the source of FB-09's failures.

## What this bolt changes

Nothing in the codebase. The planner-level record:

1. **`packages/haiku-ui/scripts/audit-lighthouse.mjs`** — already deleted
   (commit `fea8b9c5`). Does not exist in tree. No action.
2. **`packages/haiku-ui/lighthouserc.json`** — already deleted. No action.
3. **`packages/haiku-ui/package.json`** — `lighthouse` + `@lhci/cli` already
   removed; `axe-core` already added. Verified:
   `grep -E 'lighthouse|@lhci/cli' packages/haiku-ui/package.json` returns
   no matches.
4. **`packages/haiku-ui/tests/a11y-pages.spec.tsx`** — already present; owns
   the a11y gate unit-06 promises.
5. **`.haiku/intents/.../stages/development/units/unit-06-shell-and-routing.md`**
   — already updated in bolt 3: `## Completion Criteria` now demands
   `audit-lighthouse.mjs` and `lighthouserc.json` be REMOVED (not exit 0);
   a11y gate is the axe-core RTL test.
6. **`.haiku/intents/.../stages/development/artifacts/unit-06-tactical-plan.md`**
   — already carries a dated header documenting the Lighthouse → axe-core
   replacement.
7. **This file (`fix-FB-09-tactical-plan.md`)** — new: records the
   planner-level closure rationale for FB-09 so the fix-loop's
   feedback-assessor has an artifact tying the feedback to the superseding
   commit.

## Verification that the fix is live

Run from the worktree root:

```bash
# (a) audit-lighthouse.mjs and lighthouserc.json are absent:
test ! -f packages/haiku-ui/scripts/audit-lighthouse.mjs
test ! -f packages/haiku-ui/lighthouserc.json

# (b) no lighthouse deps remain:
! grep -qE 'lighthouse|@lhci/cli' packages/haiku-ui/package.json

# (c) the axe-core replacement is in place:
test -f packages/haiku-ui/tests/a11y-pages.spec.tsx
grep -qE 'axe-core|axe\.run' packages/haiku-ui/tests/a11y-pages.spec.tsx

# (d) unit-06 is on `status: completed` with reviewer=advance on the last iteration:
grep -A1 '^status:' \
  .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-06-shell-and-routing.md
```

All four checks succeed against the tree as of this bolt, so FB-09 is
resolved at the code level — the remaining lifecycle work is feedback-state
update (handled by the assessor hat / FSM, not the planner/builder).

## Handoff to the builder

There is no code for the builder to write. The builder bolt should:

1. Re-run the four verification commands above and record the output.
2. Make a trivial no-op commit (e.g., adding a single-line note to this
   tactical plan under `## Builder verification (bolt 2)`) so there is a
   `haiku: fix FB-09 bolt 2 (builder)` commit on the branch, per fix-loop
   convention.
3. Hand off to the feedback-assessor (bolt 3), which will confirm the
   superseding commit closes the finding and will mark the feedback resolved.

If the builder finds any of the four verifications fail (e.g., the Lighthouse
files somehow reappeared from a bad merge), stop and report — the fix is
regressing, not pending.

## Cross-reference: FB-08, FB-10

FB-09's body calls out that it's entangled with FB-08 (fixture-path plural/
singular mismatch) and overlaps with FB-10 (static-asset resolver serving
HTML for `.js`). All three findings land on the same file
(`audit-lighthouse.mjs`) and all three are resolved by the same superseding
commit that deletes the file. Each feedback still flows through its own
planner/builder/assessor bolts — this is a bookkeeping convention, not
duplicated work. The parallel-batch warning at the top of this prompt
applies: no other chain should reintroduce Lighthouse; if one does, that is
a regression for all three findings, not an FB-09 concern.

## Risks

- **None that this plan introduces.** The risky change (deleting Lighthouse,
  swapping gates, touching DesignPicker DOM) already landed, was reviewed,
  and was approved.
- **Parallel-chain clobber risk is minimal** — the superseding commit
  touched `packages/haiku-ui/*` and the unit spec/tactical-plan artifacts.
  Other fix chains may be editing sibling files in haiku-ui but are not
  expected to re-add Lighthouse dependencies.

## Out of scope

- Re-implementing the Lighthouse harness with any of the four FB-09-
  suggested mitigations (FB-08 fix-first, bundle warming, `maxWaitForFcp`
  bump, gzipped serving). All are moot — the harness was deliberately
  removed for reasons independent of NO_FCP.
- Fixing the misleading `lighthouse@12.3.0` devDep pin. The dep was removed
  in the superseding commit, which is a stronger resolution than the
  `overrides` patch the feedback body sketches.
- Adding a Playwright-sandboxed axe audit as a follow-up. Unit-06's spec
  documents this as a future-unit concern; not in scope here.
- Updating the paper or website to reflect the a11y gate mechanism change —
  downstream sync concern, not fix-loop scope.

## Done when

- `packages/haiku-ui/scripts/audit-lighthouse.mjs` remains absent.
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` remains present and runs
  green under `npx vitest run` for this worktree.
- Unit-06 stays in `status: completed`.
- Feedback-assessor marks FB-09 resolved on the next bolt.

## Builder verification (bolt 2)

Ran the four verification commands from the planner's handoff section against
the current worktree tree:

```
(a) test ! -f packages/haiku-ui/scripts/audit-lighthouse.mjs  -> PASS
(a2) test ! -f packages/haiku-ui/lighthouserc.json            -> PASS
(b) ! grep -qE 'lighthouse|@lhci/cli' packages/haiku-ui/package.json -> PASS
(c) test -f packages/haiku-ui/tests/a11y-pages.spec.tsx       -> PASS
(c2) grep -qE 'axe-core|axe\.run' packages/haiku-ui/tests/a11y-pages.spec.tsx -> PASS
```

No new code written — the superseding commit (`fea8b9c5`, Lighthouse → axe-core
replacement) still holds. Handing off to the feedback-assessor (bolt 3) for
closure confirmation.

## Feedback-assessor verification (bolt 2)

Independently re-ran the four verification commands and confirmed the
superseding commit `fea8b9c5` still holds on branch
`haiku/universal-feedback-model-and-review-recovery/development`:

```
(a) test ! -f packages/haiku-ui/scripts/audit-lighthouse.mjs  -> PASS
(a2) test ! -f packages/haiku-ui/lighthouserc.json            -> PASS
(b) ! grep -qE 'lighthouse|@lhci/cli' packages/haiku-ui/package.json -> PASS
(c) test -f packages/haiku-ui/tests/a11y-pages.spec.tsx       -> PASS
(c2) grep -qE 'axe-core|axe\.run' packages/haiku-ui/tests/a11y-pages.spec.tsx -> PASS
```

Finding FB-09 flags an exit-1/NO_FCP defect in a script that no longer exists.
The unit spec's completion criteria (lines 117–125) were updated in bolt 3 of
unit-06 to REQUIRE removal of `audit-lighthouse.mjs`, `lighthouserc.json`, and
the `lighthouse` / `@lhci/cli` deps, with the a11y gate now owned by
`packages/haiku-ui/tests/a11y-pages.spec.tsx` (axe-core RTL). Unit-06 is
`status: completed`.

The finding as written is resolved — not by patching the four mitigations
FB-09 suggested, but by the stronger superseding change that removed the
failing harness entirely. Closing FB-09.
