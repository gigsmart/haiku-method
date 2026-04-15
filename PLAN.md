# PLAN: unit-06-spa-iframe-layout

**Unit:** SPA iframe layout — conditional decision panels + boot/error/success screens
**Stage:** development
**Hat sequence:** planner → builder → reviewer
**Branch:** `haiku/cowork-mcp-apps-integration/unit-06-spa-iframe-layout`
**Worktree:** `/Volumes/dev/src/github.com/gigsmart/haiku-method/.haiku/worktrees/cowork-mcp-apps-integration/unit-06-spa-iframe-layout`

---

## What this unit does

Implements the iframe-mode layout in the bundled review SPA by refactoring the existing page
components to conditionally swap their decision-panel children for bottom-sheet variants when
`isMcpAppsHost() === true`. Creates 11 new iframe-only components. Browser-mode rendering stays
byte-identical — the same JSX, the same DOM, the same snapshot.

**Key constraint:** Do NOT create a wrapping `IframeShell` component. Refactor decision panels
conditionally inside the existing page components.

---

## Files to create

| File | Purpose |
|---|---|
| `packages/haiku/review-app/src/components/iframe/BottomSheetDecisionPanelReview.tsx` | Approve / Changes / External with drag-to-expand |
| `packages/haiku/review-app/src/components/iframe/BottomSheetDecisionPanelQuestion.tsx` | Answers form + submit |
| `packages/haiku/review-app/src/components/iframe/BottomSheetDecisionPanelDesign.tsx` | Archetype + parameters |
| `packages/haiku/review-app/src/components/iframe/IframeTopBar.tsx` | 36px status strip (slug + session type + HostBridgeStatus) |
| `packages/haiku/review-app/src/components/iframe/HostBridgeStatus.tsx` | Connected/reconnecting/error pill with `aria-live="polite"` |
| `packages/haiku/review-app/src/components/iframe/IframeBootScreen.tsx` | Three-phase loading screen (loading/connecting/ready) |
| `packages/haiku/review-app/src/components/iframe/NegotiationErrorScreen.tsx` | Centered error card for NEGOTIATION_FAILED |
| `packages/haiku/review-app/src/components/iframe/SandboxErrorScreen.tsx` | Centered error card for SANDBOX_CLIPBOARD_WRITE |
| `packages/haiku/review-app/src/components/iframe/SessionExpiredScreen.tsx` | Centered error card for SESSION_EXPIRED |
| `packages/haiku/review-app/src/components/iframe/StaleHostWarning.tsx` | Non-blocking protocol version mismatch warning |
| `packages/haiku/review-app/src/components/iframe/DecisionSuccess.tsx` | Three variants (approved/changes_requested/external_review), focus on heading |
| `packages/haiku/review-app/src/components/iframe/useBreakpoint.ts` | ResizeObserver hook — returns 'narrow'/'medium'/'wide' |
| `packages/haiku/review-app/src/components/iframe/__tests__/BottomSheetDecisionPanelReview.test.tsx` | Tests: drag, keyboard shortcuts, focus, aria |
| `packages/haiku/review-app/src/components/iframe/__tests__/conditional-render.test.tsx` | Tests: isMcpAppsHost true/false branch in each page |
| `packages/haiku/review-app/src/components/iframe/__tests__/IframeBootScreen.test.tsx` | Tests: boot phases, reduced-motion |
| `packages/haiku/review-app/src/components/iframe/__tests__/error-screens.test.tsx` | Tests: error state round-trips, aria-live, dismissal |
| `packages/haiku/review-app/src/components/iframe/__tests__/useBreakpoint.test.ts` | Tests: ResizeObserver-driven breakpoints |

## Files to modify

