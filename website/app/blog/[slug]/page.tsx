import { ArticleJsonLd, BreadcrumbJsonLd } from "@/app/components"
import { getAllBlogPosts, getBlogPostBySlug } from "@/lib/blog"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

const SITE_URL = "https://ai-dlc.dev"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const posts = getAllBlogPosts()
	return posts.map((post) => ({
		slug: post.slug,
	}))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const resolvedParams = await params
	const post = getBlogPostBySlug(resolvedParams.slug)

	if (!post) {
		return {
			title: "Post Not Found",
		}
	}

	const postUrl = `${SITE_URL}/blog/${post.slug}/`

	return {
		title: post.title,
		description: post.description,
		authors: post.author ? [{ name: post.author }] : undefined,
		openGraph: {
			title: post.title,
			description: post.description || "",
			url: postUrl,
			type: "article",
			publishedTime: new Date(post.date).toISOString(),
			authors: post.author ? [post.author] : undefined,
			images: [
				{
					url: "/og-image.png",
					width: 1200,
					height: 630,
					alt: post.title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description || "",
			images: ["/og-image.png"],
		},
		alternates: {
			canonical: postUrl,
		},
	}
}

function formatDate(dateString: string): string {
	const date = new Date(dateString)
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	})
}

export default async function BlogPostPage({ params }: Props) {
	const resolvedParams = await params
	const post = getBlogPostBySlug(resolvedParams.slug)

	if (!post) {
		notFound()
	}

	const postUrl = `${SITE_URL}/blog/${post.slug}/`

	return (
		<article>
			<ArticleJsonLd
				title={post.title}
				description={post.description || ""}
				url={postUrl}
				datePublished={new Date(post.date).toISOString()}
				authorName={post.author}
				publisherName="AI-DLC"
				publisherLogo={`${SITE_URL}/logo.png`}
				image={`${SITE_URL}/og-image.png`}
			/>
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: SITE_URL },
					{ name: "Blog", url: `${SITE_URL}/blog/` },
					{ name: post.title, url: postUrl },
				]}
			/>
			<Link
				href="/blog/"
				className="mb-8 inline-flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
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
				Back to blog
			</Link>

			<header className="mb-8">
				<time className="text-sm text-gray-500 dark:text-gray-500">
					{formatDate(post.date)}
				</time>
				<h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
					{post.title}
				</h1>
				{post.author && (
					<p className="mt-4 text-gray-600 dark:text-gray-400">
						By {post.author}
					</p>
				)}
			</header>

			<div className="prose prose-gray dark:prose-invert max-w-none">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeHighlight, rehypeSlug]}
				>
					{post.content}
				</ReactMarkdown>
			</div>
		</article>
	)
}
