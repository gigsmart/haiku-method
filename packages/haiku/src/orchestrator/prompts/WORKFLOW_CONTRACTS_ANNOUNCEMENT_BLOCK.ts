// orchestrator/prompts/WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK.ts —
// Static prompt body. Injected immediately ABOVE any subagent-spawning
// instruction (discovery fan-out, hat dispatch, review fan-out) so the
// parent agent posts a brief plain-language status to the human BEFORE
// kicking off N background agents in one message.
//
// Why this exists: a designer using H·AI·K·U watched their conversation
// silently spawn four discovery agents with no preamble — saw "running
// 4 tasks in background" appear in the UI without context for what or
// why, and got freaked out. The framework was correct; the UX was
// hostile. This block is the fix at the prompt layer: every fan-out
// dispatch is preceded by a one- or two-sentence announcement.
//
// Rules:
// - Plain language. No tool names, no studio jargon, no emoji.
// - Specific. "Starting discovery on `design` — 4 research agents
//   investigating tokens, layout, accessibility, and performance"
//   beats "starting research."
// - No time estimates. Rough heads-up only ("expect a tick or two
//   before the next status").
// - One message. Announcement + spawn in the SAME response so the
//   user doesn't see the spawns appear seconds before the explanation.

export const WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK = [
	"### Announce Before You Dispatch (REQUIRED)",
	"",
	"Before spawning the subagents below, post a brief plain-language status to the user **in the same response** as the spawns. The user is watching their UI; silent spawns trigger panic — particularly when several agents fire at once. One or two sentences is enough.",
	"",
	"**Format:**",
	"",
	'- WHAT is starting (e.g. "Starting discovery for the `design` stage.")',
	"- HOW MANY agents are running and WHAT each is investigating (pull names from the artifact / unit / lens list below).",
	'- One sentence on what comes next ("I\'ll resume once they all return."). No time estimates.',
	"",
	"**Do NOT:**",
	"",
	"- Use tool names (`Task`, `haiku_run_next`, MCP, subagent) in the user-facing announcement. Those are how, not what.",
	'- Pad with reassurances ("this should be quick", "don\'t worry"). The specific list is the reassurance.',
	"- Split the announcement and the spawn across two responses. Single message; user sees the *why* and the *spawns* together.",
	'- Editorialize about the framework ("H·AI·K·U is now…"). The user cares what\'s happening to *their* work.',
	"",
	'**Good:** "Starting discovery for `design`. Four research agents are kicking off in parallel — tokens, layout, accessibility, and performance. I\'ll resume once they all return."',
	"",
	'**Bad:** "Spawning 4 Task subagents to populate discovery artifacts. Standby." *(jargon, no specifics, no closing handoff)*',
].join("\n")
