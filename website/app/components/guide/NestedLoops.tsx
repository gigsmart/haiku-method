"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"

export function NestedLoopsViz() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.6 }}
			className="my-8 flex justify-center"
		>
			<div className="rounded-2xl border-2 border-green-400/30 p-4">
				<div className="mb-2 text-center text-xs font-semibold text-green-500">
					OUTER: Assembly Line
				</div>
				<div className="rounded-xl border-2 border-amber-400/30 p-3.5">
					<div className="mb-2 text-center text-xs font-semibold text-amber-400">
						MIDDLE: Hat Rotation
					</div>
					<div className="rounded-lg border-2 border-violet-400/30 p-3 text-center">
						<div className="text-xs font-semibold text-violet-400">
							INNER: Bolt
						</div>
						<div className="mt-1 text-[0.7rem] text-gray-500 dark:text-gray-400">
							One focused work session
						</div>
					</div>
				</div>
			</div>
		</motion.div>
	)
}

export function Pipeline() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-8 space-y-2"
		>
			<PipelineUnit name="Unit 1: OAuth Setup" pct={100} status="done" />
			<PipelineUnit name="Unit 2: Callback" pct={65} status="building" />
			<PipelineUnit
				name="Unit 3: Sessions"
				pct={0}
				status="waiting"
				label="Waiting (needs Unit 1)"
			/>
			<PipelineUnit
				name="Unit 4: Login UI"
				pct={0}
				status="waiting"
				label="Waiting (needs 2 & 3)"
			/>
		</motion.div>
	)
}

