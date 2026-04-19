// orchestrator.ts — H·AI·K·U stage loop orchestration
//
// Deterministic FSM driver. `runNext()` reads state, determines the next
// action, performs the state mutation as a side effect, and returns the action
// to the agent. The agent only calls `haiku_run_next` to advance — it never
// mutates stage/intent state directly.
//
// Primary tool: haiku_run_next { intent }
// Returns an action object the agent follows.

import { execFileSync, execSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { features, resolvePluginRoot } from "./config.js"
import { computeWaves, topologicalSort } from "./dag.js"
import {
	branchExists,
	consolidateStageBranches,
	createIntentBranch,
	cleanupIntentWorktrees,
	createStageBranch,
	createUnitWorktree,
	deleteStageBranch,
	ensureOnStageBranch,
	finalizeIntentBranches,
	getMainlineBranch,
	isBranchMerged,
	isOnIntentBranch,
	isOnStageBranch,
	mergeStageBranchForward,
	mergeStageBranchIntoMain,
	prepareRevisitBranch,
} from "./git-worktree.js"
import { adaptInstructions } from "./harness-instructions.js"
import { getCapabilities } from "./harness.js"
import { type ModelTier, resolveModel } from "./model-selection.js"
import { validateIdentifier } from "./prompts/helpers.js"
import { reportError } from "./sentry.js"
import { getSessionIntent, logSessionEvent } from "./session-metadata.js"
import { writeSubagentPrompt } from "./subagent-prompt-file.js"
import {
	sanitizeForContext,
	sealIntentState,
	verifyIntentState,
} from "./state-integrity.js"
import {
	MAX_STAGE_ITERATIONS,
	appendStageIteration,
	closeCurrentStageIteration,
	countPendingFeedback,
	findHaikuRoot,
	getStageIterationCount,
	gitCommitState,
	intentDir,
	intentTitleNeedsRepair,
	isGitRepo,
	parseFrontmatter,
	readFeedbackFiles,
	readJson,
	setFrontmatterField,
	setRunNextHandler,
	stageStatePath,
	syncSessionMetadata,
	timestamp,
	validateBranch,
	validateSlugArgs,
	writeFeedbackFile,
	writeJson,
} from "./state-tools.js"
import {
	listStudios,
	readHatDefs,
	readPhaseOverride,
	readReviewAgentPaths,
	readStageArtifactDefs,
	readStageDef,
	readStudio,
	resolveStageInputs,
	resolveStudio,
	studioSearchPaths,
} from "./studio-reader.js"
import { emitTelemetry } from "./telemetry.js"
import type { DAGGraph } from "./types.js"

// ── Path helpers ───────────────────────────────────────────────────────────

/**
 * Resolve a studio-scoped file path. Returns the first existing path found in
 * the studio search order (project overrides plugin), or null if nothing matches.
 * The path returned is what a subagent should open — NOT the file content.
 */
function resolveStudioFilePath(subpath: string): string | null {
	for (const base of studioSearchPaths()) {
		const full = join(base, subpath)
		if (existsSync(full)) return full
	}
	return null
}

/**
 * Compact feedback summary for orchestrator action responses.
 * Returns id/title/origin/author/status + file path — NO body.
 * Callers MUST read the file to understand the finding; a preview here
 * invites shortcut-thinking and missing critical detail in the body.
 */
function summarizeFeedback(f: {
	id: string
	title: string
	origin: string
	author: string
	status: string
	file: string
}) {
	return {
		feedback_id: f.id,
		title: f.title,
		status: f.status,
		origin: f.origin,
		author: f.author,
		file: f.file,
	}
}

/**
 * Guardrails for agent-invoked stage iterations. When `appendStageIteration`
 * flags `exceeded` (> MAX_STAGE_ITERATIONS) or `loopDetected` (same feedback
 * signature as the previous iteration), return an `escalate` action so the
 * parent agent stops the autonomous loop and surfaces the situation to the
 * human. User-invoked revisits (`trigger: "user-revisit"`) never hit these
 * guards — explicit human intent always wins.
 */
function maybeEscalate(
	slug: string,
	stage: string,
	iter: {
		count: number
		exceeded: boolean
		loopDetected: boolean
		signature: string
	},
	trigger: "feedback" | "external-changes",
	pendingItems: Array<{ feedback_id: string; title: string }> = [],
): OrchestratorAction | null {
	if (!iter.exceeded && !iter.loopDetected) return null

	const reason = iter.exceeded
		? "iteration_limit"
		: "loop_detected"
	const message = iter.exceeded
		? `Stage '${stage}' has exceeded ${MAX_STAGE_ITERATIONS} agent-invoked iterations (now at ${iter.count}). The autonomous loop has stopped — a human must decide whether to keep pushing, reject feedback items, split the work, or terminate the intent. Use \`haiku_revisit { intent: "${slug}" }\` (user-invoked, uncapped) to force another cycle, \`haiku_feedback_reject\` to dismiss specific items, or mark the stage complete manually.`
		: `Stage '${stage}' is in a loop: iteration ${iter.count}'s feedback set is the same as the previous iteration's. The agent keeps regenerating identical findings, which usually means the spec is wrong or the criteria are unreachable. A human must intervene — adjust the feedback items, relax the criteria, or terminate the intent.`

	emitTelemetry("haiku.stage.escalate", {
		intent: slug,
		stage,
		reason,
		iteration: String(iter.count),
		trigger,
		signature: iter.signature,
	})

	return {
		action: "escalate",
		intent: slug,
		stage,
		reason,
		trigger,
		iteration: iter.count,
		max_iterations: MAX_STAGE_ITERATIONS,
		signature: iter.signature,
		pending_items: pendingItems,
		message,
	}
}

/**
 * Instruction text for the elaborate action's message field.
 * Tells the caller WHAT to do — read every feedback file, draft units with
 * `closes:`, ask the user when trade-offs are unclear. Deliberately does NOT
 * prescribe HOW (no subagent-delegation guidance) — the parent decides how to
 * structure the work within its own context.
 */
function buildElaboratorInstruction(opts: {
	visits: number
	pendingFeedbackCount: number
	stage: string
	situation?: string
}) {
	const { visits, pendingFeedbackCount, stage, situation } = opts
	const lead =
		visits > 0
			? `Revisit elaborate (visit ${visits}) for stage '${stage}'. ${pendingFeedbackCount} pending feedback item(s) must be addressed with new units.`
			: `Elaborate stage '${stage}' into units with completion criteria.`

	const body = [
		"",
		"Inputs (read each file directly — do not trust titles alone):",
		"- every `pending_feedback[].file` in this action's payload",
		"- `stage_metadata` (STAGE.md body + review agents)",
		"- `completed_units` (the stage's prior units, read-only reference)",
		"- the intent's `intent.md` for overall goals",
		"",
		"Responsibilities:",
		"- Read every `pending_feedback[].file` COMPLETELY. The title is only a handle; the body carries requirements, tests, and acceptance criteria.",
		"- Draft one or more new units whose `closes:` frontmatter references the feedback items they resolve.",
		"- Every pending feedback item MUST be referenced by at least one new unit's `closes:` (orphans block advancement).",
		"- Ask the user clarifying questions (`AskUserQuestion` with options[]) when trade-offs are unclear; iterate across turns.",
		"- When the user approves the drafted units, call `haiku_run_next` to advance.",
	].join("\n")

	return situation ? `${lead}\n\n${situation}${body}` : `${lead}${body}`
}

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

// ── Studio resolution ──────────────────────────────────────────────────────

function resolveStudioStages(studio: string): string[] {
	// Accept any identifier (dir, name, slug, alias); falls back to direct lookup
	// for robustness with legacy callers that pass a dir name already.
	const info = resolveStudio(studio)
	if (info) return info.stages
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const studioFile = join(base, studio, "STUDIO.md")
		if (existsSync(studioFile)) {
			const fm = readFrontmatter(studioFile)
			return (fm.stages as string[]) || []
		}
	}
	return []
}

function resolveStageHats(studio: string, stage: string): string[] {
	// Accept any identifier (dir, name, slug, alias); falls back to raw arg
	// for robustness when the studio cache isn't warm yet.
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			return (fm.hats as string[]) || []
		}
	}
	return []
}

/** Build the subagent prompt for the auto-injected `feedback-assessor` hat.
 *  The assessor's job is independent verification of the unit's `closes:`
 *  claims — it reads every feedback body and every output the unit produced,
 *  then decides whether each claim actually resolves the finding. On
 *  approve: FSM promotes each FB item's status to `closed`/`addressed` and
 *  the unit completes. On reject: the unit bolts back to the first hat with
 *  a reason naming the specific unresolved items. */
function buildFeedbackAssessorPrompt(opts: {
	slug: string
	studio: string
	stage: string
	unit: string
	bolt: number
	worktreePath: string
	intentRoot: string
	unitAbsPath: string
	closes: string[]
	feedbackFiles: Array<{ id: string; file: string }>
	unitOutputs: string[]
}): string {
	const {
		slug,
		stage,
		unit,
		bolt,
		worktreePath,
		intentRoot,
		unitAbsPath,
		closes,
		feedbackFiles,
		unitOutputs,
	} = opts
	const lines: string[] = []
	lines.push(
		`You are the **feedback-assessor** hat for unit **${unit}** (bolt ${bolt}) in stage **${stage}** of intent **${slug}**.`,
		"",
		"## Role",
		"",
		"You are the independent verifier. The prior hats produced work claiming to close specific feedback items. You decide — by reading the feedback bodies and the unit's actual outputs — whether each claimed closure is valid. The designer/reviewer cannot self-certify; that is why this hat exists.",
		"",
	)
	if (worktreePath) {
		lines.push(
			`**Unit worktree:** \`${worktreePath}\` (intent dir: \`${intentRoot}\`). Read and write at this path — it contains prior-hat commits not yet merged. You do not need to change your working directory; use the absolute paths below.`,
			"",
		)
	}
	lines.push(
		"## Required reading",
		"",
		`- Unit spec (for \`closes:\` array + output list) — \`${unitAbsPath}\``,
	)
	for (const out of unitOutputs) {
		lines.push(`- Unit output — \`${join(intentRoot, out)}\``)
	}
	lines.push("", "## Feedback items the unit claims to close", "")
	for (const fb of feedbackFiles) {
		lines.push(
			`- **${fb.id}** — \`${join(intentRoot, fb.file)}\` (read the full body)`,
		)
	}
	if (closes.length === 0) {
		lines.push(
			"- _(none — this assessor was spawned but the unit has no `closes:` references; advance immediately)_",
		)
	}
	lines.push(
		"",
		"## Assessment procedure",
		"",
		"For each feedback item above:",
		"1. Read the feedback body in full. Extract the concrete requirement(s) it is asserting must change.",
		"2. Read the unit's outputs listed above (or glob the unit's artifacts dir if not listed).",
		"3. Judge independently: does the output *demonstrably* resolve the finding? Be strict — a partial gesture is not a fix.",
		"4. Record your verdict per feedback item: **closed** (resolved) or **still-pending** (not resolved, with a specific reason).",
		"",
		"## Outcome",
		"",
		`- **All items closed:** call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unit}" }\`. The FSM will promote each feedback item to \`closed\` (agent-authored) or \`addressed\` (human-authored) automatically.`,
		`- **Any still-pending:** call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unit}", reason: "<which items aren't closed and why>" }\`. The unit bolts back to the first hat. The failing feedback items stay \`pending\` — they will be re-addressed on the next bolt.`,
		"",
		"## Guardrails",
		"",
		"- Do NOT edit any artifacts. You verify only.",
		"- Do NOT call `haiku_feedback_update` yourself — advance_hat does the status promotion atomically.",
		"- Be specific in reject reasons: name each feedback id (FB-NN) that isn't closed and one-line why.",
		"- Trust the unit's output list but also scan the artifacts directory — if a claimed close hinges on an artifact the unit didn't list, flag it.",
	)
	return lines.join("\n")
}

/** Append `feedback-assessor` as the terminal hat when a unit declares
 *  `closes:` items. Mirrors state-tools.ts's resolveUnitHats. */
function resolveUnitHatsInStudio(
	studio: string,
	stage: string,
	slug: string,
	unit: string,
): string[] {
	const stageHats = resolveStageHats(studio, stage)
	const dir = intentDir(slug)
	const unitFile = join(
		dir,
		"stages",
		stage,
		"units",
		unit.endsWith(".md") ? unit : `${unit}.md`,
	)
	if (!existsSync(unitFile)) return stageHats
	try {
		const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
		const closes = (data.closes as string[]) || []
		if (closes.length > 0 && !stageHats.includes("feedback-assessor")) {
			return [...stageHats, "feedback-assessor"]
		}
	} catch {
		/* non-fatal */
	}
	return stageHats
}

function resolveStageReview(studio: string, stage: string): string {
	// Accept any identifier (dir, name, slug, alias); falls back to raw arg
	// for robustness when the studio cache isn't warm yet.
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			const review = fm.review
			// Return every declared review kind joined with commas so downstream
			// callers (which use `.includes("external")`, `.includes("ask")`, etc.)
			// see all kinds. Previously this collapsed `[external, ask]` to just
			// `"external"`, silently dropping the "ask" half of the gate.
			if (Array.isArray(review)) return (review as string[]).join(",")
			return (review as string) || "auto"
		}
	}
	return "auto"
}

/** Does the stage's `review:` field contain the given kind (e.g. "external")?
 *  Handles both scalar and array forms. Used to detect external-review stages
 *  that need branch isolation regardless of intent mode.
 *
 *  Resolves the studio identifier through `resolveStudio` first so callers can
 *  pass the canonical name, slug, or alias — not just the directory name. If
 *  resolveStudio returns null, falls back to using the identifier directly (for
 *  robustness when called during bootstrap before the studio cache is warm). */
function stageReviewIncludes(
	studio: string,
	stage: string,
	kind: string,
): boolean {
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			const review = fm.review
			if (Array.isArray(review)) return (review as unknown[]).includes(kind)
			return review === kind
		}
	}
	return false
}

function resolveStageMetadata(
	studio: string,
	stage: string,
): { description: string; body: string } | null {
	// Accept any identifier (dir, name, slug, alias); falls back to raw arg
	// for robustness when the studio cache isn't warm yet.
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const raw = readFileSync(stageFile, "utf8")
			const fm = readFrontmatter(stageFile)
			const { content } = matter(raw)
			return {
				description: (fm.description as string) || stage,
				body: content.trim(),
			}
		}
	}
	return null
}

// ── External review detection ─────────────────────────────────────────────
//
// Two-tier signal detection for external/await gates:
//
// Tier 1: Branch merge detection (structural). In git workflows, external
//   review gates use a stage branch (`haiku/{slug}/{stage}`) that gets merged
//   into the intent hub (`haiku/{slug}/main`) when the review is approved.
//   `isBranchMerged()` detects this — including squash merges. This is the
//   primary, tamper-resistant signal: the merge is a structural fact, not
//   something the agent can self-assert.
//
// Tier 2: URL-based CLI probing (fallback). The orchestrator shells out to
//   `gh` or `glab` to check PR/MR status when a review URL was recorded.
//   Used when branch detection is unavailable (non-git workflows) or as a
//   secondary check. Supports GitHub `reviewDecision` and GitLab `approved`.
//
// The agent never self-approves gates. If neither tier detects approval,
// the orchestrator returns `awaiting_external_review` and the user must
// run `/haiku:pickup` after the external review is actually approved.

/**
 * Tier 2 (fallback): URL-based synchronous check of external review state.
 * Supports GitHub PRs (gh) and GitLab MRs (glab). Returns a structured
 * `ExternalReviewState` so the orchestrator can distinguish approved,
 * changes-requested, pending, and unknown states.
 *
 * For GitHub: checks `reviewDecision` (APPROVED / CHANGES_REQUESTED /
 * REVIEW_REQUIRED) and `state` (MERGED = already accepted).
 *
 * For GitLab: checks approval status, merge state, and non-approved open MRs.
 */
/**
 * Result from checking external review state.
 * `status` describes the review state:
 *   - `approved`          — reviews approved or PR/MR merged
 *   - `changes_requested` — reviewer requested changes
 *   - `pending`           — no definitive review decision yet
 *   - `unknown`           — CLI not available, network error, or unrecognised URL
 */
export interface ExternalReviewState {
	status: "approved" | "changes_requested" | "pending" | "unknown"
	provider?: "github" | "gitlab"
	url?: string
}

export function checkExternalState(url: string): ExternalReviewState {
	try {
		if (url.includes("github.com") && url.includes("/pull/")) {
			// GitHub PR — check review decision AND merge state (argument array avoids shell injection)
			const output = execFileSync(
				"gh",
				[
					"pr",
					"view",
					url,
					"--json",
					"state,reviewDecision",
					"-q",
					"[.state, .reviewDecision]",
				],
				{ encoding: "utf8", stdio: "pipe", timeout: 15000 },
			).trim()
			const parsed = JSON.parse(output) as [string, string]
			const [state, reviewDecision] = parsed
			if (state === "MERGED" || reviewDecision === "APPROVED") {
				return { status: "approved", provider: "github", url }
			}
			if (reviewDecision === "CHANGES_REQUESTED") {
				return { status: "changes_requested", provider: "github", url }
			}
			// REVIEW_REQUIRED, COMMENTED, or empty — no definitive decision yet
			return { status: "pending", provider: "github", url }
		}
		if (url.includes("gitlab") && url.includes("/merge_requests/")) {
			// GitLab MR — check via glab CLI (argument array avoids shell injection)
			const output = execFileSync(
				"glab",
				["mr", "view", url, "--output", "json"],
				{ encoding: "utf8", stdio: "pipe", timeout: 15000 },
			).trim()
			const mr = JSON.parse(output) as {
				state?: string
				approved?: boolean
			}
			if (mr.state === "merged" || mr.approved === true) {
				return { status: "approved", provider: "gitlab", url }
			}
			// GitLab: approved === false on an open MR means changes requested
			if (mr.state === "opened" && mr.approved === false) {
				return { status: "changes_requested", provider: "gitlab", url }
			}
			return { status: "pending", provider: "gitlab", url }
		}
		// Unknown URL type — can't check via CLI
		return { status: "unknown" }
	} catch {
		// CLI not available, timeout, or network error
		return { status: "unknown" }
	}
}

// ── External changes-requested helper ─────────────────────────────────────

/**
 * Handle the "changes_requested" outcome from an external review.
 * Creates a feedback file, rolls the FSM back to elaborate, emits telemetry,
 * and returns the orchestrator action.
 */
function handleExternalChangesRequested(
	slug: string,
	currentStage: string,
	externalUrl: string,
	provider: "github" | "gitlab" | undefined,
): OrchestratorAction {
	const originType = provider === "gitlab" ? "external-mr" : "external-pr"
	const fbResult = writeFeedbackFile(slug, currentStage, {
		title: "External review requested changes",
		body: `The external review at ${externalUrl} requested changes. Review the PR/MR comments and address the reviewer's feedback before re-submitting for review.`,
		origin: originType,
		author: "user",
		source_ref: externalUrl,
	})
	gitCommitState(
		`feedback: create ${fbResult.feedback_id} from external review in ${currentStage}`,
	)

	// Roll FSM back to elaborate for a revisit cycle
	const statePath = stageStatePath(slug, currentStage)
	const stateData = readJson(statePath)
	stateData.status = "active"
	stateData.phase = "elaborate"
	stateData.gate_outcome = null
	writeJson(statePath, stateData)
	const iterResult = appendStageIteration(
		slug,
		currentStage,
		{
			trigger: "external-changes",
			reason: `External review at ${externalUrl} requested changes`,
			feedbackTitles: [fbResult.feedback_id],
		},
		"external-changes",
	)
	gitCommitState(
		`revisit ${currentStage}: external changes requested (iteration ${iterResult.count})`,
	)

	emitTelemetry("haiku.gate.resolved", {
		intent: slug,
		stage: currentStage,
		gate_type: "external",
		outcome: "changes_requested",
	})

	const escalateResult = maybeEscalate(slug, currentStage, iterResult, "external-changes")
	if (escalateResult) return escalateResult

	return {
		action: "external_changes_requested",
		intent: slug,
		stage: currentStage,
		external_review_url: externalUrl,
		provider,
		feedback_id: fbResult.feedback_id,
		feedback_file: fbResult.file,
		iteration: iterResult.count,
		visits: iterResult.count, // legacy alias — prefer `iteration`
		message: `External review at ${externalUrl} requested changes. Created ${fbResult.feedback_id} and rolled back to elaborate phase (iteration ${iterResult.count}). Address the reviewer's feedback, then call haiku_run_next to continue.`,
	}
}

// ── Output validation ─────────────────────────────────────────────────────

/**
 * Validate that required stage outputs were created during execution.
 * Returns an error action if outputs are missing, null if all present.
 */
