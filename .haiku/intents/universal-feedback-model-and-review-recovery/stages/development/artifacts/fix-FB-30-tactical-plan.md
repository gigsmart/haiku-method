# Fix FB-30 — Tactical Plan (planner, bolt 1)

**Finding:** `Tunnel-exposed review/session/revisit endpoints have zero authentication`
**Feedback file:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/30-tunnel-exposed-review-session-revisit-endpoints-have-zero-au.md`

## TL;DR

`buildReviewUrl` (`packages/haiku/src/tunnel.ts:191-209`) mints an HS256 JWT
with a per-session AES-256 key and embeds it in the URL fragment. That is the
right client-side E2E pattern. **But the HTTP server never verifies that JWT
on any route.** Every tunnel-exposed route falls through to its handler based
only on session-existence (`getSession(sessionId)`). Once an attacker learns
the 16-hex-char session id (enumerable at 64 bits, leakable via tunnel access
logs, shared screenshots, browser history, malicious extensions), they can:

1. `GET /api/review/current` with no auth → learn the active intent + stage.
2. `POST /review/{sid}/decide` → forge the reviewer's approve/changes_requested.
3. `POST /api/revisit/{sid}`, `POST /question/{sid}/answer`,
   `POST /direction/{sid}/select` → same pattern, session-existence only.
4. `GET /api/session/{sid}`, `/files/{sid}/*`, `/mockups/{sid}/*`,
   `/wireframe/{sid}/*`, `/stage-artifacts/{sid}/*` → exfiltrate full intent
   state and artifacts.
5. Open `ws://…/ws/session/{sid}` and submit `decide`/`answer`/`select`
   messages through the WebSocket with no auth at all.

The fix is three-part:

1. **Backend:** add a `verifyTunnelJWT(token, sessionId)` helper in
   `tunnel.ts`, then gate every tunnel-reachable route on it when
   `isRemoteReviewEnabled()` is true. Parse the token from
   `Authorization: Bearer <jwt>` (the SPA will attach it from the fragment)
   or, for the same-origin GET routes that embed the token in the URL, from
   a `?t=<jwt>` query parameter. Verify HMAC-SHA256 with `EPHEMERAL_SECRET`,
   check `exp`, `sid === {urlSessionId}`, and `tun === currentTunnelUrl()`.
   Reject with 401 on mismatch.
2. **Frontend (SPA):** on page load, read the JWT out of
   `window.location.hash`, stash it in memory (not localStorage), and thread
   it through a single `authHeader()` helper that the typed `ApiClient` and
   raw `fetch()` call sites both consume. Also append it as a `?t=…` query
   parameter on `<img>` / `<link>` asset URLs served under `/files/*`,
   `/mockups/*`, `/wireframe/*`, `/stage-artifacts/*`, `/question-image/*`
   (those cannot carry custom headers).
3. **WebSocket upgrade:** parse `?t=<jwt>` from the upgrade URL (WebSockets
   cannot carry `Authorization` headers from a browser), verify the same
   way, reject with `HTTP/1.1 401 Unauthorized` on mismatch.

Local-only mode (`HAIKU_REMOTE_REVIEW=0`) keeps every route unauthenticated
— loopback-bound, not exposed. Same pattern FB-20 used for
`X-Haiku-Session-Id`: strict-under-remote, soft-under-local.

Out of scope (see bottom):
- CORS allow-list lockdown (FB-36).
- Session-id entropy bump from 64 to 128 bits (separate finding if filed).
- Token rotation / refresh. 1h TTL from `buildReviewUrl` stays; if the
  tunnel outlives the token, reviewer re-opens the URL.

## Current state (verified against tree)

Verified on 2026-04-21 against the worktree.

### What already exists

- **`tunnel.ts:6` `EPHEMERAL_SECRET = randomBytes(32)`** — module-scope,
  regenerated on every MCP server boot. Fine for single-process runtime.
- **`tunnel.ts:58-72` `signJWT(payload)`** — HS256, `base64url()` helper,
  correct shape. Already exported.
- **`tunnel.ts:191-209` `buildReviewUrl(sessionId, tunnelUrl, sessionType)`**
  — mints a token with `{ tun, sid, typ, key, iat, exp }`, 1h TTL, embeds
  it in `#token` fragment.
- **`tunnel.ts:238-241` `isE2EActive(sessionId)`** — the feedback body
  explicitly notes this is NOT an auth check, it only predicts whether to
  encrypt the response. Correct.
- **`tunnel.ts:185-187` `isRemoteReviewEnabled()`** — single boolean, used
  for CORS gating (`http.ts:334`) and for the `OPTIONS` preflight short-
  circuit (`http.ts:1619`).
- **`tunnel.ts:177-179` `getTunnelUrl()`** — returns the current active
  tunnel URL or null. This is the truth source for the `tun` claim check.

### What's missing

- No `verifyJWT` / `verifyTunnelJWT` function in `tunnel.ts` or anywhere in
  `packages/haiku/src/`. Confirmed:
  `grep -rn "verifyJWT\|checkAuth\|requireAuth\|verifyTunnel" packages/haiku/src/`
  returns zero matches.
- No `Authorization` header parsing in `http.ts`.
- No fragment-to-token reader in the SPA. Confirmed:
  `grep -rn "location.hash\|Authorization\|Bearer" packages/haiku-ui/src/`
  returns zero matches.
- No `?t=` query param logic on asset URLs (`files/*`, `mockups/*`,
  `wireframe/*`, `stage-artifacts/*`, `question-image/*`).

### Tunnel-reachable routes that need gating (from `http.ts:1612-1756`)

Every route below is exposed under the tunnel when `HAIKU_REMOTE_REVIEW=1`:

| Method | Path | Handler | Line | Needs JWT? |
|---|---|---|---|---|
| GET | `/files/:sid/*path` | `handleFileGet` | 1623-1627 | YES (query) |
| GET | `/api/session/:sid` | `handleSessionApi` | 1629-1633 | YES (header) |
| HEAD | `/api/session/:sid/heartbeat` | inline | 1635-1640 | YES (header) |
| GET | `/review/current` | `serveSpa` | 1642-1645 | NO (SPA shell) |
| GET | `/review/:sid` | `handleReviewGet` → `serveSpa` | 1647-1651 | NO (SPA shell, token is in fragment) |
| POST | `/review/:sid/decide` | `handleDecidePost` | 1653-1657 | YES (header) |
| GET | `/mockups/:sid/:path` | `handleMockupGet` | 1659-1663 | YES (query) |
| GET | `/wireframe/:sid/:path` | `handleWireframeGet` | 1665-1669 | YES (query) |
| GET | `/stage-artifacts/:sid/:path` | `handleStageArtifactGet` | 1671-1675 | YES (query) |
| GET | `/direction/:sid` | `handleDirectionGet` → `serveSpa` | 1677-1681 | NO (SPA shell) |
| POST | `/direction/:sid/select` | `handleDirectionSelectPost` | 1683-1687 | YES (header) |
| GET | `/question-image/:sid/:idx` | `handleQuestionImageGet` | 1689-1696 | YES (query) |
| GET | `/question/:sid` | `handleQuestionGet` → `serveSpa` | 1698-1702 | NO (SPA shell) |
| POST | `/question/:sid/answer` | `handleQuestionAnswerPost` | 1704-1708 | YES (header) |
| GET | `/api/review/current` | `handleReviewCurrent` | 1710-1714 | SPECIAL (no sid in path — gate on presence of valid token, no `sid` match) |
| POST | `/api/revisit/:sid` | `handleRevisitPost` | 1716-1720 | YES (header) |
| GET | `/api/feedback/:intent/:stage` | `handleFeedbackGet` | 1725-1728 | YES (header, intent-scoped) |
| POST/PUT/DELETE | `/api/feedback/*` | FB-20 already gates on `X-Haiku-Session-Id` | 1730-1756 | ALREADY GATED by FB-20 — but FB-20 does not verify the token, so add JWT on top |
| GET | `/health` | tunnel keepalive | 1758-1761 | NO (must stay open for health-check) |
| UPGRADE | `/ws/session/:sid` | `handleUpgrade` | `http.ts:908-951` | YES (query) |

**SPA-shell routes** (`/review/:sid`, `/direction/:sid`, `/question/:sid`,
`/review/current`) serve the static HTML that the browser uses to extract
the fragment. The token isn't available yet at this point (the fragment is
client-only, the server never sees it). Gating these is both impossible and
wrong. The subsequent `/api/session/:sid` call is the first place the SPA
*can* present the token, so the data exposure is behind that gate.

### E2E encryption wrapper

`withE2E(response, sessionId)` (`http.ts:372-420`) runs *after* the route
handler returns. It only encrypts 2xx responses; 401s remain plaintext. That
is correct — the attacker learns nothing from a 401 body. But we MUST be
careful that the JWT verification runs *before* the handler, not inside
`withE2E`, so bad tokens get a clean 401 without triggering session state
reads.

### Test coverage

- No JWT verification tests exist. Search:
  `grep -rn "signJWT\|verifyJWT" packages/haiku/test/` → zero matches.
- Need a new test file `packages/haiku/test/tunnel-auth.test.mjs` (or an
  extension to `external-review.test.mjs`) covering every verb × every
  route-class in remote mode.

## Implementation steps (for the builder bolt)

### Step 1 — Backend: add `verifyTunnelJWT` to `tunnel.ts`

File: `packages/haiku/src/tunnel.ts`.

1.1 Add a verification function next to `signJWT`:

```ts
export type TunnelJWTPayload = {
    tun: string
    sid: string
    typ: string
    key: string
    iat: number
    exp: number
}

export type VerifyResult =
    | { ok: true; payload: TunnelJWTPayload }
    | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "tunnel_mismatch" | "sid_mismatch" }

/**
 * Verify a tunnel JWT. Constant-time signature comparison, exp check,
 * optional sid / tun binding.
 *
 * Callers:
 *   - HTTP routes: pass the URL's `sid` so a token for session A can't be
 *     replayed against a URL for session B.
 *   - `/api/review/current`: pass `sid = null` to skip the sid check (this
 *     route has no session in the path, but the token must still be valid
 *     and bound to the current tunnel).
 */
