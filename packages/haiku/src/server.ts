import { spawn } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
	CallToolRequestSchema,
	CompleteRequestSchema,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import {
	execNewBinary,
	hasPendingUpdate,
	startUpdateChecker,
	stopUpdateChecker,
} from "./auto-update.js"
import { getActualPort, startHttpServer } from "./http.js"
import {
	buildDAG,
	parseAllUnits,
	parseCriteria,
	parseIntent,
	parseKnowledgeFiles,
	parseOutputArtifacts,
	parseStageArtifacts,
	parseStageStates,
	toMermaidDefinition,
} from "./index.js"
import {
	flush as flushSentry,
	isSentryConfigured,
	reportError,
	reportFeedback,
} from "./sentry.js"
import {
	clearHeartbeat,
	createDesignDirectionSession,
	createQuestionSession,
	createSession,
	getSession,
	hasPresenceLost,
	waitForSession,
} from "./sessions.js"
import type {
	DesignArchetypeData,
	DesignParameterData,
	QuestionDef,
} from "./sessions.js"
import {
	findHaikuRoot,
	parseFrontmatter,
	readJson,
	stageStatePath,
	writeJson,
} from "./state-tools.js"
import { renderDesignDirectionPage } from "./templates/design-direction.js"
import { type MockupInfo, renderReviewPage } from "./templates/index.js"
import { renderQuestionPage } from "./templates/question-form.js"
import {
	buildReviewUrl,
	clearE2EKey,
	closeTunnel,
	isRemoteReviewEnabled,
	openTunnel,
} from "./tunnel.js"

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

const DesignArchetypeSchema = z.object({
	name: z.string().describe("Archetype name"),
	description: z.string().describe("Brief description of this archetype"),
	preview_html: z.string().describe("HTML snippet to render as a preview"),
	default_parameters: z
		.record(z.number())
		.describe("Default parameter values for this archetype"),
})

const DesignParameterSchema = z.object({
	name: z.string().describe("Parameter key name"),
	label: z.string().describe("Human-readable label"),
	description: z
		.string()
		.describe("Description of what this parameter controls"),
	min: z.number().describe("Minimum value"),
	max: z.number().describe("Maximum value"),
	step: z.number().describe("Step increment"),
	default: z.number().describe("Default value"),
	labels: z.object({
		low: z.string().describe("Label for the low end"),
		high: z.string().describe("Label for the high end"),
	}),
})

const PickDesignDirectionInput = z.object({
	intent_slug: z.string().describe("The intent slug this direction applies to"),
	archetypes: z
		.array(DesignArchetypeSchema)
		.optional()
		.describe("Inline array of design archetypes to choose from"),
	archetypes_file: z
		.string()
		.optional()
		.describe(
			"Path to a JSON file containing the archetypes array (alternative to inline archetypes)",
		),
	parameters: z
		.array(DesignParameterSchema)
		.optional()
		.describe("Inline array of tunable parameters"),
	parameters_file: z
		.string()
		.optional()
		.describe(
			"Path to a JSON file containing the parameters array (alternative to inline parameters)",
		),
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

import {
	handleOrchestratorTool,
	orchestratorToolDefs,
	setElicitInputHandler,
	setOpenReviewHandler,
} from "./orchestrator.js"
// Prompts migrated to skills (plugin/skills/) — prompt handlers kept for protocol compatibility
import { completeArgument, getPrompt, listPrompts } from "./prompts/index.js"
import { handleStateTool, stateToolDefs } from "./state-tools.js"

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
	prompts: listPrompts(),
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
	return getPrompt(request.params.name, request.params.arguments)
})

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
				"The user's selection is pushed back as a channel event. " +
				"Archetypes and parameters can be provided inline or as paths to JSON files on disk.",
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
						description: "Inline design archetypes to choose from",
					},
					archetypes_file: {
						type: "string",
						description:
							"Path to a JSON file containing the archetypes array (alternative to inline archetypes)",
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
						description: "Inline tunable parameters",
					},
					parameters_file: {
						type: "string",
						description:
							"Path to a JSON file containing the parameters array (alternative to inline parameters)",
					},
					title: {
						type: "string",
						description: "Optional page title",
					},
				},
				required: ["intent_slug"],
			},
		},
		{
			name: "haiku_feedback",
			description:
				"Submit user feedback or a bug report to the H·AI·K·U team via Sentry. " +
				"Use this when a user wants to report an issue, suggest an improvement, or share feedback.",
			inputSchema: {
				type: "object" as const,
				properties: {
					message: {
						type: "string",
						description: "The feedback message or bug report",
					},
					contact_email: {
						type: "string",
						description: "Optional contact email for follow-up",
					},
					name: {
						type: "string",
						description: "Optional name of the person submitting feedback",
					},
				},
				required: ["message"],
			},
		},
	],
}))