function validateStageOutputs(
	slug: string,
	stage: string,
	studio: string,
): OrchestratorAction | null {
	const pluginRoot = resolvePluginRoot()

	// Read output definitions from the stage's outputs/ directory
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const outputsDir = join(base, studio, "stages", stage, "outputs")
		if (!existsSync(outputsDir)) continue

		const outputDefs = readdirSync(outputsDir).filter((f) => f.endsWith(".md"))
		const missing: Array<{ name: string; location: string }> = []

		for (const f of outputDefs) {
			const raw = readFileSync(join(outputsDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			// Skip project-tree outputs (code, deployment configs) — can't validate a specific path
			if (location.startsWith("(")) continue

			// Resolve location with intent slug
			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				// Directory — check at least one file exists
				if (
					!existsSync(absPath) ||
					readdirSync(absPath).filter((e) => e !== ".gitkeep").length === 0
				) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				// Specific file
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "outputs_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to review: ${missing.length} required output(s) not found.\n${missing.map((m) => `- ${m.name}: expected at ${m.location}`).join("\n")}\n\nThe execution phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break // Project-level outputs dir takes precedence over plugin-level (first match wins)
	}

	return null
}

// ── Review feedback writer helper ────────────────────────────────────────

/**
 * Write feedback files from a review-UI changes_requested result.
 * Extracts annotation pins, inline comments, and free-form feedback text
 * into individual feedback files with appropriate origins.
 * Returns the list of created feedback IDs.
 */
function writeReviewFeedbackFiles(
	slug: string,
	stage: string,
	reviewResult: { feedback?: string; annotations?: unknown },
): string[] {
	const createdIds: string[] = []
	const annotations = reviewResult.annotations as
		| {
				pins?: Array<{ x: number; y: number; text: string }>
				comments?: Array<{
					selectedText: string
					comment: string
					paragraph: number
				}>
				screenshot?: string
		  }
		| undefined

	// Walk pins — each becomes a feedback file
	if (annotations?.pins) {
		for (const pin of annotations.pins) {
			if (!pin.text) continue
			const title =
				pin.text.length > 120 ? `${pin.text.slice(0, 117)}...` : pin.text
			const result = writeFeedbackFile(slug, stage, {
				title,
				body: pin.text,
				origin: "user-visual",
				author: "user",
				source_ref: `pin:${pin.x},${pin.y}`,
			})
			createdIds.push(result.feedback_id)
		}
	}

	// Walk inline comments — each becomes a feedback file
	if (annotations?.comments) {
		for (const comment of annotations.comments) {
			if (!comment.comment) continue
			const title =
				comment.comment.length > 120
					? `${comment.comment.slice(0, 117)}...`
					: comment.comment
			const result = writeFeedbackFile(slug, stage, {
				title,
				body: comment.comment,
				origin: "user-visual",
				author: "user",
				source_ref: `paragraph:${comment.paragraph}`,
			})
			createdIds.push(result.feedback_id)
		}
	}

	// Free-form feedback text — one file if non-empty
	if (reviewResult.feedback?.trim()) {
		const fb = reviewResult.feedback.trim()
		const title = fb.length > 120 ? `${fb.slice(0, 117)}...` : fb
		const result = writeFeedbackFile(slug, stage, {
			title,
			body: fb,
			origin: "user-chat",
			author: "user",
		})
		createdIds.push(result.feedback_id)
	}

	if (createdIds.length > 0) {
		gitCommitState(
			`feedback: create ${createdIds.join(", ")} from review UI in ${stage}`,
		)
	}

	return createdIds
}

// ── Output template injection ────────────────────────────────────────────

/**
 * Build a compact output-requirements block.
 * Lists each output artifact's name/location/format + a PATH to the full
 * template (never inlines the template body). Subagent reads the template
 * file directly if it needs the detail — keeps main-agent AND subagent
 * contexts small. Returns "" if no output artifacts are defined.
 */
function buildOutputRequirements(
	studio: string,
	stage: string,
	heading = "## Output Requirements",
): string {
	const artifactDefs = readStageArtifactDefs(studio, stage)
	const outputDefs = artifactDefs.filter((d) => d.kind === "output")
	if (outputDefs.length === 0) return ""
	const parts = [
		heading,
		"Full template bodies live at the paths below — read each one you're expected to produce.",
		"",
	]
	for (const od of outputDefs) {
		// Resolve the template file path for subagent reading
		const templatePath = resolveStudioFilePath(
			join(studio, "stages", stage, "outputs", `${od.name}.md`),
		)
		const pathHint = templatePath ? ` | **Template:** \`${templatePath}\`` : ""
		parts.push(
			`- **${od.name}**${od.required ? " (REQUIRED)" : ""} — location: \`${od.location}\`, format: ${od.format}${pathHint}`,
		)
	}
	return parts.join("\n")
}

// ── Discovery artifact validation ────────────────────────────────────────

/**
 * Validate that required discovery artifacts exist before advancing from elaborate to execute.
 * Reads discovery definitions from studios/{studio}/stages/{stage}/discovery/ and checks
 * that each required artifact exists at its specified location.
 * Returns an error action if artifacts are missing, null if all present.
 */
function validateDiscoveryArtifacts(
	slug: string,
	stage: string,
	studio: string,
): OrchestratorAction | null {
	const pluginRoot = resolvePluginRoot()

	// Read discovery definitions from the stage's discovery/ directory
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const discoveryDir = join(base, studio, "stages", stage, "discovery")
		if (!existsSync(discoveryDir)) continue

		const discoveryDefs = readdirSync(discoveryDir).filter((f) =>
			f.endsWith(".md"),
		)
		const missing: Array<{ name: string; location: string }> = []

		for (const f of discoveryDefs) {
			const raw = readFileSync(join(discoveryDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			// Skip project-tree locations (code, deployment configs) — can't validate a specific path
			if (location.startsWith("(")) continue

			// Resolve location with intent slug
			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				// Directory — check at least one file exists
				if (
					!existsSync(absPath) ||
					readdirSync(absPath).filter((e) => e !== ".gitkeep").length === 0
				) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				// Specific file
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "discovery_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to execution: ${missing.length} required discovery artifact(s) not found.\n${missing.map((m) => `- ${m.name}: expected at ${m.location}`).join("\n")}\n\nThe elaboration phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break // Project-level discovery dir takes precedence over plugin-level (first match wins)
	}

	return null
}

/**
 * Validate unit file naming convention in a stage.
 * Files MUST match `unit-NN-slug.md` (e.g., unit-01-data-model.md).
 * Returns violations or null if all pass.
 */
const UNIT_NAMING_PATTERN = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
function validateUnitNaming(
	intentDirPath: string,
	stage: string,
): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const allFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	if (allFiles.length === 0) return null

	const violations: Array<{ file: string; issue: string }> = []
	const seenNumbers = new Map<number, string>()

	for (const f of allFiles) {
		// Check basic pattern
		if (!UNIT_NAMING_PATTERN.test(f)) {
			// Give a specific hint about what's wrong
			if (!f.startsWith("unit-")) {
				violations.push({ file: f, issue: "must start with 'unit-'" })
			} else if (!/^unit-\d+/.test(f)) {
				violations.push({
					file: f,
					issue:
						"must have a zero-padded number after 'unit-' (e.g., unit-01-...)",
				})
			} else if (!/^unit-\d{2,}/.test(f)) {
				violations.push({
					file: f,
					issue:
						"number must be zero-padded to at least 2 digits (e.g., 01, 02)",
				})
			} else {
				violations.push({
					file: f,
					issue:
						"slug must be kebab-case (lowercase letters, numbers, hyphens). Expected: unit-NN-slug.md",
				})
			}
			continue
		}

		// Check for duplicate numbers
		const numMatch = f.match(/^unit-(\d+)/)
		if (numMatch) {
			const num = Number.parseInt(numMatch[1], 10)
			if (seenNumbers.has(num)) {
				violations.push({
					file: f,
					issue: `duplicate number ${numMatch[1]} (also used by ${seenNumbers.get(num)})`,
				})
			} else {
				seenNumbers.set(num, f)
			}
		}
	}

	if (violations.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_naming_invalid",
			intent: slug,
			stage,
			violations,
			message: `${violations.length} unit file(s) have invalid naming in stage '${stage}'. Files MUST be named \`unit-NN-slug.md\` (e.g., \`unit-01-data-model.md\`):\n\n${violations.map((v) => `- \`${v.file}\`: ${v.issue}`).join("\n")}\n\nRename the files to match the convention, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Unit inputs validation ───────────────────────────────────────────────

/**
 * Validate that all units in a stage have a non-empty `inputs:` field.
 * Every unit must declare what upstream artifacts it references.
 * Returns an error action if any units are missing inputs, null if all pass.
 */
function validateUnitInputs(
	intentDirPath: string,
	stage: string,
): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const unitFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	if (unitFiles.length === 0) return null

	const missing: string[] = []
	for (const f of unitFiles) {
		const fm = readFrontmatter(join(unitsDir, f))
		const status = (fm.status as string) || ""
		if (["complete", "skipped", "failed"].includes(status)) continue
		const inputs = (fm.inputs as string[]) || (fm.refs as string[]) || []
		if (inputs.length === 0) {
			missing.push(f.replace(/\.md$/, ""))
		}
	}

	if (missing.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_inputs_missing",
			intent: slug,
			stage,
			missing_units: missing,
			message: `Cannot advance to execution: ${missing.length} unit(s) have no \`inputs:\` field.\n\nEvery unit MUST declare its inputs — the upstream artifacts, knowledge docs, and prior-stage outputs it references. At minimum, include the intent document and discovery docs.\n\nUnits missing inputs:\n${missing.map((u) => `- ${u}`).join("\n")}\n\nAdd \`inputs:\` to each unit's frontmatter with paths relative to the intent directory (e.g., \`knowledge/DISCOVERY.md\`, \`stages/design/DESIGN-BRIEF.md\`), then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Quality gate runner ───────────────────────────────────────────────────

interface QualityGateResult {
	name: string
	command: string
	dir: string
	exit_code: number
	output: string
}

/**
 * Read quality_gates from intent.md and all unit files in a stage,
 * execute each gate command, and return failures.
 */
function runQualityGates(slug: string, stage: string): QualityGateResult[] {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	// Determine repo root for default cwd
	let repoRoot: string
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", {
			encoding: "utf8",
		}).trim()
	} catch {
		repoRoot = process.cwd()
	}

	// Parse quality_gates from frontmatter using gray-matter (already imported)
	function parseGates(
		filePath: string,
	): Array<{ name: string; command: string; dir: string }> {
		const data = readFrontmatter(filePath)
		const raw = Array.isArray(data.quality_gates) ? data.quality_gates : []
		return raw
			.filter(
				(g: Record<string, unknown>): g is Record<string, string> =>
					!!g?.command,
			)
			.map((g: Record<string, string>) => ({
				name: g.name ?? "",
				command: g.command,
				dir: g.dir ?? "",
			}))
	}

	// Collect gates from intent + all units in this stage
	const allGates = parseGates(intentFile)
	const unitsDir = join(iDir, "stages", stage, "units")
	if (existsSync(unitsDir)) {
		for (const f of readdirSync(unitsDir).filter(
			(f) => f.startsWith("unit-") && f.endsWith(".md"),
		)) {
			allGates.push(...parseGates(join(unitsDir, f)))
		}
	}

	// Deduplicate by command+dir (same command in different dirs is legitimate in monorepos)
	const seen = new Set<string>()
	const uniqueGates = allGates.filter((g) => {
		const key = `${g.command}::${g.dir}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})

	// Execute each gate (matches hook: 30s timeout, 500-char output truncation)
	const failures: QualityGateResult[] = []
	for (let i = 0; i < uniqueGates.length; i++) {
		const gate = uniqueGates[i]
		const cwd = gate.dir ? resolve(repoRoot, gate.dir) : repoRoot
		let output = ""
		let exitCode = 0

		try {
			output = execSync(gate.command, {
				cwd,
				encoding: "utf8",
				timeout: 30_000,
				stdio: ["pipe", "pipe", "pipe"],
			})
		} catch (err: unknown) {
			const execErr = err as {
				status?: number
				stdout?: string
				stderr?: string
			}
			exitCode = execErr.status ?? 1
			output = ((execErr.stdout ?? "") + (execErr.stderr ?? "")).slice(0, 500)
		}

		if (exitCode !== 0) {
			failures.push({
				name: gate.name || `gate-${i}`,
				command: gate.command,
				dir: gate.dir,
				exit_code: exitCode,
				output,
			})
		}
	}

	return failures
}

// ── Action types ───────────────────────────────────────────────────────────

export interface OrchestratorAction {
	action: string
	[key: string]: unknown
}

// ── FSM side-effect helpers ────────────────────────────────────────────────

/**
 * Resolve the effective branching mode for a given stage.
 * Returns "discrete" or "continuous".
 *
 * Special case: stages with an `external` review gate are always isolated to
 * their own stage branch regardless of the intent's mode. This prevents
 * multiple external-review PRs from stacking on a shared intent main branch —
 * each external-gated stage opens a distinct PR from its own
 * `haiku/{slug}/{stage}` branch back to the intent main branch.
 */
function resolveEffectiveBranchMode(
	slug: string,
	stage: string,
): "discrete" | "continuous" {
	const intentFile = join(intentDir(slug), "intent.md")
	const intent = readFrontmatter(intentFile)
	const mode = (intent.mode as string) || "continuous"
	const studio = (intent.studio as string) || ""

	// External-review stages always use a stage branch so their PR is isolated.
	if (studio && stageReviewIncludes(studio, stage, "external"))
		return "discrete"

	if (mode === "continuous") return "continuous"
	if (mode === "discrete") return "discrete"
	// hybrid: check continuous_from threshold
	const continuousFrom = (intent.continuous_from as string) || ""
	if (!continuousFrom) return "discrete"
	const allStages = resolveStudioStages(studio)
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStages.filter((s) => !skipStages.includes(s))
	const thresholdIdx = studioStages.indexOf(continuousFrom)
	const stageIdx = studioStages.indexOf(stage)
	return stageIdx >= thresholdIdx ? "continuous" : "discrete"
}

/** Find the previous completed stage for branch chaining in discrete mode */
function findPreviousStage(slug: string, stage: string): string | undefined {
	const intentFile = join(intentDir(slug), "intent.md")
	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""
	const allStages = resolveStudioStages(studio)
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStages.filter((s) => !skipStages.includes(s))
	const idx = studioStages.indexOf(stage)
	return idx > 0 ? studioStages[idx - 1] : undefined
}

function fsmStartStage(slug: string, stage: string): void {
	const intentFile = join(intentDir(slug), "intent.md")

	// Branch isolation first — if this fails (merge conflict), no state is mutated.
	// Branch mode resolution is fully encapsulated in resolveEffectiveBranchMode,
	// which reads intent mode + external-review flag internally.
	const intent = readFrontmatter(intentFile)
	const branchMode = resolveEffectiveBranchMode(slug, stage)
	if (branchMode === "discrete") {
		// Discrete mode: haiku/<slug>/main is the hub branch.
		// Stage branches branch from main, and merge back into main when approved.
		// This ensures browse/repair can always find the intent on main.

		// 1. Ensure the hub branch exists
		createIntentBranch(slug)

		// 2. If there's a completed previous stage not yet merged, merge it into main first
		const prevStage = findPreviousStage(slug, stage)
		const prevStageBranch = prevStage ? `haiku/${slug}/${prevStage}` : ""
		if (
			prevStage &&
			branchExists(prevStageBranch) &&
			!isBranchMerged(prevStageBranch, `haiku/${slug}/main`)
		) {
			const mergeResult = mergeStageBranchIntoMain(slug, prevStage)
			if (!mergeResult.success) {
				throw new Error(
					`Merge of completed stage '${prevStage}' into main failed: ${mergeResult.message}. Resolve conflicts on 'haiku/${slug}/main' manually, then retry.`,
				)
			}
		}

		// Now that the previous stage is merged into main, reap the stage branch
		// so we don't accumulate one dead branch per completed stage.
		if (prevStage && branchExists(prevStageBranch)) {
			deleteStageBranch(slug, prevStage)
		}

		// 3. Create (or switch to) the stage branch from main
		if (!isOnStageBranch(slug, stage)) {
			const stageBranch = `haiku/${slug}/${stage}`
			if (branchExists(stageBranch) && prevStage) {
				// Stage branch already exists (go-back scenario) — merge main forward
				const mergeResult = mergeStageBranchForward(slug, "main", stage)
				if (!mergeResult.success) {
					throw new Error(
						`Merge forward from main to '${stage}' failed: ${mergeResult.message}. Resolve conflicts on branch '${stageBranch}' manually, then retry.`,
					)
				}
			} else {
				createStageBranch(slug, stage)
			}
		}
	} else {
		// Continuous branch mode for this stage — make sure we're on intent main.
		if (!isOnIntentBranch(slug)) {
			// We may be coming off a stage branch for one of three reasons:
			//   1. Intent mode is "hybrid" (continuous_from threshold reached)
			//   2. A previous stage had an external review → was isolated to a stage branch
			//      even though the intent is in continuous mode
			//   3. Previous stage was discrete and we're transitioning back
			//
			// In all cases, any previous stage branches must be consolidated (merged
			// forward) into intent main so their commits are present locally. This
			// mirrors how a server-side PR merge would land the work, without
			// requiring a pull from the remote.
			const studio = (intent.studio as string) || ""
			const allStages = resolveStudioStages(studio)
			const skipStages = (intent.skip_stages as string[]) || []
			const studioStages = allStages.filter((s) => !skipStages.includes(s))
			const stageIdx = studioStages.indexOf(stage)
			const previousBranchedStages = studioStages
				.slice(0, stageIdx)
				.filter((s) => branchExists(`haiku/${slug}/${s}`))

			if (previousBranchedStages.length > 0) {
				const consolResult = consolidateStageBranches(
					slug,
					previousBranchedStages,
				)
				if (!consolResult.success) {
					throw new Error(
						`Consolidation of stage branches into main failed: ${consolResult.message}. Resolve conflicts on 'haiku/${slug}/main' manually, then retry.`,
					)
				}
			} else {
				createIntentBranch(slug)
			}
		}
	}

	// State mutations only after branch is ready
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.stage = stage
	data.status = "active"
	data.phase = "elaborate"
	data.started_at = timestamp()
	data.completed_at = null
	data.gate_entered_at = null
	data.gate_outcome = null
	writeJson(path, data)

	// Open the first iteration when the stage is genuinely starting for the
	// first time. If the stage already has iterations (e.g. re-run after a
	// restart), leave them alone.
	if (getStageIterationCount(data) === 0) {
		appendStageIteration(slug, stage, { trigger: "initial" })
	}

	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", stage)
	}

	emitTelemetry("haiku.stage.started", { intent: slug, stage })
	gitCommitState(`haiku: start stage ${stage}`)
	sealIntentState(slug)
}

function fsmAdvancePhase(slug: string, stage: string, toPhase: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.phase = toPhase
	writeJson(path, data)
	emitTelemetry("haiku.stage.phase", { intent: slug, stage, phase: toPhase })
	sealIntentState(slug)
}

function fsmCompleteStage(
	slug: string,
	stage: string,
	gateOutcome: string,
): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.status = "completed"
	data.completed_at = timestamp()
	data.gate_outcome = gateOutcome
	writeJson(path, data)
	// Close the current iteration as advanced/rejected so the history is
	// self-describing even for stages that only ran a single pass.
	closeCurrentStageIteration(
		slug,
		stage,
		gateOutcome === "advanced" ? "advanced" : "rejected",
	)
	emitTelemetry("haiku.stage.completed", {
		intent: slug,
		stage,
		gate_outcome: gateOutcome,
	})
	gitCommitState(`haiku: complete stage ${stage}`)
	sealIntentState(slug)
}

function fsmAdvanceStage(
	slug: string,
	currentStage: string,
	nextStage: string,
): void {
	// Complete current stage
	fsmCompleteStage(slug, currentStage, "advanced")

	// Update intent's active_stage to next
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", nextStage)
	}

	// Reseal: fsmCompleteStage sealed against active_stage=currentStage;
	// we just rewrote active_stage, so the prior checksum is now stale and
	// the next verifyIntentState() would false-positive as tampering.
	sealIntentState(slug)
}

function fsmGateAsk(slug: string, stage: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.phase = "gate"
	data.gate_entered_at = timestamp()
	writeJson(path, data)
	emitTelemetry("haiku.gate.entered", { intent: slug, stage })
	sealIntentState(slug)
}

function fsmIntentComplete(slug: string): void {
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "status", "completed")
		setFrontmatterField(intentFile, "completed_at", timestamp())
	}
	emitTelemetry("haiku.intent.completed", { intent: slug })
	gitCommitState(`haiku: complete intent ${slug}`)

	// Fan the last stage (and any unmerged prior stages) into intent main,
	// checkout intent main, and reap every merged stage branch so the intent
	// lands on a single clean ref — no stale haiku/<slug>/<stage> branches
	// left behind.
	const intent = existsSync(intentFile) ? readFrontmatter(intentFile) : {}
	const studio = (intent.studio as string) || ""
	const skipStages = (intent.skip_stages as string[]) || []
	const allStages = studio ? resolveStudioStages(studio) : []
	const stages = allStages.filter((s) => !skipStages.includes(s))
	if (stages.length > 0) {
		const finalized = finalizeIntentBranches(slug, stages)
		if (!finalized.success) {
			console.error(
				`[haiku] finalizeIntentBranches warning for ${slug}: ${finalized.message}`,
			)
		}
	}
	// Any orphaned unit worktrees from mid-stage bolts go with it.
	cleanupIntentWorktrees(slug)
	sealIntentState(slug)
}

// ── Main orchestration function ────────────────────────────────────────────

