"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

interface Step {
	id: string
	title: string
	description: string
	items: {
		id: string
		label: string
		href: string
		external?: boolean
	}[]
}

const steps: Step[] = [
	{
		id: "understand",
		title: "1. Understand the Concepts",
		description:
			"Learn the core ideas behind AI-DLC before diving into implementation.",
		items: [
			{
				id: "big-picture",
				label: "View the Big Picture diagram",
				href: "/big-picture/",
			},
			{
				id: "intro",
				label: "Read the Introduction",
				href: "/docs/",
			},
			{
				id: "hats",
				label: "Learn about the Hat System",
				href: "/docs/hats/",
			},
			{
				id: "concepts",
				label: "Understand Key Concepts",
				href: "/docs/concepts/",
			},
		],
	},
	{
		id: "explore",
		title: "2. Explore the Tools",
		description:
			"Try our interactive tools to see how AI-DLC works in practice.",
		items: [
			{
				id: "mode-selector",
				label: "Use the Mode Selector",
				href: "/tools/mode-selector/",
			},
			{
				id: "workflows",
				label: "Explore Workflow Visualizer",
				href: "/workflows/",
			},
		],
	},
	{
		id: "implement",
		title: "3. Set Up AI-DLC",
		description: "Install the plugin and configure your first project.",
		items: [
			{
				id: "install",
				label: "Install the Claude Code plugin",
				href: "/docs/installation/",
			},
			{
				id: "quick-start",
				label: "Follow the Quick Start guide",
				href: "/docs/quick-start/",
			},
		],
	},
	{
		id: "practice",
		title: "4. Try Your First Intent",
		description: "Put AI-DLC into practice with a real task.",
		items: [
			{
				id: "first-intent",
				label: "Complete the First Intent checklist",
				href: "/docs/checklist-first-intent/",
			},
			{
				id: "feature-example",
				label: "Review the Feature Example",
				href: "/docs/example-feature/",
			},
			{
				id: "bugfix-example",
				label: "Review the Bugfix Example",
				href: "/docs/example-bugfix/",
			},
		],
	},
]

const STORAGE_KEY = "ai-dlc-onboarding-progress"

export default function StartHerePage() {
	const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
	const [mounted, setMounted] = useState(false)

	// Load progress from localStorage
	useEffect(() => {
		setMounted(true)
		const saved = localStorage.getItem(STORAGE_KEY)
		if (saved) {
			try {
				setCompletedItems(new Set(JSON.parse(saved)))
			} catch {
				// Invalid data, ignore
			}
		}
	}, [])

	// Save progress to localStorage
	useEffect(() => {
		if (mounted) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedItems]))
		}
	}, [completedItems, mounted])

	const toggleItem = (itemId: string) => {
		setCompletedItems((prev) => {
			const next = new Set(prev)
			if (next.has(itemId)) {
				next.delete(itemId)
			} else {
				next.add(itemId)
			}
			return next
		})
	}

	const totalItems = steps.reduce((acc, step) => acc + step.items.length, 0)
	const completedCount = completedItems.size
	const progressPercent = Math.round((completedCount / totalItems) * 100)

	const resetProgress = () => {
		setCompletedItems(new Set())
		localStorage.removeItem(STORAGE_KEY)
	}

	return (
		<div className="px-4 py-12">
			<div className="mx-auto max-w-3xl">
				{/* Header */}
				<div className="mb-8 text-center">
					<h1 className="mb-4 text-4xl font-bold">Start Here</h1>
					<p className="text-lg text-gray-600 dark:text-gray-400">
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
				</div>

				{/* Progress Bar */}
				<div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
					<div className="mb-2 flex items-center justify-between">
						<span className="font-medium">Your Progress</span>
						<span className="text-sm text-gray-500 dark:text-gray-400">
							{completedCount} of {totalItems} completed
						</span>
					</div>
					<div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
						<div
							className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
					{completedCount > 0 && (
						<button
							type="button"
							onClick={resetProgress}
							className="mt-3 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
						>
							Reset progress
						</button>
					)}
				</div>

				{/* Skip to Plugin */}
				<div className="mb-8 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium">Already familiar with AI-DLC?</p>
							<p className="text-sm text-gray-500 dark:text-gray-400">
								Skip the onboarding and install the plugin directly.
							</p>
						</div>
						<Link
							href="/docs/installation/"
							className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
						>
							Skip to Install
						</Link>
					</div>
				</div>

				{/* Steps */}
				<div className="space-y-6">
					{steps.map((step, stepIndex) => {
						const stepCompleted = step.items.every((item) =>
							completedItems.has(item.id),
						)
						const stepStarted = step.items.some((item) =>
							completedItems.has(item.id),
						)

						return (
							<div
								key={step.id}
								className={`rounded-xl border p-6 transition ${
									stepCompleted
										? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
										: stepStarted
											? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
											: "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
								}`}
							>
								<div className="mb-4 flex items-start justify-between">
									<div>
										<h2 className="text-xl font-semibold">{step.title}</h2>
										<p className="mt-1 text-gray-600 dark:text-gray-400">
											{step.description}
										</p>
									</div>
									{stepCompleted && (
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
											<svg
												className="h-5 w-5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										</div>
									)}
								</div>

								<ul className="space-y-3">
									{step.items.map((item) => {
										const isCompleted = completedItems.has(item.id)

										return (
											<li key={item.id} className="flex items-center gap-3">
												<button
													type="button"
													onClick={() => toggleItem(item.id)}
													className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
														isCompleted
															? "border-green-500 bg-green-500 text-white"
															: "border-gray-300 hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400"
													}`}
													aria-label={
														isCompleted
															? `Mark "${item.label}" as incomplete`
															: `Mark "${item.label}" as complete`
													}
												>
													{isCompleted && (
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
																strokeWidth={3}
																d="M5 13l4 4L19 7"
															/>
														</svg>
													)}
												</button>
												<Link
													href={item.href}
													target={item.external ? "_blank" : undefined}
													rel={
														item.external ? "noopener noreferrer" : undefined
													}
													className={`flex-1 transition hover:text-blue-600 dark:hover:text-blue-400 ${
														isCompleted
															? "text-gray-500 line-through dark:text-gray-500"
															: ""
													}`}
												>
													{item.label}
													{item.external && (
														<svg
															className="ml-1 inline-block h-3 w-3 opacity-50"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															aria-hidden="true"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
															/>
														</svg>
													)}
												</Link>
											</li>
										)
									})}
								</ul>
							</div>
						)
					})}
				</div>

				{/* Completion Message */}
				{progressPercent === 100 && (
					<div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/30">
						<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white">
							<svg
								className="h-8 w-8"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<h3 className="mb-2 text-xl font-semibold text-green-800 dark:text-green-200">
							Congratulations!
						</h3>
						<p className="mb-4 text-green-700 dark:text-green-300">
							You've completed the AI-DLC onboarding. You're ready to use AI-DLC
							in your projects.
						</p>
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<Link
								href="/docs/adoption-roadmap/"
								className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-700"
							>
								View Adoption Roadmap
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
								href="/docs/checklist-team-onboarding/"
								className="text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
							>
								Onboard your team
							</Link>
						</div>
					</div>
				)}

				{/* Help Section */}
				<div className="mt-12 text-center">
					<p className="text-gray-500 dark:text-gray-400">
						Need help?{" "}
						<Link
							href="/docs/community/"
							className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							Join the community
						</Link>{" "}
						or{" "}
						<a
							href="https://github.com/thebushidocollective/ai-dlc/discussions"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							start a discussion on GitHub
						</a>
						.
					</p>
				</div>
			</div>
		</div>
	)
}
