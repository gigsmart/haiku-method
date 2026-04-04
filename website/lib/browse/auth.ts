// H·AI·K·U Browse — OAuth Authorization Code flow for GitHub and GitLab
//
// Both providers use Authorization Code flow with a proxy for token exchange.
// Callback URL pattern: /auth/{provider}/callback/

const STORAGE_PREFIX = "haiku-browse:"
const AUTH_PROXY_URL = process.env.NEXT_PUBLIC_HAIKU_AUTH_PROXY_URL || "https://auth.haikumethod.ai"

export interface AuthConfig {
	provider: "github" | "gitlab"
	host: string // e.g., "github.com" or "gitlab.com" or "gitlab.mycompany.com"
	clientId: string
}

// Per-provider OAuth client IDs — set via env vars
const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_HAIKU_GITHUB_OAUTH_CLIENT_ID || ""
const GITLAB_CLIENT_ID = process.env.NEXT_PUBLIC_HAIKU_GITLAB_OAUTH_CLIENT_ID || ""

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
			scope: "read_repository read_api",
			state,
		})
		window.location.href = `https://${config.host}/oauth/authorize?${params}`
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
	const returnPath = sessionStorage.getItem(`${STORAGE_PREFIX}oauth-return`) || "/browse/"
	const host = sessionStorage.getItem(`${STORAGE_PREFIX}oauth-host`) || ""
	const savedProvider = sessionStorage.getItem(`${STORAGE_PREFIX}oauth-provider`) || ""

	// Clean up session storage
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-state`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-return`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-host`)
	sessionStorage.removeItem(`${STORAGE_PREFIX}oauth-provider`)

	// Verify provider matches
	if (provider !== savedProvider) {
		return { success: false, host, returnPath, error: `Provider mismatch: expected ${savedProvider}, got ${provider}` }
	}

	// Extract authorization code from query params
	const urlParams = new URLSearchParams(window.location.search)
	const code = urlParams.get("code")
	const state = urlParams.get("state")

	if (!code) {
		const error = urlParams.get("error_description") || urlParams.get("error") || "No authorization code"
		return { success: false, host, returnPath, error }
	}

	if (state !== savedState) {
		return { success: false, host, returnPath, error: "State mismatch — possible CSRF attack" }
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
			return { success: false, host, returnPath, error: `Token exchange failed: ${text}` }
		}

		const data = await res.json()
		if (data.access_token) {
			setToken(host, data.access_token)
			return { success: true, host, returnPath }
		}

		return { success: false, host, returnPath, error: data.error_description || "Unknown error" }
	} catch (e) {
		return { success: false, host, returnPath, error: `Token exchange failed: ${(e as Error).message}` }
	}
}

/** Check if OAuth is available for a host (client ID is configured) */
export function isOAuthAvailable(host: string): boolean {
	return getAuthConfig(host) !== null
}
