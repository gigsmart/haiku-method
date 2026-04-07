import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
	buildDAG,
	parseAllUnits,
	parseCriteria,
	parseIntent,
	parseStageStates,
	parseKnowledgeFiles,
	parseStageArtifacts,
	toMermaidDefinition,
} from "./index.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListPromptsRequestSchema,
	GetPromptRequestSchema,
	CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { getActualPort, startHttpServer } from "./http.js"
import { createDesignDirectionSession, createQuestionSession, createSession, getSession, waitForSession } from "./sessions.js"
import type { DesignArchetypeData, DesignParameterData, QuestionDef } from "./sessions.js"
import { type MockupInfo, renderReviewPage } from "./templates/index.js"
import { renderQuestionPage } from "./templates/question-form.js"
import { renderDesignDirectionPage } from "./templates/design-direction.js"

const OpenReviewInput = z.object({
	intent_dir: z
		.string()
		.describe("Path to the intent directory (e.g., .haiku/intents/my-intent)"),
	review_type: z
		.enum(["intent", "unit"])
		.describe("Type of review: intent-level or unit-level"),
	target: z
		.string()
		.optional()
		.describe("Unit slug to review (required for unit reviews)"),
})

const GetReviewStatusInput = z.object({
	session_id: z.string().describe("The review session ID"),
})

const AskVisualQuestionInput = z.object({
	questions: z
		.array(
			z.object({
				question: z.string().describe("The question text"),
				header: z
					.string()
					.optional()
					.describe("Optional header/subtitle for the question"),
				options: z.array(z.string()).describe("Answer options to choose from"),
				multiSelect: z
					.boolean()
					.optional()
					.describe("Allow multiple selections (default: single)"),
			}),
		)
		.describe("Array of questions to present"),
	context: z
		.string()
		.optional()
		.describe("Optional markdown context to display above questions"),
	title: z
		.string()
		.optional()
		.describe("Optional page title (default: 'Question')"),
	image_paths: z
		.array(z.string())
		.optional()
		.describe(
			"Optional array of local image file paths to display alongside the questions. " +
				"Images are displayed in pairs (ref on left, built on right) for visual comparison.",
		),
})

const PickDesignDirectionInput = z.object({
	intent_slug: z.string().describe("The intent slug this direction applies to"),
	archetypes: z
		.array(
			z.object({
				name: z.string().describe("Archetype name"),
				description: z.string().describe("Brief description of this archetype"),
				preview_html: z
					.string()
					.describe("HTML snippet to render as a preview"),
				default_parameters: z
					.record(z.number())
					.describe("Default parameter values for this archetype"),
			}),
		)
		.describe("Array of design archetypes to choose from"),
	parameters: z
		.array(
			z.object({
				name: z.string().describe("Parameter key name"),
				label: z.string().describe("Human-readable label"),
				description: z.string().describe("Description of what this parameter controls"),
				min: z.number().describe("Minimum value"),
				max: z.number().describe("Maximum value"),
				step: z.number().describe("Step increment"),
				default: z.number().describe("Default value"),
				labels: z.object({
					low: z.string().describe("Label for the low end"),
					high: z.string().describe("Label for the high end"),
				}),
			}),
		)
		.describe("Array of tunable parameters"),
	title: z
		.string()
		.optional()
		.describe("Optional page title (default: 'Design Direction')"),
})

const server = new Server(
	{ name: "haiku-review", version: "0.1.0" },
	{
		capabilities: {
			tools: {},
			prompts: { listChanged: true },
			completions: {},
		},
	},
)

import { stateToolDefs, handleStateTool } from "./state-tools.js"
import { orchestratorToolDefs, handleOrchestratorTool, setOpenReviewHandler, setElicitInputHandler } from "./orchestrator.js"
import { listPrompts, getPrompt, completeArgument } from "./prompts/index.js"
// Side-effect imports: each file calls registerPrompt() at module load time. Add a new import here for each new prompt file.
import "./prompts/core.js"
import "./prompts/complex.js"
import "./prompts/simple.js"

// List prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
	prompts: listPrompts(),
}))

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
	return getPrompt(request.params.name, request.params.arguments)
})

