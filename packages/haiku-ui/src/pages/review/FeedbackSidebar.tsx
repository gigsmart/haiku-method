/**
 * FeedbackSidebar — desktop right-column composition of the review page.
 *
 * Consumes `useFeedback(intent, stage)` for the list state + `refetch`
 * callback, and routes status mutations through the typed
 * `useApiClient().feedback.update(...)` so the page does not call `fetch`
 * directly. Per-status-change announcements fire through
 * `useAnnounce('polite', ...)` with canonical phrasing from
 * DESIGN-BRIEF §2 — see `statusAnnouncement`. Optimistic UI is bounded:
 * we hand the announcement to AT immediately; a failed update re-fetches
 * and surfaces the error via assertive live region.
 *
 * Mobile variants (`FeedbackFloatingButton`, `FeedbackSheet`) live in this
 * file by design — they share ~80% of the desktop plumbing and splitting
 * them would duplicate the useFeedback wiring. Unit-10 upgrades the sheet
 * with focus-trap-react semantics + main-content `aria-hidden` contract;
 * this unit ships the placeholder state machine only.
 *
 * Reserved slot for unit-09 `AgentFeedbackToggle`: the sidebar currently
 * renders `FeedbackSummaryBar` → `FeedbackList`. Unit-09 inserts a
 * segmented control above the summary bar — no sidebar reshape needed.
 */

import { useCallback, useMemo, useState } from "react"
import { Aside, focusRingClass, touchTargetClass, useAnnounce } from "../../a11y"
import { useApiClient } from "../../api/context"
import {
	FeedbackList,
	FeedbackSummaryBar,
	type FeedbackStatus,
} from "../../components/feedback"
import { useFeedback } from "../../hooks/useFeedback"
import type { FeedbackItemData } from "../../types"

function statusAnnouncement(id: string, next: FeedbackStatus): string {
	if (next === "rejected") return `Feedback ${id} marked as rejected`
	if (next === "closed") return `Feedback ${id} marked as closed`
	if (next === "pending") return `Feedback ${id} reopened`
	if (next === "addressed") return `Feedback ${id} marked as addressed`
	if (next === "fixing") return `Feedback ${id} marked as fixing`
	return `Feedback ${id} status changed`
}

export interface FeedbackSidebarProps {
	intent: string | null
	stage: string | null
	sessionId: string
	className?: string
}

interface FeedbackPanelBodyProps {
	items: FeedbackItemData[]
	loading: boolean
	error: string | null
	onStatusChange: (id: string, next: FeedbackStatus) => void
	onDelete: (id: string) => void
	onRetry: () => void
}

function FeedbackPanelBody({
	items,
	loading,
	error,
	onStatusChange,
	onDelete,
	onRetry,
}: FeedbackPanelBodyProps): React.ReactElement {
	const [activeStatus, setActiveStatus] = useState<FeedbackStatus | null>(null)

	const filtered = useMemo(() => {
		if (!activeStatus) return items
		return items.filter((item) => item.status === activeStatus)
	}, [items, activeStatus])

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
				<FeedbackSummaryBar
					items={items}
					activeStatus={activeStatus}
					onFilter={setActiveStatus}
				/>
			</div>
			<div className="flex-1 overflow-y-auto p-3">
				<FeedbackList
					items={filtered}
					isLoading={loading}
					error={error}
					onRetry={onRetry}
					onStatusChange={onStatusChange}
					onDelete={onDelete}
				/>
			</div>
		</div>
	)
}

