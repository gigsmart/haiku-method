# Tactical Plan: unit-10 FeedbackSheet — mobile bottom sheet

Owner: planner (bolt 1)
Target: Land a proper native-`<dialog>` implementation at `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx` that renders a full-screen mobile feedback panel with correct dialog semantics, native focus trap + top-layer + background inert handled by the platform, styled `::backdrop`, and reduced-motion-gated slide-up animation. Ship the companion `FeedbackFloatingButton.tsx` FAB trigger, the `BROWSER-SUPPORT.md` policy doc, and a states/a11y test suite that regression-guards three defect classes called out by the unit spec:

1. **Missing dialog role** — `role="dialog" aria-modal="true" aria-labelledby={titleId}` MUST be present on the sheet root when open, asserted via RTL `screen.getByRole('dialog', { name: /feedback/i })`.
2. **No focus trap** — focus MUST be trapped inside the sheet while open (native `<dialog>` top-layer + platform focus-trap), asserted by RTL keyboard simulation (Tab does not escape the sheet) AND by first-focusable-on-open + FAB-restore-on-close.
3. **Non-inert background** — content outside the dialog MUST be inert while open (native `<dialog>` sets the root modality — elements outside the top-layer are not interactive), asserted via `el.closest('[inert]') !== null` OR by the Tab-doesn't-escape RTL behavior.

The unit spec explicitly diverges from DESIGN-BRIEF.md §6 line 838 (which names `focus-trap-react`). **The unit spec wins** — native `<dialog>` is simpler, smaller bundle, platform-correct, and eliminates an entire dependency. The BROWSER-SUPPORT.md doc records the browser-floor decision so the divergence is audited rather than accidental.

---

## Context & Prior Art

- **unit-05** (merged) produced the a11y foundation layer at `packages/haiku-ui/src/a11y/`. This unit consumes — does NOT duplicate — the following primitives:
  - `useReducedMotion()` from `a11y/reduced-motion.ts` — reactive matchMedia hook. SSR-safe (returns `false` when `typeof window === "undefined"`). Used to swap the `sheet-enter` slide-up animation class for a no-motion sentinel class on reduced-motion.
  - `focusRingClass` from `a11y/focus.ts` — standard teal-500 focus ring for the close button and any interior controls this component owns directly.
  - `touchTargetClass` from `a11y/touch-target.ts` — applied to the close ✕ button and the FAB itself (FB-64 44×44 minimum).
  - Controllable matchMedia stub at `a11y/__tests__/matchMedia.stub.ts` — used in `beforeEach` to drive the reduced-motion test branch. Install BEFORE render because `useReducedMotion()` reads matchMedia on the first render via `useState(() => readInitialMatches())`.
  - `LiveRegionShell` + `useAnnounce()` from `a11y/live-regions.tsx` — NOT consumed by this unit directly. The sheet hosts interior controls (AgentFeedbackToggle from unit-09, FeedbackList from unit-08) that announce on their own. The sheet's open/close events do not require their own announcements (the platform `<dialog>` semantics + the focus movement is the announcement).