// Argument completion
server.setRequestHandler(CompleteRequestSchema, async (request) => {
	return completeArgument(request.params)
})

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		// Orchestration tools
		...orchestratorToolDefs,
		// State management tools
		...stateToolDefs,
		// open_review is internal — used by the FSM for gate_ask, not exposed to the agent
		{
			name: "get_review_status",
			description:
				"Check the status of a review session. Returns the current decision and feedback.",
			inputSchema: {
				type: "object" as const,
				properties: {
					session_id: {
						type: "string",
						description: "The review session ID",
					},
				},
				required: ["session_id"],
			},
		},
		{
			name: "ask_user_visual_question",
			description:
				"Ask the user one or more questions via a rich HTML page in the browser. " +
				"Renders questions with selectable options (radio or checkbox) and an optional 'Other' field. " +
				"The user's answers are pushed back as a channel event.",
			inputSchema: {
				type: "object" as const,
				properties: {
					questions: {
						type: "array",
						items: {
							type: "object",
							properties: {
								question: { type: "string", description: "The question text" },
								header: {
									type: "string",
									description: "Optional header/subtitle",
								},
								options: {
									type: "array",
									items: { type: "string" },
									description: "Answer options",
								},
								multiSelect: {
									type: "boolean",
									description: "Allow multiple selections",
								},
							},
							required: ["question", "options"],
						},
						description: "Questions to present to the user",
					},
					context: {
						type: "string",
						description: "Optional markdown context above questions",
					},
					title: { type: "string", description: "Optional page title" },
					image_paths: {
						type: "array",
						items: { type: "string" },
						description:
							"Optional local image file paths to display alongside questions",
					},
				},
				required: ["questions"],
			},
		},
		{
			name: "pick_design_direction",
			description:
				"Open a browser-based visual picker for choosing a design direction. " +
				"Presents archetype cards with preview HTML and tunable parameter sliders. " +
				"The user's selection is pushed back as a channel event.",
			inputSchema: {
				type: "object" as const,
				properties: {
					intent_slug: {
						type: "string",
						description: "The intent slug this direction applies to",
					},
					archetypes: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string", description: "Archetype name" },
								description: {
									type: "string",
									description: "Brief description",
								},
								preview_html: {
									type: "string",
									description: "HTML preview snippet",
								},
								default_parameters: {
									type: "object",
									additionalProperties: { type: "number" },
									description: "Default parameter values",
								},
							},
							required: [
								"name",
								"description",
								"preview_html",
								"default_parameters",
							],
						},
						description: "Design archetypes to choose from",
					},
					parameters: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string", description: "Parameter key" },
								label: { type: "string", description: "Display label" },
								description: {
									type: "string",
									description: "What this controls",
								},
								min: { type: "number" },
								max: { type: "number" },
								step: { type: "number" },
								default: { type: "number" },
								labels: {
									type: "object",
									properties: {
										low: { type: "string" },
										high: { type: "string" },
									},
									required: ["low", "high"],
								},
							},
							required: [
								"name",
								"label",
								"description",
								"min",
								"max",
								"step",
								"default",
								"labels",
							],
						},
						description: "Tunable parameters",
					},
					title: {
						type: "string",
						description: "Optional page title",
					},
				},
				required: ["intent_slug", "archetypes", "parameters"],
			},
		},
	],
}))

// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params

	// Orchestration tools (async — gate_ask blocks until user reviews)
	if (name === "haiku_run_next" || name === "haiku_go_back" || name === "haiku_intent_create") {
		return handleOrchestratorTool(name, (args ?? {}) as Record<string, unknown>)
	}

	// State management tools
	if (name.startsWith("haiku_")) {
		return handleStateTool(name, (args ?? {}) as Record<string, unknown>)
	}

	if (name === "open_review") {
		const input = OpenReviewInput.parse(args)

		// Resolve intent_dir to an absolute path. When a relative path is provided
		// (e.g., ".haiku/intents/my-intent"), it resolves against process.cwd(),
		// which is expected to be the project root. MCP servers inherit cwd from
		// the client that spawned them (e.g., Claude Code), so this is normally
		// correct. Additionally validate that the path stays within .haiku/ to
		// prevent path traversal.
		const allowedBase = resolve(process.cwd(), ".haiku")
		const intentDir = resolve(process.cwd(), input.intent_dir)
		if (!intentDir.startsWith(`${allowedBase}/`) && intentDir !== allowedBase) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: intent_dir must be within .haiku/ (got: ${input.intent_dir})`,
					},
				],
				isError: true,
			}
		}

		// Parse intent data
		const intent = await parseIntent(intentDir)
		if (!intent) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: Could not parse intent at ${intentDir}`,
					},
				],
				isError: true,
			}
		}

		// Parse units
		const units = await parseAllUnits(intentDir)

		// Build DAG and mermaid
		const dag = buildDAG(units)
		const mermaid = toMermaidDefinition(dag, units)

		// Find completion criteria from intent sections
		const criteriaSection = intent.sections.find(
			(s) =>
				s.heading.toLowerCase().includes("completion criteria") ||
				s.heading.toLowerCase().includes("success criteria"),
		)
		const criteria = criteriaSection
			? parseCriteria(criteriaSection.content)
			: []

		// Create session first so we have the session ID for mockup URLs
		const session = createSession({
			intent_dir: intentDir,
			intent_slug: intent.slug,
			review_type: input.review_type,
			target: input.target ?? "",
			html: "",
		})

		const MOCKUP_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]
		const MOCKUP_HTML_EXTS = [".html", ".htm"]
		const MOCKUP_ALL_EXTS = [...MOCKUP_IMAGE_EXTS, ...MOCKUP_HTML_EXTS]

		// Scan intent mockups/ directory for wireframes and images
		const intentMockups: MockupInfo[] = []
		try {
			const mockupsDir = join(intentDir, "mockups")
			const entries = await readdir(mockupsDir)
			for (const entry of entries.sort()) {
				const ext = entry.substring(entry.lastIndexOf(".")).toLowerCase()
				if (MOCKUP_ALL_EXTS.includes(ext)) {
					intentMockups.push({
						label: entry.replace(/\.[^.]+$/, ""),
						url: `/mockups/${session.session_id}/${entry}`,
					})
				}
			}
		} catch {
			// No mockups directory — that's fine
		}

		// Collect unit wireframe mockups
		const unitMockups = new Map<string, MockupInfo[]>()
		for (const unit of units) {
			const wireframe = unit.frontmatter.wireframe
			if (wireframe && typeof wireframe === "string") {
				unitMockups.set(unit.slug, [
					{
						label: `Wireframe: ${wireframe}`,
						url: `/wireframe/${session.session_id}/${wireframe}`,
					},
				])
			}
		}

		// Fallback: scan mockups/ for files matching unit slug by naming convention
		for (const unit of units) {
			if (!unitMockups.has(unit.slug)) {
				try {
					const mockupsDir = join(intentDir, "mockups")
					const entries = await readdir(mockupsDir)
					const matches = entries
						.filter((f) => {
							const name = f.substring(0, f.lastIndexOf("."))
							const ext = f.substring(f.lastIndexOf(".")).toLowerCase()
							return name === unit.slug && MOCKUP_ALL_EXTS.includes(ext)
						})
						.sort()
					if (matches.length > 0) {
						unitMockups.set(
							unit.slug,
							matches.map((f) => ({
								label: `Wireframe: ${f}`,
								url: `/mockups/${session.session_id}/${f}`,
							})),
						)
					}
				} catch {
					// No mockups directory — skip
				}
			}
		}

		// Parse additional data for the SPA
		const stageStates = await parseStageStates(intentDir)
		const knowledgeFiles = await parseKnowledgeFiles(intentDir)
		const stageArtifacts = await parseStageArtifacts(intentDir)

		// Store parsed data on the session for the SPA API endpoint
		session.parsedIntent = intent
		session.parsedUnits = units
		session.parsedCriteria = criteria
		session.parsedMermaid = mermaid
		session.intentMockups = intentMockups
		session.unitMockups = unitMockups
		session.stageStates = stageStates
		session.knowledgeFiles = knowledgeFiles
		session.stageArtifacts = stageArtifacts

		// Generate HTML with session ID, mockups, and wireframes (legacy fallback)
		session.html = renderReviewPage({
			intent,
			units,
			criteria,
			reviewType: input.review_type,
			target: input.target ?? "",
			sessionId: session.session_id,
			mermaid,
			intentMockups,
			unitMockups,
		})

		// Start HTTP server (idempotent)
		const port = await startHttpServer()
		const reviewUrl = `http://127.0.0.1:${port}/review/${session.session_id}`

		// Open browser
		try {
			const cmd =
				process.platform === "darwin"
					? ["open", reviewUrl]
					: ["xdg-open", reviewUrl]
			spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }).unref()
		} catch (err) {
			console.error("Failed to open browser:", err)
		}

		// Block until the user submits their decision (event-based, no polling)
		const MAX_WAIT = 30 * 60 * 1000
		try {
			await waitForSession(session.session_id, MAX_WAIT)
		} catch {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							status: "timeout",
							url: reviewUrl,
							session_id: session.session_id,
							message: "User did not respond within 30 minutes",
						}, null, 2),
					},
				],
			}
		}

		// Session was updated — read the latest state
		const updatedReviewSession = getSession(session.session_id)
		if (updatedReviewSession && updatedReviewSession.session_type === "review" && updatedReviewSession.status === "decided") {
			const result: Record<string, unknown> = {
				status: "decided",
				url: reviewUrl,
				decision: updatedReviewSession.decision,
				feedback: updatedReviewSession.feedback,
				review_type: updatedReviewSession.review_type,
				target: updatedReviewSession.target,
			}
			if (updatedReviewSession.annotations) {
				const annot: Record<string, unknown> = {}
				if (updatedReviewSession.annotations.pins?.length) annot.pins = updatedReviewSession.annotations.pins
				if (updatedReviewSession.annotations.comments?.length) annot.comments = updatedReviewSession.annotations.comments
				if (updatedReviewSession.annotations.screenshot) annot.has_screenshot = true
				result.annotations = annot
			}
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
			}
		}

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						status: "timeout",
						url: reviewUrl,
						session_id: session.session_id,
						message: "User did not respond within 30 minutes",
					}, null, 2),
				},
			],
		}
	}

	if (name === "get_review_status") {
		const input = GetReviewStatusInput.parse(args)
		const session = getSession(input.session_id)

		if (!session) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: Session ${input.session_id} not found`,
					},
				],
				isError: true,
			}
		}

		if (session.session_type === "question") {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								session_id: session.session_id,
								session_type: session.session_type,
								status: session.status,
								answers: session.answers,
							},
							null,
							2,
						),
					},
				],
			}
		}

		if (session.session_type === "design_direction") {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								session_id: session.session_id,
								session_type: session.session_type,
								status: session.status,
								selection: session.selection,
							},
							null,
							2,
						),
					},
				],
			}
		}

		// Build result with optional annotations
		const reviewResult: Record<string, unknown> = {
			session_id: session.session_id,
			status: session.status,
			decision: session.decision,
			feedback: session.feedback,
			review_type: session.review_type,
			target: session.target,
		}
		if (session.annotations) {
			// Include pins and comments directly, but only a truncated
			// screenshot indicator to avoid bloating the text response.
			// The full screenshot base64 is available via the session object.
			const annot: Record<string, unknown> = {}
			if (session.annotations.pins?.length) {
				annot.pins = session.annotations.pins
			}
			if (session.annotations.comments?.length) {
				annot.comments = session.annotations.comments
			}
			if (session.annotations.screenshot) {
				annot.has_screenshot = true
				annot.screenshot_length = session.annotations.screenshot.length
			}
			reviewResult.annotations = annot
		}

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(reviewResult, null, 2),
				},
			],
		}
	}

	if (name === "ask_user_visual_question") {
		const input = AskVisualQuestionInput.parse(args)
		const title = input.title ?? "Question"
		const context = input.context ?? ""
		const questions: QuestionDef[] = input.questions
		const imagePaths = input.image_paths ?? []

		// Derive per-path base directories for path validation (defense-in-depth in the HTTP handler)
		const imageBaseDirs = imagePaths.map(p => dirname(resolve(p)))

		// Create question session
		const session = createQuestionSession({
			title,
			questions,
			context,
			imagePaths,
			imageBaseDirs,
			html: "",
		})

		// Build image URLs for the template (served via /question-image/:sessionId/:index)
		const imageUrls = imagePaths.map(
			(_, i) => `/question-image/${session.session_id}/${i}`,
		)

		// Render HTML
		session.html = renderQuestionPage({
			title,
			questions,
			context,
			sessionId: session.session_id,
			imageUrls,
		})

		// Start HTTP server (idempotent)
		const port = await startHttpServer()
		const questionUrl = `http://127.0.0.1:${port}/question/${session.session_id}`

		// Open browser
		try {
			const cmd =
				process.platform === "darwin"
					? ["open", questionUrl]
					: ["xdg-open", questionUrl]
			spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }).unref()
		} catch (err) {
			console.error("Failed to open browser:", err)
		}

		// Block until the user submits their answers (event-based, no polling)
		const MAX_WAIT_Q = 30 * 60 * 1000 // 30 minutes
		try {
			await waitForSession(session.session_id, MAX_WAIT_Q)
		} catch {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							status: "timeout",
							url: questionUrl,
							session_id: session.session_id,
							message: "User did not respond within 30 minutes",
						}, null, 2),
					},
				],
			}
		}

		// Session was updated — read the latest state
		const updatedQuestionSession = getSession(session.session_id)
		if (updatedQuestionSession && updatedQuestionSession.session_type === "question" && updatedQuestionSession.status === "answered" && updatedQuestionSession.answers) {
			const questionResult: Record<string, unknown> = {
				status: "answered",
				url: questionUrl,
				answers: updatedQuestionSession.answers,
			}
			if (updatedQuestionSession.feedback) {
				questionResult.feedback = updatedQuestionSession.feedback
			}
			if (updatedQuestionSession.annotations?.comments?.length) {
				questionResult.annotations = updatedQuestionSession.annotations
			}
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(questionResult, null, 2),
					},
				],
			}
		}

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						status: "timeout",
						url: questionUrl,
						session_id: session.session_id,
						message: "User did not respond within 30 minutes",
					}, null, 2),
				},
			],
		}
	}

	if (name === "pick_design_direction") {
		const input = PickDesignDirectionInput.parse(args)
		const title = input.title ?? "Design Direction"
		const archetypes: DesignArchetypeData[] = input.archetypes
		const parameters: DesignParameterData[] = input.parameters

		// Create design direction session
		const session = createDesignDirectionSession({
			intent_slug: input.intent_slug,
			archetypes,
			parameters,
			html: "",
		})

		// Render HTML
		session.html = renderDesignDirectionPage({
			title,
			archetypes,
			parameters,
			sessionId: session.session_id,
		})

		// Start HTTP server (idempotent)
		const port = await startHttpServer()
		const directionUrl = `http://127.0.0.1:${port}/direction/${session.session_id}`

		// Open browser
		try {
			const cmd =
				process.platform === "darwin"
					? ["open", directionUrl]
					: ["xdg-open", directionUrl]
			spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "ignore", "ignore"] })
		} catch (err) {
			console.error("Failed to open browser:", err)
		}

		return {
			content: [
				{
					type: "text" as const,
					text: `Design direction picker opened: ${directionUrl}\nSession ID: ${session.session_id}\nArchetypes: ${archetypes.length}\nParameters: ${parameters.length}`,
				},
			],
		}
	}

	return {
		content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
		isError: true,
	}
})

