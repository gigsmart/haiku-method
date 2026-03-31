"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
	BubbleOption,
	CastCard,
	ChatBubble,
	CriteriaCompare,
	DeepDive,
	ExchangeLabel,
	FlowArrowInline,
	FlowNode,
	FuelGauge,
	GateCards,
	QualityGateLifecycle,
	HatArrow,
	HatCard,
	HatExplainer,
	HatRotation,
	HookTimeline,
	InsightBox,
	LifecycleFlow,
	ModeToggle,
	NestedLoopsViz,
	Pipeline,
	ProgressBar,
	SectionNav,
	SpecComparison,
	Tollbooth,
	ToolkitCard,
	ToolkitGroup,
} from "./components/guide"

// ---------- fade-in helper ----------
const fadeIn = {
	initial: { opacity: 0, y: 20 },
	whileInView: { opacity: 1, y: 0 },
	viewport: { once: true, margin: "-40px" as const },
	transition: { duration: 0.5 },
}

// ==============================================
// HOME PAGE -- STORY-DRIVEN LIFECYCLE GUIDE
// ==============================================

export default function Home() {
	const [mode, setMode] = useState<"story" | "reference">("story")
	const isRef = mode === "reference"

	// When switching to reference mode, open all deep dives
	// (the DeepDive component handles forceOpen prop)

	return (
		<div className="relative">
			<ProgressBar />
			<SectionNav />

			{/* ============================================================ */}
			{/* HERO */}
			{/* ============================================================ */}
			<section
				id="hero"
				className="relative overflow-hidden px-4 py-24 text-center sm:py-32"
			>
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.08),transparent_60%)]" />
				<div className="mx-auto max-w-4xl">
					<div className="mb-6 inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
						By The Bushido Collective
					</div>
					<h1 className="mb-4 bg-gradient-to-r from-blue-500 to-amber-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl lg:text-6xl">
						AI-DLC: How It Works
					</h1>
					<p className="mx-auto mb-8 max-w-xl text-lg text-gray-500 dark:text-gray-400">
						The AI-Driven Development Lifecycle &mdash; from idea to production.
					</p>

					<ModeToggle mode={mode} onChange={setMode} />

					{/* Color legend */}
					<div className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-5">
						<Legend color="bg-blue-500" label="Blue = Human actions" />
						<Legend color="bg-amber-400" label="Gold = AI actions" />
						<Legend
							color="bg-gray-500 dark:bg-gray-600"
							label="Gray = System / automated"
						/>
						<Legend
							color="bg-violet-500"
							label="Purple = Deep Dive (reference)"
						/>
					</div>

					<p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
						Scroll down. The story starts with the characters. Purple sections
						expand for deeper reference material.
					</p>

					{/* Install CTA */}
					<div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
						<Link
							href="/docs/installation/"
							className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-amber-500 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
						>
							Install Plugin
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
						</Link>
						<Link
							href="/paper/"
							className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
						>
							Read the Paper
						</Link>
					</div>
				</div>
			</section>

			{/* ============================================================ */}
			{/* PROLOGUE: MEET THE CAST */}
			{/* ============================================================ */}
			<Section id="prologue">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Prologue: Meet the Cast
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-8 text-gray-500 dark:text-gray-400"
					>
						Before the story begins, let&rsquo;s meet the players. Every
						character has a role. Nobody works alone.
					</motion.p>

					{/* Top row: Human + AI */}
					<div className="grid gap-5 sm:grid-cols-2">
						<CastCard
							icon="&#x1F9D1;"
							name="You (Human)"
							nameColor="text-blue-500"
							borderColor="border-l-4 border-l-blue-500"
							description="You provide the vision and make key decisions."
						>
							<CastList
								items={[
									"During planning: you answer questions and approve specs",
									"During building: you watch, step away, or unblock",
									"During reflection: you validate insights and choose next steps",
								]}
							/>
						</CastCard>

						<CastCard
							icon="&#x1F916;"
							name="Claude (Session Agent)"
							nameColor="text-amber-400"
							borderColor="border-l-4 border-l-amber-400"
							description="The AI you're talking to right now. One agent, many roles."
						>
							<CastList
								items={[
									"Elaborator during planning -- asks questions, explores your codebase, writes specs",
									"Executor during building -- manages the unit queue, spawns hat agents, tracks progress",
									"Analyst during reflection -- analyzes what happened, recommends improvements",
									"Spawns fresh specialist agents for each unit of work",
								]}
							/>
						</CastCard>
					</div>

					{/* Hatted agents — full-width card with expandable detail */}
					<motion.div
						{...fadeIn}
						className="mt-6 rounded-xl border border-amber-200 bg-white p-6 dark:border-amber-800/50 dark:bg-gray-900"
					>
						<div className="mb-4 flex items-start gap-4">
							<span className="text-4xl">&#x1F3A9;</span>
							<div className="flex-1">
								<h3 className="text-lg font-bold text-amber-400">
									The Hatted Agents
								</h3>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									When it&rsquo;s time to build, Claude spawns fresh specialist agents — each wearing a different &ldquo;hat&rdquo; that defines their role. A hat is a set of injected instructions that tells the agent how to behave, what gates to pass, and when to hand off.
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{["Planner", "Builder", "Reviewer", "Designer", "Red Team", "Blue Team", "Test Writer", "Implementer", "Refactorer", "Observer", "Hypothesizer", "Experimenter", "Analyst"].map((hat) => (
										<span
											key={hat}
											className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
										>
											{hat}
										</span>
									))}
								</div>
							</div>
						</div>

						<details className="group">
							<summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-500 hover:text-violet-400">
								<svg
									className="h-4 w-4 transition-transform group-open:rotate-90"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5l7 7-7 7"
									/>
								</svg>
								See all workflows and hat details
							</summary>
							<div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
								<HatExplainer />

						{/* Workflow groups */}
						<WorkflowGroup
							name="Default Workflow"
							badge="most common"
							bgClass="bg-amber-500/5 dark:bg-amber-500/5"
							labelColor="text-amber-400"
							borderColor="border-l-amber-400"
							hats={[
								{
									icon: "\u{1F4CB}",
									name: "Planner",
									desc: "Reads the criteria, checks for blockers, creates a tactical plan for this iteration.",
								},
								{
									icon: "\u{1F528}",
									name: "Builder",
									desc: "Implements code incrementally, runs quality gates after every change, fixes what breaks.",
								},
								{
									icon: "\u{1F50D}",
									name: "Reviewer",
									desc: "Verifies every success criterion with evidence, checks code quality, approves or sends back.",
								},
							]}
						/>

						<WorkflowGroup
							name="Adversarial Workflow"
							badge="security-focused"
							bgClass="bg-rose-500/5 dark:bg-rose-500/5"
							labelColor="text-rose-500"
							borderColor="border-l-rose-500"
							hats={[
								{
									icon: "\u{1F4CB}",
									name: "Planner",
									desc: "Reads the criteria, checks for blockers, creates a tactical plan.",
								},
								{
									icon: "\u{1F528}",
									name: "Builder",
									desc: "Implements code incrementally, runs quality gates.",
								},
								{
									icon: "\u2694\uFE0F",
									name: "Red Team",
									desc: "Attacks the code: tests for injection, auth bypass, data exposure.",
								},
								{
									icon: "\u{1F6E1}\uFE0F",
									name: "Blue Team",
									desc: "Fixes what Red Team found: patches root causes, adds security tests.",
								},
								{
									icon: "\u{1F50D}",
									name: "Reviewer",
									desc: "Verifies every success criterion with evidence.",
								},
							]}
						/>

						<WorkflowGroup
							name="TDD Workflow"
							badge="test-driven"
							bgClass="bg-cyan-500/5 dark:bg-cyan-500/5"
							labelColor="text-cyan-400"
							borderColor="border-l-cyan-400"
							hats={[
								{
									icon: "\u270D\uFE0F",
									name: "Test Writer",
									desc: "Writes ONE failing test for ONE behavior. The test MUST fail.",
								},
								{
									icon: "\u2699\uFE0F",
									name: "Implementer",
									desc: "Writes the minimum code to make the test pass. Nothing more.",
								},
								{
									icon: "\u{1F9F9}",
									name: "Refactorer",
									desc: "Cleans up the code without changing behavior. Runs tests after every change.",
								},
								{
									icon: "\u{1F50D}",
									name: "Reviewer",
									desc: "Verifies every success criterion with evidence.",
								},
							]}
						/>

						<WorkflowGroup
							name="Design Workflow"
							badge="UI/UX"
							bgClass="bg-violet-500/5 dark:bg-violet-500/5"
							labelColor="text-violet-500"
							borderColor="border-l-violet-500"
							hats={[
								{
									icon: "\u{1F4CB}",
									name: "Planner",
									desc: "Reads the criteria, checks for blockers, creates a tactical plan.",
								},
								{
									icon: "\u{1F3A8}",
									name: "Designer",
									desc: "Explores design options, presents 2-3 alternatives, creates specs.",
								},
								{
									icon: "\u{1F50D}",
									name: "Reviewer",
									desc: "Verifies every success criterion with evidence.",
								},
							]}
						/>

						<WorkflowGroup
							name="Hypothesis Workflow"
							badge="debugging"
							bgClass="bg-green-500/5 dark:bg-green-500/5"
							labelColor="text-green-500"
							borderColor="border-l-green-500"
							hats={[
								{
									icon: "\u{1F441}\uFE0F",
									name: "Observer",
									desc: "Reproduces the bug, captures errors, logs, timeline. Reports facts only.",
								},
								{
									icon: "\u{1F4A1}",
									name: "Hypothesizer",
									desc: "Generates 3+ theories about the cause.",
								},
								{
									icon: "\u{1F9EA}",
									name: "Experimenter",
									desc: "Tests hypotheses one at a time. Isolates variables.",
								},
								{
									icon: "\u{1F4CA}",
									name: "Analyst",
									desc: "Confirms root cause, designs minimal fix, adds regression test.",
								},
							]}
						/>
							</div>
						</details>
					</motion.div>

					{/* Supporting cast */}
					<div className="mt-8 grid gap-5 sm:grid-cols-3">
						<CastCard
							icon="&#x1F52C;"
							name="The Helpers"
							nameColor="text-amber-300"
							borderColor="border-l-4 border-l-amber-300"
							description="One-shot subagents during elaboration only."
						>
							<CastList
								items={[
									"Discovery Agent -- Explores codebase structure, APIs, schemas",
									"Wireframe Agent -- Generates HTML mockups for UI units",
									"Ticket Sync Agent -- Creates epics and tickets in your project tracker",
									"Spec Reviewer -- Validates completeness and consistency of the spec",
								]}
							/>
						</CastCard>

						<CastCard
							icon="&#x2705;"
							name="The Integrator"
							nameColor="text-green-500"
							borderColor="border-l-4 border-l-green-500"
							description="Spawned once after ALL units are done."
						>
							<CastList
								items={[
									"Validates everything works together on the merged branch",
									"Runs the 10-step integration check",
									"Reports ACCEPT or REJECT",
								]}
							/>
						</CastCard>

						<CastCard
							icon="&#x2699;&#xFE0F;"
							name="The System"
							nameColor="text-gray-500 dark:text-gray-400"
							borderColor="border-l-4 border-l-gray-400 dark:border-l-gray-600"
							description="Automated hooks (shell scripts) that run silently."
						>
							<CastList
								items={[
									"Saves progress so nothing is lost between sessions",
									"Enforces quality gates, warns about context limits",
									"Makes the whole thing resilient to context window resets",
								]}
							/>
						</CastCard>
					</div>

					<motion.p
						{...fadeIn}
						className="mt-5 text-center text-xs italic text-gray-400 dark:text-gray-500"
					>
						The hatted agents are all Claude -- fresh instances with clean
						context, each focused on one job for one unit.
					</motion.p>

					{/* Deep Dive: Agent Types */}
					<DeepDive
						title="Deep Dive: Agent Types -- The Specialized Roles"
						forceOpen={isRef}
					>
						<p className="mb-3">
							The session agent (Claude) wears different hats at different
							times, and spawns specialized agents when needed.
						</p>
						<h4 className="mb-2 font-semibold text-gray-800 dark:text-gray-200">
							Three Operating Modes
						</h4>
						<div className="grid gap-3 sm:grid-cols-3">
							<MiniCard
								title="HITL -- Human-in-the-Loop"
								titleColor="text-green-500"
								desc="Human validates each step. Maximum control."
							/>
							<MiniCard
								title="OHOTL -- Observed Human-on-the-Loop"
								titleColor="text-amber-500"
								desc="Human watches in real-time, can intervene."
							/>
							<MiniCard
								title="AHOTL -- Autonomous Human-on-the-Loop"
								titleColor="text-cyan-400"
								desc="AI iterates autonomously. Human reviews results."
							/>
						</div>
					</DeepDive>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* ACT 1: THE BIG PICTURE */}
			{/* ============================================================ */}
			<Section id="act1">
				<Container>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Act 1: The Big Picture
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Every feature follows the same rhythm. Four steps. Then repeat.
					</motion.p>

					<LifecycleFlow />

					{/* Phase summaries */}
					<motion.div
						{...fadeIn}
						className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
					>
						<PhaseSummary
							icon="&#x1F4AC;"
							label="Plan:"
							labelColor="text-blue-500"
							desc="You describe what you want. The AI asks questions until it truly understands."
						/>
						<PhaseSummary
							icon="&#x1F528;"
							label="Build:"
							labelColor="text-amber-400"
							desc="The AI writes code, runs tests, and reviews its own work -- all autonomously."
						/>
						<PhaseSummary
							icon="&#x1F4E6;"
							label="Deliver:"
							labelColor="text-green-500"
							desc="The AI packages everything into a pull request. You review and approve."
						/>
						<PhaseSummary
							icon="&#x1F4A1;"
							label="Learn:"
							labelColor="text-violet-500"
							desc="The AI reflects on what went well and what to improve for next time."
						/>
					</motion.div>

					<motion.p
						{...fadeIn}
						className="mt-8 mb-4 text-center text-gray-500 dark:text-gray-400"
					>
						For cross-functional teams, <strong>passes</strong> let design,
						product, and dev each run this loop independently -- the output of
						one becomes the input to the next.
					</motion.p>

					<motion.p
						{...fadeIn}
						className="mt-4 mb-4 text-center text-gray-500 dark:text-gray-400"
					>
						Most features follow this full cycle. But there are shortcuts:
					</motion.p>

					<motion.div
						{...fadeIn}
						className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
					>
						<ShortcutPill
							cmd="/ai-dlc:quick"
							desc="Skip everything for tiny fixes -- typos, config changes, one-liners"
						/>
						<ShortcutPill
							cmd="/ai-dlc:autopilot"
							desc="AI handles the whole cycle autonomously for well-understood features"
						/>
					</motion.div>

					{/* Deep Dive: Plugin Architecture */}
					<DeepDive
						title="Deep Dive: Plugin Architecture -- What's Inside the Box"
						forceOpen={isRef}
					>
						<p className="mb-3">
							AI-DLC is a Claude Code plugin with a well-organized file
							structure. Everything is self-contained.
						</p>
						<div className="rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed dark:border-gray-700 dark:bg-gray-950">
							<div>
								<span className="font-semibold text-blue-500">plugin/</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">
									.claude-plugin/
								</span>{" "}
								<span className="text-gray-400">-- Plugin manifest</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">hats/</span>{" "}
								<span className="text-gray-400">
									-- 15 hat definition files (.md)
								</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">hooks/</span>{" "}
								<span className="text-gray-400">
									-- 9 lifecycle hooks (.sh)
								</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">lib/</span>{" "}
								<span className="text-gray-400">
									-- 16 foundation libraries
								</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">providers/</span>{" "}
								<span className="text-gray-400">
									-- 4 external integration specs
								</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">schemas/</span>{" "}
								<span className="text-gray-400">
									-- JSON schemas for settings + providers
								</span>
							</div>
							<div className="pl-5">
								<span className="font-semibold text-blue-500">skills/</span>{" "}
								<span className="text-gray-400">-- 28 skill definitions</span>
							</div>
							<div className="pl-5">
								<span className="text-gray-500">workflows.yml</span>{" "}
								<span className="text-gray-400">
									-- Named workflow sequences
								</span>
							</div>
						</div>
					</DeepDive>
				</Container>
			</Section>

			{/* ============================================================ */}
			{/* WHY SPECS MATTER */}
			{/* ============================================================ */}
			<Section id="specs">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Why Specs Matter
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						The difference between hoping for the best and knowing what done
						looks like.
					</motion.p>

					<SpecComparison />
					<InsightBox />

					<motion.h3 {...fadeIn} className="mt-10 mb-1 text-xl font-bold">
						See the difference
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-5 text-gray-500 dark:text-gray-400"
					>
						Good criteria are the ones an AI can check without asking you.
					</motion.p>

					<CriteriaCompare />
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* ACT 2: PLANNING TOGETHER */}
			{/* ============================================================ */}
			<Section id="act2">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Act 2: Planning Together
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-6 text-gray-500 dark:text-gray-400"
					>
						This is the most important part. Good planning means the AI can
						build autonomously. Bad planning means it keeps asking you
						questions.
					</motion.p>

					{/* Conversation legend */}
					<motion.div
						{...fadeIn}
						className="mb-6 flex items-start gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-800 dark:bg-blue-950/20"
					>
						<span className="flex-shrink-0 text-3xl">&#x1F4AC;</span>
						<p className="text-sm text-gray-600 dark:text-gray-300">
							What follows is the actual conversation flow.{" "}
							<strong className="text-blue-500">
								Blue bubbles on the left
							</strong>{" "}
							are you.{" "}
							<strong className="text-amber-400">
								Gold bubbles on the right
							</strong>{" "}
							are the AI.{" "}
							<strong className="text-gray-500">
								Gray bubbles in the center
							</strong>{" "}
							are system events.
						</p>
					</motion.div>

					{/* The 9-exchange conversation */}
					<div className="space-y-6">
						{/* Exchange 1 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 1 -- &ldquo;What do you want to build?&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								What do you want to build or accomplish?
							</ChatBubble>
							<ChatBubble speaker="human">
								I want to add OAuth login to our app.
							</ChatBubble>
						</div>

						{/* Exchange 2 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 2 -- &ldquo;Let me understand better&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								<div>A few questions to narrow things down:</div>
								<div className="mt-2">
									<strong className="text-xs">Who uses this?</strong>
									<div className="mt-1 flex flex-wrap gap-1.5">
										<BubbleOption variant="gold">End users</BubbleOption>
										<BubbleOption variant="gold">Admin users</BubbleOption>
										<BubbleOption variant="gold">Both</BubbleOption>
									</div>
								</div>
								<div className="mt-2">
									<strong className="text-xs">Which OAuth providers?</strong>
									<div className="mt-1 flex flex-wrap gap-1.5">
										<BubbleOption variant="gold">Google</BubbleOption>
										<BubbleOption variant="gold">GitHub</BubbleOption>
										<BubbleOption variant="gold">Both</BubbleOption>
										<BubbleOption variant="gold">Custom</BubbleOption>
									</div>
								</div>
							</ChatBubble>
							<ChatBubble speaker="human">
								<div className="flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">End users</BubbleOption>
									<BubbleOption variant="selected">
										Both (Google + GitHub)
									</BubbleOption>
									<BubbleOption variant="selected">Login page</BubbleOption>
								</div>
							</ChatBubble>
						</div>

						{/* Exchange 3 */}
						<div className="space-y-3">
							<ExchangeLabel>Exchange 3 -- AI goes exploring</ExchangeLabel>
							<ChatBubble speaker="system">
								<div className="my-3 text-3xl">&#x1F50D;</div>
								<strong>
									Claude delegates exploration to a Discovery Agent...
								</strong>
								<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
									This is automatic. You wait. The AI reads your codebase --
									file structure, database schemas, API endpoints, existing
									patterns -- and writes its findings to a discovery document.
								</p>
								<div className="mt-3 grid grid-cols-2 gap-2">
									{[
										"Reading file structure",
										"Scanning database schemas",
										"Mapping API endpoints",
										"Finding existing patterns",
									].map((t) => (
										<div
											key={t}
											className="rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-950"
										>
											<span className="text-amber-400">&#x25B8;</span> {t}
										</div>
									))}
								</div>
							</ChatBubble>
						</div>

						{/* Deep Dive: Domain Discovery */}
						<DeepDive
							title="Deep Dive: Domain Discovery -- What the Explorer Actually Finds"
							forceOpen={isRef}
						>
							<ul className="list-disc space-y-1.5 pl-4">
								<li>
									<strong>File structure & project layout</strong> -- Maps
									directories, identifies framework patterns
								</li>
								<li>
									<strong>Database schemas</strong> -- Reads migrations, models,
									entity relationships
								</li>
								<li>
									<strong>API surface</strong> -- Maps endpoints, authentication
									patterns, request/response shapes
								</li>
								<li>
									<strong>Existing patterns</strong> -- How the codebase handles
									auth, validation, error handling
								</li>
								<li>
									<strong>Dependencies</strong> -- Package manifest analysis,
									version constraints
								</li>
							</ul>
						</DeepDive>

						{/* Exchange 4 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 4 -- &ldquo;Here&rsquo;s what I found&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								<strong>Domain model</strong>
								<div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-950">
									<div>
										<strong className="text-cyan-400">Entities:</strong>{" "}
										<span className="text-gray-500">
											User, OAuth Token, Session
										</span>
									</div>
									<div>
										<strong className="text-cyan-400">Relationships:</strong>{" "}
										<span className="text-gray-500">
											User has many OAuth Tokens
										</span>
									</div>
									<div>
										<strong className="text-rose-500">Gap found:</strong>{" "}
										<span className="text-gray-500">
											No existing session management -- we&rsquo;ll need to add
											this
										</span>
									</div>
								</div>
							</ChatBubble>
							<ChatBubble speaker="human">
								<div className="flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">Looks accurate</BubbleOption>
								</div>
							</ChatBubble>
						</div>

						{/* Exchange 5 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 5 -- &ldquo;Which workflow should we use?&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								I recommend the <strong>default</strong> workflow:
								<div className="mt-2 space-y-2">
									<WorkflowPill
										name="Default"
										flow="Planner -> Builder -> Reviewer"
										recommended
									/>
									<WorkflowPill
										name="Adversarial"
										flow="Planner -> Builder -> Red Team -> Blue Team -> Reviewer"
									/>
									<WorkflowPill
										name="TDD"
										flow="Test Writer -> Implementer -> Refactorer -> Reviewer"
									/>
									<WorkflowPill
										name="Design"
										flow="Planner -> Designer -> Reviewer"
									/>
									<WorkflowPill
										name="Hypothesis"
										flow="Observer -> Hypothesizer -> Experimenter -> Analyst"
									/>
								</div>
							</ChatBubble>
							<ChatBubble speaker="human">
								<div className="flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">Default</BubbleOption>
								</div>
							</ChatBubble>
						</div>

						{/* Exchange 6 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 6 -- &ldquo;What does success look like?&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								Let&rsquo;s define 3-7 measurable success criteria:
								<div className="mt-2 space-y-1 text-sm">
									<div className="border-b border-gray-200 py-1 dark:border-gray-700">
										&#x2705; All tests in{" "}
										<code className="text-amber-500">tests/auth/</code> pass
									</div>
									<div className="border-b border-gray-200 py-1 dark:border-gray-700">
										&#x2705; OAuth flow completes in &lt;2s p95
									</div>
									<div className="py-1">
										&#x2705; OWASP top 10 -- no critical findings
									</div>
								</div>
							</ChatBubble>
							<ChatBubble speaker="human">
								Looks good. Add one more: &ldquo;Users can link multiple OAuth
								providers to one account.&rdquo;
							</ChatBubble>
						</div>

						{/* Exchange 7 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 7 -- &ldquo;Here&rsquo;s how I&rsquo;ll break this
								down&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								I&rsquo;ve decomposed this into four units of work:
								<div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950">
									<DagUnit
										id="Unit 1"
										name="OAuth Provider Setup (backend)"
										deps="no dependencies"
									/>
									<DagArrow />
									<DagUnit
										id="Unit 2"
										name="Callback Handler (backend)"
										deps="depends on Unit 1"
									/>
									<DagArrow />
									<DagUnit
										id="Unit 3"
										name="Session Management (backend)"
										deps="depends on Unit 1"
									/>
									<DagArrow />
									<DagUnit
										id="Unit 4"
										name="Login UI (frontend)"
										deps="depends on Unit 2 & 3"
									/>
								</div>
								<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
									Units 2 and 3 can run in parallel once Unit 1 is done. Unit 4
									waits for both.
								</p>
							</ChatBubble>
							<ChatBubble speaker="human">
								You review each unit individually:
								<div className="mt-2 flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">
										Unit 1: Approved
									</BubbleOption>
									<BubbleOption variant="selected">
										Unit 2: Approved
									</BubbleOption>
									<BubbleOption variant="selected">
										Unit 3: Approved
									</BubbleOption>
									<BubbleOption variant="selected">
										Unit 4: Approved
									</BubbleOption>
								</div>
							</ChatBubble>
						</div>

						{/* Exchange 8 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 8 -- &ldquo;How should we deliver?&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								How would you like to review the work?
								<div className="mt-2 flex flex-wrap gap-1.5">
									<BubbleOption variant="gold">
										Review each unit as a separate PR
									</BubbleOption>
									<BubbleOption variant="gold">
										Build everything, one PR at the end
									</BubbleOption>
									<BubbleOption variant="gold">
										Build on main branch
									</BubbleOption>
								</div>
							</ChatBubble>
							<ChatBubble speaker="human">
								<div className="flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">
										Review each unit as a separate PR
									</BubbleOption>
								</div>
							</ChatBubble>
						</div>

						{/* Exchange 9 */}
						<div className="space-y-3">
							<ExchangeLabel>
								Exchange 9 -- &ldquo;Ready to build!&rdquo;
							</ExchangeLabel>
							<ChatBubble speaker="ai">
								<div className="mb-3 space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-950">
									<div>
										<strong>Intent:</strong>{" "}
										<span className="text-gray-500">Add OAuth login</span>
									</div>
									<div>
										<strong>Workflow:</strong>{" "}
										<span className="text-gray-500">
											Default (Planner &rarr; Builder &rarr; Reviewer)
										</span>
									</div>
									<div>
										<strong>Criteria:</strong>{" "}
										<span className="text-gray-500">
											4 success criteria defined
										</span>
									</div>
									<div>
										<strong>Units:</strong>{" "}
										<span className="text-gray-500">
											4 units with dependency ordering
										</span>
									</div>
									<div>
										<strong>Delivery:</strong>{" "}
										<span className="text-gray-500">Separate PRs per unit</span>
									</div>
								</div>
								Shall I start building, or open a PR for your team to review the
								spec first?
							</ChatBubble>
							<ChatBubble speaker="human">
								<div className="flex flex-wrap gap-1.5">
									<BubbleOption variant="selected">Start building</BubbleOption>
									<BubbleOption variant="blue">
										Open spec PR for review
									</BubbleOption>
								</div>
							</ChatBubble>
							<ChatBubble speaker="system">
								All artifacts committed to{" "}
								<code className="text-amber-500">
									ai-dlc/&#123;slug&#125;/main
								</code>{" "}
								branch. The plan is saved. Time to build.
							</ChatBubble>
						</div>
					</div>

					{/* Planning done callout */}
					<motion.div
						{...fadeIn}
						className="mt-8 rounded-xl border border-green-200 bg-green-50/50 p-6 text-center dark:border-green-800 dark:bg-green-950/10"
					>
						<p className="mb-2 text-lg font-semibold text-green-500">
							That&rsquo;s it. Planning is done.
						</p>
						<p className="mx-auto max-w-lg text-sm text-gray-500 dark:text-gray-400">
							Nine exchanges. Maybe ten minutes of your time. The AI now has
							everything it needs to work autonomously. You can step away. You
							can watch. Either way, the building starts now.
						</p>
					</motion.div>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* ACT 3: BUILDING */}
			{/* ============================================================ */}
			<Section id="act3">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Act 3: Building
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Now the AI works. You typed{" "}
						<code className="text-amber-500">/ai-dlc:execute</code>. Three loops nest
						inside each other, from big to small.
					</motion.p>

					<NestedLoopsViz />

					{/* Outer Loop */}
					<motion.h3
						{...fadeIn}
						className="mt-10 mb-1 text-xl font-bold text-green-500"
					>
						Outer Loop: The Assembly Line
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Units flow through a pipeline. Independent units can build in
						parallel. Each one unlocks the next.
					</motion.p>

					<Pipeline />

					<motion.p
						{...fadeIn}
						className="mt-2 text-xs text-gray-500 dark:text-gray-400"
					>
						The dependency graph (DAG) determines the order. Unit 1 has no
						dependencies, so it starts first. Once Unit 1 completes, Units 2 and
						3 can build in parallel. Unit 4 waits for both 2 and 3.
					</motion.p>

					{/* Human watching / AI working */}
					<motion.div {...fadeIn} className="my-6 grid gap-5 sm:grid-cols-2">
						<div className="rounded-xl border border-blue-200 bg-blue-50/30 p-5 text-center opacity-60 dark:border-blue-800 dark:bg-blue-950/10">
							<div className="mb-2 text-3xl">&#x2615;</div>
							<div className="font-semibold text-blue-500">You</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Watching. Or away doing something else. Available if needed.
							</div>
						</div>
						<div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 text-center dark:border-amber-800 dark:bg-amber-950/10">
							<div className="mb-2 text-3xl">&#x1F528;</div>
							<div className="font-semibold text-amber-400">The Builder</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								Writing code, running tests, committing changes. Fully
								autonomous.
							</div>
						</div>
					</motion.div>

					{/* Middle Loop */}
					<motion.h3
						{...fadeIn}
						className="mt-12 mb-1 text-xl font-bold text-amber-400"
					>
						Middle Loop: The Hat Rotation
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Inside each unit, the AI cycles through hats. Each hat has one job.
						Quality gates stand between them — every time the Builder finishes a session, it must pass the gates before stopping.
					</motion.p>

					<HatRotation />

					<motion.div
						{...fadeIn}
						className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/30 p-4 dark:border-cyan-800 dark:bg-cyan-950/10"
					>
						<div className="mb-2 flex items-center gap-2">
							<span className="text-base">&#x1F6A7;</span>
							<span className="text-sm font-bold text-cyan-600 dark:text-cyan-300">
								Quality gates fire on every Builder stop
							</span>
						</div>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							The gates were detected from your repo tooling during{" "}
							<code className="text-amber-500">/ai-dlc:elaborate</code> and saved to{" "}
							<code className="text-amber-500">intent.md</code> frontmatter. The
							harness reads them and runs each command synchronously —{" "}
							<strong className="text-gray-700 dark:text-gray-300">
								the agent literally cannot stop until all pass.
							</strong>{" "}
							Builders can add unit-specific gates but cannot remove existing ones.
						</p>
					</motion.div>

					<motion.div {...fadeIn} className="mt-6 grid gap-4 sm:grid-cols-2">
						<div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/10">
							<h4 className="mb-1 text-sm font-bold text-green-500">
								When the Reviewer passes:
							</h4>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								The unit is marked complete. Its branch is merged. Claude picks
								the next ready unit from the dependency graph.
							</p>
						</div>
						<div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-800 dark:bg-rose-950/10">
							<h4 className="mb-1 text-sm font-bold text-rose-500">
								When the Reviewer fails:
							</h4>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								The Reviewer writes specific, actionable feedback. &ldquo;Test
								for expired tokens is missing&rdquo; not &ldquo;needs more
								tests.&rdquo; The Builder reads this feedback and iterates.
							</p>
						</div>
					</motion.div>

					{/* Inner Loop */}
					<motion.h3
						{...fadeIn}
						className="mt-12 mb-1 text-xl font-bold text-violet-500"
					>
						Inner Loop: The Bolt (Context Recovery)
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						This is the clever part. AI agents have limited memory -- called a
						&ldquo;context window.&rdquo; When the memory fills up, a normal AI
						would forget everything. AI-DLC solves this by saving progress to
						files on disk. When a new session starts, the AI reads those files
						and picks up exactly where it left off. This is called a{" "}
						<strong className="text-violet-500">bolt</strong> -- one focused
						work session.
					</motion.p>

					<FuelGauge />

					<ChatBubble speaker="system">
						<code className="text-amber-500">enforce-iteration.sh</code> fires
						when a session ends. It checks what work remains. If units are still
						in progress, it tells the next session to call{" "}
						<code className="text-amber-500">/ai-dlc:execute</code> to continue. The AI
						never &ldquo;forgets&rdquo; mid-task.
					</ChatBubble>

					{/* Deep Dive: State Management */}
					<DeepDive
						title="Deep Dive: State Management -- How Nothing Gets Lost"
						forceOpen={isRef}
					>
						<p className="mb-3">
							AI-DLC uses a two-tier persistence model that separates permanent
							project artifacts from temporary working state.
						</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="rounded-lg border border-green-300 bg-green-50/30 p-4 dark:border-green-800 dark:bg-green-950/10">
								<div className="mb-2 text-xs font-bold uppercase tracking-wider text-green-500">
									Committed Artifacts
								</div>
								<p className="mb-2 text-xs text-gray-500">
									Checked into version control. Survives everything.
								</p>
								<code className="text-xs text-gray-400">
									.ai-dlc/&#123;intent-slug&#125;/
								</code>
								<ul className="mt-2 list-disc pl-4 text-xs text-gray-500">
									<li>intent.md</li>
									<li>unit-01-*.md, unit-02-*.md</li>
									<li>completion-criteria.md</li>
									<li>discovery.md</li>
								</ul>
							</div>
							<div className="rounded-lg border border-orange-300 bg-orange-50/30 p-4 dark:border-orange-800 dark:bg-orange-950/10">
								<div className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-500">
									Ephemeral State
								</div>
								<p className="mb-2 text-xs text-gray-500">
									Gitignored. Survives /clear but not branch switches.
								</p>
								<code className="text-xs text-gray-400">
									.ai-dlc/&#123;intent-slug&#125;/state/
								</code>
								<ul className="mt-2 list-disc pl-4 text-xs text-gray-500">
									<li>iteration.json</li>
									<li>scratchpad.md</li>
									<li>blockers.md</li>
									<li>current-plan.md</li>
								</ul>
							</div>
						</div>
						<p className="mt-3">
							If ephemeral state is lost,{" "}
							<code className="text-amber-500">/ai-dlc:resume</code> can reconstruct it
							from the committed artifacts and git history.
						</p>
					</DeepDive>

					{/* Summary box */}
					<motion.div
						{...fadeIn}
						className="mt-8 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
					>
						<h4 className="mb-2 font-semibold text-gray-800 dark:text-gray-200">
							How do these three loops work together?
						</h4>
						<p className="text-sm text-gray-500 dark:text-gray-400">
							The <strong className="text-green-500">assembly line</strong>{" "}
							picks the next unit. The{" "}
							<strong className="text-amber-400">hat rotation</strong> builds
							that unit through plan, build, review cycles. And within each
							hat&rsquo;s work session, the{" "}
							<strong className="text-violet-500">bolt</strong> ensures that
							even if the AI&rsquo;s memory runs out, progress is never lost.
						</p>
						<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
							A single feature might involve 4 units, each going through 2-3 hat
							rotations, each rotation spanning 1-3 bolts. That&rsquo;s
							potentially hours of autonomous building -- all from one planning
							conversation.
						</p>
					</motion.div>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* ACT 4: QUALITY AND SAFETY */}
			{/* ============================================================ */}
			<Section id="act4">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Act 4: Quality and Safety
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-6 text-gray-500 dark:text-gray-400"
					>
						Two systems keep everything on track: quality gates that enforce
						standards, and hooks that run silently in the background.
					</motion.p>

					<motion.h3
						{...fadeIn}
						className="mt-8 mb-2 text-xl font-bold text-cyan-400"
					>
						Quality Gates -- The Tollbooths
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Every time the AI tries to stop, it must pass through a gate. Quality
						gates are harness-enforced — defined in frontmatter, run by hooks, no exceptions.
					</motion.p>

					<Tollbooth />

					{/* Quality Gate Lifecycle */}
					<motion.h4
						{...fadeIn}
						className="mt-10 mb-1 text-base font-bold text-cyan-400"
					>
						How Quality Gates Work: Detection → Definition → Enforcement
					</motion.h4>
					<motion.p
						{...fadeIn}
						className="mb-3 text-sm text-gray-500 dark:text-gray-400"
					>
						Quality gates aren&apos;t hardcoded. They&apos;re discovered from your
						repo, written into version-controlled frontmatter, and enforced
						mechanically by the harness — all without any manual configuration.
					</motion.p>

					<QualityGateLifecycle />

					<motion.p
						{...fadeIn}
						className="mt-6 mb-2 text-gray-700 dark:text-gray-300"
					>
						Three hard gates stand between hats. The harness enforces them mechanically — the agent cannot bypass them:
					</motion.p>

					<GateCards />

					{/* Hooks */}
					<motion.h3
						{...fadeIn}
						className="mt-12 mb-2 text-xl font-bold text-gray-500 dark:text-gray-400"
					>
						The Safety Net -- Hooks
					</motion.h3>
					<motion.p
						{...fadeIn}
						className="mb-2 text-gray-500 dark:text-gray-400"
					>
						Hooks are automated scripts that fire at specific moments during a
						session. They run silently. You never see them. But they keep
						everything honest.
					</motion.p>

					<HookTimeline />

					{/* Deep Dive: All Hooks */}
					<DeepDive
						title="Deep Dive: All Hooks -- The Complete Safety System"
						forceOpen={isRef}
					>
						<p className="mb-3">
							Eight hooks (plus one support script) form the automated safety
							system. Each fires at a specific point in the Claude Code lifecycle.
						</p>
						<div className="space-y-2">
							{[
								{
									name: "inject-context.sh",
									trigger: "Session start",
									desc: "Loads state from filesystem. Injects current hat instructions, intent description, completion criteria.",
								},
								{
									name: "redirect-plan-mode.sh",
									trigger: "Pre-tool-use",
									desc: "Intercepts Claude's native plan mode and redirects to /ai-dlc:elaborate.",
								},
								{
									name: "subagent-hook.sh",
									trigger: "Pre-tool-use (Task)",
									desc: "Injects AI-DLC context into sub-agents so child agents are aware of the current intent.",
								},
								{
									name: "prompt-guard.sh",
									trigger: "Pre-tool-use",
									desc: "Scans .ai-dlc/ files for potential prompt injection patterns.",
								},
								{
									name: "workflow-guard.sh",
									trigger: "Pre-tool-use",
									desc: "Warns when the AI attempts file edits outside the scope of the current hat.",
								},
								{
									name: "context-monitor.sh",
									trigger: "Post-tool-use",
									desc: "Monitors context window usage. Warns at 35% remaining.",
								},
								{
									name: "quality-gate.sh",
									trigger: "Session end (sync)",
									desc: "Harness-enforced quality gates. Reads quality_gates: from intent and unit frontmatter, runs each gate command, and blocks the agent from stopping if any fail. Only enforced on building hats.",
								},
								{
									name: "enforce-iteration.sh",
									trigger: "Session end",
									desc: 'Checks DAG status for remaining work. The "keep going" mechanism.',
								},
								{
									name: "subagent-context.sh",
									trigger: "Support script",
									desc: "Provides the context payload that subagent-hook.sh injects.",
								},
							].map((hook) => (
								<div
									key={hook.name}
									className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950"
								>
									<code className="text-xs font-bold text-amber-500">
										{hook.name}
									</code>
									<span className="rounded bg-gray-200 px-1.5 py-0.5 text-[0.65rem] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
										{hook.trigger}
									</span>
									<span className="basis-full text-xs text-gray-500 dark:text-gray-400">
										{hook.desc}
									</span>
								</div>
							))}
						</div>
					</DeepDive>

					{/* Summary */}
					<motion.div
						{...fadeIn}
						className="mt-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
					>
						<h4 className="mb-2 font-semibold text-gray-800 dark:text-gray-200">
							Why all this machinery?
						</h4>
						<p className="text-sm text-gray-500 dark:text-gray-400">
							AI is powerful but imperfect. Without guardrails, an AI might skip
							tests, write code outside its current task, or lose track of
							progress when a session ends. These hooks and gates create a
							safety net -- not to slow things down, but to keep the AI honest
							and productive. Think of them as the rules of the road that make
							autonomous driving possible.
						</p>
					</motion.div>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* ACT 5: FINISHING AND LEARNING */}
			{/* ============================================================ */}
			<Section id="act5">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-2 text-3xl font-bold">
						Act 5: Finishing and Learning
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-6 text-gray-500 dark:text-gray-400"
					>
						All units are done. The code is written. The tests pass. But the
						story isn&rsquo;t over yet. Four stages remain.
					</motion.p>

					<div className="space-y-8">
						{/* Stage 1: Integration */}
						<FinishStage num={1} numColor="bg-cyan-500/15 text-cyan-400">
							<h3 className="text-lg font-bold text-cyan-400">
								Integration Check
							</h3>
							<p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
								All the individual pieces are done. Now they need to work{" "}
								<em>together</em>.
							</p>
							<p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
								The merged code is validated as a whole. Cross-unit tests run.
								Does the callback handler actually connect to the session
								manager? Does the login UI correctly call the callback endpoint?
								If issues are found, specific units get sent back for rework --
								not the entire feature.
							</p>
						</FinishStage>

						{/* Stage 2: Delivery */}
						<FinishStage num={2} numColor="bg-green-500/15 text-green-500">
							<h3 className="text-lg font-bold text-green-500">Delivery</h3>
							<div className="mt-3 space-y-3">
								<ChatBubble speaker="ai">
									All units complete! Here&rsquo;s what was built:
									<div className="mt-2 space-y-0.5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-950">
										<div>
											<strong>4 units</strong> implemented and reviewed
										</div>
										<div>
											<strong>4/4 criteria</strong> verified with evidence
										</div>
										<div>
											<strong>47 files</strong> changed across backend and
											frontend
										</div>
										<div>
											<strong>23 tests</strong> added, all passing
										</div>
									</div>
									<p className="mt-2 text-xs">Creating a pull request now...</p>
								</ChatBubble>
								<ChatBubble speaker="human">
									Review the PR. Check the diffs. Read the summary. The PR
									description includes everything -- what changed, why, how it
									was tested, and links to each unit&rsquo;s criteria
									verification. Then approve and merge.
								</ChatBubble>
							</div>
						</FinishStage>

						{/* Stage 3: Operations */}
						<FinishStage num={3} numColor="bg-amber-500/15 text-amber-400">
							<h3 className="text-lg font-bold text-amber-400">
								Operations
							</h3>
							<p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
								The code is deployed. Now it needs to be <em>operated</em>.
							</p>
							<div className="mt-3 space-y-3">
								<ChatBubble speaker="ai">
									<div className="mb-2">
										I found 3 operational tasks defined during execution:
									</div>
									<div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-950">
										<div className="border-b border-gray-200 pb-1 dark:border-gray-700">
											<strong className="text-amber-400">Scheduled:</strong>{" "}
											Token cleanup job -- runs daily, removes expired sessions
										</div>
										<div className="border-b border-gray-200 pb-1 dark:border-gray-700">
											<strong className="text-amber-400">Reactive:</strong>{" "}
											Alert handler for auth failure spike -- triggers investigation playbook
										</div>
										<div>
											<strong className="text-amber-400">Runbook:</strong>{" "}
											OAuth provider rotation -- step-by-step credential rotation procedure
										</div>
									</div>
								</ChatBubble>
								<ChatBubble speaker="human">
									Review operational specs. Deploy scheduled jobs. Verify
									monitoring and alerts are wired up. The AI manages the
									operational lifecycle alongside the code it built.
								</ChatBubble>
							</div>
							<p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
								Operations aren&rsquo;t an afterthought -- they&rsquo;re
								file-based specs created <em>during</em> execution, living
								alongside the code they support.
							</p>
						</FinishStage>

						{/* Stage 4: Reflection */}
						<FinishStage num={4} numColor="bg-violet-500/15 text-violet-400">
							<h3 className="text-lg font-bold text-violet-400">Reflection</h3>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								This is what separates AI-DLC from &ldquo;just running an
								AI.&rdquo; The system learns from every cycle.
							</p>
							<div className="mt-3 space-y-3">
								<ChatBubble speaker="ai">
									<div className="mb-2">
										Here&rsquo;s what I learned from this cycle:
									</div>
									<div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-950">
										<div className="border-b border-gray-200 pb-1 dark:border-gray-700">
											<strong className="text-cyan-400">Metrics:</strong> 4
											units, 12 iterations, 3 reviewer round-trips
										</div>
										<div className="border-b border-gray-200 pb-1 dark:border-gray-700">
											<strong className="text-amber-400">
												Friction point:
											</strong>{" "}
											The builder had trouble with OAuth callback -- test
											fixtures for mock OAuth servers were missing
										</div>
										<div className="border-b border-gray-200 pb-1 dark:border-gray-700">
											<strong className="text-green-500">What worked:</strong>{" "}
											TDD-style approach for session management produced clean
											code on the first reviewer pass
										</div>
										<div>
											<strong className="text-violet-400">
												Recommendations:
											</strong>
											<ul className="mt-1 list-disc pl-4 text-gray-500">
												<li>
													Add{" "}
													<code className="text-amber-500">
														eslint-plugin-security
													</code>{" "}
													to quality gates
												</li>
												<li>Create a shared OAuth mock server fixture</li>
												<li>
													Consider the adversarial workflow for
													security-sensitive features
												</li>
											</ul>
										</div>
									</div>
								</ChatBubble>
								<ChatBubble speaker="human">
									You validate the AI&rsquo;s analysis. Then choose what&rsquo;s
									next:
									<div className="mt-2 flex flex-wrap gap-1.5">
										<BubbleOption variant="selected">
											Apply recommendations
										</BubbleOption>
										<BubbleOption variant="blue">
											Start a follow-up
										</BubbleOption>
										<BubbleOption variant="blue">
											Archive and close
										</BubbleOption>
									</div>
								</ChatBubble>
							</div>

							<div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800 dark:bg-violet-950/10">
								<p className="text-xs text-gray-500 dark:text-gray-400">
									<strong className="text-violet-400">
										Why reflection matters:
									</strong>{" "}
									Each cycle makes the next one better. The AI remembers what
									worked, what didn&rsquo;t, and adapts. The first feature takes
									the longest. Every subsequent one is faster and smoother.
								</p>
							</div>
						</FinishStage>
					</div>

					{/* Deep Dive: Integration */}
					<DeepDive
						title="Deep Dive: Integration Validation -- The 10 Steps of /ai-dlc:integrate"
						forceOpen={isRef}
					>
						<ol className="list-decimal space-y-1.5 pl-5">
							<li>
								Merged state verification -- all unit branches properly merged
							</li>
							<li>
								Backpressure re-run -- full test suite, type checking, linting
							</li>
							<li>
								Criteria cross-check -- all intent-level completion criteria
								satisfied
							</li>
							<li>Cross-unit integration tests</li>
							<li>
								Emergent issue detection -- naming conflicts, resource
								contention
							</li>
							<li>Deployment manifest validation</li>
							<li>Monitoring configuration check</li>
							<li>Operations readiness -- runbooks and procedures</li>
							<li>Dry-run simulation</li>
							<li>Decision gate -- final human approval</li>
						</ol>
					</DeepDive>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* YOUR TOOLKIT */}
			{/* ============================================================ */}
			<Section id="toolkit">
				<Wide>
					<motion.h2 {...fadeIn} className="mb-1 text-3xl font-bold">
						Your Toolkit
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mb-8 italic text-gray-500 dark:text-gray-400"
					>
						Every command you need, organized by when you&rsquo;ll reach for it
					</motion.p>

					{/* Before You Build */}
					<ToolkitGroup title="Before You Build" color="violet">
						<ToolkitCard
							cmd="/ai-dlc:setup"
							tagline="Configure AI-DLC for your project"
							color="violet"
						>
							<ul className="list-disc pl-4">
								<li>
									Auto-detects your VCS, hosting, CI/CD, and connected tools
								</li>
								<li>
									Creates <code>.ai-dlc/settings.yml</code> with your
									preferences
								</li>
								<li>You only run this once</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:ideate"
							tagline="Surface improvement ideas from your codebase"
							color="violet"
						>
							<ul className="list-disc pl-4">
								<li>AI analyzes your code across 5 dimensions</li>
								<li>Each idea survives adversarial filtering</li>
								<li>Great for &ldquo;what should we work on next?&rdquo;</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:backlog"
							tagline="Parking lot for ideas not ready yet"
							color="violet"
						>
							<ul className="list-disc pl-4">
								<li>
									<code>add</code>, <code>list</code>, <code>review</code>,{" "}
									<code>promote</code>
								</li>
								<li>Your project&rsquo;s idea shelf</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:seed"
							tagline="Plant ideas that surface at the right time"
							color="violet"
						>
							<ul className="list-disc pl-4">
								<li>Save ideas with trigger conditions</li>
								<li>Seeds auto-surface during relevant elaboration</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:autopilot"
							tagline="Full autonomous lifecycle in one command"
							color="violet"
						>
							<ul className="list-disc pl-4">
								<li>Elaborate -&gt; execute -&gt; deliver end-to-end</li>
								<li>
									Pauses on ambiguity, &gt;5 units, and before creating a PR
								</li>
							</ul>
						</ToolkitCard>
					</ToolkitGroup>

					{/* While You Build */}
					<ToolkitGroup title="While You Build" color="amber">
						<ToolkitCard
							cmd="/ai-dlc:elaborate"
							tagline="Plan your work collaboratively"
							color="amber"
						>
							<p>
								The main entry point: define intent, explore domain, decompose
								into units, set success criteria.
							</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:execute"
							tagline="Run the autonomous build loop"
							color="amber"
						>
							<p>
								Picks up units from the DAG, spawns hatted agents, iterates
								until done.
							</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:refine"
							tagline="Change specs mid-construction"
							color="amber"
						>
							<p>Preserves frontmatter and state, re-queues affected units.</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:quick"
							tagline="Skip everything for tiny fixes"
							color="amber"
						>
							<p>
								Typos, config tweaks, import fixes. No state files, no
								subagents.
							</p>
						</ToolkitCard>
					</ToolkitGroup>

					{/* When Things Go Sideways */}
					<ToolkitGroup title="When Things Go Sideways" color="rose">
						<ToolkitCard
							cmd="/ai-dlc:resume"
							tagline="Pick up where you left off"
							color="rose"
						>
							<ul className="list-disc pl-4">
								<li>Lost your session? Context compacted?</li>
								<li>Finds previous work from filesystem or git branches</li>
								<li>Creates worktrees and restores state</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard cmd="/ai-dlc:reset" tagline="Start fresh" color="rose">
							<ul className="list-disc pl-4">
								<li>Clears all AI-DLC state</li>
								<li>Preserves your git commits and branches</li>
							</ul>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:cleanup"
							tagline="Remove stale worktrees"
							color="rose"
						>
							<ul className="list-disc pl-4">
								<li>Scans for orphaned and merged worktrees</li>
								<li>Asks before deleting anything</li>
							</ul>
						</ToolkitCard>
					</ToolkitGroup>

					{/* After You Build */}
					<ToolkitGroup title="After You Build" color="green">
						<ToolkitCard
							cmd="/ai-dlc:reflect"
							tagline="Analyze what happened"
							color="green"
						>
							<p>
								Produces reflection.md with what worked and
								settings-recommendations.md with improvements.
							</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:operate"
							tagline="Manage post-deployment operations"
							color="green"
						>
							<p>
								List, execute, deploy, monitor, and teardown operational tasks.
							</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:followup"
							tagline="Iterate on a completed intent"
							color="green"
						>
							<p>
								Creates a new intent that builds on a previous one, carrying
								forward all context.
							</p>
						</ToolkitCard>
						<ToolkitCard
							cmd="/ai-dlc:compound"
							tagline="Capture learnings from this session"
							color="green"
						>
							<p>
								Analyzes git history and intent state, writes structured
								learning files.
							</p>
						</ToolkitCard>
					</ToolkitGroup>

					{/* Internal skills */}
					<motion.div
						{...fadeIn}
						className="mt-10 rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50"
					>
						<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
							Internal Skills (run automatically)
						</h4>
						<p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
							These fire behind the scenes -- you never call them directly:
						</p>
						<div className="flex flex-wrap gap-1.5">
							{[
								"/ai-dlc:advance",
								"/ai-dlc:fail",
								"/ai-dlc:integrate",
								"/ai-dlc:elaborate-discover",
								"/ai-dlc:elaborate-wireframes",
								"/ai-dlc:elaborate-ticket-sync",
								"/ai-dlc:fundamentals",
								"/ai-dlc:completion-criteria",
								"/ai-dlc:backpressure",
								"/ai-dlc:blockers",
							].map((skill) => (
								<span
									key={skill}
									className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-mono text-[0.7rem] text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400"
								>
									{skill}
								</span>
							))}
						</div>
					</motion.div>
				</Wide>
			</Section>

			{/* ============================================================ */}
			{/* EPILOGUE: THE CYCLE CONTINUES */}
			{/* ============================================================ */}
			<Section id="epilogue">
				<Container>
					<motion.h2
						{...fadeIn}
						className="mb-4 text-center text-3xl font-bold"
					>
						The Cycle Continues
					</motion.h2>
					<motion.p
						{...fadeIn}
						className="mx-auto max-w-xl text-center leading-relaxed text-gray-500 dark:text-gray-400"
					>
						Every completed intent makes the next one better. Reflections feed
						into seeds. Seeds surface during elaboration. Compound learnings
						inform future builders. The methodology improves itself -- and your
						codebase -- with every cycle.
					</motion.p>

					{/* Final CTA */}
					<motion.div {...fadeIn} className="mt-10 text-center">
						<div className="inline-block rounded-lg bg-gray-900 p-4 text-left font-mono text-sm text-white dark:bg-gray-800">
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
						<div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<Link
								href="/docs/installation/"
								className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
							>
								View full installation guide
							</Link>
							<span className="hidden text-gray-400 sm:inline">&middot;</span>
							<Link
								href="/paper/"
								className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
							>
								Read the paper
							</Link>
							<span className="hidden text-gray-400 sm:inline">&middot;</span>
							<Link
								href="/start-here/"
								className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
							>
								Start here
							</Link>
						</div>
					</motion.div>
				</Container>
			</Section>
		</div>
	)
}

