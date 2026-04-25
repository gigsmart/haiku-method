"use client"

import { useCallback, useEffect } from "react"
import type { HaikuAsset } from "@/lib/browse/types"
import { AuthenticatedMedia } from "./AuthenticatedMedia"

interface Props {
	asset: HaikuAsset
	host: string
	onClose: () => void
}

/** Resolve a rawUrl to absolute for the download link */
function resolveUrl(rawUrl: string, host: string): string {
	if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
		return rawUrl
	}
	return `https://${host}${rawUrl}`
}

export function AssetLightbox({ asset, host, onClose }: Props) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			}
		},
		[onClose],
	)

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown)
		// Prevent background scrolling
		document.body.style.overflow = "hidden"
		return () => {
			document.removeEventListener("keydown", handleKeyDown)
			document.body.style.overflow = ""
		}
	}, [handleKeyDown])

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose()
			}}
			role="dialog"
			aria-modal="true"
			aria-label={`Asset preview: ${asset.name}`}
		>
			<div className="relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-stone-900">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
					<div className="min-w-0 flex-1">
						<h3 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
							{asset.name}
						</h3>
						<p className="truncate text-xs text-stone-500 dark:text-stone-400">
							{asset.path}
						</p>
					</div>
					<div className="ml-4 flex items-center gap-2">
						<a
							href={resolveUrl(asset.rawUrl, host)}
							target="_blank"
							rel="noopener noreferrer"
							className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
						>
							Download
						</a>
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
							aria-label="Close"
						>
							<svg
								className="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-4">
					<AuthenticatedMedia
						rawUrl={asset.rawUrl}
						name={asset.name}
						host={host}
						fullSize
						className="rounded-lg"
					/>
				</div>
			</div>
		</div>
	)
}
