---
title: AnnotationCanvas arrow-key traversal test is a no-op
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:22:54Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** High — unit-13's named completion criterion ("Arrow-key traversal across a pin set (sorted by (y, x))") has no real assertion.

**File:** `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx:146-215`

**What the test claims to verify (per the file header comment):**
> "Arrow-key traversal across a pin set (sorted by (y, x))"

**What it actually does:**
1. Drops three pins via `pointerDown` + `commitCurrent("A"/"B"/"C")`.
2. Notes in an inline comment (line 207-211): *"After commits, all three pins are submitted and removed… which means we can't have 3 live draft pins… Instead, verify the sort invariant on the second phase below."*
3. There is no "second phase below." The test ends with `void container` (line 213) and returns.
4. **Zero ArrowRight/ArrowLeft keydown events are ever dispatched.** Zero focus-movement assertions exist. The sort-invariant claim is never checked.

**Why this matters:**
- The unit spec lists arrow-key traversal as a completion criterion. The test file advertises itself as covering it ("Every assertion points back to a specific line of `stages/development/units/unit-13-annotation-canvas.md`"). The criterion is not actually covered.
- The adjacent `annotation-perf.spec.tsx` claims the perf budget **for** ArrowRight traversal, but that file doesn't verify correctness of traversal — only timing. So there's no test anywhere that proves ArrowRight actually moves focus across pins in (y,x) sorted order without skipping or wrapping incorrectly.

**Suggested fix:**
Rewrite the test to either (a) use `vi.spyOn` on `onSubmit` to reject, keeping drafts alive, or (b) seed three pins via `localStorage.setItem(...)` (the same pattern used by the "reload survives" test at line 475 and the whole of `annotation-perf.spec.tsx`), then focus the first pin and dispatch ArrowRight/ArrowLeft with assertions on `document.activeElement` at each step.

Mandate reference: "test names describe the scenario and expected result" + "no tests that always pass (tautological assertions…)".
