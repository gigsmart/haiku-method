"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface FlowStepProps {
	number: number
	label: string
	who: string
	color: string
	numberBg: string
}

function FlowArrow() {
	return (
		<div className="relative mx-auto h-8 w-0.5 bg-gray-300 dark:bg-gray-700">
			<div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-gray-300 dark:border-t-gray-700" />
		</div>
	)
}

function FlowStep({ number, label, who, color, numberBg }: FlowStepProps) {
	return (
		<div className="w-80 max-w-full rounded-2xl border-2 border-gray-200 bg-white p-6 text-center transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600">
			<span
				className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${numberBg}`}
			>
				{number}
			</span>
			<div className={`text-lg font-bold ${color}`}>{label}</div>
			<div className="text-sm text-gray-500 dark:text-gray-400">{who}</div>
		</div>
	)
}

export function LifecycleFlow() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.6 }}
			className="my-10 flex flex-col items-center gap-0"
		>
			<FlowStep
				number={1}
				label="Plan Together"
				who="You + AI collaborate on what to build"
				color="text-blue-500"
				numberBg="bg-blue-500 text-white"
			/>
			<FlowArrow />
			<FlowStep
				number={2}
				label="Build & Verify"
				who="AI works autonomously -- you watch or step away"
				color="text-amber-500"
				numberBg="bg-amber-400 text-gray-900"
			/>
			<FlowArrow />
			<FlowStep
				number={3}
				label="Deliver"
				who="AI creates a pull request -- you approve"
				color="text-green-500"
				numberBg="bg-green-500 text-gray-900"
			/>
			<FlowArrow />
			<FlowStep
				number={4}
				label="Learn & Improve"
				who="AI analyzes what happened -- you validate insights"
				color="text-violet-500"
				numberBg="bg-violet-500 text-white"
			/>
			<div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
				<span className="text-lg text-green-500">&#x21BB;</span>
				<span>Repeat for the next feature</span>
			</div>
		</motion.div>
	)
}

interface FlowNodeProps {
	children: ReactNode
	color?: string
}

export function FlowNode({ children, color }: FlowNodeProps) {
	const colorClasses: Record<string, string> = {
		gold: "border-amber-400 text-amber-400 bg-amber-500/5 dark:bg-amber-500/10",
		teal: "border-cyan-400 text-cyan-400 bg-cyan-500/5 dark:bg-cyan-500/10",
		green:
			"border-green-400 text-green-400 bg-green-500/5 dark:bg-green-500/10",
		purple:
			"border-violet-400 text-violet-400 bg-violet-500/5 dark:bg-violet-500/10",
		red: "border-rose-400 text-rose-400 bg-rose-500/5 dark:bg-rose-500/10",
		blue: "border-blue-400 text-blue-400 bg-blue-500/5 dark:bg-blue-500/10",
		orange:
			"border-orange-400 text-orange-400 bg-orange-500/5 dark:bg-orange-500/10",
	}

	return (
		<span
			className={`inline-block whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold ${
				color && colorClasses[color]
					? colorClasses[color]
					: "border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
			}`}
		>
			{children}
		</span>
	)
}

export function FlowArrowInline() {
	return (
		<span className="relative mx-1 inline-block h-0.5 w-6 bg-gray-300 align-middle dark:bg-gray-600">
			<span className="absolute -right-px -top-1 border-y-[5px] border-l-[6px] border-y-transparent border-l-gray-300 dark:border-l-gray-600" />
		</span>
	)
}