export function verifyTunnelJWT(
    token: string,
    expectedSid: string | null,
): VerifyResult {
    const parts = token.split(".")
    if (parts.length !== 3) return { ok: false, reason: "malformed" }
    const [header, body, sig] = parts

    const expected = createHmac("sha256", EPHEMERAL_SECRET)
        .update(`${header}.${body}`)
        .digest("base64url")

    // Constant-time compare. Buffer.from may throw on malformed base64; guard.
    let sigBuf: Buffer
    let expBuf: Buffer
    try {
        sigBuf = Buffer.from(sig, "base64url")
        expBuf = Buffer.from(expected, "base64url")
    } catch {
        return { ok: false, reason: "malformed" }
    }
    if (sigBuf.length !== expBuf.length) return { ok: false, reason: "bad_signature" }
    if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: "bad_signature" }

    let payload: TunnelJWTPayload
    try {
        const json = Buffer.from(body, "base64url").toString("utf-8")
        payload = JSON.parse(json) as TunnelJWTPayload
    } catch {
        return { ok: false, reason: "malformed" }
    }

    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== "number" || payload.exp <= now) {
        return { ok: false, reason: "expired" }
    }

    // Bind to current active tunnel. getTunnelUrl() returns null if the
    // tunnel has rotated — reject rather than accept a stale token.
    const currentTunnel = getTunnelUrl()
    if (!currentTunnel || payload.tun !== currentTunnel) {
        return { ok: false, reason: "tunnel_mismatch" }
    }

    if (expectedSid !== null && payload.sid !== expectedSid) {
        return { ok: false, reason: "sid_mismatch" }
    }

    return { ok: true, payload }
}
```

1.2 Add imports at the top: `timingSafeEqual` from `node:crypto` (extend
the existing `import { createCipheriv, createHmac, randomBytes } from "node:crypto"`
line).

### Step 2 — Backend: extract-token helper in `http.ts`

File: `packages/haiku/src/http.ts`.

2.1 Add a helper near `extractSessionId` (around L359):

```ts
/**
 * Extract tunnel-auth token from a request.
 * Order of precedence:
 *   1. Authorization: Bearer <jwt>
 *   2. ?t=<jwt> query parameter (for asset URLs that can't attach headers)
 */
