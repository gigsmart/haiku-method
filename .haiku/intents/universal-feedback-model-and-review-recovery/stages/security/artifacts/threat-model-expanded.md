# Threat Model: Expanded Surface — Universal Feedback Model

STRIDE analysis of the attack surfaces introduced or materially changed during implementation: the review SPA security model, tunnel JWT authentication, CORS origin enforcement, additive elaborate mode with `closes:` validation, `haiku_revisit` with reasons as an injection surface, insider threats, and supply chain risks.

**Predecessor:** `stages/security/THREAT-MODEL.md` (unit-01 — base STRIDE + OWASP Top 10)
**Date:** 2026-04-24
**Scope:** Expanded surfaces only — base surfaces covered by unit-01 are not duplicated here.

---

## Trust Boundaries (New and Extended)

The implementation revealed three trust boundaries not fully characterized in unit-01:

| Boundary | Trusted Side | Untrusted Side | Notes |
|---|---|---|---|
| SPA ↔ HTTP server (local) | HTTP server process | Browser / review app | Loopback only; no auth in local mode |
| Tunnel proxy ↔ HTTP server | HTTP server JWT verification | External network (proxied tunnel) | HAIKU_REMOTE_REVIEW=1; JWT + JWT-claim session binding |
| Subagent ↔ MCP server | MCP server process | Claude Task subagents | Subagents have full MCP tool access by inheritance |
| HTTP server ↔ filesystem | Filesystem (git-tracked) | HTTP handler code | All writes must go through writeFeedbackFile, not raw fs |
| Additive elaborate ↔ FSM state | FSM orchestrator | Agent-supplied `closes:` claims | Agent claims to close feedback; FSM validates independently |

---

## 1. Expanded STRIDE Analysis

### S — Spoofing (Extended)

#### S1: Agent calls haiku_revisit with fabricated reasons to inject arbitrary feedback
**Threat:** An agent passes `reasons: [{ title: "...", body: "..." }]` to `haiku_revisit`. The reasons array creates feedback files with `origin: "agent"` and `author_type: "agent"`. An adversarial agent could create hundreds of feedback files this way, filling the queue and blocking advancement.

**Likelihood:** Low (agent would be acting against its own goal of task completion)
**Impact:** Medium (creates gate blockers, but only pending items block — agent cannot close them without addressing them)

**Mitigation:**
- Feedback created via `haiku_revisit` reasons always gets `origin: "agent"` and `author_type: "agent"` (not human).
- Agent-authored feedback CAN be rejected by agents via `haiku_feedback_reject` — the gate is not permanently stuck.
- The `visits` counter provides a natural escalation signal: if visits > N (future threshold), the FSM can escalate to human.
- The reasons array itself does not write arbitrary content outside the intent's feedback directory — `writeFeedbackFile` constrains the write path via `slugifyTitle` and `validateSlugArgs`.

**Verification evidence:**
- `gate-feedback.test.mjs` — agent-authored feedback is rejectable by agents.
- `state-tools.ts:3762` — `revisit` path sets `origin: "agent"`, hardcoded.

**Status:** Mitigated.

---

#### S2: Review SPA identity spoofing — any browser can POST feedback as "user"
**Threat:** Since HTTP feedback endpoints use hardcoded `author: "user"` and `author_type: "human"` for the review UI context, a malicious actor who can reach the HTTP server can POST feedback that appears to be human-authored. In local mode (no tunnel), any process on the developer's machine can do this.

**Likelihood:** Low (local-only in default mode; attacker needs machine access)
**Impact:** High (human-authored feedback cannot be closed by agents — creates irremovable gate blockers)

**Mitigation (in local mode):** No additional auth needed — the threat model accepts that anyone with local access is trusted (same as being able to run `git commit` directly). This is a local developer tool.

