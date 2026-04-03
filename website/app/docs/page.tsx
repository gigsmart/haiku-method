import { getAllDocs } from "@/lib/docs"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Documentation - H\u00b7AI\u00b7K\u00b7U",
	description: "Learn how to use H\u00b7AI\u00b7K\u00b7U for iterative AI-driven development.",
}

export default function DocsPage() {
	const docs = getAllDocs()

	return (
		<div className="max-w-3xl">
			<h1 className="mb-4 text-4xl font-bold tracking-tight">Documentation</h1>
			<p className="mb-8 text-lg text-stone-600 dark:text-stone-400">
				Learn how to use H·AI·K·U to structure your AI-driven development
				workflow.
			</p>

			<div className="prose prose-gray dark:prose-invert max-w-none">
				<h2>Getting Started</h2>
				<p>Install the H·AI·K·U plugin in your Claude Code project:</p>
				<div className="not-prose my-4 rounded-lg bg-stone-100 p-4 font-mono text-sm dark:bg-stone-800">
					<div><code>/plugin marketplace add thebushidocollective/ai-dlc</code></div>
					<div><code>/plugin install haiku@thebushidocollective-ai-dlc --scope project</code></div>
				</div>

				<p>Then use the stage commands to structure your workflow:</p>
				<ul>
					<li>
						<code>/haiku:new</code> - Create a new intent and select a studio
					</li>
					<li>
						<code>/haiku:run</code> - Run the stage pipeline
					</li>
					<li>
						<code>/haiku:execute</code> - Drive unit implementations
					</li>
					<li>
						<code>/haiku:review</code> - Pre-delivery code review
					</li>
				</ul>

				<h2>Core Concepts</h2>
				<p>
					H·AI·K·U is built around <strong>studios</strong> and{" "}
					<strong>stages</strong> that guide your work through a structured
					lifecycle.
				</p>

				<h3>Studios</h3>
				<p>
					Studios are lifecycle templates tailored to different work types
					(software, design, etc.). Each studio defines the stages and phases
					appropriate for its domain.
				</p>

				<h3>Stages</h3>
				<p>
					Stages represent progression through the lifecycle: elaboration,
					execution, operation, and reflection. Each stage has specific phases
					that ensure thorough, disciplined delivery.
				</p>

				{docs.length > 0 && (
					<>
						<h2>Documentation Pages</h2>
						<ul>
							{docs.map((doc) => (
								<li key={doc.slug}>
									<Link
										href={`/docs/${doc.slug}/`}
										className="text-teal-600 hover:underline dark:text-teal-400"
									>
										{doc.title}
									</Link>
									{doc.description && (
										<span className="text-stone-600 dark:text-stone-400">
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