export function runNext(slug: string): OrchestratorAction {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	if (!existsSync(intentFile)) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}

	// Tamper detection: verify FSM state wasn't modified via direct file writes.
	// Only active for hookless harnesses (Claude Code/Kiro have guard-fsm-fields hook).
	const tamperError = verifyIntentState(slug)
	if (tamperError) {
		return { action: "error", message: tamperError }
	}

	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""

	// No studio selected yet — agent must call haiku_select_studio
	if (!studio) {
		// Include available studios so the agent can present them conversationally
		// even if elicitation is unavailable (e.g., cowork mode)
		const available = listStudios().map((s) => ({
			name: s.name,
			slug: s.slug,
			aliases: s.aliases,
			description: s.description,
			category: s.category,
		}))
		return {
			action: "select_studio",
			intent: slug,
			available_studios: available,
			message: `Intent '${slug}' has no studio selected. Call haiku_select_studio { intent: "${slug}" } to choose a lifecycle studio.`,
		}
	}

	const status = (intent.status as string) || "active"
	const activeStage = (intent.active_stage as string) || ""

	if (status === "completed") {
		return {
			action: "complete",
			message: `Intent '${slug}' is already completed`,
		}
	}

	if (status === "archived") {
		return {
			action: "error",
			message: `Intent '${slug}' has status: archived (legacy/terminal). haiku_intent_unarchive only clears the new \`archived\` field — it does not touch \`status\`. To recover, run \`/haiku:repair\` or manually edit \`.haiku/intents/${slug}/intent.md\` and set \`status: active\`.`,
		}
	}

	if (intent.archived === true) {
		return {
			action: "error",
			message: `Intent '${slug}' is archived. Call haiku_intent_unarchive to restore it.`,
		}
	}

	// Composite intent handling
	if (intent.composite) {
		return runNextComposite(slug, intent, iDir)
	}

	const allStudioStages = resolveStudioStages(studio)
	if (allStudioStages.length === 0) {
		return { action: "error", message: `Studio '${studio}' has no stages` }
	}

	// Filter out skipped stages
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStudioStages.filter((s) => !skipStages.includes(s))

	// Determine current stage — with consistency check
	let currentStage = activeStage
	if (!currentStage) {
		currentStage = studioStages[0]
	}

	// Consistency check: verify all stages before active_stage are completed.
	// If not, either synthesize completion records (safe repair) or reset to
	// the first incomplete stage. Safe repair triggers when the active stage
	// has real work (units) — this indicates a migrated intent where earlier
	// stages were never elaborated. Resetting backwards would force
	// re-elaboration of empty stages while real work sits in a later stage.
	const activeIdx = studioStages.indexOf(currentStage)
	if (activeIdx > 0) {
		// Collect all incomplete prior stages in one pass
		const incompletePrior: string[] = []
		for (let i = 0; i < activeIdx; i++) {
			const prevState = readJson(
				join(iDir, "stages", studioStages[i], "state.json"),
			)
			const prevStatus = (prevState.status as string) || "pending"
			if (prevStatus !== "completed") {
				incompletePrior.push(studioStages[i])
			}
		}

		if (incompletePrior.length > 0) {
			// Check if the active stage has real work — units on disk
			const activeUnitsDir = join(iDir, "stages", currentStage, "units")
			const activeUnitFiles = existsSync(activeUnitsDir)
				? readdirSync(activeUnitsDir).filter((f) => f.endsWith(".md"))
				: []

			if (activeUnitFiles.length > 0) {
				// ── Safe intent repair ──────────────────────────────────────
				// The active stage has real work but earlier stages are incomplete.
				// This is a migration artifact (e.g., AIDLC → H·AI·K·U migration
				// that only populated the development stage). Synthesize completion
				// records for incomplete prior stages so the FSM can proceed without
				// forcing re-elaboration of empty stages.
				//
				// Safety constraints:
				// 1. Only synthesizes for stages with NO units (truly empty)
				//    — stages with units but incomplete status are left for manual review
				// 2. Uses the same completion record format as haiku_repair
				// 3. The agent cannot trigger this — it's FSM-internal
				// 4. No hook bypass — this runs inside haiku_run_next

				const synthesized: string[] = []
				const needsManualReview: string[] = []
				const now = timestamp()
				const intentStarted =
					(intent.started_at as string) || (intent.created_at as string) || now

				for (const stageName of incompletePrior) {
					const priorUnitsDir = join(iDir, "stages", stageName, "units")
					const priorUnitFiles = existsSync(priorUnitsDir)
						? readdirSync(priorUnitsDir).filter((f) => f.endsWith(".md"))
						: []

					if (priorUnitFiles.length > 0) {
						// Stage has units but isn't completed — this needs manual attention
						needsManualReview.push(stageName)
					} else {
						// Truly empty prior stage — safe to synthesize completion
						const stageDir = join(iDir, "stages", stageName)
						mkdirSync(stageDir, { recursive: true })
						const statePath = join(stageDir, "state.json")
						writeJson(statePath, {
							stage: stageName,
							status: "completed",
							phase: "gate",
							started_at: intentStarted,
							completed_at: intentStarted,
							gate_entered_at: null,
							gate_outcome: "advanced",
						})
						synthesized.push(stageName)
					}
				}

				// Check if the active stage's units need input backfill.
				// If the stage is in execute phase but units lack inputs, regress
				// to elaborate so the normal backpressure can enforce input declarations.
				const activeStageState = readJson(
					join(iDir, "stages", currentStage, "state.json"),
				)
				const activePhase = (activeStageState.phase as string) || ""
				let phaseRegressed = false
				const missingInputs: string[] = []
				if (activePhase === "execute") {
					for (const f of activeUnitFiles) {
						const fm = readFrontmatter(join(activeUnitsDir, f))
						const unitStatus = (fm.status as string) || ""
						if (["completed", "skipped", "failed"].includes(unitStatus))
							continue
						const inputs =
							(fm.inputs as string[]) || (fm.refs as string[]) || []
						if (inputs.length === 0) missingInputs.push(f)
					}
					if (missingInputs.length > 0) {
						// Regress phase to elaborate so validateUnitInputs catches this
						activeStageState.phase = "elaborate"
						writeJson(
							join(iDir, "stages", currentStage, "state.json"),
							activeStageState,
						)
						phaseRegressed = true
					}
				}

				if (synthesized.length > 0 || phaseRegressed) {
					gitCommitState(
						`haiku: safe-repair ${slug} — synthesize ${synthesized.join(", ")}${phaseRegressed ? "; regress phase to elaborate" : ""}`,
					)
				}

				emitTelemetry("haiku.fsm.safe_repair", {
					intent: slug,
					active_stage: currentStage,
					synthesized_stages: synthesized.join(","),
					needs_manual_review: needsManualReview.join(","),
					phase_regressed: String(phaseRegressed),
				})

				// If all incomplete stages were synthesized, proceed normally
				// by falling through to the rest of runNext. If any need manual
				// review, return an action so the agent can report the situation.
				if (needsManualReview.length > 0) {
					return {
						action: "safe_intent_repair",
						intent: slug,
						studio,
						stage: currentStage,
						synthesized_stages: synthesized,
						needs_manual_review: needsManualReview,
						phase_regressed: phaseRegressed,
						units_missing_inputs: missingInputs,
						message: `Intent '${slug}' was in an inconsistent state — work exists in '${currentStage}' but earlier stages were incomplete.\n\n${synthesized.length > 0 ? `Synthesized completion records for empty stages: [${synthesized.join(", ")}]\n` : ""}Stages needing manual review (have units but aren't completed): [${needsManualReview.join(", ")}]\n${phaseRegressed ? `\nAdditionally, phase was regressed from 'execute' to 'elaborate' because some units are missing \`inputs:\` declarations.\n` : ""}Resolve these stages manually, then call haiku_run_next again.`,
					}
				}

				// All prior stages synthesized — if phase was regressed, let the
				// agent know so it can address missing inputs before execution.
				// Otherwise fall through to normal processing.
				if (phaseRegressed) {
					return {
						action: "safe_intent_repair",
						intent: slug,
						studio,
						stage: currentStage,
						synthesized_stages: synthesized,
						needs_manual_review: [],
						phase_regressed: true,
						units_missing_inputs: missingInputs,
						message: `Intent '${slug}' repaired — synthesized completion for [${synthesized.join(", ")}]. Phase regressed from 'execute' to 'elaborate' because some units are missing \`inputs:\` declarations. Add inputs to the flagged units, then call haiku_run_next to proceed.`,
					}
				}

				// Clean repair with no phase regression — fall through to normal
				// runNext processing. The agent doesn't need to take special action.
			} else {
				// No units in the active stage — normal consistency reset.
				// The intent may have been corrupted or active_stage set incorrectly.
				currentStage = incompletePrior[0]
				setFrontmatterField(intentFile, "active_stage", currentStage)
				emitTelemetry("haiku.fsm.consistency_fix", {
					intent: slug,
					stale_stage: activeStage,
					corrected_stage: currentStage,
				})
			}
		}
	}

	// If current stage was skipped, advance to next non-skipped stage
	if (skipStages.includes(currentStage)) {
		const idx = allStudioStages.indexOf(currentStage)
		const next = allStudioStages
			.slice(idx + 1)
			.find((s) => !skipStages.includes(s))
		if (!next) {
			fsmIntentComplete(slug)
			return {
				action: "intent_complete",
				intent: slug,
				studio,
				message: `All stages complete for intent '${slug}'`,
			}
		}
		currentStage = next
	}

	// Load stage state
	const stageState = readJson(join(iDir, "stages", currentStage, "state.json"))
	const phase = (stageState.phase as string) || ""
	const stageStatus = (stageState.status as string) || "pending"

	// Stage not started yet
	if (!phase || stageStatus === "pending") {
		const hats = resolveStageHats(studio, currentStage)
		const follows = (intent.follows as string) || ""
		const parentKnowledge: string[] = []
		if (follows && currentStage === studioStages[0]) {
			// First stage of a follow-up intent — surface parent knowledge
			const parentKnowledgeDir = join(root, "intents", follows, "knowledge")
			if (existsSync(parentKnowledgeDir)) {
				parentKnowledge.push(
					...readdirSync(parentKnowledgeDir).filter((f) => f.endsWith(".md")),
				)
			}
		}

		// FSM side effect: start the stage
		try {
			fsmStartStage(slug, currentStage)
		} catch (err) {
			return {
				action: "error",
				message: err instanceof Error ? err.message : String(err),
			}
		}

		return {
			action: "start_stage",
			intent: slug,
			studio,
			stage: currentStage,
			hats,
			phase: "elaborate",
			stage_metadata: resolveStageMetadata(studio, currentStage),
			...(follows ? { follows, parent_knowledge: parentKnowledge } : {}),
			message: follows
				? `Start stage '${currentStage}' — this intent follows '${follows}'. Load parent knowledge before elaborating.`
				: `Start stage '${currentStage}' — elaborate the work into units`,
		}
	}

	// Stage in elaboration phase
	if (phase === "elaborate" || phase === "decompose") {
		const unitsDir = join(iDir, "stages", currentStage, "units")
		const hasUnits =
			existsSync(unitsDir) &&
			readdirSync(unitsDir).filter((f) => f.endsWith(".md")).length > 0

		// Read elaboration mode from STAGE.md
		const pluginRoot = resolvePluginRoot()
		let elaborationMode = "collaborative"
		for (const base of [
			join(process.cwd(), ".haiku", "studios"),
			join(pluginRoot, "studios"),
		]) {
			const stageFile = join(base, studio, "stages", currentStage, "STAGE.md")
			if (existsSync(stageFile)) {
				const fm = readFrontmatter(stageFile)
				elaborationMode = (fm.elaboration as string) || "collaborative"
				break
			}
		}

		// Track elaboration turns for collaborative enforcement
		const elaborationTurns = (stageState.elaboration_turns as number) || 0
		const updatedTurns = elaborationTurns + 1
		writeJson(join(iDir, "stages", currentStage, "state.json"), {
			...stageState,
			elaboration_turns: updatedTurns,
		})

		if (!hasUnits) {
			return {
				action: "elaborate",
				intent: slug,
				studio,
				stage: currentStage,
				elaboration: elaborationMode,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Elaborate stage '${currentStage}' into units with completion criteria`,
			}
		}

		// ── Additive elaborate mode (iteration > 1) ───────────────────────
		// When we're revisiting a stage after feedback, return a special action
		// that lists completed units as read-only and pending feedback to address.
		const iteration = getStageIterationCount(stageState)
		if (iteration > 1) {
			const allUnits = listUnits(iDir, currentStage)
			const completedUnits = allUnits.filter((u) => u.status === "completed")
			const pendingUnits = allUnits.filter((u) => u.status !== "completed")
			const pendingFeedback = readFeedbackFiles(slug, currentStage).filter(
				(item) => item.status === "pending",
			)

			// Shared payload for every revisit-mode elaborate return
			const basePayload = {
				action: "elaborate" as const,
				intent: slug,
				studio,
				stage: currentStage,
				elaboration: elaborationMode,
				iteration,
				visits: iteration, // legacy alias
				completed_units: completedUnits.map((u) => u.name),
				pending_feedback: pendingFeedback.map(summarizeFeedback),
				stage_metadata: resolveStageMetadata(studio, currentStage),
			}

			// Validate closes: fields on any in-flight (non-completed) units
			const validFeedbackIds = new Set(pendingFeedback.map((f) => f.id))
			const unitsWithoutCloses: string[] = []
			const invalidCloseRefs: Array<{ unit: string; ref: string }> = []

			for (const u of pendingUnits) {
				const unitFile = join(
					iDir,
					"stages",
					currentStage,
					"units",
					`${u.name}.md`,
				)
				if (!existsSync(unitFile)) continue
				const fm = readFrontmatter(unitFile)
				const closes = (fm.closes as string[]) || []
				if (closes.length === 0) {
					unitsWithoutCloses.push(u.name)
				} else {
					for (const ref of closes) {
						if (!validFeedbackIds.has(ref)) {
							invalidCloseRefs.push({ unit: u.name, ref })
						}
					}
				}
			}

			// Case 1: new units written but missing closes: fields
			if (pendingUnits.length > 0 && unitsWithoutCloses.length > 0) {
				const validation_error = `New units missing \`closes:\` field: ${unitsWithoutCloses.join(", ")}. Every new unit in a revisit cycle MUST declare \`closes: [FB-NN]\` referencing the feedback items it addresses.`
				return {
					...basePayload,
					validation_error,
					message: buildElaboratorInstruction({
						visits: iteration,
						pendingFeedbackCount: pendingFeedback.length,
						stage: currentStage,
						situation: `Validation error: ${validation_error}`,
					}),
				}
			}

			// Case 2: closes: references that don't match any feedback id
			if (invalidCloseRefs.length > 0) {
				const validation_error = `Invalid \`closes:\` references: ${invalidCloseRefs.map((r) => `${r.unit} → ${r.ref}`).join(", ")}. References must match existing pending feedback IDs.`
				return {
					...basePayload,
					validation_error,
					message: buildElaboratorInstruction({
						visits: iteration,
						pendingFeedbackCount: pendingFeedback.length,
						stage: currentStage,
						situation: `Validation error: ${validation_error}`,
					}),
				}
			}

			// Case 3: orphaned feedback — some pending items have no unit closing them
			if (pendingUnits.length > 0 && pendingFeedback.length > 0) {
				const closedFeedbackIds = new Set<string>()
				for (const u of pendingUnits) {
					const unitFile = join(
						iDir,
						"stages",
						currentStage,
						"units",
						`${u.name}.md`,
					)
					if (!existsSync(unitFile)) continue
					const fm = readFrontmatter(unitFile)
					const closes = (fm.closes as string[]) || []
					for (const ref of closes) closedFeedbackIds.add(ref)
				}
				const orphaned = pendingFeedback.filter(
					(f) => !closedFeedbackIds.has(f.id),
				)
				if (orphaned.length > 0) {
					const validation_error = `Orphaned feedback — not referenced by any unit's \`closes:\` field: ${orphaned.map((f) => `${f.id}: ${f.title}`).join("; ")}. Create units for these or reject the feedback items.`
					return {
						...basePayload,
						validation_error,
						message: buildElaboratorInstruction({
							visits: iteration,
							pendingFeedbackCount: pendingFeedback.length,
							stage: currentStage,
							situation: `Validation error: ${validation_error}`,
						}),
					}
				}
			}

			// Case 4: post-elab gate predicate — pending feedback with no in-flight units
			// (FB-09: this is the only true block; closes-presence / orphan checks above
			// complement it when the agent is mid-elaboration)
			if (pendingUnits.length === 0 && pendingFeedback.length > 0) {
				return {
					...basePayload,
					message: buildElaboratorInstruction({
						visits: iteration,
						pendingFeedbackCount: pendingFeedback.length,
						stage: currentStage,
					}),
				}
			}

			// All feedback addressed + units validated — fall through to normal elaborate flow
		}

		// Enforce collaborative elaboration — minimum turn count
		if (elaborationMode === "collaborative" && updatedTurns < 3) {
			return {
				action: "elaboration_insufficient",
				intent: slug,
				stage: currentStage,
				turns: updatedTurns,
				required: 3,
				message: `Collaborative elaboration requires engaging the user. ${updatedTurns} turn(s) so far — engage the user at least ${3 - updatedTurns} more time(s) before finalizing units.`,
			}
		}

		// Units exist — validate DAG for unresolved deps and cycles
		{
			const unitsDir = join(iDir, "stages", currentStage, "units")
			const unitFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
			const nodeIds = new Set(unitFiles.map((f) => f.replace(".md", "")))
			const dagNodes = unitFiles.map((f) => {
				const fm = readFrontmatter(join(unitsDir, f))
				return {
					id: f.replace(".md", ""),
					status: (fm.status as string) || "pending",
				}
			})
			const dagEdges: Array<{ from: string; to: string }> = []
			const dagAdj = new Map<string, string[]>()
			for (const n of dagNodes) dagAdj.set(n.id, [])

			const unresolvedDeps: Array<{ unit: string; dep: string }> = []
			for (const f of unitFiles) {
				const fm = readFrontmatter(join(unitsDir, f))
				const id = f.replace(".md", "")
				for (const dep of (fm.depends_on as string[]) || []) {
					if (nodeIds.has(dep)) {
						dagEdges.push({ from: dep, to: id })
						dagAdj.get(dep)?.push(id)
					} else {
						unresolvedDeps.push({ unit: id, dep })
					}
				}
			}

			if (unresolvedDeps.length > 0) {
				return {
					action: "unresolved_dependencies",
					intent: slug,
					stage: currentStage,
					unresolvedDeps,
					message: `${unresolvedDeps.length} depends_on reference(s) don't match any unit filename:\n\n${unresolvedDeps.map((d) => `- \`${d.unit}\` depends on \`${d.dep}\` — not found`).join("\n")}\n\nValid unit slugs: ${[...nodeIds].join(", ")}\ndepends_on must use the full filename without .md (e.g., \`unit-01-data-model\`, not \`data-model\`).\n\nFix the depends_on fields, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
				}
			}

			try {
				topologicalSort({ nodes: dagNodes, edges: dagEdges, adjacency: dagAdj })
			} catch (err) {
				if (
					err instanceof Error &&
					err.message.includes("Circular dependency")
				) {
					return {
						action: "dag_cycle_detected",
						intent: slug,
						stage: currentStage,
						message: `${err.message}. Fix the depends_on fields in the unit files to remove the cycle, then call haiku_run_next again.`,
					}
				}
			}
		}

		// Validate unit file naming before allowing execution
		const namingViolation = validateUnitNaming(iDir, currentStage)
		if (namingViolation) return namingViolation

		// Validate discovery artifacts exist before advancing
		const discoveryViolation = validateDiscoveryArtifacts(
			slug,
			currentStage,
			studio,
		)
		if (discoveryViolation) return discoveryViolation

		// Validate all units have declared inputs
		const inputsViolation = validateUnitInputs(iDir, currentStage)
		if (inputsViolation) return inputsViolation

		// Note: adversarial review of elaboration specs is included in the gate_review
		// instructions. The gate review handler opens the review UI which shows specs
		// and lets the user approve or request changes. No separate review_elaboration
		// step — it was causing a redundant haiku_run_next round-trip.

		// Check if the stage requires a design direction selection before proceeding.
		// Read the STAGE.md body — if it mentions pick_design_direction (RFC 2119 MUST),
		// enforce that design_direction_selected is set in state.json.
		const designDirectionSelected =
			(stageState.design_direction_selected as boolean) || false
		if (!designDirectionSelected) {
			const stageMetaForDesign = resolveStageMetadata(studio, currentStage)
			if (stageMetaForDesign?.body?.includes("pick_design_direction")) {
				return {
					action: "design_direction_required",
					intent: slug,
					studio,
					stage: currentStage,
					message:
						"This stage requires a design direction selection before proceeding. Call pick_design_direction with wireframe variants — the state will be updated automatically when the user selects a direction.",
				}
			}
		}

		// Validate unit naming and types across ALL stages — catch legacy issues from before validation existed
		const stagesDir = join(iDir, "stages")
		if (existsSync(stagesDir)) {
			for (const stageEntry of readdirSync(stagesDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.sort((a, b) => a.name.localeCompare(b.name))) {
				if (stageEntry.name === currentStage) continue // already validated above
				const crossNaming = validateUnitNaming(iDir, stageEntry.name)
				if (crossNaming) return crossNaming
			}
		}

		// All units valid — either auto-advance or open review gate before execution.
		//
		// For stages with review: auto, skip the gate
		// entirely and advance directly to execution. This is critical for
		// autonomous workflows where the user should not be interrupted.
		//
		// For the first stage of a fresh intent (not yet reviewed), this gate
		// doubles as the intent review — CC review agents have already run
		// during the review phase, so the user sees validated specs.
		// Note: if the user rejects and the agent revises, this re-presents
		// with intent_review context until intent_reviewed is set to true.
		const intentReviewed = (intent.intent_reviewed as boolean) || false
		const isIntentReview = currentStage === studioStages[0] && !intentReviewed
		const stageReviewType = resolveStageReview(studio, currentStage)

		// Auto gates: skip review UI and advance directly to execution.
		// Discrete mode affects branching strategy, not review type semantics.
		if (stageReviewType === "auto") {
			if (isIntentReview) {
				setFrontmatterField(intentFile, "intent_reviewed", true)
				gitCommitState(`haiku: intent ${slug} auto-approved`)
			}
			fsmAdvancePhase(slug, currentStage, "execute")
			emitTelemetry("haiku.gate.auto_advanced", {
				intent: slug,
				stage: currentStage,
				gate_context: isIntentReview ? "intent_review" : "elaborate_to_execute",
			})
			return {
				action: isIntentReview ? "intent_approved" : "advance_phase",
				intent: slug,
				studio,
				stage: currentStage,
				from_phase: "elaborate",
				to_phase: "execute",
				message: isIntentReview
					? `Auto-gate: intent approved — advancing to execution. Call haiku_run_next { intent: "${slug}" } immediately.`
					: `Auto-gate: specs validated — advancing to execution. Call haiku_run_next { intent: "${slug}" } immediately.`,
			}
		}

		// Non-auto gates: open review UI
		return {
			action: "gate_review",
			intent: slug,
			studio,
			stage: currentStage,
			next_phase: "execute",
			gate_type: "ask",
			gate_context: isIntentReview ? "intent_review" : "elaborate_to_execute",
			message: isIntentReview
				? `Intent '${slug}' specs ready for review — presenting for your approval`
				: "Specs validated — opening review before execution",
		}
	}

	// Stage in execute phase
	if (phase === "execute") {
		// Validate unit naming on every execute call — catch violations that snuck through
		const execNamingViolation = validateUnitNaming(iDir, currentStage)
		if (execNamingViolation) return execNamingViolation

		const units = listUnits(iDir, currentStage)
		const activeUnits = units.filter((u) => u.status === "active")
		const allComplete = units.every((u) => u.status === "completed")

		// Compute waves from the DAG so we only release one wave at a time.
		// A wave completes when all its units are completed; then the next
		// wave's units become ready.
		const { unitWave, totalWaves } = computeUnitWaves(units)
		const wave = currentWaveNumber(units, unitWave, totalWaves)

		// Filter ready units to only those in the current wave
		const readyUnits = units.filter(
			(u) =>
				u.status === "pending" &&
				u.depsComplete &&
				unitWave.get(u.name) === wave,
		)

		if (allComplete) {
			// Pre-gate check: validate required outputs were created
			const outputValidation = validateStageOutputs(slug, currentStage, studio)
			if (outputValidation) return outputValidation

			// FSM side effect: advance phase
			fsmAdvancePhase(slug, currentStage, "review")

			return {
				action: "advance_phase",
				intent: slug,
				stage: currentStage,
				from_phase: "execute",
				to_phase: "review",
				message: `All units complete — begin adversarial review of stage '${currentStage}'`,
			}
		}

		if (activeUnits.length > 0) {
			const worktreeFor = (unitName: string): string | null => {
				const p = join(process.cwd(), ".haiku", "worktrees", slug, unitName)
				return existsSync(p) ? p : null
			}

			// Only serialize when exactly one unit is in-flight. When N units are
			// all active in the same wave, emit a continue_units batch so the
			// parent fans them out in parallel — same as start_units.
			if (activeUnits.length === 1) {
				const unit = activeUnits[0]
				const hats = resolveUnitHatsInStudio(
					studio,
					currentStage,
					slug,
					unit.name,
				)
				return {
					action: "continue_unit",
					intent: slug,
					stage: currentStage,
					unit: unit.name,
					hat: unit.hat,
					bolt: unit.bolt,
					wave: unitWave.get(unit.name) ?? wave,
					total_waves: totalWaves,
					hats,
					worktree: worktreeFor(unit.name),
					stage_metadata: resolveStageMetadata(studio, currentStage),
					message: `Continue unit '${unit.name}' — hat: ${unit.hat}, bolt: ${unit.bolt}, wave: ${unitWave.get(unit.name) ?? wave}/${totalWaves}`,
				}
			}
			const hats = resolveStageHats(studio, currentStage)

			const unitEntries = activeUnits.map((u) => ({
				name: u.name,
				hat: u.hat,
				bolt: u.bolt,
				worktree: worktreeFor(u.name),
			}))
			return {
				action: "continue_units",
				intent: slug,
				studio,
				stage: currentStage,
				wave,
				total_waves: totalWaves,
				hats,
				units: unitEntries,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Continue ${activeUnits.length} units in parallel: ${activeUnits.map((u) => `${u.name}(${u.hat}#${u.bolt})`).join(", ")}`,
			}
		}

		// Resolve once for unit worktree creation below
		// Units always fork from their stage branch now. The branch-mode
		// distinction lives elsewhere (how the stage itself relates to intent
		// main); unit fan-in is always stage-scoped.

		if (readyUnits.length > 1) {
			// Multiple units ready — create worktrees for parallel execution
			const hats = resolveStageHats(studio, currentStage)
			const unitWorktrees: Record<string, string | null> = {}
			for (const u of readyUnits) {
				unitWorktrees[u.name] = createUnitWorktree(slug, u.name, currentStage)
			}
			return {
				action: "start_units",
				intent: slug,
				studio,
				stage: currentStage,
				wave,
				total_waves: totalWaves,
				units: readyUnits.map((u) => u.name),
				first_hat: hats[0] || "",
				hats,
				worktrees: unitWorktrees,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Wave ${wave}/${totalWaves} — ${readyUnits.length} units ready for parallel execution: ${readyUnits.map((u) => u.name).join(", ")}`,
			}
		}

		if (readyUnits.length > 0) {
			const unit = readyUnits[0]
			const hats = resolveStageHats(studio, currentStage)
			// Create worktree for solo unit too — all units are isolated
			const worktreePath = createUnitWorktree(slug, unit.name, currentStage)
			return {
				action: "start_unit",
				intent: slug,
				studio,
				stage: currentStage,
				wave,
				total_waves: totalWaves,
				unit: unit.name,
				first_hat: hats[0] || "",
				hats,
				worktree: worktreePath,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Wave ${wave}/${totalWaves} — start unit '${unit.name}' with hat '${hats[0] || ""}' in stage '${currentStage}'`,
			}
		}

		// All units either completed or blocked
		const blockedUnits = units.filter((u) => u.status !== "completed")
		return {
			action: "blocked",
			intent: slug,
			stage: currentStage,
			wave,
			total_waves: totalWaves,
			blocked_units: blockedUnits.map((u) => u.name),
			message: `${blockedUnits.length} unit(s) blocked — dependencies not met or manual intervention needed`,
		}
	}

	// Stage in review phase
	if (phase === "review") {
		// Secondary output validation — hard check before adversarial review
		const reviewOutputCheck = validateStageOutputs(slug, currentStage, studio)
		if (reviewOutputCheck) return reviewOutputCheck

		// Run quality gates (tests, lint, typecheck) before subjective review agents.
		// If any gate fails, send the agent back to fix them — don't waste review cycles
		// on code that doesn't compile or pass tests.
		const gateFailures = runQualityGates(slug, currentStage)
		if (gateFailures.length > 0) {
			// Stay in review phase — agent must fix and call haiku_run_next again
			return {
				action: "fix_quality_gates",
				intent: slug,
				stage: currentStage,
				failures: gateFailures,
				message: `Quality gate(s) failed — fix before adversarial review:\n\n${gateFailures
					.map(
						(f) =>
							`- **${f.name}**: \`${f.command}\` (exit ${f.exit_code})${f.dir !== "" ? ` in ${f.dir}` : ""}\n  ${f.output.split("\n").slice(0, 5).join("\n  ")}`,
					)
					.join("\n\n")}`,
			}
		}

		// FSM side effect: advance to gate phase so next haiku_run_next call
		// proceeds to gate logic after the agent completes the review work.
		fsmAdvancePhase(slug, currentStage, "gate")

		return {
			action: "review",
			intent: slug,
			studio,
			stage: currentStage,
			message: `Quality gates passed — run adversarial review agents for stage '${currentStage}'`,
		}
	}

	// Note: "persist" phase removed — artifacts are committed during execution
	// via gitCommitState() in MCP state tools (stage_start/complete, unit_start/complete).
	// If phase is "persist" (legacy), treat as gate-ready.
	if (phase === "persist") {
		// FSM side effect: auto-advance to gate
		fsmAdvancePhase(slug, currentStage, "gate")

		return {
			action: "advance_phase",
			intent: slug,
			stage: currentStage,
			from_phase: "persist",
			to_phase: "gate",
			message: "Artifacts already persisted — proceeding to gate",
		}
	}

	// Stage in gate phase — determine whether to auto-advance or open review UI.
	// Gate behavior:
	//   - Discrete intent mode: always "external" (Submit for External Review + Request Changes)
	//   - Continuous/hybrid intent mode: based on the stage's review field
	//     - auto → auto-advance without user interaction (autonomous gate)
	//     - ask → "ask" (Approve + Request Changes)
	//     - external → "external" (Submit for External Review + Request Changes)
	//     - [external, ask] → as-is (Approve + Submit for External Review + Request Changes)
	//     - await → "external" (awaits external event after submission)
	//   Note: continuous intents may have discrete branch isolation for external-review
	//   stages (PR isolation), but the gate options still reflect the stage's review field.
	//
	//   Non-git environments: `external` gates fall back to `ask` because there is no
	//   structural signal (branch merge) to enforce external review. Without git, the
	//   only safe option is local human approval. Compound gates containing `external`
	//   strip it and keep remaining types (e.g., [external, ask] → ask).
	if (phase === "gate") {
		// ── Pending feedback check ─────────────────────────────────────────
		// Before any gate logic, check if there are unresolved feedback items.
		// If pending feedback exists, roll back to elaborate so the agent
		// addresses findings before the stage can advance.
		const pendingCount = countPendingFeedback(slug, currentStage)
		if (pendingCount > 0) {
			// Blocking = items countPendingFeedback counts: no closed_by AND
			// status is not closed/addressed/rejected. Stay in sync with
			// countPendingFeedback so count and list never diverge.
			const pendingItems = readFeedbackFiles(slug, currentStage).filter(
				(item) => {
					if (item.closed_by) return false
					return (
						item.status !== "closed" &&
						item.status !== "addressed" &&
						item.status !== "rejected"
					)
				},
			)
			const statePath = stageStatePath(slug, currentStage)
			const gateState = readJson(statePath)
			gateState.phase = "elaborate"
			writeJson(statePath, gateState)
			const iterResult = appendStageIteration(
				slug,
				currentStage,
				{
					trigger: "feedback",
					reason: `${pendingCount} pending feedback item(s)`,
					feedbackTitles: pendingItems.map((i) => i.title),
				},
				"feedback-revisit",
			)
			gitCommitState(
				`haiku: feedback_revisit in ${currentStage} (${pendingCount} pending, iteration ${iterResult.count})`,
			)
			emitTelemetry("haiku.gate.feedback_revisit", {
				intent: slug,
				stage: currentStage,
				pending_count: String(pendingCount),
				iteration: String(iterResult.count),
			})
			const escalation = maybeEscalate(
				slug,
				currentStage,
				iterResult,
				"feedback",
				pendingItems.map((i) => ({
					feedback_id: i.id,
					title: i.title,
				})),
			)
			if (escalation) return escalation
			return {
				action: "feedback_revisit",
				intent: slug,
				studio,
				stage: currentStage,
				pending_count: pendingCount,
				iteration: iterResult.count,
				visits: iterResult.count, // legacy alias — prefer `iteration`
				pending_items: pendingItems.map(summarizeFeedback),
				message: `${pendingCount} pending feedback item(s) found — rolling back to elaborate (iteration ${iterResult.count}). YOU MUST read every feedback file at pending_items[].file in full before elaborating — the body carries the requirements. Address all pending feedback before the gate can advance.`,
			}
		}

		// ── External review state detection ────────────────────────────────
		// If this stage was already completed+blocked (external review submitted),
		// check if the external review state changed (approved / changes_requested)
		// before opening the gate review UI again.
		const gateOutcomeInGate = (stageState.gate_outcome as string) || ""
		if (stageStatus === "completed" && gateOutcomeInGate === "blocked") {
			let extApproved = false
			let externalState: ExternalReviewState = { status: "unknown" }
			const externalUrl = (stageState.external_review_url as string) || ""

			// Tier 1: Branch merge detection
			if (isGitRepo()) {
				const stageBranch = `haiku/${slug}/${currentStage}`
				const mainline = `haiku/${slug}/main`
				if (isBranchMerged(stageBranch, mainline)) {
					extApproved = true
				}
			}

			// Tier 2: URL-based CLI probing
			if (!extApproved && externalUrl) {
				externalState = checkExternalState(externalUrl)
				if (externalState.status === "approved") {
					extApproved = true
				}
			}

			if (extApproved) {
				const statePath = stageStatePath(slug, currentStage)
				const stateData = readJson(statePath)
				stateData.gate_outcome = "advanced"
				writeJson(statePath, stateData)
				emitTelemetry("haiku.gate.resolved", {
					intent: slug,
					stage: currentStage,
					gate_type: "external",
					outcome: "approved",
				})
				// Fall through to advance logic (auto-gate or non-auto gate
				// will see gate_outcome "advanced" and advance the stage)
			} else if (externalState.status === "changes_requested") {
				return handleExternalChangesRequested(
					slug,
					currentStage,
					externalUrl,
					externalState.provider,
				)
			} else if (externalUrl) {
				return {
					action: "awaiting_external_review",
					intent: slug,
					stage: currentStage,
					external_review_url: externalUrl,
					message: `Stage '${currentStage}' is awaiting external review at: ${externalUrl}. Neither branch merge detection nor CLI-based check detected approval yet. Run /haiku:pickup after the review is approved.`,
				}
			}
			// No URL or approval detected via branch merge — fall through to
			// re-show the gate review UI so the user can provide the URL or
			// confirm approval.
		}

		const reviewType = resolveStageReview(studio, currentStage)
		const stageIdx = studioStages.indexOf(currentStage)
		const nextStage =
			stageIdx < studioStages.length - 1 ? studioStages[stageIdx + 1] : null

		const gitAvailable = isGitRepo()

		// Auto gates: advance without user interaction.
		// "auto" review type means the studio author trusts the FSM to advance
		// without human approval. Skip the gate UI entirely regardless of mode —
		// discrete mode affects branching strategy, not review type semantics.
		if (reviewType === "auto") {
			emitTelemetry("haiku.gate.auto_advanced", {
				intent: slug,
				stage: currentStage,
				gate_context: "stage_gate",
			})
			if (nextStage) {
				fsmAdvanceStage(slug, currentStage, nextStage)
				return {
					action: "advance_stage",
					intent: slug,
					studio,
					stage: currentStage,
					next_stage: nextStage,
					gate_outcome: "advanced",
					message: `Auto-gate passed — advancing to '${nextStage}'. Call haiku_run_next { intent: "${slug}" } immediately.`,
				}
			}
			fsmCompleteStage(slug, currentStage, "advanced")
			fsmIntentComplete(slug)
			return {
				action: "intent_complete",
				intent: slug,
				studio,
				message: `Auto-gate passed — all stages complete for intent '${slug}'`,
			}
		}

		// Non-auto gates: open review UI
		let effectiveGateType: string
		if (!gitAvailable && reviewType.includes("external")) {
			// Non-git environment: external gates have no structural signal (no branch
			// merge to detect). Fall back to ask — local human approval is the only
			// safe option. For compound gates like "external,ask", strip external.
			const remaining = reviewType
				.split(",")
				.filter((t) => t !== "external")
				.join(",")
			effectiveGateType = remaining || "ask"
		} else if (reviewType === "ask") {
			effectiveGateType = "ask"
		} else if (reviewType === "await") {
			effectiveGateType = "external"
		} else {
			// Compound gates (e.g., "external,ask") pass through as-is
			effectiveGateType = reviewType
		}

		fsmGateAsk(slug, currentStage)
		return {
			action: "gate_review",
			intent: slug,
			studio,
			stage: currentStage,
			next_stage: nextStage,
			gate_type: effectiveGateType,
			message: `Stage '${currentStage}' complete — opening review`,
		}
	}

	// Stage completed — find next (or wait for external approval)
	if (stageStatus === "completed") {
		const gateOutcome = (stageState.gate_outcome as string) || "advanced"

		// Blocked on external review — check if approved or changes requested
		if (gateOutcome === "blocked") {
			let approved = false
			let externalState: ExternalReviewState = { status: "unknown" }
			const externalUrl = (stageState.external_review_url as string) || ""

			// Tier 1: Branch merge detection (structural, tamper-resistant)
			if (isGitRepo()) {
				const stageBranch = `haiku/${slug}/${currentStage}`
				const mainline = `haiku/${slug}/main`
				if (isBranchMerged(stageBranch, mainline)) {
					approved = true
				}
			}

			// Tier 2: URL-based CLI probing (fallback)
			if (!approved && externalUrl) {
				externalState = checkExternalState(externalUrl)
				if (externalState.status === "approved") {
					approved = true
				}
			}

			if (approved) {
				// External approval detected — advance
				const statePath = stageStatePath(slug, currentStage)
				const stateData = readJson(statePath)
				stateData.gate_outcome = "advanced"
				writeJson(statePath, stateData)
				emitTelemetry("haiku.gate.resolved", {
					intent: slug,
					stage: currentStage,
					gate_type: "external",
					outcome: "approved",
				})
				// Fall through to advance logic below
			} else if (externalState.status === "changes_requested") {
				return handleExternalChangesRequested(
					slug,
					currentStage,
					externalUrl,
					externalState.provider,
				)
			} else {
				return {
					action: "awaiting_external_review",
					intent: slug,
					stage: currentStage,
					...(externalUrl ? { external_review_url: externalUrl } : {}),
					message: externalUrl
						? `Stage '${currentStage}' is awaiting external review at: ${externalUrl}. Neither branch merge detection nor CLI-based check detected approval yet. Run /haiku:pickup after the review is approved.`
						: `Stage '${currentStage}' is awaiting external review but no review URL was recorded. Run /haiku:pickup after the review is approved.`,
				}
			}
		}

		const stageIdx = studioStages.indexOf(currentStage)
		const nextStage =
			stageIdx < studioStages.length - 1 ? studioStages[stageIdx + 1] : null
		if (!nextStage) {
			fsmIntentComplete(slug)
			return {
				action: "intent_complete",
				intent: slug,
				studio,
				message: `All stages complete for intent '${slug}'`,
			}
		}
		const hats = resolveStageHats(studio, nextStage)

		// FSM side effect: start next stage
		try {
			fsmStartStage(slug, nextStage)
		} catch (err) {
			return {
				action: "error",
				message: err instanceof Error ? err.message : String(err),
			}
		}

		return {
			action: "start_stage",
			intent: slug,
			studio,
			stage: nextStage,
			hats,
			phase: "elaborate",
			stage_metadata: resolveStageMetadata(studio, nextStage),
			message: `Start stage '${nextStage}'`,
		}
	}

	return {
		action: "error",
		message: `Unknown state for stage '${currentStage}' — phase: ${phase}, status: ${stageStatus}`,
	}
}

// ── Composite orchestration ────────────────────────────────────────────────

function runNextComposite(
	slug: string,
	intent: Record<string, unknown>,
	_intentDirPath: string,
): OrchestratorAction {
	const composite = intent.composite as Array<{
		studio: string
		stages: string[]
	}>
	const compositeState = (intent.composite_state || {}) as Record<
		string,
		string
	>
	const syncRules = (intent.sync || []) as Array<{
		wait: string[]
		then: string[]
	}>

	// Find the first runnable studio:stage
	for (const entry of composite) {
		const current = compositeState[entry.studio] || entry.stages[0]
		if (current === "complete") continue
		if (!entry.stages.includes(current)) continue

		// Check sync points
		let blocked = false
		for (const rule of syncRules) {
			for (const thenStage of rule.then) {
				if (thenStage === `${entry.studio}:${current}`) {
					for (const waitStage of rule.wait) {
						const [ws, wst] = waitStage.split(":")
						const wsState = compositeState[ws] || ""
						const wsStages =
							composite.find((c) => c.studio === ws)?.stages || []
						const wsIdx = wsStages.indexOf(wst)
						const currentIdx = wsStages.indexOf(wsState)
						if (currentIdx <= wsIdx) {
							blocked = true
							break
						}
					}
					if (blocked) break
				}
			}
			if (blocked) break
		}

		if (!blocked) {
			return {
				action: "composite_run_stage",
				intent: slug,
				studio: entry.studio,
				stage: current,
				hats: resolveStageHats(entry.studio, current),
				message: `Composite: run '${entry.studio}:${current}'`,
			}
		}
	}

	// Check if all complete
	const allComplete = composite.every(
		(e) => compositeState[e.studio] === "complete",
	)
	if (allComplete) {
		fsmIntentComplete(slug)
		return {
			action: "intent_complete",
			intent: slug,
			message: `All composite studios complete for '${slug}'`,
		}
	}

	return {
		action: "blocked",
		intent: slug,
		message: "All runnable stages are sync-blocked — waiting for dependencies",
	}
}

// ── Unit listing with dependency resolution ────────────────────────────────

interface UnitInfo {
	name: string
	status: string
	hat: string
	bolt: number
	dependsOn: string[]
	depsComplete: boolean
}

function listUnits(intentDirPath: string, stage: string): UnitInfo[] {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return []

	const files = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	const units: UnitInfo[] = files.map((f) => {
		const fm = readFrontmatter(join(unitsDir, f))
		return {
			name: f.replace(".md", ""),
			status: (fm.status as string) || "pending",
			hat: (fm.hat as string) || "",
			bolt: (fm.bolt as number) || 0,
			dependsOn: (fm.depends_on as string[]) || [],
			depsComplete: false,
		}
	})

	// Resolve dependency completion
	const statusMap = new Map(units.map((u) => [u.name, u.status]))
	for (const unit of units) {
		unit.depsComplete = unit.dependsOn.every(
			(dep) => statusMap.get(dep) === "completed",
		)
	}

	return units
}

/**
 * Build a DAGGraph from UnitInfo[] and compute wave assignments.
 * Returns { waves, unitWave, totalWaves } where:
 *  - waves: Map<waveNumber, unitName[]>
 *  - unitWave: Map<unitName, waveNumber>
 *  - totalWaves: total number of waves
 */
function computeUnitWaves(units: UnitInfo[]): {
	waves: Map<number, string[]>
	unitWave: Map<string, number>
	totalWaves: number
} {
	// Build a DAGGraph from UnitInfo[]
	const nodes = units.map((u) => ({ id: u.name, status: u.status }))
	const edges: Array<{ from: string; to: string }> = []
	const adjacency = new Map<string, string[]>()

	for (const u of units) {
		adjacency.set(u.name, [])
	}
	for (const u of units) {
		for (const dep of u.dependsOn) {
			if (!adjacency.has(dep)) continue // cross-stage dep — skip
			edges.push({ from: dep, to: u.name })
			const existing = adjacency.get(dep)
			if (existing) {
				existing.push(u.name)
			}
		}
	}

	const dag: DAGGraph = { nodes, edges, adjacency }
	let waves: Map<number, string[]>
	try {
		waves = computeWaves(dag)
	} catch {
		// Cycle — put all in wave 0 as fallback (cycle should be caught earlier at elaborate→execute)
		waves = new Map([[0, units.map((u) => u.name)]])
	}

	// Build reverse map: unit name → wave number
	const unitWave = new Map<string, number>()
	let totalWaves = 0
	for (const [wave, names] of waves) {
		for (const name of names) {
			unitWave.set(name, wave)
		}
		if (wave + 1 > totalWaves) totalWaves = wave + 1
	}

	return { waves, unitWave, totalWaves }
}

/**
 * Find the current wave: the lowest wave number that still has pending units.
 */
function currentWaveNumber(
	units: UnitInfo[],
	unitWave: Map<string, number>,
	totalWaves: number,
): number {
	for (let w = 0; w < totalWaves; w++) {
		const hasIncomplete = units.some(
			(u) => unitWave.get(u.name) === w && u.status !== "completed",
		)
		if (hasIncomplete) return w
	}
	return 0
}

// ── Go back (stage/phase regression) ──────────────────────────────────────

function revisit(slug: string, requestedStage?: string): OrchestratorAction {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	if (!existsSync(intentFile)) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}

	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""
	if (!studio) {
		return {
			action: "error",
			message: `Intent '${slug}' has no studio selected. Call haiku_select_studio first.`,
		}
	}
	const currentActiveStage = (intent.active_stage as string) || ""

	if (!currentActiveStage) {
		return { action: "error", message: "No active stage to revisit from" }
	}

	const allStages = resolveStudioStages(studio)
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStages.filter((s) => !skipStages.includes(s))
	const currentIdx = studioStages.indexOf(currentActiveStage)

	if (currentIdx < 0) {
		return {
			action: "error",
			message: `Active stage '${currentActiveStage}' is not in the studio's stage list: [${studioStages.join(", ")}]. Run haiku_repair to fix.`,
		}
	}

	// If a specific stage was requested, validate and jump there
	if (requestedStage) {
		const targetIdx = studioStages.indexOf(requestedStage)
		if (targetIdx < 0) {
			return {
				action: "error",
				message: `Stage '${requestedStage}' not found in studio stages: [${studioStages.join(", ")}]`,
			}
		}
		if (targetIdx > currentIdx) {
			return {
				action: "error",
				message: `Cannot revisit '${requestedStage}' — it's ahead of current stage '${currentActiveStage}'. Use haiku_run_next to advance.`,
			}
		}
		if (targetIdx === currentIdx) {
			// Same stage — reset to elaborate
			return revisitCurrentStage(slug, iDir, intentFile, currentActiveStage)
		}
		// Jump to the requested earlier stage
		return revisitEarlierStage(
			slug,
			iDir,
			intentFile,
			currentActiveStage,
			requestedStage,
		)
	}

	// No stage specified — infer target from current position
	// If in execute/review/gate → revisit elaborate in current stage
	const path = stageStatePath(slug, currentActiveStage)
	const stageState = readJson(path)
	const currentPhase = (stageState.phase as string) || "elaborate"

	if (currentPhase !== "elaborate") {
		return revisitCurrentStage(slug, iDir, intentFile, currentActiveStage)
	}

	// Already in elaborate → revisit previous stage
	if (currentIdx <= 0) {
		return {
			action: "error",
			message: `Already at the first stage ('${currentActiveStage}') — cannot revisit further back`,
		}
	}

	const targetStage = studioStages[currentIdx - 1]
	return revisitEarlierStage(
		slug,
		iDir,
		intentFile,
		currentActiveStage,
		targetStage,
	)
}

