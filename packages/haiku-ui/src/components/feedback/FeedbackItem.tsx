/**
 * FeedbackItem — single feedback row.
 *
 * Root is a disclosure (`role="button" tabIndex=0 aria-expanded`); clicking
 * or pressing Enter / Space toggles expansion. Action buttons inside the
 * expanded body are status-scoped per DESIGN-TOKENS §2.6 canonical verb set
 * (Dismiss / Verify & Close / Reopen) — the banned verbs (Close / Reject /
 * Address / "Re" hyphen "open") are audit-enforced. "Delete" is NOT banned;
 * it is the terminal destructive action surfaced only on closed/rejected
 * items via the optional `onDelete` handler.
 *
 * Focus preservation: when the item's `status` changes (i.e. after an action
 * button fires and the parent updates the item's status), focus returns to
 * the card root. This keeps the keyboard-nav path continuous across a
 * status transition — the action button that handled the click may no
 * longer exist in the new button tree, so sending focus to it would 404.
 *
 * Screen-reader announcement: every status change fires an announcement via
 * `useAnnounce("polite", "Feedback <id> marked as <status>")` per the
 * DESIGN-BRIEF §2 screen-reader table + `aria-live-sequencing-spec.md §5`.
 * Callers own the state update; we own the announcement + focus repair.
 */

