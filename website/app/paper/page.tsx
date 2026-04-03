import { getMainPaper, getPaperTOC } from "@/lib/papers"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PaperChangesProvider } from "../components/PaperChangesContext"
import { PaperContent } from "./PaperContent"
import PaperRevisionHistory from "./PaperRevisionHistory"

export const metadata: Metadata = {
	title: "AI-DLC Paper",
	description:
		"The complete AI-Driven Development Lifecycle methodology paper - a comprehensive guide to AI-native software development.",
	openGraph: {
		title: "AI-DLC Paper - Complete Methodology",
		description:
			"A comprehensive methodology reimagining software development for the era of autonomous AI agents.",
	},
}

export default function PaperPage() {
	const paper = getMainPaper()

	if (!paper) {
		notFound()
	}

	const toc = getPaperTOC(paper)

	return (
		<PaperChangesProvider sectionChanges={[]}>
			<div className="mx-auto max-w-7xl px-4 py-8">
				{/* Header */}
				<div className="mb-8 border-b border-gray-200 pb-8 dark:border-gray-800">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h1 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
								{paper.title}
							</h1>
							{paper.subtitle && (
								<p className="mt-2 text-xl text-gray-600 dark:text-gray-400">
									{paper.subtitle}
								</p>
							)}
							{paper.authors && paper.authors.length > 0 && (
								<p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
									By {paper.authors.join(", ")} |{" "}
									{new Date(paper.date).toLocaleDateString("en-US", {
										year: "numeric",
										month: "long",
										day: "numeric",
									})}
								</p>
							)}
						</div>
						<div className="flex gap-2">
							<a
								href="/paper/print"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
							>
								<svg
									className="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
									/>
								</svg>
								Print / PDF
							</a>
						</div>
					</div>

					{/* Revision History */}
					<div className="mt-6">
						<PaperRevisionHistory slug="ai-dlc-2026" />
					</div>
				</div>

				{/* Main content with TOC sidebar */}
				<PaperContent content={paper.content} toc={toc} />
			</div>
		</PaperChangesProvider>
	)
}
