"use client"

import type { NavCategory } from "@/lib/navigation"
import { useEffect, useRef } from "react"
import { MegaMenuPreview } from "./MegaMenuPreview"
import { MegaMenuSection } from "./MegaMenuSection"

interface MegaMenuProps {
	category: NavCategory
	isOpen: boolean
	onClose: () => void
}

export function MegaMenu({ category, isOpen, onClose }: MegaMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)

	// Close on escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			}
		}

		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown)
		}

		return () => {
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [isOpen, onClose])

	if (!isOpen) return null

	const hasFeatured = !!category.featured
	const sectionCount = category.sections.length

	return (
		<div
			ref={menuRef}
			className="absolute left-0 right-0 top-full z-50 border-b border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950"
			role="menu"
			aria-label={`${category.title} navigation`}
		>
			<div className="mx-auto max-w-6xl px-4 py-8">
				<div
					className={`grid gap-8 ${
						hasFeatured
							? sectionCount <= 2
								? "md:grid-cols-3"
								: "md:grid-cols-4"
							: sectionCount <= 2
								? "md:grid-cols-2"
								: sectionCount === 3
									? "md:grid-cols-3"
									: "md:grid-cols-4"
					}`}
				>
					{/* Navigation sections */}
					{category.sections.map((section) => (
						<MegaMenuSection
							key={section.title}
							section={section}
							onItemClick={onClose}
						/>
					))}

					{/* Featured preview card */}
					{category.featured && (
						<div
							className={sectionCount <= 2 ? "md:col-span-1" : "md:col-span-1"}
						>
							<MegaMenuPreview
								title={category.featured.title}
								description={category.featured.description}
								href={category.featured.href}
								onItemClick={onClose}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
