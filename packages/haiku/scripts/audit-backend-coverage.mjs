#!/usr/bin/env node
/**
 * Backend feedback-model regression gate (unit-16).
 *
 * Binds the six product-stage `.feature` files to the existing backend test
 * suites so a reviewer can verify that the 149 product-declared scenarios
 * are still covered by passing tests in the current visit.
 *
 * Steps:
 *   1. Parse every `Scenario:` and `Scenario Outline: + Examples:` row from
 *      the six feature files in the intent's `features/` directory.
 *   2. Parse `backend-feature-coverage.yaml` (hand-rolled minimal YAML — the
 *      coverage map has a fixed shallow shape, no dependency required).
 *   3. Diff: every scenario in the feature set must have either a
 *      non-empty `covered_by` entry or a `skip_reason` entry in the map.
 *   4. Validate: every `covered_by` string of the form
 *      `<test-file>::<substring>` must point at a test file whose text
 *      contains the `<substring>` inside an `it(...)` / `test(...)` /
 *      `describe(...)` call. This catches coverage-map typos without
 *      running the tests.
 *   5. Run: for every unique test file mentioned in `covered_by` entries,
 *      execute `npx tsx <file>` and require exit code 0 (unless the
 *      `--map-only` flag is passed). `npx tsx` is the existing test runner
 *      convention for this package — see `packages/haiku/test/run-all.mjs`.
 *      The tests import `.ts` source files directly, so `node --test` fails
 *      with ERR_MODULE_NOT_FOUND on `.ts` extensions.
 *
 * Exit codes:
 *   0 — every scenario covered and every referenced test passing
 *   1 — coverage gap, drift, typo, or test failure (see stderr)
 *
 * Flags:
 *   --map-only   skip the test-run step (map validation only)
 *   --verbose    emit per-scenario diagnostics
 *
 * Intended to run from the repo root. Invoked by unit-16's completion
 * criteria.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, "../../..")

const INTENT_SLUG = "universal-feedback-model-and-review-recovery"
const INTENT_DIR = join(REPO_ROOT, ".haiku", "intents", INTENT_SLUG)
const FEATURE_DIR = join(INTENT_DIR, "features")
const COVERAGE_MAP_PATH = join(
	INTENT_DIR,
	"stages",
	"development",
	"artifacts",
	"backend-feature-coverage.yaml",
)
const TEST_DIR = join(REPO_ROOT, "packages", "haiku", "test")

// The six feature files enumerated by FB-25.
const FEATURE_FILES = [
	"feedback-crud.feature",
	"enforce-iteration-fix.feature",
	"auto-revisit.feature",
	"additive-elaborate.feature",
	"external-review-feedback.feature",
	"revisit-with-reasons.feature",
]

const flags = new Set(process.argv.slice(2))
const VERBOSE = flags.has("--verbose")
const MAP_ONLY = flags.has("--map-only")

/** @type {{feature: string, scenarios: string[]}[]} */
const featureScenarios = []

/**
 * Parse scenarios from a `.feature` file. Expands `Scenario Outline:` blocks
 * so every `Examples:` row becomes a distinct scenario identified by
 * `<outline title> [row N]`.
 *
 * @param {string} path
 * @returns {string[]}
 */
function parseScenarios(path) {
	const text = readFileSync(path, "utf8")
	const lines = text.split("\n")
	/** @type {string[]} */
	const scenarios = []
	let i = 0
	while (i < lines.length) {
		const line = lines[i]
		const trimmed = line.trim()
		const scenarioMatch = trimmed.match(/^Scenario:\s*(.+)$/)
		if (scenarioMatch) {
			scenarios.push(scenarioMatch[1].trim())
			i++
			continue
		}
		const outlineMatch = trimmed.match(/^Scenario Outline:\s*(.+)$/)
		if (outlineMatch) {
			const title = outlineMatch[1].trim()
			// Find the Examples: block (can be multiple per outline).
			i++
			let exampleRowCount = 0
			while (i < lines.length) {
				const inner = lines[i].trim()
				if (
					inner.startsWith("Scenario:") ||
					inner.startsWith("Scenario Outline:")
				) {
					break
				}
				if (inner.startsWith("Examples:")) {
					i++
					// Skip table header row.
					if (i < lines.length && lines[i].trim().startsWith("|")) {
						i++
					}
					while (i < lines.length) {
						const row = lines[i].trim()
						if (!row.startsWith("|")) break
						exampleRowCount++
						scenarios.push(`${title} [row ${exampleRowCount}]`)
						i++
					}
					continue
				}
				i++
			}
			if (exampleRowCount === 0) {
				// Outline with no Examples rows — count the title itself.
				scenarios.push(title)
			}
			continue
		}
		i++
	}
	return scenarios
}

