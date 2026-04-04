import type { HttpFunction } from "@google-cloud/functions-framework"

// OAuth code→token exchange for GitHub and GitLab.
// Deployed as a GCP Cloud Function (v2).
//
// Endpoints:
//   POST /github/token — exchange GitHub authorization code
//   POST /gitlab/token — exchange GitLab authorization code

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://haikumethod.ai"

function corsHeaders(origin: string): Record<string, string> {
	const allowed = origin === ALLOWED_ORIGIN || ALLOWED_ORIGIN === "*"
	return {
		"Access-Control-Allow-Origin": allowed ? origin : "",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	}
}

export const authProxy: HttpFunction = async (req, res) => {
	const origin = req.headers.origin || ""
	const cors = corsHeaders(origin)
	for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)

	// CORS preflight
	if (req.method === "OPTIONS") {
		res.status(204).send("")
		return
	}

	if (req.method !== "POST") {
		res.status(405).json({ error: "method_not_allowed" })
		return
	}

	const path = req.path

	if (path === "/github/token") {
		await handleGitHub(req, res)
		return
	}

	if (path === "/gitlab/token") {
		await handleGitLab(req, res)
		return
	}

	if (path === "/" || path === "/health") {
		res.json({ status: "ok", service: "haiku-auth-proxy" })
		return
	}

	res.status(404).json({ error: "not_found" })
}

async function handleGitHub(
	req: Parameters<HttpFunction>[0],
	res: Parameters<HttpFunction>[1],
) {
	const { code } = req.body || {}
	if (!code) {
		res.status(400).json({ error: "missing_code", error_description: "Authorization code is required" })
		return
	}

	try {
		const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				client_id: process.env.HAIKU_GITHUB_OAUTH_CLIENT_ID,
				client_secret: process.env.HAIKU_GITHUB_OAUTH_CLIENT_SECRET,
				code,
			}),
		})

		const data = (await tokenRes.json()) as { error?: string; error_description?: string; access_token?: string }

		if (data.error) {
			res.status(400).json({ error: data.error, error_description: data.error_description })
			return
		}

		res.json({ access_token: data.access_token })
	} catch (e) {
		res.status(500).json({ error: "server_error", error_description: (e as Error).message })
	}
}

async function handleGitLab(
	req: Parameters<HttpFunction>[0],
	res: Parameters<HttpFunction>[1],
) {
	const { code, host } = req.body || {}
	if (!code) {
		res.status(400).json({ error: "missing_code", error_description: "Authorization code is required" })
		return
	}

	const gitlabHost = host || "gitlab.com"
	const redirectUri = `${ALLOWED_ORIGIN}/auth/gitlab/callback/`

	try {
		const tokenRes = await fetch(`https://${gitlabHost}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				client_id: process.env.HAIKU_GITLAB_OAUTH_CLIENT_ID,
				client_secret: process.env.HAIKU_GITLAB_OAUTH_CLIENT_SECRET,
				code,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
			}),
		})

		const data = (await tokenRes.json()) as { error?: string; error_description?: string; access_token?: string }

		if (data.error) {
			res.status(400).json({ error: data.error, error_description: data.error_description })
			return
		}

		res.json({ access_token: data.access_token })
	} catch (e) {
		res.status(500).json({ error: "server_error", error_description: (e as Error).message })
	}
}
