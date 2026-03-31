import type { DiagramData } from "./types"

// Layout constants
const CANVAS_WIDTH = 1000
const NODE_WIDTH = 140
const NODE_HEIGHT = 60
const LAYER_HEIGHT = 120
const LAYER_PADDING = 20

// Helper to calculate x position for evenly spaced nodes
const xPos = (index: number, total: number): number => {
	const spacing = CANVAS_WIDTH / (total + 1)
	return spacing * (index + 1) - NODE_WIDTH / 2
}

// Top row has 5 nodes now (Intent, Pass, Unit, Bolt, Deploy)
const TOP_ROW_COUNT = 5

export const diagramData: DiagramData = {
	layers: [
		{
			id: "layer-phases",
			label: "Development Phases",
			y: 0,
			height: LAYER_HEIGHT,
		},
		{
			id: "layer-hats",
			label: "Hats (Mindsets)",
			y: LAYER_HEIGHT + LAYER_PADDING,
			height: LAYER_HEIGHT,
		},
		{
			id: "layer-modes",
			label: "Operating Modes",
			y: (LAYER_HEIGHT + LAYER_PADDING) * 2,
			height: LAYER_HEIGHT,
		},
		{
			id: "layer-principles",
			label: "Core Principles",
			y: (LAYER_HEIGHT + LAYER_PADDING) * 3,
			height: LAYER_HEIGHT,
		},
	],
	nodes: [
		// Phase nodes (top row)
		{
			id: "intent",
			label: "Intent",
			description:
				"High-level statement of purpose defining what you want to achieve with clear completion criteria.",
			href: "/paper/#intent",
			category: "artifact",
			x: xPos(0, TOP_ROW_COUNT),
			y: 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "pass",
			label: "Pass",
			description:
				"A typed iteration (design, product, dev) through the standard AI-DLC loop. Enables cross-functional handoffs within a single intent.",
			href: "/paper/#pass",
			category: "artifact",
			x: xPos(1, TOP_ROW_COUNT),
			y: 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "unit",
			label: "Unit",
			description:
				"Cohesive, self-contained work element derived from an Intent. Independently deployable with clear boundaries.",
			href: "/paper/#unit",
			category: "artifact",
			x: xPos(2, TOP_ROW_COUNT),
			y: 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "bolt",
			label: "Bolt",
			description:
				"Single iteration cycle - one focused work session bounded by context resets. High-velocity delivery.",
			href: "/paper/#bolt",
			category: "artifact",
			x: xPos(3, TOP_ROW_COUNT),
			y: 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "deploy",
			label: "Deploy",
			description:
				"Ship verified work to production. Units are independently deployable when criteria are met.",
			href: "/paper/#deployment-unit",
			category: "artifact",
			x: xPos(4, TOP_ROW_COUNT),
			y: 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},

		// Hat nodes (second row)
		{
			id: "researcher",
			label: "Researcher",
			description:
				"Understand the problem space before acting. Read code, review requirements, identify constraints.",
			href: "/docs/hats/#researcher-hat",
			category: "hat",
			x: xPos(0, 4),
			y: LAYER_HEIGHT + LAYER_PADDING + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "planner",
			label: "Planner",
			description:
				"Design the implementation approach. Break work into steps, identify dependencies, evaluate trade-offs.",
			href: "/docs/hats/#planner-hat",
			category: "hat",
			x: xPos(1, 4),
			y: LAYER_HEIGHT + LAYER_PADDING + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "builder",
			label: "Builder",
			description:
				"Execute the plan and write code. Implement features, write tests, follow the plan without deviation.",
			href: "/docs/hats/#builder-hat",
			category: "hat",
			x: xPos(2, 4),
			y: LAYER_HEIGHT + LAYER_PADDING + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "reviewer",
			label: "Reviewer",
			description:
				"Validate quality and completeness. Run tests, check criteria, verify edge cases, ensure docs are complete.",
			href: "/docs/hats/#reviewer-hat",
			category: "hat",
			x: xPos(3, 4),
			y: LAYER_HEIGHT + LAYER_PADDING + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},

		// Operating mode nodes (third row)
		{
			id: "hitl",
			label: "HITL",
			description:
				"Human-in-the-Loop: Human validates each step. Use for novel domains, high-risk, and foundational decisions.",
			href: "/paper/#three-operating-modes-hitl-ohotl-and-ahotl",
			category: "operating-mode",
			x: xPos(0.5, 3),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 2 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "ohotl",
			label: "OHOTL",
			description:
				"Observed Human-on-the-Loop: Human watches, can intervene. Use for creative work and medium-risk changes.",
			href: "/paper/#three-operating-modes-hitl-ohotl-and-ahotl",
			category: "operating-mode",
			x: xPos(1.5, 3),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 2 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "ahotl",
			label: "AHOTL",
			description:
				"Autonomous Human-on-the-Loop: AI operates autonomously within boundaries. Use for well-defined, verifiable tasks.",
			href: "/paper/#three-operating-modes-hitl-ohotl-and-ahotl",
			category: "operating-mode",
			x: xPos(2.5, 3),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 2 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},

		// Principle nodes (bottom row)
		{
			id: "backpressure",
			label: "Backpressure",
			description:
				"Quality gates should block non-conforming work. Define constraints, let AI figure out how to satisfy them.",
			href: "/paper/#backpressure-over-prescription",
			category: "principle",
			x: xPos(0, 4),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 3 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "completion-criteria",
			label: "Completion Criteria",
			description:
				"Measurable, verifiable conditions that define success. Clear criteria enable autonomy.",
			href: "/paper/#completion-criteria-enable-autonomy",
			category: "principle",
			x: xPos(1, 4),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 3 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "collapsed-sdlc",
			label: "Collapsed SDLC",
			description:
				"AI collapses traditional phases (dev, QA, docs) into parallel streams. Faster delivery without sacrificing quality.",
			href: "/paper/#embrace-the-collapsing-sdlc",
			category: "principle",
			x: xPos(2, 4),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 3 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
		{
			id: "state-management",
			label: "State Management",
			description:
				"Two-tier model: Committed artifacts (.ai-dlc/) persist; ephemeral state (han keep) is session-scoped.",
			href: "/paper/#memory-providers-expand-knowledge",
			category: "principle",
			x: xPos(3, 4),
			y: (LAYER_HEIGHT + LAYER_PADDING) * 3 + 30,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		},
	],
	connectors: [
		// Phase flow (left to right)
		{ id: "intent-pass", from: "intent", to: "pass", type: "flow" },
		{ id: "pass-unit", from: "pass", to: "unit", type: "flow" },
		{ id: "unit-bolt", from: "unit", to: "bolt", type: "flow" },
		{ id: "bolt-deploy", from: "bolt", to: "deploy", type: "flow" },
		// Feedback: bolts can feed back to passes (cross-functional iteration)
		{ id: "bolt-pass", from: "bolt", to: "pass", type: "influences" },

		// Hat flow (left to right)
		{
			id: "researcher-planner",
			from: "researcher",
			to: "planner",
			type: "flow",
		},
		{ id: "planner-builder", from: "planner", to: "builder", type: "flow" },
		{ id: "builder-reviewer", from: "builder", to: "reviewer", type: "flow" },

		// Phases to hats (vertical influence)
		{ id: "pass-researcher", from: "pass", to: "researcher", type: "contains" },
		{ id: "unit-planner", from: "unit", to: "planner", type: "contains" },
		{ id: "bolt-builder", from: "bolt", to: "builder", type: "contains" },

		// Operating modes influence hats
		{
			id: "hitl-researcher",
			from: "hitl",
			to: "researcher",
			type: "influences",
		},
		{ id: "ohotl-builder", from: "ohotl", to: "builder", type: "influences" },

		// Principles support phases
		{
			id: "backpressure-bolt",
			from: "backpressure",
			to: "bolt",
			type: "influences",
		},
		{
			id: "criteria-unit",
			from: "completion-criteria",
			to: "unit",
			type: "influences",
		},
	],
}

export const DIAGRAM_VIEWBOX = {
	width: CANVAS_WIDTH,
	height: (LAYER_HEIGHT + LAYER_PADDING) * 4 + 20,
}
