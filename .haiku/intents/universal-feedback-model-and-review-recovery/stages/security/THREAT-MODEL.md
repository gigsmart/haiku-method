# Threat Model: Universal Feedback Model

STRIDE analysis of the feedback model's attack surface, plus OWASP Top 10 verification.

Date: 2026-04-15 (last updated 2026-04-24 to incorporate FB-06 — HTTP rate-limit gap — and FB-07 — reply endpoint cross-reference)
Scope: Feedback file creation/mutation (MCP tools + HTTP API), gate-phase enforcement, review-UI pipeline, external-PR detection, tunnel-mode HTTP surface.

---

## 0. Entry-Point Inventory

The feedback model introduces or touches the following HTTP entry points. Each one is an untrusted-input boundary where caller-supplied parameters cross into filesystem / state operations. Validation chains are enumerated per endpoint so the defense-in-depth layer covering each surface is explicit.

| # | Endpoint | Method | Caller-supplied params | Validation chain | Filesystem reach |
|---|---|---|---|---|---|
| E1 | `/api/feedback/:intent/:stage` | POST | `intent`, `stage` (URL); JSON body validated by `FeedbackCreateSchema` | `requireTunnelAuth` → `isValidSlug(intent)` → `isValidSlug(stage)` → `validateIntent(intent)` → Zod body schema → `writeFeedbackFile` (which calls `slugifyTitle` for filenames and joins under `intentDir`) | Writes `.haiku/intents/{intent}/stages/{stage}/feedback/FB-NN-*.md` (+ optional attachment PNG) |
| E2 | `/api/feedback/:intent/:stage/:id` | PUT | `intent`, `stage`, `id` (URL); JSON body validated by `FeedbackUpdateSchema` | `requireTunnelAuth` → `verifyFeedbackMutationAuth` (JWT sid-binding) → `isValidSlug(intent/stage/id)` → `updateFeedbackFile` (`callerContext: "human"`) | Mutates frontmatter on existing feedback file |
| E3 | `/api/feedback/:intent/:stage/:id` | DELETE | `intent`, `stage`, `id` (URL) | `requireTunnelAuth` → `verifyFeedbackMutationAuth` → `isValidSlug(intent/stage/id)` → `deleteFeedbackFile` (`callerContext: "human"`) | Deletes feedback file |
| E4 | `/api/feedback-attachment/:intent/:stage/:filename` | GET | `intent`, `stage`, `filename` (URL) | `requireTunnelAuth` → `isValidSlug(intent)` → `isValidSlug(stage)` → filename regex `^[A-Za-z0-9._-]+\.(png\|jpg\|jpeg\|webp\|svg)$` → `serveUnderRoot(reply, feedbackRoot, filename)` (realpath escape check) | Reads `.haiku/intents/{intent}/stages/{stage}/feedback/{filename}` as `image/*` body |
| M1 | MCP tool `haiku_feedback` / `haiku_feedback_update` / `haiku_feedback_delete` / `haiku_feedback_reject` | MCP | `intent`, `stage`, `feedback_id`, body fields | `validateSlugArgs` (covers `intent`, `slug`, `stage`, `unit`, `feedback_id`) → `writeFeedbackFile` / `updateFeedbackFile` / `deleteFeedbackFile` (`callerContext: "agent"`) | Same feedback directory; author-type guards prevent agent-close of human items |

**Notes on the attachment endpoint (E4):**