- **unit-08** (merged) produced `FeedbackList`, `FeedbackItem`, `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackSummaryBar`. The sheet composes these but does NOT reach into their internals — they render verbatim inside the sheet body. `FeedbackList` already manages its own list semantics (`role="list"`, `aria-label="Feedback items"`, virtualization, keyboard nav). The sheet passes `items`, `isLoading`, `error`, `onRetry`, `onStatusChange`, `onDelete` through as props.
- **unit-09** (merged) produced `AgentFeedbackToggle` — a `<button role="switch">` with the canonical `aria-label="Show agent feedback inline"`. The sheet composes it at the top of the list region.
- **unit-06** (merged — shell and routing) ships the review-app shell; the FAB mounts at the review-page level, not the shell level. The FAB is `hidden md:hidden` inverse — only rendered on mobile breakpoints (`md:hidden` to hide on desktop+).
- **Design artifact reference**: `stages/design/artifacts/feedback-inline-mobile.html` is the authoritative visible structure. It uses vanilla JS + `[hidden]` attribute + manual inert/aria-hidden on background landmarks — the React port replaces the vanilla controller with native `<dialog>` semantics per the unit spec. Belt-and-suspenders inert+aria-hidden on `<header>` / `<main>` from the HTML artifact is NOT needed because native `<dialog>` top-layer handles it.
- **DESIGN-TOKENS §2.6 / §2.5**: Sheet shell uses `bg-white dark:bg-stone-900`. Header uses `border-b border-stone-200 dark:border-stone-700`. Close button uses `text-stone-600 dark:text-stone-300` + `touchTargetClass` + `focusRingClass`. No other token divergence.
- **DESIGN-BRIEF §6 line 832**: `FeedbackFloatingButton` carries `aria-haspopup="dialog"` + `aria-expanded` + `aria-controls="feedback-sheet"`. `aria-label="Open feedback panel, {count} pending"` when pending > 0, else `aria-label="Open feedback panel"`. Close button carries `aria-label="Close feedback panel"`.
- **DESIGN-BRIEF §6 line 838 divergence**: the brief names `focus-trap-react`. The unit spec (canonical for this unit) names native `<dialog>`. Resolution: follow the unit spec. Document the divergence in `BROWSER-SUPPORT.md` as the rationale for the browser floor. Do NOT install `focus-trap-react`.
- **Native `<dialog>` support**: Chrome 37+, Edge 79+, Firefox 98+ (2022-03), Safari 15.4+ (2022-03). All evergreen browsers now support it. Polyfill path rejected — the unit spec is explicit.
- **Animation token (DESIGN-TOKENS §5 / `feedback-inline-mobile.html` lines 57-72)**: `@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } } .sheet-enter { animation: sheet-up 0.3s ease-out; }`. Reduced-motion branch either drops the class or swaps to a `sheet-enter--reduced` sentinel that the test greps. The choice mirrors unit-09: a class-presence marker, no CSS behavior dependency. Under reduced-motion the class composition drops `sheet-enter` entirely; the stage-wide `@media (prefers-reduced-motion: reduce)` guard in `src/index.css` already clamps `animation-duration: 0.01ms`, so even if the class stayed present the dialog would appear instantly. The sentinel `sheet-enter--reduced` is there for a pure-class assertion in the test harness.
- **`::backdrop` styling**: native `<dialog>` provides `::backdrop` pseudo-element. Style via a CSS block in `src/index.css` OR a scoped `<style>` tag adjacent to the component. Decision: add to `src/index.css` (unit-05 already owns global a11y CSS; one more block is cheap). Class name `feedback-sheet__backdrop` is a no-op at the React level — `::backdrop` is a pseudo-element selected off the `<dialog>` itself. Rule: `dialog.feedback-sheet::backdrop { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); }`. Reduced-motion drops `backdrop-filter` (vestibular trigger).
- **Backdrop click to close**: native `<dialog>` does NOT auto-close on backdrop click. Attach a `click` listener on the dialog element that closes when `event.target === dialog` (click fell through to the `<dialog>` element itself, i.e. backdrop). This is the canonical pattern — MDN documents it.
- **Escape to close**: native `<dialog>` fires a `cancel` event on Escape by default, then closes. The close handler is the `close` event listener, which fires after both Escape-close and `dialog.close()`. Call `dialog.close()` from the close button, and use `addEventListener('close', handler)` to unify cleanup. Prevent `cancel` only if we need to intercept Escape (we don't).
- **Focus-restore on close**: native `<dialog>` does NOT auto-restore focus to the opener. The unit spec's completion criterion "Focus returns to FAB" REQUIRES the close handler to save `document.activeElement` before `showModal()` and `.focus()` it on the `close` event. Implementation: ref-track the FAB element (pass `fabRef` prop or use `aria-controls` lookup); on `close` event, call `fabRef.current?.focus()`.
- **`hidden` attribute vs conditional render**: native `<dialog>` uses `dialog.showModal()` / `dialog.close()` imperatively — the element stays in the DOM always. React approach: render the `<dialog>` unconditionally, use `useEffect` to call `showModal()` / `close()` based on an `open` prop. This is the standard React-native-dialog idiom.
- **The FAB's `aria-expanded`**: flips from `"false"` → `"true"` on open, `"true"` → `"false"` on close. Wired via the `open` prop on the FAB that the sheet toggles through its parent (or via an imperative handle — choose controlled/uncontrolled API below).
- **Stage-wide reduced-motion guard** (`src/index.css` added by unit-05): already enforces `transition-duration: 0.01ms` + `animation-duration: 0.01ms` globally under `prefers-reduced-motion: reduce`. Belt-and-suspenders: the component class composition STILL swaps to the `sheet-enter--reduced` sentinel so the RTL assertion is pure className presence, no CSS dependency in jsdom.

## Git-history signal

- `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx` — does not exist. Greenfield.
- `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx` — does not exist. Greenfield.
- `packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.test.tsx` — does not exist. Greenfield.
- `packages/haiku-ui/BROWSER-SUPPORT.md` — does not exist. Greenfield.
- `packages/haiku-ui/src/index.css` — low-churn. Adds one `::backdrop` block + optional `sheet-enter--reduced` sentinel (pure marker class, no CSS body). Do NOT touch any pre-existing rules.
- `packages/haiku-ui/src/components/feedback/index.ts` — low-churn. Add two exports (`FeedbackSheet`, `FeedbackFloatingButton`) + their type exports.
- `packages/haiku-ui/src/a11y/` — consumed read-only. Do NOT modify.
- `packages/haiku-ui/src/components/feedback/{FeedbackList,AgentFeedbackToggle,...}` — consumed read-only (composition). Do NOT modify.

## Risks & Blockers

1. **jsdom does not implement `HTMLDialogElement.showModal()` / `close()` / top-layer / `::backdrop`**. This is the biggest risk. Vitest uses jsdom which lacks native `<dialog>` methods. Resolution:
   - Check jsdom version in `packages/haiku-ui/package.json` — `jsdom: ^25.0.0`. jsdom 25 partially supports `<dialog>`: `open` property, `show()`, `close()` exist; `showModal()` throws `NotSupportedError` in some versions. Verify with a quick probe in the test setup:
     ```ts
     const d = document.createElement('dialog')
     typeof d.showModal === 'function'  // probe in setup
     ```
   - If `showModal` is missing/throws, shim it in `tests/dialog-polyfill.ts`:
     ```ts
     if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
       HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); }
       HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
     }
     ```
   - The shim is test-only (jsdom). Production browsers use the real implementation.
   - Import the polyfill from `vitest.config.ts` `setupFiles` or the per-test suite `beforeAll`.
   - Assert the test harness works first (one smoke test asserts `dialog.open === true` after `showModal()`) before writing the full suite.

2. **Native `<dialog>` `inert` behavior is not polyfillable in jsdom**. The completion criterion "document.body child elements outside the sheet have `inert` set by the native `<dialog>`" is a PLATFORM behavior that jsdom does not emulate. Resolution per unit spec: use the OR branch — "by native behavior: pressing Tab does not traverse outside the sheet (RTL user-event simulation)". Implementation: Tab simulation in RTL (`userEvent.tab()`) — assert that after N tabs from the last focusable in the sheet, activeElement is still inside the sheet. Since jsdom also does not enforce top-layer, the test harness adds a small Tab-wrap helper INSIDE the component (`onKeyDown` at the dialog level that wraps Tab to first focusable when last focusable would be blurred). This mirrors the focus-trap behavior that native top-layer gives us in real browsers, and makes the Tab-trap assertion PASS in jsdom. Under a real browser (integration/smoke), the native top-layer does the same job — the Tab-wrap handler becomes a no-op because activeElement never escapes to start with.
   - **ALTERNATIVE** (cleaner): reuse `useFocusTrap` from `a11y/focus.ts` as a fallback. When `open === true`, call the hook with the dialog ref. In real browsers the hook's Tab-wrap runs as a belt-and-suspenders guard for browsers/contexts where native top-layer isn't effective (iframes, shadow DOM); in jsdom it IS the only trap. This avoids inventing a new trap. **Chosen**: reuse `useFocusTrap(dialogRef, open)`.
   - NOTE: the "Decision — no fallback for browsers without native `<dialog>`" in the unit spec refers to the ELEMENT, not the focus-trap. Reusing a focus-trap HOOK from the a11y layer does not contradict the decision — the hook is there because jsdom does not emulate top-layer, and it gives a belt-and-suspenders guarantee in real browsers too. The BROWSER-SUPPORT.md doc records this nuance explicitly.

3. **`matchMedia` stub placement** — `useReducedMotion()` reads matchMedia on first render (`useState(() => readInitialMatches())`). Install the stub BEFORE render:
   ```tsx
   beforeEach(() => {
     installMatchMediaStub({ '(prefers-reduced-motion: reduce)': true })
   })
   afterEach(() => {
     restoreMatchMediaStub()
   })
   ```
   The reduced-motion assertion is pure className: `expect(dialog.className).not.toMatch(/sheet-enter\b/)` AND `expect(dialog.className).toMatch(/sheet-enter--reduced/)`.

4. **FAB `aria-expanded` + `aria-controls` wiring** — FAB and Sheet are two components; the FAB needs to know the Sheet's id AND the Sheet's open state AND how to toggle it. Three API options:
   a. **Controlled pair** (parent owns state, passes `open` to both, `onOpenChange` to FAB and Sheet). Cleanest React idiom.
   b. **Compound component** (`<FeedbackSheet.Trigger />` wrapping a context provider). Over-engineered for two consumers.
   c. **Imperative handle** (`const sheetRef = useRef(); sheetRef.current.open()`). Clashes with React render cycle.
   **Chosen**: (a) controlled pair. The sheet accepts `open: boolean` + `onClose: () => void` + `triggerRef: RefObject<HTMLButtonElement>` (for focus restore). The FAB accepts `open: boolean` + `onToggle: () => void` + `count?: number` + `forwardedRef` (so parent can pass the same ref to sheet's `triggerRef`). The parent (review page, unit-07 downstream — not in scope here) owns `const [open, setOpen] = useState(false)` and glues them together.

5. **`onClose` reason discriminator** — close source varies (Escape, backdrop click, dismiss button, programmatic). Unit spec only requires that close happens, not that the reason is surfaced. Keep the API minimal: `onClose: () => void` with no reason. If downstream callers need the source, add later. Don't speculative-type now.

6. **Slide-up animation interacts with `::backdrop`**. The `<dialog>` element's transform animates; the `::backdrop` is painted by the browser and is a separate pseudo. The animation spec is on `.sheet-enter` (applied to the dialog). `::backdrop` either fades (separate keyframe) or appears instantly. Decision: `::backdrop` appears instantly with a 0.15s opacity fade (`@keyframes backdrop-fade-in { from { opacity: 0 } to { opacity: 1 } }`), gated by the same reduced-motion guard.

7. **Scroll lock while open** — native `<dialog>` via `showModal()` already sets `overflow: hidden` on the `<html>` element in most browsers. For jsdom/test environments and safety, additionally set `document.documentElement.style.overflow = 'hidden'` on open and restore on close. Small, idempotent. Document in-code why both exist (platform redundancy).

8. **Pre-existing reliance on `focus-trap-react`**. DESIGN-BRIEF §6 line 838 names the library. Check whether it's already installed or consumed anywhere:
   ```bash
   grep -rn 'focus-trap-react' packages/haiku-ui/
   ```
   Expected result: zero hits (unit-05 foundation rejected it in favor of `useFocusTrap`, per the comment at `a11y/focus.ts:5-11`). Confirm during builder bolt. If a hit exists (from a prior unit), the sheet does NOT import it — DESIGN-BRIEF drift is called out in BROWSER-SUPPORT.md and will be surfaced by stage-wide audit in unit-15.

9. **Close button position / visual parity with artifact**. `feedback-inline-mobile.html` places the ✕ button in the sheet header row, right-aligned, 44×44 hit area. Replicate exactly. `aria-label="Close feedback panel"`. Carries `focusRingClass` and `touchTargetClass`.

10. **No-op open/close idempotency**. Calling `showModal()` on an already-open dialog throws `InvalidStateError` in some browsers. Guard:
    ```ts
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    ```

## Files to Modify

### A. `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx` (NEW)

The component tree:

```tsx
interface FeedbackSheetProps {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  titleId?: string  // defaults to "feedback-sheet-title"
  title?: ReactNode  // defaults to "Feedback"
  children?: ReactNode  // contents (AgentFeedbackToggle, FeedbackList, footer) composed by parent
  className?: string
}
```

Render:

```tsx
<dialog
  ref={dialogRef}
  id="feedback-sheet"
  className={`feedback-sheet ${open ? (prefersReduced ? "sheet-enter--reduced" : "sheet-enter") : ""}`.trim()}
  aria-labelledby={titleId ?? "feedback-sheet-title"}
  // native <dialog> with showModal sets role="dialog" + aria-modal="true" automatically;
  // we belt-and-suspenders set them explicitly for axe + RTL query ergonomics:
  role="dialog"
  aria-modal="true"
>
  <header className="feedback-sheet__header">
    <h2 id={titleId ?? "feedback-sheet-title"} className="text-sm font-semibold text-stone-700 dark:text-stone-300">
      {title ?? "Feedback"}
    </h2>
    <button
      type="button"
      onClick={onClose}
      aria-label="Close feedback panel"
      className={`feedback-sheet__close ${touchTargetClass} ${focusRingClass} ...`}
      data-testid="feedback-sheet-close"
    >
      <span aria-hidden="true">&times;</span>
    </button>
  </header>
  <div className="feedback-sheet__body">
    {children}
  </div>
</dialog>
```

`useEffect` wiring:

- On `open` transition `false → true`: `dialogRef.current?.showModal()`. Scroll-lock `<html>`. `useFocusTrap(dialogRef, open)` handles focus movement to the first tabbable + Tab wrap.
- On `open` transition `true → false`: `dialogRef.current?.close()`. Unscroll-lock. `useFocusTrap` cleanup restores focus (prior active element).
- Attach a single-fire `close` event listener on the dialog that calls `onClose` IFF `open` is still `true` (so Escape-close and backdrop-click-close also propagate). Unlisten on unmount or when `open` flips false.
- Attach a `click` listener on the dialog that calls `onClose` when `event.target === dialogRef.current` (backdrop click).
- Attach a `cancel` listener that lets the default behavior proceed (Escape → close). No preventDefault.
- Focus return to FAB: when the close event fires, `triggerRef.current?.focus()`.

The `useFocusTrap` hook already snapshots `document.activeElement` on enable and restores it on disable. That gives us FAB-restore "for free". But the unit spec completion criterion says "Focus returns to FAB" specifically — if `useFocusTrap`'s restore fires BEFORE React re-renders the FAB's unchanged-identity element, we'd be fine. Belt-and-suspenders: after `onClose` runs, parent re-renders FAB with `aria-expanded="false"`; triggerRef stays the same element; focus was already restored by the hook. Do NOT manually call `triggerRef.current?.focus()` in the close handler — duplicate focus calls can thrash screen readers. Rely on `useFocusTrap`'s built-in restore path.

### B. `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx` (NEW)

```tsx
interface FeedbackFloatingButtonProps {
  open: boolean
  onToggle: () => void
  count?: number  // pending count badge; hidden when undefined or 0
  ariaControlsId?: string  // defaults to "feedback-sheet"
  className?: string
}

export const FeedbackFloatingButton = forwardRef<HTMLButtonElement, FeedbackFloatingButtonProps>(
  function FeedbackFloatingButton({ open, onToggle, count, ariaControlsId, className }, ref) {
    const label = count && count > 0
      ? `Open feedback panel, ${count} pending`
      : "Open feedback panel"
    return (
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-controls={ariaControlsId ?? "feedback-sheet"}
        aria-label={label}
        className={`feedback-fab ... ${touchTargetClass} ${focusRingClass} ${className ?? ""}`}
      >
        <span aria-hidden="true">&#x1F4AC;</span>
        {count && count > 0 ? (
          <span className="feedback-fab__badge" aria-hidden="true">{count}</span>
        ) : null}
      </button>
    )
  }
)
```

Hide on `md:` breakpoint: `md:hidden` at the FAB level (desktop users have the sidebar). Positioning classes: `fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center text-lg`.

Pulse animation `feedback-fab-pulse` is optional / follows the artifact; gated by `useReducedMotion()` — swap to a no-motion marker under reduce. (This matches the artifact line 70-71 comment.) Not in the unit's completion criteria but mirrors the design artifact.

### C. `packages/haiku-ui/src/index.css` (EDIT — additive)

Add a new block near the end:

```css
/* FeedbackSheet — native <dialog> styling */
dialog.feedback-sheet {
  padding: 0;
  border: none;
  max-width: none;
  max-height: none;
  width: 100vw;
  height: 100dvh;
  margin: 0;
  background: white;
  color: inherit;
}

/* dark mode — match design token bg-stone-900 */
:where(.dark) dialog.feedback-sheet {
  background: #1c1917; /* stone-900 */
}

dialog.feedback-sheet::backdrop {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
dialog.feedback-sheet.sheet-enter {
  animation: sheet-up 0.3s ease-out;
}

@keyframes backdrop-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
dialog.feedback-sheet[open]::backdrop {
  animation: backdrop-fade-in 0.15s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  /* Global stage-wide guard already clamps animation-duration to 0.01ms;
     the sentinel class marker is the greppable React-side signal.
     Drop backdrop-filter (vestibular trigger per unit-15 / FB-20). */
  dialog.feedback-sheet::backdrop {
    backdrop-filter: none;
  }
}
```

DO NOT add `.sheet-enter--reduced` CSS — it's a pure marker class, no CSS behavior required. Audit-wise, it's a className literal in the TSX, not a CSS selector.

### D. `packages/haiku-ui/BROWSER-SUPPORT.md` (NEW)

```md
# Browser Support — haiku-ui

## Native `<dialog>` element — required

The review app uses the native HTML `<dialog>` element for modal surfaces
(`FeedbackSheet`, downstream revisit modal, annotation popover) and requires
browser support for it. No polyfill is bundled.

### Minimum versions

- Chrome / Edge / any Chromium browser: **≥ 37** (2014)
- Firefox: **≥ 98** (2022-03)
- Safari: **≥ 15.4** (2022-03, macOS 12.3 / iOS 15.4)

All evergreen browsers support the element. Pre-2022 Safari / Firefox builds
are outside the support matrix for this app.

### Rationale

- Native `<dialog>` handles focus trap, top-layer, backdrop, and background
  inert at the platform level. Polyfills (`dialog-polyfill`) implement these
  in JavaScript and drag in a tab-order enumerator that diverges from the
  platform in edge cases (shadow DOM, contenteditable).
- Bundling a polyfill adds ~8 KB for a degraded experience in a browser tier
  the app does not target.
- unit-10 tactical plan documents this decision.

### Divergence from DESIGN-BRIEF.md §6 line 838

DESIGN-BRIEF names `focus-trap-react` as the canonical focus-trap library.
unit-10 diverges: the native `<dialog>` element handles focus trap via its
top-layer semantics, so `focus-trap-react` is not installed or imported.
The a11y foundation's `useFocusTrap` hook (`src/a11y/focus.ts`) is used as
a belt-and-suspenders guard for jsdom tests and any future edge-case
contexts (iframe-inside-dialog, shadow-DOM tabbable discovery).

When DESIGN-BRIEF is next updated, revise §6 to name native `<dialog>` +
`useFocusTrap`.
```

### E. `packages/haiku-ui/src/components/feedback/index.ts` (EDIT — additive)

Append (alphabetical insertion):

```ts
export type { FeedbackFloatingButtonProps } from "./FeedbackFloatingButton"
export { FeedbackFloatingButton } from "./FeedbackFloatingButton"
export type { FeedbackSheetProps } from "./FeedbackSheet"
export { FeedbackSheet } from "./FeedbackSheet"
```

### F. `packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.test.tsx` (NEW)

Test harness setup:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef, useState } from "react"
import { LiveRegionShell } from "../../../a11y/live-regions"
import { FeedbackSheet } from "../FeedbackSheet"
import { FeedbackFloatingButton } from "../FeedbackFloatingButton"
import { installMatchMediaStub, restoreMatchMediaStub } from "../../../a11y/__tests__/matchMedia.stub"

// Polyfill HTMLDialogElement methods if jsdom lacks them.
beforeEach(() => {
  if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "")
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open")
      this.dispatchEvent(new Event("close"))
    }
  }
  installMatchMediaStub({ "(prefers-reduced-motion: reduce)": false })
})

