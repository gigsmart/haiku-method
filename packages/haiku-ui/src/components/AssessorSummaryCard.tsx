/**
 * AssessorSummaryCard — renders the feedback-assessor outcome as a live-region
 * article. Surfaces three counts (total / pending / updated) + a per-finding
 * status list.
 *
 * A11y contract:
 *   - Root: `<article role="status" aria-live="polite" aria-atomic="true">`.
 *     The triple anchors NVDA/VoiceOver to re-read the full article on updates.
 *   - `aria-label="Feedback assessor summary"` — resolvable via
 *     `screen.getByRole("status", { name: /feedback assessor summary/i })`.
 *   - Count transitions emit ONE polite announcement per 500 ms window
 *     (trailing-edge debounce — collapses bursts into the final value).
 *
 * Token discipline (per DESIGN-TOKENS §1.7, §2):
 *   - Composite-opacity fade shortcuts on cards / buttons are banned — the
 *     audit-banned-patterns profile `tokens` enforces this.
 *   - The muted-stone-400 text class is forbidden on light surfaces without
 *     a dark-qualifier paired fallback.
 */

import { useEffect, useRef } from "react"
import { useAnnounce } from "../a11y/live-regions"
import { statusDotClasses as canonicalStatusDotClasses } from "./feedback/tokens"

/**
 * A finding's status as surfaced by the feedback-assessor. This is a subset of
 * the canonical `FeedbackStatus` taxonomy (`haiku-api`) — the assessor never
 * renders `fixing` because the fix loop has, by definition, moved past that
 * state by the time the assessor runs. The string literals MUST remain a
 * subset of `FeedbackStatus` so the canonical `statusDotClasses` map from
 * `./feedback/tokens` (mirrored from DESIGN-TOKENS §2.1) is usable verbatim
 * — see FB-13. Do NOT redefine status→color locally.
 */
export type AssessorFindingStatus =
	| "addressed"
	| "closed"
	| "rejected"
	| "pending"

export interface AssessorFinding {
	/** Feedback id (e.g. `"FB-02"`). Rendered in a `font-mono` cell. */
	id: string
	status: AssessorFindingStatus
	/** Unit slug or human-readable description of what addressed this finding. */
	addressedBy?: string
	/** Optional textual note shown on the right of the finding row. */
	note?: string
}

export interface AssessorSummaryCardProps {
	total: number
	closed: number
	stillOpen: number
	rejected: number
	/** "Updated" count from the canonical artifact (addressed since last run). */
	updated?: number
	findings: AssessorFinding[]
	/** When the last assessor pass ran (for a "ran 2s ago"-style label). */
	ranAt?: Date
}

interface Totals {
	total: number
	closed: number
	stillOpen: number
	rejected: number
	updated: number
}

function composeAnnouncement(totals: Totals): string {
	const { total, closed, stillOpen } = totals
	// Canonical phrasing — matches the acceptance criterion regex
	// `/\d+ (of \d+ )?findings? (addressed|resolved|closed)/i`.
	const noun = closed === 1 ? "finding" : "findings"
	if (total > 0 && total !== closed) {
		return `${closed} of ${total} ${noun} closed · ${stillOpen} pending`
	}
	if (closed > 0) {
		return `${closed} ${noun} closed`
	}
	return `${stillOpen} findings pending`
}

/**
 * Status-dot color for a given finding status. Delegates to the canonical
 * `statusDotClasses` map in `./feedback/tokens` (mirrored from DESIGN-TOKENS
 * §2.1). This component MUST NOT hold a private color table — two components
 * rendering the same `FeedbackStatus` must render the same color, otherwise
 * cross-component color-semantics drift (DESIGN-TOKENS §1.2a).
 */
function statusDotClasses(status: AssessorFindingStatus): string {
	return canonicalStatusDotClasses[status]
}

function statusDotLabel(status: AssessorFindingStatus): string {
	switch (status) {
		case "closed":
			return "closed"
		case "addressed":
			return "addressed"
		case "rejected":
			return "rejected"
		case "pending":
			return "pending"
	}
}