**Mitigation (in remote/tunnel mode — FB-20, FB-30):**
- JWT tunnel authentication (FB-30): `verifyTunnelJWT` runs on every request before feedback handlers are reached. Unauthenticated callers get 401 `missing_token` before the feedback guard fires.
- JWT-claim session binding (evolved from FB-20): The implementation uses the JWT's `sid` claim for session binding — `verifyFeedbackMutationAuth` (`http.ts:423`) verifies the JWT, extracts the `sid` claim, and checks that the corresponding session's intent matches the URL's `{intent}` segment. No separate `X-Haiku-Session-Id` header is required or checked. JWTs for non-existent or wrong-intent sessions return 403 `forbidden_cross_session`.
- CORS origin enforcement (FB-36): `Access-Control-Allow-Origin` is only returned for request Origins in the `allowedOrigins` list (derived from `HAIKU_REVIEW_SITE_URL`). The browser enforces CORS; non-origin-matched preflights get no CORS headers and the real request is blocked.

**Remaining risk:** If an attacker obtains a valid JWT (which embeds the session ID in the signed `sid` claim), they can POST feedback as human. The JWT is short-lived (TTL bound) and tied to the tunnel URL. The underlying session is in-memory only, expires in 30 minutes, and is not persisted.

**Verification evidence:**
- `http-feedback-strict-auth.test.mjs`:
  - `POST with no auth at all returns 401 (tunnel gate: missing_token)` ✓
  - `POST with matching JWT (sid-bound session) proceeds (201)` ✓

**⚠ Test drift finding (development stage action required):**
The `http-feedback-strict-auth.test.mjs` tests were written against a design where FB-20 introduced an `X-Haiku-Session-Id` header requirement. The implementation settled on JWT-claim-based session binding (no separate header). Three tests are currently wrong and will fail if actually run:
- "POST with JWT but no X-Haiku-Session-Id returns 401" — server returns 201 (JWT alone is sufficient)
- "PUT with JWT but no X-Haiku-Session-Id returns 401" — same issue
- "DELETE with JWT but no X-Haiku-Session-Id returns 401" — same issue
- "CORS preflight advertises X-Haiku-Session-Id and Authorization in Allow-Headers" — X-Haiku-Session-Id is not in allowedHeaders

These tests appear to pass at runtime only because the re-exec subprocess pattern (spawnSync with `stdio: "inherit"`) causes the test runner to see 0 tests rather than actual pass/fail counts — the subprocess output goes to the parent's inherited stdio, not to the string captured by execSync. The tests exit 0 because spawnSync itself exits 0.

This is surfaced as a development-stage feedback item. The security control (JWT required + JWT-claim session binding) is correctly implemented; only the tests describing it are stale.

**Status:** Mitigated in remote mode. Local mode accepted. Tests require update (see development feedback).

---

### T — Tampering (Extended)

#### T1: Agent provides false `closes: [FB-NN]` references on a unit
**Threat:** In additive elaborate mode (visits > 0), an agent creates a unit with `closes: [FB-01, FB-02]` claiming to address feedback, but the actual implementation does not address those findings. The `closes:` field is just frontmatter — the FSM cannot validate that the code change actually fixes the issue.

**Likelihood:** Medium (agents operating under adversarial conditions or in bad bolts may do this accidentally)
**Impact:** High (if the feedback-assessor hat validates closures independently but can be prompt-injected, findings could be falsely closed)

**Mitigation:**
- The `feedback-assessor` hat is the terminal validator in `fix_hats`. It runs independently after the implementer and verifies that each `closes:` reference is actually resolved. If the assessor finds the fix insufficient, it calls `haiku_unit_reject_hat` with specific reasons.
- The FSM auto-injects the feedback-assessor hat for any unit with a non-empty `closes:` array (`orchestrator.ts:2783-2803`) — the agent cannot omit this hat.
- Human-authored feedback items require human closure (`status: closed`). Even a dishonest feedback-assessor hat cannot close human-authored items via MCP tools.
- Pending items still block the gate on the next tick — if a unit with `closes:` items passes but the feedback assessor failed to close the items, they remain `pending` and the gate rolls back again.

**Residual risk (MEDIUM):** In auto-gate stages, agent-driven `status: addressed` can allow advancement past human-authored feedback without human verification. This is an accepted design tradeoff — `addressed` is the agent's "I believe this is fixed" signal; the human gate is the verification layer. Stages processing human-authored feedback should use `ask` or `external` gates, not `auto`.

