---
title: Login UI
type: frontend
status: complete
depends_on: [unit-01-oauth-provider]
---

# Unit 02: Login UI

Build the login page components following the design brief specifications.

## Completion Criteria

- [x] `LoginPage` component: full-page layout with centered card, app logo, social buttons
- [x] `OAuthButton` component: provider logo, label, all interactive states (hover, focus, active, loading, disabled)
- [x] Responsive layout verified at 375px, 768px, and 1280px breakpoints
- [x] "Forgot password?" link positioned below social buttons, navigates to `/forgot-password`
- [x] Error display: reads `?error=` query param and shows contextual error message
- [x] Loading state: button shows spinner and "Connecting..." during OAuth redirect
- [x] Touch targets: all buttons at least 44px on mobile
- [x] Accessibility: `aria-label` on buttons, `aria-busy` on loading, focus ring on all interactive elements
