import { getAllDocs } from "@/lib/docs"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Documentation - AI-DLC",
	description: "Learn how to use AI-DLC for iterative AI-driven development.",
}

export default function DocsPage() {
	const docs = getAllDocs()

	return (
		<div className="max-w-3xl">
			<h1 className="mb-4 text-4xl font-bold tracking-tight">Documentation</h1>
			<p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
				Learn how to use AI-DLC to structure your AI-driven development
				workflow.
			</p>

			<div className="prose prose-gray dark:prose-invert max-w-none">
				<h2>Quick Start</h2>
				<p>Install the AI-DLC plugin in your Claude Code project:</p>
				<div className="not-prose my-4 rounded-lg bg-gray-100 p-4 font-mono text-sm dark:bg-gray-800">
					<div><code>/plugin marketplace add thebushidocollective/ai-dlc</code></div>
					<div><code>/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project</code></div>
				</div>

				<p>Then use the hat commands to structure your workflow:</p>
				<ul>
					<li>
						<code>/researcher</code> - Switch to research mode
					</li>
					<li>
						<code>/planner</code> - Switch to planning mode
					</li>
					<li>
						<code>/builder</code> - Switch to building mode
					</li>
					<li>
						<code>/reviewer</code> - Switch to review mode
					</li>
				</ul>

				<h2>Core Concepts</h2>
				<p>
					AI-DLC is built around two core concepts: <strong>hats</strong> and{" "}
					<strong>units</strong>.
				</p>

				<h3>Hats</h3>
				<p>
					Hats represent distinct mindsets and responsibilities. Each hat has a
					specific purpose and switching between them is intentional. This
					prevents context drift and ensures each phase of development gets
					proper attention.
				</p>

				<h3>Units</h3>
				<p>
					Units are focused pieces of work with clear success criteria. Breaking
					work into units ensures progress is measurable and momentum is
					maintained. Each unit goes through all four hat phases.
				</p>

				{docs.length > 0 && (
					<>
						<h2>Documentation Pages</h2>
						<ul>
							{docs.map((doc) => (
								<li key={doc.slug}>
									<Link
										href={`/docs/${doc.slug}/`}
										className="text-blue-600 hover:underline dark:text-blue-400"
									>
										{doc.title}
									</Link>
									{doc.description && (
										<span className="text-gray-600 dark:text-gray-400">
											{" "}
											- {doc.description}
										</span>
									)}
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</div>
	)
}
