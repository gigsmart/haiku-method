---
title: SPA iframe layout — conditional decision panels + boot/error/success screens
type: feature
model: sonnet
depends_on:
  - unit-05-spa-host-bridge
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/artifacts/
  - features/accessibility-iframe.feature
  - features/error-recovery.feature
  - .haiku/knowledge/ARCHITECTURE.md
status: pending
bolt: 0
hat: ''
started_at: null
completed_at: null
---

# SPA iframe layout — conditional decision panels + boot/error/success screens

## Scope

Implement the design stage's iframe-mode layout by **refactoring the existing page components** to conditionally swap their decision-panel children for bottom-sheet variants when `isMcpAppsHost() === true`. Browser mode rendering stays byte-identical — the same components, the same DOM, the same styles. Only the decision-panel sub-tree and a handful of new chrome components (status strip, boot screen, error screens, success states) are iframe-gated.

### In scope

- **Refactor existing page components** to accept a `DecisionPanel` slot (or render-prop) instead of hard-coding their current decision UI:
  - `packages/haiku/review-app/src/pages/ReviewPage.tsx`
  - `packages/haiku/review-app/src/pages/QuestionPage.tsx`
  - `packages/haiku/review-app/src/pages/DesignPicker.tsx`
  - `packages/haiku/review-app/src/components/AnnotationCanvas.tsx` (annotation-mode decision controls only)
  - Each component reads `isMcpAppsHost()` once at mount and picks between the legacy inline panel and the new `<BottomSheetDecisionPanel*>` variant. Browser-mode branch is unchanged — the pre-refactor JSX is preserved under `isMcpAppsHost() === false`.
- **New bottom-sheet decision-panel components** (one per session type, colocated with the page they serve):
  - `<BottomSheetDecisionPanelReview>` — three buttons (Approve / Changes / External)
  - `<BottomSheetDecisionPanelQuestion>` — answers form + submit
  - `<BottomSheetDecisionPanelDesign>` — archetype picker + parameter inputs
  - All three: `position: sticky; bottom: 0`, drag-to-expand (touch + mouse + keyboard `Up`/`Down`), snap points `collapsed` / `half-pane`, no full-pane, `opacity: 0.6` backdrop dim when expanded.
- **New chrome components** rendered by `<App />` only when `isMcpAppsHost()`:
  - `<IframeTopBar>` — 36px top status strip with slug + session type + `<HostBridgeStatus>` pill
  - `<HostBridgeStatus>` — connected/reconnecting/error pill with `aria-live="polite"`. Clicking `error` retries the bridge handshake.
  - `<IframeBootScreen>` — three phases (`loading` / `connecting` / `ready`) with `prefers-reduced-motion` fallback
  - `<NegotiationErrorScreen>` / `<SandboxErrorScreen>` / `<SessionExpiredScreen>` / `<StaleHostWarning>` — one per error state from design unit-03, each with `aria-live="assertive"`, a specific error code, and a concrete recovery action
  - `<DecisionSuccess>` — three variants (`approved` / `changes_requested` / `external_review`), persistent until host unmounts, focus moves to heading on mount
- **`ResizeObserver`-driven breakpoints** on the document root: narrow / medium / wide — applied to the bottom-sheet layout and the top bar, not CSS media queries (design artifacts measure the iframe, not the host viewport).
- **Touch targets ≥ 44px** on every interactive element across the iframe-mode components. Verified by test.
- **Keyboard navigation** — Tab cycles within iframe; Shift+Tab from first element returns focus to host (browser default, no manual trap). Decision-panel shortcuts: `1` approve, `2` changes, `3` external (with visible hints) — wired only in the bottom-sheet review variant.
- **Focus management** — first interactive element focused when a page mounts in iframe mode; after a decision, focus moves to the `<DecisionSuccess>` heading.
- **Integration tests** via `@testing-library/react` in `packages/haiku/review-app/`:
  - Mock `isMcpAppsHost() === true`; render each page; assert the bottom-sheet variant renders and the legacy inline panel does not.
  - Mock `isMcpAppsHost() === false`; render each page; assert the legacy inline panel renders byte-identical to main.