// Wire up the review handler for the orchestrator's gate_ask flow.
// This lets haiku_run_next open a review and block until the user decides,
// without the agent needing to call open_review separately.
setOpenReviewHandler(async (intentDirRel: string, reviewType: string) => {
	const intentDirAbs = resolve(process.cwd(), intentDirRel)
	const intent = await parseIntent(intentDirAbs)
	if (!intent) throw new Error("Could not parse intent")

	const units = await parseAllUnits(intentDirAbs)
	const dag = buildDAG(units)
	const mermaid = toMermaidDefinition(dag, units)
	const criteriaSection = intent.sections.find(
		(s) => s.heading.toLowerCase().includes("completion criteria") || s.heading.toLowerCase().includes("success criteria"),
	)
	const criteria = criteriaSection ? parseCriteria(criteriaSection.content) : []

	const session = createSession({
		intent_dir: intentDirAbs,
		intent_slug: intent.slug,
		review_type: reviewType as "intent" | "unit",
		target: "",
		html: "",
	})

	// Store parsed data on session for the SPA
	Object.assign(session, { parsedIntent: intent, parsedUnits: units, parsedCriteria: criteria, parsedMermaid: mermaid })

	// Parse stage states + knowledge
	const stageStates = await parseStageStates(intentDirAbs)
	const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
	const stageArtifacts = await parseStageArtifacts(intentDirAbs)
	Object.assign(session, { stageStates, knowledgeFiles, stageArtifacts })

	session.html = renderReviewPage({ intent, units, criteria, reviewType: reviewType as "intent" | "unit", target: "", sessionId: session.session_id, mermaid, intentMockups: [], unitMockups: new Map() })

	const port = await startHttpServer()
	const reviewUrl = `http://127.0.0.1:${port}/review/${session.session_id}`

	try {
		const cmd = process.platform === "darwin" ? ["open", reviewUrl] : ["xdg-open", reviewUrl]
		spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }).unref()
	} catch { /* */ }

	await waitForSession(session.session_id, 30 * 60 * 1000)

	const updated = getSession(session.session_id)
	if (updated && updated.session_type === "review" && updated.status === "decided") {
		return {
			decision: updated.decision,
			feedback: updated.feedback,
			annotations: updated.annotations,
		}
	}
	throw new Error("Review timeout")
})

// Wire up elicitation fallback for when the review UI fails
setElicitInputHandler(async (params) => {
	return server.elicitInput(params as Parameters<typeof server.elicitInput>[0])
})

// Start server
async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error("H·AI·K·U Review MCP server running on stdio")
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.error("Shutting down...")
	await server.close()
	process.exit(0)
})

process.on("SIGTERM", async () => {
	console.error("Shutting down...")
	await server.close()
	process.exit(0)
})

import { reportError } from "./sentry.js"

// MCP server entry point — invoked by: haiku mcp
main().catch((err) => {
	reportError(err, { context: "mcp-server-fatal" })
	console.error("Fatal error:", err)
	process.exit(1)
})
