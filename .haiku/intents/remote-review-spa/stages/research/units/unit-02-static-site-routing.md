---
title: Hash fragment routing for review page on static site
type: research
status: completed
quality_gates:
  - >-
    Confirms hash fragment approach works with Next.js static export + GitHub
    Pages
  - Documents the client-side token decoding flow
  - Verifies JWT can be decoded client-side without server-side verification
  - Identifies Next.js config or 404 handling needed
---

# Hash Fragment Routing for Review Page on Static Site

Decision: use `haikumethod.ai/review/#token` — hash fragments never hit the server, keeping the tunnel URL client-side only.

## Research Questions

1. Does a static `/review/index.html` page correctly receive hash fragments on GitHub Pages?
2. Can a JWT be decoded (not verified — ephemeral secret stays local) client-side with a lightweight library or native Web Crypto?
3. What should the JWT payload structure look like? (tunnel URL, session ID, expiry, session type)
4. How should the website handle an expired or malformed token gracefully?
5. Does the existing auth callback route provide any patterns we can reuse?
