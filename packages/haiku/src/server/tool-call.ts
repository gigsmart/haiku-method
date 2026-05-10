// server/tool-call.ts — MCP CallTool dispatch + the review-gate
// handler the orchestrator invokes for `gate_ask`. Together these
// own every blocking interactive tool path: ad-hoc reviews, gate
// reviews, visual questions, and design-direction pickers.
//
// Why one module: each path needs the same plumbing — start the
// HTTP server, open a tunnel (when remote-review is on), launch a
// browser, bind session cancellation to the MCP signal, then block
// on `waitForSession`. Keeping them adjacent makes the lifecycle
// invariants (`try { … } finally { closeSessionConnection… }`)
// visually consistent.

import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { z } from "zod"
import { ensureOnStageBranch } from "../git-worktree.js"
import { closeSessionConnection, startHttpServer } from "../http.js"
import type { ParsedUnit } from "../index.js"
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
} from "../index.js"
import { broadcastIntent } from "../intent-broadcaster.js"
import { handleOrchestratorTool } from "../orchestrator.js"
import { buildOutputDeclaredBy } from "../output-declared-by.js"
import { isSentryConfigured, reportFeedback } from "../sentry.js"
import type {
	DesignArchetypeData,
	QuestionDef,
	ReviewAnnotations,
} from "../sessions.js"
import {
	clearHeartbeat,
	createDesignDirectionSession,
	createQuestionSession,
	createSession,
	deleteSession,
	findLiveReviewSessionForIntent,
	getPreviousReviewSnapshot,
	getSession,
	hasPresenceLost,
	isBrowserAttached,
	updateSession,
	waitForSession,
} from "../sessions.js"
import { buildStageArtifactUrl } from "../stage-artifact-url.js"
import {
	type HaikuAwaitDesignDirectionInput,
	type HaikuAwaitVisualAnswerInput,
	validateHaikuAwaitDesignDirectionInputSchema,
	validateHaikuAwaitVisualAnswerInputSchema,
	validateHaikuReviewOpenInputSchema,
} from "../state/schemas/index.js"
import { validateToolInput } from "../state/schemas/inputs/_validate.js"
import {
	findHaikuRoot,
	handleStateTool,
	intentDir,
	intentFromCurrentBranch,
	listVisibleIntents,
	parseFrontmatter,
	readJson,
	writeJson,
} from "../state-tools.js"
import { withAnnouncement } from "../tools/orchestrator/_announce.js"
import { orchestratorToolHandlers } from "../tools/orchestrator/index.js"
import {
	buildReviewUrl,
	clearE2EKey,
	closeTunnel,
	isRemoteReviewEnabled,
	openTunnel,
} from "../tunnel.js"
import { buildUnitOutputPreviews } from "../unit-output-preview.js"

/**
 * Build the per-unit output preview map and the inverse
 * `output_declared_by` map for a session payload. Both halves of the
 * data exist for the same reason — the SPA's Units tab renders
 * popovers for unit-declared outputs, and the Outputs tab renders the
 * "Declared by" banner that points the other direction. Computed once
 * here so the ad-hoc-review and gate-review session builders stay in
 * sync without repeated copy-paste.
 */
async function buildSessionOutputMeta(
	intentDirAbs: string,
	sessionId: string,
	units: ParsedUnit[],
): Promise<{
	unitOutputs: Record<string, unknown>
	outputDeclaredBy: Record<string, string[]>
}> {
	const previews = await Promise.all(
		units.map(async (u) => ({
			slug: u.slug,
			outputs: await buildUnitOutputPreviews(
				intentDirAbs,
				sessionId,
				u.frontmatter.outputs,
			),
		})),
	)
	const unitOutputs: Record<string, unknown> = {}
	for (const { slug: uSlug, outputs } of previews) {
		if (outputs.length > 0) unitOutputs[uSlug] = outputs
	}
	const outputDeclaredBy = await buildOutputDeclaredBy(intentDirAbs)
	return { unitOutputs, outputDeclaredBy }
}

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
})

const PickDesignDirectionInput = z.object({
	intent_slug: z.string().describe("The intent slug this direction applies to"),
	archetypes: z
		.array(DesignArchetypeSchema)
		.optional()
		.describe(
			'Inline array of design archetypes to choose from. Omit (or pass an empty array) on the FIRST call to enter intake mode — the picker asks whether the user has designs to upload before any generation work happens. Pass archetypes only after the user responds with `mode: "generate"`.',
		),
	archetypes_file: z
		.string()
		.optional()
		.describe(
			"Path to a JSON file containing the archetypes array (alternative to inline archetypes)",
		),
	title: z
		.string()
		.optional()
		.describe("Optional page title (default: 'Design Direction')"),
})

/**
 * Launch the OS default browser at `url`. Best-effort — a failure HERE
 * never advances a review gate on its own (the caller still `await`s
 * `waitForSession` which either hears a real decision or times out),
 * but we log loudly so the reviewer has a visible URL they can paste
 * manually. The previous implementation swallowed all three failure
 * modes (sync throw, async 'error', non-zero exit) silently, which
 * left the workflow engine "waiting quietly" with no UI hint anywhere.
 *
 * `label` lands in log lines so operators can tell which surface
 * tried to open — review gate, question, direction, or the always-on
 * review pane.
 */
