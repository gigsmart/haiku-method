"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { GitHubProvider } from "@/lib/browse/github-provider"
import { GitLabProvider } from "@/lib/browse/gitlab-provider"
import type { BrowseProvider } from "@/lib/browse/types"
import { getToken, clearToken, setToken, getAuthConfig, startOAuthFlow, isOAuthAvailable } from "@/lib/browse/auth"
import { PortfolioView } from "../components/PortfolioView"

function titleCase(s: string): string {
	return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function GitBrowseInner() {
	const searchParams = useSearchParams()

	const [provider, setProvider] = useState<BrowseProvider | null>(null)
	const [needsAuth, setNeedsAuth] = useState(false)
	const [authReason, setAuthReason] = useState<string>("auth_required")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [tokenInput, setTokenInput] = useState("")

	// Parse repo from query: /browse/git?repo=github.com/org/repo&branch=main
	const repoParam = searchParams.get("repo") || ""
	const branch = searchParams.get("branch") || ""

	const { host, repoPath } = useMemo(() => {
		const parts = repoParam.split("/").filter(Boolean)
		if (parts.length < 3) return { host: "", repoPath: "" }
		return { host: parts[0], repoPath: parts.slice(1).join("/") }
	}, [repoParam])

	const isGitHub = host === "github.com"

	useEffect(() => {
		if (!host || !repoPath) {
			setError(repoParam ? "Invalid repository path. Expected: github.com/org/repo" : null)
			setLoading(false)
			return
		}

		const storedToken = getToken(host)

		async function init() {
			let prov: (GitHubProvider | GitLabProvider) & BrowseProvider

			if (isGitHub) {
				const parts = repoPath.split("/")
				if (parts.length < 2) {
					setError("GitHub path must be owner/repo")
					setLoading(false)
					return
				}
				prov = new GitHubProvider(parts[0], parts[1], branch, storedToken)
			} else {
				prov = new GitLabProvider(host, repoPath, branch, storedToken)
			}

			const status = isGitHub
				? await (prov as GitHubProvider).getAccessStatus()
				: { ok: await (prov as GitLabProvider).isAccessible(), reason: "auth_required" as const }
			if (!status.ok) {
				if (storedToken) clearToken(host)
				setAuthReason(status.reason)
				setNeedsAuth(true)
				setLoading(false)
				return
			}

			setProvider(prov)
			setLoading(false)
		}

		init()
	}, [host, repoPath, branch, isGitHub, repoParam])

	const handleOAuth = () => {
		const config = getAuthConfig(host)
		if (config) {
			startOAuthFlow(config, window.location.href)
		}
	}

	const handleTokenSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!tokenInput.trim()) return
		setToken(host, tokenInput.trim())
		window.location.reload()
	}

	// No repo param — show a "paste URL" prompt
	if (!repoParam && !loading) {
		return (
			<div className="mx-auto max-w-xl px-4 py-16 text-center">
				<h1 className="mb-4 text-2xl font-bold">Browse Remote Repository</h1>
				<p className="mb-4 text-stone-600 dark:text-stone-400">
					Use the repo parameter to specify which repository to browse.
				</p>
				<Link href="/browse/" className="text-teal-600 hover:text-teal-700">
					&larr; Back to Browse
				</Link>
			</div>
		)
	}

	if (loading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<div className="text-stone-500">Connecting to {host}...</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="mx-auto max-w-xl px-4 py-16 text-center">
				<h1 className="mb-4 text-2xl font-bold">Error</h1>
				<p className="text-stone-600 dark:text-stone-400">{error}</p>
				<Link href="/browse/" className="mt-4 inline-block text-teal-600 hover:text-teal-700">
					Back to Browse
				</Link>
			</div>
		)
	}

	if (needsAuth) {
		return (
			<div className="mx-auto max-w-xl px-4 py-16">
				<nav className="mb-8 text-sm text-stone-500 dark:text-stone-400">
					<Link href="/browse/" className="hover:text-stone-900 dark:hover:text-white">Browse</Link>
					<span className="mx-2">/</span>
					<span className="text-stone-900 dark:text-white">{host}</span>
				</nav>

				<h1 className="mb-2 text-2xl font-bold">
					{authReason === "rate_limited" ? "Rate Limited" : "Authentication Required"}
				</h1>
				<p className="mb-6 text-stone-600 dark:text-stone-400">
					{authReason === "rate_limited"
						? "GitHub's unauthenticated API limit (60 requests/hour) has been reached. Sign in to get 5,000 requests/hour."
						: authReason === "not_found"
						? "Repository not found. It may be private — sign in to access it."
						: `Sign in with ${isGitHub ? "GitHub" : host} to browse this repository.`}
				</p>

				{/* OAuth — primary auth method */}
				{isOAuthAvailable(host) && (
					<div className="mb-6 rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<button
							onClick={handleOAuth}
							className="flex w-full items-center justify-center gap-3 rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
						>
							<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
							</svg>
							Sign in with {isGitHub ? "GitHub" : titleCase(host.split(".")[0])}
						</button>
						<p className="mt-3 text-center text-xs text-stone-400">
							Grants read-only access to your repositories.
						</p>
					</div>
				)}

				{/* PAT — fallback auth method */}
				<details className={isOAuthAvailable(host) ? "" : "open"}>
					<summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">
						{isOAuthAvailable(host) ? "Or use a personal access token instead" : "Enter a personal access token"}
					</summary>
					<div className="mt-4 rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<h3 className="mb-2 text-sm font-semibold">
							{isGitHub ? "GitHub Personal Access Token" : "GitLab Personal Access Token"}
						</h3>
						<p className="mb-4 text-xs text-stone-500">
							{isGitHub
								? "Generate at GitHub Settings > Developer Settings > Personal Access Tokens. Needs 'repo' scope."
								: `Generate at ${host}/-/user_settings/personal_access_tokens. Needs 'read_repository' scope.`}
						</p>
						<form onSubmit={handleTokenSubmit} className="flex gap-2">
							<input
								type="password"
								value={tokenInput}
								onChange={(e) => setTokenInput(e.target.value)}
								placeholder="ghp_... or glpat-..."
								className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-mono placeholder:text-stone-400 focus:border-teal-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
							/>
							<button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
								Connect
							</button>
						</form>
						<p className="mt-3 text-xs text-stone-400">
							Token stored in localStorage only. Never sent to haikumethod.ai.
						</p>
					</div>
				</details>
			</div>
		)
	}

	if (provider) {
		return (
			<PortfolioView
				provider={provider}
				onBack={() => { window.location.href = "/browse/" }}
				repoLabel={`${host}/${repoPath}${branch ? ` (${branch})` : ""}`}
			/>
		)
	}

	return null
}

export default function GitBrowsePage() {
	return (
		<Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="text-stone-500">Loading...</div></div>}>
			<GitBrowseInner />
		</Suspense>
	)
}
