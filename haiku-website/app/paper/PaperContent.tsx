"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import rehypeRaw from "rehype-raw"

export function PaperContent({ content }: { content: string }) {
	// Strip mermaid code blocks since we can't render them in static export
	const cleaned = content.replace(
		/```mermaid[\s\S]*?```/g,
		"*(Diagram available in the source document)*"
	)

	return (
		<article className="prose prose-stone max-w-none prose-headings:scroll-mt-20 prose-h2:border-t prose-h2:border-stone-200 prose-h2:pt-8 prose-h2:mt-12 prose-a:text-teal-600 hover:prose-a:text-teal-700">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeSlug, rehypeRaw]}
			>
				{cleaned}
			</ReactMarkdown>
		</article>
	)
}
