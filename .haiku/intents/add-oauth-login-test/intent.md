---
title: add-oauth-login
studio: software
stages: [inception, design, product, development, operations, security]
status: complete
created: "2025-03-15T10:24:00Z"
completed: "2025-03-15T14:52:00Z"
---

# Add OAuth Login

Add OAuth-based authentication to the application, supporting Google and GitHub as identity providers. Replace the existing email/password-only login with a full-page login screen featuring social sign-in buttons, a forgot-password link, and proper session management.

## Goals

- Support Google and GitHub OAuth 2.0 flows
- Abstract provider integration so adding Apple later is trivial
- Full-page login with responsive design (mobile, tablet, desktop)
- Secure session management with httpOnly cookies
- Rate limiting on callback endpoints (100 req/min)
- Vault-based secret management for OAuth credentials
- STRIDE threat model with no unaddressed critical/high findings