function useFeedbackSidebarController(
	intent: string | null,
	stage: string | null,
): {
	items: FeedbackItemData[]
	loading: boolean
	error: string | null
	retry: () => void
	handleStatusChange: (id: string, next: FeedbackStatus) => void
	handleDelete: (id: string) => void
} {
	const client = useApiClient()
	const announce = useAnnounce()
	const {
		items,
		loading,
		error,
		refetch,
		deleteFeedback: hookDelete,
	} = useFeedback(intent, stage)

	const retry = useCallback(() => {
		void refetch()
	}, [refetch])

	const handleStatusChange = useCallback(
		(id: string, next: FeedbackStatus): void => {
			// Announce immediately — optimistic UI per DESIGN-BRIEF §2.
			announce("polite", statusAnnouncement(id, next))
			if (!(intent && stage)) return
			client.feedback
				.update(intent, stage, id, { status: next })
				.then(() => {
					void refetch()
				})
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Feedback update failed"
					announce("assertive", message)
				})
		},
		[announce, client, intent, stage, refetch],
	)

	const handleDelete = useCallback(
		(id: string): void => {
			hookDelete(id).catch(() => {
				announce("assertive", "Feedback delete failed")
			})
		},
		[announce, hookDelete],
	)

	return { items, loading, error, retry, handleStatusChange, handleDelete }
}

export function FeedbackSidebar({
	intent,
	stage,
	sessionId: _sessionId,
	className,
}: FeedbackSidebarProps): React.ReactElement {
	const { items, loading, error, retry, handleStatusChange, handleDelete } =
		useFeedbackSidebarController(intent, stage)

	return (
		<Aside
			data-testid="feedback-sidebar-desktop"
			ariaLabel="Review sidebar"
			className={`hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700 ${className ?? ""}`}
		>
			<FeedbackPanelBody
				items={items}
				loading={loading}
				error={error}
				onStatusChange={handleStatusChange}
				onDelete={handleDelete}
				onRetry={retry}
			/>
		</Aside>
	)
}

export interface FeedbackFloatingButtonProps {
	onClick: () => void
	isOpen: boolean
	pendingCount?: number
	className?: string
}

export function FeedbackFloatingButton({
	onClick,
	isOpen,
	pendingCount,
	className,
}: FeedbackFloatingButtonProps): React.ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			data-testid="feedback-fab"
			aria-label="Open feedback panel"
			aria-haspopup="dialog"
			aria-controls="feedback-sheet"
			aria-expanded={isOpen}
			className={`${touchTargetClass} ${focusRingClass} xl:hidden fixed bottom-4 right-4 z-40 inline-flex w-12 h-12 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 ${className ?? ""}`}
		>
			<span aria-hidden="true" className="text-lg font-bold leading-none">
				{pendingCount && pendingCount > 0 ? pendingCount : "\u{1F4AC}"}
			</span>
			<span className="sr-only">
				{pendingCount && pendingCount > 0
					? `${pendingCount} feedback items pending`
					: "Feedback"}
			</span>
		</button>
	)
}

export interface FeedbackSheetProps {
	intent: string | null
	stage: string | null
	sessionId: string
	isOpen: boolean
	onClose: () => void
}

export function FeedbackSheet({
	intent,
	stage,
	sessionId: _sessionId,
	isOpen,
	onClose,
}: FeedbackSheetProps): React.ReactElement {
	const { items, loading, error, retry, handleStatusChange, handleDelete } =
		useFeedbackSidebarController(intent, stage)

	// Minimal escape-close handler. Full focus-trap + aria-hidden on main
	// content is unit-10's scope.
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Escape") {
				e.stopPropagation()
				onClose()
			}
		},
		[onClose],
	)

	return (
		<div
			id="feedback-sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby="feedback-sheet-title"
			hidden={!isOpen}
			data-testid="feedback-sheet"
			className="xl:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900"
			onKeyDown={onKeyDown}
		>
			<div className="shrink-0 flex items-center justify-between border-b border-stone-200 dark:border-stone-700 px-4 py-3">
				<h2
					id="feedback-sheet-title"
					className="text-base font-semibold text-stone-900 dark:text-stone-100"
				>
					Feedback
				</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label="Dismiss feedback panel"
					className={`${touchTargetClass} ${focusRingClass} inline-flex items-center justify-center rounded-md px-3 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800`}
				>
					{"✕"}
				</button>
			</div>
			<div
				role="status"
				className="shrink-0 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-800 dark:text-amber-200"
			>
				Mobile review experience is under construction — unit-10 will ship full
				dialog semantics.
			</div>
			<FeedbackPanelBody
				items={items}
				loading={loading}
				error={error}
				onStatusChange={handleStatusChange}
				onDelete={handleDelete}
				onRetry={retry}
			/>
		</div>
	)
}
