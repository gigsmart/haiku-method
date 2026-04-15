// harness.ts — Multi-harness capability definitions and runtime context
//
// Each AI coding harness (Claude Code, Cursor, Windsurf, Gemini CLI,
// OpenCode, Kiro) has different MCP feature support. This module:
//
//   1. Defines a HarnessCapabilities interface describing what each supports
//   2. Maintains a registry of known harnesses
//   3. Provides a runtime singleton (set once at MCP startup via --harness arg)
//   4. Exports query helpers the orchestrator and server use to adapt behavior
//
// The MCP server reads `--harness <name>` from argv and calls setHarness()
// once during startup. All other code queries getHarness() / getCapabilities().

// ── Capability interface ────────────────────────────────────────────────────

export interface SubagentCapabilities {
	/** Whether the harness can spawn subtask agents at all. */
	supported: boolean
	/**
	 * Tool name(s) the harness uses for spawning.
	 * Claude Code: ["Agent", "Task"]
	 * Cursor: ["Agent"]
	 * Kiro: ["/spawn"]
	 */
	toolNames: string[]
	/** Can the caller specify which model the subagent uses? */
	modelParam: boolean
	/** Can multiple subagents be spawned in a single response? */
	parallelSpawn: boolean
	/** Supports isolation (e.g., worktrees, sandboxed VMs). */
	isolation: boolean
}

export interface HarnessCapabilities {
	/** Display name of the harness. */
	displayName: string
	/** Whether the harness supports native skill/slash-command invocation. */
	nativeSkills: boolean
	/** Whether MCP prompts surface as user-invocable slash commands. */
	promptsAsSlashCommands: boolean
	/** Whether the harness has a hook system (PreToolUse, Stop, SessionStart). */
	hooks: boolean
	/** Whether the harness supports MCP elicitation (server requests user input). */
	elicitation: boolean
	/** Whether the harness has a native AskUserQuestion-like tool. */
	nativeAskUser: boolean
	/** Whether the harness has a PlanMode concept we can intercept. */
	planMode: boolean
	/** Maximum number of MCP tools the harness can handle (null = unlimited). */
	maxTools: number | null
	/** Whether MCP prompts are supported at all. */
	mcpPrompts: boolean
	/** Whether MCP resources are supported. */
	mcpResources: boolean
	/** Primary model provider family (e.g., "anthropic", "google", "multi"). */
	modelProvider: string
	/** Subagent/subtask spawning capabilities. */
	subagents: SubagentCapabilities
	/**
	 * Model tier names this harness understands.
	 * Claude Code: ["haiku", "sonnet", "opus"]
	 * Gemini CLI: ["flash", "pro"]
	 * Multi-provider: ["fast", "balanced", "powerful"]
	 */
	modelTiers: string[]
	/**
	 * Map from H·AI·K·U canonical tiers to this harness's tier names.
	 * e.g., { haiku: "flash", sonnet: "pro", opus: "pro" } for Gemini
	 */
	modelTierMap: Record<string, string>
}

// ── Harness registry ────────────────────────────────────────────────────────

const HARNESS_REGISTRY: Record<string, HarnessCapabilities> = {
	"claude-code": {
		displayName: "Claude Code",
		nativeSkills: true,
		promptsAsSlashCommands: true,
		hooks: true,
		elicitation: true,
		nativeAskUser: true,
		planMode: true,
		maxTools: null,
		mcpPrompts: true,
		mcpResources: true,
		modelProvider: "anthropic",
		subagents: {
			supported: true,
			toolNames: ["Agent", "Task"],
			modelParam: true,
			parallelSpawn: true,
			isolation: true,
		},
		modelTiers: ["haiku", "sonnet", "opus"],
		modelTierMap: { haiku: "haiku", sonnet: "sonnet", opus: "opus" },
	},

	cursor: {
		displayName: "Cursor",
		nativeSkills: false,
		promptsAsSlashCommands: false,
		hooks: false,
		elicitation: true,
		nativeAskUser: false,
		planMode: false,
		maxTools: 40,
		mcpPrompts: true,
		mcpResources: true,
		modelProvider: "multi",
		subagents: {
			supported: true,
			toolNames: ["Agent"],
			modelParam: false,
			parallelSpawn: true,
			isolation: true,
		},
		modelTiers: ["fast", "balanced", "powerful"],
		modelTierMap: { haiku: "fast", sonnet: "balanced", opus: "powerful" },
	},

	windsurf: {
		displayName: "Windsurf",
		nativeSkills: false,
		promptsAsSlashCommands: false,
		hooks: false,
		elicitation: false,
		nativeAskUser: false,
		planMode: false,
		maxTools: 100,
		mcpPrompts: true,
		mcpResources: true,
		modelProvider: "multi",
		subagents: {
			supported: false,
			toolNames: [],
			modelParam: false,
			parallelSpawn: false,
			isolation: false,
		},
		modelTiers: ["fast", "balanced", "powerful"],
		modelTierMap: { haiku: "fast", sonnet: "balanced", opus: "powerful" },
	},

	"gemini-cli": {
		displayName: "Gemini CLI",
		nativeSkills: false,
		promptsAsSlashCommands: true,
		hooks: false,
		elicitation: false,
		nativeAskUser: false,
		planMode: false,
		maxTools: null,
		mcpPrompts: true,
		mcpResources: true,
		modelProvider: "google",
		subagents: {
			supported: true,
			toolNames: ["@subagent"],
			modelParam: false,
			parallelSpawn: true,
			isolation: false,
		},
		modelTiers: ["flash", "pro"],
		modelTierMap: { haiku: "flash", sonnet: "pro", opus: "pro" },
	},

	opencode: {
		displayName: "OpenCode",
		nativeSkills: false,
		promptsAsSlashCommands: false,
		hooks: false,
		elicitation: false,
		nativeAskUser: false,
		planMode: false,
		maxTools: null,
		mcpPrompts: false,
		mcpResources: false,
		modelProvider: "multi",
		subagents: {
			supported: true,
			toolNames: ["subagent"],
			modelParam: true,
			parallelSpawn: false,
			isolation: false,
		},
		modelTiers: ["fast", "balanced", "powerful"],
		modelTierMap: { haiku: "fast", sonnet: "balanced", opus: "powerful" },
	},

	kiro: {
		displayName: "Kiro",
		nativeSkills: false,
		promptsAsSlashCommands: true,
		hooks: true,
		elicitation: true,
		nativeAskUser: false,
		planMode: false,
		maxTools: null,
		mcpPrompts: true,
		mcpResources: true,
		modelProvider: "anthropic",
		subagents: {
			supported: true,
			toolNames: ["/spawn"],
			modelParam: false,
			parallelSpawn: true,
			isolation: true,
		},
		modelTiers: ["haiku", "sonnet", "opus"],
		modelTierMap: { haiku: "haiku", sonnet: "sonnet", opus: "opus" },
	},
}

