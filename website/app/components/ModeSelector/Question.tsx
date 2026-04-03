"use client"

import type { Question as QuestionType } from "../../../lib/mode-selector"

interface QuestionProps {
	question: QuestionType
	selectedAnswer: number | undefined
	onSelect: (index: number) => void
}

export function Question({
	question,
	selectedAnswer,
	onSelect,
}: QuestionProps) {
	return (
		<div className="space-y-6">
			<div>
				<h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
					{question.title}
				</h2>
				<p className="text-gray-600 dark:text-gray-400">
					{question.description}
				</p>
			</div>

			<div className="space-y-3">
				{question.options.map((option, index) => {
					const isSelected = selectedAnswer === index
					return (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: options have no stable ID
							key={index}
							type="button"
							onClick={() => onSelect(index)}
							className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
								isSelected
									? "border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
									: "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50"
							}`}
						>
							<div className="flex items-start gap-4">
								<div
									className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
										isSelected
											? "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400"
											: "border-gray-300 dark:border-gray-600"
									}`}
								>
									{isSelected && (
										<svg
											className="h-3.5 w-3.5 text-white"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={3}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									)}
								</div>
								<div className="flex-1">
									<div
										className={`font-medium ${
											isSelected
												? "text-blue-900 dark:text-blue-100"
												: "text-gray-900 dark:text-white"
										}`}
									>
										{option.label}
									</div>
									<div
										className={`mt-1 text-sm ${
											isSelected
												? "text-blue-700 dark:text-blue-300"
												: "text-gray-500 dark:text-gray-400"
										}`}
									>
										{option.description}
									</div>
								</div>
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}
