/**
 * OpenAPI 3.1 emitter.
 *
 * Walks the `routes` table, converts each request/response Zod schema into a
 * JSON-Schema fragment via `zod-to-json-schema`, and emits an OpenAPI
 * document. External consumers cited in external-review-feedback.feature
 * (GitHub / GitLab integrations) read `dist/openapi.json` produced by
 * `scripts/emit-openapi.mjs`.
 *
 * We intentionally target OpenAPI 3.1.0 (JSON Schema draft 2020-12 aligned)
 * and pass `target: "openApi3"` to `zod-to-json-schema` so discriminated
 * unions and refinements produce `oneOf`/`anyOf` shapes the spec accepts.
 */

import type { ZodTypeAny } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { type RouteSpec, routes } from "./routes.js"
import { PACKAGE_VERSION } from "./version.js"

// ─── Types ───────────────────────────────────────────────────────────────

export type JsonObject = { [key: string]: unknown }

export interface OpenApiDocument {
	openapi: "3.1.0"
	info: {
		title: string
		version: string
		description?: string
	}
	paths: Record<string, JsonObject>
	components: {
		schemas: Record<string, JsonObject>
	}
	tags?: Array<{ name: string; description?: string }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Convert an RFC-6570 path template to OpenAPI path syntax (already matches,
 *  but this is the seam if we ever need to rewrite). */
function toOpenApiPath(template: string): string {
	return template
}

/** Extract `{param}` tokens from a path template into an OpenAPI `parameters`
 *  array. Every parameter is typed as a required string in the path. */
function pathParameters(template: string): JsonObject[] {
	const params: JsonObject[] = []
	const re = /\{([^}]+)\}/g
	let match: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
	while ((match = re.exec(template)) !== null) {
		params.push({
			name: match[1],
			in: "path",
			required: true,
			schema: { type: "string" },
		})
	}
	return params
}

/** Convert a Zod schema into a JSON-Schema fragment usable as an OpenAPI
 *  request/response body schema. We target OpenAPI 3. */
function convertZod(schema: ZodTypeAny, name: string): JsonObject {
	const converted = zodToJsonSchema(schema, {
		target: "openApi3",
		name,
	}) as JsonObject
	// zodToJsonSchema with `name` returns `{ $ref: "#/definitions/<name>", definitions: {<name>: {...}} }`.
	// We hoist the definition out.
	const definitions = converted.definitions as
		| Record<string, JsonObject>
		| undefined
	const hoisted = definitions?.[name]
	if (hoisted) {
		return hoisted
	}
	return converted
}

function lowerCaseFirst(s: string): string {
	return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1)
}

/** Derive a components.schemas key from an operationId + role.
 *  e.g. `createFeedback` + request -> `CreateFeedbackRequest`. */
function schemaKey(operationId: string, role: "Request" | "Response"): string {
	const pascal =
		operationId.length > 0
			? operationId[0].toUpperCase() + operationId.slice(1)
			: operationId
	return `${pascal}${role}`
}

// Re-export so tests can call the low-level helper if needed
export { convertZod, lowerCaseFirst, schemaKey }

// ─── Emitter ─────────────────────────────────────────────────────────────

export interface BuildOpenApiOptions {
	title?: string
	description?: string
	version?: string
}

/** Build the OpenAPI document from the static `routes` table. */
export function buildOpenApi(
	options: BuildOpenApiOptions = {},
): OpenApiDocument {
	const title = options.title ?? "H·AI·K·U Review API"
	const version = options.version ?? PACKAGE_VERSION
	const description =
		options.description ??
		"HTTP + WebSocket contract shared by the H·AI·K·U MCP backend and the agent-collab UI. Zod is the source of truth; this document is emitted at build time from `packages/haiku-api`."

	const paths: Record<string, JsonObject> = {}
	const schemas: Record<string, JsonObject> = {}
	const tagSet = new Set<string>()

	for (const route of routes) {
		// WebSocket upgrade paths aren't OpenAPI-addressable, but we still surface
		// them as path items so the document is a complete enumeration of the
		// HTTP surface. OpenAPI 3.1 has no websocket method, so we render them
		// with an `x-websocket: true` extension on a stub GET operation.
		const { method, pathTemplate, operationId } = route

		const oaPath = toOpenApiPath(pathTemplate)
		if (!paths[oaPath]) {
			paths[oaPath] = { parameters: pathParameters(pathTemplate) }
		}

		const op: JsonObject = {
			operationId,
			summary: route.summary,
		}
		if (route.tag) {
			op.tags = [route.tag]
			tagSet.add(route.tag)
		}

		if (route.request) {
			const key = schemaKey(operationId, "Request")
			schemas[key] = convertZod(route.request, key)
			op.requestBody = {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: `#/components/schemas/${key}` },
					},
				},
			}
		}

		if (route.response) {
			const key = schemaKey(operationId, "Response")
			schemas[key] = convertZod(route.response, key)
			op.responses = {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: { $ref: `#/components/schemas/${key}` },
						},
					},
				},
			}
		} else {
			op.responses = {
				"200": { description: "Success (no body schema — raw stream or HTML)" },
			}
		}

		if (method === "WS") {
			op["x-websocket"] = true
			;(paths[oaPath] as JsonObject).get = op
		} else {
			const methodKey = method.toLowerCase()
			;(paths[oaPath] as JsonObject)[methodKey] = op
		}
	}

	const doc: OpenApiDocument = {
		openapi: "3.1.0",
		info: {
			title,
			version,
			description,
		},
		paths,
		components: {
			schemas,
		},
	}

	if (tagSet.size > 0) {
		doc.tags = [...tagSet].sort().map((name) => ({ name }))
	}

	return doc
}

/** Helper used by `scripts/emit-openapi.mjs` — canonical JSON serialization
 *  with stable key ordering at the top level. */
export function serializeOpenApi(doc: OpenApiDocument): string {
	return `${JSON.stringify(doc, null, 2)}\n`
}

export type { RouteSpec }
// Route list export for downstream consumers
export { routes }
