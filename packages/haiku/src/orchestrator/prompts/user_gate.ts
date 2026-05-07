// orchestrator/prompts/user_gate.ts — v4 user-gate prompt.
//
// Cursor returns `user_gate { stage, gate_kind: "spec" | "approval", units }`
// when the human's `reviews.user` (spec gate, pre-execute) or
// `approvals.user` (output gate, post-execute) is the next missing
// signature on one or more units. The agent opens the review server
// session and blocks on the user's decision via haiku_await_gate.
//
// Mode-shaping happens upstream — autopilot intents skip the user
// role entirely and never see this action.
//
// Discrete vs continuous: in discrete mode the user_gate's await_gate
// flow opens a real GitHub MR for the stage branch and waits for the
// merge into intent main as the approval signal. In continuous mode
// the local review server is the approval surface. The discrete-mode
// branch lives inside haiku_await_gate's existing logic.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const gateKind = (action.gate_kind as "spec" | "approval") || "approval"
	const units = (action.units as string[]) || []

	const lines: string[] = []
	lines.push(`# User gate: \`${gateKind}\` review on stage \`${stage}\``)
	lines.push("")
	if (gateKind === "spec") {
		lines.push(
			`The cursor reached the user's spec review. ${units.length} unit spec(s) need approval before execution begins:`,
		)
	} else {
		lines.push(
			`The cursor reached the user's output approval. ${units.length} unit output(s) need approval before the stage merges:`,
		)
	}
	lines.push("")
	for (const u of units) lines.push(`  - \`${u}\``)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`1. Call \`haiku_review_open { intent: "${slug}", stage: "${stage}", gate_kind: "${gateKind}" }\` to open the review server session.`,
	)
	lines.push(
		`2. Post the returned review URL to the user in chat — one or two sentences, no walls of text.`,
	)
	lines.push(
		`3. Call \`haiku_await_gate { intent: "${slug}" }\` and block on the user's decision.`,
	)
	lines.push(
		`4. The await tool will return one of: \`intent_approved\` / \`advance_phase\` / \`advance_stage\` / \`changes_requested\` / \`external_review_requested\`. Each carries a follow-up instruction — execute it.`,
	)
	lines.push("")
	lines.push(
		`On approve, await_gate stamps \`${gateKind === "spec" ? "reviews" : "approvals"}.user\` on each listed unit and the cursor on the next tick routes forward (next role / merge_stage / next stage).`,
	)
	lines.push("")
	lines.push(
		`On request_changes, await_gate writes the user's annotations as feedback files; the cursor on the next tick walks Track B and routes the fix loop. Do NOT manually file the feedback yourself — the review server's submission carries the structured annotations.`,
	)

	return lines.join("\n")
})
