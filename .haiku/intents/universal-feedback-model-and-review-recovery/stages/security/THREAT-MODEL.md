# Threat Model: Universal Feedback Model

STRIDE analysis of the feedback model's attack surface, plus OWASP Top 10 verification.

Date: 2026-04-15
Scope: Feedback file creation/mutation (MCP tools + HTTP API), gate-phase enforcement, review-UI pipeline, external-PR detection.

---

## 1. STRIDE Analysis

### S — Spoofing

**Threat:** An agent impersonates a human author to create feedback that cannot be agent-rejected or agent-closed, effectively creating irremovable gate blockers.

**Likelihood:** Low
**Impact:** High

**Mitigation:** `author_type` is derived server-side from `origin` via `deriveAuthorType()` (state-tools.ts:2002). The caller cannot supply `author_type` directly. Human origins (`user-visual`, `user-chat`, `external-pr`, `external-mr`) are only reachable through the HTTP API or orchestrator-internal paths — never through MCP tool handlers. MCP tool handlers always produce `agent` author_type because their origin values resolve to `agent` through the same derivation function.

**Verification evidence:**
- `deriveAuthorType()` is the sole determinant — no tool handler accepts `author_type` as an input parameter.
- `HUMAN_ORIGINS` set is hardcoded (state-tools.ts:1994).
- `handleStateTool("haiku_feedback", ...)` never passes caller-supplied `author_type` to `writeFeedbackFile`.
- HTTP endpoints (`handleFeedbackPost`) hardcode `author: "user"` and use `user-visual` origin.
- Test: `feedback.test.mjs` verifies `author_type: "agent"` for MCP-created items and `author_type: "human"` for HTTP-created items.

---

### T — Tampering

**Threat:** Feedback files are tampered with on disk to change `status: pending` to `status: closed`, bypassing the gate check. Alternatively, an agent modifies frontmatter directly via filesystem writes instead of using the MCP tool.

**Likelihood:** Low
**Impact:** High

**Mitigation:**
1. All feedback mutations go through `writeFeedbackFile` / `updateFeedbackFile` / `deleteFeedbackFile`, each followed by `gitCommitState()`. Every change is committed to git with a descriptive message. Tampering is detectable via `git log` / `git diff`.
2. The gate-phase check in `orchestrator.ts` reads feedback files fresh from disk on every `haiku_run_next` call — it does not cache state. Any reversion of a tampered file before the next tick restores the correct gate behavior.
3. Agents operate within the MCP tool boundary. Direct filesystem writes are theoretically possible if the agent escapes the MCP sandbox, but this is a Claude Code platform-level concern, not a feedback-model concern.

**Verification evidence:**
- `gitCommitState` called after every mutation in state-tools.ts and http.ts.
- `countPendingFeedback` reads files from disk each invocation (state-tools.ts).
- `gate-feedback.test.mjs` verifies the gate blocks when pending feedback exists and advances when it does not.

---

### R — Repudiation

**Threat:** An actor denies creating a feedback item, or claims a feedback item was fabricated.

**Likelihood:** Low
**Impact:** Medium

**Mitigation:**
1. Every feedback file includes `author`, `author_type`, `origin`, and `created_at` in frontmatter.
2. Every creation/update/delete is committed to git with a timestamped commit message (e.g., `feedback: create FB-01 in development`).
3. Git history provides a tamper-evident audit trail — `git log --follow -- .haiku/intents/*/stages/*/feedback/` shows the full provenance chain.

**Verification evidence:**
- `writeFeedbackFile` always sets `created_at` to `new Date().toISOString()` (state-tools.ts).
- `feedback.test.mjs` verifies `author`, `author_type`, `origin`, and `created_at` are present on created items.

---

### I — Information Disclosure

**Threat:** Feedback content (which may include security findings from adversarial review) leaks to unauthorized parties.

**Likelihood:** Low
**Impact:** Medium

**Mitigation:**
1. Feedback files are local `.haiku/` directory files with the same access model as the rest of the project. No new network exposure surface.
2. The HTTP API runs on localhost by default. When remote review is enabled (`HAIKU_REMOTE_REVIEW=1`), CORS headers are applied, but all traffic goes through a tunnel with E2E encryption (http.ts:214-238).
3. The review app serves feedback data only through authenticated session endpoints. No public unauthenticated listing endpoint exists.
4. Feedback files are committed to git, so they follow the same access control as the repository itself (branch protections, repo permissions).

**Verification evidence:**
- HTTP feedback endpoints validate intent/stage slugs before any data access.
- `isRemoteReviewEnabled()` gate on CORS headers.
- `http-feedback.test.mjs` verifies 400/404 responses for invalid inputs before any data is returned.

---

### D — Denial of Service

