# unit-08 Feedback component cluster — Reviewer notes (bolt 2)

**Decision: APPROVED**

## Verification evidence

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` (in `packages/haiku-ui`) | passed, zero errors |
| Unit tests | `npx vitest run src/components/feedback/__tests__/` | 7 files, 53 tests, all passed |
| Full haiku-ui suite | `npx vitest run` | 21 files, 129 tests, all passed (no regressions) |
| Banned patterns — tokens profile | `node scripts/audit-banned-patterns.mjs --profile=tokens` | 10 rules, 0 hits |
| Banned patterns — stage-wide profile | `node scripts/audit-banned-patterns.mjs --profile=stage-wide` | 12 rules, 0 hits |
| Token drift | `node scripts/verify-tokens.mjs` | 41 checks, 0 mismatches |
| Lint | `biome check packages/haiku-ui/src/components/feedback packages/haiku-ui/src/components/FeedbackPanel.tsx` | 17 files checked, no fixes applied |
| Declared outputs | existence check for all 19 paths in frontmatter `outputs:` | all present |

## Completion criteria — CoVe walkthrough

1. **State-matrix snapshot tests pass; snapshots committed.** Vitest reports 53 tests passing across 7 test files. Five snapshot files committed at `__snapshots__/{FeedbackStatusBadge,FeedbackOriginIcon,FeedbackItem,FeedbackList,FeedbackSummaryBar}.states.test.tsx.snap`. Every matrix wraps its root with `data-token-hash={TOKEN_HASH}` so token drift triggers a snapshot diff — satisfies the "snapshots include a header recording the token hash" contract.

2. **Zero opacity on card roots; audit catches regressions.** `FeedbackItem.tsx` root uses `statusBackground[item.status]` (solid alpha-washed `bg-*-50/50`) — no `opacity-50|60|70`. `FeedbackItem.states.test.tsx` has an explicit assertion `expect(html).not.toMatch(/\bopacity-(50|60|70)\b/)` across the full 24-cell matrix. `audit-banned-patterns.mjs --profile=tokens` reports 0 hits on the `banned-opacity-state` rule.

3. **Every status badge carries `aria-label="Status: {status}"`.** `FeedbackStatusBadge.tsx` unconditionally renders `aria-label={\`Status: ${status}\`}`. RTL test asserts presence on all four status variants (`pending / addressed / closed / rejected`) individually, and `FeedbackItem.states.test.tsx` asserts the count is exactly 6 per status (24 total across the matrix).

4. **Origin icons render via `originLabels[origin]`.** `FeedbackOriginIcon.tsx` renders `originLabels[origin]` as visible text; when `showLabel=false` the emoji carries `role="img"` + `aria-label={originLabels[origin]}`. RTL asserts both the human label appears and the raw slug does not. `audit-banned-patterns.mjs --profile=stage-wide` reports 0 hits on the `banned-origin-jsx-bare` rule (`\{origin\}(?!Labels)` regex).

5. **Virtualization perf: 500 items → ≤30 mounted.** `FeedbackList.virtualization.test.tsx` renders `<FeedbackList items={mockItems(500)} ... />` and asserts `document.querySelectorAll('[data-testid="feedback-item"]').length <= 30`. Also asserts the list carries `data-virtualized="true"` above threshold and `data-virtualized="false"` at/below. Passes.

6. **Keyboard nav: 100-item ArrowDown 0→99, no skips.** `FeedbackList.keyboard.test.tsx` renders 100 items (virtualized branch), focuses `FB-01`, then loops `fireEvent.keyDown({ key: "ArrowDown" })` 99 times, asserting at each step that the target `FB-NN` is mounted AND is `document.activeElement`. Passes. Additional tests cover ArrowUp walk-back, ArrowDown/Up clamping at boundaries (no wrap), and Enter activating the focused item (toggles `aria-expanded`).

7. **`npx tsc --noEmit` passes.** Verified — zero errors.

## Behavioral spot-checks beyond the literal criteria

- **Focus preservation on status transition.** `FeedbackItem` uses `useLayoutEffect` keyed on `item.status` to detect transitions; when the user had focus inside the card (tracked via `focusedBeforeChangeRef` captured at click-time AND a fallback `card.contains(document.activeElement)` check), focus returns to the card root. Test asserts focus lands on the card root (not `<body>`) after Dismiss — resilient to jsdom's activeElement reset on button removal.
- **Polite announcements.** `useAnnounce("polite", statusAnnouncement(id, status))` fires on every status change. Three tests cover Dismiss (→ rejected), Verify & Close (→ closed), Reopen (→ pending) — all assert the `POLITE_REGION_ID` node's `textContent` matches the canonical sentence.
- **Canonical verbs enforced.** Pending → Dismiss only (no Close/Reject/Delete); Addressed → Verify & Close + Reopen; Closed/Rejected → Reopen + Delete. `audit-banned-patterns.mjs` banned-button-verb rules report 0 hits.
- **Rejected badge contrast.** Uses `text-stone-600 dark:text-stone-300` pair (FB-15 AAA lift); explicit test asserts `text-stone-400` is NOT present on the rejected variant.
- **Virtualization + keyboard coordination.** `useFeedbackListKeyboardNav` resolves the currently-focused index from the live DOM (not stale hook state), calls `scrollToIndex` on the virtualizer ref BEFORE re-focusing, and uses `queueMicrotask` (jsdom-safe rAF fallback) so focus lands after react-window commits the new window. The 100-step ArrowDown loop is the proof.
- **`aria-setsize` / `aria-posinset` on every row wrapper.** Both branches (plain `<li>` and virtualized `role="listitem"` div) carry these so screen readers see the true list size even when 470 of 500 rows are unmounted. Asserted in `FeedbackList.states.test.tsx`.
- **Compatibility shim preserves consumer call-sites.** `components/FeedbackPanel.tsx` is now a 115-line wrapper around the new `FeedbackList` that preserves the pre-unit-08 `{ items, loading, onUpdate, onDelete }` prop shape — `ReviewPage.tsx` and `ReviewCurrentPage.tsx` stay untouched, matching the tactical plan's scope-violation guard.

## Deferred (not blockers — tracked in other units)

- **FeedbackPanel filter-pill row still uses the legacy pill inside the shim.** It does NOT use `FeedbackSummaryBar`. The tactical plan explicitly flags this for unit-11 (copy audit), and leaving it in the shim keeps unit-08 scope tight. Not a regression.
- **Tab toggle ("Feedback" / "Mine") uses generic buttons.** `unit-09-agent-feedback-toggle` replaces this block. Not a regression.

## Sign-off

All seven completion criteria pass with cited evidence. All 19 declared outputs exist. No banned-pattern hits. No typecheck errors. No test failures. No scope violations (only files under `packages/haiku-ui/src/components/feedback/**`, `components/FeedbackPanel.tsx`, `package.json`, and the unit tactical plan were touched per the plan's §15 scope fence).

**Reviewer decision: APPROVED — advance hat.**