afterEach(() => {
  restoreMatchMediaStub()
  cleanup()
})
```

Host component (mirrors review-page wiring):

```tsx
function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const fabRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <LiveRegionShell />
      <FeedbackFloatingButton ref={fabRef} open={open} onToggle={() => setOpen(o => !o)} count={3} />
      <FeedbackSheet open={open} onClose={() => setOpen(false)} triggerRef={fabRef}>
        <button type="button" data-testid="dismiss">Dismiss</button>
        <button type="button" data-testid="verify-close">Verify & Close</button>
      </FeedbackSheet>
    </>
  )
}
```

Test cases (ONE per Completion Criterion):

1. **Dialog semantics present when open** (CC1):
   - Render `<Harness initialOpen />`.
   - `screen.getByRole('dialog', { name: /feedback/i })` resolves.
   - `expect(sheet).toHaveAttribute('aria-modal', 'true')`.
   - `expect(sheet).toHaveAttribute('aria-labelledby', 'feedback-sheet-title')`.
   - `within(sheet).getByText('Feedback')` has `id="feedback-sheet-title"`.

2. **Focus lands on first focusable child on open** (CC2a):
   - Render `<Harness />`; click FAB via user-event.
   - `expect(screen.getByTestId('feedback-sheet-close')).toHaveFocus()`.
   - NOTE: the first focusable is the close ✕ button (header). The spec's example `getByRole('button', {name: /dismiss/i})` assumes dismiss is first — but the close button is first in DOM order per the header-before-body structure. Resolve by asserting the close button has focus (it IS the first focusable). If the spec demands dismiss-first, re-order: move close button after body children. **Chosen**: assert `close` has focus — it's the canonical header-first pattern from the HTML artifact. Update the completion-criteria interpretation: "first focusable child" means first tabbable, which IS the close button per DOM order in the reference artifact.

3. **Tab does not traverse outside the sheet** (CC2b — focus-trap):
   - Render `<Harness initialOpen />`.
   - Get all focusables inside the sheet. Press `Tab` N times where N = focusables.length + 2 (wrap past end).
   - After each Tab, assert `document.activeElement` is inside `sheet`.
   - Final activeElement should be the first focusable (Tab wrap to start).
   - Use `userEvent.setup()` then `await user.tab()` (N iterations).

4. **Escape closes + focus returns to FAB** (CC3a):
   - Render `<Harness initialOpen />`.
   - Dispatch a REAL Escape keydown on the dialog root (or `document` if the component listens at document level): `fireEvent.keyDown(sheet, { key: 'Escape', code: 'Escape' })` OR `await user.keyboard('{Escape}')`.
   - **DO NOT short-circuit by calling `(sheet as HTMLDialogElement).close()` directly.** That path only exercises the `close`-event listener, not the keyboard input path — the test name claims "Escape-driven close" but a direct `.close()` call leaves the Escape binding untested. If the component's Escape handler regresses (handler removed, wrong key, wrong target), the test must fail. See FB-60 for the anti-pattern to avoid.
   - Because native `<dialog>` fires `cancel` → `close` on Escape automatically in real browsers, and the jsdom polyfill installed in this test file emulates the same chain through the shimmed `close()` method, the component wiring under test is: Escape keydown → native `cancel` (default not prevented) → `dialog.close()` → `close` event → parent `onClose` → FAB focus restore. The test exercises the full chain by dispatching the keydown event only.
   - jsdom caveat: jsdom 25 does not auto-fire `cancel` on `keydown(Escape)`. If the raw keydown alone does not trip the close path in jsdom, add a component-level `keydown` handler on the dialog that calls `dialog.close()` when `event.key === 'Escape'` — this is a belt-and-suspenders emulation that makes the test deterministic AND matches real-browser behavior. Wire it alongside the existing `click` and `close` listeners in the same `useEffect` so it lives/dies with `open`. In real browsers the handler is redundant with the native `cancel` → `close` path; in jsdom it IS the close path. Document the rationale in a comment.
   - Wrap the dispatch in `act(() => { ... })` and `await waitFor(...)` before asserting, so React flushes the `setState` triggered by `onClose` and the FAB-focus-restore effect cleanup runs before the assertions.
   - Assert: `expect(onCloseSpy).toHaveBeenCalled()`, `expect(screen.queryByRole('dialog')).toBeNull()` (the `open` attribute is removed — `getByRole` won't resolve), and `expect(screen.getByRole('button', { name: /open feedback panel/i })).toHaveFocus()`.
   - Reviewer check: test name and test body must match — if the test name says "Escape-driven close path", the body MUST dispatch an Escape key event. Any comment block that rationalises calling `dialog.close()` in place of the key dispatch is a red flag and must be removed along with the `.close()` call.

5. **Close button closes + focus returns to FAB** (CC3b):
   - Render `<Harness initialOpen />`.
   - Click close button. Assert dialog closed. Assert FAB has focus.

6. **Backdrop click closes** (CC3c):
   - Render `<Harness initialOpen />`.
   - Fire click on the dialog element itself (`event.target === dialog` equivalent).
   - NOTE: jsdom does not paint the ::backdrop, so the "backdrop click" is simulated by firing click with `target === dialog`. Use `fireEvent.click(dialogEl, { target: dialogEl })` OR trigger a synthetic click on the dialog.
   - Assert closed + FAB focused.

7. **Accessibility tree resolves** (CC4):
   - Render `<Harness initialOpen />`.
   - `expect(screen.getByRole('dialog', { name: /feedback/i })).toBeTruthy()`.

8. **Reduced-motion swaps animation class** (CC5):
   - `beforeEach` override: `installMatchMediaStub({ "(prefers-reduced-motion: reduce)": true })`.
   - Render `<Harness initialOpen />`.
   - Get dialog element. `expect(dialog.className).toMatch(/sheet-enter--reduced/)`. `expect(dialog.className).not.toMatch(/sheet-enter(?!--reduced)\b/)`.

9. **FAB aria-expanded flips on open/close** (ancillary):
   - Render `<Harness />`.
   - FAB `aria-expanded="false"`. Click FAB. Sheet opens. FAB `aria-expanded="true"`. Close. Back to `"false"`.

10. **FAB aria-label reflects count** (ancillary):
    - Render with count=3 → `aria-label="Open feedback panel, 3 pending"`.
    - Render with count=0 → `aria-label="Open feedback panel"`.
    - Render without count → `aria-label="Open feedback panel"`.

11. **No inert leak** (ancillary, jsdom caveat):
    - Since jsdom does not enforce top-layer, this test asserts the behavior the component wires — either (a) the `document.documentElement` has a scroll-lock style on open and lacks it on close; or (b) the Tab-doesn't-escape assertion from test 3 already covers this. Keep (a) as the ancillary assertion.

### G. `packages/haiku-ui/src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx` (NEW, small)

Basic states + a11y:
- Default render: button present, `aria-haspopup="dialog"`, `aria-expanded="false"`, count badge when > 0.
- Count = 0: no badge, `aria-label="Open feedback panel"`.
- Click: `onToggle` called.
- Ref forwarding: `forwardRef` surfaces the button element.
- Focus ring + touch target classes present.

### H. `packages/haiku-ui/src/a11y/__tests__/matchMedia.stub.ts`

Consumed READ-ONLY. Verify the stub exports `installMatchMediaStub` + `restoreMatchMediaStub` (or equivalent). If the signature differs, adapt at call site — do NOT modify the stub.

### I. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-10-tactical-plan.md` (NEW — this file)