| File | Change |
|---|---|
| `packages/haiku/review-app/src/components/ReviewPage.tsx` | Add `isMcpAppsHost()` branch — render `<BottomSheetDecisionPanelReview>` instead of `<ReviewSidebar>` when in iframe mode |
| `packages/haiku/review-app/src/components/QuestionPage.tsx` | Add `isMcpAppsHost()` branch — render `<BottomSheetDecisionPanelQuestion>` instead of inline submit button |
| `packages/haiku/review-app/src/components/DesignPicker.tsx` | Add `isMcpAppsHost()` branch — render `<BottomSheetDecisionPanelDesign>` instead of inline submit button |
| `packages/haiku/review-app/src/components/AnnotationCanvas.tsx` | Add `isMcpAppsHost()` branch — render `<BottomSheetDecisionPanelAnnotation>` (Apply/Clear bottom sheet) |
| `packages/haiku/review-app/src/App.tsx` | Add `isMcpAppsHost()` chrome — render `<IframeTopBar>`, `<IframeBootScreen>`, `<NegotiationErrorScreen>`, `<DecisionSuccess>` |

---

## Step-by-step implementation

### Step 0 — Measure bundle baseline

```bash
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.haiku/worktrees/cowork-mcp-apps-integration/unit-06-spa-iframe-layout
npm --prefix packages/haiku run prebuild 2>&1 | grep REVIEW_APP_HTML
```

Record the gzipped size of the `REVIEW_APP_HTML` constant as the baseline. The ceiling is
baseline + 50 KB.

### Step 1 — Create `useBreakpoint.ts`

Create `packages/haiku/review-app/src/components/iframe/useBreakpoint.ts`:

```ts
import { useEffect, useRef, useState } from "react";

export type Breakpoint = "narrow" | "medium" | "wide";

/**
 * Returns the current iframe breakpoint, driven by ResizeObserver on a
 * given element ref. Does NOT read window.innerWidth.
 *
 * Thresholds (from DESIGN-TOKENS.md):
 *   narrow:  width <= 480px
 *   medium:  481–768px
 *   wide:    >= 769px
 */
export function useBreakpoint(ref: React.RefObject<HTMLElement | null>): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("narrow");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 480) setBp("narrow");
      else if (width <= 768) setBp("medium");
      else setBp("wide");
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);

  return bp;
}
```

### Step 2 — Capture browser-mode snapshots (baseline for criterion 3)

Before touching any page components, run `npm test` to establish snapshot baselines.
The test file `conditional-render.test.tsx` will capture snapshots when `isMcpAppsHost === false`.
These snapshots become the byte-identity baseline for post-refactor comparison.

### Step 3 — Create `HostBridgeStatus.tsx`

Bridge state: `'connected' | 'reconnecting' | 'error'`.

- Props: `status: BridgeStatus; onRetry?: () => void`
- Connected: teal-500 dot, text "Connected"
- Reconnecting: amber-400 animate-pulse dot, text "Reconnecting"  
- Error: red-500 dot, text "Error · retry" (click calls `onRetry`)
- Wraps in `<div role="status" aria-live="polite">` (polite for non-errors) and `aria-live="assertive"` for error state
- Min touch target 44×44 for the retry affordance

### Step 4 — Create `IframeTopBar.tsx`

- Height: `h-9` (36px), sticky top-0, `bg-stone-900 border-b border-stone-800`
- Slots: `slug` (text-xs, truncated), `sessionType`, `<HostBridgeStatus>`
- Only renders when `isMcpAppsHost() === true` (caller gates it in App.tsx)

### Step 5 — Create `IframeBootScreen.tsx`

- State: `'loading' | 'connecting' | 'ready'`
- On mount: immediately `loading`, transitions to `connecting` after 100ms, then `ready` after session data arrives
- On `ready`: fade out (`opacity-0 transition-opacity duration-200`) then unmount; respects `prefers-reduced-motion` (instant show/hide, no transition)
- Only rendered when `isMcpAppsHost() === true` (caller gates it)
- Spinner: `animate-spin rounded-full border-2 border-stone-800 border-t-teal-500`; hidden when `prefers-reduced-motion: reduce` — shows static "Loading…" instead

### Step 6 — Create four error screen components

All four share the same structure: centered card, `aria-live="assertive"` on the error message container, visible error code, recovery action.

