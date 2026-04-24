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
**Threat:** If the signing algorithm is weak, the key is predictable, or the verifier is vulnerable to algorithm confusion (`alg: none`, RS256→HS256 key substitution, etc.), an attacker could forge a JWT and bypass the tunnel auth gate.

**Likelihood:** Low
**Impact:** High

**Trust boundary:** Public internet (tunnel origin) → HTTP server. All tokens on the wire are untrusted inputs; they become trusted only after `verifyTunnelJWT` accepts them. The verifier is the sole gate between an anonymous external caller and every authenticated route.

**Mitigation:**
- **Signing algorithm is fixed, not caller-controlled.** `verifyTunnelJWT` (`tunnel.ts:117-172`) always recomputes the expected signature with `createHmac("sha256", EPHEMERAL_SECRET)`. It does not dispatch on the header's `alg` field. This structurally defeats the classic `alg: none` bypass: a token claiming `alg: "none"` with an empty signature fails because the verifier still performs HMAC-SHA256 and compares bytes via `timingSafeEqual`. Likewise, RS256→HS256 key confusion is not reachable — there is no public-key path; HMAC is the only code path.
- **Signing key is a process-lifetime ephemeral secret, not URL-derived.** `EPHEMERAL_SECRET = randomBytes(32)` at `tunnel.ts:11` — 256 bits of CSPRNG entropy generated once per MCP process start. The key is not exported, not persisted, not derivable from any observable value (including the tunnel URL). A server restart rotates the key, invalidating every outstanding token.
- **Tunnel binding is at claim level, not key level.** The JWT payload carries `tun: <active tunnel URL>` and `verifyTunnelJWT` rejects with `tunnel_mismatch` if the claim does not equal the current `getTunnelUrl()`. This binds every token to a specific localtunnel session — a token minted for a prior tunnel URL is useless after reconnect.
- **Session binding (`sid` claim).** When `expectedSid` is provided, the token's `sid` must equal it, preventing replay of session A's token against session B's route.
- **Expiration.** `exp` is required and in the past rejects as `expired`. No `nbf`/`iat` skew window.
- **Constant-time comparison.** Signature comparison uses `timingSafeEqual` with pre-check of buffer length equality to avoid a length-oracle side channel.
- **Placement.** `verifyTunnelJWT` runs before any request handler — not bypassable by routing tricks or handler ordering.

**Residual gap (defense-in-depth, FB-18):** The decoded header is extracted (`const [header, body, sig] = parts`) but its contents are never inspected. Today this is structurally safe because the verifier never reads `header.alg` to select an algorithm — HMAC-SHA256 is hardcoded. However, a future refactor that introduces algorithm negotiation (e.g., supporting EdDSA or key rotation via `kid`) could reintroduce the classic algorithm-confusion pathway unless the verifier explicitly asserts `header.alg === "HS256"` and `header.typ === "JWT"` first. Recommended defense-in-depth hardening (surfaced as a development-stage finding, not a threat-model-level unmitigated risk):
1. Decode the header JSON explicitly.
2. Reject with `malformed` unless `header.typ === "JWT"` AND `header.alg === "HS256"`.
3. Perform the HMAC compare only after header assertion passes.

This is a belt-and-suspenders measure — no known forgery path exists today, but the assertion documents the algorithm contract in-code and traps regressions.

**Verification evidence:**
- `tunnel-auth.test.mjs` — expired JWT rejection, mismatched tunnel URL rejection, valid JWT acceptance.
- `tunnel.ts:11` — ephemeral secret generation (256 bits CSPRNG, per-process).
- `tunnel.ts:71-77` — `signJWT` emits `alg: "HS256"`, `typ: "JWT"` header.
- `tunnel.ts:117-172` — `verifyTunnelJWT` uses fixed-algorithm HMAC, constant-time compare, exp check, tunnel binding, sid binding.

**Status:** Mitigated. Primary controls: fixed-algorithm HMAC (no dispatch on `alg`), ephemeral 256-bit key, tunnel+session claim binding, constant-time compare, short TTL. Defense-in-depth hardening (explicit header.alg/typ assertion) recommended to `development` stage to close the FB-18 finding and document the algorithm contract in-code.

**Corrigendum:** An earlier draft of this section stated "JWT key derived from active tunnel URL using a secret seed regenerated each server start." That description is inaccurate. The key is a process-lifetime random 256-bit value; tunnel binding is done at the claim layer (`payload.tun`), not at the key-derivation layer. The corrected text above reflects the actual implementation in `tunnel.ts:11` and `tunnel.ts:162-165`.

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
| `closes:` validation | feedback-assessor hat auto-injected for all units with `closes:` | Agent `addressed` status on human items allows auto-gate pass |
| `haiku_revisit` reasons | writeFeedbackFile constrains write path; reasons always `origin: agent` | No count cap (v2 enhancement needed) |
| WebSocket session loss | Known v1 limitation | v2: debounced persistence |
| Visits counter | Present and visible | v2: max_visits threshold |
| JWT forgery | Fixed-algorithm HMAC-SHA256 (no `alg`-dispatch), 256-bit ephemeral random key (per-process), tunnel+sid claim binding, constant-time compare, exp check | Header `alg`/`typ` not explicitly asserted — belt-and-suspenders hardening recommended (FB-18 → development) |
| Insider threat | Git audit trail; branch protection recommended | Out of scope for v1 |
| Supply chain | No new dependencies; pin gray-matter; run npm audit | Ongoing dependency management |

---

## 5. Open Risks (Accepted for v1)

| Risk | Severity | Rationale |
|---|---|---|
| `addressed` status on human-authored feedback allows gate pass without explicit close | MEDIUM | Human gate (`ask`/`external`) is the verification backstop. Auto-gate stages with human feedback are lower-trust by design. |
| JWT header `alg`/`typ` not explicitly asserted (FB-18) | LOW | Structurally safe today because verifier never dispatches on `alg` (HMAC-SHA256 is hardcoded). Hardening recommendation routed to `development` — add explicit `header.alg === "HS256"` and `header.typ === "JWT"` asserts to trap future regressions. |
| WebSocket drop before submission loses draft comments | LOW | v2: debounced persistence |
| No visits cap | LOW | v2: max_visits threshold |
| YAML prototype pollution in gray-matter | LOW | Pin to js-yaml >= 4.x; run npm audit in CI |
| Insider threat (direct filesystem access) | ACCEPTED | Developer tool; git trail provides detection; out of scope v1 |