function extractTunnelToken(req: Request): string | null {
    const authz = req.headers.get("authorization")
    if (authz) {
        const m = authz.match(/^Bearer\s+(.+)$/i)
        if (m) return m[1].trim()
    }
    const url = new URL(req.url)
    const t = url.searchParams.get("t")
    return t?.trim() || null
}
```

2.2 Add a gate helper that returns either `{ ok: true }` or a 401 Response.
Consumers wrap their handlers with it. Place next to
`verifyFeedbackMutationAuth` (around L1352):

```ts
/**
 * Enforce JWT auth on tunnel-reachable routes.
 *
 * - When remote review is OFF (local-only MCP / loopback): no-op. Caller
 *   proceeds.
 * - When remote review is ON: token MUST be present and must verify
 *   against `EPHEMERAL_SECRET`, must not be expired, must bind to the
 *   current tunnel URL, and (when `expectedSid` is provided) must match.
 *
 * Response body is deliberately minimal — no session content leaks on a
 * failed auth.
 */
function requireTunnelAuth(
    req: Request,
    expectedSid: string | null,
): { ok: true } | { ok: false; response: Response } {
    if (!isRemoteReviewEnabled()) return { ok: true }
    const token = extractTunnelToken(req)
    if (!token) {
        return {
            ok: false,
            response: Response.json(
                { error: "unauthorized", reason: "missing_token" },
                { status: 401 },
            ),
        }
    }
    const result = verifyTunnelJWT(token, expectedSid)
    if (!result.ok) {
        return {
            ok: false,
            response: Response.json(
                { error: "unauthorized", reason: result.reason },
                { status: 401 },
            ),
        }
    }
    return { ok: true }
}
```

2.3 Import `verifyTunnelJWT` at the top of `http.ts` — extend the existing
`import { e2eEncrypt, isE2EActive, isRemoteReviewEnabled } from "./tunnel.js"`
(L64) to add `verifyTunnelJWT`.

### Step 3 — Backend: gate every tunnel-reachable route

File: `packages/haiku/src/http.ts`, inside `handleRequest` (L1612-1763).

The pattern for every gated route (drop in at the top of each matching
branch, right after the match, before calling the handler):

```ts
const reviewMatch = path.match(/^\/review\/([^/]+)$/)
if (reviewMatch && req.method === "GET") {
    return handleReviewGet(reviewMatch[1])
    // ^ SPA-shell: NO gate. Token isn't available yet; the SPA reads the
    //   fragment and gates subsequent API calls.
}

