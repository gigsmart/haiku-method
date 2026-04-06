"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { LocalProvider } from "@/lib/browse/local-provider"
import type { BrowseProvider } from "@/lib/browse/types"
import { PortfolioView } from "./components/PortfolioView"
import { RemoteBrowseView } from "./components/RemoteBrowseView"

import { getRecents } from "@/lib/browse/recents"

/**
 * Parse the current URL to detect if we're at a path-based browse URL.
 *
 * Path pattern: /browse/{host}/{...project}/[intent/{slug}/[{stage}/[{unit}/]]]
 *
 * Also handles GitHub Pages SPA fallback: if the 404.html redirected us here
 * with the original path in sessionStorage, we restore it and push it into
 * the browser history.
 *
 * Returns the path segments after /browse/ if there are enough to form a valid
 * remote browse URL (at least host + 2 project segments), otherwise null.
 */
function getRemoteBrowseSegments(): { segments: string[]; branch?: string } | null {
	if (typeof window === "undefined") return null

	let fullPath = window.location.pathname
	let search = window.location.search

	// Check for GitHub Pages SPA redirect
	const redirectPath = sessionStorage.getItem("browse-redirect-path")
	if (redirectPath) {
		sessionStorage.removeItem("browse-redirect-path")
		const [pathPart, queryPart] = redirectPath.split("?")
		fullPath = pathPart
		search = queryPart ? `?${queryPart}` : ""
		// Restore the original URL in the browser bar
		window.history.replaceState(null, "", redirectPath)
	}

	const pathname = fullPath.replace(/\/+$/, "")
	const prefix = "/browse"
	if (!pathname.startsWith(prefix + "/") || pathname === prefix) return null

	const rest = pathname.slice(prefix.length + 1)
	const segments = rest.split("/").filter(Boolean)

	// Need at minimum: host, org, repo (3 segments)
	if (segments.length < 3) return null

	// First segment should look like a hostname (contains a dot)
	if (!segments[0].includes(".")) return null

	const branch = new URLSearchParams(search).get("branch") || undefined
	return { segments, branch }
}

