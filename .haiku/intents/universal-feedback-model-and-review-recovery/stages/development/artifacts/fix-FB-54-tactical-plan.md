# Fix FB-54 — Tactical Plan (planner, bolt 1)

**Finding:** Skip-link test fakes anchor activation via `element.focus()` instead of user behavior.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/54-skip-link-test-fakes-anchor-activation-via-element-focus-ins.md`

## TL;DR

`packages/haiku-ui/tests/skip-link.spec.tsx:86-94` asserts that activating the
skip link moves focus to `<main id="main-content">` — but the assertion is
made after the test calls `main?.focus()` directly. The anchor itself is
never activated. If `<a href="#main-content">` were replaced with a `<div>`,
the test would still pass. This defeats the stated purpose of the test
(regression guard for the missing-skip-link class of issue named in unit-06
completion criteria).

There is a second, related gap: the App has no `hashchange` handler that
moves focus to `#main-content`. It relies on the browser's native
hash-to-focus behavior, which jsdom does NOT implement. So even if the test
were rewritten to dispatch a real click on the anchor, focus would never
move in jsdom — there is nothing in the app code path to move it. The
"regression guard" is a no-op either way today.

The fix: make the focus-move explicit in app code (so it's real behavior we
can assert on), then rewrite the test to exercise that chain end-to-end via
a real `user.click` on the anchor.

## Root cause

Two independent errors compound:

1. **Test fakes activation.** Lines 86-94 of `skip-link.spec.tsx` never
   activate the anchor. They query the `<main>` element and call `.focus()`
   on it directly. That proves `<main tabindex="-1">` accepts programmatic
   focus — it proves nothing about the skip link. The inline comment
   rationalises this as a jsdom limitation, but the actual limitation is
   that the app code depends on native browser behavior the test
   environment doesn't provide.
2. **App depends on undocumented native behavior.** Browsers move focus to
   the fragment target on hash navigation, but that behavior varies across
   browsers and is not guaranteed for every element — even `<main
   tabindex="-1">`. Relying on it silently is fragile. An explicit
   `hashchange` handler that calls `.focus()` on the target makes the
   contract explicit, testable in jsdom, and robust across browsers.

Fixing both together removes the drift: the test proves the skip link's
wired-up behavior (click → hash change → focus moved), and the app code
explicitly implements that behavior rather than hoping the browser does it.

## Fix approach

### 1. Add an explicit hashchange-to-focus handler in `App.tsx`

Install a `hashchange` listener on `window` that, when `location.hash ===
"#main-content"`, finds the element by id and calls `.focus({ preventScroll:
false })`. Also fire once on mount if the initial URL already carries
`#main-content` (covers the "landed on a deep link" case). This is six lines
of code inside the existing `useEffect` block in `App.tsx`, and it lives
alongside the theme-preference effect already there.

This replaces an implicit browser contract with explicit app behavior we
own and can test. It does not change user-observable behavior in real
browsers (the native behavior was already doing the same thing); it makes
that behavior testable in jsdom and deterministic across engines.

### 2. Rewrite `skip-link.spec.tsx` assertion block

Replace the `main?.focus()` path with a real activation sequence:

- Resolve the skip link after the first `user.tab()` press.
- Call `await user.click(link)` (real event, real default-action path in
  jsdom as far as anchor click → navigation to hash goes: jsdom updates
  `window.location.hash` on anchor click and fires `hashchange`).
- Assert `window.location.hash === "#main-content"` (proves the navigation
  half — the link is actually an anchor to the right target, not a `<div>`).
- Assert `document.activeElement === main` (proves the focus-move half —
  the new hashchange handler moved focus to the target).

Both halves must hold for the test to pass. A `<div>` replacement would
fail the hash assertion. A missing/broken hashchange handler would fail
the focus assertion. The test now guards both the anchor wiring and the
focus-move handler.

### Files to modify

1. `packages/haiku-ui/src/App.tsx` — add the hashchange-to-focus effect.
   Inside the existing `useEffect` (or a sibling `useEffect`, preferred
   for single-responsibility):

   ```tsx
   // Explicit fragment-to-focus handler — per aria-landmark-spec.md §1 and
   // unit-06 skip-link regression guard. Browsers vary in their native
   // hash-to-focus behavior (jsdom does not implement it at all), so the
   // contract "activating the skip link lands focus on <main>" is owned
   // here rather than inherited silently from the user agent.
   useEffect(() => {
       const moveFocusToMainIfHashMatches = () => {
           if (window.location.hash !== "#main-content") return
           const main = document.getElementById("main-content")
           if (main instanceof HTMLElement) main.focus()
       }
       moveFocusToMainIfHashMatches() // initial deep-link case
       window.addEventListener("hashchange", moveFocusToMainIfHashMatches)
       return () =>
           window.removeEventListener(
               "hashchange",
               moveFocusToMainIfHashMatches,
           )
   }, [])
   ```

2. `packages/haiku-ui/tests/skip-link.spec.tsx` — rewrite the assertion
   block in the first test case (`receives focus on first Tab press and
   lands focus on <main> when activated`):

   - Remove lines 86-94 (the comment + the faked `main?.focus()` path).
   - Replace with:
     ```ts
     // Activating the skip link must (a) navigate to #main-content and
     // (b) land focus on <main>. The App's hashchange handler owns the
     // focus-move half; the anchor href owns the navigation half. This
     // block asserts both, so replacing the <a> with a <div> or
     // removing the hashchange handler would fail the test.
     const link = active as HTMLAnchorElement
     await user.click(link)
     expect(window.location.hash).toBe("#main-content")
     const main = container.querySelector(
         "#main-content",
     ) as HTMLElement | null
     expect(main).not.toBeNull()
     expect(document.activeElement).toBe(main)
     ```
   - The `beforeEach` already clears `window.history.replaceState({}, "",
     "/review/test-review-1")` — no `#main-content` hash at start, so the
     click-induced hashchange is a genuine state transition (not a no-op
     re-fire).