**`NegotiationErrorScreen.tsx`**
- Props: `errorCode: string; sessionId: string; onRetry: () => Promise<void>`
- States: default, retry-pending (spinner on button), retry-failed (escalate panel revealed)
- Escalate panel: copy-to-clipboard `sessionId` field

**`SandboxErrorScreen.tsx`**
- Props: `feature: string; errorCode: string`
- States: default, disclosure-open
- Disclosure: `<details>` with "Why this happens" summary + explanation text

**`SessionExpiredScreen.tsx`**
- Props: `errorCode: string`
- Recovery: copy-to-clipboard "Please generate a new review link"
- Fallback: if clipboard blocked, reveal `<textarea>` for select-to-copy
- No `window.open` anywhere in this component

**`StaleHostWarning.tsx`**
- Props: `hostVersion: string; expectedVersion: string; onDismiss: () => void`
- Non-blocking (renders alongside content, not over it)
- Dismiss button unmounts the warning
- `aria-live="assertive"` on the warning container

### Step 7 — Create `DecisionSuccess.tsx`

- Variants: `'approved' | 'changes_requested' | 'external_review'`
- Props: `variant: DecisionVariant`
- Heading: `tabIndex={-1}` with `ref` that auto-focuses on mount via `useEffect(() => { headingRef.current?.focus() }, [])`
- `aria-live="polite"` on the container (for screen readers)
- No `window.close`, no `tryCloseTab`, no nav away — waits for host to unmount
- Variant-specific copy and icon (teal for approved, amber for changes, indigo for external)

### Step 8 — Create `BottomSheetDecisionPanelReview.tsx`

This is the most complex component. Based on the `iframe-shell-narrow-collapsed.html` design mockup.

**Layout:**
- `position: sticky; bottom: 0` via `sticky bottom-0` Tailwind
- Container: `bg-stone-900 border-t-2 border-teal-500` with `box-shadow: 0 -8px 24px rgba(0,0,0,0.4)`
- Drag handle: `mx-auto w-8 h-1 rounded-full bg-stone-600 hover:bg-stone-400 cursor-grab` — min 44px touch target wrapper
- Snap points: `collapsed` (buttons only visible, ~80px) and `half-pane` (~50% iframe height, feedback textarea visible)
- `opacity-0.6` backdrop dim when expanded (via pseudo-element or sibling div)

**Drag gesture logic (pointer events):**
```
onPointerDown: record startY + timestamp
onPointerMove: compute deltaY
onPointerUp:
  - velocity = deltaY / (timestamp_end - timestamp_start)
  - if abs(deltaY) >= 24px OR abs(velocity) >= 0.5px/ms: snap (up=expand, down=collapse)
  - else: snap back to current state
```
- Reduced motion: skip CSS transition (apply snap immediately)
- Keyboard: `onKeyDown` on drag handle — Up arrow → expand, Down arrow → collapse

**Decision buttons:**
- Approve: `bg-teal-500 text-stone-950 hover:bg-teal-400` — min h-11 (44px)
- Changes: `bg-stone-700 text-stone-100 hover:bg-stone-600` — min h-11
- External: outlined, `border-stone-600 text-stone-300 hover:border-stone-400` — min h-11
- Keyboard shortcuts `1`/`2`/`3` wired via `useEffect` on document keydown (iframe-mode only)
- Visible `<kbd>1</kbd>` hints in footer

**Feedback textarea** (half-pane only):
- `aria-labelledby` pointing to hidden heading
- `rows={4}` expandable

**Decision submission:**
- Calls `submitDecision` from `host-bridge.ts`
- On success: renders `<DecisionSuccess>` (replacing the bottom sheet)

### Step 9 — Create `BottomSheetDecisionPanelQuestion.tsx`

- Same bottom-sheet structure as Review variant (drag handle, snap points)
- No decision buttons in collapsed mode — shows "Submit Answers" button only
- In half-pane: shows submit button (full width, teal-500)
- Form wrapping: `aria-labelledby` pointing to hidden "Submit Your Answers" heading
- Wires to `submitAnswers` from `host-bridge.ts`
- On success: renders `<DecisionSuccess variant="approved">` (question answered maps to approved visually)

