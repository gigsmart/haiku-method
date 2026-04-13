"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mermaid } from "./Mermaid"
import { canRenderAsFlow } from "./mermaid-flow/detect"

interface ExpandableDiagramProps {
	chart: string
	caption?: string
}

export function ExpandableDiagram({ chart, caption }: ExpandableDiagramProps) {
	if (canRenderAsFlow(chart)) {
		return (
			<figure className="not-prose my-8 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900/50">
				<Mermaid chart={chart} height={560} />
				{caption ? (
					<figcaption className="mt-3 text-center text-sm text-stone-500 italic dark:text-stone-400">
						{caption}
					</figcaption>
				) : null}
			</figure>
		)
	}
	return <LegacyExpandableDiagram chart={chart} caption={caption} />
}

function LegacyExpandableDiagram({ chart, caption }: ExpandableDiagramProps) {
	const [expanded, setExpanded] = useState(false)
	const expandButtonRef = useRef<HTMLButtonElement>(null)
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const modalRef = useRef<HTMLDivElement>(null)
	const mermaidRef = useRef<HTMLDivElement>(null)
	const hasOpenedRef = useRef(false)
	const [modalSvg, setModalSvg] = useState("")

	const close = useCallback(() => setExpanded(false), [])

	useEffect(() => {
		if (!expanded) {
			// Return focus to the trigger when the modal closes, but not on initial mount
			if (hasOpenedRef.current) {
				expandButtonRef.current?.focus()
			}
			return
		}

		hasOpenedRef.current = true
		document.body.style.overflow = "hidden"
		// Move focus to the close button when the modal opens
		closeButtonRef.current?.focus()

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				close()
				return
			}
			// Focus trap: cycle Tab within the modal
			if (e.key === "Tab" && modalRef.current) {
				const focusable = modalRef.current.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
				)
				if (focusable.length === 0) return
				const first = focusable[0]
				const last = focusable[focusable.length - 1]
				const active = document.activeElement as HTMLElement | null
				if (e.shiftKey && active === first) {
					e.preventDefault()
					last.focus()
				} else if (!e.shiftKey && active === last) {
					e.preventDefault()
					first.focus()
				}
			}
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
				ref={expandButtonRef}
				type="button"
				onClick={() => {
					// Capture the inline SVG before opening the modal so we don't
					// mount a second <Mermaid> instance (which races on the global
					// mermaid.initialize singleton).
					const svg = mermaidRef.current?.querySelector("svg")
					if (svg) setModalSvg(svg.outerHTML)
					setExpanded(true)
				}}
				className="absolute top-3 right-3 z-10 rounded-md border border-stone-300 bg-white/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-stone-600 backdrop-blur transition hover:border-blue-500 hover:text-blue-600 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-400 dark:hover:border-blue-400 dark:hover:text-blue-400"
				aria-label="Expand diagram"
				aria-haspopup="dialog"
				aria-expanded={expanded}
			>
				⛶ Expand
			</button>
			<div ref={mermaidRef}>
				<Mermaid chart={chart} />
			</div>
			{caption ? (
				<figcaption className="mt-3 text-center text-sm text-stone-500 italic dark:text-stone-400">
					{caption}
				</figcaption>
			) : null}

			{expanded ? (
				<div
					ref={modalRef}
					className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-6 backdrop-blur-md"
					onClick={(e) => {
						if (e.target === e.currentTarget) close()
					}}
					role="dialog"
					aria-modal="true"
					aria-label={caption ?? "Expanded diagram"}
				>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={close}
						className="fixed top-6 right-6 z-[1001] rounded-md border border-stone-600 bg-stone-800 px-4 py-2 font-mono text-xs uppercase tracking-wider text-stone-100 transition hover:border-blue-400 hover:text-blue-400"
						aria-label="Close expanded diagram"
					>
						✕ Close
					</button>
					<div
						onClick={(e) => e.stopPropagation()}
						className="relative flex h-[min(90vh,900px)] w-[min(95vw,1400px)] items-center justify-center overflow-auto rounded-xl border border-stone-700 bg-stone-50 p-8 shadow-2xl dark:bg-stone-900"
					>
						<div
							className="flex w-full items-center justify-center [&_svg]:!h-auto [&_svg]:!max-h-[calc(90vh-4rem)] [&_svg]:!w-full [&_svg]:!max-w-full"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: Reusing Mermaid's safe SVG output
							dangerouslySetInnerHTML={{ __html: modalSvg }}
						/>
					</div>
				</div>
			) : null}
		</figure>
	)
}
