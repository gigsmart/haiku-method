/**
 * Site-wide constants for H·AI·K·U website
 */

export const SITE_URL = "https://haikumethod.ai"
export const SITE_NAME = "H·AI·K·U"
export const SITE_DESCRIPTION =
	"The software development profile of the H·AI·K·U universal lifecycle framework"
export const SITE_AUTHOR = "GigSmart"
export const GITHUB_REPO = process.env.NEXT_PUBLIC_REPO_SLUG ?? "gigsmart/haiku-method"
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

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
