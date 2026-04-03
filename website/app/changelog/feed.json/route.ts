import {
	FEED_HEADERS_JSON,
	SITE_URL,
	generateJsonFeed,
	getChangelogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getChangelogFeedItems()
	const feed = generateJsonFeed(items, {
		title: "H·AI·K·U Changelog",
		feedUrl: `${SITE_URL}/changelog/feed.json`,
		description: "Release notes and version history for H·AI·K·U",
	})

	return new Response(JSON.stringify(feed, null, 2), {
		headers: FEED_HEADERS_JSON,
	})
}
