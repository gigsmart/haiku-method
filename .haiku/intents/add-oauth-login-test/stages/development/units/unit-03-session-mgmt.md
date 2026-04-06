---
title: Session Management
type: backend
status: complete
depends_on: [unit-01-oauth-provider]
---

# Unit 03: Session Management

Implement the session lifecycle including creation, storage, refresh, and expiration.

## Completion Criteria

- [x] Session creation: generates access token (1h expiry) and refresh token (30d expiry), stored in httpOnly cookies
- [x] Cookie flags: `Secure`, `SameSite=Lax`, `HttpOnly`, `Path=/`
- [x] Refresh endpoint `POST /auth/refresh`: validates refresh token, issues new access token, rotates refresh token
- [x] Logout endpoint `POST /auth/logout`: clears cookies and invalidates refresh token in database
- [x] Rate limiting: callback endpoint enforces 100 req/min per IP, returns 429 with `Retry-After` header
- [x] Concurrent sessions: user can be logged in from multiple devices simultaneously
- [x] Database migration: `sessions` table with `user_id`, `refresh_token_hash`, `expires_at`, `created_at`
- [x] Unit tests for session creation, refresh, expiration, and revocation
