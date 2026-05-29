/**
 * Provider OAuth primitives shared by the browse-site code→token exchange
 * (POST /github/token, /gitlab/token in index.ts) and the CLI device-flow
 * endpoints (cli.ts).
 *
 * The browse-site exchange and the CLI handshake both run the SAME code→token /
 * refresh exchange against the SAME upstream with the SAME secret pulled from
 * Secret Manager — so that logic lives here once and both callers import it.
 *
 * Secret env-var names match the Phase-1 deployment (terraform module):
 *   HAIKU_GITHUB_OAUTH_CLIENT_ID / HAIKU_GITHUB_OAUTH_CLIENT_SECRET
 *   HAIKU_GITLAB_OAUTH_CLIENT_ID / HAIKU_GITLAB_OAUTH_CLIENT_SECRET
 */

export type Provider = "github" | "gitlab"

export function isProvider(v: unknown): v is Provider {
	return v === "github" || v === "gitlab"
}

/** Default public host for each provider when no enterprise/self-managed host is given. */
export const DEFAULT_HOST: Record<Provider, string> = {
	github: "github.com",
	gitlab: "gitlab.com",
}

/**
 * Normalize a caller-supplied host. Accepts bare hostnames ("git.acme.com"),
 * full origins ("https://git.acme.com"), and trailing slashes. Falls back to the
 * provider's public host when absent. Enterprise GitHub and self-managed GitLab
 * run the same OAuth paths on a different origin, so all we need is the host.
 */
export function normalizeHost(provider: Provider, host?: string | null): string {
	const raw = (host ?? "").trim()
	if (!raw) return DEFAULT_HOST[provider]
	let h = raw.replace(/^https?:\/\//i, "")
	h = h.replace(/\/.*$/, "")
	return h || DEFAULT_HOST[provider]
}

/** The OAuth token (code→token AND refresh) endpoint for a provider+host. */
export function tokenEndpoint(provider: Provider, host: string): string {
	if (provider === "github") {
		// github.com and GitHub Enterprise Server share the path.
		return `https://${host}/login/oauth/access_token`
	}
	// gitlab.com and self-managed GitLab share the path.
	return `https://${host}/oauth/token`
}

/** The OAuth authorize entry the browser is sent to. */
export function authorizeEndpoint(provider: Provider, host: string): string {
	if (provider === "github") {
		return `https://${host}/login/oauth/authorize`
	}
	return `https://${host}/oauth/authorize`
}

export interface ProviderCredentials {
	clientId: string
	clientSecret: string
}

/**
 * Resolve the OAuth app credentials for a provider from the environment. Secret
 * Manager values are injected as env vars by the Cloud Function deployment (see
 * deploy/terraform/modules/auth-proxy/main.tf). Phase 1 wired the
 * HAIKU_<PROVIDER>_OAUTH_CLIENT_ID/SECRET vars; the CLI reuses the same.
 *
 * An enterprise/self-managed host with its OWN registered OAuth app may set a
 * host-scoped override, e.g. HAIKU_GITLAB_OAUTH_CLIENT_ID__GIT_ACME_COM (host
 * dots/dashes → underscores, uppercased).
 */
export function resolveCredentials(
	provider: Provider,
	host: string,
	env: NodeJS.ProcessEnv = process.env,
): ProviderCredentials {
	const base = `HAIKU_${provider.toUpperCase()}_OAUTH`
	const hostKey = host.replace(/[.-]/g, "_").toUpperCase()
	const clientId =
		env[`${base}_CLIENT_ID__${hostKey}`] ?? env[`${base}_CLIENT_ID`]
	const clientSecret =
		env[`${base}_CLIENT_SECRET__${hostKey}`] ?? env[`${base}_CLIENT_SECRET`]
	if (!clientId || !clientSecret) {
		throw new ProviderError(
			500,
			"missing_provider_credentials",
			`No OAuth credentials configured for ${provider} on ${host}`,
		)
	}
	return { clientId, clientSecret }
}

export class ProviderError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = "ProviderError"
	}
}

/** Token bundle returned by both code-exchange and refresh. */
export interface TokenBundle {
	access_token: string
	refresh_token?: string
	/** epoch seconds when access_token expires, when the provider returns expiry */
	expires_at?: number
	scopes?: string[]
	token_type?: string
}

interface RawTokenResponse {
	access_token?: string
	refresh_token?: string
	expires_in?: number
	scope?: string
	token_type?: string
	error?: string
	error_description?: string
}

function shapeBundle(raw: RawTokenResponse): TokenBundle {
	if (raw.error || !raw.access_token) {
		throw new ProviderError(
			400,
			raw.error ? `provider_${raw.error}` : "provider_no_token",
			raw.error_description || raw.error || "Provider returned no access token",
		)
	}
	const bundle: TokenBundle = { access_token: raw.access_token }
	if (raw.refresh_token) bundle.refresh_token = raw.refresh_token
	if (typeof raw.expires_in === "number" && raw.expires_in > 0) {
		bundle.expires_at = Math.floor(Date.now() / 1000) + raw.expires_in
	}
	if (raw.scope) bundle.scopes = raw.scope.split(/[\s,]+/).filter(Boolean)
	if (raw.token_type) bundle.token_type = raw.token_type
	return bundle
}

/** POST to the provider token endpoint as JSON (matching Phase-1 exchange shape). */
async function postToken(
	url: string,
	body: Record<string, string>,
	fetchImpl: typeof fetch = fetch,
): Promise<RawTokenResponse> {
	const res = await fetchImpl(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(body),
	})
	const text = await res.text()
	let parsed: RawTokenResponse
	try {
		parsed = JSON.parse(text) as RawTokenResponse
	} catch {
		throw new ProviderError(
			502,
			"provider_bad_response",
			`Non-JSON response from provider (${res.status})`,
		)
	}
	if (!res.ok && !parsed.access_token && !parsed.error) {
		throw new ProviderError(
			502,
			"provider_http_error",
			`Provider returned HTTP ${res.status}`,
		)
	}
	return parsed
}

/** Re-run the token exchange with grant_type=refresh_token using the held secret. */
export async function refreshToken(args: {
	provider: Provider
	host: string
	refreshToken: string
	env?: NodeJS.ProcessEnv
	fetchImpl?: typeof fetch
}): Promise<TokenBundle> {
	const { provider, host, refreshToken: rt, env, fetchImpl } = args
	const { clientId, clientSecret } = resolveCredentials(provider, host, env)
	const raw = await postToken(
		tokenEndpoint(provider, host),
		{
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "refresh_token",
			refresh_token: rt,
		},
		fetchImpl,
	)
	return shapeBundle(raw)
}
