// stamp-agent-write — PostToolUse hook for Write/Edit/MultiEdit.
//
// When the agent writes a file inside an intent's tracked drift surface
// via the generic Write/Edit tools (rather than `haiku_human_write`),
// stamp an `entry_type: "agent_write"` action-log entry so the next
// drift-gate tick attributes the change to the agent and updates the
// baseline silently — no `manual_change_assessment` finding for the
// agent to classify against itself.
//
// The bleed scenario this closes: agent edits a file that was originally
// added by a human (e.g. a designer-dropped PNG that the agent later
// re-encodes). Without this stamp, the gate's attribution falls through
// to `baselineEntry.author_class` ("human-implicit") and the agent's
// edit gets mis-tagged as another human write.
//
// Harness coverage: this hook is the auto-stamp for Claude Code. On
// non-CC harnesses (no PostToolUse), the agent calls the
// `haiku_record_agent_write` MCP tool explicitly to stamp the same
// action-log entry. Both routes share `stampAgentWriteForPath` in
// orchestrator/workflow/stamp-agent-write.ts.
//
// PostToolUse hook contract: never block the tool call — wrap the body
// in a try/catch so a hook failure never breaks the agent's write.

import { resolve } from "node:path"
import { stampAgentWriteForPath } from "../orchestrator/workflow/stamp-agent-write.js"
import { defineHook } from "./define.js"

async function stampAgentWriteHook(
	input: Record<string, unknown>,
): Promise<void> {
	const toolName = (input.tool_name as string) || ""
	if (toolName !== "Write" && toolName !== "Edit" && toolName !== "MultiEdit") {
		return
	}

	// Skip on tool failure: PostToolUse fires regardless of success, but a
	// failed write left no on-disk change to stamp.
	const toolResponse =
		(input.tool_response as Record<string, unknown> | undefined) ?? {}
	if (toolResponse.error || toolResponse.is_error === true) return

	const toolInput = (input.tool_input as Record<string, unknown>) || {}
	const filePath = (toolInput.file_path as string) || ""
	if (!filePath) return

	await stampAgentWriteForPath(resolve(process.cwd(), filePath))
}

export default defineHook({
	name: "stamp-agent-write",
	description:
		"PostToolUse Write/Edit/MultiEdit: append an `agent_write` action-log entry when the agent writes inside an intent's tracked drift surface, so the next drift-gate tick attributes the change to the agent and updates the baseline silently.",
	async handle(input, _ctx) {
		try {
			await stampAgentWriteHook(input)
		} catch {
			// Advisory hook — never block the tool call on hook failure.
		}
	},
})
