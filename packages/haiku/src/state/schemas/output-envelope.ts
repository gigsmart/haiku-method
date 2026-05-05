// state/schemas/output-envelope.ts — TypeBox-defined standard MCP
// outputSchema fragments reused across the state-tool defs.
//
// Per MCP spec 2025-06-18 §Tool Result, when a tool declares an
// outputSchema, the server MUST emit `structuredContent` matching
// it. Tools either compose these fragments or define their own
// shape; the `reply()` helper inside handleStateTool wraps payloads
// as both stringified text content (back-compat) and
// structuredContent.

import { type Static, Type } from "@sinclair/typebox"

/** Standard error envelope. Returned (with isError: true) when a
 *  handler rejects the call for a structured reason. The `error`
 *  field is a stable named code (e.g. `frontmatter_validation_failed`,
 *  `feedback_not_found`, `lifecycle_violation`); `message` is a
 *  human-readable remediation hint. */
export const ERROR_OUTPUT_SCHEMA = Type.Object(
	{
		error: Type.String({ description: "Stable named error code." }),
		message: Type.String({
			description: "Human-readable remediation guidance.",
		}),
	},
	{ additionalProperties: true },
)
export type ErrorOutput = Static<typeof ERROR_OUTPUT_SCHEMA>

/** Standard ok envelope for confirmation-style writes. Tools that
 *  mutate state and return only a confirmation message use this. */
export const OK_OUTPUT_SCHEMA = Type.Object(
	{
		ok: Type.Literal(true),
		message: Type.String(),
	},
	{ additionalProperties: true },
)
export type OkOutput = Static<typeof OK_OUTPUT_SCHEMA>
