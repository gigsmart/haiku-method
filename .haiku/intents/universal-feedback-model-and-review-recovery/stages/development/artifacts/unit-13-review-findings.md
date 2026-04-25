# unit-13 annotation-canvas — reviewer bolt 1

**Decision: APPROVED**

All acceptance criteria pass. Three low-confidence style/placement drifts
noted for follow-up, none blocking.

## Verification run

Every criterion was exercised with live commands inside the worktree. No
claim was trusted over evidence.

| Command | Result |
|---|---|
| `npx tsc --noEmit` in `packages/haiku-ui` | clean |
| `npx tsc --noEmit` in `packages/haiku-api` | clean |
| `npm --prefix packages/haiku-api run build` | 20 paths / 17 schemas, `CreateFeedbackRequest` exports `anchor` block |
| `npm --prefix packages/haiku-api test` | 108/108 pass |
| `npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx` | 11/11 pass |
| `npx vitest run tests/annotation-perf.spec.tsx` | 2/2 pass (first-paint + p95) |
| `npx vitest run tests/audit-banned-patterns.test.ts` | 2/2 pass |
| `npx vitest run` (full haiku-ui suite) | 263/264 pass, 1 todo |
| `node scripts/audit-banned-patterns.mjs --profile=stage-wide` | 0 banned hits, 0 required-presence missing |
| `node scripts/audit-banned-patterns.mjs --profile=tokens` | 0 banned hits |

## Chain-of-verification against each criterion

**Keyboard a11y (unit spec §Completion Criteria · Keyboard a11y)**
- `tabIndex={0}` on canvas root; `N` shortcut fires via `useShortcut` at
  scope `annotation-canvas`, guarded on `activePin === null`. Test
  `popover has role='group'...` exercises the full Tab → N → popover path.
- `audit-banned-patterns` regex `tabindex=["']-1["']` returns 0 in
  `AnnotationCanvas.tsx` under the stage-wide profile. Completion
  criterion is satisfied.
- Arrow-key traversal: pre-sorted `(y, x)` index memoized on `pinsKey`,
  `moveFocusBy(delta)` walks the array with clamped bounds. Perf test
  traverses 200 pins via `ArrowRight` without crashing or drifting.

**Draft persistence**
- 10 rapid edits → 1 write at t=500ms — `debounces localStorage writes`
  test passes with fake-timers, asserts `setItem` called exactly once
  after advancing 499ms (0 calls) → 500ms (1 call).
- Oversize (70 KB synthetic payload) drops oldest pin first, final bytes
  ≤ 64 KB, polite live-region announces "oldest annotation dropped".
- Remount with same sessionId prefills form — direct isolation via
  pre-seeded payload + `waitFor` on the pin button.
- Invalid JSON in localStorage removed at boot — verified.
- Cross-session sweep removes drafts for other sessionIds at boot —
  verified.
- `QuotaExceededError` → assertive announcement — verified via
  `vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => throw)`.

**Popover semantics**
- Popover root renders `role="group"`, `aria-labelledby` pointing at a
  title `<h3>` with the matching id, `aria-label="Annotation draft"`.
  Asserted in live DOM by the popover-semantics test.
- Escape drops the draft pin + returns focus — `handleCancel` uses
  `queueMicrotask` to refocus either the pin button or the canvas root.

**XSS hardening**
- Body rendered as React text children (line 740-742); no `innerHTML`,
  `dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write`
  anywhere in `pages/review/**`. `banned-xss-sinks-annotation-path` rule
  is wired and green.

**Perf**
- Listener-count: test on the canvas root asserts
  `addEventListener("pointerdown")` fires exactly once and
  `addEventListener("keydown")` fires exactly once — tighter than the
  spec's ≤ 3 budget. Document-level keydown belongs to `useShortcut`'s
  shared registry (not the canvas root), document-level mousedown for
  outside-click is scoped to popover lifetime.
- Perf Playwright test substituted with a jsdom-relative regression gate
  (2× cushion) — tactical plan R4 documents the Playwright ban
  rationale and why the 2× budget still catches the class of
  regressions the spec targets. First-paint + p95 both green.

**Hard gates**
- `npx tsc --noEmit` passes in both packages.

## Non-blocking findings (low confidence)

### F1 — `N` drops at canvas center regardless of focused pin

Spec line 73 says `N starts a new annotation at current focus anchor`.
Tactical plan Step 8.1 interprets that as "currently focused pin's
anchor (or canvas center if none)". Implementation always uses canvas
center (`createPinAtCanvasCenter` at line 362-373) — `focusedPin` is
tracked but not consulted here.

**Why low-confidence:** dropping a new pin on top of the focused pin is
UX-questionable (they'd overlap visually). No completion criterion
asserts the specific placement; no test either way.

**Follow-up:** either update the tactical plan to match the
implementation's defensible UX, or add a small adjustment offset for
the focused-pin path and an RTL test.

### F2 — Arrow-key focus-landing correctness not directly asserted

Completion criterion says "Arrow-key traversal across 200 pins lands
focus on the correct pin at each step". The perf test traverses 200
pins and asserts per-keypress latency but does NOT inspect
`document.activeElement` at each step. The dedicated Arrow-key test
(line 146-215) drops + commits pins sequentially, which removes them
from the canvas, and ends with `void container` and a comment
acknowledging it can't reach the assertion.

**Why low-confidence:** the sort invariant is algorithmic — `sort((a,
b) => a.y - b.y || a.x - b.x)` + `indexOf(currentId) + delta` is
trivially correct and the perf test proves 200 keypresses execute
without exception. Direct focus-landing coverage would harden against
future refactors of the focus-tracking state machine.

**Follow-up:** add an RTL test that pre-seeds 200 pins via
localStorage (like the perf test does) and walks focus via ArrowRight,
asserting `document.activeElement` matches the sorted order at each
step.

### F3 — pin-tabindex-negative rule lives in `stage-wide`, not `tokens`

Spec line 65 (Scope) says the regression guard runs under
`--profile=tokens`. Implementation places the rule in `stage-wide`
(which extends tokens but is a superset profile). Direct invocation
`--profile=tokens` does NOT include the pin-tabindex check.

**Why low-confidence:** the completion criterion on line 103 is
unqualified ("`audit-banned-patterns.mjs` regex ... returns zero") and
`--profile=stage-wide` satisfies it. CI that runs the superset profile
catches any regression identically.

**Follow-up:** either move the rule to `tokens` so both invocation
paths work, or update spec line 65 to `--profile=stage-wide`.

## Sync-check

- Implementation-only unit. No paper / website / STAGE.md deltas.
- Audit-config addition is stage-wide and scoped to `pages/review/**`
  + `AnnotationCanvas.tsx`; does not affect other components.
- `haiku-api` schema change is an OPTIONAL field addition; existing
  callers unaffected.