function uncompleteIntent(intentFile: string): void {
	const intent = readFrontmatter(intentFile)
	if (intent.status === "completed") {
		setFrontmatterField(intentFile, "status", "active")
		setFrontmatterField(intentFile, "completed_at", null)
	}
}

function revisitCurrentStage(
	slug: string,
	iDir: string,
	intentFile: string,
	currentActiveStage: string,
): OrchestratorAction {
	const path = stageStatePath(slug, currentActiveStage)
	const stageState = readJson(path)
	const currentPhase = (stageState.phase as string) || "elaborate"

	stageState.phase = "elaborate"
	stageState.gate_entered_at = null
	stageState.gate_outcome = null
	writeJson(path, stageState)

	// If the intent was marked completed, revisit reactivates it
	uncompleteIntent(intentFile)

	// In discrete mode, merge main into the current stage branch (non-destructive)
	// and clean up unit worktrees so the re-queued units start fresh. We keep the
	// stage branch history so feedback files and partial artifacts from prior
	// attempts are preserved — the unit state reset below re-queues the work
	// without losing context.
	const branchMode = resolveEffectiveBranchMode(slug, currentActiveStage)
	if (branchMode === "discrete") {
		gitCommitState(`haiku: revisit elaborate ${currentActiveStage} (pre-merge)`)
		cleanupIntentWorktrees(slug)
		const prepared = prepareRevisitBranch(
			slug,
			currentActiveStage,
			currentActiveStage,
		)
		if (!prepared.success) {
			return {
				action: "error",
				message: `Failed to prepare stage branch '${currentActiveStage}' for revisit: ${prepared.message}. Resolve conflicts on the stage branch manually, then retry.`,
			}
		}
	}

	// Re-queue all units to pending
	const unitsDir = join(iDir, "stages", currentActiveStage, "units")
	if (existsSync(unitsDir)) {
		const files = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
		for (const f of files) {
			const unitFile = join(unitsDir, f)
			setFrontmatterField(unitFile, "status", "pending")
			setFrontmatterField(unitFile, "bolt", 0)
			setFrontmatterField(unitFile, "hat", "")
			setFrontmatterField(unitFile, "started_at", null)
			setFrontmatterField(unitFile, "completed_at", null)
		}
	}

	emitTelemetry("haiku.revisit.phase", {
		intent: slug,
		stage: currentActiveStage,
		from_phase: currentPhase,
		to_phase: "elaborate",
	})
	gitCommitState(`haiku: revisit elaborate in ${currentActiveStage}`)

	return {
		action: "revisited",
		intent: slug,
		stage: currentActiveStage,
		target_phase: "elaborate",
		message: `Revisiting elaborate phase in stage '${currentActiveStage}' — all units re-queued`,
	}
}

function revisitEarlierStage(
	slug: string,
	iDir: string,
	intentFile: string,
	fromStage: string,
	targetStage: string,
): OrchestratorAction {
	// Only the target stage is reset. Intermediate stages between target and
	// fromStage keep their completed status — when the agent finishes the
	// revisited stage and calls haiku_run_next, the FSM's consistency check
	// sees them as completed and fast-forwards through to the next incomplete
	// stage. This is intentional: revisit fixes one stage without forcing a
	// full replay of everything that came after.

	// In discrete mode, merge BOTH intent main (approved upstream) AND the
	// fromStage branch (unapproved future-stage work — feedback files and
	// in-flight artifacts) into the target stage branch. This ensures feedback
	// and artifacts raised on fromStage survive the revisit even when they
	// haven't been merged into intent main yet. Non-destructive: the target
	// stage branch's own history is preserved; the unit state reset below
	// re-queues the work without losing context.
	const branchMode = resolveEffectiveBranchMode(slug, targetStage)
	if (branchMode === "discrete") {
		gitCommitState(`haiku: revisit from ${fromStage}`)
		// Clean up unit worktrees tied to the target stage first so the
		// re-queued units start fresh.
		cleanupIntentWorktrees(slug)
		const prepared = prepareRevisitBranch(slug, fromStage, targetStage)
		if (!prepared.success) {
			return {
				action: "error",
				message: `Failed to prepare stage branch '${targetStage}' for revisit from '${fromStage}': ${prepared.message}. Resolve conflicts on the target branch manually, then retry.`,
			}
		}
	}

	// Reset the target stage's state
	const targetPath = stageStatePath(slug, targetStage)
	const data: Record<string, unknown> = {
		stage: targetStage,
		status: "active",
		phase: "elaborate",
		started_at: timestamp(),
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
	}
	writeJson(targetPath, data)

	// Re-queue all units in the target stage to pending
	const unitsDir = join(iDir, "stages", targetStage, "units")
	if (existsSync(unitsDir)) {
		const files = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
		for (const f of files) {
			const unitFile = join(unitsDir, f)
			setFrontmatterField(unitFile, "status", "pending")
			setFrontmatterField(unitFile, "bolt", 0)
			setFrontmatterField(unitFile, "hat", "")
			setFrontmatterField(unitFile, "started_at", null)
			setFrontmatterField(unitFile, "completed_at", null)
		}
	}

	// Update intent's active_stage
	setFrontmatterField(intentFile, "active_stage", targetStage)

	// If the intent was marked completed, revisit reactivates it
	uncompleteIntent(intentFile)

	emitTelemetry("haiku.revisit.stage", {
		intent: slug,
		from_stage: fromStage,
		to_stage: targetStage,
	})
	gitCommitState(`haiku: revisit stage ${targetStage}`)

	return {
		action: "revisited",
		intent: slug,
		target_stage: targetStage,
		reset_phase: "elaborate",
		message: `Revisiting stage '${targetStage}' — stage reset to elaborate, all units re-queued`,
	}
}

// Register runNext callback so state-tools can call it without circular imports
setRunNextHandler(runNext)

// ── Action preview enrichment ─────────────────────────────────────────────
//
// Adds `tell_user` (what the agent should announce) and `next_step` (what
// comes after this action) to every orchestrator action. This lets the
// agent tell the user what's happening and what's coming next.

