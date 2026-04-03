import { getAllBlogPosts } from "@/lib/blog"
import { getChangelog } from "@/lib/changelog"

export const SITE_URL = "https://ai-dlc.dev"
export const SITE_TITLE = "AI-DLC"
export const SITE_DESCRIPTION =
	"A methodology for the era of AI-driven software development — built from first principles, not retrofitted from the past"

export const FEED_HEADERS_XML = {
	"Content-Type": "application/xml; charset=utf-8",
	"Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const

export const FEED_HEADERS_ATOM = {
	"Content-Type": "application/atom+xml; charset=utf-8",
	"Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const

export const FEED_HEADERS_JSON = {
	"Content-Type": "application/feed+json; charset=utf-8",
	"Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

export function formatRFC822Date(dateString: string): string {
	const date = new Date(dateString)
	return date.toUTCString()
}

export function formatISO8601(dateString: string): string {
	const date = new Date(dateString)
	return date.toISOString()
}

/** A normalized feed item that can represent either a blog post or changelog entry. */
export interface FeedItem {
	title: string
	url: string
	date: string
	description: string
	author?: string
	category?: "blog" | "changelog"
}

export function getBlogFeedItems(): FeedItem[] {
	return getAllBlogPosts().map((post) => ({
		title: post.title,
		url: `${SITE_URL}/blog/${post.slug}/`,
		date: post.date,
		description: post.description || "",
		author: post.author,
		category: "blog" as const,
	}))
}

export function getChangelogFeedItems(): FeedItem[] {
	return getChangelog().map((entry) => {
		const description = entry.sections
			.map(
				(s) =>
					`${s.type}: ${s.items.join("; ")}`,
			)
			.join(". ")

		return {
			title: `v${entry.version}`,
			url: `${SITE_URL}/changelog/#${entry.version}`,
			date: entry.date,
			description,
			category: "changelog" as const,
		}
	})
}

/** Returns items sorted newest-first by date. */
export function getCombinedFeedItems(): FeedItem[] {
	const items = [...getBlogFeedItems(), ...getChangelogFeedItems()]
	return items.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	)
}

// --- Feed generators ---

export function generateRss(
	items: FeedItem[],
	opts: { title: string; selfUrl: string; description?: string },
): string {
	const rssItems = items
		.map(
			(item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${formatRFC822Date(item.date)}</pubDate>
      <description>${escapeXml(item.description)}</description>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
      ${item.category ? `<category>${escapeXml(item.category)}</category>` : ""}
    </item>`,
		)
		.join("\n")

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(opts.title)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(opts.description || SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatRFC822Date(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${opts.selfUrl}" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`
}

export function generateAtom(
	items: FeedItem[],
	opts: { title: string; selfUrl: string; description?: string },
): string {
	const entries = items
		.map(
			(item) => `
  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.url)}" rel="alternate" type="text/html"/>
    <id>${escapeXml(item.url)}</id>
    <published>${formatISO8601(item.date)}</published>
    <updated>${formatISO8601(item.date)}</updated>
    <summary>${escapeXml(item.description)}</summary>
    ${item.author ? `<author><name>${escapeXml(item.author)}</name></author>` : ""}
    ${item.category ? `<category term="${escapeXml(item.category)}"/>` : ""}
  </entry>`,
		)
		.join("\n")

	const latestDate =
		items.length > 0
			? formatISO8601(
					items.reduce((max, item) => (item.date > max ? item.date : max), items[0].date),
				)
			: formatISO8601(new Date().toISOString())

	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(opts.title)}</title>
  <subtitle>${escapeXml(opts.description || SITE_DESCRIPTION)}</subtitle>
  <link href="${opts.selfUrl}" rel="self" type="application/atom+xml"/>
  <link href="${SITE_URL}" rel="alternate" type="text/html"/>
  <id>${SITE_URL}/</id>
  <updated>${latestDate}</updated>
  ${entries}
</feed>`
}

export interface JsonFeed {
	version: string
	title: string
	home_page_url: string
	feed_url: string
	description: string
	language: string
	items: {
		id: string
		url: string
		title: string
		summary: string
		date_published: string
		authors: { name: string }[]
		tags?: string[]
	}[]
}

export function generateJsonFeed(
	items: FeedItem[],
	opts: { title: string; feedUrl: string; description?: string },
): JsonFeed {
	return {
		version: "https://jsonfeed.org/version/1.1",
		title: opts.title,
		home_page_url: SITE_URL,
		feed_url: opts.feedUrl,
		description: opts.description || SITE_DESCRIPTION,
		language: "en-US",
		items: items.map((item) => ({
			id: item.url,
			url: item.url,
			title: item.title,
			summary: item.description,
			date_published: new Date(item.date).toISOString(),
			authors: item.author ? [{ name: item.author }] : [],
			...(item.category ? { tags: [item.category] } : {}),
		})),
	}
}
