#!/usr/bin/env node
// scripts/check-no-god-files.mjs
//
// CI guardrail: fail the build if any tracked source file becomes a
// "god file" — meaning it crosses the size and/or export-count
// threshold without an explicit allowlist entry.
//
// Why this exists: state-tools.ts grew to 11,400 lines and 101
// exports before anyone called it out. By that point every refactor
// to it cost more than the work it enabled. This check is the cheap
// early-warning so the next 5,000-line file gets noticed at 2,500.
//
// Usage:
//   node scripts/check-no-god-files.mjs
//
// Exits 0 when all is well; exits 1 (with a precise punch list) when
// any file violates the budget without an allowlist entry.
//
// Allowlist
// ─────────
// Some files are genuinely cohesive at large size (e.g. drift-baseline
// is one concern with no natural sub-module split). These are
// allowlisted by file path below WITH a documented reason. Adding to
// the allowlist requires writing the reason — no silent waivers.
//
// Future maintenance: when an allowlisted file gains a natural seam,
// remove its allowlist entry, do the split, and the entry stays
// dropped.

import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

// Thresholds — chosen to flag the obvious god-file shape without
// nagging on every reasonable >300-line module:
//
//   - 1500 LOC: lower bound where any one .ts file usually wants a
//     split. The audit found state-tools.ts at 11k and the next
//     largest engine module (git-worktree.ts) at 2.8k; the 1500
//     threshold catches future drift without forcing immediate
//     action on the existing 1.5k–2.8k cluster (those are
//     explicitly allowlisted with reasons).
//
//   - 60 exports: the "namespace, not module" smell. state-tools.ts
//     hit 101. Reasonable single-concern modules typically export
//     20–40 symbols; 60 is the tripwire for "this file is doing
//     too many jobs."
//
// Either signal alone fails the check — a 5k-line file with 12
// exports is still suspect; a 400-line file with 80 exports is too
// (suggests a barrel masquerading as logic).
const LOC_BUDGET = 1500
const EXPORTS_BUDGET = 60

// Allowlist — file paths relative to repo root, each with a reason.
// Adding an entry requires explaining WHY this file is exempt; the
// reason gets surfaced in the violation report when the file's
// numbers shift, so future readers know the shape was chosen
// deliberately.
const ALLOWLIST = new Map([
	[
		"packages/haiku/src/state-tools.ts",
		"Legacy god file under active decomposition. The file already shrank from 11.4k → ~11.1k via the schema split (PR #304); follow-up PRs will continue extracting clusters until this entry can be removed. Do not add NEW exports to this file — extract them to packages/haiku/src/state/<concern>/ first.",
	],
	[
		"packages/haiku/src/git-worktree.ts",
		"Single concern: every git branch / worktree mechanic for the engine. The 46 exports are all topical (createUnitWorktree, mergeFixChainWorktree, ensureStageBranch, etc.). Splittable into `branch-creation.ts` + `merge-strategies.ts` + `worktree-discovery.ts` if it grows past 4000 LOC; under that, the cohesion outweighs the size.",
	],
	[
		"packages/haiku/src/orchestrator/workflow/drift-baseline.ts",
		"Single concern: drift baseline read/write/sidecar/recovery. The 52 exports are tightly coupled to the baseline lifecycle and benefit from co-location (one file to grep when debugging baseline state). Worth revisiting if it gains another 500 LOC.",
	],
	[
		"packages/haiku-ui/src/pages/review/stage/StageReview.tsx",
		"Stage-review entry point + per-tab subcomponents (UnitsTab, ArtifactsTab, ArtifactDetailView, UnitDetailView). Could split per-tab when StageReview gets to 3000 LOC; under that, the UI cohesion of the review surface keeps it readable.",
	],
])

// File-discovery patterns. We scan packages/{haiku,haiku-ui,haiku-api}/src
// and the top-level scripts/. Skip generated bundles, dist dirs, test
// fixtures, and the SPA's emitted artifacts.
const SCAN_PATHS = [
	"packages/haiku/src",
	"packages/haiku-ui/src",
	"packages/haiku-api/src",
]
const SKIP_RE =
	/\/(?:dist|node_modules|__tests__|test-fixtures|review-app\/dist|haiku-ui-html\.ts)/

