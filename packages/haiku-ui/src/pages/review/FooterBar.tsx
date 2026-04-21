/**
 * FooterBar — canonical review-decision action row for the review page.
 *
 * Renders the three review-decision buttons (Approve / External Review /
 * Request Changes). Wires each to `useApiClient().submitDecision(...)` so
 * the page does not call `fetch` directly. The per-feedback-item action
 * strip (Dismiss / Verify & Close / Reopen) lives on `FeedbackItem` inside
 * the sidebar — those are the verbs `footer-button-copy-spec.md` and
 * DESIGN-TOKENS §2.6 gate on. This footer's buttons (Approve, External
 * Review, Request Changes) are not on the banned-verb list.
 *
 * Each button carries `focusRingClass` with the appropriate variant and
 * `touchTargetClass` to meet the 44x44 minimum from
 * `touch-target-audit.md §2`. The Approve button opens a confirmation
 * pass when pending feedback is present — callers pass `hasPendingFeedback`
 * so this local decision is driven by the feedback list, not re-fetched.
 *
 * Scope for unit-07 bolt-1: this component ships the decision-button row
 * only. The legacy comment-composer textarea + per-comment edit/delete
 * block stays in `components/ReviewSidebar.tsx`, which the feedback
 * sidebar embeds. Consolidation is a follow-up unit.
 */

import type { ReviewAnnotations } from "haiku-api"
import { useCallback, useState } from "react"
import {
	focusRingClass,
	focusRingVariantClasses,
	touchTargetClass,
	useAnnounce,
} from "../../a11y"
import { useApiClient } from "../../api/context"

export interface FooterBarProps {
	sessionId: string
	gateType?: string
	/** True when the sidebar has unresolved pending feedback — flips the
	 *  Approve button into a confirmation flow. */
	hasPendingFeedback?: boolean
	/** Collected annotations (pins + inline comments) submitted with the
	 *  decision payload. */
	getAnnotations?: () => ReviewAnnotations | undefined
	/** Extra feedback string (general textarea) captured from the sidebar. */
	feedbackText?: string
	onSuccess?: () => void
	onError?: (message: string) => void
	className?: string
}

type DecisionKind = "approved" | "external" | "changes_requested"

const DECISION_LABELS: Record<DecisionKind, string> = {
	approved: "Approve",
	external: "External Review",
	changes_requested: "Request Changes",
}

const DECISION_ANNOUNCE: Record<DecisionKind, string> = {
	approved: "Review approved",
	external: "External review submitted",
	changes_requested: "Changes requested",
}

function isExternalGate(gateType: string | undefined): boolean {
	if (!gateType) return false
	return gateType.includes("external")
}

export function FooterBar({
	sessionId,
	gateType,
	hasPendingFeedback,
	getAnnotations,
	feedbackText,
	onSuccess,
	onError,
	className,
}: FooterBarProps): React.ReactElement {
	const client = useApiClient()
	const announce = useAnnounce()
	const [submitting, setSubmitting] = useState<DecisionKind | null>(null)
	const [pendingApprove, setPendingApprove] = useState(false)

	const submit = useCallback(
		async (decision: DecisionKind): Promise<void> => {
			setSubmitting(decision)
			try {
				const annotations = getAnnotations?.()
				await client.submitDecision(sessionId, {
					decision,
					feedback: feedbackText ?? "",
					annotations,
				})
				announce("polite", DECISION_ANNOUNCE[decision])
				onSuccess?.()
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Decision failed to submit"
				announce("assertive", message)
				onError?.(message)
			} finally {
				setSubmitting(null)
			}
		},
		[
			announce,
			client,
			feedbackText,
			getAnnotations,
			onError,
			onSuccess,
			sessionId,
		],
	)

	const handleApprove = useCallback((): void => {
		if (hasPendingFeedback && !pendingApprove) {
			setPendingApprove(true)
			return
		}
		setPendingApprove(false)
		void submit("approved")
	}, [hasPendingFeedback, pendingApprove, submit])

	const handleExternal = useCallback((): void => {
		void submit("external")
	}, [submit])

	const handleRequestChanges = useCallback((): void => {
		void submit("changes_requested")
	}, [submit])

	const showExternal = isExternalGate(gateType)

	return (
		<div
			data-testid="review-footer-bar"
			className={`flex flex-wrap items-center gap-3 border-t border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 ${className ?? ""}`}
		>
			<button
				type="button"
				onClick={handleApprove}
				disabled={submitting !== null}
				data-decision="approved"
				className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.approve} inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-600`}
			>
				{pendingApprove ? "Confirm Approve" : DECISION_LABELS.approved}
			</button>
			{showExternal && (
				<button
					type="button"
					onClick={handleExternal}
					disabled={submitting !== null}
					data-decision="external"
					className={`${touchTargetClass} ${focusRingClass} inline-flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50`}
				>
					{DECISION_LABELS.external}
				</button>
			)}
			<button
				type="button"
				onClick={handleRequestChanges}
				disabled={submitting !== null}
				data-decision="changes_requested"
				className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.requestChanges} inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50`}
			>
				{DECISION_LABELS.changes_requested}
			</button>
			{pendingApprove && (
				<span
					role="status"
					className="text-xs text-amber-700 dark:text-amber-300"
				>
					Pending feedback present — click Approve again to confirm.
				</span>
			)}
		</div>
	)
}
