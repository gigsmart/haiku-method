import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
	buildDAG,
	parseAllUnits,
	parseCriteria,
	parseIntent,
	toMermaidDefinition,
} from "@ai-dlc/shared"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { getActualPort, setMcpServer, startHttpServer } from "./http.js"
import { createQuestionSession, createSession, getSession } from "./sessions.js"
import type { QuestionDef } from "./sessions.js"
import { type MockupInfo, renderReviewPage } from "./templates/index.js"
import { renderQuestionPage } from "./templates/question-form.js"

const OpenReviewInput = z.object({
	intent_dir: z
		.string()
		.describe("Path to the intent directory (e.g., .ai-dlc/my-intent)"),
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
})

const server = new Server(
	{ name: "ai-dlc-review", version: "0.1.0" },
	{
		capabilities: {
			tools: {},
			experimental: {
				"claude/channel": {},
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
			} as any,
		},
	},
)

// Inject MCP server into HTTP module for channel notifications
setMcpServer(server)

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "open_review",
			description:
				"Open a visual review page in the browser for an AI-DLC intent or unit. " +
				"Parses intent/unit data and serves an interactive HTML review page.",
			inputSchema: {
				type: "object" as const,
				properties: {
					intent_dir: {
						type: "string",
						description:
							"Path to the intent directory (e.g., .ai-dlc/my-intent)",
					},
					review_type: {
						type: "string",
						enum: ["intent", "unit"],
						description: "Type of review: intent-level or unit-level",
					},
					target: {
						type: "string",
						description: "Unit slug to review (required for unit reviews)",
					},
				},
				required: ["intent_dir", "review_type"],
			},
		},
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
				},
				required: ["questions"],
			},
		},
	],
}))

// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params

	if (name === "open_review") {
		const input = OpenReviewInput.parse(args)

		// Resolve intent_dir to an absolute path. When a relative path is provided
		// (e.g., ".ai-dlc/my-intent"), it resolves against process.cwd(), which is
		// expected to be the project root. MCP servers inherit cwd from the client
		// that spawned them (e.g., Claude Code), so this is normally correct.
		// Additionally validate that the path stays within .ai-dlc/ to prevent
		// path traversal.
		const allowedBase = resolve(process.cwd(), ".ai-dlc")
		const intentDir = resolve(process.cwd(), input.intent_dir)
		if (!intentDir.startsWith(`${allowedBase}/`) && intentDir !== allowedBase) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: intent_dir must be within .ai-dlc/ (got: ${input.intent_dir})`,
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

		// Generate HTML with session ID, mockups, and wireframes
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

		return {
			content: [
				{
					type: "text" as const,
					text: `Review opened: ${reviewUrl}\nSession ID: ${session.session_id}\nReview type: ${input.review_type}${input.target ? `\nTarget: ${input.target}` : ""}`,
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

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						{
							session_id: session.session_id,
							status: session.status,
							decision: session.decision,
							feedback: session.feedback,
							review_type: session.review_type,
							target: session.target,
						},
						null,
						2,
					),
				},
			],
		}
	}

	if (name === "ask_user_visual_question") {
		const input = AskVisualQuestionInput.parse(args)
		const title = input.title ?? "Question"
		const context = input.context ?? ""
		const questions: QuestionDef[] = input.questions

		// Create question session
		const session = createQuestionSession({
			title,
			questions,
			context,
			html: "",
		})

		// Render HTML
		session.html = renderQuestionPage({
			title,
			questions,
			context,
			sessionId: session.session_id,
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

		return {
			content: [
				{
					type: "text" as const,
					text: `Question page opened: ${questionUrl}\nSession ID: ${session.session_id}\nQuestions: ${questions.length}`,
				},
			],
		}
	}

	return {
		content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
		isError: true,
	}
})

// Start server
async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error("AI-DLC Review MCP server running on stdio")
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

main().catch((err) => {
	console.error("Fatal error:", err)
	process.exit(1)
})
