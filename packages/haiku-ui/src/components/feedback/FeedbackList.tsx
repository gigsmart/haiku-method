/**
 * FeedbackList — list container for FeedbackItem rows.
 *
 * Renders every row. Expanded-by-default cards have variable heights,
 * and the async-measurement dance that react-window needs to size
 * absolute-positioned wrappers races with ResizeObserver callbacks —
 * the visible failure is cards overlapping while sizes stabilize.
 * Typical feedback queues are small (< 20 items), so skipping
 * virtualization is the correct tradeoff; revisit with a library that
 * measures synchronously (e.g. react-virtuoso) if queues routinely
 * grow past a few hundred items.
 *
 * Keyboard navigation: the container delegates to
 * `useFeedbackListKeyboardNav`, which wires a single `keydown` listener
 * at the container level and focuses the next item on Arrow keys.
 *
 * Container states (per `state-coverage-grid.md §7.5`):
 *  - loading (`aria-busy="true"` + skeleton rows + spinner)
 *  - error (retry button)
 *  - empty (canonical empty copy)
 *  - default (list of items)
 */

import { useLayoutEffect, useRef, useState } from "react"
import type { FeedbackItemData } from "../../types"
import { FeedbackItem } from "./FeedbackItem"
import type { FeedbackStatus } from "./tokens"
import { useFeedbackListKeyboardNav } from "./useFeedbackListKeyboardNav"

// Virtualization is off: expanded-by-default cards have variable heights
// that would need async measurement, and the measurement race against
// react-window's absolute-positioned wrappers produces visible overlap
// while sizes stabilize. Real feedback queues are small (< 20 items in
// practice), so always rendering every row is the correct tradeoff.
// `VIRTUALIZE_THRESHOLD` is retained as a constant because tests and
// sibling hooks still reference it as the "large list" boundary.
export const VIRTUALIZE_THRESHOLD = 50
export const DEFAULT_LIST_HEIGHT = 1200
export const DEFAULT_ITEM_SIZE = 240

export interface FeedbackListProps {
	items: FeedbackItemData[]
	isLoading?: boolean
	error?: string | null
	onRetry?: () => void
	onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void
	onDelete?: (id: string) => void
	/** Called when the user submits a reply on a feedback row. */
	onReply?: (
		id: string,
		body: string,
		closeAsAnswered?: boolean,
	) => Promise<void>
	/** Set of feedback ids currently in flight (PUT / DELETE). Rows
	 *  matching render a "Saving…" indicator + disable action buttons. */
	busyIds?: ReadonlySet<string>
	/** Initial expanded item id (uncontrolled). */
	initialExpandedId?: string | null
	/** Override list height. Defaults to DEFAULT_LIST_HEIGHT. */
	height?: number
	/** Override item height. Defaults to DEFAULT_ITEM_SIZE. */
	itemSize?: number
	className?: string
}

export function FeedbackList({
	items,
	isLoading,
	error,
	onRetry,
	onStatusChange,
	onDelete,
	onReply,
	busyIds,
	initialExpandedId = null,
	height = DEFAULT_LIST_HEIGHT,
	itemSize = DEFAULT_ITEM_SIZE,
	className,
}: FeedbackListProps): React.ReactElement {
	// `expandedId` is retained in case a future variant wants collapsible
	// rows again; today every row renders expanded (see below). The state
	// is kept so the keyboard-nav hook and container wiring stay the same.
	const [_expandedId, _setExpandedId] = useState<string | null>(
		initialExpandedId,
	)
	void _expandedId
	void _setExpandedId
	void height
	void itemSize
	const containerRef = useRef<HTMLDivElement | null>(null)
	const itemRefs = useRef<Array<HTMLElement | null>>([])

	// Reset refs array to match item count (prevents stale entries).
	useLayoutEffect(() => {
		itemRefs.current.length = items.length
	}, [items.length])

	useFeedbackListKeyboardNav({
		itemCount: items.length,
		containerRef,
		itemRefs,
	})

	// ── Container-state branches ─────────────────────────────────────────────

	if (isLoading) {
		return (
			<div
				ref={containerRef}
				data-testid="feedback-list"
				data-state="loading"
				className={`flex flex-col gap-2 p-3 ${className ?? ""}`}
				aria-busy="true"
			>
				<div className="flex justify-center py-2">
					<div
						className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-500"
						aria-hidden="true"
					/>
				</div>
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-16 rounded-lg bg-stone-100 dark:bg-stone-800 animate-pulse"
						aria-hidden="true"
					/>
				))}
				<span className="sr-only">Loading feedback…</span>
			</div>
		)
	}

	if (error) {
		return (
			<div
				ref={containerRef}
				data-testid="feedback-list"
				data-state="error"
				className={`flex flex-col items-center gap-2 p-4 text-center ${className ?? ""}`}
				role="alert"
			>
				<p className="text-xs text-red-600 dark:text-red-400">{error}</p>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="text-xs font-medium px-3 py-1 rounded-md bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-800"
					>
						Retry
					</button>
				)}
			</div>
		)
	}

	if (items.length === 0) {
		return (
			<div
				ref={containerRef}
				data-testid="feedback-list"
				data-state="empty"
				className={`p-4 text-center ${className ?? ""}`}
			>
				<p className="text-xs text-stone-600 dark:text-stone-300 italic">
					No feedback yet. Select text or drop pins to add annotations.
				</p>
			</div>
		)
	}

	// ── Default branch ──────────────────────────────────────────────────────

	return (
		<ul
			ref={containerRef as unknown as React.Ref<HTMLUListElement>}
			data-testid="feedback-list"
			data-state="default"
			data-virtualized="false"
			className={`h-full overflow-y-auto space-y-2 py-3 ${className ?? ""}`}
		>
			{items.map((item, index) => (
				<li
					key={item.feedback_id}
					aria-setsize={items.length}
					aria-posinset={index + 1}
					className="px-3"
				>
					<FeedbackItem
						ref={(node) => {
							itemRefs.current[index] = node
						}}
						item={item}
						isExpanded={true}
						onToggle={() => {
							/* no-op: cards always expanded */
						}}
						onStatusChange={onStatusChange}
						onDelete={onDelete}
						onReply={onReply}
						pending={busyIds?.has(item.feedback_id)}
					/>
				</li>
			))}
		</ul>
	)
}
