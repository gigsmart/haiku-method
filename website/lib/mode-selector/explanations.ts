import type { Question } from "./questions"
import type { Mode, Scores } from "./scoring"

export interface ModeInfo {
	name: string
	fullName: string
	description: string
	diagram: string
	useWhen: string[]
	docLink: string
}

export const modeInfo: Record<Mode, ModeInfo> = {
	HITL: {
		name: "HITL",
		fullName: "Human-in-the-Loop",
		description:
			"Human validates each significant step before AI proceeds. Maximum oversight for high-stakes or novel work.",
		diagram: `Human defines task
    |
    v
AI proposes approach
    |
    v
Human validates <--+
    |              |
    v              |
AI executes        |
    |              |
    v              |
Human reviews -----+`,
		useWhen: [
			"Novel domains or first-time implementations",
			"Architectural decisions with long-term consequences",
			"High-risk operations (production data, security)",
			"Foundational decisions shaping later work",
		],
		docLink: "/docs/concepts/#hitl-human-in-the-loop",
	},
	OHOTL: {
		name: "OHOTL",
		fullName: "Observed Human-on-the-Loop",
		description:
			"Human watches in real-time, can intervene anytime, but doesn't block progress. Balance of speed and oversight.",
		diagram: `Human defines criteria
    |
    v
AI works <---------+
    |              |
    v              |
Human observes     |
    |              |
    v              |
Redirect? --Yes----+
    |
    No
    |
    v
Criteria met? --No--> (continue)
    |
   Yes
    |
    v
Human reviews output`,
		useWhen: [
			"Creative and subjective work (UX, design, content)",
			"Training scenarios where observation has value",
			"Medium-risk changes benefiting from awareness",
			"Iterative refinement where taste guides direction",
		],
		docLink: "/docs/concepts/#ohotl-observed-human-on-the-loop",
	},
	AHOTL: {
		name: "AHOTL",
		fullName: "Autonomous Human-on-the-Loop",
		description:
			"AI operates autonomously within boundaries until criteria are met. Maximum velocity for well-defined work.",
		diagram: `Human defines criteria
    |
    v
AI iterates autonomously <--+
    |                       |
    v                       |
Quality gates pass? --No----+
    |
   Yes
    |
    v
Criteria met? --No----------+
    |
   Yes
    |
    v
Human reviews output`,
		useWhen: [
			"Well-defined tasks with clear acceptance criteria",
			"Programmatically verifiable work",
			"Batch operations (migrations, refactors)",
			"Mechanical transformations following patterns",
		],
		docLink: "/docs/concepts/#ahotl-autonomous-human-on-the-loop",
	},
}

interface FactorAnalysis {
	factor: string
	impact: "strong" | "moderate" | "neutral"
	direction: Mode
	explanation: string
}

/**
 * Generate explanation of why a particular mode was recommended
 */
export function generateExplanation(
	questions: Question[],
	answers: number[],
	_scores: Scores,
	recommendedMode: Mode,
): string {
	const factors: FactorAnalysis[] = []

	// Analyze each answer's contribution
	for (let i = 0; i < questions.length; i++) {
		const question = questions[i]
		const answer = answers[i]
		const option = question.options[answer]

		if (!option) continue

		const weights = option.weights
		const maxWeight = Math.max(weights.HITL, weights.OHOTL, weights.AHOTL)
		const dominantMode = (Object.entries(weights) as [Mode, number][]).find(
			([_, w]) => w === maxWeight,
		)?.[0]

		if (dominantMode && maxWeight >= 2) {
			factors.push({
				factor: question.title.replace("?", ""),
				impact: maxWeight === 3 ? "strong" : "moderate",
				direction: dominantMode,
				explanation: option.label.toLowerCase(),
			})
		}
	}

	// Build explanation text
	const strongFactors = factors.filter(
		(f) => f.impact === "strong" && f.direction === recommendedMode,
	)
	const moderateFactors = factors.filter(
		(f) => f.impact === "moderate" && f.direction === recommendedMode,
	)

	let explanation = `Based on your answers, **${modeInfo[recommendedMode].fullName} (${recommendedMode})** is recommended.\n\n`

	if (strongFactors.length > 0) {
		explanation += "**Key factors:**\n"
		for (const factor of strongFactors) {
			explanation += `- ${factor.factor}: ${factor.explanation}\n`
		}
		explanation += "\n"
	}

	if (moderateFactors.length > 0) {
		explanation += "**Supporting factors:**\n"
		for (const factor of moderateFactors) {
			explanation += `- ${factor.factor}: ${factor.explanation}\n`
		}
		explanation += "\n"
	}

	// Add mode-specific advice
	const info = modeInfo[recommendedMode]
	explanation += `**What this means:**\n${info.description}\n`

	return explanation
}

/**
 * Get summary of scores for visualization
 */
export function getScoreSummary(scores: Scores): {
	mode: Mode
	score: number
	percentage: number
}[] {
	const maxPossible = 15 // 5 questions * 3 max weight
	const modes: Mode[] = ["HITL", "OHOTL", "AHOTL"]

	return modes.map((mode) => ({
		mode,
		score: scores[mode],
		percentage: Math.round((scores[mode] / maxPossible) * 100),
	}))
}