// ============================================================
// HELPER COMPONENTS (used only in this page)
// ============================================================

function Section({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<section
			id={id}
			className="border-t border-gray-200 px-4 py-16 sm:py-20 dark:border-gray-800"
		>
			{children}
		</section>
	)
}

function Container({ children }: { children: React.ReactNode }) {
	return <div className="mx-auto max-w-4xl">{children}</div>
}

function Wide({ children }: { children: React.ReactNode }) {
	return <div className="mx-auto max-w-5xl">{children}</div>
}

function Legend({ color, label }: { color: string; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className={`inline-block h-3 w-3 rounded-full ${color}`} />
			<span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
		</div>
	)
}

function CastList({ items }: { items: React.ReactNode[] }) {
	return (
		<ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
			{items.map((item, i) => (
				<li
					key={typeof item === "string" ? item : `item-${i}`}
					className="flex gap-1.5"
				>
					<span className="text-gray-400">&bull;</span>
					<span>{item}</span>
				</li>
			))}
		</ul>
	)
}

function WorkflowGroup({
	name,
	badge,
	bgClass,
	labelColor,
	borderColor,
	hats,
}: {
	name: string
	badge: string
	bgClass: string
	labelColor: string
	borderColor: string
	hats: { icon: string; name: string; desc: string }[]
}) {
	return (
		<motion.div {...fadeIn} className={`mb-8 rounded-xl p-5 ${bgClass}`}>
			<div
				className={`mb-3.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider ${labelColor}`}
			>
				{name}
				<span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold normal-case tracking-normal">
					{badge}
				</span>
			</div>
			<div className="flex flex-wrap items-stretch gap-3 max-sm:flex-col">
				{hats.map((hat, i) => (
					<div
						key={`${hat.name}-${hat.desc.slice(0, 20)}`}
						className="contents"
					>
						{i > 0 && <HatArrow />}
						<HatCard
							icon={hat.icon}
							name={hat.name}
							description={hat.desc}
							borderColor={`border-l-[3px] ${borderColor}`}
						/>
					</div>
				))}
			</div>
		</motion.div>
	)
}

