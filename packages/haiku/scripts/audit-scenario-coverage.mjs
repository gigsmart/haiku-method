#!/usr/bin/env node

/**
 * audit-scenario-coverage.mjs — mechanical coverage gate (FB-59 fix).
 *
 * Asserts that every `Scenario:` / `Scenario Outline:` line in
 *
 *   .haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature
 *
 * has at least one matching test name across the union of:
 *
 *   a) The hand-curated backend binding map at
 *      `stages/development/artifacts/backend-feature-coverage.yaml`
 *      (authoritative for the six backend feature files; validated by
 *      the sister script `audit-backend-coverage.mjs` which runs the
 *      tests and asserts the mapping actually refers to real test
 *      names). A backend scenario counts as mapped if its yaml entry
 *      has a non-empty `covered_by` OR a `skip_reason`.
 *   b) `stages/development/artifacts/test-baseline.json` — the backend
 *      pass/fail baseline captured by `capture-test-baseline.mjs`.
 *      Used for bidirectional-substring fallback when a scenario has
 *      no yaml entry.
 *   c) A grep-based discovery pass over `packages/haiku-ui/src/**` and
 *      `packages/haiku-ui/tests/**` that extracts every
 *      `it(...)` / `test(...)` / `describe(...)` first-argument string.
 *      This covers `review-ui-feedback.feature` (UI-only scenarios) and
 *      any cross-stack scenarios whose coverage lives in the frontend.
 *
 * Matching policy
 * ---------------
 *   - If a scenario has a `backend-feature-coverage.yaml` entry with a
 *     non-empty `covered_by` list OR a `skip_reason`, it is mapped
 *     (source `yaml-binding` or `yaml-skip`).
 *   - Otherwise: case-insensitive, punctuation-insensitive bidirectional
 *     substring match against the union of backend baseline tests and
 *     frontend discovered tests. After normalization (lowercase, collapse
 *     non-alphanumeric runs into a single space, trim), a scenario
 *     matches a test name iff `normScenario ⊂ normTest` OR
 *     `normTest ⊂ normScenario`, where both are at least 4 chars to
 *     avoid trivial-substring noise.
 *   - An alias escape hatch at
 *     `stages/development/artifacts/scenario-coverage-aliases.json`
 *     maps a scenario title (keyed by `<feature-file>::<scenario>`) to
 *     one or more alternative canonical test-name substrings.
 *   - An `ignore` array in the same aliases file explicitly excludes
 *     scenarios that are spec-only (documentation / aspirational). The
 *     script prints the count of ignored scenarios so reviewers can
 *     audit the ignore list size.
 *
 * Output
 * ------
 *   - Writes `stages/development/artifacts/scenario-coverage.json` every
 *     run (success or failure) so the reviewer can read the machine-
 *     checked result without re-running the script.
 *   - stdout: one summary line plus per-feature-file summary.
 *   - stderr: on failure, per-orphan scenario list with file:line.
 *
 * Exit codes
 * ----------
 *   0 — every scenario maps to at least one test (or is in the ignore list)
 *   1 — at least one scenario has no mapped test
 *   2 — filesystem / parse error
 *
 * Budget
 * ------
 *   30s wall-clock (matches `audit-openapi-parity.mjs` convention).
 *
 * Not in scope
 * ------------
 *   - Running the tests. This is a coverage gate, not a regression gate —
 *     `audit-backend-coverage.mjs` handles the regression side and the
 *     yaml-binding integrity.
 *   - Cucumber step definitions. Project uses vitest + node:test only.
 */

import { execSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..")
const INTENT_SLUG = "universal-feedback-model-and-review-recovery"
const INTENT_DIR = join(REPO_ROOT, ".haiku", "intents", INTENT_SLUG)
const FEATURE_DIR = join(INTENT_DIR, "features")
const BASELINE_PATH = join(
	INTENT_DIR,
	"stages",
	"development",
	"artifacts",
	"test-baseline.json",
)
const BACKEND_COVERAGE_YAML = join(
	INTENT_DIR,
	"stages",
	"development",
	"artifacts",
	"backend-feature-coverage.yaml",
)
const ALIASES_PATH = join(
	INTENT_DIR,
	"stages",
	"development",
	"artifacts",
	"scenario-coverage-aliases.json",
)
const COVERAGE_OUT = join(
	INTENT_DIR,
	"stages",
	"development",
	"artifacts",
	"scenario-coverage.json",
)
const UI_SRC_DIR = join(REPO_ROOT, "packages", "haiku-ui", "src")
const UI_TESTS_DIR = join(REPO_ROOT, "packages", "haiku-ui", "tests")
const BACKEND_TEST_DIR = join(REPO_ROOT, "packages", "haiku", "test")
const API_SRC_DIR = join(REPO_ROOT, "packages", "haiku-api", "src")
const API_TESTS_DIR = join(REPO_ROOT, "packages", "haiku-api", "tests")

const BUDGET_MS = 30_000
const MIN_SUBSTRING_LEN = 4 // avoid trivial substring noise

// ── Scenario parsing ─────────────────────────────────────────────────────

/**
 * Parse `Scenario:` and `Scenario Outline:` titles out of a `.feature`
 * file. Returns [{ file, line, title, kind }].
 *
 * @param {string} featurePath
 * @returns {{ file: string, line: number, title: string, kind: "Scenario" | "Scenario Outline" }[]}
 */
function parseScenarios(featurePath) {
	const text = readFileSync(featurePath, "utf8")
	const lines = text.split("\n")
	const out = []
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^\s*(Scenario(?:\s+Outline)?):\s*(.+?)\s*$/)
		if (!m) continue
		out.push({
			file: featurePath,
			line: i + 1,
			title: m[2],
			kind: /Outline/.test(m[1]) ? "Scenario Outline" : "Scenario",
		})
	}
	return out
}

// ── Minimal YAML parser (shared shape with audit-backend-coverage.mjs) ───

/**
 * Parse the same shallow YAML schema `audit-backend-coverage.mjs`
 * accepts: top-level `<feature>.feature:` keys, each holding a list of
 * entries with `scenario`, optional `covered_by` (list) and
 * `skip_reason` (scalar, possibly folded `>-`), and optional `notes`.
 *
 * The full dependency-free parser is replicated here instead of imported
 * because (a) the sister script lives in the same dir and uses the same
 * shape, and (b) importing a sibling `.mjs` for a single function would
 * entangle their lifecycles. Keep the two parsers in sync if the yaml
 * shape evolves.
 *
 * @param {string} text
 * @returns {Record<string, Array<{scenario: string, covered_by?: string[], skip_reason?: string, notes?: string}>>}
 */
function parseCoverageYaml(text) {
	/** @type {Record<string, any[]>} */
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
		if (foldedScalar) {
			const indent = raw.length - raw.trimStart().length
			if (raw.trim() === "") {
				if (foldedScalar.parts.length > 0) foldedScalar.parts.push("")
				continue
			}
			if (indent >= foldedScalar.indent) {
				foldedScalar.parts.push(raw.trim())
				continue
			}
			currentEntry[foldedScalar.field] = foldScalar(foldedScalar.parts)
			foldedScalar = null
		}
		let line = raw
		const hashIdx = findCommentStart(line)
		if (hashIdx !== -1) line = line.slice(0, hashIdx)
		if (line.trim() === "") continue

		const topMatch = line.match(/^([a-zA-Z0-9_.-]+\.feature):\s*$/)
		if (topMatch) {
			currentFeature = topMatch[1]
			result[currentFeature] = []
			currentEntry = null
			currentListField = null
			continue
		}
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
						`line ${lineNo + 1}: covered_by must be followed by a block list`,
					)
				}
				continue
			}
			if (name === "skip_reason" || name === "notes") {
				const trimmed = value.trim()
				if (trimmed === ">-" || trimmed === ">") {
					foldedScalar = { field: name, indent: 6, parts: [] }
				} else {
					currentEntry[name] = unquote(trimmed)
				}
				currentListField = null
				continue
			}
			throw new Error(`line ${lineNo + 1}: unknown entry field "${name}"`)
		}
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
	if (foldedScalar && currentEntry) {
		currentEntry[foldedScalar.field] = foldScalar(foldedScalar.parts)
	}
	return result
}

function foldScalar(parts) {
	const out = []
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
	return out.join("\n")
}

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

function unquote(s) {
	if (s.length >= 2) {
		const first = s[0]
		const last = s[s.length - 1]
		if ((first === '"' || first === "'") && first === last) {
			const body = s.slice(1, -1)
			if (first === '"') return body.replace(/\\(.)/g, (_, ch) => ch)
			return body
		}
	}
	return s
}

// ── Test-name discovery ──────────────────────────────────────────────────

/**
 * Normalize a string for bidirectional substring matching.
 *   - lowercase
 *   - collapse runs of non-alphanumeric characters into a single space
 *   - trim leading/trailing whitespace
 *
 * @param {string} s
 */
function normalize(s) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

/**
 * Read backend test names out of `test-baseline.json`. Each entry becomes
 * `{ name, source: "backend-baseline:<file>" }`. The baseline is a
 * regression artifact captured at a prior HEAD — if newer test files
 * exist on disk, `collectBackendTestsFromDisk()` picks them up.
 *
 * @returns {{ name: string, source: string }[]}
 */
