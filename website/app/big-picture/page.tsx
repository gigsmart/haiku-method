import type { Metadata } from "next"
import Link from "next/link"
import { BigPictureDiagram } from "../components/big-picture"

export const metadata: Metadata = {
	title: "Big Picture - AI-DLC",
	description:
		"Interactive overview of the AI-DLC methodology showing the relationship between development phases, hats, operating modes, and core principles.",
	openGraph: {
		title: "Big Picture - AI-DLC",
		description:
			"Interactive diagram showing the complete AI-DLC methodology structure.",
	},
}

export default function BigPicturePage() {
	return (
		<div className="px-4 py-12 sm:py-16">
			<div className="mx-auto max-w-6xl">
				{/* Header */}
				<div className="mb-12 text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
						The Big Picture
					</h1>
					<p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
						An interactive overview of the AI-DLC methodology. Click any element
						to explore its documentation.
					</p>
				</div>

				{/* Diagram */}
				<BigPictureDiagram />

				{/* Explanation sections */}
				<div className="mt-16 grid gap-8 md:grid-cols-2">
					<ExplanationCard
						title="Development Phases"
						description="Work flows from Intent (what you want to build) through optional Passes (cross-functional iterations), Units (cohesive work elements), and Bolts (focused iteration cycles) to Deploy (shipping verified work)."
						href="/docs/concepts/"
						color="blue"
					/>
					<ExplanationCard
						title="The Hat System"
						description="Each hat represents a distinct mindset. The core workflow uses Planner, Builder, and Reviewer, with specialized hats for security testing, design, debugging, and TDD."
						href="/docs/hats/"
						color="purple"
					/>
					<ExplanationCard
						title="Operating Modes"
						description="Choose your autonomy level: HITL for high-risk work with human approval at each step, OHOTL for observed execution, or AHOTL for autonomous operation within boundaries."
						href="/docs/concepts/#operating-modes"
						color="amber"
					/>
					<ExplanationCard
						title="Core Principles"
						description="AI-DLC is built on backpressure (quality gates that block), clear completion criteria, collapsed SDLC phases, and two-tier state management."
						href="/docs/concepts/#backpressure"
						color="green"
					/>
				</div>

				{/* CTA */}
				<div className="mt-16 text-center">
					<p className="mb-4 text-gray-600 dark:text-gray-400">
						Ready to dive deeper?
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Link
							href="/docs/"
							className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
						>
							Read the Documentation
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
									d="M13 7l5 5m0 0l-5 5m5-5H6"
								/>
							</svg>
						</Link>
						<Link
							href="/docs/workflows/"
							className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
						>
							Explore Workflows
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}

function ExplanationCard({
	title,
	description,
	href,
	color,
}: {
	title: string
	description: string
	href: string
	color: "blue" | "purple" | "amber" | "green"
}) {
	const colorClasses = {
		blue: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50",
		purple:
			"border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/50",
		amber:
			"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50",
		green:
			"border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50",
	}

	const titleClasses = {
		blue: "text-blue-700 dark:text-blue-300",
		purple: "text-purple-700 dark:text-purple-300",
		amber: "text-amber-700 dark:text-amber-300",
		green: "text-green-700 dark:text-green-300",
	}

	return (
		<Link
			href={href}
			className={`block rounded-xl border p-6 transition hover:shadow-md ${colorClasses[color]}`}
		>
			<h3 className={`mb-2 text-lg font-semibold ${titleClasses[color]}`}>
				{title}
			</h3>
			<p className="text-gray-600 dark:text-gray-400">{description}</p>
		</Link>
	)
}
