export const dynamic = "force-static"
export const revalidate = false

const SITE_URL = "https://ai-dlc.dev"

export async function GET() {
	const robotsTxt = `# AI-DLC robots.txt
# https://ai-dlc.dev

User-agent: *
Allow: /

# Explicitly allow AI crawlers
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Applebot-Extended
Allow: /

# Feeds available at:
# RSS: ${SITE_URL}/feed.xml
# Atom: ${SITE_URL}/atom.xml
# JSON: ${SITE_URL}/feed.json

Sitemap: ${SITE_URL}/sitemap.xml
`

	return new Response(robotsTxt, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400, s-maxage=86400",
		},
	})
}
