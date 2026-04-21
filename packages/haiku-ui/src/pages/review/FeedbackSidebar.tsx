/**
 * FeedbackSidebar — desktop right-column composition of the review page.
 *
 * Shares its wiring (`useFeedback`, typed `apiClient.feedback.update`,
 * polite/assertive announcements with canonical DESIGN-BRIEF §2 phrasing)
 * with the mobile `FeedbackSheet` via the `useFeedbackSidebarController`
 * hook. Body layout (summary bar over virtualized list) lives in
 * `FeedbackPanelBody`.
 *
 * Reserved slot for unit-09 `AgentFeedbackToggle`: the sidebar currently
 * renders `FeedbackSummaryBar` → `FeedbackList`. Unit-09 inserts a
 * segmented control above the summary bar — no sidebar reshape needed.
 *
 * FB-38: this file used to also host `FeedbackFloatingButton`, `FeedbackSheet`,
 * and the shared hook. Those now live in their own files in this directory.
 */

import { Aside } from "../../a11y"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"

export interface FeedbackSidebarProps {
	intent: string | null
	stage: string | null
	sessionId: string
	className?: string
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
