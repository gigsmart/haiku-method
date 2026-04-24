# Fix FB-10 — Tactical Plan (planner, bolt 1)

**Finding:** `unit-06: audit-lighthouse.mjs serves HTML for /assets/*.js → NO_FCP on every URL, exits 1`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/10-unit-06-audit-lighthouse-mjs-serves-html-for-assets-js-no-fc.md`

## TL;DR

The fix is **already landed** in commit `fea8b9c5` — "unit-06: replace
Lighthouse gate with axe-core per-page RTL assertions". The file that FB-10
cites as buggy (`packages/haiku-ui/scripts/audit-lighthouse.mjs`) no longer
exists; the Lighthouse harness was deleted in its entirety and replaced with a
jsdom-rendered axe-core pass per route in `packages/haiku-ui/tests/a11y-pages.spec.tsx`.
Unit-06's reviewer re-ran on bolt 3 and advanced the hat on 2026-04-21T14:59:35Z.
No new code is required to close FB-10 — the builder bolt for this feedback
file is a no-op commit that updates the tactical-plan record and leaves the
tree unchanged.

## Root cause (historical)

The original Lighthouse fixture-server in `audit-lighthouse.mjs` built
`distEntries = new Set(await readdir(DIST))` at boot — which only enumerates
top-level entries (`['assets', 'index.html']`). Any request for
`/assets/index-<hash>.js` looked up `distEntries.has("assets/index-<hash>.js")`,
which is `false`, so the request fell through to the SPA fallback and was
served `index.html`. The browser could not parse HTML as JS, no script ran,
Lighthouse observed a blank page (`runtimeError.code: NO_FCP`), and the
harness exited 1 on every pinned URL.

## Fix approach — already applied (not re-derived here)

Rather than patching the static-file resolver (the approach the feedback
body suggested), the user directed a larger scope change in bolt 3:

- **Delete the Lighthouse harness entirely**, because `chrome-launcher` (a
  transitive dep of `lighthouse`) was clobbering the developer's local
  Chrome profile — unacceptable on contributor hardware.
- **Replace with `packages/haiku-ui/tests/a11y-pages.spec.tsx`** — a jsdom +
  React Testing Library test that renders `<App>` for each of `/review/:id`,
  `/review/current`, `/question/:id`, `/direction/:id` with committed fixtures
  and a mocked `ApiClient`, then runs `axe.run(container)` with tags
  `wcag2a,wcag2aa,wcag21a,wcag21aa` and asserts zero violations.
- **Remove `lighthouse` + `@lhci/cli` devDeps**, drop the
  `audit:lighthouse` npm script.
- **Add `axe-core` devDep**.
- **Update unit-06 spec + tactical plan** so the completion criteria line up
  with the axe-core gate, not the Lighthouse gate.
- **Refresh parity snapshot + fix a DesignPicker nested-interactive violation**
  surfaced by axe-core along the way.

This approach supersedes the minimal one-line static-file-resolver patch that
FB-10's "Suggested fix" proposed. Superseding is the right call: even if the
resolver had been patched, Lighthouse itself was unusable in this codebase for
independent reasons (the Chrome profile clobber). The axe-core gate provides
the same a11y signal without the Chrome dependency.

## What this bolt changes

Nothing in the codebase. The planner-level record:

1. **`packages/haiku-ui/scripts/audit-lighthouse.mjs`** — already deleted
   (commit `fea8b9c5`). Does not exist in tree. No action.
2. **`packages/haiku-ui/lighthouserc.json`** — already deleted. No action.
3. **`packages/haiku-ui/package.json`** — `lighthouse` + `@lhci/cli` already
   removed; `axe-core` already added. Verified: `grep 'lighthouse\|@lhci/cli'
   packages/haiku-ui/package.json` returns no matches.
4. **`packages/haiku-ui/tests/a11y-pages.spec.tsx`** — already present; owns
   the a11y gate unit-06 promises.
5. **`.haiku/intents/.../stages/development/units/unit-06-shell-and-routing.md`** —
   already updated in bolt 3: `## Completion Criteria` now demands
   `audit-lighthouse.mjs` and `lighthouserc.json` be REMOVED (not exit 0);
   a11y gate is the axe-core RTL test.