export function launchBrowserBestEffort(url: string, label: string): void {
	console.error(
		`[haiku] ${label} ready → ${url}\n` +
			`         Share this URL with the reviewer if the browser didn't auto-open.`,
	)
	// On Windows we use PowerShell `Start-Process` rather than `cmd /c start`.
	// cmd.exe interprets `&`, `|`, `^`, `<`, `>`, `%`, `!` even in argv-passed
	// args, which would mangle a URL like `?session=a&token=b` (everything
	// after `&` would be parsed as a separate command). PowerShell does not
	// share that hazard. We still escape embedded single quotes by doubling
	// them — the only character `Start-Process '...'` is sensitive to.
	const cmd: string[] =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? [
						"powershell",
						"-NoProfile",
						"-NonInteractive",
						"-Command",
						`Start-Process '${url.replace(/'/g, "''")}'`,
					]
				: ["xdg-open", url]
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

const SESSION_CANCEL_LOG = "/tmp/haiku-session-cancel.log"

function logCancel(msg: string): void {
	try {
		appendFileSync(SESSION_CANCEL_LOG, `${new Date().toISOString()} ${msg}\n`)
	} catch {
		/* best-effort — don't crash the tool handler over a log write */
	}
	process.stderr.write(`[haiku-mcp] ${msg}\n`)
}

/**
 * Close the session's WebSocket when the given AbortSignal fires.
 * Used by every tool handler that creates an interactive session so
 * the SPA sees an immediate `SessionEndedOverlay` if the user cancels
 * the originating MCP tool call.
 */
export function bindSessionCancellation(
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

export async function handleToolCall(
	request: {
		params: { name: string; arguments?: Record<string, unknown> }
	},
	signal?: AbortSignal,
) {
	const { name, arguments: args } = request.params

	// Orchestration tools. The set is sourced from the registry
	// (`orchestratorToolHandlers`) so any new tool added under
	// tools/orchestrator/ auto-routes here without a second
	// registration. `haiku_await_gate` is the only tool here that
	// blocks for an extended period (waits on the gate-review session
	// for up to 30 minutes); the others return promptly.
	if (orchestratorToolHandlers.has(name)) {
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
	// reviewer leaves routes through the normal feedback API; the workflow engine
	// picks it up via run_next's fix-loop/revisit path.
	if (name === "haiku_review_open") {
		const a = (args ?? {}) as Record<string, unknown>
		const reviewOpenInputErr = validateToolInput(
			a,
			validateHaikuReviewOpenInputSchema,
			"haiku_review_open",
		)
		if (reviewOpenInputErr) return reviewOpenInputErr
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
			target: "",
		})
		session.ad_hoc = true
		session.stage = activeStage || undefined

		// Per-unit output previews + the inverse "declared by" map.
		// Built after the session exists (the URL helper needs the
		// session id) so the SPA gets popover-ready entries with no
		// per-row fetch round-trip.
		const { unitOutputs, outputDeclaredBy } = await buildSessionOutputMeta(
			intentDirAbs,
			session.session_id,
			units,
		)

		Object.assign(session, {
			parsedIntent: intent,
			parsedUnits: units,
			parsedCriteria: criteria,
			parsedMermaid: mermaid,
			unitOutputs,
			outputDeclaredBy,
		})

		const stageStates = await parseStageStates(intentDirAbs)
		const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
		const stageArtifacts = await parseStageArtifacts(intentDirAbs)
		const outputArtifacts = await parseOutputArtifacts(intentDirAbs)
		// Rewrite every relativePath (not just images) to a tunnel URL so
		// click-out links work for HTML, file, and image types alike. The
		// parser produces intent-dir-relative paths; the helper returns
		// the full `/stage-artifacts/:sessionId/*` route path the SPA
		// reaches via `withAuthQuery`. Preserve the original
		// intent-relative path on `intentRelativePath` so the SPA can
		// look the artifact up in `output_declared_by`.
		for (const oa of outputArtifacts) {
			if (oa.relativePath) {
				oa.intentRelativePath = oa.relativePath
				oa.relativePath = buildStageArtifactUrl(
					session.session_id,
					oa.relativePath,
				)
			}
		}
		Object.assign(session, {
			stageStates,
			knowledgeFiles,
			stageArtifacts,
			outputArtifacts,
		})

		// (Legacy server-rendered review HTML removed — the live route
		// at /review/:sessionId serves HAIKU_UI_HTML, the React/Tanstack
		// SPA. session.html was written here for years but never read
		// by any handler; templates/ was dead code.)

		const port = await startHttpServer()
		const base = isRemoteReviewEnabled()
			? buildReviewUrl(session.session_id, await openTunnel(port), "intent")
			: `http://127.0.0.1:${port}/review/${session.session_id}`
		const stageSuffix = activeStage ? `/stages/${activeStage}` : ""
		const reviewUrl = `${base}${stageSuffix}`

		bindSessionCancellation(session.session_id, signal)

		// v4 user-gate path: cursor-driven user_gate actions pass
		// `gate_kind` ("spec" or "approval") so the cursor's `reviews.user`
		// or `approvals.user` slot can be filled by the user's decision.
		// We branch off the ad-hoc flow here:
		//   - mark the session as gate-bound (not ad_hoc)
		//   - write gate_review_session_id / url / context to the active
		//     stage's state.json so haiku_await_gate finds it
		//   - return the URL immediately; the agent's next call to
		//     haiku_await_gate does the wait + stamp.
		// Without this branch, the ad-hoc blocking loop below runs but
		// never stamps reviews.user / approvals.user — so the cursor
		// re-emits user_gate every tick. (That's the "closes immediately
		// without user input" symptom: schema rejection used to drop the
		// call entirely; with the schema fix in place, the call would
		// have succeeded but the workflow still wouldn't advance.)
		const gateKind = (a.gate_kind as string | undefined) || ""
		if (gateKind === "spec" || gateKind === "approval") {
			session.ad_hoc = false
			launchBrowserBestEffort(reviewUrl, "User gate review")
			if (activeStage) {
				// v4: state.json is gone. Gate-session pointers live on
				// per-stage `gate-session.json` so haiku_await_gate can
				// find the open session without touching state.json.
				const gateSessionFile = join(
					intentDir(slug),
					"stages",
					activeStage,
					"gate-session.json",
				)
				mkdirSync(dirname(gateSessionFile), { recursive: true })
				const stageState = existsSync(gateSessionFile)
					? readJson(gateSessionFile)
					: {}
				stageState.gate_review_session_id = session.session_id
				stageState.gate_review_url = reviewUrl
				// Map cursor's gate_kind → await_gate's gate_review_context
				// vocabulary (see stampGateApproval in haiku_await_gate.ts).
				stageState.gate_review_context =
					gateKind === "spec" ? "elaborate_to_execute" : "stage_gate"
				writeJson(gateSessionFile, stageState)
			}
			return {
				content: [
					{
						type: "text" as const,
						text: `User-gate review opened for stage "${activeStage || "(unspecified)"}". Review URL: ${reviewUrl}\n\nNow call haiku_await_gate { intent: "${slug}" } to block on the user's decision. On approve, the engine stamps ${gateKind === "spec" ? "reviews.user" : "approvals.user"} on each unit and the cursor advances on the next tick.`,
					},
				],
			}
		}

		launchBrowserBestEffort(reviewUrl, "Ad-hoc review")

		// Block until the reviewer hits Done or Request Changes (or the
		// pane times out). The UI posts a `decide` frame (WS) or
		// POSTs `/review/:id/decide` (HTTP) — both write
		// `session.pending_decision` and broadcast a
		// `pending_decision_changed` event, exactly like the
		// gate-review path. We mirror `awaitGateReviewSession`'s
		// consumption pattern: wake on every state change, look for
		// `pending_decision`, drain it, return.
		//
		// Drain on entry too: the reviewer may have decided before the
		// agent re-entered this tool (rare but legal) — the queued
		// decision should be picked up immediately.
		try {
			const drainPending = (): {
				decision: string
				feedback?: string
			} | null => {
				const cur = getSession(session.session_id)
				if (!cur || cur.session_type !== "review") return null
				if (!cur.pending_decision) return null
				const queued = cur.pending_decision
				updateSession(session.session_id, { pending_decision: null })
				return { decision: queued.decision, feedback: queued.feedback }
			}

			while (true) {
				const queued = drainPending()
				if (queued) {
					if (queued.decision === "changes_requested") {
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
								text: `Ad-hoc review closed with Done — no changes requested. No workflow action needed.`,
							},
						],
					}
				}

				let timedOut = false
				try {
					await waitForSession(session.session_id, 30 * 60 * 1000, signal)
				} catch (err) {
					if (signal?.aborted) throw err
					timedOut = true
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

	// Catch-all for haiku_* names → handleStateTool. Tools with dedicated inline handlers BELOW (haiku_await_visual_answer, haiku_await_design_direction) MUST be excluded here — without an exclusion, every call gets silently swallowed by the state-tool router, which returns "Unknown tool" because it doesn't know about them. That was the original visual-answer bug.
	if (
		name.startsWith("haiku_") &&
		name !== "haiku_await_visual_answer" &&
		name !== "haiku_await_design_direction"
	) {
		return handleStateTool(name, (args ?? {}) as Record<string, unknown>)
	}

	if (name === "open_review") {
		// open_review is blocked — the workflow engine (setOpenReviewHandler) has its own code path.
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
		})

		// Build image URLs for the template (served via /question-image/:sessionId/:index)
		const imageUrls = imagePaths.map(
			(_, i) => `/question-image/${session.session_id}/${i}`,
		)
		void imageUrls

		// Start HTTP server (idempotent)
		const port = await startHttpServer()
		let questionUrl: string
		if (isRemoteReviewEnabled()) {
			const tunnelUrl = await openTunnel(port)
			questionUrl = buildReviewUrl(session.session_id, tunnelUrl, "question")
		} else {
			questionUrl = `http://127.0.0.1:${port}/question/${session.session_id}`
		}

		// Single blocking call: launch the browser best-effort, then
		// wait for the user's answer inline. The agent sees ONE tool
		// call, not a "URL + call await" two-step. haiku_await_visual_answer
		// stays as a resume entry point but isn't part of the canonical
		// flow.
		launchBrowserBestEffort(questionUrl, "Question session")
		return await awaitVisualAnswerSession(session.session_id, {
			url: questionUrl,
			signal,
		})
	}

	if (name === "haiku_await_visual_answer") {
		// Resume / recovery entry point. Canonical flow inlines the
		// await into ask_user_visual_question itself — this tool exists
		// for the case where the original create call was discarded
		// (MCP host timeout, agent restart) and the agent needs to
		// re-attach to a still-pending session.
		const a = (args ?? {}) as Record<string, unknown>
		const visualInputErr = validateToolInput(
			a,
			validateHaikuAwaitVisualAnswerInputSchema,
			"haiku_await_visual_answer",
		)
		if (visualInputErr) return visualInputErr
		const validated = a as HaikuAwaitVisualAnswerInput
		const sessionId = validated.session_id
		const autoOpen = validated.auto_open !== false
		const url = validated.url ?? ""
		const existing = getSession(sessionId)
		if (!existing || existing.session_type !== "question") {
			return {
				content: [
					{
						type: "text" as const,
						text: `Question session ${sessionId} not found or wrong type — call ask_user_visual_question to create a new one.`,
					},
				],
				isError: true,
			}
		}

		if (autoOpen && url) launchBrowserBestEffort(url, "Question session")
		return await awaitVisualAnswerSession(sessionId, { url, signal })
	}

	if (name === "pick_design_direction") {
		const input = PickDesignDirectionInput.parse(args)
		const _title = input.title ?? "Design Direction"

		// Resolve archetypes: inline, from file, or empty (intake mode).
		// Empty is the intake-first path: the agent calls this tool with
		// no archetypes to ask the user whether they have designs to
		// upload. If they upload, the picker submits `mode: "upload"` and
		// the workflow surfaces the file paths on the next tick. If they
		// click "generate for me," the picker submits `mode: "generate"`
		// and the agent produces archetypes and re-opens the picker.
		// This avoids burning generation tokens before we know the user
		// has nothing to upload.
		let archetypes: DesignArchetypeData[] = []
		if (input.archetypes) {
			archetypes = input.archetypes
		} else if (input.archetypes_file) {
			// `archetypes_file` is agent-controlled. Acceptable in the
			// current local threat model — the Claude Code agent already
			// has full filesystem access, so this read is no
			// privilege-escalation. TODO: scope to the active intent
			// directory if this MCP server is ever exposed remotely
			// (tunnel mode) so a prompt-injected agent cannot exfiltrate
			// arbitrary files.
			const raw = await readFile(resolve(input.archetypes_file), "utf-8")
			archetypes = z.array(DesignArchetypeSchema).parse(JSON.parse(raw))
		}
		// else: intake mode (empty archetypes) — UI shows upload + generate
		// affordances only.

		const session = createDesignDirectionSession({
			intent_slug: input.intent_slug,
			archetypes,
		})

		const port = await startHttpServer()
		let directionUrl: string
		if (isRemoteReviewEnabled()) {
			const tunnelUrl = await openTunnel(port)
			directionUrl = buildReviewUrl(session.session_id, tunnelUrl, "direction")
		} else {
			directionUrl = `http://127.0.0.1:${port}/direction/${session.session_id}`
		}

		// Single blocking call: launch the browser best-effort, then
		// wait for the user's selection inline. The agent sees ONE tool
		// call instead of "post URL + call haiku_await_design_direction".
		// haiku_await_design_direction stays for the resume case (MCP
		// host timeout, agent restart) but isn't part of the canonical
		// flow.
		launchBrowserBestEffort(directionUrl, "Direction session")
		return await awaitDesignDirectionSession(session.session_id, {
			url: directionUrl,
			intentSlug: input.intent_slug,
			signal,
		})
	}

	if (name === "haiku_await_design_direction") {
		// Resume / recovery entry point. Canonical flow inlines the
		// await into pick_design_direction itself.
		const a = (args ?? {}) as Record<string, unknown>
		const directionInputErr = validateToolInput(
			a,
			validateHaikuAwaitDesignDirectionInputSchema,
			"haiku_await_design_direction",
		)
		if (directionInputErr) return directionInputErr
		const validated = a as HaikuAwaitDesignDirectionInput
		const sessionId = validated.session_id
		const autoOpen = validated.auto_open !== false
		const url = validated.url ?? ""
		const existing = getSession(sessionId)
		if (!existing || existing.session_type !== "design_direction") {
			return {
				content: [
					{
						type: "text" as const,
						text: `Design-direction session ${sessionId} not found or wrong type — call pick_design_direction to create a new one.`,
					},
				],
				isError: true,
			}
		}
		const intentSlug = validated.intent_slug ?? existing.intent_slug ?? ""
		if (autoOpen && url) launchBrowserBestEffort(url, "Direction session")
		return await awaitDesignDirectionSession(sessionId, {
			url,
			intentSlug,
			signal,
		})
	}

	return {
		content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
		isError: true,
	}
}

/**
 * Two-step gate review protocol — replaces the previous
 * `createReviewGateHandler` callback that wrapped session-create +
 * blocking-wait in a single MCP tool call.
 *
 * Step 1 — `prepareGateReviewSession` (non-blocking): create the
 *   review session, build the URL, return both. Called by
 *   `haiku_run_next` when the workflow engine reports `gate_review`,
 *   so the orchestrator can surface the URL to the agent → user.
 *   Essential for headless / SSH / web-client setups, and for remote
 *   control where the MCP host can't auto-open the user's browser.
 *
 * Step 2 — `awaitGateReviewSession` (blocking): take a session ID,
 *   open the browser best-effort, block on `waitForSession`, return
 *   the user's raw decision. Called by `haiku_await_gate`. Cleanup
 *   (WS close, tunnel close, session delete) lives in the finally so
 *   it always runs.
 */
export type GateMeta = {
	gateContext?: string
	stage?: string
	nextStage?: string | null
	nextPhase?: string | null
}

export type GateReviewPrepared = {
	session_id: string
	review_url: string
	use_remote: boolean
	/** True when an existing live SPA tab was reused for this gate
	 *  instead of minting a new session. The agent's gate_review prompt
	 *  uses this to skip the "post URL to user" instruction — they're
	 *  already on it. */
	reused: boolean
	/** True when the SPA's heartbeat is fresh enough that we believe
	 *  the user is actively watching the tab. Implies reused=true. */
	browser_attached: boolean
}

export type GateReviewDecision = {
	decision: string
	feedback: string
	annotations?: ReviewAnnotations
}

export async function prepareGateReviewSession(
	intentDirRel: string,
	gateType: string | undefined,
	gateMeta: GateMeta | undefined,
): Promise<GateReviewPrepared> {
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
	const criteria = criteriaSection ? parseCriteria(criteriaSection.content) : []

	// Reuse: if a live SPA tab is already open on this intent (presence
	// not lost), reuse it across gate cycles. Same session_id, same URL.
	// We refresh the parsed data + gate_meta so the SPA renders the
	// current stage, then return. The browser stays put, no new tab.
	const reusable = findLiveReviewSessionForIntent(intent.slug)
	const session =
		reusable ??
		createSession({
			intent_dir: intentDirAbs,
			intent_slug: intent.slug,
			gate_type: gateType,
			target: "",
		})

	// gate_meta refreshes on every prepare, whether reuse or new. The
	// SPA's Approve button label is computed from these fields, so they
	// must reflect the CURRENT gate, not whatever the previous gate
	// cycle set them to.
	if (gateType !== undefined) session.gate_type = gateType
	if (gateMeta?.gateContext) session.gate_context = gateMeta.gateContext
	if (gateMeta?.stage) session.stage = gateMeta.stage
	if (gateMeta?.nextStage !== undefined) session.next_stage = gateMeta.nextStage
	if (gateMeta?.nextPhase !== undefined) session.next_phase = gateMeta.nextPhase
	// Clear any stale pending_decision from the previous gate cycle —
	// the user shouldn't have a queued "approved" from the design stage
	// auto-consumed by the development stage's gate.
	if (reusable && session.pending_decision) {
		session.pending_decision = null
	}

	// Per-unit output previews + the inverse "declared by" map — see
	// helper notes in buildSessionOutputMeta. Built after the session
	// exists (the URL helper needs the session id).
	const { unitOutputs, outputDeclaredBy } = await buildSessionOutputMeta(
		intentDirAbs,
		session.session_id,
		units,
	)

	Object.assign(session, {
		parsedIntent: intent,
		parsedUnits: units,
		parsedCriteria: criteria,
		parsedMermaid: mermaid,
		unitOutputs,
		outputDeclaredBy,
	})

	const prevSnapshot = getPreviousReviewSnapshot(intentDirAbs)
	if (prevSnapshot) session.previousReview = prevSnapshot

	const stageStates = await parseStageStates(intentDirAbs)
	const knowledgeFiles = await parseKnowledgeFiles(intentDirAbs)
	const stageArtifacts = await parseStageArtifacts(intentDirAbs)
	const outputArtifacts = await parseOutputArtifacts(intentDirAbs)

	// Rewrite every relativePath (not just images) to a tunnel URL so
	// click-out links work for HTML, file, and image types alike.
	// Preserve the original intent-relative path on
	// `intentRelativePath` so the SPA can look the artifact up in
	// `output_declared_by`.
	for (const oa of outputArtifacts) {
		if (oa.relativePath) {
			oa.intentRelativePath = oa.relativePath
			oa.relativePath = buildStageArtifactUrl(
				session.session_id,
				oa.relativePath,
			)
		}
	}

	Object.assign(session, {
		stageStates,
		knowledgeFiles,
		stageArtifacts,
		outputArtifacts,
	})

	void mermaid

	const port = await startHttpServer()
	const useRemote = isRemoteReviewEnabled()
	const reviewUrl = useRemote
		? buildReviewUrl(session.session_id, await openTunnel(port), "intent")
		: `http://127.0.0.1:${port}/review/${session.session_id}`

	const reused = reusable !== undefined
	const browser_attached = reused && isBrowserAttached(session.session_id)

	// Broadcast: any SPA tab already on this intent's channel will get
	// the new gate context (stage, gate_context, review_url). This is
	// what makes the live-session UX work — when the workflow ticks
	// from execute → review → gate, the tab refreshes into the gate
	// view without polling.
	broadcastIntent(intent.slug, {
		type: "gate_prepared",
		session_id: session.session_id,
		stage: gateMeta?.stage ?? session.stage ?? "",
		gate_context: gateMeta?.gateContext ?? session.gate_context ?? "stage_gate",
		review_url: reviewUrl,
		browser_attached,
	})

	return {
		session_id: session.session_id,
		review_url: reviewUrl,
		use_remote: useRemote,
		reused,
		browser_attached,
	}
}

// Exported for unit testing — the spawn-based browser launch is hard to assert against directly.
export function shouldLaunchReviewBrowser(
	autoOpen: boolean,
	reviewUrl: string | undefined,
	sessionId: string,
): boolean {
	if (!autoOpen) return false
	if (!reviewUrl) return false
	if (isBrowserAttached(sessionId)) return false
	return true
}

export async function awaitGateReviewSession(
	sessionId: string,
	opts: {
		autoOpen?: boolean
		signal?: AbortSignal
		reviewUrl?: string
		timeoutMs?: number
	} = {},
): Promise<GateReviewDecision> {
	const {
		autoOpen = true,
		signal,
		reviewUrl,
		timeoutMs = 30 * 60 * 1000,
	} = opts
	const existing = getSession(sessionId)
	if (!existing || existing.session_type !== "review") {
		throw new Error(
			`Gate review session ${sessionId} not found or wrong type — call haiku_run_next to recreate.`,
		)
	}

	// Deliberately NOT calling bindSessionCancellation here — gate-review
	// sessions outlive the tool call, so an abort on the await tool
	// (user Ctrl-C, MCP client reconnect, timeout retry) must not kill
	// the SPA's WebSocket. The waitForSession call below already
	// propagates `signal` to unwind the await promptly; the SPA stays
	// connected and the next agent tick can call haiku_await_gate
	// again.
	if (shouldLaunchReviewBrowser(autoOpen, reviewUrl, sessionId)) {
		launchBrowserBestEffort(reviewUrl as string, "Review gate")
	}

	// Drain queued decision on entry. The SPA may have submitted while
	// no await was open (e.g., user reviewed and clicked before the
	// agent ticked back to gate_review). pending_decision is the
	// canonical signal — populated by handleWebSocketMessage on every
	// `decide` frame, regardless of await state.
	if (existing.pending_decision) {
		const queued = existing.pending_decision
		updateSession(sessionId, {
			pending_decision: null,
			last_await_started_at: new Date().toISOString(),
			last_await_ended_at: new Date().toISOString(),
			await_count: (existing.await_count ?? 0) + 1,
		})
		broadcastIntent(existing.intent_slug, {
			type: "pending_decision_changed",
			session_id: sessionId,
			queued: false,
		})
		return {
			decision: queued.decision,
			feedback: queued.feedback,
			annotations: queued.annotations,
		}
	}

	// Mark this await as active. The SPA reads await_active to decide
	// whether the Approve button is enabled — it's only meaningful to
	// approve while a tool call is actually waiting on a decision.
	const startedAt = new Date().toISOString()
	const priorCount = existing.await_count ?? 0
	updateSession(sessionId, {
		await_active: true,
		await_count: priorCount + 1,
		last_await_started_at: startedAt,
	})
	broadcastIntent(existing.intent_slug, {
		type: "await_state_changed",
		session_id: sessionId,
		await_active: true,
	})

	try {
		while (true) {
			let timedOut = false
			try {
				await waitForSession(sessionId, timeoutMs, signal)
			} catch (err) {
				if (signal?.aborted) throw err
				timedOut = true
			}

			const updated = getSession(sessionId)
			if (
				updated &&
				updated.session_type === "review" &&
				updated.pending_decision
			) {
				const queued = updated.pending_decision
				updateSession(sessionId, { pending_decision: null })
				return {
					decision: queued.decision,
					feedback: queued.feedback,
					annotations: queued.annotations,
				}
			}

			if (timedOut) break

			if (hasPresenceLost(sessionId)) {
				console.error(
					`[haiku] Review session ${sessionId} lost presence — continuing to wait (no reopen)`,
				)
			}
		}

		throw new Error("Review timeout after 30 minutes")
	} finally {
		// Session, WS, and tunnel persist across awaits — the SPA tab
		// stays open for the duration of the agent session, watching
		// state come and go. Only the await-active flag and timing
		// fields are reset here; cleanup of the session itself happens
		// on TTL eviction, presence-loss sweep, or explicit shutdown.
		updateSession(sessionId, {
			await_active: false,
			last_await_ended_at: new Date().toISOString(),
		})
		broadcastIntent(existing.intent_slug, {
			type: "await_state_changed",
			session_id: sessionId,
			await_active: false,
		})
	}
}

/**
 * Block on a design-direction session until the user submits, then
 * build the MCP response based on which mode they picked
 * (select / regenerate / generate / upload). Used by both the
 * canonical inline path (pick_design_direction) and the resume entry
 * point (haiku_await_design_direction).
 *
 * Durable persistence (state.json + intent.md design_directions[<stage>]
 * + PNG sidecars + uploaded files) lands on the HTTP submit route in
 * session-routes.ts before this function wakes; the response here is
 * just the agent-facing description of what happened.
 */
export async function awaitDesignDirectionSession(
	sessionId: string,
	opts: {
		url?: string
		intentSlug?: string
		signal?: AbortSignal
		timeoutMs?: number
	} = {},
): Promise<{
	content: Array<{ type: "text"; text: string }>
	isError?: boolean
}> {
	const { url = "", intentSlug = "", signal, timeoutMs = 30 * 60 * 1000 } = opts

	try {
		await waitForSession(sessionId, timeoutMs, signal)
	} catch (err) {
		if (signal?.aborted) throw err
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						{
							status: "timeout",
							url,
							session_id: sessionId,
							message:
								"User did not respond within 30 minutes. Call haiku_await_design_direction to keep waiting, or haiku_run_next to advance from durable state if a selection landed.",
						},
						null,
						2,
					),
				},
			],
		}
	}

	const updated = getSession(sessionId)
	if (
		!updated ||
		updated.session_type !== "design_direction" ||
		updated.status !== "answered" ||
		!updated.selection
	) {
		return {
			content: [
				{
					type: "text" as const,
					text: "The user did not select a design direction within the time limit. Ask them how they'd like to proceed.",
				},
			],
		}
	}

	const sel = updated.selection

	if (sel.mode === "regenerate") {
		const totalArchetypes = updated.archetypes?.length ?? 0
		const dropped = Math.max(totalArchetypes - sel.keep.length, 0)
		const announcement =
			sel.keep.length > 0
				? `The user wants more variants. They'd like to keep: **${sel.keep.join("**, **")}**.${sel.comments ? ` Steering notes: ${sel.comments}` : ""}`
				: `The user wants more variants. None of the current archetypes are keepers.${sel.comments ? ` Steering notes: ${sel.comments}` : ""}`
		const nextStep =
			dropped > 0
				? `Generate ${dropped} replacement archetype${dropped === 1 ? "" : "s"} for the dropped slot${dropped === 1 ? "" : "s"} and call \`pick_design_direction\` again with the merged set.`
				: `Generate replacement archetype(s) for the dropped slot(s) and call \`pick_design_direction\` again with the merged set.`
		return {
			content: [
				{
					type: "text" as const,
					text: withAnnouncement(announcement, nextStep),
				},
			],
		}
	}

	if (sel.mode === "generate") {
		const announcement = sel.comments
			? `The user has no existing designs and wants you to generate variants. Steering notes: ${sel.comments}`
			: "The user has no existing designs and wants you to generate variants."
		return {
			content: [
				{
					type: "text" as const,
					text: withAnnouncement(
						announcement,
						"Generate 2-3 distinct archetypes (HTML wireframe snippets — different layouts, interaction patterns, or visual hierarchies) and call `pick_design_direction` again with `archetypes` populated.",
					),
				},
			],
		}
	}

	// Branch enforcement after the up-to-30-min wait, applied to both
	// upload + select paths. Failures are non-fatal — haiku_run_next's
	// own pre-tick guard reconciles on the next call.
	if (intentSlug) {
		try {
			const intentRaw = await readFile(
				join(findHaikuRoot(), "intents", intentSlug, "intent.md"),
				"utf-8",
			)
			const activeStage =
				(parseFrontmatter(intentRaw).data.active_stage as string) || ""
			if (activeStage) {
				const guard = ensureOnStageBranch(intentSlug, activeStage)
				if (!guard.ok) {
					console.warn(
						`[awaitDesignDirectionSession] stage-branch enforcement failed: ${guard.message}`,
					)
				}
			}
		} catch (err) {
			console.warn(
				`[awaitDesignDirectionSession] post-wait branch reconciliation skipped: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}

	if (sel.mode === "upload") {
		const fileLines = sel.files
			.map(
				(f, i) =>
					`  ${i + 1}. \`${f.path}\`${f.caption ? ` — ${f.caption}` : ""}`,
			)
			.join("\n")
		const announceParts = [
			`The user uploaded ${sel.files.length} design file${
				sel.files.length === 1 ? "" : "s"
			} as the chosen direction (no archetype generation needed):`,
			fileLines,
		]
		if (sel.comments) announceParts.push(`Comments: ${sel.comments}`)
		return {
			content: [
				{
					type: "text" as const,
					text: withAnnouncement(
						announceParts.join("\n"),
						"Call `haiku_run_next` to continue — the workflow will surface the upload paths so you can `Read` each file and incorporate the designs into elaboration.",
					),
				},
			],
		}
	}

	// select mode
	const announceParts: string[] = [
		`The user selected the **${sel.archetype}** direction.`,
	]
	if (sel.comments) announceParts.push(`Comments: ${sel.comments}`)
	if (sel.annotations?.pins?.length) {
		announceParts.push(`Pin annotations (${sel.annotations.pins.length}):`)
		for (const pin of sel.annotations.pins) {
			announceParts.push(
				`  - [${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%]: ${pin.text || "(no text)"}`,
			)
		}
	}
	return {
		content: [
			{
				type: "text" as const,
				text: withAnnouncement(
					announceParts.join("\n"),
					"Call `haiku_run_next` to continue — the workflow will surface any screenshot annotations the user attached.",
				),
			},
		],
	}
}

type VisualAnswerContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string }

/**
 * Block on a question session until the user answers, then build the
 * MCP response (text + image blocks for any screenshot annotations).
 * Mirrors awaitGateReviewSession's drain-on-entry / loop-on-spurious
 * pattern. Used by both the canonical inline path
 * (ask_user_visual_question) and the resume entry point
 * (haiku_await_visual_answer).
 */
export async function awaitVisualAnswerSession(
	sessionId: string,
	opts: { url?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ content: VisualAnswerContent[]; isError?: boolean }> {
	const { url = "", signal, timeoutMs = 30 * 60 * 1000 } = opts

	const buildAnsweredResponse = (): {
		content: VisualAnswerContent[]
	} | null => {
		const updated = getSession(sessionId)
		if (
			!updated ||
			updated.session_type !== "question" ||
			updated.status !== "answered" ||
			!updated.answers
		) {
			return null
		}
		const annotationsForJson: Record<string, unknown> = {}
		const ann = updated.annotations
		if (ann?.comments?.length) annotationsForJson.comments = ann.comments
		if (ann?.pins?.length) annotationsForJson.pins = ann.pins
		if (ann?.screenshots?.length)
			annotationsForJson.screenshot_count = ann.screenshots.length
		const questionResult: Record<string, unknown> = {
			status: "answered",
			url,
			answers: updated.answers,
			message: withAnnouncement(
				"The user answered your visual question — see the `answers` field below.",
				"Acknowledge their answer in chat and continue with whatever the answer enables.",
			),
		}
		if (updated.feedback) {
			questionResult.feedback = updated.feedback
		}
		if (Object.keys(annotationsForJson).length > 0) {
			questionResult.annotations = annotationsForJson
		}
		const content: VisualAnswerContent[] = [
			{
				type: "text" as const,
				text: JSON.stringify(questionResult, null, 2),
			},
		]
		const screenshots = ann?.screenshots ?? []
		if (screenshots.length > 0) {
			content.push({
				type: "text" as const,
				text: `\n${screenshots.length} screenshot annotation${screenshots.length === 1 ? "" : "s"} attached below — each pair is the reviewer's note + the captured surface they were drawing on.`,
			})
			for (let i = 0; i < screenshots.length; i++) {
				const s = screenshots[i]
				content.push({
					type: "text" as const,
					text: `\nAnnotation ${i + 1} (image ${s.image_index + 1}): ${s.comment}`,
				})
				const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(
					s.screenshot_data_url,
				)
				if (match) {
					content.push({
						type: "image" as const,
						mimeType: match[1],
						data: match[2],
					})
				} else {
					content.push({
						type: "text" as const,
						text: `(screenshot for annotation ${i + 1} could not be decoded)`,
					})
				}
			}
		}
		return { content }
	}

	const drained = buildAnsweredResponse()
	if (drained) return drained

	const deadline = Date.now() + timeoutMs
	const timeoutMessage =
		"User did not respond within 30 minutes. Call haiku_await_visual_answer to keep waiting, or ask_user_visual_question to start a new session."
	while (true) {
		const remaining = deadline - Date.now()
		if (remaining <= 0) break
		try {
			await waitForSession(sessionId, remaining, signal)
		} catch (err) {
			if (signal?.aborted) throw err
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								status: "timeout",
								session_id: sessionId,
								...(url ? { url } : {}),
								message: timeoutMessage,
							},
							null,
							2,
						),
					},
				],
			}
		}
		const ready = buildAnsweredResponse()
		if (ready) return ready
		// Spurious wake — re-enter wait against remaining deadline.
	}

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(
					{
						status: "timeout",
						session_id: sessionId,
						...(url ? { url } : {}),
						message: timeoutMessage,
					},
					null,
					2,
				),
			},
		],
	}
}
