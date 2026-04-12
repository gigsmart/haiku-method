// prompts/index.ts — Prompt registry and MCP handler implementations

import type {
	CompleteResult,
	GetPromptResult,
	Prompt,
} from "@modelcontextprotocol/sdk/types.js"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import type { PromptDef } from "./types.js"

export type {
	PromptDef,
	PromptArgDef,
	PromptHandler,
	ArgumentCompleter,
} from "./types.js"

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, PromptDef>()

export function registerPrompt(def: PromptDef): void {
	registry.set(def.name, def)
}

// ── Handler: prompts/list ────────────────────────────────────────────────────

export function listPrompts(): Prompt[] {
	return Array.from(registry.values()).map((def) => ({
		name: def.name,
		title: def.title,
		description: def.description,
		arguments:
			def.arguments.length > 0
				? def.arguments.map((a) => ({
						name: a.name,
						description: a.description,
						required: a.required,
					}))
				: undefined,
	}))
}

// ── Handler: prompts/get ─────────────────────────────────────────────────────

export async function getPrompt(
	name: string,
	args?: Record<string, string>,
): Promise<GetPromptResult> {
	const def = registry.get(name)
	if (!def) {
		throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`)
	}

	// Validate required arguments
	const resolved = args ?? {}
	for (const argDef of def.arguments) {
		if (argDef.required && !(argDef.name in resolved)) {
			throw new McpError(
				ErrorCode.InvalidParams,
				`Missing required argument: ${argDef.name} for prompt ${name}`,
			)
		}
	}

	return def.handler(resolved)
}

// ── Handler: completion/complete ─────────────────────────────────────────────

export async function completeArgument(params: {
	ref: { type: string; name?: string }
	argument: { name: string; value: string }
	context?: { arguments?: Record<string, string> }
}): Promise<CompleteResult> {
	const empty: CompleteResult = { completion: { values: [] } }

	if (params.ref.type !== "ref/prompt") return empty
	const promptName = params.ref.name
	if (!promptName) return empty

	const def = registry.get(promptName)
	if (!def) return empty

	const argDef = def.arguments.find((a) => a.name === params.argument.name)
	if (!argDef?.completer) return empty

	try {
		const values = await argDef.completer(
			params.argument.value,
			params.context?.arguments,
		)
		return {
			completion: {
				values: values.slice(0, 100),
				total: values.length,
				hasMore: values.length > 100,
			},
		}
	} catch {
		return empty
	}
}
