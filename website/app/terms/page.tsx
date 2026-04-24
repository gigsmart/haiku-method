import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import type { Metadata } from "next"
import ReactMarkdown from "react-markdown"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

export const metadata: Metadata = {
	title: "Terms of Service - H·AI·K·U",
	description: "Terms for using H·AI·K·U and haikumethod.ai",
}

function getTermsContent() {
	const fullPath = path.join(process.cwd(), "content/pages/terms.md")
	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { content } = matter(fileContents)
	return content
}

export default function TermsPage() {
	const content = getTermsContent()

	return (
		<div className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
			<article>
				<header className="mb-8">
					<h1 className="text-4xl font-bold tracking-tight">
						Terms of Service
					</h1>
				</header>
				<div className="prose prose-gray dark:prose-invert max-w-none">
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={[rehypeSlug]}
					>
						{content}
					</ReactMarkdown>
				</div>
			</article>
		</div>
	)
}
