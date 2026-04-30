// orchestrator/prompts/_helpers.ts — Shared functional helpers used
// by per-action prompt builders. The static contract blocks live
// in their own per-block files in this directory:
//
//   - WORKFLOW_CONTRACTS_ELABORATE_BLOCK.ts
//   - WORKFLOW_CONTRACTS_EXECUTE_BLOCK.ts
//   - WORKFLOW_CONTRACTS_REVIEW_BLOCK.ts
//   - WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK.ts
//   - SUBAGENT_ERROR_RECOVERY.ts
//
// This module holds only functions that compute prompt fragments
// at call time:
//   - readInterpretation / buildInterpretationBlock — render the
//     `interpretation: lens|strict` mandate-mode block.
//   - inlineFile — strip frontmatter and emit a fenced inline block.
//   - emitSubagentDispatchBlock — write the prompt to a tmpfile and
//     emit the parent's `<subagent>` dispatch block.
//   - resolveReviewAgentModel — cascade hat → stage → studio for the
//     review/fix-hat model tier.
//   - buildInlineSubagentContext — hookless-harness inline context.
//   - batchDispatchDirective — concurrency-cap discipline (slot pool
//     vs batch-serial depending on harness capabilities).

import { existsSync, readFileSync } from "node:fs"
import matter from "gray-matter"
import { features } from "../../config.js"
import { getCapabilities } from "../../harness.js"
import { type ModelTier, resolveModel } from "../../model-selection.js"
import {
	MAX_CONCURRENT_SUBAGENTS,
	parseFrontmatter,
} from "../../state-tools.js"
import {
	readModelFromPath,
	readStageDef,
	readStudio,
} from "../../studio-reader.js"
import {
	formatSubagentDispatchBlock,
	writeSubagentPrompt,
} from "../../subagent-prompt-file.js"

/** Read the `interpretation:` field from a hat-like frontmatter file.
 *  Returns "lens" | "strict" | undefined (unset). Universal field on
 *  hat/review-agent/fix-hat frontmatter. */
export function readInterpretation(
	filePath: string | undefined,
): "lens" | "strict" | undefined {
	if (!filePath || !existsSync(filePath)) return undefined
	try {
		const { data } = parseFrontmatter(readFileSync(filePath, "utf8"))
		const v = data.interpretation
		if (v === "lens" || v === "strict") return v
		return undefined
	} catch {
		return undefined
	}
}

/** Build the interpretive block injected into a dispatch prompt right
 *  after the agent's mandate is inlined. Returns "" when interpretation
 *  is unset (no block emitted). */
export function buildInterpretationBlock(
	mode: "lens" | "strict" | undefined,
): string {
	if (!mode) return ""
	if (mode === "lens") {
		return [
			"## Mandate interpretation: LENS",
			"",
			"Your mandate above is a **lens**, not a checklist.",
			"",
			"- **In-spirit findings count.** A finding obviously within your mandate's lens but not listed as an explicit checklist item is IN scope. The mandate names representative concerns, not the exhaustive set.",
			"- **Out-of-mandate findings are NOT in scope, even if visible.** If your glob matched a file but the change has nothing to do with your lens, return zero findings. Inventing findings to justify dispatch is a scope violation, not thoroughness.",
			"- **Letter and spirit are not separable.** A change that technically passes a literal check but obviously violates what the check exists to enforce IS a finding. State the spirit-violation explicitly in the body so the fix loop knows what to address.",
		].join("\n")
	}
	return [
		"## Mandate interpretation: STRICT",
		"",
		"Your mandate above is a **literal checklist**.",
		"",
		'- Findings MUST be tied to a specific named item in your mandate. Do NOT extend to "in-spirit" issues — for this review, false positives carry the same weight as false negatives.',
		"- If you see something concerning outside the checklist, do NOT log it through this agent. Log it through a different review agent if one exists, or surface it as an out-of-scope observation in your summary.",
		"- Cite the specific checklist item each finding maps to in the `body:` field so the fix loop can verify scope.",
	].join("\n")
}