// ── Minimal YAML parser ──────────────────────────────────────────────────
//
// Supports ONLY the shallow structure the coverage map uses:
//
//   feedback-crud.feature:
//     - scenario: "Scenario title"
//       covered_by:
//         - feedback.test.mjs::test-name-substring
//       notes: >-
//         Optional free-form note spanning multiple lines.
//         Lines are folded into spaces (YAML `>-` semantics).
//     - scenario: "Another"
//       skip_reason: Short inline reason
//
// Any deviation from this shape (nested maps, anchors, flow style, other
// block-scalar indicators like `|` or `>`) throws. The parser is
// deliberately strict so a typo in the map surfaces loudly instead of
// silently being ignored.

/**
 * @param {string} text
 * @returns {Record<string, Array<{scenario: string, covered_by?: string[], skip_reason?: string, notes?: string}>>}
 */
function parseCoverageYaml(text) {
	/** @type {Record<string, Array<{scenario: string, covered_by?: string[], skip_reason?: string, notes?: string}>>} */
	const result = {}
	/** @type {string | null} */
	let currentFeature = null
	/** @type {any | null} */
	let currentEntry = null
	/** @type {string | null} */
	let currentListField = null
	/** @type {{ field: string, indent: number, parts: string[] } | null} */
	let foldedScalar = null
	const lines = text.split("\n")
	for (let lineNo = 0; lineNo < lines.length; lineNo++) {
		const raw = lines[lineNo]
		// If we're inside a folded scalar, check if this line continues it.
		if (foldedScalar) {
			const indent = raw.length - raw.trimStart().length
			if (raw.trim() === "") {
				// Blank line inside a folded scalar — treat as paragraph break.
				if (foldedScalar.parts.length > 0) foldedScalar.parts.push("")
				continue
			}
			if (indent >= foldedScalar.indent) {
				foldedScalar.parts.push(raw.trim())
				continue
			}
			// De-indented line — flush the folded scalar and fall through to
			// normal parsing of this line.
			currentEntry[foldedScalar.field] = foldScalar(foldedScalar.parts)
			foldedScalar = null
		}

		// Strip comments (ignoring `#` inside quoted strings — simple split).
		let line = raw
		const hashIdx = findCommentStart(line)
		if (hashIdx !== -1) line = line.slice(0, hashIdx)
		if (line.trim() === "") continue

		// Top-level feature-file key: `feedback-crud.feature:` at column 0.
		const topMatch = line.match(/^([a-zA-Z0-9_.-]+\.feature):\s*$/)
		if (topMatch) {
			currentFeature = topMatch[1]
			result[currentFeature] = []
			currentEntry = null
			currentListField = null
			continue
		}

		// Entry start: `  - scenario: "…"`.
		const entryStart = line.match(/^ {2}-\s*scenario:\s*(.*)$/)
		if (entryStart) {
			if (!currentFeature) {
				throw new Error(`line ${lineNo + 1}: entry without active feature key`)
			}
			currentEntry = { scenario: unquote(entryStart[1].trim()) }
			currentListField = null
			result[currentFeature].push(currentEntry)
			continue
		}

		// Entry field at 4-space indent: `    covered_by:` / `    skip_reason: …` / `    notes: …`.
		const fieldMatch = line.match(/^ {4}([a-z_]+):\s*(.*)$/)
		if (fieldMatch) {
			if (!currentEntry) {
				throw new Error(`line ${lineNo + 1}: field outside of an entry`)
			}
			const [, name, value] = fieldMatch
			if (name === "covered_by") {
				currentEntry.covered_by = []
				currentListField = "covered_by"
				if (value.trim() !== "") {
					throw new Error(
						`line ${lineNo + 1}: covered_by must be followed by a block list, not inline value`,
					)
				}
				continue
			}
			if (name === "skip_reason" || name === "notes") {
				const trimmed = value.trim()
				if (trimmed === ">-" || trimmed === ">") {
					// Folded block scalar — subsequent indented lines fold
					// into the value. Content must be indented strictly more
					// than the field (4 spaces), so ≥ 6.
					foldedScalar = { field: name, indent: 6, parts: [] }
				} else {
					currentEntry[name] = unquote(trimmed)
				}
				currentListField = null
				continue
			}
			throw new Error(`line ${lineNo + 1}: unknown entry field "${name}"`)
		}

		// List item at 6-space indent: `      - feedback.test.mjs::…`.
		const listItemMatch = line.match(/^ {6}-\s*(.+)$/)
		if (listItemMatch) {
			if (!currentEntry || currentListField !== "covered_by") {
				throw new Error(`line ${lineNo + 1}: list item outside of covered_by`)
			}
			currentEntry.covered_by.push(unquote(listItemMatch[1].trim()))
			continue
		}

		throw new Error(`line ${lineNo + 1}: unrecognized syntax: ${raw}`)
	}

	// Flush any trailing folded scalar at EOF.
	if (foldedScalar && currentEntry) {
		currentEntry[foldedScalar.field] = foldScalar(foldedScalar.parts)
	}

	return result
}