export function AssessorSummaryCard({
	total,
	closed,
	stillOpen,
	rejected,
	updated,
	findings,
	ranAt,
}: AssessorSummaryCardProps): React.ReactElement {
	const clean = stillOpen === 0
	const announce = useAnnounce()
	const prevTotalsRef = useRef<Totals>({
		total,
		closed,
		stillOpen,
		rejected,
		updated: updated ?? 0,
	})
	const timerRef = useRef<number | null>(null)
	const pendingMsgRef = useRef<string | null>(null)
	const mountedRef = useRef(false)

	// Trailing-edge debounce: the effect runs on every count change. The
	// pending message is always the LATEST composition; when the 500 ms timer
	// fires, we announce that message once and clear the timer. If the component
	// unmounts mid-window, the cleanup cancels the timer so no stale announce
	// fires after unmount.
	useEffect(() => {
		const prev = prevTotalsRef.current
		const updatedNow = updated ?? 0
		const changed =
			prev.total !== total ||
			prev.closed !== closed ||
			prev.stillOpen !== stillOpen ||
			prev.rejected !== rejected ||
			prev.updated !== updatedNow

		// Don't announce on the initial mount — the dialog-enter / page-load
		// announcement comes from the live region's implicit text, not from our
		// debounce. Only transitions trigger.
		if (!mountedRef.current) {
			mountedRef.current = true
			prevTotalsRef.current = {
				total,
				closed,
				stillOpen,
				rejected,
				updated: updatedNow,
			}
			return
		}

		if (!changed) return

		prevTotalsRef.current = {
			total,
			closed,
			stillOpen,
			rejected,
			updated: updatedNow,
		}
		pendingMsgRef.current = composeAnnouncement({
			total,
			closed,
			stillOpen,
			rejected,
			updated: updatedNow,
		})

		if (timerRef.current != null) return // window active — coalesce

		timerRef.current = window.setTimeout(() => {
			if (pendingMsgRef.current) {
				announce("polite", pendingMsgRef.current)
				pendingMsgRef.current = null
			}
			timerRef.current = null
		}, 500)
	}, [total, closed, stillOpen, rejected, updated, announce])

	// Unmount cleanup — cancel any pending debounce timer.
	useEffect(() => {
		return () => {
			if (timerRef.current != null) {
				window.clearTimeout(timerRef.current)
				timerRef.current = null
			}
		}
	}, [])

	const ranLabel = ranAt ? formatRanAt(ranAt) : null

	return (
		<article
			role="status"
			aria-live="polite"
			aria-atomic="true"
			aria-label="Feedback assessor summary"
			className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 space-y-3"
		>
			{/* Header row: status dot + label + badge */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className={`w-2 h-2 rounded-full ${clean ? "bg-green-500" : "bg-amber-500"}`}
					/>
					<span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
						Feedback assessor
					</span>
					<span
						className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${
							clean
								? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
								: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
						}`}
					>
						{clean ? "clean" : "pending"}
					</span>
				</div>
				{ranLabel && (
					<span className="text-xs text-stone-600 dark:text-stone-300">
						{ranLabel}
					</span>
				)}
			</div>

			{/* Count grid: total / pending / updated */}
			<div className="grid grid-cols-3 gap-2 text-center">
				<div className="rounded-md bg-stone-100 dark:bg-stone-800 p-2">
					<div className="text-sm font-bold text-stone-900 dark:text-stone-100">
						{total}
					</div>
					<div className="text-xs uppercase tracking-wider text-stone-600 dark:text-stone-300">
						total
					</div>
				</div>
				<div
					className={`rounded-md p-2 ${
						stillOpen === 0
							? "bg-stone-100 dark:bg-stone-800"
							: "bg-amber-50 dark:bg-amber-900/30"
					}`}
				>
					<div
						className={`text-sm font-bold ${
							stillOpen === 0
								? "text-stone-900 dark:text-stone-100"
								: "text-amber-800 dark:text-amber-200"
						}`}
					>
						{stillOpen}
					</div>
					<div className="text-xs uppercase tracking-wider text-stone-600 dark:text-stone-300">
						pending
					</div>
				</div>
				<div className="rounded-md bg-blue-50 dark:bg-blue-900/30 p-2">
					<div className="text-sm font-bold text-blue-800 dark:text-blue-200">
						{updated ?? closed}
					</div>
					<div className="text-xs uppercase tracking-wider text-stone-600 dark:text-stone-300">
						updated
					</div>
				</div>
			</div>

			{/* Rejected-count callout — shown only when non-zero so it never fights
			    the clean / pending grid for attention when irrelevant. */}
			{rejected > 0 && (
				<div className="text-xs text-red-700 dark:text-red-300">
					{rejected} rejected
				</div>
			)}

			{/* Per-finding list */}
			{findings.length > 0 ? (
				<ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
					{findings.map((finding) => (
						<li
							key={finding.id}
							className="flex items-start gap-2 text-stone-700 dark:text-stone-200"
						>
							<span
								aria-hidden="true"
								className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClasses(finding.status)}`}
							/>
							<span className="min-w-0">
								<span className="font-mono text-xs text-stone-700 dark:text-stone-200">
									{finding.id}
								</span>
								<span className="mx-1 text-stone-600 dark:text-stone-300">
									·
								</span>
								<span className="text-stone-700 dark:text-stone-200">
									{finding.note ??
										(finding.addressedBy
											? `${statusDotLabel(finding.status)} by ${finding.addressedBy}`
											: statusDotLabel(finding.status))}
								</span>
							</span>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs italic text-stone-600 dark:text-stone-300">
					No findings yet.
				</p>
			)}
		</article>
	)
}

function formatRanAt(date: Date): string {
	const secondsAgo = Math.max(
		0,
		Math.round((Date.now() - date.getTime()) / 1000),
	)
	if (secondsAgo < 60) return `ran ${secondsAgo}s ago`
	const minutesAgo = Math.round(secondsAgo / 60)
	if (minutesAgo < 60) return `ran ${minutesAgo}m ago`
	const hoursAgo = Math.round(minutesAgo / 60)
	return `ran ${hoursAgo}h ago`
}