function listTrackedFiles() {
	// Use `git ls-files` so we only check files git tracks. Untracked
	// throwaway scratch files don't fail the build.
	//
	// Pass each scan path raw and let git list every tracked file under
	// it — globs like `${path}/**/*.ts` skip depth-0 files in some git
	// versions (the `**` segment requires at least one intermediate
	// directory). Filtering by extension after the fact keeps the
	// pattern simple and predictable across git versions.
	const raw = execFileSync("git", ["ls-files", ...SCAN_PATHS], {
		encoding: "utf8",
		cwd: repoRoot,
	})
	return raw
		.split("\n")
		.filter(Boolean)
		.filter((p) => /\.(ts|tsx)$/.test(p))
		.filter((p) => !SKIP_RE.test(p))
}

function fileMetrics(absPath) {
	const text = readFileSync(absPath, "utf8")
	const loc = text.split("\n").length
	// Naive but effective: count lines that begin (after optional
	// whitespace) with `export `. Catches `export function`,
	// `export const`, `export interface`, `export type`, `export {`
	// (re-exports), `export default`, etc. False positives on commented
	// code are negligible at the 60-export threshold; if it ever bites,
	// switch to a tsc-aware AST scan.
	const exportMatches = text.match(/^[\t ]*export[\s{*]/gm) || []
	return { loc, exportCount: exportMatches.length }
}

function describeViolation(rel, loc, exportCount) {
	const reasons = []
	if (loc > LOC_BUDGET) reasons.push(`${loc} LOC > ${LOC_BUDGET}`)
	if (exportCount > EXPORTS_BUDGET)
		reasons.push(`${exportCount} exports > ${EXPORTS_BUDGET}`)
	return `  ${rel} — ${reasons.join(", ")}`
}

function main() {
	const violations = []
	const allowlistInfo = []

	for (const rel of listTrackedFiles()) {
		const abs = join(repoRoot, rel)
		try {
			statSync(abs)
		} catch {
			continue
		}
		const { loc, exportCount } = fileMetrics(abs)
		const overLoc = loc > LOC_BUDGET
		const overExports = exportCount > EXPORTS_BUDGET
		if (!overLoc && !overExports) continue

		const allow = ALLOWLIST.get(rel)
		if (allow) {
			allowlistInfo.push(
				`  ${rel} — ${loc} LOC, ${exportCount} exports — ALLOWED: ${allow}`,
			)
			continue
		}
		violations.push(describeViolation(rel, loc, exportCount))
	}

	if (allowlistInfo.length > 0) {
		console.log(
			`\nAllowlisted oversize files (${allowlistInfo.length}) — known and documented:`,
		)
		for (const line of allowlistInfo) console.log(line)
	}

	if (violations.length === 0) {
		console.log(
			`\n✓ No god files detected. Budget: ${LOC_BUDGET} LOC / ${EXPORTS_BUDGET} exports per .ts/.tsx file.`,
		)
		return
	}

	console.error(
		`\n✗ Found ${violations.length} file(s) over the god-file budget:\n`,
	)
	for (const line of violations) console.error(line)
	console.error(
		`\nBudget: ${LOC_BUDGET} LOC / ${EXPORTS_BUDGET} exports per .ts/.tsx file.\n` +
			"\n" +
			"Options:\n" +
			"  1. Split the file into per-concern modules (preferred). The\n" +
			"     packages/haiku/src/state/schemas/ directory is the canonical\n" +
			"     example: one file per shape, plus a barrel index.ts.\n" +
			"  2. If the file is genuinely one cohesive concern, add an\n" +
			"     ALLOWLIST entry in scripts/check-no-god-files.mjs WITH a\n" +
			"     written reason. Reason-less waivers will be rejected in\n" +
			"     code review.",
	)
	process.exit(1)
}

main()