function enrichActionWithPreview(action: OrchestratorAction): void {
	const stage = (action.stage as string) || ""
	const unit = (action.unit as string) || ""
	const hat = (action.hat as string) || (action.first_hat as string) || ""
	const nextStage = (action.next_stage as string) || ""

	let tell_user = ""
	let next_step = ""

	switch (action.action) {
		case "select_studio":
			tell_user =
				"I need to select a lifecycle studio for this intent before we can begin."
			next_step =
				"After studio selection, the first stage will start with elaboration."
			break

		case "start_stage":
			tell_user = `Starting stage '${stage}' — I'll elaborate the work into units with completion criteria.`
			next_step =
				"Next I'll break the work down into units, then validate them and open a review gate for your approval."
			break

		case "elaborate": {
			const iteration =
				(action.iteration as number) || (action.visits as number) || 0
			const fbCount = (action.pending_feedback as unknown[])?.length || 0
			const validationErr = action.validation_error as string | undefined
			if (iteration > 1) {
				tell_user = validationErr
					? `Revisiting stage '${stage}' (iteration ${iteration}) — fixing validation on in-flight units before advancing.`
					: `Revisiting stage '${stage}' (iteration ${iteration}) — ${fbCount} pending feedback item(s) to address with new units.`
				next_step =
					"I'll draft units that close each pending feedback item, then advance to execution once validated."
			} else {
				tell_user = `Elaborating stage '${stage}' — defining units of work and their completion criteria.`
				next_step =
					"After units are defined, the orchestrator validates them and opens a review gate for your approval before execution begins."
			}
			break
		}

		case "elaboration_insufficient":
			tell_user = `I need to engage you more on the plan for stage '${stage}' before finalizing.`
			next_step =
				"After sufficient collaboration, I'll finalize units and open the review gate."
			break

		case "gate_review": {
			const gateContext = (action.gate_context as string) || "stage_gate"
			if (gateContext === "intent_review") {
				tell_user =
					"The intent specs are ready — opening the review gate for your approval."
				next_step =
					"After approval, execution begins. If changes are requested, I'll revise and re-submit."
			} else if (gateContext === "elaborate_to_execute") {
				tell_user =
					"Unit specs are validated — opening the review gate for your approval before execution."
				next_step =
					"After approval, I'll begin executing units in wave order. If changes are requested, I'll revise the specs."
			} else {
				tell_user = `Stage '${stage}' is complete — opening the review gate.`
				next_step = nextStage
					? `After approval, I'll advance to stage '${nextStage}'. If changes are requested, I'll address the feedback.`
					: "After approval, the intent is complete."
			}
			break
		}

		case "intent_approved":
			tell_user = "Intent approved — moving to execution."
			next_step = "I'll begin executing units in wave order."
			break

		case "advance_phase": {
			const toPhase = (action.to_phase as string) || ""
			if (toPhase === "execute") {
				tell_user = `Specs approved for stage '${stage}' — beginning execution.`
				next_step = "I'll execute units in wave order, one hat at a time."
			} else if (toPhase === "review") {
				tell_user = `All units complete in stage '${stage}' — moving to review.`
				next_step =
					"I'll run quality gates and adversarial review agents, then open the stage gate."
			} else if (toPhase === "gate") {
				tell_user = `Review complete for stage '${stage}' — moving to the gate.`
				next_step =
					"The stage gate will determine whether to advance, request changes, or send for external review."
			} else {
				tell_user = `Advancing stage '${stage}' to ${toPhase} phase.`
				next_step = ""
			}
			break
		}

		case "start_unit":
			tell_user = `Starting unit '${unit}' with hat '${hat}' in stage '${stage}'.`
			next_step =
				"I'll execute the unit work per the hat definition, then advance to the next hat or next unit."
			break

		case "start_units": {
			const units = (action.units as string[]) || []
			tell_user = `Starting ${units.length} units in parallel: ${units.join(", ")}.`
			next_step = isGitRepo()
				? "Each unit runs in its own worktree. After all complete, the next wave starts or we advance to review."
				: "After all units complete, the next wave starts or we advance to review."
			break
		}

		case "continue_unit":
			tell_user = `Continuing unit '${unit}' — hat: ${hat}, bolt: ${action.bolt || 1}.`
			next_step =
				"I'll continue the work, then advance to the next hat or complete the unit."
			break

		case "continue_units": {
			const entries =
				(action.units as Array<{ name: string; hat: string; bolt: number }>) ||
				[]
			tell_user = `Continuing ${entries.length} units in parallel: ${entries.map((u) => `${u.name}(${u.hat}#${u.bolt})`).join(", ")}.`
			next_step =
				"Each active unit resumes in its own worktree. After all subagents return, the FSM advances."
			break
		}

		case "escalate": {
			const escReason = (action.reason as string) || "unknown"
			const escIteration = (action.iteration as number) || 0
			const escMax = (action.max_iterations as number) || MAX_STAGE_ITERATIONS
			tell_user =
				escReason === "loop_detected"
					? `Stage '${stage}' is stuck in a loop — iteration ${escIteration} regenerated the same feedback set as iteration ${escIteration - 1}.`
					: `Stage '${stage}' hit the ${escMax}-iteration ceiling (now at ${escIteration}) — stopping the autonomous loop.`
			next_step =
				"STOP. Surface this to the human: the autonomous loop is halted. Do NOT call haiku_run_next again until the human makes a decision (reject feedback items, use haiku_revisit to force another cycle, or terminate the intent)."
			break
		}

		case "review":
			tell_user = `Quality gates passed — running adversarial review agents for stage '${stage}'.`
			next_step = "After review agents pass, the stage gate opens for approval."
			break

		case "fix_quality_gates":
			tell_user = `Quality gates failed in stage '${stage}' — I need to fix the issues before review.`
			next_step =
				"After fixing, I'll retry the quality gates and then proceed to adversarial review."
			break

		case "advance_stage":
			tell_user = `Stage '${stage}' complete — advancing to '${nextStage}'.`
			next_step = nextStage
				? `I'll start stage '${nextStage}' with elaboration.`
				: "The intent is complete."
			break

		case "intent_complete":
			tell_user = "All stages are complete — the intent is done."
			next_step = ""
			break

		case "changes_requested":
			tell_user =
				"Changes were requested on the review — I'll address the feedback."
			next_step = "After revisions, I'll re-submit for review."
			break

		case "external_review_requested":
			tell_user = `Stage '${stage}' needs external review — submit the work through your project's review process.`
			next_step = "After external approval, run /haiku:pickup to continue."
			break

		case "awaiting_external_review":
			tell_user = `Stage '${stage}' is waiting on external review.`
			next_step = "Run /haiku:pickup after the review is approved."
			break

		case "blocked":
			tell_user = `Some units in stage '${stage}' are blocked — dependencies not met.`
			next_step = "Unblock the dependencies, then retry."
			break

		case "design_direction_required":
			tell_user = `Stage '${stage}' requires a design direction selection before proceeding.`
			next_step = "After you select a direction, elaboration continues."
			break

		case "outputs_missing":
			tell_user = `Stage '${stage}' is missing required output artifacts.`
			next_step = "Create the missing artifacts, then retry."
			break

		case "discovery_missing":
			tell_user = `Stage '${stage}' is missing required discovery artifacts.`
			next_step = "Create the missing artifacts, then retry."
			break

		case "unresolved_dependencies":
			tell_user =
				"Some unit dependencies reference units that don't exist — I need to fix the references."
			next_step = "After fixing, I'll retry advancement."
			break

		case "dag_cycle_detected":
			tell_user =
				"A dependency cycle was detected in the unit graph — I need to break the cycle."
			next_step = "After fixing, I'll retry advancement."
			break

		case "unit_naming_invalid":
			tell_user =
				"Some unit files don't follow the required naming convention — I need to rename them."
			next_step = "After fixing, I'll retry advancement."
			break

		case "spec_validation_failed":
			tell_user =
				"Unit specs failed validation against the stage's allowed types — I need to fix them."
			next_step = "After fixing, I'll retry advancement."
			break

		case "inputs_missing":
			tell_user =
				"Some units are missing required input references — I need to add them."
			next_step = "After fixing, I'll retry advancement."
			break

		case "gate_blocked":
			tell_user =
				"Gate review couldn't be completed — the review UI and elicitation both failed."
			next_step = "Run haiku_run_next again to retry the gate review."
			break

		case "complete":
			tell_user = "Intent is already completed."
			next_step = ""
			break

		case "composite_run_stage":
			tell_user = `Running composite stage '${stage}'.`
			next_step = "The composite orchestrator will advance through sub-stages."
			break

		case "error":
			tell_user = (action.message as string) || "An error occurred."
			next_step = ""
			break

		default:
			break
	}

	if (tell_user) action.tell_user = tell_user
	if (next_step) action.next_step = next_step
}

// ── Inline subagent context for hookless harnesses ────────────────────────
//
// When hooks are available (Claude Code, Kiro), the subagent-hook injects
// hat isolation, workflow rules, and bootstrap instructions automatically.
// For hookless harnesses, we must inline this context directly into the
// orchestrator's instructions so the agent (or its subagent equivalent)
// receives the same guidance.

/**
 * Read a file from disk and emit it as a fenced markdown block with a
 * heading. Used to inline referenced files into subagent prompts so the
 * subagent reads ONE file (the prompt tmpfile) instead of fanning out N
 * Read tool calls.
 *
 * Returns "" if the file doesn't exist (caller decides whether to include).
 * Large files are NOT truncated — size is bounded by the studio's file
 * design, not this function.
 */
/**
 * Standard error-recovery appendix for subagent prompts. Documents the
 * shape of advance_hat / reject_hat error responses and the correct
 * recovery for each. Without this, subagents stuck on scope violations
 * get only an opaque error JSON and try wrong things (e.g. git checkout).
 */
const SUBAGENT_ERROR_RECOVERY = [
	"## Error Recovery (if advance_hat / reject_hat returns an error)",
	"",
	"Tool responses containing `\"error\": \"...\"` mean the FSM refused the action. Read the `message` field — it describes the exact fix. Common errors and recovery:",
	"",
	"- `unit_scope_violation` (from advance_hat) / `unit_scope_violation_on_reject` (from reject_hat) — your unit worktree contains commits that wrote files outside the stage's declared scope. **`git checkout HEAD -- <file>` is a NO-OP on committed files.** Use ONE of:",
	"  - `git reset --hard $(git merge-base HEAD <stage-branch>)` — drops ALL unit commits (recommended early in a unit)",
	"  - `git rm <file> && git commit --amend --no-edit` — removes a single file from the latest commit",
	"  - `git revert --no-edit <commit-sha>` — creates a new commit that undoes a bad commit",
	"  Then re-run `git add -A && git commit` if needed, and retry `advance_hat` / `reject_hat`.",
	"- `unit_outputs_empty` — your unit made no tracked writes. Either produce an artifact in a scope-allowed path and commit, or explicitly add paths to the unit's `outputs:` frontmatter field if they exist outside auto-detection.",
	"- `unit_outputs_missing` — a declared output path doesn't exist on disk. Create it, or remove the path from `outputs:` if declared in error.",
	"- `unit_outputs_escaped` — a declared output path resolves outside the intent dir. Fix the path to be intent-relative or repo-relative; absolute paths and `..` escapes are rejected.",
	"- `hat_too_fast` — less than 30 seconds since hat start. Do real work before advancing.",
	"- `max_bolts_exceeded` — unit hit the iteration ceiling. Stop and report to the user; this needs human intervention.",
	"",
	"After fixing the underlying issue, call the SAME tool again (advance_hat or reject_hat as appropriate). Do NOT call haiku_run_next as a bypass — the FSM will return the same error.",
	"",
	"**Persistent advance failure?** If `advance_hat` keeps returning `unit_scope_violation` and you cannot clear it in-place, call `reject_hat` instead. reject_hat tracks consecutive scope-violation attempts and escalates via `max_bolts_exceeded` after 5, surfacing the stuck state to the user. advance_hat has no such ceiling on its own — reject_hat is the correct escape.",
].join("\n")

function inlineFile(absPath: string, heading: string): string {
	if (!existsSync(absPath)) return ""
	const raw = readFileSync(absPath, "utf8")
	// Strip YAML frontmatter before inlining. Frontmatter carries FSM
	// metadata (name, agent_type, model, scope, location, format, required,
	// etc.) that the orchestrator already consumed — the subagent should
	// see only the authoritative body. Including frontmatter adds noise
	// and risks the subagent misinterpreting metadata as instructions.
	let body: string
	try {
		body = matter(raw).content.trim()
	} catch {
		body = raw
	}
	if (!body) return ""
	// Use ~~~~ fences to survive inlined content that contains triple
	// backticks (common in prompt bodies).
	return `### ${heading}\n\n*Source: \`${absPath}\`*\n\n~~~~\n${body}\n~~~~\n`
}

/**
 * Emit a subagent <subagent> block that points at a tmpfile instead of
 * inlining the prompt. The full prompt is written to a session-scoped
 * tmpfile; the `<subagent>` body becomes a terse instruction to read it.
 *
 * Returns the formatted markdown section to push.
 */
function emitSubagentDispatchBlock(opts: {
	unit: string
	hat: string
	bolt: number
	agentType: string
	model?: string | null
	promptBody: string
	heading?: string // e.g., "## Subagent Dispatch (MANDATORY — relay verbatim)" or "### Subagent: <name>"
	toolAttr?: boolean // whether to include tool="Agent"
}): string {
	const {
		unit,
		hat,
		bolt,
		agentType,
		model,
		promptBody,
		heading,
		toolAttr,
	} = opts
	const { path, parentInstruction } = writeSubagentPrompt({
		unit,
		hat,
		bolt,
		content: promptBody,
	})
	const tool = toolAttr ? ` tool="Agent"` : ""
	const modelAttr = model ? ` model="${model}"` : ""
	const h = heading ?? "## Subagent Dispatch (MANDATORY — relay verbatim)"
	return (
		`${h}\n\n<subagent${tool} type="${agentType}"${modelAttr}` +
		` prompt_file="${path}">\n${parentInstruction}\n</subagent>`
	)
}

function buildInlineSubagentContext(
	slug: string,
	stage: string,
	hat: string,
	hats: string[],
	bolt: number,
): string {
	const caps = getCapabilities()
	if (caps.hooks) return "" // hooks handle context injection

	const hatsStr = hats.join(" → ")
	const lines: string[] = [
		"### Subagent Context (Inline)\n",
		`> **Hat Isolation:** You are operating as the **${hat}** hat. Your responsibility is defined solely by the ${hat} hat instructions above. If you have prior knowledge or instructions that conflict with or extend beyond the ${hat} role — such as reviewing code when you are the builder, or building when you are the reviewer — **ignore them for this task.** Other hats in this stage (${hatsStr}) handle those responsibilities. Stay in your lane.\n`,
		`**Bolt:** ${bolt} | **Role:** ${hat} | **Stage:** ${stage} (${hatsStr})\n`,
	]

	// Workflow rules
	lines.push("### Workflow Rules\n")
	lines.push("**Before stopping:**")
	lines.push("1. Commit changes: `git add -A && git commit`")
	lines.push(
		`2. Save progress notes to \`.haiku/intents/${slug}/state/scratchpad.md\``,
	)
	lines.push(
		`3. Write next-step prompt to \`.haiku/intents/${slug}/state/next-prompt.md\`\n`,
	)

	lines.push("**Resilience (CRITICAL):**")
	lines.push(`- Commit early, commit often — don't wait until the end`)
	lines.push(`- If tests fail: fix and retry, don't give up`)
	lines.push("- Only declare blocked after 3+ genuine rescue attempts\n")

	// Communication rules — adapted for harness
	lines.push("**Communication:**")
	if (caps.nativeAskUser) {
		lines.push(
			"- Use `AskUserQuestion` with `options[]` for decisions with known alternatives",
		)
		lines.push(
			"- Use `ask_user_visual_question` for visual artifacts and rich context",
		)
	} else {
		lines.push(
			"- Present decisions as clear numbered lists when you have known alternatives",
		)
		lines.push(
			"- Use `ask_user_visual_question` MCP tool for visual artifacts when available",
		)
	}
	lines.push("- Break independent questions into separate interactions\n")

	return lines.join("\n")
}

// ── Run instruction builder ───────────────────────────────────────────────

function buildRunInstructions(
	slug: string,
	studio: string,
	action: OrchestratorAction,
	dir: string,
): string {
	// Strip tell_user/next_step from the JSON output — they appear in the
	// announcement section already, no need to duplicate in the raw action.
	const { tell_user, next_step, ...actionForJson } =
		action as OrchestratorAction & { tell_user?: string; next_step?: string }
	const actionJson = JSON.stringify(actionForJson, null, 2)
	const sections: string[] = []

	// Agent announcement directive — tell the user what's happening
	if (tell_user || next_step) {
		const parts: string[] = [
			"## Announce to User (MANDATORY)\n",
			`**Before doing ANY work**, tell the user what you're about to do:`,
		]
		if (tell_user) parts.push(`> ${tell_user}`)
		if (next_step) parts.push(`\n_${next_step}_`)
		parts.push(
			"\nKeep the announcement concise — one or two sentences. Do NOT skip this step.",
		)
		sections.push(parts.join("\n"))
	}

	sections.push(`## Orchestrator Action\n\n\`\`\`json\n${actionJson}\n\`\`\``)

	switch (action.action) {
		case "select_studio": {
			sections.push(
				`## Studio Selection Required\n\nThis intent has no studio selected yet.\n\nCall \`haiku_select_studio { intent: "${slug}" }\` to choose a lifecycle studio.\nThe tool will present available studios via elicitation.`,
			)
			break
		}

		case "start_stage": {
			const stage = action.stage as string
			const hats = (action.hats as string[]) || []
			const stageDef = readStageDef(studio, stage)
			const studioData = readStudio(studio)
			if (studioData?.body) {
				sections.push(`### Studio: ${studio}\n\n${studioData.body}`)
			}
			sections.push(`## Stage: ${stage}`)
			sections.push(`Hats: ${hats.join(" -> ")}`)
			if (stageDef) {
				sections.push(`### Stage Definition\n\n${stageDef.body}`)
			}
			if (action.follows) {
				sections.push(
					`### Follow-up Context\n\nThis intent follows "${action.follows}". ` +
						`Load parent knowledge artifacts: ${JSON.stringify(action.parent_knowledge)}`,
				)
			}
			sections.push(
				`### Instructions\n\nStage has been started by the orchestrator (status: active, phase: elaborate).\n\n${
					action.follows
						? `1. Load parent knowledge via \`haiku_knowledge_read\` for each file in parent_knowledge\n2. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`
						: `1. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`
				}`,
			)
			break
		}

		case "elaborate": {
			const stage = action.stage as string
			const elaboration = (action.elaboration as string) || "collaborative"
			const stageDef = readStageDef(studio, stage)
			const iteration =
				(action.iteration as number) || (action.visits as number) || 0
			const completedUnits = (action.completed_units as string[]) || []
			const pendingFeedback =
				(action.pending_feedback as Array<{
					feedback_id: string
					title: string
					origin: string
					author: string
					status: string
					file: string
				}>) || []
			const validationError = action.validation_error as string | undefined

			// Revisit mode (iteration > 1): emit a focused additive-elaboration
			// block instead of re-running discovery/input-resolution. The prior
			// iteration handled all that; we're here to address new feedback
			// with new units.
			if (iteration > 1) {
				sections.push(
					`## Revisit Elaborate: ${stage} (iteration #${iteration})`,
				)
				if (validationError) {
					sections.push(`### Validation Error\n\n${validationError}`)
				}
				if (completedUnits.length > 0) {
					sections.push(
						`### Frozen Completed Units (read-only)\n\nThe following units from prior iterations are **completed and immutable** — do NOT modify or re-queue them:\n\n${completedUnits.map((u) => `- \`${u}\``).join("\n")}`,
					)
				}
				if (pendingFeedback.length > 0) {
					sections.push(
						`### Pending Feedback (MUST address — READ EACH FILE IN FULL)\n\n${pendingFeedback
							.map(
								(f) =>
									`- **${f.feedback_id}** — ${f.title}\n  - file: \`${f.file}\`\n  - origin: ${f.origin} · author: ${f.author}`,
							)
							.join("\n")}\n\nYou MUST open every file above and read it completely before drafting units. The title is only a handle; the body carries requirements, tests, and acceptance criteria.`,
					)
				}
				sections.push(
					`### Responsibilities\n\n- Read every \`pending_feedback[].file\` in full before drafting — the title is only a handle.\n- Draft one or more new units whose \`closes:\` frontmatter references the feedback items they resolve.\n- Every pending feedback item MUST be referenced by at least one new unit's \`closes:\` (orphans block advancement).\n- Ask the user clarifying questions (\`AskUserQuestion\` with options[]) when trade-offs are unclear; iterate across turns.\n- When the user approves the drafted units, call \`haiku_run_next\` to advance.\n\nInputs (read directly — do not inline summaries, open the actual files):\n- every \`pending_feedback[].file\` listed above\n- \`stage_metadata\` (STAGE.md body + review agents)\n- \`completed_units\` (read-only reference)\n- \`intent.md\` for overall goals`,
				)
				sections.push(
					`### Mechanics\n\n1. Continue the existing file-naming sequence: if the last unit is \`unit-0N-...\`, start new units at \`unit-0(N+1)-...\`.\n2. Each new unit MUST declare \`closes: [FB-NN]\` for every feedback id it addresses.\n3. Every pending feedback item MUST be referenced by at least one new unit's \`closes:\` (orphans block advancement).\n4. Use the unit-file naming convention: \`unit-NN-slug.md\` (kebab-case slug, zero-padded NN).\n5. Call \`haiku_run_next { intent: "${slug}" }\` when done — the orchestrator re-validates and advances.`,
				)
				break
			}

			sections.push(`## Elaborate: ${stage}`)
			if (stageDef) {
				sections.push(`${stageDef.body}`)
			}

			const elaborationOverride = readPhaseOverride(
				studio,
				stage,
				"ELABORATION",
			)
			if (elaborationOverride) {
				sections.push(
					`### Phase: Elaboration Override\n\n${elaborationOverride.body}`,
				)
			}

			// Resolve upstream stage inputs — load actual content from prior stages
			if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
				const inputs = stageDef.data.inputs as Array<{
					stage: string
					discovery?: string
					output?: string
				}>
				const resolved = resolveStageInputs(studio, inputs, dir, slug)
				const found = resolved.filter((r) => r.exists)
				const missing = resolved.filter((r) => !r.exists)

				if (found.length > 0) {
					sections.push(
						"## Upstream Stage Inputs (MANDATORY CONTEXT)\n\n" +
							"These artifacts were produced by prior stages. You **MUST** read and incorporate them.\n" +
							"When creating units, add relevant paths to the `inputs:` frontmatter field so builders have access.\n",
					)
					for (const r of found) {
						const relPath = r.resolvedPath.startsWith(`${dir}/`)
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						sections.push(
							`### ${r.stage}/${r.artifactName} (${r.kind})\n` +
								`**Path:** \`${relPath}\`\n\n` +
								`${sanitizeForContext(r.content?.slice(0, 3000) ?? "", `upstream input: ${r.stage}/${r.artifactName}`)}${(r.content?.length ?? 0) > 3000 ? "\n...(truncated)" : ""}`,
						)
					}
					// Build ref paths for unit creation guidance
					const refPaths = found.map((r) =>
						r.resolvedPath.startsWith(`${dir}/`)
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath,
					)
					sections.push(
						`## Unit Inputs Requirement (MANDATORY)\n\nEvery unit **MUST** have a non-empty \`inputs:\` field in its frontmatter. At minimum, every unit should reference the intent document and discovery docs. Units will be **blocked from execution** if \`inputs:\` is empty.\n\nAvailable upstream artifacts:\n\`\`\`yaml\ninputs:\n${refPaths.map((p) => `  - ${p}`).join("\n")}\n\`\`\`\nInclude all inputs relevant to the unit's scope. Frontend/UI units should reference design artifacts. Backend units should reference behavioral specs and data contracts.`,
					)
				}

				if (missing.length > 0) {
					sections.push(
						`## ⚠ Missing Upstream Artifacts\n\nThe following inputs are declared but do not exist on disk:\n\n${missing.map((r) => `- **${r.stage}/${r.artifactName}** (${r.kind}) — expected at \`${r.resolvedPath}\``).join("\n")}\n\nThese may not have been produced yet, or may have been saved to a different location. If they are critical for this stage, consider using \`haiku_revisit\` to return to the producing stage.`,
					)
				}
			}

			// Discovery fan-out — one subagent per declared discovery artifact.
			// Path-only prompts so the parent context stays light and each subagent
			// reads its own template + intent + stage files directly.
			const discoveryArtifacts: Array<{ name: string; templatePath: string }> =
				[]
			{
				const seen = new Set<string>()
				for (const base of [...studioSearchPaths()].reverse()) {
					const discoveryDir = join(
						base,
						studio,
						"stages",
						stage,
						"discovery",
					)
					if (!existsSync(discoveryDir)) continue
					for (const f of readdirSync(discoveryDir).filter((f) =>
						f.endsWith(".md"),
					)) {
						if (seen.has(f)) continue
						seen.add(f)
						discoveryArtifacts.push({
							name: f.replace(/\.md$/i, "").toLowerCase(),
							templatePath: join(discoveryDir, f),
						})
					}
				}
			}
			if (discoveryArtifacts.length > 0) {
				const artifactNames = discoveryArtifacts
					.map((a) => `\`${a.name}\``)
					.join(", ")
				const plural = discoveryArtifacts.length !== 1 ? "s" : ""
				const intentPath = join(dir, "intent.md")
				const stagePath = resolveStudioFilePath(
					join(studio, "stages", stage, "STAGE.md"),
				)

				let fanOutText = `## Discovery Fan-Out (REQUIRED)\n\nThis stage produces ${discoveryArtifacts.length} discovery artifact${plural}: ${artifactNames}.\n\n**Spawn one subagent per artifact** using the EXACT content between \`<subagent>\` tags as the prompt. Spawn ALL of them in parallel (single response). Your harness maps \`<subagent>\` to whatever one-shot spawn primitive it supports. Each subagent reads its own template + intent + stage files — do NOT inline content into the parent context.\n\n**Deduplication:** Spawn exactly ONE subagent per artifact listed below. If a discovery artifact already exists on disk, skip spawning a subagent for it.\n\n`

				for (const a of discoveryArtifacts) {
					const lines: string[] = [
						`You are researching and producing the "${a.name}" discovery artifact for intent "${slug}" in stage "${stage}" of studio "${studio}".`,
						"",
						"## Required context (inlined below)",
						"The intent goal, stage scope, and your discovery template are embedded below — no need to fan out Read tool calls for them.",
						"",
						inlineFile(intentPath, "Intent goal"),
					]
					if (stagePath) lines.push(inlineFile(stagePath, "Stage scope"))
					lines.push(
						inlineFile(
							a.templatePath,
							`Discovery template: ${a.name} (content guide + quality signals + output location)`,
						),
					)
					lines.push(
						"",
						"## Instructions",
						"",
						"1. Research the problem space along the axis defined by your template.",
						"2. Use the template's Content Guide as the document structure.",
						"3. Meet the template's Quality Signals as your acceptance bar.",
						"4. Write the populated document to the stage's discovery path (as defined in the template's `location:` frontmatter above). **This is your ONLY write path** — any file you write elsewhere is a scope violation.",
						"5. Be thorough — this artifact informs all downstream work.",
					)
					fanOutText +=
						emitSubagentDispatchBlock({
							unit: "discovery",
							hat: a.name,
							bolt: 1,
							agentType: "general-purpose",
							promptBody: lines.join("\n"),
							heading: `### Subagent: \`${a.name}\``,
						}) + "\n\n"
				}

				fanOutText +=
					"### Parent Instructions (do NOT include in subagent prompts)\n\nSpawn each subagent above using the EXACT content between `<subagent>` tags as the prompt. Do NOT modify, summarize, or add to these prompts — they are complete and path-based. When all subagents return, proceed to the unit-decomposition step using the produced artifacts as your inputs."

				sections.push(fanOutText)
			}

			// Output template definitions — inform the elaboration agent what this stage must produce
			const outputExpectations = buildOutputRequirements(
				studio,
				stage,
				"## Stage Output Expectations\n\nThis stage must ultimately produce the following outputs during execution. Plan units accordingly:",
			)
			if (outputExpectations) sections.push(outputExpectations)

			// Detect design stages and add MCP provider instructions
			const stageHats = (stageDef?.data?.hats as string[]) || []
			const isDesignStage =
				stage.includes("design") ||
				stageHats.some((h) => h.includes("designer") || h.includes("design")) ||
				stageDef?.body?.includes("pick_design_direction")
			if (isDesignStage) {
				sections.push(
					"## Design Provider MCPs\n\n" +
						"If design provider MCPs are available (look for tools named `mcp__pencil__*`, `mcp__openpencil__*`, or `mcp__figma__*`), " +
						"use them for wireframe generation instead of raw HTML. Check your available tools list.\n\n" +
						"These providers offer structured design primitives (components, layout, styling) that produce " +
						"higher-fidelity wireframes than inline HTML snippets.",
				)
			}

			sections.push(
				`## Scope\n\nAll units MUST be within this stage's domain. Work belonging to other stages goes in the discovery document, not in units.\n\n## Mechanics\n\n${
					elaboration === "collaborative"
						? "Mode: **collaborative** — you MUST engage the user iteratively before finalizing.\n\n" +
							"## MANDATORY: Use tools for questions — NEVER plain text for structured choices\n\n" +
							"When you have questions for the user, you MUST use the correct tool:\n\n" +
							"| Question type | Tool | Example |\n" +
							"|---|---|---|\n" +
							`| Scope decisions, tradeoffs, A/B/C choices | \`AskUserQuestion\` with options[] | "Should we support X or Y?" |\n` +
							"| Specs, comparisons, detailed options (markdown) | `ask_user_visual_question` MCP tool | Domain model review, architecture options |\n" +
							"| Visual artifacts, wireframes, designs | `ask_user_visual_question` with image_paths | Side-by-side design comparison |\n" +
							"| Design direction with previews | `pick_design_direction` MCP tool | Wireframe variants |\n" +
							`| Simple open-ended clarification (no known options) | Conversation text | "Tell me more about the use case" |\n\n` +
							"### ALWAYS provide pre-selected options\n\n" +
							"When using `AskUserQuestion`, you MUST provide an `options` array with concrete choices the user can pick from. " +
							"You already know the domain — translate your knowledge into selectable options instead of forcing the user to type freeform answers. " +
							'Include an "Other (let me specify)" option when the list may not be exhaustive.\n\n' +
							'**Good:** `AskUserQuestion({ question: "Which auth strategy?", options: ["OAuth 2.0 + PKCE", "Magic link (passwordless)", "SSO via SAML", "Other (let me specify)"] })`\n' +
							'**Bad:** Typing "Which auth strategy should we use? We could do OAuth, magic links, or SSO..." as plain text.\n\n' +
							"### One question per tool call — break up compound questions\n\n" +
							"If you have multiple independent questions (e.g., auth strategy AND database choice AND caching layer), " +
							"do NOT combine them into a single long message. Instead:\n" +
							"- Use **separate `AskUserQuestion` calls** for each independent decision, OR\n" +
							"- Use **one `ask_user_visual_question` call** with multiple entries in the `questions[]` array (each with its own options) when the decisions are related and benefit from being seen together\n\n" +
							"Never dump multiple questions as numbered plain-text paragraphs.\n\n" +
							`**Violation:** Outputting numbered questions, option lists, or "A) ... B) ... C) ..." as conversation text. ` +
							"If you catch yourself typing options inline, STOP and use `AskUserQuestion` with an `options` array instead.\n\n"
						: "Mode: **autonomous** — elaborate independently. When you DO need user input (blockers, ambiguity), " +
							"use `AskUserQuestion` with pre-selected `options[]` — never plain-text option lists.\n\n"
				}**Elaboration produces the PLAN, not the deliverables:**\n1. Research the problem space and write discovery artifacts to \`knowledge/\`\n2. Define units with scope, completion criteria, and dependencies — NOT the actual work product\n   - A unit spec says WHAT will be produced and HOW to verify it\n   - The execution phase produces the actual deliverables\n   - Do NOT write full specs, schemas, or implementations during elaboration\n3. Write unit files to \`.haiku/intents/${slug}/stages/${stage}/units/\`\n4. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator validates and opens the review gate\n\n**Unit file naming convention (REQUIRED):**\nFiles MUST be named \`unit-NN-slug.md\` where:\n- \`NN\` is a zero-padded sequence number (01, 02, 03...)\n- \`slug\` is a kebab-case descriptor (e.g., \`user-auth\`, \`data-model\`)\n- Example: \`unit-01-data-model.md\`, \`unit-02-api-endpoints.md\`\n\nFiles that don't match this pattern will not appear in the review UI and will block advancement.`,
			)

			// Check for ticketing provider
			try {
				const settingsPath = join(process.cwd(), ".haiku", "settings.yml")
				if (existsSync(settingsPath)) {
					const settingsRaw = readFileSync(settingsPath, "utf8")
					if (settingsRaw.includes("ticketing")) {
						sections.push(
							"## Ticketing Integration\n\n" +
								"A ticketing provider is configured. During elaboration:\n" +
								"1. Create an epic for this intent (or link to existing one if `epic:` is set in intent.md)\n" +
								"2. For each unit created, create a ticket linked to the epic\n" +
								"3. Store ticket key in unit frontmatter: `ticket: PROJ-123`\n" +
								"4. Map unit `depends_on` to ticket blocked-by relationships\n" +
								"5. Include the H·AI·K·U browse link in ticket descriptions\n\n" +
								"See ticketing provider instructions for details on content format and status mapping.",
						)
					}
				}
			} catch {
				/* non-fatal */
			}
			break
		}

		case "start_unit":
		case "continue_unit": {
			const stage = action.stage as string
			const unit = (action.unit as string) || ""
			const hat = (action.hat as string) || (action.first_hat as string) || ""
			const hats = (action.hats as string[]) || []
			const bolt = (action.bolt as number) || 1

			// Resolve file paths (NOT content). Subagent reads each file itself.
			const stagePath = resolveStudioFilePath(
				join(studio, "stages", stage, "STAGE.md"),
			)
			const executionPath = resolveStudioFilePath(
				join(studio, "stages", stage, "phases", "EXECUTION.md"),
			)
			const hatPath = resolveStudioFilePath(
				join(studio, "stages", stage, "hats", `${hat}.md`),
			)
			const outputsDir = resolveStudioFilePath(
				join(studio, "stages", stage, "outputs"),
			)

			// Unit file path (on disk in the intent dir)
			const unitFile = join(
				dir,
				"stages",
				stage,
				"units",
				unit.endsWith(".md") ? unit : `${unit}.md`,
			)

			// Need unit inputs + model hint from its frontmatter
			let unitInputs: string[] = []
			let unitModel: string | undefined = undefined
			if (existsSync(unitFile)) {
				const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
				unitInputs = (data.inputs as string[]) || (data.refs as string[]) || []
				unitModel = (data.model as string) || undefined
			}

			// Hat frontmatter for spawn hints (agent_type, model)
			const hatDefs = readHatDefs(studio, stage)
			const hatDef = hatDefs[hat]
			const hatAgentType = hatDef?.agent_type || "general-purpose"

			let resolvedModel: ModelTier | undefined
			if (features.modelSelection) {
				const stageDef = readStageDef(studio, stage)
				const studioData = readStudio(studio)
				const { model, source } = resolveModel({
					unit: unitModel,
					hat: hatDef?.model,
					stage: stageDef?.data?.default_model as string | undefined,
					studio: studioData?.data?.default_model as string | undefined,
				})
				resolvedModel = model
				if (resolvedModel) {
					console.error(
						`[haiku] resolved model: ${resolvedModel} (source: ${source})`,
					)
				}
			}

			// Per-unit inputs (scoped) — paths only
			const unitInputPaths: string[] = []
			{
				const dirResolved = resolve(dir)
				for (const ref of unitInputs) {
					const refResolved = resolve(dir, ref)
					if (
						!refResolved.startsWith(`${dirResolved}/`) &&
						refResolved !== dirResolved
					)
						continue
					if (existsSync(join(dir, ref))) unitInputPaths.push(ref)
				}
			}

			// Stage-wide upstream artifacts (shared, optional) — paths only
			const upstreamPaths: Array<{ label: string; path: string }> = []
			{
				const stageDef = readStageDef(studio, stage)
				if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
					const stageInputDefs = stageDef.data.inputs as Array<{
						stage: string
						discovery?: string
						output?: string
					}>
					const resolvedInputs = resolveStageInputs(
						studio,
						stageInputDefs,
						dir,
						slug,
					)
					const found = resolvedInputs.filter((r) => r.exists)
					const inputSet = new Set(unitInputs.map((r) => resolve(dir, r)))
					for (const r of found) {
						if (inputSet.has(resolve(r.resolvedPath))) continue
						const relPath = r.resolvedPath.startsWith(`${dir}/`)
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						upstreamPaths.push({
							label: `${r.stage}/${r.artifactName}`,
							path: relPath,
						})
					}
				}
			}

			// Output template paths
			const outputReqs = buildOutputRequirements(studio, stage)

			// Build path-only subagent prompt. Intent-scoped paths are absolute —
			// rooted at the unit's worktree if one exists (so the subagent sees
			// prior-hat commits not yet merged to parent), else the main intent dir.
			// The subagent stays in whatever cwd it was spawned with; no cd required.
			const worktreePath = (action.worktree as string) || ""
			const intentRoot = worktreePath
				? join(worktreePath, ".haiku", "intents", slug)
				: dir
			const unitAbsPath = join(
				intentRoot,
				"stages",
				stage,
				"units",
				unit.endsWith(".md") ? unit : `${unit}.md`,
			)
			const unitCaps = getCapabilities()

			// For hookless harnesses, inline the subagent context that would
			// normally be injected by the subagent-hook PreToolUse handler.
			const inlineCtx = buildInlineSubagentContext(slug, stage, hat, hats, bolt)

			// Feedback-assessor hat gets an entirely different prompt body —
			// its job is verification, not production.
			if (hat === "feedback-assessor") {
				const unitFm = existsSync(unitFile)
					? parseFrontmatter(readFileSync(unitFile, "utf8")).data
					: {}
				const closes = (unitFm.closes as string[]) || []
				const unitOutputs = (unitFm.outputs as string[]) || []
				const feedbackFiles: Array<{ id: string; file: string }> = []
				for (const fbId of closes) {
					const found = readFeedbackFiles(slug, stage).find(
						(f) => f.id === fbId,
					)
					if (found)
						feedbackFiles.push({
							id: found.id,
							file: found.file.startsWith(".haiku/intents/")
								? found.file.slice(
										`.haiku/intents/${slug}/`.length,
									)
								: found.file,
						})
				}
				const assessorPrompt = buildFeedbackAssessorPrompt({
					slug,
					studio,
					stage,
					unit,
					bolt,
					worktreePath,
					intentRoot,
					unitAbsPath,
					closes,
					feedbackFiles,
					unitOutputs,
				})
				if (unitCaps.subagents.supported) {
					const assessorBody = inlineCtx
						? `${inlineCtx}\n\n${assessorPrompt}`
						: assessorPrompt
					sections.push(
						emitSubagentDispatchBlock({
							unit,
							hat,
							bolt,
							agentType: hatAgentType,
							model: resolvedModel,
							promptBody: assessorBody,
							toolAttr: true,
						}),
					)
					sections.push(
						"### Parent Instructions (do NOT include in subagent prompt)\n\nAfter the assessor returns: call `haiku_run_next { intent: ... }`. If it approved, the FSM has marked the unit's claimed feedback items as `closed`. If it rejected, the unit has bolted back to the first hat and the feedback items remain `pending`.",
					)
				} else {
					if (inlineCtx) sections.push(inlineCtx)
					sections.push(
						`### Feedback Assessor (Direct Execution)\n\n${assessorPrompt}`,
					)
				}
				break
			}

			const prompt: string[] = [
				`You are executing unit **${unit}** as hat **${hat}** (bolt ${bolt}) in stage **${stage}** of studio **${studio}** for intent **${slug}**.`,
				"",
			]
			if (worktreePath) {
				prompt.push(
					`**Unit worktree:** \`${worktreePath}\` (intent dir: \`${intentRoot}\`). Read and write the intent files at this path — it contains any prior-hat commits not yet merged to the parent branch. You do not need to change your working directory; use the absolute paths below.`,
					"",
				)
			}
			prompt.push(
				"## Required context (inlined below)",
				"Everything you need for this hat is embedded in this prompt — no need to fan out Read tool calls for the required files. If you need VISUAL artifacts (SVG, PNG, PDF), open them by path as listed in the unit spec.",
				"",
			)
			if (stagePath) prompt.push(inlineFile(stagePath, "Stage scope"))
			if (executionPath)
				prompt.push(inlineFile(executionPath, "Execute-phase focus"))
			if (hatPath) prompt.push(inlineFile(hatPath, `Hat: ${hat}`))
			prompt.push(inlineFile(unitAbsPath, `Unit spec: ${unit}`))
			if (outputsDir)
				prompt.push(`- Stage output templates — \`${outputsDir}/\``)

			if (unitInputPaths.length > 0) {
				prompt.push(
					"",
					"## Unit inputs (MUST read — scoped to this unit)",
					"Inputs may be markdown, HTML, SVG, PNG/JPG, or PDF — fetch each with the appropriate tool.",
					"",
					...unitInputPaths.map((p) => `- \`${join(intentRoot, p)}\``),
				)
			}
			if (upstreamPaths.length > 0) {
				prompt.push(
					"",
					"## Available upstream artifacts (stage-wide — read what's relevant)",
					"Not required reading — open only what your unit's scope needs.",
					"",
					...upstreamPaths.map(
						(p) => `- **${p.label}** — \`${join(intentRoot, p.path)}\``,
					),
				)
			}
			if (outputReqs) {
				prompt.push("", outputReqs)
			}

			prompt.push("", "## Instructions", "")
			let step = 1
			if (action.action === "start_unit") {
				prompt.push(
					`${step++}. Call \`haiku_unit_start { intent: "${slug}", unit: "${unit}" }\``,
				)
			}
			if (worktreePath) {
				prompt.push(
					`${step++}. Commit frequently inside the worktree: \`git add -A && git commit -m "..."\`. Do NOT push.`,
				)
			}
			prompt.push(
				`${step++}. When done: call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unit}" }\``,
				`${step++}. If blocked: call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unit}" }\``,
				`${step++}. **CRITICAL — Relay the FSM Result path.** When \`advance_hat\` or \`reject_hat\` returns, its tool response contains a result-file path and instructs you to reply with exactly \`FSM Result: <path>\`. Your FINAL MESSAGE to the parent MUST BE EXACTLY that one line — nothing before, nothing after. Do NOT summarize the work, do NOT describe what you did, do NOT paraphrase the result. The parent reads the file to drive the next FSM action. If the tool returned plaintext instead of a result path (e.g. "job ends here — parent will call haiku_run_next"), relay THAT plaintext verbatim as your final message.`,
				`${step++}. Track outputs in unit frontmatter \`outputs:\` field`,
				`${step++}. If outputs from a previous stage are missing: call \`haiku_revisit { intent: "${slug}" }\``,
				"",
				"**Autonomy:** You are in the execution phase. Execute without asking the user to confirm per-step. Use `AskUserQuestion`/`ask_user_visual_question` only when genuinely blocked on ambiguous requirements — always with pre-populated options.",
				"",
				SUBAGENT_ERROR_RECOVERY,
			)

			if (unitCaps.subagents.supported) {
				const promptBody = inlineCtx
					? `${inlineCtx}\n\n${prompt.join("\n")}`
					: prompt.join("\n")
				sections.push(
					emitSubagentDispatchBlock({
						unit,
						hat,
						bolt,
						agentType: hatAgentType,
						model: resolvedModel,
						promptBody,
						toolAttr: true,
					}),
				)

				// Parent-only instructions OUTSIDE the tag
				sections.push(
					"### Parent Instructions (do NOT include in subagent prompt)\n\nSpawn the subagent using the `type`, `model`, and `prompt_file` attributes from the `<subagent>` block above. The subagent's prompt is the file at `prompt_file` — pass `\"Read <prompt_file> and execute its instructions exactly.\"` as the spawn prompt.\n\n**When the subagent returns, its final message will be one of:**\n- `FSM Result: <path>` — read that JSON file and act on its `action` field. Valid actions: `continue_unit` (spawn next subagent for same unit), `start_units` (dispatch wave), `advance_phase`, `review`, `advance_stage`, `intent_complete`, `blocked`. For unit-level actions, call `haiku_run_next { intent: ... }` to get the FSM's canonical next step (the result file and run_next return the same data; run_next is the authoritative drive step).\n- Plaintext \"job ends here\" message — another subagent in the wave will produce the structured result; do not dispatch yet.\n- Anything else (subagent non-compliant) — fall back: call `haiku_run_next { intent: ... }`.\n\nDo NOT stop until run_next returns `gate_review`, `advance_stage → intent_complete`, `intent_complete`, or `error`.",
				)
			} else {
				// ── Subagentless: direct execution in current context ──
				if (inlineCtx) sections.push(inlineCtx)
				sections.push(
					`### Mechanics (Direct Execution)\n\n**Execute the "${hat}" hat work directly** — your harness does not support subagents.\n\n${prompt.join("\n")}`,
				)
			}

			// Check for ticketing provider — move ticket to "In Progress"
			if (action.action === "start_unit") {
				try {
					const settingsPath = join(process.cwd(), ".haiku", "settings.yml")
					if (existsSync(settingsPath)) {
						const settingsRaw = readFileSync(settingsPath, "utf8")
						if (settingsRaw.includes("ticketing")) {
							sections.push(
								"### Ticketing\n\n" +
									"A ticketing provider is configured. If this unit has a `ticket:` field in its frontmatter, " +
									`transition the ticket to "In Progress" when the subagent starts work.\n\n` +
									"See ticketing provider instructions for status mapping details.",
							)
						}
					}
				} catch {
					/* non-fatal */
				}
			}
			break
		}

		case "start_units": {
			const stage = action.stage as string
			const units = (action.units as string[]) || []
			const hats = (action.hats as string[]) || []
			const firstHat = (action.first_hat as string) || hats[0] || ""

			// Resolve file paths (NOT content) — subagents read these themselves.
			// Keeps main-agent AND per-subagent context small — no double inlining.
			const stagePath = resolveStudioFilePath(
				join(studio, "stages", stage, "STAGE.md"),
			)
			const executionPath = resolveStudioFilePath(
				join(studio, "stages", stage, "phases", "EXECUTION.md"),
			)
			const hatPath = resolveStudioFilePath(
				join(studio, "stages", stage, "hats", `${firstHat}.md`),
			)
			const outputsDir = resolveStudioFilePath(
				join(studio, "stages", stage, "outputs"),
			)

			// Hat agent type + model still need frontmatter for spawn hints
			const hatDefs = readHatDefs(studio, stage)
			const hatDef = hatDefs[firstHat]
			const hatAgentType = hatDef?.agent_type || "general-purpose"

			let resolvedModelParallel: ModelTier | undefined
			if (features.modelSelection) {
				const stageDef = readStageDef(studio, stage)
				const studioData = readStudio(studio)
				const { model, source } = resolveModel({
					hat: hatDef?.model,
					stage: stageDef?.data?.default_model as string | undefined,
					studio: studioData?.data?.default_model as string | undefined,
				})
				resolvedModelParallel = model
				if (resolvedModelParallel) {
					console.error(
						`[haiku] parallel wave resolved model: ${resolvedModelParallel} (source: ${source})`,
					)
				}
			}

			// Upstream stage artifacts — collect labels + relative paths.
			// Absolute paths are emitted per-unit (each unit worktree has its own root).
			const upstreamRels: Array<{ label: string; relPath: string }> = []
			{
				const stageDef = readStageDef(studio, stage)
				if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
					const inputs = stageDef.data.inputs as Array<{
						stage: string
						discovery?: string
						output?: string
					}>
					const resolvedInputs = resolveStageInputs(studio, inputs, dir, slug)
					const found = resolvedInputs.filter((r) => r.exists)
					for (const r of found) {
						const relPath = r.resolvedPath.startsWith(`${dir}/`)
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						upstreamRels.push({
							label: `${r.stage}/${r.artifactName}`,
							relPath,
						})
					}
				}
			}

			// For hookless harnesses, inline the subagent context that would
			// normally be injected by the subagent-hook PreToolUse handler.
			const inlineCtxParallel = buildInlineSubagentContext(
				slug,
				stage,
				firstHat,
				hats,
				1,
			)
			const parallelCaps = getCapabilities()

			const worktrees =
				(action.worktrees as Record<string, string | null>) || {}
			const wave = action.wave as number | undefined
			const totalWaves = action.total_waves as number | undefined

			if (parallelCaps.subagents.supported) {
				// ── Subagent-capable harness: per-unit <subagent> blocks ──
				sections.push(
					`## Parallel Execution: ${units.length} units in ${stage}${wave !== undefined ? ` — Wave ${wave}/${totalWaves ?? "?"}` : ""}`,
				)

				// Per-unit subagent blocks — path-only, no inlined bodies
				for (const unitName of units) {
					const unitFile = join(
						dir,
						"stages",
						stage,
						"units",
						unitName.endsWith(".md") ? unitName : `${unitName}.md`,
					)

					let unitInputs: string[] = []
					if (existsSync(unitFile)) {
						const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
						unitInputs =
							(data.inputs as string[]) || (data.refs as string[]) || []
					}

					// Per-unit input paths (scoped to THIS unit only)
					const unitInputPaths: string[] = []
					if (unitInputs.length > 0) {
						const dirResolved = resolve(dir)
						for (const ref of unitInputs) {
							const refResolved = resolve(dir, ref)
							if (
								!refResolved.startsWith(`${dirResolved}/`) &&
								refResolved !== dirResolved
							)
								continue
							if (existsSync(join(dir, ref))) unitInputPaths.push(ref)
						}
					}

					const wt = worktrees[unitName]
					const unitIntentRoot = wt
						? join(wt, ".haiku", "intents", slug)
						: dir
					const unitAbsPath = join(
						unitIntentRoot,
						"stages",
						stage,
						"units",
						unitName.endsWith(".md") ? unitName : `${unitName}.md`,
					)

					// Build subagent prompt. Intent-scoped paths are absolute, rooted at
					// the unit worktree's intent dir. No cd needed — subagent stays in
					// its spawn-time cwd and reads/writes via absolute paths.
					const prompt: string[] = [
						`You are executing unit **${unitName}** as hat **${firstHat}** in stage **${stage}** of studio **${studio}** for intent **${slug}**.`,
						"",
					]
					if (wt) {
						prompt.push(
							`**Unit worktree:** \`${wt}\` (intent dir: \`${unitIntentRoot}\`). Read and write the intent files at this path. You do not need to change your working directory; use the absolute paths below.`,
							"",
						)
					}
					prompt.push(
						"## Required context (inlined below)",
						"Everything you need for this hat is embedded in this prompt — no need to fan out Read tool calls for the required files. If you need VISUAL artifacts (SVG, PNG, PDF), open them by path as listed in the unit spec.",
						"",
					)
					if (stagePath) prompt.push(inlineFile(stagePath, "Stage scope"))
					if (executionPath)
						prompt.push(inlineFile(executionPath, "Execute-phase focus"))
					if (hatPath) prompt.push(inlineFile(hatPath, `Hat: ${firstHat}`))
					prompt.push(inlineFile(unitAbsPath, `Unit spec: ${unitName}`))
					if (outputsDir)
						prompt.push(`- Stage output templates — \`${outputsDir}/\``)

					if (unitInputPaths.length > 0) {
						prompt.push(
							"",
							"## Unit inputs (MUST read — scoped to this unit)",
							"Inputs may be markdown, HTML, SVG, PNG/JPG, or PDF — fetch each with the appropriate tool.",
							"",
							...unitInputPaths.map((p) => `- \`${join(unitIntentRoot, p)}\``),
						)
					}

					if (upstreamRels.length > 0) {
						prompt.push(
							"",
							"## Available upstream artifacts (stage-wide — read what's relevant)",
							"Not required reading — open only what your unit's scope needs.",
							"",
							...upstreamRels.map(
								(u) =>
									`- **${u.label}** — \`${join(unitIntentRoot, u.relPath)}\``,
							),
						)
					}

					prompt.push("", "## Instructions", "")
					let step = 1
					prompt.push(
						`${step++}. Call \`haiku_unit_start { intent: "${slug}", unit: "${unitName}" }\``,
					)
					if (wt) {
						prompt.push(
							`${step++}. Commit frequently inside the worktree: \`git add -A && git commit -m "..."\`. Do NOT push.`,
						)
					}
					prompt.push(
						`${step++}. Call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unitName}" }\` when done`,
						`${step++}. If blocked: call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unitName}" }\``,
						`${step++}. **CRITICAL — Relay the FSM Result path.** When \`advance_hat\` or \`reject_hat\` returns, its tool response contains a result-file path and instructs you to reply with exactly \`FSM Result: <path>\`. Your FINAL MESSAGE to the parent MUST BE EXACTLY that one line — nothing before, nothing after. Do NOT summarize the work, do NOT describe what you did, do NOT paraphrase the result. The parent reads the file to drive the next FSM action. If the tool returned plaintext instead of a result path (e.g. "job ends here — parent will call haiku_run_next"), relay THAT plaintext verbatim as your final message.`,
						`${step++}. Track outputs in unit frontmatter \`outputs:\` field`,
						`${step++}. If outputs from a previous stage are missing: call \`haiku_revisit { intent: "${slug}" }\``,
						"",
						"**Autonomy:** You are one of a parallel wave — execute without asking the user to confirm per-step. The FSM coordinates the wave. Do NOT ask which unit runs first, whether to advance a hat, whether to commit/push. Use `AskUserQuestion`/`ask_user_visual_question` only when genuinely blocked on ambiguous requirements.",
						"",
						SUBAGENT_ERROR_RECOVERY,
					)

					const promptBody = inlineCtxParallel
						? `${inlineCtxParallel}\n\n${prompt.join("\n")}`
						: prompt.join("\n")
					sections.push(
						emitSubagentDispatchBlock({
							unit: unitName,
							hat: firstHat,
							bolt: 1,
							agentType: hatAgentType,
							model: resolvedModelParallel,
							promptBody,
							heading: `### Subagent: ${unitName}`,
							toolAttr: true,
						}),
					)
				}

				// Parent instructions
				sections.push(
					`### Parent Instructions (do NOT include in subagent prompts)\n\n**IMMEDIATELY** spawn ALL subagents above **in parallel, in a single response**. Each \`<subagent>\` block has \`type\`, \`model\`, and \`prompt_file\` attributes. Spawn each with prompt: \`"Read <prompt_file> and execute its instructions exactly."\` — no other text. The FSM owns the authoritative prompt at \`prompt_file\`; do not paraphrase.\n\n**Drive forward on every return — do NOT wait for the whole batch.** The moment ANY subagent returns, inspect its final message:\n- \`FSM Result: <path>\` → read that JSON file, then call \`haiku_run_next { intent: "${slug}" }\` (run_next is authoritative). The FSM will include every still-active unit plus the newly-ready work.\n- Plaintext \"job ends here\" → another subagent will emit the structured result; do NOT dispatch yet.\n- Anything else (non-compliant) → fall back: call \`haiku_run_next { intent: "${slug}" }\`.\n\nWaiting for the whole batch strands other units. Stop driving only when run_next returns \`gate_review\`, \`escalate\`, \`intent_complete\`, or \`error\`.`,
				)
			} else {
				// ── Subagentless harness: sequential execution in current context ──
				// Surface stage scope, hat, and upstream paths for the parent agent
				// since it IS the executor.
				if (inlineCtxParallel) sections.push(inlineCtxParallel)
				const sharedLines: string[] = [
					`## Parallel Execution: ${units.length} units in ${stage}${wave !== undefined ? ` — Wave ${wave}/${totalWaves ?? "?"}` : ""}`,
					"",
					"## Required reading (MUST read fully before starting)",
					"",
				]
				if (stagePath) sharedLines.push(`- Stage scope — \`${stagePath}\``)
				if (executionPath)
					sharedLines.push(`- Execute-phase focus — \`${executionPath}\``)
				if (hatPath) sharedLines.push(`- Hat — \`${hatPath}\``)
				if (outputsDir)
					sharedLines.push(`- Stage output templates — \`${outputsDir}/\``)
				if (upstreamRels.length > 0) {
					sharedLines.push("", "## Available upstream artifacts", "")
					for (const u of upstreamRels) {
						sharedLines.push(`- **${u.label}** — \`${join(dir, u.relPath)}\``)
					}
				}
				sections.push(sharedLines.join("\n"))

				const unitList = units
					.map((u) => {
						const wt = worktrees[u]
						return `1. **${u}**${wt ? ` (worktree: \`${wt}\`)` : ""}:\n   - Call \`haiku_unit_start { intent: "${slug}", unit: "${u}" }\`\n   - Execute the "${firstHat}" hat work directly (see hat definition and unit spec)\n   - When done, call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${u}" }\`\n   - If the advance result shows more hats, continue with the next hat for this unit\n   - When all hats complete, move to the next unit`
					})
					.join("\n")
				sections.push(
					`### Mechanics (Sequential Execution)\n\n${wave !== undefined ? `**Wave ${wave}/${totalWaves ?? "?"}** — ` : ""}${units.length} units to execute.\n\n**Your harness does not support parallel subagents.** Execute each unit sequentially in this conversation. Complete one unit fully (all hats) before starting the next.\n\n**For each unit:**\n${unitList}\n\n**Output tracking:** When your work produces artifacts (files, designs, specs, code), record them in the unit's frontmatter \`outputs:\` field as paths relative to the intent directory.\n\n**If outputs from a previous stage are missing or incorrect:** call \`haiku_revisit { intent: "${slug}" }\` to return to the prior stage for corrections.\n\nAfter completing the last unit: the \`advance_hat\` result contains the next FSM action. Follow it directly.`,
				)
			}
			break
		}

		case "continue_units": {
			const stage = action.stage as string
			const hats = (action.hats as string[]) || []
			const entries =
				(action.units as Array<{
					name: string
					hat: string
					bolt: number
					worktree: string | null
				}>) || []

			const stagePath = resolveStudioFilePath(
				join(studio, "stages", stage, "STAGE.md"),
			)
			const executionPath = resolveStudioFilePath(
				join(studio, "stages", stage, "phases", "EXECUTION.md"),
			)
			const outputsDir = resolveStudioFilePath(
				join(studio, "stages", stage, "outputs"),
			)

			// Shared upstream artifacts (resolved to relative paths; each unit
			// rewrites to absolute against its own worktree root).
			const upstreamRels: Array<{ label: string; relPath: string }> = []
			{
				const stageDef = readStageDef(studio, stage)
				if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
					const inputs = stageDef.data.inputs as Array<{
						stage: string
						discovery?: string
						output?: string
					}>
					const resolvedInputs = resolveStageInputs(studio, inputs, dir, slug)
					for (const r of resolvedInputs.filter((x) => x.exists)) {
						const relPath = r.resolvedPath.startsWith(`${dir}/`)
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						upstreamRels.push({
							label: `${r.stage}/${r.artifactName}`,
							relPath,
						})
					}
				}
			}

			const hatDefs = readHatDefs(studio, stage)
			const wave = action.wave as number | undefined
			const totalWaves = action.total_waves as number | undefined

			sections.push(
				`## Parallel Execution (continue): ${entries.length} active units in ${stage}${wave !== undefined ? ` — Wave ${wave}/${totalWaves ?? "?"}` : ""}`,
			)

			for (const entry of entries) {
				const { name: unitName, hat, bolt, worktree: wt } = entry
				const hatPath = resolveStudioFilePath(
					join(studio, "stages", stage, "hats", `${hat}.md`),
				)
				const hatDef = hatDefs[hat]
				const hatAgentType = hatDef?.agent_type || "general-purpose"

				let resolvedModel: ModelTier | undefined
				if (features.modelSelection) {
					const stageDef = readStageDef(studio, stage)
					const studioData = readStudio(studio)
					const { model } = resolveModel({
						hat: hatDef?.model,
						stage: stageDef?.data?.default_model as string | undefined,
						studio: studioData?.data?.default_model as string | undefined,
					})
					resolvedModel = model
				}

				const unitFile = join(
					dir,
					"stages",
					stage,
					"units",
					unitName.endsWith(".md") ? unitName : `${unitName}.md`,
				)

				const unitIntentRoot = wt
					? join(wt, ".haiku", "intents", slug)
					: dir
				const unitAbsPath = join(
					unitIntentRoot,
					"stages",
					stage,
					"units",
					unitName.endsWith(".md") ? unitName : `${unitName}.md`,
				)

				// Feedback-assessor hat gets a distinct prompt — its job is to
				// verify the unit's `closes:` claims, not produce artifacts.
				if (hat === "feedback-assessor") {
					const unitFm = existsSync(unitFile)
						? parseFrontmatter(readFileSync(unitFile, "utf8")).data
						: {}
					const closes = (unitFm.closes as string[]) || []
					const unitOutputs = (unitFm.outputs as string[]) || []
					const feedbackFiles: Array<{ id: string; file: string }> = []
					for (const fbId of closes) {
						const found = readFeedbackFiles(slug, stage).find(
							(f) => f.id === fbId,
						)
						if (found) {
							feedbackFiles.push({
								id: found.id,
								file: found.file.startsWith(".haiku/intents/")
									? found.file.slice(`.haiku/intents/${slug}/`.length)
									: found.file,
							})
						}
					}
					const assessorPrompt = buildFeedbackAssessorPrompt({
						slug,
						studio,
						stage,
						unit: unitName,
						bolt,
						worktreePath: wt || "",
						intentRoot: unitIntentRoot,
						unitAbsPath,
						closes,
						feedbackFiles,
						unitOutputs,
					})
					sections.push(
						emitSubagentDispatchBlock({
							unit: unitName,
							hat: "feedback-assessor",
							bolt,
							agentType: hatAgentType,
							model: resolvedModel,
							promptBody: assessorPrompt,
							heading: `### Subagent: ${unitName} (feedback-assessor · bolt ${bolt})`,
						}),
					)
					continue
				}

				let unitInputs: string[] = []
				if (existsSync(unitFile)) {
					const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
					unitInputs =
						(data.inputs as string[]) || (data.refs as string[]) || []
				}
				const unitInputPaths: string[] = []
				if (unitInputs.length > 0) {
					const dirResolved = resolve(dir)
					for (const ref of unitInputs) {
						const refResolved = resolve(dir, ref)
						if (
							!refResolved.startsWith(`${dirResolved}/`) &&
							refResolved !== dirResolved
						)
							continue
						if (existsSync(join(dir, ref))) unitInputPaths.push(ref)
					}
				}

				const prompt: string[] = [
					`You are continuing unit **${unitName}** as hat **${hat}** (bolt ${bolt}) in stage **${stage}** of studio **${studio}** for intent **${slug}**.`,
					"",
				]
				if (wt) {
					prompt.push(
						`**Unit worktree:** \`${wt}\` (intent dir: \`${unitIntentRoot}\`). Read and write the intent files at this path — it contains any prior-hat commits not yet merged to the parent branch. You do not need to change your working directory; use the absolute paths below.`,
						"",
					)
				}
				prompt.push(
					"## Required context (inlined below)",
					"Everything you need for this hat is embedded in this prompt — no need to fan out Read tool calls for the required files. If you need VISUAL artifacts (SVG, PNG, PDF), open them by path as listed in the unit spec.",
					"",
				)
				if (stagePath) prompt.push(inlineFile(stagePath, "Stage scope"))
				if (executionPath)
					prompt.push(inlineFile(executionPath, "Execute-phase focus"))
				if (hatPath) prompt.push(inlineFile(hatPath, `Hat: ${hat}`))
				prompt.push(inlineFile(unitAbsPath, `Unit spec: ${unitName}`))
				if (outputsDir)
					prompt.push(`- Stage output templates — \`${outputsDir}/\``)

				if (unitInputPaths.length > 0) {
					prompt.push(
						"",
						"## Unit inputs (MUST read — scoped to this unit)",
						"Inputs may be markdown, HTML, SVG, PNG/JPG, or PDF — fetch each with the appropriate tool.",
						"",
						...unitInputPaths.map((p) => `- \`${join(unitIntentRoot, p)}\``),
					)
				}
				if (upstreamRels.length > 0) {
					prompt.push(
						"",
						"## Available upstream artifacts (stage-wide — read what's relevant)",
						"Not required reading — open only what your unit's scope needs.",
						"",
						...upstreamRels.map(
							(u) =>
								`- **${u.label}** — \`${join(unitIntentRoot, u.relPath)}\``,
						),
					)
				}

				prompt.push("", "## Instructions", "")
				let step = 1
				if (wt) {
					prompt.push(
						`${step++}. Commit frequently inside the worktree: \`git add -A && git commit -m "..."\`. Do NOT push.`,
					)
				}
				prompt.push(
					`${step++}. When done: call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unitName}" }\``,
					`${step++}. If blocked: call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unitName}" }\``,
					`${step++}. **CRITICAL — Relay the FSM Result path.** When \`advance_hat\` or \`reject_hat\` returns, its tool response contains a result-file path and instructs you to reply with exactly \`FSM Result: <path>\`. Your FINAL MESSAGE to the parent MUST BE EXACTLY that one line — nothing before, nothing after. Do NOT summarize the work, do NOT describe what you did, do NOT paraphrase the result. The parent reads the file to drive the next FSM action. If the tool returned plaintext instead of a result path (e.g. "job ends here — parent will call haiku_run_next"), relay THAT plaintext verbatim as your final message.`,
					`${step++}. Track outputs in unit frontmatter \`outputs:\` field`,
					`${step++}. If outputs from a previous stage are missing: call \`haiku_revisit { intent: "${slug}" }\``,
					"",
					"**Autonomy:** You are one of a parallel wave — execute without asking the user to confirm per-step. The FSM coordinates the wave. Do NOT ask which unit runs first, whether to advance a hat, whether to commit/push. Use `AskUserQuestion`/`ask_user_visual_question` only when genuinely blocked on ambiguous requirements.",
					"",
					SUBAGENT_ERROR_RECOVERY,
				)

				sections.push(
					emitSubagentDispatchBlock({
						unit: unitName,
						hat,
						bolt,
						agentType: hatAgentType,
						model: resolvedModel,
						promptBody: prompt.join("\n"),
						heading: `### Subagent: ${unitName} (${hat} · bolt ${bolt})`,
					}),
				)
			}

			sections.push(
				`### Parent Instructions (do NOT include in subagent prompts)\n\n**IMMEDIATELY** spawn ALL subagents above **in parallel, in a single response**. Each \`<subagent>\` block has \`type\`, \`model\`, and \`prompt_file\` attributes. Spawn each with prompt: \`"Read <prompt_file> and execute its instructions exactly."\` — no other text. The FSM owns the authoritative prompt at \`prompt_file\`; do not paraphrase.\n\n**Drive forward on every return — do NOT wait for the whole batch.** The moment ANY subagent returns, inspect its final message:\n- \`FSM Result: <path>\` → read that JSON file, then call \`haiku_run_next { intent: "${slug}" }\` (run_next is authoritative).\n- Plaintext \"job ends here\" → another subagent will emit the structured result; do NOT dispatch yet.\n- Anything else → fall back: call \`haiku_run_next { intent: "${slug}" }\`.\n\nStop driving only when run_next returns \`gate_review\`, \`escalate\`, \`intent_complete\`, or \`error\`.`,
			)

			// Suppress unused-var warning for hats (kept in payload for forward-compat)
			void hats
			break
		}

		case "intent_approved": {
			sections.push(
				`## Intent Approved\n\nThe user has approved the intent.\n\n**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user — the transition was already approved.`,
			)
			break
		}

		case "advance_phase": {
			const toPhase = action.to_phase as string
			sections.push(
				`## Advance Phase\n\nPhase advanced to "${toPhase}" by the orchestrator.\n\n**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user — the transition was already approved.`,
			)
			break
		}

		case "review": {
			const stage = action.stage as string
			// Collect agent name → mandate FILE PATH (path-only — subagent reads).
			const agentPaths: Record<string, string> = readReviewAgentPaths(
				studio,
				stage,
			)
			// Cross-stage includes (review-agents-include on STAGE.md)
			{
				const stageDef = readStageDef(studio, stage)
				if (
					stageDef?.data?.["review-agents-include"] &&
					Array.isArray(stageDef.data["review-agents-include"])
				) {
					const includes = stageDef.data["review-agents-include"] as Array<{
						stage: string
						agents: string[]
					}>
					for (const inc of includes) {
						if (!inc.stage || !Array.isArray(inc.agents)) continue
						const crossPaths = readReviewAgentPaths(studio, inc.stage)
						for (const agentName of inc.agents) {
							if (crossPaths[agentName] && !agentPaths[agentName]) {
								agentPaths[`${agentName} (from ${inc.stage})`] =
									crossPaths[agentName]
							}
						}
					}
				}
			}

			sections.push(`## Adversarial Review: ${stage}`)

			if (Object.keys(agentPaths).length > 0) {
				sections.push(
					"### Review Agent Fan-Out (REQUIRED)\n\n**Spawn exactly one subagent per review agent in parallel — no duplicates.** Each `<subagent>` block below is a complete prompt — relay verbatim. Prompts are path-based so the parent context stays small.\n",
				)
				for (const [name, mandatePath] of Object.entries(agentPaths)) {
					const reviewLines: string[] = [
						`You are the **${name}** review agent for stage "${stage}" of intent "${slug}".`,
						"",
						"## Required context (inlined below)",
						"Your review mandate is embedded in this prompt.",
						"",
						inlineFile(mandatePath, `Mandate: ${name}`),
						"",
						"## Write scope (STRICT)",
						"**You MUST NOT write, edit, or create any file.** Your ONLY output channel is the `haiku_feedback` MCP tool. If you're tempted to fix an issue yourself, log it as feedback instead. Any file write is a scope violation.",
						"",
						"## Instructions",
						"",
						"1. Use your mandate (above) as the lens for this review.",
					]
					let reviewStep = 2
					if (isGitRepo()) {
						reviewLines.push(
							`${reviewStep++}. Run \`git diff ${getMainlineBranch()}...HEAD\` to get the current diff for this stage.`,
						)
					}
					reviewLines.push(
						`${reviewStep++}. Read the stage's output artifacts in \`.haiku/intents/${slug}/stages/${stage}/\` (types vary — use the appropriate tool for each file).`,
						`${reviewStep++}. Review through your mandate's lens.`,
						`${reviewStep++}. For each issue you find, call \`haiku_feedback({ intent: "${slug}", stage: "${stage}", title: "<short title>", body: "<full description with file:line refs>", origin: "adversarial-review", author: "${name}" })\`.`,
						`${reviewStep++}. Return only a summary count of how many findings you logged.`,
					)
					const prompt = reviewLines.join("\n")
					sections.push(
						emitSubagentDispatchBlock({
							unit: `review-${stage}`,
							hat: name,
							bolt: 1,
							agentType: "general-purpose",
							promptBody: prompt,
							heading: `#### Subagent: \`${name}\``,
						}) + "\n",
					)
				}
			}

			sections.push(
				`### Parent Instructions (do NOT include in subagent prompts)\n\nSpawn review subagents in parallel using the \`prompt_file\` attribute — pass \`"Read <prompt_file> and execute its instructions exactly."\` as the spawn prompt. They persist findings directly via haiku_feedback. After all complete, call \`haiku_run_next { intent: "${slug}" }\`.`,
			)
			break
		}

		case "feedback_revisit": {
			const fbStage = action.stage as string
			const fbPendingCount = action.pending_count as number
			const fbIteration =
				(action.iteration as number) || (action.visits as number) || 0
			const fbItems =
				(action.pending_items as Array<{
					feedback_id: string
					title: string
					origin: string
					author: string
				}>) || []

			const itemList = fbItems
				.map(
					(item) =>
						`- **${item.feedback_id}**: ${item.title} (origin: ${item.origin}, author: ${item.author})`,
				)
				.join("\n")

			sections.push(
				`## Feedback Revisit: ${fbStage}\n\n**${fbPendingCount} pending feedback item(s) block the gate.** The FSM has rolled the phase back to \`elaborate\` (iteration #${fbIteration}).\n\n### Pending Feedback\n\n${itemList}\n\n### Instructions (Additive Elaboration)\n\nThis is an **additive elaborate** cycle — do NOT re-plan existing units.\n\n1. Read each pending feedback file from \`.haiku/intents/${slug}/stages/${fbStage}/feedback/\`\n2. For each feedback item, create a new unit that addresses the finding\n3. Each new unit MUST have a \`closes:\` frontmatter field referencing the feedback ID(s) it addresses — e.g. \`closes: [FB-01, FB-03]\`\n4. When all pending items are covered by units, call \`haiku_run_next { intent: "${slug}" }\`\n5. The agent will execute the new units and re-enter review → gate\n\n**Do NOT modify or re-queue existing completed units from prior iterations.**`,
			)
			break
		}

		case "gate_review": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string | null

			sections.push(
				`## Gate: Awaiting Approval\n\nStage "${stage}" is complete and awaiting your approval to advance${nextStage ? ` to "${nextStage}"` : ""}.\n\n### Instructions\n\n1. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator opens the review UI and blocks until the user responds\n2. If approved: the FSM advances automatically\n3. If changes_requested: analyze annotations and route to /haiku:refine for the appropriate upstream stage`,
			)
			break
		}

		case "advance_stage": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Advance Stage\n\nGate passed. The orchestrator has advanced from "${stage}" to "${nextStage}".\n\n**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user for confirmation — the gate was already approved. Do NOT present summaries or ask "want me to continue?" — just call the tool.`,
			)
			break
		}

		case "intent_complete": {
			if (isGitRepo()) {
				const mainline = getMainlineBranch()
				sections.push(
					`## Intent Complete\n\nAll stages are done for intent "${slug}". The orchestrator has marked it as completed.\n\n### Instructions\n\n1. Report completion summary to the user\n2. Open ONE merge request from branch \`haiku/${slug}/main\` to \`${mainline}\` for final delivery\n3. Include the H·AI·K·U browse link in the description so reviewers can see the intent, units, and knowledge artifacts\n4. Record the review URL via \`haiku_run_next { intent: "${slug}", external_review_url: "<url>" }\``,
				)
			} else {
				sections.push(
					`## Intent Complete\n\nAll stages are done for intent "${slug}". The orchestrator has marked it as completed.\n\n### Instructions\n\nReport completion summary to the user.`,
				)
			}
			break
		}

		case "blocked": {
			const blockedUnits = (action.blocked_units as string[]) || []
			sections.push(
				`## Blocked\n\nUnits are blocked: ${blockedUnits.join(", ")}\n\n### Instructions\n\nReport which units are blocked and why. Ask the user for guidance.`,
			)
			break
		}

		case "escalate": {
			const escStage = action.stage as string
			const escReason = (action.reason as string) || "unknown"
			const escIteration = (action.iteration as number) || 0
			const escMax = (action.max_iterations as number) || MAX_STAGE_ITERATIONS
			const escMessage = (action.message as string) || ""
			const escPending =
				(action.pending_items as Array<{
					feedback_id: string
					title: string
				}>) || []

			const header =
				escReason === "loop_detected"
					? `## Escalation: Loop Detected in ${escStage}`
					: `## Escalation: Iteration Limit Exceeded in ${escStage}`

			const itemList =
				escPending.length > 0
					? `\n\n### Still-pending feedback\n\n${escPending.map((p) => `- **${p.feedback_id}** — ${p.title}`).join("\n")}`
					: ""

			sections.push(
				`${header}\n\n${escMessage}${itemList}\n\n### STOP\n\n**Do NOT call \`haiku_run_next\` again.** The autonomous loop is halted by design — iteration ${escIteration} of ${escMax} (max) or repeated feedback signature detected. Surface this to the user and wait for them to choose:\n\n1. \`haiku_feedback_reject { intent, stage, feedback_id, reason }\` — dismiss specific items that shouldn't block\n2. \`haiku_revisit { intent: "${slug}" }\` — user-invoked revisit (uncapped) to force another cycle\n3. Terminate the intent or mark the stage complete manually\n4. Adjust the unit spec or criteria if the finding set is genuinely unreachable\n\nReport the situation and the options above. Do NOT decide autonomously.`,
			)
			break
		}

		case "composite_run_stage": {
			const stage = action.stage as string
			const compositeStudio = (action.studio as string) || studio
			const hats = (action.hats as string[]) || []

			// Load composite studio definition
			const compositeStudioData = readStudio(compositeStudio)
			if (compositeStudioData?.body) {
				sections.push(
					`### Studio: ${compositeStudio}\n\n${compositeStudioData.body}`,
				)
			}

			// Load composite stage definition
			const compositeStageDef = readStageDef(compositeStudio, stage)
			sections.push(`## Composite: Run ${compositeStudio}:${stage}`)
			sections.push(`Hats: ${hats.join(" -> ")}`)
			if (compositeStageDef) {
				sections.push(`### Stage Definition\n\n${compositeStageDef.body}`)
			}

			sections.push(
				`### Instructions\n\nThe orchestrator is running a composite studio:stage. This stage belongs to the "${compositeStudio}" studio.\n\nCall \`haiku_run_next { intent: "${slug}" }\` to get the next action.`,
			)
			break
		}

		case "outputs_missing": {
			sections.push(`## Missing Required Outputs\n\n${action.message}`)
			break
		}

		case "elaboration_insufficient": {
			sections.push(`## Elaboration Insufficient\n\n${action.message}`)
			break
		}

		case "spec_validation_failed": {
			sections.push(`## Spec Validation Failed\n\n${action.message}`)
			break
		}

		case "review_elaboration": {
			const stage = action.stage as string
			// Path-only review agent prompts
			const agentPaths: Record<string, string> = readReviewAgentPaths(
				studio,
				stage,
			)
			{
				const stageDef = readStageDef(studio, stage)
				if (
					stageDef?.data?.["review-agents-include"] &&
					Array.isArray(stageDef.data["review-agents-include"])
				) {
					const includes = stageDef.data["review-agents-include"] as Array<{
						stage: string
						agents: string[]
					}>
					for (const inc of includes) {
						if (!inc.stage || !Array.isArray(inc.agents)) continue
						const crossPaths = readReviewAgentPaths(studio, inc.stage)
						for (const agentName of inc.agents) {
							if (crossPaths[agentName] && !agentPaths[agentName]) {
								agentPaths[`${agentName} (from ${inc.stage})`] =
									crossPaths[agentName]
							}
						}
					}
				}
			}

			sections.push("## Review Elaboration Artifacts")
			sections.push(
				"Run adversarial review agents on the elaboration specs before the pre-execution gate opens.",
			)
			if (Object.keys(agentPaths).length > 0) {
				sections.push(
					"### Review Agent Fan-Out (REQUIRED)\n\n**Spawn exactly one subagent per review agent in parallel — no duplicates.** Each `<subagent>` block below is a complete prompt — relay verbatim. Prompts are path-based so the parent context stays small.\n",
				)
				for (const [name, mandatePath] of Object.entries(agentPaths)) {
					const prompt = [
						`You are the **${name}** review agent reviewing elaboration artifacts for stage "${stage}" of intent "${slug}".`,
						"",
						"## Required context (inlined below)",
						"Your review mandate is embedded in this prompt.",
						"",
						inlineFile(mandatePath, `Mandate: ${name}`),
						"",
						"## Write scope (STRICT)",
						"**You MUST NOT write, edit, or create any file.** Your ONLY output channel is the `haiku_feedback` MCP tool. If you're tempted to fix an issue yourself, log it as feedback instead. Any file write is a scope violation.",
						"",
						"## Instructions",
						"",
						"1. Use your mandate (above) as the lens for this review.",
						`2. Read the elaboration specs: unit files in \`.haiku/intents/${slug}/stages/${stage}/units/\`.`,
						`3. Read discovery artifacts in \`.haiku/intents/${slug}/knowledge/\`.`,
						"4. Review through your mandate's lens.",
						`5. For each issue you find, call \`haiku_feedback({ intent: "${slug}", stage: "${stage}", title: "<short title>", body: "<full description>", origin: "adversarial-review", author: "${name}" })\`.`,
						"6. Return only a summary count of how many findings you logged.",
					].join("\n")
					sections.push(
						emitSubagentDispatchBlock({
							unit: `review-elab-${stage}`,
							hat: name,
							bolt: 1,
							agentType: "general-purpose",
							promptBody: prompt,
							heading: `#### Subagent: \`${name}\``,
						}) + "\n",
					)
				}
			}
			sections.push(
				`### Parent Instructions (do NOT include in subagent prompts)\n\nSpawn review subagents in parallel using the \`prompt_file\` attribute — pass \`"Read <prompt_file> and execute its instructions exactly."\` as the spawn prompt. They persist findings directly via haiku_feedback. After all complete, call \`haiku_run_next { intent: "${slug}" }\` to advance.`,
			)
			break
		}

		case "awaiting_external_review": {
			const externalUrl = (action.external_review_url as string) || ""
			sections.push(
				`## Awaiting External Review\n\n${
					externalUrl
						? `The stage is awaiting external review at: ${externalUrl}`
						: "The stage is awaiting external review but no review URL has been recorded."
				}\n\nThe orchestrator checks for approval automatically. Neither detected approval yet.\n\nInform the user that the stage is waiting on external review. After the review is approved, run \`/haiku:pickup\` to continue.`,
			)
			break
		}

		case "design_direction_required": {
			sections.push(
				`## Design Direction Required\n\nThis stage requires wireframe variants before proceeding.\n\n1. Generate 2-3 distinct design approaches as HTML wireframe snippets\n2. Call \`pick_design_direction\` with the variants\n3. After the user selects a direction, call \`haiku_run_next { intent: "${slug}", design_direction_selected: true }\`\n\nCheck for design provider MCPs (\`mcp__pencil__*\`, \`mcp__openpencil__*\`) and use them if available.`,
			)
			break
		}

		case "discovery_missing": {
			sections.push(`## Missing Discovery Artifacts\n\n${action.message}`)
			break
		}

		case "dag_cycle_detected": {
			sections.push(`## Circular Dependency Detected\n\n${action.message}`)
			break
		}

		case "error": {
			sections.push(`## Error\n\n${action.message}`)
			break
		}

		case "complete": {
			sections.push(`## Already Complete\n\n${action.message}`)
			break
		}

		case "unit_inputs_missing": {
			sections.push(`## Missing Unit Inputs\n\n${action.message}`)
			break
		}

		case "fix_quality_gates": {
			sections.push(
				`## Quality Gates Failed\n\n${action.message || "No details provided."}\n\n### Instructions\n\nFix each failing gate, then call \`haiku_run_next { intent: "${slug}" }\` to retry. The orchestrator will re-run the gates before proceeding to adversarial review.`,
			)
			break
		}

		case "changes_requested": {
			const annotations = action.annotations as
				| Array<{ path?: string; body?: string }>
				| undefined
			let body = `## Changes Requested\n\n${action.message || "No details provided."}`
			if (annotations && annotations.length > 0) {
				body += "\n\n### Annotations\n"
				for (const a of annotations) {
					body += `\n- ${a.path ? `**${a.path}:** ` : ""}${a.body || ""}`
				}
			}
			body += `\n\n### Instructions\n\nAddress each piece of feedback, then call \`haiku_run_next { intent: "${slug}" }\` to re-submit for review.`
			sections.push(body)
			break
		}

		case "external_review_requested": {
			sections.push(
				`## External Review Requested\n\n${action.message || "No details provided."}`,
			)
			break
		}

		case "unresolved_dependencies": {
			sections.push(
				`## Unresolved Dependencies\n\n${action.message || "No details provided."}\n\n### Instructions\n\nFix the \`depends_on\` fields in the affected unit files to reference existing unit names, then call \`haiku_run_next { intent: "${slug}" }\` to retry.`,
			)
			break
		}

		case "unit_naming_invalid": {
			sections.push(
				`## Unit Naming Invalid\n\n${action.message || "No details provided."}\n\n### Instructions\n\nRename the affected files to match the \`unit-NN-slug.md\` pattern (e.g., \`unit-01-data-model.md\`), then call \`haiku_run_next { intent: "${slug}" }\` to retry.`,
			)
			break
		}

		case "inputs_missing": {
			sections.push(
				`## Missing Inputs\n\n${action.message || "Units are missing required input references."}\n\n### Instructions\n\nAdd \`inputs:\` to each unit's frontmatter referencing the artifacts it needs, then call \`haiku_run_next { intent: "${slug}" }\` to retry.`,
			)
			break
		}

		case "gate_blocked": {
			sections.push(
				`## Gate Review Blocked\n\n${action.message || "No details provided."}\n\n### Instructions\n\nCall \`haiku_run_next { intent: "${slug}" }\` to retry the gate review. If the issue persists, ask the user for guidance.`,
			)
			break
		}

		case "safe_intent_repair": {
			const synthesizedStages = (action.synthesized_stages as string[]) || []
			const phaseWasRegressed = (action.phase_regressed as boolean) || false
			sections.push(`## Safe Intent Repair\n\n${action.message}`)
			if (synthesizedStages.length > 0) {
				sections.push(`**Synthesized stages:** ${synthesizedStages.join(", ")}`)
			}
			if (phaseWasRegressed) {
				sections.push(
					"**Phase regressed:** The active stage was regressed from `execute` to `elaborate` because some units are missing `inputs:` declarations. Address the missing inputs before proceeding.",
				)
			}
			sections.push(
				`### Instructions\n\nResolve any stages needing manual review, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
			)
			break
		}

		default: {
			sections.push(
				`## Unknown Action: ${action.action}\n\n${JSON.stringify(action, null, 2)}`,
			)
			break
		}
	}

	return sections.join("\n\n")
}