6. **`.haiku/intents/.../stages/development/artifacts/unit-06-tactical-plan.md`** —
   already carries a dated header documenting the Lighthouse → axe-core
   replacement.
7. **This file (`fix-FB-10-tactical-plan.md`)** — new: records the
   planner-level closure rationale for FB-10 so the fix-loop's feedback-assessor
   has an artifact tying the feedback to the superseding commit.

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

Each of those checks succeeds against the tree as of this bolt, so FB-10 is
resolved at the code level — the remaining lifecycle work is feedback-state
update (handled by the assessor hat / FSM, not the planner/builder).

## Handoff to the builder

There is no code for the builder to write. The builder bolt should:

1. Re-run the four verification commands above and record the output.
2. Make a trivial no-op commit (e.g., adding a single-line note to this
   tactical plan under `## Builder verification (bolt 2)`) so there is a
   `haiku: fix FB-10 bolt 2 (builder)` commit on the branch, per fix-loop
   convention.
3. Hand off to the feedback-assessor (bolt 3), which will confirm the
   superseding commit closes the finding and will mark the feedback resolved.

If the builder finds any of the four verifications fail (e.g., the Lighthouse
files somehow reappeared from a bad merge), stop and report — the fix is
regressing, not pending.

## Risks

- **None that this plan introduces.** The risky change (deleting Lighthouse,
  swapping gates, touching DesignPicker DOM) already landed, was reviewed,
  and was approved. This plan is a bookkeeping artifact.
- **Parallel-chain clobber risk is minimal** — the superseding commit touched
  `packages/haiku-ui/*` and the unit spec/tactical-plan artifacts. Other fix
  chains may be editing sibling files in haiku-ui but are not expected to
  re-add Lighthouse dependencies. If a concurrent chain re-introduces
  `audit-lighthouse.mjs` somehow, that is a separate regression, not an FB-10
  concern.

## Out of scope

- Re-implementing the Lighthouse harness with a fixed static-file resolver.
  The fixed resolver the feedback body sketches is correct in isolation but is
  moot: we deliberately removed Lighthouse, and the alternative path-resolve
  pattern is not needed anywhere else in the script (the script is gone).
- Adding a Playwright-sandboxed axe audit as a follow-up. The unit spec
  documents this as a future-unit concern; not in scope here.
- Updating the paper or website to reflect the a11y gate mechanism change —
  downstream sync concern, not fix-loop scope.

## Done when

- `packages/haiku-ui/scripts/audit-lighthouse.mjs` remains absent.
- `packages/haiku-ui/tests/a11y-pages.spec.tsx` remains present and runs
  green under `npx vitest run` for this worktree.
- Unit-06 stays in `status: completed`.
- Feedback-assessor marks FB-10 resolved on the next bolt.

## Builder verification (bolt 2)

Ran the four verification commands from the planner's handoff section against
the current worktree tree on branch
`haiku/universal-feedback-model-and-review-recovery/development`:

```
(a) test ! -f packages/haiku-ui/scripts/audit-lighthouse.mjs  -> PASS
(a2) test ! -f packages/haiku-ui/lighthouserc.json            -> PASS
(b) ! grep -qE 'lighthouse|@lhci/cli' packages/haiku-ui/package.json -> PASS
(c) test -f packages/haiku-ui/tests/a11y-pages.spec.tsx       -> PASS
(c2) grep -qE 'axe-core|axe\.run' packages/haiku-ui/tests/a11y-pages.spec.tsx -> PASS
```

No new code written — the superseding commit (`fea8b9c5`, Lighthouse → axe-core
replacement) still holds. The file FB-10 flags (`audit-lighthouse.mjs`) remains
absent; the axe-core replacement remains in place. Handing off to the
feedback-assessor (bolt 3) for closure confirmation.
