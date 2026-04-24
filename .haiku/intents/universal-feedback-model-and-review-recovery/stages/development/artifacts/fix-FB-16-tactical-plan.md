# Fix FB-16 — Tactical Plan (planner, bolt 1)

**Finding:** `Sidebar visibility breakpoint inconsistent (md vs xl) across sidebar components`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/16-sidebar-visibility-breakpoint-inconsistent-md-vs-xl-across-s.md`

## TL;DR

Four sidebar call sites disagree on where the desktop sidebar appears:
three legacy files gate on `md:flex` (≥ 768 px), the canonical new
`FeedbackSidebar` gates on `xl:flex` (≥ 1280 px). Unify on **xl**
everywhere — it matches the canonical `useIsMobile()` threshold
(`(max-width: 1279px)`), the DESIGN-TOKENS §1.3 width pattern
(`w-80 xl:w-96`), and the layout test that already pins `xl:flex` as
the desktop branch assertion. The base `w-[var(--sidebar-width)]`
class stays on all four call sites (the layout test asserts it and the
token pair is the documented sidebar-width pattern) — unifying the
visibility gate to `xl:flex` makes the base width effectively
structural documentation, which is fine.

## Root cause

Two separate work streams planted the sidebar at different breakpoints:

1. **Legacy tree** (`components/ReviewPage.tsx` →
   `components/ReviewSidebar.tsx`, plus `components/ReviewCurrentPage.tsx`)
   was authored against an earlier unstated breakpoint of **md** (768 px).
   No `useIsMobile` hook in the legacy path — pure CSS visibility.
2. **New review composition** (`pages/review/ReviewPage.tsx` →
   `pages/review/FeedbackSidebar.tsx`) uses a JS-driven branch via
   `useIsMobile()` which hard-codes `(max-width: 1279px)` and pins the
   visibility gate to **xl** (1280 px). The layout and responsive tests
   assert the `xl:flex` class specifically.

Both streams shipped. Nobody reconciled. A user on a 1024 px tablet
lands on legacy `ReviewPage` / `ReviewCurrentPage` and sees a sidebar;
the same user on the new `pages/review/ReviewPage.tsx` composition
sees only the mobile column with no FAB affordance rendered in that
band (since `useIsMobile` returns `false` below 1280 on some paths but
the FeedbackSidebar is `hidden xl:flex` — though the React tree uses
`useIsMobile` to decide which branch to mount, so in practice the FAB
DOES render below xl via the JS branch; the gap the feedback body
names is for paths that don't use `useIsMobile`).

## Why xl, not md

The DESIGN-TOKENS file itself does not legislate a breakpoint for
sidebar visibility — it only names the width pattern `w-80 xl:w-96`
(§1.3, line 113). But three adjacent signals all point to xl:

- **`useIsMobile.ts`** pins the JS responsive branch to
  `(max-width: 1279px)` — explicitly the Tailwind `xl` breakpoint.
  The module docstring (lines 1–20) calls this out as canonical.
- **`pages/review/__tests__/layout.test.tsx:147`** asserts the
  sidebar's className contains `xl:flex`. Changing the canonical to
  md would break this test and invert the layout contract.
- **`unit-07-review-page-desktop-and-mobile.md:80`** describes the
  responsive pattern as `xl:flex desktop split`. That is the spec the
  canonical composition was built against.

The three legacy `md:flex` call sites are the outliers. Snap them to
`xl:flex`.

## Files to modify

All four edits change exactly one substring per file: `md:flex` →
`xl:flex` inside the sidebar `className`. The rest of the className
stays intact; in particular the base `w-[var(--sidebar-width)]` token
stays because (a) the layout test asserts it, (b) the DESIGN-TOKENS
§1.3 pattern pairs it with the xl override, and (c) it is harmless
dead-width below xl (the element is `hidden` there).

### 1. `packages/haiku-ui/src/components/ReviewSidebar.tsx` (line 76)

Current:

```
: "hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700"
```

Change `md:flex` to `xl:flex`. This is the standalone (non-embedded)
path of `ReviewSidebar`. The `embedded` branch uses
`flex flex-col flex-1 min-h-0` and is unaffected.

### 2. `packages/haiku-ui/src/components/ReviewPage.tsx` (line 464)

Current (inside `LegacyReviewPage` — the legacy monolith that FB-11
plans to delete):

```
<aside className="hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
```

Change `md:flex` to `xl:flex`. If the FB-11 chain lands first and
deletes `LegacyReviewPage` entirely, this edit becomes a no-op
conflict and can be dropped — re-read the file immediately before
writing. If the file is already gone, nothing to do here.

### 3. `packages/haiku-ui/src/components/ReviewCurrentPage.tsx` (line 175)

Current (live runtime, mounted by `pages/review-current/index.tsx`):

```
<aside className="hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
```

Change `md:flex` to `xl:flex`. **User-visible effect:** tablet users
(768–1279 px) on `/review/current` will no longer see the feedback
sidebar. `ReviewCurrentPage` has no FAB/sheet equivalent today, so
tablet users lose the sidebar entirely on this route. This is the
correct trade — the canonical threshold is xl, and a tablet fallback
UI is out-of-scope for FB-16. Track any tablet-fallback work as a
follow-up unit; it is not a regression relative to the spec.

### 4. `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` (line 167)

Already correct (`xl:flex`). **No change needed.** This is the
canonical call site and the reference shape all three legacy files
are snapping to.

### Secondary issue from the feedback body — leave alone

The feedback body's secondary claim — that the base
`w-[var(--sidebar-width)]` class "never applies because the element
is `hidden` below xl" and should therefore be dropped — is
technically correct but actively dangerous to act on:

- `pages/review/__tests__/layout.test.tsx:144` asserts
  `w-[var(--sidebar-width)]` is present on the sidebar element.
  Dropping it breaks the layout test.
- DESIGN-TOKENS §1.3 (line 113) codifies the pair `w-80 xl:w-96` as
  the canonical sidebar-width pattern. The runtime maps this to
  `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`. Keeping
  the base token preserves the grep-able canonical pattern even at
  call sites where the base width is structurally unreachable.
- The base width becomes non-dead the moment any future change
  introduces a below-xl mount path (e.g. an embedded variant, a print
  mode, a tablet-fallback unit). Deleting it is a premature
  optimization that would need to be restored later.

**Decision:** leave the base `w-[var(--sidebar-width)]` token in place
on all four call sites. The feedback-assessor should close FB-16 on
the four-site `md:flex → xl:flex` sweep alone.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) All four sidebars now use xl:flex (the legacy md:flex is gone
#     everywhere it was flagged).
! grep -rn 'hidden md:flex w-\[var(--sidebar-width)\]' packages/haiku-ui/src

# (b) The four target lines all show xl:flex now.
grep -rn 'hidden xl:flex w-\[var(--sidebar-width)\]' packages/haiku-ui/src
#   should list ReviewSidebar.tsx, ReviewCurrentPage.tsx, FeedbackSidebar.tsx,
#   and — if FB-11 hasn't landed — ReviewPage.tsx. One per file, no drift.

# (c) The base sidebar-width token is still present at all call sites
#     (layout-test compatibility + DESIGN-TOKENS §1.3 pattern preservation).
grep -c 'w-\[var(--sidebar-width)\]' packages/haiku-ui/src/components/ReviewSidebar.tsx
grep -c 'w-\[var(--sidebar-width)\]' packages/haiku-ui/src/components/ReviewCurrentPage.tsx
grep -c 'w-\[var(--sidebar-width)\]' packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx
#   each should be ≥ 1

# (d) No useIsMobile drift — the mobile threshold stays at 1279px so
#     it matches the xl breakpoint gate.
grep -n '"(max-width: 1279px)"' packages/haiku-ui/src/pages/review/useIsMobile.ts

# (e) Layout + responsive test suite still green (they pin xl:flex
#     explicitly and will fail loudly if the base width token drops).
pnpm --filter haiku-ui test -- layout.test.tsx responsive.test.tsx

# (f) Full haiku-ui test run — catches any DOM-parity / responsive
#     assertion drift in sibling suites.
pnpm --filter haiku-ui test

# (g) TypeScript compiles (no import drift — we only touched className
#     strings).
pnpm --filter haiku-ui typecheck
```

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
2. Make the edits as a **single cohesive commit** —
   `haiku: fix FB-16 bolt 2 (builder)`. All four files in one diff so
   the grep-guard in (a) catches incomplete sweeps in one shot.
