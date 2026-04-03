import { getAllBlogPosts } from "@/lib/blog"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Blog - AI-DLC",
	description: "News and updates about AI-DLC and AI-driven development.",
}

function formatDate(dateString: string): string {
	const date = new Date(dateString)
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	})
}

export default function BlogPage() {
	const posts = getAllBlogPosts()

	return (
		<div>
			<h1 className="mb-4 text-4xl font-bold tracking-tight">Blog</h1>
			<p className="mb-12 text-lg text-gray-600 dark:text-gray-400">
				News and updates about AI-DLC and AI-driven development.
			</p>

			{posts.length === 0 ? (
				<div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-900">
					<p className="text-gray-600 dark:text-gray-400">
						No blog posts yet. Check back soon!
					</p>
				</div>
			) : (
				<div className="space-y-8">
					{posts.map((post) => (
						<article
							key={post.slug}
							className="rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
						>
							<time className="text-sm text-gray-500 dark:text-gray-500">
								{formatDate(post.date)}
							</time>
							<h2 className="mt-2 text-2xl font-semibold">
								<Link
									href={`/blog/${post.slug}/`}
									className="hover:text-blue-600 dark:hover:text-blue-400"
								>
									{post.title}
								</Link>
							</h2>
							{post.description && (
								<p className="mt-2 text-gray-600 dark:text-gray-400">
									{post.description}
								</p>
							)}
							{post.author && (
								<p className="mt-4 text-sm text-gray-500">By {post.author}</p>
							)}
						</article>
					))}
				</div>
			)}
		</div>
	)
}
