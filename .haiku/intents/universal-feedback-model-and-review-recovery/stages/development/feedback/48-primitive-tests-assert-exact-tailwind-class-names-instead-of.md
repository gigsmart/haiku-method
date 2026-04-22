---
title: Primitive tests assert exact Tailwind class names instead of behavior
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:24:13Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Severity:** Medium — tests couple to implementation detail (class-name strings), not to user-observable behavior.

**Files:**
- `packages/haiku-ui/src/components/primitives/__tests__/Button.test.tsx`
- `packages/haiku-ui/src/components/primitives/__tests__/Badge.test.tsx`
- `packages/haiku-ui/src/components/primitives/__tests__/Card.test.tsx`
- `packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx`
- `packages/haiku-ui/src/components/primitives/__tests__/Divider.test.tsx`

**Examples:**
- `Button.test.tsx:43-48` asserts `bg-green-300` + `text-green-800` + `cursor-not-allowed` for disabled primary button. If the team chose to express disabled state via a different token pair (e.g. `bg-green-200` / `text-green-900`) that still meets AA contrast, the test fails even though the accessibility + visual contract is intact.
- `Card.test.tsx:11-19, 20-27, 29-38` asserts exact padding (`p-0`, `p-3`, `p-6`, `p-8`), exact elevation classes (`shadow-sm`, `shadow-md`), exact surface (`bg-white`, `bg-stone-50/50`).
- `Badge.test.tsx:29-35` asserts `text-stone-600` and forbids `text-stone-500` by literal string match.
- `Divider.test.tsx:11-26` asserts `h-px`, `w-full`, `w-px`, `h-full`.

**Why this matters:**
- The mandate says "tests assert on behavior and outcomes, not implementation details." Tailwind class strings are the canonical "implementation detail" — they are the *how*, not the *what*. The *what* is "disabled buttons look disabled and have adequate contrast"; the *how* is which tokens happen to express it.
- A refactor to a design-token layer (e.g. moving from literal Tailwind to CSS custom properties defined per variant) would require rewriting every one of these tests even if the actual visual/a11y outcome was identical.
- Real behavioral assertions exist but are rare in this suite: `Button.test.tsx:40-41` checks `btn.disabled === true` + `aria-disabled === "true"` — those are behavior. The color-class assertions are not.

**Suggested fix:**
Replace the class-match assertions with either:
1. Computed-style checks against axe-core's color-contrast rule (already wired in `tests/a11y-pages.spec.tsx`, but color-contrast is disabled there with an admission that a dedicated contrast audit covers it — tie these primitive tests to that audit so the responsibility chain is explicit).
2. `data-variant` / `data-size` attribute checks on the rendered element (the primitive's public API contract), plus a separate compile-time snapshot of the exact class string if you want regression-proofing on the token mapping.

Mandate reference: "tests assert on behavior and outcomes, not implementation details".
