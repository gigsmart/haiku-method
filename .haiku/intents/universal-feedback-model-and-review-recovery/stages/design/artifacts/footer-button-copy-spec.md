# Footer Button Copy Spec — Canonical Vocabulary

**Unit:** `unit-14-component-naming-and-copy`
**Closes:** FB-34 (footer button copy drift — "Close" vs "Verify & Close" vs "Dismiss" vs "Reject")

This file is the **single source of truth** for every footer-button label in the feedback UI. Every wireframe, component spec, unit body, and live implementation MUST match this vocabulary exactly.

If this file disagrees with any other document, **this file wins** and the other document is wrong.

---

## Canonical Verbs

| Status → Transition | Button Label | Hyphenation | Notes |
|---|---|---|---|
| `pending → rejected` | **Dismiss** | — | Single verb regardless of `author_type`. Replaces drift between "Close" (DESIGN-BRIEF §2/§3), "Reject" (DESIGN-BRIEF §3 + unit-05), and "Dismiss" (feedback-card-states.html). |
| `addressed → closed` | **Verify & Close** | ampersand with surrounding spaces (`Verify & Close`) | Primary action on addressed items. |
| `addressed → pending` | **Reopen** | one word, no hyphen — never the hyphenated form | Secondary action on addressed items. |
| `closed → pending` | **Reopen** | one word | Same verb as the addressed → pending transition. |
| `rejected → pending` | **Reopen** | one word | Same verb as the other terminal → pending transitions. |

**Rule of thumb:** one verb per transition destination. The UI never exposes two verbs for the same destination based on author identity — H·AI·K·U has no concept of user identity.

---

## Status × Origin Matrix

`author_type` can be `"human"` or `"agent"`. The canonical rule is: **button copy does NOT split by `author_type`.** Every cell below shows the same verb for both origins.

| Current status | author_type = `human` | author_type = `agent` |
|---|---|---|
| `pending` | **Dismiss** | **Dismiss** |
| `addressed` | **Verify & Close** + **Reopen** | **Verify & Close** + **Reopen** |
| `closed` | **Reopen** | **Reopen** |
| `rejected` | **Reopen** | **Reopen** |

### Why no split by origin?

Three reasons:

1. **No user identity.** The review UI is local; there is no "me" vs "them". An agent-authored item the reviewer wants to discard and a human-authored item the reviewer wants to discard are the same action from the reviewer's perspective.
2. **Single-verb UX is simpler.** Users don't have to remember two rules ("Close the one I wrote, Reject the one the agent wrote"). The button says what the destination is (dismissed, closed, pending) regardless of origin.
3. **The status badge already tells the origin story.** An `adversarial-review` badge next to the item tells the reviewer who authored it. Duplicating that into the verb is redundant.

The lifecycle-level **mechanism** (what the tool-layer guard actually does) can still vary by origin — e.g. an agent-owned `pending → addressed` transition happens only when a fix lands, never from a UI click. But those transitions never have user-facing buttons. The UI only exposes user-initiable transitions.

---

## Button Style per Verb

| Verb | Visual role | Tailwind |
|---|---|---|
| **Dismiss** | Secondary (muted) | `border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900` |
| **Verify & Close** | Primary (positive) | `bg-green-600 hover:bg-green-700 text-white` |
| **Reopen** | Secondary (muted) | Same as Dismiss |

Both secondary verbs share the same style. Their meaning is inferred from the surrounding card status, not from color.

---

## Disabled / Focus / Active States

Every button above inherits the standard focus ring (`ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-900`) and the standard disabled style (`opacity-50 cursor-not-allowed`). No verb-specific deviations.

---

## Screen-Reader Announcements (canonical phrasing)

When a status change succeeds, the sidebar's `role="status" aria-live="polite"` region announces one of:

| Button clicked | Announcement |
|---|---|
| **Dismiss** | `"Feedback <ID> marked as rejected"` |
| **Verify & Close** | `"Feedback <ID> marked as closed"` |
| **Reopen** | `"Feedback <ID> reopened"` |

Error toasts (when the tool-layer guard rejects the transition) use the templated copy from unit-05's optimistic-UI spec.

---

## Banned Variants (must not appear anywhere in the stage outputs)

- "Close" (as a standalone verb on a pending item — ambiguous with "Verify & Close")
- "Reject" (replaced by "Dismiss")
- Any hyphenated spelling of the reopen verb (e.g. `Re<hyphen>open`) — canonical form is one word.
- Any space-separated spelling of the reopen verb (e.g. `Re open` with a space) — same rule.
- "Dismiss & Close" or any other compound — use only the verbs in the table above.

If a reviewer finds any of these in a unit body, a wireframe, or a live component, the fix is to replace with the canonical label from this spec.

---

## Cross-References

- DESIGN-BRIEF §2 `FeedbackItem` expanded-state spec — uses canonical verbs.
- DESIGN-BRIEF §3 Feedback Status Transitions table — uses canonical verbs.
- `feedback-card-states.html` §1 Footer Button Inventory — uses canonical verbs.
- `feedback-lifecycle-transitions.html` — transition annotations use canonical verbs.
- `review-ui-mockup.html` — inline status-change buttons use canonical verbs.
- Unit-05 body text (`## Quality Gates` section) — uses canonical verbs, references this spec.
- Unit-13 ARIA spec — announcement phrasing uses canonical verbs.
