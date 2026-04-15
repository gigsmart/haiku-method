---
title: Threat Model — MCP Apps Review Path
type: security
status: active
scope: project
created: 2026-04-15
---

# Threat Model — MCP Apps Review Path

STRIDE analysis for the `cowork-mcp-apps-integration` feature. Three trust boundaries govern the attack surface: the MCP protocol channel, the host↔iframe postMessage bridge, and the SPA sandbox boundary itself.

---

## Trust Boundaries

### TB1: MCP Client ↔ MCP Server

The MCP initialize handshake and all subsequent tool/resource calls.

**Data flows:**
- `initialize`: server advertises `experimental.apps: {}` + `resources: {}`; client echoes supported subset
- `resources/list`: client enumerates available `ui://` resources
- `resources/read`: client fetches full `REVIEW_APP_HTML` blob (~5 MB) for the review SPA
- `haiku_cowork_review_submit`: client sends decision payload (session_type, session_id, decision/answers/archetype + feedback text)

**STRIDE analysis:**

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| **Spoofing** — capability echo is trust-on-first-use | Client echoes `experimental.apps` without proof of identity; server cannot verify the echo came from a legitimate MCP host | Session IDs are UUID v4 (128-bit random) — unpredictable to a passive observer. No mitigation for an active MITM at the MCP transport layer; that is outside MCP protocol scope | Accepted |
| **Tampering** — tool argument injection | Malformed or adversarial `haiku_cowork_review_submit` arguments | Zod discriminated union (`z.discriminatedUnion("session_type", [...])`) validates all three session shapes before any handler logic runs. Unknown `session_type` → 400 error. UUID format enforced on `session_id` | Implemented |
| **Repudiation** — session state not signed | A client could submit a decision for a session it did not initiate | Session store is in-memory; `getSession(id)` lookup enforces `session_id` existence and `session_type` match. No persistent auth layer needed — same trust boundary as the MCP connection itself | Accepted |
| **Info disclosure** — `REVIEW_APP_HTML` served without auth | Any MCP client can call `resources/read` and receive the full ~5 MB SPA HTML | By design: MCP resources are host-trusted. The SPA contains no secrets — it is static presentation code. Session data arrives separately in `_meta` content field, scoped to the active session | Accepted (by design) |
| **DoS** — indefinite block on `waitForSession` | A client that never calls `haiku_cowork_review_submit` would block the FSM forever | `waitForSession` enforces a 30-minute AbortSignal timeout (`sessions.ts:88`). Timeout rejects the handler promise; FSM propagates the error | Implemented |
| **Elevation of privilege** — session ID reuse | A session ID (UUID) that resolves to a closed session could be resubmitted | `status !== "pending"` check returns 409 `"Session already closed"` before any state mutation | Implemented |

---

### TB2: MCP Host ↔ Iframe (postMessage Bridge)

The `ext-apps-shim.ts` postMessage JSON-RPC channel between the host page and the sandboxed iframe SPA.

**Data flows:**
- `callServerTool` requests: tool name + args from iframe → host
- `callServerTool` responses: content array (tool result) from host → iframe
- Session data flows in initial tool result `_meta.ui` content field

**STRIDE analysis:**

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| **Spoofing** — origin impersonation | A malicious script on the same origin could send messages that appear to come from the host | `ext-apps-shim.ts` pins `_hostOrigin` on the first message received and rejects any subsequent message whose `event.origin` does not match. Fixed in `094ec3f7` | Implemented |
| **Tampering** — fabricated responses via guessable request IDs | Request IDs are sequential integers (0, 1, 2…). An attacker with same-origin JS injection could predict the next ID and post a fabricated response before the real one arrives, resolving a pending `callServerTool` promise with attacker-controlled content | Requires same-origin JS injection (i.e., XSS or compromised host page) as a prerequisite. Given the iframe `sandbox="allow-same-origin"` is needed for origin pinning, this cannot be fully closed without switching to random IDs | Accepted (LOW — prerequisite is same-origin XSS; VUL-004) |
| **Repudiation** | N/A — no audit trail needed for postMessage channel in this threat model | | N/A |
| **Info disclosure** — session data in postMessage | `session_id`, feedback text, archetype selections, and annotation data flow through postMessage visible to any JS in the same origin | Same-origin JS access is an inherent property of `allow-same-origin`. Data is limited to the current review session; no credentials or persistent secrets flow through the channel | Accepted |
| **DoS** — hung `callServerTool` | Iframe sends a tool call and the host never responds | 30-second timeout on `callServerTool` in `ext-apps-shim.ts` prevents indefinite hang | Implemented |
| **Elevation** — tool call scope | Iframe could attempt to call any MCP tool via `callServerTool`, not just `haiku_cowork_review_submit` | MCP host enforces tool-level authorization independently. The postMessage bridge is a transport; actual tool dispatch and session-scope enforcement happen server-side via Zod + session store | Implemented |

