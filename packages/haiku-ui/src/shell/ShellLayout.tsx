/**
 * Reusable page-shell layout consumed by `App.tsx`.
 *
 * Owns the <Header> + <Main> + <FooterBar> composition per
 * `aria-landmark-spec.md §1`. Kept separate from App.tsx so App.tsx stays
 * under the < 100-line hard gate while every shell surface still reads
 * from one source of truth.
 *
 * Page modules can dynamically override the header title via the
 * `usePageTitle(...)` hook in `./PageTitleContext`.
 */

import { useEffect, useState } from "react"
import { FooterBar, Main } from "../a11y"
import { Header } from "../molecules/Header"
import { PageTitleProvider, useShellTitle } from "./PageTitleContext"

export function ShellLayout({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}): React.ReactElement {
	return (
		<PageTitleProvider defaultTitle={title}>
			<DynamicHeader />
			<Main className="max-w-[var(--content-max)] mx-auto px-4 sm:px-6 lg:px-8 py-6">
				{children}
			</Main>
			<ShellFooter />
		</PageTitleProvider>
	)
}

function DynamicHeader(): React.ReactElement {
	const title = useShellTitle()
	return <Header title={title ?? ""} />
}

export function NotFoundShell(): React.ReactElement {
	return (
		<>
			<Header title="Not found" />
			<Main
				ariaLabel="Not found"
				className="max-w-[var(--content-max)] mx-auto px-4 sm:px-6 lg:px-8 py-12"
			>
				<div className="text-center">
					<p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
						404 — No session found
					</p>
					<p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
						The URL does not match a known review, question, or design-direction
						page.
					</p>
				</div>
			</Main>
			<ShellFooter />
		</>
	)
}

/**
 * Pull the running MCP + plugin version from `/api/version` and render
 * a small badge in the footer. Lets reviewers see which binary is
 * serving the page when behavior diverges from CHANGELOG / docs.
 *
 * Failure mode is silent: a fetch error (offline, route not yet
 * registered on an old binary, etc.) just hides the badge. The footer
 * still renders the H·AI·K·U attribution.
 */
function useRunningVersion(): { mcp: string; plugin: string } | null {
	const [v, setV] = useState<{ mcp: string; plugin: string } | null>(null)
	useEffect(() => {
		let cancelled = false
		fetch("/api/version", { headers: { "bypass-tunnel-reminder": "1" } })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (cancelled || !data) return
				if (
					typeof data.mcp_version === "string" &&
					typeof data.plugin_version === "string"
				) {
					setV({ mcp: data.mcp_version, plugin: data.plugin_version })
				}
			})
			.catch(() => {
				/* silent — badge stays hidden */
			})
		return () => {
			cancelled = true
		}
	}, [])
	return v
}

export function ShellFooter(): React.ReactElement {
	const version = useRunningVersion()
	return (
		<FooterBar className="mt-12 pb-8 text-center text-xs text-stone-600 dark:text-stone-300">
			Powered by{" "}
			<a
				href="https://haikumethod.ai"
				target="_blank"
				rel="noopener noreferrer"
				className="text-teal-700 dark:text-teal-300 hover:underline"
			>
				H·AI·K·U
			</a>{" "}
			— Human + AI Knowledge Unification
			{version && (
				<>
					{" · "}
					<span
						className="text-stone-500 dark:text-stone-400 font-mono"
						title={
							version.mcp === version.plugin
								? `MCP + plugin: ${version.mcp}`
								: `MCP: ${version.mcp} · plugin: ${version.plugin}`
						}
					>
						v{version.mcp}
						{version.mcp !== version.plugin && ` (plugin v${version.plugin})`}
					</span>
				</>
			)}
		</FooterBar>
	)
}