The DoS analysis splits into two attack surfaces with different trust boundaries and threat profiles. **D-MCP** is the local MCP tool path. **D-HTTP** is the authenticated HTTP API path, which in tunnel mode (`HAIKU_REMOTE_REVIEW=1`) extends to any actor with a replayable session JWT.

#### D-MCP: Feedback creation via MCP tool (local blast radius)

**Threat:** Feedback creation is abused to fill disk space by creating thousands of feedback files, or to stall the gate indefinitely by creating pending items faster than they can be addressed.

**Likelihood:** Low
**Impact:** Low

**Trust boundary:** Process-local. Caller is whoever controls the MCP server (the developer on their own machine).

**Mitigation:**
1. Feedback creation is a local MCP tool — the blast radius is the developer's own machine.
2. Feedback files are small markdown documents (typically < 1KB in the MCP path, which does not accept base64 screenshots). Even 10,000 files would consume < 10MB.
3. The `nextFeedbackNumber` function uses a sequential NN prefix, so creation cost is O(n) for reading the directory listing. At scale (>1000 files per stage), this could slow down, but this is a self-inflicted local concern.
4. For gate stalling: the `visits` counter provides a mechanism for future escalation thresholds (e.g., "if visits > 3, escalate to human").

**Verification evidence:**
- MCP tool handlers have no large-body vector (`haiku_feedback` takes structured fields, not base64 blobs).
- `nextFeedbackNumber` reads `readdirSync` — bounded by local filesystem performance.

---

#### D-HTTP: Feedback creation via HTTP API (session-JWT-bounded blast radius)

**Threat:** The `POST /api/feedback/:intent/:stage` endpoint accepts bodies up to `FEEDBACK_CREATE_MAX_BYTES = 8 MiB` (haiku-api/src/schemas/common.ts:221, enforced via `bodyLimit` at http.ts:1496). The 8 MiB budget exists to accommodate base64-encoded screenshots, but the endpoint has **no per-IP rate cap, no per-session creation cap, and no ceiling on total feedback files per stage**. A single authenticated session can therefore:

1. POST 8 MiB × N requests back-to-back (one 8 MiB body per request) for the 1-hour JWT TTL, writing a file and a git commit for every request.
2. Create unboundedly many feedback files — `nextFeedbackNumber` (state-tools.ts:3082-3094) is O(n) in the directory listing, so each creation gets incrementally slower as N grows, amplifying the stall.
3. Fill disk: 8 MiB × 1000 = ~8 GB of writes inside one automated session; a 1-hour window over a persistent connection allows far more.
4. Trigger a git commit storm: each feedback write calls `gitCommitState()`, spawning a child process. Rapid creation blocks the Node event loop on `spawn`/`wait` syscalls.

**Likelihood:** Low-Medium (requires a live session JWT, but in tunnel mode JWTs are embedded in the review URL fragment and replayable for 1 hour — clipboard, browser history, or network logs all expand the attacker set beyond "the developer running the MCP").

**Impact:** Medium (disk exhaustion, event-loop stall, slowdown of all stage-state reads) — scoped to the local project, but it takes the review server and the developer's host down together.

**Trust boundary (where trusted data becomes untrusted):** The HTTP request body crosses from "untrusted network payload" to "trusted on-disk feedback artifact" the moment `handleFeedbackPost` invokes `writeFeedbackFile`. Today the only pre-crossing checks are:
- `verifyTunnelJWT` (existence + expiry of session JWT — does not cap request rate)
- `bodyLimit: FEEDBACK_CREATE_MAX_BYTES` (per-request byte ceiling — does not cap request count)
- Zod schema validation (structural — does not cap rate or total)

No layer restricts request **rate** or aggregate **count** per session/IP.

**Data flows in scope:**
- `HTTP client → Fastify request handler → Zod schema → writeFeedbackFile → fs.writeFileSync → gitCommitState (spawn) → disk`
- Trust boundary: HTTP request handler / Zod layer (network → local-state mutation).
- Inside-to-inside flow: `handleFeedbackPost → nextFeedbackNumber` (readdirSync) per request — O(n) cost amplifies under flood.

**Mitigation gaps vs. root cause:**
- **Connection cap (MAX_CONNECTIONS = 256, http.ts:226-234):** bounds simultaneous sockets, not request rate. A single persistent keep-alive connection can fire hundreds of sequential 8 MiB POSTs in the 1-hour JWT window.
- **JWT TTL (3600s, tunnel.ts:308):** the only temporal bound. One hour is longer than any DoS window needs.
- **FB-06 (`@fastify/rate-limit` declared but never registered):** the dependency is in package.json but never wired into the server, so there is literally zero active rate limiting today.
- **`bodyLimit` per request:** caps the single-request cost but does nothing to cap cumulative cost.