### Step 10 — Create `BottomSheetDecisionPanelDesign.tsx`

- Same bottom-sheet structure
- Collapsed: shows selected archetype name + "Choose This Direction" button
- Half-pane: shows parameter sliders inline in the sheet
- `aria-labelledby` on the form region
- Wires to `submitDesignDirection` from `host-bridge.ts`

### Step 11 — Refactor `ReviewPage.tsx`

Key change: extract the `<ReviewSidebar>` render into a conditional:

```tsx
const isIframe = isMcpAppsHost(); // read once at component level

// In JSX return:
{isIframe ? (
  <>
    <div className="flex-1 min-w-0">
      {/* same content area */}
    </div>
    <BottomSheetDecisionPanelReview
      sessionId={sessionId}
      gateType={session.gate_type}
      comments={sidebarComments}
      getAnnotations={getAnnotations}
      wsRef={wsRef}
      onDecisionSuccess={() => setShowSuccess(true)}
      ...
    />
  </>
) : (
  <div className="flex gap-6">
    <div className="flex-1 min-w-0">
      {/* same content area */}
    </div>
    <ReviewSidebar ... />  {/* unchanged */}
  </div>
)}
```

The browser-mode branch is byte-identical to the current code — the existing JSX is preserved
under `isMcpAppsHost() === false`. The snapshot test confirms this.

### Step 12 — Refactor `QuestionPage.tsx`

- Add `const isIframe = isMcpAppsHost();`
- Remove the standalone `<button type="submit">Submit Answers</button>` when `isIframe === true`
- Wrap form area in `<form>` with `aria-labelledby` pointing to a hidden heading (both modes)
- When `isIframe`: render `<BottomSheetDecisionPanelQuestion>` below the form
- When `!isIframe`: render the existing inline submit button (unchanged, byte-identical)

**Note:** The existing `tryCloseTab` call in QuestionPage must NOT appear in the iframe branch. The iframe-mode bottom sheet handles success state via `<DecisionSuccess>`.

### Step 13 — Refactor `DesignPicker.tsx`

- Add `const isIframe = isMcpAppsHost();`
- When `isIframe`: render `<BottomSheetDecisionPanelDesign>` below the archetype gallery, hide the existing "Choose This Direction" button
- When `!isIframe`: existing `<button>Choose This Direction</button>` unchanged
- The preview modal uses `position: fixed` — add a check: in iframe mode, skip the modal or render it as an in-document overlay (no `fixed` positioning to avoid scroll trap violation)

### Step 14 — Refactor `AnnotationCanvas.tsx`

