# Security Assessments: Universal Feedback Model

## Threat Model (Unit-01)

Full STRIDE analysis at `stages/security/THREAT-MODEL.md`.

### Summary of Findings (Unit-01)

| Threat | Likelihood | Impact | Status |
|---|---|---|---|
| S: Agent spoofs human author_type | Low | High | Mitigated — author_type derived server-side from origin |
| T: Feedback file tampered to bypass gate | Low | High | Mitigated — git commits, fresh-read on every gate tick |
| R: Actor denies creating feedback | Low | Medium | Mitigated — git history, frontmatter provenance |
| I: Feedback content leaks | Low | Medium | Mitigated — local files, same access as project |
| D: Disk-filling via feedback creation | Low | Low | Accepted — local tool, self-inflicted |
| E: Agent bypasses author-type guards | Low | High | Mitigated — MCP/HTTP boundary, callerContext hardcoded |

No critical or high-severity unmitigated findings.

## OWASP Top 10 Coverage (Unit-01)

All 10 categories verified with evidence or documented N/A justification. See THREAT-MODEL.md section 2 for details.

| Category | Status |
|---|---|
| A01: Broken Access Control | Mitigated + tested |
| A02: Cryptographic Failures | N/A |
| A03: Injection | Mitigated + tested |
| A04: Insecure Design | Mitigated |
| A05: Security Misconfiguration | Mitigated |
| A06: Vulnerable Components | N/A |
| A07: Auth Failures | N/A |
| A08: Data Integrity Failures | Mitigated + tested |
| A09: Logging Failures | Mitigated |
| A10: SSRF | N/A |

## Security Tests Added (Unit-01)

- `state-tools-handlers.test.mjs`: 3 new tests for `feedback_id` path traversal rejection (../,  /, \)
- Existing coverage: 67 feedback tests, 26 gate-feedback tests, 26 HTTP feedback tests

## Defense-in-Depth Fix (Unit-01)

`feedback_id` added to `validateSlugArgs` checked keys array in `packages/haiku/src/state-tools.ts`. Previously only `intent`, `slug`, `stage`, `unit` were checked. The `feedback_id` parameter appears in `haiku_feedback_update`, `haiku_feedback_delete`, and `haiku_feedback_reject` tool schemas, making it a path traversal vector that was missing from the validation surface.

---

## Expanded Surface Threat Model (Unit-02)

Full analysis at `stages/security/artifacts/threat-model-expanded.md`.

### New Trust Boundaries Characterized

Three trust boundaries not fully characterized in unit-01 are now documented:
1. **SPA ↔ HTTP server** — loopback-only in local mode; JWT + JWT-claim session binding in remote mode
2. **Tunnel proxy ↔ HTTP server** — JWT tunnel auth (FB-30), JWT-claim session binding (FB-20 evolved), CORS origin enforcement (FB-36)
3. **Subagent ↔ MCP server** — subagents inherit full MCP tool access; review subagents should only call `haiku_feedback` (create), not update/reject

### Summary of Expanded Findings (Unit-02)

| Threat | Likelihood | Impact | Status |
|---|---|---|---|
| S1: Agent injects feedback via haiku_revisit reasons | Low | Medium | Mitigated — origin hardcoded to "agent"; rejectable |
| S2: Remote spoofing of human-authored feedback | Low (remote) | High | Mitigated — JWT + JWT-claim session binding + CORS in tunnel mode |
| T1: False closes: [FB-NN] claims | Medium | High | Partially mitigated — feedback-assessor validates; MEDIUM residual for auto-gates |
| T2: Direct filesystem frontmatter tampering | Very Low | High | Mitigated — git audit trail (same as unit-01) |
| R1: WebSocket drop loses draft review comments | Medium | Low | Open v1 risk — accepted; v2 debounced persistence |
| I1: CORS wildcard leaks review content | Low | Medium | Mitigated — FB-36 origin-checked CORS |
| I1a: Empty `allowedOrigins`+empty `siteUrl` under remote review silently blocks all origins | Medium (config) | Low-Medium | Open — FB-12; blue-team fix-hat to add startup warning |
| I2: Session UUID in URL replay | Very Low | Low | Accepted — 30-min TTL, in-memory only |
| D1: Visits counter grows unboundedly | Low | Medium | Accepted — no hard cap; v2 threshold recommended |
| D2: Large reasons array creates filesystem load | Very Low | Low | Accepted — local tool; no count cap |
| E1: JWT forgery bypasses tunnel auth | Low | High | Mitigated — tunnel URL + JWT-claim session binding; standard library |
| E2: Rogue subagent marks human items "addressed" | Low | High | Partially mitigated — agents cannot "close" human items; MEDIUM residual |

### Open Risks (Accepted)

| Risk | Severity | Notes |
|---|---|---|
| Agent marking human-authored feedback as "addressed" allows gate pass without human explicit close | MEDIUM | Human gate (ask/external) is the verification backstop. Auto-gate stages processing human feedback are lower-trust. |
| CORS allow-list collapses to empty/unmatched origin under `HAIKU_REMOTE_REVIEW=1` with empty `siteUrl` (FB-12 / I1a) | LOW | Fail-closed — not an info-disclosure vector. Mitigation: startup warning naming `HAIKU_REVIEW_ALLOWED_ORIGINS` and `HAIKU_REVIEW_SITE_URL`. Scoped to blue-team fix-hat bolt 2. |
| WebSocket draft loss before submission | LOW | v2: debounced persistence |
| No visits cap | LOW | v2: max_visits threshold |
| gray-matter YAML parsing (prototype pollution) | LOW | Pin to js-yaml >= 4.x; run npm audit in CI |
| Insider threat via direct filesystem access | ACCEPTED | Developer tool; git trail detects; out of scope v1 |

### Expanded Test Coverage Verified

| Test | Surface |
|---|---|
| `http-feedback-strict-auth.test.mjs` (2 active tests) | JWT tunnel auth (`missing_token`), JWT-bound session proceeds (201) |
| `http-cors.test.mjs` | CORS origin enforcement (FB-36) |
| `tunnel-auth.test.mjs` | JWT verification, expiry, tunnel URL binding |
| `gate-feedback.test.mjs` | Additive elaborate gate, visits counter persistence |
| `feedback.test.mjs` — agent-cannot-close-human, agent-cannot-delete-human | Privilege escalation guards |

### Test Drift Finding (Upstream action required — development stage)

`http-feedback-strict-auth.test.mjs` contains 3 broken tests that describe the old `X-Haiku-Session-Id` header gate (FB-20 original design). The implementation settled on JWT-claim session binding. These tests will fail if the re-exec subprocess pattern is corrected to return actual test output to the runner. A feedback item has been created on the development stage.

See `threat-model-expanded.md` S2 section for the full analysis.

## Verification

- `npm test`: 562 passed, 0 failed (unit-02 confirms no regression)
- `npx tsc --noEmit`: clean (pre-existing tailwind-generated.js artifact warning, unrelated to feedback model)
- Expanded threat model finds no new unmitigated HIGH-severity threats
- Test drift in `http-feedback-strict-auth.test.mjs` documented as upstream development feedback (not a regression — security control is correctly implemented; tests are stale)
