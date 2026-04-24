#!/usr/bin/env node
/**
 * Emit dist/openapi.json from the compiled haiku-api build.
 *
 * Invoked after `tsc` by the package's `build` script. External consumers
 * (GitHub / GitLab integrations cited in external-review-feedback.feature)
 * read the resulting file as the published contract.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, "..")
const distDir = join(pkgRoot, "dist")

// Import the compiled output; tsc must have run before this script.
const { buildOpenApi, serializeOpenApi } = await import(
	join(distDir, "openapi.js")
)

mkdirSync(distDir, { recursive: true })
const doc = buildOpenApi()
const out = join(distDir, "openapi.json")
writeFileSync(out, serializeOpenApi(doc), "utf8")

console.log(
	`[haiku-api] Wrote ${out} — ${Object.keys(doc.paths).length} paths, ${
		Object.keys(doc.components.schemas).length
	} components.schemas`,
)
