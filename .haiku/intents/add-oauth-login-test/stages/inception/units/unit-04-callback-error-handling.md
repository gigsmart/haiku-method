---
title: Callback Error Handling
type: backend
status: complete
depends_on: [unit-02-callback-handler]
---

# Unit 04: Callback Error Handling

Map error paths for both OAuth providers. Google and GitHub have different failure modes that need separate error handling.

## Completion Criteria

- [x] Google error responses mapped: `access_denied`, `invalid_grant` (expired code), `invalid_client`
- [x] GitHub error responses mapped: `bad_verification_code`, `incorrect_client_credentials`, `redirect_uri_mismatch`
- [x] Error-to-user-message mapping defined — each provider error maps to a user-friendly message
- [x] Rate limiting on callback endpoint: 100 requests/minute per IP, returns 429 with `Retry-After` header
- [x] All error paths redirect to `/login?error={code}` with provider-specific error codes
