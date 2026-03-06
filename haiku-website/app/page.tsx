import Link from "next/link"

const phases = [
	{
		name: "Elaboration",
		description: "Define what will be done and why",
		href: "/phases/elaboration",
		color: "bg-teal-50 border-teal-200 text-teal-700",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>
		),
	},
	{
		name: "Execution",
		description: "Do the work through structured workflows",
		href: "/phases/execution",
		color: "bg-indigo-50 border-indigo-200 text-indigo-700",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		),
	},
	{
		name: "Operation",
		description: "Manage what was delivered",
		href: "/phases/operation",
		color: "bg-amber-50 border-amber-200 text-amber-700",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		),
	},
	{
		name: "Reflection",
		description: "Learn from what happened",
		href: "/phases/reflection",
		color: "bg-rose-50 border-rose-200 text-rose-700",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		),
	},
]

const profiles = [
	{
		name: "AI-DLC",
		domain: "Software Development",
		description:
			"Git integration, test suites, PR workflows, CI/CD pipelines, deployment gates.",
		href: "https://ai-dlc.dev",
		color: "border-indigo-200 bg-indigo-50",
	},
	{
		name: "SWARM",
		domain: "Marketing & Sales",
		description:
			"Scope, Workstreams, Accountability, Results, Memory --- campaign planning, content workflows.",
		color: "border-amber-200 bg-amber-50",
	},
	{
		name: "Custom",
		domain: "Your Domain",
		description:
			"Operations, research, strategy --- create your own profile for any field.",
		href: "/profiles",
		color: "border-stone-200 bg-stone-50",
	},
]

export default function Home() {
	return (
		<div>
			{/* Hero */}
			<section className="relative px-4 py-20 sm:py-32">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_40%,rgba(20,184,166,0.08),transparent)]" />
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
						<span className="text-teal-600">HAIKU</span>
					</h1>
					<p className="mb-2 text-lg font-medium text-stone-500 sm:text-xl">
						Human AI Knowledge Unification
					</p>
					<p className="mx-auto mb-10 max-w-2xl text-lg text-stone-600 sm:text-xl">
						The universal framework for structured human-AI collaboration.
						Disciplined form that channels creative energy into reliable,
						repeatable results --- across any domain.
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Link
							href="/getting-started"
							className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
						>
							Get Started
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
						</Link>
						<Link
							href="/methodology"
							className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-6 py-3 font-medium text-stone-700 transition hover:bg-stone-50"
						>
							Explore the Methodology
						</Link>
					</div>
				</div>
			</section>

			{/* 4-Phase Lifecycle */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">The 4-Phase Lifecycle</h2>
						<p className="mx-auto max-w-2xl text-stone-600">
							Every initiative follows four phases. Each phase has a distinct
							purpose and produces artifacts that feed the next.
						</p>
					</div>

					{/* Lifecycle visual */}
					<div className="mb-8 flex items-center justify-center">
						<div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-0">
							{phases.map((phase, i) => (
								<div key={phase.name} className="flex items-center">
									<Link
										href={phase.href}
										className={`group flex items-center gap-3 rounded-xl border px-5 py-3 transition hover:shadow-md ${phase.color}`}
									>
										{phase.icon}
										<div>
											<div className="font-semibold">{phase.name}</div>
											<div className="text-xs opacity-70">
												{phase.description}
											</div>
										</div>
									</Link>
									{i < phases.length - 1 && (
										<svg
											className="mx-2 hidden h-5 w-5 text-stone-300 sm:block"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M13 7l5 5m0 0l-5 5m5-5H6"
											/>
										</svg>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Loop indicator */}
					<div className="text-center text-sm text-stone-400">
						<svg className="mx-auto mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						Reflection feeds forward into the next Elaboration cycle
					</div>
				</div>
			</section>

			{/* Not Just Software */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Not Just for Software
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600">
							HAIKU is domain-agnostic. The same lifecycle applies to software,
							marketing, operations, research, strategy, and any structured
							initiative. Domain specifics are handled by profiles.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-3">
						{profiles.map((profile) => (
							<div
								key={profile.name}
								className={`rounded-xl border p-6 ${profile.color}`}
							>
								<div className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">
									{profile.domain}
								</div>
								<h3 className="mb-2 text-xl font-semibold">
									{profile.name}
								</h3>
								<p className="mb-4 text-sm text-stone-600">
									{profile.description}
								</p>
								{profile.href && (
									profile.href.startsWith("http") ? (
										<a
											href={profile.href}
											target="_blank"
											rel="noopener noreferrer"
											className="text-sm font-medium text-teal-600 hover:text-teal-700"
										>
											Visit site &rarr;
										</a>
									) : (
										<Link
											href={profile.href}
											className="text-sm font-medium text-teal-600 hover:text-teal-700"
										>
											Learn more &rarr;
										</Link>
									)
								)}
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Core Principles Preview */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">Built on Principles</h2>
					</div>
					<div className="grid gap-8 md:grid-cols-2">
						<div>
							<h3 className="mb-2 font-semibold text-stone-900">
								Clarity Through Constraint
							</h3>
							<p className="text-sm text-stone-600">
								Like haiku poetry, constrained form produces clarity. Structured
								phases, quality gates, and defined workflows channel creative
								energy into reliable outcomes.
							</p>
						</div>
						<div>
							<h3 className="mb-2 font-semibold text-stone-900">
								Quality Enforcement Over Prescription
							</h3>
							<p className="text-sm text-stone-600">
								Define what must be true, not how to get there. Quality gates
								reject non-conforming work while preserving creative freedom in
								approach.
							</p>
						</div>
						<div>
							<h3 className="mb-2 font-semibold text-stone-900">
								Three Collaboration Modes
							</h3>
							<p className="text-sm text-stone-600">
								Supervised, Observed, and Autonomous --- fluid movement between
								modes as context demands. The human doesn't disappear; the
								human's function changes.
							</p>
						</div>
						<div>
							<h3 className="mb-2 font-semibold text-stone-900">
								Compounding Learning Loops
							</h3>
							<p className="text-sm text-stone-600">
								Reflection feeds forward into future elaboration. Teams that use
								HAIKU get better at using HAIKU. Ad-hoc approaches never
								compound.
							</p>
						</div>
					</div>
					<div className="mt-8 text-center">
						<Link
							href="/methodology"
							className="text-sm font-medium text-teal-600 hover:text-teal-700"
						>
							Explore the full methodology &rarr;
						</Link>
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mb-3 text-3xl font-bold">Start with Elaboration</h2>
					<p className="mb-8 text-stone-600">
						You don't need to adopt the entire framework at once. Start by
						structuring your next initiative with the Elaboration phase and grow
						into the full lifecycle.
					</p>
					<Link
						href="/getting-started"
						className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
					>
						Getting Started Guide
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
						</svg>
					</Link>
				</div>
			</section>
		</div>
	)
}
