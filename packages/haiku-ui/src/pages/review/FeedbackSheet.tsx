/**
 * FeedbackSheet — mobile modal composition that wraps `FeedbackPanelBody`.
 *
 * Extracted from `FeedbackSidebar.tsx` per FB-38. Uses
 * `useFeedbackSidebarController` for the shared wiring so the desktop and
 * mobile variants stay behavioural-equivalent. Unit-10 upgrades the sheet
 * with focus-trap-react semantics + main-content `aria-hidden` contract;
 * this unit ships the placeholder state machine only.
 */

import { useCallback } from "react"
import { focusRingClass, touchTargetClass } from "../../a11y"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"

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
