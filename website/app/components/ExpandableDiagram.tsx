"use client"

import { useCallback, useEffect, useState } from "react"
import { Mermaid } from "./Mermaid"

interface ExpandableDiagramProps {
	chart: string
	caption?: string
}

export function ExpandableDiagram({ chart, caption }: ExpandableDiagramProps) {
	const [expanded, setExpanded] = useState(false)

	const close = useCallback(() => setExpanded(false), [])

	useEffect(() => {
		if (!expanded) return
		document.body.style.overflow = "hidden"
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close()
		}
		document.addEventListener("keydown", onKey)
		return () => {
			document.body.style.overflow = ""
			document.removeEventListener("keydown", onKey)
		}
	}, [expanded, close])

	return (
		<figure className="not-prose group relative my-8 rounded-xl border border-stone-200 bg-stone-50 p-6 dark:border-stone-800 dark:bg-stone-900/50">
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className="absolute top-3 right-3 z-10 rounded-md border border-stone-300 bg-white/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-stone-600 backdrop-blur transition hover:border-blue-500 hover:text-blue-600 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-400 dark:hover:border-blue-400 dark:hover:text-blue-400"
				aria-label="Expand diagram"
			>
				⛶ Expand
			</button>
			<Mermaid chart={chart} />
			{caption ? (
				<figcaption className="mt-3 text-center text-sm text-stone-500 italic dark:text-stone-400">
					{caption}
				</figcaption>
			) : null}

			{expanded ? (
				<div
					className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-6 backdrop-blur-md"
					onClick={(e) => {
						if (e.target === e.currentTarget) close()
					}}
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						onClick={close}
						className="fixed top-6 right-6 z-[1001] rounded-md border border-stone-600 bg-stone-800 px-4 py-2 font-mono text-xs uppercase tracking-wider text-stone-100 transition hover:border-blue-400 hover:text-blue-400"
					>
						✕ Close
					</button>
					<div
						onClick={(e) => e.stopPropagation()}
						className="relative flex h-[min(90vh,900px)] w-[min(95vw,1400px)] items-center justify-center overflow-auto rounded-xl border border-stone-700 bg-stone-50 p-8 shadow-2xl dark:bg-stone-900"
					>
						<div className="flex w-full items-center justify-center [&_.mermaid]:w-full [&>div]:!max-w-none [&_svg]:!h-auto [&_svg]:!max-h-[calc(90vh-4rem)] [&_svg]:!w-full [&_svg]:!max-w-full">
							<Mermaid chart={chart} />
						</div>
					</div>
				</div>
			) : null}
		</figure>
	)
}
