import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Execution Phase",
	description:
		"Do the work through hat-based workflows, iterative bolts, and quality gates.",
}

export default function ExecutionPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-2 text-sm font-medium text-indigo-600">
				Phase 2 of 4
			</div>
			<h1 className="mb-4 text-4xl font-bold">Execution</h1>
			<p className="mb-8 text-lg text-stone-600">
				Do the work. Execution operates through hat-based workflows --- ordered
				sequences of behavioral roles that structure how work progresses. Each
				unit moves through its workflow in iterative cycles called bolts.
			</p>

			<div className="mb-12 rounded-xl border border-indigo-200 bg-indigo-50 p-6">
				<h2 className="mb-3 font-semibold text-indigo-800">Key Artifacts</h2>
				<ul className="space-y-2 text-sm text-indigo-700">
					<li>Completed deliverables for each unit</li>
					<li>Quality gate results demonstrating standards compliance</li>
					<li>Operational plan for the delivered outcome</li>
					<li>Progress notes and decision records</li>
				</ul>
			</div>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Hats and Workflows</h2>
				<p className="mb-4 text-stone-600">
					A <strong>hat</strong> is a behavioral role assumed during execution.
					Hats are not people --- they are modes of operation that define focus,
					constraints, and expected outputs.
				</p>
				<div className="mb-6 overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-stone-200">
								<th className="py-2 pr-4 text-left font-semibold">Hat</th>
								<th className="py-2 pr-4 text-left font-semibold">Focus</th>
							</tr>
						</thead>
						<tbody className="text-stone-600">
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Planner
								</td>
								<td className="py-2">
									Analyze the unit, identify approach, create execution plan
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Executor
								</td>
								<td className="py-2">
									Produce the deliverable according to the plan
								</td>
							</tr>
							<tr>
								<td className="py-2 pr-4 font-medium text-stone-900">
									Reviewer
								</td>
								<td className="py-2">
									Evaluate deliverables against success criteria
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p className="text-stone-600">
					A <strong>workflow</strong> is an ordered sequence of hats. Workflows
					are configurable per domain:
				</p>
				<div className="mt-4 space-y-2 rounded-lg bg-stone-50 p-4 font-mono text-sm text-stone-700">
					<div>
						Default: Planner &rarr; Executor &rarr; Reviewer
					</div>
					<div>
						Adversarial: Planner &rarr; Executor &rarr; Challenger &rarr;
						Defender &rarr; Reviewer
					</div>
					<div>
						Exploratory: Observer &rarr; Hypothesizer &rarr; Experimenter
						&rarr; Analyst
					</div>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Bolts: The Iteration Cycle</h2>
				<p className="mb-4 text-stone-600">
					Work progresses through <strong>bolts</strong> --- iteration cycles
					within units. Each bolt advances the work and produces a reviewable
					increment. Quality gates fire after every executor action, creating a
					tight feedback loop.
				</p>
				<div className="rounded-lg border border-stone-200 bg-stone-50 p-6 text-sm text-stone-600">
					<div className="space-y-2">
						<p>1. Planner creates execution plan</p>
						<p>2. Executor produces deliverable</p>
						<p>
							3. Quality gates check &mdash; if failed, executor adjusts and
							retries
						</p>
						<p>
							4. Reviewer evaluates &mdash; if revisions needed, return to
							executor
						</p>
						<p>
							5. Success criteria check &mdash; if not met, return to planner
							for new approach
						</p>
						<p>6. If stuck, escalate to human</p>
					</div>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Operating Modes</h2>
				<div className="space-y-6">
					<div className="rounded-lg border border-stone-200 p-5">
						<h3 className="mb-1 font-semibold">Supervised</h3>
						<p className="text-sm text-stone-600">
							Human approves each significant action. AI proposes, human
							validates, AI implements, human reviews. Best for novel, high-risk,
							or foundational work.
						</p>
					</div>
					<div className="rounded-lg border border-stone-200 p-5">
						<h3 className="mb-1 font-semibold">Observed</h3>
						<p className="text-sm text-stone-600">
							AI works while human watches in real-time. Human can intervene but
							does not block progress. Best for creative, subjective, or
							training scenarios.
						</p>
					</div>
					<div className="rounded-lg border border-stone-200 p-5">
						<h3 className="mb-1 font-semibold">Autonomous</h3>
						<p className="text-sm text-stone-600">
							AI iterates independently until success criteria are met, using
							quality gate results as feedback. Human reviews the final output.
							Best for well-defined tasks with verifiable criteria.
						</p>
					</div>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Domain Examples</h2>
				<div className="space-y-4 text-sm text-stone-600">
					<p>
						<strong className="text-stone-900">Software:</strong> A bolt might
						implement a feature, run tests, and fix failures.
					</p>
					<p>
						<strong className="text-stone-900">Marketing:</strong> A bolt might
						draft content, run brand review, and refine based on feedback.
					</p>
					<p>
						<strong className="text-stone-900">Research:</strong> A bolt might
						design an experiment, collect data, and analyze preliminary results.
					</p>
					<p>
						<strong className="text-stone-900">Operations:</strong> A bolt might
						draft a runbook, simulate execution, and adjust procedures.
					</p>
				</div>
			</section>

			<div className="flex items-center justify-between border-t border-stone-200 pt-6">
				<Link
					href="/phases/elaboration"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
					</svg>
					Previous: Elaboration
				</Link>
				<Link
					href="/phases/operation"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					Next: Operation
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
