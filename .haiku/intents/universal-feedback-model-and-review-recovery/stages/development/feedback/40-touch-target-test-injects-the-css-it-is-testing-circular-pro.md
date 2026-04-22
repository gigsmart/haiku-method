---
title: touch-target test injects the CSS it is testing (circular proof)
status: closed
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:23:42Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-40:bolt-2'
bolt: 2
upstream_stage: null
---

**Severity:** Medium — test proves jsdom's CSS engine works, not that the component uses the real token.

**File:** `packages/haiku-ui/src/a11y/__tests__/touch-target.test.tsx:20-35, 42-57`

```ts
beforeAll(() => {
  const style = document.createElement("style")
  style.textContent = `
    .touch-target {
      position: relative;
      min-height: 44px;
      min-width: 44px;
    }
    ...
  `
  document.head.appendChild(style)
})

// later…
const style = getComputedStyle(el)
expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
```

The test hand-writes `.touch-target { min-height: 44px; min-width: 44px; }` into the document, then asserts that `getComputedStyle` returns 44px for an element wearing that class. **That only tests jsdom's CSS resolver** — if the actual `index.css` rule was deleted or set to `min-height: 1px`, this test would still pass.

The inline comment admits this: *"The CSS under test is authored in `packages/haiku-ui/src/index.css` and mirrored here; any change to the canonical rule must land in both places and this test will fail first."* — but the reverse is not true: a change to `index.css` that diverges from the mirror is not caught here, because the mirror is what the test uses.

**Why this matters:**
- Touch-target minimum size is a WCAG 2.5.5 conformance line. The whole point of the test is to catch regressions in the canonical CSS.
- `agent-feedback-toggle` and `annotation-canvas` both reference `touchTargetClass` in their own tests and they inject the same hand-mirror pattern (see `AgentFeedbackToggle.test.tsx:48-56`). The regression surface is invisible across every test file that depends on it.

**Suggested fix:**
Either:
1. Load the real `src/index.css` into the test environment (Vitest + postcss or the `css: true` option in jsdom config), so `.touch-target` resolves from the actual source file.
2. Swap to a pure token-value assertion: read the `touch-target` rule text from `index.css` via `readFileSync`, parse it, and assert `min-height: 44px` appears — eliminates the circularity.
3. Gate the tests on computed styles in a real browser harness (e.g. Playwright — currently banned on this repo; this doesn't rule out a Vitest browser-mode runner).

Mandate reference: "tests assert on behavior and outcomes, not implementation details" and "no tests that always pass (tautological assertions, mocked everything)".
