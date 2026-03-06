import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Elaboration Phase",
	description:
		"Define what will be done and why. Transform broad intent into structured plans with clear success criteria.",
}

export default function ElaborationPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-2 text-sm font-medium text-teal-600">
				Phase 1 of 4
			</div>
			<h1 className="mb-4 text-4xl font-bold">Elaboration</h1>
			<p className="mb-8 text-lg text-stone-600">
				Define what will be done and why. Elaboration transforms a broad intent
				into a structured plan. This phase produces the shared understanding
				that all subsequent work depends on.
			</p>

			<div className="mb-12 rounded-xl border border-teal-200 bg-teal-50 p-6">
				<h2 className="mb-3 font-semibold text-teal-800">Key Artifacts</h2>
				<ul className="space-y-2 text-sm text-teal-700">
					<li>Intent document with scope and business context</li>
					<li>Unit specifications with boundaries and dependencies</li>
					<li>Success criteria for each unit and overall intent</li>
					<li>Domain model capturing vocabulary and relationships</li>
					<li>Mode recommendations per unit</li>
				</ul>
			</div>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Activities</h2>
				<div className="space-y-6">
					<div>
						<h3 className="mb-1 font-semibold">Define Intent</h3>
						<p className="text-stone-600">
							Articulate the goal, scope, and desired outcome. An intent is the
							top-level statement of purpose --- the thing being accomplished.
						</p>
					</div>
					<div>
						<h3 className="mb-1 font-semibold">Decompose into Units</h3>
						<p className="text-stone-600">
							Break the intent into discrete, addressable pieces of work. Each
							unit is cohesive, loosely coupled, and independently completable.
							Units can declare dependencies, forming a DAG that enables
							parallel execution.
						</p>
					</div>
					<div>
						<h3 className="mb-1 font-semibold">Set Success Criteria</h3>
						<p className="text-stone-600">
							Establish measurable conditions that define completion. Good
							criteria are specific, measurable, verifiable, and
							implementation-independent.
						</p>
					</div>
					<div>
						<h3 className="mb-1 font-semibold">Build Domain Model</h3>
						<p className="text-stone-600">
							Capture the vocabulary, constraints, and relationships of the
							problem space. This shared model ensures humans and AI use the
							same language.
						</p>
					</div>
				</div>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">
					Human-AI Collaboration in Elaboration
				</h2>
				<p className="mb-4 text-stone-600">
					Elaboration is the most collaborative phase. Stakeholders and AI work
					together to refine the intent into actionable structure:
				</p>
				<ol className="space-y-3 text-stone-600">
					<li>
						<strong>AI asks clarifying questions</strong> to minimize ambiguity
					</li>
					<li>
						<strong>AI proposes decomposition</strong> into units based on
						cohesion analysis
					</li>
					<li>
						<strong>The team validates</strong> the decomposition, providing
						corrections
					</li>
					<li>
						<strong>AI generates success criteria</strong> for each unit
					</li>
					<li>
						<strong>The team validates criteria</strong>, ensuring they are
						verifiable
					</li>
					<li>
						<strong>AI recommends execution structure</strong> --- mode
						selection and workflow
					</li>
				</ol>
			</section>

			<section className="mb-10">
				<h2 className="mb-4 text-2xl font-bold">Across Domains</h2>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-stone-200">
								<th className="py-2 pr-4 text-left font-semibold">Domain</th>
								<th className="py-2 pr-4 text-left font-semibold">
									Intent Example
								</th>
								<th className="py-2 text-left font-semibold">
									Success Criteria
								</th>
							</tr>
						</thead>
						<tbody className="text-stone-600">
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Software
								</td>
								<td className="py-2 pr-4">Add user authentication</td>
								<td className="py-2">
									Tests pass, security scan clean
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Marketing
								</td>
								<td className="py-2 pr-4">Launch Q2 brand campaign</td>
								<td className="py-2">
									Brand review approved, placements confirmed
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Research
								</td>
								<td className="py-2 pr-4">Validate hypothesis X</td>
								<td className="py-2">
									Methodology reviewed, significance achieved
								</td>
							</tr>
							<tr className="border-b border-stone-100">
								<td className="py-2 pr-4 font-medium text-stone-900">
									Operations
								</td>
								<td className="py-2 pr-4">Migrate to new vendor</td>
								<td className="py-2">
									Data verified, staff certified, SLA met
								</td>
							</tr>
							<tr>
								<td className="py-2 pr-4 font-medium text-stone-900">
									Strategy
								</td>
								<td className="py-2 pr-4">Enter APAC market</td>
								<td className="py-2">
									Analysis complete, partnerships signed
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<div className="flex items-center justify-between border-t border-stone-200 pt-6">
				<div />
				<Link
					href="/phases/execution"
					className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700"
				>
					Next: Execution
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
