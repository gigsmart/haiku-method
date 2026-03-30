"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface BottomNavProps {
	onMenuClick: () => void
}

const navItems = [
	{
		title: "Home",
		href: "/",
		icon: (
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
					d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
				/>
			</svg>
		),
	},
	{
		title: "Docs",
		href: "/docs/",
		icon: (
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
					d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
				/>
			</svg>
		),
	},
	{
		title: "Install",
		href: "/docs/installation/",
		icon: (
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
		),
	},
]

export function BottomNav({ onMenuClick }: BottomNavProps) {
	const pathname = usePathname()

	const isActive = (href: string) => {
		if (href === "/") {
			return pathname === "/"
		}
		return pathname.startsWith(href)
	}

	return (
		<nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
			<div className="mx-auto flex max-w-md items-center justify-around px-4 py-2">
				{navItems.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						className={`flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition ${
							isActive(item.href)
								? "text-blue-600 dark:text-blue-400"
								: "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
						}`}
					>
						{item.icon}
						<span className="text-xs font-medium">{item.title}</span>
					</Link>
				))}

				{/* Menu button */}
				<button
					type="button"
					onClick={onMenuClick}
					className="flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
					aria-label="Open menu"
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
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
					<span className="text-xs font-medium">Menu</span>
				</button>
			</div>
		</nav>
	)
}
