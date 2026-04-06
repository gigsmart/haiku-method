import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "How It Works",
	description:
		"Technical deep-dive into H·AI·K·U mechanics — stage loops, hat transitions, DAG-based unit management, persistence adapters, and what happens when you run /haiku:new.",
}

const stageLoop = [
	{
		phase: "Decompose",
		color: "bg-pink-50 border-pink-200 dark:bg-pink-950/20 dark:border-pink-800",
		textColor: "text-pink-600 dark:text-pink-400",
		description: "The planner hat reads the stage definition (STAGE.md), prior stage artifacts, and global knowledge. It decomposes the stage's work into units with verifiable completion criteria.",
		output: "Units with frontmatter: status, dependencies, criteria",
	},
	{
		phase: "Execute",
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
		phase: "Persist",
		color: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/20 dark:border-cyan-800",
		textColor: "text-cyan-600 dark:text-cyan-400",
		description: "Stage artifacts are saved via the persistence adapter (git commit, filesystem write, etc.). State is checkpointed so progress survives session boundaries and context resets.",
		output: "Committed artifacts, updated state.json, unit frontmatter timestamps",
	},
	{
		phase: "Gate",
		color: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
		textColor: "text-amber-600 dark:text-amber-400",
		description: "The gate determines what happens next. Four modes: auto (advance immediately), ask (pause for user), await (wait for async signal), external (block for team review). The studio's stage definition declares which mode.",
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

			{/* Elaboration: The Human-AI Handshake */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Elaboration: The Human-AI Handshake
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Before any autonomous work begins, human and AI collaborate to define
							what gets built, why, and how success is measured. This is the most
							important phase — it determines everything that follows.
						</p>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						{/* Human leads */}
						<div className="rounded-xl border-2 border-teal-200 bg-teal-50/30 p-6 dark:border-teal-800 dark:bg-teal-950/10">
							<h3 className="mb-3 text-lg font-semibold text-teal-700 dark:text-teal-300">
								What the Human Provides
							</h3>
							<div className="space-y-3">
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-teal-700 dark:text-teal-300">Intent</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Describes the problem and desired outcome in natural language. No templates required — just explain what you want to accomplish.
									</p>
								</div>
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-teal-700 dark:text-teal-300">Decisions</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Studio selection, mode choice (continuous/discrete), and review gate approvals. The human controls the &ldquo;what&rdquo; and &ldquo;when&rdquo; — the AI proposes, the human decides.
									</p>
								</div>
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-teal-700 dark:text-teal-300">Criteria validation</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Reviews the AI&apos;s proposed completion criteria and unit decomposition. Adjusts scope, adds constraints, removes unnecessary work.
									</p>
								</div>
							</div>
						</div>

						{/* AI leads */}
						<div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-6 dark:border-indigo-800 dark:bg-indigo-950/10">
							<h3 className="mb-3 text-lg font-semibold text-indigo-700 dark:text-indigo-300">
								What the AI Produces
							</h3>
							<div className="space-y-3">
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Discovery</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Explores the codebase, reads documentation, identifies patterns and constraints. Produces a discovery doc that grounds all subsequent work.
									</p>
								</div>
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Decomposition</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Breaks the intent into units with dependencies (a DAG). Each unit has specific, verifiable completion criteria — not vague descriptions, but checkboxes the reviewer can verify.
									</p>
								</div>
								<div className="rounded-lg bg-white/70 p-3 dark:bg-stone-950/40">
									<div className="mb-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Architecture</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Proposes the technical approach, identifies risks, and maps units to stages. The human reviews before any building starts.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* The handoff */}
					<div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-4 font-semibold text-stone-900 dark:text-stone-100">
							The Handoff: When Does AI Take Over?
						</h3>
						<div className="grid gap-6 md:grid-cols-2">
							<div className="rounded-lg border-2 border-green-200 bg-green-50/30 p-4 dark:border-green-800 dark:bg-green-950/10">
								<h4 className="mb-2 text-sm font-bold text-green-700 dark:text-green-300">Continuous Mode</h4>
								<div className="space-y-2 text-xs text-stone-600 dark:text-stone-400">
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Elaboration:</strong> Human and AI collaborate interactively — AI proposes, human refines, until criteria are approved.
									</p>
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Execution:</strong> AI drives autonomously through the stage pipeline. Each stage runs its own hat sequence (defined in STAGE.md), advancing to the next stage when the review gate passes. Gates set to <code className="text-green-600 dark:text-green-400">auto</code> advance immediately.
									</p>
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Human re-enters at:</strong> Review gates set to <code className="text-amber-600 dark:text-amber-400">ask</code> (user approves), <code className="text-cyan-600 dark:text-cyan-400">await</code> (waits for async signal), or <code className="text-rose-600 dark:text-rose-400">external</code> (team reviews). Between gates, the AI runs unsupervised.
									</p>
								</div>
							</div>
							<div className="rounded-lg border-2 border-purple-200 bg-purple-50/30 p-4 dark:border-purple-800 dark:bg-purple-950/10">
								<h4 className="mb-2 text-sm font-bold text-purple-700 dark:text-purple-300">Discrete Mode</h4>
								<div className="space-y-2 text-xs text-stone-600 dark:text-stone-400">
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Elaboration:</strong> Same interactive process — AI proposes criteria and decomposition, human validates.
									</p>
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Execution:</strong> Human invokes each stage manually with <code className="text-purple-600 dark:text-purple-400">/haiku:run</code>. Within a stage, the AI runs autonomously through that stage&apos;s hat sequence (e.g., planner→builder→reviewer for development, or threat-modeler→red-team→blue-team→security-reviewer for security), but it stops after the stage completes.
									</p>
									<p>
										<strong className="text-stone-900 dark:text-stone-100">Human re-enters at:</strong> Every stage boundary. The human decides when to proceed, skip stages, or revise previous work. Maximum control over the pipeline.
									</p>
								</div>
							</div>
						</div>
						<p className="mt-4 text-center text-sm text-stone-500 dark:text-stone-400">
							In both modes, elaboration is always collaborative. The difference is who drives the stage transitions during execution.
						</p>
					</div>
				</div>
			</section>

			{/* The Core Loop */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							The Stage Loop
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Every stage — regardless of domain — follows the same five-phase
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
								{["threat-modeler", "red-team", "blue-team", "security-reviewer"].map((hat, i) => (
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
								The TypeScript orchestrator evaluates
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

			{/* Concrete Walkthrough */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl">
					<div className="mb-10 text-center">
						<h2 className="mb-3 text-3xl font-bold">
							Two Commands. That&apos;s It.
						</h2>
						<p className="mx-auto max-w-2xl text-stone-600 dark:text-stone-400">
							Everything in H·AI·K·U flows through two commands. Here&apos;s what happens under the hood.
						</p>
					</div>

					<div className="space-y-8">
						{/* /haiku:new */}
						<div className="rounded-xl border-2 border-teal-200 bg-teal-50/20 p-6 dark:border-teal-800 dark:bg-teal-950/10">
							<div className="mb-5 flex items-center gap-3">
								<code className="rounded-lg bg-teal-100 px-3 py-1.5 text-lg font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">/haiku:new</code>
								<span className="text-stone-500 dark:text-stone-400">Create an intent and start working</span>
							</div>

							{/* Phase 1: Intent Setup */}
							<div className="mb-4">
								<div className="mb-3 flex items-center gap-2">
									<span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">Phase 1</span>
									<span className="text-sm font-semibold text-stone-700 dark:text-stone-300">Intent Setup</span>
									<span className="text-xs text-stone-400 dark:text-stone-500">~ 30 seconds</span>
								</div>
								<div className="grid gap-3 md:grid-cols-3">
									{[
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
											label: "Describe",
											detail: "Tell the AI what you want to accomplish",
											who: "human",
										},
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
											label: "Propose",
											detail: "AI suggests slug, studio, and mode (continuous/discrete)",
											who: "ai",
										},
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
											label: "Confirm",
											detail: "Human approves — intent container created (intent.md)",
											who: "human",
										},
									].map((step) => (
										<div key={step.label} className="rounded-lg border border-teal-200 bg-white p-4 dark:border-teal-800 dark:bg-stone-950">
											<div className="mb-2 flex items-center gap-2">
												<span className="text-teal-600 dark:text-teal-400">{step.icon}</span>
												<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{step.label}</span>
											</div>
											<p className="mb-2 text-xs text-stone-600 dark:text-stone-400">{step.detail}</p>
											<span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
												step.who === "human" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
												: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
											}`}>
												{step.who}
											</span>
										</div>
									))}
								</div>
							</div>

							{/* Seamless transition arrow */}
							<div className="my-4 flex items-center justify-center gap-3">
								<div className="h-px flex-1 bg-gradient-to-r from-transparent to-teal-300 dark:to-teal-700" />
								<span className="text-xs font-medium text-teal-600 dark:text-teal-400">seamlessly enters</span>
								<div className="h-px flex-1 bg-gradient-to-l from-transparent to-teal-300 dark:to-teal-700" />
							</div>

							{/* Phase 2: First Stage */}
							<div>
								<div className="mb-3 flex items-center gap-2">
									<span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-900 dark:text-teal-300">Phase 2</span>
									<span className="text-sm font-semibold text-stone-700 dark:text-stone-300">First Stage Begins Automatically</span>
								</div>
								<div className="grid gap-3 md:grid-cols-4">
									{[
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
											label: "Discover",
											detail: "AI explores codebase, docs, and constraints",
											who: "ai",
										},
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
											label: "Decompose",
											detail: "Break intent into units with criteria and dependencies",
											who: "both",
										},
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
											label: "Architecture",
											detail: "Propose technical approach, identify risks",
											who: "ai",
										},
										{
											icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
											label: "Approve",
											detail: "Human validates scope, criteria, and approach",
											who: "human",
										},
									].map((step) => (
										<div key={step.label} className="rounded-lg border border-teal-200/60 bg-teal-50/40 p-4 dark:border-teal-800/60 dark:bg-teal-950/20">
											<div className="mb-2 flex items-center gap-2">
												<span className="text-teal-600 dark:text-teal-400">{step.icon}</span>
												<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{step.label}</span>
											</div>
											<p className="mb-2 text-xs text-stone-600 dark:text-stone-400">{step.detail}</p>
											<span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
												step.who === "human" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
												: step.who === "ai" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
												: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
											}`}>
												{step.who === "both" ? "collaborative" : step.who}
											</span>
										</div>
									))}
								</div>
								<p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
									The first stage varies by studio &mdash; inception for software, research for ideation &mdash; but it always does the deep elaboration work: discovery, decomposition, and criteria definition.
								</p>
							</div>

							<div className="mt-5 rounded-lg bg-teal-100/50 p-3 text-xs text-teal-800 dark:bg-teal-900/20 dark:text-teal-200">
								<strong>One seamless flow:</strong> The user never stops between creating the intent and starting work. <code>/haiku:new</code> creates the intent container and immediately enters the first stage &mdash; no separate command needed.
							</div>
						</div>

						{/* Arrow */}
						<div className="flex justify-center">
							<svg className="h-8 w-8 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
							</svg>
						</div>

						{/* /haiku:run */}
						<div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/20 p-6 dark:border-indigo-800 dark:bg-indigo-950/10">
							<div className="mb-5 flex items-center gap-3">
								<code className="rounded-lg bg-indigo-100 px-3 py-1.5 text-lg font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">/haiku:run</code>
								<span className="text-stone-500 dark:text-stone-400">Continue, resume, or run the next stage</span>
							</div>

							{/* Stage pipeline visualization */}
							<div className="mb-6 overflow-x-auto">
								<div className="flex items-center gap-2 min-w-max pb-2">
									{[
										{ stage: "inception", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800" },
										{ stage: "design", color: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800" },
										{ stage: "product", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800" },
										{ stage: "development", color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800" },
										{ stage: "operations", color: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800" },
										{ stage: "security", color: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800" },
									].map((s, i) => (
										<div key={s.stage} className="flex items-center gap-2">
											<div className={`rounded-lg border px-3 py-2 text-center ${s.color}`}>
												<div className="text-xs font-bold">{s.stage}</div>
												<div className="mt-1 text-[9px] opacity-70">hat sequence</div>
											</div>
											{i < 5 && (
												<svg className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
												</svg>
											)}
										</div>
									))}
									<div className="flex items-center gap-2">
										<svg className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
										</svg>
										<div className="rounded-lg border border-green-300 bg-green-100 px-3 py-2 text-center text-xs font-bold text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300">
											deliver
										</div>
									</div>
								</div>
							</div>

							{/* What happens inside each stage */}
							<div className="grid gap-4 md:grid-cols-3">
								<div className="rounded-lg border border-indigo-200 bg-white p-4 dark:border-indigo-800 dark:bg-stone-950">
									<div className="mb-2 flex items-center gap-2">
										<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">A</span>
										<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Load Context</span>
									</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Reads STAGE.md for hat sequence. Loads prior stage outputs + global knowledge. Resolves units from DAG.
									</p>
								</div>
								<div className="rounded-lg border border-indigo-200 bg-white p-4 dark:border-indigo-800 dark:bg-stone-950">
									<div className="mb-2 flex items-center gap-2">
										<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">B</span>
										<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Run Hats</span>
									</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										Spawns fresh agents for each hat in the stage&apos;s sequence. Each hat works on units, advancing through the DAG. Failed reviews loop back.
									</p>
								</div>
								<div className="rounded-lg border border-indigo-200 bg-white p-4 dark:border-indigo-800 dark:bg-stone-950">
									<div className="mb-2 flex items-center gap-2">
										<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">C</span>
										<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Gate Check</span>
									</div>
									<p className="text-xs text-stone-600 dark:text-stone-400">
										All units done. Review gate fires: <span className="text-green-600">auto</span> advances, <span className="text-amber-600">ask</span> pauses for user, <span className="text-cyan-600">await</span> waits for async signal, <span className="text-rose-600">external</span> blocks for team.
									</p>
								</div>
							</div>

							<div className="mt-4 rounded-lg bg-indigo-100/50 p-3 text-xs text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
								<strong>Delivery:</strong> After the final stage, the persistence adapter delivers the work &mdash; git opens a PR, filesystem copies to output.
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
								<span className="text-stone-400"> — auto | ask | await | external</span>
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
						{/* Continuous */}
						<div className="rounded-xl border-2 border-green-200 bg-green-50/30 p-6 dark:border-green-800 dark:bg-green-950/10">
							<h3 className="mb-1 text-lg font-semibold text-green-700 dark:text-green-300">
								Continuous (default)
							</h3>
							<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
								AI drives the pipeline. Human reviews at gates.
							</p>
							<div className="space-y-1.5">
								{[
									{ stage: "inception", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", gate: "auto", gateLabel: "auto-advances" },
									{ stage: "design", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", gate: "ask", gateLabel: "user approves" },
									{ stage: "product", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", gate: "external", gateLabel: "team decides: do we build this?" },
									{ stage: "development", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", gate: "ask", gateLabel: "user approves" },
									{ stage: "operations", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300", gate: "auto", gateLabel: "advances immediately" },
									{ stage: "security", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", gate: "external", gateLabel: "team signs off (ask in autopilot)" },
								].map((s) => (
									<div key={s.stage}>
										<div className="flex items-center gap-2">
											<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-200 dark:bg-green-800" title="AI drives">
												<svg className="h-3 w-3 text-green-700 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
											</span>
											<span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${s.color}`}>
												{s.stage}
											</span>
											<span className="text-[10px] text-stone-400">AI runs autonomously</span>
										</div>
										<div className="ml-2.5 flex items-center gap-2 border-l-2 border-dashed border-stone-200 py-1 pl-4 dark:border-stone-700">
											<span className={`h-2 w-2 rounded-full ${s.gate === "auto" ? "bg-green-400" : s.gate === "ask" ? "bg-amber-400" : "bg-rose-400"}`} />
											<span className={`text-[10px] font-medium ${s.gate === "auto" ? "text-green-600 dark:text-green-400" : s.gate === "ask" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
												{s.gate} &mdash; {s.gateLabel}
											</span>
										</div>
									</div>
								))}
								{/* Delivery progression */}
								<div className="flex items-center gap-2 pt-1">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-200 dark:bg-teal-800">
										<svg className="h-3 w-3 text-teal-700 dark:text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
									</span>
									<span className="rounded-md bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
										delivery
									</span>
									<span className="text-[10px] text-stone-400">persistence adapter delivers (PR, copy, publish)</span>
								</div>
							</div>
						</div>

						{/* Discrete */}
						<div className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-6 dark:border-purple-800 dark:bg-purple-950/10">
							<h3 className="mb-1 text-lg font-semibold text-purple-700 dark:text-purple-300">
								Discrete
							</h3>
							<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
								Human drives the pipeline. Invokes each stage explicitly.
							</p>
							<div className="space-y-1.5">
								{[
									{ stage: "inception", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
									{ stage: "design", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
									{ stage: "product", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
									{ stage: "development", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
									{ stage: "operations", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
									{ stage: "security", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
								].map((s) => (
									<div key={s.stage}>
										<div className="flex items-center gap-2">
											<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-200 dark:bg-purple-800" title="Human invokes">
												<svg className="h-3 w-3 text-purple-700 dark:text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
											</span>
											<code className="text-[10px] text-purple-600 dark:text-purple-400">/haiku:run {s.stage}</code>
											<span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${s.color}`}>
												{s.stage}
											</span>
										</div>
										<div className="ml-2.5 flex items-center gap-2 border-l-2 border-dashed border-stone-200 py-1 pl-4 dark:border-stone-700">
											<span className="h-2 w-2 rounded-full bg-purple-400" />
											<span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">
												user reviews &rarr; decides next stage
											</span>
										</div>
									</div>
								))}
								{/* Delivery progression */}
								<div className="flex items-center gap-2 pt-1">
									<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-200 dark:bg-teal-800">
										<svg className="h-3 w-3 text-teal-700 dark:text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
									</span>
									<span className="rounded-md bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
										delivery
									</span>
									<span className="text-[10px] text-stone-400">persistence adapter delivers (PR, copy, publish)</span>
								</div>
							</div>
						</div>
					</div>

					{/* Review Modes Explained */}
					<div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
						<h3 className="mb-4 font-semibold text-stone-900 dark:text-stone-100">
							Review Modes Explained
						</h3>
						<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
							Each stage declares a review mode that controls what happens at its boundary. These modes enable everything from fully autonomous pipelines to multi-person handoff workflows.
						</p>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="rounded-lg border-2 border-green-200 bg-green-50/30 p-4 dark:border-green-800 dark:bg-green-950/10">
								<div className="mb-2 flex items-center gap-2">
									<span className="h-3 w-3 rounded-full bg-green-400" />
									<span className="text-sm font-bold text-green-700 dark:text-green-300">auto</span>
								</div>
								<p className="mb-2 text-xs font-medium text-stone-700 dark:text-stone-300">
									No human needed
								</p>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									The AI verifies all criteria are met and advances immediately. Used for stages where machines can fully validate quality — tests pass or they don&apos;t.
								</p>
								<div className="mt-3 rounded bg-green-100 p-2 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-300">
									Example: operations stage — deployment config either validates or it doesn&apos;t
								</div>
							</div>
							<div className="rounded-lg border-2 border-amber-200 bg-amber-50/30 p-4 dark:border-amber-800 dark:bg-amber-950/10">
								<div className="mb-2 flex items-center gap-2">
									<span className="h-3 w-3 rounded-full bg-amber-400" />
									<span className="text-sm font-bold text-amber-700 dark:text-amber-300">ask</span>
								</div>
								<p className="mb-2 text-xs font-medium text-stone-700 dark:text-stone-300">
									Same user confirms
								</p>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									The pipeline pauses and presents the output for the current user to review. An internal checkpoint — the person driving the work validates before moving on.
								</p>
								<div className="mt-3 rounded bg-amber-100 p-2 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
									Example: &ldquo;Does this design look right before we build it?&rdquo;
								</div>
							</div>
							<div className="rounded-lg border-2 border-rose-200 bg-rose-50/30 p-4 dark:border-rose-800 dark:bg-rose-950/10">
								<div className="mb-2 flex items-center gap-2">
									<span className="h-3 w-3 rounded-full bg-rose-400" />
									<span className="text-sm font-bold text-rose-700 dark:text-rose-300">external</span>
								</div>
								<p className="mb-2 text-xs font-medium text-stone-700 dark:text-stone-300">
									Different person or team reviews
								</p>
								<p className="text-xs text-stone-600 dark:text-stone-400">
									The pipeline fully stops and waits for sign-off from someone outside the current session. Enables handoffs — a designer finishes, a tech lead reviews, an engineer picks up the next stage.
								</p>
								<div className="mt-3 rounded bg-rose-100 p-2 text-[10px] text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
									Example: product owner approves the spec before engineering starts
								</div>
							</div>
						</div>
						<div className="mt-4 rounded-lg bg-purple-50 p-4 dark:bg-purple-950/20">
							<p className="text-xs text-purple-800 dark:text-purple-200">
								<strong>Discrete mode and handoffs:</strong> In discrete mode, every stage transition is effectively external — the user explicitly invokes each stage with <code>/haiku:run</code>. This naturally supports team workflows where different people own different stages. A designer runs inception and design, then hands off to an engineer who runs development.
							</p>
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
						Install the Claude plugin and run your first intent.
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
