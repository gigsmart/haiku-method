"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { HaikuAsset } from "@/lib/browse/types"
import { AuthenticatedMedia } from "./AuthenticatedMedia"

interface Props {
	children: string
	/** Intent assets for resolving relative image references */
	assets?: HaikuAsset[]
	/** Host for authenticated image loading */
	host?: string
	/** Base path for resolving relative links (e.g., ".haiku/intents/my-intent") */
	basePath?: string
}

/**
 * Markdown renderer for browse that resolves broken relative image paths
 * by matching against the intent's assets array.
 *
 * If a markdown image like `![Alt](designs/foo.png)` matches an asset
 * by filename or relative path, it renders via AuthenticatedMedia with
 * the asset's authenticated rawUrl.
 */
export function BrowseMarkdown({ children, assets, host, basePath }: Props) {
	// Build lookup maps for matching image refs to assets
	const assetByName = new Map<string, HaikuAsset>()
	const assetByRelPath = new Map<string, HaikuAsset>()
	const basePrefix = basePath ? `${basePath}/` : ""

	if (assets) {
		for (const asset of assets) {
			// Match by filename
			assetByName.set(asset.name.toLowerCase(), asset)
			// Match by relative path from intent root
			if (basePrefix && asset.path.startsWith(basePrefix)) {
				assetByRelPath.set(asset.path.slice(basePrefix.length).toLowerCase(), asset)
			}
			// Also match full path
			assetByRelPath.set(asset.path.toLowerCase(), asset)
		}
	}

	function findAsset(src: string): HaikuAsset | null {
		if (!src) return null
		const cleaned = src.replace(/^\.\//, "").toLowerCase()

		// Try exact relative path match
		const byPath = assetByRelPath.get(cleaned)
		if (byPath) return byPath

		// Try filename match
		const fileName = cleaned.split("/").pop() || ""
		const byName = assetByName.get(fileName)
		if (byName) return byName

		// Try partial path match (last 2-3 segments)
		for (const [key, asset] of assetByRelPath) {
			if (key.endsWith(cleaned) || cleaned.endsWith(key)) return asset
		}

		return null
	}

	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				img: ({ src, alt }) => {
					const srcStr = typeof src === "string" ? src : ""
					// Skip absolute URLs — they're already valid
					if (srcStr.startsWith("http://") || srcStr.startsWith("https://") || srcStr.startsWith("data:")) {
						return <img src={srcStr} alt={alt || ""} className="my-2 max-w-full rounded-lg" />
					}

					// Try to match against intent assets
					const matched = findAsset(srcStr)
					if (matched && host) {
						return (
							<span className="my-3 block">
								<AuthenticatedMedia
									rawUrl={matched.rawUrl}
									name={matched.name}
									host={host}
									className="max-w-full rounded-lg"
									fullSize
								/>
								{alt && (
									<span className="mt-1 block text-center text-xs italic text-stone-400">{alt}</span>
								)}
							</span>
						)
					}

					// Fallback — show broken image placeholder with alt text
					return (
						<span className="my-2 flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800">
							<span className="text-lg">🖼️</span>
							<span>{alt || srcStr || "Image"}</span>
						</span>
					)
				},
			}}
		>
			{children}
		</ReactMarkdown>
	)
}