function collectBackendTestsFromBaseline() {
	if (!existsSync(BASELINE_PATH)) return []
	const doc = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
	const tests = Array.isArray(doc?.tests) ? doc.tests : []
	return tests.map((t) => ({
		name: String(t.name ?? ""),
		source: `backend-baseline:${t.file ?? "?"}`,
	}))
}

/**
 * Discover backend test names by grep-parsing every `.test.mjs` file in
 * `packages/haiku/test/`. Complements the baseline: the baseline may be
 * stale relative to HEAD, so we union this with the baseline names to
 * cover tests added since the baseline was captured.
 *
 * @returns {{ name: string, source: string }[]}
 */
function collectBackendTestsFromDisk() {
	const files = walkTestFiles(BACKEND_TEST_DIR)
	const apiFiles = [
		...walkTestFiles(API_SRC_DIR),
		...walkTestFiles(API_TESTS_DIR),
	]
	const out = []
	for (const f of [...files, ...apiFiles]) {
		try {
			out.push(...extractTestNames(f))
		} catch (err) {
			console.error(
				`audit-scenario-coverage · failed to read ${f}: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}
	return out
}

/**
 * Walk a directory recursively and return every file whose name ends in
 * `.test.ts`, `.test.tsx`, `.test.mjs`, `.spec.ts`, `.spec.tsx`, or
 * `.spec.mjs`. Skips `__snapshots__` directories.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkTestFiles(dir) {
	if (!existsSync(dir)) return []
	const out = []
	const queue = [dir]
	while (queue.length) {
		const current = queue.pop()
		let entries
		try {
			entries = readdirSync(current, { withFileTypes: true })
		} catch {
			continue
		}
		for (const ent of entries) {
			if (ent.name === "__snapshots__") continue
			const full = join(current, ent.name)
			if (ent.isDirectory()) {
				queue.push(full)
				continue
			}
			if (!ent.isFile()) continue
			if (
				ent.name.endsWith(".test.ts") ||
				ent.name.endsWith(".test.tsx") ||
				ent.name.endsWith(".test.mjs") ||
				ent.name.endsWith(".spec.ts") ||
				ent.name.endsWith(".spec.tsx") ||
				ent.name.endsWith(".spec.mjs")
			) {
				out.push(full)
			}
		}
	}
	return out
}

/**
 * Grep-parse `it("…", …)`, `test("…", …)`, and `describe("…", …)` calls
 * out of a source file. Supports single-quoted, double-quoted, and
 * backticked string literals.
 *
 * @param {string} filePath
 * @returns {{ name: string, source: string }[]}
 */
function extractTestNames(filePath) {
	const text = readFileSync(filePath, "utf8")
	const re =
		/\b(?:it|test|describe)(?:\.(?:skip|only|todo)|\.each\s*\([\s\S]*?\))?\s*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
	const out = []
	const rel = filePath.replace(`${REPO_ROOT}/`, "")
	let m
	while ((m = re.exec(text))) {
		let raw = m[2]
		raw = raw.replace(/\\(.)/g, (_, c) => c)
		raw = raw.replace(/\$\{[^}]*\}/g, " ")
		const trimmed = raw.trim()
		if (trimmed) out.push({ name: trimmed, source: `ui:${rel}` })
	}
	return out
}

function collectFrontendTests() {
	const files = [...walkTestFiles(UI_SRC_DIR), ...walkTestFiles(UI_TESTS_DIR)]
	const out = []
	for (const f of files) {
		try {
			out.push(...extractTestNames(f))
		} catch (err) {
			console.error(
				`audit-scenario-coverage · failed to read ${f}: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}
	return out
}

// ── Aliases ──────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   aliases?: Record<string, string[]>,
 *   ignore?: string[],
 * }} AliasesFile
 */

/** @returns {AliasesFile} */
function loadAliases() {
	if (!existsSync(ALIASES_PATH)) return { aliases: {}, ignore: [] }
	try {
		const parsed = JSON.parse(readFileSync(ALIASES_PATH, "utf8"))
		return { aliases: parsed.aliases ?? {}, ignore: parsed.ignore ?? [] }
	} catch (err) {
		console.error(
			`audit-scenario-coverage · failed to parse aliases file: ${err instanceof Error ? err.message : String(err)}`,
		)
		return { aliases: {}, ignore: [] }
	}
}

