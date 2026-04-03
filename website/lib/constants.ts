/**
 * Site-wide constants for AI-DLC website
 */

export const SITE_URL = "https://ai-dlc.dev"
export const SITE_NAME = "AI-DLC"
export const SITE_DESCRIPTION =
	"A methodology for iterative AI-driven development with hat-based workflows"
export const SITE_AUTHOR = "The Bushido Collective"
export const GITHUB_URL = "https://github.com/thebushidocollective/ai-dlc"

/**
 * Social media and contact
 */
export const SOCIAL = {
	github: GITHUB_URL,
	twitter: undefined, // Add if available
}

/**
 * Feed URLs
 */
export const FEEDS = {
	rss: `${SITE_URL}/feed.xml`,
	atom: `${SITE_URL}/atom.xml`,
	json: `${SITE_URL}/feed.json`,
}
