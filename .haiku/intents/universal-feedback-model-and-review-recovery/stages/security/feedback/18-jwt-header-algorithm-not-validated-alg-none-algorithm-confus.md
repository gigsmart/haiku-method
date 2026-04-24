---
title: >-
  JWT header algorithm not validated — alg:none / algorithm confusion attack not
  blocked
status: closed
origin: adversarial-review
author: mitigation-effectiveness
author_type: agent
created_at: '2026-04-24T14:43:06Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:security-fb-18-manual'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 3
---

**Threat:** The `verifyTunnelJWT` function in `packages/haiku/src/tunnel.ts` implements a hand-rolled JWT verification. The header (`alg`, `typ`) is decoded from the token but **never validated**. The verification logic recomputes an HMAC-SHA256 signature and compares it via `timingSafeEqual`, which is correct — but only if the attacker cannot influence which algorithm is used.

**The problem:** The standard JWT "algorithm confusion" attack (`alg: none`) works when a verifier:
1. Parses the header and dispatches to the algorithm named in `alg`, OR
2. Trusts the header's `typ` / `alg` to select a verification path.

In this implementation, the verifier always uses HMAC-SHA256 regardless of the header's `alg` field (the header is parsed but discarded; see tunnel.ts:123-124). This means `alg: none` does not bypass the HMAC check — the signature comparison still happens with HMAC-SHA256.

**However, a related gap exists:** The decoded `header` variable is extracted (`const [header, body, sig] = parts`) but never inspected. The `body` is decoded and parsed for claims (tunnel.ts:147-152). If the server's HMAC check passes (because `EPHEMERAL_SECRET` is known or guessed), a token with `alg: "HS512"` in the header would still pass verification — the `alg` field in the header is decorative, not enforced.

**More critically for the stated mitigation:** The threat model (threat-model-expanded.md, E1) states "JWT key derived from active tunnel URL using a secret seed regenerated each server start." But `tunnel.ts:12` shows `const EPHEMERAL_SECRET = randomBytes(32)` — this is a random 32-byte key, not derived from the tunnel URL. The tunnel URL binding is done at claim level (`payload.tun` checked against `currentTunnel`), not at key level. This is fine, but the threat model description is inaccurate, which suggests the mitigation was reviewed against an incorrect understanding of the implementation.

**Root cause:** The header is decoded but never validated — not even for `alg: "none"`. A rigorous defense-in-depth posture should explicitly assert `header.alg === "HS256"` and `header.typ === "JWT"` before proceeding with verification, to close off any future algorithm confusion pathway if the verification logic is ever refactored.

**File references:**
- `packages/haiku/src/tunnel.ts:71` — `signJWT` sets `alg: "HS256"` in header
- `packages/haiku/src/tunnel.ts:117-170` — `verifyTunnelJWT` — header extracted at line 123 but never validated
- `packages/haiku/src/tunnel.ts:12` — `EPHEMERAL_SECRET = randomBytes(32)` (random, not URL-derived — threat model description is incorrect)
