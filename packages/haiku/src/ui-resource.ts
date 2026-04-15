// ui-resource.ts — MCP Apps UI resource helpers
// Do not inline this logic elsewhere; import from here instead.
import { REVIEW_APP_VERSION } from "./review-app-html.js"

/** Stable resource URI for the bundled review SPA. */
export const REVIEW_RESOURCE_URI =
	`ui://haiku/review/${REVIEW_APP_VERSION}` as const

/**
 * Builds the _meta.ui extension object for MCP Apps tool results.
 * Spread into the `_meta` field of the tool result when the MCP Apps path is active.
 */
export function buildUiResourceMeta(resourceUri: string): {
	ui: { resourceUri: string }
} {
	return { ui: { resourceUri } }
}
