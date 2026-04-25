# Tactical Plan: unit-09 AgentFeedbackToggle

Owner: planner (bolt 1)
Target: Land a proper `<button role="switch">` implementation at `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` that replaces the prior div-label-masquerading-as-switch. The component wraps a 44×44 `touchTargetClass` hit area, stamps the canonical `aria-label="Show agent feedback inline"`, flips `aria-checked` as the string literals `"false" ↔ "true"`, fires `useAnnounce()` through the existing polite live region on every state change, and gates the thumb/track animation via `useReducedMotion()`. Two new audit rules land in `packages/haiku-ui/audit-config.json` (under the `stage-wide` profile) and a new `tests/audit-banned-patterns.test.ts` runs the `stage-wide` audit in-process and asserts zero hits plus the presence check for the canonical string.

This unit is a dedicated regression guard. Four classes of defect must be impossible to re-introduce:

1. **Div-toggle regression** — the toggle must use a native `<button role="switch">`, verified by `getByRole('switch')`.
2. **aria-label drift** — the exact string `"Show agent feedback inline"` must appear in the component file AND any textual drift (without the trailing `inline`) must be caught by the audit.
3. **Sub-44 touch target** — `getBoundingClientRect()` measurements must report width/height ≥ 44.
4. **Animation ignoring `prefers-reduced-motion`** — with matchMedia reporting `reduce`, the animation class must be the no-motion variant.

---

## Context & Prior Art

- **unit-05** (merged) produced the a11y foundation layer at `packages/haiku-ui/src/a11y/`. This unit consumes — does NOT duplicate — the following primitives:
  - `touchTargetClass` from `a11y/touch-target.ts` (string token `"touch-target"` → `.touch-target` CSS rule in `src/index.css` setting `min-height: 44px; min-width: 44px`). Test strategy inherits the `<style>`-injection pattern from `a11y/__tests__/touch-target.test.tsx` (jsdom has no layout engine; getBoundingClientRect returns zero without help).
  - `focusRingClass` from `a11y/focus.ts` (`"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"`).
  - `useReducedMotion()` from `a11y/reduced-motion.ts` — reactive hook subscribed to `(prefers-reduced-motion: reduce)` matchMedia. SSR-safe (returns `false` when `typeof window === "undefined"`).
  - `useAnnounce()` from `a11y/live-regions.tsx` — returns a stable `(severity, message) => void` callback. Targets `#feedback-live-polite` / `#feedback-live-assertive`. No-op when the region shell is not mounted (tests MUST render `<LiveRegionShell />`).
  - Controllable matchMedia stub at `a11y/__tests__/matchMedia.stub.ts` — `installMatchMediaStub({ "(prefers-reduced-motion: reduce)": false }) → { emitChange, restore }`. This unit's reduced-motion test uses `installMatchMediaStub({ "(prefers-reduced-motion: reduce)": true })` in `beforeEach` to drive the hook into the reduced branch BEFORE render.
