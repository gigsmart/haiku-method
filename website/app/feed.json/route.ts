import {
	FEED_HEADERS_JSON,
	generateJsonFeed,
	getCombinedFeedItems,
	SITE_URL,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getCombinedFeedItems()
	const feed = generateJsonFeed(items, {
		title: "H·AI·K·U",
		feedUrl: `${SITE_URL}/feed.json`,
	})

	return new Response(JSON.stringify(feed, null, 2), {
		headers: FEED_HEADERS_JSON,
	})
}
