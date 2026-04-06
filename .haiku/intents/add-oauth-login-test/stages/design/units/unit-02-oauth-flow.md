---
title: OAuth Flow
type: design
status: complete
depends_on: [unit-01-login-screen]
---

# Unit 02: OAuth Flow

Design the user experience for the OAuth authorization and callback flow.

## Completion Criteria

- [x] Loading state while redirecting to provider (spinner + "Redirecting to Google/GitHub...")
- [x] Callback processing state (spinner + "Signing you in...")
- [x] Error states for each error type: access denied, expired code, rate limited, generic error
- [x] Success redirect: callback -> brief success indicator -> app dashboard
- [x] Error redirect: callback -> login page with contextual error message
- [x] Flow diagram covering happy path, error paths, and rate-limit path
