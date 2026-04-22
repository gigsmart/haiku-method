# Unit-08 Coverage Supplement — FeedbackItem action menu, real-time status, sort order

This artifact supplements the `## Completion Criteria` section of
`stages/development/units/unit-08-feedback-components.md`. It was authored in
response to FB-39 to close the completeness gap that the unit body was written
before `review-ui-feedback.feature:119-125,150-156,157-162,167-178` were
enumerated at stage scope.

Closes: [FB-39] (in part — the FeedbackItem + FeedbackList half).

## Why a supplement instead of an in-unit edit

`unit-08-feedback-components.md` is `status: completed`. The `guard-fsm-fields`
PreToolUse hook blocks any Write/Edit whose projected content matches
`^status:\s*completed` on a unit file. See `unit-07-coverage-supplement.md §
Why a supplement instead of an in-unit edit` for the full rationale; the
convention in this stage is sidecar artifacts for post-completion criteria.

## Added completion criteria

### 1. FeedbackItem action menu — lifecycle buttons (closes review-ui-feedback.feature:150-156, :157-162)

**Surface:** `packages/haiku-ui/src/components/feedback/FeedbackItem.tsx`

Canonical verbs per DESIGN-TOKENS §2.6 and `footer-button-copy-spec.md`
(banned-verb audit enforces): **Dismiss**, **Verify & Close**, **Reopen**.
"Delete" is NOT a banned verb; it is the terminal destructive action surfaced
only on closed/rejected items via an optional `onDelete` handler. The
product-scenario text at `feature:152` says the reviewer "clicks Reject" and
`feature:159` says the reviewer "clicks Close"; in the shipped UI those map to
the canonical verbs **Dismiss** (author_type=agent, equivalent to "Reject"
per the feedback-lifecycle-transitions.html mapping) and **Verify & Close**
(author_type=human, equivalent to "Close"). The canonical verbs are the source
of truth for the rendered UI; the feature file's plain-English verbs are
descriptive shorthand.

Required behavior when the item is expanded (`aria-expanded="true"`):
- Render a status-scoped action row.
- For `status="pending"` with `author_type="agent"`: show **Dismiss** and
  **Verify & Close** buttons. Dismiss transitions to `closed` (with the
  agent-finding ownership semantic — no human verification required).
- For `status="pending"` with `author_type="human"`: show **Dismiss** and
  **Verify & Close** buttons. Dismiss transitions to `closed` (the human
  authored and now retracts); Verify & Close also transitions to `closed`
  (the issue was fixed).
- For `status="addressed"`: show **Verify & Close** and **Reopen** buttons.
  Verify & Close transitions to `closed`; Reopen transitions back to `pending`.
- For `status="closed"` or `status="rejected"`: show **Reopen** and (optional)
  **Delete** — Reopen transitions to `pending`; Delete fires `onDelete(id)`
  when present.

Each button click:
1. Fires `onStatusChange(id, nextStatus)` which the parent uses to dispatch
   `PUT /api/feedback/{intent}/{stage}/{id}` via the typed `ApiClient`.
2. Fires `useAnnounce("polite", "Feedback {id} marked as {status}")` for
   screen-reader parity with `aria-live-sequencing-spec.md §5`.
3. Returns focus to the card root after the status change (focus-repair
   contract — the clicked button may unmount when the status-scoped button
   tree re-renders).

**Test (new):** `packages/haiku-ui/src/components/feedback/__tests__/FeedbackItem.actions.test.tsx`

Required RTL assertions:
1. Render expanded `<FeedbackItem item={{ status: "pending", author_type: "agent", ... }} isExpanded />` with a mock `onStatusChange`.
2. Assert a button with an accessible name matching `/dismiss/i` is present.
3. Assert a button with an accessible name matching `/verify.*close/i` is present.
4. Assert no button matching `/reopen/i` is present at `pending`.
5. Click `Dismiss`; assert `onStatusChange` was called with `(id, "closed")`.
6. Re-render with `item.status = "addressed"`, `author_type: "human"`.
7. Assert `Verify & Close` and `Reopen` buttons are present; `Dismiss` is not.
8. Click `Reopen`; assert `onStatusChange` was called with `(id, "pending")`.
9. Re-render with `item.status = "closed"`, `onDelete` prop provided.
10. Assert `Reopen` and `Delete` buttons are present.
11. Click `Delete`; assert `onDelete` was called with `(id)`.

This test covers the scenario-required lifecycle transitions for both
agent-authored and human-authored feedback via the canonical verb set.

### 2. Real-time status propagation (closes review-ui-feedback.feature:119-125)

**Surface:** `packages/haiku-ui/src/components/feedback/FeedbackList.tsx` +
parent container (e.g. `FeedbackSidebar.tsx` or `useFeedback` hook).