**Required mitigations (defense-in-depth):**
1. **Register `@fastify/rate-limit`** (tracked under FB-06) and configure it on `POST /api/feedback/:intent/:stage` with a per-session and per-IP cap (e.g., 20 creations/minute, 200/hour). This is the primary second layer.
2. **Per-session creation counter** in session state (e.g., `session.feedbackCreated`) with a hard cap (e.g., 500 items per session) returning HTTP 429 once exceeded.
3. **Per-stage feedback-file ceiling** checked at `nextFeedbackNumber` time — if `count >= MAX_FEEDBACK_PER_STAGE` (e.g., 1000), reject with 429. This caps the O(n) amplification on its own term.
4. **Reduced `FEEDBACK_CREATE_MAX_BYTES`** for non-attachment paths. If attachments move to a separate endpoint (see FB-02), the feedback-create body can drop to ~64 KiB.
5. **Debounced/batched `gitCommitState`** so a flood of requests does not translate 1:1 into child-process spawns.

**Verification evidence (current state):**
- FB-06 confirms rate-limit middleware is declared but unregistered — no active rate limit on this path today.
- `bodyLimit: FEEDBACK_CREATE_MAX_BYTES` is the only per-request guard (http.ts:1496).
- `nextFeedbackNumber` performs an unbounded directory scan on every creation (state-tools.ts:3082-3094).
- `threat-model-expanded.md §D2` acknowledges "large reasons array creates filesystem load" but rates it "very low / local" — that rating does **not** transfer to the HTTP path and is explicitly superseded by this section for the HTTP attack surface.

**Status:** Gap identified. Primary mitigation (rate limit) is tracked under FB-06; secondary caps (per-session counter, per-stage ceiling, reduced body limit, commit debounce) are new defense-in-depth requirements surfaced by this analysis and must be scheduled before any public-tunnel review deployment.

---

### E — Elevation of Privilege

**Threat:** An agent bypasses author-type guards to close human-authored feedback, effectively self-approving its own work. Or an agent accesses tools restricted to the HTTP boundary (human context).

**Likelihood:** Low
**Impact:** High

**Mitigation:**
1. MCP/HTTP boundary separation: MCP tools pass `callerContext: "agent"` to update/delete helpers. HTTP handlers pass `callerContext: "human"`. These are hardcoded in the respective call sites, not derived from user input.
2. `updateFeedbackFile` (state-tools.ts:2243-2252) explicitly checks: if `callerContext === "agent"` and `found.data.author_type === "human"` and new status is `closed`, the operation is rejected with an error.
3. `deleteFeedbackFile` (state-tools.ts:2297-2306) rejects agent deletion of human-authored items entirely.
4. `validateSlugArgs` now checks `feedback_id` in addition to `intent`, `slug`, `stage`, and `unit` — preventing path traversal to access feedback files outside the intended scope.

**Verification evidence:**
- `feedback.test.mjs` has explicit tests: "MCP update rejects agent closing human-authored feedback", "MCP delete rejects agent deleting human-authored feedback".
- `state-tools-handlers.test.mjs` verifies `feedback_id` path traversal rejection (3 tests: `../` sequences, forward slashes, backslashes).

---

## 2. OWASP Top 10 Verification

### A01: Broken Access Control

**Status:** Mitigated and tested.

- Author-type guards enforce MCP (agent) vs HTTP (human) boundary. Agents cannot close or delete human-authored feedback.
- MCP agent-only tools (`haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`) are only reachable through the MCP server's tool dispatch — never exposed on HTTP.
- HTTP endpoints validate slug parameters with `isValidSlug()` before any filesystem access.

**Tests:** `feedback.test.mjs` — agent-close-human rejection, agent-delete-human rejection. `http-feedback.test.mjs` — slug validation on all CRUD endpoints.

### A02: Cryptographic Failures

**Status:** N/A.

No encryption at rest for feedback files — they are local project files with the same security posture as source code. When remote review is enabled, the HTTP transport uses E2E encryption via the tunnel layer (existing infrastructure, not feedback-specific). No secrets, tokens, or PII are stored in feedback files.

### A03: Injection

**Status:** Mitigated and tested.

