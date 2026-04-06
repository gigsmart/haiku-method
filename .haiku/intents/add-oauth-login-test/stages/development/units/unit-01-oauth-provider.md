---
title: OAuth Provider Integration
type: backend
status: complete
depends_on: []
---

# Unit 01: OAuth Provider Integration

Implement the OAuth provider abstraction and concrete providers for Google and GitHub.

## Completion Criteria

- [x] `OAuthProvider` interface implemented with `getAuthorizationUrl`, `exchangeCode`, `getUserProfile`
- [x] `GoogleOAuthProvider` implements server-side code exchange with PKCE support
- [x] `GitHubOAuthProvider` implements code exchange + separate user profile and email API calls
- [x] Provider registry: `getProvider(name: string): OAuthProvider` with runtime validation
- [x] Callback route `GET /auth/callback/:provider` validates state, exchanges code, creates/links user, creates session
- [x] Race condition fix: mutex lock on token write to prevent concurrent token exchanges from corrupting the token store
- [x] Unit tests for both providers with mocked HTTP responses (>80% coverage)
- [x] Integration test: full callback flow with test OAuth server
