"use client"

import { motion } from "framer-motion"

export function HatExplainer() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="mb-9 rounded-xl border-2 border-dashed border-amber-300/40 bg-amber-50/30 p-7 dark:border-amber-500/25 dark:bg-amber-950/10"
		>
			<span className="mb-3 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
				How It Works
			</span>
			<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
				What is a &ldquo;Hat&rdquo;?
			</h3>
			<p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
				A hat is a set of{" "}
				<strong className="text-amber-500">injected instructions</strong> that
				tells a fresh AI agent how to behave. Here&rsquo;s what actually
				happens:
			</p>

			{/* 3-step flow */}
			<div className="my-5 flex flex-col items-center gap-0 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-950">
				<Step
					num={1}
					title="Claude spawns a fresh agent"
					desc="Clean context, no prior baggage"
				/>
				<Connector />
				<Step
					num={2}
					title="The system injects hat instructions"
					desc="A markdown file that defines the role's behavior, rules, and quality gates"
				/>
				<Connector />
				<Step
					num={3}
					title="The agent works according to its hat"
					desc="It only knows how to be a Builder, or a Reviewer, etc."
				/>
			</div>

			<p className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
				Think of it like hiring a contractor: you bring someone in{" "}
				<em>(fresh agent)</em>, hand them a job description{" "}
				<em>(hat instructions)</em>, and they do exactly that job. When the
				job&rsquo;s done, they leave. The next job gets a new person with a new
				job description.
			</p>

			<div className="mt-4 grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2 dark:border-gray-700">
				<div>
					<strong className="mb-1 block text-xs text-amber-500">
						What&rsquo;s in a hat file?
					</strong>
					<p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
						Each hat is a markdown file (
						<code className="text-amber-500">
							plugin/hats/&#123;hat-name&#125;.md
						</code>
						) that defines:
					</p>
					<ul className="list-disc pl-4 text-xs text-gray-500 dark:text-gray-400">
						<li>What the agent MUST do (required steps)</li>
						<li>What the agent MUST NOT do (boundaries)</li>
						<li>Quality gates it must pass before finishing</li>
						<li>
							When to call <code className="text-green-500">/advance</code> or{" "}
							<code className="text-rose-500">/fail</code>
						</li>
					</ul>
				</div>
				<div>
					<strong className="mb-1 block text-xs text-amber-500">
						Why fresh agents?
					</strong>
					<p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
						Each hatted agent starts with a clean context window. This means:
					</p>
					<ul className="list-disc pl-4 text-xs text-gray-500 dark:text-gray-400">
						<li>No confusion from previous units or hats</li>
						<li>Full context budget for the current task</li>
						<li>Failures in one unit don&rsquo;t bleed into another</li>
					</ul>
				</div>
			</div>
		</motion.div>
	)
}

function Step({
	num,
	title,
	desc,
}: { num: number; title: string; desc: string }) {
	return (
		<div className="flex w-full max-w-md items-center gap-3.5 rounded-lg border border-amber-200/40 bg-amber-50/40 p-3.5 dark:border-amber-700/25 dark:bg-amber-950/10">
			<span className="flex h-7 w-7 min-w-[1.75rem] items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-gray-900">
				{num}
			</span>
			<span className="text-sm text-gray-600 dark:text-gray-300">
				<strong className="text-gray-900 dark:text-gray-100">{title}</strong>
				<br />
				{desc}
			</span>
		</div>
	)
}

function Connector() {
	return (
		<div className="relative h-4 w-0.5 flex-shrink-0 bg-amber-300/30 dark:bg-amber-600/20" />
	)
}
