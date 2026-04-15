# OWASP Coverage Matrix

**Intent:** cowork-mcp-apps-integration
**Date:** 2026-04-15
**Attack surface:** MCP Apps review path — tool dispatch, resource serving, postMessage bridge, in-memory session store

---

| Category | Applicable/N/A | Evidence | Status |
|---|---|---|---|
| A01 — Broken Access Control | Applicable | Three-gate check on `haiku_cowork_review_submit`: session existence (`getSession(id)`), session_type match (`session.session_type !== input.session_type` → 400), replay protection (`session.status !== "pending"` → 409). VUL-002/003 fixed (origin pinning in `ext-apps-shim.ts`). `server.ts:1048–1082` | Covered |
| A02 — Cryptographic Failures | Applicable | No credentials, no PII, no secrets stored. Session IDs use `crypto.randomUUID()` (128-bit CSPRNG) — `sessions.ts:246,267,289`. No custom crypto. No sensitive data persisted to disk (sessions are in-memory only). | Covered |
| A03 — Injection | Applicable | Zod discriminated union validates all `haiku_cowork_review_submit` input before any state mutation (`server.ts:995–1031`). HTML templates use `escapeHtml()`/`escapeAttr()` (`templates/layout.ts:210–219`). `innerHTML` removed from design-direction template (VUL-001 fixed). Test: `"bad decision enum fails Zod validation"` in `open-review-mcp-apps.test.mjs:832`. | Covered |
| A04 — Insecure Design | Applicable | Session store has 100-session cap (`MAX_SESSIONS`) and 30-minute TTL (`SESSION_TTL_MS`) enforced on every `createSession` call (`sessions.ts:215–238`). Review timeout: `waitForSession` rejects after 30 minutes. No session data written to disk. VUL-001 through VUL-003 mitigated by design fixes. | Covered |
| A05 — Security Misconfiguration | Applicable | `resources/read` throws `McpError(ErrorCode.InvalidParams, "Unknown resource URI")` for any URI != `REVIEW_RESOURCE_URI` — exact match, no regex, no fuzzy match (`server.ts:246–247`). No debug endpoints exposed. `open-review-mcp-apps.ts` has no imports from `http.js`, `tunnel.js`, or `child_process` — structural guarantee. | Covered |
| A06 — Vulnerable and Outdated Components | Applicable | Direct deps (`zod`, `@modelcontextprotocol/sdk`) have no known CVEs. `npm audit` reports 3 findings in transitive chain: `axios <=1.14.0` (critical/high, via `localtunnel`) and `follow-redirects` (moderate). These are reachable only via `tunnel.ts` (HTTP review path), not the MCP Apps path. VUL-007 documents accepted risk with isolation justification. No CI automated scanning — manual `npm audit` only. | Covered (accepted risk VUL-007) |
| A07 — Identification and Authentication Failures | N/A | MCP Apps review is a single-user, local tool — no user accounts, no login flow, no session tokens beyond in-memory UUIDs. Authentication is delegated to the MCP host (Claude Code / Cowork). No auth layer to misconfigure. | N/A |
| A08 — Software and Data Integrity Failures | Applicable | All tool input validated via `ReviewSubmitInput.safeParse(args ?? {})` before any state write (`server.ts:1033–1044`). Zod parse failures return `isError: true` without touching session state. The SPA HTML is a compile-time constant (`REVIEW_APP_HTML`). No dynamic code loading or eval. | Covered |
| A09 — Security Logging and Monitoring Failures | Applicable | Key security events logged: `gate_review_host_timeout` logged to `session.log` via `logSessionEvent` (`open-review-mcp-apps.ts:170–179`). `blocking_timeout_observed` written to intent frontmatter. Console errors on presence loss (`sessions.ts:62`). VUL-005 (accepted LOW): `console.log` emits `isMcpAppsHost()` state — informational only, no credential exposure. | Covered (with accepted LOW) |
| A10 — Server-Side Request Forgery | N/A | `open-review-mcp-apps.ts` has no HTTP imports (`http.js`, `tunnel.js`, `node:child_process` explicitly excluded by design comment). The MCP Apps arm makes zero outbound network calls. No user-controlled URLs are fetched server-side. | N/A |

---

## Summary

- **10 categories** assessed
- **8 Applicable**, **2 N/A**
- **All Applicable categories: Covered**
- **0 Gaps**
- Accepted risks: VUL-004 (sequential request IDs, LOW, requires XSS prerequisite), VUL-005 (console.log, LOW, no secret exposure), VUL-007 (axios CVEs via localtunnel, HIGH, isolated to HTTP tunnel path not MCP Apps path)
