# iframe-components

Iframe-mode UI components for the review SPA, produced by unit-06-spa-iframe-layout.

## Components

- `BottomSheetDecisionPanelReview.tsx` — drag-to-expand review decision panel
- `BottomSheetDecisionPanelQuestion.tsx` — drag-to-expand question answer panel
- `BottomSheetDecisionPanelDesign.tsx` — drag-to-expand design direction panel
- `DecisionSuccess.tsx` — post-decision success state (3 variants)
- `HostBridgeStatus.tsx` — connection status pill
- `IframeBootScreen.tsx` — loading/connecting/ready boot phases
- `IframeTopBar.tsx` — 36px top bar with slug + bridge status
- `NegotiationErrorScreen.tsx` — negotiation failure with retry + escalation
- `SandboxErrorScreen.tsx` — sandbox restriction error with disclosure
- `SessionExpiredScreen.tsx` — session expired with clipboard-copy recovery
- `StaleHostWarning.tsx` — protocol version mismatch warning
- `useBreakpoint.ts` — ResizeObserver-driven narrow/medium/wide breakpoint hook

## Implementation path

`packages/haiku/review-app/src/components/iframe/`
