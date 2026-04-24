/**
 * Tunnel-auth token extracted from the review URL fragment.
 *
 * The MCP server mints this JWT in `tunnel.ts::buildReviewUrl()` and
 * embeds it as `#<jwt>` on the URL it hands to the reviewer. The SPA
 * reads it from `window.location.hash` on first load and stashes it
 * in memory only — never localStorage / sessionStorage, never the
 * DOM, never a cookie.
 *
 * The token is attached to every backend call:
 *   - `Authorization: Bearer <jwt>` on JSON APIs (via `authHeader()`).
 *   - `?t=<jwt>` on asset URLs and the WebSocket upgrade (via
 *     `authQuery()` / `withAuthQuery()`), because `<img>`, `<iframe>`,
 *     and `WebSocket` cannot attach custom headers from a browser.
 *
 * Server-side verification: `verifyTunnelJWT` in
 * `packages/haiku/src/tunnel.ts`. Gate helper: `requireTunnelAuth` in
 * `packages/haiku/src/http.ts`.
 *
 * Local-only mode (`HAIKU_REMOTE_REVIEW=0`) makes the server-side
 * gate a no-op, so the absence of a hash / token is fine there.
 */

let cachedToken: string | null = null
let initialized = false

/**
 * JWT shape: three base64url segments separated by `.`. Anything else
 * is discarded (the hash may carry routing state, not a token).
 */
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

function readFromHash(): string | null {
	if (typeof window === "undefined") return null
	const hash = window.location.hash
	if (!hash || hash.length < 2) return null
	const raw = hash.startsWith("#") ? hash.slice(1) : hash
	if (!JWT_PATTERN.test(raw)) return null
	return raw
}

/**
 * Resolve the current auth token. Reads `window.location.hash` once on
 * first call and caches the result — a hard reload re-runs the whole
 * module so the fragment is re-read there too.
 */
export function getAuthToken(): string | null {
	if (!initialized) {
		cachedToken = readFromHash()
		initialized = true
	}
	return cachedToken
}

/**
 * Merge-ready `Authorization` header. Returns an empty object when no
 * token is available so callers can always spread it into a headers
 * literal without conditional logic.
 */
export function authHeader(): Record<string, string> {
	const t = getAuthToken()
	return t ? { Authorization: `Bearer ${t}` } : {}
}

/**
 * `t=<jwt>` query segment (no leading `?` or `&`). Use for asset URLs
 * and the WebSocket upgrade. Returns an empty string when no token.
 */
export function authQuery(): string {
	const t = getAuthToken()
	return t ? `t=${encodeURIComponent(t)}` : ""
}

/**
 * Append `?t=<jwt>` (or `&t=<jwt>`) to an asset URL. No-op when no
 * token. Use for `<img src>`, `<iframe src>`, etc. — anything the
 * browser fetches without going through `fetch()`.
 */
export function withAuthQuery(url: string): string {
	const q = authQuery()
	if (!q) return url
	return url.includes("?") ? `${url}&${q}` : `${url}?${q}`
}

/**
 * Test-only: inject a token without touching `window.location.hash`.
 * Pass `null` to clear.
 */
export function __setAuthTokenForTesting(value: string | null): void {
	cachedToken = value
	initialized = true
}

/**
 * Test-only: force the next `getAuthToken()` call to re-read from the
 * hash. Companion to `__setAuthTokenForTesting`.
 */
export function __resetAuthForTesting(): void {
	cachedToken = null
	initialized = false
}
