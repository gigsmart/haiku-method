# Perf test tier

Tests in this directory are **relative regression gates** under jsdom. They
catch distribution-shift regressions — a per-keystroke resort that goes
quadratic, a listener leak that scales with pin count, an rAF coalescing
branch that accidentally fires per-message. They do **not** measure
user-facing paint budgets or real-browser timing.

## What lives here

- `use-session-websocket.test.tsx` — rAF coalescing for bursty
  `session-update` frames. Uses real `requestAnimationFrame` under jsdom
  (no mocking) so the hook's `rafRef !== null` branch actually fires and
  re-arms across real frames. Two consecutive bursts + flushes prove the
  rAF is re-armed between frames, not just fired once by a manual drain.

## What does NOT live here

Real-browser paint budgets. Unit-13 §Perf budget originally named a
Playwright test at 100 ms first paint / 16 ms keypress. Playwright is
banned on this repo (commit `28e66e4c`) because it clobbers the
developer's in-use Chrome.

The prior `annotation-perf.spec.tsx` (a jsdom-with-2×-cushion substitute
for that Playwright spec) was removed alongside the AnnotationCanvas
consolidation in commit `c5053960`. If a jsdom-relative AnnotationCanvas
regression gate is re-added, it belongs **here** — not at
`tests/annotation-perf.spec.tsx` — so the directory name communicates its
tier on sight.

## Follow-up (out of FB-62 scope)

Add a Vitest browser-mode perf job:

- `@vitest/browser` + a headless-browser runner.
- Runs perf specs against a headless Chromium in CI only (not local
  default `npm test`) and stores numbers in `budget.json` for historical
  tracking.
- Unit-13 acceptance criterion for real paint budgets gets upgraded to
  "Vitest browser-mode perf job passes 100 ms / 16 ms on Chromium 120+"
  once the infra lands.

Ref: FB-62 —
`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/62-annotation-perf-and-use-session-websocket-tests-mock-timers.md`.
