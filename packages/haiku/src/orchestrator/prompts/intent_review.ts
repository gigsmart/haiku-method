// orchestrator/prompts/intent_review.ts — Per-role intent-completion
// review. Cursor returns `intent_review { role }` once every stage is
// merged into intent main and at least one role on `intent.approvals`
// is still missing. One tick per role; the engine signs each via the
// review server / agent dispatch and walks again until every role is
// signed, then emits `merge_intent`.
//
// Roles fall into three buckets:
//   - "spec"        → spec-conformance subagent over the merged intent
//   - "continuity"  → continuity-review subagent over the merged intent
//   - "user"        → open the human gate (haiku_review_open)
//   - <studio-agent> → studio-level review-agent mandate
//
// The companion `intent_completion_review` builder handles the bulk
// "spawn every studio review-agent in parallel" pass that happens
// once per intent. This builder serializes the per-role drumbeat the
// cursor walks after that pass, so each role is unambiguous.

import { readStudioReviewAgentPaths } from "../../studio-reader.js"
import {
	emitSubagentDispatchBlock,
	inlineFile,
	resolveStudioMandateModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const role = (action.role as string) || ""

	if (role === "user") {
		const lines: string[] = []
		lines.push(`# Intent-completion gate: user approval`)
		lines.push("")
		lines.push(
			`Every stage of intent **${slug}** is merged into intent main and every required agent reviewer has signed. The user is the last signature before the engine seals the intent.`,
		)
		lines.push("")
		lines.push("## What to do")
		lines.push("")
		lines.push(
			`1. Call \`haiku_review_open { intent: "${slug}", scope: "intent" }\` to open the intent-completion review session.`,
		)
		lines.push(
			`2. Post the returned URL to the user — one or two sentences, no walls of text.`,
		)
		lines.push(
			`3. Call \`haiku_await_gate { intent: "${slug}" }\` and block on the decision.`,
		)
		lines.push(
			`4. On approve, the engine stamps \`approvals.user\` on intent.md and the next tick emits \`merge_intent\` → \`sealed\`. On request_changes, the engine writes the annotations as intent-scope feedback and the cursor walks Track B on the next tick.`,
		)
		return lines.join("\n")
	}

	// Agent roles. Resolve the mandate path from studio config; fall
	// back to a generic prompt when the role is "spec" or "continuity"
	// (engine-built-in agents the studio doesn't ship as files).
	const mandates = readStudioReviewAgentPaths(studio)
	const mandatePath = mandates[role]

	const lines: string[] = []
	lines.push(`# Intent-completion review: \`${role}\``)
	lines.push("")
	lines.push(
		`Every stage of intent **${slug}** is merged into intent main. Role \`${role}\` is the next missing signature on \`intent.approvals\`.`,
	)
	lines.push("")
	lines.push("## What to do")
	lines.push("")

	if (mandatePath) {
		const mandateModel = resolveStudioMandateModel({ mandatePath, studio })
		const reviewPrompt = [
			`You are the **${role}** intent-completion review agent for intent "${slug}".`,
			"",
			"## Required context (inlined below)",
			"Your review mandate is embedded in this prompt. You audit the WHOLE intent — every stage's artifacts — against the studio's standards.",
			"",
			inlineFile(mandatePath, `Mandate: ${role}`),
			"",
			"## Write scope (STRICT)",
			"You MUST NOT write, edit, or create any file. Your ONLY output channel is `haiku_feedback` (intent scope — omit `stage`).",
			"",
			"## Instructions",
			"",
			`1. Read intent artifacts: \`.haiku/intents/${slug}/stages/*/\` and \`.haiku/intents/${slug}/knowledge/\`.`,
			`2. Audit through your mandate's lens.`,
			`3. For each issue: \`haiku_feedback({ intent: "${slug}", title, body, origin: "studio-review", author: "${role}" })\`. Omit \`stage\`.`,
			`4. When done, return a one-line summary of how many findings you logged. The engine signs \`approvals.${role}\` automatically when the subagent terminates clean (no findings) — outstanding findings drive the studio fix-hat loop on the next tick.`,
		].join("\n")

		lines.push(
			`Spawn one subagent for the \`${role}\` review. The mandate is inlined in the dispatch block below.`,
		)
		lines.push("")
		lines.push(
			emitSubagentDispatchBlock({
				unit: `intent-review-${slug}`,
				hat: role,
				bolt: 1,
				agentType: "general-purpose",
				model: mandateModel,
				promptBody: reviewPrompt,
				heading: `### Subagent: \`${role}\``,
			}),
		)
		lines.push("")
		lines.push(
			`When the subagent returns, call \`haiku_run_next { intent: "${slug}" }\`. The engine reconciles \`approvals.${role}\` and either advances to the next role or emits \`merge_intent\`.`,
		)
		return lines.join("\n")
	}

	// Engine-built-in roles (spec, continuity) with no studio mandate
	// file. Frame as "agent runs the inline check, then re-tick".
	const description =
		role === "spec"
			? "verify the intent's intent.md goals are reflected in the merged stage outputs (spec conformance)"
			: role === "continuity"
				? "verify cross-stage continuity: every produced output declared in stage A is referenced or consumed downstream where the stage graph requires it; every named asset that should render does render; no orphaned artifacts"
				: `audit the intent for the \`${role}\` standard`

	lines.push(
		`Spawn a single \`general-purpose\` subagent to ${description}. Have the subagent log any findings via \`haiku_feedback\` at intent scope (omit \`stage\`).`,
	)
	lines.push("")
	lines.push(
		`When the subagent returns, call \`haiku_run_next { intent: "${slug}" }\`. The engine reconciles \`approvals.${role}\` and either advances to the next role or emits \`merge_intent\`.`,
	)
	return lines.join("\n")
})
