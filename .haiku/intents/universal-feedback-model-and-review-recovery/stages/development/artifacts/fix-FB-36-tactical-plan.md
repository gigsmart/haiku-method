# Fix FB-36 — Tactical Plan (planner, bolt 1)

**Finding:** `withCors` in `packages/haiku/src/http.ts:332-357` emits
`Access-Control-Allow-Origin: *` on every response when remote review is
enabled. Combined with the fail-open auth on mutating endpoints (see FB-30 /
FB-20 — tunnel-exposed `/review/{sid}/decide`, `/api/revisit/{sid}`,
`/api/feedback/*`), `*` lets any origin the reviewer's browser visits issue
cross-origin mutations silently. The `OPTIONS` handler at `http.ts:1619-1621`
returns a bare `204` with no origin check, so preflight is also wide open.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/36-cors-access-control-allow-origin-on-tunnel-mode-enables-cros.md`

## Root cause

The `withCors` helper was written for the simple case ("allow the SPA to fetch
the local tunnel") and took the lazy shortcut of `*`. Remote review is off by
default (`HAIKU_REMOTE_REVIEW=false`), so this was dormant until tunneling
landed. The moment `isRemoteReviewEnabled()` is true, the process exposes
mutating endpoints to the entire public web — any site the reviewer opens in a
second tab can `fetch('https://tunnel.example/review/{sid}/decide', {method:
'POST', body: ...})` and the browser will attach the request because `Origin:
*` does not force credential-mode, and none of the endpoints require
credentials in the first place.

Two independent defects need fixing together:

1. **`withCors` emits `*` unconditionally.** Must become origin-checked:
   validate `Origin` against an allow-list; echo the matched value back; do
   not echo anything for non-matches (absent header blocks the cross-origin
   read in browsers).
2. **Preflight at `http.ts:1619` returns `204` with no origin check.** The
   network-layer then wraps it with `withCors`, which previously slapped `*`
   on. Once `withCors` is origin-checked, the bare 204 is acceptable — but the
   handler should also reject preflight for disallowed methods up front, to
   avoid leaking "the endpoint exists" via a successful preflight. (Minor;
   lower priority than the header fix.)

There is already a canonical pattern in this repo:
`deploy/auth-proxy/src/index.ts:10-28` defines `ALLOWED_ORIGINS` as a
comma-split env var with an `isOriginAllowed(origin)` check and a
`corsHeaders(origin)` builder that echoes back only on match. The MCP server
should adopt the same shape so ops staff only need to learn one CORS mental
model.

## Fix approach (planner-scope only — no code edits)

The builder (bolt 2) will:

1. **Add an allow-list in `packages/haiku/src/config.ts`.** Extend the
   `review` config block with:
   ```ts
   export const review = {
     siteUrl: str("HAIKU_REVIEW_SITE_URL", "https://haikumethod.ai"),
     /**
      * Comma-separated list of origins permitted to make cross-origin
      * requests to the MCP server when remote review is enabled. Defaults to
      * the configured siteUrl. Set `HAIKU_REVIEW_ALLOWED_ORIGINS` to a CSV
      * to allow additional origins (e.g. a staging site). Never set to `*`
      * on a server that accepts mutating requests without authentication.
      */
     allowedOrigins: str("HAIKU_REVIEW_ALLOWED_ORIGINS", "")
       .split(",")
       .map((o) => o.trim())
       .filter(Boolean),
   }
   ```
   If `HAIKU_REVIEW_ALLOWED_ORIGINS` is empty, the effective allow-list is
   `[siteUrl]`. This keeps the common single-origin path zero-config.

2. **Rewrite `withCors` in `packages/haiku/src/http.ts`** to take the request
   (or just the `Origin` header) as a second argument and only echo back the
   origin on match. New signature:
   ```ts
   function withCors(response: Response, requestOrigin: string | null): Response {
     if (!isRemoteReviewEnabled()) return response
     const headers = new Headers(response.headers)
     // Vary: Origin so shared caches do not leak one origin's response to another.
     headers.append("Vary", "Origin")
     const allowed = resolveAllowedCorsOrigin(requestOrigin)
     if (allowed) {
       headers.set("Access-Control-Allow-Origin", allowed)
       headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
       headers.set(
         "Access-Control-Allow-Headers",
         "Content-Type, bypass-tunnel-reminder",
       )
       headers.set(
         "Access-Control-Expose-Headers",
         "X-E2E-Encrypted, X-Original-Content-Type",
       )
     }
     // If not allowed: no ACAO / ACAM / ACAH / ACEH headers at all. The browser
     // will block cross-origin reads. Same-origin (reviewer loading via the
     // tunnel URL directly) continues to work because the browser does not
     // enforce CORS on same-origin requests.
     return new Response(response.body, {
       status: response.status,
       statusText: response.statusText,
       headers,
     })
   }

   function resolveAllowedCorsOrigin(origin: string | null): string | null {
     if (!origin) return null
     const allowList = review.allowedOrigins.length
       ? review.allowedOrigins
       : [review.siteUrl]
     // Exact string match — do not do substring/prefix checks (subdomain
     // takeover / suffix bypass risk). The reviewer always arrives from
     // siteUrl exactly, so exact match is correct.
     return allowList.includes(origin) ? origin : null
   }
   ```
   Notes:
   - `Vary: Origin` is required so CDNs/proxies do not cache the response
     against origin A and serve it to origin B.
   - Never emit `*`. If the allow-list has `*` in it, treat that as a
     configuration error (log a single warning at startup; do not honor it).
     See step 5.
   - Absent `Access-Control-Allow-Origin` is the correct response for a
     disallowed origin — not `""` and not `null`. Setting it to empty string
     is a known Chrome inconsistency; omit the header entirely.

3. **Update the two `withCors(...)` call sites** at `http.ts:1896` (server
   network-layer wrapper) to pass the request's `Origin` header:
   ```ts
   const requestOrigin = webRequest.headers.get("origin")
   webResponse = await withE2E(withCors(webResponse, requestOrigin), sessionId)
   ```
   The variable is already in scope (`webRequest` is defined at `http.ts:1886`).

4. **Tighten the preflight handler at `http.ts:1619-1621`.** Replace the bare
   204 with an origin-checked 204:
   ```ts
   if (req.method === "OPTIONS" && isRemoteReviewEnabled()) {
     // Preflight — 204 with no body. The network-layer withCors applies the
     // allow-origin / allow-methods / allow-headers on the way out, using the
     // request's Origin. If the origin is not allow-listed, withCors emits
     // no CORS headers and the browser blocks the real request.
     return new Response(null, { status: 204 })
   }
   ```
   The code stays the same — the behavior changes entirely because `withCors`
   now gates headers on origin. Add a comment block above this block
   explaining why the 204 itself is safe (no body = no leak; browser will
   block the real request when ACAO is missing).

5. **Startup warning for misconfiguration.** In `config.ts` (or wherever the
   remote-review bootstrap lives — check `server.ts:630/779/986` where
   `isRemoteReviewEnabled()` is read), emit `console.warn` once at startup
   if `review.allowedOrigins.includes("*")`:
   ```
   [haiku] WARN: HAIKU_REVIEW_ALLOWED_ORIGINS contains "*". Ignoring — wildcard CORS is unsafe with this server's auth model. Set an explicit allow-list.
   ```
   Then strip the `"*"` entry from the effective list. This is defense in
   depth against an operator copy-pasting the old behavior back in.

6. **Never emit `Access-Control-Allow-Credentials: true`.** Current code
   already does not — the fix must preserve that absence. Emitting
   credentials:true combined with an echoed origin would re-enable
   cookie-carrying cross-origin requests. The whole model assumes the
   reviewer's session lives in URL tokens (JWT in URL hash), not in cookies.
   Add an inline comment in `withCors` stating this invariant.

## Files to modify

1. **`packages/haiku/src/config.ts`** — add `allowedOrigins` to the `review`
   config block (new env var `HAIKU_REVIEW_ALLOWED_ORIGINS`, CSV, defaults to
   empty so the fallback `[siteUrl]` applies).

2. **`packages/haiku/src/http.ts`**
   - Import `review` from `./config.js` if not already (currently it is not
     imported in http.ts — verify with the file; if the `review.siteUrl` is
     referenced only inside `tunnel.ts`, add the import).
   - Rewrite `withCors(response)` → `withCors(response, requestOrigin)` per
     §2 above. Add `resolveAllowedCorsOrigin(origin)` helper above it.
   - Update the call site at `http.ts:1896` to pass
     `webRequest.headers.get("origin")`.
   - Update the comment block above the `OPTIONS` handler at `1616-1621` to
     document that the 204 is safe because `withCors` now gates headers on
     origin.
   - Add inline comment stating "never emit
     `Access-Control-Allow-Credentials: true` — credentials cannot ride this
     origin".

3. **`packages/haiku/src/server.ts`** (optional, only if the bootstrap
   warning in step 5 lives here — search for where `isRemoteReviewEnabled()`
   is first checked at startup, around line 630/779/986). Add the
   startup-time warn-and-strip of `"*"` from `review.allowedOrigins`.

4. **Tests — new file:
   `packages/haiku/src/__tests__/http.cors.test.ts`** (or whatever layout the
   existing http tests use — check `Glob` for `packages/haiku/**/*.test.ts`
   first; if there is no established http test file, create the test next to
   `http.ts`):
   - `withCors` returns response unchanged when `isRemoteReviewEnabled()` is
     false (feature flag guard).
   - `withCors` with `HAIKU_REMOTE_REVIEW=1` and `Origin: https://haikumethod.ai`
     sets `Access-Control-Allow-Origin: https://haikumethod.ai` and appends
     `Vary: Origin` (single Vary entry).
   - `withCors` with `Origin: https://evil.example` does NOT set ACAO /
     ACAM / ACAH / ACEH. The response still carries `Vary: Origin` (for cache
     safety) but none of the other CORS headers.
   - `withCors` with no `Origin` header (same-origin request) does NOT set
     ACAO. Safe because same-origin does not require CORS headers.
   - With `HAIKU_REVIEW_ALLOWED_ORIGINS=https://a.example,https://b.example`,
     both a and b are echoed back; evil.example is not.
   - `HAIKU_REVIEW_ALLOWED_ORIGINS` containing `*` is warned about at startup
     (capture `console.warn`) and the `*` entry is stripped from the effective
     list — so `Origin: https://evil.example` is still rejected.
   - Preflight path (method=OPTIONS) returns 204 with ACAO set when the
     origin matches, and 204 with no ACAO (so browser blocks the real
     request) when it does not. Regression guard for the bare-204 + `*`
     combination that was the root bug.

