// H·AI·K·U Browse — OAuth Authorization Code flow for GitHub and GitLab
//
// Both providers use Authorization Code flow with a proxy for token exchange.
// Callback URL pattern: /auth/{provider}/callback/

const STORAGE_PREFIX = "haiku-browse:"
const AUTH_PROXY_URL =
	process.env.NEXT_PUBLIC_HAIKU_AUTH_PROXY_URL || "https://auth.haikumethod.ai"

export interface AuthConfig {
	provider: "github" | "gitlab"
	host: string // e.g., "github.com" or "gitlab.com" or "gitlab.mycompany.com"
	clientId: string
}

// Per-provider OAuth client IDs — set via env vars
const GITHUB_CLIENT_ID =
	process.env.NEXT_PUBLIC_HAIKU_GITHUB_OAUTH_CLIENT_ID || ""
const GITLAB_CLIENT_ID =
	process.env.NEXT_PUBLIC_HAIKU_GITLAB_OAUTH_CLIENT_ID || ""

export function getAuthConfig(host: string): AuthConfig | null {
	if (host === "github.com") {
		if (!GITHUB_CLIENT_ID) return null
		return { provider: "github", host, clientId: GITHUB_CLIENT_ID }
	}
	if (host.includes("gitlab")) {
		if (!GITLAB_CLIENT_ID) return null
		return { provider: "gitlab", host, clientId: GITLAB_CLIENT_ID }
	}
	return null
}

/** Get the stored token for a host */
export function getToken(host: string): string | null {
	if (typeof window === "undefined") return null
	return localStorage.getItem(`${STORAGE_PREFIX}token:${host}`)
}

/** Store a token for a host */
export function setToken(host: string, token: string): void {
	localStorage.setItem(`${STORAGE_PREFIX}token:${host}`, token)
}

/** Clear a token for a host */
export function clearToken(host: string): void {
	localStorage.removeItem(`${STORAGE_PREFIX}token:${host}`)
}

/** Generate a random state parameter for CSRF protection */
function generateState(): string {
	const array = new Uint8Array(32)
	crypto.getRandomValues(array)
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Initiate the OAuth flow — redirects the browser */
export function startOAuthFlow(config: AuthConfig, returnPath: string): void {
	const state = generateState()

	// Store state + return path for verification on callback
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-state`, state)
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-return`, returnPath)
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-host`, config.host)
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-provider`, config.provider)

	// Provider-specific callback URL: /auth/{provider}/callback/
	const redirectUri = `${window.location.origin}/auth/${config.provider}/callback/`

	if (config.provider === "github") {
		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: redirectUri,
			scope: "repo",
			state,
		})
		window.location.href = `https://github.com/login/oauth/authorize?${params}`
	} else {
		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: "read_api",
			state,
		})
		window.location.href = `https://${config.host}/oauth/authorize?${params}`
	}
}

/** Initiate the CLI OAuth flow — the browse-site half of the haikumethod.ai
 *  broker handshake. The broker's `/cli/start` mints a `session_id` + a `state`
 *  and points the CLI's verification_url here. We run the SAME provider OAuth as
 *  the browse flow (reusing the registered `/auth/{provider}/callback/` redirect
 *  URI) but with the broker's `state` round-tripped through the provider, plus a
 *  marker so the callback POSTs the exchanged token to the broker's
 *  `/cli/complete` instead of only storing it for the SPA. */
export function startCliOAuthFlow(
	config: AuthConfig,
	brokerState: string,
): void {
	// The broker state IS the OAuth state — the callback verifies it round-trips
	// and forwards it to /cli/complete so the broker matches the session.
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-state`, brokerState)
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-return`, "/oauth/cli/done/")
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-host`, config.host)
	sessionStorage.setItem(`${STORAGE_PREFIX}oauth-provider`, config.provider)
	// Marker: the callback should COMPLETE the CLI session, not just store.
	sessionStorage.setItem(`${STORAGE_PREFIX}cli-complete`, brokerState)

	const redirectUri = `${window.location.origin}/auth/${config.provider}/callback/`
	if (config.provider === "github") {
		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: redirectUri,
			scope: "repo",
			state: brokerState,
		})
		window.location.href = `https://github.com/login/oauth/authorize?${params}`
	} else {
		// CLI write scope, NOT the browse flow's read-only `read_api`: the CLI
		// uses this token to open MRs and upload proof, which need write. GitLab's
		// `api` scope is a superset of `read_api`, so it's requested alone. (GitHub
		// already uses `repo` in both flows — full read/write — so no delta there.)
		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: "api",
			state: brokerState,
		})
		window.location.href = `https://${config.host}/oauth/authorize?${params}`
	}
}

