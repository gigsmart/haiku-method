import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Methodology",
	description:
		"How H·AI·K·U structures human-AI collaboration through a 4-phase lifecycle — elaboration, execution, operation, and reflection.",
}

const failureModes = [
	{
		problem: "No persistent structure",
		consequence: "Context lost between sessions. Every conversation starts from scratch.",
	},
	{
		problem: "No quality enforcement",
		consequence: "Errors propagate unchecked. AI output accepted without verification.",
	},
	{
		problem: "No completion criteria",
		consequence: '"Good enough" without verification. No way to know when work is actually done.',
	},
	{
		problem: "No mode selection",
		consequence: "Wrong level of autonomy for the work. Too much oversight or too little.",
	},
	{
		problem: "No learning loop",
		consequence: "Same mistakes recur. Teams never compound their experience.",
	},
	{
		problem: "No domain awareness",
		consequence: "One-size-fits-all workflows. Security teams forced into dev sprints. Designers shoehorned into ticket queues.",
	},
]

const phases = [
	{
		name: "Elaboration",
		description: "Define what will be done and why",
		detail: "Collaborative planning that produces clear intent, decomposed work, and verifiable completion criteria.",
		href: "/methodology/elaboration/",
		color: "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30",
		textColor: "text-teal-700 dark:text-teal-300",
		number: 1,
		icon: (
			<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>
		),
	},
	{
		name: "Execution",
		description: "Do the work through structured workflows",
		detail: "Plan, build, adversarial review, and quality gates. Work that fails review does not advance.",
		href: "/methodology/execution/",
		color: "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30",
		textColor: "text-indigo-700 dark:text-indigo-300",
		number: 2,
		icon: (
			<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		),
	},
	{
		name: "Operation",
		description: "Manage what was delivered",
		detail: "Deploy, monitor, and maintain. Operational concerns are first-class, not afterthoughts.",
		href: "/methodology/operation/",
		color: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
		textColor: "text-amber-700 dark:text-amber-300",
		number: 3,
		icon: (
			<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		),
	},
	{
		name: "Reflection",
		description: "Learn from what happened",
		detail: "Structured analysis that produces concrete learnings. These feed forward into the next cycle.",
		href: "/methodology/reflection/",
		color: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30",
		textColor: "text-rose-700 dark:text-rose-300",
		number: 4,
		icon: (
			<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		),
	},
]

const modes = [
	{
		name: "Supervised",
		description: "Human directs, AI assists",
		detail:
			"Best for high-risk work, unfamiliar domains, or critical decisions. The human drives; the AI is a thinking partner.",
		icon: "👁",
	},
	{
		name: "Observed",
		description: "AI executes, human monitors",
		detail:
			"Best for well-defined work with moderate risk. The AI does the work; the human reviews at checkpoints.",
		icon: "👀",
	},
	{
		name: "Autonomous",
		description: "AI executes within boundaries",
		detail:
			"Best for routine, low-risk work with clear criteria. The AI works independently within defined constraints.",
		icon: "🤖",
	},
]

