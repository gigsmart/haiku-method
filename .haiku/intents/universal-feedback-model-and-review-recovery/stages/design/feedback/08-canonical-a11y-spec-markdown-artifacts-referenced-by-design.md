---
title: >-
  Canonical a11y spec markdown artifacts referenced by DESIGN-BRIEF are missing
  from stages/design/artifacts/
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:19:52Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-08:bolt-1'
bolt: 1
upstream_stage: null
---

**Impact: WCAG implementation contract unresolvable — development cannot build to the claimed a11y baseline.**

DESIGN-BRIEF §6 (Accessibility) and §2 (Component Inventory) repeatedly cite specific markdown artifacts as "canonical single source of truth":

- "See `artifacts/aria-landmark-spec.md §7`" (brief line 806)
- "See `artifacts/aria-landmark-spec.md §1-2`" (line 807)
- "every modal declares `role=dialog aria-modal aria-labelledby` ... see §3" (line 808)
- "See `aria-live-sequencing-spec.md §3.1` for the card's full live-region sequence" (line 809)
- "Coalescing rules in `aria-live-sequencing-spec.md §2.2`" (line 809)
- "open / close lifecycle is documented in `aria-landmark-spec.md §5`" (line 810)
- "See `artifacts/aria-live-sequencing-spec.md`" (line 822)
- "`artifacts/aria-landmark-spec.md §6`" (line 208)
- "`state-coverage-grid.md` §7" (line 119)
- "`artifacts/contrast-and-type-audit.md`" (line 768)
- "`footer-button-copy-spec.md`" (line 265, 646, 656)
- "`component-inventory.md` in `stages/design/artifacts/`" (line 907)
- "`touch-target-audit.md §2-3`" (line 692)
- "`motion-and-reduced-motion-spec.md §Cross-file policy`" (referenced in feedback-inline-mobile.html line 84-94)

Actual contents of `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/` — zero markdown files. Every `.md` file referenced above is absent from the canonical path the brief sends readers to.

**Accessibility consequence:** A developer following DESIGN-BRIEF §6 to wire the dialog/inert contract, the live-region sequencing, the landmark spec, or the touch-target audit has no resolvable reference. They will either invent their own contract (drift) or skip the contract (a11y regressions). Every inlined HTML demo only shows *a* wiring, not the canonical one; the brief's claim that these `.md` files are the "single source of truth" is false because the files don't exist at the cited path.

**Remediation:** Port the canonical markdown specs from the intent's working units (they exist in `.haiku/worktrees/universal-feedback-model-and-review-recovery/unit-*/...` for aria-landmark-spec, aria-live-sequencing-spec, contrast-and-type-audit, touch-target-audit, etc.) into `stages/design/artifacts/` so the brief's pointers resolve. Or, if the plan is to keep them at knowledge level, update every brief citation to point at the knowledge path.
