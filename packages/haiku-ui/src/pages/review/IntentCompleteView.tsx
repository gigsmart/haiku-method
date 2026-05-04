/**
 * IntentCompleteView — terminal screen for an intent in
 * `awaiting_completion_review` or `status: completed`.
 *
 * Replaces the per-stage review pane when the intent has nothing left
 * the engine can do — every stage is done, the studio review (if any)
 * has dispatched, the merge into mainline is the only remaining
 * action. Surfaces a high-level summary so the reviewer doesn't see
 * the last stage labeled "current" when there's no current stage.
 *
 * What it shows:
 *   - Intent title + completion timestamp.
 *   - A one-line state line: "Completed on <date>. Awaiting merge of
 *     `haiku/<slug>/main` into the repo's mainline."
 *   - The delivery PR/MR link when the agent recorded one (via
 *     `haiku_run_next { external_review_url }` on the
 *     `external_review_requested` action). No link → a soft note that
 *     the URL hasn't been recorded yet.
 *   - Per-stage roll-up grid: stage name, status, completed_at —
 *     read straight from `stage_states` so it can never disagree with
 *     the engine's view.
 */

import type { DiscoveredReviewUrl } from "haiku-api"
import type { IntentFrontmatter } from "../../parsed"

export type { DiscoveredReviewUrl }

export interface IntentCompleteViewStageState {
	status?: string
	phase?: string
	completed_at?: string | null
	[key: string]: unknown
}

export interface IntentCompleteViewProps {
	intentSlug: string
	intentTitle: string
	intentFrontmatter: IntentFrontmatter
	stageStates: Record<string, IntentCompleteViewStageState | undefined>
	stageOrder: string[]
	/** URL the agent recorded via
	 *  `haiku_run_next { external_review_url }`. When present, takes
	 *  precedence over the auto-detected URL. */
	deliveryReviewUrl?: string | null
	/** URL the engine discovered via raw git from a published PR/MR
	 *  ref. Surfaced as a fallback when the agent never recorded an
	 *  explicit URL — common when the user opens the PR via `gh pr
	 *  create` or the GitHub UI directly. */
	discoveredReviewUrl?: DiscoveredReviewUrl | null
}

function formatTimestamp(value: string | undefined | null): string {
	if (!value) return ""
	try {
		const d = new Date(value)
		if (Number.isNaN(d.valueOf())) return value
		return d.toLocaleString()
	} catch {
		return value
	}
}

export function IntentCompleteView({
	intentSlug,
	intentTitle,
	intentFrontmatter,
	stageStates,
	stageOrder,
	deliveryReviewUrl,
	discoveredReviewUrl,
}: IntentCompleteViewProps): React.ReactElement {
	// Resolution: explicit (agent-recorded) wins; otherwise the
	// raw-git discovered URL. Both are equally clickable but the
	// auto-detected one carries a "(auto-detected)" tag so the
	// reader knows it's heuristic — engine doesn't gate on it.
	const resolvedUrl = deliveryReviewUrl ?? discoveredReviewUrl?.url ?? null
	const isAutoDetected = !deliveryReviewUrl && !!discoveredReviewUrl
	const sourceLabel =
		discoveredReviewUrl?.source === "gitlab-mr-ref"
			? "MR"
			: discoveredReviewUrl?.source === "github-pr-ref"
				? "PR"
				: "PR/MR"
	const completedAt = formatTimestamp(
		(intentFrontmatter.completed_at as string | undefined) ?? null,
	)
	const phase = (intentFrontmatter.phase as string | undefined) ?? ""
	const status = intentFrontmatter.status ?? ""
	const isFullyComplete = status === "completed"
	const headlineLabel = isFullyComplete
		? "Intent complete"
		: "All stages reviewed"
	const intentMainBranch = `haiku/${intentSlug}/main`

	return (
		<div
			data-testid="intent-complete-view"
			className="px-6 lg:px-10 py-8 space-y-6"
		>
			<header className="rounded-lg border-2 border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 px-6 py-5">
				<div className="flex flex-wrap items-center gap-2 mb-2">
					<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-700 text-white">
						{headlineLabel}
					</span>
					{phase && (
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono text-teal-800 dark:text-teal-300 bg-white/60 dark:bg-stone-900/40 border border-teal-300 dark:border-teal-800">
							{phase}
						</span>
					)}
				</div>
				<h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 leading-tight break-words">
					{intentTitle}
				</h1>
				{completedAt && (
					<p className="text-sm text-stone-700 dark:text-stone-300 mt-2">
						Completed on{" "}
						<time
							dateTime={(intentFrontmatter.completed_at as string) ?? ""}
							className="font-mono"
						>
							{completedAt}
						</time>
						.
					</p>
				)}
				{!isFullyComplete && (
					<p className="text-sm text-stone-700 dark:text-stone-300 mt-2">
						Awaiting merge of{" "}
						<code className="font-mono">{intentMainBranch}</code> into the
						repo's mainline. The merge is the only remaining action — no further{" "}
						<code className="font-mono">haiku_run_next</code> tick needed to
						seal.
					</p>
				)}
			</header>

			<section className="rounded-lg border-2 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-5 py-4">
				<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-2">
					Delivery review
				</p>
				{resolvedUrl ? (
					<>
						<a
							href={resolvedUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 rounded break-all"
						>
							{resolvedUrl}
						</a>
						{isAutoDetected && (
							<p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
								Auto-detected from{" "}
								<code className="font-mono">git ls-remote</code> — matched{" "}
								{sourceLabel} #{discoveredReviewUrl?.prNumber} to the intent
								main branch's HEAD. Informational only; the engine gates on the
								merge into mainline, not on PR state.
							</p>
						)}
					</>
				) : (
					<p className="text-sm text-stone-600 dark:text-stone-400 italic">
						No delivery PR/MR URL recorded yet. Open the merge request and
						register it via{" "}
						<code className="font-mono not-italic">
							haiku_run_next {`{ external_review_url }`}
						</code>{" "}
						so the workflow engine can track approval status. (The engine also
						scans <code className="font-mono not-italic">git ls-remote</code>{" "}
						for a matching PR/MR ref and will surface it here automatically once
						the branch is pushed and a PR exists.)
					</p>
				)}
			</section>

			<section className="rounded-lg border-2 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-5 py-4">
				<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-3">
					Stage roll-up
				</p>
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b-2 border-stone-200 dark:border-stone-700">
								<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-xs">
									Stage
								</th>
								<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-xs">
									Status
								</th>
								<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-xs">
									Phase
								</th>
								<th className="py-2 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-xs">
									Completed
								</th>
							</tr>
						</thead>
						<tbody>
							{stageOrder.map((stageName) => {
								const s = stageStates[stageName] ?? {}
								const stageStatus = s.status ?? "—"
								const isCompleted = stageStatus === "completed"
								return (
									<tr
										key={stageName}
										className="border-b border-stone-100 dark:border-stone-800"
									>
										<td className="py-2.5 pr-3 font-semibold capitalize text-stone-900 dark:text-stone-100">
											{stageName}
										</td>
										<td
											className={`py-2.5 pr-3 font-mono ${
												isCompleted
													? "text-green-700 dark:text-green-400"
													: "text-stone-500 dark:text-stone-400"
											}`}
										>
											{stageStatus}
										</td>
										<td className="py-2.5 pr-3 font-mono text-stone-600 dark:text-stone-300">
											{s.phase ?? "—"}
										</td>
										<td className="py-2.5 font-mono text-stone-600 dark:text-stone-300 text-xs">
											{formatTimestamp(s.completed_at)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}