import {
	forwardRef,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react"
import { focusRingCompactClass, touchTargetClass, useAnnounce } from "../../a11y"
import type { FeedbackItemData } from "../../types"
import { FeedbackOriginIcon } from "./FeedbackOriginIcon"
import { FeedbackStatusBadge } from "./FeedbackStatusBadge"
import type { FeedbackStatus } from "./tokens"
import {
	originLabels,
	statusBackground,
	statusBorderLeft,
	visitCounterClasses,
} from "./tokens"

export interface FeedbackItemProps {
	item: FeedbackItemData
	isExpanded: boolean
	onToggle: () => void
	/** Fired when an action button changes the status. Parent owns persistence. */
	onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void
	/** Optional delete handler — rendered only for closed/rejected items. */
	onDelete?: (id: string) => void
	/** `style` prop from react-window virtualizer (absolute position). */
	style?: React.CSSProperties
	className?: string
}

const ACTION_BUTTON_BASE =
	`${touchTargetClass} inline-flex items-center justify-center text-xs font-medium px-3 py-1 rounded-md transition-colors ` +
	focusRingCompactClass

const DISMISS_CLASSES =
	"bg-stone-100 text-stone-600 hover:bg-stone-200 " +
	"dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"

const VERIFY_CLOSE_CLASSES =
	"bg-green-50 text-green-700 hover:bg-green-100 " +
	"dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40"

const REOPEN_CLASSES =
	"bg-amber-50 text-amber-700 hover:bg-amber-100 " +
	"dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"

const DELETE_CLASSES =
	"text-red-600 hover:bg-red-50 " + "dark:text-red-400 dark:hover:bg-red-900/20"

function statusAnnouncement(id: string, next: FeedbackStatus): string {
	if (next === "rejected") return `Feedback ${id} marked as rejected`
	if (next === "closed") return `Feedback ${id} marked as closed`
	if (next === "pending") return `Feedback ${id} reopened`
	if (next === "addressed") return `Feedback ${id} marked as addressed`
	return `Feedback ${id} status changed`
}

export const FeedbackItem = forwardRef<HTMLDivElement, FeedbackItemProps>(
	function FeedbackItem(
		{ item, isExpanded, onToggle, onStatusChange, onDelete, style, className },
		forwardedRef,
	): React.ReactElement {
		const localCardRef = useRef<HTMLDivElement | null>(null)
		const previousStatusRef = useRef<FeedbackStatus>(item.status)
		// Tracks whether focus was inside the card at the moment the user
		// clicked an action button. The click handler updates this before
		// React re-renders (which may unmount the focused button) so the
		// layout-effect on status change can decide whether to restore focus
		// to the card root.
		const focusedBeforeChangeRef = useRef<boolean>(false)
		const announce = useAnnounce()

		const setCardRef = useCallback(
			(node: HTMLDivElement | null) => {
				localCardRef.current = node
				if (typeof forwardedRef === "function") {
					forwardedRef(node)
				} else if (forwardedRef) {
					forwardedRef.current = node
				}
			},
			[forwardedRef],
		)

		// Focus preservation + announcement on status change.
		useLayoutEffect(() => {
			const previous = previousStatusRef.current
			if (previous === item.status) return
			previousStatusRef.current = item.status
			const card = localCardRef.current
			if (!card) return
			// If focus was inside the card at the moment the action fired, or
			// is still inside (e.g. expand toggle), restore to the card root.
			// Checking both covers the jsdom case where button removal resets
			// activeElement to <body> before the layout effect runs.
			const hadFocusInside =
				focusedBeforeChangeRef.current || card.contains(document.activeElement)
			focusedBeforeChangeRef.current = false
			if (hadFocusInside) {
				card.focus()
			}
			announce("polite", statusAnnouncement(item.feedback_id, item.status))
		}, [announce, item.feedback_id, item.status])

		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLDivElement>) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					onToggle()
				}
			},
			[onToggle],
		)

		const handleStatusChange = useCallback(
			(next: FeedbackStatus) =>
				(event: React.MouseEvent<HTMLButtonElement>) => {
					event.stopPropagation()
					const card = localCardRef.current
					focusedBeforeChangeRef.current = Boolean(
						card?.contains(document.activeElement),
					)
					if (onStatusChange) onStatusChange(item.feedback_id, next)
				},
			[item.feedback_id, onStatusChange],
		)

		const handleDelete = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				event.stopPropagation()
				if (onDelete) onDelete(item.feedback_id)
			},
			[item.feedback_id, onDelete],
		)

		const visitPillClass = useMemo(
			() => visitCounterClasses(item.visit),
			[item.visit],
		)

		const rootClasses = [
			"p-2.5 rounded-lg border",
			statusBorderLeft[item.status],
			statusBackground[item.status],
			"hover:border-teal-400 dark:hover:border-teal-500",
			"transition-colors cursor-pointer group",
			focusRingCompactClass,
			className,
		]
			.filter(Boolean)
			.join(" ")

		return (
			// biome-ignore lint/a11y/useSemanticElements: a native <button> cannot wrap the nested action buttons this card contains (invalid HTML). The disclosure pattern here uses role=button on the card root intentionally.
			<div
				ref={setCardRef}
				data-testid="feedback-item"
				data-feedback-id={item.feedback_id}
				data-status={item.status}
				role="button"
				tabIndex={0}
				aria-expanded={isExpanded}
				className={rootClasses}
				style={style}
				onClick={onToggle}
				onKeyDown={handleKeyDown}
			>
				<div className="flex items-center gap-2 mb-1 flex-wrap">
					<FeedbackOriginIcon origin={item.origin} showLabel />
					<FeedbackStatusBadge status={item.status} />
					{item.visit > 1 && (
						<span
							className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none ${visitPillClass}`}
							role="img"
							aria-label={`${item.visit} visits`}
						>
							{item.visit}x
						</span>
					)}
				</div>
				<p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
					{item.title}
				</p>
				<p className="text-xs text-stone-600 dark:text-stone-300">
					{item.feedback_id} · Visit {item.visit} · {originLabels[item.origin]}
				</p>
				{isExpanded && (
					<div className="mt-2">
						<p className="text-xs text-stone-700 dark:text-stone-300 whitespace-pre-wrap">
							{item.body}
						</p>
						{item.closed_by && (
							<p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
								Closed by: {item.closed_by}
							</p>
						)}
						<div className="flex gap-1 mt-2 flex-wrap">
							{item.status === "pending" && onStatusChange && (
								<button
									type="button"
									data-action="dismiss"
									onClick={handleStatusChange("rejected")}
									className={`${ACTION_BUTTON_BASE} ${DISMISS_CLASSES}`}
									aria-label={`Dismiss feedback ${item.feedback_id}`}
								>
									Dismiss
								</button>
							)}
							{item.status === "addressed" && onStatusChange && (
								<>
									<button
										type="button"
										data-action="verify-close"
										onClick={handleStatusChange("closed")}
										className={`${ACTION_BUTTON_BASE} ${VERIFY_CLOSE_CLASSES}`}
										aria-label={`Verify and close feedback ${item.feedback_id}`}
									>
										Verify & Close
									</button>
									<button
										type="button"
										data-action="reopen"
										onClick={handleStatusChange("pending")}
										className={`${ACTION_BUTTON_BASE} ${REOPEN_CLASSES}`}
										aria-label={`Reopen feedback ${item.feedback_id}`}
									>
										Reopen
									</button>
								</>
							)}
							{(item.status === "closed" || item.status === "rejected") &&
								onStatusChange && (
									<button
										type="button"
										data-action="reopen"
										onClick={handleStatusChange("pending")}
										className={`${ACTION_BUTTON_BASE} ${REOPEN_CLASSES}`}
										aria-label={`Reopen feedback ${item.feedback_id}`}
									>
										Reopen
									</button>
								)}
							{(item.status === "closed" || item.status === "rejected") &&
								onDelete && (
									<button
										type="button"
										data-action="delete"
										onClick={handleDelete}
										className={`${ACTION_BUTTON_BASE} ${DELETE_CLASSES}`}
										aria-label={`Delete feedback ${item.feedback_id}`}
									>
										Delete
									</button>
								)}
						</div>
					</div>
				)}
			</div>
		)
	},
)
