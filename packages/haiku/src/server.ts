import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
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
import { stripWildcardAllowedOrigins } from "./config.js"
import { ensureOnStageBranch } from "./git-worktree.js"
import {
	closeSessionConnection,
	startHttpServer,
	stopHttpServer,
} from "./http.js"
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
import type {
	DesignArchetypeData,
	DesignParameterData,
	QuestionDef,
} from "./sessions.js"
import {
	clearHeartbeat,
	createDesignDirectionSession,
	createQuestionSession,
	createSession,
	deleteSession,
	getPreviousReviewSnapshot,
	getSession,
	hasPresenceLost,
	waitForSession,
} from "./sessions.js"
import {
	findHaikuRoot,
	intentDir,
	intentFromCurrentBranch,
	listVisibleIntents,
	parseFrontmatter,
	readJson,
	stageStatePath,
	writeJson,
} from "./state-tools.js"
import { renderDesignDirectionPage } from "./templates/design-direction.js"
import { renderReviewPage } from "./templates/index.js"
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

import { getCapabilities, isClaudeCode } from "./harness.js"
import {
	handleOrchestratorTool,
	orchestratorToolDefs,
	setElicitInputHandler,
	setOpenReviewHandler,
} from "./orchestrator.js"
// Prompts: for Claude Code, skills are native; for other harnesses, we bridge
// skills → MCP prompts so they surface as invocable actions.
import { completeArgument, getPrompt, listPrompts } from "./prompts/index.js"
import { registerSkillPrompts } from "./prompts/skill-bridge.js"
import { handleStateTool, stateToolDefs } from "./state-tools.js"

// Bridge skills to MCP prompts for harnesses that lack native skill support.
// For Claude Code this is a no-op (skills are native). For Gemini CLI, prompts
// surface as slash commands. For Cursor/Windsurf/Kiro, prompts appear in the
// prompt UI. For OpenCode, prompts support is partial but growing.
if (!isClaudeCode()) {
	const caps = getCapabilities()
	if (caps.mcpPrompts) {
		registerSkillPrompts()
	}
}

/**
 * Launch the OS default browser at `url`. Best-effort — a failure HERE
 * never advances a review gate on its own (the caller still `await`s
 * `waitForSession` which either hears a real decision or times out),
 * but we log loudly so the reviewer has a visible URL they can paste
 * manually. The previous implementation swallowed all three failure
 * modes (sync throw, async 'error', non-zero exit) silently, which
 * left the FSM "waiting quietly" with no UI hint anywhere.
 *
 * `label` lands in log lines so operators can tell which surface
 * tried to open — review gate, question, direction, or the always-on
 * review pane.
 */
function launchBrowserBestEffort(url: string, label: string): void {
	console.error(
		`[haiku] ${label} ready → ${url}\n` +
			`         Share this URL with the reviewer if the browser didn't auto-open.`,
	)
	const cmd = process.platform === "darwin" ? ["open", url] : ["xdg-open", url]
	try {
		const child = spawn(cmd[0], cmd.slice(1), {
			stdio: "ignore",
			detached: true,
		})
		child.unref()
		child.on("error", (err) => {
			console.error(
				`[haiku] Browser launcher ${cmd[0]} failed: ${err.message}. Paste ${url} into a browser to continue.`,
			)
		})
		child.on("exit", (code, signal) => {
			if (code !== null && code !== 0) {
				console.error(
					`[haiku] Browser launcher ${cmd[0]} exited with code ${code}. Paste ${url} into a browser to continue.`,
				)
			}
			if (signal) {
				console.error(
					`[haiku] Browser launcher ${cmd[0]} terminated by signal ${signal}. Paste ${url} into a browser to continue.`,
				)
			}
		})
	} catch (err) {
		console.error(
			`[haiku] Browser launcher threw synchronously: ${err instanceof Error ? err.message : String(err)}. Paste ${url} into a browser to continue.`,
		)
	}
}

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
	prompts: listPrompts(),
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
	return getPrompt(request.params.name, request.params.arguments)
})

server.setRequestHandler(CompleteRequestSchema, async (request) => {
	return completeArgument(request.params)
})

