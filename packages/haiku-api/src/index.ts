/**
 * haiku-api — Zod + OpenAPI contract shared by the H·AI·K·U MCP backend and
 * the agent-collab UI.
 *
 * Zod is the source of truth. TypeScript types are inferred via `z.infer<>`.
 * `dist/openapi.json` is emitted at build time for external consumers.
 */

export type {
	BuildOpenApiOptions,
	JsonObject,
	OpenApiDocument,
} from "./openapi.js"
// OpenAPI emitter
export {
	buildOpenApi,
	serializeOpenApi,
} from "./openapi.js"
export type { HttpMethod, RouteSpec } from "./routes.js"
// Route table + path builders
export { paths, routeBodyLimit, routes, routesWithSchemas } from "./routes.js"
// Schema barrel exports
export * from "./schemas/auth.js"
export * from "./schemas/common.js"
export * from "./schemas/direction.js"
export * from "./schemas/feedback.js"
export * from "./schemas/files.js"
export * from "./schemas/question.js"
export * from "./schemas/review.js"
export * from "./schemas/revisit.js"
export * from "./schemas/session.js"
export * from "./schemas/websocket.js"

// Package metadata
export { PACKAGE_VERSION } from "./version.js"
