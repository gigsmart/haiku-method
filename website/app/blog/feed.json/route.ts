import {
	FEED_HEADERS_JSON,
	SITE_URL,
	generateJsonFeed,
	getBlogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getBlogFeedItems()
	const feed = generateJsonFeed(items, {
		title: "AI-DLC Blog",
		feedUrl: `${SITE_URL}/blog/feed.json`,
		description: "Blog posts from the AI-DLC project",
	})

	return new Response(JSON.stringify(feed, null, 2), {
		headers: FEED_HEADERS_JSON,
	})
}
