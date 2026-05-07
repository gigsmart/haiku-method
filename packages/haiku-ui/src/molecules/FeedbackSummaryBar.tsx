/**
 * FeedbackSummaryBar — count breakdown by status at the top of a feedback
 * panel. Per `state-coverage-grid.md §7.6`:
 *   - hidden entirely when the item list is empty
 *   - each count is a button with `aria-pressed` tied to `activeStatus`
 *   - clicking toggles the filter (same status twice clears the filter)
 */

import { useMemo } from "react"
import { focusRingCompactClass, touchTargetClass } from "../a11y"
import type { FeedbackStatus } from "../atoms/feedback-tokens"
import { statusDotClasses } from "../atoms/feedback-tokens"
import type { FeedbackItemData } from "../types"

const VISIBLE_STATUSES: ReadonlyArray<FeedbackStatus> = [
	"pending",
	"addressed",
	"answered",
	"closed",
	"rejected",
]

const STATUS_LABELS: Record<FeedbackStatus, string> = {
	pending: "Pending",
	fixing: "Fixing",
	addressed: "Addressed",
	answered: "Answered",
	closed: "Closed",
	rejected: "Rejected",
}

export interface FeedbackSummaryBarProps {
	items: FeedbackItemData[]
	activeStatus: FeedbackStatus | null
	onFilter: (status: FeedbackStatus | null) => void
	/** Optional: when true, the visible items are restricted to those
	 *  with an unread closure reply (`closure_reply_unread === true`).
	 *  The chip is rendered next to the status pills with its own
	 *  count. Click toggles. Independent from the status filter. */
	unreadReplyOnly?: boolean
	onToggleUnreadReplyOnly?: () => void
	className?: string
}

function countByStatus(
	items: FeedbackItemData[],
): Record<FeedbackStatus, number> {
	const base: Record<FeedbackStatus, number> = {
		pending: 0,
		fixing: 0,
		addressed: 0,
		answered: 0,
		closed: 0,
		rejected: 0,
	}
	for (const item of items) {
		base[item.status] = (base[item.status] ?? 0) + 1
	}
	return base
}

export function FeedbackSummaryBar({
	items,
	activeStatus,
	onFilter,
	unreadReplyOnly,
	onToggleUnreadReplyOnly,
	className,
}: FeedbackSummaryBarProps): React.ReactElement | null {
	const counts = useMemo(() => countByStatus(items), [items])
	const unreadReplyCount = useMemo(
		() => items.filter((i) => i.closure_reply_unread === true).length,
		[items],
	)

	if (items.length === 0) return null

	return (
		<fieldset
			data-testid="feedback-summary-bar"
			className={`flex flex-wrap items-center gap-1.5 border-0 p-0 m-0 ${className ?? ""}`}
			aria-label="Feedback counts by status"
		>
			{VISIBLE_STATUSES.map((status) => {
				const count = counts[status]
				const isActive = activeStatus === status
				const classes = [
					touchTargetClass,
					"inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors",
					isActive
						? "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700"
						: "border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600",
					focusRingCompactClass,
				].join(" ")
				return (
					<button
						key={status}
						type="button"
						data-status={status}
						aria-pressed={isActive}
						aria-label={`Filter by ${STATUS_LABELS[status].toLowerCase()} (${count})`}
						onClick={() => onFilter(isActive ? null : status)}
						className={classes}
					>
						<span
							className={`h-2 w-2 rounded-full ${statusDotClasses[status]}`}
							aria-hidden="true"
						/>
						<span>{STATUS_LABELS[status]}</span>
						<span className="tabular-nums">{count}</span>
					</button>
				)
			})}
			{onToggleUnreadReplyOnly && unreadReplyCount > 0 && (
				<button
					type="button"
					data-testid="feedback-unread-reply-filter"
					aria-pressed={unreadReplyOnly === true}
					aria-label={`Filter by unread closure replies (${unreadReplyCount})`}
					onClick={onToggleUnreadReplyOnly}
					className={[
						touchTargetClass,
						"inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors",
						unreadReplyOnly
							? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
							: "border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-300 dark:hover:border-emerald-700",
						focusRingCompactClass,
					].join(" ")}
				>
					<span
						className="h-2 w-2 rounded-full bg-emerald-700"
						aria-hidden="true"
					/>
					<span>Unread replies</span>
					<span className="tabular-nums">{unreadReplyCount}</span>
				</button>
			)}
		</fieldset>
	)
}
