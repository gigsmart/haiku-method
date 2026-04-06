---
title: Session Management
type: backend
status: complete
depends_on: [unit-02-callback-handler]
---

# Unit 03: Session Management

Define session lifecycle: creation, storage, refresh, and expiration.

## Completion Criteria

- [x] Session stored as httpOnly cookie with Secure and SameSite=Lax flags
- [x] Access token expires after 1 hour, refresh token after 30 days
- [x] Refresh endpoint defined: `POST /auth/refresh`
- [x] Session revocation on logout: `POST /auth/logout` clears cookie and invalidates refresh token in database
- [x] Concurrent session support — user can be logged in from multiple devices