/** Strip YAML frontmatter and emit a fenced inline block. Frontmatter
 *  carries workflow metadata that the orchestrator already consumed — the
 *  subagent should see only the authoritative body. ~~~~ fences survive
 *  inlined content that contains triple backticks. */
export function inlineFile(absPath: string, heading: string): string {
	if (!existsSync(absPath)) return ""
	const raw = readFileSync(absPath, "utf8")
	let body: string
	try {
		body = matter(raw).content.trim()
	} catch {
		body = raw
	}
	if (!body) return ""
	return `### ${heading}\n\n*Source: \`${absPath}\`*\n\n~~~~\n${body}\n~~~~\n`
}

/** Read a unit's iterations frontmatter and emit a "Prior rejection" block
 *  for the next bolt. The most-recent completed iteration with
 *  `result === "reject"` and a non-empty `reason` is surfaced so the next
 *  bolt's hat — whether re-running its own work after an auto-reject, or
 *  picking up after a downstream hat bounced back — knows what was rejected.
 *
 *  Without this, `inlineFile()` strips the unit FM (where iterations live)
 *  and the next-bolt prompt is silent on what failed. The reviewer's reason
 *  ("Two defects: ...") or the quality-gate auto-reject summary
 *  ("auto-reject: quality_gate_failed (typecheck, ...)") are dropped on the
 *  floor and the next bolt re-discovers the failure mode from scratch.
 *
 *  Returns "" when no completed reject is found (first hat / first bolt /
 *  unit file missing). */
export function buildPriorRejectBlock(unitFilePath: string): string {
	if (!existsSync(unitFilePath)) return ""
	let iters: Array<{
		hat?: unknown
		completed_at?: unknown
		result?: unknown
		reason?: unknown
	}> = []
	try {
		const { data } = parseFrontmatter(readFileSync(unitFilePath, "utf8"))
		if (Array.isArray(data.iterations)) {
			iters = data.iterations as typeof iters
		}
	} catch {
		return ""
	}
	for (let i = iters.length - 1; i >= 0; i--) {
		const it = iters[i]
		if (!it) continue
		if (!it.completed_at) continue
		if (it.result !== "reject") continue
		if (typeof it.reason !== "string" || !it.reason.trim()) continue
		const hatName = typeof it.hat === "string" ? it.hat : "previous hat"
		return [
			"## Prior rejection — address this before advancing",
			"",
			`The previous bolt's **${hatName}** hat rejected the work with this reason:`,
			"",
			"~~~~",
			it.reason.trim(),
			"~~~~",
			"",
			"Treat each item as a hard requirement: your hat is NOT done until every issue above is resolved. Reference the specific items in your final commit message and your hat-completion summary so the next reviewer can verify closure. Do NOT call `haiku_unit_advance_hat` while any of these remain open — call `haiku_unit_reject_hat` with what's still outstanding.",
		].join("\n")
	}
	return ""
}

/** Mirror of `buildPriorRejectBlock` for fix-loop prompts. Reads a
 *  feedback file's `iterations:` frontmatter (shape: FeedbackIteration —
 *  `result: "advanced" | "closed" | "reopened" | "rejected"`) and surfaces
 *  the most-recent `rejected` entry's reason so a fix-loop bolt N+1 hat
 *  knows what the previous attempt was rejected for (assessor reject,
 *  fixer-side `haiku_feedback_reject`, etc).
 *
 *  Returns "" when no rejected iteration is found (first fix bolt, fresh
 *  finding, missing file). */
