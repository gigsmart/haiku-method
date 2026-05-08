// orchestrator/prompts/start_feedback_hat.ts — v4 fix-hat dispatch
// for an open feedback file.
//
// Cursor returns `start_feedback_hat { stage, hat, feedback_ids,
// terminal }` when an open FB needs its next fix-hat dispatched. The
// agent spawns a subagent that loads the FB, executes the fix-hat's
// mandate against the FB body, and calls
// `haiku_feedback_advance_hat` or `haiku_feedback_reject_hat` when
// done.
//
// Terminal hat (`feedback-assessor`): on advance, the FB closes
// (`closed_at` stamped) and `targets.invalidates` is applied to the
// targeted unit's approvals — the cursor on the next tick reroutes
// through those approval roles.
//
// Model routing — same cascade as unit dispatch (start_unit.ts). The
// resolution order is `feedback.model` → `hat.model` → stage
// `default_model:` → studio `default_model:`. Pre-fix this builder
// emitted no model annotation, so every fix-hat subagent inherited
// the parent's model — typically Opus, even for mechanical text-edit
// hats whose mandate would run fine on Sonnet. That cost dominated
// the per-stage token spend in the overtime-ac session
// (~$200, 72M tokens, 4 rounds of AC iteration). With this cascade
// in place, studios that ship `default_model: sonnet` get Sonnet on
// fix-hats by default; per-hat or per-FB `model:` overrides escalate
// when a particular fix needs Opus.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { features } from "../../config.js"
import { type ModelTier, resolveModel } from "../../model-selection.js"
import { intentDir, stageDir } from "../../state-tools.js"
import { readHatDefs, readStageDef, readStudio } from "../../studio-reader.js"
import { definePromptBuilder } from "./define.js"

/** Resolve the model for a fix-hat dispatch. Mirrors the cascade in
 *  start_unit.ts so feedback hats and unit hats route through the same
 *  rules. Optional FB-level override: if the FB frontmatter carries
 *  `model: <tier>`, it wins over hat / stage / studio. The first
 *  feedback_id in the dispatch defines the FB-level value (the cursor
 *  groups FBs by hat, so they all share the same fix-hat invocation —
 *  in practice they're always the same FB right now, but if that
 *  changes, the head FB's model takes precedence). */
