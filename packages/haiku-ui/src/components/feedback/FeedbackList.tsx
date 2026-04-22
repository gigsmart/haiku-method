/**
 * FeedbackList — list container for FeedbackItem rows.
 *
 * Two branches:
 *  - Plain (≤ VIRTUALIZE_THRESHOLD items) renders every row.
 *  - Virtualized (> VIRTUALIZE_THRESHOLD items) wraps `react-window`
 *    `FixedSizeList` so rows outside the viewport window are unmounted. Steady
 *    state count ≤ 30 per the unit spec's completion criteria (verified in
 *    `FeedbackList.virtualization.test.tsx`).
 *
 * Keyboard navigation: the container delegates to
 * `useFeedbackListKeyboardNav` which wires a single `keydown` listener at the
 * container level and calls `scrollToItem(nextIndex, "auto")` on the
 * virtualizer ref before refocusing the next item. This is the coordination
 * between virtualization + arrow-key roving focus called out in the unit spec.
 *
 * Container states (per `state-coverage-grid.md §7.5`):
 *  - loading (`aria-busy="true"` + skeleton rows + spinner)
 *  - error (retry button)
 *  - empty (canonical empty copy)
 *  - default (list of items)
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { FixedSizeList as FixedSizeListType } from "react-window"
import { FixedSizeList } from "react-window"
import type { FeedbackItemData } from "../../types"
import { FeedbackItem } from "./FeedbackItem"
import type { FeedbackStatus } from "./tokens"
import { useFeedbackListKeyboardNav } from "./useFeedbackListKeyboardNav"

export const VIRTUALIZE_THRESHOLD = 50

// Default height for the virtualized list when no explicit height is
// provided. Larger than the original 600 so typical laptop viewports
// don't feel cramped; callers that want to tighten can pass `height`.
export const DEFAULT_LIST_HEIGHT = 1200
export const DEFAULT_ITEM_SIZE = 88

export interface FeedbackListProps {
	items: FeedbackItemData[]
	isLoading?: boolean
	error?: string | null
	onRetry?: () => void
	onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void
	onDelete?: (id: string) => void
	/** Initial expanded item id (uncontrolled). */
	initialExpandedId?: string | null
	/** Override list height. Defaults to DEFAULT_LIST_HEIGHT. */
	height?: number
	/** Override item height. Defaults to DEFAULT_ITEM_SIZE. */
	itemSize?: number
	className?: string
}

interface VirtualRowProps {
	index: number
	style: React.CSSProperties
	data: {
		items: FeedbackItemData[]
		expandedId: string | null
		setExpandedId: (id: string | null) => void
		onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void
		onDelete?: (id: string) => void
		itemRefs: React.MutableRefObject<Array<HTMLElement | null>>
	}
}

function VirtualRow({
	index,
	style,
	data,
}: VirtualRowProps): React.ReactElement {
	const item = data.items[index]
	const isExpanded = data.expandedId === item.feedback_id
	return (
		// biome-ignore lint/a11y/useSemanticElements: react-window's FixedSizeList renders rows in an inner <div> — we cannot swap this virtualized row to a native <li> without controlling the parent list element (which would require innerElementType=ul across the virtualizer boundary).
		<div
			style={style}
			role="listitem"
			aria-setsize={data.items.length}
			aria-posinset={index + 1}
		>
			<FeedbackItem
				ref={(node) => {
					data.itemRefs.current[index] = node
				}}
				item={item}
				isExpanded={isExpanded}
				onToggle={() =>
					data.setExpandedId(isExpanded ? null : item.feedback_id)
				}
				onStatusChange={data.onStatusChange}
				onDelete={data.onDelete}
			/>
		</div>
	)
}

export function FeedbackList({
	items,
	isLoading,
	error,
	onRetry,
	onStatusChange,
	onDelete,
	initialExpandedId = null,
	height = DEFAULT_LIST_HEIGHT,
	itemSize = DEFAULT_ITEM_SIZE,
	className,
}: FeedbackListProps): React.ReactElement {
	const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const itemRefs = useRef<Array<HTMLElement | null>>([])
	const virtualRef = useRef<FixedSizeListType | null>(null)

	// Reset refs array to match item count (prevents stale entries).
	useLayoutEffect(() => {
		itemRefs.current.length = items.length
	}, [items.length])

	// Disable virtualization when an item is expanded — expanded cards
	// exceed the fixed itemSize and would overlap neighbors otherwise.
	const virtualized = items.length > VIRTUALIZE_THRESHOLD && expandedId === null

	const scrollToIndex = useCallback((index: number) => {
		if (virtualRef.current) {
			virtualRef.current.scrollToItem(index, "auto")
		}
	}, [])

	useFeedbackListKeyboardNav({
		itemCount: items.length,
		containerRef,
		itemRefs,
		scrollToIndex: virtualized ? scrollToIndex : undefined,
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

	if (virtualized) {
		const rowData = {
			items,
			expandedId,
			setExpandedId,
			onStatusChange,
			onDelete,
			itemRefs,
		}
		return (
			<div
				ref={containerRef}
				data-testid="feedback-list"
				data-state="default"
				data-virtualized="true"
				className={`h-full ${className ?? ""}`}
			>
				<FixedSizeList
					height={height}
					itemCount={items.length}
					itemSize={itemSize}
					width="100%"
					itemData={rowData}
					ref={virtualRef}
				>
					{VirtualRow}
				</FixedSizeList>
			</div>
		)
	}

	return (
		<ul
			ref={containerRef as unknown as React.Ref<HTMLUListElement>}
			data-testid="feedback-list"
			data-state="default"
			data-virtualized="false"
			className={`h-full overflow-y-auto space-y-2 py-3 ${className ?? ""}`}
		>
			{items.map((item, index) => {
				const isExpanded = expandedId === item.feedback_id
				return (
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
							isExpanded={isExpanded}
							onToggle={() =>
								setExpandedId(isExpanded ? null : item.feedback_id)
							}
							onStatusChange={onStatusChange}
							onDelete={onDelete}
						/>
					</li>
				)
			})}
		</ul>
	)
}
