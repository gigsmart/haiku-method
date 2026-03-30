"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface ToolkitGroupProps {
	title: string
	color: "violet" | "amber" | "rose" | "green"
	children: ReactNode
}

const colorMap = {
	violet: {
		border: "border-violet-500",
		heading: "text-violet-500",
		cardBorder: "border-l-violet-500",
		cmd: "text-violet-500",
	},
	amber: {
		border: "border-amber-400",
		heading: "text-amber-400",
		cardBorder: "border-l-amber-400",
		cmd: "text-amber-400",
	},
	rose: {
		border: "border-rose-500",
		heading: "text-rose-500",
		cardBorder: "border-l-rose-500",
		cmd: "text-rose-500",
	},
	green: {
		border: "border-green-500",
		heading: "text-green-500",
		cardBorder: "border-l-green-500",
		cmd: "text-green-500",
	},
}

export function ToolkitGroup({ title, color, children }: ToolkitGroupProps) {
	const c = colorMap[color]
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="mb-12"
		>
			<div
				className={`mb-5 flex items-center gap-3 border-b-2 pb-3 ${c.border}`}
			>
				<h3 className={`text-lg font-bold ${c.heading}`}>{title}</h3>
			</div>
			<div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
				{children}
			</div>
		</motion.div>
	)
}

interface ToolkitCardProps {
	cmd: string
	tagline: string
	color: "violet" | "amber" | "rose" | "green"
	children?: ReactNode
}

export function ToolkitCard({
	cmd,
	tagline,
	color,
	children,
}: ToolkitCardProps) {
	const c = colorMap[color]
	return (
		<div
			className={`rounded-lg border border-gray-200 border-l-[3px] bg-white p-4 transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 ${c.cardBorder}`}
		>
			<div className={`mb-1 font-mono text-base font-bold ${c.cmd}`}>{cmd}</div>
			<div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
				{tagline}
			</div>
			{children && (
				<div className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
					{children}
				</div>
			)}
		</div>
	)
}
