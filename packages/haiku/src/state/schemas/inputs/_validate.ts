// state/schemas/inputs/_validate.ts — Shared AJV input-validator
// helper for state-tool handlers.
//
// Pattern every state-tool case follows:
//
//   case "haiku_<tool>": {
//     const validation = validateToolInput(
//       args,
//       validateHaikuFeedbackInputSchema,
//       "haiku_feedback",
//     )
//     if (validation) return validation
//     // ... tool-specific work, args is now type-checked ...
//   }
//
// `validateToolInput` returns a structured MCP error response when
// args fail the schema, or null when they pass — the caller falls
// through to the real handler. The error shape mirrors every other
// validation rejection in state-tools.ts: {error: "<tool>_input_invalid",
// message, errors} so callers (and tests) match on a stable named
// code instead of parsing prose.
//
// Why a helper instead of inlining the AJV call: every tool case
// needs the same eight lines (compile errors → readable message →
// reply with isError). Centralizing prevents drift in the error
// shape across 44 tool cases.

import type { ValidateFunction } from "ajv"
import { stateAjv } from "../_ajv.js"

/**
 * Widen a TypeBox-branded schema (TObject / TString / etc.) to the
 * plain JSONSchema-shaped record the MCP SDK's `inputSchema` slot
 * expects. TypeBox schemas carry internal brand symbols (Kind /
 * OptionalKind / etc.) that aren't exported from the package, so
 * leaving the type un-widened triggers TS4023 on `stateToolDefs`.
 *
 * Use this at every `inputSchema:` site that consumes a TypeBox
 * builder result:
 *
 *   {
 *     name: "haiku_feedback",
 *     inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_INPUT_SCHEMA),
 *     ...
 *   }
 *
 * Pure type-level — at runtime this is the identity function.
 */
export function jsonSchemaOf(schema: unknown): Record<string, unknown> {
	return schema as Record<string, unknown>
}

/** Result shape returned by `handleStateTool`'s `reply()` helper.
 *  Duplicated here as a structural type so this module doesn't have
 *  to import from state-tools.ts (which imports from here — would
 *  create a cycle). */
type StateToolReply = {
	content: Array<{ type: "text"; text: string }>
	structuredContent?: Record<string, unknown>
	isError?: boolean
}

/**
 * Run an AJV validator against an MCP tool's args. When validation
 * fails, returns a structured error response the handler can return
 * directly. When it passes, returns null and the caller continues.
 *
 * `toolName` is used to construct the stable error code
 * (`<toolName>_input_invalid`) so the agent can match on it
 * deterministically.
 */
export function validateToolInput(
	args: Record<string, unknown>,
	validator: ValidateFunction,
	toolName: string,
): StateToolReply | null {
	if (validator(args)) return null
	const errors = (validator.errors ?? []).map((e) => ({
		path: e.instancePath || "/",
		keyword: e.keyword,
		message: e.message ?? "(no message)",
		params: e.params,
	}))
	const summary = stateAjv.errorsText(validator.errors ?? null, {
		separator: "; ",
	})
	const code = `${toolName}_input_invalid`
	const payload = {
		error: code,
		tool: toolName,
		message: `Invalid arguments for ${toolName}: ${summary}. Check field types and required fields against the tool's inputSchema.`,
		errors,
	}
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
		structuredContent: payload,
		isError: true,
	}
}
