/**
 * /review/:sessionId/intent — intent-scoped overview.
 *
 * Renders `intent.md` alongside a per-stage summary grid (status / phase
 * / unit counts / knowledge + output counts). Opened from the header
 * breadcrumb; "Back to stage" returns to the current stage route.
 */

import { MarkdownViewer } from "@haiku/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useReviewContext } from "./-context"

function IntentOverviewRoute(): React.ReactElement {
	const { session, sessionId, activeStage } = useReviewContext()
	const navigate = useNavigate()

	const intent = session.intent
	const stageStates = session.stage_states ?? {}
	const intentStageOrder =
		(intent?.frontmatter?.stages as string[] | undefined) ?? []
	const stageNames =
		intentStageOrder.length > 0
			? intentStageOrder.filter((s) => stageStates[s])
			: Object.keys(stageStates)
	const units = session.units ?? []
	const stageArtifacts = session.stage_artifacts ?? []
	const outputArtifacts = session.output_artifacts ?? []

	const handleBack = () => {
		if (activeStage) {
			navigate({
				to: "/review/$sessionId/stages/$stage",
				params: { sessionId, stage: activeStage },
			})
		} else {
			navigate({ to: "/review/$sessionId", params: { sessionId } })
		}
	}

	return (
		<>
			<div className="sticky top-0 z-20 bg-stone-50 dark:bg-stone-950 px-6 lg:px-10 pt-6 pb-3">
				<div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-900/20">
					<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-700 text-white">
						intent
					</span>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
							Intent
						</p>
						<h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight break-words mt-1">
							{intent?.title ?? "Intent"}
						</h1>
					</div>
					<button
						type="button"
						onClick={handleBack}
						className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
					>
						← Back to Stage
					</button>
				</div>
			</div>
			<div className="px-6 lg:px-10 pb-6 space-y-4">
				{stageNames.length > 0 && (
					<div className="bg-white dark:bg-stone-900 rounded-lg border-2 border-stone-200 dark:border-stone-700 px-5 py-4">
						<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-3">
							Cross-stage summary
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-left text-xs">
								<thead>
									<tr className="border-b-2 border-stone-200 dark:border-stone-700">
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Stage
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Status
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Phase
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Units
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Knowledge
										</th>
										<th className="py-2 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Outputs
										</th>
									</tr>
								</thead>
								<tbody>
									{stageNames.map((name) => {
										const s = stageStates[name] as
											| { status?: string; phase?: string }
											| undefined
										const unitCount = units.filter(
											(u) => (u.frontmatter.stage ?? "") === name,
										).length
										const knowledgeCount = stageArtifacts.filter(
											(a) => a.stage === name,
										).length
										const outputCount = outputArtifacts.filter(
											(a) => a.stage === name,
										).length
										const statusColor =
											s?.status === "active"
												? "text-teal-600 dark:text-teal-400"
												: s?.status === "completed"
													? "text-green-600 dark:text-green-400"
													: "text-stone-500 dark:text-stone-400"
										return (
											<tr
												key={name}
												className="border-b border-stone-100 dark:border-stone-800"
											>
												<td className="py-2.5 pr-3 font-semibold capitalize text-stone-900 dark:text-stone-100">
													<button
														type="button"
														onClick={() =>
															navigate({
																to: "/review/$sessionId/stages/$stage",
																params: { sessionId, stage: name },
															})
														}
														className="text-left hover:text-teal-700 dark:hover:text-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 rounded"
													>
														{name}
													</button>
												</td>
												<td className={`py-2.5 pr-3 font-mono ${statusColor}`}>
													{s?.status ?? "—"}
												</td>
												<td className="py-2.5 pr-3 font-mono text-stone-600 dark:text-stone-300">
													{s?.phase ?? "—"}
												</td>
												<td className="py-2.5 pr-3 text-right font-mono text-stone-600 dark:text-stone-300">
													{unitCount}
												</td>
												<td className="py-2.5 pr-3 text-right font-mono text-stone-600 dark:text-stone-300">
													{knowledgeCount}
												</td>
												<td className="py-2.5 text-right font-mono text-stone-600 dark:text-stone-300">
													{outputCount}
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}

				<div className="bg-white dark:bg-stone-900 rounded-lg border-2 border-stone-200 dark:border-stone-700 px-5 py-4">
					<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-3">
						Intent definition
					</p>
					{intent?.rawContent ? (
						<MarkdownViewer id="intent-detail">
							{intent.rawContent}
						</MarkdownViewer>
					) : (
						<p className="text-sm text-stone-500 dark:text-stone-400 italic">
							No intent content available.
						</p>
					)}
				</div>
			</div>
		</>
	)
}

export const Route = createFileRoute("/review/$sessionId/intent")({
	component: IntentOverviewRoute,
})