5. **Documentation —
   `website/content/docs/*` and/or `README.md`** (discover with Glob for
   `HAIKU_REVIEW_SITE_URL`): add a one-line entry for
   `HAIKU_REVIEW_ALLOWED_ORIGINS` describing the default behavior (empty →
   `[siteUrl]`), acceptable values (CSV of explicit origins), and the
   prohibition on `*`. Skip if the scope is strictly code-only; the finding
   does not mandate docs.

## Implementation steps (for the builder in bolt 2)

1. Read `packages/haiku/src/http.ts` fresh (parallel-batch warning — another
   chain may have edited the CORS block). Verify lines 332-357 and
   1619-1621 still match what the feedback body claims before editing.
2. Edit `packages/haiku/src/config.ts`: add `allowedOrigins` field to the
   `review` export. Make sure `str("HAIKU_REVIEW_ALLOWED_ORIGINS", "")` is
   split/trim/filter-Boolean-ed so empty string becomes `[]`, not `[""]`.
3. Edit `packages/haiku/src/http.ts`:
   a. Add `import { review } from "./config.js"` if not already imported.
   b. Replace the `withCors` body with the two-argument variant per §2 above.
   c. Add the `resolveAllowedCorsOrigin` helper just above `withCors`.
   d. Update the call site at the network-layer wrapper to read
      `webRequest.headers.get("origin")` and pass it through.
   e. Update the comment block above the OPTIONS handler at `1616-1621`.
