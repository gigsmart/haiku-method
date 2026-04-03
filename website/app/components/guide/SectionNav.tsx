"use client"

import { useCallback, useEffect, useState } from "react"

interface NavItem {
	id: string
	label: string
}

const sections: NavItem[] = [
	{ id: "hero", label: "Top" },
	{ id: "prologue", label: "Meet the Cast" },
	{ id: "act1", label: "The Big Picture" },
	{ id: "specs", label: "Why Specs Matter" },
	{ id: "act2", label: "Planning Together" },
	{ id: "act3", label: "Building" },
	{ id: "act4", label: "Quality & Safety" },
	{ id: "act5", label: "Finishing & Learning" },
	{ id: "toolkit", label: "Toolkit" },
	{ id: "epilogue", label: "The Cycle Continues" },
]

export function SectionNav() {
	const [activeSection, setActiveSection] = useState("hero")

	useEffect(() => {
		const handleScroll = () => {
			const scrollY = window.scrollY + window.innerHeight * 0.35
			let current = "hero"
			for (let i = sections.length - 1; i >= 0; i--) {
				const el = document.getElementById(sections[i].id)
				if (el && el.offsetTop <= scrollY) {
					current = sections[i].id
					break
				}
			}
			setActiveSection(current)
		}

		let ticking = false
		const onScroll = () => {
			if (!ticking) {
				window.requestAnimationFrame(() => {
					handleScroll()
					ticking = false
				})
				ticking = true
			}
		}

		window.addEventListener("scroll", onScroll, { passive: true })
		handleScroll()
		return () => window.removeEventListener("scroll", onScroll)
	}, [])

	const scrollTo = useCallback((id: string) => {
		const el = document.getElementById(id)
		if (el) el.scrollIntoView({ behavior: "smooth" })
	}, [])

	return (
		<nav
			className="fixed right-5 top-1/2 z-50 hidden -translate-y-1/2 flex-col items-center gap-2.5 lg:flex"
			aria-label="Section navigation"
		>
			{sections.map((section) => (
				<button
					key={section.id}
					type="button"
					onClick={() => scrollTo(section.id)}
					className="group relative flex items-center"
					aria-label={section.label}
				>
					<span className="pointer-events-none absolute right-5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
						{section.label}
					</span>
					<span
						className={`block h-2.5 w-2.5 rounded-full border-2 transition-all duration-300 ${
							activeSection === section.id
								? "scale-130 border-amber-400 bg-amber-400"
								: "border-gray-400 bg-gray-200 hover:border-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-400"
						}`}
					/>
				</button>
			))}
		</nav>
	)
}
