---
title: Vulnerability Report — cowork-mcp-apps-integration
type: security
status: active
created: 2026-04-15
---

# Vulnerability Report — cowork-mcp-apps-integration

Findings from the dev-stage adversarial review (SRE hat) and security-stage STRIDE analysis.

---

## VUL-001 — XSS via innerHTML in design-direction template

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **OWASP** | A03 Injection |
| **Status** | FIXED (`094ec3f7`) |
| **Affected** | `packages/haiku/src/templates/design-direction.ts` (pre-fix) |

**Description:** The design-direction template used `element.innerHTML = userContent` to render archetype descriptions and parameter labels. Any string containing `<script>` or event-handler attributes (e.g., `onload=`) would execute in the iframe's scripting context.

**Recommended fix:** Replace `innerHTML` assignments with `textContent` (for plain text) or structured DOM creation (`document.createElement` + `appendChild`) for HTML fragments. Implemented in `094ec3f7`.

---

## VUL-002 — postMessage wildcard targetOrigin

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **OWASP** | A01 Broken Access Control |
| **Status** | FIXED (`094ec3f7`) |
| **Affected** | `packages/haiku/src/review-app/ext-apps-shim.ts` (pre-fix) |

**Description:** `postMessage` calls from the SPA iframe used `"*"` as the `targetOrigin` argument. This sends messages to any parent window regardless of origin, leaking session data (session_id, feedback text, archetype selections, annotation payloads) to any page that has embedded the iframe.

**Recommended fix:** Capture the host origin from the first inbound `message` event and use it as `targetOrigin` on all outbound posts. Implemented in `094ec3f7`.

---

## VUL-003 — postMessage listener did not validate event.origin

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **OWASP** | A01 Broken Access Control |
| **Status** | FIXED (`094ec3f7`) |
| **Affected** | `packages/haiku/src/review-app/ext-apps-shim.ts` (pre-fix) |

**Description:** The `window.addEventListener("message", ...)` handler accepted messages from any origin. An attacker with a page that could embed the iframe (or script on the same origin) could send fabricated tool-result responses, causing the SPA to render attacker-controlled content or resolve pending `callServerTool` promises with arbitrary data.

**Recommended fix:** Pin `_hostOrigin` on the first message received; reject all subsequent messages where `event.origin !== _hostOrigin`. Implemented in `094ec3f7`.

---

## VUL-004 — Sequential integer request IDs in ext-apps-shim

| Field | Value |
|---|---|
| **Severity** | LOW |
| **OWASP** | A01 Broken Access Control |
| **Status** | Accepted risk |
| **Affected** | `packages/haiku/src/review-app/ext-apps-shim.ts` |

**Description:** Request IDs for `callServerTool` calls are sequential integers (0, 1, 2…). An attacker who can inject same-origin JavaScript could predict the next request ID and race a fabricated `message` event to resolve a pending promise with attacker-controlled content before the real response arrives.

**Prerequisite:** Requires same-origin JS injection (XSS or compromised host page). With VUL-001 through VUL-003 fixed and the iframe sandbox in place, this attack surface is substantially reduced.

**Recommended fix:** Use `crypto.randomUUID()` or a random integer for request IDs to eliminate predictability without requiring a prerequisite vulnerability. Not yet implemented — accepted as LOW given the prerequisite chain.

---

## VUL-005 — console.log leaks bridge detection state

| Field | Value |
|---|---|
| **Severity** | LOW |
| **OWASP** | A09 Security Logging and Monitoring Failures |
| **Status** | Accepted risk |
| **Affected** | `packages/haiku/src/review-app/ext-apps-shim.ts` |

**Description:** Debug `console.log` statements emit bridge initialization state and postMessage event details to the browser console. While not a direct exploit path, this exposes internal state (connection status, session flow) to any script or extension that can read console output.

**Recommended fix:** Gate debug logging behind a `DEBUG` flag or remove before production build. Informational — no credential or session-secret exposure.

---

## VUL-006 — REVIEW_APP_HTML served without auth via resources/read

| Field | Value |
|---|---|
| **Severity** | INFO |
| **OWASP** | A01 Broken Access Control |
| **Status** | By design |
| **Affected** | `packages/haiku/src/server.ts` (resources/read handler) |

**Description:** Any MCP client that has established a connection can call `resources/read` with the `ui://haiku/review/<version>` URI and receive the full ~5 MB SPA HTML without any additional authentication gate. This is consistent with the MCP resources spec — resources are host-trusted, not user-authenticated.

**Justification:** The SPA is static presentation code containing no credentials, API keys, or user data. Session data arrives separately in `_meta` content, scoped to the active session and protected by UUID unpredictability. No fix warranted.

---

## VUL-007 — axios CVEs via localtunnel transitive dependency

| Field | Value |
|---|---|
| **Severity** | HIGH (critical axios CVE in dep tree) |
| **OWASP** | A06 Vulnerable and Outdated Components |
| **Status** | Accepted risk |
| **Affected** | `localtunnel >=1.9.0` → `axios <=1.14.0` (transitive) |

**Description:** `npm audit` reports 3 vulnerabilities in the transitive dependency chain: `axios <=1.14.0` (critical CSRF, SSRF, and DoS advisories: GHSA-wf5p-g6vw-rhxx, GHSA-jr5f-v2jv-69x6, GHSA-43fc-jf86-j433, GHSA-3p68-rc4w-qgx5, GHSA-fvcv-3m26-pcqx) and `follow-redirects <=1.15.11` (moderate auth header leak: GHSA-r4q5-vmmm-2653). These packages are introduced by `localtunnel`, used only in `tunnel.ts` (the HTTP review path).

**Exposure:** The MCP Apps path (`open-review-mcp-apps.ts`) makes zero outbound HTTP calls and does not import `tunnel.ts` (structural guarantee, per design comment). The vulnerable code paths in axios/follow-redirects are reachable only through the localtunnel HTTP path, which requires user action to invoke.

**Recommended fix:** Pin `localtunnel` to `1.8.3` (the last pre-axios version). Blocked on breaking change (`npm audit fix --force` required). Tracked for next dependency update cycle.

**Accepted risk justification:** The MCP Apps attack surface is fully isolated from the vulnerable transitive deps. The axios vulnerabilities (SSRF, CSRF) are in localtunnel's HTTP tunnel establishment code, not in any code path reachable from MCP tool dispatch.

---

## Finding Summary

| ID | Severity | Title | Status |
|---|---|---|---|
| VUL-001 | MEDIUM | XSS via innerHTML in design-direction template | Fixed `094ec3f7` |
| VUL-002 | MEDIUM | postMessage wildcard targetOrigin | Fixed `094ec3f7` |
| VUL-003 | MEDIUM | postMessage listener did not validate event.origin | Fixed `094ec3f7` |
| VUL-004 | LOW | Sequential integer request IDs (guessable) | Accepted risk |
| VUL-005 | LOW | console.log leaks bridge detection state | Accepted risk |
| VUL-006 | INFO | REVIEW_APP_HTML served without auth via resources/read | By design |
| VUL-007 | HIGH | axios CVEs via localtunnel transitive dependency | Accepted risk (HTTP path only, MCP Apps isolated) |

**CRITICAL/HIGH:** VUL-007 (HIGH) — accepted risk, isolated to HTTP tunnel path, not reachable from MCP Apps attack surface. All MEDIUM findings resolved in `094ec3f7`.
