import { getMainPaper } from "@/lib/papers"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import { PrintButton } from "./PrintButton"

export const metadata: Metadata = {
	title: "AI-DLC Paper - Print Version",
	description: "Print-friendly version of the AI-DLC methodology paper.",
	robots: {
		index: false,
		follow: false,
	},
}

export default function PrintPaperPage() {
	const paper = getMainPaper()

	if (!paper) {
		notFound()
	}

	return (
		<div className="print-page mx-auto max-w-4xl px-8 py-12">
			{/* Print header */}
			<header className="mb-8 border-b-2 border-gray-900 pb-6 dark:border-gray-100">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
					{paper.title}
				</h1>
				{paper.subtitle && (
					<p className="mt-2 text-xl text-gray-700 dark:text-gray-300">
						{paper.subtitle}
					</p>
				)}
				{paper.authors && (
					<p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
						{paper.authors.join(", ")} |{" "}
						{new Date(paper.date).toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
					</p>
				)}
			</header>

			{/* Print button (hidden in print) */}
			<div className="mb-8 print:hidden">
				<PrintButton />
				<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
					Use your browser&apos;s print dialog to save as PDF. Set margins to
					&quot;Minimum&quot; for best results.
				</p>
			</div>

			{/* Content */}
			<article className="prose prose-print max-w-none">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeSlug, rehypeHighlight]}
				>
					{paper.content}
				</ReactMarkdown>
			</article>

			{/* Print footer */}
			<footer className="mt-12 border-t-2 border-gray-900 pt-4 text-center text-sm text-gray-600 dark:border-gray-100 dark:text-gray-400">
				<p>AI-DLC - https://ai-dlc.dev</p>
				<p>The Bushido Collective</p>
			</footer>
		</div>
	)
}