3. **Read each file immediately before writing.** FB-11 (ReviewPage
   cutover), FB-22 (monolith split), and FB-27 (LegacyReviewPage dead
   code) are parallel chains touching
   `packages/haiku-ui/src/components/ReviewPage.tsx`. If any of those
   have already landed and `LegacyReviewPage` is gone, skip the
   ReviewPage.tsx edit — nothing to do there. The grep in (a) is the
   source of truth, not the line numbers in this plan.
4. After the edits, run verification commands (a)–(g) and paste the
   diff + verification output into the bolt-2 commit body.

## Risks

- **Parallel-chain clobber on `ReviewPage.tsx` (medium).** FB-11
  deletes `LegacyReviewPage`. If FB-11's builder bolt commits first,
  our line-464 edit becomes a no-op — which is fine, the finding is
  still closed because the offending code is gone. If our bolt
  commits first, FB-11 rebases cleanly because the edit is a single
  token swap, not a structural change. Mitigation: read-before-write.
- **Tablet users lose sidebar on `/review/current` (medium, by
  design).** The legacy `md:flex` was the only path showing the
  sidebar at 768–1279 px on `ReviewCurrentPage`. After this fix, that
  band shows no sidebar and no FAB. This matches the canonical
  xl-only desktop split and is explicitly the spec direction.
  Follow-up: a tablet-fallback UI for `/review/current` is an out-of-
  scope unit — if product pushes back, file a new finding, don't
  revert the breakpoint.
