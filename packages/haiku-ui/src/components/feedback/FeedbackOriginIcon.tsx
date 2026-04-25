/**
 * FeedbackOriginIcon — emoji + visible label for a feedback origin.
 *
 * Renders the canonical emoji paired with the human-readable label from
 * `originLabels[origin]` (NEVER the raw slug — that pattern is audit-banned
 * via the `\{origin\}(?!Labels)` regex in `audit-banned-patterns.mjs`).
 *
 * When `showLabel=true` (default) the emoji is `aria-hidden="true"` because
 * the label carries the semantic payload. When `showLabel=false` the emoji
 * becomes the semantic payload and gets `role="img"` + `aria-label={label}`
 * so screen readers still announce "Review Agent" (etc.) rather than a
 * meaningless emoji code point.
 */

import type { FeedbackOrigin } from "./tokens"
import { originColors, originIcons, originLabels } from "./tokens"

export interface FeedbackOriginIconProps {
	origin: FeedbackOrigin
	/** When true (default), renders emoji + visible label. When false, emoji only. */
	showLabel?: boolean
	className?: string
}

const BASE_CLASSES =
	"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"

export function FeedbackOriginIcon({
	origin,
	showLabel = true,
	className,
}: FeedbackOriginIconProps): React.ReactElement {
	const icon = originIcons[origin]
	const label = originLabels[origin]
	const classes = [BASE_CLASSES, originColors[origin], className]
		.filter(Boolean)
		.join(" ")

	if (showLabel) {
		return (
			<span className={classes}>
				<span aria-hidden="true">{icon}</span>
				<span>{label}</span>
			</span>
		)
	}
	return (
		<span className={classes}>
			<span role="img" aria-label={label}>
				{icon}
			</span>
		</span>
	)
}

// Re-export the underlying maps so downstream components (FeedbackItem,
// FeedbackSummaryBar, future AgentFeedbackToggle) can reach them without
// touching `./tokens` directly.
export { originIcons, originLabels }
