// orchestrator/prompts/merge_intent.ts — v4 final-stage→intent-main
// merge prompt.
//
// Cursor returns `merge_intent` when:
//   - every stage is merged into intent main, AND
//   - every required intent-level approval is signed (mode-shaped:
//     spec + continuity for autopilot; spec + continuity + studio
//     review-agents + user for discrete/continuous).
//
// The engine performs the actual merge of the final outstanding stage
// branch (or a no-op rebase when nothing is outstanding) under
// `withIntentMainLock`, sets `intent.sealed_at`, and the next tick
// emits `sealed`. The agent's job here is to drive the next tick.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug }) => {
	const lines: string[] = []
	lines.push(`# Merge intent \`${slug}\``)
	lines.push("")
	lines.push(
		`Every stage on intent **${slug}** is merged into intent main and every required intent-level approval is signed. The engine is ready to seal the intent.`,
	)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Call \`haiku_run_next { intent: "${slug}" }\` again — the engine performs any final stage→main rebase under \`withIntentMainLock\`, stamps \`intent.sealed_at\`, and the next tick emits \`sealed\`. Do NOT run \`git merge\` yourself; the engine owns the merge order and the lock.`,
	)
	lines.push("")
	lines.push(
		`On a successful seal, no further action. On \`merge_conflict\`, the response will name the conflicting files and the resolution path.`,
	)
	return lines.join("\n")
})