4. (Optional — server.ts) Add startup warn-and-strip of `*` from
   `review.allowedOrigins`. If you skip this, at minimum document in the
   config.ts JSDoc that `*` is ignored at runtime.
5. Write `packages/haiku/src/__tests__/http.cors.test.ts` (or the
   project's canonical http-test location) with the assertions from §4
   above. Mock `isRemoteReviewEnabled` via the feature flag env var.
6. Run the test file, then the whole haiku package suite, then typecheck +
   lint. Fix any drift.
7. If docs files already reference `HAIKU_REVIEW_SITE_URL`, add the new env
   var alongside it.

## Verification commands

```bash
# From the repo root:
cd packages/haiku

# Run the new CORS test file first
npx vitest run src/__tests__/http.cors.test.ts

# Run the full package suite — http.ts is imported by server.ts which is
# imported by most packages, so there may be indirect snapshot or type
# breakage.
npx vitest run

# Typecheck — catches the new withCors signature breaking callers.
npx tsc --noEmit

# Lint.
npx biome check src/http.ts src/config.ts src/server.ts

# Smoke the tunnel path manually (optional but strongly recommended before
# merging — CORS bugs do not always surface in unit tests):
HAIKU_REMOTE_REVIEW=1 HAIKU_REVIEW_SITE_URL=https://haikumethod.ai \
  node dist/server.js &
curl -i -H "Origin: https://haikumethod.ai" http://localhost:PORT/api/review/current
# Expect: Access-Control-Allow-Origin: https://haikumethod.ai, Vary: Origin
curl -i -H "Origin: https://evil.example" http://localhost:PORT/api/review/current
# Expect: NO Access-Control-Allow-Origin header, Vary: Origin present
curl -i -X OPTIONS -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:PORT/review/SOME-SID/decide
# Expect: 204, NO Access-Control-Allow-Origin header
```

All three `npx` commands must exit 0.

## Risks

- **Parallel-chain clobber on `http.ts`.** FB-30 (zero-auth mutating
  endpoints) and FB-20 (fail-open `X-Haiku-Session-Id`) also touch this file.
  Read fresh immediately before editing; rebase the fix onto whatever state
  the file is in, do not trust feedback-body line numbers.
- **Breaking same-origin reviews if the tunnel URL is considered
  cross-origin.** When the reviewer loads the SPA via the tunnel URL (e.g.
  `https://foo.loca.lt/review/...`), the SPA's `fetch` calls to `/api/*`
  are same-origin against the tunnel host, not against `haikumethod.ai`.
  Browsers do not send `Origin` on same-origin fetches (or send it and do
  not enforce CORS). Verify with the smoke test above: requests from the
  SPA loaded off the tunnel host must succeed without any ACAO header.
  If they fail, the design is wrong — the tunnel host would need to be in
  the allow-list too, which defeats the fix. This is why the fetch from
  `haikumethod.ai` (the landing / token-handoff page) is the cross-origin
  case worth protecting, not the SPA-to-tunnel path.
- **Configuration drift.** If an operator sets
  `HAIKU_REVIEW_SITE_URL=https://site.example` but forgets to update
  `HAIKU_REVIEW_ALLOWED_ORIGINS`, the fallback `[siteUrl]` covers them.
  If they *do* set `HAIKU_REVIEW_ALLOWED_ORIGINS` (even to one value), the
  fallback is bypassed — so the single-value CSV must include the siteUrl
  explicitly. Document this in the JSDoc on the field and repeat in the
  docs entry.
- **Caches + `Vary: Origin`.** If the MCP server ever sits behind a CDN
  (it does not today but might in future fork-deploys), omitting `Vary:
  Origin` would let a CDN serve origin A's response to origin B. Always
  append `Vary: Origin`, even on the disallowed-origin branch, so caches
  treat the two Origin variants as distinct entries.
- **Config.ts env-var parsing.** The existing `str()` helper returns a
  string; splitting by `,` inside the config block (not inline at the call
  site) means `allowedOrigins` becomes a static `string[]`. Changing the
  env var at runtime requires a process restart — same as every other
  config in this file. Document the restart requirement inline.
- **Browser quirks on `Access-Control-Allow-Origin: ""`.** Some older
  browsers treat empty-string ACAO as "present but invalid" instead of
  "absent". Always omit the header entirely — do not set it to `""`.
- **Preflight leak.** A successful 204 for an unauthenticated `OPTIONS`
  reveals that the endpoint exists. This is the same leak every public
  CORS server has; the security guarantee is that the *real* request fails,
  not that the preflight 404s. If the reviewer wants stricter behavior
  later (415 / 400 on unknown methods), that's a separate hardening pass.

## Out of scope

- **Adding authentication to the mutating endpoints.** That is FB-30 /
  FB-20. This fix narrows the attack surface but does not close the
  zero-auth hole underneath. CORS is belt; auth is suspenders; both
  findings need to land.
- **CSRF tokens.** Same reasoning — CORS blocks cross-origin browser fetch;
  CSRF tokens block same-origin-forged-form-submission. Different
  mitigations. Out of scope here.
- **Renaming `withCors` to something like `applyReviewCors`.** Not part of
  the feedback; a pure-rename churn is a separate refactor.
- **Moving to a dedicated CORS middleware library** (`cors`, `hono/cors`).
  The project ships its own thin http layer on purpose; adding a dep for
  ~25 lines is not justified.
- **Changing the default `HAIKU_REMOTE_REVIEW` to true.** Remote review is
  opt-in; the fix preserves that.

## Done when

- `withCors` never emits `Access-Control-Allow-Origin: *` under any
  configuration.
- `withCors` echoes back only an origin that appears in
  `review.allowedOrigins` (defaulting to `[review.siteUrl]` when the env
  var is empty).
- Every response touched by `withCors` carries `Vary: Origin`.
- The preflight handler at `http.ts:1619-1621` still returns 204, but the
  network-layer wrapper now refuses to add ACAO headers for disallowed
  origins — so the preflight is effectively denied.
- `Access-Control-Allow-Credentials: true` is never emitted (negative
  assertion in the test suite).
- `HAIKU_REVIEW_ALLOWED_ORIGINS=*` is warned and stripped at startup.
- `packages/haiku/src/__tests__/http.cors.test.ts` covers the six
  assertions in §4 above and passes.
- `npx vitest run`, `npx tsc --noEmit`, and `npx biome check` all exit 0
  in `packages/haiku`.
- A manual curl smoke against a local tunnel confirms: allowed origin
  gets ACAO echoed; disallowed origin gets no ACAO; same-origin fetch
  from the SPA continues to work.
