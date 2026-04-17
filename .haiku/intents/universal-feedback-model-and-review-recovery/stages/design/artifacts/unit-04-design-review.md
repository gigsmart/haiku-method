---
title: Design review — unit-04 annotation creation UX
unit: unit-04-annotation-creation-ux
reviewer: design-reviewer
status: changes-requested
created_at: '2026-04-17T17:00:00Z'
artifacts_reviewed:
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/annotation-popover-states.html
closes: FB-01
---

# Design review — unit-04 annotation creation UX

Scope of review: verify the two design artifacts satisfy the unit's six
quality gates, are consistent with the intent's design tokens
(`knowledge/DESIGN-TOKENS.md`), align with adjacent units (unit-07
keyboard map, feedback data contracts), and cover every interactive
state + responsive breakpoint + accessibility requirement.

Verdict: **changes requested**. The artifacts are substantive and
well-structured, but four gaps must be closed before the designer hat
can advance. Nothing here requires a full redo.

---

## 1. Quality-gate coverage

| Gate | Status | Notes |
|---|---|---|
| Gesture + cursor + popover UX per artifact kind (image, svg, md/text, html iframe, pdf) | PASS | Gesture matrix in `annotation-gesture-spec.html §2` enumerates all five kinds with cursor + gesture + captured location. |
| Coordinate schema documented (`{x,y}` 0-1 · `{line}` 1-indexed · `{page,region}`) | PASS | Storage contract in `annotation-gesture-spec.html §9` documents all three shapes plus server-side invariants. |
| Wireframes light + dark · open · filled · iframe fallback · small viewport | PASS | `annotation-popover-states.html` states 1–6 cover open/empty, open/filled, iframe two-step, error, small-viewport bottom sheet, forced-dark parity. |
| Keyboard equivalent (ties to unit-07) | **FAIL** | Key collision with unit-07 — see §3. |
| Accessibility: focus trap, focus return, `aria-label`, ESC cancel, 44px touch targets | PARTIAL | Contract documented but one ARIA gap + one missing cancel path — see §4. |
| Storage contract on `feedback.target.annotation` | **FAIL** | Shape mismatch with the existing data contract — see §2. |

---

## 2. Storage-contract consistency (blocker)

The gesture spec's §9 JSON comment describes the `{page, region}` shape
as *"(c) region — html, pdf"* and shows `page` as *"optional, PDF only"*.
That collapses two distinct cases:

- HTML iframe: `{ region }` only, no page concept.
- PDF iframe: `{ page, region }` where `region` is the descriptor within
  the page.

The spec as written implies HTML may carry a `page`, and the server
invariant list in the amber callout allows three shapes:
`{x,y}` | `{line}` | `{page,region}` | `{region}`.  That is **four**,
not three, and the fourth shape is ambiguous with the third when
`page` is omitted.

**Required fix.** Collapse to three canonical discriminants and make
`region` always required in the iframe fallback:

| Artifact kind | Annotation shape | Notes |
|---|---|---|
| image, svg | `{ x, y }` | both ∈ [0, 1], server clamps |
| markdown, text | `{ line }` | integer ≥ 1 |
| html, pdf | `{ page?, region }` | `region` required; `page` required when MIME is `application/pdf`, forbidden otherwise |

Also cross-check with `knowledge/DATA-CONTRACTS.md` §3.3 — the feedback
frontmatter has no annotation field documented there today. When unit-04
advances, the data contract needs an update adding
`target.annotation` with the three-shape union. Flag this as a
follow-up for the designer to note in the unit's `depends_on` or as a
new line in `knowledge/DATA-CONTRACTS.md §3.3` — don't ship the design
while the persistence contract still reads "no annotation field".

## 3. Keyboard equivalent (blocker — collision)

The gesture spec's §7 binds `A` to:

- Line-row focus → open popover at line
- Artifact-wrapper focus → open popover centered on artifact
- Iframe-wrapper focus → focus the location form's region input

But unit-07's `keyboard-shortcut-map.html:171` binds `a` (same keystroke,
since browsers deliver letter keys as lowercase unless Shift is held
and we don't distinguish) to **Approve**. The conflict is real: if a
reviewer has focused a line row in an artifact and presses `a`, which
fires? Approve-confirm or popover-open?

Unit-07's input-capture rule does not help — the artifact surface is
not an `<input>` / `<textarea>` / `contenteditable`, so unit-07 would
treat the keypress as global-scope Approve.

**Required fix.** Pick one of:

1. Change the annotation-open key to something un-claimed. `c` (create),
   `+`, or `Shift+A` all read cleanly and don't collide. `c` is the
   cleanest single-key choice — it's mnemonic for *create* and is free
   across unit-07's table.
2. Keep `a` but scope it by focus target: if the currently-focused
   element is inside an artifact wrapper (spatial) or is a `.line-row`
   (text), route `a` → open-popover; otherwise `a` → Approve. Document
   the precedence inside both unit-04 and unit-07 so dev doesn't have
   to reverse-engineer it.

Either choice is acceptable. Recommend option 1 (swap to `c`) — it
keeps the Approve shortcut intact, doesn't add focus-dispatch branching
to the shortcut handler, and leaves `a` as the top-level decision key
the reviewer has built muscle memory around.

