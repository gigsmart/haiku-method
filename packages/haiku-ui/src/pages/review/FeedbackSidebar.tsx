/**
 * FeedbackSidebar — desktop LEFT-column composition of the review page.
 *
 * Matches the canonical design mockup (`stages/design/artifacts/review-ui-mockup.html`):
 *
 *   [Reviewing context]       stage title + current/gate badges + intent title
 *   [Feedback count header]   "Feedback — N" chip + tagline
 *   [Feedback list]           scrollable list of feedback cards
 *   [Composer + actions]      pinned bottom: textarea + smart decision button
 *
 * Smart decision button (canonical mockup §onApprove/onRequestChanges):
 *   - If there is any pending feedback on this stage OR the composer has
 *     typed text, the button is "Request Changes" (amber) and clicking it
 *     opens the RevisitModal with the current stage pinned as the revisit
 *     target. The composer text becomes the first reason.
 *   - Otherwise, if the selected stage IS the current active stage, the
 *     button is "Approve" (green) and posts to `submitDecision`.
 *   - Otherwise (non-current stage, nothing pending, nothing typed), the
 *     button is a disabled hint "Add feedback above to enable".
 *
 * Item-click bridge: a single delegated click handler on the list body
 * surfaces the clicked feedback's id to the parent `ReviewPage`, which
 * routes a highlight request to `StageReview` to scroll-and-flash the
 * matching artifact card.
 */

import type { ReviewAnnotations } from "haiku-api"
import { useCallback, useState } from "react"
import { Aside } from "../../a11y"
import {
	focusRingClass,
	focusRingVariantClasses,
	touchTargetClass,
	useAnnounce,
} from "../../a11y"
import { useApiClient } from "../../api/context"
import { RevisitModal } from "../../components/RevisitModal"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"

export interface FeedbackSidebarProps {
	intent: string | null
	stage: string | null
	activeStage?: string | null
	sessionId: string
	intentTitle?: string
	gateBadges?: Array<{ label: string; classes: string }>
	gateType?: string
	getAnnotations?: () => ReviewAnnotations | undefined
	onFeedbackItemClick?: (feedbackId: string) => void
	className?: string
}

type DecisionKind = "approved" | "external"

const DECISION_LABELS: Record<DecisionKind, string> = {
	approved: "Approve",
	external: "External",
}

const DECISION_ANNOUNCE: Record<DecisionKind, string> = {
	approved: "Review approved",
	external: "External review submitted",
}

function isExternalGate(gateType: string | undefined): boolean {
	return !!gateType && gateType.includes("external")
}

