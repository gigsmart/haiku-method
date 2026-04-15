// harness-instructions.ts — Instruction rewriting for multi-harness support
//
// The orchestrator builds markdown instructions containing Claude-specific
// language (Agent/Task subagents, /haiku:skill slash commands, AskUserQuestion).
// This module post-processes those instructions to adapt them for the active
// harness's capabilities.
//
// Design principle: the orchestrator builds instructions naturally (Claude Code
// is still the primary), and this module rewrites them at the boundary. This
// avoids cluttering the orchestrator with per-harness conditionals.

import {
	type HarnessCapabilities,
	getCapabilities,
	isClaudeCode,
	skillReference,
} from "./harness.js"

// ── Subagent rewriting ──────────────────────────────────────────────────────

/**
 * Rewrite subagent spawn instructions for the active harness.
 *
 * Claude Code uses `Agent` and `Task` tool names. Other harnesses use
 * different mechanisms or don't support subagents at all.
 */
function rewriteSubagentReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	let result = text

	if (!caps.subagents.supported) {
		// No subagent support — rewrite to sequential execution
		result = result.replace(
			/Spawn one `Task` subagent per artifact\b[^.]*\./g,
			"Execute each artifact task sequentially — complete one before starting the next.",
		)
		result = result.replace(
			/Spawn a subagent for the "([^"]+)" hat\./g,
			'Execute the "$1" hat task directly.',
		)
		result = result.replace(
			/spawn one Agent subagent per unit \*\*in a single message\*\*/g,
			"execute each unit sequentially",
		)
		result = result.replace(
			/Spawn one subagent per review agent \(in parallel\)/g,
			"Execute each review agent check sequentially",
		)
		result = result.replace(
			/Spawn ALL of them in a single response \(parallel\)\./g,
			"Execute them one at a time.",
		)
		result = result.replace(
			/\*\*IMMEDIATELY\*\* spawn one Agent subagent per unit \*\*in a single message\*\*[^.]*\./g,
			"**IMMEDIATELY** start executing units one at a time. No questions, no confirmation, no menu.",
		)
		result = result.replace(/Agent type: `[^`]+`\n?/g, "")
		result = result.replace(
			/Each subagent inherits worktree scoping via the `subagent-context` hook\./g,
			"",
		)
		result = result.replace(/\bsubagent\b/g, "task")
		result = result.replace(/\bSubagent\b/g, "Task")
		return result
	}

	const primaryTool = caps.subagents.toolNames[0] || "Agent"

	// Replace Claude-specific tool names with harness-appropriate ones
	if (primaryTool !== "Agent") {
		result = result.replace(/`Agent`/g, `\`${primaryTool}\``)
		result = result.replace(
			/one Agent subagent/g,
			`one \`${primaryTool}\` call`,
		)
		result = result.replace(/Agent tool calls/g, `\`${primaryTool}\` calls`)
		result = result.replace(
			/Agent tool's `model:`/g,
			`\`${primaryTool}\` tool's model`,
		)
	}
	if (primaryTool !== "Task") {
		result = result.replace(/`Task` subagent/g, `\`${primaryTool}\``)
	}

	// Remove Claude-specific subagent-context hook reference for non-Claude harnesses
	if (!caps.hooks) {
		result = result.replace(
			/Each subagent inherits worktree scoping via the `subagent-context` hook\. /g,
			"",
		)
	}

	// Remove parallel spawn instructions if not supported
	if (!caps.subagents.parallelSpawn) {
		result = result.replace(/\*\*in a single message\*\* \(all [^)]+\)/g, "")
		result = result.replace(
			/Spawn ALL of them in a single response \(parallel\)\./g,
			"Execute them one at a time.",
		)
	}

	return result
}

// ── Skill / slash-command rewriting ─────────────────────────────────────────

/**
 * Rewrite /haiku:skillname references for the active harness.
 */
function rewriteSkillReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	if (caps.promptsAsSlashCommands) {
		// /haiku:skill syntax works natively — no changes needed
		return text
	}

	// Replace /haiku:skillname with the harness-appropriate phrasing
	return text.replace(/\/haiku:(\w[\w-]*)/g, (_match, name) =>
		skillReference(name),
	)
}

// ── AskUserQuestion rewriting ───────────────────────────────────────────────

/**
 * Rewrite AskUserQuestion references for harnesses that don't have it.
 */
function rewriteAskUserReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	if (caps.nativeAskUser) return text

	// Replace AskUserQuestion with generic phrasing
	let result = text
	result = result.replace(
		/`AskUserQuestion`\s*with\s*(an\s*)?`options\[\]`\s*array/g,
		"a numbered list of options",
	)
	result = result.replace(
		/\| Scope decisions, tradeoffs, A\/B\/C choices \| `AskUserQuestion` with options\[\] \|[^\n]*/g,
		"| Scope decisions, tradeoffs, A/B/C choices | Present a numbered list of options |",
	)
	result = result.replace(
		/Use `AskUserQuestion`\b/g,
		"Present options to the user",
	)
	result = result.replace(
		/`AskUserQuestion`/g,
		"a structured question with options",
	)
	result = result.replace(
		/\*\*Good:\*\* `AskUserQuestion\(\{[^}]+\}\)`/g,
		'**Good:** Presenting clear numbered options like "1. OAuth 2.0 + PKCE, 2. Magic link, 3. SSO via SAML, 4. Other"',
	)

	return result
}

// ── Model tier rewriting ────────────────────────────────────────────────────

/**
 * Map model tier references in instructions.
 */
function rewriteModelReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	if (caps.modelProvider === "anthropic") return text

	let result = text
	// Replace Anthropic-specific model tier names
	for (const [canonical, mapped] of Object.entries(caps.modelTierMap)) {
		if (canonical !== mapped) {
			// Only replace in model-context strings (e.g., model: "sonnet")
			result = result.replace(
				new RegExp(`model: "${canonical}"`, "g"),
				`model: "${mapped}"`,
			)
		}
	}

	return result
}

// ── Permission mode rewriting ───────────────────────────────────────────────

/**
 * Remove permission_mode references for harnesses that don't support it.
 */
function rewritePermissionReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	if (caps.hooks) return text // Claude Code / Kiro handle permissions via hooks

	return text.replace(/\bpermission_mode\b[^\n]*/g, "")
}

// ── Hook references ─────────────────────────────────────────────────────────

/**
 * Remove hook-specific references for harnesses without hook support.
 */
function rewriteHookReferences(
	text: string,
	caps: HarnessCapabilities,
): string {
	if (caps.hooks) return text

	let result = text
	result = result.replace(/via the `subagent-context` hook/g, "automatically")
	result = result.replace(/`subagent-context` hook/g, "context injection")
	return result
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Post-process orchestrator instructions for the active harness.
 *
 * Call this on the final markdown string returned by buildRunInstructions()
 * before sending it back to the agent. For Claude Code, this is a near-noop.
 */
export function adaptInstructions(instructions: string): string {
	const caps = getCapabilities()

	// Fast path: Claude Code needs no rewriting
	if (isClaudeCode()) return instructions

	let result = instructions
	result = rewriteSubagentReferences(result, caps)
	result = rewriteSkillReferences(result, caps)
	result = rewriteAskUserReferences(result, caps)
	result = rewriteModelReferences(result, caps)
	result = rewritePermissionReferences(result, caps)
	result = rewriteHookReferences(result, caps)

	return result
}