// ── Tool definitions ───────────────────────────────────────────────────────

export const orchestratorToolDefs = [
	{
		name: "haiku_run_next",
		description:
			"Advance an intent through its lifecycle. The FSM reads state, determines the next action, " +
			"performs the state mutation (start stage, advance phase, complete stage, etc.), and returns " +
			"the action to the agent. The agent follows the returned action — it never mutates stage or " +
			"intent state directly.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				external_review_url: {
					type: "string",
					description: "URL where stage was submitted for external review",
				},
			},
			required: ["intent"],
		},
	},
	// haiku_gate_approve removed — gates are handled by the FSM (review UI + elicitation fallback)
	{
		name: "haiku_intent_create",
		description:
			'Create a new H·AI·K·U intent. Studio selection happens separately via haiku_select_studio. You must provide BOTH a crisp `title` (3–8 words, ≤80 chars, single line, no trailing punctuation — e.g. "Add archivable intents") AND a richer `description` (2–5 sentences covering scope, motivation, and constraints). The title is NOT derived from the description — write it deliberately as a human-readable summary.',
		inputSchema: {
			type: "object" as const,
			properties: {
				title: {
					type: "string",
					description:
						'Short human-readable title (3–8 words, max 80 chars, single line, no trailing period). Must be a deliberate summary — NOT the first 80 chars of the description. Good: "Add archivable intents". Bad: "Add archivable intents to H·AI·K·U. Users need a way to soft-hide…".',
				},
				description: {
					type: "string",
					description:
						"Full description of what the intent is about (2–5 sentences covering scope, motivation, and constraints). Stored verbatim in the intent body.",
				},
				slug: {
					type: "string",
					description:
						"URL-friendly slug for the intent (auto-generated from title if not provided)",
				},
				context: {
					type: "string",
					description:
						"Conversation context summary — highlights from the conversation that led to this intent",
				},
				mode: {
					type: "string",
					description:
						"Execution mode: continuous (stages auto-advance) or discrete (pause between stages). Defaults to continuous.",
					enum: ["continuous", "discrete"],
				},
				stages: {
					type: "array",
					items: { type: "string" },
					description:
						"Explicit stage list — overrides the studio's default stages. Use to run a subset of stages (e.g. just ['development'] for quick tasks).",
				},
			},
			required: ["title", "description"],
		},
	},
	{
		name: "haiku_select_studio",
		description:
			"Select or change the studio for an intent. Uses elicitation to present studio options. Cannot be used after the intent has entered any stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				options: {
					type: "array",
					items: { type: "string" },
					description:
						"Studio names to present. Empty or omitted = all studios. Single item = auto-select.",
				},
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_revisit",
		description:
			"Revisit an earlier stage or phase. Passing `reasons` is preferred — each reason creates a " +
			"feedback file before rolling back, ensuring findings are captured durably. Without reasons, " +
			"returns a stopgap instead of rolling back. " +
			"If `stage` is provided, jumps directly to that stage. " +
			"Without `stage`, infers the target: if in execute/review/gate phase, revisits elaborate in the current stage; " +
			"if already in elaborate, revisits the previous stage. " +
			"Agents can call this when they detect missing information from a prior stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: {
					type: "string",
					description:
						"Target stage to revisit (optional — omit to let the FSM infer the target)",
				},
				reasons: {
					type: "array",
					description:
						"Optional feedback reasons. Each creates a feedback file before the revisit.",
					items: {
						type: "object",
						properties: {
							title: {
								type: "string",
								description: "Feedback title",
							},
							body: {
								type: "string",
								description: "Feedback body (markdown)",
							},
						},
						required: ["title", "body"],
					},
				},
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_reset",
		description:
			"Reset an intent — preserves the description, deletes all state, and recreates the intent from scratch. Asks for confirmation via elicitation before proceeding.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to reset" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_archive",
		description:
			"Archive an intent — sets the `archived: true` frontmatter flag so the intent is hidden from default list views. Reversible via haiku_intent_unarchive. Does not prompt for confirmation.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to archive" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_unarchive",
		description:
			"Unarchive an intent — clears the `archived` frontmatter flag so the intent reappears in default list views. Reversible via haiku_intent_archive. Does not prompt for confirmation.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to unarchive" },
			},
			required: ["intent"],
		},
	},
]

