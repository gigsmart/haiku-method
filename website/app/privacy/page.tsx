import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import type { Metadata } from "next"
import ReactMarkdown from "react-markdown"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

export const metadata: Metadata = {
	title: "Privacy Policy - H·AI·K·U",
	description: "How H·AI·K·U handles your data",
}

function getPrivacyContent() {
	const fullPath = path.join(process.cwd(), "content/pages/privacy.md")
	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { content } = matter(fileContents)
	return content
}

export default function PrivacyPage() {
	const content = getPrivacyContent()

	return (
		<div className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
			<article>
				<header className="mb-8">
					<h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
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
