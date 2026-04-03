"use client"

import Link from "next/link"
import type { Mode, Scores } from "../../../lib/mode-selector"
import { getScoreSummary, modeInfo } from "../../../lib/mode-selector"

interface ModeResultProps {
	recommendedMode: Mode
	scores: Scores
	confidence: number
}

const modeColors: Record<Mode, { bg: string; border: string; text: string }> = {
	HITL: {
		bg: "bg-amber-50 dark:bg-amber-950/30",
		border: "border-amber-300 dark:border-amber-700",
		text: "text-amber-700 dark:text-amber-300",
	},
	OHOTL: {
		bg: "bg-purple-50 dark:bg-purple-950/30",
		border: "border-purple-300 dark:border-purple-700",
		text: "text-purple-700 dark:text-purple-300",
	},
	AHOTL: {
		bg: "bg-green-50 dark:bg-green-950/30",
		border: "border-green-300 dark:border-green-700",
		text: "text-green-700 dark:text-green-300",
	},
}

export function ModeResult({
	recommendedMode,
	scores,
	confidence,
}: ModeResultProps) {
	const info = modeInfo[recommendedMode]
	const colors = modeColors[recommendedMode]
	const summary = getScoreSummary(scores)

	return (
		<div className="space-y-8">
			{/* Main Result Card */}
			<div className={`rounded-2xl border-2 p-8 ${colors.bg} ${colors.border}`}>
				<div className="mb-4 flex items-center justify-between">
					<div>
						<div className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
							Recommended Mode
						</div>
						<h2 className="text-3xl font-bold text-gray-900 dark:text-white">
							{info.fullName}
						</h2>
						<div className={`text-lg font-medium ${colors.text}`}>
							({info.name})
						</div>
					</div>
					<div className="text-right">
						<div className="text-4xl font-bold text-gray-900 dark:text-white">
							{confidence}%
						</div>
						<div className="text-sm text-gray-500 dark:text-gray-400">
							confidence
						</div>
					</div>
				</div>

				<p className="text-gray-700 dark:text-gray-300">{info.description}</p>

				<div className="mt-6">
					<Link
						href={info.docLink}
						className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
					>
						Learn more about {info.name}
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 7l5 5m0 0l-5 5m5-5H6"
							/>
						</svg>
					</Link>
				</div>
			</div>

			{/* Score Breakdown */}
			<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800/50">
				<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					Score Breakdown
				</h3>
				<div className="space-y-4">
					{summary.map(({ mode, score, percentage }) => {
						const isWinner = mode === recommendedMode
						return (
							<div key={mode}>
								<div className="mb-1 flex items-center justify-between text-sm">
									<span
										className={
											isWinner
												? "font-semibold text-gray-900 dark:text-white"
												: "text-gray-600 dark:text-gray-400"
										}
									>
										{modeInfo[mode].name}
									</span>
									<span
										className={
											isWinner
												? "font-semibold text-gray-900 dark:text-white"
												: "text-gray-600 dark:text-gray-400"
										}
									>
										{score}/15 ({percentage}%)
									</span>
								</div>
								<div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
									<div
										className={`h-2 rounded-full transition-all duration-500 ${
											isWinner
												? "bg-gradient-to-r from-blue-600 to-purple-600"
												: "bg-gray-400 dark:bg-gray-500"
										}`}
										style={{ width: `${percentage}%` }}
									/>
								</div>
							</div>
						)
					})}
				</div>
			</div>

			{/* Use When Section */}
			<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800/50">
				<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					Use {info.name} When
				</h3>
				<ul className="space-y-2">
					{info.useWhen.map((item, index) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: list items have no stable ID
							key={index}
							className="flex items-start gap-3"
						>
							<svg
								className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
							<span className="text-gray-700 dark:text-gray-300">{item}</span>
						</li>
					))}
				</ul>
			</div>

			{/* Workflow Diagram */}
			<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800/50">
				<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					{info.name} Workflow
				</h3>
				<pre className="overflow-x-auto rounded-lg bg-gray-100 p-4 font-mono text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-200">
					{info.diagram}
				</pre>
			</div>
		</div>
	)
}
