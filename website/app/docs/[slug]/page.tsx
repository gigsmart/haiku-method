import { getAllDocs, getDocBySlug } from "@/lib/docs"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const docs = getAllDocs()
	return docs.map((doc) => ({
		slug: doc.slug,
	}))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const resolvedParams = await params
	const doc = getDocBySlug(resolvedParams.slug)

	if (!doc) {
		return {
			title: "Page Not Found - AI-DLC",
		}
	}

	return {
		title: `${doc.title} - AI-DLC`,
		description: doc.description,
	}
}

export default async function DocPage({ params }: Props) {
	const resolvedParams = await params
	const doc = getDocBySlug(resolvedParams.slug)

	if (!doc) {
		notFound()
	}

	return (
		<article className="max-w-3xl">
			<div className="mb-8 lg:hidden">
				<Link
					href="/docs/"
					className="inline-flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
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
							d="M15 19l-7-7 7-7"
						/>
					</svg>
					Back to docs
				</Link>
			</div>

			<header className="mb-8">
				<h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
				{doc.description && (
					<p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
						{doc.description}
					</p>
				)}
			</header>

			<div className="prose prose-gray dark:prose-invert max-w-none">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeHighlight, rehypeSlug]}
				>
					{doc.content}
				</ReactMarkdown>
			</div>
		</article>
	)
}
