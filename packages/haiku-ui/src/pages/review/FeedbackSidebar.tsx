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

import type { ApproveAction, ReviewAnnotations } from "haiku-api"
import { useCallback, useState } from "react"
import {
	Aside,
	focusRingClass,
	focusRingVariantClasses,
	touchTargetClass,
	useAnnounce,
} from "../../a11y"
import { useApiClient } from "../../api/context"
import { RevisitModal } from "../../organisms/RevisitModal"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import {
	KnowledgeUploadPanel,
	type KnowledgeUploadResult,
} from "./KnowledgeUploadPanel"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"

export interface FeedbackSidebarProps {
	stage: string | null
	activeStage?: string | null
	sessionId: string
	/** Intent slug — required for the embedded KnowledgeUploadPanel's
	 *  `POST /api/intents/:intent/uploads/knowledge` calls. When omitted,
	 *  the upload panel is hidden (e.g., session not yet bound to an
	 *  intent). */
	intentSlug?: string | null
	intentTitle?: string
	gateBadges?: Array<{ label: string; classes: string }>
	gateType?: string
	/** Server-computed Approve button copy + kind. Reflects the actual
	 *  consequence of clicking Approve (e.g. "Complete Development Stage",
	 *  "Open Pull Request", "Mark Intent Done"). Falls back to the static
	 *  "Approve" string when undefined. */
	approveAction?: ApproveAction
	getAnnotations?: () => ReviewAnnotations | undefined
	onFeedbackItemClick?: (feedbackId: string) => void
	onDecisionSuccess?: (decision: DecisionKind) => void
	/** When true, the pane is an ad-hoc on-demand review. Approve is
	 *  hidden (no gate to advance); the primary button becomes "Done"
	 *  (no pending feedback) or "Request Changes" (pending feedback
	 *  persists and will be picked up by the next run_next). */
	adHoc?: boolean
	/** True while a haiku_await_gate tool call is currently blocked on
	 *  this session. When false, Approve is disabled — the engine isn't
	 *  asking for a decision right now. Feedback authoring stays open
	 *  regardless, and the empty-state hint nudges the user toward
	 *  leaving feedback to force a decision on the next tick. */
	awaitActive?: boolean
	/** Set when the SPA submitted a decision while no await was open.
	 *  The next haiku_await_gate call drains it on entry. While set,
	 *  Approve is disabled and the hint shows "decision queued, waiting
	 *  for engine." */
	pendingDecisionQueued?: boolean
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
	stage,
	activeStage,
	sessionId,
	intentSlug,
	intentTitle,
	gateBadges,
	gateType,
	approveAction,
	getAnnotations,
	onFeedbackItemClick,
	onDecisionSuccess,
	adHoc,
	awaitActive,
	pendingDecisionQueued,
	className,
}: FeedbackSidebarProps): React.ReactElement {
	const {
		items,
		loading,
		error,
		busyIds,
		creating,
		retry,
		handleStatusChange,
		handleDelete,
		handleReply,
		createFeedback,
	} = useFeedbackSidebarController()

	const client = useApiClient()
	const announce = useAnnounce()
	// `composerText` stages the NEXT comment. Pressing "Add" creates a
	// pending feedback item; the textarea clears. Request Changes then
	// fires revisit with whatever pending items have accumulated — no
	// blob-text pooling at the decide step.
	const [composerText, setComposerText] = useState("")
	// Resolution the reviewer wants this comment routed through. `null`
	// means "let the agent triage" — the default and most common path.
	const [composerResolution, setComposerResolution] = useState<
		null | "question" | "inline_fix" | "stage_revisit"
	>(null)
	const [addingComment, setAddingComment] = useState(false)
	const [submitting, setSubmitting] = useState<DecisionKind | null>(null)
	const [revisitOpen, setRevisitOpen] = useState(false)

	const pendingCount = items.filter((i) => i.status === "pending").length
	const hasPending = pendingCount > 0

	// Upload handler — POSTs each file to
	// `/api/intents/:intent/uploads/knowledge` (registered in
	// http/upload-routes.ts). Returns the canonical KnowledgeUploadResult
	// shape so the panel can render success/failure toasts and progress
	// bars without further translation. Empty / failure cases return
	// structurally-valid results so the panel never throws on a half-done
	// upload — partial successes show in `uploaded`, partial failures in
	// `failed`.
	const handleKnowledgeUpload = useCallback(
		async (
			files: File[],
			destination: string,
		): Promise<KnowledgeUploadResult> => {
			if (!intentSlug) {
				return {
					ok: false,
					uploaded: [],
					failed: files.map((f) => ({
						file: f,
						error: "Intent context unavailable — refresh and retry.",
					})),
				}
			}
			const uploaded: File[] = []
			const failed: KnowledgeUploadResult["failed"] = []
			for (const file of files) {
				const form = new FormData()
				form.append("file", file)
				form.append("destination", destination)
				try {
					const res = await fetch(
						`/api/intents/${encodeURIComponent(intentSlug)}/uploads/knowledge`,
						{ method: "POST", body: form, credentials: "include" },
					)
					if (!res.ok) {
						const detail = await res.text().catch(() => "")
						failed.push({
							file,
							error: `Upload failed (HTTP ${res.status}): ${detail || "no response body"}`,
						})
						continue
					}
					uploaded.push(file)
				} catch (err) {
					failed.push({
						file,
						error: err instanceof Error ? err.message : String(err),
					})
				}
			}
			return { ok: failed.length === 0, uploaded, failed }
		},
		[intentSlug],
	)
	const hasTyped = composerText.trim().length > 0
	const showExternal = isExternalGate(gateType)
	const isCurrent = !!stage && stage === activeStage

	// Decide which action to emphasize. Typed text → Add is the primary
	// action (stage a comment). Any pending items → Request Changes is
	// primary (fire revisit). Otherwise the stage is clean and we offer
	// Approve.
	//
	// Ad-hoc pane: Approve is never shown (no gate). When nothing is
	// pending the primary button becomes "Done" (just close the tab —
	// the mode label stays "approve" internally but the rendered button
	// is swapped below). When feedback is pending it becomes "Request
	// Changes" that closes the tab without firing revisit — the next
	// run_next picks the feedback up via the normal fix-loop.
	const mode: "add" | "request" | "approve" | "disabled" = hasTyped
		? "add"
		: hasPending
			? "request"
			: adHoc
				? "approve"
				: isCurrent
					? "approve"
					: "disabled"

	const handleAddComment = useCallback(async () => {
		const body = composerText.trim()
		if (!body) return
		setAddingComment(true)
		try {
			const firstLine = body.split("\n")[0]?.slice(0, 80) || "Comment"
			const origin =
				composerResolution === "question" ? "user-question" : "user-chat"
			await createFeedback({
				title: firstLine,
				body,
				origin,
				source_ref: null,
				resolution: composerResolution ?? undefined,
			})
			setComposerText("")
			setComposerResolution(null)
			announce(
				"polite",
				composerResolution === "question" ? "Question added" : "Comment added",
			)
		} catch (err) {
			announce(
				"assertive",
				err instanceof Error ? err.message : "Failed to add comment",
			)
		} finally {
			setAddingComment(false)
		}
	}, [announce, composerResolution, composerText, createFeedback])

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
				onDecisionSuccess?.(decision)
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Decision failed to submit"
				announce("assertive", message)
			} finally {
				setSubmitting(null)
			}
		},
		[
			announce,
			client,
			composerText,
			getAnnotations,
			sessionId,
			onDecisionSuccess,
		],
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

	// Live-session gating: in non-ad-hoc gate review, Approve is only
	// active when an MCP haiku_await_gate is currently waiting on a
	// decision (awaitActive=true). When the engine isn't asking
	// (awaitActive=false), Approve is disabled — the user can still
	// leave feedback, and the next workflow tick will pick it up. When
	// a decision is already queued (pendingDecisionQueued), Approve is
	// disabled with a "waiting for engine to consume" hint.
	const approveGated =
		mode === "approve" && !adHoc && (!awaitActive || !!pendingDecisionQueued)

	const hintText = adHoc
		? mode === "add"
			? "Adds a pending feedback item. Persisted immediately — the next run_next picks it up via the normal fix-loop."
			: mode === "request"
				? `${pendingCount} pending item${pendingCount === 1 ? "" : "s"} already persisted. Request Changes closes this pane; the next run_next routes each item through the normal fix-loop.`
				: "Ad-hoc review — no gate to advance. Done closes the pane without touching the workflow engine."
		: mode === "add"
			? 'Adds a pending feedback item. Use the Route dropdown to steer the agent, or leave it on "Let agent decide" and the triage pass will classify.'
			: mode === "request"
				? `Hands ${pendingCount} item${pendingCount === 1 ? "" : "s"} to the agent on ${stage ?? "(stage)"}. Each routes per its resolution: reply, inline fix, stage revisit, or upstream rewind.`
				: mode === "approve"
					? pendingDecisionQueued
						? "Decision queued — waiting for the engine to consume it on the next tick."
						: awaitActive
							? "Engine is waiting on your decision. Approve to advance, or leave feedback to request changes."
							: "No engine call is awaiting a decision right now. Leave feedback to force one on the next tick, or wait for the agent to drive back to a gate."
					: `Type a comment above or click into another stage.`

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
			{/* biome-ignore lint/a11y/noStaticElementInteractions: delegated click bridges list-item clicks to the parent highlight controller without wrapping every item */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav lives on the contained FeedbackItem disclosure buttons; this wrapper is mouse-position-routing only */}
			<div className="flex flex-col flex-1 min-h-0" onClick={handleBodyClick}>
				<FeedbackPanelBody
					items={items}
					loading={loading}
					error={error}
					onStatusChange={handleStatusChange}
					onDelete={handleDelete}
					onRetry={retry}
					onReply={handleReply}
					busyIds={busyIds}
					creating={creating}
				/>
			</div>

			{/* Knowledge upload panel — collapsible <details> below the
			    feedback list, above the composer. Per SPA-UI-SPECS §1.1.
			    Hidden when the session has no intent context (ad-hoc reviews
			    pre-bind sometimes). `defaultOpen={false}` keeps the panel
			    collapsed at first paint so its drop-zone autofocus doesn't
			    steal Tab order from the SkipLink (the FB-30 regression
			    guard test asserts the first Tab lands on the skip-link). */}
			{intentSlug && (
				<div className="shrink-0 border-t border-stone-200 dark:border-stone-700">
					<KnowledgeUploadPanel
						intentSlug={intentSlug}
						currentStage={stage ?? activeStage ?? ""}
						onUpload={handleKnowledgeUpload}
						defaultOpen={false}
					/>
				</div>
			)}

			{/* Composer + decision actions — pinned bottom */}
			<div
				data-testid="review-footer-bar"
				className="shrink-0 border-t border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 space-y-2"
			>
				<textarea
					value={composerText}
					onChange={(e) => setComposerText(e.target.value)}
					onKeyDown={(e) => {
						// Meta/Ctrl+Enter adds the comment without reaching
						// for the mouse. Plain Enter still inserts a newline
						// — reviewers type multi-line comments often enough
						// that hijacking Enter would be a footgun.
						if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
							e.preventDefault()
							void handleAddComment()
						}
					}}
					placeholder="Add a comment on this stage…"
					rows={2}
					disabled={addingComment}
					aria-disabled={addingComment || undefined}
					className="w-full text-xs p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none disabled:bg-stone-100 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-400 disabled:cursor-not-allowed"
				/>
				<div className="flex items-center gap-2">
					<label
						htmlFor="feedback-resolution-route"
						className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 shrink-0"
					>
						Route:
					</label>
					<select
						id="feedback-resolution-route"
						value={composerResolution ?? ""}
						onChange={(e) => {
							const v = e.target.value
							setComposerResolution(
								v === ""
									? null
									: (v as "question" | "inline_fix" | "stage_revisit"),
							)
						}}
						disabled={addingComment}
						aria-label="How should the agent resolve this comment"
						className="flex-1 text-xs px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-stone-100 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-400 disabled:cursor-not-allowed"
					>
						<option value="">Let agent decide</option>
						<option value="question">Question · wants a reply</option>
						<option value="inline_fix">Inline fix · one-bolt patch</option>
						<option value="stage_revisit">
							Stage revisit · re-run the stage
						</option>
					</select>
				</div>
				<div className="flex gap-2 flex-wrap">
					{(mode === "add" || mode === "disabled") && (
						<button
							type="button"
							onClick={() => void handleAddComment()}
							disabled={!hasTyped || addingComment}
							className={`${touchTargetClass} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 px-3 py-2 text-xs font-semibold text-white transition-colors disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
						>
							{addingComment
								? "Adding…"
								: hasTyped
									? "Add comment (⌘↵)"
									: "Type a comment to add"}
						</button>
					)}
					{mode === "request" && !adHoc && (
						<button
							type="button"
							onClick={() => setRevisitOpen(true)}
							disabled={submitting !== null}
							data-decision="changes_requested"
							className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.requestChanges} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 px-3 py-2 text-xs font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900`}
						>
							{isCurrent
								? `Send ${pendingCount} to agent`
								: `Send ${pendingCount} on ${stage}`}
						</button>
					)}
					{mode === "request" && adHoc && (
						<button
							type="button"
							onClick={() => void submit("changes_requested" as DecisionKind)}
							disabled={submitting !== null}
							data-decision="ad_hoc_request_changes"
							className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.requestChanges} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition-colors`}
							title="Ad-hoc review: pending feedback is already persisted. Clicking this closes the pane and signals the MCP call to return; the next run_next routes each item through the normal fix-loop."
						>
							{submitting ? "Submitting…" : `Request Changes (${pendingCount})`}
						</button>
					)}
					{mode === "approve" && !adHoc && (
						<button
							type="button"
							onClick={() => void submit("approved")}
							disabled={submitting !== null || approveGated}
							data-decision="approved"
							data-await-gated={approveGated || undefined}
							title={
								pendingDecisionQueued
									? "Decision queued — waiting for the engine to consume it on the next tick."
									: !awaitActive
										? "No engine call is awaiting a decision right now. Leave feedback to force one on the next tick."
										: undefined
							}
							className={`${touchTargetClass} ${focusRingClass} ${focusRingVariantClasses.approve} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200`}
						>
							{approveAction?.label ?? DECISION_LABELS.approved}
						</button>
					)}
					{mode === "approve" && adHoc && (
						<button
							type="button"
							onClick={() => void submit("approved")}
							disabled={submitting !== null}
							data-decision="ad_hoc_done"
							className={`${touchTargetClass} ${focusRingClass} flex-1 min-w-0 inline-flex items-center justify-center gap-2 rounded-md bg-stone-700 hover:bg-stone-800 px-3 py-2 text-xs font-semibold text-white transition-colors`}
							title="Ad-hoc review — no gate to advance. Closes the pane and signals the MCP call to return."
						>
							{submitting ? "Submitting…" : "Done"}
						</button>
					)}
					{showExternal && mode === "approve" && !adHoc && (
						<button
							type="button"
							onClick={() => void submit("external")}
							disabled={submitting !== null || approveGated}
							data-decision="external"
							data-await-gated={approveGated || undefined}
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
					announce("polite", "Feedback sent to agent")
					setComposerText("")
				}}
				targetStage={stage ?? undefined}
				pendingItems={items.filter((i) => i.status === "pending")}
			/>
		</Aside>
	)
}
