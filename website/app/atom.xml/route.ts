import {
	FEED_HEADERS_ATOM,
	SITE_URL,
	generateAtom,
	getCombinedFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getCombinedFeedItems()
	const atom = generateAtom(items, {
		title: "H·AI·K·U",
		selfUrl: `${SITE_URL}/atom.xml`,
	})

	return new Response(atom.trim(), { headers: FEED_HEADERS_ATOM })
}
