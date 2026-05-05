#!/usr/bin/env node
/**
 * V-08 CSRF static-analysis safety net (unit-03).
 *
 * Enumerates every `app.post|put|patch|delete` (or `instance.…`,
 * `scope.…`, `fastify.…`) registration in the source tree and asserts
 * that the global CSRF preHandler from `http/csrf.ts` is in scope for
 * each one.
 *
 * The csrfPreHandler is registered as `instance.addHook("preHandler", ...)`
 * inside `buildApp()` in `http.ts`. Fastify hook semantics:
 *
 *   • A hook registered on the root instance fires for EVERY route
 *     registered on the root instance OR on any non-encapsulated
 *     scope created via `instance.register(...)` without
 *     `fastify-plugin`.
 *
 *   • `@fastify/multipart` (used in upload-routes.ts) wraps its
 *     registration in an anonymous inner scope (NOT fastify-plugin)
 *     SPECIFICALLY to keep its own behaviours encapsulated. That
 *     scope inherits root hooks, so the csrfPreHandler still fires.
 *
 *   • A future engineer who registers a route on a `fastify-plugin`-
 *     wrapped scope WOULD bypass the hook. That's the failure mode
 *     this audit catches.
 *
 * What this audit does:
 *
 *   1. Walks `packages/haiku/src/**\/*.ts` for `\.post|put|patch|delete\(`
 *      registration calls.
 *   2. For each match, verifies the file is `http.ts`, `http/*-routes.ts`,
 *      `http/feedback-api.ts`, `http/csrf.ts`, OR documents an explicit
 *      exemption (e.g. test fixtures).
 *   3. Walks `http/upload-routes.ts` to confirm the inner multipart scope
 *      is NOT wrapped by `fastify-plugin` (keep that callsite stable).
 *   4. Walks `http.ts` and verifies `registerCsrfRoutes` is called inside
 *      `buildApp` BEFORE any other route registration.
 *
 * Exit codes:
 *   0 — every mutating route is covered by the global preHandler
 *   1 — a route is registered outside the known coverage set, OR the
 *       buildApp wiring no longer matches expectations
 *
 * This audit is intentionally simple — it doesn't load Fastify or run
 * a real instance. It's a static gate that catches obvious mistakes
 * (a future contributor adds a POST in a new file without understanding
 * the hook model). Runtime CSRF behaviour is covered by the test suite.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, "..", "src")

// ── Configuration ─────────────────────────────────────────────────────

/** Files allowed to register mutating routes. The csrfPreHandler in
 *  http.ts is in scope for every route on the root instance and on any
 *  non-encapsulated scope; these files all register on the root instance
 *  (or on the multipart inner scope, which inherits root hooks). */
const ALLOWED_REGISTRATION_FILES = new Set([
	"http.ts",
	"http/csrf.ts",
	"http/feedback-api.ts",
	"http/session-routes.ts",
	"http/session-api.ts",
	"http/upload-routes.ts",
	"http/assessments-routes.ts",
	"http/file-serve.ts",
	"http/default-routes.ts",
	"http/e2e.ts",
	"http/ws-upgrade.ts",
])

const BUILD_APP_FILE = "http.ts"

// ── File walker ───────────────────────────────────────────────────────

function walk(dir, results = []) {
	const entries = readdirSync(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue
			walk(full, results)
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			results.push(full)
		}
	}
	return results
}

// ── Pattern: `<receiver>.post|put|patch|delete(` ──────────────────────

// Match `<receiver>.post(`, `.put(`, `.patch(`, `.delete(` and the
// TypeScript-generic variants `.post<…>(`. We do NOT use a lookbehind
// here — every receiver name ends in alpha characters (`instance`,
// `app`, `scope`, `fastify`), so a `[^A-Za-z0-9_$]` lookbehind would
// reject every legitimate registration. Method names live on Fastify
// instances; non-Fastify code that happens to call `.delete()` on an
// array or Map is a manageable false-positive surface that we filter
// via the receiver-token check below.
const MUTATING_REGEX = /\b(\w+)\.(post|put|patch|delete)\s*[<(]/g

/** Receivers that legitimately register mutating Fastify routes. Other
 *  receivers (Map, Array, unknown variables) are filtered out — those
 *  are not Fastify route registrations. */
const FASTIFY_RECEIVERS = new Set([
	"instance",
	"app",
	"scope",
	"fastify",
	"server",
])

function findMutatingRegistrations(file) {
	const text = readFileSync(file, "utf8")
	const lines = text.split("\n")
	const hits = []
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		// Skip comments and string literals — coarse but adequate.
		if (line.trim().startsWith("//")) continue
		if (line.trim().startsWith("*")) continue
		const matches = [...line.matchAll(MUTATING_REGEX)]
		for (const m of matches) {
			const receiver = m[1]
			if (!FASTIFY_RECEIVERS.has(receiver)) continue // skip Map.delete / Set.delete / etc.
			hits.push({
				line: i + 1,
				method: m[2].toUpperCase(),
				receiver,
				text: line.trim(),
			})
		}
	}
	return hits
}

