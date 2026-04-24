"use client"

import { categoryColors, type DiagramNode } from "./types"

interface DiagramTooltipProps {
	node: DiagramNode | null
	isDarkMode: boolean
}

export function DiagramTooltip({ node, isDarkMode }: DiagramTooltipProps) {
	if (!node) return null

	const colors = categoryColors[node.category]
	const borderColor = isDarkMode ? colors.strokeDark : colors.stroke
	const bgColor = isDarkMode ? "#1e293b" : "#ffffff" // slate-800 / white
	const textColor = isDarkMode ? "#e2e8f0" : "#334155" // slate-200 / slate-700
	const labelColor = isDarkMode ? colors.textDark : colors.text

	// Category display name
	const categoryName = {
		artifact: "Artifact",
		hat: "Hat",
		"operating-mode": "Operating Mode",
		principle: "Principle",
		workflow: "Workflow",
	}[node.category]

	return (
		<div
			className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 transform"
			role="tooltip"
			aria-live="polite"
		>
			<div
				className="max-w-sm rounded-lg border-2 px-4 py-3 shadow-lg"
				style={{
					backgroundColor: bgColor,
					borderColor,
				}}
			>
				<div className="mb-1 flex items-center gap-2">
					<span
						className="text-xs font-medium uppercase tracking-wide"
						style={{ color: labelColor }}
					>
						{categoryName}
					</span>
				</div>
				<h3
					className="mb-1 text-lg font-semibold"
					style={{ color: labelColor }}
				>
					{node.label}
				</h3>
				<p className="text-sm" style={{ color: textColor }}>
					{node.description}
				</p>
				<p className="mt-2 text-xs opacity-60" style={{ color: textColor }}>
					Click to view documentation
				</p>
			</div>
		</div>
	)
}
