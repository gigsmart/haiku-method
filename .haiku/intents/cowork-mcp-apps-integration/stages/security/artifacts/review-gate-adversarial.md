---
title: Security Stage — Adversarial Review Gate
stage: security
created_at: '2026-04-15'
status: pass
---

# Adversarial Review Gate — Security Stage

Five review agents ran against `git diff main...HEAD` and the stage artifacts.
**Zero HIGH findings. Stage cleared.**

---

## Agent 1: mitigation-effectiveness

**Mandate:** Verify mitigations address root cause, defense-in-depth, no new attack surface, crypto choices, rate limiting.

| Check | Result |
|---|---|
| Root cause addressed (not just symptom) | PASS — VUL-001: `innerHTML`→`textContent`/`createElement` removes injection vector, not just sanitizes. VUL-002/003: origin pinning at source, not filter-based. |
| Defense-in-depth on critical threats | PASS — A03 (injection): Zod discriminated union + `escapeHtml()`/`escapeAttr()` + iframe sandbox + `innerHTML` removed. Three independent layers. |
| Mitigations introduce no new attack surface | PASS — `open-review-mcp-apps.ts` structurally excludes `http.js`, `tunnel.js`, `child_process`. No new network endpoints. |
| Cryptographic choices current | PASS — `crypto.randomUUID()` (128-bit CSPRNG) for session IDs. SHA-256 for build hash. No MD5/SHA-1. |
| Rate limiting covers automated attacks | PASS — `MAX_SESSIONS=100` cap + `SESSION_TTL_MS=30min` enforced on every `createSession` call. Prevents session store exhaustion. |

**Verdict: PASS — 0 findings.**

---

## Agent 2: threat-coverage

**Mandate:** Verify threat model is comprehensive, STRIDE applied, each threat has specific mitigation, trust boundaries correct, third-party deps in scope.

| Check | Result |
|---|---|
| All entry points covered | PASS — TB1 (MCP tool dispatch), TB2 (postMessage bridge), TB3 (SPA iframe sandbox) all documented with specific threats. |
| STRIDE applied consistently | PASS — THREAT-MODEL.md applies Spoofing, Tampering, Repudiation, Info Disclosure, Denial of Service, Elevation across all 3 trust boundaries. |
| Each threat has specific mitigation | PASS — Every row in THREAT-MODEL summary table has a non-empty Mitigation column and a status of Implemented/Accepted/By design. |
| Trust boundaries correctly identified | PASS — TB1 (MCP protocol), TB2 (postMessage), TB3 (iframe sandbox) are the correct boundaries for this architecture. |
| Third-party deps in threat surface | PASS — VUL-007 added this cycle: `axios <=1.14.0` via `localtunnel` transitive dep documented with isolation justification. |

**Verdict: PASS — 0 findings.**

---

## Agent 3: security (from development)

**Mandate:** No injection vectors, auth/authz on protected paths, no hardcoded secrets, input validation at boundaries, no insecure defaults, no critical dep CVEs without documentation.

| Check | Result |
|---|---|
| No injection vectors | PASS — XSS: `innerHTML` removed from design-direction (VUL-001 fixed). All templates use `escapeHtml()`/`escapeAttr()`. Zod rejects all non-conforming tool inputs. |
| Auth/authz on protected paths | PASS — No user-auth layer (by design, MCP trust model). Session gate: 3-check guard (existence + type + status) on `haiku_cowork_review_submit`. |
| No hardcoded secrets | PASS — No API keys, passwords, or tokens hardcoded. Sentry DSN via `process.env.HAIKU_SENTRY_DSN_MCP`. |
| Input validation at boundaries | PASS — Zod `ReviewSubmitInput.safeParse` at tool dispatch entry. `REVIEW_RESOURCE_URI` exact-match at `resources/read` entry. |
| No insecure defaults | PASS — `postMessage` origin-pinned (not wildcard). `resources/read` exact-match (not prefix/regex). Iframe `sandbox` attribute present. `experimental.apps: {}` capability gated. |
| CVEs documented | PASS — VUL-007 documents `axios <=1.14.0` (critical/high) transitive via localtunnel. Accepted risk with isolation justification (MCP Apps path structurally excluded from localtunnel import chain). |

**LOW (non-blocking):** `components.ts:903` — `result.innerHTML = msg` where `msg` contains `decision.replace(/_/g, ' ')`. The `decision` value originates from a UI button click constrained to `["approved", "changes_requested", "external_review"]`. No injection path for arbitrary user data. HTTP review path only. Acceptable.

**Verdict: PASS — 0 HIGH, 1 LOW (acceptable).**

---

## Agent 4: architecture (from development)

**Mandate:** Module boundaries, no circular deps, minimal public APIs, naming conventions, no unnecessary abstractions, shared code consumers considered.

| Check | Result |
|---|---|
| Module boundaries respected | PASS — `open-review-mcp-apps.ts`, `ask-visual-question-mcp-apps.ts`, `pick-design-direction-mcp-apps.ts` import only from `sessions.js`, `state-tools.js`, `ui-resource.js`, `session-metadata.js`, `index.js`. No cross-boundary violations. |
| No circular dependencies | PASS — Lower-layer modules (`sessions.ts`, `state-tools.ts`, `ui-resource.ts`) have zero imports from the new MCP Apps modules. |
| Public APIs minimal | PASS — `openReviewMcpApps`, `askVisualQuestionMcpApps`, `pickDesignDirectionMcpApps` export one function + one interface each. No implementation leakage. |
| Naming conventions match codebase | PASS — camelCase functions, PascalCase interfaces, kebab-case filenames — all match existing codebase conventions. |
| No unnecessary abstractions | PASS — `OpenReviewMcpAppsDeps` interface is the minimal injection surface needed for testability. No over-engineering. |
| Shared code consumers considered | PASS — `sessions.ts` and `state-tools.ts` changes are additive exports; no existing behavior modified. |

**Verdict: PASS — 0 findings.**

---

## Agent 5: reliability (from operations)

**Mandate:** Health checks, rollback, resource limits, graceful shutdown, retry/circuit-breaker for external deps.

| Check | Result |
|---|---|
| Graceful shutdown | PASS — `server.ts:1338,1346` — SIGINT and SIGTERM handlers call `flushSentry()` before exit. In-flight sessions: `clearHeartbeat` on timeout path; session TTL handles orphans. |
| Resource limits | PASS — `MAX_SESSIONS=100` + `SESSION_TTL_MS=30min` prevent unbounded memory growth. No per-session disk writes. |
| External dependency retry | PASS — MCP Apps path (`open-review-mcp-apps.ts`) makes zero outbound network calls. No retry/circuit-breaker needed. HTTP path: `localtunnel` has 3-attempt retry in `tunnel.ts:163`. |
| Rollback procedure | PASS — This is a plugin/tool binary. Rollback = install previous version. No database migrations, no persistent state changes in this diff. |
| Health checks | INFO — MCP Apps path uses no HTTP health endpoint (not applicable — stdio transport). Not a gap for this architecture. |

**Verdict: PASS — 0 findings.**

---

## Summary

| Agent | Findings | Blocking |
|---|---|---|
| mitigation-effectiveness | 0 | None |
| threat-coverage | 0 | None |
| security (from development) | 1 LOW | None |
| architecture (from development) | 0 | None |
| reliability (from operations) | 0 | None |

**All review agents pass. Stage gate cleared. Zero HIGH findings.**
