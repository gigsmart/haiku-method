import type { Metadata } from "next"
import { WorkflowVisualizer } from "../components/workflow-visualizer"

export const metadata: Metadata = {
	title: "Workflow Visualizer",
	description:
		"Interactive visualization of AI-DLC workflows showing hat transitions, operating modes, and iteration patterns.",
	openGraph: {
		title: "AI-DLC Workflow Visualizer",
		description:
			"See how different AI-DLC workflows progress through hats with animated transitions.",
	},
}

export default function WorkflowsPage() {
	return (
		<div className="px-4 py-12">
			<div className="mx-auto max-w-6xl">
				{/* Page header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold tracking-tight mb-4 sm:text-5xl">
						Workflow{" "}
						<span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
							Visualizer
						</span>
					</h1>
					<p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
						Explore the different AI-DLC workflows and see how hats transition
						through each phase. Click on any hat to see its responsibilities, or
						press play to watch the workflow animate.
					</p>
				</div>

				{/* Main visualizer */}
				<WorkflowVisualizer />

				{/* Additional information */}
				<div className="mt-16 grid gap-8 md:grid-cols-2">
					<div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
						<h2 className="text-xl font-semibold mb-3">Operating Modes</h2>
						<div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
							<p>
								<strong className="text-blue-600 dark:text-blue-400">
									HITL (Human-in-the-Loop):
								</strong>{" "}
								Human validates each step. Used for novel domains, high-risk
								decisions, and foundational choices.
							</p>
							<p>
								<strong className="text-green-600 dark:text-green-400">
									OHOTL (Observed Human-on-the-Loop):
								</strong>{" "}
								Human watches and can intervene. Used for creative work and
								medium-risk changes.
							</p>
							<p>
								<strong className="text-orange-600 dark:text-orange-400">
									AHOTL (Autonomous Human-on-the-Loop):
								</strong>{" "}
								AI operates autonomously within boundaries. Used for
								well-defined, verifiable tasks.
							</p>
						</div>
					</div>

					<div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
						<h2 className="text-xl font-semibold mb-3">Iteration Loops</h2>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							Each workflow includes an iteration loop that shows what happens
							when the final review identifies issues or when continued
							iteration is needed.
						</p>
						<ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
							<li className="flex items-start gap-2">
								<span className="text-amber-500">*</span>
								<span>
									<strong>Default:</strong> Reviewer loops back to Builder for
									fixes
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-amber-500">*</span>
								<span>
									<strong>TDD:</strong> Refactorer loops to Test Writer for next
									feature
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-amber-500">*</span>
								<span>
									<strong>Adversarial:</strong> Reviewer loops to Red Team for
									more testing
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-amber-500">*</span>
								<span>
									<strong>Hypothesis:</strong> Analyst loops to Hypothesizer for
									new theories
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	)
}
