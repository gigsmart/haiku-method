"use client"

import { useEffect, useRef, useState } from "react"
import { getToken } from "@/lib/browse/auth"

/** File extension to MIME type mapping for common binary assets */
function mimeFromExt(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() || ""
	const map: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
		pdf: "application/pdf",
		html: "text/html",
		htm: "text/html",
	}
	return map[ext] || "application/octet-stream"
}

function isImageMime(mime: string): boolean {
	return mime.startsWith("image/")
}

function isPdfMime(mime: string): boolean {
	return mime === "application/pdf"
}

function isHtmlMime(mime: string): boolean {
	return mime === "text/html"
}

/** Resolve a rawUrl that may be relative (e.g., /org/project/-/raw/...) to an absolute URL */
function resolveUrl(rawUrl: string, host: string): string {
	if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
		return rawUrl
	}
	return `https://${host}${rawUrl}`
}

interface Props {
	rawUrl: string
	name: string
	host: string
	className?: string
	/** When true, render at full size (for lightbox). Otherwise render as thumbnail. */
	fullSize?: boolean
	onClick?: () => void
}

export function AuthenticatedMedia({
	rawUrl,
	name,
	host,
	className,
	fullSize,
	onClick,
}: Props) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const objectUrlRef = useRef<string | null>(null)

	const mime = mimeFromExt(name)
	const resolvedUrl = resolveUrl(rawUrl, host)

	useEffect(() => {
		let cancelled = false

		async function fetchAsset() {
			setLoading(true)
			setError(null)

			try {
				const token = getToken(host)
				const headers: Record<string, string> = {}
				if (token) {
					headers.Authorization = `Bearer ${token}`
				}

				const res = await fetch(resolvedUrl, { headers })
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`)
				}

				const blob = await res.blob()
				if (cancelled) return

				const url = URL.createObjectURL(blob)
				objectUrlRef.current = url
				setObjectUrl(url)
			} catch (e) {
				if (!cancelled) {
					setError((e as Error).message)
				}
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}

		fetchAsset()

		return () => {
			cancelled = true
			if (objectUrlRef.current) {
				URL.revokeObjectURL(objectUrlRef.current)
				objectUrlRef.current = null
			}
		}
	}, [resolvedUrl, host])

	if (loading) {
		return (
			<div
				className={`flex items-center justify-center bg-stone-100 dark:bg-stone-800 ${fullSize ? "min-h-[200px]" : "h-32"} ${className || ""}`}
			>
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
			</div>
		)
	}

	if (error) {
		return (
			<div
				className={`flex flex-col items-center justify-center gap-2 bg-stone-100 dark:bg-stone-800 p-4 ${fullSize ? "min-h-[100px]" : "h-32"} ${className || ""}`}
			>
				<p className="text-xs text-red-500">Failed to load</p>
				<a
					href={resolvedUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 underline"
				>
					Download
				</a>
			</div>
		)
	}

	if (!objectUrl) return null

	if (isImageMime(mime)) {
		if (onClick) {
			return (
				<button
					type="button"
					onClick={onClick}
					className={`${fullSize ? "max-h-[80vh] w-auto" : "h-32 w-full"} p-0 border-0 bg-transparent cursor-pointer`}
					aria-label={`Open ${name}`}
				>
					{/* biome-ignore lint/performance/noImgElement: authenticated blob URL (objectUrl) — next/image cannot access protected resources without a custom loader that replicates auth; keeping <img> preserves the existing flow */}
					<img
						src={objectUrl}
						alt={name}
						className={`${fullSize ? "max-h-[80vh] w-auto" : "h-32 w-full object-cover"} ${className || ""}`}
					/>
				</button>
			)
		}
		return (
			// biome-ignore lint/performance/noImgElement: authenticated blob URL — next/image is not compatible with the authenticated-fetch + createObjectURL flow
			<img
				src={objectUrl}
				alt={name}
				className={`${fullSize ? "max-h-[80vh] w-auto" : "h-32 w-full object-cover"} ${className || ""}`}
			/>
		)
	}

	if (isPdfMime(mime)) {
		if (fullSize) {
			return (
				<iframe
					src={objectUrl}
					title={name}
					className={`w-full min-h-[70vh] border-0 ${className || ""}`}
				/>
			)
		}
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex/onKeyDown are wired conditionally (only when onClick is set); static-analysis can't see the conditional so we assert the intent here
			<div
				onClick={onClick}
				onKeyDown={
					onClick
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onClick()
								}
							}
						: undefined
				}
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : undefined}
				className={`flex flex-col items-center justify-center gap-2 h-32 bg-stone-50 dark:bg-stone-800/50 ${onClick ? "cursor-pointer" : ""} ${className || ""}`}
			>
				<svg
					className="h-10 w-10 text-red-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
					/>
				</svg>
				<span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
					PDF
				</span>
			</div>
		)
	}

	if (isHtmlMime(mime)) {
		if (fullSize) {
			return (
				<iframe
					src={objectUrl}
					title={name}
					sandbox="allow-same-origin"
					className={`w-full min-h-[70vh] border-0 bg-white ${className || ""}`}
				/>
			)
		}
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: conditional role/tabIndex/onKeyDown wired when onClick is set
			<div
				onClick={onClick}
				onKeyDown={
					onClick
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									onClick()
								}
							}
						: undefined
				}
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : undefined}
				className={`flex flex-col items-center justify-center gap-2 h-32 bg-stone-50 dark:bg-stone-800/50 ${onClick ? "cursor-pointer" : ""} ${className || ""}`}
			>
				<svg
					className="h-10 w-10 text-orange-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
					/>
				</svg>
				<span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
					HTML
				</span>
			</div>
		)
	}

	// Other file types — show a generic file icon and download link
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: conditional role/tabIndex/onKeyDown wired when onClick is set
		<div
			onClick={onClick}
			onKeyDown={
				onClick
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault()
								onClick()
							}
						}
					: undefined
			}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			className={`flex flex-col items-center justify-center gap-2 ${fullSize ? "min-h-[100px]" : "h-32"} bg-stone-50 dark:bg-stone-800/50 ${onClick ? "cursor-pointer" : ""} ${className || ""}`}
		>
			<svg
				className="h-10 w-10 text-stone-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
				/>
			</svg>
			<span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
				{name.split(".").pop()?.toUpperCase() || "FILE"}
			</span>
			{fullSize && (
				<a
					href={objectUrl}
					download={name}
					className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 underline"
					onClick={(e) => e.stopPropagation()}
				>
					Download
				</a>
			)}
		</div>
	)
}