## Verification Commands

Run in order from `packages/haiku-ui`. Each exit-0 is a hard gate.

1. **Typecheck** (completion criterion `npx tsc --noEmit`):
   ```bash
   cd packages/haiku-ui && npx tsc --noEmit
   ```
   Must exit 0.

2. **New unit tests**:
   ```bash
   cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackSheet.test.tsx src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx
   ```
   All 11+ test cases pass.

3. **Full test suite (regression sweep)**:
   ```bash
   cd packages/haiku-ui && npx vitest run
   ```
   Must exit 0 across every pre-existing test — no pre-existing-issue excuses.

4. **Banned-patterns audit — stage-wide**:
   ```bash
   cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=stage-wide
   ```
   Must exit 0. Verifies no banned text-size / opacity / stone-400 / etc. hits in the new files.

5. **Banned-patterns audit — tokens**:
   ```bash
   cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=tokens
   ```
   Must exit 0.

6. **Biome lint**:
   ```bash
   cd packages/haiku-ui && npx biome check src/components/feedback/FeedbackSheet.tsx src/components/feedback/FeedbackFloatingButton.tsx src/components/feedback/__tests__/FeedbackSheet.test.tsx src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx
   ```
   Must exit 0 (if the package exposes biome; otherwise skip).

7. **Build (smoke)**:
   ```bash
   cd packages/haiku-ui && npx tsc -b && npx vite build
   ```
   Optional but catches CSS import + module resolution errors.

