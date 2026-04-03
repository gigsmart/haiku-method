import {
	FEED_HEADERS_ATOM,
	SITE_URL,
	generateAtom,
	getChangelogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getChangelogFeedItems()
	const atom = generateAtom(items, {
		title: "AI-DLC Changelog",
		selfUrl: `${SITE_URL}/changelog/atom.xml`,
		description: "Release notes and version history for AI-DLC",
	})

	return new Response(atom.trim(), { headers: FEED_HEADERS_ATOM })
}
