// orchestrator/prompts/clarify_required.ts — P4 (2026-05-06).
//
// The cursor emits this when a stage's `clarify/*.md` directory has
// questions and the user hasn't answered them yet (no
// `intent.frontmatter.clarifications.<stage>` record). The prompt
// instructs the agent to ask the user via AskUserQuestion, then stamp
// the answers on intent.md.
//
// Why this gate exists: collaboration belongs in elaborate. The
// agent's job during elaborate is to align with the user, not to
// guess. Each stage's elaborate is its own collaboration moment,
// regardless of prior context — fresh user input every time.

import { definePromptBuilder } from "./define.js"

interface ClarifyQuestion {
	id: string
	prompt: string
	body: string
}

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const questions = ((action.questions as ClarifyQuestion[]) || []).filter(
		(q) => q?.id && q.prompt,
	)

	const lines: string[] = []
	lines.push(`# Clarify before elaborating \`${stage}\``)
	lines.push("")
	lines.push(
		`Before drafting any units for the **${stage}** stage of \`${slug}\`, ask the user the questions below. Each question is sourced from the studio's per-stage \`clarify/\` directory — the user's answers anchor the elaboration that follows.`,
	)
	lines.push("")
	lines.push("## Questions")
	lines.push("")
	for (const q of questions) {
		lines.push(`### ${q.prompt}`)
		lines.push("")
		if (q.body) {
			lines.push(q.body)
			lines.push("")
		}
		lines.push(`_Question id: \`${q.id}\`._`)
		lines.push("")
	}
	lines.push("## What to do")
	lines.push("")
	lines.push(
		"1. Ask the user the questions above using `AskUserQuestion` (one tool call per question; don't conflate them).",
	)
	lines.push(
		"2. Capture the user's answers verbatim. If they push back on a question, re-ask after they finish — every question must have an answer before you proceed.",
	)
	lines.push(
		`3. Stamp the answers on \`intent.md\` via \`haiku_intent_set { intent: "${slug}", field: "clarifications", value: { ${stage}: { answers: [{ id, question, answer }, ...], at: "<ISO timestamp>" }, ...prior_stages_answers } }\`. Read the existing \`clarifications\` value first (via \`haiku_intent_get\`) and merge the new stage entry in — \`haiku_intent_set\` overwrites the entire field.`,
	)
	lines.push(
		`4. Call \`haiku_run_next { intent: "${slug}" }\`. The cursor sees the recorded clarifications and emits \`elaborate\` next.`,
	)
	lines.push("")
	lines.push(
		"**Do NOT skip questions, batch them into one AskUserQuestion call, or invent answers from prior context.** Each stage's clarify is a fresh checkpoint — even if the user already answered something similar at intent creation, the answer is anchored to THIS stage's elaboration.",
	)
	return lines.join("\n")
})
