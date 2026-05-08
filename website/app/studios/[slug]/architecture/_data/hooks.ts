// Hook registry — derived from `plugin/hooks/hooks.json` and the
// implementations in `packages/haiku/src/hooks/*.ts`. v4 keeps a small,
// honest set: every load-bearing rule has an MCP-tool equivalent so the
// system works the same on harnesses without hooks.

export interface HookDef {
	group: string
	name: string
	desc: string
	fires: string[]
	file: string
}

export const HOOKS: HookDef[] = [
	{
		group: "guardrails",
		name: "redirect-plan-mode",
		desc: "PreToolUse on `EnterPlanMode` (Claude Code only). Denies the call and redirects the user to `/haiku:start` so the workflow engine — not the harness's plan mode — owns intent creation.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/redirect-plan-mode.ts",
	},
	{
		group: "guardrails",
		name: "guard-workflow-fields",
		desc: "PreToolUse on `Read` / `Write` / `Edit` / `MultiEdit`. Denies generic file access on workflow-managed paths: `units/*.md`, `feedback/*.md`, `intent.md`, and (defensively) `stages/*/state.json`. The denial message names the right MCP tool — `haiku_unit_*`, `haiku_feedback_*`, `haiku_intent_*`, `haiku_run_next`. Honest agents get redirected; bash bypass is soft-warned via audit telemetry.",
		fires: ["unit", "call-chip"],
		file: "packages/haiku/src/hooks/guard-workflow-fields.ts",
	},
	{
		group: "guardrails",
		name: "workflow-guard",
		desc: "PreToolUse on `Write` / `Edit`. Advisory warning when the agent edits a file outside `.haiku/` while an intent is active — nudges the agent to confirm the edit is in the right hat scope. Non-blocking.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/workflow-guard.ts",
	},
	{
		group: "guardrails",
		name: "prompt-guard",
		desc: "PreToolUse on `Write` / `Edit` against `.haiku/` paths. Scans for prompt-injection patterns (`ignore previous`, `<system>`, etc.) in spec writes and surfaces an advisory warning. Non-blocking.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/prompt-guard.ts",
	},
	{
		group: "context injection",
		name: "inject-state-file",
		desc: "PreToolUse on `mcp__*__haiku_*` tool calls. Injects `state_file` (session metadata persistence path) and `_session_context` (CLAUDE_SESSION_ID, harness, model, etc.) into every haiku MCP call so the orchestrator sees env it can't read directly from a separate process.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/inject-state-file.ts",
	},
	{
		group: "context injection",
		name: "context-monitor",
		desc: "PostToolUse on every tool call. Watches the agent's token budget; injects warnings at 35% and 25% remaining. Debounced once per threshold per session so the agent gets the heads-up to wrap up cleanly before /clear becomes mandatory.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/context-monitor.ts",
	},
	{
		group: "drift",
		name: "stamp-agent-write",
		desc: "PostToolUse on `Write` / `Edit` / `MultiEdit`. When the agent writes a file inside an intent's tracked drift surface via the generic write tools, stamps an `entry_type: \"agent_write\"` action-log entry so the next drift sweep attributes the change to the agent rather than emitting a `drift_detected` event for the agent's own edit.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/stamp-agent-write.ts",
	},
	{
		group: "ergonomics",
		name: "edit-auto-read-hint",
		desc: "PostToolUse on `Edit` / `MultiEdit`. When Claude Code refuses an edit with \"file has not been read yet,\" surfaces a clear \"Read first, then retry\" hint so the agent recovers in one turn instead of looping with the same args.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/edit-auto-read-hint.ts",
	},
]

export const HOOK_BY_NAME: Record<string, HookDef> = Object.fromEntries(
	HOOKS.map((h) => [h.name, h]),
)

/** Translate a hook's `fires` token to a CSS selector inside the diagram. */
export function hookFiresSelector(token: string): string | null {
	if (token === "call-chip") return ".call-chip"
	if (token === "call-chip-hat") return ".call-mini-hat"
	if (token === "cylinder") return ".cylinder"
	if (token === "hat") return ".hat"
	if (token === "hat-arrow-wrap") return ".hat-arrow-wrap"
	if (token === "wave") return ".wave-divider"
	if (token === "unit") return ".unit"
	if (token === "review-fail") return ".review-fail"
	if (token === "artifacts.out") return ".artifacts.out .artifact"
	if (token.startsWith("phase[")) return `[data-phase="${token.slice(6, -1)}"]`
	return null
}