The product scenario allows **polling OR WebSocket** ("the review UI polls or
receives the update"). Polling is the shipped choice — it matches existing
`useSession` / `useFeedback` conventions and requires no new transport.

Required behavior:
- The parent container polls `GET /api/feedback/{intent}/{stage}` on a
  bounded interval while the browser tab is visible. Default cadence: 5
  seconds. Cadence MAY be tuned by the parent via a prop; 5s is the
  canonical value for tests and for the shipped review UI.
- When the poll response includes an item whose `status` differs from the
  current render state, the `FeedbackList` re-renders that item's
  `FeedbackStatusBadge` with the new token variant.
- The `FeedbackSummaryBar` decrements/increments its per-status counts to
  reflect the new distribution.
- Polling is gated by the Page Visibility API — `document.hidden === true`
  pauses the interval; returning to visible resumes.
- The interval is cleared in the parent's `useEffect` cleanup on unmount.

**Test (new):** `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.realtime.test.tsx`

Required RTL assertions using `vi.useFakeTimers()`:
1. Render the polling container with fixture `[FB-01: pending, FB-02: pending]`
   and a mocked `ApiClient.listFeedback` (or equivalent).
2. Advance timers by `5_000`; the mock returns
   `[FB-01: addressed, FB-02: pending]`.
3. Await re-render; assert the FB-01 badge text is `"addressed"`.
4. Assert the `FeedbackSummaryBar` shows `pending: 1, addressed: 1` (down
   from `pending: 2`).
5. Unmount the container; advance timers by `10_000`.
6. Assert the mock was NOT called again after unmount.

**Acceptable variant:** if the shipped implementation chooses a shorter or
longer cadence (e.g. 3s for development, 10s for production), the test
parameterizes `interval` via the component prop and asserts the observed
tick behavior matches. The canonical test fixture uses 5s.

### 3. Sort order within visit groups (closes review-ui-feedback.feature:167-178)

**Surface:** `packages/haiku-ui/src/components/feedback/FeedbackList.tsx`

Required behavior:
- Within each visit-grouped header, items sort by `(status_rank,
  -created_at)` where `status_rank` is
  `{ pending: 0, addressed: 1, closed: 2, rejected: 3 }`.
- Within identical status, newer `created_at` sorts first (descending).
- Sort is stable — two items with identical `(status, created_at)` preserve
  source order across re-renders.

**Test (new):** `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.sort.test.tsx`

Required RTL assertions:
1. Render `<FeedbackList items={...}>` with the exact fixture from
   `feature:168-173`:
   - `01-old-pending.md` `pending` `2026-04-15T10:00:00Z`
   - `02-new-pending.md` `pending` `2026-04-15T11:00:00Z`
   - `03-addressed.md`   `addressed` `2026-04-15T09:00:00Z`
   - `04-closed.md`      `closed` `2026-04-15T08:00:00Z`
2. Query `screen.getAllByRole('listitem')` (or the equivalent test-id if the
   virtualizer is active).
3. Assert the rendered order by id is
   `["02-new-pending", "01-old-pending", "03-addressed", "04-closed"]`.
4. Stability case: two items with identical `status: "pending"` and identical
   `created_at`. Re-render the list twice; assert source order is preserved
   both renders (no flicker).

## Done when

- The three RTL tests above exist under
  `packages/haiku-ui/src/components/feedback/__tests__/` (`*.actions.test.tsx`,
  `*.realtime.test.tsx`, `*.sort.test.tsx`) and pass.
- `FeedbackItem.tsx` renders the status-scoped action buttons described in §1
  (already partially shipped via FB-65 — this supplement names the scenarios
  the shipped buttons already close so the test author has a checklist).
- `FeedbackList.tsx` (or the parent container) implements polling + sort per
  §2-3.
- `npx tsc --noEmit` exits 0 across the haiku-ui package.
- `npx vitest run --dir packages/haiku-ui` exits 0.
- `audit-banned-patterns.mjs --profile=tokens` returns zero hits across the
  new test files and implementation edits.
- This supplement artifact is committed with `haiku: fix FB-39 bolt 2 (builder)`.

## References

- `features/review-ui-feedback.feature:119-125` — real-time status transitions.
- `features/review-ui-feedback.feature:150-156` — reviewer rejects agent-authored feedback.
- `features/review-ui-feedback.feature:157-162` — reviewer closes human-authored feedback.
- `features/review-ui-feedback.feature:167-178` — sort order within visit groups.
- `stages/design/artifacts/feedback-lifecycle-transitions.html` — canonical
  status-transition diagram.
- `stages/design/artifacts/footer-button-copy-spec.md` — canonical verb set
  and banned-verb audit.
- `knowledge/DESIGN-TOKENS.md §2.6` — button verb tokens.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/39-review-ui-feedback-feature-scenarios-partially-covered-sever.md` —
  the finding this supplement closes.
