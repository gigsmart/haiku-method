"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"

interface BreadcrumbItem {
	label: string
	href: string
}

// Map path segments to human-readable labels
const segmentLabels: Record<string, string> = {
	docs: "Documentation",
	blog: "Blog",
	tools: "Tools",
	workflows: "Workflows",
	templates: "Templates",
	about: "About",
	"big-picture": "Big Picture",
	"start-here": "Start Here",
	"mode-selector": "Mode Selector",
	"quick-start": "Quick Start",
	installation: "Installation",
	concepts: "Concepts",
	hats: "Hats",
	community: "Community",
	"example-feature": "Feature Example",
	"example-bugfix": "Bugfix Example",
	"adoption-roadmap": "Adoption Roadmap",
	"guide-developer": "Developer Guide",
	"guide-tech-lead": "Tech Lead Guide",
	"guide-manager": "Manager Guide",
	"guide-ai": "AI Assistant Guide",
	"checklist-first-intent": "First Intent Checklist",
	"checklist-team-onboarding": "Team Onboarding",
	assessment: "Assessment",
}

function getSegmentLabel(segment: string): string {
	// Check for known labels
	if (segmentLabels[segment]) {
		return segmentLabels[segment]
	}

	// Convert slug to title case
	return segment
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

export function Breadcrumbs() {
	const pathname = usePathname()

	const breadcrumbs = useMemo((): BreadcrumbItem[] => {
		// Start with home
		const items: BreadcrumbItem[] = [{ label: "Home", href: "/" }]

		// Skip if we're on the home page
		if (pathname === "/") {
			return items
		}

		// Split pathname and build breadcrumbs
		const segments = pathname.split("/").filter(Boolean)
		let currentPath = ""

		for (const segment of segments) {
			currentPath += `/${segment}`
			items.push({
				label: getSegmentLabel(segment),
				href: currentPath + "/",
			})
		}

		return items
	}, [pathname])

	// Don't render if only home
	if (breadcrumbs.length <= 1) {
		return null
	}

	return (
		<nav
			aria-label="Breadcrumb"
			className="mb-6 text-sm text-gray-500 dark:text-gray-400"
		>
			<ol className="flex flex-wrap items-center gap-1">
				{breadcrumbs.map((item, index) => {
					const isLast = index === breadcrumbs.length - 1

					return (
						<li key={item.href} className="flex items-center">
							{index > 0 && (
								<svg
									className="mx-2 h-4 w-4 text-gray-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5l7 7-7 7"
									/>
								</svg>
							)}
							{isLast ? (
								<span
									className="font-medium text-gray-900 dark:text-white"
									aria-current="page"
								>
									{item.label}
								</span>
							) : (
								<Link
									href={item.href}
									className="transition hover:text-gray-900 dark:hover:text-white"
								>
									{item.label}
								</Link>
							)}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}