export function FeedbackSidebar({
	intent,
	stage,
	activeStage,
	sessionId,
	intentTitle,
	gateBadges,
	gateType,
	getAnnotations,
	onFeedbackItemClick,
	className,
}: FeedbackSidebarProps): React.ReactElement {
	const { items, loading, error, retry, handleStatusChange, handleDelete } =
		useFeedbackSidebarController(intent, stage)

	const client = useApiClient()
	const announce = useAnnounce()
	const [composerText, setComposerText] = useState("")
	const [submitting, setSubmitting] = useState<DecisionKind | null>(null)
	const [revisitOpen, setRevisitOpen] = useState(false)

	const pendingCount = items.filter((i) => i.status === "pending").length
	const hasPending = pendingCount > 0
	const hasTyped = composerText.trim().length > 0
	const showExternal = isExternalGate(gateType)
	const isCurrent = !!stage && stage === activeStage

	// Decide which button to render.
	const mode: "request" | "approve" | "disabled" =
		hasPending || hasTyped ? "request" : isCurrent ? "approve" : "disabled"

	const submit = useCallback(
		async (decision: DecisionKind): Promise<void> => {
			setSubmitting(decision)
			try {
				await client.submitDecision(sessionId, {
					decision,
					feedback: composerText,
					annotations: getAnnotations?.(),
				})
				announce("polite", DECISION_ANNOUNCE[decision])
				setComposerText("")
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Decision failed to submit"
				announce("assertive", message)
			} finally {
				setSubmitting(null)
			}
		},
		[announce, client, composerText, getAnnotations, sessionId],
	)

	const handleBodyClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>): void => {
			if (!onFeedbackItemClick) return
			const card = (e.target as HTMLElement).closest<HTMLElement>(
				"[data-feedback-id]",
			)
			if (!card) return
			const id = card.getAttribute("data-feedback-id")
			if (id) onFeedbackItemClick(id)
		},
		[onFeedbackItemClick],
	)

	const hintText =
		mode === "request"
			? `Will trigger haiku_revisit → ${stage ?? "(stage)"} ${hasPending ? "· pending feedback" : "· composer has feedback"}`
			: mode === "approve"
				? "No feedback pending — approving advances the FSM to the next stage."
				: `Type feedback above to revisit ${stage ?? "this stage"}, or click into another stage.`

	return (
		<Aside
			data-testid="feedback-sidebar-desktop"
			ariaLabel="Review sidebar"
			className={`hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 flex-col bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 overflow-hidden ${className ?? ""}`}
		>
			{/* Reviewing context */}
			<div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
				<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-1">
					Reviewing
				</p>
				<h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight capitalize">
					{stage ?? "Intent"}
				</h2>
				<div className="flex items-center gap-1.5 mt-2 flex-wrap">
					{stage && (
						<span
							className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isCurrent ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}
						>
							{isCurrent ? "current" : "viewing"}
						</span>
					)}
					{gateBadges?.map((b) => (
						<span
							key={b.label}
							className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${b.classes}`}
						>
							{b.label}
						</span>
					))}
					{intentTitle && (
						<span className="text-xs text-stone-500 truncate">
							{intentTitle}
						</span>
					)}
				</div>
			</div>

			{/* Feedback count header */}
			<div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold text-stone-700 dark:text-stone-200 uppercase tracking-wider">
						Feedback
					</span>
					<span
						className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
							pendingCount > 0
								? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
								: "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
						}`}
					>
						{pendingCount}
					</span>
				</div>
				<span className="text-xs text-stone-500 italic">
					everything is specification
				</span>
			</div>

			{/* Feedback list — scrollable; delegated click surfaces item id */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: delegated click is the idiomatic way to bridge list-item clicks to the parent highlight controller without wrapping every item. Keyboard nav already lives on FeedbackItem's disclosure button. */}
			<div
				className="flex flex-col flex-1 min-h-0"
				onClick={handleBodyClick}
			>
				<FeedbackPanelBody
					items={items}
					loading={loading}
					error={error}
					onStatusChange={handleStatusChange}
					onDelete={handleDelete}
					onRetry={retry}
				/>
			</div>

			{/* Composer + decision actions — pinned bottom */}
			<div
				data-testid="review-footer-bar"
				className="shrink-0 border-t border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 space-y-2"
			>
				<textarea
					value={composerText}
					onChange={(e) => setComposerText(e.target.value)}
					placeholder="Add feedback on this stage..."
					rows={2}
					className="w-full text-xs p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
				/>
				<div className="flex gap-2 flex-wrap">
					{mode === "approve" && (
						<button
							type="button"
							onClick={() => void submit("approved")}
							disabled={submitting !== null}
							data-decision="approved"
							className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.approve} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200`}
						>
							{DECISION_LABELS.approved}
						</button>
					)}
					{mode === "request" && (
						<button
							type="button"
							onClick={() => setRevisitOpen(true)}
							disabled={submitting !== null}
							data-decision="changes_requested"
							className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.requestChanges} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900`}
						>
							{isCurrent ? "Request Changes" : `Request Changes on ${stage}`}
						</button>
					)}
					{mode === "disabled" && (
						<button
							type="button"
							disabled
							className={`${touchTargetClass} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-stone-100 dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-500 dark:text-stone-300 cursor-not-allowed`}
						>
							Add feedback above to enable
						</button>
					)}
					{showExternal && mode === "approve" && (
						<button
							type="button"
							onClick={() => void submit("external")}
							disabled={submitting !== null}
							data-decision="external"
							className={`${touchTargetClass} ${focusRingClass} inline-flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50`}
						>
							{DECISION_LABELS.external}
						</button>
					)}
				</div>
				<p className="text-xs text-stone-500 dark:text-stone-300 leading-snug pt-1 border-t border-stone-100 dark:border-stone-800">
					{hintText}
				</p>
			</div>

			<RevisitModal
				sessionId={sessionId}
				open={revisitOpen}
				onClose={() => setRevisitOpen(false)}
				onSuccess={() => {
					announce("polite", "Revisit requested")
					setComposerText("")
				}}
				targetStage={stage ?? undefined}
			/>
		</Aside>
	)
}
