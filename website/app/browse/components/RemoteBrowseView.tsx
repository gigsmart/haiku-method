"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { GitHubProvider } from "@/lib/browse/github-provider"
import { GitLabProvider } from "@/lib/browse/gitlab-provider"
import type { BrowseProvider } from "@/lib/browse/types"
import { getToken, clearToken, setToken, getAuthConfig, startOAuthFlow, isOAuthAvailable } from "@/lib/browse/auth"
import { parseBrowsePath } from "@/lib/browse/url"
import type { BrowseLocation } from "@/lib/browse/url"
import { addRecent } from "@/lib/browse/recents"
import { PortfolioView } from "./PortfolioView"

function titleCase(s: string): string {
	return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

interface Props {
	/** Path segments after /browse/ — e.g. ["github.com", "org", "repo", "intent", "slug"] */
	pathSegments: string[]
	/** Optional branch from query params */
	branch?: string
}

export function RemoteBrowseView({ pathSegments, branch: branchParam }: Props) {
	const [provider, setProvider] = useState<BrowseProvider | null>(null)
	const [needsAuth, setNeedsAuth] = useState(false)
	const [authReason, setAuthReason] = useState<string>("auth_required")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [tokenInput, setTokenInput] = useState("")

	const location = useMemo<BrowseLocation | null>(() => {
		if (pathSegments.length < 3) return null
		const loc = parseBrowsePath(pathSegments)
		if (loc && branchParam) {
			loc.branch = branchParam
		}
		return loc
	}, [pathSegments, branchParam])

	const host = location?.host || ""
	const project = location?.project || ""
	const branch = location?.branch || ""
	const isGitHub = host === "github.com"

	useEffect(() => {
		if (!host || !project) {
			setError("Invalid repository path. Expected: /browse/github.com/org/repo/")
			setLoading(false)
			return
		}

		const storedToken = getToken(host)

		async function init() {
			// Always require authentication — unauthenticated API access hits rate limits too quickly
			if (!storedToken) {
				setNeedsAuth(true)
				setLoading(false)
				return
			}

			let prov: (GitHubProvider | GitLabProvider) & BrowseProvider

			if (isGitHub) {
				const parts = project.split("/")
				if (parts.length < 2) {
					setError("GitHub path must be owner/repo")
					setLoading(false)
					return
				}
				prov = new GitHubProvider(parts[0], parts[1], branch, storedToken)
			} else {
				prov = new GitLabProvider(host, project, branch, storedToken)
			}

			const status = isGitHub
				? await (prov as GitHubProvider).getAccessStatus()
				: { ok: await (prov as GitLabProvider).isAccessible(), reason: "auth_required" as const }
			if (!status.ok) {
				clearToken(host)
				setAuthReason(status.reason)
				setNeedsAuth(true)
				setLoading(false)
				return
			}

			setProvider(prov)
			addRecent(host, project, branch)
			setLoading(false)
		}

		init()
	}, [host, project, branch, isGitHub])

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

	if (loading) {
		return (
			<div className="mx-auto max-w-5xl px-4 py-8 lg:py-12">
				<div className="mb-8">
					<div className="mb-2 h-4 w-16 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
					<div className="h-8 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
					<div className="mt-2 h-4 w-64 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
				</div>
				<div className="space-y-3">
					{[1, 2, 3].map((i) => (
						<div key={i} className="animate-pulse rounded-xl border border-stone-200 px-6 py-4 dark:border-stone-700">
							<div className="h-5 w-48 rounded bg-stone-200 dark:bg-stone-700" />
							<div className="mt-2 flex gap-4">
								<div className="h-3 w-20 rounded bg-stone-100 dark:bg-stone-800" />
								<div className="h-3 w-16 rounded bg-stone-100 dark:bg-stone-800" />
							</div>
							<div className="mt-3 h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800" />
						</div>
					))}
				</div>
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
					Sign In to Browse
				</h1>
				<p className="mb-6 text-stone-600 dark:text-stone-400">
					{authReason === "not_found"
						? "Repository not found. It may be private \u2014 sign in to access it."
						: authReason === "auth_required"
						? "Sign in to access this repository."
						: `Sign in to browse H\u00b7AI\u00b7K\u00b7U intents in this repository.`}
				</p>

				{/* OAuth — primary auth method */}
				{isOAuthAvailable(host) && (
					<div className="mb-6 rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<button
							onClick={handleOAuth}
							className="flex w-full items-center justify-center gap-3 rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
						>
							{isGitHub ? (
								<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
									<path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
								</svg>
							) : (
								<svg className="h-5 w-5" viewBox="0 0 380 380" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<path d="M190.1 347.5L256.4 143.1H123.8L190.1 347.5Z" fill="#E24329"/>
									<path d="M190.1 347.5L123.8 143.1H18.3L190.1 347.5Z" fill="#FC6D26"/>
									<path d="M18.3 143.1L1.5 194.8C0 199.5 1.5 204.8 5.5 207.7L190.1 347.5L18.3 143.1Z" fill="#FCA326"/>
									<path d="M18.3 143.1H123.8L81.9 14.2C79.8 7.6 70.2 7.6 68.1 14.2L18.3 143.1Z" fill="#E24329"/>
									<path d="M190.1 347.5L256.4 143.1H361.9L190.1 347.5Z" fill="#FC6D26"/>
									<path d="M361.9 143.1L378.7 194.8C380.2 199.5 378.7 204.8 374.7 207.7L190.1 347.5L361.9 143.1Z" fill="#FCA326"/>
									<path d="M361.9 143.1H256.4L298.3 14.2C300.4 7.6 310 7.6 312.1 14.2L361.9 143.1Z" fill="#E24329"/>
								</svg>
							)}
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

	if (provider && location) {
		const repoLabel = `${host}/${project}${branch ? ` @ ${branch}` : ""}`
		return (
			<PortfolioView
				provider={provider}
				location={location}
				onBack={() => { window.location.href = "/browse/" }}
				repoLabel={repoLabel}
			/>
		)
	}

	return null
}
