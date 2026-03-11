import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "About - AI-DLC",
	description:
		"AI-DLC is a methodology born from the evolution of software development — from machine code to AI-driven autonomous workflows.",
}

export default function AboutPage() {
	return (
		<div className="px-4 py-16">
			<div className="mx-auto max-w-3xl">
				<h1 className="mb-8 text-4xl font-bold tracking-tight sm:text-5xl">
					Why AI-DLC?
				</h1>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					<p className="lead text-xl text-gray-600 dark:text-gray-400">
						AI-DLC is how software teams use the{" "}
						<a
							href="https://haikumethod.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-600 hover:underline dark:text-blue-400"
						>
							H•AI•K•U Method
						</a>{" "}
						(Human AI Knowledge Unification). It provides a framework for
						organizing work into focused units with clear phases and
						responsibilities.
					</p>

					<h2>The Evolution of Software Development</h2>
					<p>
						The history of software engineering is a continuous quest to let
						developers focus on solving complex problems by abstracting away
						lower-level work. From machine code to high-level languages, from
						hand-rolled libraries to managed cloud services — each step moved
						humans further from implementation details and closer to problem
						expression.
					</p>
					<p>
						Large Language Models marked a revolutionary shift, introducing
						conversational natural language for code generation, bug detection,
						and test creation. This was the <strong>AI-Assisted era</strong> —
						AI enhancing specific tasks while humans retained full control.
					</p>
					<p>
						We have now entered the <strong>AI-Autonomous era</strong>. AI can
						maintain context across multi-hour workflows, iterate toward success
						criteria autonomously, and sustain the kind of reasoning that used
						to require entire teams. Iteration costs are approaching zero — you
						try something, it fails, you adjust, you try again, all in seconds
						rather than weeks.
					</p>

					<h2>Why a New Methodology</h2>
					<p>
						Traditional methods — Waterfall, Agile, Scrum — were designed for
						human-driven processes with long iteration cycles. Their sequential
						phases, handoff documentation, and approval gates made economic
						sense when changing requirements meant weeks of rework. But with AI,
						those phases are not just being augmented — they are collapsing into
						continuous flow.
					</p>
					<p>
						Retrofitting AI into existing methods constrains its potential and
						reinforces outdated inefficiencies. AI-DLC is built from first
						principles for how development actually works now.
					</p>

					<h2>The Hat System</h2>
					<p>
						AI-DLC organizes work through hats — distinct mindsets that keep
						each phase of development focused. The default execution workflow
						uses three core hats, while specialized workflows add hats for
						security testing, design, TDD, and scientific debugging.
					</p>

					<h3>Planner</h3>
					<p>
						The Planner designs the implementation approach. This includes
						breaking work into steps, identifying dependencies, considering edge
						cases, and creating actionable plans. The output is a clear roadmap
						for the Builder to follow.
					</p>

					<h3>Builder</h3>
					<p>
						The Builder executes the plan. This is where code gets written,
						features get implemented, and tests get created. The Builder stays
						focused on the task at hand, following the plan without getting
						distracted by scope creep or tangential concerns.
					</p>

					<h3>Reviewer</h3>
					<p>
						The Reviewer validates quality and completeness. This includes
						checking that tests pass, requirements are met, edge cases are
						handled, and code quality meets standards. The Reviewer ensures work
						is ready for production.
					</p>

					<p>
						Beyond the core three, AI-DLC includes specialized hats like
						Designer for UI/UX work, Red Team and Blue Team for adversarial
						security testing, and Observer, Hypothesizer, Experimenter, and
						Analyst for scientific debugging. See the{" "}
						<a href="/docs/hats/">full hat reference</a> for details.
					</p>

					<h2>Units of Work</h2>
					<p>
						Work is organized into units. Each unit is a focused piece of
						functionality that can be completed in one session. Units have clear
						success criteria and acceptance tests. Breaking work into units
						ensures progress is measurable and momentum is maintained.
					</p>

					<h2>What This Enables</h2>
					<ul>
						<li>
							<strong>Continuous flow</strong>: Phases collapse into a natural
							cycle rather than sequential gates
						</li>
						<li>
							<strong>Quality through backpressure</strong>: Automated
							enforcement guides AI toward quality, not manual review
						</li>
						<li>
							<strong>Human-on-the-loop</strong>: Define success criteria and
							guardrails, then let AI iterate toward convergence
						</li>
						<li>
							<strong>Near-zero iteration cost</strong>: Try, fail, adjust, and
							retry in seconds
						</li>
						<li>
							<strong>AI-native workflows</strong>: Built for how AI actually
							works, not retrofitted from human processes
						</li>
					</ul>

					<h2>Getting Started</h2>
					<p>
						AI-DLC is distributed as a Claude Code plugin. Install it in your
						project and start using the hat-based commands to structure your
						development workflow.
					</p>

					<div className="not-prose my-8 rounded-lg bg-gray-100 p-4 font-mono text-sm dark:bg-gray-800">
						<div><code>/plugin marketplace add thebushidocollective/ai-dlc</code></div>
						<div><code>/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project</code></div>
					</div>

					<h2>Part of the H•AI•K•U Method</h2>
					<p>
						AI-DLC is the software development profile of{" "}
						<a
							href="https://haikumethod.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-600 hover:underline dark:text-blue-400"
						>
							H•AI•K•U
						</a>{" "}
						(Human AI Knowledge Unification) — a methodology for structured
						collaboration between humans and AI across any domain. H•AI•K•U provides
						the universal framework; AI-DLC applies it specifically to software
						development.
					</p>

					<h2>Go Deeper</h2>
					<p>
						For the full methodology — including production lessons, the Ralph
						Wiggum autonomous loop pattern, and the research behind AI-DLC —{" "}
						<a
							href="/paper/"
							className="text-blue-600 hover:underline dark:text-blue-400"
						>
							read the paper
						</a>
						.
					</p>

					<h2>Part of Han</h2>
					<p>
						AI-DLC is part of the{" "}
						<a
							href="https://han.guru"
							className="text-blue-600 hover:underline dark:text-blue-400"
						>
							Han plugin ecosystem
						</a>{" "}
						for Claude Code. Han provides a curated marketplace of plugins built
						on Bushido principles: quality, honor, and mastery.
					</p>
				</div>
			</div>
		</div>
	)
}
