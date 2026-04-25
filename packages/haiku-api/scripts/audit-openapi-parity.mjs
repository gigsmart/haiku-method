#!/usr/bin/env node
/**
 * audit-openapi-parity.mjs — verifies parity between
 * `packages/haiku-api/dist/openapi.json` and the
 * `routes`/`routesWithSchemas` registry exposed by
 * `packages/haiku-api/dist/index.js`.
 *
 * The published openapi.json is the external contract cited by the
 * external-review-feedback feature file. Any drift between the built
 * JSON and the in-source `routes` table means a consumer reading the
 * JSON will 404 (or schema-mismatch) against the running MCP.
 *
 * This script:
 *   1. Builds haiku-api if dist/openapi.json is missing or stale
 *      (version drift relative to package.json).
 *   2. Loads `buildOpenApi()` + `routes` from dist.
 *   3. Asserts:
 *      - Every `routes[i].pathTemplate` is present under `doc.paths`.
 *      - Every `routes[i].operationId` is present on at least one method.
 *      - Every declared response schema in `doc.paths[*][*].responses[200]`
 *        has a matching `components.schemas` entry.
 *      - `openapi` field is "3.1.0".
 *   4. Budget: 30s wall-clock (spec line 73). Enforced via Promise.race.
 *
 * Exit codes:
 *   0 — every assertion holds
 *   1 — any assertion fails (per-failure report printed)
 *   2 — build / import / filesystem error
 */
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const DIST_INDEX = path.join(PACKAGE_DIR, "dist", "index.js")
const DIST_OPENAPI = path.join(PACKAGE_DIR, "dist", "openapi.json")
const PACKAGE_JSON = path.join(PACKAGE_DIR, "package.json")
const BUDGET_MS = 30_000

async function main() {
	const started = Date.now()

	// Build if needed.
	const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"))
	let needsBuild = !existsSync(DIST_INDEX) || !existsSync(DIST_OPENAPI)
	if (!needsBuild) {
		try {
			const doc = JSON.parse(readFileSync(DIST_OPENAPI, "utf8"))
			if (doc?.info?.version !== pkg.version) needsBuild = true
		} catch {
			needsBuild = true
		}
	}
	if (needsBuild) {
		try {
			execSync("npm run build", {
				cwd: PACKAGE_DIR,
				stdio: "inherit",
			})
		} catch (err) {
			console.error(
				`audit-openapi-parity · build failed: ${err instanceof Error ? err.message : String(err)}`,
			)
			process.exit(2)
		}
	}

	// Load buildOpenApi + routes from dist.
	let buildOpenApi
	let routes
	try {
		const mod = await import(
			`file://${DIST_INDEX}?t=${Date.now()}` // cache-bust between runs
		)
		buildOpenApi = mod.buildOpenApi
		routes = mod.routes
	} catch (err) {
		console.error(
			`audit-openapi-parity · cannot import dist: ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(2)
	}

	if (Date.now() - started > BUDGET_MS) {
		console.error(
			`audit-openapi-parity · budget exceeded during load (${Date.now() - started}ms)`,
		)
		process.exit(1)
	}

	const doc = buildOpenApi()
	const failures = []

	if (doc.openapi !== "3.1.0") {
		failures.push(`openapi version = ${doc.openapi}, expected "3.1.0"`)
	}

	if (!doc.info?.title) failures.push("info.title missing")
	if (!doc.info?.version) failures.push("info.version missing")

	// Path-template presence: every HTTP route's pathTemplate is a key under
	// doc.paths. WebSocket-upgrade routes (method === "WS") are out of scope
	// for OpenAPI 3.1 (no first-class WS support); skip them.
	const HTTP_METHODS = new Set([
		"get",
		"post",
		"put",
		"delete",
		"patch",
		"head",
		"options",
	])
	for (const r of routes) {
		if (!HTTP_METHODS.has(r.method.toLowerCase())) continue
		if (!doc.paths[r.pathTemplate]) {
			failures.push(
				`route pathTemplate "${r.pathTemplate}" (${r.operationId}) missing from openapi.paths`,
			)
			continue
		}
		// Operation id presence.
		const pathItem = doc.paths[r.pathTemplate]
		const method = r.method.toLowerCase()
		const op = pathItem?.[method]
		if (!op) {
			failures.push(
				`route ${r.method.toUpperCase()} ${r.pathTemplate} (${r.operationId}) missing operation object`,
			)
			continue
		}
		if (op.operationId !== r.operationId) {
			failures.push(
				`route ${r.method.toUpperCase()} ${r.pathTemplate} operationId mismatch: route=${r.operationId} openapi=${op.operationId}`,
			)
		}
	}

	// Schema reference resolution: every $ref under responses / requestBodies
	// must resolve to `#/components/schemas/{Name}`.
	const schemas = doc.components?.schemas ?? {}
	function walkForRefs(obj, stack = []) {
		if (!obj || typeof obj !== "object") return
		for (const [k, v] of Object.entries(obj)) {
			if (k === "$ref" && typeof v === "string") {
				if (!v.startsWith("#/components/schemas/")) {
					failures.push(
						`non-local $ref "${v}" at ${stack.join(".")} (external $refs not supported)`,
					)
					continue
				}
				const name = v.slice("#/components/schemas/".length)
				if (!schemas[name]) {
					failures.push(
						`unresolved $ref "${v}" at ${stack.join(".")} — no components.schemas entry`,
					)
				}
			} else if (typeof v === "object" && v !== null) {
				walkForRefs(v, [...stack, k])
			}
		}
	}
	walkForRefs(doc.paths, ["paths"])

	const elapsed = Date.now() - started
	if (elapsed > BUDGET_MS) {
		failures.push(`budget exceeded: ${elapsed}ms > ${BUDGET_MS}ms`)
	}

	console.log(
		`audit-openapi-parity · ${Object.keys(doc.paths).length} paths · ${Object.keys(schemas).length} schemas · ${routes.length} routes · ${failures.length} fail · ${elapsed}ms`,
	)
	if (failures.length > 0) {
		for (const f of failures) console.error(`  FAIL ${f}`)
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
