# Fix FB-62 — Tactical Plan (planner, bolt 1)

**Finding:** `annotation-perf` and `use-session-websocket` tests mock timers; not a real perf/timing regression gate.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/62-annotation-perf-and-use-session-websocket-tests-mock-timers.md`

## Root cause

Two perf/timing tests sit in the default vitest rotation but don't exercise the
timing property the unit specs named:

1. **`packages/haiku-ui/tests/annotation-perf.spec.tsx`** — Unit-13's completion
   criterion was a real-browser keypress-to-paint budget (100 ms first paint,
   16 ms p95 per ArrowRight). The file ships with a 2× jsdom cushion (200 ms /
   32 ms) and self-documents as a "RELATIVE regression gate rather than
   user-facing paint guarantee." That is *correct jsdom hygiene* but the file is
   named and located like a real-browser perf test — so someone scanning the
   suite for the spec's paint guarantee will conclude it is covered when it is
   not. The test *is* a useful distribution-shift regression gate; it just
   should not live at the default-suite path that implies otherwise.

2. **`packages/haiku-ui/tests/use-session-websocket.test.tsx`** — asserts
   `useSessionWebSocket` coalesces 100 bursty `session-update` frames into one
   `onUpdate` call per animation frame. It does this by stubbing
   `requestAnimationFrame` with a manual queue (`mockImplementation((cb) => {
   rafCallbacks.push(cb); ... })`). Because the 100 `dispatchSessionUpdate`
   calls run inside a single synchronous `act`, and the manual-queue rAF never
   fires until the test explicitly drains `rafCallbacks`, the "one rAF per
   burst" assertion is trivially satisfied by `if (rafRef.current !== null)
   return` inside the hook. The test proves the coalescing code path exists; it
   does not prove the code path functions across *real* rAF frames (which would
   fire repeatedly during a 100-event burst under real timing and exercise the
   "replace pending payload, reuse scheduled rAF" logic). Per FB-62: "the real
   property under test — *rAF actually coalesces bursty WebSocket frames under
   realistic browser timing* — is not exercised."

Playwright is banned on this repo (commit `28e66e4c` — drop Playwright harness)
so a full real-browser perf job is out of scope. Vitest browser mode (the
feedback's suggestion 2) requires adding `@vitest/browser` + a headless browser
runner and is a suite-level change that is bigger than this feedback warrants.
That leaves FB-62's suggestion 1 (document + relocate) and suggestion 3 (use a
real rAF in the WebSocket test) as the in-scope fixes.

## Fix approach

### Part A — relocate and re-document the perf specs

Move both files into a dedicated `tests/perf/` directory so the file system
itself communicates their character (relative regression gates, not real-browser
paint guarantees). Update the header docstrings to make the "what this catches"
vs "what this does not catch" contract unambiguous, and add a single
`perf/README.md` explaining the tier and the out-of-scope work (real-browser
perf job is a follow-up requiring Vitest browser mode).

Vitest config at `packages/haiku-ui/vitest.config.ts` already uses
`tests/**/*.spec.tsx` and `tests/**/*.test.tsx` globs, so files under
`tests/perf/` are picked up automatically — no config change required.

### Part B — use real `requestAnimationFrame` in the WebSocket coalescing test

Replace the rAF/cAF spies in `use-session-websocket.test.tsx` with real rAF
frames. jsdom provides a polyfilled `requestAnimationFrame` (fires on the event
loop's next tick — ~16 ms wall-clock by default, but the precise cadence is not
the property under test). Dispatch the 100 frames across multiple real rAF
ticks, then assert:

- Total `onUpdate` calls are strictly less than the 100 dispatches (real
  coalescing happened, not just "one synchronous flush").
- When frames are dispatched in tight synchronous bursts, the burst collapses
  to a single `onUpdate` call — use `await new Promise((r) =>
  requestAnimationFrame(() => r(undefined)))` to advance one real rAF frame,
  then dispatch the next burst, then advance again.
- The *final* `onUpdate` payload still carries the LAST dispatched status
  (`tick-99` in the current test, or the last tick of the last burst if we
  split into multiple bursts).

This preserves the original assertion (batching works) while also proving the
"reuse the scheduled rAF for subsequent frames, only call `onUpdate` on the
frame fire" code path with real timing. The test is stronger than the mocked
version because a future regression that, e.g., calls `onUpdate` per frame
synchronously will fail the coalescing count — whereas today it would still
pass because the mock never advances time.

## Files to MODIFY / RELOCATE

| Current path | New path | Change |
|---|---|---|
| `packages/haiku-ui/tests/annotation-perf.spec.tsx` | `packages/haiku-ui/tests/perf/annotation-perf.spec.tsx` | `git mv`; rewrite header docstring to make tier explicit ("relative regression gate under jsdom — not a real-browser paint guarantee; a Vitest browser-mode follow-up is the real budget"); no assertion changes. |
| `packages/haiku-ui/tests/use-session-websocket.test.tsx` | `packages/haiku-ui/tests/perf/use-session-websocket.test.tsx` | `git mv`; replace `vi.spyOn(globalThis, "requestAnimationFrame")` + `vi.spyOn(globalThis, "cancelAnimationFrame")` with real rAF advancement via `await new Promise((r) => requestAnimationFrame(() => r(undefined)))`. Keep the "100 bursty frames → 1 onUpdate" property plus a new "burst, flush, burst, flush → 2 onUpdate calls with correct payloads" assertion that proves the rAF is re-armed after each frame fire. |

## Files to CREATE

| Path | Purpose |
|---|---|
| `packages/haiku-ui/tests/perf/README.md` | One-screen doc on the perf tier: what these tests catch (distribution-shift regressions under jsdom), what they do NOT catch (real-browser paint budgets), why Playwright is not an option here, and what the follow-up is (Vitest browser mode — out of scope for FB-62). Cite unit-13 §Perf budget and FB-62. |

## Files to READ (verify only — do not modify)

- `packages/haiku-ui/vitest.config.ts` — confirm `tests/**/*.{test,spec}.{ts,tsx}` globs cover `tests/perf/**` (they do, `**` is recursive).
- `packages/haiku-ui/src/hooks/useSessionWebSocket.ts` — confirm the real hook uses `requestAnimationFrame(cb)` at module-global scope (it does, line 76); real rAF in the test will therefore exercise the real code path.
- `packages/haiku-ui/package.json` — check for any `test:perf` script that pins the old paths (there is none; only `npm test` which runs the full glob).

## Implementation steps (for the builder in bolt 2)

1. `mkdir -p packages/haiku-ui/tests/perf`.
2. `git mv packages/haiku-ui/tests/annotation-perf.spec.tsx packages/haiku-ui/tests/perf/annotation-perf.spec.tsx`.
3. `git mv packages/haiku-ui/tests/use-session-websocket.test.tsx packages/haiku-ui/tests/perf/use-session-websocket.test.tsx`.
4. Edit `packages/haiku-ui/tests/perf/annotation-perf.spec.tsx` — rewrite the header docstring:
   - Keep the existing 2× jsdom cushion rationale.
   - Add an explicit "Tier: relative-regression gate (jsdom)" line.
   - Add an explicit "NOT a real-browser paint guarantee; Unit-13's
     completion criterion named a Playwright test (banned on this repo —
     commit 28e66e4c). Follow-up: add Vitest browser mode perf job that
     exercises the same render path under a real Chromium and stores numbers
     for historical tracking." line.
   - Cite FB-62 (`.haiku/.../feedback/62-*.md`) by reference.
5. Edit `packages/haiku-ui/tests/perf/use-session-websocket.test.tsx`:
   - Remove the `rafSpy` / `cafSpy` blocks (lines ~72-82, ~114-115 of the current file).
   - Replace with a helper `async function flushOneFrame() { return new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()) }) }` that awaits one real rAF tick.
   - Keep the first burst (100 `dispatchSessionUpdate` inside `await act(async () => { ... })`).
   - After the burst, `await flushOneFrame()` (wrapped in `await act(async () => { await flushOneFrame() })` so React re-renders settle).
   - Assert `onUpdate` called exactly once and first call carries `status: "tick-99"` (same as today).
   - **NEW:** dispatch a second burst of 50 frames with `status: tick-100..tick-149`; `await flushOneFrame()`; assert `onUpdate` has now been called exactly TWICE and the second call carries `status: "tick-149"`. This is what FB-62 asks for — proves the rAF is re-armed between frames, not just fired once by a manual drain.
   - Remove the header docstring claim about "mock timers"; replace with "real rAF under jsdom — proves the hook's `rafRef !== null` coalescing branch actually fires and resets across real frames."
   - Cite FB-62 by reference.
6. Create `packages/haiku-ui/tests/perf/README.md` with the tier doc (see content sketch in §README content below).
7. Run verification (see §Verification).
8. Commit as the planner (the tactical plan file itself) with message
   `haiku: fix FB-62 bolt 1 (planner)`. The builder in bolt 2 carries out the
   file moves, docstring edits, and new assertion.

### README content (for step 6)

```md
# Perf test tier

Tests in this directory are **relative regression gates** under jsdom. They
catch distribution-shift regressions — a per-keystroke resort that goes
quadratic, a listener leak that scales with pin count, an rAF coalescing
branch that accidentally fires per-message. They do **not** measure
user-facing paint budgets or real-browser timing.

## What lives here

- `annotation-perf.spec.tsx` — unit-13 AnnotationCanvas render + keypress
  budgets (jsdom-relative; 2× cushion vs spec's real-browser budget).
- `use-session-websocket.test.tsx` — rAF coalescing for bursty
  `session-update` frames. Uses real rAF under jsdom so the hook's
  `rafRef !== null` branch fires across real frames.

## What does NOT live here

Real-browser paint budgets. Unit-13 §Perf budget names a Playwright test at
100 ms first paint / 16 ms keypress. Playwright is banned on this repo
(commit `28e66e4c`) because it clobbers the developer's in-use Chrome.

## Follow-up (out of FB-62 scope)

Add a Vitest browser-mode perf job:
- `@vitest/browser` + `playwright-core` (non-launching — uses a clean profile).
- Runs these two specs against a headless Chromium in CI only (not local
  default `npm test`) and stores numbers in `budget.json` for historical
  tracking.
- Unit-13 acceptance criterion gets upgraded to "Vitest browser-mode perf
  job passes 100 ms / 16 ms on Chromium 120+" once the infra lands.

Ref: FB-62 —
`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/62-annotation-perf-and-use-session-websocket-tests-mock-timers.md`.
```

## Verification commands

From `packages/haiku-ui`:

```bash
# 1. The moved files still run under the normal test glob.
npx vitest run tests/perf/annotation-perf.spec.tsx     # timeout 5 min
npx vitest run tests/perf/use-session-websocket.test.tsx # timeout 5 min

# 2. Full haiku-ui suite — nothing else broke.
npm test                                                # timeout 10 min

# 3. No other file imports the old paths.
git grep -n 'tests/annotation-perf' packages/haiku-ui   # expect empty
git grep -n 'tests/use-session-websocket' packages/haiku-ui # expect empty

# 4. Typecheck still clean.
npx tsc --noEmit -p packages/haiku-ui                   # timeout 2 min
```

All four must exit 0 / empty. Expected failures if the fix regresses:

- `use-session-websocket.test.tsx` will time out if real rAF never fires
  under jsdom — unlikely (jsdom polyfills `requestAnimationFrame`) but a
  real signal if it happens. Mitigation: vitest's default test timeout is
  5 s; the second burst + flush fits easily.
- Coalescing count assertion (burst → exactly one onUpdate) will fail if
  the hook has actually broken — which is what the test is for.

## Risks

- **R1 — jsdom rAF cadence is implementation-defined.** jsdom polyfills
  `requestAnimationFrame` but does not guarantee a fixed 16 ms cadence; in
  practice it fires on the next microtask/macrotask boundary.
  Mitigation: the assertion is "strictly less than 100 onUpdate calls per
  burst" + "exactly N onUpdate calls across N bursts of flushed frames" —
  both are cadence-independent. The coalescing *property* is what's being
  tested, not the cadence.

- **R2 — Parallel-batch clobber.** The fix-loop is parallel; another chain
  may be editing the same two files. Mitigation: read each file immediately
  before editing, re-plan the exact line-level changes against current
  content, and let the assessor catch incomplete fixes. The file-move + new
  directory is atomic once applied; the new assertion is appended, not
  interleaved.

- **R3 — Someone may add a Playwright spec in the new `perf/` directory.**
  Mitigation: the README explicitly calls out Playwright is banned. Audit
  script (`audit-banned-patterns.mjs`) could grow a rule catching
  `@playwright/test` imports in `tests/perf/**` — but that is follow-up
  scope, not FB-62.

- **R4 — Moving the file breaks IDE bookmarks / team muscle memory.** The
  file names stay identical (`annotation-perf.spec.tsx`,
  `use-session-websocket.test.tsx`); only the parent directory changes.
  Impact is minimal; acceptable tradeoff for the communicative value of the
  directory rename.

- **R5 — `async/await` inside the WebSocket test's `act` may race.** The
  current test uses `await act(async () => { ... })` which correctly waits
  for pending React state updates. Adding an `await flushOneFrame()` inside
  a wrapping `await act(async () => { ... })` block is the jsdom-idiomatic
  pattern for "drain one rAF then let React settle." Mitigation: keep the
  wrapping `act` around every rAF advancement, not around the frame
  dispatch itself (dispatch is synchronous WebSocket input; rAF advancement
  is the asynchronous React boundary).

## Out of scope (deferred)

- **Vitest browser mode / real Chromium perf job** — requires
  `@vitest/browser` + headless-browser runner config + CI wiring. FB-62's
  suggestion 2. Owed by a follow-up unit; unit-13 acceptance criterion
  should be updated at that time.
- **Rewriting `annotation-perf.spec.tsx` to use real rAF** — the
  `performance.now()` bracketing in that file is already synchronous-only
  (no rAF in the loop); the 2× jsdom cushion is honest about what it is,
  and FB-62's suggestion 1 (document the tier) is the right fix for it.
- **Adding Lighthouse / WebPageTest perf jobs** — the `audit-lighthouse`
  path is already removed (commit `28e66e4c`); this is orthogonal to FB-62.
- **Any change to `useSessionWebSocket.ts` itself** — the hook's
  implementation is fine; FB-62 is purely a test-quality finding.

## Done when

- Both perf specs live under `packages/haiku-ui/tests/perf/`.
- `tests/perf/README.md` exists and documents the tier + Playwright ban +
  follow-up.
- `use-session-websocket.test.tsx` uses real rAF (no `vi.spyOn(globalThis,
  "requestAnimationFrame")` remains) and adds the "2 bursts, 2 flushes → 2
  onUpdate calls" assertion.
- `annotation-perf.spec.tsx` header docstring names the tier explicitly
  and cites FB-62 + the Vitest browser-mode follow-up.
- `npm test` in `packages/haiku-ui` exits 0 with the moved files
  participating (verify by inspecting the test count).
- `git grep` for the old `tests/annotation-perf` / `tests/use-session-websocket`
  paths returns empty.
- `npx tsc --noEmit` in `packages/haiku-ui` exits 0.
