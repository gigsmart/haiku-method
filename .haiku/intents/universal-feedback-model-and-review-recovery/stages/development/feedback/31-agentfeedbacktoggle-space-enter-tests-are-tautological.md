---
title: AgentFeedbackToggle Space/Enter tests are tautological
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:23:18Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** Medium — two "keyboard activation" tests don't assert keyboard activation.

**File:** `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx:120-150`

Tests named "dispatches native key events without crashing (Space)" and "… (Enter)" are the "keyboard activation" coverage for a `role=switch` component. Their only assertion is:

```ts
fireEvent.keyDown(btn, { key: " ", code: "Space" })
fireEvent.keyUp(btn, { key: " ", code: "Space" })
expect(btn).toBeTruthy()
```

`expect(btn).toBeTruthy()` is satisfied by the `getByRole("switch")` result from line 111 — before the keydown was ever dispatched. These tests pass even if Space/Enter are wired to throw-on-keypress, or the component removes the native button entirely; they only verify the `screen.getByRole` query still returns a node.

**Why this matters:**
- Space + Enter are the WAI-ARIA required keyboard activation mechanism for `role=switch`. Unit-09 names it as a completion criterion.
- The inline comment acknowledges the limitation: *"jsdom does not synthesize click from keydown, so the click path above is the authoritative activation test. This assertion just verifies the component tolerates raw key events without throwing."* But `expect(btn).toBeTruthy()` doesn't even verify "doesn't throw" — any uncaught throw would have bubbled before the assertion, and the outer test framework wraps the body in a try/catch for the failure report. The assertion is cosmetic.

**Suggested fix:**
Either:
1. Delete these cosmetic tests (the click test above already covers the activation path that jsdom can observe).
2. Use `@testing-library/user-event` `user.keyboard("{Space}")` / `user.keyboard("{Enter}")` which synthesize the full keydown→keypress→click sequence on focused buttons, and assert `aria-checked` flipped — matching the actual browser behavior.

Mandate reference: "no tests that always pass (tautological assertions)".