function loadBackendCoverageYaml() {
	if (!existsSync(BACKEND_COVERAGE_YAML)) return {}
	try {
		return parseCoverageYaml(readFileSync(BACKEND_COVERAGE_YAML, "utf8"))
	} catch (err) {
		console.error(
			`audit-scenario-coverage · failed to parse backend-feature-coverage.yaml: ${err instanceof Error ? err.message : String(err)}`,
		)
		return {}
	}
}

// ── Matching ─────────────────────────────────────────────────────────────

/**
 * Bidirectional substring match with min-length floor to avoid trivial
 * hits. Both strings must be ≥ MIN_SUBSTRING_LEN after normalization.
 */
function substringHit(scenNorm, testNorm) {
	if (scenNorm.length < MIN_SUBSTRING_LEN) return false
	if (testNorm.length < MIN_SUBSTRING_LEN) return false
	return testNorm.includes(scenNorm) || scenNorm.includes(testNorm)
}

/**
 * Given a scenario title (plus alias hints) and the pre-normalized test
 * corpus, return the first test source that matches. Null if no match.
 *
 * @param {string} scenarioTitle
 * @param {string[]} aliasHints
 * @param {{ name: string, normName: string, source: string }[]} corpus
 * @returns {{ source: string, via: "scenario-match" | "alias-match", matchedTestName: string } | null}
 */