## Commit Sequence (this unit)

1. **Plan commit** (this file): `haiku(unit-10/planner): tactical plan for FeedbackSheet + FAB`.
2. **Builder bolt 1 — primitives + CSS**:
   - `FeedbackFloatingButton.tsx` + `FeedbackFloatingButton.states.test.tsx`
   - `src/index.css` additive block (dialog + backdrop + keyframes)
   - `BROWSER-SUPPORT.md`
   - Barrel export update
   - Commit: `haiku(unit-10/builder): FAB + dialog CSS + browser-support doc`
3. **Builder bolt 2 — sheet component**:
   - `FeedbackSheet.tsx`
   - `FeedbackSheet.test.tsx` — full 11-case matrix
   - Barrel export update
   - Commit: `haiku(unit-10/builder): native <dialog> FeedbackSheet with focus trap + reduced-motion + tests`
4. **Builder bolt 3 (if needed)** — refinements from typecheck / test / audit feedback.
5. **Reviewer** — final pass.

Builder should commit in logical chunks within each bolt — one concern per commit — so rollback is surgical. Imperative commit subjects prefixed `haiku(unit-10/{hat}):`.

## Downstream Consumers (for context, not this unit's scope)

- **unit-07** (review-page-desktop-and-mobile) composes `FeedbackFloatingButton` + `FeedbackSheet` inside the review page; owns the `open`/`onToggle` state and the `fabRef` wiring.
- **unit-15** (stage-wide audit) re-runs both audit profiles against all stage outputs — this unit's additions are picked up automatically.
- **unit-13** (aria + semantic structure) confirms the `role="dialog"` + `aria-modal="true"` + `aria-labelledby` triad at the review-page level.

## Summary

Tight, test-first greenfield component pair under focused scope: one dialog (`FeedbackSheet`), one trigger (`FeedbackFloatingButton`), one CSS additive block, one browser-support doc, one 11-case test suite. Native `<dialog>` replaces the design-brief's `focus-trap-react` — the divergence is documented in `BROWSER-SUPPORT.md` with the divergence rationale. The `useFocusTrap` a11y primitive is reused as a belt-and-suspenders guard for jsdom and any edge-case contexts in real browsers. Every Completion Criterion maps to a concrete RTL assertion with a specific API call; no speculative abstractions.
