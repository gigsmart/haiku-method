---
title: >-
  annotation-perf and use-session-websocket tests mock timers; not a real
  perf/timing regression gate
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:25:49Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Severity:** Medium — "perf tests" don't measure what they claim; real-world timing regressions will not be caught.

**Files:**
- `packages/haiku-ui/tests/annotation-perf.spec.tsx`
- `packages/haiku-ui/tests/use-session-websocket.test.tsx`

**annotation-perf.spec.tsx:**
Budgets are explicitly 2× the spec's real-browser budget because "occasional GC pauses and host-load jitter spike individual jsdom iterations well past 16 ms" (file lines 14-24). The test is self-describing as:
> "RELATIVE regression gates rather than user-facing paint guarantees"

Unit-13's completion criterion was a specific keypress-to-paint p95 budget in a real browser. The file substitutes a jsdom approximation with 2× cushion and admits: *"If a future regression gets past this gate, either the budget is too loose… or the regression is in a real-browser paint path (add a Lighthouse CI job rather than tightening this jsdom stub)."* — the admission confirms this isn't the spec's gate.

**use-session-websocket.test.tsx:73-116:**
```ts
const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame")
  .mockImplementation((cb) => { rafCallbacks.push(cb); return rafCallbacks.length })
```
Tests batching claim "100 frames → 1 onUpdate call," but with `requestAnimationFrame` replaced by a manual queue, the batching is trivially satisfied: the mock never advances time, so every `ws.dispatchSessionUpdate` call inside the synchronous `act` lands before any frame fires. The real property under test — *rAF actually coalesces bursty WebSocket frames under realistic browser timing* — is not exercised.

**Why this matters:**
- The mandate says "verify that integration tests cover system boundaries" and "test data is realistic." A mocked rAF + synthetic frame burst is neither integration nor realistic.
- Both tests live in the perf-test slot of the suite but give no confidence that the product meets real timing budgets. They are regression gates for "did someone rewrite the batching code" — not for "does batching still work under real browser timing."

**Suggested fix:**
1. Move `annotation-perf` and `use-session-websocket` into a dedicated `perf/` directory and tag as relative-regression gates (documentation change; current code is already this).
2. Add one real-browser perf job (Vitest browser mode with `@playwright/test`) that runs these two tests against realistic timing and stores the numbers for historical tracking.
3. If browser-mode is out of scope, at minimum dispatch events across multiple real RAF frames (e.g. using `requestAnimationFrame` without the spy and `await new Promise(r => requestAnimationFrame(() => r()))` to advance) in the WebSocket test, so the coalescing logic under real rAF firing is covered.

Mandate reference: "integration tests cover system boundaries" + "no tests that always pass (tautological… mocked everything)".
