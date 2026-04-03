import type { Hat, Workflow, WorkflowData } from "./types"

const hats: Record<string, Hat> = {
	elaborator: {
		id: "elaborator",
		name: "Elaborator",
		emoji: "🔍",
		description: "Clarifies requirements and expands on user intent",
		responsibilities: [
			"Ask clarifying questions",
			"Identify ambiguities in requirements",
			"Expand high-level goals into specifics",
			"Document assumptions and constraints",
		],
		color: {
			bg: "bg-blue-100",
			bgDark: "bg-blue-900/30",
			border: "border-blue-400",
			borderDark: "border-blue-500",
			text: "text-blue-700",
			textDark: "text-blue-300",
			glow: "rgba(59, 130, 246, 0.5)",
		},
	},
	planner: {
		id: "planner",
		name: "Planner",
		emoji: "📋",
		description: "Designs implementation approach and creates actionable plans",
		responsibilities: [
			"Break work into discrete steps",
			"Identify dependencies and risks",
			"Define completion criteria",
			"Estimate complexity and scope",
		],
		color: {
			bg: "bg-purple-100",
			bgDark: "bg-purple-900/30",
			border: "border-purple-400",
			borderDark: "border-purple-500",
			text: "text-purple-700",
			textDark: "text-purple-300",
			glow: "rgba(168, 85, 247, 0.5)",
		},
	},
	builder: {
		id: "builder",
		name: "Builder",
		emoji: "🔨",
		description: "Executes the plan and writes code",
		responsibilities: [
			"Implement features according to plan",
			"Write clean, maintainable code",
			"Follow established patterns",
			"Handle edge cases",
		],
		color: {
			bg: "bg-green-100",
			bgDark: "bg-green-900/30",
			border: "border-green-400",
			borderDark: "border-green-500",
			text: "text-green-700",
			textDark: "text-green-300",
			glow: "rgba(34, 197, 94, 0.5)",
		},
	},
	reviewer: {
		id: "reviewer",
		name: "Reviewer",
		emoji: "✅",
		description: "Validates quality and completeness",
		responsibilities: [
			"Review code quality",
			"Verify tests pass",
			"Check completion criteria",
			"Identify remaining issues",
		],
		color: {
			bg: "bg-amber-100",
			bgDark: "bg-amber-900/30",
			border: "border-amber-400",
			borderDark: "border-amber-500",
			text: "text-amber-700",
			textDark: "text-amber-300",
			glow: "rgba(245, 158, 11, 0.5)",
		},
	},
	"test-writer": {
		id: "test-writer",
		name: "Test Writer",
		emoji: "🧪",
		description: "Writes tests before implementation",
		responsibilities: [
			"Define test cases from requirements",
			"Write failing tests first",
			"Cover edge cases and error states",
			"Ensure tests are deterministic",
		],
		color: {
			bg: "bg-red-100",
			bgDark: "bg-red-900/30",
			border: "border-red-400",
			borderDark: "border-red-500",
			text: "text-red-700",
			textDark: "text-red-300",
			glow: "rgba(239, 68, 68, 0.5)",
		},
	},
	implementer: {
		id: "implementer",
		name: "Implementer",
		emoji: "⚡",
		description: "Implements code to make tests pass",
		responsibilities: [
			"Write minimal code to pass tests",
			"Focus on correctness first",
			"Avoid premature optimization",
			"Keep implementation simple",
		],
		color: {
			bg: "bg-cyan-100",
			bgDark: "bg-cyan-900/30",
			border: "border-cyan-400",
			borderDark: "border-cyan-500",
			text: "text-cyan-700",
			textDark: "text-cyan-300",
			glow: "rgba(6, 182, 212, 0.5)",
		},
	},
	refactorer: {
		id: "refactorer",
		name: "Refactorer",
		emoji: "🔄",
		description: "Improves code quality while maintaining behavior",
		responsibilities: [
			"Clean up implementation",
			"Remove duplication",
			"Improve naming and structure",
			"Ensure tests still pass",
		],
		color: {
			bg: "bg-indigo-100",
			bgDark: "bg-indigo-900/30",
			border: "border-indigo-400",
			borderDark: "border-indigo-500",
			text: "text-indigo-700",
			textDark: "text-indigo-300",
			glow: "rgba(99, 102, 241, 0.5)",
		},
	},
	"red-team": {
		id: "red-team",
		name: "Red Team",
		emoji: "🔴",
		description: "Finds vulnerabilities and weaknesses",
		responsibilities: [
			"Identify security vulnerabilities",
			"Find edge cases that break logic",
			"Test error handling paths",
			"Challenge assumptions",
		],
		color: {
			bg: "bg-rose-100",
			bgDark: "bg-rose-900/30",
			border: "border-rose-400",
			borderDark: "border-rose-500",
			text: "text-rose-700",
			textDark: "text-rose-300",
			glow: "rgba(244, 63, 94, 0.5)",
		},
	},
	"blue-team": {
		id: "blue-team",
		name: "Blue Team",
		emoji: "🔵",
		description: "Defends and hardens the implementation",
		responsibilities: [
			"Fix identified vulnerabilities",
			"Add defensive code",
			"Improve error handling",
			"Add input validation",
		],
		color: {
			bg: "bg-sky-100",
			bgDark: "bg-sky-900/30",
			border: "border-sky-400",
			borderDark: "border-sky-500",
			text: "text-sky-700",
			textDark: "text-sky-300",
			glow: "rgba(14, 165, 233, 0.5)",
		},
	},
	observer: {
		id: "observer",
		name: "Observer",
		emoji: "👁️",
		description: "Gathers data and observations",
		responsibilities: [
			"Collect metrics and logs",
			"Document observed behavior",
			"Note anomalies and patterns",
			"Prepare data for analysis",
		],
		color: {
			bg: "bg-slate-100",
			bgDark: "bg-slate-900/30",
			border: "border-slate-400",
			borderDark: "border-slate-500",
			text: "text-slate-700",
			textDark: "text-slate-300",
			glow: "rgba(100, 116, 139, 0.5)",
		},
	},
	hypothesizer: {
		id: "hypothesizer",
		name: "Hypothesizer",
		emoji: "💡",
		description: "Formulates testable hypotheses",
		responsibilities: [
			"Analyze observations",
			"Generate possible explanations",
			"Formulate testable hypotheses",
			"Prioritize hypotheses to test",
		],
		color: {
			bg: "bg-yellow-100",
			bgDark: "bg-yellow-900/30",
			border: "border-yellow-400",
			borderDark: "border-yellow-500",
			text: "text-yellow-700",
			textDark: "text-yellow-300",
			glow: "rgba(234, 179, 8, 0.5)",
		},
	},
	experimenter: {
		id: "experimenter",
		name: "Experimenter",
		emoji: "🔬",
		description: "Designs and runs experiments",
		responsibilities: [
			"Design controlled experiments",
			"Implement test conditions",
			"Run experiments systematically",
			"Collect experiment data",
		],
		color: {
			bg: "bg-teal-100",
			bgDark: "bg-teal-900/30",
			border: "border-teal-400",
			borderDark: "border-teal-500",
			text: "text-teal-700",
			textDark: "text-teal-300",
			glow: "rgba(20, 184, 166, 0.5)",
		},
	},
	analyst: {
		id: "analyst",
		name: "Analyst",
		emoji: "📊",
		description: "Analyzes results and draws conclusions",
		responsibilities: [
			"Analyze experiment results",
			"Validate or refute hypotheses",
			"Draw actionable conclusions",
			"Recommend next steps",
		],
		color: {
			bg: "bg-orange-100",
			bgDark: "bg-orange-900/30",
			border: "border-orange-400",
			borderDark: "border-orange-500",
			text: "text-orange-700",
			textDark: "text-orange-300",
			glow: "rgba(249, 115, 22, 0.5)",
		},
	},
}

