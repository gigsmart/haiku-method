/**
 * RevisitModal — native-semantics confirmation dialog for revisiting an earlier
 * stage. Collects 1..N reasons (title + body), validates each via Zod against
 * stricter-than-wire bounds (see unit-11 tactical plan §R1), and POSTs the
 * resulting `RevisitRequest` to `/api/revisit/:sessionId` through the typed
 * `ApiClient` contract.
 *
 * A11y contract (per unit-05 focus-trap primitive + revisit-modal-spec.html):
 *   - Root: `role="dialog" aria-modal="true" aria-labelledby` + a stable,
 *     component-scoped id token so nested multi-instance usages don't collide.
 *   - Focus trap via the canonical `useFocusTrap` hook.
 *   - Focus lands on the first reason's title input on open (acceptance
 *     criterion). Restore-focus-to-trigger is handled by `useFocusTrap`.
 *   - Escape, backdrop click, and Cancel all dismiss and return focus.
 *   - Inline errors render per `revisit-modal-states.html` error state.
 *   - Submit failure surfaces a `role="alert"` banner — modal stays open.
 *
 * Scope boundaries (see unit-11 spec "Out of scope"):
 *   - The feedback-assessor fix-loop logic is MCP-side and does not live here.
 *   - Mounting this modal into ReviewPage is another unit's job.
 */

import { useEffect, useId, useRef, useState } from "react"
import { z } from "zod"
import type { RevisitReason, RevisitRequest, RevisitResponse } from "haiku-api"
import { focusRingClass, focusRingVariantClasses } from "../a11y/focus"
import { useFocusTrap } from "../a11y/focus"
import { touchTargetClass } from "../a11y/touch-target"
import { type ApiClient, defaultApiClient } from "../api/client"

// ── Client-side validation bounds ─────────────────────────────────────────
//
// Unit spec asserts: title ≤ 200, body ≤ 10_000, reasons ≤ 50. The wire
// schema (packages/haiku-api/src/schemas/revisit.ts) caps title at 120 and
// has no body/reasons.length cap. The UI enforces the TIGHTER of each:
//   - title: min(200, 120) = 120 (avoid 400s from the server)
//   - body:  10_000 (stricter than wire, which is unbounded)
//   - reasons: 50 (stricter than wire, which is unbounded)
// Rationale lives in unit-11 tactical plan §R1.
export const UI_TITLE_MAX = 120
export const UI_BODY_MAX = 10_000
export const UI_REASONS_MAX = 50

const UiReasonSchema = z.object({
	title: z
		.string()
		.min(1, "Title required")
		.max(UI_TITLE_MAX, `Title must be ≤ ${UI_TITLE_MAX} characters`),
	body: z
		.string()
		.min(1, "Body required")
		.max(
			UI_BODY_MAX,
			`Body must be ≤ ${UI_BODY_MAX.toLocaleString()} characters`,
		),
})

const UiRevisitSchema = z.object({
	reasons: z
		.array(UiReasonSchema)
		.min(1, "At least one reason required")
		.max(UI_REASONS_MAX, `At most ${UI_REASONS_MAX} reasons`),
})

interface ReasonDraft {
	id: string
	title: string
	body: string
}

interface ReasonErrors {
	title?: string
	body?: string
}

export interface RevisitModalProps {
	/** Session id — becomes the `:sessionId` path parameter for the POST. */
	sessionId: string
	/** Whether the dialog is mounted + visible. */
	open: boolean
	/** Invoked on every dismiss path (Escape, backdrop, Cancel, successful submit). */
	onClose: () => void
	/** Optional success callback — called after a 200 response and before `onClose()`. */
	onSuccess?: (response: RevisitResponse) => void
	/** Optional stage override forwarded to the orchestrator. */
	targetStage?: string
	/** Optional ApiClient override (tests inject a mock; production uses `defaultApiClient`). */
	apiClient?: ApiClient
}

function createDraft(): ReasonDraft {
	// `crypto.randomUUID` is available in jsdom 25 + all evergreen browsers. If
	// future targets lack it, swap to a tiny counter; not worth a polyfill dep today.
	return {
		id:
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `r-${Math.random().toString(36).slice(2)}-${Date.now()}`,
		title: "",
		body: "",
	}
}

function validateReason(draft: ReasonDraft): ReasonErrors {
	const result = UiReasonSchema.safeParse({ title: draft.title, body: draft.body })
	if (result.success) return {}
	const errors: ReasonErrors = {}
	for (const issue of result.error.issues) {
		const key = issue.path[0]
		if (key === "title" && !errors.title) errors.title = issue.message
		if (key === "body" && !errors.body) errors.body = issue.message
	}
	return errors
}

