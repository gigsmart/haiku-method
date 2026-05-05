// MCP tool definition types.
//
// Every tool exported from this package describes itself as a `ToolDef`
// (or its async-result variant). The registry in `./index.ts` collects
// the per-tool default exports into `allTools[]` for MCP registration
// and `toolByName` for dispatch from `handleTool()`.

/** JSONSchema-shaped input descriptor. Wide enough to accept the
 *  output of `jsonSchemaOf(typeboxSchema)` (which is the canonical
 *  source per `.claude/rules/schema-definitions.md`) while still
 *  matching object-shaped raw declarations for the legacy tools
 *  that haven't migrated. */
export type ToolInputSchema = Record<string, unknown>

/** Standard MCP tool response: text content blocks plus optional error flag. */
export interface ToolResult {
	content: Array<{ type: "text"; text: string }>
	isError?: boolean
	/** Optional structured payload some MCP clients surface alongside text. */
	structuredContent?: Record<string, unknown>
}

/** Handler signature: receives the raw arg bag (post path-traversal
 *  validation) plus the optional MCP abort signal so long-running
 *  tools (e.g. `haiku_await_gate`) can unwind promptly when the
 *  client cancels. Returns a ToolResult, sync or async. */
export type ToolHandler = (
	args: Record<string, unknown>,
	signal?: AbortSignal,
) => ToolResult | Promise<ToolResult>

export interface ToolDef {
	/** Tool name as exposed to the MCP client (e.g. "haiku_run_next"). */
	readonly name: string
	/** Description shown to the agent in tool listings. */
	readonly description: string
	/** JSON-Schema-shaped input schema (kept literal for MCP transport). */
	readonly inputSchema: ToolInputSchema
	/** Handler — invoked from the central dispatch with the raw args bag. */
	readonly handle: ToolHandler
}