// ── Runtime state ───────────────────────────────────────────────────────────

let activeHarness = "claude-code"

/**
 * Set the active harness. Called once at MCP startup.
 * Falls back to "claude-code" for unknown values.
 */
export function setHarness(name: string): void {
	const key = name.toLowerCase().replace(/[\s_]/g, "-")
	if (key in HARNESS_REGISTRY) {
		activeHarness = key
	} else {
		console.error(
			`[haiku] Unknown harness "${name}" — falling back to claude-code. Known: ${Object.keys(HARNESS_REGISTRY).join(", ")}`,
		)
		activeHarness = "claude-code"
	}
	console.error(
		`[haiku] Harness: ${HARNESS_REGISTRY[activeHarness].displayName}`,
	)
}

/** Get the active harness key. */
export function getHarness(): string {
	return activeHarness
}

/** Get the capabilities of the active harness. */
export function getCapabilities(): HarnessCapabilities {
	return HARNESS_REGISTRY[activeHarness]
}

/** Check if the active harness is Claude Code (the default/primary). */
export function isClaudeCode(): boolean {
	return activeHarness === "claude-code"
}

/** Get all registered harness names (for CLI help / validation). */
export function listHarnesses(): string[] {
	return Object.keys(HARNESS_REGISTRY)
}

// ── Instruction adaptation helpers ──────────────────────────────────────────

/**
 * Return the correct phrasing for "spawn a subagent" in the active harness.
 * Falls back to "execute sequentially" when subagents aren't supported.
 */
export function subagentInstruction(opts: {
	purpose: string
	agentType?: string
	model?: string
	parallel?: boolean
	count?: number
}): string {
	const caps = getCapabilities()

	if (!caps.subagents.supported) {
		// Harness can't spawn subagents — instruct sequential execution
		if (opts.count && opts.count > 1) {
			return `Execute ${opts.count} tasks sequentially for: ${opts.purpose}. Complete each task fully before starting the next.`
		}
		return `Execute the following task directly: ${opts.purpose}.`
	}

	const toolName = caps.subagents.toolNames[0] || "subagent"
	const parts: string[] = []

	if (opts.count && opts.count > 1 && caps.subagents.parallelSpawn) {
		parts.push(
			`Spawn ${opts.count} \`${toolName}\` calls in a single response (parallel) for: ${opts.purpose}.`,
		)
	} else if (opts.count && opts.count > 1) {
		parts.push(
			`Spawn ${opts.count} \`${toolName}\` calls for: ${opts.purpose}.`,
		)
	} else {
		parts.push(`Spawn a \`${toolName}\` for: ${opts.purpose}.`)
	}

	if (
		opts.agentType &&
		caps.subagents.toolNames.includes("Agent") &&
		isClaudeCode()
	) {
		parts.push(`Agent type: \`${opts.agentType}\``)
	}

	if (opts.model && caps.subagents.modelParam) {
		const mappedModel = caps.modelTierMap[opts.model] || opts.model
		parts.push(`Spawn with \`model: "${mappedModel}"\`.`)
	}

	return parts.join("\n")
}

/**
 * Return the correct phrasing for referencing a skill/prompt.
 * Claude Code: /haiku:start  (slash command)
 * Gemini CLI: /haiku:start   (MCP prompts are slash commands)
 * Others: "use the haiku:start prompt" or "call the haiku_start tool"
 */
export function skillReference(skillName: string): string {
	const caps = getCapabilities()
	if (caps.promptsAsSlashCommands) {
		return `/haiku:${skillName}`
	}
	if (caps.mcpPrompts) {
		return `the \`haiku:${skillName}\` prompt`
	}
	// Fallback: describe it generically
	return `the haiku ${skillName} workflow`
}

/**
 * Return the correct phrasing for user input collection.
 * Claude Code: AskUserQuestion with options[]
 * Others: describe the question in conversation text
 */
export function askUserInstruction(): string {
	const caps = getCapabilities()
	if (caps.nativeAskUser) {
		return (
			"Use `AskUserQuestion` with an `options[]` array for every decision that has known alternatives — " +
			"NEVER output option lists as plain text"
		)
	}
	if (caps.elicitation) {
		return (
			"When you have questions with known alternatives, present them as a numbered list and ask the user to pick. " +
			"Use MCP elicitation when available for structured input."
		)
	}
	return "When you have questions with known alternatives, present them as a clear numbered list and ask the user to pick."
}

/**
 * Map a H·AI·K·U model tier to the harness-appropriate tier name.
 */
export function mapModelTier(tier: string): string {
	const caps = getCapabilities()
	return caps.modelTierMap[tier] || tier
}
