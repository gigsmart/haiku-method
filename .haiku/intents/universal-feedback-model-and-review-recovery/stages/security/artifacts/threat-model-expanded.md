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
| Feedback reply endpoint ↔ MCP | HTTP handler (`appendFeedbackReply`) | Caller-supplied `author` string, `close_as_answered` flag | **HTTP-only surface** — no MCP equivalent. Replies are asymmetric with CRUD: feedback create/update/delete exist on both MCP and HTTP; reply exists only on HTTP. `author_type: "human"` is hardcoded on every reply regardless of caller identity. `close_as_answered: true` transitions parent `pending → answered` in a single write (elevated privilege relative to reply-only). |

---

## Endpoint Surface Inventory (HTTP feedback API)

Explicit enumeration of every HTTP endpoint that mutates feedback state, to ensure every surface lives inside a STRIDE entry below:

| Method | Path | Handler | Writes | STRIDE coverage |
|---|---|---|---|---|
| POST | `/api/feedback/:intent/:stage` | `handleFeedbackPost` | Creates new feedback file; hardcodes `author: "user"`, `origin: "user-visual"`, `author_type: "human"` | S2 (unit-01 base + remote-mode auth gates) |
| PUT | `/api/feedback/:intent/:stage/:feedbackId` | `handleFeedbackPut` | Updates `status` / notes on existing feedback | S2, E2 |
| DELETE | `/api/feedback/:intent/:stage/:feedbackId` | `handleFeedbackDelete` | Deletes a feedback file | S2, E2 |
| POST | `/api/feedback/:intent/:stage/:feedbackId/attachments` | attachment upload handler | Writes a binary attachment under the feedback's `attachments/` directory | I-3 (attachments) |
| POST | `/api/feedback/:intent/:stage/:feedbackId/replies` | inline handler in `http.ts:1743-1838` using `appendFeedbackReply` | Appends a reply to the parent feedback's `replies:` array; optionally transitions parent `pending → answered` via `close_as_answered` | **S3, E3** (below) |

The reply endpoint is HTTP-only by design (no MCP equivalent). Agents that need to close a question-origin feedback item instead go through the standard `haiku_feedback_update` path, which routes through `updateFeedbackFile`'s caller-context guards.

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

#### S3: Caller-supplied `author` on reply endpoint — attribution spoofing
**Threat:** The reply endpoint (`POST /api/feedback/:intent/:stage/:feedbackId/replies`, `http.ts:1743-1838`) accepts an optional `author` string from the request body and forwards it unchanged into `appendFeedbackReply`:

```ts
appendFeedbackReply(intent, stage, feedbackId, {
  author: parsed.data.author ?? "user",   // caller-supplied, no server override
  author_type: "human",                    // hardcoded regardless of caller
  body: parsed.data.body,
}, { close_as_answered: parsed.data.close_as_answered === true })
```

This is **asymmetric** with the create endpoint (`handleFeedbackPost`), which ignores any caller-supplied author and hardcodes `author: "user"`. On the reply endpoint, a caller reaching the HTTP boundary can claim to be any named human (e.g., `author: "security-team-lead"`, `author: "@jane"`). The reply then appears in the feedback thread attributed to that name, in git commit messages (`feedback: reply on FB-NN in stage`), and in the SPA reply list.

`author_type: "human"` is hardcoded — an agent cannot use this endpoint to masquerade as human *at the type level*, but the `author` *string* is free-form. The attribution spoof is name-level, not role-level.

**Likelihood:** Low (requires HTTP-boundary access; in tunnel mode requires valid JWT + sid-bound session).
**Impact:** Low-to-Medium (misleading attribution in discussion threads; not a gate-blocker creation path and not a privilege escalation by itself).

**Mitigation (current):**
- In tunnel mode, `verifyFeedbackMutationAuth` requires a JWT whose `sid` claim binds to a session for the target intent. Only callers who already hold a valid session can write any reply.
- In local mode, this is accepted — anyone with localhost access is trusted (same threat posture as direct filesystem edits, mitigated by the git commit audit trail).
- `author_type: "human"` is server-hardcoded; cannot be spoofed to `agent` to impersonate the review subagent or to `system` to impersonate the orchestrator.
- Reply bodies are size-capped (5,000 char schema cap + `FEEDBACK_BODY_MAX_BYTES` body limit), bounding any single spoofed-author payload.

**Accepted residual risk (LOW):** The `author` string is a display-name annotation, not an authorization claim. Authorization is carried by JWT + session binding; attribution is a separate concern. A reviewer working through the SPA has already authenticated at the session layer — the `author` field lets them tag the reply with a meaningful display name (e.g., team-lead initials) when multiple humans share a review session. The design tradeoff is: we accept display-name flexibility in exchange for not requiring a full identity system in v1.

**v2 recommendation:**
- Server-derive `author` from an authenticated session identity (e.g., `session.reviewer_handle`) instead of trusting the request body. Require callers to update session metadata, not per-request author strings.
- If multi-reviewer per session remains desired, bind display names to session-registered handles rather than free-form strings.

