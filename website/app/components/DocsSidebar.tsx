"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavItem {
	title: string
	href: string
	items?: NavItem[]
}

interface NavSection {
	title: string
	items: NavItem[]
}

interface DocsSidebarProps {
	navigation: NavSection[]
}

export function DocsSidebar({ navigation }: DocsSidebarProps) {
	const pathname = usePathname()

	return (
		<aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 overflow-y-auto pb-8 lg:block">
			<nav className="space-y-6">
				{navigation.map((section) => (
					<div key={section.title}>
						<h4 className="mb-2 font-semibold text-stone-900 dark:text-white">
							{section.title}
						</h4>
						<ul className="space-y-1 border-l border-stone-200 dark:border-stone-800">
							{section.items.map((item) => {
								const isActive = pathname === item.href
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											className={`-ml-px block border-l-2 py-1 pl-4 text-sm transition ${
												isActive
													? "border-teal-500 font-medium text-teal-600 dark:text-teal-400"
													: "border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:text-white"
											}`}
										>
											{item.title}
										</Link>
									</li>
								)
							})}
						</ul>
					</div>
				))}
			</nav>
		</aside>
	)
}