**Status:** Partially mitigated. `addressed` gate residual risk accepted for `auto`-gate stages.

---

#### T2: Direct filesystem frontmatter tampering (extended)
**Threat:** (Covered in unit-01 — git commit trail mitigates.) Extended consideration: an agent could call Node.js `fs.writeFileSync` directly to modify a feedback file's frontmatter, bypassing `updateFeedbackFile` guards and git tracking.

**Likelihood:** Very Low (requires agent to escape MCP tool boundary)
**Impact:** High

**Mitigation:** Same as unit-01 — git commit per mutation provides tamper-evident trail. MCP tool boundary means agents operate through `handleStateTool`, not raw Node.js.

**Status:** Mitigated (no regression from unit-01).

---

### R — Repudiation (Extended)

#### R1: WebSocket connection drops before feedback submission — findings lost without attribution
**Threat:** The review SPA uses WebSocket for session updates. If the WebSocket drops after a human types comments but before submitting "Request Changes", comments exist only in browser React state. They are never written to feedback files. There is no git trail, no attribution, no evidence the comments were made.

**Likelihood:** Medium (network instability, tab close, browser crash)
**Impact:** Low (user can re-enter comments; this is documented as a v2 concern in DISCOVERY.md)

**Mitigation:** This is a known limitation explicitly scoped out of v1 as "debounced incremental persistence of draft comments."

**v2 recommendation:** Debounce POST to `/api/feedback/{intent}/{stage}` as the user types, creating feedback files earlier to provide git-backed attribution even for incomplete reviews.

**Status:** Open — accepted v1 risk, documented for v2.

---

### I — Information Disclosure (Extended)

#### I1: CORS wildcard in tunnel mode leaks review UI content to any origin
**Threat:** When `HAIKU_REMOTE_REVIEW=1` and no `allowedOrigins` is configured, the CORS header `Access-Control-Allow-Origin: *` could be returned, allowing any web page to cross-fetch review session data including feedback content.

**Likelihood:** Low (requires specific misconfiguration)
**Impact:** Medium (feedback may include security findings or sensitive code references)

**Mitigation (FB-36):** CORS headers are now only returned for requests whose `Origin` header matches the `allowedOrigins` list. The wildcard `*` path is taken only when no explicit origins are configured AND `HAIKU_REMOTE_REVIEW=1` — a combination that produces a warning. The E2E tunnel encryption layer is the primary control for tunnel mode.

**Verification evidence:**
- `http-cors.test.mjs` — origin-matched and origin-mismatched CORS behavior tested.
- `http.ts:846-861` — allowedOrigins construction logic.

**Status:** Mitigated.

---

#### I2: Review session IDs in URLs allow bookmark-based replays
**Threat:** The review SPA URL contains the session ID (e.g., `/review/{sessionId}`). If a user bookmarks or shares this URL, anyone with it can reach the review session while it's active (up to 30-minute TTL).

**Likelihood:** Very Low
**Impact:** Low (read-only access; mutations still require JWT + valid session binding in tunnel mode)

**Status:** Accepted. Low residual risk.

---

#### I3: Tunnel JWT transmitted in WebSocket URL query string
**Threat:** The review SPA WebSocket upgrade (`openWebSocket` in `packages/haiku-ui/src/api/client.ts:245-264`) attaches the tunnel-auth JWT as a URL query parameter: `${basePath}?t=${encodeURIComponent(token)}`. Browsers do not allow custom headers (e.g., `Authorization: Bearer …`) on the WebSocket handshake, so the only way to pass the tunnel JWT to a WebSocket endpoint is via the URL. This is a weaker channel than the HTTP `Authorization` header used for all other tunnel-auth routes (see S2 / E1), and introduces three distinct disclosure vectors not covered by I1 (CORS) or I2 (session UUID replay):

