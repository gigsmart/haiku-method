---
title: Closed/rejected opacity reduction drops text contrast below AA
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:11Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-11-contrast-and-type-scale
---

The `closed` state applies `opacity-70` to the entire feedback card (DESIGN-BRIEF.md §2 `FeedbackItem`, `artifacts/feedback-inline-desktop.html:270`). The `rejected` state applies `opacity-50` + strikethrough (same brief, line 228; `artifacts/feedback-inline-desktop.html:286`).

Opacity stacks with the underlying color. The title text on a closed card is already `text-gray-700 dark:text-gray-300` (roughly 10:1) — at 70% opacity the effective contrast drops to roughly 5.6:1, still passing. BUT the metadata sub-line is `text-gray-400` (already 2.9:1) — at 70% it falls to ~2.0:1, a clear AA failure, and the rejected variant at 50% opacity hits ~1.4:1, unreadable for low-vision users.

Additionally, opacity as the only "state" signal means users with cognitive impairments or screen-dimmed monitors cannot distinguish closed from addressed reliably. The status badge + left-border colors do the real semantic work; opacity is purely decorative and actively harms accessibility.

Also: strikethrough is a known accessibility anti-pattern when paired with opacity-50 — the strikethrough itself at 50% opacity is nearly invisible.

**Fix:**
- Drop `opacity-70` on `closed` entirely. Rely on the green left-border, muted background (`bg-green-50/30`), and the `closed` status badge for state signaling.
- Drop `opacity-50` on `rejected`. Keep strikethrough, but on a full-opacity `stone-500` title color with `line-through decoration-stone-500` so both color and decoration stay legible.
- Add a visible "Closed" or "Rejected" text label in the metadata line so the state is conveyed by text, not just color/position.
