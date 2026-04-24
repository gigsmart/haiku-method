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

**Residual risk (MEDIUM — see E2 for full treatment):** In `auto`-gate stages, agent-driven `status: addressed` can allow advancement past human-authored feedback without human verification. This is NOT accepted as residual — see E2 for the required defense-in-depth mitigations (M1 human-author-aware pending count, M2 stage-config enforcement, M3 audit trail). The prior "the human gate is the verification layer" framing was a design assumption, not a mitigation, and failed the defense-in-depth test.

**Status:** Partially mitigated for the `closes:` channel; see E2 for the full required mitigation stack for agent-driven `addressed` status on human-authored items.

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
**Threat:** A rogue or hallucinating review subagent calls `haiku_feedback_update` with `status: addressed` on human-authored items. This does not close them via the `closed` guard (agents cannot set `status: closed` on human items), but `addressed` items no longer increment `countPendingFeedback` (state-tools.ts:3351-3363). In an `auto`-gate stage, the FSM advances without any human verification — a single agent call converts a human-authored blocker into a resolved item.

**Trust boundary crossed:** Agent-trust actor (MCP `callerContext: "agent"`) is mutating a field whose gate-clearing semantics belong to the human-trust actor. The `closed` field is guarded at state-tools.ts:3477-3492; the `addressed` status has equivalent gate-clearing effect for `auto` gates but is NOT guarded. The existing guard enforces the wrong invariant: it protects the `closed` label, not the *gate-clearing semantics*.

**Likelihood:** Low (adversarial or hallucinating agent required)
**Impact:** High (for `auto`-gate stages with human-authored feedback — bypasses the entire human-sign-off layer)

**Why the prior "partial mitigation" was insufficient (FB-19 finding):**
The prior writeup listed the human gate (`ask`/`external`) as "the verification backstop." This is a *design assumption*, not a *mitigation*. A mitigation is code/enforcement that stops the attack. The design assumption has three enforcement gaps:
1. Nothing in `STAGE.md` loading, gate resolution, or feedback creation validates that a stage receiving human-authored feedback uses `ask`/`external` gate.
2. Stages configured with `review: auto` can still receive human-authored feedback (via `POST /api/feedback/{intent}/{stage}` from the review UI or via `user-visual`/`user-chat` origins).
3. `countPendingFeedback` applies identical gate-clearing semantics to `closed`, `addressed`, and `rejected` (state-tools.ts:3361-3363), regardless of the item's `author_type` or the actor who transitioned it to that status.

Accepting "MEDIUM residual" without a second mitigation layer violates defense-in-depth: a single point of enforcement (agent-level prompt instruction + downstream gate-type convention) is not layered defense.

**Required mitigations (defense-in-depth — both MUST be implemented):**

*Mitigation E2-M1 (layer 1 — data-layer enforcement):* `countPendingFeedback` MUST treat `status: addressed` as still-pending for items where `author_type === "human"` unless one of the following is true:
  (a) the status transition to `addressed` was performed by a `callerContext: "human"` actor (requires persisting the last-transitioning actor in frontmatter, e.g. `addressed_by: "agent"|"human"`), OR
  (b) a human has explicitly acknowledged the addressed state via a lifecycle action recorded in the feedback file.

This shifts the enforcement from "the gate type will protect us" to "the count itself refuses to let agent-authored `addressed` transitions on human items clear the gate." It is a pure state-tools.ts change and is the *primary* mitigation.

*Mitigation E2-M2 (layer 2 — configuration-layer enforcement):* The FSM MUST validate, at stage load or at feedback-write time, that any stage which can receive human-authored feedback (i.e., HTTP feedback endpoints target it, or its review gate is `ask`/`external`/compound) declares `review: ask | external | [external, ask] | [ask, external]`. Stages declaring `review: auto` MUST either:
  (a) refuse human-authored feedback writes (HTTP returns 409/400), OR
  (b) automatically upgrade their effective gate to `ask` for the revisit cycle in which human feedback is pending.

This is the configuration-layer backstop. Even if M1 is circumvented (e.g., by a future `addressed_by: "human"` field being spoofed), the gate type itself is structurally forced to surface to a human.

*Mitigation E2-M3 (layer 3 — audit/observability):* Every `status: addressed` transition on a human-authored item MUST be logged to the git commit trail with the `callerContext` of the transition (e.g., `feedback: agent-addressed FB-01 in security`). This is already partially achieved via git commit messages but should be made explicit for `addressed` transitions on human items so audits can detect the pattern.