1. **HTTP access logs.** Query string parameters are written verbatim into HTTP server access logs by default. Fastify is currently configured with `logger: false` (`packages/haiku/src/http.ts`), but any future enablement, any reverse proxy / tunnel provider (localtunnel upstream) with its own access log, or any sidecar (APM, WAF, CDN) that records full URLs will persist the JWT in plaintext in a log store. HTTP bearer headers are normally stripped or redacted by log formatters; query strings are not.
2. **Browser history and referrer surfaces.** WebSocket URLs with `?t=<jwt>` are recorded in `window.history` and are readable by any same-origin JavaScript (including any extension the user has installed that reads `window.location`). They may also leak via DevTools network panel exports and browser sync features. Shared / screenshared screens during a live review session can leak the JWT to bystanders.
3. **Process / OS visibility.** Query strings appear in process arguments for any command-line HTTP client invoked ad-hoc against the tunnel (curl logs, shell history), and in URL bars during screen recording.

The HTTP bearer token path (Authorization header on `/api/review/*` and `/api/feedback/*`) is the secure channel. The `?t=` query string is a known weaker channel and is the result of a browser platform constraint, not a design choice.

**Likelihood:** Low in default operation (local mode returns `null` token, so `?t=` is never appended; in tunnel mode the JWT-bearing URL only leaves the browser for the same tunnel host it is scoped to). Medium if Fastify `logger` is ever enabled, if the localtunnel provider is assumed to log, or if a user shares a browser session / DevTools export.
**Impact:** High per leaked token (the JWT embeds a valid `sid` and unlocks feedback mutations as the bound human session until expiry).

**Mitigations (already in place):**
- **Short JWT TTL is the primary mitigation.** `buildReviewUrl` in `packages/haiku/src/tunnel.ts:291-308` signs tunnel JWTs with `exp = iat + 3600` (1 hour). Any JWT leaked to a log or history entry is only usable until that expiry; `verifyTunnelJWT` (`tunnel.ts:117`) rejects expired tokens with `reason: "expired"`.
- **Tunnel URL binding.** The `tun` claim is verified against the currently-active tunnel URL; a JWT leaked from one tunnel session cannot be replayed against a later tunnel session, because each `openTunnel` rotates the ephemeral signing seed (`EPHEMERAL_SECRET` regenerates on server start).
- **Session UUID binding.** The `sid` claim is checked against the URL path segment (`expectedSid`), so a JWT cannot be replayed against a different session on the same tunnel.
- **Fastify access logging is currently disabled** (`logger: false`), so the default local deployment does not persist the JWT in server-side access logs.
- **Local mode is clean.** `getAuthToken()` returns `null` outside tunnel mode; the `?t=` suffix is only appended when a JWT actually exists, so the query-string channel is not created at all during local development.
- **No reverse proxy under our control is logging these URLs.** The only upstream in scope is localtunnel, and our integration does not enable any request log tap on it.

**Mitigations considered but rejected for v1:**
- Replacing the query-string token with a WebSocket sub-protocol header (e.g., `Sec-WebSocket-Protocol: Bearer, <jwt>`). Viable but requires a server-side `subprotocol` handshake negotiation path that does not exist yet; deferred to v2 when we revisit the tunnel-auth layer.
- Issuing a short-lived one-time WS-specific token via an authenticated HTTP endpoint right before `new WebSocket(...)` is constructed. This would shrink the replay window to seconds. Deferred to v2.

**Residual risk accepted (LOW–MEDIUM):**
- If Fastify access logging is ever enabled, or the localtunnel provider is assumed to log, a 1-hour replay window exists for any JWT written to those logs. Remediation: keep `logger: false` for any deployment that exposes the WS route over a tunnel, or cut the TTL further for `/ws/session` traffic in v2.
- Browser-history leakage is scoped to the user's own machine; treated as equivalent to the user's local filesystem, which is already trusted by the threat model (see I-1 Insider Threat). A JWT leaked via a screen-share is mitigated by the 1-hour TTL plus session-scoped `sid`.

