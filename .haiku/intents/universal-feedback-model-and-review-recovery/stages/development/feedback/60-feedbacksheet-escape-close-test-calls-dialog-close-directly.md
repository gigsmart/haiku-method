---
title: >-
  FeedbackSheet Escape-close test calls dialog.close() directly, never
  dispatches Escape
status: pending
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:25:22Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** Medium — CC3's "Escape-driven close path" is not exercised.

**File:** `packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.test.tsx:235-251`

```ts
it("Escape-driven close path dispatches close + restores focus", () => {
  // ...
  // In real browsers, Escape fires `cancel` → default close path.
  // In jsdom, the simplest faithful stand-in is to call dialog.close()
  // directly (which dispatches the `close` event via the polyfill).
  act(() => {
    ;(sheet as HTMLDialogElement).close()
  })
  expect(onCloseSpy).toHaveBeenCalled()
  // ...
})
```

The test is named "Escape-driven close path" but never dispatches an Escape keydown event. It calls `.close()` directly. If the component's Escape key binding is removed or broken, this test still passes — it only verifies the close event path, not the input path that leads to it.

**Why this matters:**
- Escape-to-close is a WAI-ARIA APG required pattern for dialogs. Unit-10 lists this as CC3.
- The same file has a working focus-trap test (CC2b) that dispatches `Tab` key events on the dialog root (`pressTab()` at line 189). That pattern could be reused for Escape: dispatch a keydown with `{ key: "Escape" }` on the dialog and assert the close path fires.
- In jsdom 25, `<dialog>` supports `cancel` event dispatch; the handler chain `keydown(Escape) → cancel → close` is what should be tested end-to-end.

**Suggested fix:**
```ts
fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" })
// OR, if the component listens at document level:
fireEvent.keyDown(document, { key: "Escape", code: "Escape" })
await waitFor(() => {
  expect(onCloseSpy).toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
})
```

Mandate reference: "test names describe the scenario and expected result" — current name implies Escape dispatch but the body tests post-close cleanup only.