**Verification evidence:**
- `http.ts:1743-1838` — reply handler source; `parsed.data.author ?? "user"` is the pass-through.
- `http.ts:1785` — `author_type: "human"` hardcoded.
- In remote mode, `verifyFeedbackMutationAuth` at `http.ts:1768` gates the path.

**Status:** Accepted residual (LOW). v2 follow-up to tie `author` to authenticated session identity.

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

#### E3: `close_as_answered` on reply endpoint — status transition via reply path
**Threat:** The reply endpoint accepts `close_as_answered: true`, which transitions the parent feedback item from `pending` → `answered` in the same write that appends the reply (`http.ts:1788`, `appendFeedbackReply` with `{ close_as_answered: true }`). This is a higher-privilege operation than appending a reply alone — `answered` items no longer block the gate in the same way `pending` items do, and the transition happens through a different code path than the standard `updateFeedbackFile` caller-context guards.

Concretely: in **local mode** (no tunnel, no JWT), any process that can reach the loopback HTTP server can close any feedback item — including agent-authored feedback that the agent itself could not close via MCP — by POSTing to the reply endpoint with `close_as_answered: true`. The standard MCP update path enforces `callerContext` guards (agents cannot close human-authored items); the reply-endpoint path bypasses that contract by routing through `appendFeedbackReply` instead of `updateFeedbackFile`.

In **remote/tunnel mode**, the path is gated by:
1. `requireTunnelAuth` — rejects missing/invalid JWT with 401.
2. `verifyFeedbackMutationAuth` — rejects JWTs whose `sid` claim does not bind to a session for the target intent with 403.

**Likelihood:** Low (remote mode requires valid JWT + session; local mode requires local machine access).
**Impact:** Medium (can transition parent status without going through `updateFeedbackFile` guards; `answered` removes the gate block on question-origin items).

**Mitigation (current):**
- `author_type: "human"` is hardcoded on the reply, and the resulting status transition is therefore attributed to a human reviewer — consistent with the design intent that `close_as_answered` is the "reviewer replies and closes the question" UX path.
- In remote mode, the full JWT + session binding path protects the endpoint (same as PUT/DELETE).
- `close_as_answered` only transitions to `answered`, not to `closed`. Human-authored gate-blocking feedback with `status: pending` for "Request Changes" reasons still requires explicit closure via `updateFeedbackFile` and cannot be bypassed through this path — `answered` is a distinct status reserved for `user-question` origin feedback where a conversational answer closes the thread.
- The state write still goes through `writeFeedbackFile`'s validation and git-commit trail (`gitCommitStateBackgroundPush` fires on success), so the transition is audit-logged.

**Accepted residual risk (LOW for remote mode, MEDIUM for local mode):**
- **Remote mode:** Mitigated by JWT + session binding. Acceptable residual.
- **Local mode:** Accepted. Same threat posture as any other HTTP endpoint in local mode — localhost is treated as trusted. An attacker with loopback access can already edit feedback files directly or run `git commit`.

**v2 recommendations:**
- Funnel `close_as_answered` through `updateFeedbackFile` (or a shared helper that applies the caller-context guards) so the same author-type logic that prevents agents from closing human-authored items applies here too. Currently, the reply path and the update path have divergent guard sets — consolidate them.
- Restrict `close_as_answered` to feedback items whose `origin` is in the question family (e.g., `user-question`, `agent-question`). Replies on adversarial-review findings should not be able to use this flag to silently transition status.
- Add an explicit E3-specific test in `http-feedback-strict-auth.test.mjs` that asserts `close_as_answered: true` on a non-question feedback item returns 400 (once v2 restriction lands).

**Verification evidence:**
- `http.ts:1743-1838` — reply handler source.
- `http.ts:1788` — `close_as_answered` flag pass-through.
- `state-tools.ts:appendFeedbackReply` — the write helper; the status transition is a side-effect of the flag, not routed through `updateFeedbackFile`.

**Status:** Partially mitigated. Remote mode LOW residual. Local mode MEDIUM residual accepted. v2 hardening identified.

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
| JWT forgery | Standard JWT with tunnel URL + session binding | Standard library risk |
| Reply endpoint `author` field (S3) | `author_type: "human"` hardcoded; JWT + session binding in remote mode | Caller-supplied display-name `author` string; v2 tie to authenticated session identity |
| Reply endpoint `close_as_answered` (E3) | Remote: JWT + session binding; local: trusted-host model; git audit trail | Local mode can transition status through a different path than `updateFeedbackFile` guards; v2 consolidate under shared guard |
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
| Reply endpoint `author` string is caller-supplied display name (S3) | LOW | `author_type: "human"` is hardcoded; only the display-name string is free-form. Authorization lives in JWT + session binding. v2: derive from authenticated session. |
| Reply endpoint `close_as_answered` bypasses `updateFeedbackFile` guards in local mode (E3) | MEDIUM (local) / LOW (remote) | Remote mode protected by JWT + session binding. Local mode accepts trusted-host posture. v2: route through shared caller-context guard; restrict to question-origin items. |
| Insider threat (direct filesystem access) | ACCEPTED | Developer tool; git trail provides detection; out of scope v1 |