export default function MethodologyPage() {
	return (
		<div>
			{/* Hero */}
			<section className="px-4 py-16 sm:py-24">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
						The H·AI·K·U Methodology
					</h1>
					<p className="text-lg text-stone-600 dark:text-stone-400">
						A universal framework for structured human-AI collaboration.
						Four phases that turn unstructured AI interactions into disciplined,
						repeatable workflows.
					</p>
				</div>
			</section>

			{/* The Problem */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Why Most AI Collaboration Fails
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Without structure, AI-assisted work suffers from predictable failure
							modes. H·AI·K·U addresses each one.
						</p>
					</div>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{failureModes.map((mode) => (
							<div
								key={mode.problem}
								className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950"
							>
								<h3 className="mb-2 font-semibold text-stone-900 dark:text-stone-100">
									{mode.problem}
								</h3>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									{mode.consequence}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* The Lifecycle */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">The 4-Phase Lifecycle</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Every initiative flows through elaboration, execution, operation,
							and reflection. The output of each phase feeds the next, creating a
							continuous improvement loop.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						{phases.map((phase) => (
							<Link
								key={phase.name}
								href={phase.href}
								className={`group rounded-xl border p-6 transition hover:shadow-md ${phase.color}`}
							>
								<div className="mb-3 flex items-center gap-3">
									<div className={phase.textColor}>{phase.icon}</div>
									<div>
										<span className={`text-xs font-medium ${phase.textColor}`}>
											Phase {phase.number}
										</span>
										<h3 className={`text-xl font-semibold ${phase.textColor}`}>
											{phase.name}
										</h3>
									</div>
								</div>
								<p className="mb-2 font-medium text-stone-700 dark:text-stone-300">
									{phase.description}
								</p>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									{phase.detail}
								</p>
								<span className={`mt-3 inline-block text-sm font-medium ${phase.textColor}`}>
									Learn more &rarr;
								</span>
							</Link>
						))}
					</div>

					<div className="mt-8 text-center text-sm text-stone-400 dark:text-stone-500">
						<svg className="mx-auto mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						Reflection feeds forward into the next Elaboration cycle
					</div>
				</div>
			</section>

			{/* How Stages Work */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">How Stages Work</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Within each phase, work flows through stages. Each stage has a
							specific structure: plan, build, review, and advance.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
							<h3 className="mb-3 font-semibold text-stone-900 dark:text-stone-100">
								The Execution Loop
							</h3>
							<div className="space-y-3">
								<div className="flex items-start gap-3">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">1</span>
									<div>
										<div className="font-medium text-stone-900 dark:text-stone-100">Plan</div>
										<p className="text-sm text-stone-600 dark:text-stone-400">Agent articulates its approach before starting work.</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">2</span>
									<div>
										<div className="font-medium text-stone-900 dark:text-stone-100">Build</div>
										<p className="text-sm text-stone-600 dark:text-stone-400">Agent executes the planned work, producing deliverables.</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300">3</span>
									<div>
										<div className="font-medium text-stone-900 dark:text-stone-100">Review</div>
										<p className="text-sm text-stone-600 dark:text-stone-400">Adversarial review evaluates work against completion criteria.</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-900 dark:text-rose-300">4</span>
									<div>
										<div className="font-medium text-stone-900 dark:text-stone-100">Advance</div>
										<p className="text-sm text-stone-600 dark:text-stone-400">Quality gate decides: advance to next stage, or iterate.</p>
									</div>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
							<h3 className="mb-3 font-semibold text-stone-900 dark:text-stone-100">
								Hats — Focused Roles
							</h3>
							<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
								The AI agent switches between distinct roles during execution.
								Each hat constrains the agent's focus and behavior.
							</p>
							<div className="space-y-3">
								<div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900">
									<div className="font-medium text-stone-900 dark:text-stone-100">Planner</div>
									<p className="text-sm text-stone-600 dark:text-stone-400">Reads requirements, plans approach, identifies risks.</p>
								</div>
								<div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900">
									<div className="font-medium text-stone-900 dark:text-stone-100">Builder</div>
									<p className="text-sm text-stone-600 dark:text-stone-400">Executes the plan, produces deliverables, runs verification.</p>
								</div>
								<div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900">
									<div className="font-medium text-stone-900 dark:text-stone-100">Reviewer</div>
									<p className="text-sm text-stone-600 dark:text-stone-400">Adversarial review against criteria. Cannot be the same agent that built.</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Studios */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Studios — Lifecycle Templates
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Studios customize the lifecycle for specific domains. The default
							&ldquo;ideation&rdquo; studio works for everything. Specialized studios
							add domain-specific stages and review modes.
						</p>
					</div>
					<div className="text-center">
						<Link
							href="/studios/"
							className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
						>
							Explore studios
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
						</Link>
					</div>
				</div>
			</section>

			{/* Collaboration Modes */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">Collaboration Modes</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Not every task needs the same level of human involvement. H·AI·K·U
							defines three modes — like a GPS that can be set to guide, monitor,
							or autopilot.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-3">
						{modes.map((mode) => (
							<div
								key={mode.name}
								className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950"
							>
								<div className="mb-2 text-2xl">{mode.icon}</div>
								<h3 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
									{mode.name}
								</h3>
								<p className="mb-2 text-sm font-medium text-stone-500 dark:text-stone-400">
									{mode.description}
								</p>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									{mode.detail}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Deep Dive Links */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">Deep Dive</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Explore each phase in detail with cross-domain examples and
							practical guidance.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{phases.map((phase) => (
							<Link
								key={phase.name}
								href={phase.href}
								className={`group rounded-xl border p-5 text-center transition hover:shadow-md ${phase.color}`}
							>
								<div className={`mx-auto mb-2 w-8 ${phase.textColor}`}>{phase.icon}</div>
								<h3 className={`font-semibold ${phase.textColor}`}>
									{phase.name}
								</h3>
								<p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
									{phase.description}
								</p>
							</Link>
						))}
					</div>
				</div>
			</section>
		</div>
	)
}