### Out of scope

- The host-bridge module itself (unit-05).
- Browser-mode decision-panel DOM — must stay byte-identical (snapshot-tested).
- Cowork-mode server handlers (units 03/04).
- Real `prefers-reduced-motion` handling in browser tests — mock the media query.
- `website/app/components/review/` — out of scope.
- Moving any existing component into an `IframeShell` wrapper — the existing routed tree is the shell; iframe-only chrome is rendered alongside it, not around it.

## Completion Criteria

1. **New components exist.** `test -f` for `BottomSheetDecisionPanelReview.tsx`, `BottomSheetDecisionPanelQuestion.tsx`, `BottomSheetDecisionPanelDesign.tsx`, `IframeTopBar.tsx`, `HostBridgeStatus.tsx`, `IframeBootScreen.tsx`, `NegotiationErrorScreen.tsx`, `SandboxErrorScreen.tsx`, `SessionExpiredScreen.tsx`, `StaleHostWarning.tsx`, `DecisionSuccess.tsx` (all under `packages/haiku/review-app/src/components/` or a new `components/iframe/` subdir).
2. **Conditional render in each page.** For each of `ReviewPage.tsx`, `QuestionPage.tsx`, `DesignPicker.tsx`, `AnnotationCanvas.tsx`: Vitest with `isMcpAppsHost() === true` asserts the bottom-sheet variant is in the DOM and the legacy inline panel is not; mocked `false` → inverse.
3. **Browser-mode DOM byte-identity.** Vitest snapshot test: render each page with `isMcpAppsHost() === false` pre- and post-refactor — snapshot matches the baseline captured at unit start. (Baseline: capture from `main` at unit start, store in `__snapshots__/` with a note in the commit message.)
4. **Bottom sheet drag gesture.** Vitest simulates `pointermove` by 24px on the drag handle → sheet transitions from `collapsed` to `half-pane`. Below 24px → no transition. Fling velocity threshold unit-tested separately.
5. **Touch target audit.** Vitest walks the rendered DOM (iframe mode) and asserts every `<button>`, `<a>`, `<input>` has computed `minHeight >= 44 && minWidth >= 44`.
6. **`aria-live` regions.** `getAllByRole('status')` or query by `aria-live` asserts `<HostBridgeStatus>` is `polite` and the four error screens are `assertive`.
7. **Keyboard shortcuts.** Vitest renders `<ReviewPage>` in iframe mode: press `1` → Approve fires; `2` → Changes; `3` → External.
8. **Focus on mount.** After a page mounts in iframe mode with session data, `document.activeElement` is the first interactive element in the content area.
9. **Focus on success.** After decision submission, `document.activeElement` is the `<DecisionSuccess>` heading.
10. **Error state round-trip.** Stub `App.callServerTool` to throw `NEGOTIATION_FAILED` → `<NegotiationErrorScreen>` renders with the error code visible. Stub retry to succeed → error screen unmounts and review content renders.
11. **No `window.close`.** `rg -n 'window\.close|history\.back|tryCloseTab' packages/haiku/review-app/src/components packages/haiku/review-app/src/pages` returns 0 hits in the new iframe-mode components.
12. **ResizeObserver-driven breakpoints.** Vitest with a mocked `ResizeObserver` that fires `contentRect.width = 480` → narrow layout class applied; `720` → medium; `960` → wide.
13. **Top bar iframe-gated.** `<IframeTopBar>` renders when `isMcpAppsHost() === true`; absent from the DOM when `false`.
14. **Boot screen iframe-gated.** Before session data arrives in iframe mode, `<IframeBootScreen>` renders; in browser mode the pre-refactor loading state renders.
15. **Typecheck + test suite** clean in `packages/haiku/review-app/`.
16. **Bundle rebuild** succeeds and `REVIEW_APP_HTML` still inlines as a single string.