/**
 * Fold a list of trimmed lines into a single string, collapsing runs of
 * non-empty lines into space-joined text and treating empty strings as
 * paragraph breaks (single newline).
 * @param {string[]} parts
 */
function foldScalar(parts) {
	/** @type {string[]} */
	const out = []
	/** @type {string[]} */
	let paragraph = []
	for (const p of parts) {
		if (p === "") {
			if (paragraph.length > 0) {
				out.push(paragraph.join(" "))
				paragraph = []
			}
			continue
		}
		paragraph.push(p)
	}
	if (paragraph.length > 0) out.push(paragraph.join(" "))
	// `>-` strips trailing newlines; join paragraphs with a single newline.
	return out.join("\n")
}

/**
 * Find the start of a `#` comment outside of quoted strings. Returns -1 if
 * there is no comment.
 * @param {string} line
 * @returns {number}
 */
function findCommentStart(line) {
	let inQuote = false
	let quoteChar = ""
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (inQuote) {
			if (ch === quoteChar) inQuote = false
			continue
		}
		if (ch === '"' || ch === "'") {
			inQuote = true
			quoteChar = ch
			continue
		}
		if (ch === "#") return i
	}
	return -1
}

/**
 * Strip surrounding `"` or `'` if present and unescape common backslash
 * sequences inside double-quoted strings (`\"`, `\\`). Plain strings pass
 * through unchanged.
 * @param {string} s
 */
