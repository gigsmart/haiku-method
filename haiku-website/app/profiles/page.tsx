import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Profiles",
	description:
		"HAIKU profiles adapt the universal methodology to specific domains --- software, marketing, operations, and beyond.",
}

export default function ProfilesPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<h1 className="mb-4 text-4xl font-bold">The Profile Model</h1>
			<p className="mb-10 text-lg text-stone-600">
				HAIKU defines the universal methodology. Profiles adapt it to specific
				domains by defining domain-specific hats, workflows, quality gates,
				tooling integrations, and artifact types --- while preserving the core
				4-phase lifecycle and principles.
			</p>

			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-bold">How Profiles Work</h2>
				<p className="mb-4 text-stone-600">
					A profile customizes HAIKU for a particular field. Think of HAIKU as
					the operating system and profiles as applications built on top of it.
					The profile inherits the lifecycle, principles, and collaboration
					model while adding domain-specific:
				</p>
				<ul className="space-y-2 text-stone-600">
					<li>
						<strong>Hats</strong> --- behavioral roles appropriate to the domain
					</li>
					<li>
						<strong>Workflows</strong> --- sequences of hats for common work patterns
					</li>
					<li>
						<strong>Quality gates</strong> --- domain-specific verification checks
					</li>
					<li>
						<strong>Artifact types</strong> --- the documents and deliverables
						the domain produces
					</li>
					<li>
						<strong>Tooling integrations</strong> --- connections to
						domain-specific tools
					</li>
				</ul>
			</section>

			{/* AI-DLC */}
			<section className="mb-8">
				<div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
					<div className="mb-1 text-xs font-medium uppercase tracking-wider text-indigo-500">
						Software Development
					</div>
					<h3 className="mb-3 text-2xl font-bold text-indigo-900">AI-DLC</h3>
					<p className="mb-4 text-indigo-800">
						AI-Driven Development Lifecycle. The first profile developed and the
						reference implementation of HAIKU. AI-DLC adapts the framework for
						software engineering with deep integration into the development
						toolchain.
					</p>
					<div className="mb-4">
						<h4 className="mb-2 text-sm font-semibold text-indigo-800">
							Key Customizations
						</h4>
						<ul className="space-y-1 text-sm text-indigo-700">
							<li>Git-based version control integration</li>
							<li>Automated test suites as quality gates</li>
							<li>Pull request workflows for review</li>
							<li>CI/CD pipeline integration</li>
							<li>Deployment gates and rollback procedures</li>
							<li>
								Hats: Planner, Builder, Reviewer (plus specialized security,
								debug, design hats)
							</li>
						</ul>
					</div>
					<a
						href="https://ai-dlc.dev"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
					>
						Visit ai-dlc.dev
						<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
						</svg>
					</a>
				</div>
			</section>

			{/* SWARM */}
			<section className="mb-8">
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
					<div className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-500">
						Marketing & Sales
					</div>
					<h3 className="mb-3 text-2xl font-bold text-amber-900">SWARM</h3>
					<p className="mb-4 text-amber-800">
						Scope, Workstreams, Accountability, Results, Memory. SWARM validates
						HAIKU's universality by demonstrating the framework's applicability
						beyond software, in the domain of marketing and sales.
					</p>
					<div>
						<h4 className="mb-2 text-sm font-semibold text-amber-800">
							Key Customizations
						</h4>
						<ul className="space-y-1 text-sm text-amber-700">
							<li>Campaign planning and content workflows</li>
							<li>Brand review quality gates</li>
							<li>Performance analysis and optimization loops</li>
							<li>Channel strategy and media buy coordination</li>
							<li>Marketing-specific hats and review processes</li>
						</ul>
					</div>
				</div>
			</section>

			{/* Build Your Own */}
			<section className="mb-12">
				<div className="rounded-xl border border-stone-300 bg-stone-50 p-6">
					<div className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">
						Any Domain
					</div>
					<h3 className="mb-3 text-2xl font-bold">Build Your Own Profile</h3>
					<p className="mb-4 text-stone-600">
						Organizations can create custom profiles for any domain while
						inheriting HAIKU's lifecycle, principles, and collaboration model.
					</p>

					<h4 className="mb-3 text-sm font-semibold">
						To create a profile, define:
					</h4>
					<ol className="mb-4 space-y-3 text-sm text-stone-600">
						<li>
							<strong>1. Domain Hats</strong> --- What behavioral roles does your
							domain require? A research team might use Observer, Hypothesizer,
							Experimenter, Analyst. An operations team might use Planner,
							Operator, Monitor, Optimizer.
						</li>
						<li>
							<strong>2. Workflows</strong> --- What sequences of hats represent
							your common work patterns? Define default, adversarial, and
							specialized workflows.
						</li>
						<li>
							<strong>3. Quality Gates</strong> --- What must be true before work
							progresses? Define domain-specific verification checks.
						</li>
						<li>
							<strong>4. Artifact Types</strong> --- What documents and
							deliverables does your domain produce at each phase?
						</li>
						<li>
							<strong>5. Tooling Integrations</strong> --- What tools does your
							domain use? Connect them to the workflow.
						</li>
					</ol>

					<div className="rounded-lg border border-stone-200 bg-white p-4">
						<h4 className="mb-2 text-sm font-semibold">Example Domains</h4>
						<div className="grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
							<div>
								<strong className="text-stone-900">Operations</strong>
								<br />
								Process management, incident response, vendor coordination
							</div>
							<div>
								<strong className="text-stone-900">Research</strong>
								<br />
								Study design, data collection, analysis, publication
							</div>
							<div>
								<strong className="text-stone-900">Strategy</strong>
								<br />
								Goal setting, market analysis, execution planning
							</div>
							<div>
								<strong className="text-stone-900">Education</strong>
								<br />
								Curriculum design, content creation, assessment
							</div>
						</div>
					</div>
				</div>
			</section>

			<div className="text-center">
				<Link
					href="/getting-started"
					className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
				>
					Get Started with HAIKU
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</Link>
			</div>
		</div>
	)
}