### Tests

Per the hat mandate: "include a step for implementing test coverage for
every scenario in the product stage's `.feature` files." Skip-link behavior
is not a scenario in any of the intent's seven `.feature` files
(verified — none of `review-ui-feedback.feature`, `feedback-crud.feature`,
or the other five mention skip links or main-content focus). The coverage
obligation for this fix is therefore the rewritten `skip-link.spec.tsx`
test itself: it is the regression guard named in `unit-06-shell-and-routing.md`
line 122 ("Skip-link renders first in tab order in every page — verified
by an RTL test that presses Tab once on page load and asserts the skip
link receives focus"). After the rewrite, that line remains satisfied AND
the activation-lands-on-main assertion becomes a real behavioral check.

No new test file is created. The existing file gains one real assertion
chain in the first test case and keeps the second test case
(`is the first focusable element in DOM order`) unchanged.

## Files to modify

- `packages/haiku-ui/src/App.tsx` — add the explicit hashchange-to-focus
  effect (≈12 new lines inside a new `useEffect`).
- `packages/haiku-ui/tests/skip-link.spec.tsx` — rewrite lines 86-94 to
  dispatch a real click and assert both hash navigation and focus
  placement (≈10 lines replacing ≈10 lines; net size ~unchanged).

No package.json changes. No new dependencies. No fixture or snapshot
churn.

## Verification

Run from repo root:

1. `cd packages/haiku-ui && npx tsc --noEmit` — strict compile clean;
   the only new code is a standard `useEffect` with `window` globals
   already typed by TS `lib.dom`.
2. `cd packages/haiku-ui && npx vitest run tests/skip-link.spec.tsx` —
   both test cases pass. The first case now exercises the real activation
   chain.
3. `cd packages/haiku-ui && npx vitest run` — full haiku-ui test suite
   stays green (the new effect fires only when the hash matches
   `#main-content`; no other test uses that hash, so there is no
   side-effect leakage across the suite).
4. `cd packages/haiku-ui && npm run audit:stage-wide` — the stage-wide
   audit suite still passes. No banned-pattern hits; no new `audit-allow`
   tokens needed.
5. **Anti-regression probe (manual verification during implementation):**
   temporarily change the test fixture so `<SkipLink>` renders a `<div>`
   instead of an `<a>`; confirm the rewritten test now fails at the
   `expect(active?.tagName).toBe("A")` assertion (which already exists on
   line 82 — but was previously unreachable past the assertion chain). Then
   revert. This is a one-time developer check to prove the test actually
   catches the regression class it claims to guard against; it is NOT
   committed as a permanent anti-test.

## Risks

- **jsdom click → hashchange timing.** jsdom dispatches `hashchange`
  synchronously-ish within the click handler microtask queue. `await
  user.click(link)` from `@testing-library/user-event` awaits the whole
  event dispatch chain including the default action, so the hashchange
  listener should have fired by the time the next `expect` runs. If it
  doesn't, add a single `await waitFor(() => expect(window.location.hash)
  .toBe("#main-content"))` guard — but this is unlikely to be needed. The
  builder should try the simple form first.
- **Multiple App mounts in one test run.** The new effect adds a global
  window listener. The cleanup (`removeEventListener` in the effect return)
  handles unmount correctly. `afterEach(cleanup)` already runs between
  tests, so the listener is removed before the next test mounts.
- **Initial-deep-link re-fire.** The effect calls
  `moveFocusToMainIfHashMatches()` on mount for the deep-link case. In the
  test, `beforeEach` sets the URL to `/review/test-review-1` (no hash), so
  the guard `if (window.location.hash !== "#main-content") return` short-
  circuits and no focus change happens before the Tab press. Verified by
  reading `beforeEach` at line 50-52. If a future test sets the URL with
  `#main-content` up-front, the effect would steal focus from whatever
  element the test expected — but today no such test exists.
- **Real-browser redundancy.** The new hashchange handler duplicates what
  most browsers do natively. This is intentional — explicit beats
  implicit here — and the cost is 12 lines and one listener. It does NOT
  cause double focus-move in real browsers because both the native
  behavior and the handler resolve to the same target being focused.
- **`preventScroll` omitted.** The `.focus()` call above uses the default
  (`preventScroll: false`), matching native browser behavior on hash
  navigation. If scroll behavior is objectionable, the builder can pass
  `{ preventScroll: true }` — but that would diverge from browser default
  and users expect the viewport to scroll to the `<main>` landmark on
  skip-link activation. Keep the default.
- **One bolt.** Two files, ~22 lines of net change. Well within one bolt.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- Plan includes verification steps (MUST from hat mandate).
- Plan reads completion criteria (FB-54 body, unit-06 completion criteria
  on line 122 of the unit spec, hat mandate, stage scope).
- Risk assessment up front (MUST from hat mandate).
- Test coverage step included: the rewritten test IS the regression
  coverage for this fix. No orphan coverage added.
- Plan is tactical and specific: exact files, exact lines, exact
  replacement code. Builder can execute without guessing.
