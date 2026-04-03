"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
	const { theme, setTheme, resolvedTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) {
		return (
			<button
				type="button"
				className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-gray-800"
				aria-label="Toggle theme"
			>
				<div className="h-5 w-5" />
			</button>
		)
	}

	const cycleTheme = () => {
		if (theme === "system") {
			setTheme(resolvedTheme === "dark" ? "light" : "dark")
		} else if (theme === "light") {
			setTheme("dark")
		} else if (theme === "dark") {
			setTheme("system")
		}
	}

	return (
		<button
			type="button"
			onClick={cycleTheme}
			className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-gray-800"
			aria-label={`Current theme: ${theme}. Click to cycle.`}
			title={`Theme: ${theme}`}
		>
			{theme === "system" ? (
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
						d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
			) : resolvedTheme === "dark" ? (
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
						d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
					/>
				</svg>
			) : (
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
						d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
					/>
				</svg>
			)}
		</button>
	)
}
