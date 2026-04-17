---
title: Revisit confirmation modal
type: design
closes: [FB-03]
depends_on: []
inputs:
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/03-revisit-preview-with-confirmation-modal.md
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-ui-mockup.html
outputs:
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/revisit-modal-states.html
---

# Revisit confirmation modal

## Goal

`haiku_revisit` is destructive — it rewrites stage state, re-queues units, and pushes to the main intent branch. The UI must show a preview modal before the tool call fires so the reviewer knows exactly what will happen. Approve stays confirmation-free (reversible by the next gate); Request Changes always opens the modal.

## Quality Gates

- Modal information architecture covers, in order:
  1. **Target stage** with its justification label (e.g. `earliest unaddressed` or `currently viewed — no earlier unaddressed`).
  2. **Downstream stages that will re-run** — listed as chips with stage labels only (no per-unit breakdown here; that's the review UI's job).
  3. **New feedback being added** (if the reviewer typed in the feedback textarea) — shown as a preview card tagged with its target stage and `pending` status.
  4. **Open feedback in scope** — all currently-pending feedback items grouped by stage, titles only (not bodies), using the same summary shape as the additive-elaborate action.
  5. **Footer actions:** [Cancel] (secondary) + [Confirm & Revisit] (primary, amber/warn).
- Wireframes cover three variants:
  - Gate-invoked (FSM paused at gate): primary path.
  - User-opened (no active gate): same modal, with a note that "nothing is structurally open" and the earliest-unaddressed stage still determines target.
  - With typed feedback in the textarea: shows the preview card from step 3.
- Light + dark + mobile-narrow variants wireframed.
- Dismiss paths explicit: ESC, backdrop click, [Cancel] — all non-destructive, all return focus to the element that triggered the modal.
- Focus trap + return-focus behavior specified.
- Confirm-button copy names the side effects concretely — e.g. *"Confirm & Revisit to **Product** · resets 3 downstream stages"* — so the reviewer never clicks confirm blind.
- Approve action remains single-click (no modal). Document this contrast explicitly: approve is reversible by next review; revisit is not.

## Completion Signal

The reviewer can predict exactly what the Confirm & Revisit button will do before pressing it, and understands which stages will be reset.