const workflows: Workflow[] = [
	{
		id: "default",
		name: "Default",
		description:
			"The standard AI-DLC workflow for most development tasks. Human involvement at critical decision points with autonomous building.",
		steps: [
			{
				hatId: "elaborator",
				description: "Clarify requirements and expand on the intent",
			},
			{
				hatId: "planner",
				description: "Design the implementation approach",
			},
			{
				hatId: "builder",
				description: "Execute the plan and write code",
			},
			{
				hatId: "reviewer",
				description: "Validate quality and completeness",
			},
		],
		iterationLoop: {
			fromStep: 3,
			toStep: 2,
			label: "Issues found",
		},
	},
	{
		id: "tdd",
		name: "TDD",
		description:
			"Test-Driven Development workflow. Write tests first, implement to pass tests, then refactor for quality.",
		steps: [
			{
				hatId: "test-writer",
				description: "Write failing tests that define the requirements",
			},
			{
				hatId: "implementer",
				description: "Write minimal code to make tests pass",
			},
			{
				hatId: "refactorer",
				description: "Improve code quality while keeping tests green",
			},
		],
		iterationLoop: {
			fromStep: 2,
			toStep: 0,
			label: "Next feature",
		},
	},
	{
		id: "adversarial",
		name: "Adversarial",
		description:
			"Security-focused workflow with red team/blue team dynamics. Build, attack, defend, and verify.",
		steps: [
			{
				hatId: "builder",
				description: "Implement the feature or system",
			},
			{
				hatId: "red-team",
				description: "Attempt to break or exploit the implementation",
			},
			{
				hatId: "blue-team",
				description: "Fix vulnerabilities and harden the system",
			},
			{
				hatId: "reviewer",
				description: "Verify security and completeness",
			},
		],
		iterationLoop: {
			fromStep: 3,
			toStep: 1,
			label: "New vulnerabilities",
		},
	},
	{
		id: "hypothesis",
		name: "Hypothesis",
		description:
			"Scientific method workflow for research and debugging. Observe, hypothesize, experiment, and analyze.",
		steps: [
			{
				hatId: "observer",
				description: "Gather data and document observations",
			},
			{
				hatId: "hypothesizer",
				description: "Formulate testable hypotheses",
			},
			{
				hatId: "experimenter",
				description: "Design and run controlled experiments",
			},
			{
				hatId: "analyst",
				description: "Analyze results and draw conclusions",
			},
		],
		iterationLoop: {
			fromStep: 3,
			toStep: 1,
			label: "New hypothesis",
		},
	},
]

export const workflowData: WorkflowData = {
	hats,
	workflows,
}
