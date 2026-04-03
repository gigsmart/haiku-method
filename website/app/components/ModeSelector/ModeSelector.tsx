"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
	calculateScores,
	decodeAnswers,
	encodeAnswers,
	isValidAnswers,
	questions,
} from "../../../lib/mode-selector"
import { ModeExplanation } from "./ModeExplanation"
import { ModeResult } from "./ModeResult"
import { ProgressIndicator } from "./ProgressIndicator"
import { Question } from "./Question"

type State = "questionnaire" | "results"

export function ModeSelector() {
	const router = useRouter()
	const searchParams = useSearchParams()

	// Initialize from URL if present
	const [answers, setAnswers] = useState<(number | undefined)[]>(() => {
		const encoded = searchParams.get("a")
		if (encoded && encoded.length === questions.length) {
			const decoded = decodeAnswers(encoded)
			if (isValidAnswers(decoded, questions.length)) {
				return decoded
			}
		}
		return Array(questions.length).fill(undefined)
	})

	const [currentQuestion, setCurrentQuestion] = useState(0)
	const [state, setState] = useState<State>(() => {
		const encoded = searchParams.get("a")
		if (encoded && encoded.length === questions.length) {
			const decoded = decodeAnswers(encoded)
			if (isValidAnswers(decoded, questions.length)) {
				return "results"
			}
		}
		return "questionnaire"
	})
	const [copied, setCopied] = useState(false)

	// Calculate results
	const completedAnswers = answers.filter((a): a is number => a !== undefined)
	const isComplete = completedAnswers.length === questions.length
	const result = isComplete
		? calculateScores(questions, completedAnswers)
		: null

	// Handle answer selection
	const handleSelect = useCallback(
		(index: number) => {
			setAnswers((prev) => {
				const next = [...prev]
				next[currentQuestion] = index
				return next
			})
		},
		[currentQuestion],
	)

	// Navigation
	const goNext = useCallback(() => {
		if (currentQuestion < questions.length - 1) {
			setCurrentQuestion((prev) => prev + 1)
		} else if (isComplete && result) {
			setState("results")
			// Update URL with answers
			const encoded = encodeAnswers(completedAnswers)
			router.replace(`?a=${encoded}`, { scroll: false })
		}
	}, [currentQuestion, isComplete, result, completedAnswers, router])

	const goBack = useCallback(() => {
		if (state === "results") {
			setState("questionnaire")
			setCurrentQuestion(questions.length - 1)
		} else if (currentQuestion > 0) {
			setCurrentQuestion((prev) => prev - 1)
		}
	}, [state, currentQuestion])

	const startOver = useCallback(() => {
		setAnswers(Array(questions.length).fill(undefined))
		setCurrentQuestion(0)
		setState("questionnaire")
		router.replace("/tools/mode-selector/", { scroll: false })
	}, [router])

	// Copy share URL
	const copyShareUrl = useCallback(async () => {
		if (!isComplete) return
		const encoded = encodeAnswers(completedAnswers)
		const url = `${window.location.origin}/tools/mode-selector/?a=${encoded}`
		await navigator.clipboard.writeText(url)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}, [isComplete, completedAnswers])

	// Auto-advance when an answer is selected
	useEffect(() => {
		if (answers[currentQuestion] !== undefined) {
			const timer = setTimeout(() => {
				if (currentQuestion < questions.length - 1) {
					setCurrentQuestion((prev) => prev + 1)
				}
			}, 300)
			return () => clearTimeout(timer)
		}
	}, [answers, currentQuestion])

	return (
		<div className="mx-auto max-w-2xl">
			{state === "questionnaire" ? (
				<>
					<ProgressIndicator
						current={currentQuestion + 1}
						total={questions.length}
					/>

					<Question
						question={questions[currentQuestion]}
						selectedAnswer={answers[currentQuestion]}
						onSelect={handleSelect}
					/>

					{/* Navigation */}
					<div className="mt-8 flex items-center justify-between">
						<button
							type="button"
							onClick={goBack}
							disabled={currentQuestion === 0}
							className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
						>
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
									d="M15 19l-7-7 7-7"
								/>
							</svg>
							Back
						</button>

						<button
							type="button"
							onClick={goNext}
							disabled={answers[currentQuestion] === undefined}
							className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
						>
							{currentQuestion === questions.length - 1
								? "See Results"
								: "Next"}
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
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					</div>
				</>
			) : result ? (
				<>
					{/* Results Header */}
					<div className="mb-8 text-center">
						<h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
							Your Recommended Mode
						</h1>
						<p className="text-gray-600 dark:text-gray-400">
							Based on your answers, here's the operating mode that best fits
							your situation.
						</p>
					</div>

					<ModeResult
						recommendedMode={result.recommendedMode}
						scores={result.scores}
						confidence={result.confidence}
					/>

					<div className="mt-8">
						<ModeExplanation
							questions={questions}
							answers={completedAnswers}
							recommendedMode={result.recommendedMode}
						/>
					</div>

					{/* Actions */}
					<div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<button
							type="button"
							onClick={startOver}
							className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
						>
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
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
							Start Over
						</button>

						<div className="flex gap-3">
							<button
								type="button"
								onClick={goBack}
								className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
							>
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
										d="M15 19l-7-7 7-7"
									/>
								</svg>
								Edit Answers
							</button>

							<button
								type="button"
								onClick={copyShareUrl}
								className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
							>
								{copied ? (
									<>
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
												d="M5 13l4 4L19 7"
											/>
										</svg>
										Copied!
									</>
								) : (
									<>
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
												d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
											/>
										</svg>
										Share Results
									</>
								)}
							</button>
						</div>
					</div>
				</>
			) : null}
		</div>
	)
}
