import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "How It Works",
	description:
		"Technical deep-dive into H·AI·K·U mechanics — stage loops, hat transitions, DAG-based unit management, persistence adapters, and what happens when you run /haiku:new.",
}

const stageLoop = [
	{
		phase: "Plan",
		color: "bg-pink-50 border-pink-200 dark:bg-pink-950/20 dark:border-pink-800",
		textColor: "text-pink-600 dark:text-pink-400",
		description: "The planner hat reads the stage definition (STAGE.md), prior stage artifacts, and global knowledge. It decomposes the stage's work into units with verifiable completion criteria.",
		output: "Units with frontmatter: status, dependencies, criteria",
	},
	{
		phase: "Build",
		color: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
		textColor: "text-green-600 dark:text-green-400",
		description: "The builder hat picks the next ready unit from the DAG, executes a bolt (one cycle through the hat sequence), and produces artifacts. Multiple bolts may run per unit until criteria are met.",
		output: "Stage-specific deliverables (code, designs, copy, etc.)",
	},
	{
		phase: "Adversarial Review",
		color: "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800",
		textColor: "text-purple-600 dark:text-purple-400",
		description: "A fresh reviewer agent (never the same as the builder) evaluates all work against the completion criteria. This is adversarial by design — the reviewer's job is to find problems.",
		output: "Pass/fail verdict with specific issues if failed",
	},
	{
		phase: "Review Gate",
		color: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
		textColor: "text-amber-600 dark:text-amber-400",
		description: "The gate determines what happens next. Three modes: auto (advance immediately), ask (pause for user), external (block for team review). The studio's stage definition declares which mode.",
		output: "Advance to next stage, revise within stage, or go back",
	},
]

const persistenceAdapters = [
	{
		name: "Git",
		studio: "Software",
		operations: {
			workspace: "git worktree add",
			save: "git commit",
			version: "Commit history",
			review: "Pull request",
			deliver: "Merge PR",
		},
	},
	{
		name: "Filesystem",
		studio: "Ideation (default)",
		operations: {
			workspace: "mkdir",
			save: "Write files",
			version: "Timestamps",
			review: "Export + review",
			deliver: "Copy to output",
		},
	},
	{
		name: "Notion",
		studio: "Marketing",
		operations: {
			workspace: "Create page",
			save: "Update blocks",
			version: "Page versions",
			review: "Share + comments",
			deliver: "Publish page",
		},
	},
]

const dagExample = [
	{ id: "unit-01", name: "Data model schema", deps: "none", status: "done" },
	{ id: "unit-02", name: "API endpoints", deps: "unit-01", status: "done" },
	{ id: "unit-03", name: "Auth middleware", deps: "unit-01", status: "active" },
	{ id: "unit-04", name: "Frontend components", deps: "unit-02, unit-03", status: "blocked" },
	{ id: "unit-05", name: "Integration tests", deps: "unit-02, unit-03, unit-04", status: "blocked" },
]

