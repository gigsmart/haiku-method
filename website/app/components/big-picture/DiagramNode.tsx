"use client"

import { useRouter } from "next/navigation"
import { type KeyboardEvent, useCallback, useState } from "react"
import { categoryColors, type DiagramNode as DiagramNodeType } from "./types"

interface DiagramNodeProps {
	node: DiagramNodeType
	isSelected: boolean
	isDarkMode: boolean
	onSelect: (id: string) => void
	onHover: (id: string | null) => void
}

export function DiagramNode({
	node,
	isSelected,
	isDarkMode,
	onSelect,
	onHover,
}: DiagramNodeProps) {
	const router = useRouter()
	const [isFocused, setIsFocused] = useState(false)
	const colors = categoryColors[node.category]

	const fill = isDarkMode ? colors.fillDark : colors.fill
	const stroke = isDarkMode ? colors.strokeDark : colors.stroke
	const textColor = isDarkMode ? colors.textDark : colors.text

	const handleClick = useCallback(() => {
		onSelect(node.id)
		router.push(node.href)
	}, [node.id, node.href, onSelect, router])

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				handleClick()
			}
		},
		[handleClick],
	)

	const handleMouseEnter = useCallback(() => {
		onHover(node.id)
	}, [node.id, onHover])

	const handleMouseLeave = useCallback(() => {
		onHover(null)
	}, [onHover])

	const handleFocus = useCallback(() => {
		setIsFocused(true)
		onHover(node.id)
	}, [node.id, onHover])

	const handleBlur = useCallback(() => {
		setIsFocused(false)
		onHover(null)
	}, [onHover])

	const strokeWidth = isSelected || isFocused ? 3 : 2
	const scale = isSelected || isFocused ? 1.02 : 1
	const shadowOpacity = isSelected || isFocused ? 0.25 : 0.1

	return (
		// biome-ignore lint/a11y/useSemanticElements: SVG <g> elements cannot be replaced with semantic HTML
		<g
			role="button"
			tabIndex={0}
			aria-label={`${node.label}: ${node.description}`}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onFocus={handleFocus}
			onBlur={handleBlur}
			style={{
				cursor: "pointer",
				outline: "none",
				transform: `scale(${scale})`,
				transformOrigin: `${node.x + node.width / 2}px ${node.y + node.height / 2}px`,
				transition: "transform 0.15s ease-out",
			}}
		>
			{/* Shadow */}
			<rect
				x={node.x + 2}
				y={node.y + 2}
				width={node.width}
				height={node.height}
				rx={8}
				ry={8}
				fill={isDarkMode ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.1)"}
				style={{
					opacity: shadowOpacity,
					transition: "opacity 0.15s ease-out",
				}}
			/>

			{/* Main rectangle */}
			<rect
				x={node.x}
				y={node.y}
				width={node.width}
				height={node.height}
				rx={8}
				ry={8}
				fill={fill}
				stroke={stroke}
				strokeWidth={strokeWidth}
				style={{
					transition: "stroke-width 0.15s ease-out",
				}}
			/>

			{/* Focus indicator */}
			{isFocused && (
				<rect
					x={node.x - 4}
					y={node.y - 4}
					width={node.width + 8}
					height={node.height + 8}
					rx={12}
					ry={12}
					fill="none"
					stroke={stroke}
					strokeWidth={2}
					strokeDasharray="4 2"
					style={{ opacity: 0.6 }}
				/>
			)}

			{/* Label */}
			<text
				x={node.x + node.width / 2}
				y={node.y + node.height / 2}
				textAnchor="middle"
				dominantBaseline="middle"
				fill={textColor}
				fontSize={14}
				fontWeight={600}
				style={{ pointerEvents: "none" }}
			>
				{node.label}
			</text>
		</g>
	)
}
