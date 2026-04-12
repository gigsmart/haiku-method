import { getAllBlogPosts } from "@/lib/blog"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Blog - H·AI·K·U",
	description: "News and updates about H·AI·K·U and structured human-AI collaboration.",
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
			<p className="mb-12 text-lg text-stone-600 dark:text-stone-400">
				News and updates about H·AI·K·U and structured human-AI collaboration.
			</p>

			{posts.length === 0 ? (
				<div className="rounded-lg border border-stone-200 bg-stone-50 p-8 text-center dark:border-stone-800 dark:bg-stone-900">
					<p className="text-stone-600 dark:text-stone-400">
						No blog posts yet. Check back soon!
					</p>
				</div>
			) : (
				<div className="space-y-8">
					{posts.map((post) => (
						<article
							key={post.slug}
							className="rounded-lg border border-stone-200 p-6 transition hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700"
						>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500 dark:text-stone-500">
								<time dateTime={new Date(post.date).toISOString()}>
									{formatDate(post.date)}
								</time>
								{post.category && (
									<>
										<span aria-hidden="true">·</span>
										<span className="font-medium text-teal-700 uppercase tracking-wider text-xs dark:text-teal-400">
											{post.category}
										</span>
									</>
								)}
							</div>
							<h2 className="mt-2 text-2xl font-semibold">
								<Link
									href={`/blog/${post.slug}/`}
									className="hover:text-teal-600 dark:hover:text-teal-400"
								>
									{post.title}
								</Link>
							</h2>
							{post.description && (
								<p className="mt-2 text-stone-600 dark:text-stone-400">
									{post.description}
								</p>
							)}
							{post.tags && post.tags.length > 0 && (
								<div className="mt-4 flex flex-wrap gap-2">
									{post.tags.map((tag) => (
										<span
											key={tag}
											className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 font-mono text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
										>
											{tag}
										</span>
									))}
								</div>
							)}
							{post.author && (
								<p className="mt-4 text-sm text-stone-500">By {post.author}</p>
							)}
						</article>
					))}
				</div>
			)}
		</div>
	)
}
