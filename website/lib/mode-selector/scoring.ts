import type { Question } from "./questions"

export type Mode = "HITL" | "OHOTL" | "AHOTL"

export interface Scores {
	HITL: number
	OHOTL: number
	AHOTL: number
}

export interface ScoringResult {
	recommendedMode: Mode
	scores: Scores
	confidence: number
	margin: number
}

/**
 * Calculate scores and recommended mode from answers
 * @param questions - The questions array
 * @param answers - Array of selected option indices (0-2) for each question
 */
export function calculateScores(
	questions: Question[],
	answers: number[],
): ScoringResult {
	const scores: Scores = { HITL: 0, OHOTL: 0, AHOTL: 0 }

	// Sum weights from all answers
	for (let i = 0; i < questions.length; i++) {
		const question = questions[i]
		const answerIndex = answers[i]
		if (answerIndex !== undefined && question.options[answerIndex]) {
			const weights = question.options[answerIndex].weights
			scores.HITL += weights.HITL
			scores.OHOTL += weights.OHOTL
			scores.AHOTL += weights.AHOTL
		}
	}

	// Determine winner
	const modes: Mode[] = ["HITL", "OHOTL", "AHOTL"]
	let recommendedMode: Mode = "HITL"
	let maxScore = scores.HITL

	for (const mode of modes) {
		if (scores[mode] > maxScore) {
			maxScore = scores[mode]
			recommendedMode = mode
		}
	}

	// Calculate margin (difference between winner and second place)
	const sortedScores = [...modes].map((m) => scores[m]).sort((a, b) => b - a)
	const margin = sortedScores[0] - sortedScores[1]

	// Calculate confidence: 50% base + (margin / maxPossible) * 50%
	// Max possible score per mode is 15 (5 questions * 3 max weight)
	// Max possible margin is 15 (if one mode gets all 3s and others get all 0s)
	const maxPossibleMargin = 15
	const confidence = Math.round(50 + (margin / maxPossibleMargin) * 50)

	return {
		recommendedMode,
		scores,
		confidence,
		margin,
	}
}

/**
 * Encode answers to URL-safe string
 * Each digit represents the selected option index (0-2)
 */
export function encodeAnswers(answers: number[]): string {
	return answers.map((a) => a.toString()).join("")
}

/**
 * Decode answers from URL string
 */
export function decodeAnswers(encoded: string): number[] {
	return encoded.split("").map((c) => {
		const num = Number.parseInt(c, 10)
		return Number.isNaN(num) ? 0 : num
	})
}

/**
 * Validate that answers array is complete and valid
 */
export function isValidAnswers(
	answers: number[],
	questionCount: number,
): boolean {
	if (answers.length !== questionCount) return false
	return answers.every((a) => a >= 0 && a <= 2)
}
