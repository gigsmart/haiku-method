"use client"

import type {
	DiagramConnector as DiagramConnectorType,
	DiagramNode,
} from "./types"

interface DiagramConnectorProps {
	connector: DiagramConnectorType
	nodes: Map<string, DiagramNode>
	isDarkMode: boolean
	hoveredNode: string | null
}

export function DiagramConnector({
	connector,
	nodes,
	isDarkMode,
	hoveredNode,
}: DiagramConnectorProps) {
	const fromNode = nodes.get(connector.from)
	const toNode = nodes.get(connector.to)

	if (!(fromNode && toNode)) return null

	// Calculate connection points
	const fromX = fromNode.x + fromNode.width / 2
	const fromY = fromNode.y + fromNode.height
	const toX = toNode.x + toNode.width / 2
	const toY = toNode.y

	// For horizontal flow connectors
	const isHorizontalFlow =
		connector.type === "flow" && Math.abs(fromNode.y - toNode.y) < 20

	let path: string
	let arrowPoints: string

	if (isHorizontalFlow) {
		// Horizontal arrow from right edge to left edge
		const startX = fromNode.x + fromNode.width
		const startY = fromNode.y + fromNode.height / 2
		const endX = toNode.x
		const endY = toNode.y + toNode.height / 2

		const midX = (startX + endX) / 2
		path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

		// Arrow pointing right
		arrowPoints = `${endX - 8},${endY - 5} ${endX},${endY} ${endX - 8},${endY + 5}`
	} else {
		// Vertical/diagonal connection
		const midY = (fromY + toY) / 2
		path = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`

		// Arrow pointing down
		arrowPoints = `${toX - 5},${toY - 8} ${toX},${toY} ${toX + 5},${toY - 8}`
	}

	// Determine if this connector should be highlighted
	const isHighlighted =
		hoveredNode === connector.from || hoveredNode === connector.to

	// Style based on connector type
	const getStrokeColor = () => {
		if (isDarkMode) {
			switch (connector.type) {
				case "flow":
					return isHighlighted ? "#60a5fa" : "#475569" // blue-400 / slate-600
				case "contains":
					return isHighlighted ? "#a78bfa" : "#475569" // purple-400 / slate-600
				case "influences":
					return isHighlighted ? "#4ade80" : "#475569" // green-400 / slate-600
				default:
					return "#475569"
			}
		}
		switch (connector.type) {
			case "flow":
				return isHighlighted ? "#2563eb" : "#94a3b8" // blue-600 / slate-400
			case "contains":
				return isHighlighted ? "#9333ea" : "#94a3b8" // purple-600 / slate-400
			case "influences":
				return isHighlighted ? "#16a34a" : "#94a3b8" // green-600 / slate-400
			default:
				return "#94a3b8"
		}
	}

	const strokeColor = getStrokeColor()
	const strokeWidth = isHighlighted ? 2 : 1.5
	const strokeDasharray =
		connector.type === "influences"
			? "4 2"
			: connector.type === "contains"
				? "6 3"
				: "none"
	const opacity = isHighlighted ? 1 : 0.6

	return (
		<g
			style={{
				opacity,
				transition: "opacity 0.15s ease-out",
			}}
		>
			<path
				d={path}
				fill="none"
				stroke={strokeColor}
				strokeWidth={strokeWidth}
				strokeDasharray={strokeDasharray}
				style={{
					transition: "stroke 0.15s ease-out, stroke-width 0.15s ease-out",
				}}
			/>
			<polygon
				points={arrowPoints}
				fill={strokeColor}
				style={{
					transition: "fill 0.15s ease-out",
				}}
			/>
		</g>
	)
}