function PhaseSummary({
	icon,
	label,
	labelColor,
	desc,
}: { icon: string; label: string; labelColor: string; desc: string }) {
	return (
		<div className="text-center">
			<div className="mb-1.5 text-xl">{icon}</div>
			<div className="text-xs text-gray-500 dark:text-gray-400">
				<strong className={labelColor}>{label}</strong> {desc}
			</div>
		</div>
	)
}

function ShortcutPill({ cmd, desc }: { cmd: string; desc: string }) {
	return (
		<div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 dark:border-gray-700 dark:bg-gray-900">
			<code className="text-sm font-bold text-amber-500">{cmd}</code>
			<span className="text-xs text-gray-500 dark:text-gray-400">{desc}</span>
		</div>
	)
}

function WorkflowPill({
	name,
	flow,
	recommended,
}: { name: string; flow: string; recommended?: boolean }) {
	return (
		<div
			className={`flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm ${
				recommended
					? "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-950/10"
					: "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
			}`}
		>
			<span className="font-semibold text-gray-800 dark:text-gray-200">
				{name}
			</span>
			<span className="text-xs text-gray-500 dark:text-gray-400">{flow}</span>
			{recommended && (
				<span className="ml-auto rounded-lg bg-green-100 px-2 py-0.5 text-[0.65rem] font-semibold text-green-500 dark:bg-green-900/30">
					recommended
				</span>
			)}
		</div>
	)
}

