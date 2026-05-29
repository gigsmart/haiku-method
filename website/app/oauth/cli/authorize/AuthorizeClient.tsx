"use client"

import { useEffect, useState } from "react"
import { getAuthConfig, startCliOAuthFlow } from "@/lib/browse/auth"

// Reads the broker's CLI-session params from the URL and starts the provider
// OAuth. On success this immediately redirects to the provider, so the only
// rendered state the user normally sees is the brief "redirecting" spinner —
// the error state shows when the params are bad or the provider isn't
// OAuth-configured.
export function AuthorizeClient() {
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const q = new URLSearchParams(window.location.search)
		const host = q.get("host") || ""
		const state = q.get("state") || ""
		const provider = q.get("provider") || ""

		if (!state || !host) {
			setError("Missing or invalid CLI session (no state/host in the link).")
			return
		}
		const config = getAuthConfig(host)
		if (!config) {
			setError(
				`No OAuth client configured for ${host}. The site is missing the ${provider || "provider"} client id.`,
			)
			return
		}
		// The broker declares the provider in the URL; `host` is the authoritative
		// signal we actually resolve against. If they disagree, the broker URL is
		// misconfigured — catch it here instead of redirecting to the wrong place.
		if (provider && config.provider !== provider) {
			setError(
				`Provider mismatch: the link says ${provider} but host ${host} resolves to ${config.provider}.`,
			)
			return
		}
		// Redirects the browser to the provider's authorize page.
		startCliOAuthFlow(config, state)
	}, [])

	return (
		<div className="mx-auto max-w-md px-4 py-20 text-center">
			{error ? (
				<>
					<h1 className="mb-2 text-xl font-bold">Couldn't start sign-in</h1>
					<p className="text-sm text-red-600 dark:text-red-400">{error}</p>
					<p className="mt-4 text-sm text-stone-500">
						Return to your terminal and try <code>haiku_auth_login</code> again.
					</p>
				</>
			) : (
				<>
					<div className="mb-4">
						<svg
							className="mx-auto h-12 w-12 animate-spin text-teal-500"
							fill="none"
							viewBox="0 0 24 24"
							role="img"
							aria-label="Loading"
						>
							<title>Loading</title>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
					</div>
					<h1 className="text-xl font-bold">Redirecting to sign in…</h1>
					<p className="mt-2 text-sm text-stone-500">
						Authorizing the H·AI·K·U CLI for your Git provider.
					</p>
				</>
			)}
		</div>
	)
}
