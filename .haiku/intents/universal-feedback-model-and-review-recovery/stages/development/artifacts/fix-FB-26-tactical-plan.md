# Fix FB-26 — Tactical Plan (planner, bolt 1)

**Finding:** `FeedbackPanel "compatibility shim" hides ownership gap`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/26-feedbackpanel-compatibility-shim-hides-ownership-gap.md`

## TL;DR

`packages/haiku-ui/src/components/FeedbackPanel.tsx` is a "compatibility shim"
that re-implements filter + tab state internally instead of delegating to the
canonical `FeedbackSummaryBar` + `FeedbackList` + `AgentFeedbackToggle` trio.
Its own docstring says the shim "can be deleted when unit-09 and unit-11
land" — and both have. Two filter state machines now exist in the same
package, tab semantics (`author_type !== "human"`) are encoded inline in
bypass of `AgentFeedbackToggle`, and there's no `@deprecated` guard stopping
new imports.

**Fix:** migrate the two remaining consumers (`components/ReviewCurrentPage.tsx`
and the feedback-panel call site in `components/ReviewPage.tsx`'s
`LegacyReviewPage`) to compose `FeedbackSummaryBar` + `FeedbackList` directly,
then delete `components/FeedbackPanel.tsx`.

## Parallel-chain awareness

Five related findings are fixing in parallel against adjacent files. Read
each target file immediately before writing so we don't clobber a co-landed
change:

| FB  | Target                                                      | Interaction with FB-26 |
|-----|-------------------------------------------------------------|------------------------|
| 11  | `components/ReviewPage.tsx` + `AnnotationCanvas`            | Same file as call site #1 (but in `LegacyReviewPage`, not the main composition) |
| 12  | `pages/review/FeedbackSidebar.tsx` inline FAB/Sheet dupes   | No direct overlap — FB-12 edits `pages/review/*`, FB-26 edits `components/*` |
| 22  | `components/ReviewPage.tsx` monolith split                  | Structural overlap in the SAME 1659-line file as call site #1 |
| 27  | `components/ReviewPage.tsx` `LegacyReviewPage` dead-code    | **DIRECT overlap** — FB-27 deletes `LegacyReviewPage` (lines 157–522), which contains call site #1 (line 511). If FB-27 lands first, our work on that call site is already moot. If we land first, FB-27's deletion subsumes our edit cleanly. |
| 38  | `pages/review/FeedbackSidebar.tsx` 3-in-1 split             | No direct overlap |

Mitigation: we edit `ReviewCurrentPage.tsx` first (isolated, zero overlap),
then check whether `LegacyReviewPage` still exists before touching call site
#1. If `LegacyReviewPage` is already gone, call site #1 is a no-op. If it's
still there, we migrate the JSX block and let FB-27 supersede later.

## Root cause

Unit-08 shipped the clustered feedback layout (`components/feedback/*`) and
introduced `FeedbackPanel.tsx` as a drop-in wrapper so the unit didn't have
to touch every existing consumer in the same unit. Its docstring explicitly
notes:

> *When both units land [unit-09 AgentFeedbackToggle and unit-11 copy audit],
> this file can be deleted and consumers can import FeedbackList /
> FeedbackSummaryBar from `./feedback` directly.*

Unit-09 landed `components/feedback/AgentFeedbackToggle.tsx`. Unit-11 landed
the revisit + assessor components. Both are live in the barrel
(`components/feedback/index.ts`). The canonical sidebar
(`pages/review/FeedbackSidebar.tsx`) was cut over to the new trio. The shim
was left behind and its two stale consumers kept using it. That is the
ownership gap the feedback calls out: the deletion step of the migration
was silently skipped.

## Why the shim is actively bad (confirming the feedback's architectural claims)

Verified against the tree:

1. **Two filter state machines** — `FeedbackPanel` declares
   `FilterMode = "all" | "pending" | "addressed"` + `TabMode = "feedback" | "mine"`
   at lines 26–27 with its own `useState` wiring (lines 42–43). Meanwhile
   `FeedbackSummaryBar` (`components/feedback/FeedbackSummaryBar.tsx:15–20`)
   operates over the full 5-state `FeedbackStatus` contract (`pending | fixing
   | addressed | closed | rejected`) via `activeStatus` + `onFilter`. The
   shim's filter only speaks to 3 of those 5 states — adding any new
   `FeedbackStatus` requires touching the shim AND the canonical trio.

2. **Tab filter encoded inline, bypasses `AgentFeedbackToggle`** — line 48 of
   the shim: `if (tab === "mine" && item.author_type !== "human") return false`.
   `AgentFeedbackToggle` exists to own exactly this semantics (its
   `onChange(next: boolean)` plus a caller-owned filter on `author_type`),
   and the canonical component has a dedicated spec and test suite. The
   shim re-invents a lesser version of that contract, inverted
   ("mine" = human-authored only) rather than the canonical one
   (toggle=agent-inline vs agent-hidden).

3. **No deprecation signal** — no `@deprecated` JSDoc, no build-time warning.
   The docstring says "this file can be deleted" but does not flag the
   import as stale, and no lint rule forbids new imports. Confirmed by
   grepping: the two existing consumers (`ReviewPage.tsx:38` and
   `ReviewCurrentPage.tsx:5`) still reach it, and nothing would stop a
   third from being added.

## Consumer inventory — verified exhaustive

```
$ rg -n 'from "./FeedbackPanel"|from "\\.\\./components/FeedbackPanel"|import.*FeedbackPanel' packages/haiku-ui/src
packages/haiku-ui/src/components/ReviewPage.tsx:38:import { FeedbackPanel } from "./FeedbackPanel"
packages/haiku-ui/src/components/ReviewCurrentPage.tsx:5:import { FeedbackPanel } from "./FeedbackPanel"
```

Two imports. Both render `<FeedbackPanel items loading onUpdate onDelete>`.
No test files import `FeedbackPanel` — confirmed via `rg FeedbackPanel
packages/haiku-ui/src/**/*.test.*` (zero hits). This is a genuinely 2-call-site
migration, consistent with the feedback body.

## Fix approach

**Strategy:** replace each `FeedbackPanel` usage with an inline composition
of `FeedbackSummaryBar` + `FeedbackList`. Introduce a thin local
`activeStatus` `useState<FeedbackStatus | null>` + derived `filtered` list
at each call site — the same pattern `FeedbackPanelBody` in
`pages/review/FeedbackSidebar.tsx` already uses (lines 60–96), so we are
copying an in-tree precedent, not inventing one. Then delete
`components/FeedbackPanel.tsx`.

We deliberately **do not** centralize the inlined `FeedbackPanelBody`
logic into a shared helper in this bolt. Reasons:

- `pages/review/FeedbackSidebar.tsx:60` already declares a
  `FeedbackPanelBody` with the same shape; FB-38 is fixing the
  "`FeedbackSidebar.tsx` mixes 3 components" split and will likely either
  export that body or move it. Duplicating the same name here would create
  a naming collision for FB-38 to untangle.
- The call site in `LegacyReviewPage` is itself slated for deletion by
  FB-27. Building a shared helper for a soon-to-be-deleted caller is
  premature.
- The `ReviewCurrentPage.tsx` call site is the only durable consumer and
  its inlined body will be ~18 lines of JSX — below the threshold where
  extraction is justified.

### AgentFeedbackToggle scope decision

The feedback body suggests including `AgentFeedbackToggle` in the migration.
The current `FeedbackPanel` shim has a "Feedback/Mine" tab that's
author-type filter dressed as navigation. The canonical
`AgentFeedbackToggle` is semantically **different** — it toggles
agent-feedback inline-vs-hidden, not human-vs-agent as separate tabs.

A full semantic port (tab → toggle) is a UX change, not a dedup refactor.
Scope for this bolt: **keep the shim's existing author-type filter
behavior identity** (i.e., render only `FeedbackSummaryBar` + `FeedbackList`
in the replacement), drop the Feedback/Mine tab entirely. Rationale:

- `ReviewCurrentPage` is a read-only overview screen (see line 170:
  *"Read-only overview. Open during a gate review for decision buttons."*).
  The author-type tab was never a critical feature there.
- `LegacyReviewPage` is dead per FB-27 — not worth preserving UI the user
  never reaches.
- If a future unit needs agent-vs-human filtering on those screens, that
  is a scope-up for `AgentFeedbackToggle` adoption, not dedup.

This matches the precedent in `pages/review/FeedbackSidebar.tsx`'s
`FeedbackPanelBody`, which also renders only summary + list and does not
wire an AgentFeedbackToggle.

## Files to modify

### 1. `packages/haiku-ui/src/components/ReviewCurrentPage.tsx` — primary edit

- **Line 5**: replace `import { FeedbackPanel } from "./FeedbackPanel"`
  with
  ```tsx
  import {
  	FeedbackList,
  	FeedbackSummaryBar,
  	type FeedbackStatus,
  } from "./feedback"
  ```
  Also change the React import on line 2 from `{ useCallback }` to
  `{ useCallback, useMemo, useState }`.

- **Inside `ReviewCurrentPage(...)` body, after `const handleDelete` (line
  31)**: add
  ```tsx
  const [activeStatus, setActiveStatus] = useState<FeedbackStatus | null>(null)
  const filtered = useMemo(() => {
  	if (!activeStatus) return items
  	return items.filter((item) => item.status === activeStatus)
  }, [items, activeStatus])

  const handleStatusChange = useCallback(
  	(id: string, next: FeedbackStatus): void => {
  		updateFeedback(id, { status: next }).catch(() => {})
  	},
  	[updateFeedback],
  )
  ```
  (This replaces `handleUpdate`'s role — we pass `handleStatusChange`
  directly to `FeedbackList.onStatusChange`, matching the typed
  `FeedbackStatus` signature of the canonical component.)

- **Lines 175–182** (the `<FeedbackPanel>` block): replace with
  ```tsx
  <aside className="hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">
  	<div className="flex flex-col flex-1 min-h-0">
  		<div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
  			<FeedbackSummaryBar
  				items={items}
  				activeStatus={activeStatus}
  				onFilter={setActiveStatus}
  			/>
  		</div>
  		<div className="flex-1 overflow-y-auto p-3">
  			<FeedbackList
  				items={filtered}
  				isLoading={loading}
  				onStatusChange={handleStatusChange}
  				onDelete={handleDelete}
  			/>
  		</div>
  	</div>
  </aside>
  ```

- **Remove the now-unused `handleUpdate` constant** (lines 19–24).

### 2. `packages/haiku-ui/src/components/ReviewPage.tsx` — conditional edit

**Before editing this file, re-read it.** FB-27's deletion chain may have
already removed `LegacyReviewPage` (lines 157–522), in which case line 511's
`<FeedbackPanel>` is already gone and no edit is needed — just the import
on line 38 remains. In that case: delete line 38's import and stop.

If `LegacyReviewPage` is still present when we edit:

- **Line 38**: delete `import { FeedbackPanel } from "./FeedbackPanel"` and
  (same import line or adjacent) add
  ```tsx
  import {
  	FeedbackList,
  	FeedbackSummaryBar,
  	type FeedbackStatus,
  } from "./feedback"
  ```

- **Inside `LegacyReviewPage` body** (search for the `useFeedback` call —
  currently line 169): after the existing `handleFeedbackDelete` callback
  (ends line 188), add
  ```tsx
  const [feedbackActiveStatus, setFeedbackActiveStatus] = useState<FeedbackStatus | null>(null)
  const filteredFeedbackItems = useMemo(() => {
  	if (!feedbackActiveStatus) return feedbackItems
  	return feedbackItems.filter((item) => item.status === feedbackActiveStatus)
  }, [feedbackItems, feedbackActiveStatus])

  const handleFeedbackStatusChange = useCallback(
  	(id: string, next: FeedbackStatus): void => {
  		updateFeedback(id, { status: next }).catch(() => {})
  	},
  	[updateFeedback],
  )
  ```
  (Namespaced names because the surrounding file is huge and other
  `activeStatus` / `filtered` / `handleStatusChange` locals could collide in
  a future edit.)

- **Line 511** (the `<FeedbackPanel ...>` block inside the sidebar tab
  ternary): replace with
  ```tsx
  <div className="flex flex-col flex-1 min-h-0">
  	<div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
  		<FeedbackSummaryBar
  			items={feedbackItems}
  			activeStatus={feedbackActiveStatus}
  			onFilter={setFeedbackActiveStatus}
  		/>
  	</div>
  	<div className="flex-1 overflow-y-auto p-3">
  		<FeedbackList
  			items={filteredFeedbackItems}
  			isLoading={feedbackLoading}
  			onStatusChange={handleFeedbackStatusChange}
  			onDelete={handleFeedbackDelete}
  		/>
  	</div>
  </div>
  ```

- **Verify `useState` + `useMemo` + `useCallback` are already imported**
  (line 3: `import { useCallback, useEffect, useRef, useState } from "react"`
  — `useMemo` is NOT in that list). Add `useMemo` to the import.

### 3. `packages/haiku-ui/src/components/FeedbackPanel.tsx` — delete

Delete the file. No downstream references remain after steps 1–2.

Verification: `grep -rn FeedbackPanel packages/haiku-ui/src` should return
only the pages/review/FeedbackSidebar.tsx `FeedbackPanelBody` function (a
different identifier, in a different file, unrelated to the deleted shim).

### 4. Unit spec hygiene — no edits

- `unit-08-feedback-components.md` lists
  `packages/haiku-ui/src/components/FeedbackPanel.tsx` among files touched
  by unit-08 (line 57). That's historical record — unit-08 DID touch the
  file when it added the shim. Deletions under FB-26 are a post-unit-08
  fix-loop action and do not require rewriting unit-08's spec.
- `unit-04-design-token-system.md` references the file at line 40 in a
  token-audit enumeration. Same rationale: historical record, no edit.
- `unit-03-extract-haiku-ui-package.md` references the file at line 65
  (move-from-plugin enumeration). Same rationale: historical record.

This matches FB-12's precedent — deleting a file doesn't retroactively
rewrite the unit spec that first introduced it.

## Tests

No existing test imports `FeedbackPanel` (verified via grep). Deleting it
cannot break a test.

After the migration, the `ReviewCurrentPage` screen renders
`FeedbackSummaryBar` + `FeedbackList` instead of `FeedbackPanel`. Both
replacement components have their own committed test suites under
`packages/haiku-ui/src/components/feedback/__tests__/` — we inherit their
coverage.

No new test file is added in this bolt. Rationale:
- `ReviewCurrentPage.tsx` has no pre-existing test file; adding one here
  would widen scope beyond the dedup fix.
- The canonical composition pattern (`FeedbackSummaryBar` + `FeedbackList`
  + local `useState` filter) is already covered by
  `pages/review/__tests__/*` tests against `FeedbackSidebar`.

If the builder finds a test regression from this refactor (type errors,
snapshot drift), fix it in-place rather than widening to new test files.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) FeedbackPanel.tsx is gone
test ! -f packages/haiku-ui/src/components/FeedbackPanel.tsx

# (b) No imports of FeedbackPanel survive anywhere in src
! rg -q "from [\"']\\./FeedbackPanel[\"']|from [\"']\\.\\./components/FeedbackPanel[\"']|import.*FeedbackPanel" packages/haiku-ui/src

# (c) ReviewCurrentPage now imports the canonical feedback trio
rg -q "from [\"']\\./feedback[\"']" packages/haiku-ui/src/components/ReviewCurrentPage.tsx
rg -q "FeedbackSummaryBar|FeedbackList" packages/haiku-ui/src/components/ReviewCurrentPage.tsx

# (d) If LegacyReviewPage is still present, ReviewPage.tsx imports the trio
#     too; otherwise line 38 import is deleted
if rg -q "export function LegacyReviewPage" packages/haiku-ui/src/components/ReviewPage.tsx; then
  rg -q "from [\"']\\./feedback[\"']" packages/haiku-ui/src/components/ReviewPage.tsx
  rg -q "FeedbackSummaryBar|FeedbackList" packages/haiku-ui/src/components/ReviewPage.tsx
fi
! rg -q "from [\"']\\./FeedbackPanel[\"']" packages/haiku-ui/src/components/ReviewPage.tsx

# (e) Type-check
pnpm --filter haiku-ui typecheck

# (f) Tests still pass (no FeedbackPanel tests to lose)
pnpm --filter haiku-ui test

# (g) Build succeeds — confirms tree-shaking + import graph is clean
pnpm --filter haiku-ui build
```

Each check is fast (<10s for a–d, longer for e–g). The builder should paste
the tail of steps (e)–(g) output into its commit message so the assessor
can close cleanly.

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
2. Read each target file immediately before writing — parallel chains may
   have already edited `components/ReviewPage.tsx` (FB-22 / FB-27 /
   possibly FB-11). In particular, **re-confirm** whether `LegacyReviewPage`
   still exists when you open the file. If it's gone, step 2's work
   collapses to deleting the line-38 import.
3. Do the migration + deletion as a single commit:
   `haiku: fix FB-26 bolt 2 (builder)`. Do NOT push.
4. Run the verification suite above. If any check fails, diagnose and fix
   before the commit lands — not after.
5. Hand off to the feedback-assessor (bolt 3).

## Risks

- **Parallel-chain clobber (medium)** — FB-27 deletes `LegacyReviewPage`.
  If FB-27's fix lands between our planner bolt and our builder bolt, the
  builder **must** re-read `ReviewPage.tsx` and skip the in-function edits
  — only the import on line 38 needs deletion. The verification commands
  are written to handle either state (see step d's `if`).
- **`useMemo` / `useState` import gap (low)** — the existing React imports
  in both target files don't include `useMemo`. The builder must add it
  when adding the filter `useMemo`. TypeScript will catch a missed import
  immediately.
- **Type narrowing on `onStatusChange`** — `FeedbackPanel` accepted a
  `{ status?: string }` generic payload; `FeedbackList.onStatusChange`
  expects `(id: string, next: FeedbackStatus)`. The existing
  `updateFeedback` hook still takes `{ status?: string }`, so we cast
  `next` back to string implicitly (TS lets `FeedbackStatus` widen to
  `string`). No runtime change; the wire contract is the same.
- **Test-file absence is intentional, not a gap** — if the assessor flags
  "no new test for ReviewCurrentPage migration," the answer is: the
  replacement components are tested in their own suites, and the
  integration layer (`FeedbackSidebar`) has tests. A new integration test
  at the `ReviewCurrentPage` layer is a unit-level decision, not a
  fix-loop scope-up.
- **`<aside>` element accessibility** — `ReviewCurrentPage.tsx` uses
  `<aside>` directly, not the typed `Aside` wrapper from
  `components/a11y`. The replacement preserves that choice (no change).
  If FB-73 or a future a11y sweep wants `<Aside>` everywhere, that's a
  separate finding.

## Out of scope

- `AgentFeedbackToggle` adoption on the overview screens. The canonical
  toggle's semantics differ from the shim's "Mine" tab and adopting it is
  a UX decision, not a dedup decision.
- `FeedbackSidebar.tsx` split (FB-38's scope — the `FeedbackPanelBody`
  inside that file stays put under FB-38, which may export it).
- `LegacyReviewPage` deletion (FB-27's scope).
- `ReviewPage.tsx` monolith split (FB-22's scope).
- Paper / website sync. `FeedbackPanel` is an internal implementation
  detail — it never appeared in user-facing docs or the paper.

## Done when

- `packages/haiku-ui/src/components/FeedbackPanel.tsx` does not exist.
- `packages/haiku-ui/src/components/ReviewCurrentPage.tsx` renders
  `FeedbackSummaryBar` + `FeedbackList` with a local `activeStatus` +
  `filtered` pattern.
- `packages/haiku-ui/src/components/ReviewPage.tsx` has no import of
  `FeedbackPanel`. If `LegacyReviewPage` is still present, its sidebar
  tab renders `FeedbackSummaryBar` + `FeedbackList` directly.
- `pnpm --filter haiku-ui typecheck` and
  `pnpm --filter haiku-ui test` pass.
- `pnpm --filter haiku-ui build` succeeds.
- Feedback-assessor closes FB-26 on the next bolt.