---

### TB3: SPA Iframe Sandbox Boundary

The `<iframe sandbox="...">` attribute set by the MCP host when rendering the review SPA.

**Data flows:**
- Host renders iframe with SPA HTML from `resources/read`
- SPA renders interactive review UI; user interactions stay inside the iframe
- postMessage bridge is the only exit channel

**STRIDE analysis:**

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| **Spoofing** | Iframe cannot impersonate the host — postMessage bridge only accepts replies, never initiates to the host | N/A | N/A |
| **Tampering** — DOM injection from iframe | SPA renders review content including user-supplied feedback text (if resuming a session). `innerHTML` with unescaped content could inject DOM | `innerHTML` usage for user-controlled content was removed in `094ec3f7` — replaced with DOM APIs and `textContent` | Implemented |
| **Info disclosure** — storage access | `allow-same-origin` grants the iframe access to the host's `localStorage`, `sessionStorage`, and cookies | The host's storage may contain other MCP session data. This is an inherent consequence of `allow-same-origin`; removing it breaks the origin-pinning mechanism. Risk is bounded by the MCP host's own security posture | Accepted |
| **DoS** — iframe resource exhaustion | A malicious SPA could spin CPU/memory indefinitely | Host platform (Claude Code / Cowork) enforces sandbox resource limits independently. No mitigation in this codebase | Out of scope |
| **Elevation** — sandbox escape | `sandbox` omits `allow-popups`, `allow-top-navigation`, `allow-forms` (no native form submission). No way to navigate the parent frame | Sandbox attributes are set by the host, not the SPA. No `allow-scripts allow-same-origin allow-popups allow-top-navigation` escape vectors present | Implemented (by host) |

---

## Summary Table

| Threat | Severity | Mitigation | Status |
|---|---|---|---|
| `waitForSession` indefinite block (DoS) | HIGH | 30-min AbortSignal timeout in `sessions.ts:88` | Implemented |
| XSS via `innerHTML` for user content in SPA | MEDIUM | Replaced with DOM APIs in `094ec3f7` | Implemented |
| postMessage wildcard `targetOrigin` | MEDIUM | Pinned to captured host origin in `094ec3f7` | Implemented |
| postMessage listener did not validate `event.origin` | MEDIUM | `_hostOrigin` pinned on first message in `094ec3f7` | Implemented |
| Session ID reuse on closed session | MEDIUM | 409 check before any state mutation in `haiku_cowork_review_submit` | Implemented |
| Sequential integer request IDs (guessable) | LOW | Requires same-origin XSS as prerequisite; accepted risk | Accepted |
| `console.log` leaks bridge detection state | LOW | Informational disclosure only; no credential or secret exposure | Accepted |
| `REVIEW_APP_HTML` served without auth via `resources/read` | INFO | By design — MCP resources are host-trusted; SPA contains no secrets | By design |
| Capability echo is trust-on-first-use | INFO | Outside MCP protocol scope; UUID session IDs are unpredictable | Accepted |
| `allow-same-origin` grants host storage access | INFO | Required for origin pinning; risk bounded by host security posture | Accepted |

No CRITICAL or HIGH threats remain with status **pending**.

---

## Scope Exclusions

- **MCP transport-layer security** (TLS, JSON-RPC integrity) — delegated to the MCP SDK and the host platform
- **Host platform security** (Cowork sandbox, Claude Code process isolation) — not in scope for this codebase
- **Persistent auth / multi-user access control** — review sessions are ephemeral, single-user, same-machine
