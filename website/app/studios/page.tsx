import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Studios",
	description:
		"Domain profiles that customize the H·AI·K·U lifecycle for software, marketing, operations, and more.",
}

const studios = [
	{
		name: "Software",
		domain: "Software Development",
		description:
			"The full software lifecycle with quality enforcement at every stage. Git integration, test suites, CI/CD pipelines, and deployment gates.",
		stages: [
			{ name: "Inception", description: "Define intent and decompose into units" },
			{ name: "Design", description: "Architecture, UX patterns, and technical approach" },
			{ name: "Product", description: "Requirements refinement and acceptance criteria" },
			{ name: "Development", description: "Implementation with plan/build/review cycles" },
			{ name: "Operations", description: "Deployment, monitoring, and maintenance" },
			{ name: "Security", description: "Vulnerability assessment and compliance checks" },
		],
		example: {
			intent: "Add user authentication",
			flow: "Intent document with security requirements, decomposed into OAuth unit, session management unit, and UI unit. Each built with test coverage, reviewed against acceptance criteria, deployed with monitoring.",
		},
		color: "border-indigo-200 dark:border-indigo-800",
		accentBg: "bg-indigo-50 dark:bg-indigo-950/30",
		accentText: "text-indigo-600 dark:text-indigo-400",
	},
	{
		name: "Ideation",
		domain: "Universal Default",
		description:
			"The general-purpose studio. Works for any structured initiative — strategy documents, research projects, planning exercises, or creative work.",
		stages: [
			{ name: "Research", description: "Gather information and context" },
			{ name: "Create", description: "Produce deliverables based on research" },
			{ name: "Review", description: "Evaluate quality against criteria" },
			{ name: "Deliver", description: "Finalize and distribute outputs" },
		],
		example: {
			intent: "Competitive landscape analysis",
			flow: "Research phase identifies competitors and data sources. Create phase synthesizes findings into a structured report. Review validates claims against sources. Deliver produces the final document with executive summary.",
		},
		color: "border-teal-200 dark:border-teal-800",
		accentBg: "bg-teal-50 dark:bg-teal-950/30",
		accentText: "text-teal-600 dark:text-teal-400",
	},
	{
		name: "Marketing",
		domain: "Campaigns & Content",
		description:
			"Campaign planning through publication. Brand guidelines enforcement, content calendars, audience targeting, and performance analytics.",
		stages: [
			{ name: "Research", description: "Audience analysis and competitive intelligence" },
			{ name: "Creative", description: "Content creation within brand guidelines" },
			{ name: "Review", description: "Brand compliance and stakeholder approval" },
			{ name: "Publish", description: "Distribution and performance tracking" },
		],
		example: {
			intent: "Q2 product launch campaign",
			flow: "Research identifies target segments and messaging angles. Creative produces landing pages, email sequences, and social assets. Review checks brand compliance and messaging consistency. Publish distributes across channels with A/B testing.",
		},
		color: "border-amber-200 dark:border-amber-800",
		accentBg: "bg-amber-50 dark:bg-amber-950/30",
		accentText: "text-amber-600 dark:text-amber-400",
	},
	{
		name: "Operations",
		domain: "Infrastructure & Process",
		description:
			"Operational initiatives with risk assessment, implementation planning, and monitoring. Runbooks, SLA tracking, and incident response.",
		stages: [
			{ name: "Assess", description: "Current state analysis and risk evaluation" },
			{ name: "Plan", description: "Migration planning and rollback procedures" },
			{ name: "Implement", description: "Phased execution with validation checks" },
			{ name: "Monitor", description: "Post-implementation monitoring and optimization" },
		],
		example: {
			intent: "Migrate to new cloud vendor",
			flow: "Assessment maps current infrastructure and identifies risks. Plan produces a phased migration with rollback procedures. Implementation executes the migration in stages with validation at each step. Monitor tracks performance against SLAs.",
		},
		color: "border-rose-200 dark:border-rose-800",
		accentBg: "bg-rose-50 dark:bg-rose-950/30",
		accentText: "text-rose-600 dark:text-rose-400",
	},
]

export default function StudiosPage() {
	return (
		<div>
			{/* Hero */}
			<section className="px-4 py-16 sm:py-24">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
						Studios
					</h1>
					<p className="text-lg text-stone-600 dark:text-stone-400">
						Studios customize the H·AI·K·U lifecycle for specific domains. Each
						studio defines stages, roles, review modes, and quality gates tailored
						to how work actually flows in that field.
					</p>
				</div>
			</section>

			{/* What is a Studio */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-12 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-3xl">
					<h2 className="mb-4 text-2xl font-bold">What is a Studio?</h2>
					<p className="mb-4 text-stone-600 dark:text-stone-400">
						A studio is a domain-specific configuration of the H·AI·K·U lifecycle.
						It defines which stages work moves through, what roles the AI agent
						adopts at each stage, and what quality gates must pass before work
						advances.
					</p>
					<p className="text-stone-600 dark:text-stone-400">
						The universal lifecycle — elaboration, execution, operation, reflection —
						stays the same. Studios customize what happens <em>within</em> each phase.
					</p>
				</div>
			</section>

			{/* Studio Cards */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl space-y-12">
					{studios.map((studio) => (
						<div
							key={studio.name}
							className={`rounded-xl border ${studio.color} overflow-hidden`}
						>
							<div className={`${studio.accentBg} px-6 py-5`}>
								<div className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
									{studio.domain}
								</div>
								<h3 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
									{studio.name}
								</h3>
								<p className="mt-2 text-stone-600 dark:text-stone-400">
									{studio.description}
								</p>
							</div>

							<div className="bg-white px-6 py-5 dark:bg-stone-950">
								{/* Stages */}
								<h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
									Stages
								</h4>
								<div className="mb-6 flex flex-wrap gap-2">
									{studio.stages.map((stage, i) => (
										<div key={stage.name} className="flex items-center">
											<span className={`rounded-lg px-3 py-1.5 text-sm font-medium ${studio.accentBg} ${studio.accentText}`}>
												{stage.name}
											</span>
											{i < studio.stages.length - 1 && (
												<svg className="mx-1 h-4 w-4 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
												</svg>
											)}
										</div>
									))}
								</div>

								{/* Example */}
								<h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
									Example
								</h4>
								<div className="rounded-lg bg-stone-50 p-4 dark:bg-stone-900">
									<p className="mb-1 text-sm font-medium text-stone-700 dark:text-stone-300">
										&ldquo;{studio.example.intent}&rdquo;
									</p>
									<p className="text-sm text-stone-600 dark:text-stone-400">
										{studio.example.flow}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Custom Studio */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mb-4 text-2xl font-bold">Build Your Own</h2>
					<p className="mb-6 text-stone-600 dark:text-stone-400">
						Any domain with structured work can have a studio. Define your stages,
						configure quality gates, and the H·AI·K·U lifecycle adapts to how your
						team actually works.
					</p>
				</div>
			</section>

			{/* CTA */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mb-3 text-2xl font-bold">
						Start with Software
					</h2>
					<p className="mb-6 text-stone-600 dark:text-stone-400">
						The Software studio is the most mature H·AI·K·U
						profile. Install the Claude plugin to try it.
					</p>
					<Link
						href="/docs/installation/"
						className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
					>
						Install H·AI·K·U
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
					</Link>
				</div>
			</section>
		</div>
	)
}
