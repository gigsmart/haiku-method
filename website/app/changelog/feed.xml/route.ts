import {
	FEED_HEADERS_XML,
	SITE_URL,
	generateRss,
	getChangelogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getChangelogFeedItems()
	const rss = generateRss(items, {
		title: "AI-DLC Changelog",
		selfUrl: `${SITE_URL}/changelog/feed.xml`,
		description: "Release notes and version history for AI-DLC",
	})

	return new Response(rss.trim(), { headers: FEED_HEADERS_XML })
}
