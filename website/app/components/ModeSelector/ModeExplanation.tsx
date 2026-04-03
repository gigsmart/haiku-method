"use client"

import type { Mode, Question as QuestionType } from "../../../lib/mode-selector"
import { modeInfo } from "../../../lib/mode-selector"

interface ModeExplanationProps {
	questions: QuestionType[]
	answers: number[]
	recommendedMode: Mode
}

export function ModeExplanation({
	questions,
	answers,
	recommendedMode,
}: ModeExplanationProps) {
	// Analyze which answers contributed most to the result
	const factors: {
		question: string
		answer: string
		contribution: Mode
		strength: "strong" | "moderate"
	}[] = []

	for (let i = 0; i < questions.length; i++) {
		const question = questions[i]
		const answer = answers[i]
		const option = question.options[answer]

		if (!option) continue

		const weights = option.weights
		const maxWeight = Math.max(weights.HITL, weights.OHOTL, weights.AHOTL)

		if (maxWeight >= 2) {
			const dominantMode = (Object.entries(weights) as [Mode, number][]).reduce(
				(a, b) => (a[1] > b[1] ? a : b),
			)[0]

			factors.push({
				question: question.title.replace("?", ""),
				answer: option.label,
				contribution: dominantMode,
				strength: maxWeight === 3 ? "strong" : "moderate",
			})
		}
	}

	const alignedFactors = factors.filter(
		(f) => f.contribution === recommendedMode,
	)
	const opposingFactors = factors.filter(
		(f) => f.contribution !== recommendedMode,
	)

	return (
		<div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800/50">
			<h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
				Why {modeInfo[recommendedMode].name}?
			</h3>

			<div className="space-y-6">
				{alignedFactors.length > 0 && (
					<div>
						<h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
							Factors supporting this recommendation
						</h4>
						<div className="space-y-2">
							{alignedFactors.map((factor, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: factors have no stable ID
									key={index}
									className="flex items-start gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-950/20"
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
									<div>
										<div className="font-medium text-gray-900 dark:text-white">
											{factor.question}
										</div>
										<div className="text-sm text-gray-600 dark:text-gray-400">
											You selected: {factor.answer}
											{factor.strength === "strong" && (
												<span className="ml-2 text-green-600 dark:text-green-400">
													(strong indicator)
												</span>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{opposingFactors.length > 0 && (
					<div>
						<h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
							Factors suggesting other modes
						</h4>
						<div className="space-y-2">
							{opposingFactors.map((factor, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: factors have no stable ID
									key={index}
									className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20"
								>
									<svg
										className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<div>
										<div className="font-medium text-gray-900 dark:text-white">
											{factor.question}
										</div>
										<div className="text-sm text-gray-600 dark:text-gray-400">
											You selected: {factor.answer}
											<span className="ml-2 text-amber-600 dark:text-amber-400">
												(suggests {modeInfo[factor.contribution].name})
											</span>
										</div>
									</div>
								</div>
							))}
						</div>
						<p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
							These factors suggest some aspects of your work might benefit from
							a different mode. Consider the trade-offs and adjust as needed.
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