function DagUnit({
	id,
	name,
	deps,
}: { id: string; name: string; deps: string }) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-950">
			<span className="min-w-[60px] text-sm font-bold text-amber-500">
				{id}
			</span>
			<span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
				{name}
			</span>
			<span className="text-xs text-gray-500 dark:text-gray-400">{deps}</span>
		</div>
	)
}

function DagArrow() {
	return <div className="ml-7 h-3 w-0.5 bg-gray-300 dark:bg-gray-600" />
}

function MiniCard({
	title,
	titleColor,
	desc,
}: { title: string; titleColor: string; desc: string }) {
	return (
		<div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950">
			<div className={`mb-1 text-xs font-semibold ${titleColor}`}>{title}</div>
			<div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
		</div>
	)
}

function FinishStage({
	num,
	numColor,
	children,
}: { num: number; numColor: string; children: React.ReactNode }) {
	return (
		<motion.div
			{...fadeIn}
			className="relative rounded-xl border border-gray-200 bg-white p-7 pl-20 dark:border-gray-700 dark:bg-gray-900 max-sm:pl-7 max-sm:pt-16"
		>
			<span
				className={`absolute left-6 top-7 flex h-10 w-10 items-center justify-center rounded-full text-lg font-extrabold ${numColor} max-sm:top-4`}
			>
				{num}
			</span>
			{children}
		</motion.div>
	)
}