/** POST an exchanged token bundle to the broker's `/cli/complete`, keyed by the
 *  CLI session's `state`. Mirrors the broker contract in
 *  `deploy/auth-proxy/src/cli.ts` `complete()`. */
async function completeCliSession(
	state: string,
	host: string,
	data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(`${AUTH_PROXY_URL}/cli/complete`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				state,
				host,
				access_token: data.access_token,
				...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
				...(data.expires_at !== undefined
					? { expires_at: data.expires_at }
					: {}),
				...(data.scopes !== undefined ? { scopes: data.scopes } : {}),
				...(data.account ? { account: data.account } : {}),
			}),
		})
		if (!res.ok) {
			return { ok: false, error: `broker /cli/complete returned ${res.status}` }
		}
		return { ok: true }
	} catch (e) {
		return { ok: false, error: (e as Error).message }
	}
}

/** Handle the OAuth callback — call this on the callback page */
export async function handleOAuthCallback(provider: string): Promise<{
	success: boolean
	host: string
	returnPath: string
	error?: string
}> {
	const savedState = sessionStorage.getItem(`${STORAGE_PREFIX}oauth-state`)
	const returnPath =
		sessionStorage.getItem(`${STORAGE_PREFIX}oauth-return`) || "/browse/"
	const host = sessionStorage.getItem(`${STORAGE_PREFIX}oauth-host`) || ""
	const savedProvider =
		sessionStorage.getItem(`${STORAGE_PREFIX}oauth-provider`) || ""
	// CLI flow marker (the broker state) — present when this callback should
	// complete a broker CLI session rather than only store the token.
	const cliState = sessionStorage.getItem(`${STORAGE_PREFIX}cli-complete`)

	// Clean up session storage
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-state`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-return`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-host`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-provider`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}cli-complete`)

	// Verify provider matches
	if (provider !== savedProvider) {
		return {
			success: false,
			host,
			returnPath,
			error: `Provider mismatch: expected ${savedProvider}, got ${provider}`,
		}
	}

	// Extract authorization code from query params
	const urlParams = new URLSearchParams(window.location.search)
	const code = urlParams.get("code")
	const state = urlParams.get("state")

	if (!code) {
		const error =
			urlParams.get("error_description") ||
			urlParams.get("error") ||
			"No authorization code"
		return { success: false, host, returnPath, error }
	}

	if (state !== savedState) {
		return {
			success: false,
			host,
			returnPath,
			error: "State mismatch — possible CSRF attack",
		}
	}

	// Exchange the code for a token via the auth proxy
	// Both GitHub and GitLab use the same pattern: POST /{provider}/token
	try {
		const res = await fetch(`${AUTH_PROXY_URL}/${provider}/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, host }),
		})

		if (!res.ok) {
			const text = await res.text()
			return {
				success: false,
				host,
				returnPath,
				error: `Token exchange failed: ${text}`,
			}
		}

		const data = await res.json()
		if (data.access_token) {
			if (cliState) {
				// CLI flow: hand the token to the broker so the polling CLI
				// receives it. Do NOT persist it to the SPA's localStorage — the
				// user opened this link from their terminal, not the browse UI, so
				// silently logging their browser in would be a surprising side
				// effect. The broker is the only path that matters here.
				const done = await completeCliSession(cliState, host, data)
				if (!done.ok) {
					return {
						success: false,
						host,
						returnPath,
						error: `Authenticated, but handing the token to the CLI failed: ${done.error}`,
					}
				}
			} else {
				setToken(host, data.access_token)
			}
			return { success: true, host, returnPath }
		}

		return {
			success: false,
			host,
			returnPath,
			error: data.error_description || "Unknown error",
		}
	} catch (e) {
		const msg = (e as Error).message
		const hint =
			msg === "Failed to fetch"
				? `Token exchange failed: Could not reach the auth proxy at ${AUTH_PROXY_URL}. The service may not be deployed or CORS may be blocking the request.`
				: `Token exchange failed: ${msg}`
		return { success: false, host, returnPath, error: hint }
	}
}

/** Check if OAuth is available for a host (client ID is configured) */
export function isOAuthAvailable(host: string): boolean {
	return getAuthConfig(host) !== null
}