**Verification evidence:**
- `packages/haiku-ui/src/api/client.ts:245-264` — `openWebSocket` suffix construction shows the `?t=` channel is only taken when `getAuthToken()` returns a token (i.e., tunnel mode only).
- `packages/haiku/src/tunnel.ts:291-308` — JWT is signed with `exp = iat + 3600`.
- `packages/haiku/src/tunnel.ts:117-168` — `verifyTunnelJWT` rejects expired tokens (`reason: "expired"`) and mismatched-tunnel tokens before any handler runs.
- `packages/haiku/src/http.ts` — Fastify initialized with `logger: false`, so query strings are not persisted server-side by default.

**Status:** Mitigated (TTL + tunnel binding + session binding). Residual risk accepted for v1; v2 should move WS auth off the query string.

---

### D — Denial of Service (Extended)

#### D1: Additive elaborate loop — visits counter grows unboundedly
**Threat:** A stage can cycle through feedback_revisit → elaborate → execute → review → gate → feedback_revisit indefinitely if agents continuously create new `pending` feedback items without resolving them.

**Likelihood:** Low
**Impact:** Medium (stage never advances)

**Mitigation:** Each cycle requires new pending feedback. The `visits` counter is visible. The `haiku_feedback_reject` tool allows agents to dismiss false positives.

**v2 recommendation:** Add `max_visits` threshold (e.g., 5) to trigger human intervention.

**Status:** Mitigated by design. No cap is accepted v1 risk.

---

#### D2: haiku_revisit reasons array — large arrays create filesystem load
**Threat:** Agent passing 1,000 reasons would create 1,000 feedback files and git commits in one call.

**Likelihood:** Very Low
**Impact:** Low (local filesystem only)

**Status:** Accepted. Local-tool blast radius only.

---

### E — Elevation of Privilege (Extended)

#### E1: Tunnel JWT forgery
**Threat:** If the signing algorithm is weak or the key is predictable, an attacker could forge a JWT and bypass the tunnel auth gate.

**Likelihood:** Low
**Impact:** High

**Mitigation:**
- JWT key derived from active tunnel URL using a secret seed regenerated each server start.
- Standard JWT claims: `tun`, `sid`, `typ`, `iat`, `exp`. Expired JWTs are rejected.
- `verifyTunnelJWT` runs before any request handler — not bypassable by routing tricks.

**Verification evidence:**
- `tunnel-auth.test.mjs` — expired JWT rejection, mismatched tunnel URL rejection, valid JWT acceptance.

**Status:** Mitigated. Residual risk is standard library cryptographic soundness.

---

#### E2: Rogue subagent marks human items "addressed" to bypass human gate
**Threat:** A rogue or hallucinating review subagent calls `haiku_feedback_update` with `status: addressed` on human-authored items. This does not close them (agents cannot close human items), but `addressed` items no longer block the gate. In an auto-gate stage, the FSM could advance without human verification of the fix.

**Likelihood:** Low
**Impact:** High (for auto-gate stages with human-authored feedback)

**Mitigation:**
- Agents CANNOT set `status: closed` on human-authored feedback.
- Agents CANNOT delete human-authored feedback.
- The human gate (`ask` or `external`) requires a human reviewer to explicitly close addressed items.
- Review subagent prompts instruct subagents to only call `haiku_feedback` (create), not update/reject.

**Remaining risk (MEDIUM):** Auto-gate stages processing human-authored feedback are lower trust. Design recommendation: stages that accept human annotations should use `ask` or `external` gates, not `auto`.

**Status:** Partially mitigated. MEDIUM residual accepted.

---

## 2. Insider Threat Analysis

### I-1: Developer with direct filesystem access

**Threat vectors:**
1. Edit feedback frontmatter directly (e.g., change `status: pending` to `status: closed`)
2. Delete feedback files
3. Rewrite git history to remove audit trail
4. Modify `state.json` to advance phase

**Impact assessment:**

| Action | Detectability | Impact |
|---|---|---|
| Edit frontmatter to close a pending item | HIGH — `git diff` shows change | High (bypasses gate) |
| Delete a feedback file | HIGH — `git log` shows deletion | High (bypasses gate) |
| Rewrite git history (`git push --force`) | MEDIUM — logged by GitHub/GitLab | Critical (removes audit trail) |
| Edit state.json to advance phase | HIGH — git commit shows change | High (bypasses FSM) |