// ── Tool handlers ──────────────────────────────────────────────────────────

/**
 * Callback for opening a review and blocking until the user decides.
 * Set by server.ts at startup to avoid circular imports.
 */
let _openReviewAndWait:
	| ((
			intentDir: string,
			reviewType: string,
			gateType?: string,
	  ) => Promise<{ decision: string; feedback: string; annotations?: unknown }>)
	| null = null

/**
 * Callback for elicitation — asks the user a question via the MCP client's native UI.
 * Used as fallback when the review UI fails to open.
 */
let _elicitInput:
	| ((params: { message: string; requestedSchema: unknown }) => Promise<{
			action: string
			content?: unknown
	  }>)
	| null = null

export function setOpenReviewHandler(handler: typeof _openReviewAndWait): void {
	_openReviewAndWait = handler
}

export function setElicitInputHandler(handler: typeof _elicitInput): void {
	_elicitInput = handler
}

export async function handleOrchestratorTool(
	name: string,
	args: Record<string, unknown>,
): Promise<{
	content: Array<{ type: "text"; text: string }>
	isError?: boolean
}> {
	const text = (s: string) => ({
		content: [{ type: "text" as const, text: s }],
	})

	const validationError = validateSlugArgs(args)
	if (validationError) return validationError

	if (name === "haiku_run_next") {
		const slug = args.intent as string
		const stFile = args.state_file as string | undefined

		// Validate we're on the correct intent branch
		const branchCheck = validateBranch(slug, "intent")
		if (branchCheck) {
			return {
				content: [{ type: "text" as const, text: branchCheck }],
				isError: true,
			}
		}

		// Stage-branch enforcement: before ANY stage-scoped write, align the
		// current checkout with the active stage branch. If main has drifted
		// ahead (feedback files or state leaked there), merge main → stage
		// first so the FSM sees a consistent view. No-op in filesystem mode.
		// Must run BEFORE the external_review_url write below — otherwise that
		// write could land on the wrong branch.
		{
			const intentFile = join(findHaikuRoot(), "intents", slug, "intent.md")
			if (existsSync(intentFile)) {
				const im = readFrontmatter(intentFile)
				const activeStage = (im.active_stage as string) || ""
				const guard = ensureOnStageBranch(slug, activeStage || undefined)
				if (!guard.ok) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: stage-branch enforcement failed for intent '${slug}', stage '${activeStage || "(none)"}' — ${guard.message}. Resolve manually and retry.`,
							},
						],
						isError: true,
					}
				}
			}
		}

		// Gap 8: If external_review_url is passed and stage is blocked, store it.
		// Placed AFTER the stage-branch guard so this write lands on the stage
		// branch, not intent main.
		if (args.external_review_url) {
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const intentFm = readFrontmatter(intentFile)
					const activeStage = (intentFm.active_stage as string) || ""
					if (activeStage) {
						const ssPath = stageStatePath(slug, activeStage)
						const ssData = readJson(ssPath)
						ssData.external_review_url = args.external_review_url as string
						writeJson(ssPath, ssData)
					}
				}
			} catch {
				/* non-fatal */
			}
		}

		const result = runNext(slug)
		emitTelemetry("haiku.orchestrator.action", {
			intent: slug,
			action: result.action,
		})
		if (stFile)
			logSessionEvent(stFile, {
				event: "run_next",
				intent: slug,
				action: result.action,
				stage: result.stage,
				unit: result.unit,
				hat: result.hat,
				wave: result.wave,
			})

		// Log validation failures
		if (stFile && result.action === "spec_validation_failed") {
			logSessionEvent(stFile, {
				event: "spec_validation_failed",
				intent: slug,
				stage: result.stage,
				violations: result.violations,
				allowed_types: result.allowed_types,
			})
		}
		if (stFile && result.action === "outputs_missing") {
			logSessionEvent(stFile, {
				event: "outputs_missing",
				intent: slug,
				stage: result.stage,
				missing: result.missing,
			})
		}
		if (stFile && result.action === "discovery_missing") {
			logSessionEvent(stFile, {
				event: "discovery_missing",
				intent: slug,
				stage: result.stage,
				missing: result.missing,
			})
		}
		if (stFile && result.action === "review_elaboration") {
			logSessionEvent(stFile, {
				event: "review_elaboration",
				intent: slug,
				stage: result.stage,
			})
		}

		// Read intent metadata for instruction building (used in all return paths)
		let intentMeta: Record<string, unknown> = {}
		try {
			const iDir = intentDir(slug)
			const intentRaw = readFileSync(join(iDir, "intent.md"), "utf8")
			const parsed = parseFrontmatter(intentRaw)
			intentMeta = parsed.data
		} catch {
			/* intent might not exist for error actions */
		}
		const intentStudio = (intentMeta.studio as string) || ""

		// Helper to enrich result with preview and append instructions
		const withInstructions = (resultObj: Record<string, unknown>): string => {
			enrichActionWithPreview(resultObj as OrchestratorAction)
			const instructions = buildRunInstructions(
				slug,
				intentStudio,
				resultObj as OrchestratorAction,
				intentDir(slug),
			)
			// Adapt instructions for the active harness (near-noop for Claude Code)
			const adapted = adaptInstructions(instructions)
			// Strip tell_user/next_step from outer JSON — they appear in the announcement section
			const { tell_user: _tu, next_step: _ns, ...resultForJson } = resultObj
			return `${JSON.stringify(resultForJson, null, 2)}\n\n---\n\n${adapted}`
		}

		// External review: include instructions about recording the URL
		if (result.action === "external_review_requested") {
			result.message = `${(result.message as string) || ""}\n\nIMPORTANT: Ask the user WHERE they submitted the work for review (PR URL, MR link, email, Slack channel, etc.). Record the URL by calling haiku_run_next { intent: \"${slug}\", external_review_url: \"<url>\" } so the FSM can track approval status.`
		}

		// Gate review: open review UI, block until user decides, process decision
		if (result.action === "gate_review" && _openReviewAndWait) {
			const stage = result.stage as string
			const nextStage = result.next_stage as string | null
			const nextPhase = result.next_phase as string | null
			const gateContext = (result.gate_context as string) || "stage_gate"
			const gateType = result.gate_type as string
			const intentDirPath = `.haiku/intents/${slug}`
			if (stFile)
				logSessionEvent(stFile, {
					event: "gate_review_opened",
					intent: slug,
					stage,
					gate_type: gateType,
				})
			try {
				const reviewResult = await _openReviewAndWait(
					intentDirPath,
					"intent",
					gateType,
				)

				// Re-enforce stage branch after the await — the user may have
				// manually checked out another branch during the review wait.
				// Every downstream branch of this switch writes stage or intent
				// state, so alignment must be re-verified here.
				{
					const postReviewGuard = ensureOnStageBranch(slug, stage)
					if (!postReviewGuard.ok) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Error: stage-branch enforcement failed after review wait for intent '${slug}', stage '${stage}' — ${postReviewGuard.message}. Resolve manually and retry.`,
								},
							],
							isError: true,
						}
					}
				}

				if (stFile)
					logSessionEvent(stFile, {
						event: "gate_decision",
						intent: slug,
						stage,
						decision: reviewResult.decision,
						feedback: reviewResult.feedback,
					})
				if (reviewResult.decision === "approved") {
					if (gateContext === "intent_review") {
						// Intent approved — mark as reviewed AND advance phase to execute
						const intentFilePath = join(
							process.cwd(),
							intentDirPath,
							"intent.md",
						)
						setFrontmatterField(intentFilePath, "intent_reviewed", true)
						if (nextPhase) fsmAdvancePhase(slug, stage, nextPhase)
						gitCommitState(`haiku: intent ${slug} approved by user`)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = {
							action: "intent_approved",
							intent: slug,
							stage,
							from_phase: "elaborate",
							to_phase: nextPhase,
							message: `Intent approved — advancing to ${nextPhase || "execute"}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.`,
						}
						return text(withInstructions(gateResult))
					}
					if (gateContext === "elaborate_to_execute" && nextPhase) {
						// Phase advancement (specs approved → start execution)
						fsmAdvancePhase(slug, stage, nextPhase)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = {
							action: "advance_phase",
							intent: slug,
							stage,
							from_phase: "elaborate",
							to_phase: nextPhase,
							message: `Specs approved — advancing to ${nextPhase}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.`,
						}
						return text(withInstructions(gateResult))
					}
					if (nextStage) {
						fsmAdvanceStage(slug, stage, nextStage)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = {
							action: "advance_stage",
							intent: slug,
							stage,
							next_stage: nextStage,
							gate_outcome: "advanced",
							message: `Approved — advancing to '${nextStage}'. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user, do NOT summarize, do NOT say "want me to continue?" — the gate was already approved. Just call the tool.`,
						}
						return text(withInstructions(gateResult))
					}
					fsmCompleteStage(slug, stage, "advanced")
					fsmIntentComplete(slug)
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = {
						action: "intent_complete",
						intent: slug,
						message:
							"Approved — intent complete. IMPORTANT: Report completion summary. Do NOT ask what to do next — the intent is done.",
					}
					return text(withInstructions(gateResult))
				}
				if (reviewResult.decision === "external_review") {
					fsmCompleteStage(slug, stage, "blocked")
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = {
						action: "external_review_requested",
						intent: slug,
						stage,
						feedback: reviewResult.feedback,
						message: isGitRepo()
							? `External review requested. Open ONE merge request from branch 'haiku/${slug}/${stage}' to 'haiku/${slug}/main'. Do NOT open separate MRs for individual units — all unit work is already merged into the stage branch. Include the H·AI·K·U browse link in the description so reviewers can see the intent, units, and knowledge artifacts. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:pickup again after approval.`
							: `External review requested. Submit the work for review through your project's review process. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:pickup again after approval.`,
					}
					return text(withInstructions(gateResult))
				}
				// changes_requested — persist all annotations and feedback as durable feedback files
				const feedbackIds = writeReviewFeedbackFiles(slug, stage, reviewResult)
				const feedbackSummary =
					feedbackIds.length > 0
						? ` Created ${feedbackIds.length} feedback file(s): ${feedbackIds.join(", ")}.`
						: ""

				if (gateContext === "intent_review") {
					// Intent rejected — stay in pending, agent must revise intent.md
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = {
						action: "changes_requested",
						intent: slug,
						stage,
						feedback: reviewResult.feedback,
						annotations: reviewResult.annotations,
						feedback_ids: feedbackIds,
						message: `Changes requested on intent: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`,
					}
					return text(withInstructions(gateResult))
				}
				if (gateContext === "elaborate_to_execute") {
					// Don't advance phase — stay in elaborate so agent can fix
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = {
						action: "changes_requested",
						intent: slug,
						stage,
						feedback: reviewResult.feedback,
						annotations: reviewResult.annotations,
						feedback_ids: feedbackIds,
						message: `Changes requested on specs: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} Fix the specs, then call haiku_run_next { intent: "${slug}" } again.`,
					}
					return text(withInstructions(gateResult))
				}
				syncSessionMetadata(slug, args.state_file as string | undefined)
				const gateResult = {
					action: "changes_requested",
					intent: slug,
					stage,
					feedback: reviewResult.feedback,
					annotations: reviewResult.annotations,
					feedback_ids: feedbackIds,
					message: `Changes requested: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} Address the feedback, then call haiku_run_next { intent: "${slug}" } again.`,
				}
				return text(withInstructions(gateResult))
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				const errorStack = err instanceof Error ? err.stack : ""
				console.error(`[haiku] gate_review failed: ${errorMsg}`)
				reportError(err, { intent: slug, stage })

				// Log full error to .haiku/ for debugging
				try {
					const logDir = join(process.cwd(), ".haiku", "logs")
					mkdirSync(logDir, { recursive: true })
					writeFileSync(
						join(logDir, "gate-review-error.log"),
						`${new Date().toISOString()}\nintent: ${slug}\nstage: ${stage}\nerror: ${errorMsg}\n${errorStack}\n---\n`,
						{ flag: "a" },
					)
				} catch {
					/* logging failure is non-fatal */
				}

				// Classify error: agent-fixable or retryable errors go back to the agent
				const agentFixable =
					errorMsg.includes("Could not parse intent") ||
					errorMsg.includes("No such file") ||
					errorMsg.includes("ENOENT") ||
					errorMsg.includes("frontmatter") ||
					errorMsg.includes("invalid identifier") ||
					errorMsg.includes("Circular dependency") ||
					errorMsg.includes("timeout") ||
					errorMsg.includes("Timeout")

				if (agentFixable) {
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return {
						content: [
							{
								type: "text" as const,
								text: `GATE BLOCKED: ${errorMsg}. This is a data issue the agent can fix — check that the intent directory and files are correctly structured, then call haiku_run_next again.`,
							},
						],
						isError: true,
					}
				}

				// Infrastructure failure — fall back to elicitation
				if (stFile)
					logSessionEvent(stFile, {
						event: "gate_elicitation_fallback",
						intent: slug,
						stage,
						error: errorMsg,
					})
				if (_elicitInput) {
					try {
						const elicitResult = await _elicitInput({
							message:
								gateContext === "intent_review"
									? `Review UI failed (${errorMsg}). Approve intent '${slug}' to begin work?`
									: `Review UI failed (${errorMsg}). Approve stage '${stage}' specs to proceed to execution?`,
							requestedSchema: {
								type: "object" as const,
								properties: {
									decision: {
										type: "string",
										title: "Decision",
										description: "Approve specs or request changes",
										enum: ["approve", "request_changes"],
									},
									feedback: {
										type: "string",
										title: "Feedback (optional)",
										description: "Any notes or requested changes",
									},
								},
								required: ["decision"],
							},
						})

						// Re-enforce stage branch after the elicitation await —
						// user may have switched branches while the prompt was up.
						{
							const postElicitGuard = ensureOnStageBranch(slug, stage)
							if (!postElicitGuard.ok) {
								return {
									content: [
										{
											type: "text" as const,
											text: `Error: stage-branch enforcement failed after elicitation for intent '${slug}', stage '${stage}' — ${postElicitGuard.message}. Resolve manually and retry.`,
										},
									],
									isError: true,
								}
							}
						}

						if (elicitResult.action === "accept" && elicitResult.content) {
							const decision = (elicitResult.content as Record<string, string>)
								.decision
							const feedback =
								(elicitResult.content as Record<string, string>).feedback || ""
							if (decision === "approve") {
								if (gateContext === "intent_review") {
									const intentFilePath = join(
										process.cwd(),
										intentDirPath,
										"intent.md",
									)
									setFrontmatterField(intentFilePath, "intent_reviewed", true)
									if (nextPhase) fsmAdvancePhase(slug, stage, nextPhase)
									gitCommitState(
										`haiku: intent ${slug} approved by user (elicitation)`,
									)
									syncSessionMetadata(
										slug,
										args.state_file as string | undefined,
									)
									const elicitApproveResult = {
										action: "intent_approved",
										intent: slug,
										stage,
										from_phase: "elaborate",
										to_phase: nextPhase,
										message: `Intent approved — advancing to ${nextPhase || "execute"}. Call haiku_run_next immediately.`,
									}
									return text(withInstructions(elicitApproveResult))
								}
								if (gateContext === "elaborate_to_execute" && nextPhase) {
									fsmAdvancePhase(slug, stage, nextPhase)
									syncSessionMetadata(
										slug,
										args.state_file as string | undefined,
									)
									const elicitApproveResult = {
										action: "advance_phase",
										intent: slug,
										stage,
										from_phase: "elaborate",
										to_phase: nextPhase,
										message:
											"Specs approved via elicitation — advancing to execute",
									}
									return text(withInstructions(elicitApproveResult))
								}
								if (nextStage) {
									fsmAdvanceStage(slug, stage, nextStage)
									syncSessionMetadata(
										slug,
										args.state_file as string | undefined,
									)
									const elicitApproveResult = {
										action: "advance_stage",
										intent: slug,
										stage,
										next_stage: nextStage,
										gate_outcome: "advanced",
										message: "Approved via elicitation",
									}
									return text(withInstructions(elicitApproveResult))
								}
								fsmCompleteStage(slug, stage, "advanced")
								fsmIntentComplete(slug)
								syncSessionMetadata(slug, args.state_file as string | undefined)
								const elicitApproveResult = {
									action: "intent_complete",
									intent: slug,
									message: "Approved via elicitation — intent complete",
								}
								return text(withInstructions(elicitApproveResult))
							}
							// request_changes
							syncSessionMetadata(slug, args.state_file as string | undefined)
							const changeMsg =
								gateContext === "intent_review"
									? `Changes requested on intent: ${feedback}. Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`
									: `Changes requested: ${feedback}. Call haiku_run_next { intent: "${slug}" } again after fixing.`
							const elicitChangesResult = {
								action: "changes_requested",
								intent: slug,
								stage,
								feedback,
								message: changeMsg,
							}
							return text(withInstructions(elicitChangesResult))
						}
						// User declined/cancelled elicitation — stay blocked
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const elicitCancelResult = {
							action: "gate_blocked",
							intent: slug,
							stage,
							message:
								"Gate review cancelled. Call haiku_run_next again to retry.",
						}
						return text(withInstructions(elicitCancelResult))
					} catch {
						// Elicitation also failed — return error
					}
				}

				syncSessionMetadata(slug, args.state_file as string | undefined)
				// Return as an MCP error — isError: true prevents the agent from treating this as a valid response
				return {
					content: [
						{
							type: "text" as const,
							text: `GATE BLOCKED: Review UI and elicitation both failed. Error: ${errorMsg}. Logged to .haiku/logs/gate-review-error.log. Call haiku_run_next to retry.`,
						},
					],
					isError: true,
				}
			}
		}

		// ── Repair agent intercept ─────────────────────────────────────────
		// If runNext detected a broken migrated intent, try the embedded repair
		// agent before returning to the outer agent. Falls through to the normal
		// withInstructions return if the agent isn't available or repair fails.
		if (result.action === "safe_intent_repair") {
			try {
				const { runRepairAgent } = await import("./repair-agent.js")
				const root = findHaikuRoot()
				const iDir = join(root, "intents", slug)

				// Resolve studio directory via the cached studio reader
				const studioInfo = resolveStudio(intentStudio)
				const studioDir = studioInfo?.path
				if (!studioDir) {
					// Can't find studio — fall through to normal handling
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return text(withInstructions(result))
				}

				const activeStage = (result.stage as string) || ""
				const diagnosis = {
					slug,
					intentDir: iDir,
					studio: intentStudio,
					studioDir,
					activeStage,
					synthesizedStages: (result.synthesized_stages as string[]) || [],
					needsManualReview: (result.needs_manual_review as string[]) || [],
					phaseRegressed: (result.phase_regressed as boolean) || false,
					unitsMissingInputs: (result.units_missing_inputs as string[]) || [],
				}

				const repairResult = await runRepairAgent(diagnosis)

				// Re-enforce stage branch after the repair-agent await — it can
				// take minutes, during which the user or the repair agent itself
				// may have touched the checkout. Every downstream write depends
				// on the correct branch.
				{
					const postRepairGuard = ensureOnStageBranch(
						slug,
						(result.stage as string) || undefined,
					)
					if (!postRepairGuard.ok) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Error: stage-branch enforcement failed after repair-agent run for intent '${slug}' — ${postRepairGuard.message}. Resolve manually and retry.`,
								},
							],
							isError: true,
						}
					}
				}

				if (repairResult.success && !repairResult.fallbackUsed) {
					// Repair agent succeeded — run FSM again to get the real next action
					const postRepairResult = runNext(slug)

					// Guard: if repair didn't actually fix things, don't loop
					if (postRepairResult.action === "safe_intent_repair") {
						// Fall through to return the original result as-is
					} else {
						emitTelemetry("haiku.orchestrator.action", {
							intent: slug,
							action: postRepairResult.action,
						})
						if (stFile)
							logSessionEvent(stFile, {
								event: "run_next",
								intent: slug,
								action: postRepairResult.action,
								stage: postRepairResult.stage,
								unit: postRepairResult.unit,
								hat: postRepairResult.hat,
								wave: postRepairResult.wave,
							})

						syncSessionMetadata(slug, args.state_file as string | undefined)

						const repairNote = `**Intent repaired automatically:** ${repairResult.summary}\n\n---\n\n`
						return {
							content: [
								{
									type: "text" as const,
									text: repairNote + withInstructions(postRepairResult),
								},
							],
						}
					}
				}
				// Repair failed or used fallback — fall through to return safe_intent_repair as-is
			} catch {
				// Repair agent not available — fall through to normal handling
			}
		}

		syncSessionMetadata(slug, args.state_file as string | undefined)
		return text(withInstructions(result))
	}

	// haiku_gate_approve was removed — ask-gate approval is now handled
	// directly by haiku_run_next via the FSM (see gate_review flow).

	if (name === "haiku_intent_create") {
		const description = args.description as string
		const titleInput = args.title as string | undefined
		let slug = args.slug as string | undefined

		// Title is required: must be a crisp, human-readable summary the agent
		// writes deliberately. We do NOT derive it by truncating the description.
		if (!titleInput || typeof titleInput !== "string") {
			return text(
				JSON.stringify({
					error: "missing_title",
					message:
						'haiku_intent_create requires a `title` parameter — a crisp 3–8 word summary (≤80 chars, single line, no trailing period). Write it deliberately; do NOT pass a truncated description. Example: title: "Add archivable intents".',
				}),
			)
		}
		// Reject newlines explicitly before normalization — otherwise `\s+` would
		// collapse them to spaces and hide the intent (a multi-line title input
		// is a sign the agent pasted a paragraph, not wrote a title).
		if (/[\r\n]/.test(titleInput)) {
			return text(
				JSON.stringify({
					error: "invalid_title",
					message:
						"`title` must be a single line — got newlines. Rewrite as a crisp 3–8 word summary (≤80 chars) and call again.",
				}),
			)
		}
		const title = titleInput.trim().replace(/\s+/g, " ")
		if (intentTitleNeedsRepair(title)) {
			return text(
				JSON.stringify({
					error: "invalid_title",
					message: `\`title\` must be non-empty and ≤80 chars after trimming. Got ${title.length} chars. Rewrite as a 3–8 word summary and call again.`,
				}),
			)
		}

		// Generate slug from title if not provided
		if (!slug) {
			slug = title
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, "")
				.replace(/\s+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50)
				.replace(/-$/, "")
		}

		slug = validateIdentifier(slug, "intent slug")

		// One intent per session — reject if this session already has an active intent
		const stateFile = args.state_file as string | undefined
		if (stateFile) {
			const existingIntent = getSessionIntent(stateFile)
			if (existingIntent) {
				return {
					content: [
						{
							type: "text" as const,
							text: `This session already has an active intent: '${existingIntent}'. Only one intent per session is allowed. Use /clear to start a new session, then create a new intent.`,
						},
					],
					isError: true,
				}
			}
		}

		// Check if intent already exists
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		if (existsSync(join(iDir, "intent.md"))) {
			return text(
				JSON.stringify({
					error: "intent_exists",
					slug,
					message: `Intent '${slug}' already exists`,
				}),
			)
		}

		// Create directory structure
		mkdirSync(join(iDir, "knowledge"), { recursive: true })
		mkdirSync(join(iDir, "stages"), { recursive: true })

		// Build intent.md with frontmatter + body (no studio — selected separately).
		// Title and description are distinct: title is a short human-readable summary
		// the agent wrote deliberately; description is the full narrative body.
		const context = args.context as string | undefined
		const mode = (args.mode as string) || "continuous"
		const stagesOverride = args.stages as string[] | undefined
		const descriptionBody = (description || "").trim()
		const intentContent = [
			"---",
			`title: "${title.replace(/"/g, '\\"')}"`,
			`studio: ""`,
			`mode: ${mode}`,
			"status: active",
			...(stagesOverride
				? [`stages:\n${stagesOverride.map((s) => `  - ${s}`).join("\n")}`]
				: []),
			`created_at: ${timestamp()}`,
			"---",
			"",
			`# ${title}`,
			"",
			...(descriptionBody ? [descriptionBody, ""] : []),
			...(context ? [context, ""] : []),
		].join("\n")

		writeFileSync(join(iDir, "intent.md"), intentContent)

		// Also write conversation context to knowledge for discoverability
		if (context) {
			const knowledgeDir = join(iDir, "knowledge")
			mkdirSync(knowledgeDir, { recursive: true })
			writeFileSync(
				join(knowledgeDir, "CONVERSATION-CONTEXT.md"),
				`# Conversation Context\n\n${context}\n`,
			)
		}

		// Git commit (+ push for git-persisted studios)
		gitCommitState(`haiku: create intent ${slug}`)

		emitTelemetry("haiku.intent.created", { intent: slug })
		if (stateFile)
			logSessionEvent(stateFile, { event: "intent_created", intent: slug })

		return text(
			JSON.stringify(
				{
					action: "intent_created",
					slug,
					path: `.haiku/intents/${slug}`,
					message: `Intent '${slug}' created. Call haiku_run_next { intent: "${slug}" } to begin.`,
				},
				null,
				2,
			),
		)
	}

	if (name === "haiku_select_studio") {
		const slug = args.intent as string
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")

		if (!existsSync(intentFile)) {
			return text(
				JSON.stringify({
					error: "not_found",
					message: `Intent '${slug}' not found`,
				}),
			)
		}

		// Check if intent has entered any stage (any state.json with status != "pending")
		const stagesDir = join(iDir, "stages")
		if (existsSync(stagesDir)) {
			for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue
				const statePath = join(stagesDir, entry.name, "state.json")
				if (existsSync(statePath)) {
					const state = readJson(statePath)
					if (state.status && state.status !== "pending") {
						return {
							content: [
								{
									type: "text" as const,
									text: "Cannot change studio after intent has entered a stage.",
								},
							],
							isError: true,
						}
					}
				}
			}
		}

		// Get available studios
		const allStudios = listStudios()
		const allStudioNames = allStudios.map((s) => s.name)

		if (allStudios.length === 0) {
			return {
				content: [{ type: "text" as const, text: "No studios available." }],
				isError: true,
			}
		}

		const options = (args.options as string[] | undefined) || []
		// selectedStudio stores the directory name (stable on-disk identifier) —
		// UI displays the canonical `name`, but everything downstream reads by `dir`.
		let selectedStudio = ""

		// Single option — auto-select. Resolve by dir/name/slug/alias.
		if (options.length === 1) {
			const resolved = resolveStudio(options[0])
			if (!resolved) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Studio '${options[0]}' not found. Available: ${allStudioNames.join(", ")}`,
						},
					],
					isError: true,
				}
			}
			selectedStudio = resolved.dir
		} else if (_elicitInput) {
			// Determine elicitation choices — always display canonical names
			let elicitChoices: string[]
			let showAllOption = false

			// Try to map provided options (which may be any alias form) to canonical names
			const mappedOptions = options
				.map((o) => resolveStudio(o))
				.filter((s): s is NonNullable<typeof s> => s !== null)
				.map((s) => s.name)

			if (
				!options ||
				options.length === 0 ||
				mappedOptions.length >= allStudioNames.length
			) {
				elicitChoices = allStudioNames
			} else if (mappedOptions.length === 0) {
				elicitChoices = allStudioNames
			} else {
				elicitChoices = [...mappedOptions, "Show all studios..."]
				showAllOption = true
			}

			// Build descriptions (canonical name + slug if distinct + description)
			const descriptionLines = allStudios
				.filter((s) => elicitChoices.includes(s.name))
				.map((s) => {
					const slugPart = s.slug && s.slug !== s.name ? ` (${s.slug})` : ""
					return `${s.name}${slugPart}: ${s.description || s.name}`
				})
				.join("\n")

			try {
				const elicitResult = await _elicitInput({
					message: `Select a studio for intent "${slug}":\n\n${descriptionLines}`,
					requestedSchema: {
						type: "object" as const,
						properties: {
							studio: {
								type: "string",
								title: "Studio",
								description: "Which studio lifecycle to use",
								enum: elicitChoices,
							},
						},
						required: ["studio"],
					},
				})

				if (elicitResult.action === "accept" && elicitResult.content) {
					const content = elicitResult.content as Record<string, string>
					let chosen: string
					if (content.studio === "Show all studios..." && showAllOption) {
						// Re-elicit with full list
						const allDescriptions = allStudios
							.map((s) => {
								const slugPart =
									s.slug && s.slug !== s.name ? ` (${s.slug})` : ""
								return `${s.name}${slugPart}: ${s.description || s.name}`
							})
							.join("\n")
						const reElicit = await _elicitInput({
							message: `All available studios:\n\n${allDescriptions}`,
							requestedSchema: {
								type: "object" as const,
								properties: {
									studio: {
										type: "string",
										title: "Studio",
										enum: allStudioNames,
									},
								},
								required: ["studio"],
							},
						})
						if (reElicit.action === "accept" && reElicit.content) {
							chosen = (reElicit.content as Record<string, string>).studio || ""
						} else {
							return text(
								JSON.stringify({
									action: "cancelled",
									message: "Studio selection cancelled by user",
								}),
							)
						}
					} else {
						chosen = content.studio || ""
					}
					// Resolve the chosen canonical name back to its dir
					const resolved = resolveStudio(chosen)
					selectedStudio = resolved ? resolved.dir : ""
				} else {
					return text(
						JSON.stringify({
							action: "cancelled",
							message: "Studio selection cancelled by user",
						}),
					)
				}
			} catch {
				return {
					content: [
						{
							type: "text" as const,
							text: "Elicitation failed. Pass a single studio in the options array to auto-select.",
						},
					],
					isError: true,
				}
			}
		} else {
			// No elicitation available — return studio list so agent can ask conversationally
			const studioDescriptions = allStudios
				.map((s) => {
					const slugPart = s.slug && s.slug !== s.name ? ` _(${s.slug})_` : ""
					return `- **${s.name}**${slugPart}: ${s.description || ""}`
				})
				.join("\n")
			return text(
				JSON.stringify(
					{
						action: "select_studio_conversational",
						intent: slug,
						available_studios: allStudios.map((s) => ({
							name: s.name,
							slug: s.slug,
							aliases: s.aliases,
							description: s.description,
							category: s.category,
						})),
						message: `Elicitation unavailable. Ask the user which studio to use, then call haiku_select_studio { intent: "${slug}", options: ["<chosen-studio>"] } with a single option to auto-select. The option may be the canonical name, slug, or any alias.\n\nAvailable studios:\n${studioDescriptions}`,
					},
					null,
					2,
				),
			)
		}

		if (!selectedStudio) {
			return {
				content: [{ type: "text" as const, text: "No studio selected." }],
				isError: true,
			}
		}

		// Re-enforce branch after the studio-selection elicit(s) completed.
		// Studio selection is pre-stage — the intent has no active_stage yet —
		// so ensureOnStageBranch correctly falls back to intent-main. The user
		// may have flipped branches while the picker was open; subsequent
		// writes to intent.md must land on intent-main.
		{
			const postStudioGuard = ensureOnStageBranch(slug, undefined)
			if (!postStudioGuard.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: branch enforcement failed after studio selection for intent '${slug}' — ${postStudioGuard.message}. Resolve manually and retry.`,
						},
					],
					isError: true,
				}
			}
		}

		// Update intent.md with selected studio — only set stages if not already overridden
		const intentFmCheck = readFrontmatter(intentFile)
		const existingStages = intentFmCheck.stages as string[] | undefined
		const allStudioStages = resolveStudioStages(selectedStudio)

		// Validate pre-set stages exist in the selected studio
		if (existingStages && existingStages.length > 0) {
			const invalid = existingStages.filter((s) => !allStudioStages.includes(s))
			if (invalid.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Invalid stages for studio '${selectedStudio}': ${invalid.join(", ")}. Available stages: ${allStudioStages.join(", ")}`,
						},
					],
					isError: true,
				}
			}
		}

		const activeStages =
			existingStages && existingStages.length > 0
				? existingStages // stages were set at creation time (e.g. quick mode)
				: allStudioStages
		setFrontmatterField(intentFile, "studio", selectedStudio)
		if (!existingStages || existingStages.length === 0) {
			setFrontmatterField(intentFile, "stages", activeStages)
		}

		gitCommitState(`haiku: select studio ${selectedStudio} for intent ${slug}`)
		emitTelemetry("haiku.studio.selected", {
			intent: slug,
			studio: selectedStudio,
		})

		return text(
			JSON.stringify(
				{
					action: "studio_selected",
					intent: slug,
					studio: selectedStudio,
					stages: activeStages,
					all_studio_stages: allStudioStages,
					message: `Studio '${selectedStudio}' selected for intent '${slug}'. Call haiku_run_next { intent: "${slug}" } to begin.`,
				},
				null,
				2,
			),
		)
	}

	if (name === "haiku_revisit") {
		const reasons = args.reasons as
			| Array<{ title: string; body: string }>
			| undefined

		// Validate reasons if provided
		if (reasons !== undefined) {
			if (Array.isArray(reasons) && reasons.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: reasons array must contain at least one item",
						},
					],
					isError: true,
				}
			}
			if (Array.isArray(reasons)) {
				for (const reason of reasons) {
					if (!reason.title || reason.title.trim() === "") {
						return {
							content: [
								{
									type: "text" as const,
									text: "Error: each reason must have a non-empty title",
								},
							],
							isError: true,
						}
					}
					if (!reason.body || reason.body.trim() === "") {
						return {
							content: [
								{
									type: "text" as const,
									text: "Error: each reason must have a non-empty body",
								},
							],
							isError: true,
						}
					}
				}
			}
		}

		// Stopgap: no reasons provided — do NOT roll back
		if (!reasons) {
			return text(
				JSON.stringify(
					{
						action: "revisit_needs_reasons",
						message:
							"To revisit, provide reasons as feedback. Call haiku_revisit with reasons: [{title, body}] so the feedback is recorded before rolling back.",
					},
					null,
					2,
				),
			)
		}

		// Reasons provided — write feedback files BEFORE rolling back
		const revisitSlug = args.intent as string
		const revisitRoot = findHaikuRoot()
		const revisitIntentFile = join(
			revisitRoot,
			"intents",
			revisitSlug,
			"intent.md",
		)
		if (!existsSync(revisitIntentFile)) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: intent '${revisitSlug}' not found`,
					},
				],
				isError: true,
			}
		}
		const revisitIntentData = readFrontmatter(revisitIntentFile)
		const revisitTargetStage =
			(args.stage as string | undefined) ||
			(revisitIntentData.active_stage as string) ||
			""
		if (!revisitTargetStage) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: no active stage found for intent '${revisitSlug}'`,
					},
				],
				isError: true,
			}
		}

		// Align branch with the current active stage BEFORE writing feedback
		// files. Without this, feedback can land on whatever branch was
		// checked out at call time (e.g. intent-main) and prepareRevisitBranch
		// only merges main + fromStage into the target — so feedback mis-written
		// to a third branch wouldn't make it into the revisit.
		const revisitPreBranchErr = (() => {
			const guard = ensureOnStageBranch(
				revisitSlug,
				(revisitIntentData.active_stage as string) || undefined,
			)
			if (!guard.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: stage-branch enforcement failed for revisit of intent '${revisitSlug}' — ${guard.message}. Resolve manually and retry.`,
						},
					],
					isError: true as const,
				}
			}
			return null
		})()
		if (revisitPreBranchErr) return revisitPreBranchErr

		// Write feedback files
		const createdFeedback: Array<{
			feedback_id: string
			title: string
		}> = []
		for (const reason of reasons) {
			const fb = writeFeedbackFile(revisitSlug, revisitTargetStage, {
				title: reason.title,
				body: reason.body,
				origin: "agent",
				author: "parent-agent",
			})
			createdFeedback.push({
				feedback_id: fb.feedback_id,
				title: reason.title,
			})
		}
		gitCommitState(
			`haiku: revisit feedback in ${revisitTargetStage} (${createdFeedback.length} items)`,
		)

		// Now perform the revisit (rolls phase to elaborate)
		const revisitResult = revisit(revisitSlug, args.stage as string | undefined)

		// If revisit() failed (e.g. prepareRevisitBranch hit a merge conflict),
		// short-circuit BEFORE appending an iteration entry. Otherwise a retry
		// after conflict resolution would produce a duplicate iteration record.
		if (revisitResult.action === "error") {
			return text(JSON.stringify(revisitResult, null, 2))
		}

		// Record a user-revisit iteration on the target stage. User-invoked
		// revisits are NOT capped — explicit human intent always wins over
		// the iteration guardrails.
		const iterResult = appendStageIteration(
			revisitSlug,
			revisitTargetStage,
			{
				trigger: "user-revisit",
				reason: `User revisit with ${createdFeedback.length} feedback item(s)`,
				feedbackTitles: createdFeedback.map((f) => f.title),
			},
			"user-revisit",
		)
		gitCommitState(
			`haiku: user-revisit ${revisitTargetStage} (iteration ${iterResult.count})`,
		)

		emitTelemetry("haiku.orchestrator.action", {
			intent: revisitSlug,
			action: "revisit_with_reasons",
			feedback_count: String(createdFeedback.length),
		})
		syncSessionMetadata(revisitSlug, args.state_file as string | undefined)

		return text(
			JSON.stringify(
				{
					action: "revisit",
					from_stage:
						(revisitIntentData.active_stage as string) || revisitTargetStage,
					from_phase: revisitResult.target_phase ? "gate" : "execute",
					to_stage: revisitTargetStage,
					to_phase: "elaborate",
					iteration: iterResult.count,
					visits: iterResult.count, // legacy alias — prefer `iteration`
					feedback_created: createdFeedback,
					message: `Revisited ${revisitTargetStage} (elaborate, iteration ${iterResult.count}). Created ${createdFeedback.length} feedback item(s).`,
				},
				null,
				2,
			),
		)
	}

	if (name === "haiku_intent_reset") {
		const slug = args.intent as string

		// Validate intent exists
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")
		if (!existsSync(intentFile)) {
			return {
				content: [
					{ type: "text" as const, text: `Intent '${slug}' not found.` },
				],
				isError: true,
			}
		}

		// Read the title and description before deleting
		const raw = readFileSync(intentFile, "utf8")
		const { data, body } = parseFrontmatter(raw)
		const title = (data.title as string) || ""
		// Description = body minus the H1 heading, trimmed
		const description = body.replace(/^#\s+.*\n+/, "").trim() || title

		// Ask for confirmation via elicitation
		if (_elicitInput) {
			const result = await _elicitInput({
				message: `Reset intent "${slug}"?\n\nThis will DELETE all state (stages, units, knowledge) and recreate the intent with the same description.\n\nDescription: "${description}"`,
				requestedSchema: {
					type: "object" as const,
					properties: {
						confirm: {
							type: "string",
							title: "Confirm Reset",
							description: "This cannot be undone",
							enum: ["Reset", "Cancel"],
						},
					},
					required: ["confirm"],
				},
			})

			if (
				result.action !== "accept" ||
				(result.content as Record<string, string>)?.confirm !== "Reset"
			) {
				return text(
					JSON.stringify({ action: "cancelled", message: "Reset cancelled." }),
				)
			}
		} else {
			return {
				content: [
					{
						type: "text" as const,
						text: "Reset requires user confirmation via elicitation.",
					},
				],
				isError: true,
			}
		}

		// Read conversation context if it exists (preserve it). Read this
		// BEFORE the branch switch so we read from whatever branch has the
		// ctx file (most recent state), not whatever branch we end up on.
		let conversationContext = ""
		const ctxFile = join(iDir, "knowledge", "CONVERSATION-CONTEXT.md")
		if (existsSync(ctxFile)) {
			conversationContext = readFileSync(ctxFile, "utf8").replace(
				/^# Conversation Context\n\n/,
				"",
			)
		}

		// Reset is intent-scoped — land on intent-main so the delete applies
		// there, not split-brain on a stage branch. Without this guard, if the
		// agent resets while checked out on a stage branch, the delete lands
		// on the stage branch only; intent-main still holds the full intent
		// and the next haiku_intent_create would see existsSync=true.
		{
			const resetGuard = ensureOnStageBranch(slug, undefined)
			if (!resetGuard.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: branch enforcement failed for intent reset '${slug}' — ${resetGuard.message}. Resolve manually and retry.`,
						},
					],
					isError: true,
				}
			}
		}

		// Clean up any existing stage branches so the recreated intent starts
		// from a truly clean slate. Without this, the next fsmStartStage would
		// see pre-existing stage branches and try to merge stale work into the
		// new intent's lifecycle.
		const intentFm = parseFrontmatter(raw).data
		const studio = (intentFm.studio as string) || ""
		if (studio && isGitRepo()) {
			const allStudioStages = resolveStudioStages(studio)
			for (const stg of allStudioStages) {
				const stgBranch = `haiku/${slug}/${stg}`
				if (branchExists(stgBranch)) {
					deleteStageBranch(slug, stg)
				}
			}
		}

		// Delete the intent directory
		rmSync(iDir, { recursive: true, force: true })

		// Git commit the deletion
		gitCommitState(`haiku: reset intent ${slug} (deleted)`)

		// Return instruction to recreate
		return text(
			JSON.stringify(
				{
					action: "intent_reset",
					slug,
					title,
					description,
					context: conversationContext,
					message: `Intent '${slug}' has been reset. Call haiku_intent_create { title: "${title.replace(/"/g, '\\"')}", description: "${description.replace(/"/g, '\\"').replace(/\n/g, "\\n")}", slug: "${slug}"${conversationContext ? ', context: "<preserved context>"' : ""} } to recreate it.`,
				},
				null,
				2,
			),
		)
	}

	if (name === "haiku_intent_archive") {
		const slug = args.intent as string
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", slug, "intent.md")

		if (!existsSync(intentFile)) {
			return {
				content: [
					{ type: "text" as const, text: `Intent '${slug}' not found.` },
				],
				isError: true,
			}
		}

		// Single-read idempotency check: parse once with parseFrontmatter (which
		// normalizes dates). If already archived, noop. Otherwise delegate the
		// write to setFrontmatterField — it re-reads but preserves the
		// normalizeDates() pass we depend on for stable YAML output.
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))

		if (data.archived === true) {
			return text(
				JSON.stringify(
					{
						action: "noop",
						slug,
						path: intentFile,
						message: `Intent '${slug}' is already archived.`,
					},
					null,
					2,
				),
			)
		}

		// Archive is intent-scoped metadata — land on intent-main so the mutation
		// is visible everywhere, not split-brain on whatever stage branch the
		// agent happens to be on when they archive.
		{
			const archiveGuard = ensureOnStageBranch(slug, undefined)
			if (!archiveGuard.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: branch enforcement failed for intent archive '${slug}' — ${archiveGuard.message}. Resolve manually and retry.`,
						},
					],
					isError: true,
				}
			}
		}

		setFrontmatterField(intentFile, "archived", true)
		gitCommitState(`haiku: archive intent ${slug}`)

		return text(
			JSON.stringify(
				{
					action: "intent_archived",
					slug,
					path: intentFile,
					message: `Intent '${slug}' has been archived. Call haiku_intent_unarchive to restore it.`,
				},
				null,
				2,
			),
		)
	}

	if (name === "haiku_intent_unarchive") {
		const slug = args.intent as string
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", slug, "intent.md")

		if (!existsSync(intentFile)) {
			return {
				content: [
					{ type: "text" as const, text: `Intent '${slug}' not found.` },
				],
				isError: true,
			}
		}

		// Single-pass read: parse once with gray-matter, use it for both the
		// idempotency check and the write. Previously we parseFrontmatter'd
		// the file, checked archived, then re-read and re-parsed inside matter()
		// for the write — two full reads per call.
		const raw = readFileSync(intentFile, "utf8")
		const parsed = matter(raw)

		if (parsed.data.archived !== true) {
			return text(
				JSON.stringify(
					{
						action: "noop",
						slug,
						path: intentFile,
						message: `Intent '${slug}' is not archived.`,
					},
					null,
					2,
				),
			)
		}

		// Unarchive is intent-scoped metadata — land on intent-main so the
		// mutation is visible everywhere, not split-brain on a stage branch.
		{
			const unarchiveGuard = ensureOnStageBranch(slug, undefined)
			if (!unarchiveGuard.ok) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: branch enforcement failed for intent unarchive '${slug}' — ${unarchiveGuard.message}. Resolve manually and retry.`,
						},
					],
					isError: true,
				}
			}
		}

		// Remove the `archived` key entirely rather than leaving `archived: false`.
		// Cleaner: an unarchived intent looks pristine, no trace of prior archival.
		const { archived: _archived, ...dataWithoutArchived } = parsed.data
		writeFileSync(
			intentFile,
			matter.stringify(parsed.content, dataWithoutArchived),
		)
		gitCommitState(`haiku: unarchive intent ${slug}`)

		return text(
			JSON.stringify(
				{
					action: "intent_unarchived",
					slug,
					path: intentFile,
					message: `Intent '${slug}' has been unarchived.`,
				},
				null,
				2,
			),
		)
	}

	return text(`Unknown orchestrator tool: ${name}`)
}
