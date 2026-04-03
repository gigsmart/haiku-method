import Link from "next/link"
import { getAllBlogPosts } from "@/lib/blog"

const phases = [
	{
		name: "Elaboration",
		description: "Define what will be done and why",
		href: "/methodology/elaboration/",
		color: "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",
		textColor: "text-teal-700 dark:text-teal-300",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>
		),
	},
	{
		name: "Execution",
		description: "Do the work through structured workflows",
		href: "/methodology/execution/",
		color: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800",
		textColor: "text-indigo-700 dark:text-indigo-300",
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
		href: "/methodology/operation/",
		color: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
		textColor: "text-amber-700 dark:text-amber-300",
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
		href: "/methodology/reflection/",
		color: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
		textColor: "text-rose-700 dark:text-rose-300",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		),
	},
]

const studios = [
	{
		name: "AI-DLC",
		domain: "Software Development",
		stages: "Inception, Design, Product, Development, Operations, Security",
		description:
			"Git integration, test suites, CI/CD pipelines, deployment gates. The full software lifecycle with quality enforcement at every stage.",
		color: "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30",
	},
	{
		name: "Ideation",
		domain: "Universal Default",
		stages: "Research, Create, Review, Deliver",
		description:
			"The general-purpose studio. Works for any structured initiative — strategy, research, planning, or creative work.",
		color: "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30",
	},
	{
		name: "Marketing",
		domain: "Campaigns & Content",
		stages: "Research, Creative, Review, Publish",
		description:
			"Brand guidelines, content calendars, audience targeting, performance analytics. Campaign planning through publication.",
		color: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
	},
	{
		name: "Custom",
		domain: "Your Domain",
		stages: "Define your own stages",
		description:
			"Operations, research, legal, finance — create a studio for any domain with custom stages, roles, and quality gates.",
		color: "border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/30",
	},
]

const principles = [
	{
		title: "Stages, not steps",
		description:
			"Quality gates that reject non-conforming work, not prescribed procedures. Define what must be true, not how to get there.",
	},
	{
		title: "Context engineering",
		description:
			"Small, focused agents with relevant context outperform comprehensive agents with scattered information. Precision over volume.",
	},
	{
		title: "Learning loops",
		description:
			"Every initiative feeds learnings forward. Teams that use H·AI·K·U get better at using H·AI·K·U. Ad-hoc approaches never compound.",
	},
	{
		title: "Human oversight at strategic moments",
		description:
			"Supervised, observed, or autonomous — choose the right collaboration mode for the work. The human doesn't disappear; the human's function changes.",
	},
]

