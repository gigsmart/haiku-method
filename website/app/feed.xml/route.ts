import {
	FEED_HEADERS_XML,
	SITE_URL,
	generateRss,
	getCombinedFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getCombinedFeedItems()
	const rss = generateRss(items, {
		title: "H·AI·K·U",
		selfUrl: `${SITE_URL}/feed.xml`,
	})

	return new Response(rss.trim(), { headers: FEED_HEADERS_XML })
}
