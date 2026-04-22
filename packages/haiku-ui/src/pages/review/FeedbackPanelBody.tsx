/**
 * FeedbackPanelBody — the shared body composition used by both the desktop
 * sidebar and the mobile sheet. Owns the per-status filter state
 * (`activeStatus`) and lays out `FeedbackSummaryBar` over `FeedbackList`.
 *
 * Extracted from `FeedbackSidebar.tsx` per FB-38.
 */

import { useMemo, useState } from "react"
import {
	FeedbackList,
	FeedbackSummaryBar,
	type FeedbackStatus,
} from "../../components/feedback"
import type { FeedbackItemData } from "../../types"

export interface FeedbackPanelBodyProps {
	items: FeedbackItemData[]
	loading: boolean
	error: string | null
	onStatusChange: (id: string, next: FeedbackStatus) => void
	onDelete: (id: string) => void
	onRetry: () => void
}

export function FeedbackPanelBody({
	items,
	loading,
	error,
	onStatusChange,
	onDelete,
	onRetry,
}: FeedbackPanelBodyProps): React.ReactElement {
	// Default the filter to "pending" — reviewers are here to work through
	// the open items, not to audit closed/addressed history. Flipping to
	// "All" / another status via the summary bar stays sticky for the
	// session.
	const [activeStatus, setActiveStatus] = useState<FeedbackStatus | null>(
		"pending",
	)

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
			{/* The FeedbackList owns its own scroll: the virtualized branch
			    uses react-window's built-in scroll; the plain <ul> branch
			    sets `h-full overflow-y-auto` directly so it fills the
			    flex-1 parent. Keeping `overflow-hidden` on this wrapper
			    prevents double-scrollbars when virtualization kicks in. */}
			<div className="flex-1 min-h-0 overflow-hidden">
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
