import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Getting Started",
	description:
		"Start using HAIKU incrementally. Begin with Elaboration and grow into the full lifecycle.",
}

export default function GettingStartedPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<h1 className="mb-4 text-4xl font-bold">Getting Started</h1>
			<p className="mb-10 text-lg text-stone-600">
				You don't need to adopt the entire HAIKU framework at once. Start small,
				build confidence, and expand as the value becomes clear.
			</p>

			{/* Incremental Adoption */}
			<section className="mb-12">
				<h2 className="mb-6 text-2xl font-bold">Incremental Adoption Path</h2>

				<div className="space-y-6">
					<div className="rounded-xl border border-teal-200 bg-teal-50 p-6">
						<div className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-500">
							Step 1
						</div>
						<h3 className="mb-2 text-lg font-semibold text-teal-900">
							Start with Elaboration
						</h3>
						<p className="mb-3 text-sm text-teal-800">
							Before your next initiative, spend time defining intent, breaking
							work into units, and setting success criteria. This alone
							transforms how you work with AI.
						</p>
						<div className="rounded-lg border border-teal-200 bg-white p-4 text-sm text-teal-700">
							<strong>Try this:</strong> Take your next project idea. Write a
							clear intent statement. Break it into 3-5 units. Define what
							"done" looks like for each unit. You've just completed your first
							Elaboration.
						</div>
					</div>

					<div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
						<div className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-500">
							Step 2
						</div>
						<h3 className="mb-2 text-lg font-semibold text-indigo-900">
							Add Structured Execution
						</h3>
						<p className="mb-3 text-sm text-indigo-800">
							Use hats to structure your work. Even just separating planning from
							executing from reviewing creates clarity. Choose your collaboration
							mode per unit.
						</p>
						<div className="rounded-lg border border-indigo-200 bg-white p-4 text-sm text-indigo-700">
							<strong>Try this:</strong> For each unit, explicitly plan before
							building, and review after building. Use quality gates --- define
							what must be true before marking a unit complete.
						</div>
					</div>

					<div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
						<div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500">
							Step 3
						</div>
						<h3 className="mb-2 text-lg font-semibold text-amber-900">
							Include Operation
						</h3>
						<p className="text-sm text-amber-800">
							During execution, produce an operational plan alongside
							deliverables. Define recurring tasks, reactive responses, and
							ongoing monitoring. This ensures delivery doesn't mean
							abandonment.
						</p>
					</div>

					<div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
						<div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-500">
							Step 4
						</div>
						<h3 className="mb-2 text-lg font-semibold text-rose-900">
							Close the Loop with Reflection
						</h3>
						<p className="text-sm text-rose-800">
							After completing an initiative, analyze what happened. Capture
							learnings. Feed them forward. This is where HAIKU's compounding
							advantage begins.
						</p>
					</div>
				</div>
			</section>

			{/* For Software Teams */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">For Software Teams</h2>
				<p className="mb-4 text-stone-600">
					If you're building software, the AI-DLC profile gives you a
					ready-made implementation of HAIKU with deep toolchain integration.
				</p>
				<div className="rounded-lg border border-stone-200 bg-stone-900 p-4 font-mono text-sm text-stone-100">
					<div className="text-stone-400"># Install the HAIKU plugin for Claude Code</div>
					<div>/plugin marketplace add thebushidocollective/ai-dlc</div>
					<div>/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project</div>
				</div>
				<p className="mt-3 text-sm text-stone-500">
					The plugin provides the AI-DLC profile with hats, workflows, and
					quality gates pre-configured for software development.
				</p>
				<div className="mt-4">
					<a
						href="https://ai-dlc.dev"
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm font-medium text-teal-600 hover:text-teal-700"
					>
						Visit ai-dlc.dev for full documentation &rarr;
					</a>
				</div>
			</section>

			{/* For Other Teams */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">For Other Teams</h2>
				<p className="mb-4 text-stone-600">
					HAIKU works for any domain. You don't need a plugin to start --- the
					methodology is the value. Here's how to begin:
				</p>
				<ol className="space-y-4 text-stone-600">
					<li>
						<strong>1. Read the methodology.</strong> Understand the 4-phase
						lifecycle and core principles.{" "}
						<Link
							href="/methodology"
							className="text-teal-600 hover:text-teal-700"
						>
							Methodology overview &rarr;
						</Link>
					</li>
					<li>
						<strong>2. Define your first intent.</strong> Pick a real initiative.
						Write a clear intent statement with scope and desired outcome.
					</li>
					<li>
						<strong>3. Decompose into units.</strong> Break the intent into
						discrete pieces of work with clear boundaries and success criteria.
					</li>
					<li>
						<strong>4. Choose collaboration modes.</strong> For each unit, decide
						whether to work in supervised, observed, or autonomous mode.
					</li>
					<li>
						<strong>5. Execute with structure.</strong> Use hats to separate
						planning, execution, and review. Let quality gates enforce standards.
					</li>
					<li>
						<strong>6. Reflect and feed forward.</strong> After the initiative,
						capture learnings and apply them to the next cycle.
					</li>
				</ol>
			</section>

			{/* Mode Selection */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">Choosing a Collaboration Mode</h2>
				<p className="mb-4 text-stone-600">
					The right mode depends on context. Use this as a starting guide:
				</p>
				<div className="space-y-4">
					<div className="rounded-lg border border-stone-200 p-4">
						<h3 className="mb-1 font-semibold">
							Use Supervised when...
						</h3>
						<p className="text-sm text-stone-600">
							The work is novel, high-risk, or foundational. You're exploring
							unfamiliar territory. Mistakes would be costly to reverse.
						</p>
					</div>
					<div className="rounded-lg border border-stone-200 p-4">
						<h3 className="mb-1 font-semibold">
							Use Observed when...
						</h3>
						<p className="text-sm text-stone-600">
							The work is somewhat familiar but requires judgment calls. You want
							to see how AI approaches the problem. You're building trust in the
							process.
						</p>
					</div>
					<div className="rounded-lg border border-stone-200 p-4">
						<h3 className="mb-1 font-semibold">
							Use Autonomous when...
						</h3>
						<p className="text-sm text-stone-600">
							The work is well-defined with verifiable success criteria. Quality
							gates can enforce standards. You trust the process and want
							efficiency.
						</p>
					</div>
				</div>
			</section>

			{/* Next Steps */}
			<div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
				<h2 className="mb-4 text-lg font-semibold">Next Steps</h2>
				<div className="space-y-3">
					<Link
						href="/methodology"
						className="block text-sm font-medium text-teal-600 hover:text-teal-700"
					>
						Deep dive into the methodology &rarr;
					</Link>
					<Link
						href="/phases/elaboration"
						className="block text-sm font-medium text-teal-600 hover:text-teal-700"
					>
						Learn the Elaboration phase in detail &rarr;
					</Link>
					<Link
						href="/profiles"
						className="block text-sm font-medium text-teal-600 hover:text-teal-700"
					>
						Explore profiles and build your own &rarr;
					</Link>
					<Link
						href="/paper"
						className="block text-sm font-medium text-teal-600 hover:text-teal-700"
					>
						Read the full paper &rarr;
					</Link>
				</div>
			</div>
		</div>
	)
}
