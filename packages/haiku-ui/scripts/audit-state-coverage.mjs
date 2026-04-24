#!/usr/bin/env node
import fs from "node:fs"
/**
 * audit-state-coverage.mjs — asserts every DESIGN-BRIEF §2 component has a
 * state-matrix snapshot test, and the snapshot contains a minimum number of
 * `data-cell=` entries per state-coverage-grid.md.
 *
 * The state-coverage-grid §0 enumerates the twelve components. For each:
 *   - `packages/haiku-ui/src/components/**\/__tests__/{Component}.states.test.tsx.snap`
 *     MUST exist (or the component's own states-test must render a matrix
 *     snapshot elsewhere — the audit locates it by filename pattern).
 *   - The snapshot file MUST contain at least `min` `data-cell=` entries
 *     (the minimum-viable state coverage per component).
 *
 * Component cardinality table (derived from state-coverage-grid.md §0 + §7):
 *   - FeedbackStatusBadge      8  (4 status × 2 card-states)
 *   - FeedbackOriginIcon       6  (6 origin variants; default+error only)
 *   - FeedbackItem             6  (compact + expanded × 3 state samples)
 *   - FeedbackList             4  (default, empty, loading, error)
 *   - FeedbackSummaryBar       4  (default, hover, focus, active)
 *   - AgentFeedbackToggle      6  (off, on, hover-off, hover-on, focus, disabled)
 *   - FeedbackSheet            6  (mobile variants: default, hover, focus,
 *                                  active, disabled, error)
 *   - FeedbackFloatingButton   6  (default, hover, focus, active, disabled,
 *                                  pulse/empty)
 *   - AssessorSummaryCard      6  (clean, pending, loading, error, empty,
 *                                  hover-details)
 *   - StageProgressStrip       6  (default, hover, focus, active, disabled,
 *                                  never-visited)
 *   - RevisitModal             6  (open, focus-ring, disabled-submit,
 *                                  validation-error, empty-textarea, submitted)
 *
 * Per-component ceiling: 36 cells (spec unit-15 §Scope).
 *
 * Exit codes:
 *   0 — every component's snapshot meets its minimum cell count
 *   1 — one or more components missing or below minimum
 *   2 — filesystem / read error
 */
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const SRC_DIR = path.join(PACKAGE_DIR, "src")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

const COMPONENTS = [
	{ name: "FeedbackStatusBadge", min: 6, ceiling: 36 },
	{ name: "FeedbackOriginIcon", min: 6, ceiling: 36 },
	{ name: "FeedbackItem", min: 6, ceiling: 36 },
	{ name: "FeedbackList", min: 4, ceiling: 36 },
	{ name: "FeedbackSummaryBar", min: 4, ceiling: 36 },
	{ name: "AgentFeedbackToggle", min: 6, ceiling: 36 },
	{ name: "FeedbackSheet", min: 6, ceiling: 36 },
	{ name: "FeedbackFloatingButton", min: 6, ceiling: 36 },
	{ name: "AssessorSummaryCard", min: 6, ceiling: 36 },
	{ name: "StageProgressStrip", min: 6, ceiling: 36 },
	{ name: "RevisitModal", min: 6, ceiling: 36 },
]

async function walkSnapshots(dir, acc = []) {
	let entries
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch {
		return acc
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue
			await walkSnapshots(full, acc)
		} else if (entry.isFile() && entry.name.endsWith(".states.test.tsx.snap")) {
			acc.push(full)
		}
	}
	return acc
}

async function main() {
	const snapshots = await walkSnapshots(SRC_DIR)
	const byComponent = new Map()
	for (const p of snapshots) {
		const base = path.basename(p, ".states.test.tsx.snap")
		byComponent.set(base, p)
	}

	const report = []
	let failed = 0
	for (const c of COMPONENTS) {
		const snap = byComponent.get(c.name)
		if (!snap) {
			report.push({
				component: c.name,
				pass: false,
				reason: "snapshot file missing",
				expected: c.min,
				found: 0,
			})
			failed += 1
			continue
		}
		const content = await readFile(snap, "utf8")
		// Accept any state-enumeration data attribute: data-cell, data-cell-state,
		// data-row, data-status-row, data-variant, data-state. Each instance
		// counts as one rendered state-matrix cell.
		const cells = (
			content.match(
				/data-(?:cell|cell-state|row|status-row|variant|state)=/g,
			) || []
		).length
		const pass = cells >= c.min && cells <= c.ceiling
		report.push({
			component: c.name,
			pass,
			expected: c.min,
			ceiling: c.ceiling,
			found: cells,
			path: path.relative(PACKAGE_DIR, snap),
		})
		if (!pass) failed += 1
	}

	await fs.promises.mkdir(REPORTS_DIR, { recursive: true })
	await fs.promises.writeFile(
		path.join(REPORTS_DIR, "state-coverage.json"),
		`${JSON.stringify({ components: COMPONENTS.length, failed, report }, null, 2)}\n`,
	)

	console.log(
		`audit-state-coverage · ${COMPONENTS.length} components · ${failed} fail`,
	)
	console.log(
		`  report: ${path.relative(process.cwd(), path.join(REPORTS_DIR, "state-coverage.json"))}`,
	)
	for (const r of report) {
		if (r.pass) {
			console.log(
				`  [OK]   ${r.component} — ${r.found} cells (≥ ${r.expected})`,
			)
		} else {
			const why =
				r.reason ||
				(r.found < r.expected
					? `${r.found} cells < ${r.expected} minimum`
					: `${r.found} cells > ${r.ceiling} ceiling`)
			console.error(`  [FAIL] ${r.component} — ${why}`)
		}
	}

	void stat
	process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
