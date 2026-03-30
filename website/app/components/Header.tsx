"use client"

import { navigation, primaryNavItems } from "@/lib/navigation"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { ThemeToggle } from "./ThemeToggle"
import { BottomNav, MegaMenu, MobileNav } from "./navigation"

export function Header() {
	const pathname = usePathname()
	const [openCategory, setOpenCategory] = useState<string | null>(null)
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const headerRef = useRef<HTMLElement>(null)

	// Close mega menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
				setOpenCategory(null)
			}
		}

		document.addEventListener("click", handleClickOutside)
		return () => document.removeEventListener("click", handleClickOutside)
	}, [])

	// Close menu when route changes
	useEffect(() => {
		setOpenCategory(null)
		setMobileMenuOpen(false)
	}, [pathname])

	const handleMouseEnter = useCallback((title: string) => {
		// Clear any pending close timeout
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current)
			closeTimeoutRef.current = null
		}
		setOpenCategory(title)
	}, [])

	const handleMouseLeave = useCallback(() => {
		// Delay closing to allow moving to mega menu
		closeTimeoutRef.current = setTimeout(() => {
			setOpenCategory(null)
		}, 150)
	}, [])

	const handleMegaMenuMouseEnter = useCallback(() => {
		// Clear close timeout when entering mega menu
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current)
			closeTimeoutRef.current = null
		}
	}, [])

	const handleMegaMenuMouseLeave = useCallback(() => {
		setOpenCategory(null)
	}, [])

	const isActivePrimaryItem = (item: (typeof primaryNavItems)[0]) => {
		if (item.href === "/") {
			return pathname === "/"
		}
		return pathname === item.href || pathname.startsWith(item.href.replace(/\/$/, ""))
	}

	const isActiveCategory = (category: (typeof navigation)[0]) => {
		// Check if any section item matches the current path
		return category.sections.some((section) =>
			section.items.some(
				(item) =>
					!item.href.startsWith("http") &&
					(pathname === item.href ||
						pathname.startsWith(item.href.replace(/\/$/, ""))),
			),
		)
	}

	return (
		<>
			<header
				ref={headerRef}
				className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95"
			>
				<nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
					<Link
						href="/"
						className="text-xl font-bold tracking-tight transition hover:opacity-80"
					>
						AI-DLC
					</Link>

					{/* Desktop Navigation — Primary links + mega menu trigger */}
					<div className="hidden items-center gap-1 md:flex">
						{/* Primary nav links */}
						{primaryNavItems.map((item) => {
							const isActive = isActivePrimaryItem(item)
							// Only "Docs" gets a mega menu dropdown; other items are plain links
							const megaCategory = item.title === "Docs"
								? { title: "Docs", href: "/docs/", sections: navigation.flatMap(c => c.sections), featured: navigation[0].featured }
								: null

							if (megaCategory) {
								// Render as mega menu trigger
								const isOpen = openCategory === megaCategory.title

								return (
									<div
										key={item.title}
										className="relative"
										onMouseEnter={() => handleMouseEnter(megaCategory.title)}
										onMouseLeave={handleMouseLeave}
									>
										<button
											type="button"
											className={`flex items-center gap-1 rounded-lg px-3 py-2 transition ${
												isActive || isOpen
													? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
													: "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
											}`}
											aria-expanded={isOpen}
											aria-haspopup="true"
										>
											{item.title}
											<svg
												className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
									</div>
								)
							}

							// Render as plain link
							return (
								<Link
									key={item.title}
									href={item.href}
									className={`rounded-lg px-3 py-2 transition ${
										isActive
											? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
											: "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
									}`}
								>
									{item.title}
								</Link>
							)
						})}

						<div className="ml-2 flex items-center gap-2 border-l border-gray-200 pl-4 dark:border-gray-700">
							<a
								href="https://github.com/thebushidocollective/ai-dlc"
								target="_blank"
								rel="noopener noreferrer"
								className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
								aria-label="GitHub"
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
							</a>
							<ThemeToggle />
						</div>
					</div>

					{/* Mobile Menu Button */}
					<div className="flex items-center gap-2 md:hidden">
						<ThemeToggle />
					</div>
				</nav>

				{/* Mega Menu Dropdowns */}
				{navigation.map((category) => (
					<div
						key={category.title}
						onMouseEnter={handleMegaMenuMouseEnter}
						onMouseLeave={handleMegaMenuMouseLeave}
					>
						<MegaMenu
							category={category}
							isOpen={openCategory === category.title}
							onClose={() => setOpenCategory(null)}
						/>
					</div>
				))}
			</header>

			{/* Mobile Navigation */}
			<MobileNav
				isOpen={mobileMenuOpen}
				onClose={() => setMobileMenuOpen(false)}
			/>

			{/* Bottom Navigation (mobile only) */}
			<BottomNav onMenuClick={() => setMobileMenuOpen(true)} />
		</>
	)
}