export function buildPriorFeedbackRejectBlock(
	feedbackFilePath: string,
): string {
	if (!existsSync(feedbackFilePath)) return ""
	let iters: Array<{
		bolt?: unknown
		hat?: unknown
		completed_at?: unknown
		result?: unknown
		reason?: unknown
	}> = []
	try {
		const { data } = parseFrontmatter(readFileSync(feedbackFilePath, "utf8"))
		if (Array.isArray(data.iterations)) {
			iters = data.iterations as typeof iters
		}
	} catch {
		return ""
	}
	for (let i = iters.length - 1; i >= 0; i--) {
		const it = iters[i]
		if (!it) continue
		if (!it.completed_at) continue
		if (it.result !== "rejected") continue
		if (typeof it.reason !== "string" || !it.reason.trim()) continue
		const hatName = typeof it.hat === "string" ? it.hat : "previous fixer"
		const boltStr = typeof it.bolt === "number" ? ` (bolt ${it.bolt})` : ""
		return [
			"## Prior fix-bolt rejection — address this before advancing",
			"",
			`The previous fix attempt's **${hatName}** hat${boltStr} was rejected with this reason:`,
			"",
			"~~~~",
			it.reason.trim(),
			"~~~~",
			"",
			"Treat each item as a hard requirement on this bolt: do NOT repeat the same approach the previous bolt took unless you've identified a meaningfully different root cause. Reference the items by name in your bolt summary and the commit message so the next assessor can verify closure.",
		].join("\n")
	}
	return ""
}

/** Emit a `<subagent>` block whose body is a tmpfile pointer instead
 *  of an inlined prompt. The full prompt is written to a session-scoped
 *  tmpfile; the parent's instruction tells the spawning agent to read
 *  it. The `background` attribute on the emitted block is auto-gated on
 *  the active harness's `subagents.backgroundSpawn` capability — Claude
 *  Code supports it, others don't, so the dispatch markup is only
 *  decorated where the parent can actually follow it. */
export function emitSubagentDispatchBlock(opts: {
	unit: string
	hat: string
	bolt: number
	agentType: string
	model?: string | null
	promptBody: string
	heading?: string
	toolAttr?: boolean
}): string {
	const { unit, hat, bolt, agentType, model, promptBody, heading, toolAttr } =
		opts
	const { path, parentInstruction } = writeSubagentPrompt({
		unit,
		hat,
		bolt,
		content: promptBody,
	})
	return formatSubagentDispatchBlock({
		path,
		parentInstruction,
		agentType,
		model,
		heading,
		toolAttr,
		background: getCapabilities().subagents.backgroundSpawn,
	})
}

/** Resolve the model tier for a review-agent or studio-level fix-hat
 *  dispatch. Cascade: mandate file's own `model:` → stage
 *  `default_model:` (when stage is provided — skip for studio-level
 *  review agents) → studio `default_model:`. Returns undefined when
 *  the feature is disabled or nothing is declared, in which case the
 *  subagent inherits the parent model. Without a studio default this
 *  silently escalates every review pass to Opus — hence studios ship
 *  with `default_model: sonnet` so the floor is sonnet. */
export function resolveReviewAgentModel(opts: {
	mandatePath: string
	studio: string
	stage?: string
}): ModelTier | undefined {
	if (!features.modelSelection) return undefined
	const { mandatePath, studio, stage } = opts
	const mandateModel = readModelFromPath(mandatePath)
	const stageDef = stage ? readStageDef(studio, stage) : null
	const studioData = readStudio(studio)
	const { model } = resolveModel({
		unit: undefined,
		hat: mandateModel,
		stage: stageDef?.data?.default_model as string | undefined,
		studio: studioData?.data?.default_model as string | undefined,
	})
	return model
}

/** Build the per-subagent context block injected into unit/hat
 *  dispatch prompts on hookless harnesses. On Claude Code (hooks
 *  available), context injection happens at the hook layer — return
 *  empty string and let the hook do its job. Covers hat isolation,
 *  workflow rules, resilience, and harness-aware communication
 *  guidance. */
