/**
 * RevisitModal — confirmation dialog for handing a stack of pending
 * feedback items back to the agent. In the stacked-comments model the
 * pending feedback IS the payload: each item was authored deliberately
 * with its own resolution hint (or left null for agent triage). This
 * dialog is a final "you're about to hand these off" confirmation, not
 * a second data-entry form.
 *
 * The agent then triages any item whose `resolution` is null, then
 * routes each finding to the right resolver:
 *   - question         → feedback_answer (agent replies, no code delta)
 *   - inline_fix       → one fix_hats bolt against the single finding
 *   - stage_revisit    → rolls the stage back to elaborate
 *   - upstream_rewind  → surfaces to human (cross-stage finding)
 *
 * "Revisit" is one of four possible outcomes, not the default, so the
 * copy intentionally says "Send to agent" rather than "Confirm revisit."
 *
 * A11y contract preserved from the earlier form-based revision:
 *   - `role="dialog" aria-modal="true"` with labelled header
 *   - Escape / backdrop / Cancel all dismiss
 *   - Focus trap via the canonical `useFocusTrap`
 *   - Submit failure surfaces a `role="alert"` banner — modal stays open
 */

import type { RevisitRequest, RevisitResponse } from "haiku-api"
import { useEffect, useId, useRef, useState } from "react"
import {
	focusRingClass,
	focusRingVariantClasses,
	useFocusTrap,
} from "../a11y/focus"
import { touchTargetClass } from "../a11y/touch-target"
import { type ApiClient, defaultApiClient } from "../api/client"
import type { FeedbackItemData } from "../types"

/** Legacy export — the "max reasons per revisit" cap from the form era.
 *  Still consumed by tests + by the server schema; kept as a constant so
 *  callers that import it (if any) don't break. */
export const UI_REASONS_MAX = 50

interface PendingSummary {
	id: string
	title: string
	origin: string
	resolution: string | null
}

function labelForResolution(resolution: string | null): string {
	switch (resolution) {
		case "question":
			return "Question · wants a reply"
		case "inline_fix":
			return "Inline fix"
		case "stage_revisit":
			return "Stage revisit"
		case "upstream_rewind":
			return "Upstream rewind"
		default:
			return "Agent will triage"
	}
}

export interface RevisitModalProps {
	sessionId: string
	open: boolean
	onClose: () => void
	onSuccess?: (response: RevisitResponse) => void
	targetStage?: string
	/** Pending feedback items currently on the stage — they ARE the
	 *  reasons, so we just list them and confirm. Empty / missing is
	 *  valid (the agent still has typed composer-blob feedback from the
	 *  legacy path if someone types into the approve button's feedback
	 *  field), but in the new flow the submit button should be disabled
	 *  when this is empty. */
	pendingItems?: ReadonlyArray<FeedbackItemData>
	apiClient?: ApiClient
}