// ...

const decideMatch = path.match(/^\/review\/([^/]+)\/decide$/)
if (decideMatch && req.method === "POST") {
    const auth = requireTunnelAuth(req, decideMatch[1])
    if (!auth.ok) return auth.response
    return handleDecidePost(decideMatch[1], req)
}
```

Apply this to every YES row in the table above. Routes that take
`(sessionId, path)` pass `sid` as `expectedSid`. `/api/review/current`
passes `null`.

**Routes getting the gate** (re-verify exact line numbers before editing —
see parallel-chain warning below):

- `/files/:sid/*path` (L1624-1627) — query token
- `/api/session/:sid` (L1630-1633) — header token
- `/api/session/:sid/heartbeat` (L1636-1640) — header token (HEAD)
- `/review/:sid/decide` (L1653-1657) — header token
- `/mockups/:sid/:path` (L1660-1663) — query token
- `/wireframe/:sid/:path` (L1666-1669) — query token
- `/stage-artifacts/:sid/:path` (L1672-1675) — query token
- `/direction/:sid/select` (L1684-1687) — header token
- `/question-image/:sid/:idx` (L1690-1696) — query token
- `/question/:sid/answer` (L1705-1708) — header token
- `/api/review/current` (L1712-1714) — header token, `expectedSid = null`
- `/api/revisit/:sid` (L1717-1720) — header token
- `/api/feedback/:intent/:stage` GET + POST + PUT + DELETE (L1725-1756) —
  header token. Gate runs *before* `verifyFeedbackMutationAuth` (FB-20).
  FB-20's `X-Haiku-Session-Id` check is a separate, narrower guard
  (intent-scope binding); JWT is the authentication layer, FB-20 is
  cross-session authorization.

**Routes NOT getting the gate** (SPA shells + health):

- `/review/:sid` (L1648-1651) — serves HTML shell.
- `/direction/:sid` (L1678-1681) — serves HTML shell.
- `/question/:sid` (L1699-1702) — serves HTML shell.
- `/review/current` (L1643-1645) — serves HTML shell.
- `/health` (L1759-1761) — MUST stay open for tunnel keepalive
  (`tunnel.ts:22-35`).

### Step 4 — Backend: gate WebSocket upgrades

File: `packages/haiku/src/http.ts`, inside `handleUpgrade` (L908-951).

4.1 After the `getSession(sessionId)` check (L926-931) and before computing
`Sec-WebSocket-Accept` (L941), add:

```ts
if (isRemoteReviewEnabled()) {
    const token = url.searchParams.get("t")?.trim()
    if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
        socket.destroy()
        return
    }
    const result = verifyTunnelJWT(token, sessionId)
    if (!result.ok) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
        socket.destroy()
        return
    }
}
```

Browsers cannot set custom headers on the WebSocket upgrade, so the token
rides in the query string (same shape as asset URLs).

### Step 5 — Frontend: read and stash the JWT

File: `packages/haiku-ui/src/api/auth.ts` (new).

5.1 Create a tiny module that reads `window.location.hash` once, parses the
token, and exposes it to the rest of the SPA. In-memory only (not
localStorage — token is 1h, should not persist across reloads).

```ts
// Read-once auth token extracted from the review URL fragment.
// The server mints this JWT in tunnel.ts `buildReviewUrl()` and embeds it
// as `#<jwt>` on navigation. The SPA pulls it out on first load and never
// writes it anywhere persistent.

let token: string | null = null

function readFromHash(): string | null {
    if (typeof window === "undefined") return null
    const hash = window.location.hash
    if (!hash || hash.length < 2) return null
    const raw = hash.startsWith("#") ? hash.slice(1) : hash
    // JWTs are header.body.signature — three base64url segments.
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return null
    return raw
}

export function getAuthToken(): string | null {
    if (token === null) token = readFromHash()
    return token
}

export function authHeader(): Record<string, string> {
    const t = getAuthToken()
    return t ? { Authorization: `Bearer ${t}` } : {}
}

export function authQuery(): string {
    const t = getAuthToken()
    return t ? `t=${encodeURIComponent(t)}` : ""
}

// Test-only hook: let vitest inject a token without touching window.
export function __setAuthTokenForTesting(value: string | null): void {
    token = value
}
```

### Step 6 — Frontend: wire authHeader into the typed client

File: `packages/haiku-ui/src/api/client.ts`.

6.1 Import `authHeader` at the top:

```ts
import { authHeader } from "./auth"
```

6.2 Merge `authHeader()` into every JSON-headed fetch. The existing
`JSON_HEADERS` and `FETCH_HEADERS` constants already exist (see FB-20
plan). Add a `withAuth()` helper and swap each call site:

```ts
function withAuth(headers: Record<string, string>): Record<string, string> {
    return { ...headers, ...authHeader() }
}
```

Then replace every literal `{ ...JSON_HEADERS }` / `{ ...FETCH_HEADERS }`
in the method bodies with `withAuth(JSON_HEADERS)` / `withAuth(FETCH_HEADERS)`.
Routes covered:

- `session.get`, `session.heartbeat`
- `review.current`, `review.decide`, `revisit.post`
- `question.answer`, `direction.select`
- `feedback.list/create/update/delete` (already headed with session-id
  from FB-20; now also JWT)

**Parallel-chain note for FB-20:** FB-20's `sessionHeader()` helper merges
in `X-Haiku-Session-Id`; this FB-30 change adds `Authorization`. Both must
land without clobbering each other. The resulting per-call headers become:

```ts
{ ...JSON_HEADERS, ...sessionHeader(sessionId), ...authHeader() }
```

Order does not matter (no key collision), but read the file before writing
— the first of the two fixes to land shapes the literal.

### Step 7 — Frontend: append `?t=…` to asset URLs

The following paths serve bytes the server will refuse to encrypt
(E2E wrap is header-level only when the response is a Response object;
asset bodies go through `withE2E` but the *request* side has no headers
from an `<img>` tag). These need the token in the query string:

- `/files/:sid/*path`
- `/mockups/:sid/:path`
- `/wireframe/:sid/:path`
- `/stage-artifacts/:sid/:path`
- `/question-image/:sid/:idx`

7.1 Add a `withAuthQuery(url: string): string` helper to `auth.ts` (Step 5):

```ts
export function withAuthQuery(url: string): string {
    const q = authQuery()
    if (!q) return url
    return url.includes("?") ? `${url}&${q}` : `${url}?${q}`
}
```

7.2 Grep for every place the SPA builds one of the asset URLs above and
wrap it in `withAuthQuery(...)`:

```bash
grep -rn "/files/\|/mockups/\|/wireframe/\|/stage-artifacts/\|/question-image/" \
  packages/haiku-ui/src/
```

Expected hit sites (verify before editing):
- `packages/haiku-ui/src/pages/review/*.tsx` — intent artifacts rendered
  from `/files/*` and `/stage-artifacts/*`.
- `packages/haiku-ui/src/pages/question/*.tsx` — question images.
- `packages/haiku-ui/src/pages/direction/*.tsx` — mockup / wireframe
  preview images.
- Any `path.ts` / `paths.ts` helper module that centralizes URL building
  (preferred edit location — one place, many callers).

### Step 8 — Frontend: WebSocket URL

File: wherever the SPA opens `ws://…/ws/session/:sid`.

8.1 Grep:

```bash
grep -rn "/ws/session/\|WebSocket(" packages/haiku-ui/src/
```

8.2 Append `?t=…` at connection time:

```ts
const token = getAuthToken()
const url = token
    ? `${base}/ws/session/${sid}?t=${encodeURIComponent(token)}`
    : `${base}/ws/session/${sid}`
const ws = new WebSocket(url)
```

### Step 9 — Backend test: lock in the gate

File: `packages/haiku/test/tunnel-auth.test.mjs` (new).

9.1 Structure: one `describe` per route class. Each test enables
`HAIKU_REMOTE_REVIEW=1`, opens a real session, mints a JWT via the real
`buildReviewUrl()` (or by calling `signJWT` with synthetic claims for
negative tests), and asserts:

- No token → 401 (`reason: "missing_token"`).
- Malformed token (two dots but bad base64) → 401 (`reason: "malformed"`).
- Valid-shape but wrong HMAC → 401 (`reason: "bad_signature"`).
- Expired token (`exp < now`) → 401 (`reason: "expired"`).
- Token for session A used against URL for session B → 401
  (`reason: "sid_mismatch"`).
- Valid token → 200 (or 404 for a known-empty session, but NOT 401).

Cover one representative route per class:

- Header-token JSON API: `/api/session/:sid`, `/api/review/current`,
  `/api/revisit/:sid`, `/review/:sid/decide`, `/question/:sid/answer`,
  `/direction/:sid/select`, `/api/feedback/:intent/:stage` (GET + POST).
- Query-token asset: `/files/:sid/*`, `/mockups/:sid/:path`,
  `/stage-artifacts/:sid/:path`, `/question-image/:sid/:idx`.
- WebSocket upgrade: open `/ws/session/:sid` with `?t=` → expect 101 on
  valid, 401 on invalid.

9.2 Restore env (delete `HAIKU_REMOTE_REVIEW` if previously unset).
`config.ts` may cache — if so, add a test-only setter per the FB-20 plan
(same risk applies here). Verify `config.ts` handling before writing tests.

### Step 10 — Verify

Run from repo root:

```bash
# Backend
cd packages/haiku && npx tsx test/run-all.mjs
# at minimum:
cd packages/haiku && npx tsx test/tunnel-auth.test.mjs
cd packages/haiku && npx tsx test/http-feedback.test.mjs
cd packages/haiku && npx tsx test/external-review.test.mjs

# Frontend
cd packages/haiku-ui && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Targeted greps to ensure the fix did not drift:

```bash
# (a) verifyTunnelJWT is called from the http layer
grep -n "verifyTunnelJWT\|requireTunnelAuth" packages/haiku/src/http.ts
# must appear inside handleRequest (at least ~14 call sites) and handleUpgrade

# (b) every tunnel-exposed route branch is gated in remote mode
grep -n "requireTunnelAuth" packages/haiku/src/http.ts | wc -l
# expected: at least 14 (one per YES row in the routes table above)

# (c) SPA reads the token from the fragment
grep -n "authHeader\|getAuthToken" packages/haiku-ui/src/api/client.ts
# must appear

# (d) asset URLs carry ?t=
grep -n "withAuthQuery\|authQuery" packages/haiku-ui/src/
# must appear at every /files, /mockups, /wireframe, /stage-artifacts, /question-image site
```

All four checks must pass. Feedback-assessor will re-check on bolt 3.

## Files the builder will modify

1. `packages/haiku/src/tunnel.ts`:
   - Add `timingSafeEqual` to the `node:crypto` import.
   - Export `TunnelJWTPayload`, `VerifyResult`, `verifyTunnelJWT`.
2. `packages/haiku/src/http.ts`:
   - Extend the `./tunnel.js` import to include `verifyTunnelJWT`.
   - Add `extractTunnelToken(req)` helper (~L359).
   - Add `requireTunnelAuth(req, sid)` helper (~L1340, next to
     `verifyFeedbackMutationAuth`).
   - Gate every YES row in `handleRequest` (14 routes, L1624-1756).
   - Gate `handleUpgrade` WebSocket upgrade on `?t=` (L908-951).
3. `packages/haiku-ui/src/api/auth.ts` (new):
   - `getAuthToken()`, `authHeader()`, `authQuery()`, `withAuthQuery(url)`,
     `__setAuthTokenForTesting(value)`.
4. `packages/haiku-ui/src/api/client.ts`:
   - Import `authHeader` from `./auth`.
   - Add `withAuth(headers)` helper or inline-merge at each call site.
   - Ensure every JSON/FETCH header set includes `...authHeader()`.
5. Asset-URL call sites in `packages/haiku-ui/src/`:
   - Wrap every URL that points at `/files`, `/mockups`, `/wireframe`,
     `/stage-artifacts`, `/question-image` with `withAuthQuery(...)`.
   - Preferred single edit: a shared `paths.ts` helper if one exists.
6. WebSocket connect site(s):
   - Append `?t=<token>` to the `ws://` URL.
7. `packages/haiku/test/tunnel-auth.test.mjs` (new):
   - ~6-8 tests covering every failure reason + positive case across route
     classes.

## Risks

- **Parallel-chain clobber on `packages/haiku/src/http.ts`.** FB-20, FB-36,
  and FB-44 are in the same batch and touch this file.
  - FB-20: L332-357 (CORS) + L1342-1387 (feedback mutation guard) +
    feedback POST/PUT/DELETE branches.
  - FB-30 (this fix): ~L359 (new `extractTunnelToken`), ~L1340 (new
    `requireTunnelAuth`), every YES row in `handleRequest` L1624-1756,
    `handleUpgrade` L908-951.
  - FB-36: CORS `*` → allow-list, likely L336 (`Access-Control-Allow-Origin`).
  - FB-44: unit-numbering — unlikely overlap.
  **Protocol:** read the file immediately before writing. Reuse whichever
  helper landed first (e.g. if FB-20 already added `sessionHeader()` at
  the import site, don't duplicate).
- **Parallel-chain clobber on `packages/haiku-ui/src/api/client.ts`.**
  FB-20 adds `sessionHeader()`; FB-30 adds `authHeader()`. Both merge
  into the same per-call `headers`. Order of merge doesn't matter, but
  both must land. Read before write.
- **`EPHEMERAL_SECRET` rotation.** The secret is `randomBytes(32)` at
  module init (`tunnel.ts:6`). If the MCP server restarts mid-review,
  the reviewer's existing token becomes invalid (bad_signature). Today
  the tunnel also tears down on restart, so the reviewer has to re-open
  the URL anyway — the symptom is the same. No new regression. Consider
  documenting in the tunnel module docstring.
- **Tunnel URL rotation.** `verifyTunnelJWT` checks
  `payload.tun === getTunnelUrl()`. The tunnel auto-reconnects on
  failure (`tunnel.ts:74-104`), and localtunnel assigns a new URL on
  reconnect. Any in-flight reviewer tokens become `tunnel_mismatch` 401s.
  Same symptom pre-fix (the URL also changed), but now explicit. Acceptable
  — the reviewer sees a clean 401, the operator sees the new URL.
- **`EPHEMERAL_SECRET` timing-leak.** Using `timingSafeEqual` on the HMAC
  bytes is the right mitigation. Do NOT use `===` for signature comparison
  under any circumstances.
- **Test config caching.** `config.ts` may cache `HAIKU_REMOTE_REVIEW` at
  module init. Same risk flagged in FB-20 plan. Verify `config.ts` before
  writing tests; prefer a test-only setter over `process.env` mutation.
- **`/api/review/current` without a session.** The route has no `:sid` in
  the path. Accepting `expectedSid = null` keeps a valid token authorized
  for read-only current-state access but means any valid token (for any
  open review session) can read this endpoint. That is weaker than
  per-session gating but stronger than today's "no gate at all". Acceptable
  for v1; file a follow-up if scope needs tightening.
- **Asset URLs and browser cache.** `<img src="/files/{sid}/…?t=<jwt>">`
  leaks the token into the browser's disk cache and HTTP access logs.
  That is the same surface as today's fragment (browser history), so
  not a new regression, but the builder should confirm that Cache-Control
  on asset responses is `private` or `no-store`. If not, a follow-up
  finding is warranted.
- **WebSocket cross-origin connections.** Browsers do not send `Origin`
  checks on WS by default, and this change doesn't add one. Combined with
  FB-36 (CORS `*` for HTTP), a cross-origin attacker with a stolen JWT
  can still connect. JWT verification is the authentication layer — if
  the token is stolen, the attacker is authenticated. Token-theft
  mitigations (short TTL, fragment not body, no logging) are already in
  place. Not in scope to tighten further here.

## Out of scope

- **CORS allow-list lockdown** (FB-36 tracks this). This fix keeps
  `Access-Control-Allow-Origin: *`; JWT verification is the independent
  auth layer.
- **Session-id entropy bump** from 64 to 128 bits (not filed that I can
  see; separate finding if so). 64 bits is enumerable at sustained rate
  — JWT verification masks this because the attacker also needs a valid
  token, but the id itself is still the session lookup key.
- **Token refresh / rotation.** TTL stays 1h; reviewer re-opens the URL
  on expiry.
- **Persisting the token across SPA reloads.** In-memory only. A hard
  reload (reviewer hits F5) wipes the token but the URL fragment is
  re-read on the next load, so the UX is unaffected.
- **Token binding to client IP or User-Agent.** Reviewer may be on a
  phone hotspot, IP hops are common. Not binding avoids false 401s.
- **Modifying `components/ReviewPage.tsx`** beyond header-merge changes
  in call sites it already makes. That file is a monolith (FB-22);
  minimize diff.

## Done when

- `verifyTunnelJWT(token, expectedSid)` exists in `tunnel.ts` and is
  exported.
- `requireTunnelAuth(req, expectedSid)` in `http.ts` returns 401 on
  missing / malformed / bad-signature / expired / tunnel-mismatch /
  sid-mismatch tokens when `isRemoteReviewEnabled()` is true, and is a
  no-op when false.
- Every tunnel-reachable route in the routes table above (14 HTTP routes
  + WebSocket upgrade) calls `requireTunnelAuth` before dispatching to
  its handler.
- SPA reads the JWT from `window.location.hash` once, in memory.
- `ApiClient` attaches `Authorization: Bearer <jwt>` to every mutating
  and every session-scoped call.
- Asset URLs (`/files`, `/mockups`, `/wireframe`, `/stage-artifacts`,
  `/question-image`) carry `?t=<jwt>`.
- WebSocket URL carries `?t=<jwt>`.
- New `tunnel-auth.test.mjs` covers every 401 reason + positive case
  across header-token, query-token, and WebSocket route classes.
- `npx tsc --noEmit` (both packages) and both test suites exit 0.
- Feedback-assessor marks FB-30 resolved on bolt 3.
