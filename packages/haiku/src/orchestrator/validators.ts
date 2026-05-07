// orchestrator/validators.ts — Workflow-engine validators that run
// at phase transitions and block advancement on violations.
//
// Each validator returns either a concrete OrchestratorAction
// describing the violation (which the workflow handler emits to the
// agent), or null when the check passes.
//
// Concerns covered:
//   - validateStageOutputs               — required outputs exist post-execute
//   - validateDiscoveryArtifacts         — discovery artifacts exist post-elaborate
//   - validateUnitNaming                 — unit-NN-slug.md naming convention
//   - validateUnitInputs                 — every unit declares `inputs:`
//   - validateCumulativeInputCoverage    — every prior-stage output is referenced
//                                          by some current-stage unit's `inputs:`
//                                          OR explicitly acknowledged via
//                                          `haiku_coverage_acknowledge`
//   - validateOutputLiveness             — every code-output declared by any
//                                          unit across all stages is imported /
//                                          referenced by SOME OTHER file in the
//                                          repo (catches orphan components like
//                                          a *.tsx defined but never rendered)
//   - runQualityGates                    — execute the gate commands at unit completion
//   - writeReviewFeedbackFiles           — persist review-UI feedback to feedback files
//   - buildOutputRequirements            — render the output-requirements prompt block

