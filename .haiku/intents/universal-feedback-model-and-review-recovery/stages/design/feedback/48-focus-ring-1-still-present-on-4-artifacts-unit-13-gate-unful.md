---
title: 'focus:ring-1 still present on 4 artifacts — unit-13 gate unfulfilled'
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:52:31Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-13 completion criteria line 213 (marked `[x]`) says: `grep -rEn 'focus:ring-1' stages/design/artifacts/` returns 0 matches on interactive elements. It does not — **7 occurrences across 4 files**.

- `annotation-popover-states.html:281` — title input, `focus:ring-1 focus:ring-teal-500`
- `annotation-popover-states.html:283` — body textarea, `focus:ring-1 focus:ring-teal-500`
- `annotation-gesture-spec.html:352` — annotation title input, `focus:ring-1 focus:ring-teal-500`
- `annotation-gesture-spec.html:355` — annotation body textarea, `focus:ring-1 focus:ring-teal-500`
- `comment-to-feedback-flow.html:214` — demo textarea, `focus:ring-1 focus:ring-teal-500`
- `comment-to-feedback-flow.html:450` — demo textarea, `focus:ring-1 focus:ring-teal-500`
- `feedback-inline-mobile.html:290` — mobile general-comment textarea, `focus:ring-1 focus:ring-teal-500`

unit-13 FB-37 gate (line 183) specifically names `annotation-popover-states.html:247/249` and `feedback-inline-mobile.html:251` as targets for the `focus:ring-1` removal. The annotation-popover-states.html file now has the ring-1 at lines 281/283 (it drifted during re-write) and feedback-inline-mobile has it at line 290. Two new files (`annotation-gesture-spec.html`, `comment-to-feedback-flow.html`) picked up the drifted token.

Consistency mandate violation: "interactive elements have consistent state coverage (default, hover, focus, active, disabled, error)" — specifically the FOCUS state. The canonical focus ring per `focus-ring-spec.html §2` and DESIGN-TOKENS.md §1.7 is `focus:ring-2 focus:ring-teal-500`. The 7 drifted elements ship a 1px ring that fails the spec's own 2px-minimum rule.

Fix: sweep these 7 occurrences to `focus:ring-2 focus:ring-teal-500` (or `focus-visible:ring-2` per the canonical rule in unit-13 gate line 86-87).

Gate command to prove fix: `grep -rEn 'focus:ring-1' stages/design/artifacts/` must equal 0.
