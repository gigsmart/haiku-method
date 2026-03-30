import { getAllBlogPosts } from "@/lib/blog"
import { getAllDocs } from "@/lib/docs"

export const dynamic = "force-static"
export const revalidate = false

const SITE_URL = "https://ai-dlc.dev"

function formatDate(date: Date): string {
	return date.toISOString().split("T")[0]
}

export async function GET() {
	const now = new Date()

	// Static pages
	const staticPages = [
		{ url: SITE_URL, changefreq: "weekly", priority: "1.0" },
		{ url: `${SITE_URL}/docs/`, changefreq: "weekly", priority: "0.9" },
		{ url: `${SITE_URL}/docs/installation/`, changefreq: "monthly", priority: "0.9" },
		{ url: `${SITE_URL}/blog/`, changefreq: "daily", priority: "0.9" },
		{ url: `${SITE_URL}/paper/`, changefreq: "monthly", priority: "0.8" },
		{ url: `${SITE_URL}/changelog/`, changefreq: "weekly", priority: "0.7" },
	]

	// Blog posts
	const posts = getAllBlogPosts()
	const blogUrls = posts.map((post) => ({
		url: `${SITE_URL}/blog/${post.slug}/`,
		lastmod: formatDate(new Date(post.date)),
		changefreq: "monthly",
		priority: "0.7",
	}))

	// Documentation pages
	const docs = getAllDocs()
	const docUrls = docs.map((doc) => ({
		url: `${SITE_URL}/docs/${doc.slug}/`,
		lastmod: formatDate(now),
		changefreq: "weekly",
		priority: "0.8",
	}))

	const allUrls = [
		...staticPages.map((page) => ({
			...page,
			lastmod: formatDate(now),
		})),
		...blogUrls,
		...docUrls,
	]

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
	.map(
		(url) => `  <url>
    <loc>${url.url}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
	)
	.join("\n")}
</urlset>`

	return new Response(sitemap, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	})
}
