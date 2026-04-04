// H·AI·K·U Auth Proxy — Cloudflare Worker
// Handles OAuth code→token exchange for GitHub and GitLab.
// Both providers require a server-side exchange (client_secret can't be in the SPA).
//
// Endpoints:
//   POST /github/token — exchange GitHub authorization code
//   POST /gitlab/token — exchange GitLab authorization code

interface Env {
	HAIKU_GITHUB_OAUTH_CLIENT_ID: string
	HAIKU_GITHUB_OAUTH_CLIENT_SECRET: string
	HAIKU_GITLAB_OAUTH_CLIENT_ID: string
	HAIKU_GITLAB_OAUTH_CLIENT_SECRET: string
	ALLOWED_ORIGIN: string
}

function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
	const allowed = origin === allowedOrigin || allowedOrigin === "*"
	return {
		"Access-Control-Allow-Origin": allowed ? origin : "",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
		const origin = request.headers.get("Origin") || ""
		const headers = corsHeaders(origin, env.ALLOWED_ORIGIN || "https://haikumethod.ai")

		// CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers })
		}

		// POST /github/token
		if (url.pathname === "/github/token" && request.method === "POST") {
			return handleGitHub(request, env, headers)
		}

		// POST /gitlab/token
		if (url.pathname === "/gitlab/token" && request.method === "POST") {
			return handleGitLab(request, env, headers)
		}

		// Health check
		if (url.pathname === "/" || url.pathname === "/health") {
			return Response.json({ status: "ok", service: "haiku-auth-proxy" }, { headers })
		}

		return Response.json({ error: "not_found" }, { status: 404, headers })
	},
}

async function handleGitHub(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
	try {
		const body = (await request.json()) as { code?: string }
		if (!body.code) {
			return Response.json(
				{ error: "missing_code", error_description: "Authorization code is required" },
				{ status: 400, headers },
			)
		}

		const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				client_id: env.HAIKU_GITHUB_OAUTH_CLIENT_ID,
				client_secret: env.HAIKU_GITHUB_OAUTH_CLIENT_SECRET,
				code: body.code,
			}),
		})

		const tokenData = (await tokenRes.json()) as { error?: string; error_description?: string; access_token?: string }

		if (tokenData.error) {
			return Response.json(
				{ error: tokenData.error, error_description: tokenData.error_description },
				{ status: 400, headers },
			)
		}

		return Response.json({ access_token: tokenData.access_token }, { status: 200, headers })
	} catch (e) {
		return Response.json(
			{ error: "server_error", error_description: (e as Error).message },
			{ status: 500, headers },
		)
	}
}

async function handleGitLab(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
	try {
		const body = (await request.json()) as { code?: string; host?: string }
		if (!body.code) {
			return Response.json(
				{ error: "missing_code", error_description: "Authorization code is required" },
				{ status: 400, headers },
			)
		}

		// GitLab host — defaults to gitlab.com, but supports self-hosted
		const gitlabHost = body.host || "gitlab.com"

		// Reconstruct the redirect_uri (must match what the FE sent to GitLab)
		const allowedOrigin = env.ALLOWED_ORIGIN || "https://haikumethod.ai"
		const redirectUri = `${allowedOrigin}/auth/gitlab/callback/`

		const tokenRes = await fetch(`https://${gitlabHost}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				client_id: env.HAIKU_GITLAB_OAUTH_CLIENT_ID,
				client_secret: env.HAIKU_GITLAB_OAUTH_CLIENT_SECRET,
				code: body.code,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
			}),
		})

		const tokenData = (await tokenRes.json()) as { error?: string; error_description?: string; access_token?: string }

		if (tokenData.error) {
			return Response.json(
				{ error: tokenData.error, error_description: tokenData.error_description },
				{ status: 400, headers },
			)
		}

		return Response.json({ access_token: tokenData.access_token }, { status: 200, headers })
	} catch (e) {
		return Response.json(
			{ error: "server_error", error_description: (e as Error).message },
			{ status: 500, headers },
		)
	}
}