// List tools — filtered by harness capabilities
server.setRequestHandler(ListToolsRequestSchema, async () => {
	const caps = getCapabilities()
	const allTools = [
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
			name: "haiku_report",
			description:
				"Submit a bug report or feedback to the H·AI·K·U team via Sentry. " +
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
	]

	// Harness-aware tool filtering:
	// 1. Remove browser-based UI tools for headless/non-browser harnesses
	// 2. Respect maxTools limit for constrained harnesses (Cursor ~40, Windsurf 100)
	let filteredTools = allTools

	// Step 1: Remove browser-based UI tools for non-Claude harnesses.
	// These tools open a local HTTP server + browser window which won't work
	// in headless IDE environments. Removing them frees tool slots for harnesses
	// with tight limits (Cursor ~40).
	if (!isClaudeCode()) {
		const browserTools = new Set([
			"ask_user_visual_question",
			"pick_design_direction",
		])
		filteredTools = filteredTools.filter((t) => !browserTools.has(t.name))
	}

	// Step 2: Enforce tool count limit
	if (caps.maxTools !== null && filteredTools.length > caps.maxTools) {
		console.error(
			`[haiku] Harness tool limit (${caps.maxTools}) exceeded — exposing ${caps.maxTools} of ${filteredTools.length} tools`,
		)
		filteredTools = filteredTools.slice(0, caps.maxTools)
	}

	return { tools: filteredTools }
})

// Call tools — wrapped to trigger hot-swap after response when an update is staged
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
	let result: Awaited<ReturnType<typeof handleToolCall>>
	try {
		result = await handleToolCall(request, extra?.signal)
	} catch (err) {
		// User cancellation is not a crash — when Claude Code escapes a
		// tool call it fires `notifications/cancelled`, the SDK aborts
		// the signal, and the handler throws out. That's a normal
		// lifecycle event; don't spam Sentry with it and don't write a
		// crash file. Just rethrow so the SDK can suppress the response.
		if (extra?.signal?.aborted) {
			throw err
		}
		// The MCP SDK's request dispatch catches thrown errors and returns
		// them as JSON-RPC InternalError responses, which means they never
		// reach main().catch — and therefore never hit Sentry. Report here
		// so handled-but-thrown tool crashes still get captured alongside
		// the session context the PreToolUse hook injects on every call.
		const toolName = request.params?.name ?? "<unknown>"
		const args = (request.params?.arguments ?? {}) as Record<string, unknown>
		const sessionCtx = args._session_context as
			| Record<string, string>
			| undefined

		// Diagnostic: write a local crash file regardless of Sentry state,
		// so operators can prove whether the wrapper even fired and inspect
		// the stack without needing dashboard access.
		try {
			const { appendFileSync } = await import("node:fs")
			const stamp = new Date().toISOString()
			const stack =
				err instanceof Error ? err.stack || err.message : String(err)
			appendFileSync(
				"/tmp/haiku-mcp-crashes.log",
				`\n--- ${stamp} tool=${toolName} ---\n${stack}\n`,
			)
		} catch {
			/* diagnostic write best-effort */
		}

		reportError(
			err,
			{
				context: "mcp-tool-handler",
				tool_name: toolName,
				// Intentionally omit args — they may carry sensitive payloads
				// (source_ref URLs, feedback bodies). The stack + tool name is
				// enough to locate the crash.
			},
			sessionCtx,
		)
		// Sentry's HTTP transport is fire-and-forget; force a short flush so
		// long-running processes don't drop events when the handler returns
		// before the transport actually ships the envelope.
		try {
			const { flush } = await import("./sentry.js")
			await flush(1000)
		} catch {
			/* flush best-effort */
		}
		console.error(
			`[haiku] Tool handler '${toolName}' threw:`,
			err instanceof Error ? err.stack || err.message : String(err),
		)
		throw err
	}

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

/**
 * Close the session's WebSocket when the given AbortSignal fires.
 * Used by every tool handler that creates an interactive session so
 * the SPA sees an immediate `SessionEndedOverlay` if the user cancels
 * the originating MCP tool call.
 */
const SESSION_CANCEL_LOG = "/tmp/haiku-session-cancel.log"

function logCancel(msg: string): void {
	try {
		const { appendFileSync } = require("node:fs") as typeof import("node:fs")
		appendFileSync(SESSION_CANCEL_LOG, `${new Date().toISOString()} ${msg}\n`)
	} catch {
		/* best-effort — don't crash the tool handler over a log write */
	}
	process.stderr.write(`[haiku-mcp] ${msg}\n`)
}