**Mitigation:**
1. Git commit trail on all legitimate mutations
2. Branch protection on intent branches (recommended)
3. PR reviews for `.haiku/` changes

**Accepted residual risk:** Developer tool for trusted actors. Detection capability exists; prevention is out of scope for v1.

---

### I-2: Malicious review agent system prompt injection

**Threat:** Feedback file bodies passed as context to review subagents could contain prompt injection.

**Likelihood:** Low (requires actor who can write feedback files)
**Impact:** Medium

**Mitigation:** Feedback bodies are passed as data context, not instructions. Subagent prompts clearly distinguish instructions from data.

**Status:** Accepted. Standard LLM prompt injection risk.

---

## 3. Supply Chain Analysis

### SC-1: gray-matter (frontmatter parsing)

**Risk:** YAML parsing vulnerabilities (prototype pollution, DoS on large files).

**Assessment:**
- Widely-used, actively maintained library. No known critical CVEs.
- Input is always local files from trusted write paths.

**Mitigation:** Pin `gray-matter` to a version using js-yaml >= 4.x (prototype pollution fixes). Run `npm audit` in CI.

**Status:** Low risk.

---

### SC-2: zod (schema validation)

**Risk:** ReDoS if complex regexes used; prototype pollution in older versions.

**Assessment:**
- Feedback schemas use simple validators: `z.string().min(1).max(120)`, `z.enum(...)`. No complex regexes.

**Status:** Low risk. No action required.

---

### SC-3: MCP SDK (@modelcontextprotocol/sdk)

**Risk:** Protocol-level vulnerabilities; malicious tool schemas.

**Assessment:**
- Anthropic-maintained. Not publicly distributed via npm.
- Feedback model adds new tool definitions using existing SDK patterns — no new SDK APIs used.

**Status:** Low risk. Dependent on Anthropic's SDK security posture.

---

## 4. Attack Surface Hardening Summary

| Surface | Hardening Applied | Residual Risk |
|---|---|---|
| HTTP feedback mutations (remote mode) | JWT tunnel auth (FB-30), session header guard (FB-20), CORS origin check (FB-36) | Session UUID bookmarks (very low) |
| WebSocket session channel (remote mode) | Tunnel JWT in `?t=` query string (browser-platform constraint); 1-hour TTL + tun/sid binding + `logger:false` (I3) | Query-string token leak via future access logs / browser history / screen-share (low–medium) |
| `closes:` validation | feedback-assessor hat auto-injected for all units with `closes:` | Agent `addressed` status on human items allows auto-gate pass |
| `haiku_revisit` reasons | writeFeedbackFile constrains write path; reasons always `origin: agent` | No count cap (v2 enhancement needed) |
| WebSocket session loss | Known v1 limitation | v2: debounced persistence |
| Visits counter | Present and visible | v2: max_visits threshold |
| JWT forgery | Standard JWT with tunnel URL + session binding | Standard library risk |
| Insider threat | Git audit trail; branch protection recommended | Out of scope for v1 |
| Supply chain | No new dependencies; pin gray-matter; run npm audit | Ongoing dependency management |

---

## 5. Open Risks (Accepted for v1)

| Risk | Severity | Rationale |
|---|---|---|
| `addressed` status on human-authored feedback allows gate pass without explicit close | MEDIUM | Human gate (`ask`/`external`) is the verification backstop. Auto-gate stages with human feedback are lower-trust by design. |
| WebSocket drop before submission loses draft comments | LOW | v2: debounced persistence |
| No visits cap | LOW | v2: max_visits threshold |
| YAML prototype pollution in gray-matter | LOW | Pin to js-yaml >= 4.x; run npm audit in CI |
| WebSocket JWT in query string (I3) | LOW–MEDIUM | Browser platform constraint; mitigated by 1-hour JWT TTL + tun/sid binding + Fastify `logger:false`. v2 should move WS auth to a sub-protocol header or one-time WS token. |
| Insider threat (direct filesystem access) | ACCEPTED | Developer tool; git trail provides detection; out of scope v1 |
