import { useState } from "react"
import { withAuthQuery } from "../../../api/auth"
import { Card, SectionHeading } from "../../../atoms/Card"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../organisms/InlineComments"
import type { OutputArtifact } from "../../../types"
import { DeclaringUnitsBanner } from "./DeclaringUnitsBanner"
import { markdownToSimpleHtml } from "./section-helpers"

/**
 * Tunnel-served asset paths whose responses require the JWT gate
 * (FB-30). External http/https URLs pass through untouched.
 */
const TUNNEL_ASSET_PREFIXES = [
	"/files/",
	"/mockups/",
	"/wireframe/",
	"/stage-artifacts/",
	"/question-image/",
]

function authedAssetUrl(url: string | undefined | null): string {
	if (!url) return ""
	return TUNNEL_ASSET_PREFIXES.some((p) => url.startsWith(p))
		? withAuthQuery(url)
		: url
}

/**
 * OutputArtifactsTab — renders the Outputs tab inside the intent review.
 *
 * Groups output artifacts by stage, renders markdown bodies through
 * the inline-comments surface, HTML bodies in a sandboxed iframe, and
 * image artifacts with a click-to-expand lightbox overlay.
 *
 * Extracted from the legacy `components/ReviewPage.tsx` monolith as
 * part of the FB-22 split so `IntentReview` stays under the 400 LOC
 * module budget.
 */
export function OutputArtifactsTab({
	artifacts,
	onInlineCommentsChange,
	outputDeclaredBy,
	onUnitClick,
}: {
	artifacts: OutputArtifact[]
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
	/** Map of intent-relative path → declaring unit slugs. Server-built;
	 *  passed through so the banner can render above each card. */
	outputDeclaredBy?: Record<string, string[]>
	/** Click handler for declaring-unit badges. The parent decides
	 *  what "open this unit" means — typically scrolls to / expands
	 *  the unit's row inside the Units tab. */
	onUnitClick?: (unitSlug: string) => void
}) {
	const [expandedImage, setExpandedImage] = useState<string | null>(null)

	if (artifacts.length === 0) {
		return (
			<Card>
				<p className="text-stone-500 dark:text-stone-400 italic">
					No output artifacts available.
				</p>
			</Card>
		)
	}

	// Group by stage
	const stageOrder: string[] = []
	const byStage = new Map<string, OutputArtifact[]>()
	for (const a of artifacts) {
		if (!byStage.has(a.stage)) {
			byStage.set(a.stage, [])
			stageOrder.push(a.stage)
		}
		byStage.get(a.stage)?.push(a)
	}

	return (
		<>
			<div className="flex gap-6 items-start">
				{/* Sticky sidebar TOC */}
				<div className="hidden lg:block w-56 flex-shrink-0 self-start">
					<div className="sticky top-20">
						<nav className="text-sm space-y-1">
							<h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">
								Contents
							</h3>
							{artifacts.map((a, i) => (
								<a
									key={`oa-${a.stage}-${a.name}`}
									href={`#output-${i}`}
									className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
								>
									{a.stage}: {a.name}
								</a>
							))}
						</nav>
					</div>
				</div>

				{/* Content area */}
				<div className="flex-1 min-w-0">
					{stageOrder.map((stage) => {
						const stageArtifacts = byStage.get(stage) || []
						return (
							<div key={stage}>
								<h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3 mt-6 first:mt-0">
									{stage.charAt(0).toUpperCase() + stage.slice(1)}
								</h3>
								{stageArtifacts.map((a, _i) => {
									const globalIndex = artifacts.indexOf(a)
									if (a.type === "markdown" && a.content) {
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<SectionHeading>{a.name}</SectionHeading>
												<DeclaringUnitsBanner
													intentRelativePath={a.intentRelativePath}
													declaredBy={outputDeclaredBy}
													onUnitClick={onUnitClick}
												/>
												<InlineComments
													htmlContent={markdownToSimpleHtml(a.content)}
													onCommentsChange={onInlineCommentsChange}
												/>
											</Card>
										)
									}
									if (a.type === "html" && a.content) {
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<div className="flex items-center justify-between mb-3">
													<SectionHeading>{a.name}</SectionHeading>
													{a.relativePath && (
														<a
															href={authedAssetUrl(a.relativePath)}
															target="_blank"
															rel="noopener noreferrer"
															className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
														>
															View Full Size &#8599;
														</a>
													)}
												</div>
												<DeclaringUnitsBanner
													intentRelativePath={a.intentRelativePath}
													declaredBy={outputDeclaredBy}
													onUnitClick={onUnitClick}
												/>
												<iframe
													srcDoc={a.content}
													sandbox="allow-scripts allow-same-origin"
													className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
													title={a.name}
												/>
											</Card>
										)
									}
									if (a.type === "image" && a.relativePath) {
										const authedPath = authedAssetUrl(a.relativePath)
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<div className="flex items-center justify-between mb-3">
													<SectionHeading>{a.name}</SectionHeading>
													<a
														href={authedPath}
														target="_blank"
														rel="noopener noreferrer"
														className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
													>
														Open in new tab &#8599;
													</a>
												</div>
												<DeclaringUnitsBanner
													intentRelativePath={a.intentRelativePath}
													declaredBy={outputDeclaredBy}
													onUnitClick={onUnitClick}
												/>
												<button
													type="button"
													onClick={() =>
														setExpandedImage(
															expandedImage === a.relativePath
																? null
																: (a.relativePath ?? null),
														)
													}
													className="block cursor-pointer"
												>
													<img
														src={authedPath}
														alt={a.name}
														className={`border border-stone-200 dark:border-stone-700 rounded-lg transition-all ${
															expandedImage === a.relativePath
																? "max-w-full"
																: "max-w-md"
														}`}
													/>
												</button>
												{expandedImage !== a.relativePath && (
													<p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
														Click to expand
													</p>
												)}
											</Card>
										)
									}
									if (a.type === "file" && a.relativePath) {
										const authedPath = authedAssetUrl(a.relativePath)
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<div className="flex items-center justify-between mb-3">
													<SectionHeading>{a.name}</SectionHeading>
													<a
														href={authedPath}
														target="_blank"
														rel="noopener noreferrer"
														className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
													>
														Open file &#8599;
													</a>
												</div>
												<DeclaringUnitsBanner
													intentRelativePath={a.intentRelativePath}
													declaredBy={outputDeclaredBy}
													onUnitClick={onUnitClick}
												/>
												<p className="text-xs text-stone-500 dark:text-stone-400 mt-2 italic">
													No inline preview available for this file type. Open
													in a new tab to view.
												</p>
											</Card>
										)
									}
									return null
								})}
							</div>
						)
					})}
				</div>
			</div>

			{/* Image lightbox overlay */}
			{expandedImage && (
				<div
					className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
					onClick={() => setExpandedImage(null)}
					onKeyDown={(e) => e.key === "Escape" && setExpandedImage(null)}
					role="dialog"
					aria-label="Expanded image"
				>
					<img
						src={authedAssetUrl(expandedImage)}
						alt="Expanded artifact"
						className="max-w-full max-h-full object-contain rounded-lg"
					/>
				</div>
			)}
		</>
	)
}