import { execFileSync, execSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { resolvePluginRoot } from "../config.js"
import type { OrchestratorAction } from "../orchestrator.js"
import { resolveStudioFilePath } from "../orchestrator.js"
import {
	findHaikuRoot,
	gitCommitState,
	parseFrontmatter,
	writeFeedbackFile,
} from "../state-tools.js"
import { readStageArtifactDefs } from "../studio-reader.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

// ── Output validation ─────────────────────────────────────────────────────

/** Validate that required stage outputs were created during execution.
 *  Returns an error action if outputs are missing, null if all present. */
export function validateStageOutputs(
	slug: string,
	stage: string,
	studio: string,
): OrchestratorAction | null {
	const pluginRoot = resolvePluginRoot()

	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const outputsDir = join(base, studio, "stages", stage, "outputs")
		if (!existsSync(outputsDir)) continue

		const outputDefs = readdirSync(outputsDir).filter((f) => f.endsWith(".md"))
		const missing: Array<{ name: string; location: string }> = []

		for (const f of outputDefs) {
			const raw = readFileSync(join(outputsDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			// Skip project-tree outputs (code, deployment configs) — can't validate a specific path
			if (location.startsWith("(")) continue

			// Resolve location with intent slug
			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				if (
					!existsSync(absPath) ||
					readdirSync(absPath).filter((e) => e !== ".gitkeep").length === 0
				) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "outputs_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to review: ${missing.length} required output(s) not found.\n${missing.map((m) => `- ${m.name}: expected at ${m.location}`).join("\n")}\n\nThe execution phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break // Project-level outputs dir takes precedence over plugin-level (first match wins)
	}

	return null
}

// ── Review feedback writer helper ────────────────────────────────────────

/** Write feedback files from a review-UI changes_requested result.
 *  Extracts annotation pins, inline comments, and free-form feedback
 *  text into individual feedback files with appropriate origins.
 *  Returns the list of created feedback IDs. */
export function writeReviewFeedbackFiles(
	slug: string,
	stage: string,
	reviewResult: { feedback?: string; annotations?: unknown },
): string[] {
	const createdIds: string[] = []
	const annotations = reviewResult.annotations as
		| {
				pins?: Array<{ x: number; y: number; text: string }>
				comments?: Array<{
					selectedText: string
					comment: string
					paragraph: number
					location?: string
				}>
				screenshot?: string
		  }
		| undefined

	if (annotations?.pins) {
		for (const pin of annotations.pins) {
			if (!pin.text) continue
			const title =
				pin.text.length > 120 ? `${pin.text.slice(0, 117)}...` : pin.text
			const result = writeFeedbackFile(slug, stage, {
				title,
				body: pin.text,
				origin: "user-visual",
				author: "user",
				source_ref: `pin:${pin.x},${pin.y}`,
			})
			createdIds.push(result.feedback_id)
		}
	}

	if (annotations?.comments) {
		for (const comment of annotations.comments) {
			if (!comment.comment) continue
			const title =
				comment.comment.length > 120
					? `${comment.comment.slice(0, 117)}...`
					: comment.comment
			const quoted = comment.selectedText
				? comment.selectedText
						.split("\n")
						.map((l) => `> ${l}`)
						.join("\n")
				: ""
			const locationLine = comment.location
				? `**Location:** \`${comment.location}\` (paragraph ${comment.paragraph})`
				: `**Location:** paragraph ${comment.paragraph}`
			const bodyParts = [locationLine]
			if (quoted) {
				bodyParts.push("", "**Selected text:**", "", quoted)
			}
			bodyParts.push("", "**Comment:**", "", comment.comment)
			const body = bodyParts.join("\n")
			const srcRefBase = comment.location
				? `${comment.location}:paragraph=${comment.paragraph}`
				: `paragraph:${comment.paragraph}`
			const result = writeFeedbackFile(slug, stage, {
				title,
				body,
				origin: "user-visual",
				author: "user",
				source_ref: srcRefBase,
			})
			createdIds.push(result.feedback_id)
		}
	}

	if (reviewResult.feedback?.trim()) {
		const fb = reviewResult.feedback.trim()
		const title = fb.length > 120 ? `${fb.slice(0, 117)}...` : fb
		const result = writeFeedbackFile(slug, stage, {
			title,
			body: fb,
			origin: "user-chat",
			author: "user",
		})
		createdIds.push(result.feedback_id)
	}

	if (createdIds.length > 0) {
		gitCommitState(
			stage
				? `feedback: create ${createdIds.join(", ")} from review UI in ${stage}`
				: `feedback: create ${createdIds.join(", ")} from review UI (intent-scope)`,
		)
	}

	return createdIds
}

// ── Output template injection ────────────────────────────────────────────

/** Build a compact output-requirements block. Lists each output
 *  artifact's name/location/format + a PATH to the full template
 *  (never inlines the template body). Subagent reads the template
 *  file directly if it needs the detail — keeps main-agent AND
 *  subagent contexts small. Returns "" if no output artifacts are
 *  defined. */
export function buildOutputRequirements(
	studio: string,
	stage: string,
	heading = "## Output Requirements",
): string {
	const artifactDefs = readStageArtifactDefs(studio, stage)
	const outputDefs = artifactDefs.filter((d) => d.kind === "output")
	if (outputDefs.length === 0) return ""
	const parts = [
		heading,
		"Full template bodies live at the paths below — read each one you're expected to produce.",
		"",
	]
	for (const od of outputDefs) {
		const templatePath = resolveStudioFilePath(
			join(studio, "stages", stage, "outputs", `${od.name}.md`),
		)
		const pathHint = templatePath ? ` | **Template:** \`${templatePath}\`` : ""
		parts.push(
			`- **${od.name}**${od.required ? " (REQUIRED)" : ""} — location: \`${od.location}\`, format: ${od.format}${pathHint}`,
		)
	}
	return parts.join("\n")
}

// ── Discovery artifact validation ────────────────────────────────────────

/** Validate that required discovery artifacts exist before advancing
 *  from elaborate to execute. Reads discovery definitions from
 *  studios/{studio}/stages/{stage}/discovery/ and checks that each
 *  required artifact exists at its specified location. */
export function validateDiscoveryArtifacts(
	slug: string,
	stage: string,
	studio: string,
): OrchestratorAction | null {
	const pluginRoot = resolvePluginRoot()

	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const discoveryDir = join(base, studio, "stages", stage, "discovery")
		if (!existsSync(discoveryDir)) continue

		const discoveryDefs = readdirSync(discoveryDir).filter((f) =>
			f.endsWith(".md"),
		)
		const missing: Array<{ name: string; location: string }> = []

		for (const f of discoveryDefs) {
			const raw = readFileSync(join(discoveryDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			if (location.startsWith("(")) continue

			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				if (
					!existsSync(absPath) ||
					readdirSync(absPath).filter((e) => e !== ".gitkeep").length === 0
				) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "discovery_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to execution: ${missing.length} required discovery artifact(s) not found.\n${missing.map((m) => `- ${m.name}: expected at ${m.location}`).join("\n")}\n\nThe elaboration phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break
	}

	return null
}

// ── Unit naming validation ──────────────────────────────────────────────

const UNIT_NAMING_PATTERN = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

/** Validate unit file naming convention in a stage. Files MUST match
 *  `unit-NN-slug.md` (e.g., unit-01-data-model.md). */
export function validateUnitNaming(
	intentDirPath: string,
	stage: string,
): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const allFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	if (allFiles.length === 0) return null

	const violations: Array<{ file: string; issue: string }> = []
	const seenNumbers = new Map<number, string>()

	for (const f of allFiles) {
		if (!UNIT_NAMING_PATTERN.test(f)) {
			if (!f.startsWith("unit-")) {
				violations.push({ file: f, issue: "must start with 'unit-'" })
			} else if (!/^unit-\d+/.test(f)) {
				violations.push({
					file: f,
					issue:
						"must have a zero-padded number after 'unit-' (e.g., unit-001-...)",
				})
			} else if (!/^unit-\d{2,}/.test(f)) {
				violations.push({
					file: f,
					issue:
						"number must be zero-padded to at least 2 digits (preferred: 3 digits, e.g. `001`, `002`, …, `999`)",
				})
			} else {
				violations.push({
					file: f,
					issue:
						"slug must be kebab-case (lowercase letters, numbers, hyphens). Expected: unit-NNN-slug.md",
				})
			}
			continue
		}

		const numMatch = f.match(/^unit-(\d+)/)
		if (numMatch) {
			const num = Number.parseInt(numMatch[1], 10)
			if (seenNumbers.has(num)) {
				violations.push({
					file: f,
					issue: `duplicate number ${numMatch[1]} (also used by ${seenNumbers.get(num)})`,
				})
			} else {
				seenNumbers.set(num, f)
			}
		}
	}

	if (violations.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_naming_invalid",
			intent: slug,
			stage,
			violations,
			message: `${violations.length} unit file(s) have invalid naming in stage '${stage}'. Files MUST be named \`unit-NNN-slug.md\` (e.g., \`unit-001-data-model.md\`; legacy 2-digit \`unit-01-…\` still resolves):\n\n${violations.map((v) => `- \`${v.file}\`: ${v.issue}`).join("\n")}\n\nRename the files to match the convention, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Unit inputs validation ───────────────────────────────────────────────

/** Validate that all units in a stage have a non-empty `inputs:`
 *  field. Every unit must declare what upstream artifacts it
 *  references. */
export function validateUnitInputs(
	intentDirPath: string,
	stage: string,
): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const unitFiles = readdirSync(unitsDir).filter((f) => f.endsWith(".md"))
	if (unitFiles.length === 0) return null

	const missing: string[] = []
	for (const f of unitFiles) {
		const fm = readFrontmatter(join(unitsDir, f))
		const status = (fm.status as string) || ""
		if (["complete", "skipped", "failed"].includes(status)) continue
		const inputs = (fm.inputs as string[]) || (fm.refs as string[]) || []
		if (inputs.length === 0) {
			missing.push(f.replace(/\.md$/, ""))
		}
	}

	if (missing.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_inputs_missing",
			intent: slug,
			stage,
			missing_units: missing,
			message: `Cannot advance to execution: ${missing.length} unit(s) have no \`inputs:\` field.\n\nEvery unit MUST declare its inputs — the upstream artifacts, knowledge docs, and prior-stage outputs it references. At minimum, include the intent document and discovery docs.\n\nUnits missing inputs:\n${missing.map((u) => `- ${u}`).join("\n")}\n\nAdd \`inputs:\` to each unit's frontmatter with paths relative to the intent directory (e.g., \`knowledge/DISCOVERY.md\`, \`stages/design/DESIGN-BRIEF.md\`), then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Cumulative input coverage validation ───────────────────────────────────

/** Output dirs whose contents count as a stage's deliverables. The `units/`
 *  directory is excluded because each unit's `outputs:` field is enumerated
 *  separately (and units' own .md files are spec, not deliverable). The
 *  `feedback/` and `state.json` are workflow-engine-internal, not deliverables.
 *  `coverage-decisions.json` is engine-managed and excluded from the cover-it
 *  walk (its presence is the agent's response, not an upstream output). */
const STAGE_OUTPUT_DIRS = [
	"artifacts",
	"outputs",
	"knowledge",
	"discovery",
] as const

interface CoverageDecisionEntry {
	path: string
	decision: "out-of-scope" | "covered-by-unit"
	rationale: string
	unit?: string
	acknowledged_at: string
}

function readCoverageDecisions(stageDir: string): Set<string> {
	const path = join(stageDir, "coverage-decisions.json")
	if (!existsSync(path)) return new Set()
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			decisions?: CoverageDecisionEntry[]
		}
		const acknowledged = new Set<string>()
		for (const entry of parsed.decisions ?? []) {
			if (entry?.path) acknowledged.add(entry.path)
		}
		return acknowledged
	} catch {
		return new Set()
	}
}

function walkStageOutputFiles(stageDir: string, stageRel: string): string[] {
	const collected: string[] = []
	for (const sub of STAGE_OUTPUT_DIRS) {
		const dir = join(stageDir, sub)
		if (!existsSync(dir)) continue
		// Recursive walk — capture every file (md, tsx, json, etc.).
		const stack: string[] = [""]
		while (stack.length > 0) {
			const rel = stack.pop() as string
			const abs = join(dir, rel)
			let entries: string[]
			try {
				entries = readdirSync(abs)
			} catch {
				continue
			}
			for (const name of entries) {
				const childRel = rel ? `${rel}/${name}` : name
				const childAbs = join(abs, name)
				try {
					const stat = statSync(childAbs)
					if (stat.isDirectory()) {
						stack.push(childRel)
					} else if (stat.isFile()) {
						collected.push(`${stageRel}/${sub}/${childRel}`)
					}
				} catch {
					// Skip unreadable entries.
				}
			}
		}
	}
	return collected
}

function collectUnitOutputs(unitsDir: string): string[] {
	if (!existsSync(unitsDir)) return []
	const collected: string[] = []
	for (const f of readdirSync(unitsDir)) {
		if (!f.endsWith(".md")) continue
		const fm = readFrontmatter(join(unitsDir, f))
		const outputs = (fm.outputs as string[]) || []
		for (const o of outputs) {
			if (typeof o === "string" && o.trim() !== "") collected.push(o.trim())
		}
	}
	return collected
}

function collectUnitInputs(unitsDir: string): Set<string> {
	const set = new Set<string>()
	if (!existsSync(unitsDir)) return set
	for (const f of readdirSync(unitsDir)) {
		if (!f.endsWith(".md")) continue
		const fm = readFrontmatter(join(unitsDir, f))
		const inputs = (fm.inputs as string[]) || (fm.refs as string[]) || []
		for (const i of inputs) {
			if (typeof i === "string" && i.trim() !== "") set.add(i.trim())
		}
	}
	return set
}

/** Validate that every output of every prior stage is referenced by at least
 *  one current-stage unit's `inputs:` OR explicitly acknowledged in
 *  `stages/<current>/coverage-decisions.json`.
 *
 *  Why: H·AI·K·U's continuity contract — downstream stages MUST cover
 *  upstream deliverables. Without this check, the elaborate-phase agent can
 *  silently ignore upstream artifacts (e.g., dev stage skips design's SPA
 *  spec, ships components no one renders), and no engine gate notices.
 *
 *  When: pre-tick, in the elaborate handler after `validateUnitInputs` and
 *  before adversarial-spec-review dispatch. The agent has two response
 *  paths per unreferenced file:
 *    (a) call `haiku_unit_set { unit, field: "inputs", value: [...] }` to
 *        add it to a unit's inputs (canonical path), OR
 *    (b) call `haiku_coverage_acknowledge { path, decision: "out-of-scope",
 *        rationale }` to record an explicit dismissal (escape hatch).
 *
 *  Walks: every prior stage's `units/*.md` outputs + every file under
 *  `STAGE_OUTPUT_DIRS` (`artifacts/`, `outputs/`, `knowledge/`,
 *  `discovery/`). Excludes `feedback/`, `state.json`, and
 *  `coverage-decisions.json` (engine-internal).
 *
 *  Returns null when every prior output is covered. Returns a
 *  `coverage_review_required` action listing the unreferenced files
 *  otherwise. */
export function validateCumulativeInputCoverage(
	intentDirPath: string,
	stage: string,
	priorStages: string[],
): OrchestratorAction | null {
	if (priorStages.length === 0) return null

	const currentUnitsDir = join(intentDirPath, "stages", stage, "units")
	const currentInputs = collectUnitInputs(currentUnitsDir)
	const acknowledged = readCoverageDecisions(
		join(intentDirPath, "stages", stage),
	)

	const unreferenced: { path: string; from_stage: string }[] = []
	const seen = new Set<string>()
	for (const prior of priorStages) {
		const priorStageDir = join(intentDirPath, "stages", prior)
		if (!existsSync(priorStageDir)) continue
		const stageRel = `stages/${prior}`

		// (a) outputs declared in prior units' frontmatter
		const declaredOutputs = collectUnitOutputs(join(priorStageDir, "units"))
		// (b) files actually present under STAGE_OUTPUT_DIRS
		const filesystemOutputs = walkStageOutputFiles(priorStageDir, stageRel)

		for (const path of [...declaredOutputs, ...filesystemOutputs]) {
			if (seen.has(path)) continue
			seen.add(path)
			if (currentInputs.has(path)) continue
			if (acknowledged.has(path)) continue
			unreferenced.push({ path, from_stage: prior })
		}
	}

	if (unreferenced.length === 0) return null

	const slug = intentDirPath.split("/intents/")[1] || ""
	return {
		action: "coverage_review_required",
		intent: slug,
		stage,
		unreferenced,
		message: `Cannot advance past elaborate: ${unreferenced.length} prior-stage output(s) are not referenced by any unit's \`inputs:\` in stage '${stage}' AND have no entry in \`stages/${stage}/coverage-decisions.json\`. Continuity contract: downstream stages must cover upstream deliverables.\n\nFor each unreferenced file, EITHER:\n  (a) Call \`haiku_unit_set { intent: "${slug}", stage: "${stage}", unit: "<unit>", field: "inputs", value: [...existing, "<path>"] }\` to add it to a unit's inputs (the canonical path).\n  (b) Call \`haiku_coverage_acknowledge { intent_slug: "${slug}", stage: "${stage}", path: "<path>", decision: "out-of-scope", rationale: "<why this file is not relevant to this stage>" }\` to record an explicit dismissal.\n\nUnreferenced files:\n${unreferenced.map((u) => `- \`${u.path}\` (from stage '${u.from_stage}')`).join("\n")}\n\nAfter resolving each, call \`haiku_run_next { intent: "${slug}" }\` to re-run the validator.`,
	}
}

// ── Output liveness validation ─────────────────────────────────────────────

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i
const TEST_FILE_RE = /\.(test|spec)\.[a-z]+$|\/__tests__\/|\/test\//i

function isCodeOutput(path: string): boolean {
	if (!CODE_FILE_RE.test(path)) return false
	if (TEST_FILE_RE.test(path)) return false
	return true
}

/** Stem of a file path = basename without extension(s). For
 *  `packages/haiku-ui/src/atoms/DriftBanner.tsx` → `DriftBanner`.
 *  For files with multiple dots (e.g., `foo.module.css`), only the
 *  outermost extension is stripped. The stem is used as a token for
 *  "is this referenced anywhere" greps — works for both
 *  `import { DriftBanner } from "./DriftBanner"` and JSX `<DriftBanner />`. */
function pathStem(path: string): string {
	const base = path.replace(/^.*\//, "")
	const dot = base.lastIndexOf(".")
	return dot > 0 ? base.slice(0, dot) : base
}

/** Find files (other than `selfPath`) that mention `stem` as a word
 *  token. Uses `git grep` for speed and `.gitignore` awareness;
 *  falls back to no-importers on error. The stem-as-token check
 *  catches both `import { Stem } from "./Stem"` and JSX `<Stem />`
 *  and identifier references in plain TS. False-positive risk is
 *  low (stems are usually distinctive component / module names). */
/** Exclude paths that mention an output's stem only because they are
 *  the workflow-engine's own metadata / spec — not a real referencer.
 *  Unit spec .md files contain the output path in their `outputs:`
 *  frontmatter, which would false-positive as "this output is wired
 *  in." Drift baselines, action logs, write-audit logs, and
 *  coverage-decisions.json all similarly mention paths without
 *  representing actual code-level references. */
function isWorkflowMetaPath(path: string): boolean {
	return path.startsWith(".haiku/")
}

function findReferencers(
	repoRoot: string,
	stem: string,
	selfPath: string,
): string[] {
	if (stem === "" || stem.length < 2) return []
	// `git grep -lw <stem>` matches `stem` as a complete word in any
	// tracked file. -w is preferred over a manual `\b` regex because
	// word-boundary regex semantics differ across git versions / regex
	// engines (BRE vs ERE vs PCRE) — -w is portable. execFileSync over
	// execSync to avoid shell quoting variability.
	try {
		const out = execFileSync("git", ["grep", "-lw", "--", stem], {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		})
		return out
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l !== "" && l !== selfPath && !isWorkflowMetaPath(l))
	} catch {
		// git grep returns non-zero exit when there are no matches; treat as
		// no-referencers.
		return []
	}
}

interface OutputLivenessOrphan {
	path: string
	from_stage: string
	from_unit: string
}

/** Walk every unit's `outputs:` across all stages of the intent.
 *  For each code-file output (not test, not non-code), check whether
 *  ANY OTHER file in the repo references its basename stem as a token.
 *  Files with no referencers are flagged as orphans — they shipped
 *  but no caller / renderer / importer wired them in. Coverage
 *  acknowledgments in any stage's `coverage-decisions.json` (with
 *  `decision: "out-of-scope"`) suppress the flag for that path.
 *
 *  Why: catches the "defined but never rendered" failure mode that
 *  the cumulative-input-coverage gate doesn't see. A unit can declare
 *  `outputs: [DriftBanner.tsx]` and ship the file with passing tests,
 *  but if no other component does `<DriftBanner />`, the user never
 *  sees it. The validator runs at intent-completion (before the
 *  studio-level review dispatch) so reviewers see the orphan list
 *  and the agent's acknowledgments before signing off.
 *
 *  Returns null when every code output has at least one referencer
 *  (or is acknowledged). Returns `output_liveness_review_required`
 *  with the orphan list otherwise. */
export function validateOutputLiveness(
	intentDirPath: string,
	stages: string[],
	repoRoot: string,
): OrchestratorAction | null {
	if (stages.length === 0) return null

	// Collect every code-file output across all stages.
	const codeOutputs: OutputLivenessOrphan[] = []
	const seen = new Set<string>()
	for (const stage of stages) {
		const unitsDir = join(intentDirPath, "stages", stage, "units")
		if (!existsSync(unitsDir)) continue
		for (const f of readdirSync(unitsDir)) {
			if (!f.endsWith(".md")) continue
			const fm = readFrontmatter(join(unitsDir, f))
			const outputs = (fm.outputs as string[]) || []
			for (const out of outputs) {
				if (typeof out !== "string" || !isCodeOutput(out)) continue
				if (seen.has(out)) continue
				seen.add(out)
				codeOutputs.push({
					path: out,
					from_stage: stage,
					from_unit: f.replace(/\.md$/, ""),
				})
			}
		}
	}

	if (codeOutputs.length === 0) return null

	// Aggregate acknowledged paths from EVERY stage's coverage-decisions.json
	// (an orphan ack might live in any stage's file — typically the stage
	// that produced the output, but a downstream stage can also justify
	// "I'm intentionally leaving X unwired").
	const acknowledged = new Set<string>()
	for (const stage of stages) {
		const stageAcks = readCoverageDecisions(
			join(intentDirPath, "stages", stage),
		)
		for (const path of stageAcks) acknowledged.add(path)
	}

	const orphans: OutputLivenessOrphan[] = []
	for (const out of codeOutputs) {
		if (acknowledged.has(out.path)) continue
		const stem = pathStem(out.path)
		const referencers = findReferencers(repoRoot, stem, out.path)
		if (referencers.length === 0) orphans.push(out)
	}

	if (orphans.length === 0) return null

	const slug = intentDirPath.split("/intents/")[1] || ""
	return {
		action: "output_liveness_review_required",
		intent: slug,
		orphans,
		message: `Cannot advance to intent-completion review: ${orphans.length} code-output(s) shipped by units across this intent's stages have NO referencers anywhere in the repo. The continuity contract requires every code deliverable to be imported, rendered, or otherwise wired in by some other file. Files defined but never rendered are invisible to the user — the methodology promise breaks.\n\nFor each orphan, EITHER:\n  (a) Author a unit (or extend an existing unit) that integrates the output — typically importing the component into a parent screen, registering a route, or calling the function from a reachable code path. The integration code's diff lands as a new commit on the intent main branch.\n  (b) Call \`haiku_coverage_acknowledge { intent_slug: "${slug}", stage: "<stage-that-produced-it>", path: "<orphan-path>", decision: "out-of-scope", rationale: "<why this is intentionally unwired — e.g., 'reserved for stage-N future use'>" }\` to record an explicit acknowledgment.\n\nOrphan outputs:\n${orphans.map((o) => `- \`${o.path}\` (declared by ${o.from_unit} in stage '${o.from_stage}')`).join("\n")}\n\nAfter resolving each, call \`haiku_run_next { intent: "${slug}" }\` to re-run the validator.`,
	}
}

// ── Quality gate runner ───────────────────────────────────────────────────

interface QualityGateResult {
	name: string
	command: string
	dir: string
	exit_code: number
	output: string
}

/** Read quality_gates from intent.md and all unit files in a stage,
 *  execute each gate command, and return failures. */
export function runQualityGates(
	slug: string,
	stage: string,
): QualityGateResult[] {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	let repoRoot: string
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", {
			encoding: "utf8",
		}).trim()
	} catch {
		repoRoot = process.cwd()
	}

	function parseGates(
		filePath: string,
	): Array<{ name: string; command: string; dir: string }> {
		const data = readFrontmatter(filePath)
		const raw = Array.isArray(data.quality_gates) ? data.quality_gates : []
		return raw
			.filter(
				(g: Record<string, unknown>): g is Record<string, string> =>
					!!g?.command,
			)
			.map((g: Record<string, string>) => ({
				name: g.name ?? "",
				command: g.command,
				dir: g.dir ?? "",
			}))
	}

	const allGates = parseGates(intentFile)
	const unitsDir = join(iDir, "stages", stage, "units")
	if (existsSync(unitsDir)) {
		for (const f of readdirSync(unitsDir).filter(
			(f) => f.startsWith("unit-") && f.endsWith(".md"),
		)) {
			allGates.push(...parseGates(join(unitsDir, f)))
		}
	}

	const seen = new Set<string>()
	const uniqueGates = allGates.filter((g) => {
		const key = `${g.command}::${g.dir}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})

	// Execute each gate. Timeout default 120s; override via
	// HAIKU_QUALITY_GATE_TIMEOUT_MS. 500-char output truncation.
	const gateTimeoutMs = (() => {
		const raw = process.env.HAIKU_QUALITY_GATE_TIMEOUT_MS
		const parsed = raw ? Number.parseInt(raw, 10) : NaN
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000
	})()
	const failures: QualityGateResult[] = []
	for (let i = 0; i < uniqueGates.length; i++) {
		const gate = uniqueGates[i]
		const cwd = gate.dir ? resolve(repoRoot, gate.dir) : repoRoot
		let output = ""
		let exitCode = 0

		try {
			output = execSync(gate.command, {
				cwd,
				encoding: "utf8",
				timeout: gateTimeoutMs,
				stdio: ["pipe", "pipe", "pipe"],
			})
		} catch (err: unknown) {
			const execErr = err as {
				status?: number
				stdout?: string
				stderr?: string
				signal?: string
			}
			exitCode = execErr.status ?? 1
			const timedOut = execErr.signal === "SIGTERM"
			const rawOut = (execErr.stdout ?? "") + (execErr.stderr ?? "")
			const prefix = timedOut
				? `[timeout after ${gateTimeoutMs}ms — command killed with SIGTERM]\n`
				: ""
			output = (prefix + rawOut).slice(0, 500)
		}

		if (exitCode !== 0) {
			failures.push({
				name: gate.name || `gate-${i}`,
				command: gate.command,
				dir: gate.dir,
				exit_code: exitCode,
				output,
			})
		}
	}

	return failures
}
