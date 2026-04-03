import {
	FEED_HEADERS_ATOM,
	SITE_URL,
	generateAtom,
	getBlogFeedItems,
} from "@/lib/feed"

export const dynamic = "force-static"
export const revalidate = false

export async function GET() {
	const items = getBlogFeedItems()
	const atom = generateAtom(items, {
		title: "AI-DLC Blog",
		selfUrl: `${SITE_URL}/blog/atom.xml`,
		description: "Blog posts from the AI-DLC project",
	})

	return new Response(atom.trim(), { headers: FEED_HEADERS_ATOM })
}
