// orchestrator/prompts/WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK.ts — Static
// prompt body. Injected verbatim into review_fix and
// intent_completion_fix dispatch prompts.

export const WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK = [
	"### Workflow Contracts (REQUIRED — reminder during fix loop)",
	"",
	"> ## ⟁ NO FIX WITHOUT INVESTIGATION.",
	"> Read the artifact, verify the finding, state the gap *before* editing. Bolts spent on guesses don't come back.",
	"",
	"- The fix loop runs the stage's `fix_hats:` sequence against every eligible pending finding in parallel. Each finding's hat chain is serial (e.g. fixer → feedback-assessor) and runs via a **relay** mechanism: chains run in parallel across findings. The feedback file IS the scope — do NOT synthesize a new unit spec.",
	"- Every hat in the sequence reads the feedback body + the flagged artifact path and acts within its mandate. Non-final hats call `haiku_feedback_advance_hat` when done and relay the next hat's `<subagent>` block back to the parent — the parent spawns it, not the subagent itself.",
	"- The sequence's final hat (typically `feedback-assessor`) independently verifies the fix. On pass: calls `haiku_feedback_advance_hat` — the workflow engine auto-closes the finding (last hat in chain). On fail: leaves the feedback open (no advance call). The workflow engine increments the bolt counter and may dispatch another loop, up to the bolt cap. Exceeding the cap escalates to the human.",
	"- A fix-loop hat is NOT a unit hat. Do NOT call `haiku_unit_advance_hat` or `haiku_unit_reject_hat` — those are for unit execution. Each fix hat calls `haiku_feedback_advance_hat` when done (or `haiku_feedback_reject` for invalid findings). The parent calls `haiku_run_next` once — after ALL finding chains are complete.",
	"- Parallel chains may edit the same artifact concurrently. Each final hat validates closure independently — a chain whose fix was clobbered by another chain will leave its finding open, and the next bolt will retry. Budget is spent, not lost.",
	"",
	"#### Per-hat action rules live in the subagent prompts",
	"",
	"This contract covers dispatch coordination, the bolt cap, and the per-finding scoping rule. The action-rules each fix-mode hat follows during its own work — investigate root cause before editing, verify the finding against the artifact before fixing (and `haiku_feedback_reject` if the finding is stale or invalid), no hedging in summaries, no out-of-scope edits — live as numbered steps in the per-hat subagent prompts emitted below. Every fix-mode hat reads its own rules; this block exists so the dispatching agent understands the contract its subagents will follow.",
	"",
	"#### Red flags (STOP and re-read this contract if you catch yourself thinking)",
	"",
	"- \"I'll just rewrite the file — that's faster than tracing the finding\" — read the finding body and the flagged artifact first; fix the specific gap. Bolts spent rewriting unrelated code don't close the open feedback and risk introducing new findings.",
	'- "The finding is wrong, I\'ll close it via advance" — invalid findings get `haiku_feedback_reject` with a concrete reason. Advancing on a wrong finding silently accepts it and pollutes the closure record.',
	"- \"I see another issue while I'm here, I'll fix it too\" — log it as a new feedback item; do NOT bundle the fix into this loop. Each finding is its own scope; bundled fixes serialize what should run in parallel and conflate closure signals.",
	'- "The artifact already looks fixed, I\'ll just close" — re-read both the finding body and the artifact and verify the gap is actually addressed, not just plausibly addressed. The terminal hat catches this; getting there earlier saves a bolt.',
	'- "Later is the load-bearing word" — "I\'ll add the test later", "I\'ll come back for the edge case", "the bolt cap will catch it" — the next bolt costs the same as this one. Do the work in this hat.',
].join("\n")