- **Path traversal:** `validateSlugArgs` checks `intent`, `slug`, `stage`, `unit`, and `feedback_id` for `..`, `/`, and `\` characters. Rejects with an error before any filesystem access.
- **Slug sanitization:** `slugifyTitle()` strips all non-alphanumeric characters (replaced with hyphens), preventing filename injection.
- **No SQL:** The system uses filesystem storage only. No query language injection surface.
- **No shell injection:** All filesystem operations use Node.js `fs` module functions with `join()` for path construction — no shell command interpolation.

**Tests:** `state-tools-handlers.test.mjs` — path traversal rejection for all slug-derived parameters including `feedback_id`. `feedback.test.mjs` — `slugifyTitle` sanitization tests.

### A04: Insecure Design

**Status:** Mitigated.

- Feedback file schema is enforced: `origin` is validated against `FEEDBACK_ORIGINS` enum, `status` against `FEEDBACK_STATUSES` enum.
- HTTP request bodies are validated with Zod schemas (`FeedbackCreateSchema`, `FeedbackUpdateSchema`) before any processing.
- The gate-phase pending-feedback check is structural (FSM-level), not prompt-level. No prompt injection can bypass it — the orchestrator reads feedback files directly and short-circuits gate resolution if pending count > 0.
- `author_type` derivation from `origin` is a design-level decision that prevents the most impactful attack vector (agent spoofing human authorship).

**Tests:** `feedback.test.mjs` — origin validation, status enum enforcement. `gate-feedback.test.mjs` — structural gate blocking.

### A05: Security Misconfiguration

**Status:** Mitigated.

- CORS headers are only applied when `isRemoteReviewEnabled()` returns true (opt-in via environment variable).
- When CORS is active, `Access-Control-Allow-Origin: *` is used because the tunnel URL is dynamic and unpredictable. The E2E encryption layer mitigates the open-origin risk.
- No default credentials exist — the system is session-based with UUID session IDs generated at runtime.
- No unnecessary endpoints are exposed — feedback CRUD is registered alongside existing review endpoints with the same access model.

### A06: Vulnerable and Outdated Components

**Status:** N/A.

The feedback model introduces no new npm dependencies. All functionality is implemented using Node.js built-in modules (`fs`, `path`) and existing project dependencies (`gray-matter` for frontmatter parsing, `zod` for schema validation). No new attack surface from third-party code.

### A07: Identification and Authentication Failures

**Status:** N/A (local tool context).

The MCP server runs as a local process invoked by Claude Code. Authentication is implicit — whoever can run the MCP server has full access. The HTTP review server uses transient session UUIDs generated per review cycle. There are no persistent credentials, no password storage, and no authentication tokens to protect.

### A08: Software and Data Integrity Failures

**Status:** Mitigated.

- Every feedback mutation is followed by `gitCommitState()`, creating an immutable audit trail in git history.
- Feedback files use git as their integrity mechanism — `git diff` reveals any out-of-band modifications.
- The gate-phase check reads files fresh from disk on every invocation. No stale cache can hide integrity violations.
- No CI/CD pipeline modifications are involved in the feedback model — it is purely local state management.

**Tests:** `feedback.test.mjs` verifies that git commit calls happen on creation. `gate-feedback.test.mjs` verifies that the gate reads live state.

### A09: Security Logging and Monitoring Failures

**Status:** Mitigated.

- Git commit messages on every feedback mutation provide a structured audit log: `feedback: create FB-01 in development`, `feedback: update FB-01 in development`, etc.
- The orchestrator logs gate transitions and feedback-revisit actions through the existing telemetry infrastructure.
- The `visits` counter in stage state tracks how many revisit cycles have occurred — useful for detecting excessive churn.

### A10: Server-Side Request Forgery (SSRF)

**Status:** N/A.

The feedback system makes no outbound HTTP requests. All operations are local filesystem reads/writes. The external review detection (for `external-pr`/`external-mr` origins) is handled by the existing orchestrator polling code, not by the feedback model itself. No user-supplied URLs are fetched.

---

## 3. Defense-in-Depth Measures

### 3a. `validateSlugArgs` hardening

`feedback_id` has been added to the checked keys array in `validateSlugArgs()` (state-tools.ts). This ensures that any MCP tool receiving a `feedback_id` argument will reject path traversal attempts (`../`, `/`, `\`) before any filesystem access occurs.

**Verification:** Three new tests in `state-tools-handlers.test.mjs`:
1. `haiku_feedback_update` rejects `feedback_id` with `../../../etc/passwd`
2. `haiku_feedback_delete` rejects `feedback_id` with `foo/bar`
3. `haiku_feedback_reject` rejects `feedback_id` with backslash traversal

### 3b. Dual validation layers

Feedback identifiers are validated at two independent layers:
1. **MCP layer:** `validateSlugArgs` in `handleStateTool` (covers all MCP tool invocations).
2. **HTTP layer:** `isValidSlug()` in each HTTP handler (`handleFeedbackPut`, `handleFeedbackDelete`).

Neither layer trusts the other. Both reject independently.

### 3c. Immutable derivation

`author_type` is never a user-supplied field. It is always derived from `origin` via `deriveAuthorType()`. This eliminates an entire class of privilege-escalation attacks where a caller could claim to be human-authored.

### 3d. Structural gate enforcement

The pending-feedback gate check is implemented at the FSM level in `orchestrator.ts`, not as a prompt instruction. The agent cannot be prompt-injected into skipping the check because the check happens in compiled TypeScript code before any agent instructions are generated.
