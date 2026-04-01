import {
	FEED_HEADERS_XML,
	SITE_URL,
	generateRss,
	getBlogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getBlogFeedItems()
	const rss = generateRss(items, {
		title: "AI-DLC Blog",
		selfUrl: `${SITE_URL}/blog/feed.xml`,
		description: "Blog posts from the AI-DLC project",
	})

	return new Response(rss.trim(), { headers: FEED_HEADERS_XML })
}