function unquote(s) {
	if (s.length >= 2) {
		const first = s[0]
		const last = s[s.length - 1]
		if ((first === '"' || first === "'") && first === last) {
			const body = s.slice(1, -1)
			if (first === '"') {
				return body.replace(/\\(.)/g, (_, ch) => ch)
			}
			return body
		}
	}
	return s
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
	// 1. Parse scenarios from every feature file.
	let totalScenarios = 0
	for (const feature of FEATURE_FILES) {
		const path = join(FEATURE_DIR, feature)
		if (!existsSync(path)) {
			console.error(`ERROR: feature file not found: ${path}`)
			process.exit(1)
		}
		const scenarios = parseScenarios(path)
		featureScenarios.push({ feature, scenarios })
		totalScenarios += scenarios.length
		if (VERBOSE) {
			console.log(`  ${feature}: ${scenarios.length} scenarios`)
		}
	}

	// 2. Parse coverage map.
	if (!existsSync(COVERAGE_MAP_PATH)) {
		console.error(`ERROR: coverage map not found: ${COVERAGE_MAP_PATH}`)
		process.exit(1)
	}
	/** @type {Record<string, any[]>} */
	let coverage
	try {
		coverage = parseCoverageYaml(readFileSync(COVERAGE_MAP_PATH, "utf8"))
	} catch (err) {
		console.error(
			`ERROR parsing coverage map:\n  ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(1)
	}

	// 3. Diff feature scenarios against coverage map.
	let failures = 0
	/** @type {Set<string>} */
	const referencedTestFiles = new Set()
	for (const { feature, scenarios } of featureScenarios) {
		const mapEntries = coverage[feature] ?? []
		/** @type {Map<string, any>} */
		const entryByScenario = new Map()
		for (const entry of mapEntries) {
			if (entryByScenario.has(entry.scenario)) {
				console.error(
					`ERROR ${feature}: duplicate scenario entry "${entry.scenario}"`,
				)
				failures++
			}
			entryByScenario.set(entry.scenario, entry)
		}
		for (const scenario of scenarios) {
			const entry = entryByScenario.get(scenario)
			if (!entry) {
				console.error(
					`ERROR ${feature}: scenario has no coverage-map entry: "${scenario}"`,
				)
				failures++
				continue
			}
			const hasCovered = entry.covered_by && entry.covered_by.length > 0
			const hasSkip =
				typeof entry.skip_reason === "string" && entry.skip_reason.length > 0
			if (!hasCovered && !hasSkip) {
				console.error(
					`ERROR ${feature}: scenario has empty covered_by and no skip_reason: "${scenario}"`,
				)
				failures++
				continue
			}
			if (hasCovered) {
				for (const binding of entry.covered_by) {
					if (!binding.includes("::")) {
						console.error(
							`ERROR ${feature}: binding "${binding}" missing :: separator for scenario "${scenario}"`,
						)
						failures++
						continue
					}
					const [testFile, needle] = binding.split("::", 2)
					const testPath = join(TEST_DIR, testFile)
					if (!existsSync(testPath)) {
						console.error(
							`ERROR ${feature}: test file "${testFile}" does not exist (binding: "${binding}")`,
						)
						failures++
						continue
					}
					const source = readFileSync(testPath, "utf8")
					if (!source.includes(needle)) {
						console.error(
							`ERROR ${feature}: test-name substring "${needle}" not found in ${testFile} (scenario "${scenario}")`,
						)
						failures++
						continue
					}
					referencedTestFiles.add(testFile)
				}
			}
		}
		// Catch drift in the other direction: map references a scenario that
		// no longer exists in the feature file (product renamed it).
		const scenarioSet = new Set(scenarios)
		for (const entry of mapEntries) {
			if (!scenarioSet.has(entry.scenario)) {
				console.error(
					`ERROR ${feature}: coverage-map entry references unknown scenario "${entry.scenario}" (product renamed it?)`,
				)
				failures++
			}
		}
	}

	// Also flag any feature keys in the map that aren't in FEATURE_FILES.
	for (const key of Object.keys(coverage)) {
		if (!FEATURE_FILES.includes(key)) {
			console.error(
				`ERROR: coverage map references unknown feature file "${key}"`,
			)
			failures++
		}
	}

	if (failures > 0) {
		console.error(
			`\nFAIL: ${failures} coverage issue(s) across ${totalScenarios} scenarios`,
		)
		process.exit(1)
	}

	// 4. Run the referenced test files (unless --map-only). Using `npx tsx`
	// — the convention established in `packages/haiku/test/run-all.mjs`.
	// `.test.mjs` files in this package import `.ts` source files directly,
	// so `node --test` fails with ERR_MODULE_NOT_FOUND.
	if (!MAP_ONLY) {
		for (const testFile of [...referencedTestFiles].sort()) {
			const testPath = join(TEST_DIR, testFile)
			if (VERBOSE) console.log(`  running: ${testFile}`)
			const result = spawnSync("npx", ["tsx", testPath], {
				cwd: join(REPO_ROOT, "packages", "haiku"),
				stdio: VERBOSE ? "inherit" : "pipe",
				shell: process.platform === "win32",
			})
			if (result.status !== 0) {
				console.error(`FAIL: ${testFile} exited with ${result.status}`)
				if (!VERBOSE && result.stdout) {
					process.stderr.write(result.stdout)
				}
				if (!VERBOSE && result.stderr) {
					process.stderr.write(result.stderr)
				}
				process.exit(1)
			}
		}
	}

	// 5. Summary per feature file.
	for (const { feature, scenarios } of featureScenarios) {
		const entries = coverage[feature] ?? []
		const covered = entries.filter(
			(e) => e.covered_by && e.covered_by.length > 0,
		).length
		const skipped = entries.filter(
			(e) => typeof e.skip_reason === "string" && e.skip_reason.length > 0,
		).length
		const suffix = MAP_ONLY ? "" : ", all referenced tests passing"
		const skipNote = skipped > 0 ? `, ${skipped} with skip_reason` : ""
		console.log(
			`${feature}: ${covered}/${scenarios.length} scenarios covered${skipNote}${suffix}`,
		)
	}

	console.log(
		`\nOK: ${totalScenarios} scenarios, ${referencedTestFiles.size} unique test files${MAP_ONLY ? " (map-only)" : ""}`,
	)
}

main()