export default function HowItWorksPage() {
	return (
		<div>
			{/* Hero */}
			<section className="px-4 py-16 sm:py-24">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
						How It Works
					</h1>
					<p className="text-lg text-stone-600 dark:text-stone-400">
						The technical mechanics of H·AI·K·U — stage loops, hat transitions,
						DAG-based unit management, persistence adapters, and concrete
						examples of what happens under the hood.
					</p>
				</div>
			</section>

			{/* The Core Loop */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							The Stage Loop
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Every stage — regardless of domain — follows the same four-phase
							internal loop. This is the fundamental unit of work in H·AI·K·U.
						</p>
					</div>

					{/* Visual flow */}
					<div className="mb-8 flex flex-wrap items-center justify-center gap-3">
						{stageLoop.map((step, i) => (
							<div key={step.phase} className="flex items-center gap-3">
								<div className={`rounded-xl border-2 px-5 py-3 text-center ${step.color}`}>
									<div className={`text-sm font-bold ${step.textColor}`}>
										{step.phase}
									</div>
								</div>
								{i < stageLoop.length - 1 && (
									<svg className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
									</svg>
								)}
							</div>
						))}
					</div>

					{/* Detailed breakdown */}
					<div className="grid gap-4 md:grid-cols-2">
						{stageLoop.map((step) => (
							<div
								key={step.phase}
								className={`rounded-xl border p-5 ${step.color}`}
							>
								<h3 className={`mb-2 text-lg font-semibold ${step.textColor}`}>
									{step.phase}
								</h3>
								<p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
									{step.description}
								</p>
								<div className="rounded-lg bg-white/60 p-3 dark:bg-stone-950/40">
									<span className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
										Output
									</span>
									<p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
										{step.output}
									</p>
								</div>
							</div>
						))}
					</div>

					{/* Loop-back mechanics */}
					<div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-3 font-semibold text-stone-900 dark:text-stone-100">
							Loop-back Mechanics
						</h3>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/20">
								<div className="mb-1 text-sm font-bold text-green-600 dark:text-green-400">
									Advance
								</div>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									All criteria met. Stage artifacts saved. Move to the next stage in the pipeline.
								</p>
							</div>
							<div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
								<div className="mb-1 text-sm font-bold text-amber-600 dark:text-amber-400">
									Revise
								</div>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									Review found issues. Loop back within this stage — builder fixes, reviewer re-evaluates. Same stage, new bolt.
								</p>
							</div>
							<div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/20">
								<div className="mb-1 text-sm font-bold text-rose-600 dark:text-rose-400">
									Go Back
								</div>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									Fundamental issue discovered. Return to a previous stage. Rare but supported — e.g., design stage reveals inception was incomplete.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Hats Within Stages */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Hats Within Stages
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Each stage defines its own hat sequence. Hats are focused roles
							that constrain what the agent can do. A fresh agent instance is
							spun up for each hat — no context bleed between roles.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						{/* Software studio example */}
						<div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 dark:border-indigo-800 dark:bg-indigo-950/20">
							<h3 className="mb-1 text-lg font-semibold text-indigo-700 dark:text-indigo-300">
								Software Studio — Development Stage
							</h3>
							<p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
								persistence: git | review: ask
							</p>
							<div className="space-y-2">
								{["planner", "builder", "reviewer"].map((hat, i) => (
									<div key={hat} className="flex items-center gap-3">
										<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
											{i + 1}
										</span>
										<span className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
											{hat}
										</span>
										{i < 2 && (
											<svg className="h-3 w-3 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
											</svg>
										)}
									</div>
								))}
							</div>
							<p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
								Each hat reads the same STAGE.md definition but has different constraints.
								The planner cannot write code. The builder cannot modify criteria.
								The reviewer cannot be the same agent that built.
							</p>
						</div>

						{/* Security stage example */}
						<div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 dark:border-rose-800 dark:bg-rose-950/20">
							<h3 className="mb-1 text-lg font-semibold text-rose-700 dark:text-rose-300">
								Software Studio — Security Stage
							</h3>
							<p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
								persistence: git | review: external
							</p>
							<div className="space-y-2">
								{["threat-modeler", "red-team", "blue-team", "reviewer"].map((hat, i) => (
									<div key={hat} className="flex items-center gap-3">
										<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-900 dark:text-rose-300">
											{i + 1}
										</span>
										<span className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
											{hat}
										</span>
										{i < 3 && (
											<svg className="h-3 w-3 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
											</svg>
										)}
									</div>
								))}
							</div>
							<p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
								Different stages have different hat sequences. Security uses
								red-team/blue-team adversarial patterns. The review gate is
								&ldquo;external&rdquo; — requires human sign-off before advancing.
							</p>
						</div>
					</div>

					{/* Hat mechanics */}
					<div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-4 font-semibold text-stone-900 dark:text-stone-100">
							Why Fresh Agents?
						</h3>
						<div className="grid gap-4 md:grid-cols-3">
							<div>
								<h4 className="mb-1 text-sm font-semibold text-stone-900 dark:text-stone-100">No context drift</h4>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									Each hat starts with a clean context window loaded only with
									what it needs — stage definition, prior artifacts, knowledge pool.
								</p>
							</div>
							<div>
								<h4 className="mb-1 text-sm font-semibold text-stone-900 dark:text-stone-100">Focused constraints</h4>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									A hat definition specifies what the agent MUST do, MUST NOT do,
									and what quality gates it must pass before finishing.
								</p>
							</div>
							<div>
								<h4 className="mb-1 text-sm font-semibold text-stone-900 dark:text-stone-100">Adversarial separation</h4>
								<p className="text-sm text-stone-600 dark:text-stone-400">
									The reviewer never shares context with the builder. It evaluates
									work from scratch, catching issues the builder is blind to.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* DAG-based Unit Management */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							DAG-Based Unit Management
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Units are organized as a directed acyclic graph (DAG). Dependencies
							between units determine execution order. The DAG resolver picks the
							next &ldquo;ready&rdquo; unit — one whose dependencies are all complete.
						</p>
					</div>

					{/* DAG visualization */}
					<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
							Example: User Authentication Intent
						</h3>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-stone-200 dark:border-stone-700">
										<th className="pb-2 text-left font-semibold text-stone-900 dark:text-stone-100">Unit</th>
										<th className="pb-2 text-left font-semibold text-stone-900 dark:text-stone-100">Name</th>
										<th className="pb-2 text-left font-semibold text-stone-900 dark:text-stone-100">Dependencies</th>
										<th className="pb-2 text-left font-semibold text-stone-900 dark:text-stone-100">Status</th>
									</tr>
								</thead>
								<tbody>
									{dagExample.map((unit) => (
										<tr key={unit.id} className="border-b border-stone-100 dark:border-stone-800">
											<td className="py-2 font-mono text-xs text-stone-500">{unit.id}</td>
											<td className="py-2 text-stone-700 dark:text-stone-300">{unit.name}</td>
											<td className="py-2 font-mono text-xs text-stone-400">{unit.deps}</td>
											<td className="py-2">
												<span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
													unit.status === "done"
														? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
														: unit.status === "active"
															? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
															: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
												}`}>
													{unit.status}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<div className="mt-4 rounded-lg bg-stone-50 p-4 text-sm dark:bg-stone-900">
							<p className="text-stone-600 dark:text-stone-400">
								The DAG resolver (<code className="text-amber-600 dark:text-amber-400">dag.sh</code>) evaluates
								unit frontmatter to determine execution order. Unit 03 (auth middleware) is
								currently active because its sole dependency (unit 01) is complete.
								Unit 04 is blocked — it needs both unit 02 and unit 03 to finish first.
							</p>
						</div>
					</div>

					{/* Unit structure */}
					<div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-4 font-semibold text-stone-900 dark:text-stone-100">
							Unit File Structure
						</h3>
						<div className="overflow-x-auto rounded-lg bg-stone-900 p-4 font-mono text-xs leading-relaxed text-stone-100 dark:bg-stone-950">
							<pre>{`---
status: ready          # ready | active | done | blocked
depends_on:            # DAG edges
  - unit-01-data-model
criteria:              # Machine-verifiable
  - All API endpoints return correct status codes
  - Response schemas match OpenAPI spec
  - Rate limiting enforced on auth endpoints
  - Integration tests pass with >90% coverage
---

# Unit 02: API Endpoints

## Description
Implement REST API endpoints for user authentication...

## Approach
1. Define route handlers for /auth/*
2. Implement request validation
3. Add rate limiting middleware
4. Write integration tests`}</pre>
						</div>
						<p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
							The frontmatter is machine-readable. The DAG resolver reads <code>status</code> and{" "}
							<code>depends_on</code> to determine order. The reviewer reads <code>criteria</code> to
							evaluate completion. The body is human context for the builder.
						</p>
					</div>
				</div>
			</section>

			{/* Persistence Adapters */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Persistence Adapters
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							The studio declares how work is saved. Stages and the core loop
							don&apos;t care — they call a persistence interface. The adapter
							handles the details.
						</p>
					</div>

					<div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
									<th className="px-4 py-3 text-left font-semibold text-stone-900 dark:text-stone-100">Operation</th>
									{persistenceAdapters.map((adapter) => (
										<th key={adapter.name} className="px-4 py-3 text-left">
											<div className="font-semibold text-stone-900 dark:text-stone-100">{adapter.name}</div>
											<div className="text-xs font-normal text-stone-400">{adapter.studio}</div>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{(["workspace", "save", "version", "review", "deliver"] as const).map((op) => (
									<tr key={op} className="border-b border-stone-100 dark:border-stone-800">
										<td className="px-4 py-3 font-medium text-stone-700 dark:text-stone-300 capitalize">{op === "workspace" ? "Create workspace" : op}</td>
										{persistenceAdapters.map((adapter) => (
											<td key={adapter.name} className="px-4 py-3 font-mono text-xs text-stone-500 dark:text-stone-400">
												{adapter.operations[op]}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-800 dark:bg-teal-950/20">
						<p className="text-sm text-teal-800 dark:text-teal-200">
							<strong>This is what makes H·AI·K·U domain-agnostic.</strong> The core loop
							(plan, build, review) is universal. The persistence layer is the only
							thing that changes between domains. Git is just one adapter.
						</p>
					</div>
				</div>
			</section>

			{/* Knowledge Architecture */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Knowledge Architecture
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Every stage reads from two layers of accumulated context.
							This ensures no information is lost between stages or sessions.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/30 p-6 dark:border-cyan-800 dark:bg-cyan-950/10">
							<h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
								Global Knowledge Pool
							</h3>
							<p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
								Project-level. Persists across all intents.
							</p>
							<div className="flex flex-wrap gap-2">
								{["design.md", "architecture.md", "product.md", "conventions.md", "domain.md"].map((file) => (
									<span key={file} className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 font-mono text-xs text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
										{file}
									</span>
								))}
							</div>
						</div>

						<div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/30 p-6 dark:border-amber-800 dark:bg-amber-950/10">
							<h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
								Intent Artifacts
							</h3>
							<p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
								Per-intent. Accumulated as stages complete.
							</p>
							<div className="space-y-2">
								{[
									{ artifact: "intent + discovery", source: "inception" },
									{ artifact: "wireframes + tokens", source: "design" },
									{ artifact: "specs + criteria", source: "product" },
									{ artifact: "code + tests", source: "development" },
								].map((item) => (
									<div key={item.artifact} className="flex items-center gap-2">
										<span className="rounded-lg border border-amber-200 bg-white px-3 py-1 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
											{item.artifact}
										</span>
										<span className="text-xs text-stone-400">from {item.source}</span>
									</div>
								))}
							</div>
						</div>
					</div>

					<p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
						Every stage reads both pools. The development stage has full context
						from inception, design, and product. No information loss.
					</p>
				</div>
			</section>

			{/* Concrete Example: /haiku:new */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							What Happens When You Run <code className="text-teal-600 dark:text-teal-400">/haiku:new</code>
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							A concrete walkthrough of the commands and what they trigger internally.
						</p>
					</div>

					<div className="space-y-6">
						{/* Step 1 */}
						<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
							<div className="mb-3 flex items-center gap-3">
								<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">1</span>
								<div>
									<code className="text-sm font-bold text-teal-600 dark:text-teal-400">/haiku:new</code>
									<span className="ml-2 text-sm text-stone-500">Create a new intent</span>
								</div>
							</div>
							<div className="rounded-lg bg-stone-50 p-4 font-mono text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
								<div>1. Prompts for intent description</div>
								<div>2. Reads project settings (<code>.haiku/settings.yml</code>)</div>
								<div>3. Selects studio (default: ideation, or configured)</div>
								<div>4. Creates intent slug from description</div>
								<div>5. Initializes workspace via persistence adapter</div>
								<div className="mt-2 text-stone-400">   git adapter: creates worktree at <code>haiku/&#123;slug&#125;/main</code></div>
								<div className="text-stone-400">   filesystem adapter: creates directory at <code>.haiku/&#123;slug&#125;/</code></div>
								<div className="mt-2">6. Writes <code>intent.md</code> with frontmatter and description</div>
								<div>7. Enters the first stage of the selected studio</div>
							</div>
						</div>

						{/* Step 2 */}
						<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
							<div className="mb-3 flex items-center gap-3">
								<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">2</span>
								<div>
									<code className="text-sm font-bold text-indigo-600 dark:text-indigo-400">/haiku:run</code>
									<span className="ml-2 text-sm text-stone-500">Run the stage pipeline (continuous mode)</span>
								</div>
							</div>
							<div className="rounded-lg bg-stone-50 p-4 font-mono text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
								<div>1. Reads studio definition to get stage order</div>
								<div>2. For each stage in order:</div>
								<div className="ml-4">a. Loads STAGE.md — hats, review mode, requires/produces</div>
								<div className="ml-4">b. Loads knowledge: global pool + prior stage artifacts</div>
								<div className="ml-4">c. Runs the stage loop: Plan → Build → Review → Gate</div>
								<div className="ml-4">d. If gate = <span className="text-green-500">advance</span>: saves artifacts, moves to next stage</div>
								<div className="ml-4">e. If gate = <span className="text-amber-500">revise</span>: loops back within stage</div>
								<div className="ml-4">f. If gate = <span className="text-rose-500">go back</span>: returns to previous stage</div>
								<div className="mt-2">3. All stages complete → triggers delivery via persistence adapter</div>
								<div className="text-stone-400">   git adapter: opens pull request</div>
								<div className="text-stone-400">   filesystem adapter: copies to output directory</div>
							</div>
						</div>

						{/* Step 3 */}
						<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
							<div className="mb-3 flex items-center gap-3">
								<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300">3</span>
								<div>
									<code className="text-sm font-bold text-amber-600 dark:text-amber-400">/haiku:execute</code>
									<span className="ml-2 text-sm text-stone-500">Drive unit implementations within a stage</span>
								</div>
							</div>
							<div className="rounded-lg bg-stone-50 p-4 font-mono text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
								<div>1. Reads current stage state from <code>iteration.json</code></div>
								<div>2. Runs DAG resolver to find next ready unit</div>
								<div>3. For the target unit:</div>
								<div className="ml-4">a. Spawns planner hat → reads unit, plans approach</div>
								<div className="ml-4">b. Spawns builder hat → executes plan, produces artifacts</div>
								<div className="ml-4">c. Spawns reviewer hat → evaluates against criteria</div>
								<div className="ml-4">d. If criteria met: mark unit <span className="text-green-500">done</span>, increment bolt count</div>
								<div className="ml-4">e. If criteria not met: loop back to builder (new bolt)</div>
								<div className="mt-2">4. When all units done → stage review gate triggers</div>
								<div>5. Persistence adapter saves after each bolt</div>
								<div className="text-stone-400">   git adapter: commits with structured message</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* File Tree */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Full Hierarchy
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							How the pieces nest together — from studio down to bolt.
						</p>
					</div>

					<div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<div className="font-mono text-sm leading-loose">
							<div>
								<span className="font-bold text-purple-600 dark:text-purple-400">Studio</span>
								<span className="text-stone-400"> — named lifecycle for any domain (software, marketing, hardware, ...)</span>
							</div>
							<div className="ml-4">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="font-bold text-amber-600 dark:text-amber-400">Persistence</span>
								<span className="text-stone-400"> — how work is saved (git, notion, filesystem, ...)</span>
							</div>
							<div className="ml-4">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="font-bold text-pink-600 dark:text-pink-400">Stage</span>
								<span className="text-stone-400"> — lifecycle phase: plan, build, review</span>
							</div>
							<div className="ml-8">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="text-cyan-600 dark:text-cyan-400">STAGE.md</span>
								<span className="text-stone-400"> — hats, guidance, review mode, requires/produces</span>
							</div>
							<div className="ml-8">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="text-amber-500">Review Gate</span>
								<span className="text-stone-400"> — auto | ask | external</span>
							</div>
							<div className="ml-8">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="font-bold text-amber-600 dark:text-amber-400">Unit</span>
								<span className="text-stone-400"> — discrete piece of work with criteria</span>
							</div>
							<div className="ml-12">
								<span className="text-stone-300 dark:text-stone-600">|-- </span>
								<span className="font-bold text-green-600 dark:text-green-400">Bolt</span>
								<span className="text-stone-400"> — one cycle through the stage&apos;s hat sequence</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Modes */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Continuous vs Discrete
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Two execution styles. Same pipeline, same quality, different levels
							of human involvement.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-xl border-2 border-green-200 bg-green-50/30 p-6 dark:border-green-800 dark:bg-green-950/10">
							<h3 className="mb-2 text-lg font-semibold text-green-700 dark:text-green-300">
								Continuous (default)
							</h3>
							<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
								Autopilot drives stages. User reviews at gates.
							</p>
							<div className="space-y-1 font-mono text-xs leading-relaxed">
								<div><span className="text-blue-500">inception</span> <span className="text-stone-400">runs</span></div>
								<div className="text-amber-500 ml-2">-- ask gate --</div>
								<div><span className="text-pink-500">design</span> <span className="text-stone-400">runs</span></div>
								<div className="text-amber-500 ml-2">-- ask gate --</div>
								<div><span className="text-orange-500">product</span> <span className="text-stone-400">runs</span></div>
								<div className="text-amber-500 ml-2">-- external gate -- <span className="text-stone-400">do we build this?</span></div>
								<div><span className="text-green-500">development</span> <span className="text-stone-400">runs</span></div>
								<div className="text-amber-500 ml-2">-- ask gate --</div>
								<div><span className="text-cyan-500">operations</span> <span className="text-stone-400">runs</span></div>
								<div className="text-stone-400 ml-2">-- auto gate --</div>
								<div><span className="text-rose-500">security</span> <span className="text-stone-400">runs</span></div>
								<div className="text-amber-500 ml-2">-- external gate -- <span className="text-stone-400">team signs off</span></div>
							</div>
						</div>

						<div className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-6 dark:border-purple-800 dark:bg-purple-950/10">
							<h3 className="mb-2 text-lg font-semibold text-purple-700 dark:text-purple-300">
								Discrete
							</h3>
							<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
								User invokes each stage explicitly. Full control.
							</p>
							<div className="space-y-1 font-mono text-xs leading-relaxed">
								<div><span className="text-stone-400">user:</span> <span className="text-blue-500">/haiku:stage inception</span></div>
								<div className="text-amber-500 ml-2">-- review --</div>
								<div><span className="text-stone-400">user:</span> <span className="text-pink-500">/haiku:stage design</span></div>
								<div className="text-amber-500 ml-2">-- review --</div>
								<div><span className="text-stone-400">user:</span> <span className="text-orange-500">/haiku:stage product</span></div>
								<div className="text-amber-500 ml-2">-- review --</div>
								<div><span className="text-stone-400">user:</span> <span className="text-green-500">/haiku:stage development</span></div>
								<div className="text-amber-500 ml-2">-- review --</div>
								<div><span className="text-stone-400">...</span> <span className="text-stone-400">each stage user-invoked</span></div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="border-t border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mb-4 text-2xl font-bold">
						Ready to Try It?
					</h2>
					<p className="mb-6 text-stone-600 dark:text-stone-400">
						Install the Claude Code plugin and run your first intent.
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Link
							href="/docs/installation/"
							className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition hover:bg-teal-700"
						>
							Install H·AI·K·U
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
						</Link>
						<Link
							href="/paper/"
							className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-6 py-3 font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
						>
							Read the paper
						</Link>
					</div>
				</div>
			</section>
		</div>
	)
}