function bindSessionCancellation(
	sessionId: string,
	signal: AbortSignal | undefined,
): void {
	if (!signal) {
		logCancel(
			`bindSessionCancellation(${sessionId}): no signal passed — cancel will not fire`,
		)
		return
	}
	logCancel(
		`bindSessionCancellation(${sessionId}): signal attached, aborted=${signal.aborted}`,
	)
	if (signal.aborted) {
		logCancel(
			`bindSessionCancellation(${sessionId}): signal was already aborted, closing immediately`,
		)
		closeSessionConnection(sessionId, "tool call cancelled")
		return
	}
	signal.addEventListener(
		"abort",
		() => {
			logCancel(
				`abort fired for session ${sessionId} — closing WS (reason: ${signal.reason})`,
			)
			closeSessionConnection(sessionId, "tool call cancelled")
		},
		{ once: true },
	)
}

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
		name === "haiku_intent_reset" ||
		name === "haiku_intent_archive" ||
		name === "haiku_intent_unarchive"
	) {
		return handleOrchestratorTool(
			name,
			(args ?? {}) as Record<string, unknown>,
			signal,
		)
	}

	// Report tool — submit user feedback/bug reports to Sentry
	if (name === "haiku_report") {
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

	// Ad-hoc review pane — create a fresh session-scoped review bound to
	// the active intent + stage, open the browser, return the URL. Does
	// NOT block the tool call; does NOT call run_next. The session lives
	// until the usual TTL / presence sweep evicts it. Feedback the
	// reviewer leaves routes through the normal feedback API; the FSM
	// picks it up via run_next's fix-loop/revisit path.
	if (name === "haiku_review_open") {
		const a = (args ?? {}) as Record<string, unknown>
		let slug = (a.intent as string) || ""
		if (!slug) {
			const branchMatch = intentFromCurrentBranch()
			if (branchMatch) {
				slug = branchMatch.slug
			} else {
				const root = findHaikuRoot()
				const intentsDir = join(root, "intents")
				const active = listVisibleIntents(intentsDir).filter(
					(i) => (i.data.status as string) !== "completed",
				)
				if (active.length === 1) {
					slug = active[0].slug
				} else if (active.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No active intents found. Start one with /haiku:start, or pass `intent` explicitly.",
							},
						],
						isError: true,
					}
				} else {
					return {
						content: [
							{
								type: "text" as const,
								text: `Multiple active intents (${active.map((i) => i.slug).join(", ")}). Pass \`intent\` explicitly, or checkout an intent branch so the tool can auto-resolve.`,
							},
						],
						isError: true,
					}
				}
			}
		}

		const intentDirAbs = intentDir(slug)
		const intent = await parseIntent(intentDirAbs)
		if (!intent) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Could not parse intent "${slug}" — .haiku/intents/${slug}/intent.md missing or malformed.`,
					},
				],
				isError: true,
			}
		}

		const stageArg = (a.stage as string) || ""
		const frontmatter = intent.frontmatter as unknown as Record<string, unknown>
		const activeStage =
			stageArg || ((frontmatter.active_stage as string | undefined) ?? "")

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
			intent_slug: slug,
			review_type: "intent",
			target: "",
			html: "",
		})
		session.ad_hoc = true
		session.stage = activeStage || undefined

		Object.assign(session, {
			parsedIntent: intent,
			parsedUnits: units,
			parsedCriteria: criteria,
			parsedMermaid: mermaid,
		})

		const stageStates = await parseStageStates(intentDirAbs)
		const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
		const stageArtifacts = await parseStageArtifacts(intentDirAbs)
		const outputArtifacts = await parseOutputArtifacts(intentDirAbs)
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
			reviewType: "intent",
			target: "",
			sessionId: session.session_id,
			mermaid,
			intentMockups: [],
			unitMockups: new Map(),
		})

		const port = await startHttpServer()
		const base = isRemoteReviewEnabled()
			? buildReviewUrl(session.session_id, await openTunnel(port), "intent")
			: `http://127.0.0.1:${port}/review/${session.session_id}`
		const stageSuffix = activeStage ? `/stages/${activeStage}` : ""
		const reviewUrl = `${base}${stageSuffix}`

		bindSessionCancellation(session.session_id, signal)

		launchBrowserBestEffort(reviewUrl, "Ad-hoc review")

		// Block until the reviewer hits Done or Request Changes (or the
		// pane times out). The UI posts a decide frame with decision set
		// to "approved" (Done) or "changes_requested" (Request Changes),
		// which flips session.status to "decided" and wakes
		// waitForSession. The tool return then relays a concrete
		// instruction to the agent so run_next / revisit is the obvious
		// next step, not a guess.
		try {
			while (true) {
				let timedOut = false
				try {
					await waitForSession(session.session_id, 30 * 60 * 1000, signal)
				} catch (err) {
					if (signal?.aborted) throw err
					timedOut = true
				}

				const updated = getSession(session.session_id)
				if (
					updated &&
					updated.session_type === "review" &&
					updated.status === "decided"
				) {
					if (updated.decision === "changes_requested") {
						return {
							content: [
								{
									type: "text" as const,
									text: `Ad-hoc review closed with Request Changes on stage "${activeStage || "(unspecified)"}". Pending feedback is already persisted on disk — call \`haiku_run_next\` to route it through the normal fix-loop / revisit path.`,
								},
							],
						}
					}
					return {
						content: [
							{
								type: "text" as const,
								text: `Ad-hoc review closed with Done — no changes requested. No FSM action needed.`,
							},
						],
					}
				}

				if (timedOut) break
				if (hasPresenceLost(session.session_id)) {
					console.error(
						`[haiku] Ad-hoc review ${session.session_id} lost presence — continuing to wait (no reopen)`,
					)
				}
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `Ad-hoc review pane at ${reviewUrl} timed out after 30 minutes without a Done or Request Changes click. Any feedback the reviewer typed is still persisted on disk; the next \`haiku_run_next\` will see it if present.`,
					},
				],
			}
		} finally {
			closeSessionConnection(session.session_id, "ad-hoc review closed")
			clearHeartbeat(session.session_id)
			if (isRemoteReviewEnabled()) {
				clearE2EKey(session.session_id)
				closeTunnel()
			}
			deleteSession(session.session_id)
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
		bindSessionCancellation(session.session_id, signal)

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

		launchBrowserBestEffort(questionUrl, "Question session")

		// Block until the user submits their answers (event-based, no polling)
		const MAX_WAIT_Q = 30 * 60 * 1000 // 30 minutes
		try {
			await waitForSession(session.session_id, MAX_WAIT_Q, signal)
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
		bindSessionCancellation(session.session_id, signal)

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

		launchBrowserBestEffort(directionUrl, "Direction session")

		// Block until the user submits their selection (event-based, no polling)
		const MAX_WAIT_DD = 30 * 60 * 1000 // 30 minutes
		try {
			await waitForSession(session.session_id, MAX_WAIT_DD, signal)
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
					// Re-enforce stage branch after the (up to 30-min) wait —
					// the user may have checked out another branch during the
					// design-direction selection. Without this, the stage-state
					// write below would land on whatever branch is current.
					const guard = ensureOnStageBranch(input.intent_slug, activeStage)
					if (!guard.ok) {
						// Non-fatal: log via throw so the outer catch records it,
						// and the orchestrator flag will need manual set.
						throw new Error(
							`stage-branch enforcement failed after design-direction wait: ${guard.message}`,
						)
					}
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
	async (
		intentDirRel: string,
		reviewType: string,
		gateType?: string,
		signal?: AbortSignal,
	) => {
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
		bindSessionCancellation(session.session_id, signal)

		// Store parsed data on session for the SPA
		Object.assign(session, {
			parsedIntent: intent,
			parsedUnits: units,
			parsedCriteria: criteria,
			parsedMermaid: mermaid,
		})

		// Attach previous-review snapshot (from a prior changes_requested) so
		// the SPA can render a delta on the re-review.
		const prevSnapshot = getPreviousReviewSnapshot(intentDirAbs)
		if (prevSnapshot) {
			session.previousReview = prevSnapshot
		}

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

		launchBrowserBestEffort(reviewUrl, "Review gate")

		// Close + evict the session as soon as this tool call exits,
		// whether the user decided, we timed out, the agent cancelled,
		// or the call threw. Anchored in try/finally so the WS tear-down
		// is impossible to skip — otherwise stale sessions linger in the
		// map and zombie tabs keep thinking they're live.
		try {
			// Single 30-minute wait. NO browser re-opens.
			//
			// The previous retry loop spawned a fresh browser tab on every
			// presence-lost wakeup AND on every attempt timeout. Modern
			// browsers throttle setInterval in backgrounded tabs, so a
			// user who had the review tab open but switched windows would
			// hit spurious presence-lost events and see brand-new tabs
			// pop up, overwriting their in-progress comments on the
			// original (still-alive) tab.
			//
			// Recovery path: on timeout, throw — the caller in
			// orchestrator.ts classifies review timeouts as agent-fixable
			// and returns GATE BLOCKED. The agent's next haiku_run_next
			// tick re-enters the review phase and creates a fresh session.
			// No orphaned tabs.
			while (true) {
				let timedOut = false
				try {
					await waitForSession(session.session_id, 30 * 60 * 1000, signal)
				} catch (err) {
					// Abort propagates here too — distinguish by checking the
					// signal. If aborted, break out of the whole retry loop so
					// the finally block can clean up promptly.
					if (signal?.aborted) {
						throw err
					}
					timedOut = true
				}

				const updated = getSession(session.session_id)
				if (
					updated &&
					updated.session_type === "review" &&
					updated.status === "decided"
				) {
					return {
						decision: updated.decision,
						feedback: updated.feedback,
						annotations: updated.annotations,
					}
				}

				// Timeout check MUST come before presence-lost: once
				// presenceLost contains the session ID it stays there
				// across iterations, so checking presence-lost first
				// would swallow every subsequent timeout.
				if (timedOut) break

				if (hasPresenceLost(session.session_id)) {
					// Log but keep waiting. The tab may just be
					// backgrounded and heartbeat-throttled; if genuinely
					// closed, the timeout above will eventually fire.
					console.error(
						`[haiku] Review session ${session.session_id} lost presence — continuing to wait (no reopen)`,
					)
				}

				// Presence-lost or spurious wakeup — loop again.
			}

			throw new Error("Review timeout after 30 minutes")
		} finally {
			// Drop the WebSocket first so any still-connected SPA tab
			// transitions to the session-ended overlay, then remove the
			// session from the registry so subsequent reloads 404 and
			// render the overlay from their own fetch path.
			closeSessionConnection(session.session_id, "tool call complete")
			clearHeartbeat(session.session_id)
			if (useRemote) {
				clearE2EKey(session.session_id)
				closeTunnel()
			}
			deleteSession(session.session_id)
		}
	},
)

// Wire up elicitation fallback for when the review UI fails
setElicitInputHandler(async (params) => {
	return server.elicitInput(params as Parameters<typeof server.elicitInput>[0])
})

// Start server
async function main() {
	// FB-36: strip any `*` from HAIKU_REVIEW_ALLOWED_ORIGINS before the
	// HTTP layer starts applying CORS. Wildcard CORS on this server is
	// unsafe because the session-token-in-URL auth cannot defend against
	// cross-origin abuse when any origin is accepted.
	stripWildcardAllowedOrigins()

	const transport = new StdioServerTransport()
	await server.connect(transport)
	const harnessInfo = isClaudeCode()
		? ""
		: ` (harness: ${getCapabilities().displayName})`
	console.error(`H·AI·K·U Review MCP server running on stdio${harnessInfo}`)

	// Start background auto-update checker after the server is live
	startUpdateChecker()
}

// Graceful shutdown
//
// Order matters here:
//   1. Stop the background update checker so it can't start new work.
//   2. Close the MCP stdio `Server` so we stop accepting new MCP calls.
//   3. Close the Fastify HTTP+WebSocket server so in-flight feedback/
//      revisit/review requests get to finish and WS clients see a
//      clean `1001 Going Away` (via `stopHttpServer` → per-session
//      `closeSessionConnection`) instead of a TCP RST. Fastify's
//      `close()` drains pending requests before releasing the socket.
//   4. Flush Sentry so any errors surfaced during (2)/(3) get reported.
//   5. `process.exit(0)`.
//
// We guard against a hung shutdown with a hard timeout — if any phase
// stalls for more than SHUTDOWN_TIMEOUT_MS we fall back to a forced
// exit rather than leaving the process wedged.
const SHUTDOWN_TIMEOUT_MS = 10_000
let shuttingDown = false
async function gracefulShutdown(signal: string): Promise<void> {
	if (shuttingDown) return
	shuttingDown = true
	console.error(`Shutting down (${signal})...`)
	const hardExit = setTimeout(() => {
		console.error(
			`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`,
		)
		process.exit(1)
	}, SHUTDOWN_TIMEOUT_MS)
	hardExit.unref()
	try {
		stopUpdateChecker()
		await server.close()
		await stopHttpServer()
		await flushSentry()
	} catch (err) {
		console.error(
			`Error during graceful shutdown: ${err instanceof Error ? err.message : String(err)}`,
		)
	} finally {
		clearTimeout(hardExit)
		process.exit(0)
	}
}

process.on("SIGINT", () => {
	void gracefulShutdown("SIGINT")
})

process.on("SIGTERM", () => {
	void gracefulShutdown("SIGTERM")
})

// MCP server entry point — invoked by: haiku mcp
main().catch((err) => {
	reportError(err, { context: "mcp-server-fatal" })
	console.error("Fatal error:", err)
	process.exit(1)
})
