import { Card, SectionHeading } from "../../../components/Card"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../components/InlineComments"
import type { KnowledgeFile, StageArtifact } from "../../../types"
import { markdownToSimpleHtml } from "./section-helpers"

/**
 * KnowledgeTab — renders the Knowledge tab inside the intent review.
 *
 * Sticky TOC sidebar (desktop only) over a card-per-file content
 * column. Knowledge files and stage artifacts each get their own
 * anchor so the TOC jumps target the right card.
 *
 * Extracted from the legacy `components/ReviewPage.tsx` monolith as
 * part of the FB-22 split so `IntentReview` stays under the 400 LOC
 * module budget.
 */
export function KnowledgeTab({
	knowledgeFiles,
	stageArtifacts,
	onInlineCommentsChange,
}: {
	knowledgeFiles: KnowledgeFile[]
	stageArtifacts: StageArtifact[]
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
}) {
	return (
		<div className="flex gap-6 items-start">
			{/* Sticky sidebar TOC */}
			<div className="hidden lg:block w-56 flex-shrink-0 self-start">
				<div className="sticky top-20">
					<nav className="text-sm space-y-1">
						<h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">
							Contents
						</h3>
						{knowledgeFiles.map((kf, i) => (
							<a
								key={`kf-${kf.name}`}
								href={`#knowledge-${i}`}
								className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
							>
								{kf.name}
							</a>
						))}
						{stageArtifacts.map((sa, i) => (
							<a
								key={`sa-${sa.stage}-${sa.name}`}
								href={`#artifact-${i}`}
								className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
							>
								{sa.stage}: {sa.name}
							</a>
						))}
					</nav>
				</div>
			</div>

			{/* Content area */}
			<div className="flex-1 min-w-0">
				{knowledgeFiles.map((kf, i) => (
					<Card key={`kf-${kf.name}`} id={`knowledge-${i}`}>
						<SectionHeading>{kf.name}</SectionHeading>
						<InlineComments
							htmlContent={markdownToSimpleHtml(kf.content)}
							onCommentsChange={onInlineCommentsChange}
						/>
					</Card>
				))}
				{stageArtifacts.map((sa, i) => (
					<Card key={`sa-${sa.stage}-${sa.name}`} id={`artifact-${i}`}>
						<SectionHeading>
							{sa.stage}: {sa.name}
						</SectionHeading>
						<InlineComments
							htmlContent={markdownToSimpleHtml(sa.content)}
							onCommentsChange={onInlineCommentsChange}
						/>
					</Card>
				))}
				{knowledgeFiles.length === 0 && stageArtifacts.length === 0 && (
					<Card>
						<p className="text-stone-500 dark:text-stone-400 italic">
							No knowledge files or stage artifacts available.
						</p>
					</Card>
				)}
			</div>
		</div>
	)
}
