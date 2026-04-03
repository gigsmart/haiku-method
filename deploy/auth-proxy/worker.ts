// H·AI·K·U Auth Proxy — Cloudflare Worker
// Handles GitHub OAuth code→token exchange for the SPA browse feature.
// GitHub requires a server-side exchange (client_secret can't be in the SPA).
//
// Deploy: wrangler deploy
// Env vars (set via wrangler secret):
//   GITHUB_CLIENT_ID — GitHub OAuth App client ID
//   GITHUB_CLIENT_SECRET — GitHub OAuth App client secret
//   ALLOWED_ORIGIN — https://haikumethod.ai (CORS)

interface Env {
	GITHUB_CLIENT_ID: string
	GITHUB_CLIENT_SECRET: string
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

		// POST /github/token — exchange code for access token
		if (url.pathname === "/github/token" && request.method === "POST") {
			try {
				const body = (await request.json()) as { code?: string }
				if (!body.code) {
					return Response.json(
						{ error: "missing_code", error_description: "Authorization code is required" },
						{ status: 400, headers },
					)
				}

				// Exchange code for token with GitHub
				const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({
						client_id: env.GITHUB_CLIENT_ID,
						client_secret: env.GITHUB_CLIENT_SECRET,
						code: body.code,
					}),
				})

				const tokenData = await tokenRes.json()

				if (tokenData.error) {
					return Response.json(
						{ error: tokenData.error, error_description: tokenData.error_description },
						{ status: 400, headers },
					)
				}

				// Return only the access_token (don't expose scope/token_type details)
				return Response.json(
					{ access_token: tokenData.access_token },
					{ status: 200, headers },
				)
			} catch (e) {
				return Response.json(
					{ error: "server_error", error_description: (e as Error).message },
					{ status: 500, headers },
				)
			}
		}

		// Health check
		if (url.pathname === "/" || url.pathname === "/health") {
			return Response.json({ status: "ok", service: "haiku-auth-proxy" }, { headers })
		}

		return Response.json(
			{ error: "not_found" },
			{ status: 404, headers },
		)
	},
}
