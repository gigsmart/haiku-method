import { spawn } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
	CallToolRequestSchema,
	CompleteRequestSchema,
	ErrorCode,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ReadResourceRequestSchema,
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
	addReviewTransportBreadcrumb,
	flush as flushSentry,
	isSentryConfigured,
	reportError,
	reportFeedback,
} from "./sentry.js"
import { logSessionEvent } from "./session-metadata.js"
import {
	clearHeartbeat,
	createDesignDirectionSession,
	createQuestionSession,
	createSession,
	getSession,
	hasPresenceLost,
	notifySessionUpdate,
	updateDesignDirectionSession,
	updateQuestionSession,
	updateSession,
	waitForSession,
} from "./sessions.js"
import type {
	DesignArchetypeData,
	DesignParameterData,
	QuestionDef,
} from "./sessions.js"
import {
	findHaikuRoot,
	getMcpHostWorkspacePaths,
	hostSupportsMcpApps,
	parseFrontmatter,
	readJson,
	setFrontmatterField,
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
			resources: {},
			experimental: { apps: {} },
			extensions: { "io.modelcontextprotocol/ui": {} },
		},
	},
)

import { askVisualQuestionMcpApps } from "./ask-visual-question-mcp-apps.js"
import { openReviewMcpApps } from "./open-review-mcp-apps.js"
import {
	handleOrchestratorTool,
	orchestratorToolDefs,
	setElicitInputHandler,
	setOpenReviewHandler,
} from "./orchestrator.js"
import { pickDesignDirectionMcpApps } from "./pick-design-direction-mcp-apps.js"
// Prompts migrated to skills (plugin/skills/) — prompt handlers kept for protocol compatibility
import { completeArgument, getPrompt, listPrompts } from "./prompts/index.js"
import { REVIEW_APP_HTML } from "./review-app-html.js"
import {
	handleStateTool,
	setMcpServerInstance,
	stateToolDefs,
} from "./state-tools.js"
import { REVIEW_RESOURCE_URI, buildUiResourceMeta } from "./ui-resource.js"

// Bundle size runtime guard — warn if review-app HTML approaches the 1MB CI budget.
// The CI hard-fail threshold is 1,000,403 bytes (gzipped); we warn at ~950KB raw
// as an early signal before gzip compression is applied in CI.
const _reviewAppBytes = Buffer.byteLength(REVIEW_APP_HTML, "utf8")
if (_reviewAppBytes > 950_000) {
	console.warn(
		`[haiku] review-app HTML is ${_reviewAppBytes} bytes (raw) — approaching the 1MB gzipped CI budget. Run the Vite bundle analyzer to identify what grew.`,
	)
}

setMcpServerInstance(server)

// Threading: AbortSignal from the current haiku_run_next tool call,
// captured before handleOrchestratorTool so _openReviewAndWait can observe it.
let _currentReviewSignal: AbortSignal | undefined = undefined

// Threading: _meta.ui to attach to the tool result after _openReviewAndWait resolves.
// Set by the MCP Apps branch of setOpenReviewHandler, cleared by handleToolCall.
let _reviewResultMeta: { ui: { resourceUri: string } } | undefined = undefined

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
	prompts: listPrompts(),
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
	return getPrompt(request.params.name, request.params.arguments)
})

server.setRequestHandler(CompleteRequestSchema, async (request) => {
	return completeArgument(request.params)
})

// MCP Apps: register the bundled review SPA as a ui:// resource
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
	resources: [
		{
			uri: REVIEW_RESOURCE_URI,
			name: "Haiku Review App",
			mimeType: "text/html",
		},
	],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const { uri } = request.params
	if (uri !== REVIEW_RESOURCE_URI) {
		throw new McpError(ErrorCode.InvalidParams, "Unknown resource URI")
	}
	return {
		contents: [
			{
				uri: REVIEW_RESOURCE_URI,
				mimeType: "text/html",
				text: REVIEW_APP_HTML,
			},
		],
	}
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
			_meta: { ui: { resourceUri: REVIEW_RESOURCE_URI } },
			description:
				"Ask the user one or more questions via a rich HTML page in the browser. " +
				"Renders questions with selectable options (radio or checkbox) and an optional 'Other' field. " +
				"ALWAYS provide concrete options[] for each question — never leave the user to type freeform when you know the alternatives. " +
				"Use this instead of AskUserQuestion when: (1) questions involve visual artifacts or image_paths, " +
				"(2) you need rich markdown context above the questions, or (3) you have multiple related questions " +
				"that benefit from being presented together (each as a separate entry in the questions[] array). " +
				"For unrelated questions, make separate tool calls instead of bundling them.",
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
			_meta: { ui: { resourceUri: REVIEW_RESOURCE_URI } },
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
		{
			name: "haiku_debug",
			description:
				"Dump diagnostic information about the MCP connection: server capabilities, " +
				"client capabilities, hostSupportsMcpApps() result, environment variables, " +
				"and workspace paths. Use this to troubleshoot MCP Apps detection issues.",
			inputSchema: {
				type: "object" as const,
				properties: {},
			},
		},
		{
			name: "haiku_cowork_review_submit",
			description:
				"Submit a review decision, question answer, or design-direction selection from the MCP Apps review SPA. " +
				"Called by the host bridge when the user completes the review form.",
			inputSchema: {
				type: "object" as const,
				properties: {
					session_type: {
						type: "string",
						enum: ["review", "question", "design_direction"],
					},
					session_id: { type: "string", format: "uuid" },
					decision: {
						type: "string",
						enum: ["approved", "changes_requested", "external_review"],
						description: "Required when session_type is 'review'",
					},
					feedback: {
						type: "string",
						description:
							"Required (may be empty) when session_type is 'review'",
					},
					answers: {
						type: "array",
						items: { type: "object" },
						description: "Required (min 1) when session_type is 'question'",
					},
					archetype: {
						type: "string",
						description:
							"Required (non-empty) when session_type is 'design_direction'",
					},
					parameters: {
						type: "object",
						additionalProperties: { type: "number" },
						description: "Required when session_type is 'design_direction'",
					},
					annotations: {
						type: "object",
						description: "Optional",
					},
					comments: {
						type: "string",
						description: "Optional, design_direction only",
					},
				},
				required: ["session_type", "session_id"],
			},
		},
	],
}))

