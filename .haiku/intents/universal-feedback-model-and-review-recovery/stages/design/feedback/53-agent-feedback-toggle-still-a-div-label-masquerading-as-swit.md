---
title: >-
  Agent-feedback toggle still a div-label masquerading as switch — no
  role=switch, no 44px target (FB-32 regression)
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:53:27Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 4.1.2 (A):** toggle must expose role/state/value. **WCAG 2.5.5 (AAA) / 2.5.8 (AA):** touch targets ≥ 44×44 on mobile / ≥ 24×24 on desktop. Unit-13's gate required replacing the `<label>` + styled `<span>` in `comments-list-with-agent-toggle.html:65-76` with `<button role="switch" aria-checked …>` (or checkbox+peer-checked pattern), native keyboard (Space/Enter) toggle, `focus-visible:ring-2 focus-visible:ring-teal-500`, and a 44px touch hit area.

**Reality on HEAD (`.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comments-list-with-agent-toggle.html`):**
- Lines 67–79 (Section 2 light/OFF): `<label class="flex items-center gap-2 cursor-pointer group"> … <span class="relative inline-block w-8 h-4"> …` — this is a `<label>` wrapping decorative `<span>`s with no underlying `<input>`, no `role="switch"`, no `aria-checked`, no `tabindex`. It is not focusable and not keyboard-operable. Visual track is `w-8 h-4` = 32×16 — nowhere near 44×44.
- Lines 174+ (Section 3 light/ON): same pattern, again no a11y markup.
- Lines 235+, 298+ (Sections 4–5, dark variants): same unstyled `<label>` pattern repeated.
- The only acknowledgement of `role="switch"` in the file is line 372, a `<li>` in the prose *describing* what the "dev stage MUST" do — not an actual implementation.

**Impact:** Screen-reader users cannot discover or toggle "Show agent feedback." Keyboard users cannot focus or activate it at all. On mobile this is a dead zone — the 16px-tall track is under the 24px finger pad.

**Fix:** Replace the label+span pattern with `<button role="switch" aria-checked="false" aria-label="Show agent feedback" class="relative w-11 h-6 …">` (a 44×24 hit area, visually the same 32×16 track via an inner span). Native `<button>` handles Enter+Space. Add `focus-visible:ring-2 focus-visible:ring-teal-500`. Apply in *both* Section 2 (OFF) and Section 3 (ON) renderings plus dark-mode variants. The `agent-feedback-toggle-spec.html` artifact should also be pulled into HEAD (currently only exists in the unit-13 worktree).
