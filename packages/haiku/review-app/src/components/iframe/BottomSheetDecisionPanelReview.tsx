import { useEffect, useRef, useState } from "react"
import { submitDecision } from "../../host-bridge"
import type { ReviewAnnotations } from "../../types"
import { DecisionSuccess, type DecisionVariant } from "./DecisionSuccess"

export type SheetSnap = "collapsed" | "half-pane"

interface Props {
	sessionId: string
	gateType?: string
	feedback?: string
	annotations?: ReviewAnnotations
	wsRef?: React.RefObject<WebSocket | null>
}

/** Minimum drag distance (px) required to trigger a snap. */
const MIN_DRAG_PX = 24
/** Minimum fling velocity (px/ms) that triggers a snap even under MIN_DRAG_PX. */
const FLING_VELOCITY = 0.5

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	)
}

/**
 * Bottom-sheet decision panel for review sessions in MCP Apps iframe mode.
 * Collapsed: three decision buttons + keyboard shortcuts visible.
 * Half-pane: feedback textarea revealed.
 * Drag handle supports pointermove gesture and keyboard Up/Down.
 */
export function BottomSheetDecisionPanelReview({
	sessionId,
	annotations,
	wsRef,
}: Props) {
	const [snap, setSnap] = useState<SheetSnap>("collapsed")
	const [submitting, setSubmitting] = useState(false)
	const [decision, setDecision] = useState<DecisionVariant | null>(null)
	const [feedback, setFeedback] = useState("")
	const [error, setError] = useState<string | null>(null)

	// Drag state stored in refs to avoid re-renders during drag
	const dragStart = useRef<{ y: number; time: number } | null>(null)
	const handleRef = useRef<HTMLDivElement>(null)
	const feedbackRef = useRef<HTMLTextAreaElement>(null)
	const noTransition = prefersReducedMotion()

	// Keyboard shortcuts 1/2/3 — wired only in iframe mode
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			// Don't intercept shortcuts while typing in a textarea/input
			const tag = (e.target as HTMLElement).tagName
			if (tag === "TEXTAREA" || tag === "INPUT") return
			if (e.key === "1") handleApprove()
			else if (e.key === "2") handleChanges()
			else if (e.key === "3") handleExternal()
		}
		document.addEventListener("keydown", onKey)
		return () => document.removeEventListener("keydown", onKey)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Focus first interactive element on mount
	useEffect(() => {
		handleRef.current?.focus()
	}, [])

	function expand() {
		setSnap("half-pane")
		setTimeout(() => feedbackRef.current?.focus(), 50)
	}

	function collapse() {
		setSnap("collapsed")
		handleRef.current?.focus()
	}

	// Pointer drag handlers
	function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
		dragStart.current = { y: e.clientY, time: e.timeStamp }
	}

	function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (!dragStart.current) return
		const deltaY = dragStart.current.y - e.clientY // positive = dragged up
		const dt = e.timeStamp - dragStart.current.time
		const velocity = dt > 0 ? Math.abs(deltaY) / dt : 0
		dragStart.current = null

		if (Math.abs(deltaY) >= MIN_DRAG_PX || velocity >= FLING_VELOCITY) {
			if (deltaY > 0) expand()
			else collapse()
		}
	}

	// Keyboard on drag handle
	function onHandleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "ArrowUp") {
			e.preventDefault()
			expand()
		} else if (e.key === "ArrowDown") {
			e.preventDefault()
			collapse()
		}
	}

	async function handleApprove() {
		setSubmitting(true)
		setError(null)
		try {
			await submitDecision(sessionId, "approved", feedback, annotations, wsRef)
			setDecision("approved")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Submission failed")
			setSubmitting(false)
		}
	}

	async function handleChanges() {
		setSubmitting(true)
		setError(null)
		try {
			await submitDecision(
				sessionId,
				"changes_requested",
				feedback,
				annotations,
				wsRef,
			)
			setDecision("changes_requested")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Submission failed")
			setSubmitting(false)
		}
	}

	async function handleExternal() {
		setSubmitting(true)
		setError(null)
		try {
			await submitDecision(
				sessionId,
				"external_review",
				"Submitted for external review. Run /haiku:pickup after approval.",
				annotations,
				wsRef,
			)
			setDecision("external_review")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Submission failed")
			setSubmitting(false)
		}
	}

	if (decision) {
		return <DecisionSuccess variant={decision} />
	}

	const isHalfPane = snap === "half-pane"
	const transitionClass = noTransition
		? ""
		: "transition-all duration-200 ease-out"

	return (
		<>
			{/* Backdrop dim when expanded.
			 *  `absolute` (not `fixed`) so it stays within the iframe's scroll
			 *  container and doesn't punch through the host boundary (GR-10). */}
			{isHalfPane && (
				<div
					className="absolute inset-0 bg-stone-950/60 pointer-events-none"
					aria-hidden="true"
					style={{ zIndex: 29 }}
				/>
			)}

			{/* Sheet */}
			<div
				className={[
					"sticky bottom-0 z-30 bg-stone-900",
					"border-t-2 border-teal-500",
					transitionClass,
				].join(" ")}
				style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.4)" }}
				data-snap={snap}
			>
				{/* Hidden form label for accessibility */}
				<h3 id="decision-form-heading" className="sr-only">
					Review Decision
				</h3>

				{/* Drag handle */}
				<div
					ref={handleRef}
					role="slider"
					aria-label="Decision panel — drag to expand"
					aria-valuemin={0}
					aria-valuemax={1}
					aria-valuenow={isHalfPane ? 1 : 0}
					tabIndex={0}
					className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing min-h-[44px] items-center"
					onPointerDown={onPointerDown}
					onPointerUp={onPointerUp}
					onKeyDown={onHandleKeyDown}
				>
					<div
						className="w-8 h-1 rounded-full bg-stone-600 hover:bg-stone-400 transition-colors"
						aria-hidden="true"
					/>
				</div>

				{/* Decision form */}
				<form
					aria-labelledby="decision-form-heading"
					className="px-3 pb-3"
					onSubmit={(e) => e.preventDefault()}
				>
					{/* Feedback textarea — half-pane only */}
					{isHalfPane && (
						<div className="mb-3">
							<label htmlFor="review-feedback" className="sr-only">
								Feedback (optional)
							</label>
							<textarea
								ref={feedbackRef}
								id="review-feedback"
								rows={4}
								value={feedback}
								onChange={(e) => setFeedback(e.target.value)}
								placeholder="Optional feedback…"
								disabled={submitting}
								className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none disabled:opacity-60"
							/>
						</div>
					)}

					{/* Error */}
					{error && (
						<p role="alert" className="text-xs text-red-400 mb-2">
							{error}
						</p>
					)}

					{/* Decision buttons */}
					<div className="grid grid-cols-3 gap-2">
						<button
							type="button"
							onClick={handleApprove}
							disabled={submitting}
							className="min-h-[44px] px-2 py-2 rounded-lg text-sm font-semibold bg-teal-500 text-stone-950 hover:bg-teal-400 active:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							aria-label="Approve (keyboard shortcut: 1)"
						>
							Approve
						</button>
						<button
							type="button"
							onClick={handleChanges}
							disabled={submitting}
							className="min-h-[44px] px-2 py-2 rounded-lg text-sm font-semibold bg-stone-700 text-stone-100 hover:bg-stone-600 active:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							aria-label="Request Changes (keyboard shortcut: 2)"
						>
							Changes
						</button>
						<button
							type="button"
							onClick={handleExternal}
							disabled={submitting}
							className="min-h-[44px] px-2 py-2 rounded-lg text-sm font-semibold border border-stone-600 text-stone-300 hover:border-stone-400 hover:text-stone-100 active:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							aria-label="External Review (keyboard shortcut: 3)"
						>
							External
						</button>
					</div>

					{/* Keyboard shortcut hints */}
					<p
						className="mt-2 text-center text-xs text-stone-500"
						aria-hidden="true"
					>
						<kbd className="font-mono">1</kbd> approve &middot;{" "}
						<kbd className="font-mono">2</kbd> changes &middot;{" "}
						<kbd className="font-mono">3</kbd> external
					</p>
				</form>
			</div>
		</>
	)
}