export default function Home() {
	const recentPosts = getAllBlogPosts().slice(0, 3)

	return (
		<div>
			{/* Hero */}
			<section className="relative px-4 py-20 sm:py-32">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_40%,rgba(20,184,166,0.08),transparent)]" />
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
						AI-DLC
					</h1>
					<p className="mb-2 text-lg font-medium text-stone-500 dark:text-stone-400">
						A H·AI·K·U Profile for Software Development
					</p>
					<p className="mx-auto mb-10 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
						Structured human-AI collaboration for teams that build software.
						From intent to deployment — disciplined form, reliable results.
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Link
							href="/methodology/"
							className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
						>
							How it works
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
						</Link>
						<Link
							href="/docs/installation/"
							className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-6 py-3 font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
						>
							Get started
						</Link>
					</div>
				</div>
			</section>

			{/* The Universal Lifecycle */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">The 4-Phase Lifecycle</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Every initiative follows four phases. Each phase has a distinct
							purpose and produces artifacts that feed the next.
						</p>
					</div>

					<div className="mb-8 grid gap-4 sm:grid-cols-2">
						{phases.map((phase) => (
							<Link
								key={phase.name}
								href={phase.href}
								className={`group flex items-start gap-4 rounded-xl border p-5 transition hover:shadow-md ${phase.color}`}
							>
								<div className={phase.textColor}>{phase.icon}</div>
								<div>
									<div className={`font-semibold ${phase.textColor}`}>
										{phase.name}
									</div>
									<div className="text-sm text-stone-600 dark:text-stone-400">
										{phase.description}
									</div>
								</div>
							</Link>
						))}
					</div>

					<div className="text-center text-sm text-stone-400 dark:text-stone-500">
						<svg className="mx-auto mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						Reflection feeds forward into the next Elaboration cycle
					</div>

					<div className="mt-8 text-center">
						<Link
							href="/methodology/"
							className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
						>
							Learn more about the lifecycle &rarr;
						</Link>
					</div>
				</div>
			</section>

			{/* Domain Profiles (Studios) */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Not Just for Software
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							H·AI·K·U is domain-agnostic. Studios customize the lifecycle for
							your field — software, marketing, operations, or anything structured.
						</p>
					</div>

					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						{studios.map((studio) => (
							<div
								key={studio.name}
								className={`rounded-xl border p-6 ${studio.color}`}
							>
								<div className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
									{studio.domain}
								</div>
								<h3 className="mb-2 text-lg font-semibold text-stone-900 dark:text-stone-100">
									{studio.name}
								</h3>
								<p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
									{studio.stages}
								</p>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									{studio.description}
								</p>
							</div>
						))}
					</div>

					<div className="mt-8 text-center">
						<Link
							href="/studios/"
							className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
						>
							Explore studios &rarr;
						</Link>
					</div>
				</div>
			</section>

			{/* Key Principles */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">Built on Principles</h2>
					</div>
					<div className="grid gap-8 md:grid-cols-2">
						{principles.map((principle) => (
							<div key={principle.title}>
								<h3 className="mb-2 font-semibold text-stone-900 dark:text-stone-100">
									{principle.title}
								</h3>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									{principle.description}
								</p>
							</div>
						))}
					</div>
					<div className="mt-8 text-center">
						<Link
							href="/methodology/"
							className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
						>
							Explore the full methodology &rarr;
						</Link>
					</div>
				</div>
			</section>

			{/* Get Started */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-12 text-center">
						<h2 className="mb-3 text-3xl font-bold">Get Started</h2>
					</div>
					<div className="grid gap-6 md:grid-cols-3">
						<Link
							href="/docs/installation/"
							className="group rounded-xl border border-stone-200 p-6 transition hover:border-teal-300 hover:shadow-md dark:border-stone-800 dark:hover:border-teal-700"
						>
							<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
								<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
								</svg>
							</div>
							<h3 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
								For developers
							</h3>
							<p className="text-sm text-stone-600 dark:text-stone-400">
								Install the Claude Code plugin and run your first intent.
							</p>
						</Link>
						<Link
							href="/methodology/"
							className="group rounded-xl border border-stone-200 p-6 transition hover:border-teal-300 hover:shadow-md dark:border-stone-800 dark:hover:border-teal-700"
						>
							<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
								<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
								</svg>
							</div>
							<h3 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
								For teams
							</h3>
							<p className="text-sm text-stone-600 dark:text-stone-400">
								Read the methodology to understand how H·AI·K·U structures collaboration.
							</p>
						</Link>
						<Link
							href="/studios/"
							className="group rounded-xl border border-stone-200 p-6 transition hover:border-teal-300 hover:shadow-md dark:border-stone-800 dark:hover:border-teal-700"
						>
							<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
								<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
								</svg>
							</div>
							<h3 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
								For organizations
							</h3>
							<p className="text-sm text-stone-600 dark:text-stone-400">
								Explore studios to see how H·AI·K·U adapts to different domains.
							</p>
						</Link>
					</div>
				</div>
			</section>

			{/* Recent Blog Posts */}
			{recentPosts.length > 0 && (
				<section className="border-t border-stone-200 px-4 py-16 dark:border-stone-800">
					<div className="mx-auto max-w-5xl">
						<div className="mb-8 flex items-center justify-between">
							<h2 className="text-2xl font-bold">Latest Updates</h2>
							<Link
								href="/blog/"
								className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
							>
								All posts &rarr;
							</Link>
						</div>
						<div className="grid gap-6 md:grid-cols-3">
							{recentPosts.map((post) => (
								<Link
									key={post.slug}
									href={`/blog/${post.slug}/`}
									className="group rounded-xl border border-stone-200 p-6 transition hover:border-teal-300 hover:shadow-md dark:border-stone-800 dark:hover:border-teal-700"
								>
									<time className="text-xs text-stone-400 dark:text-stone-500">
										{new Date(post.date).toLocaleDateString("en-US", {
											year: "numeric",
											month: "long",
											day: "numeric",
										})}
									</time>
									<h3 className="mt-2 font-semibold text-stone-900 group-hover:text-teal-600 dark:text-stone-100 dark:group-hover:text-teal-400">
										{post.title}
									</h3>
									{post.description && (
										<p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
											{post.description}
										</p>
									)}
								</Link>
							))}
						</div>
					</div>
				</section>
			)}
		</div>
	)
}