If option 2 is chosen, the `r` shortcut in unit-07 is already
context-dependent (reopen vs request-changes); another context-split
key compounds the cognitive load. Prefer option 1.

## 4. Accessibility contract gaps

The contract in `annotation-gesture-spec.html §8` is mostly complete,
but two items need attention:

**4.1 `aria-labelledby` inconsistency.** State 1 in
`annotation-popover-states.html:151` correctly sets
`aria-labelledby="p1-label"` pointing at the location-label paragraph.
States 2, 3, 4, 5, 6 all set `role="dialog" aria-modal="true"` but omit
`aria-labelledby`. The §8 accessibility contract explicitly says
*"popover is `role="dialog"` `aria-modal="true"` `aria-labelledby="ann-popover-label"`"*.
The mockup must match its own contract. Either:

- add `aria-labelledby` (stable id like `ann-popover-label-{uuid}`) to
  every popover instance in states 2–6, or
- document in the contract that the location label is implicit via
  `aria-describedby` and switch states 1–6 to use that.

Preferred: keep `aria-labelledby` pointing at the location-label
paragraph; that's the most informative accessible name
(*"New feedback @ L3"* is better than a blank label).

**4.2 Click-outside-to-cancel missing from contract.** §8 enumerates
save, cancel, ESC, and focus-return, but never says what happens on a
click outside the popover. State 5 (bottom sheet) documents drag-to-
dismiss; the other states don't say. The current behavior is undefined
and dev will guess. Add an explicit rule:

> Click-outside the popover on desktop is treated as Cancel — same
> semantics as ESC. Mobile bottom sheet uses drag-handle swipe-down;
> tapping the dimmed backdrop also cancels.

This matches the existing Modal overlay pattern in the review app.

## 5. State coverage — nits, not blockers

These are not gates; they are design-system hygiene items worth
addressing before advancing.

- **Empty-body Create button.** State 1 shows Create disabled while
  both fields are empty. §8 lists the rule: enabled "as soon as either
  field has trimmed content". Double-check the server invariant — does
  `haiku_feedback` accept an empty `body` if `title` is non-empty? The
  existing data contract (§3.5) says body is "non-empty markdown". If
  body is required, the Create button must be disabled until *body* is
  non-empty, not just either field. Align the popover's gating with the
  server's validation or risk a 400 on save.
- **Loading state during save.** State 4 shows the error variant but
  there is no "saving" state between click and response. For a
  transactional single-write, add a subtle state — Create button shows
  a 16px spinner + "Saving…" — so the user doesn't double-click. Small
  nit; could be deferred to the development stage if called out in the
  handoff.
- **Popover width on tablet.** State 1–6 fix width at 288px. On
  narrow-desktop / wide-tablet (≈ 640–900px) the popover sitting on
  the right of a spatial anchor can push beyond the artifact wrapper
  and clip against the feedback sidebar. The spec mentions "flip when
  clipping" (State 1's third nit card) — extend that rule to say *flip
  or dock*: if neither left nor right placement fits, dock the popover
  to a fixed position above/below the artifact. Otherwise we end up
  with mid-viewport clipping that State 1's 8px safety margin can't
  solve.

## 6. Token provenance — PASS with one annotation

`annotation-popover-states.html §"Token provenance"` correctly traces
every value back to `knowledge/DESIGN-TOKENS.md`. No raw hex values
except two places in CSS (`.popover { border: 1px solid rgb(94, 234, 212); }`
and `.anchor-line { border-top: 1px dashed rgb(94, 234, 212); }`). Both
are `teal-300` in RGB form — technically tokenized, but the dev
implementation should use the Tailwind class, not the raw `rgb()`. Note
this in the handoff to the development stage: the CSS in the mockup is
demonstration-only; production uses the Tailwind classes enumerated in
the token checklist.

## 7. Handoff checklist for the designer

Before advancing this unit past the design-reviewer hat, the designer
must:

- [ ] **Fix storage contract**: collapse to three shapes, make `region`
  required in the iframe fallback, and open a follow-up on
  `knowledge/DATA-CONTRACTS.md §3.3` to add the `target.annotation`
  field.
- [ ] **Fix keyboard collision**: change the annotation-open shortcut
  from `A` to `c` (or another unclaimed key) across both the gesture
  matrix in §2 and the keyboard table in §7. Update unit-07's map to
  include the new key so both documents tell the same story.
- [ ] **Fix ARIA contract**: either add `aria-labelledby` to every
  popover instance in states 2–6 or update §8 to document what is
  actually used.
- [ ] **Add click-outside rule** to §8 of the gesture spec.
- [ ] **Align Create-button gating** with the server's body-required
  invariant.

Optional nits (not blocking):

- Add a "saving" state between State 2 (filled) and State 4 (error).
- Document popover edge-clipping flip-or-dock for narrow-desktop
  widths.

---

## Overall assessment

The artifacts cover a lot of ground and the visual work is consistent
with `review-ui-mockup.html` and the feedback-card token family. The
two blockers (storage-contract ambiguity, `a` keystroke collision)
are cheap to fix — neither requires rework of the wireframes, just
textual edits to §7, §9, §8, and a single keyboard-map row. The
accessibility contract just needs to be internally consistent.

Once the handoff checklist is complete, the unit is ready to advance.

Marking this review as **changes-requested**. Reject the design hat
and send the unit back for one more bolt with the checklist above as
the delta.
