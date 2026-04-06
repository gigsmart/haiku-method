---
title: Callback Handler
type: backend
status: complete
depends_on: [unit-01-oauth-provider-setup]
---

# Unit 02: Callback Handler

Analyze the OAuth callback flow for both providers and define the handler contract.

## Completion Criteria

- [x] Callback handler route defined: `GET /auth/callback/:provider`
- [x] State parameter validation flow documented (CSRF protection)
- [x] Google code exchange flow mapped — server-side exchange returns id_token directly
- [x] GitHub code exchange flow mapped — returns access_token, requires separate API call for profile
- [x] Token-to-session mapping defined: exchange result -> user lookup/create -> session creation
