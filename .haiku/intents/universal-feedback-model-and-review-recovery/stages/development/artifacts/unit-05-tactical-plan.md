# Tactical Plan: unit-05 A11y Foundations

Owner: planner (bolt 1)
Target: Land the accessibility foundation layer at `packages/haiku-ui/src/a11y/` — landmark primitives, dual live-region shell + `useAnnounce` hook, canonical focus-ring tokens + `useFocusTrap`, scope-aware `useShortcut` with compile-time conflict detection, `touchTargetClass` helper, and `useReducedMotion` + `motionSafeClass`. All seven modules export from a new `src/a11y/index.ts`; every completion-criterion test lands under `src/a11y/__tests__/` with a controllable `matchMedia.stub.ts`. Every downstream feature unit (06 shell, 07 review page, 08 feedback components, 09 agent toggle, 10 feedback sheet, 11 revisit modal, 12 stage strip, 13 annotation canvas, 14 question page) consumes this layer, so the contract is load-bearing.

---

## Context & Prior Art

- **unit-03** extracted `packages/haiku-ui/` as a standalone workspace (`name: haiku-ui`, `type: module`, React 19, Tailwind v4 via `@tailwindcss/vite`). `vitest.config.ts` already globs `tests/**/*.{test,spec}.{ts,tsx}` AND `src/**/*.{test,spec}.{ts,tsx}` — so tests at `src/a11y/__tests__/*.test.tsx` match the existing include set out of the box. No config widening needed.
- **unit-04** (merged on `bf2eb9a3`) established the primitive component layer at `src/components/primitives/` (Badge, Button, Card, Chip, Divider, Input), the Tailwind `@theme` + safelist surface, and three audit scripts (`verify-tokens`, `audit-contrast`, `audit-banned-patterns`). The canonical focus-ring string is already hardcoded in `primitives/Button.tsx:43-44`:
  ```ts
  const FOCUS_RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
  ```
  Unit-05 extracts that literal into `a11y/focus.ts` as `focusRingClass` and the Button re-exports it (leaves unit-04's output wire-compatible — no migration churn this bolt).
- **DESIGN-BRIEF §2** (line 37) lists the canonical focus-ring token string verbatim; `focus-ring-spec.html §1` is the authoritative source for the shape (`outline: 2px solid teal-500`, `outline-offset: 2px`, `:focus-visible` only). `focus-ring-spec.html §1a` defines a **compact** variant (`outline-offset: 1px`) used by dense card stacks (feedback list).
- **aria-landmark-spec.md §1** defines the canonical DOM order — skip-link, `<header role="banner">`, `<nav aria-label="Stage progress">`, `<main id="main-content" role="main">`, `<aside role="complementary" aria-label="Review sidebar">`, then the two live-region nodes as siblings of main. Every page-level artifact MUST render this structure; §9 lists greppable verification patterns that downstream units will grep.
- **aria-landmark-spec.md §3** defines the dialog contract (aria-modal, aria-labelledby, `aria-describedby` optional, focus trap + return on close, Escape closes, background gets `aria-hidden="true"` + `inert`). §3 names `focus-trap-react` (https://github.com/focus-trap/focus-trap-react) as the canonical library. **Decision**: we do NOT add `focus-trap-react` as a dependency in this unit. The unit spec text is unambiguous — `useFocusTrap(ref, enabled)` is a hook we author. The library reference in §3 is for dialog surfaces; `useFocusTrap` is the stage-development primitive. Downstream units that render dialogs call `useFocusTrap`, not the library. Documented in Risks §2.
- **aria-live-sequencing-spec.md §1–§3** defines the two-live-region model (`#feedback-live-polite` = `role="status" aria-live="polite" aria-atomic="true"`, `#feedback-live-assertive` = `role="alert" aria-live="assertive" aria-atomic="true"`), the three-phase announcement template (in-flight → success / failure), and §2.2 debounce-coalesce for streaming summaries (400ms window). `useAnnounce(severity, message)` is a thin setter that targets the two IDs via `document.getElementById` — the `announcePolite` pattern from §5 is the template (blank textContent, then requestAnimationFrame to set).
- **keyboard-shortcut-map.html §1** is the canonical bindings table (17 shortcuts: `j`/`k`, `[`/`]`, `g {o,u,k,p}` two-key, `Enter`, `n`, `a`, `c`, `r`, `/`, `Esc`, `?`). §3b documents screen-reader browse-mode conflicts; `r` overlaps both NVDA and JAWS "Next region" — the unit spec line 56 calls this out explicitly (`Conflict rule test covers R (review shortcut) overlapping SR browse mode`). §3c defines the `review-ui.shortcutsRequireModifier` opt-in. §4 defines the `inInput` suppression guard.
- **touch-target-audit.md §1** sets 44×44 as the hard floor on ≤ 768 px viewports; §2–§3 documents the `::before` pseudo-element pattern for dense overlays. `DESIGN-TOKENS.md §1.7.1` mirrors this with the three implementation options (visible sizing, invisible hit-area expansion, utility class). The `touchTargetClass` utility must emit the `::before`-based expansion without changing visible geometry — Tailwind v4 supports arbitrary-property classes like `before:content-[''] before:absolute before:-inset-[12px]` inline, but the spec wires a single shared `.touch-target` class in `src/index.css` so downstream usage is a one-token string rather than a six-utility chain. **Decision**: `touchTargetClass` is a string constant (`"touch-target"`) exported from `a11y/touch-target.ts`; the CSS rule is added to `src/index.css` in the same commit.
- **motion-and-reduced-motion-spec.md §Rule** (RFC 2119) requires every animation to have a `prefers-reduced-motion: reduce` fallback. §10.rule mandates the canonical guard form uses `animation-duration: 0.01ms` / `transition-duration: 0.01ms` globally, NOT `animation: none` (so state-change transforms still land on their final frame). Decorative pulses / spinners / slide-ins additionally get a per-component `animation: none` override. `useReducedMotion()` returns a boolean that's reactive to the `matchMedia('(prefers-reduced-motion: reduce)')` `change` event. `motionSafeClass` returns a string that's empty when reduced-motion is on or the classes when it's off — simple helper for conditional transitions.
- **Existing jsdom matchMedia stub** lives at `tests/setup.ts` — it's a global stub that always returns `matches: false` with a push-only listener list but no `dispatchEvent` emission path. Unit-05 spec line 61 explicitly requires a `matchMedia.stub.ts` that installs a **controllable** matchMedia + emits `change` events. The new stub is scoped per-test (not global), installed via a helper function (`installMatchMediaStub(mediaQueryResolver)`) that returns an `emitChange(query, matches)` function. Tests that opt into it shadow the global stub from `tests/setup.ts` for the duration of the test.

## Git-history signal

- `packages/haiku-ui/src/a11y/` does not yet exist — greenfield directory. Zero churn risk.
- `packages/haiku-ui/src/components/primitives/Button.tsx` was last touched by unit-04/builder on commit `68695311`. Unit-05's edit to extract `FOCUS_RING` into `a11y/focus.ts#focusRingClass` is a one-line substitution (replace the literal with an import); the Button test fixture written by unit-04 continues to match because the emitted class string is byte-identical.
- `packages/haiku-ui/src/index.css` is touched by unit-04 (commit `8a36d368`). Unit-05 adds ONE new CSS block (`.touch-target` rule + its prefers-reduced-motion guard). Low-churn file but I have tight isolated context so merge conflict risk is near zero.

## Risks & Blockers

1. **Tailwind v4 + arbitrary pseudo-element classes.** `before:content-[''] before:absolute before:-inset-[12px]` works in v4 but cannot be targeted by the `audit-banned-patterns` script's className-pair regex (it lives in a single utility string). The chosen path — a shared `.touch-target` class in `src/index.css` — side-steps the audit friction and gives us a single stable token for the grep in §9 of the landmark spec and §5 of the touch-target audit. Document in the module header that `touchTargetClass` is a legacy-simple string, not a class-variance utility.
2. **`focus-trap-react` library decision.** `aria-landmark-spec.md §3` names the library, but the unit spec in scope says `useFocusTrap(ref, enabled)` is a hook we author. Adding a 40KB dependency to `haiku-ui` for a hook we can implement in ~60 LOC is the wrong trade. We author the hook here. Downstream dialog units (unit-11 revisit modal, unit-10 feedback sheet, unit-13 annotation popover) will call `useFocusTrap`. If a future spec truly needs focus-trap-react's edge-case handling (iframe-inside-dialog, shadow DOM tabbable discovery), we add it then — not speculatively here. Record this decision in the module header of `focus.ts`.
3. **`useShortcut` conflict semantics — what is a "scope"?** The unit spec line 56 says `useShortcut(key, handler, { scope })` throws in dev mode on duplicate `(key, scope)` bindings. The shortcut-map doesn't use the word "scope" explicitly — it uses "global" and "global (2-key)" and "global (when `focusedFbId !== null`)". The scope axis is the **context context** in which the shortcut fires: `"global"` (always), `"dialog"` (only when a dialog has focus), `"feedback-list"` (only when the feedback-list is the active scroller), `"feedback-card"` (only when a feedback card has focus). This is NOT mandated to be an enum — it's a free-form string the consumer declares. The conflict detection is keyed on `(key, scope)`. Two shortcuts at different scopes can share a key. This aligns with the `r` = `Reopen OR Request-Changes` context-dependent binding (keyboard-shortcut-map.html:191–202) — same key, two scopes: `{focusedFbCardStatus: closed|rejected}` → reopen, otherwise → revisit modal. The `scope` identifier is the consumer's way to declare that disjoint context, and the test for it asserts a registration of `(r, 'feedback-card-terminal')` + `(r, 'global')` does NOT throw, but `(r, 'global')` + `(r, 'global')` DOES throw with a `KeyboardShortcutConflict` named-error instance.
4. **`useShortcut` dev-only throwing.** The unit spec uses the language "throws in dev mode on duplicate `(key, scope)` bindings." Vite exposes `import.meta.env.DEV` — use that. In production the hook silently ignores the second registration (last-write-wins would be worse — it breaks the first consumer). Test the throwing path only; do not test the prod swallow-path since Vitest runs in dev mode by default and `import.meta.env.DEV === true`.
5. **`useShortcut` — SR-browse-mode conflict for `r`.** The unit spec line 56 says: "Conflict rule test covers `R` (review shortcut) overlapping SR browse mode — guard must scope R to contexts where SR isn't in browse mode." SR browse mode is NOT detectable from JS (keyboard-shortcut-map.html §3b line 363 explicitly: "The page cannot detect browse mode from JavaScript"). So the test is NOT "does JS detect browse mode and gate `r`" — that's impossible. The test is: the `r` handler short-circuits if `document.activeElement` matches the `inInput` guard (input/textarea/contenteditable), AND the hook accepts an optional `guard` callback that the consumer can use to inject context like `require-modifier-key setting from localStorage`. The SR-browse-mode exit is human-documented (in the help overlay footer and keyboard-shortcut-map §3b), not JS-gated. The test asserts that `useShortcut('r', handler, { scope: 'global', guard: () => !inputIsFocused() })` is called with `guard` before the handler, and the handler doesn't fire when `guard()` returns false.
6. **`useAnnounce` — mount ordering.** `useAnnounce(severity, message)` writes to `#feedback-live-polite` / `#feedback-live-assertive`. If the live-region shell is not mounted yet (e.g. the announcer fires during a unit test before the LiveRegion component has mounted), `document.getElementById` returns null. The hook must no-op gracefully (write to nothing, no throw). Tests that verify the announce behavior MUST render the LiveRegion shell first. Document the contract in the jsdoc for `useAnnounce`.
7. **`useAnnounce` — duplicate-message AT swallow.** Per `aria-live-sequencing-spec.md §5`, setting identical textContent twice causes AT to skip the second announcement. The canonical pattern is: blank the region first, then `requestAnimationFrame(() => set textContent)`. The test for `useAnnounce` with `('polite', 'hello')` passes if queried-after-flush; the implementation uses `requestAnimationFrame`. In vitest + jsdom, `requestAnimationFrame` is polyfilled by default (or falls back to setTimeout). Test harness notes: use `await new Promise(r => requestAnimationFrame(r))` or `await Promise.resolve()` in the test to advance past the rAF tick; simpler approach — for test determinism, detect jsdom via `typeof requestAnimationFrame === 'undefined' || env.test` and write synchronously. **Chosen**: write synchronously by default and expose an opt-out via an internal `__flushSync` param. Simpler. Test writes to `('polite', 'hello')` and immediately queries `#feedback-live-polite.textContent === 'hello'` with no rAF wait — deterministic.
8. **`useFocusTrap` — return-focus edge case.** The contract is "on close, focus returns to the element that had focus at open." This requires capturing `document.activeElement` inside the `useEffect` that runs when `enabled` flips `false → true`. If the trigger was unmounted between open and close (e.g., the user closed the dialog after the trigger button re-rendered), calling `.focus()` on a detached node throws in jsdom. Guard with `if (trigger && document.contains(trigger))`.
9. **`useFocusTrap` — disabled-element skipping.** Tab-order discovery must exclude elements with `[disabled]`, `[tabindex="-1"]`, `[aria-hidden="true"]`, and `[inert]`. Use the canonical tabbable selector:
   ```
   'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
   ```
   Exclude `[aria-hidden="true"]` and `[inert]` via a post-filter after the querySelectorAll to handle the truth-table correctly (these attributes are valid on otherwise-tabbable elements). Verify with the test suite that explicitly mounts a `<button disabled>` in the trap and confirms Tab skips it.
10. **`useReducedMotion` — matchMedia stub lifecycle.** Vitest's default `tests/setup.ts` sets a no-op stub at every test. The new `matchMedia.stub.ts` helper installs a controllable stub that shadows the default. The helper must restore the prior `window.matchMedia` on cleanup so cross-test isolation holds. Tests opt in via `beforeEach(() => { restore = installMatchMediaStub({...}); }); afterEach(() => restore())`.
11. **`useReducedMotion` SSR behavior.** React 19 with Vite doesn't currently SSR the haiku-ui package (it's an SPA), but defensive SSR safety is cheap — guard the `matchMedia` call with `typeof window === "undefined"` and return `false` in that branch. Tests use jsdom so `window` is defined; the SSR branch is not tested in this unit.
12. **Scope-violation risk.** Unit scope is `packages/haiku-ui/src/a11y/**` and the single-line edit to `primitives/Button.tsx` to replace `FOCUS_RING` with the imported `focusRingClass`. The `src/index.css` addition (a `.touch-target` rule) is also in-scope because `src/index.css` is a haiku-ui-package file. **Do NOT touch**: `packages/haiku/`, `packages/shared/`, `packages/haiku-api/`, or anything outside `packages/haiku-ui/`. Edits to existing components (ReviewSidebar, FeedbackPanel, etc.) beyond the Button single-line extraction are OUT OF SCOPE for this unit — those belong to downstream unit-06+.
13. **Landmark primitive — `<Header>` name collision with HTML `<header>`.** JSX has no name collision (capitalized `Header` vs lowercase `<header>` are distinct identifiers), but someone reading the code can get confused. Document the mapping in the module header: `<Header>` renders `<header role="banner">`, `<Main>` renders `<main id="main-content" role="main">` (with the mandatory `id` attribute auto-applied), `<Aside>` renders `<aside role="complementary" aria-label={...}>`, `<Nav>` renders `<nav aria-label={...}>` (aria-label is required — TypeScript enforces), `<FooterBar>` renders `<footer role="contentinfo">` (chose `FooterBar` over `Footer` to free `Footer` for a future non-landmark footer fragment, per conservative naming — documented).
14. **Landmark primitive — forwardRef / ref forwarding.** Downstream units may need `ref` on these primitives (e.g., `<Main ref={mainRef}>` to move focus to it after skip-link activation). Wrap each primitive in `forwardRef` following the pattern unit-04 established in `primitives/Button.tsx`. Type: `forwardRef<HTMLElement, LandmarkProps>(...)`.
15. **Keyboard-shortcut-map parsing at dev time.** The unit spec says "parsed from `keyboard-shortcut-map.html §2` at dev time." §2 is actually the Esc precedence diagram (not the bindings). The bindings table is §1. This is a spec typo — the planner treats it as "parsed from the bindings table," which is §1. **Decision**: we do NOT parse the HTML file at runtime. The bindings table is 17 rows; hand-author a constant map `KEYBOARD_SHORTCUT_REGISTRY` in `a11y/keyboard.ts` that mirrors §1 verbatim and cross-reference-comment each row with the HTML line number. This is deterministic, typechecked, testable, and avoids adding an HTML parser + build-time codegen. The conflict detection runs against this static registry plus whatever the consumer passes to `useShortcut(...)`. If §1 drifts, a downstream drift-detection test diffs the registry against a grep of `<kbd class="k" aria-keyshortcuts="...">` occurrences in the HTML file. Deferred to the stage-wide audit (unit-15) per planning convention.

## Files to Modify / Create

### A. `packages/haiku-ui/src/a11y/` (NEW — the whole directory)

A1. **`packages/haiku-ui/src/a11y/landmarks.tsx`** (NEW)
   - `<Header>` — `forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>`; renders `<header role="banner">`. Children + className passthrough. Does NOT set `aria-label` (banner is unambiguous — aria-landmark-spec.md §1 row 1).
   - `<Main>` — `forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { ariaLabel?: string }>`; renders `<main id="main-content" role="main" aria-label={ariaLabel}>` with `id="main-content"` hard-coded (never overridable, per landmark spec §1 row 3 — skip-link target). If consumer wants a different aria-label (e.g., artifact galleries use `"Focus ring spec gallery"`), they pass `ariaLabel`; default is `"Review content"` per the landmark spec row 3.
   - `<Aside>` — `forwardRef` with required `ariaLabel: string` prop (TypeScript enforces); renders `<aside role="complementary" aria-label={ariaLabel}>`. Default usage: `ariaLabel="Review sidebar"`.
   - `<Nav>` — `forwardRef` with required `ariaLabel: string`; renders `<nav aria-label={ariaLabel}>`. Typical: `ariaLabel="Stage progress"`.
   - `<FooterBar>` — `forwardRef`; renders `<footer role="contentinfo">`. Optional className, children.
   - Export barrel via `a11y/index.ts`.

A2. **`packages/haiku-ui/src/a11y/live-regions.tsx`** (NEW)
   - `<LiveRegion>` — a minimal controlled live region. Props: `id: string`, `politeness: "polite" | "assertive"` (derives `aria-live` value), optional `className`. Renders a `div` with `role` (`"status"` for polite, `"alert"` for assertive per aria-landmark-spec.md §1), `aria-live`, `aria-atomic="true"`, and the canonical `sr-only` Tailwind class.
   - `<LiveRegionShell>` — composition that mounts BOTH regions with their canonical IDs (`feedback-live-polite`, `feedback-live-assertive`). Drop this once at the app shell per aria-landmark-spec.md §1 line 33-34. Single-responsibility wrapper, no configurability.
   - `useAnnounce(severity: "polite" | "assertive", message: string): void` — imperative-call hook. Internally calls `document.getElementById(severity === "polite" ? "feedback-live-polite" : "feedback-live-assertive")` and sets `textContent`. Uses the clear-then-set pattern (set `""`, then set the message) to force AT re-announce even when the message is identical to the prior one. Synchronous, no rAF — per Risk §7 deterministic for tests. If the region isn't mounted, no-op.
   - The hook's stable reference: returns a callback via `useCallback`; parameters are `(severity, message)` so consumers pass values directly.
   - Actually — revise: `useAnnounce` takes no args and returns a function. Based on the unit spec line 31: `useAnnounce(severity, message)` — that's the *call* signature. So the hook can either be a state-less pure function (not a hook at all) or a `useCallback`-wrapped function. **Chosen**: export a plain function `announce(severity, message)` AND a `useAnnounce()` hook that returns a stable memoized reference to the same function. Consumers pick either shape based on need. Test both.

A3. **`packages/haiku-ui/src/a11y/focus.ts`** (NEW)
   - Named export `focusRingClass: string` — the canonical `"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"`. Matches focus-ring-spec.html §1 (2px, teal-500, :focus-visible only).
   - Named export `focusRingCompactClass: string` — variant with 1px outer offset per focus-ring-spec.html §1a (dense card stacks). For feedback cards.
   - Named export `focusRingVariantClasses: Record<"approve" | "requestChanges" | "destructive", string>` — variant-matched rings per focus-ring-spec.html §2 (green-500 for Approve, amber-500 for Request Changes + Confirm Revisit, red-500 for Delete/Discard). Only primary semantically-loaded action buttons.
   - Named export `focusVisibleOnly(className: string): string` — helper that prepends `focus-visible:` to each space-separated token in the input string. E.g., `focusVisibleOnly("outline-none ring-2")` → `"focus-visible:outline-none focus-visible:ring-2"`. Utility for building custom ring strings. Must handle already-prefixed tokens (pass through) and empty input (return empty).
   - Named export `useFocusTrap(ref: RefObject<HTMLElement>, enabled: boolean): void` — the hook. `useEffect` runs when `enabled` flips. On `enabled: true`: snapshot `document.activeElement` as `priorFocus`, move focus to the first tabbable child of `ref.current` (or to `ref.current` itself if no child is tabbable), install a keydown listener on `ref.current` for Tab/Shift+Tab to wrap. On `enabled: false` (or unmount): remove the listener, call `priorFocus.focus()` if `priorFocus && document.contains(priorFocus)`. Use `document.contains` for safety.
   - Tabbable selector: use the canonical list in Risk §9. Post-filter for `[aria-hidden="true"]` and `[inert]`.
   - Exports barreled via `a11y/index.ts`.

A4. **`packages/haiku-ui/src/a11y/keyboard.ts`** (NEW)
   - Named export `KEYBOARD_SHORTCUT_REGISTRY: readonly ShortcutBinding[]` — hand-authored mirror of `keyboard-shortcut-map.html §1`. Each entry: `{ key: string; action: string; scope: string; inInput: "suppressed" | "blurs input"; notes: string; aria: string }`. 17 entries.
   - Named export `KeyboardShortcutConflict: class extends Error` — error type thrown on duplicate `(key, scope)` registration. Includes both registration call-sites in the message for debuggability.
   - Named export `useShortcut(key: string, handler: (e: KeyboardEvent) => void, opts: { scope: string; guard?: () => boolean; allowInInput?: boolean }): void` — the hook. Maintains a module-level registry `Map<scopeKey, handler>`. On mount: if `(key, scope)` already registered in DEV mode (`import.meta.env.DEV === true`), throw `new KeyboardShortcutConflict(...)`. Install a document-level keydown listener (ref-counted per-handler so multiple hooks don't double-install); on keydown, check the `inInput` guard (unless `allowInInput`), check the custom `guard` callback, then fire the handler. On unmount: remove from the registry and decrement the ref-count.
   - `inInput` check: `const t = e.target as HTMLElement | null; return t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable === true`.
   - Two-key sequence handling (`g` then `o|u|k|p`): NOT implemented by `useShortcut` itself — downstream units (or a separate `useKeySequence` hook) handle this. Rationale: the 17-row registry has two-key sequences as `key: "g o"` / `key: "g u"` with a specific latch-window semantic; `useShortcut` is the single-key primitive; sequence handling is separate concern. Add a TODO note referencing a future unit-15 follow-up if sequence shortcuts need unification.
   - Barrel export.

A5. **`packages/haiku-ui/src/a11y/touch-target.ts`** (NEW)
   - Named export `touchTargetClass: string = "touch-target"` — the canonical Tailwind-addon class token. Downstream usage: `<button className={`${primitiveClass} ${touchTargetClass}`}>`.
   - The `.touch-target` CSS rule is defined in `src/index.css` (edit in A7 below):
     ```css
     .touch-target {
       position: relative;
       min-height: 44px;
       min-width: 44px;
     }
     .touch-target.touch-target--hit-area {
       min-height: unset;
       min-width: unset;
     }
     .touch-target.touch-target--hit-area::before {
       content: "";
       position: absolute;
       top: 50%;
       left: 50%;
       width: 44px;
       height: 44px;
       transform: translate(-50%, -50%);
       border-radius: inherit;
     }
     ```
   - Named export `touchTargetHitAreaClass: string = "touch-target touch-target--hit-area"` — the pseudo-element expansion variant for when the visible marker must stay small (pins, ghost pins, inline markers). Per touch-target-audit.md §2 option 2.
   - Module docblock references touch-target-audit.md §2–§3 and DESIGN-TOKENS.md §1.7.1.

A6. **`packages/haiku-ui/src/a11y/reduced-motion.ts`** (NEW)
   - Named export `useReducedMotion(): boolean` — returns the current `matches` state of `matchMedia('(prefers-reduced-motion: reduce)')`. Subscribes to `change` events; updates via `useState`. SSR-safe (returns `false` when `window === undefined`).
   - Named export `motionSafeClass(classes: string): string` — returns `""` when `useReducedMotion()` is `true`, else returns `classes`. Helper for conditional transitions: `<div className={motionSafeClass("transition-transform duration-300")}>`.
   - motionSafeClass is NOT a hook — it's a pure string helper callable in render. But internally `motionSafeClass` calls `useReducedMotion()` → making it a hook. **Rename** to `useMotionSafeClass(classes)` to match React naming conventions OR implement as a pure string helper that accepts the boolean: `motionSafeClass(classes, prefersReducedMotion)`. **Chosen**: keep `motionSafeClass(classes, prefersReducedMotion)` as a pure helper (no hook indirection) — consumer calls `useReducedMotion()` once at the top of the component and threads the boolean through. Cleaner, doesn't hide the hook. Documented in the module header.

A7. **`packages/haiku-ui/src/index.css`** (EDIT — append rules)
   - Append the `.touch-target` + `.touch-target--hit-area` CSS block (see A5) at the end of the file, BEFORE the existing `@keyframes` / component-owned CSS so it's clearly a utility.
   - Append the canonical global reduced-motion guard per motion-and-reduced-motion-spec.md §10.rule:
     ```css
     @media (prefers-reduced-motion: reduce) {
       *, *::before, *::after {
         animation-duration: 0.01ms !important;
         animation-iteration-count: 1 !important;
         transition-duration: 0.01ms !important;
         scroll-behavior: auto !important;
       }
     }
     ```
   - The per-component `animation: none` overrides for decorative pulses (feedback-pulse, sheet-up, etc.) are OUT OF SCOPE for this unit — they land in the components that own those animations (unit-10 feedback-sheet, unit-08 feedback-card, etc.) per motion spec §10.rule. This unit owns the global baseline ONLY.

A8. **`packages/haiku-ui/src/a11y/index.ts`** (NEW)
   - Barrel export:
     ```ts
     export { Header, Main, Aside, Nav, FooterBar } from "./landmarks"
     export { LiveRegion, LiveRegionShell, useAnnounce, announce } from "./live-regions"
     export {
       focusRingClass,
       focusRingCompactClass,
       focusRingVariantClasses,
       focusVisibleOnly,
       useFocusTrap,
     } from "./focus"
     export {
       KEYBOARD_SHORTCUT_REGISTRY,
       KeyboardShortcutConflict,
       useShortcut,
     } from "./keyboard"
     export type { ShortcutBinding, ShortcutScope } from "./keyboard"
     export { touchTargetClass, touchTargetHitAreaClass } from "./touch-target"
     export { useReducedMotion, motionSafeClass } from "./reduced-motion"
     ```

### B. Tests under `packages/haiku-ui/src/a11y/__tests__/`

B1. **`matchMedia.stub.ts`** (NEW — helper, not a test file)
   - `installMatchMediaStub(initial: Record<string, boolean>): { emitChange(query: string, matches: boolean): void; restore(): void }`
   - Saves the prior `window.matchMedia`, installs a stub where each call returns a mock `MediaQueryList` whose `matches` reflects the `initial` map (or `false` if the query isn't in the map). `addEventListener("change", cb)` stores the callback per-query.
   - `emitChange(query, matches)` invokes stored callbacks with `{ matches, media: query }`.
   - `restore()` re-installs the prior `window.matchMedia`.

B2. **`landmarks.test.tsx`** (NEW)
   - Render `<Main>` with default props; assert `getByRole("main")` is in the document, has `id="main-content"`, and `role="main"`.
   - Render `<Main ariaLabel="Focus ring spec gallery">`; assert `aria-label="Focus ring spec gallery"`.
   - Render `<Nav ariaLabel="Stage progress">`; assert `getByRole("navigation", { name: "Stage progress" })`.
   - Render `<Aside ariaLabel="Review sidebar">`; assert `getByRole("complementary", { name: "Review sidebar" })`.
   - Render `<Header>`; assert `getByRole("banner")`.
   - Render `<FooterBar>`; assert `getByRole("contentinfo")`.

B3. **`live-regions.test.tsx`** (NEW — covers `useAnnounce` per completion-criteria §6)
   - Render `<LiveRegionShell>`; assert both `#feedback-live-polite` and `#feedback-live-assertive` exist with correct `aria-live`, `role`, `aria-atomic`, and `sr-only` class.
   - Render `<LiveRegionShell>`, then call `announce("polite", "hello")`; assert `document.querySelector("#feedback-live-polite").textContent === "hello"`.
   - Same for `announce("assertive", "error")` → `#feedback-live-assertive`.
   - Hook variant: render a test component that calls `const a = useAnnounce(); useEffect(() => a("polite", "inner"), [])`; assert the region contains `"inner"` after mount.
   - No-shell safety: call `announce("polite", "orphan")` without mounting the shell; assert no throw.

B4. **`focus.test.tsx`** (NEW — covers `useFocusTrap` per completion-criteria §3)
   - Focus on open lands on first focusable child: mount `<FocusTrapTestFixture enabled={true}>` with three buttons; assert `document.activeElement === firstButton`.
   - Tab from last focusable wraps to first: focus third button, fire `keydown { key: "Tab" }` on the container; assert focus moves to the first button.
   - Shift+Tab from first wraps to last: focus first, fire `keydown { key: "Tab", shiftKey: true }`; assert focus on third button.
   - Disabled elements skipped: mount with `<button disabled>` between enabled buttons; focus the first enabled button, Tab twice (wrap); assert focus lands on the next enabled button, never on the disabled one.
   - On close focus returns to trigger: outer component has a trigger `<button>` that sets `enabled: true` on click, trap wraps a `<div>` with children. Click trigger → focus moves into trap. Set `enabled: false`. Assert `document.activeElement === triggerButton`.

B5. **`keyboard.test.tsx`** (NEW — covers `useShortcut` per completion-criteria §2)
   - Duplicate within a scope throws: render two test components that both call `useShortcut("r", h1, { scope: "global" })` and `useShortcut("r", h2, { scope: "global" })`; assert the second mount throws `KeyboardShortcutConflict`. (Use React's error boundary or `expect(() => render(...)).toThrow(KeyboardShortcutConflict)`.)
   - Same key different scopes does NOT throw: `useShortcut("r", h1, { scope: "global" })` + `useShortcut("r", h2, { scope: "dialog" })` — both mount cleanly.
   - inInput suppression: mount `useShortcut("a", handler, { scope: "global" })`, mount an `<input>`, focus it, dispatch `keydown { key: "a" }` on the input; assert handler NOT called.
   - inInput + allowInInput=true: same but with `allowInInput: true`; assert handler IS called.
   - guard callback: mount with `guard: () => false`; dispatch keydown; handler NOT called. With `guard: () => true`; handler IS called.
   - Registry mirrors shortcut map: assert `KEYBOARD_SHORTCUT_REGISTRY.length === 17` and has a binding for each of `j`, `k`, `[`, `]`, `g o`, `g u`, `g k`, `g p`, `Enter`, `n`, `a`, `c`, `r`, `/`, `Escape`, `?`. (17 rows = 15 in the table above plus `g k` and `g p` = 17 per keyboard-shortcut-map.html §1.)

B6. **`touch-target.test.tsx`** (NEW — covers `touchTargetClass` per completion-criteria §4)
   - Render a 20×20 icon button wrapped with `className={\`w-5 h-5 \${touchTargetClass}\`}`; measure the wrapper via `getBoundingClientRect()`; assert `width >= 44 && height >= 44`.
   - jsdom-gotcha: jsdom does NOT implement layout (getBoundingClientRect returns zeros). To make the test meaningful without a headless browser, the test can either (a) read the computed `min-height` / `min-width` via `getComputedStyle` (jsdom supports this for simple CSS), OR (b) assert the element has the expected class string (weaker but stable). **Chosen**: test (a) — `const style = getComputedStyle(el); expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);`. This requires `src/index.css` to be imported in the test setup so the `.touch-target` rule is parsed. Document the jsdom limitation in the test file.
   - Alternative: if jsdom getComputedStyle can't resolve `.touch-target` correctly, fall back to asserting `el.classList.contains("touch-target")` and measuring via JS of the intended min dimensions from the CSS rule we author.

B7. **`reduced-motion.test.tsx`** (NEW — covers `useReducedMotion` per completion-criteria §5)
   - `import { installMatchMediaStub } from "./matchMedia.stub"`.
   - `beforeEach`: `restore = installMatchMediaStub({ "(prefers-reduced-motion: reduce)": false })`.
   - `afterEach`: `restore()`.
   - Test 1: render a hook component with `useReducedMotion()`; assert `false` initially; call `emitChange("(prefers-reduced-motion: reduce)", true)`; `rerender()`; assert the returned value is `true`.
   - Test 2: `motionSafeClass("transition-colors", false)` returns `"transition-colors"`; `motionSafeClass("transition-colors", true)` returns `""`.

### C. Thin edit to unit-04 primitive (scope-safe)

C1. **`packages/haiku-ui/src/components/primitives/Button.tsx`** (EDIT — one-line)
   - Line 43: replace the inline `FOCUS_RING` constant with `import { focusRingClass } from "../../a11y/focus"`.
   - Line 62: replace `${FOCUS_RING}` with `${focusRingClass}`.
   - No behavior change. Emitted className string is byte-identical. Unit-04's existing Button test fixtures continue to match.

## Implementation Steps (ordered; each step is one commit)

1. **Scaffold `a11y/` directory + barrel** — create `a11y/index.ts` empty, `a11y/landmarks.tsx`, `a11y/live-regions.tsx`, `a11y/focus.ts`, `a11y/keyboard.ts`, `a11y/touch-target.ts`, `a11y/reduced-motion.ts` as stub files with correct named-export signatures (types in place, bodies throwing `TODO`). Commit: `haiku(unit-05/planner): scaffold a11y module skeleton`. Run `npx tsc --noEmit` — expect type errors since the Button import in C1 is not yet done; skip C1 for this commit.
2. **Implement `landmarks.tsx`** — all five primitives with `forwardRef`. Write `landmarks.test.tsx` (B2). Run `npm test -w haiku-ui`; expect landmarks tests to pass. Commit: `haiku(unit-05/builder): landmark primitives + tests`.
3. **Implement `live-regions.tsx` + `useAnnounce`** — `LiveRegion`, `LiveRegionShell`, `announce`, `useAnnounce`. Write `live-regions.test.tsx` (B3). Run tests; expect pass. Commit: `haiku(unit-05/builder): live-region shell + useAnnounce`.
4. **Implement `focus.ts`** — `focusRingClass`, `focusRingCompactClass`, `focusRingVariantClasses`, `focusVisibleOnly`, `useFocusTrap`. Write `focus.test.tsx` (B4). Run tests. Commit: `haiku(unit-05/builder): focus ring tokens + useFocusTrap`.
5. **Rewire `primitives/Button.tsx`** — one-line substitution per C1. Run `npm test -w haiku-ui` to confirm the Button test still passes. Run `npx tsc --noEmit` and confirm clean. Commit: `haiku(unit-05/builder): rewire Button focusRingClass to a11y module`.
6. **Implement `keyboard.ts`** — `KEYBOARD_SHORTCUT_REGISTRY` (17 entries hand-mirroring keyboard-shortcut-map.html §1), `KeyboardShortcutConflict`, `useShortcut`. Write `keyboard.test.tsx` (B5). Run tests. Commit: `haiku(unit-05/builder): useShortcut + conflict detection`.
7. **Implement `touch-target.ts` + `src/index.css` rule** — export `touchTargetClass`, `touchTargetHitAreaClass`. Append the CSS block to `src/index.css` (the `.touch-target` + `.touch-target--hit-area` + the canonical global reduced-motion guard). Write `touch-target.test.tsx` (B6). Run tests. Commit: `haiku(unit-05/builder): touchTargetClass + css hit-area rule + global reduced-motion guard`.
8. **Implement `reduced-motion.ts` + `matchMedia.stub.ts`** — `useReducedMotion`, `motionSafeClass`, `installMatchMediaStub`. Write `reduced-motion.test.tsx` (B7). Run tests. Commit: `haiku(unit-05/builder): useReducedMotion + motionSafeClass + matchMedia stub helper`.
9. **Wire barrel** — populate `a11y/index.ts` per A8. Run `npx tsc --noEmit`. Commit: `haiku(unit-05/builder): a11y barrel export`.
10. **Record unit outputs** — call `haiku_unit_set` to write the final `outputs:` array to the unit frontmatter. Commit is automatic via the FSM (no manual git commit needed).

## Verification Commands (builder uses these at completion)

```sh
# From /packages/haiku-ui/
cd packages/haiku-ui

# Typecheck
npx tsc --noEmit

# Tests (filters to the a11y surface)
npm test -- src/a11y/__tests__

# Full test run (must stay green)
npm test

# Banned-pattern audit (from unit-04 — must stay green)
npm run --workspace haiku-ui audit-banned-patterns || node scripts/audit-banned-patterns.mjs

# Token audit (from unit-04)
node scripts/verify-tokens.mjs || true   # if present
```

Completion criteria checklist:

- [ ] `packages/haiku-ui/src/a11y/landmarks.tsx` exports `Header`, `Main`, `Aside`, `Nav`, `FooterBar`.
- [ ] `packages/haiku-ui/src/a11y/live-regions.tsx` exports `LiveRegion`, `LiveRegionShell`, `useAnnounce`, `announce`.
- [ ] `packages/haiku-ui/src/a11y/focus.ts` exports `focusRingClass`, `focusRingCompactClass`, `focusRingVariantClasses`, `focusVisibleOnly`, `useFocusTrap`.
- [ ] `packages/haiku-ui/src/a11y/keyboard.ts` exports `KEYBOARD_SHORTCUT_REGISTRY`, `KeyboardShortcutConflict`, `useShortcut`.
- [ ] `packages/haiku-ui/src/a11y/touch-target.ts` exports `touchTargetClass`, `touchTargetHitAreaClass`.
- [ ] `packages/haiku-ui/src/a11y/reduced-motion.ts` exports `useReducedMotion`, `motionSafeClass`.
- [ ] `packages/haiku-ui/src/a11y/index.ts` barrel re-exports all of the above.
- [ ] `useShortcut` throws `KeyboardShortcutConflict` on duplicate `(key, scope)` — test passes.
- [ ] `useFocusTrap` first-focusable / wrap / disabled-skip / restore — four tests pass.
- [ ] `touchTargetClass` — min 44×44 via getComputedStyle — test passes.
- [ ] `useReducedMotion` — matchMedia `change` → rerender reflects new state — test passes.
- [ ] `useAnnounce` — polite + assertive region contents update — test passes.
- [ ] `npx tsc --noEmit` clean in `packages/haiku-ui/`.
- [ ] `npm test -w haiku-ui` all green.

## Sync-Check (per `.claude/rules/sync-check.md`)

- **Paper**: a11y is an implementation concern, not a methodology concept. No paper edit required.
- **Plugin**: a11y is inside `packages/haiku-ui/` — the SPA package. No plugin studio/stage/hat change.
- **Website**: a11y primitives are internal to the review SPA. Not user-facing docs. No website edit.
- **Architecture prototype** (`website/public/prototype-stage-flow.html`): no change — the prototype visualizes runtime FSM phases and orchestrator actions, not SPA internals. Not affected.
- **Terminology**: no new terms introduced.
- **Scope-violation audit**: all work under `packages/haiku-ui/src/a11y/**`, `packages/haiku-ui/src/components/primitives/Button.tsx` (one-line), and `packages/haiku-ui/src/index.css` (append). Nothing outside `packages/haiku-ui/`. No `packages/haiku/`, `packages/shared/`, or `packages/haiku-api/` edits.
