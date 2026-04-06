---
title: OAuth Provider Setup
type: research
status: complete
depends_on: []
---

# Unit 01: OAuth Provider Setup

Research and map the OAuth provider abstraction layer for Google and GitHub.

## Completion Criteria

- [x] Provider abstraction interface defined with `getAuthorizationUrl`, `exchangeCode`, and `getUserProfile` methods
- [x] Google OAuth flow mapped: authorization URL construction, server-side code exchange, id_token parsing
- [x] GitHub OAuth flow mapped: authorization URL, token exchange, separate `/user` and `/user/emails` API calls
- [x] PKCE support documented — Google supports it, GitHub does not (state param + client_secret only)
- [x] Scope requirements documented for each provider
