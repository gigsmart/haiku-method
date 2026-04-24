import type { PreviousReviewSnapshot } from "../../../types"

function formatRelativeTime(iso: string): string {
	const then = new Date(iso).getTime()
	if (!Number.isFinite(then)) return ""
	const diffMs = Date.now() - then
	const mins = Math.round(diffMs / 60_000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
	const hours = Math.round(mins / 60)
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
	const days = Math.round(hours / 24)
	return `${days} day${days === 1 ? "" : "s"} ago`
}

/**
 * Banner shown at the top of a re-review session. Displays the previous
 * reviewer's feedback and when it was submitted, so the user can see what
 * they asked for without hunting for it. The per-unit "Changed" badges
 * elsewhere indicate which units were actually edited in response.
 */
export function RereviewBanner({
	snapshot,
}: {
	snapshot: PreviousReviewSnapshot
}) {
	const relative = formatRelativeTime(snapshot.reviewedAt)
	return (
		<div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
			<div className="flex items-start gap-2 mb-2">
				<span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-xs font-semibold">
					Re-review
				</span>
				<span className="text-xs text-amber-800 dark:text-amber-300">
					You requested changes on this intent
					{relative ? ` — ${relative}` : ""}. Edited units are flagged with a{" "}
					<strong>Changed</strong> badge below.
				</span>
			</div>
			{snapshot.feedback.trim() && (
				<details className="mt-2" open>
					<summary className="cursor-pointer text-xs font-medium text-amber-900 dark:text-amber-200">
						Your previous feedback
					</summary>
					<pre className="mt-2 whitespace-pre-wrap break-words text-xs text-stone-800 dark:text-stone-200 bg-white/60 dark:bg-stone-900/60 p-3 rounded border border-amber-200 dark:border-amber-800">
						{snapshot.feedback}
					</pre>
				</details>
			)}
		</div>
	)
}