function findCorpusMatch(scenarioTitle, aliasHints, corpus) {
	const normScen = normalize(scenarioTitle)
	if (normScen) {
		for (const t of corpus) {
			if (!t.normName) continue
			if (substringHit(normScen, t.normName)) {
				return {
					source: t.source,
					via: "scenario-match",
					matchedTestName: t.name,
				}
			}
		}
	}
	for (const hint of aliasHints) {
		const normHint = normalize(hint)
		if (!normHint) continue
		for (const t of corpus) {
			if (!t.normName) continue
			if (substringHit(normHint, t.normName)) {
				return {
					source: t.source,
					via: "alias-match",
					matchedTestName: t.name,
				}
			}
		}
	}
	return null
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
	const started = Date.now()

	if (!existsSync(FEATURE_DIR)) {
		console.error(
			`audit-scenario-coverage · feature dir missing: ${FEATURE_DIR}`,
		)
		process.exit(2)
	}

	const featureFiles = readdirSync(FEATURE_DIR)
		.filter((f) => f.endsWith(".feature"))
		.sort()

	// 1. Parse scenarios from every feature file.
	/** @type {Record<string, ReturnType<typeof parseScenarios>>} */
	const byFeature = {}
	let totalScenarios = 0
	for (const f of featureFiles) {
		const path = join(FEATURE_DIR, f)
		const scenarios = parseScenarios(path)
		byFeature[f] = scenarios
		totalScenarios += scenarios.length
	}

	// 2. Build test-name corpus + yaml binding map.
	const backendBaselineTests = collectBackendTestsFromBaseline()
	const backendDiskTests = collectBackendTestsFromDisk()
	const backendTests = [...backendBaselineTests, ...backendDiskTests]
	const frontendTests = collectFrontendTests()
	const rawCorpus = [...backendTests, ...frontendTests]
	const corpus = rawCorpus.map((t) => ({
		name: t.name,
		normName: normalize(t.name),
		source: t.source,
	}))
	const yamlByFeature = loadBackendCoverageYaml()

	if (Date.now() - started > BUDGET_MS) {
		console.error(
			`audit-scenario-coverage · budget exceeded during load (${Date.now() - started}ms)`,
		)
		process.exit(1)
	}

	// 3. Load aliases / ignore list.
	const { aliases, ignore } = loadAliases()
	const ignoreSet = new Set(ignore ?? [])

	// 4. Match each scenario.
	let mapped = 0
	let unmapped = 0
	let ignored = 0
	/** @type {{ file: string, line: number, title: string }[]} */
	const unmappedScenarios = []
	/** @type {Record<string, any>} */
	const byFeatureReport = {}

	for (const f of featureFiles) {
		const scenarios = byFeature[f]
		const yamlEntries = yamlByFeature[f] ?? []
		const yamlByScenario = new Map()
		for (const entry of yamlEntries) {
			yamlByScenario.set(entry.scenario, entry)
		}
		const featureReport = {
			total: scenarios.length,
			mapped: 0,
			ignored: 0,
			unmapped: [],
			matches: [],
		}
		for (const s of scenarios) {
			const key = `${f}::${s.title}`
			if (ignoreSet.has(key)) {
				ignored++
				featureReport.ignored++
				continue
			}
			// Prefer yaml binding if present.
			const yamlEntry = yamlByScenario.get(s.title)
			if (yamlEntry) {
				const hasCovered =
					Array.isArray(yamlEntry.covered_by) && yamlEntry.covered_by.length > 0
				const hasSkip =
					typeof yamlEntry.skip_reason === "string" &&
					yamlEntry.skip_reason.trim().length > 0
				if (hasCovered || hasSkip) {
					mapped++
					featureReport.mapped++
					featureReport.matches.push({
						title: s.title,
						line: s.line,
						via: hasCovered ? "yaml-binding" : "yaml-skip",
						matched_test: hasCovered
							? yamlEntry.covered_by[0]
							: `skip: ${yamlEntry.skip_reason?.slice(0, 80) ?? ""}`,
						test_source: hasCovered
							? `backend-feature-coverage.yaml → ${yamlEntry.covered_by[0].split("::")[0]}`
							: "backend-feature-coverage.yaml (skip_reason)",
					})
					continue
				}
			}
			// Fall back to bidirectional substring on the combined corpus.
			const hints = aliases?.[key] ?? []
			const hit = findCorpusMatch(s.title, hints, corpus)
			if (hit) {
				mapped++
				featureReport.mapped++
				featureReport.matches.push({
					title: s.title,
					line: s.line,
					via: hit.via,
					matched_test: hit.matchedTestName,
					test_source: hit.source,
				})
			} else {
				unmapped++
				featureReport.unmapped.push({ title: s.title, line: s.line })
				unmappedScenarios.push({
					file: f,
					line: s.line,
					title: s.title,
				})
			}
		}
		byFeatureReport[f] = featureReport
	}

	// 5. Write scenario-coverage.json.
	const recordedAt = new Date().toISOString()
	let headSha = ""
	try {
		headSha = execSync("git rev-parse HEAD", {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim()
	} catch {
		headSha = "unknown"
	}

	const report = {
		recorded_at: recordedAt,
		head: headSha,
		total_scenarios: totalScenarios,
		mapped,
		unmapped,
		ignored,
		corpus_sizes: {
			backend_tests: backendTests.length,
			backend_baseline: backendBaselineTests.length,
			backend_disk: backendDiskTests.length,
			frontend_tests: frontendTests.length,
			yaml_features: Object.keys(yamlByFeature).length,
		},
		by_feature: Object.fromEntries(
			Object.entries(byFeatureReport).map(([k, v]) => [
				k,
				{
					total: v.total,
					mapped: v.mapped,
					ignored: v.ignored,
					unmapped: v.unmapped,
				},
			]),
		),
		unmapped_scenarios: unmappedScenarios,
		matches: Object.fromEntries(
			Object.entries(byFeatureReport).map(([k, v]) => [k, v.matches]),
		),
	}

	writeFileSync(COVERAGE_OUT, `${JSON.stringify(report, null, 2)}\n`)

	const elapsed = Date.now() - started

	// 6. Emit summary.
	console.log(
		`audit-scenario-coverage · ${totalScenarios} scenarios · ${mapped} mapped · ${unmapped} unmapped · ${ignored} ignored · backend=${backendTests.length} frontend=${frontendTests.length} · ${elapsed}ms`,
	)
	for (const f of featureFiles) {
		const rep = byFeatureReport[f]
		console.log(
			`  ${f}: ${rep.mapped}/${rep.total} mapped${rep.ignored ? `, ${rep.ignored} ignored` : ""}${rep.unmapped.length ? `, ${rep.unmapped.length} unmapped` : ""}`,
		)
	}

	if (unmapped > 0) {
		console.error("")
		console.error(`FAIL: ${unmapped} scenario(s) have no mapped test:`)
		for (const s of unmappedScenarios) {
			console.error(`  ${s.file}:${s.line}  ${s.title}`)
		}
		console.error("")
		console.error(
			`Resolution: add a test whose name bidirectionally-substring-matches the scenario title, add a covered_by entry in backend-feature-coverage.yaml, or add an alias entry in ${ALIASES_PATH.replace(`${REPO_ROOT}/`, "")}.`,
		)
		process.exit(1)
	}

	if (elapsed > BUDGET_MS) {
		console.error(
			`audit-scenario-coverage · budget exceeded: ${elapsed}ms > ${BUDGET_MS}ms`,
		)
		process.exit(1)
	}

	if (mapped + unmapped + ignored !== totalScenarios) {
		console.error(
			`audit-scenario-coverage · accounting mismatch: ${mapped} + ${unmapped} + ${ignored} !== ${totalScenarios}`,
		)
		process.exit(2)
	}

	process.exit(0)
}

try {
	main()
} catch (err) {
	console.error(
		`audit-scenario-coverage · unexpected error: ${err instanceof Error ? err.stack : String(err)}`,
	)
	process.exit(2)
}
