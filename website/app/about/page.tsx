import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "About - AI-DLC",
	description:
		"Learn about AI-DLC, a methodology for iterative AI-driven development with hat-based workflows.",
}

export default function AboutPage() {
	return (
		<div className="px-4 py-16">
			<div className="mx-auto max-w-3xl">
				<h1 className="mb-8 text-4xl font-bold tracking-tight sm:text-5xl">
					About AI-DLC
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
							HAIKU Method
						</a>{" "}
						(Human AI Knowledge Unification). It provides a framework for
						organizing work into focused units with clear phases and
						responsibilities.
					</p>

					<h2>The Problem</h2>
					<p>
						When working with AI assistants like Claude, it is easy to fall into
						unfocused patterns. Context switches happen mid-task, requirements
						drift, and quality suffers. Without structure, AI-assisted
						development can become chaotic and unproductive.
					</p>

					<h2>The Solution</h2>
					<p>
						AI-DLC introduces a hat-based approach to development. Each hat
						represents a distinct mindset and set of responsibilities. By
						explicitly switching between hats, you maintain focus and ensure
						each phase of development gets proper attention.
					</p>

					<h2>The Hat System</h2>

					<p>
						AI-DLC organizes work through hats — distinct mindsets that keep each phase of development focused. The default execution workflow uses three core hats, while specialized workflows add hats for security testing, design, TDD, and scientific debugging.
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
						Beyond the core three, AI-DLC includes specialized hats like Designer for UI/UX work, Red Team and Blue Team for adversarial security testing, and Observer, Hypothesizer, Experimenter, and Analyst for scientific debugging. See the <a href="/docs/hats/">full hat reference</a> for details.
					</p>

					<h2>Units of Work</h2>
					<p>
						Work is organized into units. Each unit is a focused piece of
						functionality that can be completed in one session. Units have clear
						success criteria and acceptance tests. Breaking work into units
						ensures progress is measurable and momentum is maintained.
					</p>

					<h2>Benefits</h2>
					<ul>
						<li>
							<strong>Clear focus</strong>: Know exactly what mode you are in at
							all times
						</li>
						<li>
							<strong>Quality built-in</strong>: Review is not an afterthought
						</li>
						<li>
							<strong>Measurable progress</strong>: Units provide natural
							checkpoints
						</li>
						<li>
							<strong>AI-native</strong>: Designed for AI-assisted workflows
						</li>
						<li>
							<strong>Reduced context switching</strong>: Stay in one mode until
							complete
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

					<h2>Part of the HAIKU Method</h2>
					<p>
						AI-DLC is the software development profile of{" "}
						<a
							href="https://haikumethod.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-600 hover:underline dark:text-blue-400"
						>
							HAIKU
						</a>{" "}
						(Human AI Knowledge Unification) — a methodology for structured
						collaboration between humans and AI across any domain. HAIKU provides
						the universal framework; AI-DLC applies it specifically to software
						development.
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
