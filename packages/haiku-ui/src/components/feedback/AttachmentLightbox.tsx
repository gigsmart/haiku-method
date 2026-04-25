/**
 * AttachmentLightbox — full-screen modal showing a feedback's sidecar
 * attachment (annotated wireframe screenshot, design direction render,
 * etc.) at full resolution, paired with the comment text that was
 * left with it.
 *
 * Opened when the reviewer clicks an attachment `<img>` inside the
 * feedback body. The markdown-renderer override in `FeedbackItem`
 * intercepts the click and hands the src + title + comment up here.
 *
 * Close: ESC key, backdrop click, or the X button. Focus is restored
 * to the trigger element on unmount (handled by the caller via the
 * `onClose` callback + a ref kept on the opener).
 */

import { useEffect, useRef } from "react"

interface Props {
	src: string
	alt?: string
	/** Feedback title + body shown alongside the image so the reviewer
	 *  can read what they were commenting on without leaving the
	 *  lightbox. */
	title?: string
	body?: string
	onClose: () => void
}

export function AttachmentLightbox({
	src,
	alt,
	title,
	body,
	onClose,
}: Props): React.ReactElement {
	const closeBtnRef = useRef<HTMLButtonElement>(null)

	// ESC to close + initial focus on the close button for screen
	// readers / keyboard nav. Listener attached once per open.
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault()
				onClose()
			}
		}
		document.addEventListener("keydown", handleKey)
		closeBtnRef.current?.focus()
		// Freeze body scroll while the lightbox is up so the page
		// behind doesn't scroll under the reviewer's mouse.
		const prevOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			document.removeEventListener("keydown", handleKey)
			document.body.style.overflow = prevOverflow
		}
	}, [onClose])

	return (
		<div
			// biome-ignore lint/a11y/useSemanticElements: native <dialog> element still has inconsistent focus-trap semantics in ShadowDOM + routed-render contexts; role=dialog + explicit focus management is the safer path here
			role="dialog"
			aria-modal="true"
			aria-label={title ? `Attachment: ${title}` : "Attachment"}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
			onClick={(e) => {
				// Backdrop click closes; inner content click does not bubble.
				if (e.target === e.currentTarget) onClose()
			}}
			onKeyDown={(e) => {
				// Allow ESC here too so the handler fires even if the
				// document-level listener misses (e.g. focus on a
				// non-dialog element).
				if (e.key === "Escape") onClose()
			}}
		>
			<div className="relative w-[min(98vw,1800px)] max-h-[96vh] bg-white dark:bg-stone-900 rounded-lg shadow-2xl overflow-hidden flex flex-col">
				<div className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
					<div className="min-w-0">
						{title && (
							<h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
								{title}
							</h2>
						)}
						<p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
							Press <kbd className="font-mono text-[11px]">Esc</kbd> or click
							outside to close
						</p>
					</div>
					<button
						ref={closeBtnRef}
						type="button"
						onClick={onClose}
						className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:hover:text-stone-100 dark:hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
						aria-label="Close lightbox"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<title>Close</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
				<div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
					<div className="shrink-0 bg-stone-50 dark:bg-stone-950 flex items-center justify-center overflow-auto p-6 min-h-[70vh]">
						<img
							src={src}
							alt={alt ?? "Feedback attachment"}
							className="max-w-full max-h-[82vh] object-contain"
						/>
					</div>
					{body && body.trim().length > 0 && (
						<div className="shrink-0 border-t border-stone-200 dark:border-stone-800 px-6 py-4 bg-white dark:bg-stone-900">
							<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-2">
								Comment
							</p>
							<div className="text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap break-words leading-relaxed max-w-3xl">
								{body}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
