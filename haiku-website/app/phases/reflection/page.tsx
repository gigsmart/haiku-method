import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Reflection Phase",
	description:
		"Learn from what happened. Analyze outcomes, capture learnings, and feed insights forward.",
}

export default function ReflectionPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-2 text-sm font-medium text-rose-600">
				Phase 4 of 4
			</div>
			<h1 className="mb-4 text-4xl font-bold">Reflection</h1>
			<p className="mb-8 text-lg text-stone-600">
				Learn from what happened. Reflection closes the loop. It analyzes
				outcomes against original intent, captures learnings, and feeds insights
				forward into organizational memory and future elaboration cycles.
			</p>

			<div className="mb-12 rounded-xl border border-rose-200 bg-rose-50 p-6">
				<h2 className="mb-3 font-semibold text-rose-800">Key Artifacts</h2>
				<ul className="space-y-2 text-sm text-rose-700">
					<li>Analysis report comparing results to intent</li>
					<li>Documented learnings --- what worked, what failed, and why</li>
					<li>Recommendations for future initiatives</li>
					<li>Updated organizational memory</li>
				</ul>
			</div>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Activities</h2>
				<div className="space-y-6">
					<div>
						<h3 className="mb-1 font-semibold">Analyze Outcomes</h3>
						<p className="text-stone-600">
							Compare results to success criteria and original intent. Did the
							initiative achieve its goal? Where did it exceed expectations?
							Where did it fall short? What unexpected outcomes emerged?
						</p>
					</div>
					<div>
						<h3 className="mb-1 font-semibold">Capture Learnings</h3>
						<p className="mb-3 text-stone-600">
							Document what worked, what failed, and why. Learnings should be
							specific and actionable --- not abstract observations but concrete
							patterns.
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-stone-200">
										<th className="py-2 pr-4 text-left font-semibold">
											Category
										</th>
										<th className="py-2 text-left font-semibold">Example</th>
									</tr>
								</thead>
								<tbody className="text-stone-600">
									<tr className="border-b border-stone-100">
										<td className="py-2 pr-4 font-medium text-stone-900">
											Process
										</td>
										<td className="py-2">
											"Autonomous mode worked well for data migration but
											needed supervised mode for schema design"
										</td>
									</tr>
									<tr className="border-b border-stone-100">
										<td className="py-2 pr-4 font-medium text-stone-900">
											Quality
										</td>
										<td className="py-2">
											"Brand review gate caught 3 issues that would have
											required post-launch correction"
										</td>
									</tr>
									<tr className="border-b border-stone-100">
										<td className="py-2 pr-4 font-medium text-stone-900">
											Estimation
										</td>
										<td className="py-2">
											"Research units consistently needed 2x the expected bolt
											count for data collection"
										</td>
									</tr>
									<tr>
										<td className="py-2 pr-4 font-medium text-stone-900">
											Collaboration
										</td>
										<td className="py-2">
											"Stakeholder involvement during elaboration reduced
											revision cycles by 60%"
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
					<div>
						<h3 className="mb-1 font-semibold">Feed Forward</h3>
						<p className="text-stone-600">
							Update organizational memory, refine processes, and inform the
							next iteration. Feed-forward is not a passive archive --- it
							actively shapes future work by updating quality gate
							configurations, refining mode selection heuristics, improving
							success criteria templates, and enriching domain models.
						</p>
					</div>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">The Compounding Effect</h2>
				<p className="mb-4 text-stone-600">
					Reflection is what transforms HAIKU from a one-time framework into a
					compounding advantage:
				</p>
				<ul className="space-y-2 text-stone-600">
					<li>Success criteria get sharper as teams learn to define them</li>
					<li>
						Quality gates accumulate, creating progressively robust enforcement
					</li>
					<li>Mode selection becomes intuitive with practice</li>
					<li>
						Organizational memory expands, giving AI richer context over time
					</li>
					<li>Bolt success rates improve as patterns are established</li>
				</ul>
				<p className="mt-4 text-stone-600">
					Ad-hoc approaches don't compound --- each session starts fresh, each
					prompt is one-off, no organizational learning occurs. The team with
					HAIKU gets better at working with AI; the team without starts over
					every time.
				</p>
			</section>

			<section className="mb-10 rounded-xl border border-stone-200 bg-stone-50 p-6">
				<h2 className="mb-3 font-semibold">The Loop Closes</h2>
				<p className="text-sm text-stone-600">
					Reflection feeds directly back into Elaboration. The next initiative
					begins with richer context, better-calibrated success criteria, and
					refined quality gates. This is the HAIKU lifecycle in action: a
					continuous loop of definition, execution, management, and learning.
				</p>
			</section>

			<div className="flex items-center justify-between border-t border-stone-200 pt-6">
				<Link
					href="/phases/operation"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
					</svg>
					Previous: Operation
				</Link>
				<Link
					href="/phases/elaboration"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					Back to Elaboration (full cycle)
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
