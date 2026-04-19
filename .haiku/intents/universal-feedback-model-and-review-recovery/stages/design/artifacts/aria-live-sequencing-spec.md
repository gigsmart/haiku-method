# ARIA Live-Region Sequencing Specification

**Closes:** FB-26 (aria-live sequencing for optimistic UI).
**Scope:** Every user-triggered feedback state transition in the review app.
**Referenced by:** unit-05 (feedback-lifecycle-ownership) quality gates (body text amendment).

## 1. Motivation

The optimistic UI pattern specified in unit-05 creates a three-phase lifecycle:

1. User clicks "Verify & Close" (or "Reject", "Re-open", etc.)
2. UI updates immediately (badge flips, filter counts shift, the in-flight card gets `aria-busy="true"` + spinner + `<span class="sr-only">Processing…</span>`)
3. API call resolves:
   - **Success** → UI persists the optimistic state; polite announcement confirms
   - **Failure** → UI reverts; assertive announcement explains the rollback

Without explicit sequencing rules, a screen reader user can hear contradictory announcements (e.g. "FB-03 marked as closed" followed by "failed — reverted") with no clear indication the first was rolled back.

This spec defines the **exact** text template per transition and the live-region wiring that carries it.

## 2. Two live regions, separate nodes

Every page-level artifact includes **two** live-region elements, per `aria-landmark-spec.md §1`:

```html
<!-- Polite: in-flight + success announcements.
     aria-atomic="true" so the entire string is re-announced when it changes. -->
<div id="feedback-live-polite" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>

<!-- Assertive: failure + rollback announcements.
     SEPARATE node so the polite "marking…" text is not overwritten before it's read. -->
<div id="feedback-live-assertive" role="alert" aria-live="assertive" aria-atomic="true" class="sr-only"></div>
```

### Why two nodes

Screen readers queue polite announcements and interrupt with assertive ones. If both phases share a single node, the text "FB-03 marking as closed…" is replaced by "FB-03 close failed; reverted to addressed." before it has finished speaking — the user hears only the failure. Splitting them guarantees:

- The in-flight message always plays at least once
- The failure message interrupts to correct the record
- The two phases are semantically distinct (status vs. alert), which helps AT that differentiates (e.g. VoiceOver's "notification" chime on alerts)

## 3. Three-phase announcement template

For every transition `T` that takes feedback item `FB-XX` from state `S1` → `S2`:

| Phase | Trigger | Live region | Announcement template |
|---|---|---|---|
| 1 — in-flight | User clicks the action button | `#feedback-live-polite` | `"FB-{id} {verb-progressive} to {target state}…"` (ellipsis included) |
| 2a — success | API 2xx response | `#feedback-live-polite` | `"FB-{id} {verb-past} to {target state}."` |
| 2b — failure | API 4xx/5xx or network error | `#feedback-live-assertive` | `"FB-{id} {verb} failed; reverted to {previous state}."` |

The **polite** region is set to the in-flight text on click, and then **replaced** (not appended) with the success text. The **assertive** region is set to the failure text and never changes until the next failure.

### Template values per transition

| Transition | S1 → S2 | verb-progressive (phase 1) | verb-past (phase 2a) | verb (phase 2b) |
|---|---|---|---|---|
| Close | `addressed` → `closed` | `marking as closed` | `closed` | `close` |
| Verify & Close | `pending` → `closed` | `verifying and closing` | `verified and closed` | `verify and close` |
| Re-open | `closed` → `addressed` | `re-opening` | `re-opened` | `re-open` |
| Re-open (rejected → addressed) | `rejected` → `addressed` | `re-opening` | `re-opened` | `re-open` |
| Reject | `pending` → `rejected` | `rejecting` | `rejected` | `reject` |
| Address (agent or human marks as addressed) | `pending` → `addressed` | `marking as addressed` | `addressed` | `mark as addressed` |

### Worked examples

**Close (success path):**

- Phase 1: `#feedback-live-polite` ← `"FB-03 marking as closed…"`
- Phase 2a: `#feedback-live-polite` ← `"FB-03 closed."`

**Close (failure path):**

- Phase 1: `#feedback-live-polite` ← `"FB-03 marking as closed…"`
- Phase 2b: `#feedback-live-assertive` ← `"FB-03 close failed; reverted to addressed."`

**Re-open (success):**

- Phase 1: `#feedback-live-polite` ← `"FB-03 re-opening…"`
- Phase 2a: `#feedback-live-polite` ← `"FB-03 re-opened."`

**Reject (failure):**

- Phase 1: `#feedback-live-polite` ← `"FB-06 rejecting…"`
- Phase 2b: `#feedback-live-assertive` ← `"FB-06 reject failed; reverted to pending."`

## 4. In-flight card markup

Every card that is mid-transition **MUST**:

1. Have `aria-busy="true"` on the card root.
2. Contain a visible spinner (visual) AND an sr-only fallback so AT users know work is happening:
   ```html
   <span class="sr-only">Processing, please wait.</span>
   ```
3. Disable its action buttons (`disabled` attribute, not just visual styling).
4. When the transition resolves, `aria-busy` is removed and (on failure) the buttons are re-enabled.

See `feedback-card-states.html` — the "disabled / in-flight" variant card renders this pattern.

## 5. Per-transition contract (dev-stage implementation)

The dev-stage wiring lives in `useFeedback` (or equivalent hook) and **MUST**:

```ts
// Pseudocode — actual implementation lives in packages/haiku/review-app/src/hooks/useFeedback.ts
async function transitionFeedback(id: string, from: Status, to: Status, verb: TransitionVerb) {
  // Phase 1 — optimistic UI + polite announcement
  setOptimistic(id, to);
  announcePolite(`FB-${id} ${verb.progressive} to ${to}…`);
  setInFlight(id, true); // → aria-busy="true"

  try {
    await api.patchFeedback(id, { status: to });
    // Phase 2a — success
    announcePolite(`FB-${id} ${verb.past}.`);
  } catch (err) {
    // Phase 2b — failure + rollback
    setOptimistic(id, from);
    announceAssertive(`FB-${id} ${verb.root} failed; reverted to ${from}.`);
  } finally {
    setInFlight(id, false); // → aria-busy removed
  }
}
```

The `announcePolite()` / `announceAssertive()` helpers **MUST** set the live region's `textContent` (not `innerHTML`) and **MUST** briefly clear the region first (`""` for one tick) when the same string would otherwise be written twice — most AT only re-announce on content change, so identical strings are swallowed. Standard pattern:

```ts
function announcePolite(message: string) {
  const el = document.getElementById("feedback-live-polite");
  el.textContent = "";
  // requestAnimationFrame ensures the empty string is flushed before the new one
  requestAnimationFrame(() => { el.textContent = message; });
}
```

## 6. Toast coordination

Toast notifications (optional visual layer) **MUST NOT** also announce via a live region — the aria-live sequencing above is authoritative. If toasts are shown:

- Toast container has `aria-hidden="true"` so AT does not double-announce.
- Toast dismiss button has `aria-label="Dismiss notification"` and a visible focus ring (focus-ring-spec.html §1).

## 7. Verification (feedback-assessor + dev-stage gate)

- [ ] Every artifact with interactive feedback cards has both `#feedback-live-polite` and `#feedback-live-assertive` in the DOM
- [ ] Every in-flight card has `aria-busy="true"` AND an sr-only "Processing, please wait." fallback
- [ ] `useFeedback` (or equivalent) covers all six transitions in §3 with the exact template text
- [ ] Manual VoiceOver test: trigger a failure case; confirm the assertive "reverted" announcement plays and interrupts any prior in-flight message
- [ ] Manual VoiceOver test: trigger a rapid success case; confirm the polite "marking…" plays at least once before "closed."

## 8. unit-05 body-text amendment (NOT FSM fields)

unit-05's completion criteria section is amended to reference this spec:

> - [ ] aria-live sequencing implemented per `stages/design/artifacts/aria-live-sequencing-spec.md` — three-phase template (in-flight → success OR failure) wired for all six transitions (close, verify+close, re-open, re-open-from-rejected, reject, address); two separate live-region nodes (polite + assertive); in-flight cards have `aria-busy="true"` + sr-only "Processing, please wait." fallback.

This is a body-text amendment only — unit-05's FSM fields (status, hat, iterations, etc.) are **not** modified. The actual in-scope amendment copy is placed in unit-05 during the feedback-assessor / designer sweep of this unit.