// Call tools — wrapped to trigger hot-swap after response when an update is staged
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
	const result = await handleToolCall(request, extra.signal)

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

async function handleToolCall(
	request: {
		params: { name: string; arguments?: Record<string, unknown> }
	},
	signal?: AbortSignal,
) {
	const { name, arguments: args } = request.params

	// Orchestration tools (async — gate_ask blocks until user reviews)
	if (
		name === "haiku_run_next" ||
		name === "haiku_revisit" ||
		name === "haiku_intent_create" ||
		name === "haiku_select_studio" ||
		name === "haiku_intent_reset"
	) {
		_currentReviewSignal = signal
		try {
			const result = await handleOrchestratorTool(
				name,
				(args ?? {}) as Record<string, unknown>,
			)
			// Attach _meta if the MCP Apps review path set it
			if (_reviewResultMeta) {
				return { ...result, _meta: _reviewResultMeta }
			}
			return result
		} finally {
			_currentReviewSignal = undefined
			_reviewResultMeta = undefined
		}
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

	// Debug tool — dump connection diagnostics
	if (name === "haiku_debug") {
		const clientCaps = (server as unknown as { getClientCapabilities?: () => unknown }).getClientCapabilities?.() ?? null
		const serverCaps = {
			tools: true,
			prompts: true,
			completions: true,
			resources: true,
			experimental: { apps: {} },
			extensions: { "io.modelcontextprotocol/ui": {} },
		}
		let workspacePaths: string[] = []
		try {
			workspacePaths = await getMcpHostWorkspacePaths()
		} catch {
			// ignore
		}
		const info = {
			hostSupportsMcpApps: hostSupportsMcpApps(),
			serverCapabilities: serverCaps,
			clientCapabilities_RAW: clientCaps,
			clientCapabilities_keys: clientCaps ? Object.keys(clientCaps as object) : null,
			clientExtensions: (clientCaps as Record<string, unknown>)?.extensions ?? null,
			clientMcpAppsUi: ((clientCaps as Record<string, unknown>)?.extensions as Record<string, unknown>)?.["io.modelcontextprotocol/ui"] ?? null,
			clientExperimental: (clientCaps as Record<string, unknown>)?.experimental ?? null,
			clientApps: ((clientCaps as Record<string, unknown>)?.experimental as Record<string, unknown>)?.apps ?? null,
			workspacePaths,
			env: {
				CLAUDE_CODE_IS_COWORK: process.env.CLAUDE_CODE_IS_COWORK ?? "(not set)",
				CLAUDE_CODE_WORKSPACE_HOST_PATHS: process.env.CLAUDE_CODE_WORKSPACE_HOST_PATHS ?? "(not set)",
				HAIKU_REMOTE_REVIEW_URL: process.env.HAIKU_REMOTE_REVIEW_URL ?? "(not set)",
			},
			mcpServerInjected: true,
		}
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(info, null, 2),
				},
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

		// ── MCP Apps arm (unit-04) ──────────────────────────────────────────
		if (hostSupportsMcpApps()) {
			const mcpResult = await askVisualQuestionMcpApps({
				title,
				questions,
				context,
				imagePaths,
				imageBaseDirs,
				signal,
				setQuestionResultMeta: (meta) => {
					_reviewResultMeta = meta
				},
			})
			const meta = _reviewResultMeta
			_reviewResultMeta = undefined
			const toolResult = {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(mcpResult, null, 2),
					},
				],
			}
			if (meta) return { ...toolResult, _meta: meta }
			return toolResult
		}

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

		// ── MCP Apps arm (unit-04) ──────────────────────────────────────────
		if (hostSupportsMcpApps()) {
			const mcpResult = await pickDesignDirectionMcpApps({
				title,
				archetypes,
				parameters,
				intentSlug: input.intent_slug,
				signal,
				setDesignDirectionResultMeta: (meta) => {
					_reviewResultMeta = meta
				},
			})
			const meta = _reviewResultMeta
			_reviewResultMeta = undefined
			const toolResult = {
				content: [{ type: "text" as const, text: mcpResult.text }],
			}
			if (meta) return { ...toolResult, _meta: meta }
			return toolResult
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

	if (name === "haiku_cowork_review_submit") {
		const ReviewAnnotationsSchema = z
			.object({
				screenshot: z.string().optional(),
				pins: z
					.array(
						z.object({
							x: z.number(),
							y: z.number(),
							text: z.string(),
						}),
					)
					.optional(),
				comments: z
					.array(
						z.object({
							selectedText: z.string(),
							comment: z.string(),
							paragraph: z.number(),
						}),
					)
					.optional(),
			})
			.optional()

		const QuestionAnswerSchema = z.object({
			question: z.string(),
			selectedOptions: z.array(z.string()),
			otherText: z.string().optional(),
		})

		const QuestionAnnotationsSchema = z
			.object({
				comments: z
					.array(
						z.object({
							selectedText: z.string(),
							comment: z.string(),
							paragraph: z.number(),
						}),
					)
					.optional(),
			})
			.optional()

		const ReviewSubmitInput = z.discriminatedUnion("session_type", [
			z.object({
				session_type: z.literal("review"),
				session_id: z.string().uuid(),
				decision: z.enum(["approved", "changes_requested", "external_review"]),
				feedback: z.string(),
				annotations: ReviewAnnotationsSchema,
			}),
			z.object({
				session_type: z.literal("question"),
				session_id: z.string().uuid(),
				answers: z.array(QuestionAnswerSchema).min(1),
				feedback: z.string().optional(),
				annotations: QuestionAnnotationsSchema,
			}),
			z.object({
				session_type: z.literal("design_direction"),
				session_id: z.string().uuid(),
				archetype: z.string().min(1),
				parameters: z.record(z.number()),
				comments: z.string().optional(),
				annotations: z
					.object({
						screenshot: z.string().optional(),
						pins: z
							.array(
								z.object({
									x: z.number(),
									y: z.number(),
									text: z.string(),
								}),
							)
							.optional(),
					})
					.optional(),
			}),
		])

		const parsed = ReviewSubmitInput.safeParse(args ?? {})
		if (!parsed.success) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Invalid input: ${parsed.error.message}`,
					},
				],
				isError: true,
			}
		}
		const input = parsed.data

		// Common validation — session must exist and types must match
		const session = getSession(input.session_id)
		if (!session) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Session not found: ${input.session_id}`,
					},
				],
				isError: true,
			}
		}
		if (session.session_type !== input.session_type) {
			return {
				content: [
					{
						type: "text" as const,
						text: `session_type mismatch: expected ${session.session_type}, got ${input.session_type}`,
					},
				],
				isError: true,
			}
		}
		if (session.status !== "pending") {
			return {
				content: [
					{
						type: "text" as const,
						text: `Session already closed: ${input.session_id}`,
					},
				],
				isError: true,
			}
		}

		// question path
		if (input.session_type === "question") {
			updateQuestionSession(input.session_id, {
				status: "answered",
				answers: input.answers,
				feedback: input.feedback ?? "",
				annotations: input.annotations,
			})
			return { content: [{ type: "text" as const, text: '{"ok":true}' }] }
		}

		// design_direction path
		if (input.session_type === "design_direction") {
			updateDesignDirectionSession(input.session_id, {
				status: "answered",
				selection: {
					archetype: input.archetype,
					parameters: input.parameters,
					...(input.comments ? { comments: input.comments } : {}),
					...(input.annotations ? { annotations: input.annotations } : {}),
				},
			})
			return { content: [{ type: "text" as const, text: '{"ok":true}' }] }
		}

		// review path
		updateSession(input.session_id, {
			status: "decided",
			decision: input.decision,
			feedback: input.feedback,
			annotations: input.annotations,
		})
		return { content: [{ type: "text" as const, text: '{"ok":true}' }] }
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
		if (hostSupportsMcpApps()) {
			// ── MCP Apps arm (unit-03) ──────────────────────────────────────────
			// Body extracted to ./open-review-mcp-apps.ts so it can be unit
			// tested directly. Pass the AbortSignal captured by handleToolCall
			// and a setter callback for the module-scoped _reviewResultMeta.
			addReviewTransportBreadcrumb(true, "mcp_apps")
			return openReviewMcpApps({
				intentDirRel,
				reviewType,
				gateType,
				signal: _currentReviewSignal,
				setReviewResultMeta: (meta) => {
					_reviewResultMeta = meta
				},
			})
		}
		// ── HTTP + tunnel + browser arm (existing — byte-identical to main) ──
		addReviewTransportBreadcrumb(false, "http_tunnel")
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
