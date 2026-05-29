"use client"

import { useEffect, useState } from "react"

// Terminal page of the CLI OAuth flow. On success the proxy has already
// exchanged the code and flipped the broker session to ready — the polling CLI
// will pick the token up, so there's nothing to do but tell the human to close
// the tab. On failure the proxy redirects here with `?error=<code>` so the
// human (and the waiting terminal) learn why instead of staring at a 404.
const ERROR_COPY: Record<string, string> = {
	access_denied: "You declined the authorization.",
	missing_state: "The sign-in link was missing its session token.",
	unknown_state: "That sign-in session expired or was already used.",
	already_completed: "That sign-in session was already completed.",
	provider_mismatch: "The link's provider didn't match the session.",
	missing_code: "The provider didn't return an authorization code.",
	exchange_failed: "Exchanging the authorization code for a token failed.",
}

export function DoneClient() {
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const code = new URLSearchParams(window.location.search).get("error")
		if (code) setError(code)
	}, [])

	if (error) {
		return (
			<div className="mx-auto max-w-md px-4 py-20 text-center">
				<h1 className="mb-2 text-xl font-bold">Sign-in didn't complete</h1>
				<p className="text-sm text-red-600 dark:text-red-400">
					{ERROR_COPY[error] || `Authorization failed (${error}).`}
				</p>
				<p className="mt-4 text-sm text-stone-500">
					Return to your terminal and run <code>haiku_auth_login</code> again.
				</p>
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-md px-4 py-20 text-center">
			<div className="mb-4 text-green-500">
				<svg
					className="mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					role="img"
					aria-label="Success"
				>
					<title>Success</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M5 13l4 4L19 7"
					/>
				</svg>
			</div>
			<h1 className="mb-2 text-xl font-bold">You're signed in</h1>
			<p className="text-stone-500">
				The H·AI·K·U CLI has your authorization. You can close this tab and
				return to your terminal.
			</p>
		</div>
	)
}
