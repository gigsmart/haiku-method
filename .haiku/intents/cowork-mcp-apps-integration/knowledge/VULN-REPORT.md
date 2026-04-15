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

## Finding Summary

| ID | Severity | Title | Status |
|---|---|---|---|
| VUL-001 | MEDIUM | XSS via innerHTML in design-direction template | Fixed `094ec3f7` |
| VUL-002 | MEDIUM | postMessage wildcard targetOrigin | Fixed `094ec3f7` |
| VUL-003 | MEDIUM | postMessage listener did not validate event.origin | Fixed `094ec3f7` |
| VUL-004 | LOW | Sequential integer request IDs (guessable) | Accepted risk |
| VUL-005 | LOW | console.log leaks bridge detection state | Accepted risk |
| VUL-006 | INFO | REVIEW_APP_HTML served without auth via resources/read | By design |

No CRITICAL or HIGH findings. All MEDIUM findings resolved in `094ec3f7`.