export default function BrowsePage() {
	const [provider, setProvider] = useState<BrowseProvider | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [dragging, setDragging] = useState(false)

	// Detect path-based remote browse URL on initial render
	const [remoteBrowse, setRemoteBrowse] = useState<{ segments: string[]; branch?: string } | null>(null)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setRemoteBrowse(getRemoteBrowseSegments())
		setMounted(true)
	}, [])

	// Listen for popstate to handle back navigation from remote browse to landing
	useEffect(() => {
		const onPopState = () => {
			setRemoteBrowse(getRemoteBrowseSegments())
		}
		window.addEventListener("popstate", onPopState)
		return () => window.removeEventListener("popstate", onPopState)
	}, [])

	const handleDirectoryPicker = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			// File System Access API — not in all TypeScript DOM libs yet
			const handle = await (window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
			const local = new LocalProvider(handle)
			const found = await local.init()
			if (!found) {
				setError("No .haiku/ directory found in the selected folder.")
				setLoading(false)
				return
			}
			setProvider(local)
		} catch (e) {
			if ((e as Error).name !== "AbortError") {
				setError("Failed to open directory. Your browser may not support the File System Access API.")
			}
		} finally {
			setLoading(false)
		}
	}, [])

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault()
		setDragging(false)

		const items = e.dataTransfer.items
		if (!items || items.length === 0) return

		for (const item of Array.from(items)) {
			// File System Access API — Chrome 86+
			if ("getAsFileSystemHandle" in item) {
				try {
					const handle = await (item as unknown as { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle()
					if (handle?.kind === "directory") {
						setLoading(true)
						setError(null)
						const local = new LocalProvider(handle as FileSystemDirectoryHandle)
						const found = await local.init()
						if (!found) {
							setError("No .haiku/ directory found in the dropped folder.")
							setLoading(false)
							return
						}
						setProvider(local)
						setLoading(false)
						return
					}
				} catch (err) {
					console.error("Drop handle error:", err)
				}
			}
		}
		setError("Drop a project folder, or click to use the directory picker. Your browser may not support drag-and-drop for directories.")
	}, [])

	// Don't render anything until mounted (avoids hydration mismatch)
	if (!mounted) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<div className="text-stone-500">Loading...</div>
			</div>
		)
	}

	// Remote browse mode — path contains host/project info
	if (remoteBrowse) {
		return <RemoteBrowseView pathSegments={remoteBrowse.segments} branch={remoteBrowse.branch} />
	}

	// Local directory browse mode
	if (provider) {
		return <PortfolioView provider={provider} onBack={() => setProvider(null)} />
	}

	// Landing page — choose browse mode
	return (
		<div className="mx-auto max-w-3xl px-4 py-16">
			<nav className="mb-8 text-sm text-stone-500 dark:text-stone-400">
				<Link href="/" className="hover:text-stone-900 dark:hover:text-white">
					Home
				</Link>
				<span className="mx-2">/</span>
				<span className="text-stone-900 dark:text-white">Browse</span>
			</nav>

			<h1 className="mb-2 text-3xl font-bold tracking-tight">
				Browse H·AI·K·U Workspace
			</h1>
			<p className="mb-10 text-stone-600 dark:text-stone-400">
				Explore intents, stages, units, and artifacts from any H·AI·K·U workspace.
			</p>

			{/* Local directory */}
			<div
				className={`mb-8 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition ${
					dragging
						? "border-teal-400 bg-teal-50 dark:border-teal-600 dark:bg-teal-950"
						: "border-stone-300 hover:border-teal-300 dark:border-stone-700 dark:hover:border-teal-700"
				}`}
				onClick={handleDirectoryPicker}
				onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
				onDragLeave={() => setDragging(false)}
				onDrop={handleDrop}
			>
				<div className="mb-3 text-4xl text-stone-300 dark:text-stone-600">
					<svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
				</div>
				<p className="text-lg font-medium text-stone-700 dark:text-stone-300">
					{loading ? "Loading..." : "Drop a project folder here or click to browse"}
				</p>
				<p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
					Select a directory containing a <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">.haiku/</code> folder
				</p>
			</div>

			{error && (
				<div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Remote options */}
			<div className="rounded-xl border border-stone-200 p-6 dark:border-stone-700">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
					Or browse a remote repository
				</h2>
				<p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
					Paste a repository URL to browse its H·AI·K·U workspace remotely.
				</p>
				<RemoteUrlInput />
			</div>

			{/* Recents */}
			<RecentsList />
		</div>
	)
}

function RemoteUrlInput() {
	const [url, setUrl] = useState("")
	const [error, setError] = useState("")

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setError("")

		try {
			const parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
			const host = parsed.hostname
			const pathParts = parsed.pathname.split("/").filter(Boolean)

			if (pathParts.length < 2) {
				setError("URL must include the repository path (e.g., github.com/org/repo)")
				return
			}

			const branch = parsed.searchParams.get("branch") || ""
			const projectPath = pathParts.join("/")
			let browsePath = `/browse/${host}/${projectPath}/`
			if (branch) browsePath += `?branch=${encodeURIComponent(branch)}`
			window.location.href = browsePath
		} catch {
			setError("Invalid URL. Try: github.com/org/repo or gitlab.com/group/project")
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex gap-2">
			<input
				type="text"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				placeholder="github.com/org/repo or gitlab.com/group/project"
				className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm placeholder:text-stone-400 focus:border-teal-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:placeholder:text-stone-600"
			/>
			<button
				type="submit"
				className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
			>
				Browse
			</button>
			{error && <p className="mt-1 text-xs text-red-600">{error}</p>}
		</form>
	)
}

function RecentsList() {
	const [recents, setRecents] = useState<ReturnType<typeof getRecents>>([])

	useEffect(() => {
		setRecents(getRecents())
	}, [])

	if (recents.length === 0) return null

	return (
		<div className="mt-8">
			<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
				Recent
			</h2>
			<div className="space-y-2">
				{recents.map((r) => (
					<Link
						key={r.label}
						href={`/browse/${r.host}/${r.project}/`}
						className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
					>
						<div>
							<div className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
								{r.project}
							</div>
							<div className="text-xs text-stone-500">{r.host}</div>
						</div>
						<span className="text-xs text-stone-400">
							{new Date(r.lastVisited).toLocaleDateString()}
						</span>
					</Link>
				))}
			</div>
		</div>
	)
}
