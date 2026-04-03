"use client"

import type { NavSection } from "@/lib/navigation"
import Link from "next/link"

interface MegaMenuSectionProps {
	section: NavSection
	onItemClick?: () => void
}

export function MegaMenuSection({
	section,
	onItemClick,
}: MegaMenuSectionProps) {
	return (
		<div>
			<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
								onClick={onItemClick}
								{...(isExternal
									? { target: "_blank", rel: "noopener noreferrer" }
									: {})}
								className="group block rounded-lg p-2 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
							>
								<div className="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
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
								</div>
								{item.description && (
									<p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
										{item.description}
									</p>
								)}
							</LinkComponent>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
