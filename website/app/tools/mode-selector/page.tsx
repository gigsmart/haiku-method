import type { Metadata } from "next"
import { Suspense } from "react"
import { ModeSelector } from "../../components/ModeSelector"

export const metadata: Metadata = {
	title: "Mode Selector",
	description:
		"Find the right AI operating mode for your task. Answer 5 questions to get a recommendation for HITL, OHOTL, or AHOTL.",
	openGraph: {
		title: "Mode Selector - AI-DLC",
		description:
			"Find the right AI operating mode for your task. Answer 5 questions to get a recommendation for HITL, OHOTL, or AHOTL.",
	},
}

function ModeSelectorLoading() {
	return (
		<div className="mx-auto max-w-2xl animate-pulse">
			<div className="mb-8">
				<div className="mb-2 h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
				<div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
			</div>
			<div className="mb-6">
				<div className="mb-2 h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
				<div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
			</div>
			<div className="space-y-3">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-24 w-full rounded-xl border-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
					/>
				))}
			</div>
		</div>
	)
}

export default function ModeSelectorPage() {
	return (
		<div className="px-4 py-12 sm:py-16">
			{/* Page Header */}
			<div className="mx-auto mb-12 max-w-2xl text-center">
				<h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
					Mode Selector
				</h1>
				<p className="text-lg text-gray-600 dark:text-gray-400">
					Answer 5 questions to find the right operating mode for your task. Get
					a recommendation for <span className="font-medium">HITL</span>,{" "}
					<span className="font-medium">OHOTL</span>, or{" "}
					<span className="font-medium">AHOTL</span>.
				</p>
			</div>

			{/* Mode Selector Component */}
			<Suspense fallback={<ModeSelectorLoading />}>
				<ModeSelector />
			</Suspense>

			{/* Footer Info */}
			<div className="mx-auto mt-16 max-w-2xl border-t border-gray-200 pt-8 dark:border-gray-800">
				<h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
					About Operating Modes
				</h2>
				<p className="mb-4 text-gray-600 dark:text-gray-400">
					AI-DLC defines three operating modes that determine the level of human
					involvement during AI-assisted work:
				</p>
				<ul className="space-y-2 text-gray-600 dark:text-gray-400">
					<li>
						<strong className="text-gray-900 dark:text-white">HITL</strong>{" "}
						(Human-in-the-Loop) - Human validates each step before AI proceeds
					</li>
					<li>
						<strong className="text-gray-900 dark:text-white">OHOTL</strong>{" "}
						(Observed Human-on-the-Loop) - Human watches and can intervene
						anytime
					</li>
					<li>
						<strong className="text-gray-900 dark:text-white">AHOTL</strong>{" "}
						(Autonomous Human-on-the-Loop) - AI operates autonomously within
						boundaries
					</li>
				</ul>
				<p className="mt-4 text-gray-600 dark:text-gray-400">
					Learn more in the{" "}
					<a
						href="/docs/concepts/"
						className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
					>
						Core Concepts documentation
					</a>
					.
				</p>
			</div>
		</div>
	)
}