// Call tools — wrapped to trigger hot-swap after response when an update is staged
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const result = await handleToolCall(request)

	// After the response is written, check if we should yield to a new binary.
	// setImmediate ensures the MCP SDK flushes the response first.
	if (hasPendingUpdate()) {
		setImmediate(() => {
			console.error(
				"[haiku] Pending update detected — hot-swapping after response",
			)
			stopUpdateChecker()
			server
				.close()
				.then(() => execNewBinary())
				.catch((err) => console.error("[haiku] Hot-swap failed:", err))
		})
	}

	return result
})

async function handleToolCall(request: {
	params: { name: string; arguments?: Record<string, unknown> }
}) {
	const { name, arguments: args } = request.params

	// Orchestration tools (async — gate_ask blocks until user reviews)
	if (
		name === "haiku_run_next" ||
		name === "haiku_revisit" ||
		name === "haiku_intent_create" ||
		name === "haiku_select_studio" ||
		name === "haiku_intent_reset"
	) {
		return handleOrchestratorTool(name, (args ?? {}) as Record<string, unknown>)
	}

	// Feedback tool — submit user feedback to Sentry
	if (name === "haiku_feedback") {
		if (!isSentryConfigured()) {
			return {
				content: [
					{
						type: "text" as const,
						text: "Feedback is not available in this installation (Sentry DSN not configured).",
					},
				],
			}
		}
		const typedArgs = (args ?? {}) as Record<string, unknown>
		const message = typedArgs.message as string | undefined
		if (!message) {
			return {
				content: [
					{ type: "text" as const, text: "Error: message is required" },
				],
				isError: true,
			}
		}
		const contactEmail = typedArgs.contact_email as string | undefined
		const userName = typedArgs.name as string | undefined
		const sessionCtx = typedArgs._session_context as
			| Record<string, string>
			| undefined
		reportFeedback(message, sessionCtx, contactEmail, userName)
		return {
			content: [
				{ type: "text" as const, text: "Feedback submitted. Thank you!" },
			],
		}
	}

	// State management tools
	if (name.startsWith("haiku_")) {
		return handleStateTool(name, (args ?? {}) as Record<string, unknown>)
	}

	if (name === "open_review") {
		// open_review is blocked — the FSM (setOpenReviewHandler) has its own code path.
		// Direct agent calls would bypass unit naming validation, type validation, and
		// discovery artifact checks that the orchestrator enforces before opening a review.
		return {
			content: [
				{
					type: "text" as const,
					text: "Error: open_review cannot be called directly. Use haiku_run_next to advance — it validates units and opens the review automatically when ready.",
				},
			],
			isError: true,
		}
	}

	if (name === "ask_user_visual_question") {
		const input = AskVisualQuestionInput.parse(args)
		const title = input.title ?? "Question"
		const context = input.context ?? ""
		const questions: QuestionDef[] = input.questions
		const imagePaths = input.image_paths ?? []

		// Derive per-path base directories for path validation (defense-in-depth in the HTTP handler)
		const imageBaseDirs = imagePaths.map((p) => dirname(resolve(p)))

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
		let questionUrl: string
		if (isRemoteReviewEnabled()) {
			const tunnelUrl = await openTunnel(port)
			questionUrl = buildReviewUrl(session.session_id, tunnelUrl, "question")
		} else {
			questionUrl = `http://127.0.0.1:${port}/question/${session.session_id}`
		}

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
						text: JSON.stringify(
							{
								status: "timeout",
								url: questionUrl,
								session_id: session.session_id,
								message: "User did not respond within 30 minutes",
							},
							null,
							2,
						),
					},
				],
			}
		}

		// Session was updated — read the latest state
		const updatedQuestionSession = getSession(session.session_id)
		if (
			updatedQuestionSession &&
			updatedQuestionSession.session_type === "question" &&
			updatedQuestionSession.status === "answered" &&
			updatedQuestionSession.answers
		) {
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
					text: JSON.stringify(
						{
							status: "timeout",
							url: questionUrl,
							session_id: session.session_id,
							message: "User did not respond within 30 minutes",
						},
						null,
						2,
					),
				},
			],
		}
	}

	if (name === "pick_design_direction") {
		const input = PickDesignDirectionInput.parse(args)
		const title = input.title ?? "Design Direction"

		// Resolve archetypes: inline or from file
		let archetypes: DesignArchetypeData[]
		if (input.archetypes) {
			archetypes = input.archetypes
		} else if (input.archetypes_file) {
			const raw = await readFile(resolve(input.archetypes_file), "utf-8")
			archetypes = z.array(DesignArchetypeSchema).parse(JSON.parse(raw))
		} else {
			return {
				content: [
					{
						type: "text" as const,
						text: "Error: provide either archetypes or archetypes_file",
					},
				],
			}
		}

		// Resolve parameters: inline or from file
		let parameters: DesignParameterData[]
		if (input.parameters) {
			parameters = input.parameters
		} else if (input.parameters_file) {
			const raw = await readFile(resolve(input.parameters_file), "utf-8")
			parameters = z.array(DesignParameterSchema).parse(JSON.parse(raw))
		} else {
			return {
				content: [
					{
						type: "text" as const,
						text: "Error: provide either parameters or parameters_file",
					},
				],
			}
		}

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
		let directionUrl: string
		if (isRemoteReviewEnabled()) {
			const tunnelUrl = await openTunnel(port)
			directionUrl = buildReviewUrl(session.session_id, tunnelUrl, "direction")
		} else {
			directionUrl = `http://127.0.0.1:${port}/direction/${session.session_id}`
		}

		// Open browser
		try {
			const cmd =
				process.platform === "darwin"
					? ["open", directionUrl]
					: ["xdg-open", directionUrl]
			spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }).unref()
		} catch (err) {
			console.error("Failed to open browser:", err)
		}

		// Block until the user submits their selection (event-based, no polling)
		const MAX_WAIT_DD = 30 * 60 * 1000 // 30 minutes
		try {
			await waitForSession(session.session_id, MAX_WAIT_DD)
		} catch {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								status: "timeout",
								url: directionUrl,
								session_id: session.session_id,
								message: "User did not respond within 30 minutes",
							},
							null,
							2,
						),
					},
				],
			}
		}

		// Session was updated — read the latest state
		const updatedDirectionSession = getSession(session.session_id)
		if (
			updatedDirectionSession &&
			updatedDirectionSession.session_type === "design_direction" &&
			updatedDirectionSession.status === "answered" &&
			updatedDirectionSession.selection
		) {
			// Persist design_direction_selected to stage state so the orchestrator
			// knows to advance — the agent doesn't need to relay this flag.
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", input.intent_slug, "intent.md")
				const intentRaw = await readFile(intentFile, "utf-8")
				const intentFm = parseFrontmatter(intentRaw)
				const activeStage = (intentFm.data.active_stage as string) || ""
				if (activeStage) {
					const ssPath = stageStatePath(input.intent_slug, activeStage)
					const ssData = readJson(ssPath)
					ssData.design_direction_selected = true
					ssData.design_direction = {
						archetype: updatedDirectionSession.selection.archetype,
						parameters: updatedDirectionSession.selection.parameters,
						...(updatedDirectionSession.selection.comments
							? { comments: updatedDirectionSession.selection.comments }
							: {}),
						...(updatedDirectionSession.selection.annotations
							? { annotations: updatedDirectionSession.selection.annotations }
							: {}),
					}
					writeJson(ssPath, ssData)
				}
			} catch {
				/* non-fatal — orchestrator flag may need manual set */
			}

			// Return conversational context only — no action directives
			const sel = updatedDirectionSession.selection
			const parts: string[] = [
				`The user selected the **${sel.archetype}** direction.`,
			]
			if (sel.comments) {
				parts.push(`\nComments: ${sel.comments}`)
			}
			if (sel.annotations?.pins?.length) {
				parts.push(
					`\nVisual annotations (${sel.annotations.pins.length} pins):`,
				)
				for (const pin of sel.annotations.pins) {
					parts.push(
						`  - [${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%]: ${pin.text || "(no text)"}`,
					)
				}
			}
			return {
				content: [{ type: "text" as const, text: parts.join("\n") }],
			}
		}

		return {
			content: [
				{
					type: "text" as const,
					text: "The user did not select a design direction within the time limit. Ask them how they'd like to proceed.",
				},
			],
		}
	}

	return {
		content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
		isError: true,
	}
}