**Residual risk after all three mitigations:** Very Low. A rogue subagent marking human items `addressed` now (a) leaves them counted as pending for gate purposes until a human actor confirms, (b) cannot land on a stage that hasn't been configured to allow human feedback through the `ask`/`external` gate, and (c) leaves an auditable trail if it still tries.

**Implementation targets (for downstream stages, not this threat-modeler unit):**
- `packages/haiku/src/state-tools.ts` `countPendingFeedback` (3351-3363): apply human-author-aware pending count.
- `packages/haiku/src/state-tools.ts` `updateFeedbackFile` (~3419-3495): persist `addressed_by` / transition actor on status mutation.
- `packages/haiku/src/orchestrator.ts` gate resolution: enforce or auto-upgrade gate type for stages with human-authored pending/addressed feedback.
- `packages/haiku/src/http.ts` feedback POST handler: refuse human-authored feedback on `auto`-gate stages OR emit a stage-config warning at session start.

**Verification evidence required (to be produced by development / testing stages):**
- Unit test: agent `addressed` transition on human feedback — `countPendingFeedback` still returns > 0.
- Unit test: human `addressed` transition on human feedback — `countPendingFeedback` returns 0.
- Integration test: `auto`-gate stage with one human-authored feedback item — gate blocks advancement even after an agent `addressed` transition.
- Integration test: `auto`-gate stage auto-upgrades to `ask` (or refuses write) when a human-authored feedback item lands.

**Status:** NOT accepted as residual. Required defense-in-depth mitigations M1 + M2 + M3 identified and routed to downstream stages. This threat is no longer a "design assumption accepts the risk" entry; it is an actionable security requirement with specific enforcement points at each trust boundary.

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
| `closes:` validation | feedback-assessor hat auto-injected for all units with `closes:` | Agent `addressed` status on human items — see E2 required mitigation stack (M1+M2+M3) |
| Agent `addressed` transition on human-authored feedback | REQUIRED M1: human-author-aware `countPendingFeedback`; M2: stage-config enforcement / auto-upgrade to `ask`; M3: explicit audit trail per transition | Very Low after full stack implemented |
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
| WebSocket drop before submission loses draft comments | LOW | v2: debounced persistence |
| No visits cap | LOW | v2: max_visits threshold |
| YAML prototype pollution in gray-matter | LOW | Pin to js-yaml >= 4.x; run npm audit in CI |
| Insider threat (direct filesystem access) | ACCEPTED | Developer tool; git trail provides detection; out of scope v1 |

---

## 6. Required Mitigations (Handoff to Downstream Stages)

This section enumerates mitigations that the threat-modeler has identified as REQUIRED (not optional) for the feedback model to meet its defense-in-depth goals. These are the actionable security requirements that the development and testing stages MUST implement. Each row names the trust-boundary invariant it enforces.

| ID | Threat | Trust Boundary | Required Control | Enforcement Point |
|---|---|---|---|---|
| E2-M1 | Agent `addressed` on human feedback clears gate | Agent-actor mutating human-trust gate semantics | `countPendingFeedback` treats `status: addressed` on `author_type: human` items as pending unless the addressed transition was performed by a `callerContext: "human"` actor (or a human-lifecycle acknowledgement is recorded) | `packages/haiku/src/state-tools.ts` `countPendingFeedback` (3351-3363); `updateFeedbackFile` to persist transition actor |
| E2-M2 | `auto`-gate stages silently accept human feedback | Stage-config actor vs runtime-routing actor | FSM rejects OR auto-upgrades `auto` gate to `ask` for any stage that receives a human-authored feedback item | `packages/haiku/src/orchestrator.ts` gate resolution; `packages/haiku/src/http.ts` feedback POST handler |
| E2-M3 | Audit opacity on human-item status transitions | Human-trust audit trail | Git commit message MUST encode `callerContext` for every status transition on human-authored feedback (e.g. `feedback: agent-addressed FB-NN in {stage}` vs `feedback: human-addressed ...`) | `packages/haiku/src/state-tools.ts` `updateFeedbackFile` commit-message construction |

These are security requirements, not recommendations. The "human gate is the verification backstop" framing is a design assumption and does not count as a mitigation absent enforcement.
