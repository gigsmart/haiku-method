import { ReviewApp, type SessionData, ThemeToggle } from "@haiku/review-ui"
import { createHttpWsTransport } from "@haiku/review-ui/transports"
import { useEffect, useMemo } from "react"

type PageKind = "review" | "question" | "direction"

function parseRoute(): { sessionId: string; kind: PageKind } | null {
	const path = window.location.pathname
	const m = path.match(/^\/(review|question|direction)\/([^/]+)/)
	return m ? { kind: m[1] as PageKind, sessionId: m[2] } : null
}

export function App() {
	const route = parseRoute()
	const sessionId = route?.sessionId
	const transport = useMemo(
		() => (sessionId ? createHttpWsTransport({ sessionId }) : null),
		[sessionId],
	)

	if (!route || !transport) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-stone-500">No session found in URL.</p>
			</div>
		)
	}

	return (
		<ReviewApp
			transport={transport}
			chrome={(inner, { title }) => (
				<Shell title={title} kind={route.kind}>
					{inner}
				</Shell>
			)}
		/>
	)
}

function Shell({
	title,
	kind,
	children,
}: { title: string; kind: PageKind; children: React.ReactNode }) {
	useEffect(() => {
		document.title = title
	}, [title])

	const mainClass =
		kind === "review"
			? "px-4 sm:px-6 lg:px-8 py-6"
			: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"

	return (
		<>
			<header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-800">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
					<h1 className="text-lg font-semibold truncate">{title}</h1>
					<ThemeToggle />
				</div>
			</header>
			<main id="main-content" className={mainClass}>
				{children}
			</main>
			<footer className="mt-12 pb-8 text-center text-xs text-stone-500 dark:text-stone-500">
				Powered by{" "}
				<a
					href="https://haikumethod.ai"
					target="_blank"
					rel="noopener noreferrer"
					className="text-teal-600 dark:text-teal-400 hover:underline"
				>
					H·AI·K·U
				</a>{" "}
				— Human + AI Knowledge Unification
			</footer>
		</>
	)
}

// Keep the type import alive for consumers that wire custom chrome.
export type { SessionData }