- The validation chain for E4 is **different** from E1/E2/E3. E4 does NOT route through `validateSlugArgs` (which is MCP-only) and the `filename` parameter does NOT use `isValidSlug` (because attachment filenames legitimately contain `.` for the extension, which `isValidSlug` rejects). Instead, E4 pairs a **whitelist-regex** (restricts to allowed image extensions and the `[A-Za-z0-9._-]` charset — no `/`, `\`, or `..` substrings) with **`serveUnderRoot`**, which resolves the final path via `realpath` and verifies it stays within `feedbackRoot`. Either layer alone would be insufficient; together they are defense-in-depth (see §3a).
- The regex **does** allow filenames like `foo.bar.png` (dots in the stem), and it would also match `..png` if preceded by a non-dot character. Neither is a traversal vector because the filename is joined under `feedbackRoot` with `path.join`, and `serveUnderRoot` rejects any resolved path whose `realpath` escapes `feedbackRoot`. The regex is there to reject obvious separators and force a known image extension; the realpath escape check is the authoritative traversal guard.
- E4 is read-only and serves locally-generated attachments created by `writeFeedbackFile`. It does not accept uploads. No agent-authored or HTTP-authored request can cause arbitrary files to land under `feedbackRoot` — only `writeFeedbackFile` writes there, and it controls the basename.

**Reply endpoint (HTTP-only):** `POST /api/feedback/:intent/:stage/:feedbackId/replies` introduced during implementation is analyzed in `artifacts/threat-model-expanded.md` (§ Trust Boundaries + S3 + E3). The base threat model below covers feedback CRUD; the reply endpoint is asymmetric (HTTP-only, no MCP equivalent) and is characterized separately to avoid conflating CRUD and thread-append surfaces.

---

## 1. STRIDE Analysis

### S — Spoofing

**Threat:** An agent impersonates a human author to create feedback that cannot be agent-rejected or agent-closed, effectively creating irremovable gate blockers. **Secondary vector:** an HTTP caller (or any loopback caller in local mode) forges the `author` label on a feedback **reply** to impersonate a specific actor (e.g., `"orchestrator"`, `"security-agent"`, or another user), exploiting the trust-boundary gap between the create path (which hardcodes `author: "user"`) and the reply path (which accepts a client-supplied value).

**Likelihood:** Low (local) / Medium (remote tunnel — authenticated but still trust-asymmetric with the create path)
**Impact:** High

**Mitigation:** `author_type` is derived server-side from `origin` via `deriveAuthorType()` (state-tools.ts). The caller cannot supply `author_type` directly. Human origins (`user-visual`, `user-chat`, `user-question`, `external-pr`, `external-mr`) are only reachable through the HTTP API or orchestrator-internal paths — never through MCP tool handlers. MCP tool handlers always produce `agent` author_type because their origin values resolve to `agent` through the same derivation function.

Trust-boundary crossing: every human-origin value in `FEEDBACK_ORIGINS` must also appear in `HUMAN_ORIGINS`. The review UI's question composer (`FeedbackSidebar.tsx`) crosses the UI → HTTP → state-tools boundary with `origin: "user-question"`, so `user-question` MUST be in `HUMAN_ORIGINS`. If it were omitted, human-authored questions would be stored with `author_type: "agent"` and the privilege guards in `updateFeedbackFile`/`deleteFeedbackFile` (which only protect `author_type === "human"` items) would let any agent close or delete them — an elevation-of-privilege vector across an internal trust boundary.

**Required mitigation (FB-01 — not yet implemented):** The feedback-reply endpoint in `packages/haiku/src/http.ts` must hardcode `author: "user"` in the same way the feedback-create endpoint does, rather than accepting `parsed.data.author ?? "user"`. Until this is fixed, the `author` field on replies is attacker-controlled within the HTTP trust boundary, and the `FeedbackReplyCreateRequestSchema` contract ("when omitted the server stamps 'user' or the agent name from session context") is not enforced. The fix brings the reply path into parity with the create path at http.ts:1526, eliminating the inconsistent trust boundary.

**Verification evidence:**
- `deriveAuthorType()` is the sole determinant — no tool handler accepts `author_type` as an input parameter.
- `HUMAN_ORIGINS` set is hardcoded (state-tools.ts `HUMAN_ORIGINS` constant) and lists every user-facing origin declared in `FEEDBACK_ORIGINS`.
- `handleStateTool("haiku_feedback", ...)` never passes caller-supplied `author_type` to `writeFeedbackFile`.
- HTTP feedback-create endpoint (`handleFeedbackPost`, http.ts:1526) hardcodes `author: "user"` and uses a human origin (`user-visual`, `user-chat`, or `user-question` depending on the composer mode) — **correct pattern**. The `author` field on `FeedbackCreateRequestSchema` (packages/haiku-api/src/schemas/feedback.ts) is accepted by the Zod validator for backward compatibility, but the handler does not propagate `parsed.data.author` into `writeFeedbackFile` — it is discarded at the trust boundary. The schema `describe()` text reflects this explicitly (FB-03 fix) so future developers do not re-introduce a session-context author resolution without also adding authenticated identity propagation.
- HTTP feedback-reply endpoint (http.ts:1784) currently takes `author` from the request body (`parsed.data.author ?? "user"`) — **tracked as FB-01, required fix: hardcode `author: "user"` to match create path**.
- Test: `feedback.test.mjs` verifies `deriveAuthorType` returns `"human"` for every entry in `HUMAN_ORIGINS` (including `user-question`) and `"agent"` for MCP-originated values. It also verifies `author_type: "agent"` for MCP-created items and `author_type: "human"` for HTTP-created items. A regression test must be added asserting that a reply POST with a client-supplied `author` value is ignored and `"user"` is written.

#### Trust boundary: `FeedbackCreateRequestSchema.author` is a suppressed client input (intentional)

**Surface:** `FeedbackCreateRequestSchema` (packages/haiku-api/src/schemas/feedback.ts:116-123) accepts an optional `author` string from clients. The handler at `packages/haiku/src/http.ts:1522-1530` **ignores** `parsed.data.author` entirely and hardcodes `author: "user"` into the call to `writeFeedbackFile`.

**Trust boundary crossing:** HTTP request body → Zod validation (`FeedbackCreateRequestSchema`) → handler. The `title`, `body`, `origin`, `source_ref`, `anchor`, `resolution`, and `attachment_data_url` fields cross the boundary and are persisted after validation. The `author` field crosses the boundary but is **dropped** before persistence — server always stamps `"user"`. Any reviewer adding new persisted-author logic MUST also add authenticated-session identity resolution; otherwise this field becomes a spoofing vector.

**Trust classification:** Client-supplied `author` is **untrusted input that crosses into the server trust zone and is deliberately dropped at the boundary**. It never reaches the persisted feedback file. The field is retained in the schema as a reserved/forward-compat slot, not as an active input.

**Why `author_type`, not `author`, is the security-bearing field:**
- `author_type` ∈ `{human, agent}` is what every guard branches on: `updateFeedbackFile` / `deleteFeedbackFile` close/delete rejection for agent callers against human rows, and the gate-phase pending-feedback check. `author_type` is **server-derived from `origin` via `deriveAuthorType()`** and is never client-supplied.
- `author` is a free-text display string used in git commit messages, audit displays, and the review UI. It has **no enforcement semantics** — no code branches on its value. Spoofing `author` cannot elevate privilege, cannot close human-authored feedback, and cannot bypass the gate. Its worst-case impact is a misleading audit-trail label (e.g., a feedback row visibly attributed to `"admin"` or `"orchestrator"` in the review UI and in the `feedback: create FB-NN in <stage>` commit message).

**Intentional suppression — do NOT wire `parsed.data.author` through:** Any future change that replaces `author: "user"` with `author: parsed.data.author ?? "user"` (or similar) **reopens an author-spoofing vector for the audit-trail display surface**. A malicious or misbehaving client could then supply `author: "admin"`, `author: "orchestrator"`, `author: "feedback-assessor"` etc. to make planted feedback look like it came from a privileged actor. This will not bypass any enforcement guard (those still key off `author_type`), but it will corrupt the audit trail and can be used to socially engineer reviewers.

**Required handling if the field is ever un-suppressed in the future:**
1. Server MUST derive `author` from the authenticated session/JWT subject, not from the request body. Treat any client-supplied `author` string as an untrusted hint to be discarded OR as input to be validated against a server-known identity — never write it through verbatim.
2. Any change to `http.ts:1522-1530` that reads `parsed.data.author` without such a check is a regression of this mitigation and MUST be flagged in code review.
3. The `author` field semantics should be documented alongside `author_type` in whatever design note introduces the honoring-handler, so future maintainers know the difference between "display author" (untrusted, sanitized) and "security author_type" (server-derived).

**Likelihood:** Low (field is inert today; requires a future wiring change)
**Impact:** Low-Medium if un-suppressed without server-side derivation (audit-trail corruption only; does not bypass gate or close guards)

**Verification evidence:**
- `packages/haiku/src/http.ts:1522-1530` — `author: "user"` is a string literal in the call site; `parsed.data.author` is not referenced.
- `packages/haiku-api/src/schemas/feedback.ts:116-123` — schema describes the field as "reserved for future use when the handler begins to honor it."
- `FeedbackCreateRequestSchema` has no test coverage asserting the field round-trips, because it intentionally does not.

**Status:** Mitigated by suppression. Guardrail documented for future maintainers.

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

**Trust boundary:** The MCP tool boundary is the critical trust edge. On the MCP side, `callerContext === "agent"`; on the HTTP side, `callerContext === "human"`. Every write path that mutates human-authored feedback state MUST enforce this boundary. There are **two independent paths to "closed" state** that both must be guarded:

1. `closed_by` being set to a non-empty string (the usual audit path).
2. `status` being set directly to `"closed"` (a state transition that bypasses the audit field).

Either path, left unguarded, lets an agent self-approve work by closing a human finding, which silently unblocks the review gate (`countPendingFeedback` only counts items with `status !== "closed"`).

**Likelihood:** Low
**Impact:** High

**Mitigation:**
1. MCP/HTTP boundary separation: MCP tools pass `callerContext: "agent"` to update/delete helpers. HTTP handlers pass `callerContext: "human"`. These are hardcoded in the respective call sites, not derived from user input.
2. `updateFeedbackFile` (state-tools.ts:3473-3487) rejects `callerContext === "agent"` setting `closed_by` on a human-authored item.
3. **Required parallel guard (FB-24):** `updateFeedbackFile` MUST also reject `callerContext === "agent"` setting `status: "closed"` on a human-authored item. Without this guard, an agent calling `haiku_feedback_update` with `{ feedback_id, status: "closed" }` (and no `closed_by`) reaches the "Apply updates" block unimpeded and the gate unblocks. The `haiku_feedback_update` tool schema lists `closed` as a valid status value with no restriction note, so agents have no prompt-level indication that the transition is forbidden on human items — the enforcement MUST be structural, not documentary.
4. `deleteFeedbackFile` rejects agent deletion of human-authored items entirely.
5. `validateSlugArgs` checks `feedback_id` in addition to `intent`, `slug`, `stage`, and `unit` — preventing path traversal to access feedback files outside the intended scope.

**Known gap (see threat-model-expanded.md E2):** The `closed` guard above protects the literal `closed` label, but not the *gate-clearing semantics*. An agent can set `status: addressed` on human-authored feedback; `countPendingFeedback` treats `addressed` as resolved, so in `auto`-gate stages a single agent call clears the gate without any human sign-off. The expanded threat model's E2 section defines the required defense-in-depth stack (M1 human-author-aware pending count; M2 stage-config enforcement; M3 explicit audit trail) that the development and testing stages MUST implement.

**Verification evidence:**
- `feedback.test.mjs` has explicit tests: "MCP update rejects agent closing human-authored feedback" (via `closed_by`), "MCP delete rejects agent deleting human-authored feedback".
- **Required new test (FB-24):** "MCP update rejects agent setting status=closed on human-authored feedback" — exercises the second path to the closed state.
- `state-tools-handlers.test.mjs` verifies `feedback_id` path traversal rejection (3 tests: `../` sequences, forward slashes, backslashes).
- Pending (required by E2-M1): `countPendingFeedback` refuses to clear gate on agent-driven `addressed` transition of human-authored items.

**Invariant statement (must hold under all mutation paths):**

> For any feedback item `F` where `F.author_type === "human"`, no MCP-initiated write (`callerContext === "agent"`) may transition `F.status` to `"closed"`, by any field or combination of fields. Closure of human-authored items is reachable only via the HTTP review UI where `callerContext === "human"`.

---

## 2. OWASP Top 10 Verification

### A01: Broken Access Control

**Status:** Partially mitigated — one gap identified (FB-24), fix required before close.

- Author-type guards enforce MCP (agent) vs HTTP (human) boundary. Agents cannot delete human-authored feedback, and agents cannot set `closed_by` on human-authored feedback.
- **Known gap (FB-24, open):** `updateFeedbackFile` guards the `closed_by` path but does not guard the `status: "closed"` path. An agent calling `haiku_feedback_update` with `{ feedback_id, status: "closed" }` (no `closed_by`) currently bypasses the intended invariant and closes a human-authored item, which silently unblocks the review gate. This MUST be fixed before this threat model can be marked fully mitigated — the "agents cannot close human-authored feedback" invariant is the load-bearing access-control guarantee for the feedback-driven gate, and a partial enforcement is equivalent to no enforcement from an attacker's perspective.
- MCP agent-only tools (`haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`) are only reachable through the MCP server's tool dispatch — never exposed on HTTP.
- HTTP endpoints validate slug parameters with `isValidSlug()` before any filesystem access.

**Tests:** `feedback.test.mjs` — agent-close-via-closed_by rejection, agent-delete-human rejection. **Missing (FB-24):** agent-close-via-status=closed rejection. `http-feedback.test.mjs` — slug validation on all CRUD endpoints.

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

**Status:** Partially mitigated — one open gap (FB-06).

- CORS headers are only applied when `isRemoteReviewEnabled()` returns true (opt-in via environment variable).
- When CORS is active, `Access-Control-Allow-Origin: *` is used because the tunnel URL is dynamic and unpredictable. The E2E encryption layer mitigates the open-origin risk.
- No default credentials exist — the system is session-based with UUID session IDs generated at runtime.
- No unnecessary endpoints are exposed — feedback CRUD is registered alongside existing review endpoints with the same access model.

**Open gap (FB-06):** `@fastify/rate-limit` is declared as a production dependency in `packages/haiku/package.json` but is never imported or registered in `packages/haiku/src/http.ts`. This is a misconfiguration in the literal OWASP-A05 sense — a security-relevant component is shipped but not wired up, creating a false impression of defense-in-depth while leaving HTTP routes unprotected against request flooding. See STRIDE section D (Threat 2) for the attack vector and required mitigation.

### A06: Vulnerable and Outdated Components

**Status:** Partially mitigated — inventory needs correction (FB-06).

**Correction:** A previous revision of this section claimed "no new npm dependencies". That is inaccurate. `packages/haiku/package.json` declares `@fastify/rate-limit: ^10.3.0` as a production dependency introduced alongside the feedback/review-server work. All other feedback-model code paths rely on Node.js built-in modules (`fs`, `path`) and pre-existing dependencies (`gray-matter` for frontmatter parsing, `zod` for schema validation, `fastify` for the HTTP server).

**Current risk:**
- `@fastify/rate-limit` is declared but not loaded at runtime — so its CVE-exposure in this build is zero, but the package is still pinned and will be installed on `npm install`. Supply-chain considerations (typosquatting, compromised registry publishes of the upstream package) apply regardless of whether it is `register()`-ed. The caret range (`^10.3.0`) allows automatic upgrade within the 10.x major.
- Recommendation: either (a) tighten to an exact version + integrity pin once it is actually registered, or (b) remove the declaration entirely if option (b) of the FB-06 mitigation is chosen. Shipping an unused dependency is a supply-chain smell — every installed package is a potential attack surface, registered or not.

**Followup:** resolving FB-06 (STRIDE-D Threat 2) also resolves this inventory gap. Whichever direction that fix takes (register vs. remove), this section must be updated to match the final state of `package.json`.

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

### 3a. `validateSlugArgs` hardening (MCP layer)

`feedback_id` has been added to the checked keys array in `validateSlugArgs()` (state-tools.ts). This ensures that any MCP tool receiving a `feedback_id` argument will reject path traversal attempts (`../`, `/`, `\`) before any filesystem access occurs.

**Scope note:** `validateSlugArgs` runs only inside `handleStateTool` — it does **not** cover HTTP entry points. HTTP entry points are covered by `isValidSlug()` (E1–E3) and by the dedicated regex + `serveUnderRoot` chain on the attachment endpoint (E4). See §3b for the full dual-layer picture.

**Verification:** Three new tests in `state-tools-handlers.test.mjs`:
1. `haiku_feedback_update` rejects `feedback_id` with `../../../etc/passwd`
2. `haiku_feedback_delete` rejects `feedback_id` with `foo/bar`
3. `haiku_feedback_reject` rejects `feedback_id` with backslash traversal

### 3b. Dual validation layers

Feedback identifiers are validated at two independent layers:
1. **MCP layer:** `validateSlugArgs` in `handleStateTool` (covers all MCP tool invocations).
2. **HTTP layer:** `isValidSlug()` in each feedback CRUD handler (E1 POST, E2 PUT, E3 DELETE).

Neither layer trusts the other. Both reject independently.

**Attachment endpoint (E4) is a separate case.** The `filename` parameter of `/api/feedback-attachment/:intent/:stage/:filename` is not a slug in the `isValidSlug` sense (it must contain a `.ext` suffix). It is instead validated by:
1. A whitelist regex `^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$` — which structurally excludes `/`, `\`, and any non-image extension. This rejects the common `..%2F`, `foo/bar`, and `foo\bar` traversal shapes at the HTTP layer.
2. `serveUnderRoot(reply, feedbackRoot, filename)` — which joins `filename` under `feedbackRoot`, calls `fs.realpath` on the result, and verifies the resolved path still starts with `feedbackRoot`. This catches any residual edge case (e.g. symlinks, case-folded filesystems) that the regex alone would miss.

The `intent` and `stage` params on E4 still go through `isValidSlug` just like E1–E3, so cross-stage or cross-intent traversal via those segments is blocked by the same rule as the other endpoints.

**Why the regex alone is not considered sufficient:** The regex permits filenames with multiple dots in the stem (e.g. `foo.bar.png`). In a vanilla filesystem this is harmless, but `realpath` is the authoritative check because it normalizes away any exotic case and fails closed if resolution escapes `feedbackRoot`. The regex exists to cheaply reject malformed input; the realpath check is the security boundary.

### 3c. Immutable derivation

`author_type` is never a user-supplied field. It is always derived from `origin` via `deriveAuthorType()`. This eliminates an entire class of privilege-escalation attacks where a caller could claim to be human-authored.

### 3d. Structural gate enforcement

The pending-feedback gate check is implemented at the FSM level in `orchestrator.ts`, not as a prompt instruction. The agent cannot be prompt-injected into skipping the check because the check happens in compiled TypeScript code before any agent instructions are generated.

### 3e. HTTP-route rate limiting (REQUIRED — FB-06, currently missing)

**Trust boundary:** tunnel-exposed HTTP surface when `HAIKU_REMOTE_REVIEW=1`. Incoming data becomes untrusted the moment it arrives at the tunnel endpoint; rate limiting is the layer that caps how fast untrusted clients can drive the synchronous fs + git write amplifier inside `writeFeedbackFile`.

**Required implementation (development stage):**
1. Import and register `@fastify/rate-limit` in `packages/haiku/src/http.ts` — gated on `isRemoteReviewEnabled()` so the limiter only activates in tunnel mode (local-only runs don't need it and shouldn't pay the overhead).
2. Apply differentiated per-route caps:
   - Feedback mutation endpoints (POST/PUT/DELETE on `/api/sessions/:sid/intents/:intent/stages/:stage/feedback[...]`): ~60 req/min per IP.
   - Review-decision and revisit endpoints (POST `/api/sessions/:sid/intents/:intent/review-decision`, POST revisit): ~30 req/min per IP.
   - Session + read endpoints (GET session, GET feedback list, GET intent state): ~200 req/min per IP.
3. On limit exceeded, return `429 Too Many Requests` with `Retry-After` header; the review UI already knows how to surface transient errors via its error-state rendering.
4. Alternative path (explicitly accept the risk): if registering the limiter is not viable, remove `@fastify/rate-limit` from `package.json` and document in this section that tunnel-mode DoS resistance relies solely on `HAIKU_MAX_CONNECTIONS` + per-session WS frame limiting. This is a weaker posture but at least removes the misleading declared-but-inert dependency.

**Non-goal:** This limiter does not replace WS-frame rate limiting (`allowWsFrame`) — both layers coexist. HTTP-route limiting covers the REST mutation surface; WS-frame limiting covers the push-channel surface. Neither subsumes the other.

### 3f. Complete-closure guard (FB-24, required)

The "agents cannot close human-authored feedback" invariant requires guarding **every transition path to `status === "closed"`**, not just the one that passes through `closed_by`. `updateFeedbackFile` currently enforces only the `closed_by` path. A parallel guard is required immediately above the "Apply updates" block in `state-tools.ts`:

```ts
if (
  callerContext === "agent" &&
  fields.status === "closed" &&
  found.data.author_type === "human"
) {
  return {
    ok: false,
    error:
      "Error: agents cannot set status=closed on human-authored feedback. Only the original author may close it via the review UI.",
  }
}
```

This guard MUST run before the status-enum validation is consumed to apply the transition, and it MUST reject regardless of whether `closed_by` is also present. Paired with the existing `closed_by` guard, the two together are necessary and sufficient to enforce the invariant: every path that writes `status = "closed"` on a human-authored item from an agent context returns an error and performs no mutation.

**Test coverage requirement:** One new test in `feedback.test.mjs`:

> `"MCP update rejects agent setting status=closed on human-authored feedback"` — create a human-authored feedback item via the HTTP path (so `author_type` derives to `"human"`), then call `haiku_feedback_update` with `{ feedback_id, status: "closed" }` from the MCP context, assert the call returns `ok: false` with the expected error, and assert the on-disk file still has `status !== "closed"`.
