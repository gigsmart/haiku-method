#!/usr/bin/env node
import fs from "node:fs"
/**
 * audit-bundle-size.mjs — compares the gzipped size of the inlined haiku-ui
 * SPA against `packages/haiku-ui/budget.json` (absolute cap) AND against
 * `packages/haiku-ui/budget-baseline.json` (5% regression guard).
 *
 * The "inlined SPA" is the `packages/haiku-ui/dist/index.html` with all
 * referenced /assets/*.js + /assets/*.css inlined in place — same shape the
 * MCP embeds and ships.
 *
 * Exit codes:
 *   0 — size is ≤ absolute cap AND ≤ baseline × 1.05
 *   1 — absolute cap exceeded OR 5% regression detected
 *   2 — dist missing / read error
 *
 * Flags:
 *   --update-baseline   Overwrite `budget-baseline.json` with the current
 *                       measured size. Requires human-review in the PR diff;
 *                       this script is the only place that writes the file.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const DIST_DIR = path.join(PACKAGE_DIR, "dist")
const BUDGET_FILE = path.join(PACKAGE_DIR, "budget.json")
const BASELINE_FILE = path.join(PACKAGE_DIR, "budget-baseline.json")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

const args = process.argv.slice(2)
const updateBaseline = args.includes("--update-baseline")

async function loadInlinedHtml() {
	const distHtml = path.join(DIST_DIR, "index.html")
	let html = await readFile(distHtml, "utf8")
	const scriptRe = /<script\b[^>]*\bsrc="\/assets\/([^"]+)"[^>]*><\/script>/g
	const linkRe = /<link\b[^>]*\bhref="\/assets\/([^"]+\.css)"[^>]*>/g
	html = html.replace(scriptRe, (m, filename) => {
		const p = path.join(DIST_DIR, "assets", filename)
		if (!fs.existsSync(p)) return m
		return `<script type="module">${fs.readFileSync(p, "utf8")}</script>`
	})
	html = html.replace(linkRe, (m, filename) => {
		const p = path.join(DIST_DIR, "assets", filename)
		if (!fs.existsSync(p)) return m
		return `<style>${fs.readFileSync(p, "utf8")}</style>`
	})
	return html
}

async function main() {
	let html
	try {
		html = await loadInlinedHtml()
	} catch (err) {
		console.error(
			`audit-bundle-size · cannot load ${path.join(DIST_DIR, "index.html")}. Run \`npm run build\` first.`,
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	const gzipBytes = gzipSync(html).length

	let budget
	try {
		budget = JSON.parse(await readFile(BUDGET_FILE, "utf8"))
	} catch (err) {
		console.error(
			`audit-bundle-size · cannot read ${BUDGET_FILE}: ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(2)
	}
	const cap = budget.bundleGzipMaxBytes
	if (typeof cap !== "number") {
		console.error(
			`audit-bundle-size · budget.json missing numeric bundleGzipMaxBytes`,
		)
		process.exit(2)
	}

	let baseline = null
	try {
		baseline = JSON.parse(await readFile(BASELINE_FILE, "utf8"))
	} catch {
		baseline = null
	}

	if (updateBaseline) {
		const payload = {
			createdAt: new Date().toISOString(),
			gzipBytes,
			notes: [
				"Set by `audit-bundle-size.mjs --update-baseline`. Updating this",
				"file requires an explicit PR — the audit script only writes it",
				"when this flag is passed.",
			],
		}
		await writeFile(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`)
		console.log(
			`audit-bundle-size · BASELINE UPDATED · ${gzipBytes} bytes written to ${path.relative(process.cwd(), BASELINE_FILE)}`,
		)
		process.exit(0)
	}

	if (!baseline) {
		// Seed the baseline on first run so subsequent runs can enforce 5%.
		const payload = {
			createdAt: new Date().toISOString(),
			gzipBytes,
			notes: [
				"Seed baseline generated on first run of audit-bundle-size.mjs.",
				"Future runs fail if current gzipBytes > baseline * 1.05.",
				"Update only via `audit-bundle-size.mjs --update-baseline` (explicit PR).",
			],
		}
		await writeFile(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`)
		console.log(
			`audit-bundle-size · BASELINE CREATED · ${gzipBytes} bytes written to ${path.relative(process.cwd(), BASELINE_FILE)}`,
		)
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "bundle-size.json")
	const regressionCeiling = baseline
		? baseline.gzipBytes * 1.05
		: gzipBytes * 1.05
	const capExceeded = gzipBytes > cap
	const regressed = baseline !== null && gzipBytes > regressionCeiling
	await writeFile(
		reportPath,
		`${JSON.stringify(
			{
				gzipBytes,
				absoluteCap: cap,
				baseline: baseline?.gzipBytes ?? null,
				regressionCeiling,
				capExceeded,
				regressed,
			},
			null,
			2,
		)}\n`,
	)

	const deltaPct = baseline
		? (((gzipBytes - baseline.gzipBytes) / baseline.gzipBytes) * 100).toFixed(2)
		: "0.00"
	console.log(
		`audit-bundle-size · ${gzipBytes} bytes gzipped · cap=${cap} · baseline=${baseline?.gzipBytes ?? "—"} · Δ=${deltaPct}%`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (capExceeded) {
		console.error(
			`  FAIL absolute cap exceeded — ${gzipBytes} > ${cap} bytes (budget.json#bundleGzipMaxBytes)`,
		)
		process.exit(1)
	}
	if (regressed) {
		console.error(
			`  FAIL 5% regression — ${gzipBytes} > ${Math.round(regressionCeiling)} (baseline ${baseline.gzipBytes} × 1.05). Run \`audit-bundle-size.mjs --update-baseline\` in an explicit PR if intended.`,
		)
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
