---
title: >-
  Touch-target audit fails reality: desktop-only buttons shipped on mobile
  viewport still &lt; 44px
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:56:14Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 2.2 SC 2.5.8 Target Size (Minimum, AA)** and **2.5.5 (AAA)** — touch-activated controls need ≥ 44×44 on mobile. `touch-target-audit.md` claims every surface passes, with a few marked `desktop-ok` on the argument that on mobile they "inherit `.touch-target` or equivalent `py-2.5` padding."

**Reality on HEAD:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:15` — CSS rule `.state-disabled button { opacity: 0.5; cursor: not-allowed; }` and line 34 header: "on desktop the card footer buttons drop to 28px." But `feedback-card-states.html` is viewed as-is on any screen — there's no responsive breakpoint switching these to 44px. A mobile reviewer loading `feedback-card-states.html` gets 28px buttons.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/revisit-modal-states.html` rollback toast — touch-target-audit.md row marks it "mobile-bump-required" with the notes "auto×24 … 24 desktop / 44 mobile via responsive padding." But the rendered artifact doesn't apply responsive padding classes: the Retry/Open repair/✕ buttons are static 24px. Any user on a narrow viewport gets sub-44px targets. Self-called-out as a gap but never closed.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/stage-progress-strip.html` — audit concedes "exception ok" for mobile stage nodes because "stage progress is not a primary tap surface" and cites WCAG 2.5.8 inline-text-target exception. This misapplies the exception — stage nodes are **buttons**, not inline text; the exception is for links *inside* a sentence of prose. A standalone clickable 20×20 button does not qualify.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html` close ✕ — audit row marks `desktop-ok`, 20×20 with `auto` hit area. The popover can render on mobile (state 5 is explicitly "mobile bottom-sheet"); in that state the ✕ is supposed to be 44×44, but the audit doesn't confirm a responsive rule and there's no `.touch-target` class on the ✕ in the mobile render path.

**Fix:** 
- Drop the "desktop-only" shortcut — every button that can render on mobile needs an unconditional 44×44 hit area via `.touch-target` or a `::before` pseudo-element.
- For `stage-progress-strip.html` mobile, expand the node hit area (wrap in a larger container with `padding: 12px`) rather than citing the inline-text exception.
- Close the `revisit-modal-states.html` rollback toast gap explicitly — add `md:px-3 px-5 md:py-1 py-3` to each toast button (or declare `.touch-target` and ship it).
- Update `touch-target-audit.md` to stop marking live-reachable mobile surfaces as `desktop-ok`.
