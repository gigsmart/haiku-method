// prompts/types.ts — Internal prompt registry types

import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js"

export type PromptHandler = (
	args: Record<string, string>,
) => Promise<GetPromptResult>

export type ArgumentCompleter = (
	value: string,
	context?: Record<string, string>,
) => Promise<string[]>

export interface PromptArgDef {
	name: string
	description: string
	required: boolean
	completer?: ArgumentCompleter
}

export interface PromptDef {
	name: string
	title: string
	description: string
	arguments: PromptArgDef[]
	handler: PromptHandler
}
