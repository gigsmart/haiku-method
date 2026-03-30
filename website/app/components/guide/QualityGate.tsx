"use client"

import { motion } from "framer-motion"

export function Tollbooth() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-8 rounded-2xl border-2 border-cyan-400/20 bg-white p-8 text-center dark:bg-gray-900"
		>
			<div className="mb-6 text-lg font-bold text-cyan-400">
				&#x1F6A7; Quality Checkpoint &#x1F6A7;
			</div>

			{/* Pass lanes */}
			<div className="mb-6 grid gap-4 sm:grid-cols-3">
				<TollLane
					icon="&#x2705;"
					label="Tests"
					desc="All pass"
					variant="pass"
				/>
				<TollLane
					icon="&#x2705;"
					label="Types"
					desc="No errors"
					variant="pass"
				/>
				<TollLane
					icon="&#x2705;"
					label="Linting"
					desc="Clean code"
					variant="pass"
				/>
			</div>

			<div className="flex items-center justify-center gap-3 border-t border-gray-200 pt-5 font-semibold text-green-500 dark:border-gray-700">
				&#x2192; Gate opens -- proceed to the next hat
			</div>

			{/* Fail lanes */}
			<div className="mt-5 grid gap-4 sm:grid-cols-3">
				<TollLane
					icon="&#x274C;"
					label="Tests"
					desc="Failures!"
					variant="fail"
				/>
				<TollLane icon="&#x274C;" label="Types" desc="Errors!" variant="fail" />
				<TollLane
					icon="&#x274C;"
					label="Linting"
					desc="Issues!"
					variant="fail"
				/>
			</div>

			<div className="mt-4 flex items-center justify-center gap-3 border-t border-gray-200 pt-5 font-semibold text-rose-500 dark:border-gray-700">
				&#x2190; Go back and fix -- cannot advance
			</div>
		</motion.div>
	)
}

function TollLane({
	icon,
	label,
	desc,
	variant,
}: { icon: string; label: string; desc: string; variant: "pass" | "fail" }) {
	const styles = {
		pass: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
		fail: "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800",
	}

	return (
		<div className={`rounded-lg border p-4 ${styles[variant]}`}>
			<div className="mb-1 text-2xl">{icon}</div>
			<div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
				{label}
			</div>
			<div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
		</div>
	)
}

export function GateCards() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="mt-3 grid gap-3 sm:grid-cols-3"
		>
			<GateCard
				num={1}
				title="Plan Gate"
				desc="Planner must save a complete implementation plan before the Builder can start."
				quote="No building without a blueprint."
			/>
			<GateCard
				num={2}
				title="Quality Gate"
				desc="Tests + types + lint must all pass before the Reviewer looks at the code."
				quote="No review of broken code."
			/>
			<GateCard
				num={3}
				title="Criteria Gate"
				desc="Every success criterion verified with concrete evidence before marking the unit done."
				quote="No shipping without proof."
			/>
		</motion.div>
	)
}

function GateCard({
	num,
	title,
	desc,
	quote,
}: { num: number; title: string; desc: string; quote: string }) {
	return (
		<div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
			<h4 className="mb-1.5 text-sm font-bold text-cyan-400">
				{num}. {title}
			</h4>
			<p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
			<p className="text-xs italic text-gray-400 dark:text-gray-500">
				&ldquo;{quote}&rdquo;
			</p>
		</div>
	)
}