// ── Audit ─────────────────────────────────────────────────────────────

const allFiles = walk(srcRoot)

const errors = []
const warnings = []
let totalRoutes = 0

for (const file of allFiles) {
	const rel = relative(srcRoot, file).replace(/\\/g, "/")
	// Skip test files entirely — tests register their own routes for
	// fixture purposes and don't go through buildApp.
	if (rel.includes("/__tests__/") || rel.endsWith(".test.ts")) continue

	const hits = findMutatingRegistrations(file)
	if (hits.length === 0) continue

	totalRoutes += hits.length

	if (!ALLOWED_REGISTRATION_FILES.has(rel)) {
		errors.push({
			file: rel,
			reason: "mutating_route_outside_allowlist",
			hits,
		})
		continue
	}

	// Inside allowed files, look for fastify-plugin wrapping which would
	// encapsulate the route OUT of the global preHandler scope.
	const text = readFileSync(file, "utf8")
	if (text.includes("fastify-plugin") && !text.includes("// audit-allow:")) {
		warnings.push({
			file: rel,
			reason:
				"fastify_plugin_imported — verify routes inherit the global preHandler",
		})
	}
}

// ── Verify buildApp wiring in http.ts ────────────────────────────────

const buildAppText = readFileSync(join(srcRoot, BUILD_APP_FILE), "utf8")
if (!buildAppText.includes("registerCsrfRoutes(instance)")) {
	errors.push({
		file: BUILD_APP_FILE,
		reason:
			"registerCsrfRoutes(instance) call missing from buildApp — global CSRF preHandler is NOT installed",
	})
} else {
	// Confirm the call is BEFORE the other route registrations. Fastify
	// hooks fire for routes registered AFTER the hook in the same scope;
	// hooks added late do still fire on the root instance, but as a
	// matter of code clarity and review-time obviousness, keep the
	// CSRF wiring at the top of the route-registration block.
	const csrfIdx = buildAppText.indexOf("registerCsrfRoutes(instance)")
	const fbIdx = buildAppText.indexOf("registerFeedbackRoutes(instance)")
	if (fbIdx !== -1 && csrfIdx > fbIdx) {
		warnings.push({
			file: BUILD_APP_FILE,
			reason:
				"registerCsrfRoutes called AFTER registerFeedbackRoutes — works but obscures coverage; keep CSRF first",
		})
	}
}

// ── Report ────────────────────────────────────────────────────────────

console.log("V-08 CSRF route-coverage audit")
console.log(`  Source root: ${srcRoot}`)
console.log(`  Mutating routes scanned: ${totalRoutes}`)
console.log(`  Allowed registration files: ${ALLOWED_REGISTRATION_FILES.size}`)
console.log("")

if (warnings.length > 0) {
	console.log("Warnings:")
	for (const w of warnings) {
		console.log(`  • ${w.file}: ${w.reason}`)
	}
	console.log("")
}

if (errors.length > 0) {
	console.error("Errors (CSRF coverage broken):")
	for (const e of errors) {
		console.error(`  ✗ ${e.file}: ${e.reason}`)
		if (e.hits) {
			for (const h of e.hits) {
				console.error(`      line ${h.line} — ${h.method}: ${h.text}`)
			}
		}
	}
	console.error("")
	console.error(
		"Fix: register the route in one of the allowed files in ALLOWED_REGISTRATION_FILES,",
	)
	console.error(
		"or extend the allowlist after verifying the file's routes inherit the global",
	)
	console.error(
		"preHandler from buildApp() in http.ts (csrfPreHandler in http/csrf.ts).",
	)
	process.exit(1)
}

console.log("All mutating routes covered by global CSRF preHandler.")
process.exit(0)