function resolveFixHatModel(opts: {
	slug: string
	stage: string
	studio: string
	hat: string
	feedbackIds: readonly string[]
}): { model: ModelTier | undefined; source: string } | undefined {
	if (!features.modelSelection) return undefined
	const { slug, stage, studio, hat, feedbackIds } = opts
	let fbModel: string | undefined
	const headFbId = feedbackIds[0]
	if (headFbId) {
		// Try the standard `<NN>-*.md` filename (the engine writes this
		// shape; agents addressing FB-NN go through the cursor's emit so
		// they always match). Best-effort — a missing file means the FB
		// is intent-scope or freshly renamed; either way, the cascade
		// falls through to hat/stage/studio.
		const num = headFbId.replace(/^FB-/, "")
		const dir = stage
			? join(stageDir(slug, stage), "feedback")
			: join(intentDir(slug), "feedback")
		try {
			const candidates = existsSync(dir)
				? readdirSync(dir).filter(
						(f: string) => f.startsWith(num) && f.endsWith(".md"),
					)
				: []
			if (candidates.length > 0) {
				const raw = readFileSync(join(dir, candidates[0]), "utf8")
				fbModel = (matter(raw).data as { model?: string }).model
			}
		} catch {
			/* swallow — cascade falls through */
		}
	}
	// Stage may be empty for intent-scope FBs. readHatDefs / readStageDef
	// both validate the stage identifier and would throw — skip them
	// when there's no stage and let the cascade fall to studio default.
	const hatDef = stage ? readHatDefs(studio, stage)?.[hat] : undefined
	const stageDef = stage ? readStageDef(studio, stage) : undefined
	const studioData = readStudio(studio)
	const resolved = resolveModel({
		unit: fbModel, // FB acts as the "unit" level of the cascade
		hat: hatDef?.model,
		stage: stageDef?.data?.default_model as string | undefined,
		studio: studioData?.data?.default_model as string | undefined,
	})
	return { model: resolved.model, source: resolved.source }
}

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = (action.stage as string) || ""
	const hat = (action.hat as string) || ""
	const feedbackIds = (action.feedback_ids as string[]) || []
	const terminal = (action.terminal as boolean) || false

	const resolved = resolveFixHatModel({
		slug,
		stage,
		studio,
		hat,
		feedbackIds,
	})
	const modelTier = resolved?.model

	if (feedbackIds.length === 0) {
		return `## start_feedback_hat: no FBs\n\nThe cursor returned start_feedback_hat with no feedback_ids. Call \`haiku_run_next { intent: "${slug}" }\` to retick.`
	}

	const lines: string[] = []
	lines.push(`# Dispatch fix-hat \`${hat}\` for feedback on \`${stage}\``)
	lines.push("")
	lines.push(`Open feedback needing the \`${hat}\` hat:`)
	lines.push("")
	for (const id of feedbackIds) lines.push(`  - \`${id}\``)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn ${feedbackIds.length} subagent${feedbackIds.length === 1 ? "" : "s"} (parallel, single message, ${feedbackIds.length} \`Task\` call${feedbackIds.length === 1 ? "" : "s"}). Each subagent block below carries the **numeric FB ID** inlined into every tool call (e.g. \`feedback_id: 1\`). The MCP tools require an integer here — \`feedback_id: "FB-001"\` (string) is rejected at the AJV gate with \`<tool>_input_invalid\`. Pass the integer literal as written; do not requote, prefix, or zero-pad.`,
	)
	lines.push("")
	if (modelTier) {
		lines.push(
			`**Model:** spawn each Task with \`model: "${modelTier}"\` (resolved from the cascade — source: ${resolved?.source}). Mechanical fix-hat work doesn't need Opus; the studio's \`default_model: ${modelTier}\` keeps cost per fix bounded. Per-FB or per-hat \`model:\` overrides escalate when a particular fix needs more capability.`,
		)
		lines.push("")
	}
	// P2 (2026-05-06): emit one per-FB subagent block with the
	// canonical feedback_id inlined into every tool call. The previous
	// version emitted a single template with `<FB-NN>` placeholders, which
	// led to the agent guessing IDs and hitting `feedback_not_found`
	// errors in retry loops.
	const replyClauseTerminal = terminal
		? `, reply: "<short plain-language explanation of what was done — surfaces in the SPA so the requester sees the resolution>"`
		: ""
	for (const fbId of feedbackIds) {
		// `fbId` is the canonical wire-form `FB-NNN` (cursor emits it
		// from the on-disk filename). Tools take an integer at the
		// schema gate, not the string form. Convert here so prompts
		// embed the integer literal — `feedback_id: 1`, not
		// `feedback_id: "FB-001"`. The display label in the heading
		// keeps the FB-NNN form for human readability.
		const fbNum = Number.parseInt(fbId.replace(/^FB-/i, ""), 10) || 0
		lines.push(`### Subagent for \`${fbId}\``)
		lines.push("")
		lines.push("```")
		lines.push(`Read plugin/studios/<studio>/stages/${stage}/hats/${hat}.md.`)
		lines.push(
			`Then call haiku_feedback_read { intent: "${slug}", stage: "${stage}", feedback_id: ${fbNum} } to load the FB body.`,
		)
		lines.push(`Execute the ${hat} mandate against the FB.`)
		lines.push("When done, call ONE of:")
		lines.push("  Success path:")
		lines.push(
			`    haiku_feedback_advance_hat { intent: "${slug}", stage: "${stage}", feedback_id: ${fbNum}${replyClauseTerminal} }`,
		)
		lines.push("  Block / reject path:")
		lines.push(
			`    haiku_feedback_reject_hat { intent: "${slug}", stage: "${stage}", feedback_id: ${fbNum}, reason: "<why>" }`,
		)
		lines.push("Terminate with the tool's plain-text return.")
		lines.push("```")
		lines.push("")
	}
	if (terminal) {
		lines.push("")
		lines.push(
			`**Terminal hat note**: \`${hat}\` is the LAST hat in this stage's \`fix_hats:\` sequence. The subagent's \`feedback_advance_hat\` call closes the FB (stamps \`closed_at\`) and applies \`targets.invalidates\` to the targeted unit's approvals — the cursor on the next tick will route through the invalidated roles to re-run them.`,
			"",
			`**Reply required**: pass a \`reply\` string with a short plain-language explanation of what was done. Without it, \`haiku_feedback_advance_hat\` returns \`reply_required\` and refuses to close. The reply surfaces in the SPA so the requester sees the resolution, not just that closure happened.`,
		)
	}
	lines.push("")
	lines.push(
		`After all subagent(s) return, call \`haiku_run_next { intent: "${slug}" }\`.`,
	)

	return lines.join("\n")
})
