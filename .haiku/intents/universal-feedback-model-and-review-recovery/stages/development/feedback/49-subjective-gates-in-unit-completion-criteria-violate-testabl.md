---
title: >-
  Subjective gates in unit completion criteria violate "testable, no subjective
  judgment" mandate
status: fixing
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:24:15Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

## Gap

Several current-visit units include completion criteria that are not mechanically testable:

1. **unit-03 `extract-haiku-ui-package.md:162`**: "Bundle comparison script exits 0." Combined with the `bundle-baseline.html` captured at unit start (line 139) and the strip-timestamps regex. Reviewers logged FB-04/05/06 against this showing the DOM-parity test devolved into a zod schema check and the comparison script "intentionally fails". The criterion is executable but the implementation of that check is reviewer-graded, not determinate; hence bolt-1 review was rejected subjectively. The criterion should either be strictly byte-identical-after-strip (rejected as un-meetable) or be stated as "no new DOM roles + 0 props removed vs baseline snapshot" with an enumerated deterministic differ. Currently the spec is ambiguous on what counts as "parity".

2. **unit-06 `shell-and-routing.md:123`**: "Existing URL paths render without regression (verified by the unit-03 DOM parity Playwright test, now re-run with the new shell)." But unit-03's parity test was rewritten (per FB-04) away from Playwright to an RTL snapshot in the same stage. unit-06's criterion references a test that no longer exists as specified.

3. **unit-07 `review-page-desktop-and-mobile.md:84-92`**: "Responsive-parity test" via RTL fixture, asserts text content arrays are element-wise equal. This is testable. But "Visual regression — RTL-only." in the same section is a broad assertion whose exact coverage boundary is never enumerated — it is defined by what the fixture happens to render, not by a spec of required UI invariants.

4. **unit-13 `annotation-canvas.md:88-91`**: "Perf Playwright test at `packages/haiku-ui/tests/annotation-perf.spec.ts` asserts first paint ≤ 100ms; each keypress-to-paint ≤ 16ms." Unit-07 simultaneously deleted Playwright (lines 83, 93, 110). Whether unit-13's Playwright perf test even runs in this stage is ambiguous — the perf budget gate may be theoretical rather than executed. The criterion needs to either reinstate Playwright scoped to perf tests only or replace with a non-Playwright measurement.

## Required remedy

For each of the four cases, replace the ambiguous criterion with a deterministic executable gate and a single command that returns exit 0 on pass. Cross-reference and reconcile the Playwright-removed (unit-07) vs Playwright-required (unit-13) conflict with an explicit rule at stage level.
