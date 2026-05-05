// Hook registry — taken from packages/haiku/src/hooks/*.ts.

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
		name: "prompt-guard",
		desc: "Rejects bad prompts before they reach the agent. Validates structure, scope, no-op detection.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/prompt-guard.ts",
	},
	{
		group: "guardrails",
		name: "workflow-guard",
		desc: "Blocks `Edit` / `Write` outside the active unit's worktree. The agent literally cannot edit files belonging to a different unit/stage.",
		fires: ["cylinder", "phase[execute]"],
		file: "packages/haiku/src/hooks/workflow-guard.ts",
	},
	{
		group: "guardrails",
		name: "guard-workflow-fields",
		desc: "Blocks direct Read/Write/Edit/MultiEdit on workflow-managed paths: `units/*.md`, `feedback/*.md`, `intent.md`, `stages/*/state.json`, and `.haiku/settings.yml`. The redirect message names the corresponding MCP tool (`haiku_unit_*`, `haiku_feedback_*`, `haiku_intent_set` / `haiku_intent_get`, `haiku_settings_set` / `haiku_settings_get`). Only the orchestrator may write these directly.",
		fires: ["unit", "phase[elaborate]"],
		file: "packages/haiku/src/hooks/guard-workflow-fields.ts",
	},
	{
		group: "guardrails",
		name: "redirect-plan-mode",
		desc: "When the agent enters Claude Code's plan mode, this hook redirects the planning result back through the haiku workflow engine rather than letting the agent free-plan.",
		fires: ["phase[elaborate]"],
		file: "packages/haiku/src/hooks/redirect-plan-mode.ts",
	},
	{
		group: "guardrails",
		name: "ensure-deps",
		desc: "Verifies that every unit's `depends_on` are complete before letting the agent enter or progress within a unit.",
		fires: ["wave", "phase[execute]"],
		file: "packages/haiku/src/hooks/ensure-deps.ts (validate-unit-type companion)",
	},
	{
		group: "context injection",
		name: "inject-context",
		desc: "Prepends the relevant workflow engine state to every agent prompt so the agent doesn't have to ask. Stage, phase, current unit, current hat, what's done, what's next.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/inject-context.ts",
	},
	{
		group: "context injection",
		name: "inject-state-file",
		desc: "Companion to inject-context: writes a transient `.haiku/_inject.md` snapshot of state.json so the agent can read structured context.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/inject-state-file.ts",
	},
	{
		group: "context injection",
		name: "track-outputs",
		desc: "After every agent edit/write, records the file path under the active unit's `outputs:` frontmatter. This is how downstream stages know what's available.",
		fires: ["cylinder", "hat", "artifacts.out"],
		file: "packages/haiku/src/hooks/track-outputs.ts",
	},
	{
		group: "context injection",
		name: "subagent-context",
		desc: "When a hat spawns a Claude Code subagent, this hook scopes the subagent's context to the parent unit's worktree only — preventing context bleed. For subagents spawned via `<subagent>` blocks from `haiku_run_next`, the hook provides ADDITIONAL context (workflow rules, bootstrap, cwd scoping) but the core behavioral context (hat instructions, unit spec, stage scope, output requirements) is already embedded in the `<subagent>` prompt block constructed by the MCP. Also injects STAGE.md body content alongside the hat instructions for stage-level behavioral context.",
		fires: ["hat", "phase[execute]"],
		file: "packages/haiku/src/hooks/subagent-context.ts",
	},
	{
		group: "context injection",
		name: "subagent-hook",
		desc: "Runtime hook running inside spawned subagents. Plays the same role as inject-context for the subagent's tool calls.",
		fires: ["hat"],
		file: "packages/haiku/src/hooks/subagent-hook.ts",
	},
	{
		group: "context injection",
		name: "context-monitor",
		desc: "Watches the agent's token budget. Triggers a `/clear`-friendly state save if approaching context limits — relying on the workflow engine to resume from disk.",
		fires: ["call-chip"],
		file: "packages/haiku/src/hooks/context-monitor.ts",
	},
	{
		group: "quality",
		name: "quality-gate",
		desc: "Wrapper around `runQualityGates()` — runs configured tests/lint/typecheck and reports back to the orchestrator. Hard backpressure.",
		fires: ["review-fail", "phase[review]"],
		file: "packages/haiku/src/hooks/quality-gate.ts",
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
