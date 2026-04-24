#!/usr/bin/env node
import fs from "node:fs"
/**
 * audit-live-regions.mjs — asserts the aria-live sequencing contract:
 *
 * 1. The <LiveRegion> with id `#feedback-live-polite` is mounted exactly
 *    once across `packages/haiku-ui/src/` (the canonical site is
 *    `a11y/live-regions.tsx` inside `LiveRegionShell`).
 * 2. The <LiveRegion> with id `#feedback-live-assertive` is mounted exactly
 *    once across the same tree.
 * 3. Every `announce()` / `useAnnounce()` consumer routes through the
 *    `a11y/live-regions.tsx` module — no consumer writes to a rogue
 *    `document.getElementById("feedback-live-polite")` / ...assertive except
 *    from within the live-regions module itself.
 *
 * Exit codes:
 *   0 — both mounts exactly-once AND no rogue `document.getElementById(...)`
 *       writes outside the live-regions module.
 *   1 — mount count != 1 OR rogue write detected
 *   2 — filesystem / read error
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const SRC_DIR = path.join(PACKAGE_DIR, "src")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")
const LIVE_REGIONS_MODULE = path
	.join(SRC_DIR, "a11y", "live-regions.tsx")
	.replaceAll(path.sep, "/")

async function walk(dir, acc = []) {
	let entries
	try {
		entries = await fs.promises.readdir(dir, { withFileTypes: true })
	} catch {
		return acc
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue
			await walk(full, acc)
		} else if (entry.isFile()) {
			if (
				/\.(ts|tsx)$/.test(entry.name) &&
				!entry.name.endsWith(".test.tsx") &&
				!entry.name.endsWith(".test.ts") &&
				!entry.name.endsWith(".spec.tsx") &&
				!entry.name.endsWith(".spec.ts") &&
				!entry.name.endsWith(".d.ts") &&
				!full.includes(`${path.sep}__tests__${path.sep}`) &&
				!full.includes(`${path.sep}__snapshots__${path.sep}`)
			) {
				acc.push(full)
			}
		}
	}
	return acc
}

async function main() {
	const files = await walk(SRC_DIR)

	// Count JSX mounts of the canonical <LiveRegion id="..."> elements and
	// of <LiveRegionShell>. A literal string attribute and the
	// `POLITE_REGION_ID` / `ASSERTIVE_REGION_ID` constants both count.
	let politeMounts = 0
	let assertiveMounts = 0
	let shellMounts = 0
	const rogueHits = []

	for (const f of files) {
		const content = await readFile(f, "utf8")
		const rel = path.relative(PACKAGE_DIR, f).replaceAll(path.sep, "/")
		const isLiveRegionsModule =
			f.replaceAll(path.sep, "/") === LIVE_REGIONS_MODULE

		// Mount-site counting — only the <LiveRegion id=...> element inside
		// the LiveRegionShell component counts. The implementation inside
		// `live-regions.tsx` has one JSX fragment with two <LiveRegion>s;
		// that's the canonical mount. Any OTHER JSX with those IDs counts
		// too.
		const politeRe =
			/<LiveRegion[^/>]*id=\{?\s*(?:POLITE_REGION_ID|["']feedback-live-polite["'])/g
		const assertiveRe =
			/<LiveRegion[^/>]*id=\{?\s*(?:ASSERTIVE_REGION_ID|["']feedback-live-assertive["'])/g
		// Match only JSX-self-closing `<LiveRegionShell />` — comment mentions
		// like `<LiveRegionShell>` or `<LiveRegionShell>:` (no slash) do not
		// count.
		const shellRe = /<LiveRegionShell\s*\/>/g
		politeMounts += (content.match(politeRe) || []).length
		assertiveMounts += (content.match(assertiveRe) || []).length
		shellMounts += (content.match(shellRe) || []).length

		// Rogue getElementById — every `document.getElementById(...)` on
		// one of the canonical region IDs OUTSIDE the live-regions module
		// is a bypass of the announce() helper and fails the audit.
		if (!isLiveRegionsModule) {
			const rogueRe =
				/document\.getElementById\(\s*["'](feedback-live-polite|feedback-live-assertive)["']\s*\)/g
			for (const m of content.matchAll(rogueRe)) {
				rogueHits.push({ file: rel, id: m[1] })
			}
		}
	}

	const failures = []
	if (politeMounts !== 1) {
		failures.push(
			`#feedback-live-polite mount count = ${politeMounts} (expected exactly 1)`,
		)
	}
	if (assertiveMounts !== 1) {
		failures.push(
			`#feedback-live-assertive mount count = ${assertiveMounts} (expected exactly 1)`,
		)
	}
	if (shellMounts !== 1) {
		failures.push(
			`<LiveRegionShell /> mount count = ${shellMounts} (expected exactly 1 — App.tsx hosts it)`,
		)
	}

	await fs.promises.mkdir(REPORTS_DIR, { recursive: true })
	await fs.promises.writeFile(
		path.join(REPORTS_DIR, "live-regions.json"),
		`${JSON.stringify(
			{ politeMounts, assertiveMounts, shellMounts, rogueHits, failures },
			null,
			2,
		)}\n`,
	)

	console.log(
		`audit-live-regions · polite=${politeMounts} assertive=${assertiveMounts} shell=${shellMounts} rogue=${rogueHits.length}`,
	)
	console.log(
		`  report: ${path.relative(process.cwd(), path.join(REPORTS_DIR, "live-regions.json"))}`,
	)
	if (failures.length > 0) {
		for (const f of failures) console.error(`  FAIL ${f}`)
	}
	for (const r of rogueHits) {
		console.error(
			`  FAIL rogue document.getElementById("${r.id}") in ${r.file} — route through a11y/live-regions.tsx announce()/useAnnounce() instead.`,
		)
	}
	if (failures.length + rogueHits.length > 0) process.exit(1)
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