export function RevisitModal({
	sessionId,
	open,
	onClose,
	onSuccess,
	targetStage,
	apiClient = defaultApiClient,
}: RevisitModalProps): React.ReactElement | null {
	const dialogRef = useRef<HTMLDivElement>(null)
	const firstTitleInputRef = useRef<HTMLInputElement | null>(null)

	const titleId = useId()
	const descId = useId()
	const formErrorId = useId()

	const [reasons, setReasons] = useState<ReasonDraft[]>(() => [createDraft()])
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

	// Focus-first-input override — useFocusTrap focuses the first tabbable
	// child (the close button). Spec requires focus on the first reason input.
	// Effect declaration order matters: this fires AFTER the trap's effect
	// (they're in the same commit), so the override is deterministic without
	// needing rAF deferrals. Doing this synchronously also keeps jsdom +
	// userEvent.type timing clean — a deferred rAF can steal focus mid-type.
	useEffect(() => {
		if (!open) return
		firstTitleInputRef.current?.focus()
	}, [open])

	// Reset local state when the modal closes to avoid stale drafts on reopen.
	// Only reset when transitioning open → closed externally (not on every render).
	useEffect(() => {
		if (open) return
		setReasons([createDraft()])
		setSubmitting(false)
		setSubmitError(null)
	}, [open])

	if (!open) return null

	// Per-reason validation — runs on every render so inline errors are live.
	const reasonErrors: ReasonErrors[] = reasons.map(validateReason)
	const formValidation = UiRevisitSchema.safeParse({
		reasons: reasons.map((r) => ({ title: r.title, body: r.body })),
	})
	const formValid = formValidation.success
	const formLevelError = formValidation.success
		? null
		: (() => {
				// Surface only TOP-LEVEL reasons-array errors (too few / too many).
				// Per-reason errors are rendered inline beside the affected input.
				for (const issue of formValidation.error.issues) {
					if (issue.path.length === 1 && issue.path[0] === "reasons") {
						return issue.message
					}
					if (
						issue.path.length === 0 ||
						(issue.path.length >= 1 && issue.path[0] !== "reasons")
					) {
						// Defensive — no other top-level fields today.
						return issue.message
					}
				}
				return null
		  })()

	function updateReason(index: number, patch: Partial<ReasonDraft>): void {
		setReasons((prev) =>
			prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
		)
	}

	function addReason(): void {
		setReasons((prev) => {
			if (prev.length >= UI_REASONS_MAX) return prev
			return [...prev, createDraft()]
		})
	}

	function removeReason(id: string): void {
		setReasons((prev) => {
			if (prev.length <= 1) return prev
			return prev.filter((r) => r.id !== id)
		})
	}

	async function handleSubmit(e?: React.FormEvent): Promise<void> {
		e?.preventDefault()
		if (!formValid || submitting) return
		setSubmitting(true)
		setSubmitError(null)
		const payload: RevisitRequest = {
			...(targetStage ? { stage: targetStage } : {}),
			reasons: reasons.map<RevisitReason>((r) => ({
				title: r.title,
				body: r.body,
			})),
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

	const addDisabled = reasons.length >= UI_REASONS_MAX

	return (
		<div
			// Backdrop. The visual scrim is decorative, but we can't set
			// aria-hidden on this wrapper because it wraps the dialog too —
			// aria-hidden cascades and would remove the dialog from the a11y tree.
			// Clicks that originate on the backdrop itself (not inside the dialog)
			// dismiss; the dialog body stops propagation to prevent false hits.
			data-testid="revisit-modal-backdrop"
			className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dialog click handler stops propagation; the keyboard path is handled via document-level Escape + the focus trap. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: same rationale — click is for event-boundary containment only, not an activation affordance. */}
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descId}
				className="w-full max-w-md bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col max-h-[90vh]"
				onMouseDown={(e) => {
					e.stopPropagation()
				}}
				onClick={(e) => {
					e.stopPropagation()
				}}
			>
				{/* Header */}
				<div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
					<div className="flex items-center gap-2 min-w-0">
						<span
							aria-hidden="true"
							className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold"
						>
							↩
						</span>
						<h2
							id={titleId}
							className="text-base font-bold text-stone-900 dark:text-stone-100 truncate"
						>
							Confirm revisit
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

				{/* Body */}
				<form
					onSubmit={handleSubmit}
					className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
				>
					<p
						id={descId}
						className="text-xs text-stone-600 dark:text-stone-300"
					>
						Record one or more reasons for revisiting. Each becomes a feedback
						item before the stage rolls back.
					</p>

					{reasons.map((reason, index) => {
						const errors = reasonErrors[index] ?? {}
						const titleErrId = `${reason.id}-title-err`
						const bodyErrId = `${reason.id}-body-err`
						return (
							<fieldset
								key={reason.id}
								className="rounded-md border border-stone-200 dark:border-stone-700 p-3 space-y-2"
							>
								<legend className="text-xs font-semibold text-stone-600 dark:text-stone-300 px-1">
									Reason {index + 1}
								</legend>
								<div className="space-y-1">
									<label
										htmlFor={`${reason.id}-title`}
										className="block text-xs font-semibold text-stone-700 dark:text-stone-300"
									>
										Title
									</label>
									<input
										id={`${reason.id}-title`}
										ref={index === 0 ? firstTitleInputRef : undefined}
										type="text"
										value={reason.title}
										onChange={(e) =>
											updateReason(index, { title: e.target.value })
										}
										aria-invalid={errors.title ? "true" : undefined}
										aria-describedby={errors.title ? titleErrId : undefined}
										className={`w-full px-3 py-2 text-sm rounded-md border bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 ${
											errors.title
												? "border-red-400 dark:border-red-700"
												: "border-stone-300 dark:border-stone-600"
										} ${focusRingClass}`}
									/>
									{errors.title && (
										<p
											id={titleErrId}
											className="text-xs text-red-700 dark:text-red-300 mt-1"
										>
											{errors.title}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label
										htmlFor={`${reason.id}-body`}
										className="block text-xs font-semibold text-stone-700 dark:text-stone-300"
									>
										Body
									</label>
									<textarea
										id={`${reason.id}-body`}
										rows={3}
										value={reason.body}
										onChange={(e) =>
											updateReason(index, { body: e.target.value })
										}
										aria-invalid={errors.body ? "true" : undefined}
										aria-describedby={errors.body ? bodyErrId : undefined}
										className={`w-full px-3 py-2 text-sm rounded-md border bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 ${
											errors.body
												? "border-red-400 dark:border-red-700"
												: "border-stone-300 dark:border-stone-600"
										} ${focusRingClass}`}
									/>
									{errors.body && (
										<p
											id={bodyErrId}
											className="text-xs text-red-700 dark:text-red-300 mt-1"
										>
											{errors.body}
										</p>
									)}
								</div>
								{reasons.length > 1 && (
									<div className="flex justify-end">
										<button
											type="button"
											onClick={() => removeReason(reason.id)}
											aria-label={`Remove reason ${index + 1}`}
											className={`text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 ${focusRingClass} rounded-md px-2 py-1`}
										>
											Remove
										</button>
									</div>
								)}
							</fieldset>
						)
					})}

					<div className="flex items-center justify-between gap-2">
						<button
							type="button"
							onClick={addReason}
							disabled={addDisabled}
							aria-disabled={addDisabled || undefined}
							className={`text-xs font-semibold rounded-md px-3 py-1.5 ${focusRingClass} ${
								addDisabled
									? "bg-stone-100 text-stone-600 border border-stone-400 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500 cursor-not-allowed"
									: "bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100"
							}`}
						>
							+ Add another reason
						</button>
						<span className="text-xs text-stone-600 dark:text-stone-300">
							{reasons.length} / {UI_REASONS_MAX}
						</span>
					</div>

					{formLevelError && (
						<p
							id={formErrorId}
							className="text-xs text-red-700 dark:text-red-300"
						>
							{formLevelError}
						</p>
					)}

					{submitError && (
						<div
							role="alert"
							className="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-xs text-red-800 dark:text-red-200"
						>
							{submitError}
						</div>
					)}
				</form>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-200 dark:border-stone-700">
					<button
						type="button"
						onClick={onClose}
						className={`px-3 py-1.5 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 ${focusRingClass}`}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							void handleSubmit()
						}}
						disabled={!formValid || submitting}
						aria-disabled={!formValid || submitting || undefined}
						aria-describedby={formLevelError ? formErrorId : undefined}
						className={`px-3 py-1.5 text-xs font-semibold rounded-md ${focusRingVariantClasses.requestChanges} ${
							!formValid || submitting
								? "bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200 cursor-not-allowed"
								: "bg-amber-600 hover:bg-amber-700 text-white"
						}`}
					>
						{submitting ? "Submitting…" : "Confirm revisit"}
					</button>
				</div>
			</div>
		</div>
	)
}