- Add `isMcpAppsHost` import
- The decision controls for AnnotationCanvas (Apply/Clear) are toolbar buttons
- In iframe mode: the Apply and Clear actions stay in the toolbar (they're annotation controls, not decision submission)
- No decision panel needed here — the annotation canvas is embedded inside ReviewPage which has the decision panel
- Only change needed: ensure no `position: fixed` in iframe mode for any overlay

### Step 15 — Modify `App.tsx`

Add iframe chrome:
1. Import `isMcpAppsHost` from `host-bridge.ts`  
2. Add state: `bridgeStatus: BridgeStatus`, `bootPhase: BootPhase`, `iframeError: IframeError | null`
3. When `isMcpAppsHost()`:
   - Render `<IframeTopBar slug={...} sessionType={...} bridgeStatus={bridgeStatus} onRetry={handleRetry} />`
   - Render `<IframeBootScreen phase={bootPhase} onReady={() => setBootPhase('done')} />` until session loads
   - On session load error: set appropriate `iframeError` and render the matching error screen
   - Remove `<header>` and `<ThemeToggle>` (not needed in iframe mode — topbar replaces it)
   - Remove `<footer>` (no "Powered by H·AI·K·U" in iframe mode)
4. Browser mode: absolutely unchanged — same header, same footer, same ThemeToggle

### Step 16 — Write tests

**`conditional-render.test.tsx`** (criterion 2 + 3):
```tsx
// Mock isMcpAppsHost at the module level with vi.mock
// Test 1: isMcpAppsHost === true → BottomSheetDecisionPanelReview in DOM, ReviewSidebar absent
// Test 2: isMcpAppsHost === false → ReviewSidebar in DOM, BottomSheet absent
// Test 3: Snapshot assertion — false branch matches pre-refactor baseline
// Same pattern for QuestionPage, DesignPicker, AnnotationCanvas
```

**`BottomSheetDecisionPanelReview.test.tsx`** (criteria 4, 5, 7, 8, 9):
```tsx
// Drag gesture: fireEvent.pointerDown, pointerMove 24px, pointerUp → half-pane class
// Drag gesture: < 24px → no transition
// Velocity: mock timestamp, 0.6px/ms upward fling → half-pane
// Keyboard shortcuts: userEvent.keyboard('1') → approve fires
// Touch target: every button/a/input has computed minHeight/minWidth >= 44
// Focus on mount: document.activeElement === first interactive element
// Focus on success: after submit, document.activeElement === DecisionSuccess heading
```

**`error-screens.test.tsx`** (criteria 6, 10):
```tsx
// NegotiationErrorScreen: stub callServerTool to throw NEGOTIATION_FAILED → screen renders
// Retry: callServerTool succeeds → screen unmounts
// aria-live: each error screen has aria-live="assertive"
// HostBridgeStatus: aria-live="polite", states: connected/reconnecting/error
```

**`IframeBootScreen.test.tsx`** (criteria 14):
```tsx
// Renders when isMcpAppsHost === true, no session yet
// Does not render when isMcpAppsHost === false
// prefers-reduced-motion: mock matchMedia → no animate-spin class
```

**`useBreakpoint.test.ts`** (criterion 12):
```tsx
// Mock ResizeObserver, fire contentRect.width = 400 → 'narrow'
// Fire contentRect.width = 600 → 'medium'
// Fire contentRect.width = 900 → 'wide'
```

### Step 17 — Verify no `window.close` in new components (criterion 11)

```bash
rg -n 'window\.close|history\.back|tryCloseTab' \
  packages/haiku/review-app/src/components/iframe/ \
  packages/haiku/review-app/src/App.tsx
```

Must return 0 hits.

### Step 18 — Typecheck + test suite (criteria 15, 16)

```bash
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.haiku/worktrees/cowork-mcp-apps-integration/unit-06-spa-iframe-layout
npm --prefix packages/haiku/review-app install
npx --prefix packages/haiku/review-app tsc --noEmit
npm --prefix packages/haiku/review-app test
npm --prefix packages/haiku run prebuild && npm --prefix packages/haiku run typecheck && npx --prefix packages/haiku biome check src && npm --prefix packages/haiku test
```

All must exit 0. Bundle gzipped size ≤ baseline + 50 KB.

---

## Risk assessment

| Risk | Mitigation |
|---|---|
| Snapshot drift on ReviewPage after iframe branch added | Capture baseline snapshot in first commit before touching components; use `isMcpAppsHost() === false` guard in test |
| `position: fixed` in DesignPicker preview modal causes scroll trap in iframe mode | In iframe mode, render modal as absolute/in-document overlay, not fixed |
| `tryCloseTab` already in QuestionPage and DesignPicker | Do NOT import or call in the iframe branch at all; keep it only in the non-iframe branch |
| ResizeObserver not available in jsdom | Provide a simple mock in vitest setup |
| `@modelcontextprotocol/ext-apps` not available in test env | Already handled by vitest.config.ts alias setup from unit-05 |
| Bottom sheet using `position: fixed` instead of `sticky` | Use `sticky bottom-0` inside a flex-column wrapper, matching the design mockup spec exactly |
| Bundle size exceeding ceiling after 11 new components | Keep components lean — shared drag logic as a custom hook, no external animation libs |

---

## Implementation order (dependency graph)

1. `useBreakpoint.ts` (no deps)
2. `HostBridgeStatus.tsx` (no deps)
3. `IframeTopBar.tsx` (deps: HostBridgeStatus)
4. `IframeBootScreen.tsx` (no deps)
5. Error screens: `NegotiationErrorScreen`, `SandboxErrorScreen`, `SessionExpiredScreen`, `StaleHostWarning` (no deps)
6. `DecisionSuccess.tsx` (no deps)
7. `BottomSheetDecisionPanelReview.tsx` (deps: host-bridge submitDecision, DecisionSuccess)
8. `BottomSheetDecisionPanelQuestion.tsx` (deps: host-bridge submitAnswers, DecisionSuccess)
9. `BottomSheetDecisionPanelDesign.tsx` (deps: host-bridge submitDesignDirection, DecisionSuccess)
10. Refactor `ReviewPage.tsx` (deps: BottomSheetDecisionPanelReview)
11. Refactor `QuestionPage.tsx` (deps: BottomSheetDecisionPanelQuestion)
12. Refactor `DesignPicker.tsx` (deps: BottomSheetDecisionPanelDesign)
13. Refactor `AnnotationCanvas.tsx` (minor)
14. Modify `App.tsx` (deps: IframeTopBar, IframeBootScreen, error screens)
15. Write all tests
16. Run all verification commands

---

## Verification commands (in order)

```bash
# Criterion 1 — files exist
for f in \
  BottomSheetDecisionPanelReview.tsx \
  BottomSheetDecisionPanelQuestion.tsx \
  BottomSheetDecisionPanelDesign.tsx \
  IframeTopBar.tsx \
  HostBridgeStatus.tsx \
  IframeBootScreen.tsx \
  NegotiationErrorScreen.tsx \
  SandboxErrorScreen.tsx \
  SessionExpiredScreen.tsx \
  StaleHostWarning.tsx \
  DecisionSuccess.tsx; do
  test -f "packages/haiku/review-app/src/components/iframe/$f" && echo "OK: $f" || echo "MISSING: $f"
done

# Criterion 11 — no window.close
rg -n 'window\.close|history\.back|tryCloseTab' \
  packages/haiku/review-app/src/components/iframe/ \
  packages/haiku/review-app/src/App.tsx 2>/dev/null && echo "FAIL: found forbidden calls" || echo "OK: no forbidden calls"

# Criteria 15 + 16 — typecheck, tests, bundle
npm --prefix packages/haiku/review-app install
npx --prefix packages/haiku/review-app tsc --noEmit
npm --prefix packages/haiku/review-app test
npm --prefix packages/haiku run prebuild
npm --prefix packages/haiku run typecheck
npx --prefix packages/haiku biome check src
npm --prefix packages/haiku test
```

All commands must exit 0.

---

## Key design decisions

1. **`isMcpAppsHost()` called once per component** — cached at module level in host-bridge.ts so it's effectively a constant. Call it once at the top of the render function and use the local variable throughout.

2. **Bottom sheet uses `position: sticky; bottom: 0`**, not `position: fixed`. The page root is `display: flex; flex-direction: column; min-height: 100vh`. Content area has `flex: 1; overflow-y: auto`. Sheet sticks to the bottom of the iframe viewport without escaping it (as specified in the design mockup comments).

3. **Drag gesture in React** — use `onPointerDown`/`onPointerMove`/`onPointerUp` on the drag handle. Call `el.setPointerCapture(e.pointerId)` on down to track the pointer even outside the element. Store `{ startY, startTime }` in a ref (not state, to avoid re-render during drag).

4. **No external drag/animation libraries** — keep bundle lean. CSS transition on the sheet height/transform for the snap animation; `prefers-reduced-motion` check removes the transition class.

5. **Browser-mode snapshot identity** — the refactor must NOT change any JSX rendered when `isMcpAppsHost() === false`. The conditional is only additive. The snapshot test catches any regression.

6. **`tryCloseTab` stays in browser mode only** — the iframe mode never calls `tryCloseTab`, `window.close`, or `history.back`. `DecisionSuccess` waits for the host to unmount.

7. **DesignPicker preview modal** — the current `position: fixed` modal is fine in browser mode. In iframe mode, skip rendering the full-screen preview modal (it would break the no-fixed-positioning constraint). The archetype cards already have `h-48` inline preview iframes, which is sufficient.
