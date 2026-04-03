"use client"

import { motion } from "framer-motion"
import type { IterationLoop as IterationLoopType } from "./types"

interface IterationLoopProps {
	loop: IterationLoopType
	isActive: boolean
	stepCount: number
}

export function IterationLoop({
	loop,
	isActive,
	stepCount,
}: IterationLoopProps) {
	// Calculate positions as percentages based on step count
	// Each step is centered in its "slot", so position = (index + 0.5) / stepCount * 100
	const fromX = ((loop.fromStep + 0.5) / stepCount) * 100
	const toX = ((loop.toStep + 0.5) / stepCount) * 100

	// Calculate label position (centered between from and to)
	const labelX = (fromX + toX) / 2

	return (
		<div className="relative w-full mt-6">
			{/* The curved arrow going backwards */}
			<svg
				className="w-full h-16 overflow-visible"
				viewBox="0 0 100 60"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<title>Iteration loop arrow</title>
				<defs>
					<marker
						id="arrowhead"
						markerWidth="10"
						markerHeight="7"
						refX="9"
						refY="3.5"
						orient="auto"
					>
						<polygon
							points="0 0, 10 3.5, 0 7"
							fill="currentColor"
							className="text-stone-400 dark:text-stone-300"
						/>
					</marker>
					<marker
						id="arrowhead-active"
						markerWidth="10"
						markerHeight="7"
						refX="9"
						refY="3.5"
						orient="auto"
					>
						<polygon
							points="0 0, 10 3.5, 0 7"
							fill="currentColor"
							className="text-amber-500"
						/>
					</marker>
				</defs>

				{/* Background path */}
				<motion.path
					d={`M ${fromX} 0 C ${fromX} 50, ${toX} 50, ${toX} 0`}
					fill="none"
					stroke="currentColor"
					strokeWidth="0.5"
					strokeDasharray="2 1.5"
					className="text-stone-300 dark:text-stone-400"
					markerEnd="url(#arrowhead)"
				/>

				{/* Animated path */}
				<motion.path
					d={`M ${fromX} 0 C ${fromX} 50, ${toX} 50, ${toX} 0`}
					fill="none"
					stroke="currentColor"
					strokeWidth="0.5"
					strokeDasharray="2 1.5"
					className="text-amber-500"
					initial={{ pathLength: 0, opacity: 0 }}
					animate={{
						pathLength: isActive ? 1 : 0,
						opacity: isActive ? 1 : 0,
					}}
					transition={{ duration: 0.8, ease: "easeInOut" }}
					markerEnd="url(#arrowhead-active)"
				/>
			</svg>

			{/* Label - positioned based on actual loop span */}
			<motion.div
				className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
				style={{ left: `${labelX}%` }}
				animate={{
					opacity: isActive ? 1 : 0.5,
					scale: isActive ? 1.1 : 1,
				}}
				transition={{ duration: 0.3 }}
			>
				<span className="px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 whitespace-nowrap">
					{loop.label}
				</span>
			</motion.div>
		</div>
	)
}