- **unit-spec API mismatch (important)**: the unit spec line 34 reads `useAnnounce('polite', isOn ? 'Agent feedback now visible' : 'Agent feedback hidden')`. The actual implementation in `a11y/live-regions.tsx` is `useAnnounce(): (severity, message) => void` — a hook that returns a stable callback, not a hook you call directly with args. The builder MUST resolve this as: `const announce = useAnnounce()` at the top of the component, then `announce("polite", isOn ? "Agent feedback now visible" : "Agent feedback hidden")` inside the click handler. The spec line reads as shorthand for the call-signature, not the hook signature. Do NOT refactor `useAnnounce` to match the spec's literal text — the existing hook is correct and already tested; this unit's spec is using call-site shorthand.
- **unit-04** produced the primitive component layer (`primitives/Button.tsx`, etc.) and the audit infrastructure (`packages/haiku-ui/scripts/audit-banned-patterns.mjs` + `audit-config.json`). The audit config already carries a `stage-wide` profile (extending `tokens`) that contains the canonical `"Show agent feedback"(?! inline)` rule at `audit-config.json:95-101` with scope `packages/haiku-ui/src/**/*.{ts,tsx}`. The Completion Criteria's "banned-patterns audit config includes ..." line is therefore ALREADY satisfied by prior state — verify and do not duplicate. However, the **presence-side check** ("Banned-patterns audit also asserts ≥ 1 occurrence of `"Show agent feedback inline"` in `components/feedback/AgentFeedbackToggle.tsx`") is NOT present in the audit config and must be added in this unit.
- **DESIGN-BRIEF §2** line 385 (per the spec artifact's reference) codifies `aria-label="Show agent feedback inline"` as the canonical accessible name. The word "inline" carries semantic load — it communicates the opt-in overlay behavior (agent items interleaved in the main list) vs. a separate panel. Screen-reader users hearing only "Show agent feedback, switch, off" would not know the effect is inline interleaving. The audit regex `"Show agent feedback"(?! inline)` enforces that every `"Show agent feedback"` literal is followed by ` inline`.
- **DESIGN-TOKENS §2 exemption (line 59)**: `text-[11px]` is allowed only with `font-semibold`/`font-bold`. The visible count chip when OFF uses `text-[11px] font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-200`. This satisfies both the audit's `banned-text-small` rule (which bans `text-[9px]` and `text-[10px]`, NOT `text-[11px]`) and the typography-floor exception. Do not drop to `text-[10px]`.
- **Canonical markup reference (agent-feedback-toggle-spec.html §1)** — the authoritative visible structure: a `<label class="af-touch inline-flex items-center gap-2 cursor-pointer group">` wrapping a `<button type="button" role="switch" aria-checked="..." aria-label="Show agent feedback inline">` + a thumb `<span aria-hidden="true">` + the visible label text span. The 44×44 hit area is on the outer label (via `.af-touch` / `.touch-target`), not the button. The visible track is `w-8 h-4` (32×16 px); the thumb is `w-3 h-3`.
- **Default state on mount**: `aria-checked="false"` (OFF) per DESIGN-BRIEF §2 / unit spec line 28. Confirmed by `agent-feedback-toggle-spec.html §2` "Default (off)" example and by `comments-list-with-agent-toggle.html §2` ("Light Mode, Toggle OFF (default)").
- **Count chip rendering (OFF state only)**: the artifact shows the OFF-state count chip reads `"{n} hidden"` (e.g. "8 hidden"). The ON state shows `"{n} inline"`. The unit spec's Scope bullet about the chip only covers the OFF state's visible styling — but to keep the component self-contained and driven by the reference artifacts, render the chip in both states with the count text `"{n} hidden"` when OFF and `"{n} inline"` when ON. The `count` prop is optional; when absent, the chip is not rendered.
- **No list-render behavior in scope**: unit spec "Out of scope" explicitly excludes "List-render-when-enabled behavior". The toggle reports state via `onChange` callback; the owning component (downstream unit-07 review page) wires the actual filter. The toggle may also be a fully uncontrolled component with optional `defaultChecked: boolean` + `onChange: (next: boolean) => void` — the Completion Criteria's "default aria-checked=false" is satisfied by `useState(defaultChecked ?? false)`.
- **Reduced-motion animation swap (unit spec line 33)**: `Toggle animation gated by useReducedMotion() — swapped for an opacity-free crossfade under prefers-reduced-motion: reduce.` The canonical artifact uses `transition-colors` on the track and `transition-transform` on the thumb (slide motion). Under reduced motion, the canonical stage-wide guard in `src/index.css` (added by unit-05) already enforces `transition-duration: 0.01ms !important` globally — but this unit's Completion Criteria demands a distinct "no-motion variant" class the test can `grep` for. The implementation therefore: (a) when `useReducedMotion()` returns true, drop `transition-transform`/`transition-colors` from the className composition entirely and add a `motion-safe:` → `motion-reduce:` alternative OR use a data-attribute the test greps (`data-motion-variant="reduced"` vs `"full"`). **Chosen**: use an explicit class token pair so the test is a pure class-presence assertion with no CSS dependency:
  - motion: `transition-colors duration-200` on track, `transition-transform duration-200` on thumb
  - reduced: drop both transitions; add a single `agent-feedback-toggle--reduced-motion` class marker on the button (pure sentinel, no CSS behavior required, greppable by `container.querySelector(".agent-feedback-toggle--reduced-motion")`). The "opacity-free crossfade" language in the spec is a verbal description of WHAT the non-animated state looks like — it means "no opacity fade either direction, just instant state flip" — and is satisfied by dropping the transforms entirely. No `opacity-` classes appear on the track or thumb in any state (which already avoids the banned `opacity-50`/`opacity-60`/`opacity-70` audit rule).
- **No existing `components/feedback/` directory** — greenfield. Zero churn risk on the new file; the only pre-existing files touched are `audit-config.json` (additive rule) and the tests barrel.

## Git-history signal

- `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` does not exist — greenfield creation. Zero churn risk.
- `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx` does not exist — greenfield.
- `packages/haiku-ui/audit-config.json` last touched by unit-04/unit-15 (the `stage-wide` profile with `banned-agent-feedback-toggle-copy` was added proactively). Low-churn; adds one presence-check rule without disturbing existing rules.
- `packages/haiku-ui/src/a11y/` is consumed read-only. Do NOT modify any a11y files — they're canonical and tested. If the signature of `useAnnounce()` differs from the spec's literal text, resolve at the call-site per the note above.
- `packages/haiku-ui/src/index.css` is consumed read-only for the `.touch-target` class. Do NOT add new CSS in this unit.

## Risks & Blockers

1. **`useAnnounce` signature vs unit spec text (resolved above)**. The spec line 34 literal `useAnnounce('polite', 'Agent feedback now visible')` is shorthand for `const announce = useAnnounce(); announce('polite', 'Agent feedback now visible')`. Builder must resolve at the call site, NOT refactor the hook. If the builder attempts to refactor the hook, revert and use the returned callback form.
2. **Live-region announce test needs the shell mounted.** `useAnnounce()` no-ops when `#feedback-live-polite` isn't in the DOM. The test harness MUST render `<LiveRegionShell />` alongside the toggle:
   ```tsx
   render(
     <>
       <LiveRegionShell />
       <AgentFeedbackToggle count={0} />
     </>
   )
   ```
   After clicking the switch, query `#feedback-live-polite` textContent, not a scoped `politeLiveRegion` reference from nowhere. The unit spec line 62 reads `within(politeLiveRegion).findByText('Agent feedback now visible')`; resolve `politeLiveRegion` as `document.getElementById(POLITE_REGION_ID)!` (imported from `../../a11y`). Do not invent a new live-region component.
3. **Clear-then-set + async queries.** `announce(...)` uses clear-then-set synchronously (no rAF per live-regions.tsx:75-76), so `findByText` resolves on the next microtask. Prefer the sync form: `expect(document.getElementById(POLITE_REGION_ID)?.textContent).toBe('Agent feedback now visible')` — deterministic, no fake timers. If `findByText` is preferred for future-proofing, wrap the click in `act(...)` and use `waitFor(...)` — but avoid Jest fake timers; the live-region hook does not use timers.
4. **matchMedia stub must be installed BEFORE render.** `useReducedMotion()` reads matchMedia via `useState(() => readInitialMatches())` on the first render — if the stub is installed after render, the initial value is wrong. Pattern:
   ```tsx
   beforeEach(() => {
     stub = installMatchMediaStub({ "(prefers-reduced-motion: reduce)": true })
   })
   afterEach(() => {
     cleanup()
     stub.restore()
   })
   it("uses no-motion variant under prefers-reduced-motion", () => {
     render(<AgentFeedbackToggle />)
     const btn = screen.getByRole("switch", { name: /^Show agent feedback inline$/ })
     expect(btn.classList.contains("agent-feedback-toggle--reduced-motion")).toBe(true)
   })
   ```
   Scope the stub to the reduced-motion `describe` block only; other tests rely on the default `matchMedia.matches === false` behavior inherited from `tests/setup.ts`.
5. **Touch-target test needs the `.touch-target` CSS rule present.** jsdom doesn't apply external CSS. Mirror the pattern from `a11y/__tests__/touch-target.test.tsx:22-34` — inject the rule via a `<style>` tag in `beforeAll`. Even though the outer `<label>` or `<button>` carries `min-height: 44px; min-width: 44px` via `touchTargetClass`, `getBoundingClientRect()` in jsdom returns zeros because layout is never computed. The spec's "measures getBoundingClientRect()" assertion must therefore fall back to `getComputedStyle(el).minHeight >= 44` + `getComputedStyle(el).minWidth >= 44`. **Chosen**: do both — primary assertion is `parseFloat(getComputedStyle(el).minHeight) >= 44`, secondary is `getBoundingClientRect().width >= 44 || parseFloat(style.minWidth) >= 44` (bounding-rect fallback mirrors real-browser behavior). This matches the `a11y/__tests__/touch-target.test.tsx:56-58` pattern exactly.
6. **Space vs Enter keyboard activation.** `role="switch"` native behavior: browsers fire `click` on both Space and Enter for `<button>` elements, which React Testing Library's `userEvent.keyboard('{Space}')` and `'{Enter}'` simulate correctly. Assert via:
   ```tsx
   await user.keyboard('{Space}')
   expect(btn).toHaveAttribute('aria-checked', 'true')
   await user.keyboard('{Enter}')
   expect(btn).toHaveAttribute('aria-checked', 'false')
   ```
   Use `userEvent` (not `fireEvent`) for keyboard tests — fireEvent('keydown') does NOT synthesize the click the browser fires on Space/Enter. Use `userEvent.setup()` from `@testing-library/user-event` (declared in package.json devDeps — confirm before writing). If user-event is absent, `fireEvent.click` + `fireEvent.keyDown` with `key: ' '` and a manual `toggle()` call is the fallback but less faithful. **Chosen**: use `userEvent` — verify the package in `packages/haiku-ui/package.json` devDependencies before writing.
7. **Tab reachability.** "Tab reaches the toggle in the expected DOM position" is a weak assertion without a surrounding DOM. Interpret as: the `<button role="switch">` is in the natural tab-order (no `tabindex="-1"`, not `aria-hidden`, not `inert`). Assert:
   ```tsx
   const btn = screen.getByRole('switch')
   expect(btn).not.toHaveAttribute('tabindex', '-1')
   expect(btn).not.toHaveAttribute('aria-hidden', 'true')
   expect(btn).not.toHaveAttribute('inert')
   btn.focus()
   expect(document.activeElement).toBe(btn)
   ```
   Don't attempt full focus-order testing — that belongs to downstream review-page units that compose the toggle with siblings.
8. **aria-checked as string literal.** React's synthetic ARIA serialization converts boolean `aria-checked={false}` to the string `"false"` and boolean `true` to `"true"` — but the unit spec is explicit: "`aria-checked` transitions `'false' ↔ 'true'` on activation (string literals; not booleans)". To eliminate any ambiguity from React's internal serializer, write the attribute as a string literal in JSX:
   ```tsx
   <button aria-checked={checked ? "true" : "false"} ... />
   ```
   This avoids any surprise where React optimizes away the attribute under certain boolean-false conditions (it doesn't today for aria-checked, but making it a string is zero-cost and defensive).
9. **Canonical string literal presence check.** The Completion Criteria requires the audit to assert `≥ 1 occurrence of "Show agent feedback inline" in components/feedback/AgentFeedbackToggle.tsx`. The existing `audit-banned-patterns.mjs` is a ban-only tool — it fails when it finds a hit. A presence check is the inverse. Two paths:
   - **Path A (minimally invasive, chosen)**: Extend `audit-banned-patterns.mjs` with a new rule-type `"requirePresence"` (alongside the implicit `"banned"` default). Rules with `"requirePresence": true` fail when zero hits are found in the declared scope. Keep backward-compatible by defaulting to ban-mode when the field is absent.
   - **Path B (separate script)**: Add a new `packages/haiku-ui/scripts/audit-required-patterns.mjs` that mirrors the structure but inverts the exit condition. More code, more wiring.
   - **Chosen**: Path A. Minimal surface area. Add two JSON rules in `audit-config.json` `stage-wide` profile: (i) the existing `banned-agent-feedback-toggle-copy` stays (confirms the drift guard); (ii) new `require-agent-feedback-toggle-canonical` with `"requirePresence": true`, pattern `"Show agent feedback inline"`, scope `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` only. Extend `audit-banned-patterns.mjs` to honor the `requirePresence` flag. The audit script's exit code semantics preserve: exit 0 if all rules pass, exit 1 if any rule fails (either bad hit or missing required presence).
10. **In-process audit test for CI determinism.** Rather than relying solely on a CI step that runs `node scripts/audit-banned-patterns.mjs`, add a test at `packages/haiku-ui/tests/audit-banned-patterns.test.ts` that spawns the audit script as a subprocess via `execSync` and asserts exit code 0 and stderr-empty. This gives vitest a single source-of-truth green signal AND catches regressions before the CI-step runs. Keep the existing CI invocation — the test complements, doesn't replace.
11. **Scope-violation risk.** Unit scope is exactly:
    - `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` (NEW)
    - `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx` (NEW)
    - `packages/haiku-ui/audit-config.json` (EDIT — additive rule)
    - `packages/haiku-ui/scripts/audit-banned-patterns.mjs` (EDIT — honor `requirePresence` flag, backward-compat)
    - `packages/haiku-ui/tests/audit-banned-patterns.test.ts` (NEW)
    - `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-09-tactical-plan.md` (THIS file, NEW)
    Do NOT touch: `packages/haiku/`, `packages/shared/`, `packages/haiku-api/`, `a11y/` (read-only), any other component file, any CSS file, any Tailwind config. Edits to `primitives/`, `ReviewSidebar`, `FeedbackPanel`, and every other downstream component are explicitly out-of-scope — those are unit-07 / unit-10 territory.
12. **`type` prop default on `<button>`.** React's default `<button>` type is `submit` — inside a form, that triggers submission on click and eats the toggle behavior. The spec explicitly calls for `type="button"`. Hard-code `type="button"` on the rendered element; do NOT accept a `type` prop override (a switch is never a submit control). Typescript: omit `type` from the prop surface entirely — extend `Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'aria-checked' | 'aria-label'>` since role/aria-label/aria-checked are also canonically managed by the component.
13. **Disabled state not in scope.** The design artifact shows a disabled state (`agent-feedback-toggle-spec.html §2` tile 6) but the unit Completion Criteria doesn't test it. Accept an optional `disabled?: boolean` prop that sets `disabled` on the underlying `<button>`, applies `cursor-not-allowed`, and ignores keyboard/click activation. Do NOT apply `opacity-50` (banned). Use the token-based pattern from `primitives/Button.tsx:27-35`: `bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 cursor-not-allowed` + `aria-disabled="true"`. Ship the prop + the styling; skip a dedicated test (out of Completion Criteria scope).
14. **Controlled vs uncontrolled shape.** Default is uncontrolled (internal `useState`). For downstream composition, also accept the controlled shape: `checked?: boolean` (when present, the component is controlled; `onChange: (next: boolean) => void` is called but internal state is ignored). Follow React convention: `checked` OR `defaultChecked`, not both. Document in the component header. Keep the API narrow — this is a primitive.
15. **Hover-state styling beyond Completion Criteria scope.** The design artifact shows hover state (track darkens, label bolder, soft teal ring). Implement per artifact (`hover:bg-stone-400 dark:hover:bg-stone-500` for the OFF track, `hover:bg-teal-700 dark:hover:bg-teal-400` for ON, label `group-hover:text-stone-900 dark:group-hover:text-stone-100`) for parity with the canonical artifact — no tests required at this unit's scope.
16. **focus-visible ring placement.** Per `agent-feedback-toggle-spec.html §1` the focus ring goes on the button (`.af-switch:focus-visible`), not the outer label. Use `focusRingClass` on the button element. The canonical focus-ring spec's border-radius is `rounded-full` for this shape — Tailwind v4's `focus-visible:ring-*` respects the element's rounded-full. No CSS edits needed.
17. **visit-counter chip and `text-[11px] font-semibold` token pair.** DESIGN-TOKENS §2.4 canonicalizes `text-[11px] font-bold` for visit counters, but the unit spec calls for `text-[11px] font-semibold`. These are different tokens — stay with `font-semibold` per the unit spec; DESIGN-TOKENS §2.4 applies to `FeedbackVisitCounter`, a different component. The audit rule `banned-text-small` bans `text-[9px]|text-[10px]` only; `text-[11px]` is permitted under the font-semibold/bold floor (DESIGN-TOKENS §1.1a last row).

## Files to Modify / Create

### A. `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` (NEW)

- Component signature (Omit-based — role/aria-checked/aria-label/type canonical, not overridable):
  ```tsx
  export interface AgentFeedbackToggleProps
    extends Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      "type" | "role" | "aria-checked" | "aria-label" | "onChange"
    > {
    /** Controlled `on/off` state. When present, the component is controlled. */
    checked?: boolean
    /** Uncontrolled initial state. Default `false`. */
    defaultChecked?: boolean
    /** Fires when the user toggles. Receives the next boolean state. */
    onChange?: (next: boolean) => void
    /**
     * Optional hidden/inline count rendered in the chip next to the label.
     * When omitted, no chip renders.
     */
    count?: number
    /** Disabled state — button cannot be activated. */
    disabled?: boolean
    /** Optional className passthrough for the outer label wrapper. */
    className?: string
  }
  ```
- Top-of-component imports (from `../../a11y` barrel):
  ```ts
  import {
    focusRingClass,
    POLITE_REGION_ID,
    touchTargetClass,
    useAnnounce,
    useReducedMotion,
  } from "../../a11y"
  ```
- Render structure (matches `agent-feedback-toggle-spec.html §1` canonical markup plus DESIGN-BRIEF §2 count chip):
  ```tsx
  <label className={`${touchTargetClass} inline-flex items-center gap-2 cursor-pointer group ${className ?? ""}`}>
    <button
      type="button"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      aria-label="Show agent feedback inline"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={handleToggle}
      className={buttonClass}   // composed below
      data-state={checked ? "on" : "off"}
    >
      <span aria-hidden="true" className={thumbClass} />
    </button>
    <span className="text-xs font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
      Show agent feedback
    </span>
    {typeof count === "number" ? (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-200">
        {count} {checked ? "inline" : "hidden"}
      </span>
    ) : null}
  </label>
  ```
- Class composition:
  ```ts
  const trackBase =
    "relative inline-block w-8 h-4 rounded-full"
  const trackOff =
    "bg-stone-300 dark:bg-stone-600 hover:bg-stone-400 dark:hover:bg-stone-500"
  const trackOn =
    "bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-400"
  const trackDisabled =
    "bg-stone-200 dark:bg-stone-700 cursor-not-allowed"
  const motionClasses = prefersReducedMotion
    ? "agent-feedback-toggle--reduced-motion"
    : "transition-colors duration-200"
  const buttonClass = [
    trackBase,
    disabled ? trackDisabled : checked ? trackOn : trackOff,
    motionClasses,
    focusRingClass,
  ]
    .filter(Boolean)
    .join(" ")
  const thumbBase = "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow"
  const thumbPos = checked ? "left-[18px]" : "left-0.5"
  const thumbMotion = prefersReducedMotion
    ? ""
    : "transition-all duration-200"
  const thumbClass = [thumbBase, thumbPos, thumbMotion].filter(Boolean).join(" ")
  ```
  Note: use `left-[18px]` (or `left-4` which is `1rem = 16px`) to slide the thumb 16px right; prefer the explicit arbitrary value to stay visually faithful to the canonical artifact's `translateX(16px)`. Confirm numeric math in the implementation (track w-8 = 32px, thumb w-3 = 12px, gap on right should match gap on left = 0.5 → 2px).
- Controlled/uncontrolled wiring:
  ```ts
  const isControlled = checked !== undefined
  const [internal, setInternal] = useState<boolean>(defaultChecked ?? false)
  const current = isControlled ? !!checked : internal
  const announce = useAnnounce()
  const prefersReducedMotion = useReducedMotion()
  const handleToggle = useCallback(() => {
    if (disabled) return
    const next = !current
    if (!isControlled) setInternal(next)
    onChange?.(next)
    announce("polite", next ? "Agent feedback now visible" : "Agent feedback hidden")
  }, [announce, current, disabled, isControlled, onChange])
  ```
- Component header JSDoc: cross-reference the unit spec, DESIGN-BRIEF §2 line for the canonical aria-label, and `agent-feedback-toggle-spec.html §1` for the markup. Note the controlled/uncontrolled API and the "count prop drives OFF-state hidden chip / ON-state inline chip" behavior.
- Module MUST contain the literal string `"Show agent feedback inline"` in a JSX attribute — the presence-check audit rule scans for it. The string appears in the `aria-label="Show agent feedback inline"` JSX assignment; no additional occurrences are needed, but a JSDoc `@aria-label` line also works.

### B. `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx` (NEW)

Test harness:
```tsx
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { installMatchMediaStub } from "../../../a11y/__tests__/matchMedia.stub"
import { LiveRegionShell, POLITE_REGION_ID } from "../../../a11y"
import { AgentFeedbackToggle } from "../AgentFeedbackToggle"

beforeAll(() => {
  // Inject .touch-target CSS rule so getComputedStyle resolves min-height/width.
  const style = document.createElement("style")
  style.textContent = `.touch-target { min-height: 44px; min-width: 44px; }`
  document.head.appendChild(style)
})

afterEach(() => { cleanup() })
```

Test blocks:

1. **Default render & accessibility tree**:
   - Mount `<><LiveRegionShell /><AgentFeedbackToggle /></>`.
   - `const btn = screen.getByRole("switch", { name: /^Show agent feedback inline$/ })` — resolves (Completion Criteria).
   - `expect(btn).toHaveAttribute("aria-checked", "false")` — default state (Completion Criteria).
   - `expect(btn).not.toHaveAttribute("tabindex", "-1")` — tab reachability.
   - `expect(btn).toHaveAttribute("type", "button")` — prevents submit.
   - `expect(btn).toHaveAttribute("role", "switch")`.

2. **Keyboard activation — Space and Enter** (Completion Criteria):
   - `const user = userEvent.setup()`.
   - Mount with `<LiveRegionShell />` + toggle.
   - `btn.focus(); expect(document.activeElement).toBe(btn)`.
   - `await user.keyboard('{ }')` (Space) — assert `aria-checked === "true"`.
   - `await user.keyboard('{Enter}')` — assert `aria-checked === "false"`.
   - If `userEvent` is not available in devDeps, fall back to `fireEvent.click(btn)` per toggle call (browsers fire click on Space/Enter natively; jsdom does too). Primary path is `userEvent`.

3. **Click activation**:
   - Fire `userEvent.click(btn)` — assert `aria-checked === "true"`.
   - Click again — `"false"`.

4. **Touch target ≥ 44×44** (Completion Criteria):
   - Render toggle. Query `const label = screen.getByRole("switch").closest("label")!`.
   - Primary assertion: `const style = getComputedStyle(label); expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44); expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)`.
   - Secondary assertion (bounding rect): `const rect = label.getBoundingClientRect(); expect(rect.width >= 44 || parseFloat(style.minWidth) >= 44).toBe(true)` — bounding-rect as documentation of the real-browser behavior, min-* as the jsdom-deterministic signal.

5. **Reduced motion variant** (Completion Criteria):
   - Scope a new `describe` with `beforeEach(() => { stub = installMatchMediaStub({ "(prefers-reduced-motion: reduce)": true }) })` + `afterEach(() => { cleanup(); stub.restore() })`.
   - Render toggle. Query the switch button.
   - `expect(btn.classList.contains("agent-feedback-toggle--reduced-motion")).toBe(true)`.
   - `expect(btn.className).not.toMatch(/transition-(colors|transform|all)/)`.
   - Also assert the thumb span has no `transition-` classes.

6. **Live-region announcement on toggle** (Completion Criteria):
   - Render `<LiveRegionShell />` + toggle.
   - Click — assert `document.getElementById(POLITE_REGION_ID)!.textContent === "Agent feedback now visible"`.
   - Click again — `textContent === "Agent feedback hidden"`.
   - Also validate with `within(...)`:
     ```tsx
     const politeRegion = document.getElementById(POLITE_REGION_ID)!
     expect(within(politeRegion).getByText("Agent feedback hidden")).toBeInTheDocument()
     ```
     Use `getByText` (sync) since `announce()` writes synchronously.

7. **Controlled mode**:
   - Render `<AgentFeedbackToggle checked={false} onChange={spy} />`.
   - Click — assert `onChange` called with `true`, but rendered `aria-checked` still `"false"` until parent re-renders with `checked={true}`.

8. **Count chip rendering**:
   - Render `<AgentFeedbackToggle count={8} />` — chip reads `"8 hidden"`.
   - Render `<AgentFeedbackToggle count={8} defaultChecked />` — chip reads `"8 inline"`.
   - Render `<AgentFeedbackToggle />` (no count) — no chip.
   - Optional assertion: chip span has classes `text-[11px] font-semibold uppercase tracking-wide`.

9. **Disabled state**:
   - Render `<AgentFeedbackToggle disabled />`. Click — `aria-checked` unchanged.
   - `expect(btn).toBeDisabled()`. `expect(btn).toHaveAttribute("aria-disabled", "true")`.

### C. `packages/haiku-ui/audit-config.json` (EDIT — additive)

Add under `profiles.stage-wide.rules` (after the existing `banned-agent-feedback-toggle-copy` entry):

```json
{
  "id": "require-agent-feedback-toggle-canonical",
  "description": "AgentFeedbackToggle.tsx MUST contain the canonical 'Show agent feedback inline' string at least once (presence-side check per unit-09 Completion Criteria).",
  "pattern": "Show agent feedback inline",
  "requirePresence": true,
  "scope": ["packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx"]
}
```

Preserve existing rules verbatim. No structural/schema changes beyond adding the `requirePresence` boolean — the audit script gains that field as an opt-in flag (ban-mode remains the default).

### D. `packages/haiku-ui/scripts/audit-banned-patterns.mjs` (EDIT — backward-compatible)

Extend the rule-evaluation loop to honor `requirePresence`:

- After scanning all files in scope for `rule.pattern`:
  - If `rule.requirePresence !== true`: current behavior (fail on any hit).
  - If `rule.requirePresence === true`: fail when `hitCount === 0`; pass when `hitCount >= 1`. Emit "required-pattern missing" message identifying the rule id + scope + pattern for debuggability.
- Preserve existing exit-code semantics: exit 0 on all rules passing; exit 1 on any rule failing; exit 2 on config/parse errors.
- Do NOT change the CLI interface, argument parsing, or existing rule structure.

### E. `packages/haiku-ui/tests/audit-banned-patterns.test.ts` (NEW)

```ts
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "../scripts/audit-banned-patterns.mjs")

describe("audit-banned-patterns.mjs", () => {
  it("stage-wide profile passes with zero bans and all required-presence matches", () => {
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, "--profile=stage-wide"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
    expect(stdout).not.toMatch(/FAIL|hit|missing/i)
  })

  it("tokens profile passes with zero bans", () => {
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, "--profile=tokens"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
    expect(stdout).not.toMatch(/FAIL|hit/i)
  })
})
```

`execFileSync` throws (non-zero exit) → test fails. `execFileSync` succeeds (exit 0) → test passes. The `stdout` regex guard is a defensive assertion layer — the exit code is the primary signal.

### F. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-09-tactical-plan.md` (NEW — this file)

## Verification Commands

Run in order. Each command's exit-0 is a hard gate for this unit's Completion Criteria.

1. **Typecheck** (Completion Criteria line 89):
   ```bash
   cd packages/haiku-ui && npx tsc --noEmit
   ```
   Must exit 0. No new type errors.

2. **Vitest** (Completion Criteria lines 42-87):
   ```bash
   cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx tests/audit-banned-patterns.test.ts
   ```
   Must exit 0. All Completion Criteria scenarios pass — default render, keyboard (Space + Enter), accessibility tree (getByRole), default aria-checked=false, touch target ≥ 44×44, reduced motion, live-region announce on + off, controlled mode, count chip, disabled.

3. **Banned-patterns audit — tokens profile**:
   ```bash
   cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=tokens
   ```
   Must exit 0. Zero hits on `banned-text-small`, `banned-text-gray`, `banned-stone-400-light`, `banned-opacity-state`, `banned-disabled-opacity`, `banned-focus-ring-1`, `banned-sidebar-drift`, `banned-content-max-literal`, `banned-button-verb-content`, `banned-button-verb-aria`.

4. **Banned-patterns audit — stage-wide profile** (Completion Criteria lines 75-77):
   ```bash
   cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=stage-wide
   ```
   Must exit 0. Zero hits on `banned-origin-jsx-bare` and `banned-agent-feedback-toggle-copy`. Non-zero required-presence matches on `require-agent-feedback-toggle-canonical` (scope resolves the single new file; pattern `"Show agent feedback inline"` appears exactly once in the `aria-label` JSX assignment).

5. **Full test suite (regression sweep)**:
   ```bash
   cd packages/haiku-ui && npx vitest run
   ```
   Must exit 0 across every existing test (unit-03 extract-haiku-ui, unit-04 primitives, unit-05 a11y foundations, plus this unit's new tests). No pre-existing-issue excuses — any red light blocks this unit.

6. **Biome lint (if the package exposes it)**:
   ```bash
   cd packages/haiku-ui && npx biome check src/components/feedback/AgentFeedbackToggle.tsx src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx
   ```
   Exit 0 required. Conform to the existing biome config in the repo.

## Commit Sequence (this unit)

1. **Plan commit** (this file already created): `haiku(unit-09/planner): tactical plan for AgentFeedbackToggle`.
2. **Builder bolt 1** (not this hat): audit-config rule + audit-script `requirePresence` extension + audit-smoke test.
3. **Builder bolt 2**: `AgentFeedbackToggle.tsx` component + `__tests__/AgentFeedbackToggle.test.tsx`.
4. **Builder bolt 3 (if needed)**: refinements from typecheck/lint feedback.
5. **Reviewer**: final pass.

Builder should commit frequently within each bolt — one logical chunk per commit — so any rollback has fine granularity. Use imperative commit subjects: `haiku(unit-09/builder): ...`.

## Downstream Consumers (for context, not this unit's scope)

- **unit-07** (review-page-desktop-and-mobile) composes `AgentFeedbackToggle` inside the review sidebar with the real count + `onChange` wired to a list filter.
- **unit-10** (feedback-sheet-mobile) composes `AgentFeedbackToggle` inside the mobile sheet header.
- **unit-15** (stagewide-audit) re-runs both audit profiles against the full stage output — this unit's audit additions are picked up automatically.

## Summary

Tight, test-first greenfield component under tight scope (one source file, one test file, one audit-config edit, one audit-script extension, one audit-smoke test). Every Completion Criteria has a named test; every assertion has a concrete API call. The `useAnnounce()` signature resolution and the `requirePresence` audit extension are the two non-trivial decisions — both resolved conservatively (no API refactor of a11y primitives; minimally additive audit behavior).