// Wire up the review handler for the orchestrator's gate_ask flow.
// This lets haiku_run_next open a review and block until the user decides,
// without the agent needing to call open_review separately.
setOpenReviewHandler(
	async (intentDirRel: string, reviewType: string, gateType?: string) => {
		const intentDirAbs = resolve(process.cwd(), intentDirRel)
		const intent = await parseIntent(intentDirAbs)
		if (!intent) throw new Error("Could not parse intent")

		const units = await parseAllUnits(intentDirAbs)
		const dag = buildDAG(units)
		const mermaid = toMermaidDefinition(dag, units)
		const criteriaSection = intent.sections.find(
			(s) =>
				s.heading?.toLowerCase().includes("completion criteria") ||
				s.heading?.toLowerCase().includes("success criteria"),
		)
		const criteria = criteriaSection
			? parseCriteria(criteriaSection.content)
			: []

		const session = createSession({
			intent_dir: intentDirAbs,
			intent_slug: intent.slug,
			review_type: reviewType as "intent" | "unit",
			gate_type: gateType,
			target: "",
			html: "",
		})

		// Store parsed data on session for the SPA
		Object.assign(session, {
			parsedIntent: intent,
			parsedUnits: units,
			parsedCriteria: criteria,
			parsedMermaid: mermaid,
		})

		// Parse stage states + knowledge
		const stageStates = await parseStageStates(intentDirAbs)
		const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
		const stageArtifacts = await parseStageArtifacts(intentDirAbs)
		const outputArtifacts = await parseOutputArtifacts(intentDirAbs)

		// Resolve image output artifact URLs now that we have a session ID
		for (const oa of outputArtifacts) {
			if (oa.type === "image" && oa.relativePath) {
				oa.relativePath = `/stage-artifacts/${session.session_id}/stages/${oa.relativePath}`
			}
		}

		Object.assign(session, {
			stageStates,
			knowledgeFiles,
			stageArtifacts,
			outputArtifacts,
		})

		session.html = renderReviewPage({
			intent,
			units,
			criteria,
			reviewType: reviewType as "intent" | "unit",
			target: "",
			sessionId: session.session_id,
			mermaid,
			intentMockups: [],
			unitMockups: new Map(),
		})

		const port = await startHttpServer()
		const useRemote = isRemoteReviewEnabled()

		let reviewUrl: string
		if (useRemote) {
			const tunnelUrl = await openTunnel(port)
			reviewUrl = buildReviewUrl(session.session_id, tunnelUrl, reviewType)
		} else {
			reviewUrl = `http://127.0.0.1:${port}/review/${session.session_id}`
		}

		function openBrowser(url?: string) {
			try {
				const target = url ?? reviewUrl
				const cmd =
					process.platform === "darwin"
						? ["open", target]
						: ["xdg-open", target]
				spawn(cmd[0], cmd.slice(1), { stdio: "ignore", detached: true }).unref()
			} catch {
				/* */
			}
		}

		openBrowser()

		// Retry loop: wait → check → reopen if needed → wait again
		attempts: for (let attempt = 0; attempt < 3; attempt++) {
			// Inner loop: handle heartbeat-driven wakeups without burning an attempt
			while (true) {
				let timedOut = false
				try {
					await waitForSession(session.session_id, 10 * 60 * 1000) // 10 min per attempt
				} catch {
					timedOut = true
				}

				const updated = getSession(session.session_id)
				if (
					updated &&
					updated.session_type === "review" &&
					updated.status === "decided"
				) {
					clearHeartbeat(session.session_id)
					if (useRemote) {
						clearE2EKey(session.session_id)
						closeTunnel()
					}
					return {
						decision: updated.decision,
						feedback: updated.feedback,
						annotations: updated.annotations,
					}
				}

				if (hasPresenceLost(session.session_id)) {
					// Heartbeat gap detected — user closed the tab. Reopen without
					// consuming a retry attempt; the user may have just refreshed.
					console.error(
						`[haiku] Review session ${session.session_id} lost presence — reopening browser`,
					)
					clearHeartbeat(session.session_id)
					if (useRemote) {
						const tunnelUrl = await openTunnel(port)
						const newUrl = buildReviewUrl(
							session.session_id,
							tunnelUrl,
							reviewType,
						)
						openBrowser(newUrl)
					} else {
						openBrowser()
					}
					continue
				}

				if (timedOut) {
					if (attempt < 2) {
						console.error(
							`[haiku] Review session timeout (attempt ${attempt + 1}/3) — reopening browser`,
						)
						if (useRemote) {
							const tunnelUrl = await openTunnel(port)
							const newUrl = buildReviewUrl(
								session.session_id,
								tunnelUrl,
								reviewType,
							)
							openBrowser(newUrl)
						} else {
							openBrowser()
						}
						continue attempts
					}
					break attempts
				}

				// Spurious wakeup — loop and wait again.
			}
		}

		clearHeartbeat(session.session_id)
		if (useRemote) {
			clearE2EKey(session.session_id)
			closeTunnel()
		}
		throw new Error("Review timeout after 3 attempts (30 min total)")
	},
)

// Wire up elicitation fallback for when the review UI fails
setElicitInputHandler(async (params) => {
	return server.elicitInput(params as Parameters<typeof server.elicitInput>[0])
})

// Start server
async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error("H·AI·K·U Review MCP server running on stdio")

	// Start background auto-update checker after the server is live
	startUpdateChecker()
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.error("Shutting down...")
	stopUpdateChecker()
	await server.close()
	await flushSentry()
	process.exit(0)
})

process.on("SIGTERM", async () => {
	console.error("Shutting down...")
	stopUpdateChecker()
	await server.close()
	await flushSentry()
	process.exit(0)
})

// MCP server entry point — invoked by: haiku mcp
main().catch((err) => {
	reportError(err, { context: "mcp-server-fatal" })
	console.error("Fatal error:", err)
	process.exit(1)
})