export function RevisitModal({
	sessionId,
	open,
	onClose,
	onSuccess,
	targetStage,
	pendingItems,
	apiClient = defaultApiClient,
}: RevisitModalProps): React.ReactElement | null {
	const dialogRef = useRef<HTMLDivElement>(null)
	const firstButtonRef = useRef<HTMLButtonElement | null>(null)

	const titleId = useId()
	const descId = useId()

	const [submitting, setSubmitting] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)

	useFocusTrap(dialogRef, open)

	// Escape listener — installed on document so it fires regardless of focus
	// target (input, button, or the dialog wrapper itself).
	useEffect(() => {
		if (!open) return
		function onKey(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				e.preventDefault()
				onClose()
			}
		}
		document.addEventListener("keydown", onKey)
		return () => document.removeEventListener("keydown", onKey)
	}, [open, onClose])

	// Focus the primary submit button on open so ⌘↵ / Enter fires the
	// confirm without hunting for the mouse.
	useEffect(() => {
		if (!open) return
		firstButtonRef.current?.focus()
	}, [open])

	// Reset local state when the modal closes.
	useEffect(() => {
		if (open) return
		setSubmitting(false)
		setSubmitError(null)
	}, [open])

	if (!open) return null

	const items: PendingSummary[] = (pendingItems ?? []).map((i) => ({
		id: i.feedback_id,
		title: i.title,
		origin: i.origin,
		resolution: (i.resolution ?? null) as string | null,
	}))
	const canSubmit = items.length > 0 && !submitting

	async function handleSubmit(): Promise<void> {
		if (submitting) return
		setSubmitting(true)
		setSubmitError(null)
		// Empty `reasons` — the pending feedback items on disk are the
		// payload. The server's revisit handler + the orchestrator's
		// post-revisit routing pick up each item's `resolution` and
		// dispatch it per the resolver table above.
		const payload: RevisitRequest = {
			...(targetStage ? { stage: targetStage } : {}),
		}
		try {
			const response = await apiClient.submitRevisit(sessionId, payload)
			onSuccess?.(response)
			onClose()
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Unexpected error")
			setSubmitting(false)
		}
	}

	return (
		<div
			data-testid="revisit-modal-backdrop"
			className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click handlers are event-boundary containment, keyboard path is document-level Escape + focus trap. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: same. */}
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descId}
				className="w-full max-w-md bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col max-h-[90vh]"
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
					<div className="flex items-center gap-2 min-w-0">
						<span
							aria-hidden="true"
							className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold"
						>
							↗
						</span>
						<h2
							id={titleId}
							className="text-base font-bold text-stone-900 dark:text-stone-100 truncate"
						>
							Send feedback to agent
						</h2>
					</div>
					<button
						type="button"
						aria-label="Dismiss"
						onClick={onClose}
						className={`${touchTargetClass} inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 ${focusRingClass}`}
					>
						<span aria-hidden="true" className="text-lg leading-none">
							×
						</span>
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
					<p id={descId} className="text-xs text-stone-600 dark:text-stone-300">
						The agent will triage each item and pick a resolution path — reply,
						inline fix, stage revisit, or upstream rewind. Items you routed
						explicitly will keep your choice.
					</p>

					{items.length === 0 ? (
						<p className="text-xs italic text-stone-500 dark:text-stone-400">
							No pending feedback on this stage. Add a comment first, then Send.
						</p>
					) : (
						<ul aria-label="Pending feedback items" className="space-y-2">
							{items.map((it) => (
								<li
									key={it.id}
									className="rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-3 py-2"
								>
									<div className="flex items-center justify-between gap-2 flex-wrap">
										<span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
											{it.id}
										</span>
										<span
											className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
												it.resolution
													? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
													: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
											}`}
										>
											{labelForResolution(it.resolution)}
										</span>
									</div>
									<p className="mt-1 text-xs text-stone-700 dark:text-stone-200 [overflow-wrap:anywhere]">
										{it.title}
									</p>
								</li>
							))}
						</ul>
					)}

					{submitError && (
						<div
							role="alert"
							className="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-xs text-red-800 dark:text-red-200"
						>
							{submitError}
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700">
					<button
						type="button"
						onClick={onClose}
						className={`px-3 py-1.5 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 ${focusRingClass}`}
					>
						Cancel
					</button>
					<button
						ref={firstButtonRef}
						type="button"
						onClick={() => {
							void handleSubmit()
						}}
						disabled={!canSubmit}
						aria-disabled={!canSubmit || undefined}
						className={`px-3 py-1.5 text-xs font-semibold rounded-md ${focusRingVariantClasses.requestChanges} ${
							!canSubmit
								? "bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400 cursor-not-allowed"
								: "bg-teal-700 hover:bg-teal-800 text-white"
						}`}
					>
						{submitting
							? "Sending…"
							: items.length > 0
								? `Send ${items.length} item${items.length === 1 ? "" : "s"} to agent`
								: "Send to agent"}
					</button>
				</div>
			</div>
		</div>
	)
}
