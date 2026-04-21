/**
 * FeedbackFloatingButton — mobile-only FAB that toggles the `FeedbackSheet`.
 *
 * Extracted from `FeedbackSidebar.tsx` per FB-38. Purely presentational: no
 * hook wiring — the parent page owns the `isOpen` state and the click
 * callback.
 */

import { focusRingClass, touchTargetClass } from "../../a11y"

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