function PipelineUnit({
	name,
	pct,
	status,
	label,
}: {
	name: string
	pct: number
	status: "done" | "building" | "waiting"
	label?: string
}) {
	const colors = {
		done: "bg-green-500",
		building: "bg-amber-400",
		waiting: "bg-gray-300 dark:bg-gray-700",
	}
	const statusIcons = {
		done: "\u2705 Done",
		building: "\u{1F528} Building",
		waiting: `\u23F3 ${label || "Waiting"}`,
	}
	const textColors = {
		done: "text-green-500",
		building: "text-amber-400",
		waiting: "text-gray-400",
	}

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3.5 dark:border-gray-700 dark:bg-gray-900">
			<span className="min-w-[180px] text-sm font-semibold text-gray-800 dark:text-gray-200 max-sm:w-full">
				{name}
			</span>
			<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 max-sm:min-w-[120px]">
				<div
					className={`h-full rounded-full transition-all duration-1000 ${colors[status]}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span
				className={`min-w-[80px] text-right text-xs font-medium ${textColors[status]} max-sm:min-w-0`}
			>
				{statusIcons[status]}
			</span>
		</div>
	)
}

export function HatRotation() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-8 flex flex-col items-center gap-0"
		>
			<HatBox
				color="blue"
				icon="&#x1F4CB;"
				label="Planner"
				sub="Creates the implementation plan"
			/>
			<ArrowDown />
			<HatBox
				color="amber"
				icon="&#x1F528;"
				label="Builder"
				sub="Writes code, runs commands"
			/>
			<ArrowDown />
			<HatBox
				color="cyan"
				icon="&#x1F6A7;"
				label="Quality Gates"
				sub="Tests pass? Types OK? Lint clean?"
			/>
			<ArrowDown />
			<HatBox
				color="violet"
				icon="&#x1F50D;"
				label="Reviewer"
				sub="Verifies every criterion with evidence"
			/>
			<ArrowDown />
			<div className="flex gap-10 max-sm:gap-6">
				<div className="flex flex-col items-center">
					<div className="w-[140px] rounded-xl border-2 border-green-400/30 bg-green-500/5 p-3 text-center font-semibold text-green-500 dark:bg-green-500/10">
						&#x2705; Pass
						<div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
							Unit complete!
						</div>
					</div>
					<span className="mt-2 text-xs text-green-500">
						&#x2192; Next unit
					</span>
				</div>
				<div className="flex flex-col items-center">
					<div className="w-[140px] rounded-xl border-2 border-rose-400/30 bg-rose-500/5 p-3 text-center font-semibold text-rose-500 dark:bg-rose-500/10">
						&#x274C; Fail
						<div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
							Feedback given
						</div>
					</div>
					<span className="mt-2 text-xs text-rose-500">
						&#x2192; Back to Builder
					</span>
				</div>
			</div>
		</motion.div>
	)
}

function HatBox({
	color,
	icon,
	label,
	sub,
}: { color: string; icon: string; label: string; sub: string }) {
	const colorMap: Record<string, string> = {
		blue: "border-blue-400/30 bg-blue-500/5 text-blue-400 dark:bg-blue-500/10",
		amber:
			"border-amber-400/30 bg-amber-500/5 text-amber-400 dark:bg-amber-500/10",
		cyan: "border-cyan-400/30 bg-cyan-500/5 text-cyan-400 dark:bg-cyan-500/10",
		violet:
			"border-violet-400/30 bg-violet-500/5 text-violet-400 dark:bg-violet-500/10",
	}

	return (
		<div
			className={`w-[200px] rounded-xl border-2 p-4 text-center font-semibold ${colorMap[color] || ""}`}
		>
			{icon} {label}
			<div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
				{sub}
			</div>
		</div>
	)
}

function ArrowDown() {
	return (
		<div className="relative mx-auto h-6 w-0.5 bg-gray-300 dark:bg-gray-600">
			<div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-gray-300 dark:border-t-gray-600" />
		</div>
	)
}

export function FuelGauge() {
	const ref = useRef<HTMLDivElement>(null)
	const inView = useInView(ref, { once: true, amount: 0.2 })

	const frames = [
		{
			icon: "\u{1F7E2}",
			label: "AI starts working",
			pct: 100,
			color: "bg-green-500",
			display: "100%",
		},
		{
			icon: "\u{1F7E2}",
			label: "Writing code, running tests",
			pct: 75,
			color: "bg-green-500",
			display: "75%",
		},
		{
			icon: "\u{1F7E1}",
			label: "Context getting low",
			pct: 50,
			color: "bg-yellow-500",
			display: "50%",
		},
		{
			icon: "\u{1F7E0}",
			label: "Warning! Save your work",
			pct: 35,
			color: "bg-orange-500",
			display: "35% \u26A0\uFE0F",
		},
		{
			icon: "\u{1F534}",
			label: "Context critical!",
			pct: 25,
			color: "bg-rose-500",
			display: "25% \u{1F6A8}",
		},
		{
			icon: "\u{1F4BE}",
			label: "AI saves state to files -- session ends",
			pct: 8,
			color: "bg-rose-500",
			display: "8%",
		},
		{
			icon: "\u{1F504}",
			label: "New session starts -- fresh context!",
			pct: 100,
			color: "bg-green-500",
			display: "100%",
		},
		{
			icon: "\u{1F4C2}",
			label: "AI loads state -- continues exactly where it left off",
			pct: 100,
			color: "bg-green-500",
			display: "100%",
		},
	]

	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-8 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
		>
			{frames.map((frame, i) => (
				<div
					key={frame.label}
					className={`flex items-center gap-4 px-5 py-3.5 ${
						i < frames.length - 1
							? "border-b border-gray-100 dark:border-gray-800"
							: ""
					}`}
				>
					<span className="min-w-[2rem] text-center text-xl">{frame.icon}</span>
					<span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
						{frame.label}
					</span>
					<div className="h-3 w-[120px] flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 max-sm:w-[80px]">
						<div
							className={`h-full rounded-full transition-all duration-[2s] ${frame.color}`}
							style={{ width: inView ? `${frame.pct}%` : "0%" }}
						/>
					</div>
					<span className="min-w-[50px] text-right text-xs font-semibold text-gray-500 dark:text-gray-400">
						{frame.display}
					</span>
				</div>
			))}
		</motion.div>
	)
}