export function buildInlineSubagentContext(
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

/** Render the parent's concurrency-capped dispatch discipline for a
 *  parallel subagent wave. Slot pool when the harness has
 *  backgroundSpawn; batch-serial otherwise. */
export function batchDispatchDirective(
	count: number,
	label = "subagents",
): string {
	const backgroundSpawn = getCapabilities().subagents.backgroundSpawn

	if (count <= MAX_CONCURRENT_SUBAGENTS) {
		if (backgroundSpawn) {
			return `**Concurrency cap:** up to ${MAX_CONCURRENT_SUBAGENTS} concurrent background ${label} (env \`HAIKU_MAX_CONCURRENT_SUBAGENTS\`). This wave has ${count} — spawn all ${count} as background ${label} in a single turn and react to completion notifications as they arrive.`
		}
		return `**Concurrency cap:** up to ${MAX_CONCURRENT_SUBAGENTS} concurrent ${label} (env \`HAIKU_MAX_CONCURRENT_SUBAGENTS\`). This wave has ${count} — spawn them all in a single turn and wait for every ${label.replace(/s$/, "")} to return before proceeding.`
	}

	if (backgroundSpawn) {
		return [
			`**Concurrency cap:** slot pool of ${MAX_CONCURRENT_SUBAGENTS} concurrent background ${label} (env \`HAIKU_MAX_CONCURRENT_SUBAGENTS\`). This wave has ${count} items; at any moment, at most ${MAX_CONCURRENT_SUBAGENTS} are in flight. A slot frees the instant one completes — fire the next pending item into it.`,
			"",
			`**Dispatch protocol:**`,
			"",
			`1. **Seed the pool.** In one turn, spawn the first ${MAX_CONCURRENT_SUBAGENTS} items as **background** ${label} (the spawn primitive returns immediately; the subagent runs in the background and the system delivers a completion notification when it finishes). Do NOT block on any spawn.`,
			"",
			`2. **On each completion notification**, in the same turn:`,
			`   - Briefly inspect the result (final-hat closure state is already persisted; deep-read not required).`,
			`   - If items remain in the queue: spawn exactly ONE new background ${label.replace(/s$/, "")} for the next pending item. The pool stays saturated at ${MAX_CONCURRENT_SUBAGENTS}.`,
			`   - If the queue is empty: acknowledge and wait — remaining slots are draining.`,
			"",
			`3. **Multiple simultaneous completions** may arrive in one turn. Fire one replacement per completion; cap stays at ${MAX_CONCURRENT_SUBAGENTS}.`,
			"",
			`4. **Wave exhausted:** when the pool reaches 0 AND the queue is empty, this wave is done.`,
			"",
			`5. **No foreground (blocking) spawns** during the pool's lifetime. A foreground spawn stalls the notification stream and breaks the pool.`,
			"",
			`6. **Clarification / approval-request returns:** if a ${label.replace(/s$/, "")} returns asking for approval to execute its embedded instructions rather than producing a real result, treat the slot as freed and re-queue or abandon the item per judgment — don't block the pool.`,
			"",
			`**Order:** process items in the declared order below so re-entries after interruption are deterministic.`,
		].join("\n")
	}

	const batches = Math.ceil(count / MAX_CONCURRENT_SUBAGENTS)
	const last = count - MAX_CONCURRENT_SUBAGENTS * (batches - 1)
	const sizes =
		last === MAX_CONCURRENT_SUBAGENTS
			? `${batches} batches of ${MAX_CONCURRENT_SUBAGENTS}`
			: `${batches - 1} batch${batches - 1 === 1 ? "" : "es"} of ${MAX_CONCURRENT_SUBAGENTS} + 1 batch of ${last}`
	return [
		`**Concurrency cap:** ${MAX_CONCURRENT_SUBAGENTS} ${label} in flight at a time (env \`HAIKU_MAX_CONCURRENT_SUBAGENTS\`). This wave has ${count} — split into ${sizes}. Your harness has no background-spawn primitive, so this is batch-serial (slower than a true slot pool but equivalent correctness).`,
		"",
		`**Batch discipline:**`,
		`1. Spawn batch 1 (first ${MAX_CONCURRENT_SUBAGENTS}) in a single turn.`,
		`2. Wait for **every** ${label.replace(/s$/, "")} in that batch to return.`,
		`3. Spawn batch 2 in the next turn. Repeat until the wave is exhausted.`,
		`4. Process items in the order listed below so re-entries after interruption are deterministic.`,
	].join("\n")
}
