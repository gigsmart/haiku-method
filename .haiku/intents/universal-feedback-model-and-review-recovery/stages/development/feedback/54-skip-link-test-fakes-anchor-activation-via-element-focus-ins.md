---
title: >-
  Skip-link test fakes anchor activation via element.focus() instead of user
  behavior
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:24:34Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** Medium — the one test that is supposed to catch FB-30 regression never exercises the real activation path.

**File:** `packages/haiku-ui/tests/skip-link.spec.tsx:86-94`

```ts
// Activating the skip link should move focus to <main id="main-content">...
// We simulate anchor activation by directly invoking focus() on
// the target — `user.click` on an anchor in jsdom does not execute the
// default hash-navigation side effect that moves focus.
const main = container.querySelector("#main-content") as HTMLElement | null
expect(main).not.toBeNull()
main?.focus()
expect(document.activeElement).toBe(main)
```

The test calls `main?.focus()` — which proves `<main tabindex="-1">` accepts programmatic focus. **It does not prove the skip link itself works.** If `<a href="#main-content">` is replaced with a `<div>` that has no href, the test still passes: the anchor-activation assertion would never reach the broken link because we never activate it.

The skip-link is specifically required to land focus on `<main>` when the user clicks/activates it. This test proves neither:
- That clicking the link navigates to `#main-content`,
- Nor that the browser moves focus to the target after hash navigation.

**Why this matters:**
- The comment frames this as an unavoidable jsdom limitation, but there IS a faithful jsdom test: dispatch a `click` event on the anchor, then dispatch a `hashchange` (jsdom fires `hashchange` on `location.hash` assignment) and assert focus landed on the target. If the component's hashchange handler is what moves focus, the test should exercise that handler.
- Alternatively, use `user.click(link)` then check that `window.location.hash === "#main-content"` — the navigation half — and add a separate unit test for the focus-mover hook if one exists.

**Suggested fix:**
1. Expand the test to dispatch `click` on the skip link and assert both hash change AND focus movement.
2. If jsdom truly cannot simulate the anchor-to-hash-to-focus chain, then this test should be moved to a Playwright or Vitest browser-mode runner. The current formulation is strictly weaker than claimed in its header comment ("regression guard for the missing-skip-link class of issue").

Mandate reference: "tests assert on behavior and outcomes, not implementation details" — faking activation with `.focus()` is the implementation-detail path.
