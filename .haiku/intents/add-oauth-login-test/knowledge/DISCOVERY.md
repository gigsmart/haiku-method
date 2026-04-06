# Discovery: OAuth Login

## Domain Model

### Entities

- **User** — application user account, linked to one or more OAuth identities
- **OAuthIdentity** — provider-specific identity (provider, provider_user_id, email, profile_data)
- **Session** — authenticated session with access/refresh token pair
- **OAuthProvider** — abstraction over Google/GitHub/future providers

### Relationships

```
User 1--* OAuthIdentity
User 1--* Session
OAuthProvider 1--* OAuthIdentity
```

## Technical Landscape

### Current State

- Express.js backend (v4.18) with TypeScript
- React 18 frontend with Vite bundler
- PostgreSQL 15 with Prisma ORM
- Existing email/password auth via bcrypt + JWT
- Kubernetes deployment with Helm charts
- HashiCorp Vault for secrets (migrating from K8s secrets)

### OAuth Provider Analysis

#### Google

- Authorization endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Token endpoint: `https://oauth2.googleapis.com/token`
- Supports PKCE (code_verifier/code_challenge)
- Server-side code exchange with client_secret
- Returns id_token with email, name, picture
- Scopes needed: `openid email profile`

#### GitHub

- Authorization endpoint: `https://github.com/login/oauth/authorize`
- Token endpoint: `https://github.com/login/oauth/access_token`
- Does NOT support PKCE — relies on state parameter + client_secret
- Separate API call needed for user profile (`/user` endpoint)
- Separate API call needed for email (`/user/emails` endpoint)
- Scopes needed: `user:email read:user`

### Provider Abstraction

Interface designed to normalize differences:

```typescript
interface OAuthProvider {
  name: string
  getAuthorizationUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>
  getUserProfile(tokenSet: TokenSet): Promise<OAuthUserProfile>
}
```

This abstraction hides the per-provider quirks (Google's id_token vs GitHub's API calls, PKCE support differences) behind a uniform interface. Adding Apple later requires implementing this interface — no changes to the callback handler or session logic.

## Key Decisions

1. **Provider abstraction over direct integration** — extra layer pays off when adding providers
2. **httpOnly cookies for tokens** — not localStorage, not sessionStorage
3. **Separate callback error handling** — Google and GitHub have different failure modes
4. **Vault for secrets** — aligning with org migration away from K8s secrets
