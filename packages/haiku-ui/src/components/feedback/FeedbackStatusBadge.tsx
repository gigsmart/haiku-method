/**
 * FeedbackStatusBadge — the canonical status pill.
 *
 * One variant per `FeedbackStatus` value; each instance carries an explicit
 * `aria-label="Status: {status}"` so screen readers announce the role
 * unambiguously. The label shape is audited by RTL in `.states.test.tsx` as
 * the regression guard for the `inconsistent-aria-label` class.
 *
 * Pure label — not interactive. Inherits hover / focus from the owning
 * feedback card per `state-coverage-grid.md §7.1`.
 */

import type { FeedbackStatus } from "./tokens"
import { feedbackStatusColors } from "./tokens"

export interface FeedbackStatusBadgeProps {
	status: FeedbackStatus
	className?: string
}

const BASE_CLASSES =
	"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"

export function FeedbackStatusBadge({
	status,
	className,
}: FeedbackStatusBadgeProps): React.ReactElement {
	const classes = [BASE_CLASSES, feedbackStatusColors[status], className]
		.filter(Boolean)
		.join(" ")
	// `role="img"` is the canonical non-live role that accepts aria-label on
	// a non-interactive container — `<span>` with no role rejects aria-label
	// per Biome's `useAriaPropsSupportedByRole` rule. We use img rather than
	// `role="status"` because the latter is a live region and would re-
	// announce on every re-render (DESIGN-BRIEF §2 status transitions drive
	// their own `useAnnounce` call — the badge itself is passive).
	return (
		<span className={classes} role="img" aria-label={`Status: ${status}`}>
			{status}
		</span>
	)
}
