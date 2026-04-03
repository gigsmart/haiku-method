"use client"

import { useTheme } from "next-themes"
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react"
import { DiagramConnector } from "./DiagramConnector"
import { DiagramLayer } from "./DiagramLayer"
import { DiagramNode } from "./DiagramNode"
import { DiagramTooltip } from "./DiagramTooltip"
import { DIAGRAM_VIEWBOX, diagramData } from "./data"
import type { DiagramNode as DiagramNodeType } from "./types"

export function BigPictureDiagram() {
	const { resolvedTheme } = useTheme()
	const [mounted, setMounted] = useState(false)
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [focusedIndex, setFocusedIndex] = useState<number>(-1)

	// Prevent hydration mismatch
	useEffect(() => {
		setMounted(true)
	}, [])

	const isDarkMode = mounted && resolvedTheme === "dark"

	// Create a map for quick node lookup
	const nodesMap = useMemo(() => {
		const map = new Map<string, DiagramNodeType>()
		for (const node of diagramData.nodes) {
			map.set(node.id, node)
		}
		return map
	}, [])

	// Get hovered node for tooltip
	const hoveredNode = hoveredNodeId
		? (nodesMap.get(hoveredNodeId) ?? null)
		: null

	const handleNodeSelect = useCallback((id: string) => {
		setSelectedNodeId(id)
	}, [])

	const handleNodeHover = useCallback((id: string | null) => {
		setHoveredNodeId(id)
	}, [])

	// Keyboard navigation for the diagram container
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const nodes = diagramData.nodes
			const currentIndex = focusedIndex >= 0 ? focusedIndex : 0

			switch (e.key) {
				case "ArrowRight":
				case "ArrowDown": {
					e.preventDefault()
					const nextIndex = (currentIndex + 1) % nodes.length
					setFocusedIndex(nextIndex)
					setHoveredNodeId(nodes[nextIndex].id)
					break
				}
				case "ArrowLeft":
				case "ArrowUp": {
					e.preventDefault()
					const prevIndex = (currentIndex - 1 + nodes.length) % nodes.length
					setFocusedIndex(prevIndex)
					setHoveredNodeId(nodes[prevIndex].id)
					break
				}
				case "Home": {
					e.preventDefault()
					setFocusedIndex(0)
					setHoveredNodeId(nodes[0].id)
					break
				}
				case "End": {
					e.preventDefault()
					const lastIndex = nodes.length - 1
					setFocusedIndex(lastIndex)
					setHoveredNodeId(nodes[lastIndex].id)
					break
				}
				case "Escape": {
					setHoveredNodeId(null)
					setFocusedIndex(-1)
					break
				}
			}
		},
		[focusedIndex],
	)

	// Background color for the SVG
	const bgColor = isDarkMode ? "#0f172a" : "#f8fafc" // slate-900 / slate-50

	return (
		<div className="relative w-full">
			{/* Tooltip */}
			<DiagramTooltip node={hoveredNode} isDarkMode={isDarkMode} />

			{/* Legend */}
			<div className="mb-4 flex flex-wrap justify-center gap-4 text-sm">
				<LegendItem
					color={isDarkMode ? "#60a5fa" : "#2563eb"}
					label="Artifacts"
				/>
				<LegendItem color={isDarkMode ? "#c084fc" : "#9333ea"} label="Hats" />
				<LegendItem
					color={isDarkMode ? "#fbbf24" : "#d97706"}
					label="Operating Modes"
				/>
				<LegendItem
					color={isDarkMode ? "#4ade80" : "#16a34a"}
					label="Principles"
				/>
			</div>

			{/* SVG Diagram */}
			<div
				className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800"
				style={{ backgroundColor: bgColor }}
			>
				<svg
					viewBox={`0 0 ${DIAGRAM_VIEWBOX.width} ${DIAGRAM_VIEWBOX.height}`}
					className="min-w-[600px]"
					style={{ width: "100%", height: "auto" }}
					role="img"
					aria-label="AI-DLC methodology diagram showing the relationship between development phases, hats, operating modes, and core principles"
					onKeyDown={handleKeyDown}
				>
					<title>AI-DLC Big Picture Diagram</title>
					<desc>
						An interactive diagram showing the AI-DLC methodology structure with
						four layers: Development Phases (Intent, Unit, Bolt, Deploy), Hats
						(Researcher, Planner, Builder, Reviewer), Operating Modes (HITL,
						OHOTL, AHOTL), and Core Principles (Backpressure, Completion
						Criteria, Collapsed SDLC, State Management).
					</desc>

					{/* Layers (background bands) */}
					{diagramData.layers.map((layer) => (
						<DiagramLayer
							key={layer.id}
							layer={layer}
							width={DIAGRAM_VIEWBOX.width}
							isDarkMode={isDarkMode}
						/>
					))}

					{/* Connectors (rendered before nodes so nodes appear on top) */}
					{diagramData.connectors.map((connector) => (
						<DiagramConnector
							key={connector.id}
							connector={connector}
							nodes={nodesMap}
							isDarkMode={isDarkMode}
							hoveredNode={hoveredNodeId}
						/>
					))}

					{/* Nodes */}
					{diagramData.nodes.map((node) => (
						<DiagramNode
							key={node.id}
							node={node}
							isSelected={selectedNodeId === node.id}
							isDarkMode={isDarkMode}
							onSelect={handleNodeSelect}
							onHover={handleNodeHover}
						/>
					))}
				</svg>
			</div>

			{/* Accessibility instructions */}
			<p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
				Use Tab to navigate between nodes. Press Enter or Space to view
				documentation. Arrow keys navigate within the diagram.
			</p>

			{/* Mobile stacked view */}
			<div className="mt-8 block lg:hidden">
				<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					Quick Navigation
				</h3>
				<div className="space-y-6">
					{diagramData.layers.map((layer) => (
						<div key={layer.id}>
							<h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
								{layer.label}
							</h4>
							<div className="flex flex-wrap gap-2">
								{diagramData.nodes
									.filter(
										(node) =>
											node.y >= layer.y && node.y < layer.y + layer.height,
									)
									.map((node) => (
										<MobileNodeLink key={node.id} node={node} />
									))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function LegendItem({ color, label }: { color: string; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<div
				className="h-3 w-3 rounded"
				style={{ backgroundColor: color }}
				aria-hidden="true"
			/>
			<span className="text-gray-600 dark:text-gray-400">{label}</span>
		</div>
	)
}

function MobileNodeLink({ node }: { node: DiagramNodeType }) {
	const categoryColorClass = {
		artifact:
			"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
		hat: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
		"operating-mode":
			"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
		principle:
			"bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
		workflow:
			"bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
	}[node.category]

	return (
		<a
			href={node.href}
			className={`inline-block rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:opacity-80 ${categoryColorClass}`}
		>
			{node.label}
		</a>
	)
}