- **Base-width class appears dead at xl-only gates (low).** Static
  analyzers / future refactors may flag
  `w-[var(--sidebar-width)]` alongside `hidden xl:flex` as dead CSS.
  This plan is explicit: **do not remove it.** The layout test
  asserts its presence; DESIGN-TOKENS §1.3 codifies the pattern.
  Document inline if the dead-code heuristic keeps complaining —
  don't delete.
- **`useIsMobile` drift (low).** If `useIsMobile`'s 1279px threshold
  ever shifts (e.g. to match a new tablet-first design), all four
  call sites need to drift with it. Not this bolt's problem, but
  callout for the assessor.

## Out of scope

- Dropping the base `w-[var(--sidebar-width)]` token from any call
  site. See §"Secondary issue from the feedback body — leave alone".
- Introducing a tablet-fallback sidebar for `/review/current`
  (768–1279 px band). New unit if product wants it.
- Changing `useIsMobile()`'s 1279px threshold. Out of scope unless a
  future finding asks for a different canonical breakpoint.
- Rewriting `LegacyReviewPage`. FB-11 / FB-22 / FB-27 own that
  cutover.

## Done when

- `grep -rn 'hidden md:flex w-\[var(--sidebar-width)\]'
  packages/haiku-ui/src` returns zero matches.
- `grep -rn 'hidden xl:flex w-\[var(--sidebar-width)\]'
  packages/haiku-ui/src` returns one match per surviving sidebar
  call site (3 if FB-11 has deleted `LegacyReviewPage`, 4 otherwise).
- `pnpm --filter haiku-ui typecheck` passes.
- `pnpm --filter haiku-ui test` passes — layout + responsive suites
  still green, DOM-parity still green.
- The feedback-assessor closes FB-16 on the bolt-2 commit.
