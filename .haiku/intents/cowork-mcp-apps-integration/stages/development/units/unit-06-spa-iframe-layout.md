---
title: SPA iframe layout — bottom sheet, topbar, error/success/boot screens
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
---

# SPA iframe layout — bottom sheet, topbar, error/success/boot screens

## Scope

Implement the design stage's iframe-mode layout in the bundled review SPA. The design artifacts at `stages/design/artifacts/` are the contract — every mockup translates to a React component or a style block on an existing component. Triggered when `isMcpAppsHost() === true`; browser-mode layout is unchanged.

### In scope

- **Responsive shell** — new `IframeShell.tsx` wrapping the existing routed content. `ResizeObserver` on the iframe root drives narrow/medium/wide breakpoints (not CSS media queries). Renders:
  - 36px top status strip with slug + session type + `<HostBridgeStatus>` pill
  - Bottom-sheet decision panel (drag-to-expand, touch + mouse + keyboard `Up`/`Down`), `position: sticky; bottom: 0`, snap points `collapsed` / `half-pane`, no full-pane
  - Content area fills the iframe; `opacity: 0.6` backdrop dim when sheet is expanded
- **`<HostBridgeStatus>` component** — connected/reconnecting/error pill with `aria-live="polite"`. Clicking `error` retries the bridge handshake.
- **`<IframeBootScreen>` component** — three phases (`loading` / `connecting` / `ready`) with `prefers-reduced-motion` fallback.
- **`<NegotiationErrorScreen>` / `<SandboxErrorScreen>` / `<SessionExpiredScreen>` / `<StaleHostWarning>`** components — one per error state from design unit-03. Each with `aria-live="assertive"`, specific error code, and concrete recovery action.
- **Success states** — new `<DecisionSuccess>` component with three variants (`approved` / `changes_requested` / `external_review`). Persistent until host unmounts; focus moves to the heading.
- **Touch targets ≥ 44px** on every interactive element. Verified by test.
- **Keyboard navigation** — Tab cycles within iframe; Shift+Tab from first element returns focus to host (browser default, no manual trap). Decision panel shortcuts: `1` approve, `2` changes, `3` external (with visible hints).
- **Focus management** — first interactive element focused on mount; after a decision, focus moves to the success heading.
- **Integration tests** via `@testing-library/react` in `packages/haiku/review-app/`. Mock `isMcpAppsHost() === true`; render `<App />`; assert the iframe shell is present, bottom sheet is present, status pill is in `connected` state, every button has `min-height: 44px`.

### Out of scope

- The host-bridge module itself (unit-05).
- Browser-mode layout — unchanged.
- Cowork-mode server handlers (units 03/04).
- Real `prefers-reduced-motion` handling in browser tests — mock the media query.
- `website/app/components/review/` — out of scope.

## Completion Criteria

1. **New components exist.** `test -f packages/haiku/review-app/src/components/IframeShell.tsx` and similarly for `HostBridgeStatus`, `IframeBootScreen`, `NegotiationErrorScreen`, `SandboxErrorScreen`, `SessionExpiredScreen`, `StaleHostWarning`, `DecisionSuccess`.
2. **IframeShell renders in MCP Apps mode only.** Vitest with `isMcpAppsHost()` mocked true → `<IframeShell>` present; mocked false → not rendered (browser layout wins).
3. **Bottom sheet drag gesture.** Vitest simulates `pointermove` by 24px on the drag handle → sheet transitions from `collapsed` to `half-pane`. Below 24px → no transition. Fling velocity threshold unit-tested separately.
4. **Touch target audit.** Vitest walks the rendered DOM and asserts every `<button>`, `<a>`, `<input>` has computed `minHeight >= 44 && minWidth >= 44`.
5. **`aria-live` regions.** `getAllByRole('status')` or query by `aria-live` asserts `<HostBridgeStatus>` is `polite` and the four error screens are `assertive`.
6. **Keyboard shortcuts.** Vitest: press `1` → Approve button triggers; `2` → Changes; `3` → External.
7. **Focus on mount.** After `<IframeShell>` mounts with session data, `document.activeElement` is the first interactive element in the content area.
8. **Focus on success.** After decision submission, `document.activeElement` is the `<DecisionSuccess>` heading.
9. **Error state round-trip.** Stub `App.callServerTool` to throw `NEGOTIATION_FAILED` → `<NegotiationErrorScreen>` renders with the error code visible. Stub retry to succeed → error screen unmounts and review content renders.
10. **No `window.close`.** `rg -n 'window\.close|history\.back|tryCloseTab' packages/haiku/review-app/src` returns 0 hits in the new components.
11. **ResizeObserver-driven breakpoints.** Vitest with a mocked `ResizeObserver` that fires `contentRect.width = 480` → narrow layout; `720` → medium; `960` → wide.
12. **Typecheck + test suite** clean in `packages/haiku/review-app/`.
13. **Bundle rebuild** succeeds and `REVIEW_APP_HTML` still inlines as a single string.
