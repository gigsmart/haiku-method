import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Start Here - AI-DLC",
	description:
		"Everything you need to understand AI-DLC and start using it in your projects.",
}

export default function StartHerePage() {
	return (
		<div className="px-4 py-12">
			<div className="mx-auto max-w-3xl">
				<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
					Start Here
				</h1>
				<p className="mb-12 text-lg text-gray-600 dark:text-gray-400">
					Your guided path to understanding and implementing AI-DLC, the
					software development profile of the{" "}
					<a
						href="https://haikumethod.ai"
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 hover:underline dark:text-blue-400"
					>
						HAIKU Method
					</a>
					.
				</p>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					{/* The Shift */}
					<h2>The Short Version</h2>
					<p>
						AI can now reason autonomously for hours, iterate in seconds, and
						write production code at scale. Traditional development methods
						weren't designed for this. AI-DLC is.
					</p>
					<p>
						It's a methodology built from first principles for AI-driven
						development. You define <strong>what</strong> you want to build and{" "}
						<strong>how you'll know it's done</strong>. AI handles the rest —
						planning, building, reviewing — iterating until your criteria are
						met.
					</p>
					<p>The entire workflow is two commands:</p>
				</div>

				{/* Command Cards — the first thing you learn */}
				<div className="my-8 space-y-4">
					<div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950/50">
						<div className="mb-2 font-mono text-lg font-bold text-blue-700 dark:text-blue-300">
							/elaborate
						</div>
						<p className="text-gray-600 dark:text-gray-400">
							Define what you're building. The AI guides you through
							requirements, success criteria, and (for complex work) how to
							decompose it into units. This creates your{" "}
							<strong>intent</strong> — the what and the definition of done.
						</p>
					</div>
					<div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950/50">
						<div className="mb-2 font-mono text-lg font-bold text-green-700 dark:text-green-300">
							/execute
						</div>
						<p className="text-gray-600 dark:text-gray-400">
							Start building. The AI creates a branch, plans the approach,
							writes the code, reviews its work, and iterates until all your
							criteria are satisfied. You can watch, intervene, or let it run.
						</p>
					</div>
				</div>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					{/* Example — show it immediately */}
					<h2>What It Looks Like</h2>
				</div>

				<div className="my-6 overflow-hidden rounded-lg border border-gray-200 bg-white font-mono text-sm dark:border-gray-800 dark:bg-gray-900">
					<div className="space-y-3 p-5">
						<div>
							<span className="text-blue-600 dark:text-blue-400">
								User:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								/elaborate
							</span>
						</div>
						<div>
							<span className="text-green-600 dark:text-green-400">
								AI:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								What do you want to build?
							</span>
						</div>
						<div>
							<span className="text-blue-600 dark:text-blue-400">
								User:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								Add a dark mode toggle to the settings page
							</span>
						</div>
						<div>
							<span className="text-green-600 dark:text-green-400">
								AI:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								[Guides through requirements and criteria]
							</span>
						</div>
						<div>
							<span className="text-green-600 dark:text-green-400">
								AI:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								Elaboration complete! Run /execute to start.
							</span>
						</div>
						<div className="border-t border-gray-200 pt-3 dark:border-gray-700">
							<span className="text-blue-600 dark:text-blue-400">
								User:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								/execute
							</span>
						</div>
						<div>
							<span className="text-green-600 dark:text-green-400">
								AI:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								[Plans → Builds → Reviews → Iterates]
							</span>
						</div>
						<div>
							<span className="text-green-600 dark:text-green-400">
								AI:{" "}
							</span>
							<span className="text-gray-600 dark:text-gray-400">
								All criteria satisfied. Ready for PR.
							</span>
						</div>
					</div>
				</div>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					<p>
						If a session runs long, the AI will suggest clearing context. Your
						progress is saved — just run{" "}
						<code>/execute</code> again to pick up where you left off.
					</p>

					{/* How It Works Under the Hood */}
					<h2>How It Works</h2>
					<p>
						Under the hood, <code>/elaborate</code> captures your{" "}
						<strong>intent</strong> — what you want to build, with specific
						completion criteria. Complex intents get broken into{" "}
						<strong>units</strong> — focused pieces of work that can each be
						completed in one session.
					</p>
					<p>
						When you run <code>/execute</code>, the AI cycles through three
						hats:
					</p>
				</div>

				{/* Hat Cards */}
				<div className="my-8 grid gap-4 sm:grid-cols-3">
					<div className="rounded-xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-900 dark:bg-purple-950/50">
						<h4 className="mb-1 text-lg font-semibold text-purple-700 dark:text-purple-300">
							Planner
						</h4>
						<p className="text-sm text-gray-600 dark:text-gray-400">
							Designs the approach — steps, dependencies, edge cases.
						</p>
					</div>
					<div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/50">
						<h4 className="mb-1 text-lg font-semibold text-green-700 dark:text-green-300">
							Builder
						</h4>
						<p className="text-sm text-gray-600 dark:text-gray-400">
							Executes the plan — writes code, implements features, creates
							tests.
						</p>
					</div>
					<div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/50">
						<h4 className="mb-1 text-lg font-semibold text-amber-700 dark:text-amber-300">
							Reviewer
						</h4>
						<p className="text-sm text-gray-600 dark:text-gray-400">
							Validates quality — tests pass, criteria met, code is
							production-ready.
						</p>
					</div>
				</div>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					<p>
						Specialized workflows add hats for{" "}
						<Link href="/docs/hats/">
							security testing, design, TDD, and debugging
						</Link>
						.
					</p>
					<p>
						Quality is enforced through <strong>backpressure</strong>, not
						prescription. Instead of telling AI how to build, you define
						constraints — tests must pass, types must check, linting must be
						clean. AI iterates until all gates clear.
					</p>

					{/* Install */}
					<h2>Install It</h2>
					<p>AI-DLC is a Claude Code plugin. Two commands to install:</p>
				</div>

				<div className="my-6 rounded-lg bg-gray-900 p-4 font-mono text-sm text-white dark:bg-gray-800">
					<div>
						<code>/plugin marketplace add thebushidocollective/ai-dlc</code>
					</div>
					<div>
						<code>
							/plugin install ai-dlc@thebushidocollective-ai-dlc --scope
							project
						</code>
					</div>
				</div>

				<div className="my-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
					<p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
						Alternative: Download Plugin
					</p>
					<p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
						Download the plugin zip, extract it into your project, and point Claude
						Code to it:
					</p>
					<div className="space-y-3">
						<a
							href="/ai-dlc-plugin.zip"
							download
							className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
						>
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
							Download Plugin (.zip)
						</a>
						<div className="rounded-lg bg-gray-900 p-4 font-mono text-sm text-white dark:bg-gray-800">
							<div className="text-gray-400"># Extract and add to your project</div>
							<div>unzip ai-dlc-plugin.zip -d .claude</div>
						</div>
					</div>
				</div>

				<div className="prose prose-gray dark:prose-invert max-w-none">
					<p>
						Need Han CLI for state management?{" "}
						<Link href="/docs/installation/">
							See the full installation guide
						</Link>
						.
					</p>

					{/* Go Deeper */}
					<h2>Go Deeper</h2>
					<p>
						That's enough to start. When you're ready to go further:
					</p>
					<ul>
						<li>
							<Link href="/docs/concepts/">Core Concepts</Link> — Intents,
							units, operating modes, and state management
						</li>
						<li>
							<Link href="/docs/hats/">The Hat System</Link> — All hats
							including specialized workflows
						</li>
						<li>
							<Link href="/docs/example-feature/">Feature Example</Link> —
							End-to-end walkthrough of building a feature
						</li>
						<li>
							<Link href="/paper/">The Paper</Link> — Full methodology with
							research and production lessons
						</li>
						<li>
							<Link href="/big-picture/">Big Picture Diagram</Link> —
							Interactive overview of how everything connects
						</li>
					</ul>
				</div>
			</div>
		</div>
	)
}
