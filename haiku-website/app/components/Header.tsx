"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const navItems = [
	{ label: "Methodology", href: "/methodology" },
	{ label: "Phases", href: "/phases/elaboration" },
	{ label: "Profiles", href: "/profiles" },
	{ label: "Getting Started", href: "/getting-started" },
	{ label: "Paper", href: "/paper" },
]

export function Header() {
	const pathname = usePathname()
	const [mobileOpen, setMobileOpen] = useState(false)

	const isActive = (href: string) => {
		if (href === "/phases/elaboration") {
			return pathname.startsWith("/phases")
		}
		return pathname === href || pathname.startsWith(href + "/")
	}

	return (
		<header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur-sm">
			<nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
				<Link
					href="/"
					className="text-xl font-semibold tracking-tight text-stone-900"
				>
					<span className="text-teal-600">HAIKU</span>
				</Link>

				{/* Desktop nav */}
				<div className="hidden items-center gap-1 md:flex">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className={`rounded-lg px-3 py-2 text-sm transition ${
								isActive(item.href)
									? "bg-stone-100 font-medium text-stone-900"
									: "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
							}`}
						>
							{item.label}
						</Link>
					))}
				</div>

				{/* Mobile menu button */}
				<button
					type="button"
					className="rounded-lg p-2 text-stone-500 hover:bg-stone-50 md:hidden"
					onClick={() => setMobileOpen(!mobileOpen)}
					aria-label="Toggle menu"
				>
					<svg
						className="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						{mobileOpen ? (
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						) : (
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6h16M4 12h16M4 18h16"
							/>
						)}
					</svg>
				</button>
			</nav>

			{/* Mobile nav */}
			{mobileOpen && (
				<div className="border-t border-stone-200 bg-white px-4 py-4 md:hidden">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							onClick={() => setMobileOpen(false)}
							className={`block rounded-lg px-3 py-2 text-sm ${
								isActive(item.href)
									? "bg-stone-100 font-medium text-stone-900"
									: "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
							}`}
						>
							{item.label}
						</Link>
					))}
				</div>
			)}
		</header>
	)
}
