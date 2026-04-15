import type { ReviewTransport } from "../src/transport"
import type {
	QuestionAnswer,
	ReviewAnnotations,
	ReviewDecision,
	SessionData,
} from "../src/types"

export function makeReviewSession(
	overrides: Partial<SessionData> = {},
): SessionData {
	return {
		session_id: "sess-1",
		session_type: "review",
		status: "pending",
		review_type: "intent",
		gate_type: "ask",
		intent: {
			slug: "test-intent",
			title: "Test Intent",
			frontmatter: { status: "in_progress" },
			sections: [
				{
					heading: "_preamble",
					level: 0,
					content: "Preamble copy.",
					subsections: [],
				},
				{
					heading: "Problem",
					level: 2,
					content: "A problem.",
					subsections: [],
				},
			],
		},
		criteria: [
			{ text: "A done criterion", checked: true },
			{ text: "An undone criterion", checked: false },
		],
		units: [],
		stage_states: {},
		knowledge_files: [],
		stage_artifacts: [],
		output_artifacts: [],
		...overrides,
	}
}

export function makeQuestionSession(
	overrides: Partial<SessionData> = {},
): SessionData {
	return {
		session_id: "sess-q",
		session_type: "question",
		status: "pending",
		title: "Confirm scope",
		context: "Need a decision",
		questions: [
			{
				question: "Pick one",
				options: ["A", "B"],
				multiSelect: false,
			},
		],
		...overrides,
	}
}

export function makeDirectionSession(
	overrides: Partial<SessionData> = {},
): SessionData {
	return {
		session_id: "sess-d",
		session_type: "design_direction",
		status: "pending",
		title: "Pick a direction",
		archetypes: [
			{
				name: "Modern",
				description: "Clean and minimal",
				preview_html: "<div />",
				default_parameters: { density: 0.5 },
			},
		],
		parameters: [
			{
				name: "density",
				label: "Density",
				description: "How dense",
				min: 0,
				max: 1,
				step: 0.1,
				default: 0.5,
				labels: { low: "Airy", high: "Dense" },
			},
		],
		...overrides,
	}
}

export interface FakeTransportCalls {
	fetchCount: number
	decisions: Array<{
		decision: ReviewDecision
		feedback: string
		annotations?: ReviewAnnotations
	}>
	answers: Array<{ answers: QuestionAnswer[]; feedback?: string }>
	directions: Array<{ archetype: string; parameters: Record<string, number> }>
}

export function makeFakeTransport(
	session: SessionData,
	opts: { heartbeat?: () => Promise<boolean> } = {},
): { transport: ReviewTransport; calls: FakeTransportCalls } {
	const calls: FakeTransportCalls = {
		fetchCount: 0,
		decisions: [],
		answers: [],
		directions: [],
	}

	const transport: ReviewTransport = {
		sessionId: session.session_id,
		async fetchSession() {
			calls.fetchCount++
			return session
		},
		async submitDecision(decision, feedback, annotations) {
			calls.decisions.push({ decision, feedback, annotations })
		},
		async submitAnswers(answers, feedback) {
			calls.answers.push({ answers, feedback })
		},
		async submitDirection(archetype, parameters) {
			calls.directions.push({ archetype, parameters })
		},
	}

	if (opts.heartbeat) transport.heartbeat = opts.heartbeat

	return { transport, calls }
}
