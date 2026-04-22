---
title: DOM parity snapshot test passes on any DOM > 16 characters
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:26:54Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Severity:** Low-Medium — the spec's "renders a stable DOM tree" claim is not backed by a meaningful invariant.

**File:** `packages/haiku-ui/tests/parity.spec.tsx:155`

```ts
// Sanity: the SPA actually rendered something non-trivial. An empty
// string or a bare error message would mean the mock didn't wire up.
expect(rendered.length).toBeGreaterThan(16)
```

Any DOM with more than 16 characters passes this sanity check. A page that renders only `<div>error</div>` (16 chars of HTML — no, even less) would pass. A page that renders `<h1>Not Found</h1>` passes. The structural-marker assertions that follow (`expect(rendered).toContain("<header")`, `role="banner"`, etc.) do catch obvious deletions, but the sanity check itself is vacuous.

**Why this matters:**
- The file frames itself as "the local (jsdom-based) interpretation of the spec's Playwright contract." The Playwright contract presumably had a real minimum-content assertion (e.g. specific components must render with expected props).
- The `toMatchSnapshot` call at line 164 IS the regression gate; the 16-char sanity check is cosmetic. But if the snapshot is ever regenerated (`-u`), whatever the current DOM happens to be becomes the new baseline — and a silently-broken render (e.g. always renders `<div>error…</div>`) passes regeneration because it's "non-empty."

**Suggested fix:**
Replace the `> 16` assertion with real content invariants:
```ts
// The rendered DOM must contain the session's data — not an error state.
if (fx.name === "review") {
  const r = session as ReviewSessionPayload
  // Intent title + every unit's slug from the payload must appear.
  expect(rendered).toContain(escapeHtml(r.intent.title))
  for (const unit of r.units ?? []) {
    expect(rendered).toContain(escapeHtml(unit.slug))
  }
}
// Confirm we're NOT rendering an error state.
expect(rendered).not.toMatch(/error|failed to load/i)
```
Do the same per-fixture — the `assertStructuralMarkers` function already has the pattern.

Mandate reference: "no tests that always pass (tautological assertions)".
