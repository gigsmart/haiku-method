---
title: Threat Model
type: security
status: complete
depends_on: []
---

# Unit 01: Threat Model

STRIDE analysis of the OAuth authentication surface.

## Completion Criteria

- [x] Spoofing: state parameter validated on callback to prevent CSRF — cryptographically random, single-use, expires after 10 minutes
- [x] Tampering: all tokens stored in httpOnly cookies — no client-side JavaScript access
- [x] Repudiation: authentication events logged with timestamp, provider, user_id, IP, success/failure
- [x] Information Disclosure: no sensitive data (tokens, secrets) in URL params, logs, or error messages
- [x] Denial of Service: rate limiting on callback endpoint (100 req/min per IP) with 429 response
- [x] Elevation of Privilege: OAuth scopes limited to minimum needed (`openid email profile` for Google, `user:email read:user` for GitHub)

## Known Risks (Accepted)

### GitHub PKCE Gap — MEDIUM

GitHub's OAuth implementation does not support PKCE (Proof Key for Code Exchange). This means the authorization code flow relies solely on the `state` parameter for CSRF protection and `client_secret` for code exchange security.

**Compensating controls:**
- Strict state validation (cryptographically random, single-use, 10-minute expiry)
- Short-lived authorization codes (GitHub default: 10 minutes)
- Client secret stored in Vault, never exposed client-side
- All token exchanges happen server-side

**Risk acceptance:** This is a GitHub platform limitation, not a fixable vulnerability. The compensating controls reduce the practical risk to acceptable levels.

## Findings Addressed

### localStorage Token Storage — HIGH (Fixed)

One code path stored the access token in `localStorage` instead of an httpOnly cookie. This was found in the OAuth callback error recovery flow where a failed cookie write fell through to a localStorage fallback.

**Fix:** Removed the localStorage fallback entirely. Failed cookie writes now redirect to login with a `cookie-error` message. No tokens are ever accessible to client-side JavaScript.
