"use client"

import { navigation, primaryNavItems } from "@/lib/navigation"
import Link from "next/link"
import { useState } from "react"

interface MobileNavProps {
	isOpen: boolean
	onClose: () => void
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
	const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

	if (!isOpen) return null

	const toggleCategory = (title: string) => {
		setExpandedCategory((prev) => (prev === title ? null : title))
	}

	// Primary links that don't have mega menu categories
	const standaloneLinks = primaryNavItems.filter(
		(item) =>
			!navigation.some(
				(cat) =>
					cat.href === item.href ||
					cat.sections.some((section) =>
						section.items.some((si) => si.href === item.href),
					),
			),
	)

	return (
		<div className="fixed inset-0 z-40 md:hidden">
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Panel */}
			<div className="fixed inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-white dark:bg-gray-950">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-gray-800">
					<span className="text-lg font-semibold">Menu</span>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-gray-800"
						aria-label="Close menu"
					>
						<svg
							className="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Navigation */}
				<nav className="px-4 py-6">
					{/* Standalone primary links */}
					{standaloneLinks.length > 0 && (
						<ul className="mb-4 space-y-1">
							{standaloneLinks.map((item) => (
								<li key={item.href}>
									<Link
										href={item.href}
										onClick={onClose}
										className="block rounded-lg px-3 py-2 font-medium transition hover:bg-gray-100 dark:hover:bg-gray-800"
									>
										{item.title}
									</Link>
								</li>
							))}
						</ul>
					)}

					{/* Expandable mega menu categories */}
					<ul className="space-y-2">
						{navigation.map((category) => (
							<li key={category.title}>
								<button
									type="button"
									onClick={() => toggleCategory(category.title)}
									className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-medium transition hover:bg-gray-100 dark:hover:bg-gray-800"
									aria-expanded={expandedCategory === category.title}
								>
									<span>{category.title}</span>
									<svg
										className={`h-5 w-5 transition-transform ${
											expandedCategory === category.title ? "rotate-180" : ""
										}`}
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>

								{/* Expanded content */}
								{expandedCategory === category.title && (
									<div className="mt-2 space-y-4 pl-3">
										{category.sections.map((section) => (
											<div key={section.title}>
												<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
													{section.title}
												</h3>
												<ul className="space-y-1">
													{section.items.map((item) => {
														const isExternal = item.href.startsWith("http")
														const LinkComponent = isExternal ? "a" : Link

														return (
															<li key={item.href}>
																<LinkComponent
																	href={item.href}
																	onClick={onClose}
																	{...(isExternal
																		? {
																				target: "_blank",
																				rel: "noopener noreferrer",
																			}
																		: {})}
																	className="block rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
																>
																	{item.title}
																	{isExternal && (
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
																</LinkComponent>
															</li>
														)
													})}
												</ul>
											</div>
										))}
									</div>
								)}
							</li>
						))}
					</ul>

					{/* Quick links */}
					<div className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800">
						<Link
							href="/docs/installation/"
							onClick={onClose}
							className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white transition hover:from-blue-700 hover:to-purple-700"
						>
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
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
							Install AI-DLC
						</Link>
					</div>

					{/* GitHub link */}
					<div className="mt-4">
						<a
							href="https://github.com/thebushidocollective/ai-dlc"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
						>
							<svg
								className="h-5 w-5"
								fill="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									fillRule="evenodd"
									d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
									clipRule="evenodd"
								/>
							</svg>
							View on GitHub
						</a>
					</div>
				</nav>
			</div>
		</div>
	)
}
