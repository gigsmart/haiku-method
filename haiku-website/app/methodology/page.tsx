import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Methodology",
	description:
		"HAIKU methodology deep dive --- core principles, the 4-phase lifecycle, collaboration modes, and the profile model.",
}

export default function MethodologyPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<h1 className="mb-4 text-4xl font-bold">The HAIKU Methodology</h1>
			<p className="mb-10 text-lg text-stone-600">
				A concise overview of the HAIKU framework. For the complete treatment,
				see the{" "}
				<Link href="/paper" className="text-teal-600 hover:text-teal-700 underline">
					full paper
				</Link>
				.
			</p>

			{/* The Problem */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">The Problem</h2>
				<p className="mb-4 text-stone-600">
					Most teams rely on ad-hoc prompting --- improvised interactions with
					no persistent structure, no quality enforcement, and no learning loop.
					This creates predictable failure modes:
				</p>
				<div className="space-y-3">
					{[
						{
							mode: "No persistent structure",
							result: "Context lost between sessions; every interaction starts from zero",
						},
						{
							mode: "No quality enforcement",
							result: "Errors propagate unchecked into deliverables",
						},
						{
							mode: "No completion criteria",
							result: '"Good enough" without verification; scope creep or premature closure',
						},
						{
							mode: "No mode selection",
							result: "Using autonomous approaches for work that demands supervision",
						},
						{
							mode: "No learning loop",
							result: "The same mistakes recur; organizational knowledge never compounds",
						},
					].map((item) => (
						<div
							key={item.mode}
							className="rounded-lg border border-stone-200 px-4 py-3"
						>
							<div className="text-sm font-medium text-stone-900">
								{item.mode}
							</div>
							<div className="text-sm text-stone-500">{item.result}</div>
						</div>
					))}
				</div>
			</section>

			{/* Core Principles */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">Core Principles</h2>

				<div className="space-y-8">
					<div>
						<h3 className="mb-2 text-lg font-semibold">
							Reimagine Rather Than Retrofit
						</h3>
						<p className="text-stone-600">
							Traditional methodologies were designed for human-driven processes
							with long iteration cycles. With AI, iteration costs approach zero.
							HAIKU is built from first principles for this reality --- continuous
							flow with strategic checkpoints rather than discrete phases
							separated by gates.
						</p>
					</div>

					<div>
						<h3 className="mb-2 text-lg font-semibold">
							Quality Enforcement Over Prescription
						</h3>
						<p className="mb-3 text-stone-600">
							Instead of specifying step-by-step procedures, define the
							constraints that must be satisfied. Let AI determine how to satisfy
							them. Quality gates reject non-conforming work without dictating
							approach.
						</p>
						<blockquote className="border-l-4 border-teal-300 bg-teal-50 py-3 pl-4 pr-4 text-sm italic text-teal-800">
							"Don't prescribe how; create gates that reject bad work."
						</blockquote>
					</div>

					<div>
						<h3 className="mb-2 text-lg font-semibold">
							Context Preservation Through Artifacts
						</h3>
						<p className="text-stone-600">
							AI context windows reset between sessions. HAIKU addresses this
							through artifact-based persistence: the outputs of each phase
							serve as structured context for subsequent work. This creates a
							self-documenting workflow.
						</p>
					</div>

					<div>
						<h3 className="mb-2 text-lg font-semibold">
							Iterative Refinement Through Bolts
						</h3>
						<p className="text-stone-600">
							Work progresses through bolts --- iteration cycles within units.
							Each bolt produces a reviewable increment. Small cycles with
							frequent feedback prevent drift and compound learning.
						</p>
					</div>

					<div>
						<h3 className="mb-2 text-lg font-semibold">
							Human Oversight at Strategic Moments
						</h3>
						<p className="mb-3 text-stone-600">
							Human judgment remains essential but should be applied where it
							matters most. Three collaboration modes define the spectrum:
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-stone-200">
										<th className="py-2 pr-4 text-left font-semibold">Mode</th>
										<th className="py-2 pr-4 text-left font-semibold">
											Human Role
										</th>
										<th className="py-2 text-left font-semibold">AI Role</th>
									</tr>
								</thead>
								<tbody className="text-stone-600">
									<tr className="border-b border-stone-100">
										<td className="py-2 pr-4 font-medium text-stone-900">
											Supervised
										</td>
										<td className="py-2 pr-4">Directs and approves</td>
										<td className="py-2">
											Proposes, explains, executes on approval
										</td>
									</tr>
									<tr className="border-b border-stone-100">
										<td className="py-2 pr-4 font-medium text-stone-900">
											Observed
										</td>
										<td className="py-2 pr-4">
											Monitors, intervenes when needed
										</td>
										<td className="py-2">
											Executes continuously, accepts redirection
										</td>
									</tr>
									<tr>
										<td className="py-2 pr-4 font-medium text-stone-900">
											Autonomous
										</td>
										<td className="py-2 pr-4">
											Defines boundaries, reviews outcomes
										</td>
										<td className="py-2">
											Executes independently within constraints
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div>
						<h3 className="mb-2 text-lg font-semibold">Learning Loops</h3>
						<p className="text-stone-600">
							Reflection is not optional. Every completed initiative feeds
							learnings back. Future elaboration draws on past reflection. Teams
							that use HAIKU get better at using HAIKU.
						</p>
					</div>
				</div>
			</section>

			{/* The 4-Phase Lifecycle */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">The 4-Phase Lifecycle</h2>
				<div className="mb-6 rounded-lg border border-stone-200 bg-stone-50 p-6 text-center font-mono text-sm text-stone-700">
					Elaboration &rarr; Execution &rarr; Operation &rarr; Reflection
					<br />
					<span className="text-stone-400">
						&larr;&mdash;&mdash;&mdash; Feed Forward
						&mdash;&mdash;&mdash;&rarr;
					</span>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{[
						{
							name: "Elaboration",
							desc: "Define what will be done and why",
							href: "/phases/elaboration",
						},
						{
							name: "Execution",
							desc: "Do the work through structured workflows",
							href: "/phases/execution",
						},
						{
							name: "Operation",
							desc: "Manage what was delivered",
							href: "/phases/operation",
						},
						{
							name: "Reflection",
							desc: "Learn from what happened",
							href: "/phases/reflection",
						},
					].map((phase) => (
						<Link
							key={phase.name}
							href={phase.href}
							className="group rounded-lg border border-stone-200 p-4 transition hover:border-stone-300 hover:shadow-sm"
						>
							<div className="font-semibold group-hover:text-teal-600">
								{phase.name}
							</div>
							<div className="text-sm text-stone-500">{phase.desc}</div>
						</Link>
					))}
				</div>
			</section>

			{/* Terminology */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">Terminology</h2>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-stone-200">
								<th className="py-2 pr-4 text-left font-semibold">Term</th>
								<th className="py-2 text-left font-semibold">Definition</th>
							</tr>
						</thead>
						<tbody className="text-stone-600">
							{[
								{
									term: "Intent",
									def: "The thing being accomplished --- the top-level goal or initiative",
								},
								{
									term: "Unit",
									def: "A discrete piece of work within an intent",
								},
								{
									term: "Bolt",
									def: "An iteration cycle within a unit that produces a reviewable increment",
								},
								{
									term: "Hat",
									def: "A behavioral role assumed during execution (e.g., planner, executor, reviewer)",
								},
								{
									term: "Workflow",
									def: "An ordered sequence of hats defining how a unit progresses",
								},
								{
									term: "Quality Gate",
									def: "A configurable verification checkpoint that provides backpressure",
								},
								{
									term: "Profile",
									def: "A domain-specific implementation of HAIKU (e.g., AI-DLC, SWARM)",
								},
								{
									term: "Collaboration Mode",
									def: "The human-AI interaction pattern: Supervised, Observed, or Autonomous",
								},
							].map((row) => (
								<tr key={row.term} className="border-b border-stone-100">
									<td className="py-2 pr-4 font-medium text-stone-900">
										{row.term}
									</td>
									<td className="py-2">{row.def}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* CTA */}
			<div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
				<p className="mb-3 text-stone-600">
					For the complete methodology with all details, examples, and formal
					definitions:
				</p>
				<Link
					href="/paper"
					className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
				>
					Read the Full Paper
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
