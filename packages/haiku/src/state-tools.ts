// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execFileSync, execSync, spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
	appendFileSync,
	type Dirent,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import {
	dedupeFrontmatterKeys,
	isDuplicateKeyError,
} from "@haiku/shared/frontmatter"
import { Ajv } from "ajv"
import matter from "gray-matter"
import { features, resolvePluginRoot } from "./config.js"
import { sanitizeFeedbackBody } from "./state/sanitize-feedback.js"

// V-04 (Symlink TOCTOU): `haiku_human_write` (registered via this module's
// MCP tool table) performs atomic file writes inside intent dirs through the
// `safeMkdirAndRename` helper in `./state/safe-write.ts`. The helper walks
// the parent chain segment-by-segment with `lstatSync` (refusing pre-existing
// symlinks) and re-validates `realpath(parent)` immediately before the
// rename, closing the legacy `mkdirSync(recursive: true)` follow-symlink
// trap. Re-exported here so consumers of the MCP tool surface (and the
// quality-gate static-analysis grep) can locate the V-04 chokepoint from
// the same module that registers the human-write tool.
export { safeMkdirAndRename } from "./state/safe-write.js"

// workflow-fields module retained for state-integrity sealing; no direct imports
// needed here since the completion-only guard is narrow to status/completed.
import {
	addTempWorktree,
	commitAndPushFromWorktree,
	consolidateStageBranches,
	ensureOnStageBranch,
	fetchOrigin,
	getCurrentBranch,
	getMainlineBranch,
	isBranchMerged,
	listIntentBranches,
	listOrphanDiscreteIntents,
	mergeUnitWorktree,
	openPullRequest,
	readFileFromBranch,
	removeTempWorktree,
} from "./git-worktree.js"
import { withStageLock } from "./locks.js"
import { escalate } from "./model-selection.js"
import { clearMarkersForFeedbackSync } from "./orchestrator/workflow/baseline-clear-marker.js"
import { deriveStageState } from "./orchestrator/workflow/derived-stage-state.js"
import { reportError } from "./sentry.js"
import { logSessionEvent, writeHaikuMetadata } from "./session-metadata.js"
import { sealIntentState } from "./state-integrity.js"
import {
	listStudios,
	readOperationDefs,
	readReflectionDefs,
	readStageArtifactDefs,
	readStageDef,
	readStudioFixHatPaths,
	resolveStudio,
} from "./studio-reader.js"
import { nextRelayPath, setSessionId } from "./subagent-prompt-file.js"
import { emitTelemetry } from "./telemetry.js"
import { getPluginVersion, MCP_VERSION } from "./version.js"

// ── Drift-assessment rationale caps (VULN-REPORT V-09) ────────────────────
//
// V-09: unbounded `agent_rationale` and per-classification `rationale_excerpt`
// writes bloat `stages/{stage}/drift-assessments/DA-NN.json`. The
// assessments-list HTTP endpoint reads every record back unsummarized so a
// 1 MB rationale on each of N assessments produces an N-MB JSON response —
// trivially exhausts the SPA's parse budget and pegs the Fastify worker
// while serialising. Worse, the agent has no incentive to keep these short.
//
// Two fixes:
//   1. Reject oversize rationales at schema-validation time — before the
//      DA-NN.json file is ever written. `agent_rationale` cap = 10 KB
//      (10 * 1024 bytes), per-classification `rationale_excerpt` cap =
//      1 KB (1024 bytes). Returned as structured `agent_rationale_too_long`
//      / `rationale_excerpt_too_long` errors so the agent can shrink and
//      retry without consuming a bolt.
//   2. (Companion fix in `assessments-routes.ts`) — list endpoint truncates
//      both fields to a 256-char preview; full text is only returned by the
//      per-id detail endpoint.
//
// Sizing rationale: assessment rationales are intent-scoped justifications
// — 10 KB (~1500–2000 words) is comfortably enough for the most complex
// "why I classified these 60 findings this way" prose; per-finding excerpts
// are SPA list-row labels — 1 KB (~150 words) is the upper limit before
// the row stops being a row and starts being a paragraph.
export const MAX_RATIONALE_BYTES = 10 * 1024 // 10 KB — agent_rationale top-level cap
export const MAX_RATIONALE_EXCERPT_BYTES = 1024 // 1 KB — per-classification rationale_excerpt cap

/** Byte length of a UTF-8 string. JS string `.length` counts UTF-16 code
 *  units, not bytes — multi-byte characters undercount. The caps are
 *  byte-based because that's the disk size we actually pay for. */
function utf8ByteLength(s: string): number {
	return Buffer.byteLength(s, "utf-8")
}

/** Validation outcome for the V-09 rationale caps. The classify-drift
 *  tool calls `validateRationaleCaps` BEFORE writing DA-NN.json; on any
 *  violation the structured error returns to the agent so it can shrink
 *  the rationale and retry without consuming a bolt. */
export type RationaleCapViolation =
	| { kind: "agent_rationale_too_long"; bytes: number; cap: number }
	| {
			kind: "rationale_excerpt_too_long"
			index: number
			path: string
			bytes: number
			cap: number
	  }

/** Per-classification subset used by the rationale cap check. The full
 *  Classification type carries more fields but only `path` and
 *  `rationale_excerpt` matter for the V-09 byte-length validation. */
export interface RationaleCapClassification {
	path: string
	rationale_excerpt: string
}

/**
 * V-09 rationale cap validator. Returns null when both `agent_rationale`
 * and every classification's `rationale_excerpt` are within their byte
 * caps; returns the first violation encountered otherwise.
 *
 * Order is deterministic: `agent_rationale` is checked first; classifications
 * are checked in array order. The agent should fix the surfaced violation
 * and retry — subsequent calls will surface the next violation if any.
 */
export function validateRationaleCaps(args: {
	agent_rationale: string
	classifications: ReadonlyArray<RationaleCapClassification>
}): RationaleCapViolation | null {
	const agentBytes = utf8ByteLength(args.agent_rationale)
	if (agentBytes > MAX_RATIONALE_BYTES) {
		return {
			kind: "agent_rationale_too_long",
			bytes: agentBytes,
			cap: MAX_RATIONALE_BYTES,
		}
	}
	for (let i = 0; i < args.classifications.length; i++) {
		const c = args.classifications[i]
		const excerptBytes = utf8ByteLength(c.rationale_excerpt ?? "")
		if (excerptBytes > MAX_RATIONALE_EXCERPT_BYTES) {
			return {
				kind: "rationale_excerpt_too_long",
				index: i,
				path: c.path,
				bytes: excerptBytes,
				cap: MAX_RATIONALE_EXCERPT_BYTES,
			}
		}
	}
	return null
}

// ── Intent title derivation ────────────────────────────────────────────────

/** Maximum length for an intent title. Anything longer is treated as a
 *  description that needs summarizing. */
export const INTENT_TITLE_MAX_LENGTH = 80

/** Whether a title value needs repair (too long, multiline, or empty). */
export function intentTitleNeedsRepair(title: unknown): boolean {
	if (typeof title !== "string") return true
	const trimmed = title.trim()
	if (trimmed.length === 0) return true
	if (trimmed.length > INTENT_TITLE_MAX_LENGTH) return true
	if (/\n/.test(trimmed)) return true
	return false
}

// ── Auto-fix application for repair ────────────────────────────────────────

interface RepairIssue {
	intent: string
	field: string
	severity: "error" | "warning"
	message: string
	fix: string
}

interface AppliedFix {
	intent: string
	field: string
	description: string
}

/** Apply mechanical, judgment-free fixes to an intent's intent.md.
 *  Currently handles: overlong/multiline title, legacy `created` rename,
 *  missing `created_at`, missing `mode`, stages mismatch with studio,
 *  legacy `studio: software` alias migration to `application-development`.
 *  Returns the fixes applied and any issues that still need attention. */
export function applyAutoFixes(
	intentRoot: string,
	slug: string,
	issues: RepairIssue[],
): { applied: AppliedFix[]; remaining: RepairIssue[] } {
	const intentPath = join(intentRoot, slug, "intent.md")
	if (!existsSync(intentPath)) return { applied: [], remaining: issues }

	const applied: AppliedFix[] = []

	// Pre-pass: any file with duplicate top-level frontmatter keys gets rewritten
	// with deduped frontmatter (last-wins semantics via js-yaml `json: true`).
	// Must run before we try to parse intent.md/unit.md normally below, because
	// the default gray-matter/js-yaml parser throws on duplicate keys.
	const dedupeTargets: string[] = [intentPath]
	const stagesDirForDedupe = join(intentRoot, slug, "stages")
	if (existsSync(stagesDirForDedupe)) {
		for (const stageEntry of readdirSync(stagesDirForDedupe, {
			withFileTypes: true,
		})) {
			if (!stageEntry.isDirectory()) continue
			const unitsDir = join(stagesDirForDedupe, stageEntry.name, "units")
			if (!existsSync(unitsDir)) continue
			for (const f of readdirSync(unitsDir, { withFileTypes: true })) {
				if (f.isFile() && f.name.endsWith(".md")) {
					dedupeTargets.push(join(unitsDir, f.name))
				}
			}
		}
	}
	for (const targetPath of dedupeTargets) {
		const raw = readFileSync(targetPath, "utf8")
		const { text: rewritten, removed } = dedupeFrontmatterKeys(raw)
		if (removed.length === 0) continue
		writeFileSync(targetPath, rewritten)
		const rel = targetPath.startsWith(join(intentRoot, slug))
			? targetPath.slice(join(intentRoot, slug).length + 1)
			: targetPath
		applied.push({
			intent: slug,
			field: `${rel}:frontmatter`,
			description: `Deduped frontmatter keys: ${removed.join(", ")}`,
		})
	}
	// Issues flagged for duplicate keys are resolved by the rewrite above;
	// drop them from the work list so they don't end up in `remaining`.
	const issuesAfterDedupe = issues.filter(
		(i) => !i.field.endsWith(":frontmatter-duplicate-keys"),
	)

	// Read after the dedupe pre-pass so matter() doesn't choke on duplicate keys.
	const raw = readFileSync(intentPath, "utf8")
	const parsed = matter(raw)
	const data = parsed.data
	const body = parsed.content
	let changed = false
	const remaining: RepairIssue[] = []

	for (const issue of issuesAfterDedupe) {
		let fixedHere = false

		// Title: overlong, multiline, or otherwise non-conforming.
		// We do NOT auto-truncate — mechanical truncation produces mid-sentence
		// fragments that aren't real titles. Instead we flag it for agent rewrite
		// with instructions to produce a crisp 3–8 word summary. The full
		// original is preserved as-is so the agent has it to work from.
		if (
			issue.field === "title" &&
			typeof data.title === "string" &&
			intentTitleNeedsRepair(data.title)
		) {
			const oldTitle = (data.title as string).replace(/\s+/g, " ").trim()
			const preview =
				oldTitle.length > 120 ? `${oldTitle.slice(0, 117)}...` : oldTitle
			remaining.push({
				intent: slug,
				field: "title",
				severity: "error",
				message: `Title is ${oldTitle.length} chars — looks auto-truncated or is a full description, not a title`,
				fix: `Rewrite as a crisp 3–8 word summary (≤80 chars, single line, no trailing period). Preserve the current text as a paragraph in the body under the H1 if it isn't there already. Original: "${preview}"`,
			})
			// Not "fixed" here — the rewritten issue was already pushed to `remaining` above.
			// This flag just suppresses the end-of-loop fallthrough that would re-push the
			// original (unmodified) issue. All other branches in this loop genuinely fix things.
			fixedHere = true
		}

		// Legacy `created` field → `created_at`
		if (issue.field === "created" && data.created && !data.created_at) {
			data.created_at = data.created
			// gray-matter YAML serializer crashes on undefined values (#194),
			// so we must `delete` rather than assign `undefined`.
			delete data.created
			applied.push({
				intent: slug,
				field: "created",
				description: "Renamed legacy `created` to `created_at`",
			})
			fixedHere = true
			changed = true
		}

		// Missing `created_at`: use file mtime as the best-effort fallback
		if (issue.field === "created_at" && !data.created && !data.created_at) {
			const stat = statSyncSafe(intentPath)
			data.created_at = stat
				? stat.mtime.toISOString()
				: new Date().toISOString()
			applied.push({
				intent: slug,
				field: "created_at",
				description: "Added `created_at` from file mtime",
			})
			fixedHere = true
			changed = true
		}

		// Missing `mode`: default to continuous
		if (issue.field === "mode" && !data.mode) {
			data.mode = "continuous"
			applied.push({
				intent: slug,
				field: "mode",
				description: "Defaulted `mode` to 'continuous'",
			})
			fixedHere = true
			changed = true
		}

		// Stages mismatch — apply the expected stages from the studio
		if (
			issue.field === "stages" &&
			issue.message.startsWith("Stages don't match")
		) {
			const expectedMatch = issue.fix.match(/Expected: \[([^\]]+)\]/)
			if (expectedMatch) {
				const expected = expectedMatch[1]
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
				if (expected.length > 0) {
					data.stages = expected
					applied.push({
						intent: slug,
						field: "stages",
						description: `Updated stages to match studio definition: [${expected.join(", ")}]`,
					})
					fixedHere = true
					changed = true
				}
			}
		}

		// Git-based date repair: created_at, started_at, completed_at
		if (issue.field === "created_at" && issue.message.includes("git history")) {
			const dateMatch = issue.fix.match(/'([^']+)' \(from git/)
			if (dateMatch) {
				data.created_at = dateMatch[1]
				applied.push({
					intent: slug,
					field: "created_at",
					description: `Updated created_at to '${dateMatch[1]}' from git history`,
				})
				fixedHere = true
				changed = true
			}
		}

		if (issue.field === "started_at" && issue.fix.includes("from git")) {
			const dateMatch = issue.fix.match(/'([^']+)' \(from git/)
			if (dateMatch) {
				data.started_at = dateMatch[1]
				applied.push({
					intent: slug,
					field: "started_at",
					description: `Updated started_at to '${dateMatch[1]}' from git history`,
				})
				fixedHere = true
				changed = true
			}
		}

		if (issue.field === "completed_at" && issue.fix.includes("from git")) {
			const dateMatch = issue.fix.match(/'([^']+)' \(from git/)
			if (dateMatch) {
				data.completed_at = dateMatch[1]
				applied.push({
					intent: slug,
					field: "completed_at",
					description: `Updated completed_at to '${dateMatch[1]}' from git history`,
				})
				fixedHere = true
				changed = true
			}
		}

		if (!fixedHere) remaining.push(issue)
	}

	// Note: no studio alias migration here. Intents store the directory name
	// as the stable identifier (see orchestrator.ts haiku_select_studio). The
	// `software/` directory is intentionally preserved so legacy intents with
	// `studio: software` continue to resolve via `resolveStudio` without any
	// write to their frontmatter. Migrating to `application-development` would
	// be a no-op since both forms resolve to the same studio.

	if (changed) {
		writeFileSync(intentPath, matter.stringify(body, data))
	}

	// Strip deprecated `type` field from all unit files
	const stagesDir = join(intentRoot, slug, "stages")
	if (existsSync(stagesDir)) {
		for (const stageEntry of readdirSync(stagesDir, { withFileTypes: true })) {
			if (!stageEntry.isDirectory()) continue
			const unitsDir = join(stagesDir, stageEntry.name, "units")
			if (!existsSync(unitsDir)) continue
			for (const unitEntry of readdirSync(unitsDir, { withFileTypes: true })) {
				if (!(unitEntry.isFile() && unitEntry.name.endsWith(".md"))) continue
				const unitPath = join(unitsDir, unitEntry.name)
				const unitRaw = readFileSync(unitPath, "utf8")
				const unitParsed = matter(unitRaw)
				if ("type" in unitParsed.data) {
					const { type: _removed, ...rest } = unitParsed.data
					writeFileSync(unitPath, matter.stringify(unitParsed.content, rest))
					applied.push({
						intent: slug,
						field: `stages/${stageEntry.name}/units/${unitEntry.name}:type`,
						description: "Removed deprecated `type` field from unit",
					})
				}
			}
		}
	}

	// Second pass: auto-apply unit `inputs:` from the fix instructions.
	// The scanner has already resolved upstream artifact paths per stage; we
	// just write them into each unit's frontmatter. For first-stage units with
	// no upstream (the "intent doc and discovery docs" fallback), we link the
	// intent.md and any existing knowledge/*.md as a sensible default.
	const inputsRemaining: RepairIssue[] = []
	const unitInputsRe = /^stages\/([^/]+)\/units\/([^/]+):inputs$/
	for (const issue of remaining) {
		const m = issue.field.match(unitInputsRe)
		if (
			!(m && issue.message.includes("Unit has no `inputs:`")) ||
			typeof issue.fix !== "string"
		) {
			inputsRemaining.push(issue)
			continue
		}
		const stageName = m[1]
		const unitFile = m[2]
		const unitPath = join(
			intentRoot,
			slug,
			"stages",
			stageName,
			"units",
			unitFile,
		)
		if (!existsSync(unitPath)) {
			inputsRemaining.push(issue)
			continue
		}

		// Resolve the inputs to write
		let inputsToWrite: string[] = []
		const upstreamMatch = issue.fix.match(/upstream paths:\s*(.+?)\s*$/)
		if (upstreamMatch) {
			inputsToWrite = upstreamMatch[1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		} else {
			// Fallback: link intent.md and any discoverable knowledge/*.md
			const fallback: string[] = ["intent.md"]
			const knowledgeDir = join(intentRoot, slug, "knowledge")
			if (existsSync(knowledgeDir)) {
				for (const f of readdirSync(knowledgeDir)) {
					if (f.endsWith(".md")) fallback.push(`knowledge/${f}`)
				}
			}
			inputsToWrite = fallback
		}

		if (inputsToWrite.length === 0) {
			inputsRemaining.push(issue)
			continue
		}

		const unitRaw = readFileSync(unitPath, "utf8")
		const unitParsed = matter(unitRaw)
		const existing = (unitParsed.data.inputs as string[]) || []
		if (existing.length > 0) {
			// Already has inputs (race or stale issue list) — drop the issue
			continue
		}
		unitParsed.data.inputs = inputsToWrite
		writeFileSync(
			unitPath,
			matter.stringify(unitParsed.content, unitParsed.data),
		)
		applied.push({
			intent: slug,
			field: issue.field,
			description: `Linked ${inputsToWrite.length} input(s): ${inputsToWrite.join(", ")}`,
		})
	}

	// Third pass — REMOVED (was v3-only).
	//
	// Previously synthesized a v3-shape `state.json` (with `status`,
	// `phase`, `gate_entered_at`, `gate_outcome` fields) for any stage
	// flagged as "before active_stage" by pass `l` above. Both ends
	// gone now: pass `l` no longer flags these stages (active_stage is
	// dropped on migration), and writing a v3-shape state.json into a
	// v4 intent would pollute the file with stale-shape fields the v4
	// engine doesn't read. v4 state.json is engine-managed (decision
	// log + iterations) and gets created on first decision/iteration
	// call — never synthesized as a "I declare this stage done"
	// receipt.

	return { applied, remaining: inputsRemaining }
}

function statSyncSafe(path: string): { mtime: Date } | null {
	try {
		return statSync(path)
	} catch {
		return null
	}
}

/** Get the first (oldest) commit date for a file from git history.
 *  `gitCwd` allows running git from a worktree path. */
function gitFirstCommitDateForRepair(
	filePath: string,
	gitCwd?: string,
): string | null {
	if (!isGitRepo()) return null
	try {
		const result = execFileSync(
			"git",
			["log", "--diff-filter=A", "--follow", "--format=%aI", "--", filePath],
			{
				encoding: "utf8",
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
				...(gitCwd ? { cwd: gitCwd } : {}),
			},
		).trim()
		// Take the last line (oldest commit)
		const lines = result.split("\n").filter(Boolean)
		return lines.length > 0 ? lines[lines.length - 1] : null
	} catch {
		return null
	}
}

/** Get the most recent commit date for a file/directory from git history.
 *  `gitCwd` allows running git from a worktree path. */
function gitLastCommitDateForRepair(
	filePath: string,
	gitCwd?: string,
): string | null {
	if (!isGitRepo()) return null
	try {
		const result = execFileSync(
			"git",
			["log", "-1", "--format=%aI", "--", filePath],
			{
				encoding: "utf8",
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
				...(gitCwd ? { cwd: gitCwd } : {}),
			},
		).trim()
		return result || null
	} catch {
		return null
	}
}

// ── Repair scanning ─────────────────────────────────────────────────────────

const REPAIR_UNIT_PATTERN = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

/** Build a map of available studios → their stages, scanning project + plugin paths. */
function buildStudioMap(root: string): {
	studioMap: Map<string, string[]>
	searchPaths: string[]
} {
	const studioMap = new Map<string, string[]>()
	const pluginRoot = resolvePluginRoot()
	const searchPaths = [join(root, "studios"), join(pluginRoot, "studios")]
	for (const base of searchPaths) {
		if (!existsSync(base)) continue
		for (const d of readdirSync(base, { withFileTypes: true })) {
			if (!d.isDirectory() || studioMap.has(d.name)) continue
			const studioMd = join(base, d.name, "STUDIO.md")
			if (!existsSync(studioMd)) continue
			const { data: stData } = parseFrontmatter(readFileSync(studioMd, "utf8"))
			const stStages = Array.isArray(stData.stages)
				? (stData.stages as string[])
				: []
			studioMap.set(d.name, stStages)
		}
	}
	return { studioMap, searchPaths }
}

/** Scan one intent for repair issues. Pure function — no mutation. */
function scanOneIntent(
	intentsDir: string,
	slug: string,
	studioMap: Map<string, string[]>,
	searchPaths: string[],
): RepairIssue[] {
	const intentPath = join(intentsDir, slug, "intent.md")
	if (!existsSync(intentPath)) return []
	const raw = readFileSync(intentPath, "utf8")
	const { data: repairData } = parseFrontmatter(raw)
	const issues: RepairIssue[] = []

	// a0. Duplicate frontmatter keys (YAML parses leniently but the file is
	// malformed — auto-fix rewrites with last-wins semantics).
	const { removed: intentDupes } = dedupeFrontmatterKeys(raw)
	if (intentDupes.length > 0) {
		issues.push({
			intent: slug,
			field: "intent.md:frontmatter-duplicate-keys",
			severity: "warning",
			message: `Duplicate frontmatter keys: ${intentDupes.join(", ")}`,
			fix: "Rewrite frontmatter with duplicate keys removed (last value wins)",
		})
	}

	// a. Missing, overlong, or multiline title
	if (
		!repairData.title ||
		(typeof repairData.title === "string" && repairData.title.trim() === "")
	) {
		issues.push({
			intent: slug,
			field: "title",
			severity: "error",
			message: "Missing title field",
			fix: "Add `title` field with a short one-line name (≤80 chars)",
		})
	} else if (
		typeof repairData.title === "string" &&
		intentTitleNeedsRepair(repairData.title)
	) {
		const current = repairData.title as string
		const reason = /\n/.test(current)
			? "title contains newlines"
			: `title is ${current.length} chars (max ${INTENT_TITLE_MAX_LENGTH})`
		issues.push({
			intent: slug,
			field: "title",
			severity: "error",
			message: `Title should be a short one-liner — ${reason}`,
			fix: "Rewrite `title` as a crisp 3–8 word summary (≤80 chars, single line, no trailing period). Do NOT truncate the current value — write a deliberate human-readable summary. Preserve the original text as a paragraph in the body under the H1 if it isn't there already.",
		})
	}

	// b. Missing studio
	if (!repairData.studio) {
		issues.push({
			intent: slug,
			field: "studio",
			severity: "error",
			message: "Missing studio field",
			fix: "Set `studio` to an available studio",
		})
	}

	// c. Invalid studio (allow legacy aliases via resolveStudio)
	const repairStudio = repairData.studio as string | undefined
	if (repairStudio && !studioMap.has(repairStudio)) {
		const resolved = resolveStudio(repairStudio)
		if (!resolved) {
			const available = Array.from(studioMap.keys()).join(", ")
			issues.push({
				intent: slug,
				field: "studio",
				severity: "error",
				message: `Studio '${repairStudio}' not found`,
				fix: `Studio '${repairStudio}' not found. Available: ${available}`,
			})
		}
	}

	// d. Missing stages
	const repairStages = repairData.stages
	if (!Array.isArray(repairStages) || repairStages.length === 0) {
		if (repairStudio && studioMap.has(repairStudio)) {
			const expected = studioMap.get(repairStudio)?.join(", ")
			issues.push({
				intent: slug,
				field: "stages",
				severity: "error",
				message: "Missing or empty stages array",
				fix: `Set \`stages\` to match studio definition: [${expected}]`,
			})
		} else {
			issues.push({
				intent: slug,
				field: "stages",
				severity: "error",
				message: "Missing or empty stages array",
				fix: "Set `stages` to match studio definition",
			})
		}
	}

	// e. Stages mismatch
	if (Array.isArray(repairStages) && repairStages.length > 0 && repairStudio) {
		const expected = studioMap.get(repairStudio)
		if (expected) {
			const actual = repairStages as string[]
			if (JSON.stringify(expected) !== JSON.stringify(actual)) {
				issues.push({
					intent: slug,
					field: "stages",
					severity: "warning",
					message: "Stages don't match studio definition",
					fix: `Stages don't match studio definition. Expected: [${expected.join(", ")}], got: [${actual.join(", ")}]`,
				})
			}
		}
	}

	// f. Missing status
	if (!repairData.status) {
		issues.push({
			intent: slug,
			field: "status",
			severity: "error",
			message: "Missing status field",
			fix: "Set `status` to 'active' or 'completed'",
		})
	}

	// g. Missing mode
	if (!repairData.mode) {
		issues.push({
			intent: slug,
			field: "mode",
			severity: "error",
			message: "Missing mode field",
			fix: "Set `mode` to 'continuous', 'discrete', or 'autopilot'",
		})
	}

	// h. Legacy created field
	if (repairData.created && !repairData.created_at) {
		issues.push({
			intent: slug,
			field: "created",
			severity: "warning",
			message: "Legacy `created` field found",
			fix: "Rename `created` to `created_at`",
		})
	}

	// i. Missing created_at
	if (!(repairData.created || repairData.created_at)) {
		issues.push({
			intent: slug,
			field: "created_at",
			severity: "warning",
			message: "Missing created_at field",
			fix: "Add `created_at` with an ISO date",
		})
	}

	// j. Invalid active_stage
	if (
		repairData.active_stage &&
		Array.isArray(repairStages) &&
		repairStages.length > 0
	) {
		if (
			!(repairStages as string[]).includes(repairData.active_stage as string)
		) {
			issues.push({
				intent: slug,
				field: "active_stage",
				severity: "error",
				message: `active_stage '${repairData.active_stage}' not in stages list`,
				fix: `active_stage '${repairData.active_stage}' not in stages list`,
			})
		}
	}

	// k. Missing active_stage for active intents
	if (repairData.status === "active" && !repairData.active_stage) {
		issues.push({
			intent: slug,
			field: "active_stage",
			severity: "warning",
			message: "Active intent has no active_stage",
			fix: "Active intent has no active_stage. Set to the first stage.",
		})
	}

	// l. Stage state consistency — REMOVED (was v3-only).
	//
	// In v3, each stage's state.json carried `status: "active"|"completed"|
	// "pending"`, intent.md carried `active_stage`, and the engine reset
	// `active_stage` backwards if a "before active_stage" stage's
	// state.json said anything other than "completed". This block flagged
	// that mismatch, and the third pass below synthesized completion
	// records to silence it.
	//
	// v4 retired both: `active_stage` is in DEPRECATED_INTENT_FIELDS
	// (stripped on migration), and stage status is derived from per-unit
	// `iterations[]` + branch-merge state via `firstUnmergedStage`. v4's
	// state.json carries decision_log, engine iterations, and
	// reconciliation receipts — no `status` field. The legacy issue flags
	// pointed at fields that no longer exist; the synthesizer wrote
	// v3-shaped files into a v4 world. Both paths gone.

	// m. Unit filename format + n. Unit required fields + o. Unit inputs
	if (Array.isArray(repairStages)) {
		for (const stageName of repairStages as string[]) {
			const repairUnitsDir = join(
				intentsDir,
				slug,
				"stages",
				stageName,
				"units",
			)
			if (!existsSync(repairUnitsDir)) continue

			// Build upstream artifact paths once for input checks
			const existingUpstreamPaths: string[] = []
			if (repairStudio) {
				let stageInputs: Array<{
					stage: string
					discovery?: string
					output?: string
				}> | null = null
				for (const base of searchPaths) {
					const stageMd = join(
						base,
						repairStudio,
						"stages",
						stageName,
						"STAGE.md",
					)
					if (!existsSync(stageMd)) continue
					const { data: stageData } = parseFrontmatter(
						readFileSync(stageMd, "utf8"),
					)
					if (Array.isArray(stageData.inputs) && stageData.inputs.length > 0) {
						stageInputs = stageData.inputs as Array<{
							stage: string
							discovery?: string
							output?: string
						}>
					}
					break
				}
				if (stageInputs) {
					const intentPath2 = join(intentsDir, slug)
					for (const input of stageInputs) {
						for (const base of searchPaths) {
							for (const kind of ["discovery", "outputs"] as const) {
								const artifactDir = join(
									base,
									repairStudio,
									"stages",
									input.stage,
									kind,
								)
								if (!existsSync(artifactDir)) continue
								for (const f of readdirSync(artifactDir).filter((af) =>
									af.endsWith(".md"),
								)) {
									const raw = readFileSync(join(artifactDir, f), "utf8")
									const { data: aData } = parseFrontmatter(raw)
									const aName = (aData.name as string) || f.replace(/\.md$/, "")
									const wanted =
										kind === "outputs" ? input.output : input.discovery
									if (aName !== wanted) continue
									const loc = (aData.location as string) || ""
									if (!loc) continue
									const relPath = loc.replace(
										/^\.haiku\/intents\/\{intent-slug\}\//,
										"",
									)
									const absPath = join(intentPath2, relPath)
									if (existsSync(absPath)) existingUpstreamPaths.push(relPath)
								}
							}
						}
					}
				}
			}

			for (const f of readdirSync(repairUnitsDir, { withFileTypes: true })) {
				if (!(f.isFile() && f.name.endsWith(".md"))) continue
				if (!REPAIR_UNIT_PATTERN.test(f.name)) {
					issues.push({
						intent: slug,
						field: `stages/${stageName}/units/${f.name}`,
						severity: "warning",
						message: `Unit filename doesn't match expected pattern`,
						fix: "Rename to match pattern: unit-NNN-slug-name.md (3-digit zero-padded; legacy 2-digit also resolves)",
					})
				}
				const unitRaw = readFileSync(join(repairUnitsDir, f.name), "utf8")
				const { removed: unitDupes } = dedupeFrontmatterKeys(unitRaw)
				if (unitDupes.length > 0) {
					issues.push({
						intent: slug,
						field: `stages/${stageName}/units/${f.name}:frontmatter-duplicate-keys`,
						severity: "warning",
						message: `Duplicate frontmatter keys in unit: ${unitDupes.join(", ")}`,
						fix: "Rewrite frontmatter with duplicate keys removed (last value wins)",
					})
				}
				const { data: unitData } = parseFrontmatter(unitRaw)
				if (!unitData.status) {
					issues.push({
						intent: slug,
						field: `stages/${stageName}/units/${f.name}:status`,
						severity: "warning",
						message: `Unit missing 'status' field`,
						fix: "Add `status` field to unit frontmatter",
					})
				}
				const unitStatus = (unitData.status as string) || ""
				if (["complete", "skipped", "failed"].includes(unitStatus)) continue
				const unitInputs =
					(unitData.inputs as string[]) || (unitData.refs as string[]) || []
				if (unitInputs.length === 0) {
					const fix =
						existingUpstreamPaths.length > 0
							? `Add \`inputs:\` with upstream paths: ${existingUpstreamPaths.join(", ")}`
							: "Add `inputs:` with at minimum the intent doc and discovery docs"
					issues.push({
						intent: slug,
						field: `stages/${stageName}/units/${f.name}:inputs`,
						severity: "error",
						message: "Unit has no `inputs:` — execution will be blocked",
						fix,
					})
				}
			}
		}
	}

	// p. Git-based date repair: derive dates from commit history
	if (isGitRepo()) {
		const intentFilePath = join(intentsDir, slug, "intent.md")
		const gitCreated = gitFirstCommitDateForRepair(intentFilePath)
		const gitLastModified = gitLastCommitDateForRepair(join(intentsDir, slug))
		const currentCreatedAt = repairData.created_at as string | undefined
		const currentStartedAt = repairData.started_at as string | undefined
		const currentCompletedAt = repairData.completed_at as string | undefined

		// created_at should match the first commit
		if (gitCreated && currentCreatedAt) {
			const gitDate = gitCreated.slice(0, 10)
			const fmDate =
				typeof currentCreatedAt === "string"
					? currentCreatedAt.slice(0, 10)
					: ""
			if (gitDate !== fmDate) {
				issues.push({
					intent: slug,
					field: "created_at",
					severity: "warning",
					message: `created_at '${fmDate}' doesn't match git history '${gitDate}'`,
					fix: `Update created_at to '${gitCreated}' (from git first commit)`,
				})
			}
		}

		// started_at should match the first commit
		if (gitCreated && currentStartedAt) {
			const gitDate = gitCreated.slice(0, 10)
			const fmDate =
				typeof currentStartedAt === "string"
					? currentStartedAt.slice(0, 10)
					: ""
			if (gitDate !== fmDate) {
				issues.push({
					intent: slug,
					field: "started_at",
					severity: "warning",
					message: `started_at '${fmDate}' doesn't match git history '${gitDate}'`,
					fix: `Update started_at to '${gitCreated}' (from git first commit)`,
				})
			}
		}

		// completed_at for completed intents should match the last commit
		if (
			repairData.status === "completed" &&
			gitLastModified &&
			currentCompletedAt
		) {
			const gitDate = gitLastModified.slice(0, 10)
			const fmDate =
				typeof currentCompletedAt === "string"
					? currentCompletedAt.slice(0, 10)
					: ""
			if (gitDate !== fmDate) {
				issues.push({
					intent: slug,
					field: "completed_at",
					severity: "warning",
					message: `completed_at '${fmDate}' doesn't match git history '${gitDate}'`,
					fix: `Update completed_at to '${gitLastModified}' (from git last commit)`,
				})
			}
		}

		// Missing started_at — derive from git
		if (gitCreated && !currentStartedAt) {
			issues.push({
				intent: slug,
				field: "started_at",
				severity: "warning",
				message: "Missing started_at field",
				fix: `Set started_at to '${gitCreated}' (from git first commit)`,
			})
		}

		// Missing completed_at for completed intents — derive from git
		if (
			repairData.status === "completed" &&
			gitLastModified &&
			!currentCompletedAt
		) {
			issues.push({
				intent: slug,
				field: "completed_at",
				severity: "warning",
				message: "Completed intent missing completed_at field",
				fix: `Set completed_at to '${gitLastModified}' (from git last commit)`,
			})
		}
	}

	return issues
}

interface RepairCwdResult {
	scanned: number
	cleanIntents: string[]
	issues: RepairIssue[]
	applied: AppliedFix[]
	remaining: RepairIssue[]
}

/** Run repair scan + optional auto-fix. `rootOverride` is the absolute path to a
 *  `.haiku` directory — pass it when operating on a worktree other than `cwd`.
 *  When omitted, falls back to walking up from the current working directory. */
function repairCwd(
	rootOverride: string | undefined,
	intentArg: string | undefined,
	autoApply: boolean,
): RepairCwdResult {
	const root = rootOverride ?? findHaikuRoot()
	const intentsDir = join(root, "intents")
	if (!existsSync(intentsDir)) {
		return {
			scanned: 0,
			cleanIntents: [],
			issues: [],
			applied: [],
			remaining: [],
		}
	}
	const { studioMap, searchPaths } = buildStudioMap(root)

	let slugs: string[]
	if (intentArg) {
		if (/[/\\]|\.\./.test(intentArg))
			throw new Error(`Invalid intent slug: "${intentArg}"`)
		if (!existsSync(join(intentsDir, intentArg, "intent.md"))) {
			return {
				scanned: 0,
				cleanIntents: [],
				issues: [],
				applied: [],
				remaining: [],
			}
		}
		slugs = [intentArg]
	} else {
		slugs = readdirSync(intentsDir, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")),
			)
			.map((d) => d.name)
	}

	const allIssues: RepairIssue[] = []
	const cleanIntents: string[] = []
	const allApplied: AppliedFix[] = []
	const allRemaining: RepairIssue[] = []

	for (const slug of slugs) {
		let issues = scanOneIntent(intentsDir, slug, studioMap, searchPaths)
		if (autoApply && issues.length > 0) {
			const result = applyAutoFixes(intentsDir, slug, issues)
			allApplied.push(...result.applied)
			if (result.applied.length > 0) {
				issues = scanOneIntent(intentsDir, slug, studioMap, searchPaths)
			}
		}
		if (issues.length === 0) {
			cleanIntents.push(slug)
		} else {
			allIssues.push(...issues)
			allRemaining.push(...issues)
		}
	}

	return {
		scanned: slugs.length,
		cleanIntents,
		issues: allIssues,
		applied: allApplied,
		remaining: allRemaining,
	}
}

/** Build a markdown report from a single-cwd repair result. */
function buildRepairReport(
	result: RepairCwdResult,
	headingPrefix = "",
): string {
	if (result.issues.length === 0 && result.applied.length === 0) {
		return `${headingPrefix}All intents passed validation. No repairs needed.`
	}

	const issuesByIntent = new Map<string, RepairIssue[]>()
	for (const issue of result.issues) {
		const list = issuesByIntent.get(issue.intent) || []
		list.push(issue)
		issuesByIntent.set(issue.intent, list)
	}

	const lines: string[] = [
		`${headingPrefix}# Intent Repair Report`,
		"",
		`Scanned ${result.scanned} intent(s). Auto-applied ${result.applied.length} fix(es). ${result.remaining.length} issue(s) remaining.`,
		"",
	]

	if (result.applied.length > 0) {
		lines.push("## Auto-Applied Fixes")
		lines.push("")
		for (const fix of result.applied) {
			lines.push(`- **${fix.intent}** / \`${fix.field}\` — ${fix.description}`)
		}
		lines.push("")
	}

	for (const [slug, issues] of issuesByIntent) {
		const errors = issues.filter((i) => i.severity === "error").length
		const warnings = issues.filter((i) => i.severity === "warning").length
		lines.push(`## ${slug} — ${errors} error(s), ${warnings} warning(s)`)
		lines.push("")
		lines.push("| # | Severity | Field | Issue | Fix |")
		lines.push("|---|----------|-------|-------|-----|")
		issues.forEach((issue, idx) => {
			lines.push(
				`| ${idx + 1} | ${issue.severity} | ${issue.field} | ${issue.message} | ${issue.fix} |`,
			)
		})
		lines.push("")
	}

	if (result.cleanIntents.length > 0) {
		lines.push("## Intents with no issues")
		for (const slug of result.cleanIntents) {
			lines.push(`- ${slug}`)
		}
		lines.push("")
	}

	if (result.remaining.length > 0) {
		lines.push(
			"---",
			"",
			"Auto-fixes were applied for safe issues. Remaining issues need agent or user attention. For each:",
			"1. Read the intent.md file",
			"2. Apply the fix listed in the table above",
			"3. After fixing, report what you changed",
		)
	}

	return lines.join("\n")
}

// ── Worktree-location migration ────────────────────────────────────────────
//
// Pre-fix, H·AI·K·U created `.haiku/worktrees/` relative to `process.cwd()`,
// so running the workflow engine from a sub-worktree (e.g. Claude's
// `.claude/worktrees/foo/`) forked all state and unit worktrees into that
// sub-worktree instead of the primary repo. After the fix, the new code
// always anchors at the primary repo — but existing misplaced worktrees
// don't move themselves. This helper detects them and migrates them.

interface MisplacedWorktreeMove {
	old: string
	new: string
	branch: string
}

interface MisplacedWorktreeSkip {
	path: string
	reason: string
}

export interface WorktreeMigrationResult {
	moved: MisplacedWorktreeMove[]
	skipped: MisplacedWorktreeSkip[]
	cleanedSkeletons: string[]
}

/** Parse `git worktree list --porcelain` into structured records. */
function listGitWorktrees(): Array<{ path: string; branch: string | null }> {
	if (!isGitRepo()) return []
	let raw: string
	try {
		raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch {
		return []
	}
	const out: Array<{ path: string; branch: string | null }> = []
	let cur: { path: string; branch: string | null } | null = null
	for (const line of raw.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (cur) out.push(cur)
			cur = { path: line.slice("worktree ".length).trim(), branch: null }
		} else if (line.startsWith("branch ") && cur) {
			cur.branch = line.slice("branch ".length).trim()
		} else if (line === "" && cur) {
			out.push(cur)
			cur = null
		}
	}
	if (cur) out.push(cur)
	return out
}

/** Check if a worktree has uncommitted changes. */
function isWorktreeDirty(worktreePath: string): boolean {
	try {
		const out = execFileSync(
			"git",
			["-C", worktreePath, "status", "--porcelain"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		)
		return out.trim().length > 0
	} catch {
		// If we can't check, treat as dirty so we don't risk data loss.
		return true
	}
}

/**
 * Scan for git worktrees registered at `<somewhere>/.haiku/worktrees/...`
 * where `<somewhere>` is NOT the primary repo, and try to relocate each
 * via `git worktree move` to the primary's `.haiku/worktrees/`. Also
 * sweep up empty `.haiku/worktrees/` skeleton directories left behind by
 * the pre-fix code.
 *
 * Safety:
 * - Worktrees with uncommitted changes are skipped (data preservation).
 * - Worktrees whose target path already exists are skipped (collision).
 * - Empty skeleton dirs (no files, no .git pointer) are removed.
 *
 * Returns a structured result for inclusion in the repair report.
 */
export function migrateMisplacedWorktrees(): WorktreeMigrationResult {
	const result: WorktreeMigrationResult = {
		moved: [],
		skipped: [],
		cleanedSkeletons: [],
	}
	if (!isGitRepo()) return result

	const primary = primaryRepoRoot()
	const haikuPrefix = `${sep}.haiku${sep}worktrees${sep}`

	// Pass 1: registered git worktrees that live outside primary.
	for (const wt of listGitWorktrees()) {
		const idx = wt.path.indexOf(haikuPrefix)
		if (idx === -1) continue
		const root = wt.path.slice(0, idx)
		if (root === primary) continue // already correctly placed
		const tail = wt.path.slice(idx) // `/.haiku/worktrees/<slug>/<unit>`
		const target = primary + tail

		if (existsSync(target)) {
			result.skipped.push({
				path: wt.path,
				reason: `target already exists: ${target}`,
			})
			continue
		}
		if (isWorktreeDirty(wt.path)) {
			result.skipped.push({
				path: wt.path,
				reason:
					"uncommitted changes — commit/stash inside the worktree, then re-run haiku_repair",
			})
			continue
		}
		try {
			// Ensure parent dir exists before move.
			const targetParent = target.slice(0, target.lastIndexOf(sep))
			mkdirSync(targetParent, { recursive: true })
			execFileSync("git", ["worktree", "move", wt.path, target], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			})
			result.moved.push({
				old: wt.path,
				new: target,
				branch: wt.branch ?? "(detached)",
			})
		} catch (err) {
			result.skipped.push({
				path: wt.path,
				reason: `git worktree move failed: ${err instanceof Error ? err.message : String(err)}`,
			})
		}
	}

	// Pass 2: empty `.haiku/worktrees/` skeleton dirs (no .git pointer
	// inside, no files). Walk every git worktree's root to find them.
	const rootsToScan = new Set<string>()
	for (const wt of listGitWorktrees()) {
		if (wt.path !== primary) rootsToScan.add(wt.path)
	}
	for (const root of rootsToScan) {
		const skel = join(root, ".haiku", "worktrees")
		if (!existsSync(skel)) continue
		// If anything inside is a real git worktree (still registered) or
		// contains files, leave it alone. We only sweep pure-empty trees.
		let hasFiles = false
		try {
			const walk = (dir: string): void => {
				if (hasFiles) return
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					const p = join(dir, entry.name)
					if (entry.isFile() || entry.isSymbolicLink()) {
						hasFiles = true
						return
					}
					if (entry.isDirectory()) walk(p)
				}
			}
			walk(skel)
		} catch {
			hasFiles = true // bail on permission errors
		}
		if (hasFiles) continue
		try {
			rmSync(skel, { recursive: true, force: true })
			result.cleanedSkeletons.push(skel)
			// Also remove the parent `.haiku/` dir if now empty (the whole
			// skeleton was just `.haiku/worktrees/...`).
			const parent = join(root, ".haiku")
			if (existsSync(parent) && readdirSync(parent).length === 0) {
				rmSync(parent, { recursive: true, force: true })
			}
		} catch {
			// Best-effort cleanup; don't fail the whole migration.
		}
	}

	return result
}

/** Render the worktree-migration result as a markdown section. */
function buildWorktreeMigrationReport(result: WorktreeMigrationResult): string {
	if (
		result.moved.length === 0 &&
		result.skipped.length === 0 &&
		result.cleanedSkeletons.length === 0
	) {
		return ""
	}
	const lines: string[] = ["## Worktree Migration", ""]
	if (result.moved.length > 0) {
		lines.push(`Moved ${result.moved.length} misplaced worktree(s):`)
		for (const m of result.moved) {
			lines.push(`- \`${m.branch}\`: ${m.old} → ${m.new}`)
		}
		lines.push("")
	}
	if (result.skipped.length > 0) {
		lines.push(`Skipped ${result.skipped.length} worktree(s):`)
		for (const s of result.skipped) {
			lines.push(`- ${s.path} — ${s.reason}`)
		}
		lines.push("")
	}
	if (result.cleanedSkeletons.length > 0) {
		lines.push(
			`Cleaned ${result.cleanedSkeletons.length} empty skeleton dir(s):`,
		)
		for (const p of result.cleanedSkeletons) lines.push(`- ${p}`)
		lines.push("")
	}
	return lines.join("\n")
}

interface BranchRepairSummary {
	slug: string
	branch: string
	scanned: number
	applied: AppliedFix[]
	remaining: RepairIssue[]
	committed: boolean
	pushed: boolean
	error?: string
	pushError?: string
	merged: boolean
	prUrl?: string
	prError?: string
	// Worktree/setup failure — archived-intents pass only. When set, the
	// archived report section should label the failure instead of reporting
	// "0 intents scanned".
	setupError?: string
}

/** Repair every haiku/<slug>/main branch sequentially using temporary worktrees.
 *  Auto-applies safe fixes, commits + pushes them, and opens a PR if the branch
 *  was already merged into the mainline. Returns a structured summary.
 *
 *  Also detects discrete-mode intents that have stage branches but no main branch
 *  and consolidates their stage branches into a new main branch first. */
function repairAllBranches(autoApply: boolean): {
	summaries: BranchRepairSummary[]
	mainline: string
	archivedSummary?: BranchRepairSummary
} {
	// Fetch upfront so getMainlineBranch() sees current origin/HEAD and every
	// worktree created below reflects the latest remote state. Without this,
	// a stale local ref could cause the repair tool to "fix" issues that were
	// already fixed on the remote by a previous run, then fail to push with
	// non-fast-forward, and loop forever. (#206)
	fetchOrigin()
	const mainline = getMainlineBranch()
	const summaries: BranchRepairSummary[] = []

	// Phase 1: Create missing main branches for orphan discrete intents.
	// These have haiku/<slug>/<stage> branches but no haiku/<slug>/main,
	// so listIntentBranches() can't see them. Consolidate stage branches
	// into a new main branch so the standard repair loop can process them.
	if (autoApply) {
		const orphans = listOrphanDiscreteIntents()
		for (const { slug, branches: stageBranches } of orphans) {
			// Extract stage names from branch refs
			const stageNames = stageBranches.map((b) =>
				b.replace(`haiku/${slug}/`, ""),
			)

			// Sort by pipeline order if we can resolve the studio from a stage branch
			try {
				const firstBranch = stageBranches[0]
				const intentRaw = readFileFromBranch(
					firstBranch,
					`.haiku/intents/${slug}/intent.md`,
				)
				if (intentRaw) {
					const { data: intentFm } = parseFrontmatter(intentRaw)
					const studioName = (intentFm.studio as string) || ""
					if (studioName) {
						const studioInfo = resolveStudio(studioName)
						if (studioInfo && studioInfo.stages.length > 0) {
							const pipelineOrder = studioInfo.stages
							stageNames.sort((a, b) => {
								const ai = pipelineOrder.indexOf(a)
								const bi = pipelineOrder.indexOf(b)
								// Unknown stages sort to the end
								return (
									(ai === -1 ? pipelineOrder.length : ai) -
									(bi === -1 ? pipelineOrder.length : bi)
								)
							})
						}
					}
				}
			} catch {
				// Can't resolve pipeline order — alphabetical fallback
			}

			try {
				const result = consolidateStageBranches(slug, stageNames)
				if (result.success) {
					// Push the new main branch
					try {
						execFileSync(
							"git",
							["push", "-u", "origin", `haiku/${slug}/main`],
							{ encoding: "utf8", stdio: "pipe" },
						)
					} catch {
						// push failed — still continue with local repair
					}
				} else {
					// Structured failure (conflict or other) — record into
					// the repair report so the operator sees it instead of
					// the consolidation silently no-op'ing. Conflict path
					// includes the file list; other failures show the raw
					// git error.
					const detail = result.isConflict
						? `Merge conflict consolidating into haiku/${slug}/main on ${result.conflictFiles?.length ?? 0} file(s): ${(result.conflictFiles ?? []).join(", ")}. Resolve on haiku/${slug}/main, commit, then re-run /haiku:repair.`
						: `Failed to consolidate stage branches into haiku/${slug}/main: ${result.message}`
					summaries.push({
						slug,
						branch: `haiku/${slug}/main`,
						scanned: 0,
						applied: [],
						remaining: [],
						committed: false,
						pushed: false,
						merged: false,
						pushError: detail,
					})
				}
			} catch (err) {
				// Consolidation threw (rare — `consolidateStageBranches`
				// returns structured results, but a layer above could
				// throw). Record so it appears in the repair report.
				summaries.push({
					slug,
					branch: `haiku/${slug}/main`,
					scanned: 0,
					applied: [],
					remaining: [],
					committed: false,
					pushed: false,
					merged: false,
					pushError: `Failed to create main from stage branches: ${err instanceof Error ? err.message : String(err)}`,
				})
			}
		}
	}

	// Phase 2: Repair all main branches (including any just created above)
	const branches = listIntentBranches()

	for (const slug of branches) {
		const branch = `haiku/${slug}/main`
		let worktreePath = ""
		const summary: BranchRepairSummary = {
			slug,
			branch,
			scanned: 0,
			applied: [],
			remaining: [],
			committed: false,
			pushed: false,
			merged: false,
		}
		try {
			worktreePath = addTempWorktree(branch, "haiku-repair", true)
		} catch (err) {
			summary.error = `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`
			summaries.push(summary)
			continue
		}

		try {
			// Operate on the worktree by passing its `.haiku` root explicitly.
			// We deliberately avoid `process.chdir()` here: the MCP process is
			// shared and `cwd` is global state, so flipping it during a repair
			// would race with any concurrent tool call. Every downstream helper
			// (scanOneIntent, applyAutoFixes, commitAndPushFromWorktree, etc.)
			// is already path-parameterized.
			const worktreeHaikuRoot = join(worktreePath, ".haiku")
			const result = repairCwd(worktreeHaikuRoot, undefined, autoApply)
			summary.scanned = result.scanned
			summary.applied = result.applied
			summary.remaining = result.remaining

			// Verify completed intents are truly merged into mainline
			const intentMd = join(worktreeHaikuRoot, "intents", slug, "intent.md")
			if (existsSync(intentMd)) {
				const fm = parseFrontmatter(readFileSync(intentMd, "utf8"))
				if (
					fm.data.status === "completed" &&
					!isBranchMerged(branch, mainline)
				) {
					const issue: RepairIssue = {
						intent: slug,
						field: "status",
						severity: "error",
						message: `Intent marked 'completed' but branch '${branch}' is not merged into '${mainline}'`,
						fix: `Either merge the branch into '${mainline}' or set status to 'active'`,
					}
					summary.remaining.push(issue)
				}
			}

			if (autoApply && result.applied.length > 0) {
				// Check merge status before push — after push, the new commit
				// won't be an ancestor of mainline so the check would always fail
				const wasAlreadyMerged = isBranchMerged(branch, mainline)
				const messageLines = [
					`repair: auto-fix ${result.applied.length} metadata issue(s)`,
					"",
					...result.applied.map(
						(a) => `- ${a.intent}/${a.field}: ${a.description}`,
					),
				]
				const push = commitAndPushFromWorktree(
					worktreePath,
					branch,
					messageLines.join("\n"),
				)
				summary.committed = push.committed
				summary.pushed = push.pushed
				summary.pushError = push.pushError
				if (push.committed && push.pushed && wasAlreadyMerged) {
					summary.merged = true
					const prResult = openPullRequest(
						branch,
						mainline,
						`repair: metadata fixes for ${slug}`,
						`Auto-applied repair fixes (branch was already merged into \`${mainline}\`):\n\n${result.applied.map((a) => `- **${a.intent}/${a.field}**: ${a.description}`).join("\n")}`,
					)
					if (prResult.ok) summary.prUrl = prResult.url
					else summary.prError = prResult.error
				}
			}
		} finally {
			if (worktreePath) removeTempWorktree(worktreePath)
		}

		summaries.push(summary)
	}

	// Second pass: archived intents on mainline (no matching haiku/<slug>/main branch)
	const archivedSummary = repairArchivedOnMainline(
		branches,
		mainline,
		autoApply,
	)

	return { summaries, mainline, archivedSummary }
}

/** Scan mainline for intents without a matching haiku/<slug>/main branch (archived)
 *  and repair them via a new branch + PR. Returns a combined summary or undefined
 *  if there's nothing to do. */
function repairArchivedOnMainline(
	activeBranches: string[],
	mainline: string,
	autoApply: boolean,
): BranchRepairSummary | undefined {
	const activeSet = new Set(activeBranches)
	const repairBranch = `repair/archived-intents-${Date.now()}`
	const summary: BranchRepairSummary = {
		slug: "<archived intents>",
		branch: repairBranch,
		scanned: 0,
		applied: [],
		remaining: [],
		committed: false,
		pushed: false,
		merged: false,
	}

	let worktreePath = ""
	try {
		worktreePath = addTempWorktree(mainline, "haiku-repair-archived", true)
	} catch (err) {
		// Worktree setup failed — surface a dedicated failure shape so the report
		// labels this as "Mainline worktree setup failed" rather than "0 archived
		// intents scanned" (which would imply we looked and found nothing).
		summary.setupError = `Failed to create mainline worktree: ${err instanceof Error ? err.message : String(err)}`
		return summary
	}

	try {
		const worktreeHaikuRoot = join(worktreePath, ".haiku")
		const intentsDir = join(worktreeHaikuRoot, "intents")
		if (!existsSync(intentsDir)) {
			return undefined
		}

		const mainlineSlugs = readdirSync(intentsDir, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")),
			)
			.map((d) => d.name)

		const archivedSlugs = mainlineSlugs.filter((s) => !activeSet.has(s))
		if (archivedSlugs.length === 0) {
			return undefined
		}

		const { studioMap, searchPaths } = buildStudioMap(worktreeHaikuRoot)

		for (const slug of archivedSlugs) {
			let issues = scanOneIntent(intentsDir, slug, studioMap, searchPaths)
			summary.scanned++
			if (autoApply && issues.length > 0) {
				const result = applyAutoFixes(intentsDir, slug, issues)
				summary.applied.push(...result.applied)
				if (result.applied.length > 0) {
					issues = scanOneIntent(intentsDir, slug, studioMap, searchPaths)
				}
			}
			if (issues.length > 0) summary.remaining.push(...issues)
		}

		if (autoApply && summary.applied.length > 0) {
			// commitAndPushFromWorktree commits in detached HEAD and pushes via
			// `HEAD:refs/heads/<branch>` — no local branch ref needs to be created.
			const messageLines = [
				`repair: auto-fix ${summary.applied.length} issue(s) in archived intent(s)`,
				"",
				...summary.applied.map(
					(a) => `- ${a.intent}/${a.field}: ${a.description}`,
				),
			]
			const push = commitAndPushFromWorktree(
				worktreePath,
				repairBranch,
				messageLines.join("\n"),
			)
			summary.committed = push.committed
			summary.pushed = push.pushed
			summary.pushError = push.pushError

			if (push.committed && push.pushed) {
				const prResult = openPullRequest(
					repairBranch,
					mainline,
					"repair: metadata fixes for archived intents",
					`Auto-applied repair fixes for archived intents on \`${mainline}\`:\n\n${summary.applied.map((a) => `- **${a.intent}/${a.field}**: ${a.description}`).join("\n")}`,
				)
				if (prResult.ok) summary.prUrl = prResult.url
				else summary.prError = prResult.error
			}
		}
	} finally {
		if (worktreePath) removeTempWorktree(worktreePath)
	}

	// Return the summary whenever there was something to report: scanned intents,
	// or a setup failure that the operator needs to see. Nothing to report → undefined.
	if (summary.scanned > 0 || summary.setupError) return summary
	return undefined
}

function buildMultiBranchReport(
	summaries: BranchRepairSummary[],
	mainline: string,
	archivedSummary?: BranchRepairSummary,
): string {
	if (summaries.length === 0 && !archivedSummary) {
		return "No intent branches or archived intents found in this repository."
	}
	const lines: string[] = [
		"# Multi-Branch Repair Report",
		"",
		`Scanned ${summaries.length} intent branch(es). Mainline: \`${mainline}\`.`,
		"",
	]
	const totalApplied =
		summaries.reduce((sum, s) => sum + s.applied.length, 0) +
		(archivedSummary?.applied.length ?? 0)
	const totalRemaining =
		summaries.reduce((sum, s) => sum + s.remaining.length, 0) +
		(archivedSummary?.remaining.length ?? 0)
	const totalPushed =
		summaries.filter((s) => s.pushed).length + (archivedSummary?.pushed ? 1 : 0)
	// Distinguish the two PR cases: active-branch repairs that were already merged
	// (PR opens back to mainline) versus the archived-intents pass (PR opens from
	// a fresh repair/* branch). Lumping them into one phrase misrepresents both.
	const mergedBranchPRs = summaries.filter((s) => s.prUrl).length
	const archivedRepairPR = archivedSummary?.prUrl ? 1 : 0
	const prSummary =
		mergedBranchPRs > 0 && archivedRepairPR > 0
			? `${mergedBranchPRs} PR(s) for already-merged branches + 1 PR for archived intents`
			: mergedBranchPRs > 0
				? `${mergedBranchPRs} PR(s) opened for already-merged branches`
				: archivedRepairPR > 0
					? "1 PR opened for archived intents"
					: "no PRs opened"
	lines.push(
		`**Summary:** ${totalApplied} fix(es) auto-applied across ${totalPushed} branch(es); ${prSummary}; ${totalRemaining} issue(s) still need attention.`,
	)
	lines.push("")

	for (const s of summaries) {
		lines.push(`## \`${s.branch}\``)
		lines.push("")
		lines.push(`- Scanned: ${s.scanned} intent(s)`)
		lines.push(`- Auto-applied: ${s.applied.length}`)
		lines.push(`- Remaining: ${s.remaining.length}`)
		if (s.committed && s.pushed)
			lines.push(`- Committed and pushed to \`origin/${s.branch}\``)
		else if (s.committed)
			lines.push(
				`- Committed locally; push failed: ${s.pushError || "unknown"}`,
			)
		else if (s.error) lines.push(`- Error: ${s.error}`)
		else if (s.pushError) lines.push(`- Push error: ${s.pushError}`)
		if (s.merged && s.prUrl)
			lines.push(
				`- Branch already merged into \`${mainline}\` — opened PR/MR: ${s.prUrl}`,
			)
		else if (s.merged && s.prError)
			lines.push(
				`- Branch already merged into \`${mainline}\` — failed to open PR: ${s.prError}`,
			)
		if (s.applied.length > 0) {
			lines.push("")
			lines.push("**Fixes applied:**")
			for (const f of s.applied) {
				lines.push(`- ${f.intent}/${f.field}: ${f.description}`)
			}
		}
		if (s.remaining.length > 0) {
			lines.push("")
			lines.push("**Remaining issues (need agent attention):**")
			for (const i of s.remaining) {
				lines.push(
					`- **${i.intent}**/${i.field} (${i.severity}): ${i.message} → ${i.fix}`,
				)
			}
		}
		lines.push("")
	}

	if (archivedSummary) {
		lines.push("## Archived intents (mainline only)")
		lines.push("")
		if (archivedSummary.setupError) {
			lines.push(
				`- **Mainline worktree setup failed:** ${archivedSummary.setupError}`,
			)
			lines.push(
				"- No archived intents were scanned. Fix the underlying git/filesystem issue and re-run `/repair`.",
			)
			lines.push("")
			return lines.join("\n")
		}
		lines.push(`- Scanned: ${archivedSummary.scanned} archived intent(s)`)
		lines.push(`- Auto-applied: ${archivedSummary.applied.length}`)
		lines.push(`- Remaining: ${archivedSummary.remaining.length}`)
		if (archivedSummary.committed && archivedSummary.pushed) {
			lines.push(`- Pushed repair branch \`origin/${archivedSummary.branch}\``)
		} else if (archivedSummary.pushError) {
			lines.push(`- Push error: ${archivedSummary.pushError}`)
		}
		if (archivedSummary.prUrl) {
			lines.push(`- Opened PR/MR: ${archivedSummary.prUrl}`)
		} else if (archivedSummary.prError) {
			lines.push(`- Failed to open PR: ${archivedSummary.prError}`)
		}
		if (archivedSummary.applied.length > 0) {
			lines.push("")
			lines.push("**Fixes applied:**")
			for (const f of archivedSummary.applied) {
				lines.push(`- ${f.intent}/${f.field}: ${f.description}`)
			}
		}
		if (archivedSummary.remaining.length > 0) {
			lines.push("")
			lines.push("**Remaining issues (need agent attention):**")
			for (const i of archivedSummary.remaining) {
				lines.push(
					`- **${i.intent}**/${i.field} (${i.severity}): ${i.message} → ${i.fix}`,
				)
			}
		}
		lines.push("")
	}

	return lines.join("\n")
}

// ── Environment detection ──────────────────────────────────────────────────

// `isGitRepo`, `findHaikuRoot`, `_resetIsGitRepoForTests`, and the
// test-override hooks `setIsGitRepoForTests` / `setHaikuRootForTests`
// live in `./state/shared.js` so the per-domain modules under state/
// and the orchestrator/* tree all share the same flag state. Local
// callers in this file use the imports below; external callers see
// the re-exports.
import {
	_resetIsGitRepoForTests,
	findHaikuRoot,
	isGitRepo,
	setHaikuRootForTests,
	setIsGitRepoForTests,
} from "./state/shared.js"

export {
	_resetIsGitRepoForTests,
	findHaikuRoot,
	isGitRepo,
	setHaikuRootForTests,
	setIsGitRepoForTests,
}

// Cache keyed by cwd so test suites that chdir between project dirs each
// get their own primary-root resolution (production never changes cwd, so
// the cache effectively becomes a single-entry hit).
let _primaryRepoRoot: { cwd: string; root: string } | null = null

/** Return the primary repo root — the parent of the canonical `.git/`
 *  directory, regardless of which worktree (primary or sub-) is the
 *  current cwd. All H·AI·K·U state (intents, worktrees, knowledge) lives
 *  here so that running the workflow engine from a sub-worktree (e.g.
 *  `.claude/worktrees/foo/`) doesn't fork state into the sub-worktree.
 *
 *  This matches Claude Code's convention where `.claude/worktrees/` are
 *  always created relative to the primary repo, never to a nested
 *  worktree.
 *
 *  Falls back to `process.cwd()` in non-git environments (tests use
 *  non-git temp dirs and rely on this fallback).
 */
export function primaryRepoRoot(): string {
	const cwd = process.cwd()
	if (_primaryRepoRoot !== null && _primaryRepoRoot.cwd === cwd) {
		return _primaryRepoRoot.root
	}
	if (!isGitRepo()) {
		_primaryRepoRoot = { cwd, root: cwd }
		return cwd
	}
	let root: string
	try {
		// `git rev-parse --git-common-dir` resolves to the SHARED .git dir
		// — for the primary worktree it returns the primary's .git; for any
		// linked worktree it returns the SAME .git path (not the linked
		// worktree's .git file). The parent of that is the primary repo
		// root.
		const gitCommonDir = execFileSync(
			"git",
			["rev-parse", "--git-common-dir"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		).trim()
		// Empty output means git is stubbed (test environments use a fake
		// `git` binary that just `exit 0`). Fall back to cwd so tests stay
		// scoped to their tmp project dir.
		if (!gitCommonDir) {
			root = cwd
		} else {
			const absCommonDir = gitCommonDir.startsWith("/")
				? gitCommonDir
				: resolve(cwd, gitCommonDir)
			// dirname strips trailing /.git → primary worktree path
			root = resolve(absCommonDir, "..")
		}
	} catch {
		root = cwd
	}
	_primaryRepoRoot = { cwd, root }
	return root
}

// ── Inline quality gates (for hookless harnesses) ─────────────────────────
//
// Mirrors the quality-gate Stop hook logic but runs inside haiku_unit_advance_hat.
// Returns an error object if any gate fails, or null if all pass.

export function runInlineQualityGates(
	intentSlug: string,
	unitPath: string,
): {
	error: string
	message: string
	failures: Array<{
		name: string
		command: string
		exit_code: number
		output: string
	}>
} | null {
	// Read quality_gates from intent and unit frontmatter
	const root = findHaikuRoot()
	const intentFile = join(root, "intents", intentSlug, "intent.md")

	function readGates(filePath: string): Array<Record<string, string>> {
		if (!existsSync(filePath)) return []
		const raw = readFileSync(filePath, "utf8")
		const { data } = parseFrontmatter(raw)
		const gates = data.quality_gates
		if (!Array.isArray(gates)) return []
		return gates as Array<Record<string, string>>
	}

	const intentGates = readGates(intentFile)
	const unitGates = readGates(unitPath)
	const allGates = [...intentGates, ...unitGates]
	if (allGates.length === 0) return null

	// Resolve repo root for cwd
	let repoRoot = process.cwd()
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", {
			encoding: "utf8",
		}).trim()
	} catch {
		/* use cwd */
	}

	const failures: Array<{
		name: string
		command: string
		exit_code: number
		output: string
	}> = []

	for (let i = 0; i < allGates.length; i++) {
		const gate = allGates[i]
		const gateName = gate.name ?? `gate-${i}`
		const gateCmd = gate.command ?? ""
		if (!gateCmd) continue

		const cwd = gate.dir ? resolve(repoRoot, gate.dir) : repoRoot

		// Per-gate timeout defaults to 120s; override via HAIKU_GATE_TIMEOUT_MS.
		// Aligned with the post-execute gate runner in `validators.ts` so the
		// inline (per-hat) and end-of-stage runners give a gate the same budget.
		const gateTimeoutMs =
			Number.parseInt(process.env.HAIKU_GATE_TIMEOUT_MS ?? "", 10) || 120_000
		try {
			execSync(gateCmd, {
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
			}
			failures.push({
				name: gateName,
				command: gateCmd,
				exit_code: execErr.status ?? 1,
				output: ((execErr.stdout ?? "") + (execErr.stderr ?? "")).slice(0, 500),
			})
		}
	}

	if (failures.length === 0) return null

	return {
		error: "quality_gate_failed",
		message: `Cannot advance hat: ${failures.length} quality gate(s) failed. Fix the issues and try again.\n${failures.map((f) => `- ${f.name}: '${f.command}' exited ${f.exit_code}${f.output ? `: ${f.output}` : ""}`).join("\n")}`,
		failures,
	}
}

// ── Path resolution ────────────────────────────────────────────────────────

// findHaikuRoot is imported + re-exported above (alongside isGitRepo + the
// test-override hooks) — single source of truth in `./state/shared.js`.

export function intentDir(slug: string): string {
	return join(findHaikuRoot(), "intents", slug)
}

// ── Intent-status helpers (V-06: shared parser, no substring checks) ───────
//
// `isIntentLocked(intentDir)` and `isIntentArchived(intentDir)` are the
// canonical shared helpers used by every code path that asks "is this
// intent locked?" or "is this intent archived?". They parse the
// `intent.md` frontmatter via `gray-matter` so YAML quoting / whitespace
// variants (`status: 'locked'`, `status:    locked`, `status: "archived"`,
// etc.) all classify correctly, and so body text containing the literal
// substring `status: locked` (e.g. an operator runbook excerpt) does NOT
// trip a false positive.
//
// `intentDirAbsPath` is the absolute path returned by `intentDir(slug)`
// (or unitIntentDir, etc.). Both helpers swallow filesystem and parse
// errors and return `false` on any failure — caller treats unknown state
// as "not locked / not archived" so missing files don't block writes.
//
// Locked check inspects `status === "locked"`. Archived check inspects
// EITHER `status === "archived"` (legacy/terminal path) OR
// `archived === true` (new boolean field used by haiku_intent_archive /
// haiku_intent_unarchive). Both forms have to classify as archived for
// upload-route + MCP-tool gates to agree on intent state.

/** Return true when the intent at `intentDirAbsPath` has frontmatter
 *  `status: locked` (any YAML quoting). False on parse error or missing
 *  file — callers treat unknown state as "not locked". */
export function isIntentLocked(intentDirAbsPath: string): boolean {
	try {
		const intentFile = join(intentDirAbsPath, "intent.md")
		if (!existsSync(intentFile)) return false
		const raw = readFileSync(intentFile, "utf-8")
		const { data } = matter(raw)
		return (data as Record<string, unknown>).status === "locked"
	} catch {
		return false
	}
}

/** Return true when the intent at `intentDirAbsPath` is archived via
 *  EITHER `status: archived` (legacy) OR `archived: true` (boolean
 *  field). False on parse error or missing file. */
export function isIntentArchived(intentDirAbsPath: string): boolean {
	try {
		const intentFile = join(intentDirAbsPath, "intent.md")
		if (!existsSync(intentFile)) return false
		const raw = readFileSync(intentFile, "utf-8")
		const { data } = matter(raw)
		const fm = data as Record<string, unknown>
		return fm.status === "archived" || fm.archived === true
	} catch {
		return false
	}
}

// ── Author-identity attribution (V-03: claim, not authority) ───────────────
//
// `claimed_author_id` is the canonical attribution field on
// `write-audit.jsonl` and `action-log.jsonl` entries written by both
// `haiku_human_write` (MCP) and the SPA upload routes (HTTP). It is
// SELF-REPORTED — the agent or the SPA submitter says who they are, the
// server records it as a CLAIM, no cross-check is performed. The legacy
// field name `human_author_id` was misleading because consumers (and
// reviewers reading audit logs) treated it as an authoritative identity
// when it has always been agent-supplied. The rename matches VULN-REPORT
// V-03 fix #2.
//
// Forward-only audit semantics: existing on-disk lines retain their
// legacy `human_author_id` key unchanged (audit logs are append-only).
// Readers MUST honour `claimed_author_id ?? human_author_id` so legacy
// records continue to surface attribution. Writers MUST stamp the new
// `claimed_author_id` field on every new line.
//
// Server-side identity binding (Option A) is explicitly OUT OF SCOPE
// here and tracked as a follow-up: the SPA session table has no
// reviewer-email field today, and capturing one requires a session-
// bootstrap UI flow + ReviewSession schema extension. Until that lands,
// renaming the field is the integrity-honest path: consumers see "this
// is what the caller claimed" rather than "this is who wrote the file".

/** Read the attribution claim from an audit-log or action-log record,
 *  honouring the rename precedence: `claimed_author_id ?? human_author_id`.
 *  Returns null when neither field is present or both are null. */
export function readClaimedAuthorId(
	record: Record<string, unknown>,
): string | null {
	const claimed = record.claimed_author_id
	if (typeof claimed === "string" && claimed.length > 0) return claimed
	const legacy = record.human_author_id
	if (typeof legacy === "string" && legacy.length > 0) return legacy
	return null
}

// ── Intent-scope tick counter (V-05: deterministic SPA-upload tick) ────────
//
// `getIntentScopeTickCounter(intentDirAbsPath)` returns a deterministic
// monotonically-increasing counter scoped to the intent (NOT to any
// individual stage). Used by the SPA upload route when `stage === null`
// (intent-scope `knowledge/` uploads) so two consecutive uploads in the
// same wall-clock millisecond can't pick non-deterministic tick values
// from `readdirSync` order across stage state.json files.
//
// Storage: a single integer in `.haiku/intents/{slug}/intent-tick.json`
// alongside intent.md. Each call atomically increments and returns the
// new value. The counter is independent from per-stage `state.json
// .iteration` counters — the drift gate's consumer-side fix unions
// per-stage and intent-scope action-log entries when classifying tracked
// files, so the two counters never need to share a key space.
//
// The drift gate's per-tick action-log lookup
// (`drift-detection-gate.ts`) reads BOTH the firing stage's tick AND
// every intent-scope tick observed for the file via the
// `intentScopeActionLog` union. That's why the producer-side counter
// being deterministic is necessary but not sufficient — the consumer
// fix lives in `drift-detection-gate.ts`.
//
// Concurrency: this implementation is a best-effort single-process
// counter. Two concurrent SPA uploads from the same MCP process see
// distinct returned values because the read-increment-write happens on
// the JS single thread before the next `await` boundary. The persisted
// value is durable because the producer writes the file via
// tempfile + atomic-rename BEFORE returning, so a follow-up call (in
// the same process or a fresh one) reads the just-incremented value
// rather than the prior. Cross-process races (an attacker spawning a
// second MCP) are not in scope; a real fix for that lives in the
// audit-log hash-chaining follow-up.

/** Path to the intent-scope tick counter file. */
function intentScopeTickPath(intentDirAbsPath: string): string {
	return join(intentDirAbsPath, "intent-tick.json")
}

/** Thrown when `getIntentScopeTickCounter` cannot persist the
 *  incremented value. Callers MUST fail their request rather than swallow
 *  this — silently returning a non-persisted value would re-issue the same
 *  counter on the next call and collide entry IDs in the V-05 producer
 *  contract (see drift-detection-gate.ts consumer-side fix). */
export class IntentScopeTickPersistError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "IntentScopeTickPersistError"
	}
}

/** Atomically read, increment, and persist the intent-scope tick
 *  counter, returning the freshly-incremented value (so the first call
 *  returns 1, second returns 2, etc.) — never returns 0 to avoid
 *  colliding with the per-stage tick-counter sentinel.
 *
 *  Atomicity (single-process): the increment is computed on the JS
 *  single thread and persisted via tempfile + `renameSync` BEFORE the
 *  function returns. POSIX `rename(2)` is a single syscall — a concurrent
 *  reader either sees the prior value or the new value, never a partial
 *  write. The tempfile lives in the same directory as the target so the
 *  rename is same-filesystem (atomic).
 *
 *  V-04 (Symlink TOCTOU): does NOT use `mkdirSync(..., { recursive: true })`.
 *  The intent dir is the workflow engine's substrate — its non-existence
 *  here is a corruption signal, not something the producer should paper
 *  over with a recursive create. We `lstatSync` the intent dir to refuse
 *  symlinks, then assert it's a real directory; the tempfile + rename are
 *  parented at the intent dir so we re-use the same filesystem object the
 *  workflow engine validated on intent setup.
 *
 *  Failure mode: if the persistence step fails (disk full, permission
 *  denied, parent dir missing or replaced by a symlink), throws
 *  `IntentScopeTickPersistError`. Callers MUST surface a hard failure
 *  rather than swallow — returning a non-persisted value would reissue
 *  the same counter on the next call, breaking the V-05 collision-free
 *  entry-id contract.
 *
 *  Synchronous for the same reason `getCurrentTickCounter` is
 *  synchronous: the upload-route handler calls it inline and the
 *  drift-gate consumer reads the resulting action-log entry on the
 *  next tick (also synchronously). */
export function getIntentScopeTickCounter(intentDirAbsPath: string): number {
	const tickFile = intentScopeTickPath(intentDirAbsPath)
	const tickDir = dirname(tickFile)

	// V-04 chokepoint: refuse to create the parent dir. If it doesn't
	// exist or is a symlink, that's a corruption signal — not something
	// the counter producer is allowed to silently work around.
	try {
		const st = lstatSync(tickDir)
		if (st.isSymbolicLink()) {
			throw new IntentScopeTickPersistError(
				`intent dir '${tickDir}' is a symlink — refusing (V-04)`,
			)
		}
		if (!st.isDirectory()) {
			throw new IntentScopeTickPersistError(
				`intent dir '${tickDir}' exists but is not a directory`,
			)
		}
	} catch (err) {
		if (err instanceof IntentScopeTickPersistError) throw err
		throw new IntentScopeTickPersistError(
			`cannot stat intent dir '${tickDir}': ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	// Read current. A read failure (corrupt JSON, transient I/O) resets to
	// 0 so the next persist starts the counter at 1. The persist step's
	// hard-throw guarantees that even a "reset to 0" path can't return a
	// non-durable value to the caller.
	let current = 0
	try {
		if (existsSync(tickFile)) {
			const raw = readFileSync(tickFile, "utf-8")
			const parsed = JSON.parse(raw) as { tick?: unknown }
			if (typeof parsed.tick === "number" && parsed.tick >= 0) {
				current = parsed.tick
			}
		}
	} catch {
		current = 0
	}
	const next = current + 1

	// Tempfile + atomic rename. Tempfile lives in the intent dir (same
	// filesystem as the target) so `renameSync` is a single syscall and
	// either lands fully or not at all. Random suffix avoids collisions
	// across concurrent writers in the same process.
	const tmpPath = join(
		tickDir,
		`.intent-tick-${process.pid}-${randomBytes(6).toString("hex")}.json.tmp`,
	)
	try {
		writeFileSync(tmpPath, JSON.stringify({ tick: next }, null, 2))
		renameSync(tmpPath, tickFile)
	} catch (err) {
		// Best-effort cleanup of the tempfile if the rename never landed.
		try {
			unlinkSync(tmpPath)
		} catch {
			// already gone or never created — ignore
		}
		throw new IntentScopeTickPersistError(
			`failed to persist intent-scope tick counter at '${tickFile}': ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	return next
}

/**
 * Return the unit's worktree intent dir if the worktree exists on disk,
 * else the main intent dir. Used to validate unit-produced artifacts BEFORE
 * the worktree merges back to the parent branch — otherwise validation
 * runs against the parent's (still stale) copy and false-reports missing.
 */
export function unitIntentDir(slug: string, unit: string): string {
	// Unit worktrees live under the primary repo's `.haiku/worktrees/`,
	// not the local view from a Claude Code worktree. See
	// `getUnitWorktreeChanges` for the same convention.
	const workTreePath = join(
		primaryRepoRoot(),
		".haiku",
		"worktrees",
		slug,
		unit,
	)
	const workTreeIntentDir = join(workTreePath, ".haiku", "intents", slug)
	if (existsSync(workTreeIntentDir)) return workTreeIntentDir
	return intentDir(slug)
}

/**
 * Check if an intent-relative output path exists in either the unit's
 * worktree or the main intent dir. Returns true if present at EITHER location.
 */
export function unitOutputExists(
	slug: string,
	unit: string,
	outputPath: string,
): boolean {
	// Intent-relative: main intent dir or the unit worktree's intent dir.
	const mainResolved = resolve(intentDir(slug), outputPath)
	if (existsSync(mainResolved)) return true
	// Unit worktrees live under the primary repo (see unitIntentDir).
	const wtRoot = join(primaryRepoRoot(), ".haiku", "worktrees", slug, unit)
	const wtIntentDir = join(wtRoot, ".haiku", "intents", slug)
	if (existsSync(wtIntentDir)) {
		const wtResolved = resolve(wtIntentDir, outputPath)
		if (existsSync(wtResolved)) return true
	}
	// Repo-relative: auto-populated outputs from `scope: repo` stages record
	// paths like `packages/foo/src/bar.ts`. Resolve against the repo root
	// (two levels up from .haiku) or, if running in the unit worktree, the
	// worktree root itself.
	const repoRoot = (() => {
		try {
			return execSync("git rev-parse --show-toplevel", {
				encoding: "utf8",
			}).trim()
		} catch {
			return null
		}
	})()
	if (repoRoot) {
		const repoResolved = resolve(repoRoot, outputPath)
		if (existsSync(repoResolved)) return true
	}
	if (existsSync(wtRoot)) {
		const wtRepoResolved = resolve(wtRoot, outputPath)
		if (existsSync(wtRepoResolved)) return true
	}
	return false
}

export function stageDir(slug: string, stage: string): string {
	return join(intentDir(slug), "stages", stage)
}

export function unitPath(slug: string, stage: string, unit: string): string {
	const name = unit.endsWith(".md") ? unit : `${unit}.md`
	const dir = join(stageDir(slug, stage), "units")
	const exact = join(dir, name)
	if (existsSync(exact)) return exact
	// Width-flexible numeric-prefix lookup. Migration path for intents
	// authored with 2-digit padding (`unit-01-foo.md`) when the agent
	// passes 3-digit (`unit-001-foo`) or vice versa. Match by leading
	// digit prefix + post-digit slug suffix, ignoring zero-pad width.
	const m = name.match(/^unit-(\d+)-(.+)\.md$/)
	if (!m) return exact
	const targetNum = Number.parseInt(m[1], 10)
	const targetSlug = m[2]
	if (!existsSync(dir)) return exact
	const matches = readdirSync(dir).filter((f) => {
		const fm = f.match(/^unit-(\d+)-(.+)\.md$/)
		if (!fm) return false
		return Number.parseInt(fm[1], 10) === targetNum && fm[2] === targetSlug
	})
	if (matches.length === 1) return join(dir, matches[0])
	return exact
}

export function stageStatePath(slug: string, stage: string): string {
	return join(stageDir(slug, stage), "state.json")
}

/**
 * Minimal glob matcher. Accepts:
 *   - exact path: "stages/design/artifacts/foo.html"
 *   - directory path (prefix match): "stages/design/artifacts/" or "stages/design/artifacts"
 *   - single-star glob: "stages/design/artifacts/*.html"
 *   - double-star glob: trailing or mid-string (e.g. packages\/&#42;&#42;\/src)
 *
 * Exported for direct testing (no stable API guarantee).
 */
export function matchesGlob(candidate: string, pattern: string): boolean {
	const c = candidate.replace(/^\.\//, "")
	const p = pattern.replace(/^\.\//, "")
	if (c === p) return true
	// Directory prefix: pattern ends with / or /** or is a plain dir
	if (p.endsWith("/**")) {
		const prefix = p.slice(0, -3)
		return c === prefix || c.startsWith(`${prefix}/`)
	}
	if (p.endsWith("/")) {
		return c.startsWith(p)
	}
	// Plain dir (no trailing slash, no star): treat as prefix if candidate is under it
	if (!p.includes("*") && c.startsWith(`${p}/`)) return true
	// Star wildcards: convert to regex. Use a NUL placeholder for `**` so
	// the subsequent single-`*` expansion doesn't re-expand the `.*`.
	if (p.includes("*")) {
		const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		// Sentinel-swap trick: replace `**` with \x00 first (so the next step
		// doesn't eat them), replace `*` with the single-segment regex, then
		// restore \x00 as the multi-segment regex. Both regex literals
		// reference \x00 intentionally — biome's control-char rule is
		// suppressed below because the sentinel is the point of this code.
		const doubleStar = /\*\*/g
		// biome-ignore lint/suspicious/noControlCharactersInRegex: \x00 sentinel restored after escaping single *
		const sentinel = /\x00/g
		const regex = new RegExp(
			`^${esc
				.replace(doubleStar, "\x00")
				.replace(/\*/g, "[^/]*")
				.replace(sentinel, ".*")}$`,
		)
		return regex.test(c)
	}
	return false
}

/**
 * List files changed in the unit's worktree since it forked from its stage
 * branch. Returns paths relative to the worktree root (i.e. intent root).
 * Git-only. Returns null if not in git mode or worktree missing.
 */
function getUnitWorktreeChanges(
	slug: string,
	unit: string,
	stage: string,
): string[] | null {
	if (!isGitRepo()) return null
	const unitBase = unit.replace(/\.md$/, "")
	// Unit worktrees always live under the primary repo's `.haiku/worktrees/`
	// — never under a nested Claude Code worktree's view of `.haiku/`.
	// Mirrors the convention `primaryRepoRoot()` already enforces for
	// `.claude/worktrees/`.
	const worktreePath = join(
		primaryRepoRoot(),
		".haiku",
		"worktrees",
		slug,
		unitBase,
	)
	if (!existsSync(worktreePath)) return null
	try {
		const unitBranch = `haiku/${slug}/${unitBase}`
		const stageBranch = `haiku/${slug}/${stage}`
		// Fork point between unit and stage branches.
		const forkSha = execSync(`git merge-base ${unitBranch} ${stageBranch}`, {
			cwd: worktreePath,
			encoding: "utf8",
		})
			.toString()
			.trim()
		// Committed changes since fork + uncommitted working-tree changes.
		// Uncommitted writes matter because a subagent might write a file
		// outside scope, not commit it, and "pass" scope validation — then
		// the file gets lost on merge. Include staged + unstaged diffs.
		const lines = new Set<string>()
		const add = (s: string) => {
			for (const line of s.split("\n").map((l) => l.trim())) {
				if (line) lines.add(line)
			}
		}
		add(
			execSync(`git diff --name-only ${forkSha}..HEAD`, {
				cwd: worktreePath,
				encoding: "utf8",
			}).toString(),
		)
		// Unstaged (working tree vs HEAD).
		add(
			execSync("git diff --name-only HEAD", {
				cwd: worktreePath,
				encoding: "utf8",
			}).toString(),
		)
		// Staged (index vs HEAD).
		add(
			execSync("git diff --name-only --cached", {
				cwd: worktreePath,
				encoding: "utf8",
			}).toString(),
		)
		// Untracked files too (new files the subagent created but didn't add).
		add(
			execSync("git ls-files --others --exclude-standard", {
				cwd: worktreePath,
				encoding: "utf8",
			}).toString(),
		)
		return [...lines]
	} catch {
		return null
	}
}

/**
 * Compute the allowed write scope for a stage. Derives from:
 *   - Stage output templates' `location:` fields (with `scope:` intent|repo)
 *   - Stage discovery templates' `location:` fields (for pre-execute hats)
 *   - Always-allowed workflow engine metadata paths
 *
 * Returns { intentGlobs, repoGlobs, repoWildcard } where:
 *   - intentGlobs: globs to match against intent-relative paths
 *   - repoGlobs:   globs to match against repo-relative paths
 *   - repoWildcard: true if any template declared `scope: repo` with a
 *     non-specific location ("(project source tree)", "anywhere", empty) —
 *     in which case any repo-level write is allowed.
 */
function computeStageScope(
	slug: string,
	studio: string,
	stage: string,
	unit: string,
): { intentGlobs: string[]; repoGlobs: string[]; repoWildcard: boolean } {
	const unitBase = unit.replace(/\.md$/, "")
	const intentGlobs: string[] = [
		// Unit spec itself — only THIS unit's file. Cross-unit writes
		// (unit-04 writing to unit-05.md) are a scope violation.
		`stages/${stage}/units/${unitBase}.md`,
		// Stage workflow engine bookkeeping
		`stages/${stage}/state.json`,
		`stages/${stage}/iteration.json`,
		// Feedback written by reviewers to this stage (reviewer agents,
		// feedback-assessor)
		`stages/${stage}/feedback/**`,
		// Stage artifacts and outputs (covered by output templates below,
		// but listed here as a baseline for stages that use these dirs
		// without declaring every artifact in a template)
		`stages/${stage}/artifacts/**`,
		`stages/${stage}/outputs/**`,
		// Discovery artifacts authored during this stage's elaborate phase
		`stages/${stage}/discovery/**`,
		// Intent-level sealing + integrity artifacts
		"state/**",
		".integrity.json",
		// Discovery knowledge (populated by early hats, read by later)
		"knowledge/**",
	]
	const repoGlobs: string[] = []
	let repoWildcard = false

	// Pull stage's artifact definitions (discovery + outputs)
	const defs = readStageArtifactDefs(studio, stage)

	for (const def of defs) {
		const loc = (def.location || "").trim()
		const declaredScope = def.scope || "intent"
		if (!loc) {
			if (declaredScope === "repo") repoWildcard = true
			continue
		}
		// Heuristic: locations wrapped in parentheses are descriptive
		// placeholders ("(project source tree)", "(anywhere)"), not globs.
		if (loc.startsWith("(") && loc.endsWith(")")) {
			if (declaredScope === "repo") repoWildcard = true
			continue
		}
		// Substitute common template tokens. We support the canonical ones
		// present in current studios; unknown tokens leave the literal glob
		// in place (the matcher treats unmatched tokens as path chars and
		// will simply never match — safe default).
		const expanded = loc
			.replace(/\{intent-slug\}/g, slug)
			.replace(/\{stage\}/g, stage)
		if (declaredScope === "repo") {
			repoGlobs.push(expanded)
		} else {
			// Intent-scoped: strip the `.haiku/intents/{slug}/` prefix if the
			// location was written as an absolute-in-intent path.
			const prefix = `.haiku/intents/${slug}/`
			const stripped = expanded.startsWith(prefix)
				? expanded.slice(prefix.length)
				: expanded
			intentGlobs.push(stripped)
		}
	}
	return { intentGlobs, repoGlobs, repoWildcard }
}

/**
 * List changed files for this unit since its worktree forked from the stage
 * branch. Returns null if we can't determine the diff reliably.
 *
 * Scope enforcement is a GIT-mode feature. Filesystem-mode (no git) falls
 * through to no changes — mtime is too noisy a heuristic in practice
 * (fixture creation, metadata touches, editor saves all update mtime), and
 * surfacing false-positive violations degrades the UX more than having no
 * enforcement. Users wanting structural scope enforcement must run in git
 * mode.
 */
function getUnitChanges(
	slug: string,
	stage: string,
	unit: string,
	_hatStartedAt: string | undefined,
): string[] {
	const gitChanged = getUnitWorktreeChanges(slug, unit, stage)
	if (gitChanged !== null) return gitChanged
	return []
}

/**
 * Classify a changed-file path against the stage's scope. Returns true if
 * the path is allowed, false if it's a scope violation.
 */
function pathInStageScope(
	file: string,
	slug: string,
	scope: { intentGlobs: string[]; repoGlobs: string[]; repoWildcard: boolean },
	gitMode: boolean,
): boolean {
	// Intent-relative view if the file is inside the intent dir.
	const intentPrefix = `.haiku/intents/${slug}/`
	const intentRel = gitMode
		? file.startsWith(intentPrefix)
			? file.slice(intentPrefix.length)
			: null
		: file // filesystem mode: already intent-relative

	if (intentRel !== null) {
		if (scope.intentGlobs.some((g) => matchesGlob(intentRel, g))) return true
	}
	// If git-mode and file is outside the intent dir, it's a repo-level write.
	if (gitMode && intentRel === null) {
		if (scope.repoWildcard) return true
		if (scope.repoGlobs.some((g) => matchesGlob(file, g))) return true
	}
	return false
}

/**
 * Auto-track writes into unit.outputs[]. Called at advance_hat to record
 * what the unit actually wrote. Harness-agnostic replacement for the CC
 * track-outputs PostToolUse hook (which keeps working for real-time CC
 * tracking but isn't required).
 *
 * Always-allowed workflow engine metadata paths (state.json, iteration.json, unit
 * spec, feedback/, state/, .integrity.json) are excluded — those are
 * harness bookkeeping, not unit deliverables.
 */
function autoPopulateOutputs(
	slug: string,
	stage: string,
	unit: string,
	changed: string[],
): void {
	if (changed.length === 0) return
	const spec = unitPath(slug, stage, unit)
	if (!existsSync(spec)) return
	const raw = readFileSync(spec, "utf8")
	const { data, content } = matter(raw)
	const existing = new Set<string>(
		((data.outputs as string[]) || []).map((o) => o),
	)
	const unitBase = unit.replace(/\.md$/, "")
	const bookkeeping = new Set<string>([
		`stages/${stage}/units/${unitBase}.md`,
		`stages/${stage}/state.json`,
		`stages/${stage}/iteration.json`,
		".integrity.json",
	])
	const bookkeepingPrefixes = [`stages/${stage}/feedback/`, "state/"]
	const gitMode = isGitRepo()
	const intentPrefix = `.haiku/intents/${slug}/`
	const toAdd: string[] = []
	for (const file of changed) {
		// Normalize to intent-relative if inside intent dir (git-mode);
		// filesystem mode paths are already intent-relative.
		const intentRel = gitMode
			? file.startsWith(intentPrefix)
				? file.slice(intentPrefix.length)
				: null
			: file
		// Skip harness bookkeeping
		if (intentRel !== null) {
			if (bookkeeping.has(intentRel)) continue
			if (bookkeepingPrefixes.some((p) => intentRel.startsWith(p))) continue
		}
		// Record the path in its natural form: intent-relative when inside the
		// intent dir, repo-relative otherwise.
		const record = intentRel ?? file
		if (existing.has(record)) continue
		existing.add(record)
		toAdd.push(record)
	}
	if (toAdd.length === 0) return
	const merged = [...((data.outputs as string[]) || []), ...toAdd]
	data.outputs = merged
	writeFileSync(spec, matter.stringify(content, data))
}

/**
 * Validate that the unit's writes stay within the stage's declared scope
 * (output templates + always-allowed workflow engine metadata). Called at unit
 * completion (last hat advance_hat) BEFORE the worktree merges back.
 *
 * Scope source of truth:
 *   - Stage's output templates' `location:` + `scope:` fields (intent|repo)
 *   - Templates with `scope: repo` and descriptive locations ("(project
 *     source tree)") grant a repo-wide wildcard
 *   - Always-allowed workflow engine metadata (unit spec, state files, feedback dir,
 *     intent state dir, integrity, knowledge)
 *
 * Unit.outputs[] is AUTO-POPULATED from the diff as a side effect — no
 * CC hook dependency. The outputs list becomes a record of actual writes.
 *
 * Returns {violations, scope} if scope was violated, or null if OK.
 */
export function validateUnitScope(
	slug: string,
	studio: string,
	stage: string,
	unit: string,
): {
	violations: string[]
	scope: { intentGlobs: string[]; repoGlobs: string[]; repoWildcard: boolean }
} | null {
	const spec = unitPath(slug, stage, unit)
	if (!existsSync(spec)) return null
	const { data } = parseFrontmatter(readFileSync(spec, "utf8"))
	const hatStartedAt = data.hat_started_at as string | undefined

	const changed = getUnitChanges(slug, stage, unit, hatStartedAt)
	if (changed.length === 0) return null

	const scope = computeStageScope(slug, studio, stage, unit)
	const gitMode = isGitRepo()
	const violations: string[] = []
	for (const file of changed) {
		if (!pathInStageScope(file, slug, scope, gitMode)) {
			violations.push(file)
		}
	}

	// Only auto-populate outputs[] when scope is clean. Writing violating
	// paths into outputs[] would pollute the unit spec: after the agent
	// reverts the bad file, the unit would fail `unit_outputs_missing` on
	// the next advance for a path it never meant to record.
	if (violations.length > 0) {
		return { violations, scope }
	}
	autoPopulateOutputs(slug, stage, unit, changed)
	return null
}

// ── Iteration tracking ─────────────────────────────────────────────────────
// Stage-level iterations replace the legacy scalar `visits` counter. Each
// entry records why a fresh elaborate cycle started (trigger), when it
// opened, when it closed, and what resolved it (result), and a signature
// of the feedback set that drove it (for loop detection).

export type StageIterationTrigger =
	| "initial"
	| "external-changes"
	| "feedback"
	| "user-revisit"

export type StageIterationResult =
	| "advanced"
	| "feedback-revisit"
	| "external-changes"
	| "user-revisit"
	| "rejected"

export interface StageIteration {
	index: number
	started_at: string
	completed_at: string | null
	trigger: StageIterationTrigger
	result: StageIterationResult | null
	reason?: string
	/** SHA1 of the sorted-joined feedback titles pending at the moment this
	 *  iteration opened. Two consecutive iterations with the same signature
	 *  indicate a loop — the agent keeps generating the same findings. */
	feedback_signature?: string
}

/** Maximum number of agent-invoked iterations allowed before the workflow engine
 *  escalates to the human. User-invoked revisits (`trigger: "user-revisit"`)
 *  are NOT capped — explicit user intent always wins.
 *
 *  Dropped from 5 → 2 (2026-04-19): the goal is 0 rejections via upfront
 *  spec rigor (pre-execution adversarial review + full-stage gate scope +
 *  executable gates). Two agent-invoked retries is enough to catch the
 *  rare emergent issue; more than that indicates a spec problem the human
 *  must resolve. */
export const MAX_STAGE_ITERATIONS = 2

/**
 * Maximum number of bolts (full hat-sequence iterations) a unit can run.
 *
 * Used by THREE distinct rejection paths — keep them coupled here so the
 * limit doesn't silently diverge if one is tuned:
 *   - `haiku_unit_advance_hat`: per-hat `run_quality_gates: true` auto-reject
 *     when gates fail (counts as a bolt; same hat retries).
 *   - `haiku_unit_reject_hat`: explicit reject by the agent (drops back one
 *     hat, increments bolt).
 *   - `haiku_unit_increment_bolt`: agent-driven increment (rare; legacy).
 *
 * Exceeding this cap surfaces `max_bolts_exceeded` to the user — the unit
 * needs structural intervention (spec rewrite, manual revert, split), not
 * another retry. Tune at this single source if the cap proves wrong in
 * practice; do NOT inline a different number elsewhere.
 */
export const MAX_UNIT_BOLTS = 5

/** Build a loop-detection signature from a list of feedback titles.
 *  Stable hash of the sorted, normalized title set. */
export function computeFeedbackSignature(titles: string[]): string {
	const norm = titles
		.map((t) => (t || "").trim().toLowerCase())
		.filter((t) => t.length > 0)
		.sort()
	if (norm.length === 0) return ""
	// Lazy sha1 — avoid dragging in crypto for large surface area. djb2 is
	// plenty for detecting "same set of findings as last iteration".
	let hash = 5381
	for (const s of norm) {
		for (let i = 0; i < s.length; i++) {
			hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0
		}
		hash = ((hash << 5) + hash + 0x2c) | 0 // comma separator
	}
	return `sig:${(hash >>> 0).toString(16)}`
}

export interface AppendIterationResult {
	count: number
	exceeded: boolean
	loopDetected: boolean
	signature: string
}

/** Path to the per-stage iteration log. v4 disk-artifact home —
 *  replaces state.json's `iterations[]` array. JSONL append-only:
 *  every appendStageIteration writes one line, every
 *  closeCurrentStageIteration appends a "close" line. Read by
 *  re-folding the lines into the in-memory iteration array. */
function stageIterationsPath(slug: string, stage: string): string {
	return join(stageDir(slug, stage), "iterations.jsonl")
}

/** Path to the per-stage decision log. v4 disk-artifact home —
 *  replaces state.json's `decision_log[]` array. JSONL append-only:
 *  every `haiku_decision_record` (and the implicit acknowledgement
 *  in `haiku_reconciliation_acknowledge`) appends one line. */
function stageDecisionLogPath(slug: string, stage: string): string {
	return join(stageDir(slug, stage), "decisions.jsonl")
}

/** Append a structured decision-log entry to the per-stage JSONL.
 *  Mirrors `appendIterationLogLine` — best-effort, never throws.
 *  Caller is the engine path that just made the decision; the log is
 *  provenance, not state of record. */
function appendDecisionLogLine(
	slug: string,
	stage: string,
	line: Record<string, unknown>,
): void {
	const path = stageDecisionLogPath(slug, stage)
	try {
		mkdirSync(dirname(path), { recursive: true })
		appendFileSync(path, `${JSON.stringify(line)}\n`)
	} catch (err) {
		console.error(
			`[haiku] failed to append decision log for ${slug}/${stage}: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
}

/** Read all decision-log entries for a stage. Returns an empty array
 *  when the log doesn't exist yet (fresh stage with no decisions). */
function readDecisionLog(
	slug: string,
	stage: string,
): Array<Record<string, unknown>> {
	const path = stageDecisionLogPath(slug, stage)
	if (!existsSync(path)) return []
	const raw = readFileSync(path, "utf8")
	const out: Array<Record<string, unknown>> = []
	for (const line of raw.split("\n")) {
		const trimmed = line.trim()
		if (!trimmed) continue
		try {
			out.push(JSON.parse(trimmed) as Record<string, unknown>)
		} catch {
			// malformed line — skip
		}
	}
	return out
}

/** Reduce the iterations.jsonl log into the canonical in-memory array.
 *  Each "open" line opens a new entry; the next "close" line attaches
 *  result/completed_at to it. Malformed lines are skipped. */
function readStageIterations(slug: string, stage: string): StageIteration[] {
	const path = stageIterationsPath(slug, stage)
	if (!existsSync(path)) return []
	const raw = readFileSync(path, "utf8")
	const out: StageIteration[] = []
	for (const line of raw.split("\n")) {
		const trimmed = line.trim()
		if (!trimmed) continue
		let parsed: Record<string, unknown>
		try {
			parsed = JSON.parse(trimmed) as Record<string, unknown>
		} catch {
			continue
		}
		if (parsed.kind === "open") {
			out.push({
				index: out.length + 1,
				started_at: (parsed.at as string) || timestamp(),
				completed_at: null,
				trigger: (parsed.trigger as StageIterationTrigger) || "initial",
				result: null,
				...(parsed.reason ? { reason: parsed.reason as string } : {}),
				...(parsed.feedback_signature
					? { feedback_signature: parsed.feedback_signature as string }
					: {}),
			})
		} else if (parsed.kind === "close" && out.length > 0) {
			const last = out[out.length - 1]
			last.completed_at = (parsed.at as string) || timestamp()
			last.result =
				(parsed.result as StageIterationResult) ||
				("advanced" as StageIterationResult)
			if (parsed.reason && !last.reason) last.reason = parsed.reason as string
		}
	}
	return out
}

/** Append a structured line to iterations.jsonl. Best-effort — never
 *  throws; failures are logged but don't roll back the engine
 *  transition that triggered the append. */
function appendIterationLogLine(
	slug: string,
	stage: string,
	line: Record<string, unknown>,
): void {
	const path = stageIterationsPath(slug, stage)
	try {
		mkdirSync(dirname(path), { recursive: true })
		appendFileSync(path, `${JSON.stringify(line)}\n`)
	} catch (err) {
		console.error(
			`[haiku] failed to append iteration log for ${slug}/${stage}: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
}

/** Normalized iteration count — read from the JSONL log. The legacy
 *  `state.json.iterations[]` and `state.json.visits` fields are dead
 *  in v4 engine code; this function reads the disk artifact directly.
 *
 *  Fallback for legacy callers: if `slug`+`stage` are missing OR the
 *  JSONL log is empty, fall back to the passed-in `stageState`'s
 *  `iterations[]`/`visits` so test fixtures and any v3 reader still
 *  produce a stable count. New code should always pass `slug`+`stage`
 *  to read from the disk artifact. */
export function getStageIterationCount(
	stageState: Record<string, unknown>,
	slug?: string,
	stage?: string,
): number {
	if (slug && stage) {
		const fromLog = readStageIterations(slug, stage).length
		if (fromLog > 0) return fromLog
	}
	const arr = stageState.iterations as StageIteration[] | undefined
	if (Array.isArray(arr)) return arr.length
	const legacy = stageState.visits as number | undefined
	return typeof legacy === "number" ? legacy : 0
}

/** Append a new stage iteration. Closes the previous one (if open) with
 *  `prevResult`, then opens a fresh entry.
 *
 *  Returns a result object with:
 *  - count: new iteration count
 *  - exceeded: true when count > MAX_STAGE_ITERATIONS and the trigger is
 *    agent-invoked (`feedback`, `external-changes`). User-invoked revisits
 *    never exceed.
 *  - loopDetected: true when this iteration's `feedback_signature` matches
 *    the previous iteration's — i.e. the same set of findings recurred.
 *  - signature: the signature recorded on the new iteration.
 */
export function appendStageIteration(
	slug: string,
	stage: string,
	entry: {
		trigger: StageIterationTrigger
		reason?: string
		feedbackTitles?: string[]
	},
	prevResult: StageIterationResult = "feedback-revisit",
): AppendIterationResult {
	const iters = readStageIterations(slug, stage)
	const now = timestamp()
	if (iters.length > 0) {
		const last = iters[iters.length - 1]
		if (!last.completed_at) {
			// Implicit close of the prior open iteration. Record the
			// close line so the JSONL log stays a faithful event stream.
			appendIterationLogLine(slug, stage, {
				kind: "close",
				at: now,
				result: prevResult,
			})
		}
	}
	const signature = entry.feedbackTitles
		? computeFeedbackSignature(entry.feedbackTitles)
		: ""
	appendIterationLogLine(slug, stage, {
		kind: "open",
		at: now,
		trigger: entry.trigger,
		...(entry.reason ? { reason: entry.reason } : {}),
		...(signature ? { feedback_signature: signature } : {}),
	})
	iters.push({
		index: iters.length + 1,
		started_at: now,
		completed_at: null,
		trigger: entry.trigger,
		result: null,
		...(entry.reason ? { reason: entry.reason } : {}),
		...(signature ? { feedback_signature: signature } : {}),
	})

	const count = iters.length
	const isAgentInvoked =
		entry.trigger === "feedback" || entry.trigger === "external-changes"
	const exceeded = isAgentInvoked && count > MAX_STAGE_ITERATIONS
	let loopDetected = false
	if (signature && isAgentInvoked && iters.length >= 2) {
		const prev = iters[iters.length - 2]
		if (prev.feedback_signature && prev.feedback_signature === signature) {
			loopDetected = true
		}
	}

	// Per-iteration telemetry so the trend is observable — not just at
	// escalation time. External dashboards can chart iteration count by
	// stage and surface stages climbing toward the cap.
	emitTelemetry("haiku.stage.iteration", {
		intent: slug,
		stage,
		iteration: String(count),
		trigger: entry.trigger,
		signature,
		exceeded: String(exceeded),
		loop_detected: String(loopDetected),
	})

	return { count, exceeded, loopDetected, signature }
}

/** Close the currently-open iteration with a terminal result (used when a
 *  stage advances or is rejected without spawning a new iteration). */
export function closeCurrentStageIteration(
	slug: string,
	stage: string,
	result: StageIterationResult,
	reason?: string,
): void {
	const iters = readStageIterations(slug, stage)
	const now = timestamp()
	if (iters.length === 0) {
		// No prior iteration recorded — synthesize "open" + "close" so
		// the history isn't blank. Two writes keeps the event-stream
		// shape consistent with the normal advance path.
		appendIterationLogLine(slug, stage, {
			kind: "open",
			at: now,
			trigger: "initial",
		})
	}
	appendIterationLogLine(slug, stage, {
		kind: "close",
		at: now,
		result,
		...(reason ? { reason } : {}),
	})
}

// ── Unit iteration tracking ────────────────────────────────────────────────
// Records per-hat progression on the unit itself so the unit frontmatter
// carries its own history (how many hats ran, in what order, with what
// outcome). This is orthogonal to the unit's bolt counter — bolts track
// full designer → reviewer cycles; iterations track individual hat runs.

export type UnitHatResult = "advance" | "reject"

export interface UnitIteration {
	hat: string
	started_at: string
	completed_at: string | null
	result: UnitHatResult | null
	reason?: string
}

/** Append a hat-start event to a unit's iterations. If the previous entry
 *  is still open (no completed_at), leaves it alone — callers should close
 *  the prior one first via completeUnitIteration. */
export function startUnitIteration(unitFile: string, hat: string): void {
	if (!existsSync(unitFile)) return
	const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
	const iters = Array.isArray(data.iterations)
		? (data.iterations as UnitIteration[]).slice()
		: []
	iters.push({
		hat,
		started_at: timestamp(),
		completed_at: null,
		result: null,
	})
	data.iterations = iters
	writeFileSync(unitFile, matter.stringify(body, data))
}

/** Close the most recent iteration on the unit with a result + optional
 *  reason. No-op if the file doesn't exist or no open iteration is found. */
export function completeUnitIteration(
	unitFile: string,
	result: UnitHatResult,
	reason?: string,
): void {
	if (!existsSync(unitFile)) return
	const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
	const iters = Array.isArray(data.iterations)
		? (data.iterations as UnitIteration[]).slice()
		: []
	if (iters.length === 0) return
	const last = iters[iters.length - 1]
	if (last.completed_at) return
	last.completed_at = timestamp()
	last.result = result
	if (reason) last.reason = reason
	data.iterations = iters
	writeFileSync(unitFile, matter.stringify(body, data))
}

// ── Cited-helper validation ───────────────────────────────────────────────
//
// When a unit body cites a specific existing helper at a specific path,
// verify the path exists AND the identifier shows up in that file. The
// rejection catches the "agent hallucinated an existing utility"
// failure mode at write time, before the fix-loop has to land a bolt
// that breaks on import.
//
// We only reject when the citation is structured enough to be
// verifiable. Vague mentions ("use existing helpers") fall through —
// false positives create more friction than the gate's worth.

interface HelperCitation {
	full: string
	identifier: string
	path: string
}

const HELPER_CITATION_PATTERNS: RegExp[] = [
	// "use the existing `<id>` in `<path>`" / "extend the `<id>` in `<path>`"
	/\b(?:use|extend)\s+(?:the\s+)?existing\s+`([A-Za-z_][\w.$]*)`\s+(?:in|from)\s+`([^`]+)`/gi,
	// "extend the `<id>` exported from `<path>`"
	/\bextend\s+(?:the\s+)?`([A-Za-z_][\w.$]*)`\s+exported\s+from\s+`([^`]+)`/gi,
	// "as defined in `<path>`" — no identifier, skipped (vague)
	// Captured for completeness but the visit-loop ignores it (only
	// path-only citations don't have an identifier to grep).
]

function extractHelperCitations(body: string): HelperCitation[] {
	const out: HelperCitation[] = []
	const seen = new Set<string>()
	for (const re of HELPER_CITATION_PATTERNS) {
		// Reset lastIndex since these are global regexes reused across calls.
		re.lastIndex = 0
		for (const m of body.matchAll(re)) {
			const identifier = m[1]
			const path = m[2]
			if (!identifier || !path) continue
			const key = `${identifier}@${path}`
			if (seen.has(key)) continue
			seen.add(key)
			out.push({ full: m[0], identifier, path })
		}
	}
	return out
}

/** Returns null when the body has no verifiable helper citations OR
 *  every citation resolves correctly. Returns an error payload when
 *  any citation names a path that doesn't exist OR an identifier
 *  that's not present in that path. */
function validateCitedHelpers(body: string): Record<string, unknown> | null {
	const citations = extractHelperCitations(body)
	if (citations.length === 0) return null

	const projectRoot = process.cwd()
	const projectRootWithSep = projectRoot.endsWith(sep)
		? projectRoot
		: `${projectRoot}${sep}`

	for (const c of citations) {
		// Resolve candidate to an absolute path, then clamp it inside
		// the project root. Absolute paths from the agent body are
		// resolved as-is; relative paths are joined from process.cwd().
		// Either way, reject anything that escapes the project tree —
		// an agent could otherwise cite /etc/ssl/private/key.pem and
		// trigger the validator to read arbitrary filesystem paths.
		const rawCandidate = c.path.startsWith("/")
			? c.path
			: join(projectRoot, c.path)
		const candidate = resolve(rawCandidate)
		if (
			!candidate.startsWith(projectRootWithSep) &&
			candidate !== projectRoot
		) {
			return {
				error: "cited_helper_not_found",
				citation: c.full,
				path: c.path,
				identifier: c.identifier,
				reason: "path_outside_project",
				message: `Unit body cites \`${c.identifier}\` at \`${c.path}\` but the resolved path escapes the project root. Only paths within the project tree can be cited as existing helpers.`,
			}
		}
		if (!existsSync(candidate)) {
			return {
				error: "cited_helper_not_found",
				citation: c.full,
				path: c.path,
				identifier: c.identifier,
				reason: "path_missing",
				message: `Unit body cites \`${c.identifier}\` at \`${c.path}\` but that path does not exist. Either fix the citation to a real path, or remove the citation if the helper is being introduced by this unit (the elaborate phase tracks NEW symbols separately from cited ones).`,
			}
		}
		try {
			const content = readFileSync(candidate, "utf8")
			// Identifier-grep: check for the identifier under common
			// shapes — `export <kw> <id>`, `function <id>`, `<id>:`
			// (record-style fields), `<id> =`, `<id>(` (call sites).
			const idRe = new RegExp(
				`(?:export[^\\n]*\\b${escapeRegex(c.identifier)}\\b|\\bfunction\\s+${escapeRegex(c.identifier)}\\b|\\b${escapeRegex(c.identifier)}\\s*[:=(])`,
			)
			if (!idRe.test(content)) {
				return {
					error: "cited_helper_not_found",
					citation: c.full,
					path: c.path,
					identifier: c.identifier,
					reason: "identifier_missing_in_path",
					message: `Unit body cites \`${c.identifier}\` at \`${c.path}\` but \`${c.identifier}\` does not appear in that file (looked for export/function/record-field/assignment/call patterns). Either fix the citation, or if you intend to ADD this helper as part of this unit, remove the "existing" qualifier — the citation pattern is for already-shipped code.`,
				}
			}
		} catch {
			// Unreadable — treat as path missing.
			return {
				error: "cited_helper_not_found",
				citation: c.full,
				path: c.path,
				identifier: c.identifier,
				reason: "path_unreadable",
				message: `Unit body cites \`${c.identifier}\` at \`${c.path}\` but that path is unreadable. Fix the citation or remove it.`,
			}
		}
	}
	return null
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ── Banned-test-shape detection on quality_gates ──────────────────────────
//
// Detects gates that trivially pass (assert zero matches on a path
// the unit's own output produces; grep for a literal the implementer
// also writes). False positives are worse than false negatives — only
// reject on unambiguous patterns.

/** Returns null when the unit's quality_gates are well-shaped, or an
 *  error payload when at least one gate is detected as trivially-
 *  passing. */
function validateUnitQualityGateShapes(
	unitName: string,
	fm: Record<string, unknown>,
): Record<string, unknown> | null {
	const gates = Array.isArray(fm.quality_gates)
		? (fm.quality_gates as unknown[])
		: []
	if (gates.length === 0) return null

	// Resolve the unit's own outputs (frontmatter `outputs:` array
	// AND any inferred output from the unit name).
	const outputs = new Set<string>()
	if (Array.isArray(fm.outputs)) {
		for (const o of fm.outputs as unknown[]) {
			if (typeof o === "string") outputs.add(o)
		}
	}

	for (const g of gates) {
		if (typeof g !== "object" || g === null) continue
		const gate = g as Record<string, unknown>
		const gateName = (gate.name as string) || "<unnamed>"
		const command = (gate.command as string) || ""
		if (!command) continue

		// Pattern 1: `! grep ... <path>` where <path> is one of the
		// unit's own declared outputs. This asserts "zero matches in
		// the file the implementer hasn't written yet" — trivially
		// passes until the implementer writes the wrong substring.
		// We detect this by scanning the grep command's non-flag tokens
		// right-to-left and picking the first one that doesn't start
		// with `-`, so trailing flags like `--color=always` don't
		// shadow the path argument.
		const grepMatch = command.match(/!\s*grep([^|]*)$/)
		if (grepMatch) {
			// Pull all whitespace-separated tokens from the grep argument
			// string, skip flags (tokens starting with `-`), and take
			// the last remaining token as the target path.
			const grepArgs = grepMatch[1].trim().split(/\s+/)
			const pathToken = [...grepArgs].reverse().find((t) => !t.startsWith("-"))
			const targetPath = pathToken ? pathToken.replace(/['"`]/g, "") : ""
			for (const o of outputs) {
				if (
					targetPath === o ||
					targetPath.endsWith(`/${o}`) ||
					o.endsWith(targetPath)
				) {
					return {
						error: "gate_trivially_passes",
						gate: gateName,
						unit: unitName,
						pattern: "asserts_zero_matches_on_own_output",
						command,
						message: `Quality gate '${gateName}' on unit '${unitName}' asserts zero matches against \`${targetPath}\`, which is one of the unit's own declared outputs. The gate trivially passes before the unit produces any output — once the implementer writes the wrong substring, the gate first fails. This is a no-op test. Replace it with a positive assertion (\`grep -q "<expected pattern>" "${targetPath}"\`) or a behavior-driven test (run the code, verify the result).`,
					}
				}
			}
		}

		// Pattern 2: `grep -q "<literal>" <path>` where <path> is one of
		// the unit's outputs AND the literal is something the
		// implementer would naturally write. Detected when both paths
		// align — we don't try to predict which literals the
		// implementer would write since that's a judgment call. Instead,
		// flag when the gate greps a literal IN the same file the unit
		// produces, since that's circular.
		const positiveGrep = command.match(
			/\bgrep\s+(?:-[a-zA-Z]+\s+)?["']([^"']+)["']\s+([\S]+)/,
		)
		if (positiveGrep) {
			const literal = positiveGrep[1]
			const targetPath = positiveGrep[2].replace(/['"`]/g, "")
			for (const o of outputs) {
				if (
					targetPath === o ||
					targetPath.endsWith(`/${o}`) ||
					o.endsWith(targetPath)
				) {
					// Only flag when the literal contains a status-y
					// verb-participle ("complete", "done", "finished")
					// — the markers an implementer can trivially drop
					// into their own output to satisfy the gate.
					// Multi-word technical literals (`export default`,
					// `function foo`, `import bar from`) are real
					// shape signal, not prose, so they slip through.
					const prosey =
						/\b(complete|completed|done|finished|implemented|ready|success|passed)\b/i.test(
							literal,
						)
					if (prosey) {
						return {
							error: "gate_trivially_passes",
							gate: gateName,
							unit: unitName,
							pattern: "literal_substring_in_self_authored_output",
							command,
							literal,
							message: `Quality gate '${gateName}' on unit '${unitName}' greps for the literal "${literal}" in \`${targetPath}\`, which is one of the unit's own declared outputs. The implementer can satisfy the gate by writing the literal into their own output — the gate is circular. Replace it with a behavior-driven test (run the code, verify the actual result), not a substring assertion on the file the implementer also writes.`,
						}
					}
				}
			}
		}
	}
	return null
}

// ── Unit frontmatter validation (architecture rule §1.1: workflow engine owns FM) ────
//
// Called from haiku_unit_write before persisting an agent-authored unit.
// Returns either { valid: true } or { valid: false, errors: string[] }.
// Validators are MECHANICAL and DETERMINISTIC — no LLM judgment, no
// interpretation. Each rule has a specific failure mode that maps to a
// concrete error message for the caller.

// ── Schemas + field-name constants ────────────────────────────────────────
//
// JSONSchema definitions (the SSOT for unit / intent / stage_state /
// feedback frontmatter shapes) and their derived
// `AGENT_AUTHORABLE_*_FIELDS` / `FSM_DRIVEN_*_FIELDS` constants live
// in `./state/schemas/` — one file per schema, plus a barrel. They
// were extracted from this file as the first step of breaking up the
// god file — pure data, zero behavior, no fs/git deps.
//
// What JSONSchema covers (enforced by AJV):
//   - allow-list of properties + per-field types
//   - `model` enum
//   - `quality_gates` inner shape (`{name, command, dir?}` with required keys)
//   - `title` minLength
//   - `propertyNames.not.enum` forbids workflow-driven fields
//
// What JSONSchema can NOT cover (runtime context required, lives in
// validateUnitFrontmatter as additional steps):
//   - depends_on self-reference (needs the unit's own name)
//   - depends_on resolves to actual siblings (needs sibling list)
//   - depends_on doesn't form a cycle (needs full stage DAG)
//   - body placeholder strings (needs body inspection)
//   - ghost-FB closes references (needs FB list)

export {
	AGENT_AUTHORABLE_INTENT_FIELDS,
	AGENT_AUTHORABLE_UNIT_FIELDS,
	CREATE_TIME_FB_FIELDS,
	ERROR_OUTPUT_SCHEMA,
	FSM_DRIVEN_FB_FIELDS,
	FSM_DRIVEN_INTENT_FIELDS,
	FSM_DRIVEN_UNIT_FIELDS,
	INTENT_FRONTMATTER_SCHEMA,
	OK_OUTPUT_SCHEMA,
	STAGE_STATE_FIELDS,
	STAGE_STATE_SCHEMA,
	UNIT_FRONTMATTER_SCHEMA,
	validateIntentFrontmatterSchema as validateIntentSchema,
	validateUnitFrontmatterSchema as validateUnitSchema,
} from "./state/schemas/index.js"

import { stateAjv as stateAjvForErrorText } from "./state/schemas/_ajv.js"
import {
	AGENT_AUTHORABLE_INTENT_FIELDS,
	AGENT_AUTHORABLE_UNIT_FIELDS,
	CREATE_TIME_FB_FIELDS,
	FSM_DRIVEN_FB_FIELDS,
	FSM_DRIVEN_INTENT_FIELDS,
	FSM_DRIVEN_UNIT_FIELDS,
	HAIKU_BACKLOG_INPUT_SCHEMA,
	HAIKU_CAPACITY_INPUT_SCHEMA,
	HAIKU_DECISION_RECORD_INPUT_SCHEMA,
	HAIKU_EMPTY_INPUT_SCHEMA,
	HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA,
	HAIKU_FEEDBACK_INPUT_SCHEMA,
	HAIKU_FEEDBACK_LIST_INPUT_SCHEMA,
	HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA,
	HAIKU_FEEDBACK_READ_INPUT_SCHEMA,
	HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_SET_TARGETS_INPUT_SCHEMA,
	HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA,
	HAIKU_INTENT_GET_INPUT_SCHEMA,
	HAIKU_INTENT_LIST_INPUT_SCHEMA,
	HAIKU_INTENT_SET_INPUT_SCHEMA,
	HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA,
	HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA,
	HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA,
	HAIKU_REFLECT_INPUT_SCHEMA,
	HAIKU_RELEASE_NOTES_INPUT_SCHEMA,
	HAIKU_REPAIR_INPUT_SCHEMA,
	HAIKU_REVIEW_INPUT_SCHEMA,
	HAIKU_REVIEW_OPEN_INPUT_SCHEMA,
	HAIKU_SEED_INPUT_SCHEMA,
	HAIKU_SETTINGS_GET_INPUT_SCHEMA,
	HAIKU_SETTINGS_SET_INPUT_SCHEMA,
	HAIKU_STAGE_GET_INPUT_SCHEMA,
	HAIKU_STAGE_SET_INPUT_SCHEMA,
	HAIKU_STUDIO_GET_INPUT_SCHEMA,
	HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA,
	HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA,
	HAIKU_UNIT_DELETE_INPUT_SCHEMA,
	HAIKU_UNIT_LIST_INPUT_SCHEMA,
	HAIKU_UNIT_READ_INPUT_SCHEMA,
	HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA,
	HAIKU_UNIT_SET_INPUT_SCHEMA,
	HAIKU_UNIT_START_INPUT_SCHEMA,
	HAIKU_UNIT_WRITE_INPUT_SCHEMA,
	INTENT_IMMUTABLE_FIELDS,
	UNIT_FRONTMATTER_SCHEMA,
	validateHaikuBacklogInputSchema,
	validateHaikuCapacityInputSchema,
	validateHaikuDecisionRecordInputSchema,
	validateHaikuEmptyInputSchema,
	validateHaikuFeedbackAdvanceHatInputSchema,
	validateHaikuFeedbackDeleteInputSchema,
	validateHaikuFeedbackInputSchema,
	validateHaikuFeedbackListInputSchema,
	validateHaikuFeedbackMoveInputSchema,
	validateHaikuFeedbackReadInputSchema,
	validateHaikuFeedbackRejectHatInputSchema,
	validateHaikuFeedbackRejectInputSchema,
	validateHaikuFeedbackSetTargetsInputSchema,
	validateHaikuFeedbackWriteInputSchema,
	validateHaikuIntentGetInputSchema,
	validateHaikuIntentListInputSchema,
	validateHaikuIntentSetInputSchema,
	validateHaikuKnowledgeListInputSchema,
	validateHaikuKnowledgeReadInputSchema,
	validateHaikuReconciliationAcknowledgeInputSchema,
	validateHaikuReflectInputSchema,
	validateHaikuReleaseNotesInputSchema,
	validateHaikuRepairInputSchema,
	validateHaikuReviewInputSchema,
	validateHaikuSeedInputSchema,
	validateHaikuSettingsGetInputSchema,
	validateHaikuSettingsSetInputSchema,
	validateHaikuStageGetInputSchema,
	validateHaikuStageSetInputSchema,
	validateHaikuStudioGetInputSchema,
	validateHaikuStudioStageGetInputSchema,
	validateHaikuUnitAdvanceHatInputSchema,
	validateHaikuUnitDeleteInputSchema,
	validateHaikuUnitListInputSchema,
	validateHaikuUnitReadInputSchema,
	validateHaikuUnitRejectHatInputSchema,
	validateHaikuUnitSetInputSchema,
	validateHaikuUnitStartInputSchema,
	validateHaikuUnitWriteInputSchema,
	validateIntentFrontmatterSchema as validateIntentSchema,
	validateUnitFrontmatterSchema as validateUnitSchema,
} from "./state/schemas/index.js"
import {
	jsonSchemaOf,
	validateToolInput,
} from "./state/schemas/inputs/_validate.js"

// ── Settings.yml — schema loaded from plugin/schemas/settings.schema.json ─
//
// settings.schema.json uses `$ref: "providers/<name>.schema.json"` to
// pull in per-provider config shapes. AJV's compiler resolves refs by
// $id, so all referenced schemas have to be added BEFORE compile.
// `validateSettingsCandidate` lazy-loads everything in plugin/schemas/
// (settings + providers + state) on first call and reuses the compiled
// validator on subsequent calls.

import { readdirSync as _readdirSyncForSchema } from "node:fs"

let _validateSettingsCandidate: ((data: unknown) => boolean) | null = null
let _validateSettingsErrors: (() => unknown[]) | null = null
function validateSettingsCandidate(data: unknown): boolean {
	if (!_validateSettingsCandidate) {
		// Build a fresh AJV instance keyed on the provider $refs the
		// settings schema declares. Reusing the package-global `ajv`
		// would pollute that instance with provider schemas every
		// other validator already compiles fine without.
		const settingsAjv = new Ajv({
			allErrors: true,
			strict: false,
			// Refs resolve relative to the file location, not the $id —
			// the settings.schema.json $id is a public URL but the refs
			// are filesystem-relative. addSchema with key=filename lets
			// AJV match them.
		})
		const pluginRoot = resolvePluginRoot()
		const providersDir = join(pluginRoot, "schemas", "providers")
		// Settings schema $id is `https://haiku.dev/schemas/haiku-settings.schema.json`,
		// and refs are `providers/<name>.schema.json` (relative). AJV
		// resolves them against the parent $id, producing
		// `https://haiku.dev/schemas/providers/<name>.schema.json`.
		// Provider schemas declare a different $id
		// (`https://haikumethod.ai/...`), so we have to register them
		// under the URI the resolver will look up. Drop the inner $id
		// so AJV doesn't refuse the registration as a duplicate.
		if (existsSync(providersDir)) {
			const SETTINGS_BASE = "https://haiku.dev/schemas/"
			for (const f of _readdirSyncForSchema(providersDir)) {
				if (!f.endsWith(".schema.json")) continue
				try {
					const sub = JSON.parse(
						readFileSync(join(providersDir, f), "utf8"),
					) as Record<string, unknown>
					sub.$id = `${SETTINGS_BASE}providers/${f}`
					settingsAjv.addSchema(sub)
				} catch {
					/* skip malformed schemas — non-fatal */
				}
			}
		}
		const settingsPath = join(pluginRoot, "schemas", "settings.schema.json")
		const settingsSchema: Record<string, unknown> = existsSync(settingsPath)
			? JSON.parse(readFileSync(settingsPath, "utf8"))
			: { type: "object", additionalProperties: true }
		const validator = settingsAjv.compile(settingsSchema)
		_validateSettingsCandidate = validator as unknown as (d: unknown) => boolean
		_validateSettingsErrors = () => validator.errors as unknown[]
	}
	return _validateSettingsCandidate(data)
}
function settingsValidationErrors(): unknown[] {
	return _validateSettingsErrors ? _validateSettingsErrors() : []
}

/**
 * Translate an AJV error into a structured error string with a stable
 * named code prefix. The code is what consumers (tests, error
 * reporters, the agent) match on; the message gives the agent a
 * remediation hint.
 *
 * AJV emits errors keyed by `keyword` + `instancePath`. We map the
 * combinations we actually use in UNIT_FRONTMATTER_SCHEMA to the
 * pre-existing named codes (`fsm_field_forbidden`, `depends_on_shape`,
 * `title_shape`, `model_shape`, `closes_shape`, `quality_gates_shape`)
 * so callers — including tests — keep matching on the same codes they
 * matched on before AJV took over the static rules.
 */
function ajvErrorToCode(err: {
	keyword: string
	instancePath: string
	params: Record<string, unknown>
	message?: string
}): string {
	// `propertyNames.not.enum` rejection — AJV reports this as keyword
	// `propertyNames` with the offending field in `params.propertyName`.
	if (err.keyword === "propertyNames") {
		const field = (err.params.propertyName as string) ?? "<unknown>"
		return `fsm_field_forbidden: '${field}' is workflow-driven and must not be set by agents. The workflow engine owns this field via haiku_unit_advance_hat / haiku_unit_increment_bolt / etc.`
	}
	// Map per-field by inspecting the JSON-pointer instancePath
	// (e.g. "/depends_on" or "/quality_gates/0/command").
	const seg = err.instancePath.split("/").filter(Boolean)
	const top = seg[0]
	switch (top) {
		case "title":
			return `title_shape: title must be a non-empty string, or omit the field (it will default to the unit name). (${err.message ?? err.keyword})`
		case "model":
			return `model_shape: model must be 'haiku', 'sonnet', or 'opus'. Omit the field to fall through to hat/stage/studio defaults.`
		case "depends_on":
			return `depends_on_shape: depends_on must be a list of unit names (strings), or omit the field entirely for units with no dependencies. (${err.message ?? err.keyword} at ${err.instancePath})`
		case "closes":
			return `closes_shape: closes must be a list of FB ID strings, or omit the field for units that don't address feedback. (${err.message ?? err.keyword} at ${err.instancePath})`
		case "quality_gates":
			return `quality_gates_shape: quality_gates must be a list of {name, command, dir?} objects with non-empty name+command. Prose-only gates are silently skipped — write a real command. (${err.message ?? err.keyword} at ${err.instancePath})`
		case "inputs":
		case "outputs":
			return `${top}_shape: ${top} must be a list of strings. (${err.message ?? err.keyword} at ${err.instancePath})`
		default:
			return `frontmatter_shape: ${err.message ?? err.keyword} at ${err.instancePath || "/"}`
	}
}

/**
 * Width-flexible unit-name match. `unit-01-foo` resolves to `unit-001-foo`
 * (and vice versa) — same numeric prefix and slug suffix, ignoring
 * zero-pad width. Used by depends_on validation so existing 2-digit
 * intents don't break under the NNN-padded engine prompt.
 */
function resolvesToUnit(entry: string, target: string): boolean {
	if (entry === target) return true
	const a = entry.match(/^unit-(\d+)-(.+)$/)
	const b = target.match(/^unit-(\d+)-(.+)$/)
	if (!a || !b) return false
	return (
		Number.parseInt(a[1], 10) === Number.parseInt(b[1], 10) && a[2] === b[2]
	)
}

export function validateUnitFrontmatter(
	frontmatter: Record<string, unknown>,
	context: {
		intent: string
		stage: string
		unit: string
		/** Names of all sibling units (without .md), used for DAG validation. */
		siblingUnits: string[]
	},
): { valid: true } | { valid: false; errors: string[] } {
	const errors: string[] = []

	// Step 1: schema-based static rules — AJV consumes
	// UNIT_FRONTMATTER_SCHEMA. Catches forbidden workflow engine fields, type errors,
	// `model` enum, `quality_gates` inner shape, `title` minLength, and
	// general type/array shape for depends_on / inputs / outputs / closes.
	const ok = validateUnitSchema(frontmatter)
	if (!ok && validateUnitSchema.errors) {
		for (const err of validateUnitSchema.errors) {
			errors.push(ajvErrorToCode(err))
		}
	}

	// Step 2: context-dependent rules — these need runtime data
	// (the unit's own name, the sibling list) and can't be expressed
	// in JSONSchema. Run only if depends_on passed the schema's array-of-
	// strings shape check; otherwise the AJV errors above already cover it.
	if (Array.isArray(frontmatter.depends_on)) {
		for (const entry of frontmatter.depends_on) {
			if (typeof entry !== "string") continue // already flagged by AJV
			if (entry === context.unit || resolvesToUnit(entry, context.unit)) {
				errors.push(
					`depends_on_self_reference: unit '${context.unit}' lists itself in depends_on. A unit cannot depend on itself.`,
				)
			}
			const resolves = context.siblingUnits.some((s) =>
				resolvesToUnit(entry, s),
			)
			if (!resolves && !resolvesToUnit(entry, context.unit)) {
				errors.push(
					`depends_on_unresolved: depends_on entry '${entry}' does not resolve to a unit in stage '${context.stage}'. Sibling units in this stage: [${context.siblingUnits.join(", ")}].`,
				)
			}
		}
	}

	return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

// ── DAG cycle detection (architecture §1.1: workflow engine enforces DAG validity) ──
//
// Given a stage's complete unit set + each unit's depends_on, returns the
// names of any units involved in a cycle. Empty array means the DAG is
// acyclic. Used by haiku_unit_write to refuse writes that introduce a
// cycle (the new edge plus existing depends_on form a back-reference).

export function detectDagCycles(dag: Record<string, string[]>): string[] {
	const WHITE = 0
	const GRAY = 1
	const BLACK = 2
	const color: Record<string, number> = {}
	const cycleNodes = new Set<string>()
	for (const node of Object.keys(dag)) color[node] = WHITE

	function visit(node: string): boolean {
		if (color[node] === GRAY) {
			cycleNodes.add(node)
			return true
		}
		if (color[node] === BLACK) return false
		color[node] = GRAY
		const deps = dag[node] || []
		let foundCycle = false
		for (const dep of deps) {
			if (!(dep in dag)) continue // unresolved entries are caught elsewhere
			if (visit(dep)) {
				cycleNodes.add(node)
				foundCycle = true
			}
		}
		color[node] = BLACK
		return foundCycle
	}

	for (const node of Object.keys(dag)) {
		if (color[node] === WHITE) visit(node)
	}
	return [...cycleNodes].sort()
}

// ── Frontmatter helpers ────────────────────────────────────────────────────

function normalizeDates(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...data }
	for (const key in result) {
		if (result[key] instanceof Date) {
			result[key] = (result[key] as Date).toISOString().split("T")[0]
		}
	}
	return result
}

export function parseFrontmatter(raw: string): {
	data: Record<string, unknown>
	body: string
} {
	// Auto-recover from duplicate top-level YAML keys by keeping the last
	// occurrence and reparsing. haiku_repair separately flags these files so
	// they get rewritten on disk; this keeps the workflow engine running in the meantime.
	const tryParse = (text: string) => {
		const { data, content } = matter(text)
		return {
			data: normalizeDates(data as Record<string, unknown>),
			body: content.trim(),
		}
	}
	try {
		return tryParse(raw)
	} catch (err) {
		if (!isDuplicateKeyError(err)) throw err
		const { text, removed } = dedupeFrontmatterKeys(raw)
		if (removed.length === 0) throw err
		// Report the recovery so we can see which files are drifting and how often
		// — the file is still live with deduped values until haiku_repair rewrites it.
		reportError(err, {
			context: "parseFrontmatter:dedup-recovery",
			removed_keys: removed,
		})
		return tryParse(text)
	}
}

/**
 * Enumerate intent slugs under `intentsDir`, optionally filtering out archived ones.
 *
 * Archival is a soft-hide flag orthogonal to `status`: an intent with
 * `archived: true` in its frontmatter is hidden from default list views but
 * its prior status is preserved for lossless unarchival.
 *
 * By default (`opts.includeArchived !== true`) archived intents are filtered
 * out. Passing `{ includeArchived: true }` returns every intent slug that has
 * an `intent.md` regardless of the archived flag.
 *
 * This is the single source of truth for archived-filtering across the three
 * user-facing enumeration sites (`haiku_intent_list`, `haiku_dashboard`,
 * `haiku_capacity`). Do NOT duplicate the `archived === true` predicate —
 * call this helper instead so miss-one-site regressions are impossible.
 */
/**
 * Enumerate visible (non-archived) intents in a directory, returning both
 * slug and parsed frontmatter data. Reuses parseFrontmatter so callers don't
 * have to re-parse each intent.md for downstream work (response shaping,
 * dashboard rendering, capacity aggregation).
 *
 * Set `opts.includeArchived` to true to return all intents (both archived
 * and non-archived).
 */
export function listVisibleIntents(
	intentsDir: string,
	opts?: { includeArchived?: boolean },
): Array<{ slug: string; data: Record<string, unknown> }> {
	if (!existsSync(intentsDir)) return []
	const includeArchived = opts?.includeArchived === true
	const results: Array<{ slug: string; data: Record<string, unknown> }> = []
	for (const d of readdirSync(intentsDir)) {
		const intentFile = join(intentsDir, d, "intent.md")
		if (!existsSync(intentFile)) continue
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		if (!includeArchived && data.archived === true) continue
		results.push({ slug: d, data })
	}
	return results
}

export function listVisibleIntentSlugs(
	intentsDir: string,
	opts?: { includeArchived?: boolean },
): string[] {
	return listVisibleIntents(intentsDir, opts).map((i) => i.slug)
}

/**
 * Parse an intent slug (and optionally a stage) out of the current git
 * branch. Supports the two H·AI·K·U branch shapes:
 *
 *   haiku/<slug>/main
 *   haiku/<slug>/<stage>
 *
 * Returns null if the current checkout isn't on a haiku branch or the
 * environment isn't git-backed. Used by pickup/revisit/run_next to
 * auto-resolve the intent when the user's checkout already tells us
 * which intent they want to work on — keeps skills thin and the
 * logic centrally owned.
 */
export function intentFromCurrentBranch(): {
	slug: string
	stage: string | null
} | null {
	if (!isGitRepo()) return null
	const branch = getCurrentBranch()
	if (!branch) return null
	const match = branch.match(/^haiku\/([^/]+)\/([^/]+)$/)
	if (!match) return null
	const slug = match[1]
	const stagePart = match[2]
	return { slug, stage: stagePart === "main" ? null : stagePart }
}

export function setFrontmatterField(
	filePath: string,
	field: string,
	value: unknown,
): void {
	const raw = readFileSync(filePath, "utf8")
	const parsed = matter(raw)
	// Spread to avoid mutating gray-matter's returned data object in place —
	// in-place mutation can corrupt gray-matter's internal cache and cause
	// subsequent parseFrontmatter calls to return stale values.
	const updated = { ...parsed.data, [field]: value }
	// gray-matter stringify: matter.stringify(content, data)
	writeFileSync(
		filePath,
		matter.stringify(
			parsed.content,
			normalizeDates(updated as Record<string, unknown>),
		),
	)
}

/** Remove one or more frontmatter fields from a markdown file. Unlike
 *  setFrontmatterField (which writes a value), this drops the key
 *  entirely so downstream readers don't see a stale empty/null. No-op
 *  for fields that aren't present. */
export function deleteFrontmatterFields(
	filePath: string,
	fields: ReadonlyArray<string>,
): void {
	if (!existsSync(filePath)) return
	const raw = readFileSync(filePath, "utf8")
	const parsed = matter(raw)
	const updated: Record<string, unknown> = { ...parsed.data }
	let mutated = false
	for (const f of fields) {
		if (f in updated) {
			delete updated[f]
			mutated = true
		}
	}
	if (!mutated) return
	writeFileSync(
		filePath,
		matter.stringify(parsed.content, normalizeDates(updated)),
	)
}

/** Write a unit frontmatter field to BOTH the parent worktree's copy AND
 *  the unit's dedicated worktree (if one exists). The dual write is what
 *  keeps the workflow engine's reads (parent) in sync with the merge commits produced
 *  by `mergeUnitWorktree` (unit worktree). Missing either side causes the
 *  status-drift bug where a unit completes in one view but appears active
 *  in the other. */
export function setUnitFrontmatterField(
	slug: string,
	stage: string,
	unit: string,
	field: string,
	value: unknown,
): void {
	const parentPath = unitPath(slug, stage, unit)
	if (existsSync(parentPath)) setFrontmatterField(parentPath, field, value)
	// Unit worktrees live under the primary repo's `.haiku/worktrees/`
	// (see unitIntentDir / getUnitWorktreeChanges for the same convention).
	const worktreeBase = join(
		primaryRepoRoot(),
		".haiku",
		"worktrees",
		slug,
		unit,
	)
	if (!existsSync(worktreeBase)) return
	const worktreeUnitPath = join(
		worktreeBase,
		".haiku",
		"intents",
		slug,
		"stages",
		stage,
		"units",
		unit.endsWith(".md") ? unit : `${unit}.md`,
	)
	if (existsSync(worktreeUnitPath)) {
		setFrontmatterField(worktreeUnitPath, field, value)
	}
}

function parseYaml(raw: string): Record<string, unknown> {
	// Wrap raw YAML in frontmatter delimiters so gray-matter can parse it
	const { data } = matter(`---\n${raw}\n---\n`)
	return normalizeDates(data as Record<string, unknown>)
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".")
	let current: unknown = obj
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined
		current = (current as Record<string, unknown>)[part]
	}
	return current
}

export function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {}
	return JSON.parse(readFileSync(path, "utf8"))
}

export function writeJson(path: string, data: Record<string, unknown>): void {
	mkdirSync(join(path, ".."), { recursive: true })
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

export function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

/**
 * Stage `.haiku/` for a state commit while defending against worktree-gitlink
 * leaks (issue #262 concern 3).
 *
 * Why this is non-trivial: H·AI·K·U registers per-unit / per-fix git
 * worktrees under `.haiku/worktrees/{slug}/{unit-or-fix}/`. A bare
 * `git add .haiku` walks into those directories and stages each as a
 * gitlink (mode 160000), because the worktree's `.git` file makes git
 * treat it as a submodule. `.gitignore` does not protect entries that are
 * already tracked, and a gitlink committed once on a parent commit will
 * keep coming back as a phantom `D` after `haiku_repair`'s naive cleanup.
 *
 * Defense in depth:
 *   1. Pathspec exclude on the add → blocks NEW gitlinks under
 *      `.haiku/worktrees/` from entering the index.
 *   2. `git rm --cached -r --ignore-unmatch -- .haiku/worktrees/` →
 *      untracks any LEGACY gitlinks already in the index on this branch.
 *      `--cached` leaves the working tree alone, so the worktree keeps
 *      functioning. `--ignore-unmatch` keeps this a no-op when there's
 *      nothing to clean.
 */
function stageHaikuStateForCommit(haikuRoot: string): void {
	execFileSync(
		"git",
		["add", "--", ":(exclude,glob,top).haiku/worktrees/**", haikuRoot],
		{ encoding: "utf8", stdio: "pipe" },
	)
	try {
		execFileSync(
			"git",
			[
				"rm",
				"--cached",
				"-r",
				"--ignore-unmatch",
				"-f",
				"--",
				join(haikuRoot, "worktrees"),
			],
			{ encoding: "utf8", stdio: "pipe" },
		)
	} catch {
		/* Nothing to untrack — the common path. */
	}
}

/**
 * Git add + commit + push for lifecycle state changes.
 * No-op in non-git environments (filesystem mode).
 * Non-fatal: git failures are logged but never crash the MCP.
 */
export function gitCommitState(message: string): {
	committed: boolean
	pushed: boolean
	pushError?: string
} {
	if (!isGitRepo()) return { committed: false, pushed: false } // Filesystem mode — no git operations
	try {
		stageHaikuStateForCommit(findHaikuRoot())
		execFileSync("git", ["commit", "-m", message, "--allow-empty"], {
			encoding: "utf8",
			stdio: "pipe",
		})
		try {
			execFileSync("git", ["push"], { encoding: "utf8", stdio: "pipe" })
			return { committed: true, pushed: true }
		} catch (pushErr) {
			const pushError =
				pushErr instanceof Error ? pushErr.message : String(pushErr)
			return { committed: true, pushed: false, pushError }
		}
	} catch {
		return { committed: false, pushed: false }
	}
}

/**
 * Like `gitCommitState`, but commits synchronously and pushes in the
 * background via an unref'd child process. Use for HTTP mutation
 * handlers where the caller is waiting on an HTTP response — pushing
 * inline adds a network round trip per mutation, which is perceptible
 * as UI lag on every approve/reject/delete. The commit is the real
 * durability boundary; push is for sharing state with remote tooling
 * and can safely slip a few hundred ms.
 */
export function gitCommitStateBackgroundPush(message: string): {
	committed: boolean
} {
	if (!isGitRepo()) return { committed: false }
	try {
		stageHaikuStateForCommit(findHaikuRoot())
		execFileSync("git", ["commit", "-m", message, "--allow-empty"], {
			encoding: "utf8",
			stdio: "pipe",
		})
	} catch {
		return { committed: false }
	}
	try {
		const child = spawn("git", ["push"], {
			stdio: "ignore",
			detached: true,
		})
		child.unref()
		child.on("error", () => {
			/* Background push failures are non-fatal. */
		})
	} catch {
		/* swallow — commit already landed */
	}
	return { committed: true }
}

/**
 * Validate the agent is on the correct git branch for the current operation.
 * Returns an error message if on the wrong branch, empty string if OK.
 */
export function validateBranch(
	intent: string,
	expectedType: "intent" | "unit",
	unit?: string,
): string {
	if (!isGitRepo()) return "" // No branch enforcement in filesystem mode
	const current = getCurrentBranch()
	if (!current) return ""

	// Any haiku/{intent}/* branch is valid for this intent (covers both continuous main and discrete stage branches)
	const intentPrefix = `haiku/${intent}/`
	if (expectedType === "intent") {
		if (!current.startsWith(intentPrefix)) {
			return `⚠️ WRONG BRANCH: Expected a branch under '${intentPrefix}' but on '${current}'. Run \`git checkout haiku/${intent}/main\` or the appropriate stage branch. Custom branch names break the H·AI·K·U lifecycle.`
		}
	} else if (expectedType === "unit" && unit) {
		const expectedUnit = `haiku/${intent}/${unit}`
		// Unit work can happen on the unit branch (worktree) or any intent/stage branch
		if (current !== expectedUnit && !current.startsWith(intentPrefix)) {
			return `⚠️ WRONG BRANCH: Expected '${expectedUnit}' or a branch under '${intentPrefix}' but on '${current}'. Ensure you're working in the correct worktree.`
		}
	}
	return ""
}

/** Returns a warning string if git push failed, empty string otherwise. Safe to append to plain text responses. */
function pushWarning(result: ReturnType<typeof gitCommitState>): string {
	if (result.pushed || !result.committed) return ""
	return `\n\n⚠️ GIT PUSH FAILED: ${result.pushError || "unknown error"}. Run \`git pull --rebase && git push\` to sync with remote. If there are conflicts, resolve them then push again.`
}

/** Injects push warning into a JSON object's message field if push failed. */
function injectPushWarning(
	obj: Record<string, unknown>,
	result: ReturnType<typeof gitCommitState>,
): Record<string, unknown> {
	if (result.pushed || !result.committed) return obj
	return {
		...obj,
		push_failed: true,
		push_error: result.pushError || "unknown error",
		message: `${obj.message || ""}. ⚠️ GIT PUSH FAILED: ${result.pushError || "unknown error"}. Run \`git pull --rebase && git push\` to resolve.`,
	}
}

// v4: setRunNextHandler / _runNext registration removed.
//   Rationale: in v4, advance_hat does NOT internally tick the workflow.
//   The subagent's terminal advance_hat call merges the unit branch
//   into the stage branch (under withStageLock) and returns a clean
//   plaintext signal. The parent agent calls haiku_run_next on the
//   next tick to drive the cursor forward. run_next is pure
//   observation — anyone can call it, same answer every time.
//
// v4: setBuildContinueDispatchHandler / _buildContinueDispatch removed.
//   Rationale: subagents are single-hat in v4. Each hat is dispatched
//   as a fresh subagent by the parent. The "subagent synthesizes the
//   next hat into its own context via Workflow Result file" pattern
//   is gone — that's exactly what let workflow-level actions leak
//   into subagent contexts and produced the rogue-driver bug we're
//   fixing. The cursor returns a `start_unit_hat` action; the parent
//   spawns a new subagent for it.

/** Resolve the active stage for an intent from its frontmatter */
function resolveActiveStage(intent: string): string {
	const root = findHaikuRoot()
	const intentFile = join(root, "intents", intent, "intent.md")
	if (!existsSync(intentFile)) return ""
	const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
	return (data.active_stage as string) || ""
}

/**
 * Pre-flight branch enforcement for stage-scoped state-mutating tools.
 *
 * Ensures the MCP's current git checkout is on `haiku/{intent}/{stage}`
 * before the caller writes any stage state. If main drifted ahead (feedback
 * files or state leaked there), merges main → stage first so nothing is lost.
 *
 * Returns null on success (caller continues) or an MCP error response
 * (caller returns it directly) when the branch couldn't be aligned.
 * No-op in filesystem / non-git mode.
 */
function enforceStageBranch(
	intent: string,
	stage: string | undefined,
): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
	const guard = ensureOnStageBranch(intent, stage)
	if (!guard.ok) {
		// When the block is a dirty tree, return a structured commit_wip
		// action instead of a hard error. The agent commits the listed
		// files (which belong on the current branch) and retries — no
		// human intervention needed.
		if (guard.block === "dirty_tree") {
			const files = guard.dirty_files || []
			const filesBlock =
				files.length > 0
					? `\n\nFiles to commit:\n${files.map((f) => `  - ${f}`).join("\n")}`
					: ""
			const action = {
				action: "commit_wip",
				intent,
				stage: stage ?? null,
				context: "state-tool branch enforcement",
				current_branch: guard.branch,
				target_branch: guard.target_branch || "the target branch",
				dirty_files: files,
				message: `Uncommitted changes on branch '${guard.branch}' block the switch to '${guard.target_branch}'. These changes belong on '${guard.branch}' — commit them there, then retry the tool call. No human intervention needed.${filesBlock}\n\nSteps:\n  1. \`git add ${files.length > 0 ? files.join(" ") : "<files listed above>"}\`\n  2. \`git commit -m "haiku: wip on ${guard.branch}"\`\n  3. Retry the call.`,
			}
			return {
				content: [{ type: "text", text: JSON.stringify(action, null, 2) }],
				isError: true as const,
			}
		}
		return {
			content: [
				{
					type: "text",
					text: `Error: stage-branch enforcement failed for intent '${intent}', stage '${stage ?? "(none)"}' — ${guard.message}`,
				},
			],
			isError: true as const,
		}
	}
	return null
}

/** Find a unit file by searching through stages. Returns { path, stage } or null. */
function findUnitFile(
	intent: string,
	unit: string,
): { path: string; stage: string } | null {
	const root = findHaikuRoot()
	// First try the active stage (most common case)
	const activeStage = resolveActiveStage(intent)
	if (activeStage) {
		const p = unitPath(intent, activeStage, unit)
		if (existsSync(p)) return { path: p, stage: activeStage }
	}
	// Fallback: search all stages
	const stagesDir = join(root, "intents", intent, "stages")
	if (!existsSync(stagesDir)) return null
	for (const stage of readdirSync(stagesDir)) {
		const p = unitPath(intent, stage, unit)
		if (existsSync(p)) return { path: p, stage }
	}
	return null
}

/** The built-in terminal hat auto-injected on any unit that declares `closes:`
 *  feedback items. Verifies the unit's output actually resolves each claim
 *  and marks them closed/addressed; rejects back to the designer if not. */
export const FEEDBACK_ASSESSOR_HAT = "feedback-assessor"

/** Resolve the hat sequence for a specific unit. Starts from the stage's
 *  declared hats and appends `feedback-assessor` as the terminal hat when
 *  the unit has `closes:` references — so any unit claiming closures gets
 *  independently verified before completion. */
export function resolveUnitHats(
	intent: string,
	stage: string,
	unit: string,
): string[] {
	const stageHats = resolveStageHats(intent, stage)
	try {
		const p = unitPath(intent, stage, unit)
		if (!existsSync(p)) return stageHats
		const { data } = parseFrontmatter(readFileSync(p, "utf8"))
		const closes = (data.closes as string[]) || []
		if (closes.length > 0 && !stageHats.includes(FEEDBACK_ASSESSOR_HAT)) {
			return [...stageHats, FEEDBACK_ASSESSOR_HAT]
		}
	} catch {
		/* non-fatal */
	}
	return stageHats
}

/** Resolve hat sequence for a stage — used by haiku_unit_advance_hat and haiku_unit_reject_hat */
function resolveStageHats(intent: string, stage: string): string[] {
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return []
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		const studio = (data.studio as string) || ""
		if (!studio) return []

		const pluginRoot = resolvePluginRoot()
		for (const base of [
			join(process.cwd(), ".haiku", "studios"),
			join(pluginRoot, "studios"),
		]) {
			const stageFile = join(base, studio, "stages", stage, "STAGE.md")
			if (!existsSync(stageFile)) continue
			const { data: stageFm } = parseFrontmatter(
				readFileSync(stageFile, "utf8"),
			)
			return (stageFm.hats as string[]) || []
		}
	} catch {
		/* */
	}
	return []
}

/** Resolve stage metadata for scope context in tool responses */
function resolveStageScope(intent: string, stage: string): string {
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return ""
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		const studio = (data.studio as string) || ""
		if (!studio) return ""

		const pluginRoot = resolvePluginRoot()
		for (const base of [
			join(process.cwd(), ".haiku", "studios"),
			join(pluginRoot, "studios"),
		]) {
			const stageFile = join(base, studio, "stages", stage, "STAGE.md")
			if (!existsSync(stageFile)) continue
			const raw = readFileSync(stageFile, "utf8")
			const fm = parseFrontmatter(raw)
			const { content } = matter(raw)
			const desc = (fm.data.description as string) || stage
			return `[stage_scope] ${stage}: ${desc} | ${content.trim().slice(0, 500)}`
		}
	} catch {
		/* */
	}
	return ""
}

/**
 * Collect current H·AI·K·U state and write to the caller-provided state file.
 * The state_file path is injected by the pre_tool_use hook — the MCP server
 * never resolves session IDs or config dirs. If no state_file, this is a no-op.
 */
export function syncSessionMetadata(
	intent: string,
	stateFile: string | undefined,
): void {
	if (!stateFile) return
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return
		const { data: intentData } = parseFrontmatter(
			readFileSync(intentFile, "utf8"),
		)
		const studio = (intentData.studio as string) || ""
		const activeStage = (intentData.active_stage as string) || ""

		let phase = ""
		if (activeStage) {
			// v4: phase is derived, not read from state.json (which is dead).
			const intentMode =
				typeof intentData.mode === "string" &&
				(intentData.mode as string).length > 0
					? (intentData.mode as string)
					: "continuous"
			const derived = deriveStageState({
				slug: intent,
				studio,
				stage: activeStage,
				intentDir: join(root, "intents", intent),
				intentMode,
			})
			phase = derived.phase ?? ""
		}

		let activeUnit: string | null = null
		let hat: string | null = null
		let bolt: number | null = null
		if (activeStage) {
			const unitsDir = join(stageDir(intent, activeStage), "units")
			if (existsSync(unitsDir)) {
				for (const f of readdirSync(unitsDir).filter((f) =>
					f.endsWith(".md"),
				)) {
					const { data: unitData } = parseFrontmatter(
						readFileSync(join(unitsDir, f), "utf8"),
					)
					if (unitData.status === "active") {
						activeUnit = f.replace(".md", "")
						hat = (unitData.hat as string) || null
						bolt = (unitData.bolt as number) || null
						break
					}
				}
			}
		}

		let stageDescription = activeStage
		if (studio && activeStage) {
			const pluginRoot = resolvePluginRoot()
			for (const base of [
				join(process.cwd(), ".haiku", "studios"),
				join(pluginRoot, "studios"),
			]) {
				const sf = join(base, studio, "stages", activeStage, "STAGE.md")
				if (!existsSync(sf)) continue
				const { data: stageFm } = parseFrontmatter(readFileSync(sf, "utf8"))
				stageDescription = (stageFm.description as string) || activeStage
				break
			}
		}

		writeHaikuMetadata(stateFile, {
			intent,
			studio,
			active_stage: activeStage,
			phase,
			active_unit: activeUnit,
			hat,
			bolt,
			stage_description: stageDescription,
			updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
		})
	} catch {
		/* non-fatal */
	}
}

// ── Feedback helpers ──────────────────────────────────────────────────────

/** Valid origin values for feedback items. */
export const FEEDBACK_ORIGINS = [
	"adversarial-review",
	"studio-review",
	"external-pr",
	"external-mr",
	"user-visual",
	"user-chat",
	"user-question",
	"user-revisit",
	"agent",
] as const

export type FeedbackOrigin = (typeof FEEDBACK_ORIGINS)[number]

/** Valid status values for feedback items.
 *
 * Lifecycle:
 *   pending    — open finding. Stays pending until an independent assessor
 *                verifies resolution. A unit completing with `closes: [FB-XX]`
 *                writes `closed_by: <unit>` on the feedback item but DOES
 *                NOT change its status — the agent doing the work cannot
 *                self-certify.
 *   fixing     — the workflow engine is mid-fix-loop on this finding (one or more
 *                `fix_hats` bolts have run against it).
 *   addressed  — an independent actor (feedback-assessor hat, human via the
 *                review UI, or another agent) verified the closure.
 *   answered   — resolved by a reply with no code delta (questions).
 *   closed     — terminal; the feedback author confirmed resolution.
 *   rejected   — terminal; rejected with reason.
 */
export const FEEDBACK_STATUSES = [
	"pending",
	"fixing",
	"addressed",
	"answered",
	"closed",
	"rejected",
] as const

/**
 * Maximum number of fix-loop bolts we will run against a single feedback
 * item before escalating to the human. Each bolt is one full dispatch of the
 * stage's `fix_hats` sequence with the feedback file as scope. Three attempts
 * is the same budget we give pre-execute spec revisits — if the fix hats
 * can't resolve the finding in 3 passes, the spec or the finding itself is
 * likely the problem.
 */
export const MAX_FIX_LOOP_BOLTS = 3

/**
 * Cap on how many times the workflow engine will dispatch the integrator subagent
 * against a single fix-chain merge conflict before giving up and
 * escalating to the human. Each attempt is:
 *   1. merge base → fix-chain worktree produces conflict markers
 *   2. workflow engine returns `integrate_fix_chains` action
 *   3. Integrator subagent resolves markers + `git add`s the files
 *   4. Next `haiku_run_next` retries the merge via
 *      `mergeFixChainWorktree` which now sees `MERGE_HEAD` and commits
 *      the resolution, then forward-merges into the base
 * If the integrator can't resolve within this many dispatches, the
 * conflict is beyond automated reconciliation and surfaces to the user.
 */
export const MAX_INTEGRATOR_ATTEMPTS = 3

/**
 * Cap on concurrent subagents the parent may have in flight at any point,
 * across ALL parallel-dispatch surfaces: unit wave execution, elaborate
 * discovery fan-out, adversarial review fan-out, and the fix loops
 * (stage-level `review_fix` and studio-level `intent_completion_fix`).
 *
 * The Task-tool primitive the parent uses to spawn subagents is batch-
 * synchronous: it fires N in one message and waits for all N to return
 * before the next batch. There is no true slot pool — "free a slot
 * mid-batch and fire another" is not expressible. The practical
 * implementation is batch-serial: the parent takes the full wave of
 * eligible items, splits it into batches of `MAX_CONCURRENT_SUBAGENTS`,
 * and runs each batch to completion before starting the next. Wave
 * boundaries (e.g. ops-engineer across all findings → feedback-assessor
 * across all findings) are still honored — all of a hat's batches finish
 * before the next hat starts.
 *
 * Override with env var `HAIKU_MAX_CONCURRENT_SUBAGENTS`. Invalid values
 * (non-numeric, <= 0) fall back to the default. No upper bound enforced —
 * large numbers effectively disable batching.
 */
export const MAX_CONCURRENT_SUBAGENTS = (() => {
	const raw = process.env.HAIKU_MAX_CONCURRENT_SUBAGENTS
	const parsed = raw ? Number.parseInt(raw, 10) : NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
})()

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/** Origins that imply a human author.
 *
 * Any origin produced by a human-facing entry point (review UI composer, HTTP
 * endpoints, external VCS review systems) MUST be listed here so that
 * `deriveAuthorType()` classifies the resulting feedback as `"human"` and the
 * agent-facing privilege guards in `updateFeedbackFile` / `deleteFeedbackFile`
 * refuse to let agents close or delete it.
 *
 * Note specifically: `user-question` IS a human origin. It is created by the
 * review UI question composer (`FeedbackSidebar.tsx` → `createFeedback` with
 * `origin: "user-question"`) when a human reviewer submits a reply-seeking
 * item. Historically this was omitted, which caused human questions to be
 * stored with `author_type: "agent"` and therefore become removable by agents
 * — an elevation-of-privilege hole across the MCP/HTTP trust boundary.
 */
const HUMAN_ORIGINS: ReadonlySet<string> = new Set([
	"user-visual",
	"user-chat",
	"user-question",
	"user-revisit",
	"external-pr",
	"external-mr",
])

/** Derive author_type from origin. */
export function deriveAuthorType(origin: string): "human" | "agent" {
	return HUMAN_ORIGINS.has(origin) ? "human" : "agent"
}

/** Derive default author from origin. */
function deriveDefaultAuthor(origin: string): string {
	return deriveAuthorType(origin) === "human" ? "user" : "agent"
}

/** Slugify a title for use as a filename component. */
export function slugifyTitle(title: string, maxLen = 60): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.slice(0, maxLen)
		.replace(/-+$/, "")
}

/** Persisted form of a design-direction screenshot annotation.
 *  `screenshot_path` is intent-relative so it survives worktree moves. */
export interface DesignDirectionAnnotation {
	comment: string
	screenshot_path: string
}

/** Decode incoming `data:image/...` URLs from the design-direction
 *  picker, write them as raw PNG/JPEG/WebP files under
 *  `<stage>/artifacts/design-direction/`, and update stage state.json
 *  with paths-only annotations. State stays small; binary lives next
 *  to it. Return value carries the persisted annotations so callers
 *  can pass them onwards (in-memory session, log, etc.).
 *
 *  Re-submissions replace the whole set: any prior `dd-NN-…` files are
 *  deleted before the new annotations are written. This matches state's
 *  "latest selection is the truth" semantics — there is no scenario
 *  where a previously persisted screenshot stays load-bearing after a
 *  fresh selection lands. */
export function persistDesignDirectionSelection(opts: {
	slug: string
	stage: string
	archetype: string
	comments?: string
	screenshots: Array<{ comment: string; screenshot_data_url: string }>
}): {
	annotations: DesignDirectionAnnotation[]
	artifactsDir: string
} {
	const artifactsDir = join(
		stageDir(opts.slug, opts.stage),
		"artifacts",
		"design-direction",
	)
	mkdirSync(artifactsDir, { recursive: true })

	// Clear prior dd-NN-* files so re-submissions don't accumulate
	// orphaned PNGs alongside the new set.
	for (const f of readdirSync(artifactsDir)) {
		if (/^dd-\d+-.*\.(png|jpe?g|webp)$/i.test(f)) {
			try {
				unlinkSync(join(artifactsDir, f))
			} catch {
				/* best-effort; persistence proceeds even if a stale file
				   can't be removed (e.g. permission, missing) */
			}
		}
	}

	const archSlug = slugifyTitle(opts.archetype) || "selection"
	const persisted: DesignDirectionAnnotation[] = []
	let nn = 1
	for (const ann of opts.screenshots) {
		const m = ann.screenshot_data_url.match(
			/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
		)
		if (!m) continue
		const ext = m[1] === "jpeg" ? "jpg" : m[1]
		const filename = `dd-${zeroPad(nn)}-${archSlug}.${ext}`
		writeFileSync(join(artifactsDir, filename), Buffer.from(m[2], "base64"))
		persisted.push({
			comment: ann.comment,
			screenshot_path: `stages/${opts.stage}/artifacts/design-direction/${filename}`,
		})
		nn++
	}

	// v4: the design-direction selection is stamped on intent.md FM
	// (see below) and the manifest written at
	// `stages/<stage>/artifacts/design-direction.md`. Both are what
	// the cursor reads. The state.json write the v3 picker did is
	// deleted — the file no longer exists in v4 and nothing reads it.
	try {
		const intentMdPath = join(intentDir(opts.slug), "intent.md")
		if (existsSync(intentMdPath)) {
			const raw = readFileSync(intentMdPath, "utf8")
			const parsed = parseFrontmatter(raw)
			const fm = (parsed.data as Record<string, unknown>) || {}
			const directions =
				fm.design_directions && typeof fm.design_directions === "object"
					? (fm.design_directions as Record<string, unknown>)
					: {}
			directions[opts.stage] = {
				mode: "archetype",
				archetype: opts.archetype,
				...(opts.comments ? { comments: opts.comments } : {}),
				...(persisted.length > 0 ? { annotations: persisted } : {}),
				at: timestamp(),
			}
			setFrontmatterField(intentMdPath, "design_directions", directions)
		}
	} catch (err) {
		console.error(
			`[haiku] failed to stamp design_directions on intent.md: ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	// 2026-05-08: also write a markdown manifest at the canonical
	// artifact location `stages/<stage>/artifacts/design-direction.md`.
	// This is the file the discovery-agent reframe of design_direction
	// reads — a studio's `discovery/design-direction.md` template
	// declares `location:` pointing here, and the cursor's existence
	// check passes the gate when this file lands. Once the reframe is
	// fully live, the intent.md FM stamp above can be deprecated; for
	// now both writes happen so the old cursor clauses keep working
	// against legacy studios.
	try {
		const manifestPath = join(
			stageDir(opts.slug, opts.stage),
			"artifacts",
			"design-direction.md",
		)
		const manifestFm: Record<string, unknown> = {
			intent: opts.slug,
			stage: opts.stage,
			mode: "archetype",
			archetype: opts.archetype,
			recorded_at: timestamp(),
		}
		if (opts.comments) manifestFm.comments = opts.comments
		if (persisted.length > 0) {
			manifestFm.annotations = persisted
		}
		const bodyParts: string[] = []
		bodyParts.push(`# Design Direction — ${opts.archetype}`)
		bodyParts.push("")
		if (opts.comments) {
			bodyParts.push(opts.comments.trim())
			bodyParts.push("")
		}
		if (persisted.length > 0) {
			bodyParts.push("## Annotated screenshots")
			bodyParts.push("")
			for (const a of persisted) {
				bodyParts.push(`- \`${a.screenshot_path}\` — ${a.comment}`)
			}
		}
		mkdirSync(dirname(manifestPath), { recursive: true })
		writeFileSync(
			manifestPath,
			matter.stringify(`${bodyParts.join("\n").trim()}\n`, manifestFm),
		)
	} catch (err) {
		console.error(
			`[haiku] failed to write design-direction.md manifest: ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	return { annotations: persisted, artifactsDir }
}

/** Persisted form of a designer-uploaded artefact.
 *  `path` is intent-relative so it survives worktree moves. */
export interface DesignDirectionUpload {
	filename: string
	path: string
	caption?: string
}

/** Decode incoming `data:image/...` URLs from an upload-mode design
 *  direction submission, write them under
 *  `<stage>/artifacts/design-direction/uploads/`, and update stage
 *  state.json with the paths so the elaborate handler can surface them
 *  on the next tick (mirrors the screenshot-annotation persistence path).
 *
 *  Re-submissions replace the whole upload set: any prior `up-NN-…`
 *  files are deleted before the new ones are written. Same "latest
 *  selection is the truth" semantics as the screenshot persister —
 *  there is no scenario where a previously persisted upload stays
 *  load-bearing after a fresh upload submission lands. */
export function persistDesignDirectionUploads(opts: {
	slug: string
	stage: string
	files: Array<{ filename: string; data_url: string; caption?: string }>
	comments?: string
}): {
	uploads: DesignDirectionUpload[]
	uploadsDir: string
} {
	const ddDir = join(
		stageDir(opts.slug, opts.stage),
		"artifacts",
		"design-direction",
	)
	const uploadsDir = join(ddDir, "uploads")
	mkdirSync(uploadsDir, { recursive: true })

	for (const f of readdirSync(uploadsDir)) {
		if (/^up-\d+-.*\.(png|jpe?g|webp|svg|pdf|gif)$/i.test(f)) {
			try {
				unlinkSync(join(uploadsDir, f))
			} catch {
				/* best-effort */
			}
		}
	}

	const uploads: DesignDirectionUpload[] = []
	let nn = 1
	for (const f of opts.files) {
		const m = f.data_url.match(
			/^data:(image\/(?:png|jpeg|webp|svg\+xml|gif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/,
		)
		if (!m) continue
		const mime = m[1]
		let ext: string
		if (mime === "image/jpeg") ext = "jpg"
		else if (mime === "image/svg+xml") ext = "svg"
		else if (mime === "application/pdf") ext = "pdf"
		else ext = mime.replace(/^image\//, "")
		// Sanitise filename: strip any path traversal, keep a slug.
		const base =
			slugifyTitle(
				opts.files[nn - 1]?.filename.replace(/\.[^.]+$/, "") ?? "",
			) || `upload-${nn}`
		const filename = `up-${zeroPad(nn)}-${base}.${ext}`
		writeFileSync(join(uploadsDir, filename), Buffer.from(m[2], "base64"))
		const upload: DesignDirectionUpload = {
			filename: f.filename,
			path: `stages/${opts.stage}/artifacts/design-direction/uploads/${filename}`,
			...(f.caption ? { caption: f.caption } : {}),
		}
		uploads.push(upload)
		nn++
	}

	// v4: the upload-mode selection is stamped on intent.md FM (see
	// below) and the same artifact directory holds the upload files.
	// The state.json write the v3 picker did is deleted — the file no
	// longer exists in v4 and nothing reads it.
	try {
		const intentMdPath = join(intentDir(opts.slug), "intent.md")
		if (existsSync(intentMdPath)) {
			const raw = readFileSync(intentMdPath, "utf8")
			const parsed = parseFrontmatter(raw)
			const fm = (parsed.data as Record<string, unknown>) || {}
			const directions =
				fm.design_directions && typeof fm.design_directions === "object"
					? (fm.design_directions as Record<string, unknown>)
					: {}
			directions[opts.stage] = {
				mode: "upload",
				...(opts.comments ? { comments: opts.comments } : {}),
				uploads,
				at: timestamp(),
			}
			setFrontmatterField(intentMdPath, "design_directions", directions)
		}
	} catch (err) {
		console.error(
			`[haiku] failed to stamp design_directions (upload) on intent.md: ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	// 2026-05-08: also write the design-direction.md manifest at the
	// canonical artifact location so the discovery-agent reframe of
	// design_direction can gate on file existence (matches PR #334's
	// "artifact existence is the signal" model). See companion
	// persister `persistDesignDirectionSelection` for the archetype
	// case.
	try {
		const manifestPath = join(
			stageDir(opts.slug, opts.stage),
			"artifacts",
			"design-direction.md",
		)
		const manifestFm: Record<string, unknown> = {
			intent: opts.slug,
			stage: opts.stage,
			mode: "upload",
			recorded_at: timestamp(),
		}
		if (opts.comments) manifestFm.comments = opts.comments
		if (uploads.length > 0) manifestFm.uploads = uploads
		const bodyParts: string[] = []
		bodyParts.push(`# Design Direction — Uploaded reference materials`)
		bodyParts.push("")
		if (opts.comments) {
			bodyParts.push(opts.comments.trim())
			bodyParts.push("")
		}
		if (uploads.length > 0) {
			bodyParts.push("## Uploaded files")
			bodyParts.push("")
			for (const u of uploads) {
				const captionTail = u.caption ? ` — ${u.caption}` : ""
				bodyParts.push(`- \`${u.path}\` (${u.filename})${captionTail}`)
			}
		}
		mkdirSync(dirname(manifestPath), { recursive: true })
		writeFileSync(
			manifestPath,
			matter.stringify(`${bodyParts.join("\n").trim()}\n`, manifestFm),
		)
	} catch (err) {
		console.error(
			`[haiku] failed to write design-direction.md manifest (upload): ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	return { uploads, uploadsDir }
}

/** Path to the feedback directory for an intent. When `stage` is falsy,
 *  returns the intent-scope feedback dir used by the pre-intent-completion
 *  review layer. Otherwise returns the per-stage dir used by every stage's
 *  post-execute adversarial review. */
export function feedbackDir(slug: string, stage: string): string {
	if (stage) return join(stageDir(slug, stage), "feedback")
	return join(intentDir(slug), "feedback")
}

/** Resolve the next sequential NN prefix in a feedback directory. */
function nextFeedbackNumber(dir: string): number {
	if (!existsSync(dir)) return 1
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
	let max = 0
	for (const f of files) {
		const match = f.match(/^(\d+)-/)
		if (match) {
			const n = Number.parseInt(match[1], 10)
			if (n > max) max = n
		}
	}
	return max + 1
}

/** Three-digit zero pad: 1 → "001", 47 → "047", 999 → "999".
 *
 *  Schema cap on numeric IDs (feedback + units) is 999, so 3 digits
 *  always fits. Pre-2026-05-07 files used 2-digit padding ("08-…md");
 *  this is migration-clean because every consumer parses the leading
 *  digits as an integer rather than relying on a fixed-width prefix.
 *  `nextFeedbackNumber` / `nextUnitNumber` find max+1 across mixed-
 *  padding files (numeric compare, not string), so a stage with
 *  `08-foo.md` next gets `009-bar.md` without breaking lookup or
 *  ordering. */
function zeroPad(n: number): string {
	return n.toString().padStart(3, "0")
}

/** One reply on a feedback thread. Append-only; agents and humans
 *  alike add replies to answer questions or document why they
 *  closed/rejected the parent. */
export interface FeedbackReply {
	author: string
	author_type: "human" | "agent"
	body: string
	created_at: string
}

/** One per-bolt entry in a feedback's fix-loop history. Appended by
 *  the orchestrator on every hat dispatch and every validator outcome,
 *  so the UI can render "bolt 1: reconciler advanced → validator
 *  reopened (reason: commit never landed); bolt 2: …" without
 *  reconstructing it from scattered commits. */
export interface FeedbackIteration {
	bolt: number
	hat: string
	started_at?: string
	completed_at?: string
	result?: "advanced" | "closed" | "reopened" | "rejected"
	commit?: string
	reason?: string
}

/** Parsed feedback item returned by readFeedbackFiles. */
export interface FeedbackItem {
	id: string // "FB-NN"
	num: number // NN as integer
	slug: string // descriptive slug from filename
	file: string // relative path from .haiku root
	title: string
	body: string
	status: string
	origin: string
	author: string
	author_type: string
	created_at: string
	visit: number
	source_ref: string | null
	// closed_by is the only signal of closure — the unit whose output the
	// feedback-assessor hat validated as resolving this finding. `null`
	// means open (pending) and blocks the stage gate.
	closed_by: string | null
	// v4: closed_at is the lifecycle witness — non-null means the FB
	// has been closed via terminal feedback-assessor advance. Pre-v4
	// FBs migrated via the v0→v4 soft-scrub have closed_at synthesized
	// from terminal status. The legacy `status` and `closed_by` fields
	// are kept for backward compat with un-migrated reads.
	closed_at: string | null
	// Number of fix-loop bolts (dispatches of the stage's `fix_hats`
	// sequence against this specific finding). Capped at MAX_FIX_LOOP_BOLTS;
	// exceeding triggers an `escalate` action for human intervention.
	bolt: number
	// Triage timestamp. The pre-tick triage gate refuses to advance a
	// stage while any open FB (on or before the current stage) is
	// untriaged. The triage step asks the agent to confirm placement
	// (no-op call to `haiku_feedback_move` with same source+target) or
	// relocate (move to the correct stage). Once `triaged_at` is set
	// the FB is considered "in the right home" and routed by file
	// location: earlier stage → revisit, current stage → fix loop.
	// `null` means untriaged; FBs with `triaged_at: null` block the
	// pre-tick gate.
	triaged_at: string | null
	// How the workflow engine should resolve this finding. `null` = caller has no
	// preference; the feedback router defaults to `stage_revisit`.
	// Legal values: question | inline_fix | stage_revisit.
	resolution: string | null
	// Append-only thread on this finding. Human replies come from the
	// review sidebar; agent replies come from `feedback_answer` and from
	// `feedback-assessor` hats recording their closure reasoning.
	replies: FeedbackReply[]
	// Per-bolt history of the fix loop. Mirror of the unit file's
	// `iterations:` frontmatter so reviewers can audit exactly which
	// hat fired, when, with what outcome. Empty for brand-new findings
	// the workflow engine hasn't dispatched yet.
	iterations: FeedbackIteration[]
	// Inline-text anchor for comments attached to a span of rendered
	// markdown. When present, the sidebar can surface a "jump to
	// artifact" affordance that re-opens the artifact detail view and
	// flashes the originally-commented span. `file_path` is the
	// authoritative locator: UI parses it for routing, agent greps it
	// for the exact line. `null` / absent for non-inline feedback
	// (visual pins, plain chat comments, etc).
	inline_anchor: {
		selected_text: string
		paragraph: number
		location: string
		comment_id?: string
		file_path?: string
		content_sha?: string
	} | null
	// Closure reply — set by the terminal fix-hat advance with a
	// plain-language explanation of what was done to address the FB.
	// Surfaces in the SPA so the requester sees the resolution, not
	// just that closure happened. Paired with `closure_reply_unread`
	// so the SPA can filter for replies the reviewer hasn't
	// acknowledged yet. Both `null` / `false` on open FBs and on FBs
	// closed before this field existed.
	closure_reply: { text: string; at: string } | null
	closure_reply_unread: boolean
}

/**
 * Create a feedback file under the given intent/stage.
 * Auto-increments the NN prefix and derives the filename slug from the title.
 * Returns the created feedback item metadata.
 */
export function writeFeedbackFile(
	slug: string,
	stage: string,
	opts: {
		title: string
		body: string
		origin?: string
		author?: string
		source_ref?: string | null
		/** Triage timestamp. Set automatically when the FB is created via
		 *  the studio review layer or by `haiku_feedback_move` — the
		 *  reviewer/agent confirmed placement, so the pre-tick gate can
		 *  proceed. Leave `null` (the default) for ad-hoc reviewer
		 *  feedback that needs the agent's classification step before
		 *  any further workflow engine work. */
		triaged_at?: string | null
		/** Routing hint for the workflow engine's feedback resolver. Accepts the
		 *  three `FeedbackResolution` literals; anything else is coerced
		 *  to null so legacy callers keep working. */
		resolution?: string | null
		/** Optional `data:image/png;base64,...` URL captured by the review
		 *  UI (e.g. an artifact preview + drawn overlay). Persisted as a
		 *  sidecar file next to the feedback .md and linked inline. */
		attachmentDataUrl?: string | null
		/** Inline-text anchor for comments attached to a span of rendered
		 *  markdown. Persisted in the feedback frontmatter so the sidebar
		 *  can re-open the underlying artifact and flash the original
		 *  selection when the reviewer clicks the feedback card, AND so
		 *  an agent reading the feedback can open the source file
		 *  directly via the `filePath` field. */
		inlineAnchor?: {
			selectedText: string
			paragraph: number
			location: string
			commentId?: string
			/** Full relative path from repo root to the artifact file.
			 *  Authoritative locator: UI parses it to route, agent greps
			 *  it for the exact line. */
			filePath?: string
			/** Hash of the artifact's raw content when the comment was
			 *  saved. Used to detect drift on revisit. */
			contentSha?: string
		} | null
	},
): { feedback_id: string; file: string; num: number } {
	const dir = feedbackDir(slug, stage)
	mkdirSync(dir, { recursive: true })

	const num = nextFeedbackNumber(dir)
	const nn = zeroPad(num)
	const fileSlug = slugifyTitle(opts.title)
	const filename = `${nn}-${fileSlug}.md`
	const filePath = join(dir, filename)

	const origin = opts.origin || "agent"
	const authorType = deriveAuthorType(origin)
	const author = opts.author || deriveDefaultAuthor(origin)

	// Read current iteration count from the per-stage iterations log,
	// falling back to legacy state.json when present (test fixtures
	// and pre-v4 intents). Intent-scope feedback has no stage — use 0
	// as a neutral sentinel so the numbering stays deterministic.
	let iteration = 0
	if (stage) {
		const stateFile = stageStatePath(slug, stage)
		const fallback = existsSync(stateFile) ? readJson(stateFile) : {}
		iteration = getStageIterationCount(fallback, slug, stage)
	}

	// Persist a sidecar attachment if the caller passed one. Filename is
	// the same stem as the feedback .md (FB-NN-slug.<ext>) so the pair
	// is obvious on disk and stays adjacent in directory listings.
	// Raster PNG/JPEG/WebP only — SVG is deliberately rejected because
	// the feedback-attachment serve path renders image/svg+xml inline,
	// which executes embedded `<script>` in the tunnel origin. The
	// FeedbackCreateRequestSchema also rejects svg+xml at the HTTP
	// layer; this regex is the second gate.
	let attachmentBasename: string | null = null
	if (opts.attachmentDataUrl) {
		const match = opts.attachmentDataUrl.match(
			/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
		)
		if (match) {
			const mime = match[1]
			const ext = mime === "jpeg" ? "jpg" : mime
			attachmentBasename = `${nn}-${fileSlug}.${ext}`
			const attachmentPath = join(dir, attachmentBasename)
			writeFileSync(attachmentPath, Buffer.from(match[2], "base64"))
		}
	}

	// V-10 server-side sanitization. Every external-input body field flows
	// through this single chokepoint before it hits disk. Strips dangerous
	// HTML tags (<script>, <iframe>, <object>, <style>, <form>, <embed>),
	// inline event handlers (on*=), dangerous attributes (formaction,
	// srcdoc), and dangerous URL schemes (javascript:, vbscript:,
	// data:text/html) from both HTML attributes and markdown link/image
	// syntax. Markdown safe constructs are preserved.
	const sanitizedBody = sanitizeFeedbackBody(opts.body)

	// Link the attachment via the server route so MarkdownViewer's
	// default <img> renders correctly in the review UI. Storing a
	// root-relative URL (rather than `./…`) avoids depending on the
	// current page's path — all review pages share the same origin.
	const bodyWithAttachment = attachmentBasename
		? `${sanitizedBody.trim()}\n\n![annotation](/api/feedback-attachment/${encodeURIComponent(slug)}/${encodeURIComponent(stage)}/${encodeURIComponent(attachmentBasename)})\n`
		: sanitizedBody

	const allowedResolutions = new Set([
		"question",
		"inline_fix",
		"stage_revisit",
	])
	const normalizedResolution =
		typeof opts.resolution === "string" &&
		allowedResolutions.has(opts.resolution)
			? opts.resolution
			: null
	const frontmatter: Record<string, unknown> = {
		title: opts.title,
		status: "pending",
		origin,
		author,
		author_type: authorType,
		created_at: timestamp(),
		iteration,
		visit: iteration, // legacy alias
		source_ref: opts.source_ref ?? null,
		closed_by: null,
		bolt: 0,
		// Agent-authored FBs auto-triage: the agent picked the stage in
		// context, so there's nothing for the triage gate to relocate.
		// Human-authored FBs (user-chat, user-visual, etc.) stay
		// untriaged so the pre-tick gate prompts the agent to confirm
		// or relocate before any stage work proceeds.
		triaged_at:
			opts.triaged_at !== undefined
				? opts.triaged_at
				: authorType === "agent"
					? timestamp()
					: null,
		resolution: normalizedResolution,
		replies: [],
		...(attachmentBasename ? { attachment: attachmentBasename } : {}),
		...(opts.inlineAnchor
			? {
					inline_anchor: {
						selected_text: opts.inlineAnchor.selectedText,
						paragraph: opts.inlineAnchor.paragraph,
						location: opts.inlineAnchor.location,
						...(opts.inlineAnchor.commentId
							? { comment_id: opts.inlineAnchor.commentId }
							: {}),
						...(opts.inlineAnchor.filePath
							? { file_path: opts.inlineAnchor.filePath }
							: {}),
						...(opts.inlineAnchor.contentSha
							? { content_sha: opts.inlineAnchor.contentSha }
							: {}),
					},
				}
			: {}),
	}

	const content = matter.stringify(`\n${bodyWithAttachment}\n`, frontmatter)
	writeFileSync(filePath, content)

	const relPath = stage
		? `.haiku/intents/${slug}/stages/${stage}/feedback/${filename}`
		: `.haiku/intents/${slug}/feedback/${filename}`
	return { feedback_id: `FB-${nn}`, file: relPath, num }
}

/**
 * Read and parse all feedback files in a stage's feedback directory.
 * Returns an array of FeedbackItem sorted by numeric prefix.
 */
export function readFeedbackFiles(slug: string, stage: string): FeedbackItem[] {
	const dir = feedbackDir(slug, stage)
	if (!existsSync(dir)) return []

	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.sort()
	const items: FeedbackItem[] = []

	for (const f of files) {
		const match = f.match(/^(\d+)-(.+)\.md$/)
		if (!match) continue
		const num = Number.parseInt(match[1], 10)
		const fileSlug = match[2]
		const raw = readFileSync(join(dir, f), "utf8")
		const { data, body } = parseFrontmatter(raw)

		const resolutionRaw = (data as { resolution?: unknown }).resolution
		const resolution =
			typeof resolutionRaw === "string" &&
			resolutionRaw.length > 0 &&
			resolutionRaw !== "null"
				? resolutionRaw
				: null
		const rawReplies = (data as { replies?: unknown }).replies
		const replies: FeedbackReply[] = Array.isArray(rawReplies)
			? rawReplies
					.filter(
						(r): r is Record<string, unknown> =>
							typeof r === "object" && r !== null,
					)
					.map((r) => ({
						author: typeof r.author === "string" ? r.author : "unknown",
						author_type: r.author_type === "agent" ? "agent" : "human",
						body: typeof r.body === "string" ? r.body : "",
						created_at: typeof r.created_at === "string" ? r.created_at : "",
					}))
			: []
		items.push({
			id: `FB-${zeroPad(num)}`,
			num,
			slug: fileSlug,
			file: stage
				? `.haiku/intents/${slug}/stages/${stage}/feedback/${f}`
				: `.haiku/intents/${slug}/feedback/${f}`,
			title: (data.title as string) || "",
			body,
			status: (data.status as string) || "pending",
			origin: (data.origin as string) || "agent",
			author: (data.author as string) || "agent",
			author_type: (data.author_type as string) || "agent",
			created_at: (data.created_at as string) || "",
			visit: (data.visit as number) || 0,
			source_ref: (data.source_ref as string) || null,
			closed_by: (data.closed_by as string) || null,
			closed_at: (data.closed_at as string) || null,
			bolt: typeof data.bolt === "number" ? (data.bolt as number) : 0,
			// Back-compat for FBs authored before triaged_at existed:
			// agent-authored FBs were always filed in-context, so a
			// missing triaged_at is treated as "triaged at creation
			// time" rather than "needs triage." Without this fallback,
			// the pre-tick gate would force a triage round-trip on
			// every legacy agent FB after upgrade.
			triaged_at: (() => {
				const explicit =
					typeof data.triaged_at === "string" &&
					(data.triaged_at as string).length > 0
						? (data.triaged_at as string)
						: null
				if (explicit) return explicit
				const at = (data.author_type as string) || ""
				const createdAt = (data.created_at as string) || ""
				if (at === "agent" && createdAt) return createdAt
				return null
			})(),
			resolution,
			replies,
			inline_anchor: parseInlineAnchor(data),
			iterations: parseFeedbackIterations(data),
			closure_reply: (() => {
				const cr = (data as { closure_reply?: unknown }).closure_reply
				if (!cr || typeof cr !== "object") return null
				const obj = cr as Record<string, unknown>
				const text = typeof obj.text === "string" ? obj.text : ""
				const at = typeof obj.at === "string" ? obj.at : ""
				if (!text || !at) return null
				return { text, at }
			})(),
			closure_reply_unread:
				typeof (data as { closure_reply_unread?: unknown })
					.closure_reply_unread === "boolean"
					? ((data as { closure_reply_unread?: boolean })
							.closure_reply_unread as boolean)
					: false,
		})
	}

	return items
}

function parseFeedbackIterations(
	data: Record<string, unknown>,
): FeedbackIteration[] {
	const raw = data.iterations
	if (!Array.isArray(raw)) return []
	const out: FeedbackIteration[] = []
	for (const entry of raw) {
		if (!(entry && typeof entry === "object")) continue
		const e = entry as Record<string, unknown>
		const bolt = typeof e.bolt === "number" ? e.bolt : 0
		const hat = typeof e.hat === "string" ? e.hat : ""
		if (!hat) continue
		const result = e.result
		const validResult =
			result === "advanced" ||
			result === "closed" ||
			result === "reopened" ||
			result === "rejected"
		out.push({
			bolt,
			hat,
			...(typeof e.started_at === "string" ? { started_at: e.started_at } : {}),
			...(typeof e.completed_at === "string"
				? { completed_at: e.completed_at }
				: {}),
			...(validResult ? { result: result as FeedbackIteration["result"] } : {}),
			...(typeof e.commit === "string" ? { commit: e.commit } : {}),
			...(typeof e.reason === "string" ? { reason: e.reason } : {}),
		})
	}
	return out
}

/**
 * Append one entry to a feedback file's `iterations:` frontmatter array.
 * Designed to be safe under concurrent fix-chain execution: reads the
 * current file, appends, writes back. Callers are the orchestrator
 * (on bolt dispatch start) and the validator closure path (on bolt
 * finish). If the file doesn't exist (shouldn't happen in normal
 * operation), this is a no-op so startup races don't crash the workflow engine.
 */
export function appendFeedbackIteration(
	slug: string,
	stage: string,
	feedbackId: string,
	entry: FeedbackIteration,
): void {
	const dir = feedbackDir(slug, stage)
	if (!existsSync(dir)) return
	const nn = feedbackId.replace(/^FB-/, "")
	const file = readdirSync(dir).find(
		(f) => f.startsWith(`${nn}-`) && f.endsWith(".md"),
	)
	if (!file) return
	const path = join(dir, file)
	const raw = readFileSync(path, "utf8")
	const parsed = matter(raw)
	const current = Array.isArray(
		(parsed.data as { iterations?: unknown }).iterations,
	)
		? ((parsed.data as { iterations: unknown[] }).iterations as unknown[])
		: []
	const next = [
		...current,
		{
			bolt: entry.bolt,
			hat: entry.hat,
			...(entry.started_at ? { started_at: entry.started_at } : {}),
			...(entry.completed_at ? { completed_at: entry.completed_at } : {}),
			...(entry.result ? { result: entry.result } : {}),
			...(entry.commit ? { commit: entry.commit } : {}),
			...(entry.reason ? { reason: entry.reason } : {}),
		},
	]
	const updated = {
		...(parsed.data as Record<string, unknown>),
		iterations: next,
	}
	writeFileSync(path, matter.stringify(parsed.content, normalizeDates(updated)))
}

function parseInlineAnchor(
	data: Record<string, unknown>,
): FeedbackItem["inline_anchor"] {
	const raw = data.inline_anchor
	if (!(raw && typeof raw === "object")) return null
	const a = raw as Record<string, unknown>
	const selectedText = a.selected_text ?? a.selectedText
	const paragraph = a.paragraph
	const location = a.location
	if (
		typeof selectedText !== "string" ||
		typeof paragraph !== "number" ||
		typeof location !== "string"
	) {
		return null
	}
	return {
		selected_text: selectedText,
		paragraph,
		location,
		...(typeof a.comment_id === "string" ? { comment_id: a.comment_id } : {}),
		...(typeof a.file_path === "string" ? { file_path: a.file_path } : {}),
		...(typeof a.content_sha === "string"
			? { content_sha: a.content_sha }
			: {}),
	}
}

/**
 * Count feedback items that still block the stage gate. An item is open
 * (blocking) when it has neither been independently verified (`closed_by`
 * set by the feedback-assessor hat) nor rejected. `status` is derived —
 * `closed_by` is the source of truth.
 */
export function countPendingFeedback(slug: string, stage: string): number {
	return readFeedbackFiles(slug, stage).filter((item) => {
		// An item blocks the gate when it is not yet resolved. Resolved means:
		//   - `closed_by` set (any unit closed it), OR
		//   - status is one of "closed" / "addressed" / "rejected"
		// Everything else (status "pending", regardless of other fields) blocks.
		const closedBy = (item as { closed_by?: unknown }).closed_by
		if (typeof closedBy === "string" && closedBy.length > 0) return false
		if (
			item.status === "closed" ||
			item.status === "addressed" ||
			item.status === "answered" ||
			item.status === "rejected"
		)
			return false
		return true
	}).length
}

/**
 * Find a feedback file by its FB-NN identifier (or bare numeric prefix).
 * Returns the absolute path and parsed data, or null if not found.
 */
export function findFeedbackFile(
	slug: string,
	stage: string,
	feedbackId: string,
): {
	path: string
	filename: string
	data: Record<string, unknown>
	body: string
} | null {
	const dir = feedbackDir(slug, stage)
	if (!existsSync(dir)) return null

	// Normalize the input id to its numeric value: "FB-03" / "FB-3" / "3"
	// / "03" all map to 3. Files on disk are zero-padded
	// (`02-some-slug.md`), so a string-prefix match against the un-padded
	// input would miss them — go through the parsed integer to be robust.
	const numMatch = feedbackId.match(/^(?:FB-)?(\d+)$/i)
	if (!numMatch) return null
	const targetNum = Number.parseInt(numMatch[1], 10)

	const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
	const match = files.find((f) => {
		const fileNumMatch = f.match(/^(\d+)-/)
		return fileNumMatch && Number.parseInt(fileNumMatch[1], 10) === targetNum
	})
	if (!match) return null

	const raw = readFileSync(join(dir, match), "utf8")
	const parsed = parseFrontmatter(raw)
	return {
		path: join(dir, match),
		filename: match,
		data: parsed.data,
		body: parsed.body,
	}
}

/**
 * Move (or confirm placement for) a feedback file. When `fromStage` ===
 * `toStage`, this is a no-op move that just stamps `triaged_at:` on the
 * FM — used by the triage gate to confirm the FB is in the right home.
 * When the stages differ the file is renamed into the target stage's
 * `feedback/` dir, renumbered to the next free FB-NN there, and any
 * sibling attachment file (FB-NN-slug.png/jpg/webp) is moved alongside.
 *
 * Lifecycle: closed and rejected FBs are immutable — caller must check
 * status before invoking and surface a lifecycle_violation reply.
 *
 * Returns the new absolute path + new feedback id, or null if the FB
 * was not found at the source location.
 */
export function moveFeedbackFile(
	slug: string,
	fromStage: string,
	feedbackId: string,
	toStage: string,
): {
	feedback_id: string
	file: string
	moved: boolean
	triaged_at: string
} | null {
	const found = findFeedbackFile(slug, fromStage, feedbackId)
	if (!found) return null

	const triagedAt = timestamp()
	const data: Record<string, unknown> = {
		...found.data,
		triaged_at: triagedAt,
	}

	// No-op move: same source + target. Just stamp triaged_at.
	if (fromStage === toStage) {
		const content = matter.stringify(`\n${found.body.trim()}\n`, data)
		writeFileSync(found.path, content)
		const relPath = fromStage
			? `.haiku/intents/${slug}/stages/${fromStage}/feedback/${found.filename}`
			: `.haiku/intents/${slug}/feedback/${found.filename}`
		const fmId = data.id
		const id =
			typeof fmId === "string" && fmId.length > 0
				? fmId
				: deriveFeedbackIdFromFilename(found.filename)
		return {
			feedback_id: id,
			file: relPath,
			moved: false,
			triaged_at: triagedAt,
		}
	}

	// Cross-stage relocate: write into the target dir under a fresh
	// FB-NN, then unlink the source. Parse the source slug from the
	// filename so the target preserves the human-readable suffix.
	const targetDir = feedbackDir(slug, toStage)
	mkdirSync(targetDir, { recursive: true })
	const newNum = nextFeedbackNumber(targetDir)
	const newNN = zeroPad(newNum)
	const fileSlugMatch = found.filename.match(/^\d+-(.+)\.md$/)
	const fileSlug = fileSlugMatch ? fileSlugMatch[1] : "moved-feedback"
	const newFilename = `${newNN}-${fileSlug}.md`
	const newPath = join(targetDir, newFilename)

	const fromDir = feedbackDir(slug, fromStage)
	const oldNNMatch = found.filename.match(/^(\d+)-/)
	const oldNN = oldNNMatch ? oldNNMatch[1] : null

	// Pre-flight: check every potential sidecar collision BEFORE any
	// filesystem writes. Defense in depth — even after
	// deleteFeedbackFile started cleaning sidecars, an orphan could
	// exist from older versions or out-of-band manual edits. POSIX
	// renameSync silently overwrites, so we refuse loudly. Doing the
	// check pre-write avoids leaving a stranded destination .md
	// (split-brain state) when a collision is detected mid-loop.
	if (oldNN) {
		for (const ext of ["png", "jpg", "jpeg", "webp"]) {
			const oldAttachment = join(fromDir, `${oldNN}-${fileSlug}.${ext}`)
			if (existsSync(oldAttachment)) {
				const newAttachment = join(targetDir, `${newNN}-${fileSlug}.${ext}`)
				if (existsSync(newAttachment)) {
					throw new Error(
						`moveFeedbackFile: refusing to overwrite existing attachment '${newAttachment}' — clean it up manually before retrying.`,
					)
				}
			}
		}
	}

	const content = matter.stringify(`\n${found.body.trim()}\n`, data)
	writeFileSync(newPath, content)

	// Move sidecar attachment if present. Original attachment names
	// follow `<NN>-<slug>.<ext>`; rename to match the new NN so the
	// markdown <img> link in the FB body keeps pointing at the right
	// file (the body is rewritten below to update the URL too).
	if (oldNN) {
		for (const ext of ["png", "jpg", "jpeg", "webp"]) {
			const oldAttachment = join(fromDir, `${oldNN}-${fileSlug}.${ext}`)
			if (existsSync(oldAttachment)) {
				const newAttachment = join(targetDir, `${newNN}-${fileSlug}.${ext}`)
				renameSync(oldAttachment, newAttachment)
				// Patch the body's attachment URL so it points at the new
				// stage + new NN. Server route format:
				// /api/feedback-attachment/<intent>/<stage>/<filename>
				const newBody = found.body.replace(
					new RegExp(
						`/api/feedback-attachment/[^/]+/[^/]+/${oldNN}-${fileSlug}\\.${ext}`,
						"g",
					),
					`/api/feedback-attachment/${encodeURIComponent(slug)}/${encodeURIComponent(toStage)}/${newNN}-${fileSlug}.${ext}`,
				)
				if (newBody !== found.body) {
					writeFileSync(
						newPath,
						matter.stringify(`\n${newBody.trim()}\n`, data),
					)
				}
			}
		}
	}

	unlinkSync(found.path)

	const relPath = toStage
		? `.haiku/intents/${slug}/stages/${toStage}/feedback/${newFilename}`
		: `.haiku/intents/${slug}/feedback/${newFilename}`
	return {
		feedback_id: `FB-${newNN}`,
		file: relPath,
		moved: true,
		triaged_at: triagedAt,
	}
}

export function deriveFeedbackIdFromFilename(filename: string): string {
	const m = filename.match(/^(\d+)-/)
	if (!m) return "FB-???"
	// Display format mirrors the on-disk padding the writer used.
	// New files use 3-digit pad; legacy files (pre-2026-05-07) used 2.
	// We preserve whatever width the file already has, so display
	// matches the actual filename for `ls` / SPA round-trip clarity.
	return `FB-${m[1]}`
}

/** Format a numeric feedback id back to canonical display form
 *  (`FB-NNN`). Handlers pass the input number through this so the
 *  response always carries the engine's canonical string regardless
 *  of how the input was framed (integer input, regex-normalised raw
 *  string, etc.). Width matches the on-disk padding (3 digits). */
export function formatFeedbackId(num: number): string {
	return `FB-${num.toString().padStart(3, "0")}`
}

/**
 * Update mutable fields on an existing feedback file.
 * Validates author-type guards for MCP (agent) context.
 * Returns the updated fields list or an error string.
 */
export function updateFeedbackFile(
	slug: string,
	stage: string,
	feedbackId: string,
	fields: {
		status?: string
		closed_by?: string | null
		resolution?: string | null
	},
	callerContext: "agent" | "human" = "agent",
): { ok: true; updated_fields: string[] } | { ok: false; error: string } {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) {
		return {
			ok: false,
			error: stage
				? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
				: `Error: feedback '${feedbackId}' not found (intent-scope)`,
		}
	}

	// At least one updatable field must be provided
	if (
		fields.status === undefined &&
		fields.closed_by === undefined &&
		fields.resolution === undefined
	) {
		return {
			ok: false,
			error:
				"Error: at least one of 'status' / 'closed_by' / 'resolution' must be provided",
		}
	}

	// Validate resolution enum when present (undefined = no change, null = clear).
	if (
		fields.resolution !== undefined &&
		fields.resolution !== null &&
		!new Set(["question", "inline_fix", "stage_revisit"]).has(fields.resolution)
	) {
		return {
			ok: false,
			error:
				"Error: resolution must be one of: question, inline_fix, stage_revisit (or null to clear). For cross-stage routing, call `haiku_feedback_move` to relocate the FB instead.",
		}
	}

	// Validate status enum
	if (
		fields.status !== undefined &&
		!(FEEDBACK_STATUSES as readonly string[]).includes(fields.status)
	) {
		return {
			ok: false,
			error: `Error: status must be one of: ${FEEDBACK_STATUSES.join(", ")}`,
		}
	}

	// Guard: agents cannot mark human-authored feedback as `closed` by setting
	// `closed_by`. Human-authored items may only be closed by the human who
	// authored them, via the review UI.
	if (
		callerContext === "agent" &&
		typeof fields.closed_by === "string" &&
		fields.closed_by.length > 0 &&
		found.data.author_type === "human"
	) {
		return {
			ok: false,
			error:
				"Error: agents cannot close human-authored feedback. Only the original author may set `closed_by` via the review UI.",
		}
	}

	// FB-24: parallel guard against the `status: "closed"` bypass path. The
	// `closed_by` check above blocks the canonical close route, but an agent
	// could still set `status: "closed"` directly on a human item and have
	// `countPendingFeedback` skip it at the gate. Block that too — the
	// human-authored privilege is that ONLY a human can close the item, via
	// any path. (`addressed` / `rejected` remain agent-accessible by design
	// — they're downgrade paths the threat model accepts as medium residual
	// and covers with separate gate-policy mitigations.)
	if (
		callerContext === "agent" &&
		fields.status === "closed" &&
		found.data.author_type === "human"
	) {
		return {
			ok: false,
			error:
				"Error: agents cannot set status='closed' on human-authored feedback. Only the original author may close the item, via the review UI.",
		}
	}

	// Guard: if closed_by uses the unit-NN-slug convention (pre-execute spec
	// revisit), verify the unit spec actually exists on disk. Prevents the
	// ghost-unit ledger drift: agents marking findings closed via a unit
	// that was never produced (or was deleted by a later revisit), leaving
	// the review gate believing work landed when the artifacts were never
	// touched. Fix-loop markers ("fix-loop:...", "intent-fix:...") are
	// free-form and skip this check.
	if (
		typeof fields.closed_by === "string" &&
		/^unit-\d+[-_]/i.test(fields.closed_by) &&
		stage
	) {
		const unitBase = fields.closed_by.replace(/\.md$/, "")
		const unitFile = join(stageDir(slug, stage), "units", `${unitBase}.md`)
		if (!existsSync(unitFile)) {
			return {
				ok: false,
				error: `Error: closed_by='${fields.closed_by}' references a unit that does not exist at stages/${stage}/units/${unitBase}.md. Agents cannot mark findings closed via a ghost unit. Either create the unit spec first (additive elaboration), or close via a fix-loop marker (e.g. 'fix-loop:${feedbackId}:bolt-N').`,
			}
		}
	}

	// Apply updates
	const updated: string[] = []
	const newData = { ...found.data }

	if (fields.status !== undefined) {
		newData.status = fields.status
		updated.push("status")
	}
	if (fields.closed_by !== undefined) {
		if (fields.closed_by === null) {
			newData.closed_by = undefined
		} else {
			newData.closed_by = fields.closed_by
		}
		updated.push("closed_by")
	}
	if (fields.resolution !== undefined) {
		newData.resolution = fields.resolution
		updated.push("resolution")
	}

	writeFileSync(found.path, matter.stringify(`\n${found.body}\n`, newData))
	return { ok: true, updated_fields: updated }
}

/**
 * Append a reply to a feedback thread. `close_as_answered` flips the
 * parent's `status` to `answered` in the same write so the workflow engine sees
 * the item as resolved on the next tick.
 */
export function appendFeedbackReply(
	slug: string,
	stage: string,
	feedbackId: string,
	reply: {
		author: string
		author_type: "human" | "agent"
		body: string
	},
	opts: { close_as_answered?: boolean } = {},
):
	| { ok: true; reply_index: number; status: string }
	| { ok: false; error: string } {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) {
		return {
			ok: false,
			error: stage
				? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
				: `Error: feedback '${feedbackId}' not found (intent-scope)`,
		}
	}
	// V-10 server-side sanitization on reply bodies — same chokepoint
	// rationale as writeFeedbackFile above.
	const sanitized = sanitizeFeedbackBody(reply.body)
	const trimmed = sanitized.trim()
	if (trimmed.length === 0) {
		return { ok: false, error: "Error: reply body cannot be empty" }
	}
	const newReply = {
		author: reply.author || "unknown",
		author_type: reply.author_type,
		body: trimmed,
		created_at: timestamp(),
	}
	const existingReplies = Array.isArray(found.data.replies)
		? (found.data.replies as unknown[])
		: []
	const replies = [...existingReplies, newReply]
	const newData: Record<string, unknown> = { ...found.data, replies }
	if (opts.close_as_answered) newData.status = "answered"
	writeFileSync(found.path, matter.stringify(`\n${found.body}\n`, newData))
	return {
		ok: true,
		reply_index: replies.length - 1,
		status:
			(newData.status as string) || (found.data.status as string) || "pending",
	}
}

/**
 * Increment the fix-loop bolt counter on a feedback item and set status to
 * "fixing". Called by the workflow engine before dispatching a fix-hat sequence against
 * the finding. Returns the new bolt number, or null if the file is missing.
 * Does NOT validate the ceiling — callers must check MAX_FIX_LOOP_BOLTS
 * themselves so they can choose to escalate vs. continue.
 */
export function incrementFeedbackBolt(
	slug: string,
	stage: string,
	feedbackId: string,
): { bolt: number } | null {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) return null
	const currentBolt =
		typeof found.data.bolt === "number" ? (found.data.bolt as number) : 0
	const newBolt = currentBolt + 1
	const newData = { ...found.data, bolt: newBolt, status: "fixing" }
	writeFileSync(found.path, matter.stringify(`\n${found.body}\n`, newData))
	return { bolt: newBolt }
}

/**
 * Flip `closure_reply_unread` to `false` on a closed FB. Called by the
 * SPA when the reviewer dismisses the agent's reply card.
 *
 * Returns `null` if the FB doesn't exist; otherwise the (possibly
 * unchanged) FB after the write. Callers that flip an already-dismissed
 * reply get a no-op write — fine, idempotent.
 */
export function dismissFeedbackClosureReply(
	slug: string,
	stage: string,
	feedbackId: string,
): { ok: true; already_dismissed: boolean } | null {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) return null
	const wasUnread = found.data.closure_reply_unread === true
	if (!wasUnread) return { ok: true, already_dismissed: true }
	const newData = { ...found.data, closure_reply_unread: false }
	writeFileSync(found.path, matter.stringify(`\n${found.body}\n`, newData))
	return { ok: true, already_dismissed: false }
}

/**
 * Delete a feedback file with guards:
 * - Cannot delete pending items (must be addressed/closed/rejected first)
 * - Agent callers cannot delete human-authored items
 */
export function deleteFeedbackFile(
	slug: string,
	stage: string,
	feedbackId: string,
	callerContext: "agent" | "human" = "agent",
): { ok: true } | { ok: false; error: string } {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) {
		return {
			ok: false,
			error: stage
				? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
				: `Error: feedback '${feedbackId}' not found (intent-scope)`,
		}
	}

	// v4 guards run in priority: human-authored first (no agent
	// recovery for this), then "open" guard (closed_at must be set).
	//
	// Order matters: prior pending-first ordering meant deleting a
	// human-authored open FB returned "cannot delete pending" instead
	// of the human-authored error, which obscured the real reason.
	// v4 surfaces the human-authored block immediately.

	// Guard: agents cannot delete human-authored items
	if (callerContext === "agent" && found.data.author_type === "human") {
		return {
			ok: false,
			error:
				"Error: agents cannot delete human-authored feedback. Use the review UI.",
		}
	}

	// v4 open guard: an FB is "open" when closed_at is null. Pre-v4
	// FBs migrated via the v0→v4 soft-scrub get closed_at synthesized
	// from terminal status. Legacy fixtures with status: pending/fixing
	// are also treated as open for backward compat.
	const isOpenForDelete =
		!(
			typeof found.data.closed_at === "string" &&
			found.data.closed_at.length > 0
		) &&
		(found.data.status === "pending" ||
			found.data.status === "fixing" ||
			!found.data.status)
	if (isOpenForDelete) {
		return {
			ok: false,
			error: `Error: cannot delete pending feedback. Close or reject it first.`,
		}
	}

	unlinkSync(found.path)

	// Sidecar cleanup: writeFeedbackFile may have persisted a
	// raster attachment alongside the .md as `<NN>-<slug>.<ext>`.
	// Remove any matching sidecars so the dir doesn't accumulate
	// orphans (orphans are invisible to nextFeedbackNumber and can
	// collide with subsequent moves).
	const dir = dirname(found.path)
	const stemMatch = found.filename.match(/^(\d+-.+)\.md$/)
	if (stemMatch) {
		const stem = stemMatch[1]
		for (const ext of ["png", "jpg", "jpeg", "webp"]) {
			const sidecar = join(dir, `${stem}.${ext}`)
			if (existsSync(sidecar)) {
				try {
					unlinkSync(sidecar)
				} catch {
					/* best-effort — caller still got their .md deleted */
				}
			}
		}
	}

	return { ok: true }
}

// ── Skill discovery ───────────────────────────────────────────────────────

export interface InstalledSkill {
	slug: string
	name: string
	description: string
	source: "plugin" | "project" | "global"
}

/**
 * Enumerate all Claude Code skills (slash commands) visible to the current
 * session. Three search locations, in priority order (project > global > plugin):
 *
 *   1. Project-local skills — `{cwd}/.claude/skills/{slug}/SKILL.md`
 *   2. Global user plugins  — `~/.claude/plugins/<plugin>/skills/{slug}/SKILL.md`
 *   3. Plugin-root skills   — `{CLAUDE_PLUGIN_ROOT}/skills/{slug}/SKILL.md`
 *
 * De-duplicated by slug (first occurrence wins). More-specific contexts
 * shadow less-specific ones: a project-local skill overrides a global skill
 * with the same slug, which in turn overrides a plugin-bundled skill.
 * Returns an empty array when no skills directory is found; never throws.
 */
export function listInstalledSkills(): InstalledSkill[] {
	const skills: InstalledSkill[] = []
	const seen = new Set<string>()

	function readSkillDir(dir: string, source: InstalledSkill["source"]): void {
		if (!existsSync(dir)) return
		let entries: Dirent[]
		try {
			entries = readdirSync(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const slug = entry.name
			if (seen.has(slug)) continue
			const skillFile = join(dir, slug, "SKILL.md")
			if (!existsSync(skillFile)) continue
			seen.add(slug)
			try {
				const raw = readFileSync(skillFile, "utf8")
				const { data } = parseFrontmatter(raw)
				skills.push({
					slug,
					name: (data.name as string) || slug,
					description: (data.description as string) || "",
					source,
				})
			} catch {
				/* skip malformed skill files */
			}
		}
	}

	// 1. Project-local skills (.claude/skills/ in cwd) — most specific, wins.
	readSkillDir(join(process.cwd(), ".claude", "skills"), "project")

	// 2. Global user skills (~/.claude/plugins/*/skills/).
	try {
		const globalPluginsDir = join(homedir(), ".claude", "plugins")
		if (existsSync(globalPluginsDir)) {
			for (const entry of readdirSync(globalPluginsDir, {
				withFileTypes: true,
			})) {
				if (!entry.isDirectory()) continue
				readSkillDir(join(globalPluginsDir, entry.name, "skills"), "global")
			}
		}
	} catch {
		/* non-fatal */
	}

	// 3. Plugin-root skills (haiku plugin's bundled skills) — fallback.
	const pluginRoot = resolvePluginRoot()
	if (pluginRoot) readSkillDir(join(pluginRoot, "skills"), "plugin")

	return skills
}

// ── Tool definitions ───────────────────────────────────────────────────────

/** Public shape of a state-tool definition entry. Declared explicitly
 *  so the `stateToolDefs` array's exported type doesn't leak
 *  TypeBox-branded internal types (Kind / OptionalKind / etc.) from
 *  the schemas referenced via `inputSchema:`. The MCP SDK accepts a
 *  plain `Record<string, unknown>` for the schema slots, so widening
 *  via `jsonSchemaOf()` at each call site keeps the runtime correct
 *  while this annotation keeps the type clean. */
export interface StateToolDef {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	outputSchema?: Record<string, unknown>
}

export const stateToolDefs: StateToolDef[] = [
	// Intent tools
	{
		name: "haiku_intent_get",
		description: "Read a field from an intent's frontmatter",
		inputSchema: jsonSchemaOf(HAIKU_INTENT_GET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: {
					type: "boolean",
					description: "True if the intent file exists.",
				},
				field: {
					type: "string",
					description: "Echoed field name from the request.",
				},
				value: {
					description:
						"Field value as parsed from frontmatter. Null when missing or when the intent doesn't exist.",
				},
			},
			required: ["found", "field"],
		},
	},
	{
		name: "haiku_intent_list",
		description: "List all intents in the workspace",
		inputSchema: jsonSchemaOf(HAIKU_INTENT_LIST_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				intents: {
					type: "array",
					items: {
						type: "object",
						properties: {
							slug: { type: "string" },
							title: { type: "string" },
							status: { type: "string" },
							studio: { type: "string" },
							archived: { type: "boolean" },
						},
						required: ["slug"],
					},
				},
			},
			required: ["intents"],
		},
	},
	// Stage tools
	{
		name: "haiku_stage_get",
		description: "Read a field from a stage's state",
		inputSchema: jsonSchemaOf(HAIKU_STAGE_GET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: { type: "boolean" },
				field: { type: "string" },
				value: {
					description:
						"Stage state field value. v3 reads it from per-stage state.json; v4 derives stage state from per-unit `iterations[]` + branch-merge state. Null when missing.",
				},
			},
			required: ["found", "field"],
		},
	},
	// Unit tools
	// haiku_unit_get — REMOVED from the agent-callable schema per
	// architecture §1.1 / §1.2 (FM is workflow engine-only; agent-callable reads must
	// return body + title only via haiku_unit_read). The case handler in
	// handleStateTool is retained for workflow engine-internal callers (orchestrator,
	// state-integrity, etc.) but agents can no longer reach it through MCP.
	{
		name: "haiku_unit_set",
		description: `Set a field in a unit's frontmatter. \`value\` MUST match the field's declared type in the unit FM schema — array for \`inputs:\` / \`outputs:\` / \`depends_on:\` / \`closes:\` / \`quality_gates:\`, string for \`title:\` / \`model:\`. The handler validates per-field at runtime and rejects mismatches with \`field_type_mismatch\` so type drift never lands in YAML. Agent-authorable fields: ${AGENT_AUTHORABLE_UNIT_FIELDS.join(", ")}. FSM-driven (rejected): ${FSM_DRIVEN_UNIT_FIELDS.join(", ")}.`,
		inputSchema: jsonSchemaOf(HAIKU_UNIT_SET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				message: { type: "string" },
				error: { type: "string" },
				current_status: {
					type: "string",
					description:
						"On lifecycle_violation: the unit's current immutable status.",
				},
				field: { type: "string" },
			},
		},
	},
	{
		name: "haiku_unit_list",
		description: "List all units in a stage with their status",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_LIST_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				units: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							status: {
								type: "string",
								description: "pending | active | completed",
							},
							bolt: { type: "number" },
							hat: { type: "string" },
							model: { type: ["string", "null"] },
						},
						required: ["name"],
					},
				},
			},
			required: ["units"],
		},
	},
	{
		name: "haiku_unit_start",
		description:
			"Mark a unit as started. The system resolves the stage and first hat internally.",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_START_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				unit: { type: "string" },
				stage: { type: "string" },
				first_hat: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_unit_advance_hat",
		description:
			"Advance a unit to the next hat in the sequence. When called on the last hat, auto-completes the unit and progresses the workflow engine. The system resolves the current hat, next hat, and stage internally.",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				unit: { type: "string" },
				current_hat: {
					type: "string",
					description: "The hat that just finished.",
				},
				next_hat: {
					type: ["string", "null"],
					description:
						"The hat to dispatch next, or null when the unit auto-completed.",
				},
				completed: {
					type: "boolean",
					description:
						"True if this advance closed the unit (last hat in the sequence).",
				},
				bolt: { type: "number" },
				message: { type: "string" },
				error: {
					type: "string",
					description: "On failure: stable named error code.",
				},
			},
			required: ["message"],
		},
	},
	{
		name: "haiku_unit_reject_hat",
		description:
			"Reject the current hat's work — moves back to the previous hat and increments bolt. Pass `reason` so the unit's iteration history records why the hat was rejected (what failed, which criterion wasn't met).",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				unit: { type: "string" },
				rejecting_hat: { type: "string" },
				next_dispatched_hat: { type: ["string", "null"] },
				new_bolt: { type: "number" },
				reason: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
			required: ["message"],
		},
	},
	// v4: haiku_unit_increment_bolt removed. Bolt is derived from
	// iterations.length; agents never increment it directly.
	{
		name: "haiku_unit_read",
		description:
			"Read a unit's body content (and title). Returns ONLY the body and title — frontmatter is workflow engine-internal and not exposed to agents per the architecture's FM-is-workflow engine-only rule. Use this when a hat needs to read another unit's substance (sibling references, prior-stage knowledge artifacts) without interpreting FM. Returns { title, body } as JSON.",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_READ_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description:
						"Unit title from frontmatter (or derived from first H1).",
				},
				body: {
					type: "string",
					description:
						"Full markdown body. Frontmatter is intentionally not exposed (workflow engine-only per architecture §1.1).",
				},
				error: { type: "string", description: "On not-found / wrong-stage." },
			},
		},
	},
	{
		name: "haiku_unit_delete",
		description:
			"Delete a unit. ONLY permitted when the unit's status is `pending`. Active and completed units are immutable per the forward-only lifecycle rule — once a unit has informed downstream work, deleting it would silently invalidate that work. Returns an error naming the rule when called against a non-pending unit.",
		inputSchema: jsonSchemaOf(HAIKU_UNIT_DELETE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				message: { type: "string" },
				error: { type: "string" },
				current_status: { type: "string" },
				required_status: { type: "string", const: "pending" },
			},
		},
	},
	{
		name: "haiku_unit_write",
		description: `Create or fully rewrite a unit file. This is the ONLY agent-callable path for authoring units — generic file Write/Edit on \`units/*.md\` is denied at the hook layer. The body is freeform markdown; the optional \`frontmatter\` is validated against the FM schema (depends_on entries must be strings with no self-reference and no cycles among declared units; etc.). Lifecycle: only allowed when the unit doesn't exist yet OR when its status is \`pending\`. Active and completed units are immutable.

Allowed FM fields (agent-authorable): ${AGENT_AUTHORABLE_UNIT_FIELDS.join(", ")} — plus any stage-specific fields the per-stage \`phases/ELABORATION.md\` documents.

Forbidden FM fields (workflow-driven, mutating these returns \`fsm_field_forbidden\`): ${FSM_DRIVEN_UNIT_FIELDS.join(", ")}.`,
		inputSchema: jsonSchemaOf(HAIKU_UNIT_WRITE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				created: {
					type: "boolean",
					description:
						"True if a new file was created; false if an existing pending unit was rewritten.",
				},
				unit: { type: "string", description: "Unit name." },
				stage: { type: "string", description: "Stage name." },
				intent: { type: "string", description: "Intent slug." },
				message: { type: "string" },
				// Error path
				error: {
					type: "string",
					description:
						"Stable error code: `frontmatter_validation_failed`, `dag_cycle_detected`, `lifecycle_violation`, `missing_args`, etc.",
				},
				errors: {
					type: "array",
					items: { type: "string" },
					description:
						"Per-rule error messages from the FM validator (e.g. `fsm_field_forbidden: '...'`).",
				},
				cycle_nodes: {
					type: "array",
					items: { type: "string" },
					description:
						"On `dag_cycle_detected`: the unit names involved in the cycle.",
				},
				current_status: {
					type: "string",
					description:
						"On `lifecycle_violation`: the current immutable status (active/completed).",
				},
			},
			required: ["message"],
		},
	},
	{
		name: "haiku_reconciliation_acknowledge",
		description:
			"Acknowledge upstream-artifact divergences detected by the pre-elaboration reconciliation gate. Records the decision in the stage's decision_log so the gate falls through on the next tick. Use this when the divergence is intentional (e.g. the upstream artifacts describe different surfaces that genuinely need different names). When the divergence is unintentional, edit the upstream artifacts to reconcile and re-run haiku_run_next instead — do NOT acknowledge to skip the work.",
		inputSchema: jsonSchemaOf(HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				intent: { type: "string" },
				stage: { type: "string" },
				rationale: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_decision_record",
		description:
			"Record an elaboration decision in the stage's decision_log, OR declare 'no architectural decisions in scope' for the stage. Used in collaborative-mode stages to track meaningful human-AI knowledge-unification moments instead of counting interaction turns. Each entry is an architectural choice the user picked between options, OR a choice the agent made and surfaced for veto-style approval. Padding questions don't count.",
		inputSchema: jsonSchemaOf(HAIKU_DECISION_RECORD_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	// Knowledge tools
	{
		name: "haiku_knowledge_list",
		description: "List knowledge artifacts for an intent",
		inputSchema: jsonSchemaOf(HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				files: { type: "array", items: { type: "string" } },
			},
			required: ["files"],
		},
	},
	{
		name: "haiku_knowledge_read",
		description: "Read a knowledge artifact",
		inputSchema: jsonSchemaOf(HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: { type: "boolean" },
				name: { type: "string" },
				content: { type: "string", description: "Raw markdown body." },
			},
			required: ["found", "name", "content"],
		},
	},
	// Skill tools
	{
		name: "haiku_skill_list",
		description:
			"List all Claude Code skills (slash commands) installed in the user's environment — plugin root, project-local (.claude/skills/), and global (~/.claude/plugins/*/skills/). " +
			"The elaborator calls this to annotate units with `applicable_skills:` frontmatter; hat subagent prompts surface those skills automatically.",
		inputSchema: jsonSchemaOf(HAIKU_EMPTY_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				skills: {
					type: "array",
					items: {
						type: "object",
						properties: {
							slug: {
								type: "string",
								description:
									"Skill slug — the identifier used in `applicable_skills:` frontmatter (no leading `/`).",
							},
							name: { type: "string" },
							description: { type: "string" },
							source: {
								type: "string",
								enum: ["plugin", "project", "global"],
							},
						},
						required: ["slug", "name", "description", "source"],
					},
				},
			},
			required: ["skills"],
		},
	},
	// Studio tools
	{
		name: "haiku_studio_list",
		description:
			"List all available studios with their description, stages, and category. Project-level studios (.haiku/studios/) override built-in ones on name collision.",
		inputSchema: jsonSchemaOf(HAIKU_EMPTY_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				studios: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							slug: { type: "string" },
							description: { type: "string" },
							category: { type: "string" },
							stages: { type: "array", items: { type: "string" } },
							source: { type: "string", enum: ["project", "plugin"] },
						},
						required: ["name", "slug"],
					},
				},
			},
			required: ["studios"],
		},
	},
	{
		name: "haiku_studio_get",
		description:
			"Read a studio's STUDIO.md — returns frontmatter fields and body text. Resolves project-level override first, then built-in.",
		inputSchema: jsonSchemaOf(HAIKU_STUDIO_GET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: { type: "boolean" },
				name: { type: "string" },
				slug: { type: "string" },
				aliases: { type: "array", items: { type: "string" } },
				dir: { type: "string" },
				description: { type: "string" },
				category: { type: "string" },
				stages: { type: "array", items: { type: "string" } },
				source: { type: "string" },
				path: { type: "string" },
				studio_md: { type: "string" },
				body: { type: "string" },
			},
			required: ["found"],
			additionalProperties: true,
		},
	},
	{
		name: "haiku_studio_stage_get",
		description:
			"Read a stage's STAGE.md from a studio — returns frontmatter fields (hats, review, requires, produces) and body text. Resolves project-level override first, then built-in.",
		inputSchema: jsonSchemaOf(HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: { type: "boolean" },
				body: { type: "string" },
				studio: { type: "string" },
				studio_dir: { type: "string" },
				stage_md: { type: "string" },
			},
			required: ["found"],
			additionalProperties: true,
		},
	},
	// Settings tools
	{
		name: "haiku_settings_get",
		description:
			"Read a field from .haiku/settings.yml (e.g. studio, stack.compute, providers, workspace, default_announcements, review_agents, operations_runtime). Returns empty string if not set.",
		inputSchema: jsonSchemaOf(HAIKU_SETTINGS_GET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				found: { type: "boolean" },
				field: { type: "string" },
				value: { description: "Field value — null when missing." },
			},
			required: ["found", "field"],
		},
	},
	{
		name: "haiku_settings_set",
		description:
			"Set a top-level field in .haiku/settings.yml. Validated against plugin/schemas/settings.schema.json. Pass `null` to delete a field. Use this instead of editing the file directly — Edit/Write/MultiEdit on .haiku/settings.yml is denied by the workflow-fields hook.",
		inputSchema: jsonSchemaOf(HAIKU_SETTINGS_SET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				field: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_intent_set",
		description: `Set a frontmatter field on an intent's intent.md. Validated against INTENT_FRONTMATTER_SCHEMA. Agent-authorable fields: ${AGENT_AUTHORABLE_INTENT_FIELDS.join(", ")} (note 'studio' is immutable post-creation). Engine-only fields (${FSM_DRIVEN_INTENT_FIELDS.join(", ")}) are rejected — those are mutated by the workflow engine itself. Use this instead of editing intent.md directly — Edit/Write/MultiEdit on intent.md is denied by the workflow-fields hook.`,
		inputSchema: jsonSchemaOf(HAIKU_INTENT_SET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				intent: { type: "string" },
				field: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_stage_set",
		description:
			"Set a field on stage state. v4: stage state.json is dead — status / phase / gate_outcome / etc. derive from per-unit FM and branch-merge state. This tool stays as a no-op-with-stable-error so legacy callers get a clean rejection. Agent calls return `stage_field_engine_only`.",
		inputSchema: jsonSchemaOf(HAIKU_STAGE_SET_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				intent: { type: "string" },
				stage: { type: "string" },
				field: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	// Aggregate / report tools
	{
		name: "haiku_dashboard",
		description:
			"Returns a formatted dashboard of all intents showing status, studio, active stage, mode, and per-stage status tables.",
		inputSchema: jsonSchemaOf(HAIKU_EMPTY_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				markdown: {
					type: "string",
					description: "Rendered dashboard report as markdown text.",
				},
			},
			required: ["markdown"],
		},
	},
	{
		name: "haiku_capacity",
		description:
			"Returns a capacity report grouped by studio — completed/active counts and median bolt counts per stage.",
		inputSchema: jsonSchemaOf(HAIKU_CAPACITY_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				markdown: {
					type: "string",
					description: "Rendered capacity report as markdown text.",
				},
				studio: {
					type: ["string", "null"],
					description: "Echoed studio filter when one was provided.",
				},
			},
			required: ["markdown"],
		},
	},
	{
		name: "haiku_reflect",
		description:
			"Returns detailed reflection data for an intent — per-stage summaries, unit completion counts, bolt counts, and analysis instructions.",
		inputSchema: jsonSchemaOf(HAIKU_REFLECT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: { message: { type: "string" } },
		},
	},
	{
		name: "haiku_review",
		description:
			"Runs a git diff against main/upstream and returns formatted pre-delivery code review instructions with diff, stats, review guidelines, and review-agent config.",
		inputSchema: jsonSchemaOf(HAIKU_REVIEW_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: { message: { type: "string" } },
		},
	},
	{
		name: "haiku_review_open",
		description:
			'Open an ad-hoc review pane in the browser for the active intent and BLOCK until the reviewer clicks Done or Request Changes (or the pane times out at 30min). The UI swaps Approve for Done/Close, shows an "Ad-hoc review" badge, and never mutates workflow engine state on its own. Return value is a concrete next-step instruction: on Done the tool returns "no changes requested"; on Request Changes it returns a nudge to call haiku_run_next so the durable feedback routes through the normal fix-loop / revisit path.',
		inputSchema: jsonSchemaOf(HAIKU_REVIEW_OPEN_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: { message: { type: "string" } },
		},
	},
	{
		name: "haiku_backlog",
		description:
			"Manage the backlog: list items, add new items, review items interactively, or promote items to intents.",
		inputSchema: jsonSchemaOf(HAIKU_BACKLOG_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				markdown: {
					type: "string",
					description: "Rendered backlog report as markdown text.",
				},
				action: {
					type: "string",
					enum: ["list", "add", "review", "promote"],
				},
			},
			required: ["markdown"],
		},
	},
	{
		name: "haiku_seed",
		description:
			"Manage seeds (future ideas): list by status, plant a new seed, or check planted seeds for trigger conditions.",
		inputSchema: jsonSchemaOf(HAIKU_SEED_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: { message: { type: "string" } },
		},
	},
	// Feedback tools
	{
		name: "haiku_feedback",
		description:
			'Create a feedback item for an intent. Writes a markdown file with frontmatter tracking status, origin, and author. Omit `stage` to log an intent-scope finding (used by the studio-level pre-intent-completion review layer). To request a stage rewind from the agent side (planner blocked, upstream gap, etc.), pass `stage: "<earlier-stage>"` and `resolution: "stage_revisit"` — the next `haiku_run_next` will route through the pre-tick gate and emit a `revisited` action. Revisit is a property of run_next mechanics, not a separate verb. Pass `inline_anchor: { selected_text, paragraph, location, file_path? }` when the finding points at a specific span of an artifact — the SPA will scroll-and-flash the excerpt when the reviewer clicks the feedback card. Adversarial-review and studio-review hats should attach an anchor whenever they cite a specific line.',
		// SCHEMA IS THE SSOT — defined in state/schemas/feedback.ts
		// (HAIKU_FEEDBACK_INPUT_SCHEMA). The handler runs the same
		// schema through AJV at entry so the MCP-runtime check and the
		// engine's stable error codes can never drift.
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				feedback_id: { type: "string", description: "e.g. FB-01" },
				file: {
					type: "string",
					description: "Repo-relative path to the FB markdown file.",
				},
				status: { type: "string" },
				message: { type: "string" },
				push_warning: {
					type: "string",
					description: "Set when the post-write git push failed.",
				},
			},
		},
	},
	// v4: haiku_feedback_update tool removed. Closure runs through
	// haiku_feedback_advance_hat on the terminal fix-hat;
	// `targets.invalidates` is set at create time. Stale callers
	// hit the dispatch case which returns `feedback_update_removed_in_v4`.
	{
		name: "haiku_feedback_delete",
		description:
			"Delete a feedback file. Cannot delete pending items. Agents cannot delete human-authored items. Omit `stage` for intent-scope feedback.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				feedback_id: { type: "string" },
				deleted: { type: "boolean" },
				message: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_move",
		description:
			'Triage placement for a feedback item. Pass `to_stage` equal to the source `stage` to confirm the FB belongs where it lives (sets `triaged_at` only). Pass a different `to_stage` to relocate it — the file moves to the target stage\'s feedback dir, gets renumbered to the next free FB-NN there, and `triaged_at` is set. Use "" for intent-scope (either source or target). Closed and rejected FBs are immutable; rejected with an error.',
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				feedback_id: {
					type: "string",
					description: "FB-NN id in the target location (renumbered on move).",
				},
				file: {
					type: "string",
					description: "Repo-relative path to the FB file after the operation.",
				},
				moved: {
					type: "boolean",
					description: "True when the file was relocated; false on confirm.",
				},
				triaged_at: { type: "string" },
				message: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_reject",
		description:
			"Reject an agent-authored feedback item with a reason. Sets status to rejected and appends rejection reason to body. Omit `stage` for intent-scope feedback.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				feedback_id: { type: "string" },
				status: { type: "string", const: "rejected" },
				message: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_list",
		description:
			"List feedback items with optional filtering. Omit stage to list across all stages.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_LIST_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				items: {
					type: "array",
					items: { type: "object", additionalProperties: true },
				},
			},
			required: ["items"],
		},
	},
	{
		name: "haiku_feedback_read",
		description:
			"Read a feedback file's body content (and title). Returns ONLY the body and title — frontmatter is workflow engine-internal and not exposed to agents per the architecture's FM-is-workflow engine-only rule. Use this when a fixer hat needs to read its own FB diagnosis or when a reviewer needs to read prior findings on the same artifact. Returns { title, body } as JSON. Omit `stage` to read an intent-scope FB.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_READ_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				body: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_write",
		description: `Update a feedback file's body content. This is the architecture-mandated path for fixer hats to populate the FB body with diagnosis (root cause, proposed action, file:line refs) per the FB-as-unit model. Generic Write/Edit on feedback/*.md is denied at the hook layer. Lifecycle: only pending or addressed (under-fix) FBs accept body rewrites. Closed and rejected FBs are immutable.

Frontmatter is workflow engine-controlled and cannot be set through this tool. For reference (when reading FB context):
  • workflow-driven (mutated over the FB lifecycle): ${FSM_DRIVEN_FB_FIELDS.join(", ")}
  • Set at creation, immutable thereafter: ${CREATE_TIME_FB_FIELDS.join(", ")}

Use haiku_feedback_update for status transitions and haiku_feedback_reject for rejections.`,
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				feedback_id: { type: "string" },
				stage: { type: ["string", "null"] },
				intent: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
				current_status: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_advance_hat",
		description:
			"Advance an FB to the next hat in the stage's `fix_hats:` sequence. Per the architecture's FB-as-unit model: each fixer hat operates on the FB body (via haiku_feedback_write) and then calls this tool to progress. When called on the last hat in the fix_hats sequence, the workflow engine auto-completes the FB (status → closed, closed_by recorded, iteration appended). Mirrors haiku_unit_advance_hat for FBs.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				feedback_id: { type: "string" },
				stage: { type: ["string", "null"] },
				calling_hat: { type: "string" },
				next_dispatched_hat: { type: ["string", "null"] },
				closed: { type: "boolean" },
				bolt: { type: "number" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_reject_hat",
		description:
			"Reject the current fix-hat's work on an FB — moves back to the previous hat and increments the FB's bolt counter. Pass `reason` so the FB's iteration history records why the hat was rejected. Mirrors haiku_unit_reject_hat for FBs.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				feedback_id: { type: "string" },
				rejecting_hat: { type: "string" },
				next_dispatched_hat: { type: ["string", "null"] },
				new_bolt: { type: "number" },
				reason: { type: "string" },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_feedback_set_targets",
		description:
			"Classify a user-authored feedback's targets — set `target_unit` (which unit this counter-signals) and `target_invalidates` (which approval roles get cleared on closure). Called by the `classifier` fix-hat as the FIRST hat in a stage's `fix_hats:` chain when the FB was filed without targets (e.g. via the SPA, where the human can't classify). Refuses to overwrite an FB that already has classified targets — once set, immutable per the FB-as-unit architecture.",
		inputSchema: jsonSchemaOf(HAIKU_FEEDBACK_SET_TARGETS_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				ok: { type: "boolean" },
				feedback_id: { type: "string" },
				target_unit: { type: ["string", "null"] },
				target_invalidates: { type: "array", items: { type: "string" } },
				message: { type: "string" },
				error: { type: "string" },
			},
		},
	},
	{
		name: "haiku_release_notes",
		description:
			"Extract release notes from CHANGELOG.md — a specific version or the 5 most recent entries.",
		inputSchema: jsonSchemaOf(HAIKU_RELEASE_NOTES_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				markdown: { type: "string", description: "Release notes as markdown." },
				version: {
					type: ["string", "null"],
					description:
						"Echoed version filter (null when 5-most-recent was returned).",
				},
			},
			required: ["markdown"],
		},
	},
	{
		name: "haiku_repair",
		description:
			"Scan intents for metadata issues and auto-apply safe fixes. In a git repo, scans all intent branches sequentially, auto-applies safe fixes, syncs changes, and opens PRs/MRs for already-merged branches. In filesystem mode, scans intents in the current working directory. Also relocates any worktrees misplaced by older H·AI·K·U versions (which rooted `.haiku/worktrees/` at cwd instead of the primary repo) — clean worktrees are moved via `git worktree move`; dirty ones are reported for manual resolution. Pass `intent` to repair a single intent only. Pass `skip_branches: true` to force cwd-only mode in a git repo. Pass `apply: false` to scan without applying fixes.",
		inputSchema: jsonSchemaOf(HAIKU_REPAIR_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				markdown: {
					type: "string",
					description:
						"Repair report — markdown text including any worktree-migration findings.",
				},
			},
			required: ["markdown"],
		},
	},
	{
		name: "haiku_version_info",
		description:
			"Return the running MCP binary version and plugin version. " +
			"MCP version is baked into the binary at build time; plugin version is read from plugin.json at runtime.",
		inputSchema: jsonSchemaOf(HAIKU_EMPTY_INPUT_SCHEMA),
		outputSchema: {
			type: "object",
			properties: {
				mcp_version: { type: "string" },
				plugin_version: { type: "string" },
			},
			required: ["mcp_version", "plugin_version"],
		},
	},
]

// ── Slug validation ─────────────────────────────────────────────────────────

/**
 * Validate every path-identifier arg in a tool args object. Returns null if
 * everything is fine, or a pre-built MCP error response if any arg contains
 * path traversal / separator characters. Use at the top of MCP tool
 * handlers to reject malicious identifiers before any filesystem access.
 *
 * Checked keys: `intent`, `slug`, `stage`, `unit`, `feedback_id`. All five
 * are used to construct filesystem paths (e.g.
 * `intent/{slug}/stages/{stage}/units/{unit}.md`,
 * `intent/{slug}/stages/{stage}/feedback/{feedback_id}`)
 * in various handlers, so any of them can be a traversal vector.
 */
export function validateSlugArgs(
	args: Record<string, unknown>,
): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
	for (const key of ["intent", "slug", "stage", "unit", "feedback_id"]) {
		const val = args[key]
		if (typeof val === "string" && /[/\\]|\.\./.test(val)) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Invalid ${key}: "${val}" — path identifiers must not contain path separators or traversal sequences.`,
					},
				],
				isError: true,
			}
		}
	}
	return null
}

// ── Tool handlers ──────────────────────────────────────────────────────────

export function handleStateTool(
	name: string,
	args: Record<string, unknown>,
): {
	content: Array<{ type: "text"; text: string }>
	structuredContent?: Record<string, unknown>
	isError?: boolean
} {
	const text = (s: string) => ({
		content: [{ type: "text" as const, text: s }],
	})

	// `reply(payload)` is the canonical return for tools that declare an
	// `outputSchema`. Per MCP spec 2025-06-18 §Tool Result, the server MUST
	// emit `structuredContent` matching the schema and SHOULD also emit
	// the same payload as serialized JSON in a TextContent block for
	// backwards compatibility with clients that don't yet read
	// structuredContent. This helper does both atomically so handlers
	// can't drift the two views apart.
	const reply = (
		payload: Record<string, unknown>,
		opts?: { isError?: boolean },
	) => ({
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
		structuredContent: payload,
		...(opts?.isError ? { isError: true } : {}),
	})

	// Capture the CC session id from the hook-injected _session_context so
	// subagent-prompt tmpfiles are scoped to the right session dir instead
	// of falling back to process PID.
	const ctx = args._session_context as Record<string, string> | undefined
	if (ctx?.CLAUDE_SESSION_ID) {
		setSessionId(ctx.CLAUDE_SESSION_ID)
	}

	const validationError = validateSlugArgs(args)
	if (validationError) return validationError

	switch (name) {
		// ── Intent ──
		case "haiku_intent_get": {
			const intentGetInputErr = validateToolInput(
				args,
				validateHaikuIntentGetInputSchema,
				"haiku_intent_get",
			)
			if (intentGetInputErr) return intentGetInputErr
			const file = join(intentDir(args.slug as string), "intent.md")
			if (!existsSync(file)) {
				return reply({ found: false, field: args.field as string, value: null })
			}
			const { data } = parseFrontmatter(readFileSync(file, "utf8"))
			const val = data[args.field as string]
			return reply({
				found: val != null,
				field: args.field as string,
				value: val == null ? null : (val as unknown),
			})
		}
		case "haiku_intent_list": {
			const intentListInputErr = validateToolInput(
				args,
				validateHaikuIntentListInputSchema,
				"haiku_intent_list",
			)
			if (intentListInputErr) return intentListInputErr
			const root = findHaikuRoot()
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("[]")
			const includeArchived = args.include_archived === true
			// Single-pass: listVisibleIntents already parsed each intent.md once
			// for the archived-flag filter. Reuse the parsed `data` object for
			// the response body — do NOT call parseFrontmatter again.
			const entries = listVisibleIntents(intentsDir, { includeArchived })
			// Resolve the current-checkout intent once — the pickup/revisit
			// skills use this to skip the "which intent?" prompt when the
			// user's git branch already names the intent.
			const branchMatch = intentFromCurrentBranch()
			const intents = entries.map(({ slug, data }) => {
				const base: Record<string, unknown> = {
					slug,
					studio: data.studio,
					status: data.status,
					active_stage: data.active_stage,
				}
				if (includeArchived) {
					base.archived = data.archived === true
				}
				if (branchMatch && branchMatch.slug === slug) {
					base.current_branch = true
					if (branchMatch.stage) base.current_branch_stage = branchMatch.stage
				}
				return base
			})
			return reply({ intents })
		}

		// ── Stage ──
		case "haiku_stage_get": {
			const stageGetInputErr = validateToolInput(
				args,
				validateHaikuStageGetInputSchema,
				"haiku_stage_get",
			)
			if (stageGetInputErr) return stageGetInputErr
			// v4: stage state is derived on demand from per-unit FM +
			// branch-merge state. No state.json read — the file is
			// migrator-deleted. Fields the derivation knows about are
			// returned as derived values; everything else (decision_log,
			// design_direction, upstream_reconciliation_*, etc.) returns
			// null until those disk-artifact homes land.
			const intentSlug = args.intent as string
			const stageName = args.stage as string
			const fieldName = args.field as string
			const intentFile = join(intentDir(intentSlug), "intent.md")
			const intentFm = existsSync(intentFile)
				? parseFrontmatter(readFileSync(intentFile, "utf8")).data
				: ({} as Record<string, unknown>)
			const studio = (intentFm.studio as string) || ""
			const intentMode =
				typeof intentFm.mode === "string" &&
				(intentFm.mode as string).length > 0
					? (intentFm.mode as string)
					: "continuous"
			const derived = deriveStageState({
				slug: intentSlug,
				studio,
				stage: stageName,
				intentDir: intentDir(intentSlug),
				intentMode,
			})
			const knownFields: Record<string, unknown> = {
				stage: derived.stage,
				status: derived.status,
				phase: derived.phase ?? "",
				started_at: derived.started_at,
				completed_at: derived.completed_at,
				gate_outcome: derived.gate_outcome,
				visits: derived.visits,
			}
			const val = Object.hasOwn(knownFields, fieldName)
				? knownFields[fieldName]
				: null
			return reply({
				found: val != null,
				field: fieldName,
				value: val == null ? null : (val as unknown),
			})
		}

		// ── Unit ──
		case "haiku_unit_get": {
			const path = unitPath(
				args.intent as string,
				args.stage as string,
				args.unit as string,
			)
			if (!existsSync(path)) return text("")
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const val = data[args.field as string]
			return text(
				val == null
					? ""
					: typeof val === "object"
						? JSON.stringify(val)
						: String(val),
			)
		}
		case "haiku_unit_set": {
			// SCHEMA IS THE SSOT — HAIKU_UNIT_SET_INPUT_SCHEMA enforces
			// intent / stage / unit / field presence and rejects any
			// arg the schema didn't declare. Field-level type validation
			// against UNIT_FRONTMATTER_SCHEMA (gates 1–3 below) runs
			// after this top-level pass.
			const unitSetValidation = validateToolInput(
				args,
				validateHaikuUnitSetInputSchema,
				"haiku_unit_set",
			)
			if (unitSetValidation) return unitSetValidation
			// Gate order (each layer rejects with a distinct error code):
			//   1. fsm_field_forbidden — field is workflow-driven; agents
			//      MUST NOT set it. Mirrors the AJV propertyNames check on
			//      haiku_unit_write so both agent-write paths refuse FSM
			//      fields uniformly.
			//      Catches every status: completed write because "status" is
			//      in FSM_DRIVEN_UNIT_FIELDS.
			//   2. lifecycle_violation — unit is active/completed; forward-only.
			//   3. field_type_mismatch — value's type doesn't match the
			//      field's UNIT_FRONTMATTER_SCHEMA declaration. Includes a
			//      sub-schema AJV pass so quality_gates items, depends_on
			//      string-pattern, etc. all get validated, not just the
			//      top-level type.
			const field = args.field as string
			const value = args.value
			if ((FSM_DRIVEN_UNIT_FIELDS as readonly string[]).includes(field)) {
				return reply(
					{
						error: "fsm_field_forbidden",
						field,
						message: `Field '${field}' is workflow-driven — set automatically by haiku_unit_advance_hat / haiku_unit_reject_hat / haiku_unit_increment_bolt. Agents must not set it directly. Forbidden fields: [${FSM_DRIVEN_UNIT_FIELDS.join(", ")}].`,
					},
					{ isError: true },
				)
			}
			const unitSetBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (unitSetBranchErr) return unitSetBranchErr
			const path = unitPath(
				args.intent as string,
				args.stage as string,
				args.unit as string,
			)
			if (existsSync(path)) {
				const { data: currentFm } = parseFrontmatter(readFileSync(path, "utf8"))
				const currentStatus = (currentFm.status as string) || "pending"
				// Lifecycle exemptions — narrow set of fields that remain
				// editable after a unit completes:
				//   - `outputs`: advance_hat's own autoPopulateOutputs writes it
				//     during the active phase, so the agent must be able to do
				//     the same when auto-detect fails (unit worktree not
				//     reachable from the stage worktree CWD, etc.).
				//   - `quality_gates`: gate definitions are check specs, not
				//     workflow state. They live next to the unit they apply to,
				//     so the only path to repair a broken / drifted gate is to
				//     edit it on the completed unit. Without this exemption,
				//     `fix_quality_gates` is unactionable when the failure is
				//     in the gate command itself (typo, library API change,
				//     YAML serialization issue) — the agent can't fix the
				//     gate, can't bypass the workflow, and the only escape is
				//     direct file editing outside the engine. That's the trap
				//     Mike's session hit. Updating gate definitions doesn't
				//     violate forward-only: you can't change what the unit
				//     produced, only how it gets verified.
				const isLifecycleMutable =
					field === "outputs" || field === "quality_gates"
				if (
					!isLifecycleMutable &&
					(currentStatus === "active" || currentStatus === "completed")
				) {
					return reply(
						{
							error: "lifecycle_violation",
							current_status: currentStatus,
							field,
							message: `Cannot set field '${field}' on unit '${args.unit}' — status is '${currentStatus}'. Per the forward-only lifecycle rule (architecture §1.3), units become immutable once they enter active or completed status. Pending units only. (\`outputs\` and \`quality_gates\` are exempt — see haiku_unit_set handler comments.)`,
						},
						{ isError: true },
					)
				}
			}
			// Strict per-field type validation against UNIT_FRONTMATTER_SCHEMA.
			// Array-typed fields MUST receive arrays — JSON-stringified arrays
			// are NOT silently parsed (they previously slipped through and
			// YAML-serialized as folded scalars, breaking every downstream
			// `inputs.map(...)`). Stage-specific fields not declared in the
			// schema fall through (the schema can't enumerate per-stage
			// extensions); they'll fail later at AJV validation in
			// haiku_unit_write if shape-broken.
			const fieldSchemaForType = (
				UNIT_FRONTMATTER_SCHEMA.properties as Record<
					string,
					{ type?: string | string[] }
				>
			)[field]
			if (fieldSchemaForType?.type) {
				const expected = Array.isArray(fieldSchemaForType.type)
					? fieldSchemaForType.type
					: [fieldSchemaForType.type]
				const actual = Array.isArray(value)
					? "array"
					: value === null
						? "null"
						: typeof value
				if (!expected.includes(actual)) {
					const expectedRendered =
						expected.length === 1
							? expected[0]
							: `one of [${expected.join(", ")}]`
					return reply(
						{
							error: "field_type_mismatch",
							field,
							expected_type: expected.length === 1 ? expected[0] : expected,
							received_type: actual,
							message: `Field '${field}' expects ${expectedRendered}, got ${actual}. Pass a native ${expectedRendered} value — JSON-stringified values are not accepted (they corrupt the YAML output). Example for array fields: \`value: ["intent.md", "knowledge/DISCOVERY.md"]\`.`,
						},
						{ isError: true },
					)
				}
				// Deep validation against the field's sub-schema. Catches
				// inner-shape problems (e.g. quality_gates items missing
				// `command`, depends_on items violating the path pattern,
				// model not in the haiku/sonnet/opus enum) that the
				// top-level type check can't see. validateUnitSchema is the
				// same AJV-compiled validator haiku_unit_write uses, so the
				// two write paths share one rule set.
				const candidate = { [field]: value }
				if (!validateUnitSchema(candidate)) {
					const fieldErrors = (validateUnitSchema.errors || []).filter(
						(e) =>
							e.instancePath === `/${field}` ||
							e.instancePath.startsWith(`/${field}/`),
					)
					if (fieldErrors.length > 0) {
						return reply(
							{
								error: "field_value_invalid",
								field,
								errors: fieldErrors,
								// AJV's `errorsText` is a pure formatter — reuse the
								// shared `stateAjv` instance from
								// ./state/schemas/_ajv.ts rather than keep a
								// module-local Ajv alive only for error formatting.
								message: `Field '${field}' value failed schema validation: ${stateAjvForErrorText.errorsText(fieldErrors)}.`,
							},
							{ isError: true },
						)
					}
				}
			}
			setFrontmatterField(path, field, value)
			return text("ok")
		}
		case "haiku_unit_list": {
			const unitListInputErr = validateToolInput(
				args,
				validateHaikuUnitListInputSchema,
				"haiku_unit_list",
			)
			if (unitListInputErr) return unitListInputErr
			// Align branch before reading — unit files live on the stage branch.
			// On intent-main, existsSync would return false and the caller would
			// see an empty list even when units exist on the stage branch.
			const unitListBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (unitListBranchErr) return unitListBranchErr
			const dir = join(
				stageDir(args.intent as string, args.stage as string),
				"units",
			)
			if (!existsSync(dir)) return reply({ units: [] })
			const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
			const units = files.map((f) => {
				const { data } = parseFrontmatter(readFileSync(join(dir, f), "utf8"))
				return {
					name: f.replace(".md", ""),
					status: data.status,
					bolt: data.bolt,
					hat: data.hat,
					model: data.model ?? null,
				}
			})
			return reply({ units })
		}
		case "haiku_unit_start": {
			const unitStartInputErr = validateToolInput(
				args,
				validateHaikuUnitStartInputSchema,
				"haiku_unit_start",
			)
			if (unitStartInputErr) return unitStartInputErr
			// Resolve stage and first hat internally
			const stage = resolveActiveStage(args.intent as string)
			if (!stage)
				return reply(
					{
						error: "no_active_stage",
						message:
							"No active stage found for this intent. Call haiku_run_next first.",
					},
					{ isError: true },
				)
			const unitStartBranchErr = enforceStageBranch(
				args.intent as string,
				stage,
			)
			if (unitStartBranchErr) return unitStartBranchErr
			const uPath = unitPath(args.intent as string, stage, args.unit as string)

			// Guard: reject if unit is already active (prevents duplicate work)
			if (existsSync(uPath)) {
				const { data: existingFm } = parseFrontmatter(
					readFileSync(uPath, "utf8"),
				)
				if (existingFm.status === "active") {
					const scope = resolveStageScope(args.intent as string, stage)
					return reply(
						{
							error: "unit_already_active",
							unit: args.unit,
							hat: existingFm.hat || "",
							scope: scope || null,
							message: `Unit '${args.unit}' is already active (hat: ${existingFm.hat || "unknown"}). Do not start it again — continue working on it or call haiku_unit_advance_hat when done.`,
						},
						{ isError: true },
					)
				}
			}

			// Validate every declared input path exists on disk BEFORE the
			// unit transitions to active. The FM schema's pattern check
			// catches freeform-text entries at write time, but a path that
			// LOOKS valid (e.g. references a prior-stage artifact that
			// never landed) needs a runtime gate too — without this, the
			// unit's hats start work against missing inputs and either
			// silently produce wrong artifacts or fail later in cryptic
			// ways.
			{
				const startUnitFm = parseFrontmatter(readFileSync(uPath, "utf8")).data
				const startInputs = Array.isArray(startUnitFm.inputs)
					? (startUnitFm.inputs as string[])
					: []
				const missingInputs: string[] = []
				for (const inp of startInputs) {
					if (
						!unitOutputExists(args.intent as string, args.unit as string, inp)
					) {
						missingInputs.push(inp)
					}
				}
				if (missingInputs.length > 0) {
					return reply(
						{
							error: "unit_inputs_missing",
							missing: missingInputs,
							message: `Cannot start unit '${args.unit}': ${missingInputs.length} declared input(s) do not exist on disk: [${missingInputs.map((p) => `'${p}'`).join(", ")}]. Each entry in \`inputs:\` MUST reference a real file (typically an artifact a prior stage produced). Verify the upstream stage actually wrote the file, OR remove the input entry if the unit doesn't actually need it.`,
						},
						{ isError: true },
					)
				}
			}

			const stageHats = resolveStageHats(args.intent as string, stage)
			const firstHat = stageHats[0] || ""

			setFrontmatterField(uPath, "status", "active")
			setFrontmatterField(uPath, "bolt", 1)
			setFrontmatterField(uPath, "hat", firstHat)
			setFrontmatterField(uPath, "started_at", timestamp())
			setFrontmatterField(uPath, "hat_started_at", timestamp())
			startUnitIteration(uPath, firstHat)
			// Reseal: these are UNIT_FIELDS, so the tamper detector needs the
			// updated checksum before the next verifyIntentState() call.
			sealIntentState(args.intent as string)
			emitTelemetry("haiku.unit.started", {
				intent: args.intent as string,
				stage,
				unit: args.unit as string,
				hat: firstHat,
			})
			const sf = args.state_file as string | undefined
			if (sf)
				logSessionEvent(sf, {
					event: "unit_started",
					intent: args.intent,
					stage,
					unit: args.unit,
					hat: firstHat,
				})
			const gitResult = gitCommitState(
				`haiku: start unit ${args.unit as string}`,
			)
			syncSessionMetadata(
				args.intent as string,
				args.state_file as string | undefined,
			)
			const scope = resolveStageScope(args.intent as string, stage)
			return text((scope ? `ok\n\n${scope}` : "ok") + pushWarning(gitResult))
		}
		case "haiku_unit_advance_hat": {
			const advInputErr = validateToolInput(
				args,
				validateHaikuUnitAdvanceHatInputSchema,
				"haiku_unit_advance_hat",
			)
			if (advInputErr) return advInputErr
			// Align branch BEFORE findUnitFile — the unit spec lives on the stage
			// branch, so lookups from intent-main spuriously report unit_not_found.
			// Use active_stage as the best-guess stage to align; findUnitFile below
			// handles the rare cross-stage case internally.
			const advPreBranchErr = enforceStageBranch(
				args.intent as string,
				resolveActiveStage(args.intent as string),
			)
			if (advPreBranchErr) return advPreBranchErr

			// Resolve stage and unit path internally
			const unitInfo = findUnitFile(args.intent as string, args.unit as string)
			if (!unitInfo)
				return reply(
					{
						error: "unit_not_found",
						message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.`,
					},
					{ isError: true },
				)
			const advPath = unitInfo.path
			const advStage = unitInfo.stage

			// Re-enforce if findUnitFile resolved to a different stage (rare but
			// possible for cross-stage go-backs); idempotent when already aligned.
			const advBranchErr = enforceStageBranch(args.intent as string, advStage)
			if (advBranchErr) return advBranchErr

			const unitRaw = readFileSync(advPath, "utf8")
			const { data: unitFm } = parseFrontmatter(unitRaw)

			// v4: hat / status are derived from iterations[]. Read the last
			// iteration to determine the current hat. Reject if no iterations
			// have started (start_unit hasn't run) or if the last iteration is
			// already terminal (advance_hat called twice).
			const _iters = Array.isArray(unitFm.iterations)
				? (unitFm.iterations as UnitIteration[])
				: []
			if (_iters.length === 0) {
				return reply(
					{
						error: "unit_not_started",
						unit: args.unit,
						message: `Unit '${args.unit}' has no iterations[]. Call haiku_unit_start before advancing a hat.`,
					},
					{ isError: true },
				)
			}
			const _lastIter = _iters[_iters.length - 1]
			if (_lastIter.completed_at !== null && _lastIter.result !== null) {
				return reply(
					{
						error: "iteration_already_terminal",
						unit: args.unit,
						message: `Unit '${args.unit}' last iteration is already terminal (hat='${_lastIter.hat}', result='${_lastIter.result}'). The cursor will dispatch the next hat on the next haiku_run_next tick.`,
					},
					{ isError: true },
				)
			}
			const currentHat = _lastIter.hat
			// 30-second hat backpressure removed in v4 — a pause doesn't
			// prevent shallow work; reviewer agents and quality_gates do.

			// ── Validate declared outputs exist (every hat transition) ──
			// Artifacts may live in the UNIT'S worktree (if running via start_units)
			// OR the main intent dir — check both. Merging to the parent branch
			// happens AFTER this validation, so we can't require parent-dir presence.
			const unitOutputs = (unitFm.outputs as string[]) || []
			if (unitOutputs.length > 0) {
				const iDir = intentDir(args.intent as string)
				const escaped = unitOutputs.filter((o) => {
					const resolved = resolve(iDir, o)
					return !resolved.startsWith(`${resolve(iDir)}/`)
				})
				if (escaped.length > 0) {
					return reply(
						{
							error: "unit_outputs_escaped",
							escaped,
							message: `Cannot advance hat: ${escaped.length} output path(s) escape the intent directory: ${escaped.join(", ")}. Fix the outputs in the unit frontmatter.`,
						},
						{ isError: true },
					)
				}
				const missing = unitOutputs.filter(
					(o) =>
						!unitOutputExists(args.intent as string, args.unit as string, o),
				)
				if (missing.length > 0) {
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "outputs_missing",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
							missing,
						})
					return reply(
						{
							error: "unit_outputs_missing",
							missing,
							message: `Cannot advance hat: ${missing.length} declared output(s) not found in unit worktree or main intent dir: ${missing.join(", ")}. Create them (in the unit worktree if you have one, otherwise in the main intent dir) or remove them from the outputs list.`,
						},
						{ isError: true },
					)
				}
			}

			// Resolve hat sequence — unit-aware so `feedback-assessor` is
			// appended when the unit declares `closes:` feedback items.
			const stageHats = resolveUnitHats(
				args.intent as string,
				advStage,
				args.unit as string,
			)
			const currentIdx = stageHats.indexOf(currentHat)
			const nextIdx = currentIdx + 1
			const isLastHat = nextIdx >= stageHats.length

			// v4: per-hat quality_gates auto-reject removed. Quality gates
			// are now an explicit `approvals.quality_gates` actor in the
			// cursor walk — the post-execute approval track dispatches them
			// via dispatch_quality_gates and signs the approval on pass /
			// files an FB on fail. Hat-level run_quality_gates is no longer
			// honored.

			if (isLastHat) {
				// ── TERMINAL HAT: stamp iteration + merge unit branch ──
				//
				// v4: quality_gates moved out of the terminal-advance path.
				// They are now an explicit `approvals.quality_gates` actor
				// in the cursor walk, dispatched after merge as part of the
				// post-execute approval track. Don't run them here.

				// ── Scope enforcement + output auto-population (harness-agnostic) ──
				// MUST run before the outputs-empty check: validateUnitScope
				// auto-populates unit.outputs[] from the git diff as a side
				// effect, so hookless harnesses end up with a correctly populated
				// outputs list. Also catches writes outside the stage's declared
				// scope.
				{
					const intentFile = `${intentDir(args.intent as string)}/intent.md`
					const { data: iFm } = parseFrontmatter(
						readFileSync(intentFile, "utf8"),
					)
					const scopeStudio = (iFm.studio as string) || ""
					const scopeResult = scopeStudio
						? validateUnitScope(
								args.intent as string,
								scopeStudio,
								advStage,
								args.unit as string,
							)
						: null
					if (scopeResult) {
						const sf = args.state_file as string | undefined
						if (sf)
							logSessionEvent(sf, {
								event: "unit_scope_violation",
								intent: args.intent,
								stage: advStage,
								unit: args.unit,
								violations: scopeResult.violations,
							})
						const allowedSummary = [
							...scopeResult.scope.intentGlobs.map(
								(g) => `  - \`${g}\` (intent-relative)`,
							),
							...scopeResult.scope.repoGlobs.map(
								(g) => `  - \`${g}\` (repo-relative)`,
							),
							scopeResult.scope.repoWildcard
								? "  - any repo-level path (stage declares scope: repo with wildcard location)"
								: "",
						]
							.filter(Boolean)
							.join("\n")
						return reply(
							{
								error: "unit_scope_violation",
								violations: scopeResult.violations,
								scope: scopeResult.scope,
								message:
									`Cannot complete unit: ${scopeResult.violations.length} file(s) were written outside the stage's declared scope.\n\n` +
									`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
									`Allowed paths (stage output templates + workflow engine metadata):\n${allowedSummary}\n\n` +
									`To resolve (in the unit worktree): (a) drop ALL unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${advStage})\` — recommended if the unit just started and few commits landed; or (b) amend the bad file out of the latest commit with \`git rm <file> && git commit --amend --no-edit\`; or (c) whole-commit rollback with \`git revert --no-edit <commit-sha>\` for each bad commit.\n\nNOTE: \`git checkout HEAD -- <file>\` does NOT work on committed files (it's a no-op when the file matches HEAD). Use one of the above.\n\nAlternatively: (d) update the stage's output template \`location:\` / \`scope:\` if this pattern is legitimate, or (e) log a stage_revisit feedback at the upstream stage via \`haiku_feedback\` with \`resolution: "stage_revisit"\` if the scope itself is wrong.`,
							},
							{ isError: true },
						)
					}
				}

				// Re-read the unit frontmatter: validateUnitScope may have
				// auto-populated outputs[] from the git diff.
				const unitRawAfterPopulate = readFileSync(advPath, "utf8")
				const { data: unitFmAfter } = parseFrontmatter(unitRawAfterPopulate)
				const unitOutputsAfter = (unitFmAfter.outputs as string[]) || []

				// v4: scope_reject_attempts counter is gone (derived from
				// iterations[].filter(result === "reject")). No reset write
				// needed.

				// Require at least one tracked output.
				if (unitOutputsAfter.length === 0) {
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "outputs_empty",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
						})
					return reply(
						{
							error: "unit_outputs_empty",
							message:
								"Cannot complete unit: no outputs were produced. Every unit must write at least one artifact that the workflow engine can detect (stage artifact under `stages/<stage>/...` excluding `units/`/`state.json`, knowledge document under `knowledge/`, or a file matching a stage output template `location:`). The workflow engine auto-populates `outputs:` from the git diff at advance time; if you've written files but they're not showing up, verify they've been committed in the unit worktree, or add them explicitly to the unit's `outputs:` frontmatter field.",
						},
						{ isError: true },
					)
				}

				// Validate every declared output path exists on disk. The
				// FM schema's pattern check catches "Weekly carryover roll:
				// scheduler trigger…"-style prose entries at write time,
				// but pre-existing units (or escaped writes) need a runtime
				// gate too: an output that claims a path the unit never
				// produced silently passes downstream as if the artifact
				// landed.
				//
				// Resolution order matches `unitOutputExists` (used by
				// stage output-template validation): check the unit's
				// worktree first, then the parent intent dir, then the
				// repo root for repo-relative paths.
				const missingOutputs: string[] = []
				for (const out of unitOutputsAfter) {
					if (
						!unitOutputExists(args.intent as string, args.unit as string, out)
					) {
						missingOutputs.push(out)
					}
				}
				if (missingOutputs.length > 0) {
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "outputs_missing",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
							missing: missingOutputs.length,
						})
					return reply(
						{
							error: "unit_outputs_missing",
							missing: missingOutputs,
							message: `Cannot complete unit: ${missingOutputs.length} declared output(s) do not exist on disk: [${missingOutputs.map((p) => `'${p}'`).join(", ")}]. Each entry in \`outputs:\` MUST be a real file path. If you wrote prose (e.g. "Weekly carryover roll: scheduler trigger, idempotent roll logic"), that's a completion-criteria description, not an output path — move it to the body's \`## Completion Criteria\` section and let auto-populate fill \`outputs:\` from the actual git diff.`,
						},
						{ isError: true },
					)
				}

				// Verify completion criteria are checked
				const unchecked = (unitRaw.match(/- \[ \]/g) || []).length
				if (unchecked > 0) {
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "criteria_not_met",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
							unchecked,
						})
					return reply(
						{
							error: "criteria_not_met",
							unchecked,
							message: `Cannot complete unit: ${unchecked} completion criteria still unchecked. Address them, then call haiku_unit_advance_hat again.`,
						},
						{ isError: true },
					)
				}

				// v4: stamp the terminal-advance iteration. Status / hat /
				// bolt / completed_at are no longer separate frontmatter
				// fields — `iterations[-1].result = "advance"` and
				// `iterations[-1].completed_at` capture all of it.
				//
				// Feedback closure no longer happens here. In v4, FBs run
				// their OWN iterations[] through `fix_hats:`; closure is
				// stamped on the FB itself by `haiku_feedback_advance_hat`
				// when the terminal fix-hat lands. The unit's `closes:`
				// field is informational only (a forensic breadcrumb).
				completeUnitIteration(advPath, "advance")

				emitTelemetry("haiku.unit.completed", {
					intent: args.intent as string,
					stage: advStage,
					unit: args.unit as string,
				})
				{
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "unit_completed",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
						})
				}
				const completeGit = gitCommitState(
					`haiku: complete unit ${args.unit as string}`,
				)

				// Merge the unit branch into its STAGE branch. Units ALWAYS
				// fan in to their stage branch regardless of whatever branch
				// the MCP's parent worktree happens to be on — the workflow engine works
				// in the scope of the stage, not the parent worktree.
				// `mergeUnitWorktree` uses a temp worktree so the MCP's
				// checkout is never disturbed.
				const intentSlug = args.intent as string
				const parentBranchName = `haiku/${intentSlug}/${advStage}`
				// v4: serialize per-stage merges via withStageLock so two
				// siblings finishing terminal-advance simultaneously can't
				// race for the stage branch.
				const mergeResult = withStageLock(intentSlug, advStage, () =>
					mergeUnitWorktree(intentSlug, args.unit as string, advStage),
				)
				if (!mergeResult.success) {
					const worktreePath = join(
						process.cwd(),
						".haiku",
						"worktrees",
						intentSlug,
						args.unit as string,
					)
					// Try to extract structured conflict paths the engine
					// surfaced. The error message contains the literal prefix
					// `merge_conflict: real conflicts on agent-authored
					// content require resolution: <comma-separated paths>`
					// when mergeUnitWorktree classified the failure as a real
					// conflict (not dirty-tree, not other git error).
					const conflictMatch = mergeResult.message.match(
						/^merge_conflict: real conflicts on agent-authored content require resolution: (.+)$/m,
					)
					const conflictPaths = conflictMatch
						? conflictMatch[1]
								.split(",")
								.map((p) => p.trim())
								.filter(Boolean)
						: []

					if (conflictPaths.length > 0) {
						// True content conflicts — agent must resolve.
						// Queue them on the stage's pending-merges file so
						// haiku_run_next surfaces them in priority order if
						// multiple unit merges fail in the same wave.
						return reply(
							{
								action: "resolve_merge_conflicts",
								status: "completed_pending_merge_resolution",
								intent: args.intent,
								unit: args.unit,
								stage: advStage,
								unit_branch: `haiku/${intentSlug}/${args.unit}`,
								stage_branch: parentBranchName,
								conflict_paths: conflictPaths,
								worktree: worktreePath,
								message: `Unit ${args.unit} completed its hat sequence, but merging into ${parentBranchName} produced real content conflicts on ${conflictPaths.length} file(s): ${conflictPaths.join(", ")}. The merge is left in-progress — resolve each conflicted file (the workflow engine cannot — they contain agent-authored content), \`git add\` the resolved files, \`git commit\` to complete the merge, then call \`haiku_run_next { intent: "${intentSlug}" }\`. If multiple units in this wave have pending merges, the engine will queue them and surface the next one after this is resolved.`,
							},
							{ isError: true },
						)
					}

					// Other failure mode (dirty parent worktree, git
					// machinery error, etc.). Engine cannot auto-recover;
					// surface to agent with the actual git output.
					return reply(
						{
							action: "merge_failed",
							status: "completed_merge_failed",
							intent: args.intent,
							unit: args.unit,
							stage: advStage,
							unit_branch: `haiku/${intentSlug}/${args.unit}`,
							stage_branch: parentBranchName,
							worktree: worktreePath,
							error: mergeResult.message,
							message: `Unit ${args.unit} completed its hat sequence, but the workflow engine could not merge into ${parentBranchName}. Git output: ${mergeResult.message}. Most common cause: the stage branch's primary worktree has uncommitted engine writes from concurrent dispatch. Inspect with \`git status\` on ${parentBranchName}; commit any engine-owned dirty files (state.json, units/*.md, baseline.json), then call \`haiku_run_next { intent: "${intentSlug}" }\` so the engine retries the merge.`,
						},
						{ isError: true },
					)
				}

				syncSessionMetadata(
					args.intent as string,
					args.state_file as string | undefined,
				)
				const mergeNote =
					mergeResult.message === "no worktree"
						? ""
						: ` (${mergeResult.message})`

				// v4: no internal _runNext call. The subagent terminates with
				// a clean signal; the parent agent calls haiku_run_next on the
				// next tick to drive the cursor forward. run_next is pure
				// observation — anyone can call it, same answer every time.
				return text(
					`completed (last hat) — unit branch merged into ${parentBranchName}${mergeNote}.${pushWarning(completeGit)}`,
				)
			}

			// ── NOT last hat: advance to next ──
			// NOTE: Quality gates run ONLY at unit completion (last hat) on
			// hookless harnesses. The intent-+-unit gate list is unscoped —
			// running them per-hat would punish early hats for outputs the
			// later hats haven't produced yet (e.g. `npm test` before any
			// code is written). CC's Stop hook fires per-subagent but each
			// subagent's Stop is the "natural endpoint" for its hat's work;
			// we don't have that signal in hookless mode, so we enforce the
			// safer "once at completion" boundary.
			//
			// Scope validation DOES run at every hat transition — it has
			// per-hat meaning (out-of-bounds writes accumulate forever until
			// surfaced) and no false-positive risk for early hats.
			{
				const intentFile = `${intentDir(args.intent as string)}/intent.md`
				const { data: iFm } = parseFrontmatter(readFileSync(intentFile, "utf8"))
				const scopeStudio = (iFm.studio as string) || ""
				const scopeResult = scopeStudio
					? validateUnitScope(
							args.intent as string,
							scopeStudio,
							advStage,
							args.unit as string,
						)
					: null
				if (scopeResult) {
					const sf = args.state_file as string | undefined
					if (sf)
						logSessionEvent(sf, {
							event: "unit_scope_violation",
							intent: args.intent,
							stage: advStage,
							unit: args.unit,
							hat: currentHat,
							violations: scopeResult.violations,
						})
					const allowedSummary = [
						...scopeResult.scope.intentGlobs.map(
							(g) => `  - \`${g}\` (intent-relative)`,
						),
						...scopeResult.scope.repoGlobs.map(
							(g) => `  - \`${g}\` (repo-relative)`,
						),
						scopeResult.scope.repoWildcard
							? "  - any repo-level path (stage declares scope: repo with wildcard location)"
							: "",
					]
						.filter(Boolean)
						.join("\n")
					return reply(
						{
							error: "unit_scope_violation",
							hat: currentHat,
							violations: scopeResult.violations,
							scope: scopeResult.scope,
							message:
								`Cannot advance hat '${currentHat}': ${scopeResult.violations.length} file(s) were written outside the stage's declared scope.\n\n` +
								`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
								`Allowed paths (stage output templates + workflow engine metadata):\n${allowedSummary}\n\n` +
								`Revert the out-of-bounds commits in the unit worktree: drop all unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${advStage})\`, or amend a single file out with \`git rm <file> && git commit --amend --no-edit\`, or \`git revert --no-edit <commit-sha>\` for a whole commit. NOTE: \`git checkout HEAD -- <file>\` is a no-op on committed files. Or update the stage's output template if this pattern is legitimate. Do NOT advance with scope violations — downstream hats will run blind.`,
						},
						{ isError: true },
					)
				}
			}

			// v4: scope_reject_attempts counter is gone. The bolt counter
			// is derived from iterations[].length; reject attempts are
			// derivable from iterations[].filter(it => it.result === "reject").

			const nextHat = stageHats[nextIdx]

			// v4: stamp the iteration transition. Hat / hat_started_at /
			// status / bolt frontmatter fields are gone — `iterations[-1]`
			// captures the current hat, `iterations.length` captures the
			// bolt count. completeUnitIteration writes the terminal stamp
			// on the prior hat; startUnitIteration appends a fresh entry
			// for the next hat.
			completeUnitIteration(advPath, "advance")
			startUnitIteration(advPath, nextHat)
			{
				const sf = args.state_file as string | undefined
				if (sf)
					logSessionEvent(sf, {
						event: "hat_advanced",
						intent: args.intent,
						stage: advStage,
						unit: args.unit,
						hat: nextHat,
					})
			}
			emitTelemetry("haiku.hat.transition", {
				intent: args.intent as string,
				stage: advStage,
				unit: args.unit as string,
				hat: nextHat,
			})
			const advGit = gitCommitState(
				`haiku: advance hat to ${nextHat} on ${args.unit as string}`,
			)
			syncSessionMetadata(
				args.intent as string,
				args.state_file as string | undefined,
			)
			// v4: no _buildContinueDispatch synthesis. Each hat is a
			// fresh subagent dispatched by the parent. The subagent
			// terminates after this advance_hat call; the parent reads
			// the result, calls haiku_run_next on the next tick, and
			// the cursor returns the next start_unit_hat instruction
			// for this unit. Single-hat-per-subagent — no in-context
			// hat iteration, no Workflow Result file relay.
			const hatScope = resolveStageScope(args.intent as string, advStage)
			return text(
				(hatScope
					? `advanced to ${nextHat}\n\n${hatScope}`
					: `advanced to ${nextHat}`) + pushWarning(advGit),
			)
		}
		case "haiku_unit_reject_hat": {
			const rejectInputErr = validateToolInput(
				args,
				validateHaikuUnitRejectHatInputSchema,
				"haiku_unit_reject_hat",
			)
			if (rejectInputErr) return rejectInputErr
			// Align branch BEFORE findUnitFile — see haiku_unit_advance_hat for
			// the rationale. Without this, a unit file that lives only on the
			// stage branch spuriously returns unit_not_found when checkout is
			// on intent-main.
			const rejectPreBranchErr = enforceStageBranch(
				args.intent as string,
				resolveActiveStage(args.intent as string),
			)
			if (rejectPreBranchErr) return rejectPreBranchErr

			// Hat failed — move back one hat, increment bolt count
			const rejectInfo = findUnitFile(
				args.intent as string,
				args.unit as string,
			)
			if (!rejectInfo)
				return reply(
					{
						error: "unit_not_found",
						message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.`,
					},
					{ isError: true },
				)
			const failPath = rejectInfo.path
			const rejectStage = rejectInfo.stage

			// Re-enforce for cross-stage case; idempotent when already aligned.
			const rejectBranchErr = enforceStageBranch(
				args.intent as string,
				rejectStage,
			)
			if (rejectBranchErr) return rejectBranchErr

			// v4: read iterations[] for current hat + bolt count. Reject
			// if the unit hasn't started or its last iteration is already
			// terminal (no in-flight hat to reject).
			const { data: failData } = parseFrontmatter(
				readFileSync(failPath, "utf8"),
			)
			const _failIters = Array.isArray(failData.iterations)
				? (failData.iterations as UnitIteration[])
				: []
			if (_failIters.length === 0) {
				return reply(
					{
						error: "unit_not_started",
						unit: args.unit,
						message: `Unit '${args.unit}' has no iterations[]. Cannot reject a hat that hasn't started.`,
					},
					{ isError: true },
				)
			}
			const _failLast = _failIters[_failIters.length - 1]
			if (_failLast.completed_at !== null && _failLast.result !== null) {
				return reply(
					{
						error: "iteration_already_terminal",
						unit: args.unit,
						message: `Unit '${args.unit}' last iteration is terminal — nothing to reject. Call run_next to dispatch the next hat.`,
					},
					{ isError: true },
				)
			}
			const currentHat = _failLast.hat
			// Bolt is derived from iterations.length. The "next bolt"
			// after this reject is iterations.length + 1 (the new entry
			// the reject will append for the prior hat).
			const currentBolt = _failIters.length

			// Enforce max bolt limit. Persistent scope violations no
			// longer get a separate counter — every reject (scope or
			// otherwise) increments iterations.length, so the cap fires
			// uniformly.
			if (currentBolt + 1 > MAX_UNIT_BOLTS) {
				return reply(
					{
						error: "max_bolts_exceeded",
						bolt: currentBolt,
						max: MAX_UNIT_BOLTS,
						message: `Unit has exceeded ${MAX_UNIT_BOLTS} bolt iterations. Escalate to the user — this unit may need to be redesigned, split, or have a persistent scope violation manually reverted (\`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${rejectStage})\` in the unit worktree).`,
					},
					{ isError: true },
				)
			}

			// Scope-validate before rollback. v4: a scope violation just
			// rejects with an error; no separate scope_reject_attempts
			// counter (the iterations.length cap covers persistent loops).
			{
				const intentFile = `${intentDir(args.intent as string)}/intent.md`
				const { data: iFm } = parseFrontmatter(readFileSync(intentFile, "utf8"))
				const scopeStudio = (iFm.studio as string) || ""
				const scopeResult = scopeStudio
					? validateUnitScope(
							args.intent as string,
							scopeStudio,
							rejectStage,
							args.unit as string,
						)
					: null
				if (scopeResult) {
					return reply(
						{
							error: "unit_scope_violation_on_reject",
							bolt: currentBolt,
							violations: scopeResult.violations,
							scope: scopeResult.scope,
							message:
								`Cannot reject hat: the unit worktree still contains ${scopeResult.violations.length} out-of-scope write(s) that must be reverted first.\n\n` +
								`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
								`Revert the out-of-bounds commits in the unit worktree: drop all unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${rejectStage})\`, or amend a single file out with \`git rm <file> && git commit --amend --no-edit\`, or \`git revert --no-edit <commit-sha>\` for a whole commit. NOTE: \`git checkout HEAD -- <file>\` is a NO-OP on committed files and will not clear the violation. After the revert, call reject_hat again.`,
						},
						{ isError: true },
					)
				}
			}

			// Resolve the hat sequence — unit-aware so `feedback-assessor`
			// participates in reject-to-previous-hat transitions.
			const stageHats = resolveUnitHats(
				args.intent as string,
				rejectStage,
				args.unit as string,
			)
			const hatIdx = stageHats.indexOf(currentHat)
			// Feedback-assessor rejections always bolt to the FIRST hat
			// (designer) — the assessor is verifying the work itself, not the
			// prior reviewer's judgment, so the fix requires new artifact
			// output, not a re-review. All other hat rejections step back one.
			const prevHat =
				currentHat === FEEDBACK_ASSESSOR_HAT
					? stageHats[0]
					: hatIdx > 0
						? stageHats[hatIdx - 1]
						: stageHats[0]

			// Auto-escalate model tier on rejection (gated by features.modelSelection)
			if (features.modelSelection) {
				const currentModel = failData.model as string | undefined
				const escalated = escalate(currentModel)
				if (currentModel && escalated) {
					setFrontmatterField(failPath, "model_original", currentModel)
					setFrontmatterField(failPath, "model", escalated)
					console.error(
						`[haiku] model escalated: ${currentModel} → ${escalated} (hat rejected, iteration ${currentBolt + 1})`,
					)
				}
			}

			const rejectReason = (args.reason as string) || undefined
			// v4: stamp the rejection on the in-flight iteration, then
			// append a new iteration entry for the prior hat. Hat /
			// hat_started_at / bolt frontmatter fields are gone — the
			// iterations[] array is the single source of truth.
			completeUnitIteration(failPath, "reject", rejectReason)
			startUnitIteration(failPath, prevHat)
			{
				const sf = args.state_file as string | undefined
				if (sf)
					logSessionEvent(sf, {
						event: "unit_failed",
						intent: args.intent,
						stage: rejectStage,
						unit: args.unit,
						from_hat: currentHat,
						to_hat: prevHat,
						bolt: currentBolt + 1,
					})
			}
			emitTelemetry("haiku.unit.failed", {
				intent: args.intent as string,
				stage: rejectStage,
				unit: args.unit as string,
				hat: currentHat,
				prev_hat: prevHat,
				bolt: String(currentBolt + 1),
			})
			const rejectGit = gitCommitState(
				`haiku: fail ${args.unit as string} — back to ${prevHat}, iteration ${currentBolt + 1}`,
			)
			syncSessionMetadata(
				args.intent as string,
				args.state_file as string | undefined,
			)
			// v4: no Workflow Result file. Subagent terminates with a
			// plain message; parent calls run_next on the next tick to
			// dispatch the prevHat as a fresh subagent.
			return text(
				`rejected — back to ${prevHat} (iteration ${currentBolt + 1}). Reason: ${rejectReason ?? "(none)"}${pushWarning(rejectGit)}`,
			)
		}
		// v4: haiku_unit_increment_bolt removed. Bolt is derived from
		// iterations.length; there is no separate counter to increment.

		// ── Unit body-only read (architecture rule §1.1: no FM exposed) ──
		case "haiku_unit_read": {
			const readInputErr = validateToolInput(
				args,
				validateHaikuUnitReadInputSchema,
				"haiku_unit_read",
			)
			if (readInputErr) return readInputErr
			const readBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (readBranchErr) return readBranchErr
			const path = unitPath(
				args.intent as string,
				args.stage as string,
				args.unit as string,
			)
			if (!existsSync(path)) {
				return reply(
					{
						error: "unit_not_found",
						intent: args.intent,
						stage: args.stage,
						unit: args.unit,
						message: `No unit '${args.unit}' in stage '${args.stage}'.`,
					},
					{ isError: true },
				)
			}
			const { data, body } = parseFrontmatter(readFileSync(path, "utf8"))
			// Title resolves from FM `title:` if present, else first H1, else
			// the unit name. We expose ONLY the title and body — every other
			// FM field is workflow engine-internal per architecture §1.1.
			const fmTitle =
				typeof data.title === "string" ? (data.title as string) : ""
			const h1Match = body.match(/^#\s+(.+)$/m)
			const title =
				fmTitle || (h1Match ? h1Match[1].trim() : (args.unit as string))
			return reply({ title, body })
		}

		// ── Unit delete (architecture rule §1.3: pending only) ──
		case "haiku_unit_delete": {
			const delInputErr = validateToolInput(
				args,
				validateHaikuUnitDeleteInputSchema,
				"haiku_unit_delete",
			)
			if (delInputErr) return delInputErr
			const delBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (delBranchErr) return delBranchErr
			const path = unitPath(
				args.intent as string,
				args.stage as string,
				args.unit as string,
			)
			if (!existsSync(path)) {
				return reply(
					{
						error: "unit_not_found",
						intent: args.intent,
						stage: args.stage,
						unit: args.unit,
						message: `No unit '${args.unit}' in stage '${args.stage}'.`,
					},
					{ isError: true },
				)
			}
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const status = (data.status as string) || "pending"
			if (status !== "pending") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: status,
						required_status: "pending",
						message: `Cannot delete unit '${args.unit}' — status is '${status}'. Per the forward-only lifecycle rule (architecture §1.3), units become immutable once they enter active or completed status because downstream work has been informed by them. Pending units only.`,
					},
					{ isError: true },
				)
			}
			rmSync(path)
			sealIntentState(args.intent as string)
			emitTelemetry("haiku.unit.deleted", {
				intent: args.intent as string,
				stage: args.stage as string,
				unit: args.unit as string,
			})
			return reply({
				ok: true,
				message: `Deleted pending unit '${args.unit}'.`,
			})
		}

		// ── Unit write (create or full-rewrite, pending only) ──
		// The architecture-mandated path for authoring unit files. Generic
		// Write/Edit on units/*.md is denied at the hook layer; this is the
		// only way agents can put a unit on disk. FM is validated; lifecycle
		// is enforced; workflow-driven fields are stripped (the workflow engine owns them).
		case "haiku_unit_write": {
			const writeInputErr = validateToolInput(
				args,
				validateHaikuUnitWriteInputSchema,
				"haiku_unit_write",
			)
			if (writeInputErr) return writeInputErr
			const writeBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (writeBranchErr) return writeBranchErr

			const intentArg = args.intent as string
			const stageArg = args.stage as string
			const unitName = args.unit as string
			const body = (args.body as string) ?? ""
			const fmInput = (args.frontmatter as Record<string, unknown>) ?? {}

			if (!body || body.trim().length === 0) {
				return reply(
					{
						error: "empty_body",
						message:
							"body is required and must be substantive. Empty bodies cannot pass downstream verification.",
					},
					{ isError: true },
				)
			}

			const path = unitPath(intentArg, stageArg, unitName)

			// Lifecycle enforcement: only pending OR new units may be (re)written.
			let isCreate = true
			if (existsSync(path)) {
				const { data: existingFm } = parseFrontmatter(
					readFileSync(path, "utf8"),
				)
				const currentStatus = (existingFm.status as string) || "pending"
				if (currentStatus !== "pending") {
					return reply(
						{
							error: "lifecycle_violation",
							current_status: currentStatus,
							message: `Cannot rewrite unit '${unitName}' — status is '${currentStatus}'. Per the forward-only lifecycle rule (architecture §1.3), units become immutable once active or completed. To address a defect in a completed unit, draft a NEW pending unit in the next elaborate iteration; do not modify the original.`,
						},
						{ isError: true },
					)
				}
				isCreate = false
			}

			// Build sibling list for DAG validation. The new/rewritten unit
			// is included so self-reference detection works.
			const stageUnitsDir = join(stageDir(intentArg, stageArg), "units")
			const siblingUnits: string[] = []
			if (existsSync(stageUnitsDir)) {
				for (const f of readdirSync(stageUnitsDir).filter((n) =>
					n.endsWith(".md"),
				)) {
					siblingUnits.push(f.replace(/\.md$/, ""))
				}
			}
			if (!siblingUnits.includes(unitName)) siblingUnits.push(unitName)

			// FM validation (AJV consumes UNIT_FRONTMATTER_SCHEMA for static
			// rules; context-dependent checks run as additional steps).
			const validation = validateUnitFrontmatter(fmInput, {
				intent: intentArg,
				stage: stageArg,
				unit: unitName,
				siblingUnits,
			})
			if (!validation.valid) {
				return reply(
					{
						error: "frontmatter_validation_failed",
						errors: validation.errors,
						message: `Frontmatter failed validation. Fix each error and call again. Architecture §1.1 mandates that the workflow engine enforces FM validity at write time, so the agent never sees defects sneak through.`,
					},
					{ isError: true },
				)
			}

			// DAG cycle check — assemble the full stage DAG including the
			// proposed write, then run cycle detection.
			const dag: Record<string, string[]> = {}
			if (existsSync(stageUnitsDir)) {
				for (const f of readdirSync(stageUnitsDir).filter((n) =>
					n.endsWith(".md"),
				)) {
					const sibName = f.replace(/\.md$/, "")
					if (sibName === unitName) continue
					const { data: sibFm } = parseFrontmatter(
						readFileSync(join(stageUnitsDir, f), "utf8"),
					)
					dag[sibName] = Array.isArray(sibFm.depends_on)
						? (sibFm.depends_on as string[])
						: []
				}
			}
			dag[unitName] = Array.isArray(fmInput.depends_on)
				? (fmInput.depends_on as string[])
				: []
			const cycleNodes = detectDagCycles(dag)
			if (cycleNodes.length > 0) {
				return reply(
					{
						error: "dag_cycle_detected",
						cycle_nodes: cycleNodes,
						message: `Writing unit '${unitName}' with depends_on=[${(fmInput.depends_on as string[] | undefined)?.join(", ") ?? ""}] would create a dependency cycle involving: [${cycleNodes.join(", ")}]. The workflow engine rejects writes that produce a cyclic DAG. Reorder dependencies or restructure the units.`,
					},
					{ isError: true },
				)
			}

			// Helper-grep proof: when the unit body cites an existing
			// helper at a specific path (e.g. "use the existing
			// `foo` in `path/to/file.ts`"), verify the path exists AND
			// the identifier appears in that file. Catches "the agent
			// hallucinated an existing utility" before the fix-loop has
			// to run a bolt that fails on import.
			const helperViolation = validateCitedHelpers(body)
			if (helperViolation) {
				return reply(helperViolation, { isError: true })
			}

			// Banned-test-shapes detection: scan quality_gates: commands
			// for trivially-passing patterns (asserting zero matches on
			// the unit's own un-yet-existent output, greps for literals
			// the implementer also writes). False positives are worse
			// than false negatives here — only reject on unambiguous
			// patterns.
			const gateViolation = validateUnitQualityGateShapes(unitName, fmInput)
			if (gateViolation) {
				return reply(gateViolation, { isError: true })
			}

			// All validators passed. Persist. Set workflow-driven fields to their
			// initial values (status: pending, etc.) — agents never touch
			// these.
			const finalFm: Record<string, unknown> = {
				...fmInput,
				status: "pending",
			}
			// Title default: if absent, derive from body's first H1 or fall
			// back to unit name.
			if (!("title" in finalFm)) {
				const h1 = body.match(/^#\s+(.+)$/m)
				finalFm.title = h1 ? h1[1].trim() : unitName
			}

			// Ensure parent directory exists for create paths.
			if (isCreate && !existsSync(stageUnitsDir)) {
				mkdirSync(stageUnitsDir, { recursive: true })
			}
			writeFileSync(path, matter.stringify(`${body.trimEnd()}\n`, finalFm))
			sealIntentState(intentArg)
			emitTelemetry(isCreate ? "haiku.unit.created" : "haiku.unit.rewritten", {
				intent: intentArg,
				stage: stageArg,
				unit: unitName,
			})
			return reply({
				ok: true,
				created: isCreate,
				unit: unitName,
				stage: stageArg,
				intent: intentArg,
				message: isCreate
					? `Created unit '${unitName}' in stage '${stageArg}' (status: pending).`
					: `Rewrote unit '${unitName}' in stage '${stageArg}' (status preserved as pending).`,
			})
		}

		case "haiku_reconciliation_acknowledge": {
			const reconAckInputErr = validateToolInput(
				args,
				validateHaikuReconciliationAcknowledgeInputSchema,
				"haiku_reconciliation_acknowledge",
			)
			if (reconAckInputErr) return reconAckInputErr
			const intentArg = args.intent as string
			const requestedStage = args.stage as string | undefined
			const stage = requestedStage || resolveActiveStage(intentArg)
			const rationale = (args.rationale as string | undefined)?.trim()
			if (!stage) {
				return reply(
					{
						error: "no_active_stage",
						message:
							"No stage specified and no active stage found on the intent.",
					},
					{ isError: true },
				)
			}
			if (!rationale || rationale.length < 10) {
				return reply(
					{
						error: "rationale_required",
						message:
							"haiku_reconciliation_acknowledge requires a rationale of at least 10 characters explaining why the divergence is intentional. Acknowledging without explanation defeats the purpose of the reconciliation log.",
					},
					{ isError: true },
				)
			}
			// v4: write to a dedicated per-stage marker
			// `stages/<stage>/upstream-reconciliation.json` and append a
			// line to `stages/<stage>/decisions.jsonl`. No state.json
			// touch — the file no longer exists in v4.
			const reconStageDir = join(intentDir(intentArg), "stages", stage)
			mkdirSync(reconStageDir, { recursive: true })
			const reconMarkerFile = join(
				reconStageDir,
				"upstream-reconciliation.json",
			)
			writeJson(reconMarkerFile, {
				acknowledged: true,
				acknowledged_at: timestamp(),
				rationale,
			})
			appendDecisionLogLine(intentArg, stage, {
				decision: "Upstream reconciliation acknowledged",
				options: ["reconcile upstream artifacts", "acknowledge divergence"],
				choice: "acknowledge divergence",
				source: "autonomous-acknowledged",
				rationale,
				kind: "upstream_reconciliation",
				recorded_at: timestamp(),
			})
			sealIntentState(intentArg)
			emitTelemetry("haiku.reconciliation.acknowledged", {
				intent: intentArg,
				stage,
			})
			return reply({
				ok: true,
				intent: intentArg,
				stage,
				rationale,
			})
		}

		case "haiku_decision_record": {
			const decisionRecordInputErr = validateToolInput(
				args,
				validateHaikuDecisionRecordInputSchema,
				"haiku_decision_record",
			)
			if (decisionRecordInputErr) return decisionRecordInputErr
			const intentArg = args.intent as string
			const requestedStage = args.stage as string | undefined
			const stage = requestedStage || resolveActiveStage(intentArg)
			if (!stage) {
				return reply(
					{
						error: "no_active_stage",
						message:
							"No stage specified and no active stage found on the intent.",
					},
					{ isError: true },
				)
			}

			// v4: no state.json. Decision data lives in two disk artifacts:
			//   - `stages/<stage>/no-decisions.json` — set by the
			//     `no_decisions: true` branch below
			//   - `stages/<stage>/decisions.jsonl` — appended by the
			//     `decision_log` branch below
			// Both are stage-scoped and engine-managed.
			const decisionStageDir = join(intentDir(intentArg), "stages", stage)
			mkdirSync(decisionStageDir, { recursive: true })

			const noDecisions = args.no_decisions === true
			const rationale = (args.rationale as string | undefined)?.trim()

			if (noDecisions) {
				if (!rationale || rationale.length < 10) {
					return reply(
						{
							error: "rationale_required",
							message:
								"no_decisions=true requires a rationale of at least 10 characters explaining why no architectural decisions are in scope for this stage. State the convention or constraint that makes the work routine (e.g. 'all units follow the team's standard CRUD scaffolding; no architectural choices remain after design stage').",
						},
						{ isError: true },
					)
				}
				const noDecisionsMarker = join(decisionStageDir, "no-decisions.json")
				writeJson(noDecisionsMarker, {
					declared: true,
					declared_at: timestamp(),
					rationale,
				})
				sealIntentState(intentArg)
				emitTelemetry("haiku.elaboration.no_decisions_declared", {
					intent: intentArg,
					stage,
				})
				return reply({
					ok: true,
					intent: intentArg,
					stage,
					no_decisions: true,
					rationale,
				})
			}

			const decision = (args.decision as string | undefined)?.trim()
			const options = args.options as string[] | undefined
			const choice = (args.choice as string | undefined)?.trim()
			const source = args.source as string | undefined

			if (!decision || !options || !choice || !source) {
				return reply(
					{
						error: "missing_fields",
						message:
							"haiku_decision_record requires `decision`, `options`, `choice`, and `source` (or `no_decisions: true` with `rationale`).",
					},
					{ isError: true },
				)
			}

			if (!Array.isArray(options) || options.length < 2) {
				return reply(
					{
						error: "options_too_few",
						message:
							"`options` must be an array of at least 2 concrete alternatives. A 'decision' with only one option isn't a decision — it's just doing the work. If the work is forced, use `no_decisions: true` with a rationale instead.",
					},
					{ isError: true },
				)
			}

			if (!options.includes(choice)) {
				return reply(
					{
						error: "choice_not_in_options",
						message: `\`choice\` must match one of the entries in \`options\`. Got choice=${JSON.stringify(choice)}; options=${JSON.stringify(options)}. The decision-log is provenance — recording a choice that wasn't in the presented alternatives corrupts the very property the log exists to preserve.`,
					},
					{ isError: true },
				)
			}

			if (source !== "user" && source !== "autonomous-acknowledged") {
				return reply(
					{
						error: "invalid_source",
						message:
							'`source` must be "user" (the user picked between the options) or "autonomous-acknowledged" (you chose and surfaced the choice for the user to veto, and they did not push back).',
					},
					{ isError: true },
				)
			}

			appendDecisionLogLine(intentArg, stage, {
				decision,
				options,
				choice,
				source,
				rationale: rationale || null,
				recorded_at: timestamp(),
			})
			const decisionCount = readDecisionLog(intentArg, stage).length
			sealIntentState(intentArg)
			emitTelemetry("haiku.decision.recorded", {
				intent: intentArg,
				stage,
				source,
			})
			return reply({
				ok: true,
				intent: intentArg,
				stage,
				decision_count: decisionCount,
			})
		}

		// ── Knowledge ──
		case "haiku_knowledge_list": {
			const knowledgeListInputErr = validateToolInput(
				args,
				validateHaikuKnowledgeListInputSchema,
				"haiku_knowledge_list",
			)
			if (knowledgeListInputErr) return knowledgeListInputErr
			const dir = join(intentDir(args.intent as string), "knowledge")
			if (!existsSync(dir)) return reply({ files: [] })
			const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
			return reply({ files })
		}
		case "haiku_knowledge_read": {
			const knowledgeReadInputErr = validateToolInput(
				args,
				validateHaikuKnowledgeReadInputSchema,
				"haiku_knowledge_read",
			)
			if (knowledgeReadInputErr) return knowledgeReadInputErr
			const path = join(
				intentDir(args.intent as string),
				"knowledge",
				args.name as string,
			)
			if (!existsSync(path)) {
				return reply({ found: false, name: args.name as string, content: "" })
			}
			return reply({
				found: true,
				name: args.name as string,
				content: readFileSync(path, "utf8"),
			})
		}

		// ── Skills ──
		case "haiku_skill_list": {
			const skillListInputErr = validateToolInput(
				args,
				validateHaikuEmptyInputSchema,
				"haiku_skill_list",
			)
			if (skillListInputErr) return skillListInputErr
			return reply({ skills: listInstalledSkills() })
		}

		// ── Studio ──
		case "haiku_studio_list": {
			const studioListInputErr = validateToolInput(
				args,
				validateHaikuEmptyInputSchema,
				"haiku_studio_list",
			)
			if (studioListInputErr) return studioListInputErr
			// Unified discovery — listStudios covers both plugin and project studios,
			// honors name/slug/aliases from frontmatter, and exposes help links.
			const studios = listStudios().map((s) => ({
				name: s.name,
				slug: s.slug,
				aliases: s.aliases,
				dir: s.dir,
				description: s.description,
				category: s.category,
				stages: s.stages,
				source: s.source,
				path: s.path,
				studio_md: s.studioFile,
				body: s.body.slice(0, 200),
			}))
			return reply({ studios })
		}
		case "haiku_studio_get": {
			const studioGetInputErr = validateToolInput(
				args,
				validateHaikuStudioGetInputSchema,
				"haiku_studio_get",
			)
			if (studioGetInputErr) return studioGetInputErr
			const studio = resolveStudio(args.studio as string)
			if (!studio) return reply({ found: false })
			return reply({
				found: true,
				name: studio.name,
				slug: studio.slug,
				aliases: studio.aliases,
				dir: studio.dir,
				description: studio.description,
				category: studio.category,
				stages: studio.stages,
				source: studio.source,
				path: studio.path,
				studio_md: studio.studioFile,
				body: studio.body,
				...studio.data,
			})
		}
		case "haiku_studio_stage_get": {
			const studioStageGetInputErr = validateToolInput(
				args,
				validateHaikuStudioStageGetInputSchema,
				"haiku_studio_stage_get",
			)
			if (studioStageGetInputErr) return studioStageGetInputErr
			const studio = resolveStudio(args.studio as string)
			if (!studio) return reply({ found: false })
			const sgName = args.stage as string
			const stageFile = join(studio.path, "stages", sgName, "STAGE.md")
			if (!existsSync(stageFile)) return reply({ found: false })
			const raw = readFileSync(stageFile, "utf8")
			const { data, body } = parseFrontmatter(raw)
			return reply({
				found: true,
				...data,
				body,
				studio: studio.name,
				studio_dir: studio.dir,
				stage_md: stageFile,
			})
		}

		// ── Settings ──
		case "haiku_settings_get": {
			const settingsGetInputErr = validateToolInput(
				args,
				validateHaikuSettingsGetInputSchema,
				"haiku_settings_get",
			)
			if (settingsGetInputErr) return settingsGetInputErr
			const field = args.field as string
			let settingsPath = ""
			try {
				settingsPath = join(findHaikuRoot(), "settings.yml")
			} catch {
				/* */
			}
			if (!(settingsPath && existsSync(settingsPath))) {
				return reply({ found: false, field, value: null })
			}
			const raw = readFileSync(settingsPath, "utf8")
			const settings = parseYaml(raw)
			const val = getNestedField(settings, field)
			return reply({
				found: val != null,
				field,
				value: val == null ? null : (val as unknown),
			})
		}

		case "haiku_settings_set": {
			const settingsSetInputErr = validateToolInput(
				args,
				validateHaikuSettingsSetInputSchema,
				"haiku_settings_set",
			)
			if (settingsSetInputErr) return settingsSetInputErr
			const field = args.field as string
			const value = args.value as unknown
			const errOut = (error: string, message: string) =>
				reply({ error, field, message }, { isError: true })
			let settingsPath = ""
			try {
				settingsPath = join(findHaikuRoot(), "settings.yml")
			} catch (err) {
				return errOut(
					"haiku_root_not_found",
					`No .haiku/ directory found: ${(err as Error).message}`,
				)
			}
			const settings: Record<string, unknown> = existsSync(settingsPath)
				? parseYaml(readFileSync(settingsPath, "utf8"))
				: {}
			// Validate the post-write shape against settings.schema.json.
			// Build the candidate object, run AJV, refuse the write on
			// failure. AJV reports the first error; we surface it
			// verbatim so the caller can correct.
			const candidate = { ...settings }
			if (value === null || value === undefined) {
				delete candidate[field]
			} else {
				candidate[field] = value
			}
			if (!validateSettingsCandidate(candidate)) {
				const first = (
					settingsValidationErrors() as Array<{
						instancePath?: string
						message?: string
					}>
				)[0]
				return errOut(
					"settings_field_validation_failed",
					`Field '${field}' fails settings.schema.json validation: ${first?.instancePath || "(root)"} ${first?.message || "invalid"}.`,
				)
			}
			// Write — gray-matter's bundled js-yaml engine handles
			// stringification consistently with how the file is read.
			const yamlEngine = (
				matter as unknown as {
					engines: { yaml: { stringify: (v: unknown) => string } }
				}
			).engines.yaml
			const yamlOut = yamlEngine.stringify(candidate)
			writeFileSync(settingsPath, yamlOut)
			return reply({
				ok: true,
				field,
				message:
					value === null || value === undefined
						? `Deleted '${field}' from .haiku/settings.yml`
						: `Set '${field}' in .haiku/settings.yml`,
			})
		}

		case "haiku_intent_set": {
			const intentSetInputErr = validateToolInput(
				args,
				validateHaikuIntentSetInputSchema,
				"haiku_intent_set",
			)
			if (intentSetInputErr) return intentSetInputErr
			const slug = args.intent as string
			const field = args.field as string
			const value = args.value as unknown
			const errOut = (error: string, message: string) =>
				reply({ error, intent: slug, field, message }, { isError: true })

			// Reject FSM-driven fields up front with a stable code.
			if ((FSM_DRIVEN_INTENT_FIELDS as readonly string[]).includes(field)) {
				return errOut(
					"intent_field_engine_only",
					`Field '${field}' is workflow engine-managed — agents cannot set it. Engine-only fields: ${FSM_DRIVEN_INTENT_FIELDS.join(", ")}.`,
				)
			}
			// Reject immutable fields with a dedicated code so callers
			// can distinguish "this field exists but you can't change
			// it" from "this field doesn't exist".
			if (INTENT_IMMUTABLE_FIELDS.includes(field)) {
				return errOut(
					"intent_field_immutable",
					`Field '${field}' is immutable after creation.`,
				)
			}
			// Reject unknown fields.
			if (
				!(AGENT_AUTHORABLE_INTENT_FIELDS as readonly string[]).includes(field)
			) {
				return errOut(
					"intent_field_unknown",
					`Field '${field}' is not in INTENT_FRONTMATTER_SCHEMA. Allowed: ${AGENT_AUTHORABLE_INTENT_FIELDS.filter((f) => !INTENT_IMMUTABLE_FIELDS.includes(f)).join(", ")}.`,
				)
			}

			let intentFile = ""
			try {
				intentFile = join(intentDir(slug), "intent.md")
			} catch (err) {
				return errOut(
					"haiku_root_not_found",
					`Could not resolve intent dir: ${(err as Error).message}`,
				)
			}
			if (!existsSync(intentFile)) {
				return errOut(
					"intent_not_found",
					`Intent '${slug}' not found at ${intentFile}.`,
				)
			}

			// Validate the candidate field+value against the schema.
			// AJV is run against `{[field]: value}` so a single-field
			// validation echoes the exact AJV error path.
			const candidate: Record<string, unknown> = {
				[field]: value,
			}
			if (!validateIntentSchema(candidate)) {
				const first = validateIntentSchema.errors?.[0]
				return errOut(
					"intent_field_type_mismatch",
					`Field '${field}' fails INTENT_FRONTMATTER_SCHEMA validation: ${first?.instancePath || "(root)"} ${first?.message || "invalid"}.`,
				)
			}

			setFrontmatterField(intentFile, field, value)
			gitCommitState(`haiku: intent ${slug} set ${field} via haiku_intent_set`)
			return reply({
				ok: true,
				intent: slug,
				field,
				message: `Set intent.${field} on '${slug}'.`,
			})
		}

		case "haiku_stage_set": {
			const stageSetInputErr = validateToolInput(
				args,
				validateHaikuStageSetInputSchema,
				"haiku_stage_set",
			)
			if (stageSetInputErr) return stageSetInputErr
			const slug = args.intent as string
			const stage = args.stage as string
			const field = args.field as string
			void args.value
			const errOut = (error: string, message: string) =>
				reply({ error, intent: slug, stage, field, message }, { isError: true })
			if (!field || typeof field !== "string")
				return errOut("stage_field_required", "`field` is required")

			// Every field on stage state.json is engine-managed. Agents
			// reach this case only when something has gone wrong (typo,
			// stale instructions). Reject with a clear code so the
			// caller routes through the proper workflow tool.
			return errOut(
				"stage_field_engine_only",
				`Stage state.json is workflow engine-managed — agents cannot set fields directly. Stage fields are mutated by haiku_run_next ticks (start, advance phase, complete) and lifecycle tools (haiku_unit_advance_hat, haiku_feedback_advance_hat). To force a stage transition manually, use /haiku:repair or /haiku:revisit. Field '${field}' on stage '${stage}' of intent '${slug}' was not written.`,
			)
		}

		// ── Dashboard ──
		case "haiku_dashboard": {
			const dashboardInputErr = validateToolInput(
				args,
				validateHaikuEmptyInputSchema,
				"haiku_dashboard",
			)
			if (dashboardInputErr) return dashboardInputErr
			const empty = "No intents found. Use /haiku:start to create one."
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return reply({ markdown: empty })
			}
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return reply({ markdown: empty })
			const entries = listVisibleIntents(intentsDir)
			if (entries.length === 0) return reply({ markdown: empty })

			let out = "# Dashboard\n"
			for (const { slug, data } of entries) {
				// v3↔v4 dual-path: v4 has no status/active_stage on
				// intent.md. Status is derived from sealed_at; active
				// stage is derived from "first stage with no completed
				// merge" (best-effort here — the dashboard is read-only
				// and doesn't run the cursor walk).
				const isV4 = typeof data.plugin_version === "string"
				const v4Sealed =
					typeof data.sealed_at === "string" && data.sealed_at
						? (data.sealed_at as string)
						: ""
				const statusDisplay = isV4
					? v4Sealed
						? "completed"
						: "active"
					: (data.status as string) || "unknown"

				out += `\n## ${slug}\n`
				out += `- Status: ${statusDisplay}\n`
				out += `- Studio: ${data.studio || "none"}\n`
				if (data.active_stage) {
					out += `- Active Stage: ${data.active_stage}\n`
				} else if (isV4) {
					// Derived hint — actual active stage requires a cursor
					// walk that the dashboard doesn't do. The first
					// declared stage is the best static guess.
					const stages = (data.stages as string[]) || []
					if (stages.length > 0) {
						out += `- Active Stage: ${stages[0]} (first declared; cursor-derived)\n`
					}
				}
				out += `- Mode: ${data.mode || "interactive"}\n`
				if (isV4) {
					out += `- Schema: v${(data.plugin_version as string).split(".")[0]}\n`
				}

				// `discrete-hybrid` is a virtual/derived state — never stored on
				// intent.md. The only stored discrete mode is `"discrete"`.
				const isDiscrete = (data.mode as string) === "discrete"

				const stagesPath = join(intentsDir, slug, "stages")
				if (existsSync(stagesPath)) {
					// v3 stages have state.json. v4 stages don't (the
					// migrator deletes them). For v4, list every dir under
					// stages/ regardless of state.json presence — the
					// derivation walks unit FMs instead.
					const allDirs = readdirSync(stagesPath).filter(
						(s) =>
							existsSync(join(stagesPath, s)) &&
							!s.startsWith(".") &&
							s !== "feedback",
					)
					const stages = isV4
						? allDirs
						: allDirs.filter((s) =>
								existsSync(join(stagesPath, s, "state.json")),
							)
					const stagesFromBranches: string[] = []
					if (isDiscrete && isGitRepo()) {
						try {
							const branchList = execFileSync(
								"git",
								["branch", "--list", `haiku/${slug}/*`],
								{ encoding: "utf8", stdio: "pipe" },
							).trim()
							for (const line of branchList.split("\n")) {
								const branch = line.trim().replace(/^\* /, "")
								const stageName = branch.replace(`haiku/${slug}/`, "")
								// Skip main branch and unit branches (unit-NN-*)
								if (
									stageName &&
									stageName !== "main" &&
									!/^unit-\d+/.test(stageName) &&
									!stages.includes(stageName)
								) {
									stagesFromBranches.push(stageName)
								}
							}
						} catch {
							/* non-fatal */
						}
					}

					const allStages = [...stages, ...stagesFromBranches]
					if (allStages.length > 0) {
						out += "\n| Stage | Status | Phase |\n|-------|--------|-------|\n"
						for (const s of stages) {
							const stateJsonPath = join(stagesPath, s, "state.json")
							if (existsSync(stateJsonPath)) {
								// v3: read from state.json
								const state = readJson(stateJsonPath)
								out += `| ${s} | ${state.status || "pending"} | ${state.phase || ""} |\n`
							} else {
								// v4: derive from per-unit iterations[] + approvals
								const unitsDir = join(stagesPath, s, "units")
								let derived: "pending" | "active" | "completed" = "pending"
								if (existsSync(unitsDir)) {
									const unitFiles = readdirSync(unitsDir).filter((f) =>
										f.endsWith(".md"),
									)
									if (unitFiles.length === 0) {
										derived = "pending"
									} else {
										let anyStarted = false
										let allComplete = true
										for (const f of unitFiles) {
											const { data: ud } = parseFrontmatter(
												readFileSync(join(unitsDir, f), "utf8"),
											)
											const iters = ud.iterations
											const hasIter = Array.isArray(iters) && iters.length > 0
											const last = hasIter
												? (iters as Array<{ result?: string }>)[
														iters.length - 1
													]
												: undefined
											const lastAdvance = last?.result === "advance"
											const approvals =
												(ud.approvals as Record<string, unknown> | undefined) ||
												{}
											const userApproved = approvals.user != null
											if (hasIter) anyStarted = true
											if (!(lastAdvance && userApproved)) allComplete = false
										}
										derived = allComplete
											? "completed"
											: anyStarted
												? "active"
												: "pending"
									}
								}
								out += `| ${s} | ${derived} | (derived) |\n`
							}
						}
						for (const s of stagesFromBranches) {
							const branch = `haiku/${slug}/${s}`
							const relPath = `.haiku/intents/${slug}/stages/${s}/state.json`
							const raw = readFileFromBranch(branch, relPath)
							if (raw) {
								try {
									const state = JSON.parse(raw)
									out += `| ${s} | ${state.status || "pending"} | ${state.phase || ""} |\n`
								} catch {
									out += `| ${s} | ? | ? |\n`
								}
							} else {
								out += `| ${s} | (on branch) | |\n`
							}
						}
						// List units with model assignments for active stages
						for (const s of stages) {
							const unitsDir = join(stagesPath, s, "units")
							if (!existsSync(unitsDir)) continue
							const unitFiles = readdirSync(unitsDir).filter((f) =>
								f.endsWith(".md"),
							)
							const unitsWithModel = unitFiles
								.map((f) => {
									const { data } = parseFrontmatter(
										readFileSync(join(unitsDir, f), "utf8"),
									)
									return {
										name: f.replace(".md", ""),
										model: data.model as string | undefined,
									}
								})
								.filter((u) => u.model)
							if (unitsWithModel.length > 0) {
								out += `\n**${s} unit models:**\n`
								for (const u of unitsWithModel) {
									out += `- ${u.name}: ${u.model}\n`
								}
							}
						}
					}
				}
			}
			return reply({ markdown: out })
		}

		// ── Capacity ──
		case "haiku_capacity": {
			const capacityInputErr = validateToolInput(
				args,
				validateHaikuCapacityInputSchema,
				"haiku_capacity",
			)
			if (capacityInputErr) return capacityInputErr
			const filterStudio = (args.studio as string) || ""
			const studioField = filterStudio || null
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return reply({
					markdown: "No .haiku directory found.",
					studio: studioField,
				})
			}
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) {
				return reply({ markdown: "No intents found.", studio: studioField })
			}
			const entries = listVisibleIntents(intentsDir)

			const median = (arr: number[]): number => {
				if (arr.length === 0) return 0
				const sorted = [...arr].sort((a, b) => a - b)
				const mid = Math.floor(sorted.length / 2)
				return sorted.length % 2 !== 0
					? sorted[mid]
					: (sorted[mid - 1] + sorted[mid]) / 2
			}

			// Group intents by studio
			const byStudio = new Map<
				string,
				Array<{ slug: string; status: string; data: Record<string, unknown> }>
			>()
			for (const { slug, data } of entries) {
				const studio = (data.studio as string) || "unassigned"
				if (filterStudio && studio !== filterStudio) continue
				if (!byStudio.has(studio)) byStudio.set(studio, [])
				// v3↔v4 dual-path: v4 has no status field on intent.md.
				// sealed_at presence → "completed"; absence → "active".
				const isV4 = typeof data.plugin_version === "string"
				const v3Status = (data.status as string) || ""
				const v4Status = isV4
					? typeof data.sealed_at === "string" && data.sealed_at
						? "completed"
						: "active"
					: ""
				const status = v3Status || v4Status || "unknown"
				byStudio.get(studio)?.push({ slug, status, data })
			}

			if (byStudio.size === 0) {
				return reply({
					markdown: filterStudio
						? `No intents found for studio '${filterStudio}'.`
						: "No intents found.",
					studio: studioField,
				})
			}

			let out = "# Capacity Report\n"
			for (const [studio, intents] of byStudio) {
				const completed = intents.filter((i) => i.status === "completed").length
				const active = intents.filter((i) => i.status === "active").length
				out += `\n## Studio: ${studio}\n`
				out += `- Total intents: ${intents.length}\n`
				out += `- Completed: ${completed}\n`
				out += `- Active: ${active}\n`

				// Collect iteration-count-per-unit (formerly bolt count) per stage
				// across all intents in this studio. v3 stored an explicit
				// `bolt: <n>` on each unit FM. v4 dropped the field; the
				// iteration count is `iterations[].length`. Dual-path: prefer
				// explicit v3 bolt when present, else fall back to v4
				// iterations[]-length.
				const stageIterations = new Map<string, number[]>()
				for (const intent of intents) {
					const stagesPath = join(intentsDir, intent.slug, "stages")
					if (!existsSync(stagesPath)) continue
					for (const stage of readdirSync(stagesPath)) {
						const unitsDir = join(stagesPath, stage, "units")
						if (!existsSync(unitsDir)) continue
						if (!stageIterations.has(stage)) stageIterations.set(stage, [])
						for (const f of readdirSync(unitsDir).filter((f) =>
							f.endsWith(".md"),
						)) {
							const { data: ud } = parseFrontmatter(
								readFileSync(join(unitsDir, f), "utf8"),
							)
							let iterCount: number | null = null
							if (typeof ud.bolt === "number") {
								iterCount = ud.bolt as number
							} else if (Array.isArray(ud.iterations)) {
								iterCount = (ud.iterations as Array<unknown>).length
							}
							if (iterCount !== null)
								stageIterations.get(stage)?.push(iterCount)
						}
					}
				}

				if (stageIterations.size > 0) {
					out +=
						"\n| Stage | Units | Median Iterations |\n|-------|-------|-------------------|\n"
					for (const [stage, iters] of stageIterations) {
						out += `| ${stage} | ${iters.length} | ${median(iters)} |\n`
					}
				}
			}
			return reply({ markdown: out, studio: studioField })
		}

		// ── Reflect ──
		case "haiku_reflect": {
			const reflectInputErr = validateToolInput(
				args,
				validateHaikuReflectInputSchema,
				"haiku_reflect",
			)
			if (reflectInputErr) return reflectInputErr
			const intentSlug = args.intent as string
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No .haiku directory found.")
			}
			const intentFile = join(root, "intents", intentSlug, "intent.md")
			if (!existsSync(intentFile))
				return text(`Intent '${intentSlug}' not found.`)

			const { data: intentData } = parseFrontmatter(
				readFileSync(intentFile, "utf8"),
			)
			// v3↔v4 dual-path:
			//   - v3: status/completed_at on intent.md
			//   - v4: sealed_at — synthesize "completed" / "active"
			const isV4 = typeof intentData.plugin_version === "string"
			const v4Sealed =
				typeof intentData.sealed_at === "string" && intentData.sealed_at
					? (intentData.sealed_at as string)
					: ""
			const intentStatusDisplay = isV4
				? v4Sealed
					? "completed"
					: "active"
				: (intentData.status as string) || "unknown"
			const intentCompletedDisplay = isV4
				? v4Sealed || "in progress"
				: (intentData.completed_at as string) || "in progress"
			let out = "## Intent Metadata\n"
			out += `- Slug: ${intentSlug}\n`
			out += `- Studio: ${intentData.studio || "none"}\n`
			out += `- Mode: ${intentData.mode || "interactive"}\n`
			out += `- Status: ${intentStatusDisplay}\n`
			out += `- Created: ${intentData.created_at || "unknown"}\n`
			out += `- Completed: ${intentCompletedDisplay}\n`
			if (isV4) {
				out += `- Schema: v${(intentData.plugin_version as string).split(".")[0]} (plugin_version=${intentData.plugin_version})\n`
			}

			const stagesPath = join(root, "intents", intentSlug, "stages")
			if (existsSync(stagesPath)) {
				out += "\n## Per-Stage Summary\n"
				for (const stage of readdirSync(stagesPath)) {
					const stateJsonPath = join(stagesPath, stage, "state.json")
					const hasV3State = existsSync(stateJsonPath)
					const state = hasV3State ? readJson(stateJsonPath) : {}
					out += `\n### ${stage}\n`

					// Read units first — needed for v4 derivation.
					const unitsDir = join(stagesPath, stage, "units")
					const unitFms: Array<Record<string, unknown>> = []
					const unitNames: string[] = []
					if (existsSync(unitsDir)) {
						for (const f of readdirSync(unitsDir).filter((x) =>
							x.endsWith(".md"),
						)) {
							const { data: ud } = parseFrontmatter(
								readFileSync(join(unitsDir, f), "utf8"),
							)
							unitFms.push(ud)
							unitNames.push(f.replace(".md", ""))
						}
					}

					// Stage status: v3 state.json wins, else derive from
					// units (v4 path: every unit terminal-advance + user
					// approved → completed; any started → active; else
					// pending).
					let stageStatusDisplay: string
					if (hasV3State && typeof state.status === "string") {
						stageStatusDisplay = state.status as string
					} else if (unitFms.length === 0) {
						stageStatusDisplay = "pending"
					} else {
						let anyStarted = false
						let allComplete = true
						for (const ud of unitFms) {
							const iters = ud.iterations
							const hasIter = Array.isArray(iters) && iters.length > 0
							const last = hasIter
								? (iters as Array<{ result?: string }>)[iters.length - 1]
								: undefined
							const lastAdvance = last?.result === "advance"
							const approvals =
								(ud.approvals as Record<string, unknown> | undefined) || {}
							const userApproved = approvals.user != null
							if (hasIter) anyStarted = true
							if (!(lastAdvance && userApproved)) allComplete = false
						}
						stageStatusDisplay = allComplete
							? "completed"
							: anyStarted
								? "active"
								: "pending"
					}
					out += `- Status: ${stageStatusDisplay}\n`
					if (hasV3State) {
						out += `- Phase: ${state.phase || ""}\n`
						out += `- Started: ${state.started_at || "not started"}\n`
						out += `- Completed: ${state.completed_at || "in progress"}\n`
					}

					if (unitFms.length > 0) {
						let completedUnits = 0
						let totalIterations = 0
						const unitDetails: string[] = []
						for (let i = 0; i < unitFms.length; i++) {
							const ud = unitFms[i]
							const uName = unitNames[i]
							// v3 unit metrics: bolt, hat, status
							// v4 derivation: iterations[].length, last.hat, last.result
							const iters = ud.iterations
							const iterCount = Array.isArray(iters) ? iters.length : 0
							const v3Bolt = (ud.bolt as number) || 0
							const display_iters = iterCount > 0 ? iterCount : v3Bolt
							totalIterations += display_iters
							const lastIter =
								Array.isArray(iters) && iters.length > 0
									? (iters[iters.length - 1] as {
											hat?: string
											result?: string
										})
									: null
							const v3Status = ud.status as string | undefined
							const isCompleted =
								v3Status === "completed" || lastIter?.result === "advance"
							if (isCompleted) completedUnits++
							const display_hat =
								v3Status === undefined
									? lastIter?.hat || "none"
									: (ud.hat as string) || "none"
							const display_status =
								v3Status ??
								(lastIter?.result === "advance"
									? "completed"
									: lastIter?.result === "reject"
										? "rejected"
										: lastIter
											? "in_progress"
											: "pending")
							unitDetails.push(
								`  - ${uName}: status=${display_status}, iterations=${display_iters}, last_hat=${display_hat}`,
							)
						}
						out += `- Units: ${completedUnits}/${unitFms.length} completed, Total iterations: ${totalIterations}\n`
						if (unitDetails.length > 0) out += `${unitDetails.join("\n")}\n`
					}
				}
			}

			const studio = (intentData.studio as string) || ""
			if (studio) {
				const dims = readReflectionDefs(studio)
				if (Object.keys(dims).length > 0) {
					out += "\n## Reflection Dimensions\n\n"
					out += "Analyze this intent along each dimension below:\n\n"
					for (const [name, content] of Object.entries(dims)) {
						out += `### ${name}\n\n${content}\n\n`
					}
				} else {
					out += "\n## Analysis Instructions\n"
					out +=
						"1. Execution patterns — which units went smoothly, which required retries\n"
					out += "2. Criteria satisfaction\n"
					out += "3. Process observations\n"
					out += "4. Blocker analysis\n"
				}
			} else {
				out += "\n## Analysis Instructions\n"
				out +=
					"1. Execution patterns — which units went smoothly, which required retries\n"
				out += "2. Criteria satisfaction\n"
				out += "3. Process observations\n"
				out += "4. Blocker analysis\n"
			}
			// Studio operations — surface available post-intent operations
			if (studio) {
				const ops = readOperationDefs(studio)
				if (Object.keys(ops).length > 0) {
					out += "\n## Available Operations\n\n"
					out +=
						"The following post-delivery operations are defined for this studio:\n\n"
					for (const [name, content] of Object.entries(ops)) {
						out += `### ${name}\n\n${content}\n\n`
					}
				}
			}

			out += "\n## Output\n"
			out +=
				"Write reflection.md and settings-recommendations.md to the intent directory.\n"
			return text(out)
		}

		// ── Review ──
		case "haiku_review": {
			const reviewInputErr = validateToolInput(
				args,
				validateHaikuReviewInputSchema,
				"haiku_review",
			)
			if (reviewInputErr) return reviewInputErr
			// Determine diff base — prefer the tracked upstream, fall back to the
			// detected mainline (origin/HEAD-aware), then to a last-resort "main".
			let base = getMainlineBranch()
			try {
				const upstream = spawnSync(
					"git",
					["rev-parse", "--abbrev-ref", "@{upstream}"],
					{ encoding: "utf8", stdio: "pipe" },
				)
				if (upstream.status === 0 && upstream.stdout.trim()) {
					base = upstream.stdout.trim()
				}
			} catch {
				/* fallback to detected mainline */
			}

			// Get diff, stat, and changed files
			let diff = ""
			let stat = ""
			let changedFiles = ""
			try {
				const diffResult = spawnSync("git", ["diff", `${base}...HEAD`], {
					encoding: "utf8",
					stdio: "pipe",
					maxBuffer: 10 * 1024 * 1024,
				})
				diff = diffResult.stdout || ""
				const statResult = spawnSync(
					"git",
					["diff", "--stat", `${base}...HEAD`],
					{ encoding: "utf8", stdio: "pipe" },
				)
				stat = statResult.stdout || ""
				const namesResult = spawnSync(
					"git",
					["diff", "--name-only", `${base}...HEAD`],
					{ encoding: "utf8", stdio: "pipe" },
				)
				changedFiles = namesResult.stdout || ""
			} catch {
				/* git not available */
			}

			// Truncate diff at 100k chars
			const MAX_DIFF = 100_000
			if (diff.length > MAX_DIFF) {
				diff = `${diff.slice(0, MAX_DIFF)}\n\n... [TRUNCATED at 100k chars] ...`
			}

			// Read REVIEW.md and CLAUDE.md if they exist
			let reviewGuidelines = ""
			const cwd = process.cwd()
			for (const name of ["REVIEW.md", "CLAUDE.md"]) {
				const p = join(cwd, name)
				if (existsSync(p)) {
					reviewGuidelines += `\n### ${name}\n${readFileSync(p, "utf8").slice(0, 5000)}\n`
				}
			}

			// Read review_agents from settings
			let reviewAgents = ""
			try {
				const settingsPath = join(findHaikuRoot(), "settings.yml")
				if (existsSync(settingsPath)) {
					const settings = parseYaml(readFileSync(settingsPath, "utf8"))
					const agents = getNestedField(settings, "review_agents")
					if (agents)
						reviewAgents = `\n### Review Agents Config\n\`\`\`json\n${JSON.stringify(agents, null, 2)}\n\`\`\`\n`
				}
			} catch {
				/* no settings */
			}

			let out = "## Pre-Delivery Code Review\n"
			out += `Diff base: ${base}\n\n`
			out += `Changed files:\n\`\`\`\n${changedFiles || "none"}\`\`\`\n\n`
			out += `Diff stats:\n\`\`\`\n${stat || "none"}\`\`\`\n`
			if (reviewGuidelines)
				out += `\n### Review Guidelines\n${reviewGuidelines}\n`
			if (reviewAgents) out += reviewAgents
			out += `\n### Full Diff\n\`\`\`diff\n${diff || "No changes detected."}\n\`\`\`\n`
			out += "\n### Instructions\n"
			out +=
				"1. Spawn review agents in parallel (one per configured agent or area)\n"
			out += "2. Collect findings, deduplicate across agents\n"
			out += "3. Fix all HIGH severity findings before delivery\n"
			out += "4. Report findings summary to the user\n"
			return text(out)
		}

		// ── Backlog ──
		case "haiku_backlog": {
			const backlogInputErr = validateToolInput(
				args,
				validateHaikuBacklogInputSchema,
				"haiku_backlog",
			)
			if (backlogInputErr) return backlogInputErr
			const action = (args.action as string) || "list"
			const md = (markdown: string) => reply({ markdown, action })
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return md("No .haiku directory found.")
			}
			const backlogDir = join(root, "backlog")

			switch (action) {
				case "list": {
					if (!existsSync(backlogDir)) return md("No backlog items found.")
					const files = readdirSync(backlogDir).filter((f) => f.endsWith(".md"))
					if (files.length === 0) return md("No backlog items found.")

					let out =
						"# Backlog\n\n| # | Item | Priority | Created |\n|---|------|----------|---------|\n"
					for (let i = 0; i < files.length; i++) {
						const { data } = parseFrontmatter(
							readFileSync(join(backlogDir, files[i]), "utf8"),
						)
						out += `| ${i + 1} | ${files[i].replace(".md", "")} | ${data.priority || "unset"} | ${data.created_at || "unknown"} |\n`
					}
					return md(out)
				}
				case "add": {
					const desc = (args.description as string) || ""
					let out = "## Add Backlog Item\n\n"
					out +=
						"Create a new file in `.haiku/backlog/` with this template:\n\n"
					out += `\`\`\`markdown\n---\npriority: medium\ncreated_at: ${timestamp()}\n---\n\n`
					out += `${desc || "Description of the backlog item"}\n\`\`\`\n`
					out +=
						"\nFilename should be a slug of the item description (e.g. `improve-error-handling.md`).\n"
					return md(out)
				}
				case "review": {
					if (!existsSync(backlogDir)) return md("No backlog items to review.")
					const files = readdirSync(backlogDir).filter((f) => f.endsWith(".md"))
					if (files.length === 0) return md("No backlog items to review.")

					let out =
						"## Backlog Review\n\nPresent each item to the user and ask: **Keep / Reprioritize / Drop / Promote / Skip**\n\n"
					for (let i = 0; i < files.length; i++) {
						const raw = readFileSync(join(backlogDir, files[i]), "utf8")
						const { data, body } = parseFrontmatter(raw)
						out += `### ${i + 1}. ${files[i].replace(".md", "")}\n`
						out += `- Priority: ${data.priority || "unset"}\n`
						out += `- Created: ${data.created_at || "unknown"}\n`
						out += `${body.slice(0, 300)}\n\n`
					}
					out += "---\nFor each item, ask the user and apply their choice.\n"
					return md(out)
				}
				case "promote": {
					let out = "## Promote Backlog Item\n\n"
					out += "To promote a backlog item to an intent:\n"
					out += "1. Read the backlog item file\n"
					out +=
						"2. Use /haiku:start to create an intent from its description\n"
					out += "3. Delete the backlog file after the intent is created\n"
					return md(out)
				}
				default:
					return md(
						`Unknown backlog action: '${action}'. Valid actions: list, add, review, promote.`,
					)
			}
		}

		// ── Seed ──
		case "haiku_seed": {
			const seedInputErr = validateToolInput(
				args,
				validateHaikuSeedInputSchema,
				"haiku_seed",
			)
			if (seedInputErr) return seedInputErr
			const action = (args.action as string) || "list"
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No .haiku directory found.")
			}
			const seedsDir = join(root, "seeds")

			switch (action) {
				case "list": {
					if (!existsSync(seedsDir)) return text("No seeds found.")
					const files = readdirSync(seedsDir).filter((f) => f.endsWith(".md"))
					if (files.length === 0) return text("No seeds found.")

					// Group by status
					const groups = new Map<
						string,
						Array<{ name: string; data: Record<string, unknown> }>
					>()
					for (const f of files) {
						const { data } = parseFrontmatter(
							readFileSync(join(seedsDir, f), "utf8"),
						)
						const status = (data.status as string) || "planted"
						if (!groups.has(status)) groups.set(status, [])
						groups.get(status)?.push({ name: f.replace(".md", ""), data })
					}

					let out = "# Seeds\n"
					for (const [status, seeds] of groups) {
						out += `\n## ${status.charAt(0).toUpperCase() + status.slice(1)} (${seeds.length})\n\n`
						out +=
							"| Seed | Trigger | Planted |\n|------|---------|----------|\n"
						for (const s of seeds) {
							out += `| ${s.name} | ${s.data.trigger || "none"} | ${s.data.created_at || "unknown"} |\n`
						}
					}
					return text(out)
				}
				case "plant": {
					let out = "## Plant a Seed\n\n"
					out += "Create a new file in `.haiku/seeds/` with this template:\n\n"
					out += `\`\`\`markdown\n---\nstatus: planted\ntrigger: "<condition that should cause this to surface>"\ncreated_at: ${timestamp()}\n---\n\n`
					out += "Description of the idea or future work.\n```\n"
					out +=
						"\nFilename should be a slug of the seed idea (e.g. `add-caching-layer.md`).\n"
					return text(out)
				}
				case "check": {
					if (!existsSync(seedsDir)) return text("No seeds to check.")
					const files = readdirSync(seedsDir).filter((f) => f.endsWith(".md"))
					const planted = files.filter((f) => {
						const { data } = parseFrontmatter(
							readFileSync(join(seedsDir, f), "utf8"),
						)
						return (data.status as string) === "planted"
					})
					if (planted.length === 0) return text("No planted seeds to check.")

					let out =
						"## Seed Check\n\nEvaluate each planted seed's trigger condition against the current project state:\n\n"
					for (const f of planted) {
						const { data, body } = parseFrontmatter(
							readFileSync(join(seedsDir, f), "utf8"),
						)
						out += `### ${f.replace(".md", "")}\n`
						out += `- Trigger: ${data.trigger || "none defined"}\n`
						out += `- Description: ${body.slice(0, 300)}\n\n`
					}
					out +=
						"---\nFor each seed: if the trigger condition is met, update its status to 'surfaced'. If not, leave as 'planted'.\n"
					return text(out)
				}
				default:
					return text(
						`Unknown seed action: '${action}'. Valid actions: list, plant, check.`,
					)
			}
		}

		// ── Release Notes ──
		case "haiku_release_notes": {
			const releaseNotesInputErr = validateToolInput(
				args,
				validateHaikuReleaseNotesInputSchema,
				"haiku_release_notes",
			)
			if (releaseNotesInputErr) return releaseNotesInputErr
			const version = (args.version as string) || ""
			const versionField = version || null
			const md = (markdown: string) =>
				reply({ markdown, version: versionField })
			// Search for CHANGELOG.md — try plugin root first, then walk up from cwd
			let changelogPath = ""
			const pluginRoot = resolvePluginRoot()
			if (pluginRoot) {
				const p = join(pluginRoot, "CHANGELOG.md")
				if (existsSync(p)) changelogPath = p
			}
			if (!changelogPath) {
				let dir = process.cwd()
				for (let i = 0; i < 20; i++) {
					const p = join(dir, "CHANGELOG.md")
					if (existsSync(p)) {
						changelogPath = p
						break
					}
					const parent = join(dir, "..")
					if (parent === dir) break
					dir = parent
				}
			}
			if (!changelogPath) return md("No CHANGELOG.md found.")

			const changelog = readFileSync(changelogPath, "utf8")
			// Split by ## [version] headers
			const versionPattern = /^## \[([^\]]+)\]/gm
			const matches: Array<{ version: string; start: number }> = []
			let match = versionPattern.exec(changelog)
			while (match !== null) {
				matches.push({ version: match[1], start: match.index })
				match = versionPattern.exec(changelog)
			}

			if (matches.length === 0)
				return md("No versioned entries found in CHANGELOG.md.")

			if (version) {
				// Find the specific version
				const idx = matches.findIndex((m) => m.version === version)
				if (idx === -1)
					return md(
						`Version '${version}' not found in CHANGELOG.md. Available: ${matches
							.slice(0, 10)
							.map((m) => m.version)
							.join(", ")}`,
					)
				const endIdx =
					idx + 1 < matches.length ? matches[idx + 1].start : changelog.length
				const section = changelog.slice(matches[idx].start, endIdx).trim()
				return md(
					`# Release Notes\n\n${section}\n\n---\nTotal releases in changelog: ${matches.length}`,
				)
			}

			// Return 5 most recent
			const recent = matches.slice(0, 5)
			let out = "# Recent Release Notes\n"
			for (let i = 0; i < recent.length; i++) {
				const endIdx =
					i + 1 < matches.length ? matches[i + 1].start : changelog.length
				out += `\n${changelog.slice(recent[i].start, endIdx).trim()}\n`
			}
			out += `\n---\nTotal releases in changelog: ${matches.length}\n`
			return md(out)
		}

		case "haiku_repair": {
			const repairInputErr = validateToolInput(
				args,
				validateHaikuRepairInputSchema,
				"haiku_repair",
			)
			if (repairInputErr) return repairInputErr
			// ── Repair: scan intents for metadata issues ──
			//
			// Default behavior in a git repo: scan ALL intent branches sequentially
			// via temporary worktrees, auto-apply safe fixes, push to each branch,
			// and open a PR/MR if the branch was already merged into mainline.
			//
			// Args:
			//   intent        — single intent slug to repair (cwd only, skips multi-branch)
			//   apply         — auto-apply safe fixes (default: true)
			//   skip_branches — force cwd-only mode even in a git repo
			//
			// The MCP applies what it can mechanically; the agent handles judgment calls.
			const repairIntentArg = args.intent as string | undefined
			const repairAutoApply = args.apply !== false // default true
			const repairSkipBranches = args.skip_branches === true
			const md = (markdown: string) => reply({ markdown })

			// First: migrate any worktrees that were created at the wrong
			// path by the pre-fix code (when haiku rooted worktrees at
			// `process.cwd()` instead of the primary repo). Runs regardless
			// of mode — the migration is structural and benefits both
			// single-cwd and multi-branch repair flows.
			const migration = repairAutoApply
				? migrateMisplacedWorktrees()
				: { moved: [], skipped: [], cleanedSkeletons: [] }
			const migrationReport = buildWorktreeMigrationReport(migration)

			// Multi-branch path: in a git repo, no single-intent restriction, branches not skipped.
			// Runs whether or not active haiku/<slug>/main branches exist — the archived pass
			// handles the case where all intents have already been merged and their branches deleted.
			if (isGitRepo() && !repairIntentArg && !repairSkipBranches) {
				try {
					const { summaries, mainline, archivedSummary } =
						repairAllBranches(repairAutoApply)
					if (summaries.length > 0 || archivedSummary) {
						const body = buildMultiBranchReport(
							summaries,
							mainline,
							archivedSummary,
						)
						return md(migrationReport ? `${migrationReport}\n${body}` : body)
					}
					// No active branches AND no archived intents — fall through to cwd repair
				} catch (err) {
					const errMsg = `Multi-branch repair failed: ${err instanceof Error ? err.message : String(err)}`
					return md(migrationReport ? `${migrationReport}\n${errMsg}` : errMsg)
				}
			}

			// Single-cwd path
			try {
				findHaikuRoot()
			} catch {
				return md(
					migrationReport
						? `${migrationReport}\nNo .haiku/ directory found.`
						: "No .haiku/ directory found.",
				)
			}

			let cwdResult: RepairCwdResult
			try {
				cwdResult = repairCwd(undefined, repairIntentArg, repairAutoApply)
			} catch (err) {
				const errMsg = `Repair failed: ${err instanceof Error ? err.message : String(err)}`
				return md(migrationReport ? `${migrationReport}\n${errMsg}` : errMsg)
			}

			if (repairIntentArg && cwdResult.scanned === 0) {
				const notFound = `Intent '${repairIntentArg}' not found.`
				return md(
					migrationReport ? `${migrationReport}\n${notFound}` : notFound,
				)
			}
			if (cwdResult.scanned === 0) {
				return md(
					migrationReport
						? `${migrationReport}\nNo intents found.`
						: "No intents found.",
				)
			}

			const body = buildRepairReport(cwdResult)
			return md(migrationReport ? `${migrationReport}\n${body}` : body)
		}

		// ── Feedback ──
		case "haiku_feedback": {
			// SCHEMA IS THE SSOT — HAIKU_FEEDBACK_INPUT_SCHEMA enforces
			// every static contract this handler used to check by hand:
			// intent / title / body presence, title.length ≤ 120, origin
			// enum, resolution enum, additionalProperties: false. The
			// validator returns a structured `haiku_feedback_input_invalid`
			// reply with field-level error details on failure — same
			// shape every other AJV-gated tool uses.
			const validation = validateToolInput(
				args,
				validateHaikuFeedbackInputSchema,
				"haiku_feedback",
			)
			if (validation) return validation

			const intent = args.intent as string
			const stage = (args.stage as string) || ""
			const title = args.title as string
			const body = args.body as string
			const origin = (args.origin as string) || undefined
			const sourceRef = (args.source_ref as string) || undefined
			const author = (args.author as string) || undefined
			const resolution = (args.resolution as string) || undefined
			// Inline-anchor — gate-validated by HAIKU_FEEDBACK_INPUT_SCHEMA,
			// then translated from the snake_case wire shape to the
			// camelCase `writeFeedbackFile` expects. Agents that omit it
			// produce the legacy "no excerpt" behaviour; agents that pass
			// it get a SPA flash on click.
			const inlineAnchorRaw = args.inline_anchor as
				| {
						selected_text: string
						paragraph: number
						location: string
						comment_id?: string
						file_path?: string
						content_sha?: string
				  }
				| undefined
			const inlineAnchor = inlineAnchorRaw
				? {
						selectedText: inlineAnchorRaw.selected_text,
						paragraph: inlineAnchorRaw.paragraph,
						location: inlineAnchorRaw.location,
						...(inlineAnchorRaw.comment_id
							? { commentId: inlineAnchorRaw.comment_id }
							: {}),
						...(inlineAnchorRaw.file_path
							? { filePath: inlineAnchorRaw.file_path }
							: {}),
						...(inlineAnchorRaw.content_sha
							? { contentSha: inlineAnchorRaw.content_sha }
							: {}),
					}
				: undefined

			// Intent-existence check is dynamic (filesystem state), not
			// expressible in the input schema — keep it here.
			const intentFile = join(intentDir(intent), "intent.md")
			if (!existsSync(intentFile))
				return {
					content: [
						{ type: "text", text: `Error: intent '${intent}' not found` },
					],
					isError: true,
				}

			// Branch enforcement — stage feedback lands on the stage branch;
			// intent-scope feedback (stage omitted) lands on intent-main.
			// `ensureOnStageBranch(slug, "")` already falls back to intent
			// main when the stage arg is falsy, so the same helper covers
			// both cases.
			const feedbackBranchErr = enforceStageBranch(intent, stage || undefined)
			if (feedbackBranchErr) return feedbackBranchErr

			if (stage) {
				const stgDir = stageDir(intent, stage)
				if (!existsSync(stgDir)) {
					const { data: intentData } = parseFrontmatter(
						readFileSync(intentFile, "utf8"),
					)
					const stages = (intentData.stages as string[]) || []
					if (!stages.includes(stage)) {
						return {
							content: [
								{
									type: "text",
									text: `Error: stage '${stage}' not found under intent '${intent}'`,
								},
							],
							isError: true,
						}
					}
					mkdirSync(stgDir, { recursive: true })
				}
			}

			const result = writeFeedbackFile(intent, stage, {
				title,
				body,
				origin,
				author,
				source_ref: sourceRef ?? null,
				resolution: resolution ?? null,
				...(inlineAnchor ? { inlineAnchor } : {}),
			})

			const gitResult = gitCommitState(
				stage
					? `feedback: create ${result.feedback_id} in ${stage}`
					: `feedback: create ${result.feedback_id} (intent-scope)`,
			)
			const response: Record<string, unknown> = {
				feedback_id: result.feedback_id,
				file: result.file,
				status: "pending",
				message: `Feedback ${result.feedback_id} created.`,
			}
			return reply(injectPushWarning(response, gitResult))
		}

		case "haiku_feedback_update": {
			// v4: haiku_feedback_update is removed. The FB FSM no longer
			// has status / resolution / closed_by — closure happens via
			// terminal feedback-assessor advance (`haiku_feedback_advance_hat`),
			// targets.invalidates is set at create time, and forward-only
			// lifecycle leaves nothing else for this tool to mutate.
			return reply(
				{
					error: "feedback_update_removed_in_v4",
					message:
						"haiku_feedback_update is removed in v4. Closure runs through the fix-hat sequence (call haiku_feedback_advance_hat on the terminal hat). targets.invalidates is set at create time via haiku_feedback. To reject without closure, call haiku_feedback_reject.",
				},
				{ isError: true },
			)
		}

		case "haiku_feedback_delete": {
			const fbDeleteInputErr = validateToolInput(
				args,
				validateHaikuFeedbackDeleteInputSchema,
				"haiku_feedback_delete",
			)
			if (fbDeleteInputErr) return fbDeleteInputErr
			const intent = args.intent as string
			const stage = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!feedbackId)
				return {
					content: [{ type: "text", text: "Error: feedback_id is required" }],
					isError: true,
				}

			const feedbackDeleteBranchErr = enforceStageBranch(
				intent,
				stage || undefined,
			)
			if (feedbackDeleteBranchErr) return feedbackDeleteBranchErr

			const deleteResult = deleteFeedbackFile(
				intent,
				stage,
				feedbackId,
				"agent",
			)

			if (!deleteResult.ok) {
				return {
					content: [{ type: "text", text: deleteResult.error }],
					isError: true,
				}
			}

			const deleteGitResult = gitCommitState(
				stage
					? `feedback: delete ${feedbackId} from ${stage}`
					: `feedback: delete ${feedbackId} (intent-scope)`,
			)

			const deleteResponse: Record<string, unknown> = {
				feedback_id: feedbackId,
				deleted: true,
				message: stage
					? `Feedback ${feedbackId} deleted from stage '${stage}'.`
					: `Feedback ${feedbackId} deleted (intent-scope).`,
			}
			return reply(injectPushWarning(deleteResponse, deleteGitResult))
		}

		case "haiku_feedback_move": {
			const fbMoveInputErr = validateToolInput(
				args,
				validateHaikuFeedbackMoveInputSchema,
				"haiku_feedback_move",
			)
			if (fbMoveInputErr) return fbMoveInputErr
			const intent = args.intent as string
			const stage = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			const toStage = (args.to_stage as string) || ""

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!feedbackId)
				return {
					content: [{ type: "text", text: "Error: feedback_id is required" }],
					isError: true,
				}
			if (typeof args.to_stage !== "string")
				return {
					content: [
						{
							type: "text",
							text: 'Error: to_stage is required (use "" for intent-scope)',
						},
					],
					isError: true,
				}

			// Validate intent exists.
			const moveIntentFile = join(intentDir(intent), "intent.md")
			if (!existsSync(moveIntentFile))
				return {
					content: [
						{ type: "text", text: `Error: intent '${intent}' not found` },
					],
					isError: true,
				}

			// Validate target stage exists if non-empty (empty = intent-scope).
			if (toStage) {
				const { data: intentData } = parseFrontmatter(
					readFileSync(moveIntentFile, "utf8"),
				)
				const stages = (intentData.stages as string[]) || []
				if (!stages.includes(toStage)) {
					return {
						content: [
							{
								type: "text",
								text: `Error: to_stage '${toStage}' is not a stage of intent '${intent}'. Valid stages: ${stages.join(", ")}`,
							},
						],
						isError: true,
					}
				}
			}

			// Lifecycle enforcement: closed/rejected FBs are immutable.
			const moveFound = findFeedbackFile(intent, stage, feedbackId)
			if (!moveFound) {
				return {
					content: [
						{
							type: "text",
							text: stage
								? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
								: `Error: feedback '${feedbackId}' not found (intent-scope)`,
						},
					],
					isError: true,
				}
			}
			const moveStatus = (moveFound.data.status as string) || "pending"
			if (moveStatus === "closed" || moveStatus === "rejected") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: moveStatus,
						message: `Cannot move feedback '${feedbackId}' — status is '${moveStatus}'. Per the forward-only lifecycle rule, closed and rejected feedback are terminal.`,
					},
					{ isError: true },
				)
			}

			// Branch enforcement — both source and target paths land in
			// stage-scoped or intent-main branches; keep agent on the
			// right branch for the WRITE side (target).
			const moveBranchErr = enforceStageBranch(intent, toStage || undefined)
			if (moveBranchErr) return moveBranchErr

			const moveResult = moveFeedbackFile(intent, stage, feedbackId, toStage)
			if (!moveResult) {
				return {
					content: [
						{
							type: "text",
							text: stage
								? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
								: `Error: feedback '${feedbackId}' not found (intent-scope)`,
						},
					],
					isError: true,
				}
			}

			const moveCommitMsg = moveResult.moved
				? `feedback: move ${feedbackId} from ${stage || "intent-scope"} to ${toStage || "intent-scope"} (now ${moveResult.feedback_id})`
				: `feedback: triage-confirm ${feedbackId} in ${stage || "intent-scope"}`
			const moveGitResult = gitCommitState(moveCommitMsg)

			const moveResponse: Record<string, unknown> = {
				feedback_id: moveResult.feedback_id,
				file: moveResult.file,
				moved: moveResult.moved,
				triaged_at: moveResult.triaged_at,
				message: moveResult.moved
					? `Feedback moved from ${stage || "intent-scope"} to ${toStage || "intent-scope"} as ${moveResult.feedback_id}.`
					: `Feedback ${feedbackId} placement confirmed.`,
			}
			return reply(injectPushWarning(moveResponse, moveGitResult))
		}

		case "haiku_feedback_reject": {
			const fbRejectInputErr = validateToolInput(
				args,
				validateHaikuFeedbackRejectInputSchema,
				"haiku_feedback_reject",
			)
			if (fbRejectInputErr) return fbRejectInputErr
			const intent = args.intent as string
			const stage = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			const reason = args.reason as string

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!feedbackId)
				return {
					content: [{ type: "text", text: "Error: feedback_id is required" }],
					isError: true,
				}
			if (!reason)
				return {
					content: [
						{
							type: "text",
							text: "Error: reason is required when rejecting feedback",
						},
					],
					isError: true,
				}

			// Enforce branch BEFORE reading the feedback file — if main has
			// drifted ahead, the file may only exist on the stage branch.
			// Reading first would spuriously report "not found". Intent-
			// scope ("") resolves to intent-main via ensureOnStageBranch.
			const feedbackRejectBranchErr = enforceStageBranch(
				intent,
				stage || undefined,
			)
			if (feedbackRejectBranchErr) return feedbackRejectBranchErr

			// Find the feedback file
			const rejectFound = findFeedbackFile(intent, stage, feedbackId)
			if (!rejectFound) {
				return {
					content: [
						{
							type: "text",
							text: stage
								? `Error: feedback '${feedbackId}' not found in stage '${stage}'`
								: `Error: feedback '${feedbackId}' not found (intent-scope)`,
						},
					],
					isError: true,
				}
			}

			// Guard: only works on agent-authored feedback
			if (rejectFound.data.author_type === "human") {
				return {
					content: [
						{
							type: "text",
							text: "Error: agents cannot reject human-authored feedback. Only the user can reject it via the review UI.",
						},
					],
					isError: true,
				}
			}

			// Guard: cannot reject already closed or rejected items
			const currentStatus = rejectFound.data.status as string
			if (currentStatus === "closed" || currentStatus === "rejected") {
				return {
					content: [
						{
							type: "text",
							text: `Error: feedback '${feedbackId}' is already '${currentStatus}' -- cannot reject again`,
						},
					],
					isError: true,
				}
			}

			// Apply rejection: set status to rejected and append reason to body
			const rejectData = { ...rejectFound.data, status: "rejected" }
			const rejectBody = `${rejectFound.body}\n\n---\n\n**Rejection reason:** ${reason}`

			writeFileSync(
				rejectFound.path,
				matter.stringify(`\n${rejectBody}\n`, rejectData),
			)

			// Drift-detection lifecycle hook (unit-09): rejection is a
			// terminal state — clear any open drift-marker linked to this
			// feedback id and update the baseline. Best-effort.
			try {
				clearMarkersForFeedbackSync(intentDir(intent), feedbackId, "rejected", {
					intentSlug: intent,
				})
			} catch (err) {
				emitTelemetry("haiku.drift.clear_marker_failed", {
					intent,
					feedback_id: feedbackId,
					terminal_status: "rejected",
					error: String((err as Error)?.message ?? err),
				})
			}

			const rejectGitResult = gitCommitState(
				stage
					? `feedback: reject ${feedbackId} in ${stage}`
					: `feedback: reject ${feedbackId} (intent-scope)`,
			)

			const rejectResponse: Record<string, unknown> = {
				feedback_id: feedbackId,
				status: "rejected",
				message: `Feedback ${feedbackId} rejected: ${reason}`,
			}
			return reply(injectPushWarning(rejectResponse, rejectGitResult))
		}

		case "haiku_feedback_list": {
			const fbListInputErr = validateToolInput(
				args,
				validateHaikuFeedbackListInputSchema,
				"haiku_feedback_list",
			)
			if (fbListInputErr) return fbListInputErr
			const intent = args.intent as string
			const stageFilt = (args.stage as string) || undefined
			// v4: filter by `closed` (boolean) not `status` (enum). closed_at
			// is the lifecycle witness; status field is gone.
			const closedFilt =
				typeof args.closed === "boolean" ? (args.closed as boolean) : undefined

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}

			// Validate intent exists
			const listIntentFile = join(intentDir(intent), "intent.md")
			if (!existsSync(listIntentFile))
				return {
					content: [
						{
							type: "text",
							text: `Error: intent '${intent}' not found`,
						},
					],
					isError: true,
				}

			// Align branch BEFORE reading feedback files. Without this, when
			// main has drifted ahead of the stage branch (or vice versa), the
			// caller sees a stale/incomplete list. Use the provided stage filter
			// if any, otherwise the active stage.
			const listBranchErr = enforceStageBranch(
				intent,
				stageFilt ?? resolveActiveStage(intent),
			)
			if (listBranchErr) return listBranchErr

			// Determine which stages to list
			let stagesToList: string[]
			if (stageFilt) {
				stagesToList = [stageFilt]
			} else {
				const stagesPath = join(intentDir(intent), "stages")
				if (!existsSync(stagesPath)) {
					stagesToList = []
				} else {
					stagesToList = readdirSync(stagesPath).filter((s) =>
						existsSync(join(stagesPath, s)),
					)
				}
			}

			// v4: derive closed-state from frontmatter. An FB is "closed"
			// when its `closed_at` field is a non-empty string. Pre-v4
			// FBs migrated via the v0→v4 soft-scrub get closed_at
			// synthesized from terminal status; a few legacy fixtures
			// may still carry `status: closed/addressed/rejected`, so
			// honor those as fallback.
			const isClosed = (item: FeedbackItem): boolean => {
				if (typeof item.closed_at === "string" && item.closed_at.length > 0)
					return true
				if (
					item.status === "closed" ||
					item.status === "rejected" ||
					item.status === "addressed"
				)
					return true
				return false
			}

			// Collect feedback items across stages
			const allItems: Array<Record<string, unknown>> = []
			for (const stg of stagesToList) {
				const items = readFeedbackFiles(intent, stg)
				for (const item of items) {
					if (closedFilt !== undefined && isClosed(item) !== closedFilt)
						continue
					const entry: Record<string, unknown> = {
						feedback_id: item.id,
						file: item.file,
						title: item.title,
						status: item.status,
						origin: item.origin,
						author: item.author,
						author_type: item.author_type,
						created_at: item.created_at,
						visit: item.visit,
						source_ref: item.source_ref,
						closed_by: item.closed_by,
						closed_at: item.closed_at,
						bolt: item.bolt,
						triaged_at: item.triaged_at,
					}
					// Include stage field when listing across stages
					if (!stageFilt) {
						entry.stage = stg
					}
					allItems.push(entry)
				}
			}

			// Include intent-scope feedback when no stage filter was
			// provided (studio-level review findings live there).
			if (!stageFilt) {
				const intentItems = readFeedbackFiles(intent, "")
				for (const item of intentItems) {
					if (closedFilt !== undefined && isClosed(item) !== closedFilt)
						continue
					allItems.push({
						feedback_id: item.id,
						file: item.file,
						title: item.title,
						status: item.status,
						origin: item.origin,
						author: item.author,
						author_type: item.author_type,
						created_at: item.created_at,
						visit: item.visit,
						source_ref: item.source_ref,
						closed_by: item.closed_by,
						closed_at: item.closed_at,
						bolt: item.bolt,
						triaged_at: item.triaged_at,
						stage: null,
					})
				}
			}

			const listResponse: Record<string, unknown> = {
				intent,
				stage: stageFilt || null,
				count: allItems.length,
				items: allItems,
			}
			return reply(listResponse)
		}

		// ── Feedback body-only read (architecture rule §1.1: no FM exposed) ──
		case "haiku_feedback_read": {
			const fbReadInputErr = validateToolInput(
				args,
				validateHaikuFeedbackReadInputSchema,
				"haiku_feedback_read",
			)
			if (fbReadInputErr) return fbReadInputErr
			const intentArg = args.intent as string
			const stageArg = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			if (!intentArg || !feedbackId) {
				return reply(
					{
						error: "missing_args",
						message: "intent and feedback_id are required.",
					},
					{ isError: true },
				)
			}
			// Locate the FB file. Stage-scope FBs live in stages/<stage>/feedback/;
			// intent-scope FBs (from the intent-completion review) live in
			// intents/<slug>/feedback/. The on-disk filename has a numeric
			// prefix + slug, so we resolve by reading the directory and
			// matching the FB id from frontmatter.
			const dir = stageArg
				? feedbackDir(intentArg, stageArg)
				: feedbackDir(intentArg, "")
			if (!existsSync(dir)) {
				return reply(
					{
						error: "feedback_not_found",
						intent: intentArg,
						stage: stageArg || null,
						feedback_id: feedbackId,
						message: `No feedback directory at ${dir}.`,
					},
					{ isError: true },
				)
			}
			let foundPath: string | null = null
			let foundData: Record<string, unknown> | null = null
			let foundBody: string | null = null
			// Derive numeric part from feedbackId: "FB-01" → 1, "FB-1" → 1, "1" → 1
			const fbNumMatch = feedbackId.match(/^(?:FB-)?(\d+)$/i)
			const fbNum = fbNumMatch ? Number.parseInt(fbNumMatch[1], 10) : null
			for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
				const p = join(dir, f)
				const { data, body } = parseFrontmatter(readFileSync(p, "utf8"))
				// Match by frontmatter id/feedback_id field (future files),
				// OR by filename numeric prefix (files created by createFeedback which
				// does not embed an id field in frontmatter).
				const fileNumMatch = f.match(/^(\d+)-/)
				const fileNum = fileNumMatch
					? Number.parseInt(fileNumMatch[1], 10)
					: null
				if (
					(data.id as string) === feedbackId ||
					(data.feedback_id as string) === feedbackId ||
					(fbNum !== null && fileNum === fbNum)
				) {
					foundPath = p
					foundData = data
					foundBody = body
					break
				}
			}
			if (!foundPath || !foundBody) {
				return reply(
					{
						error: "feedback_not_found",
						intent: intentArg,
						stage: stageArg || null,
						feedback_id: feedbackId,
						message: `No feedback file matching ${feedbackId} in ${dir}.`,
					},
					{ isError: true },
				)
			}
			const fmTitle =
				typeof foundData?.title === "string" ? (foundData.title as string) : ""
			const h1Match = foundBody.match(/^#\s+(.+)$/m)
			const title = fmTitle || (h1Match ? h1Match[1].trim() : feedbackId)
			return reply({ title, body: foundBody })
		}

		// ── Feedback body write (architecture FB-as-unit, lifecycle-bound) ──
		case "haiku_feedback_write": {
			const fbWriteInputErr = validateToolInput(
				args,
				validateHaikuFeedbackWriteInputSchema,
				"haiku_feedback_write",
			)
			if (fbWriteInputErr) return fbWriteInputErr
			const intentArg = args.intent as string
			const stageArg = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			const rawBody = (args.body as string) ?? ""

			// V-10 server-side sanitization. The fixer-hat path lands here
			// when an agent edits an FB body during the fix loop; sanitize
			// at the same chokepoint as writeFeedbackFile / appendFeedbackReply
			// so a hostile agent cannot plant XSS in the persisted FB.
			const newBody = sanitizeFeedbackBody(rawBody)

			if (!intentArg || !feedbackId) {
				return reply(
					{
						error: "missing_args",
						message: "intent and feedback_id are required.",
					},
					{ isError: true },
				)
			}
			if (!newBody || newBody.trim().length === 0) {
				return reply(
					{
						error: "empty_body",
						message:
							"body is required and must be substantive. Empty FB bodies cannot pass the assessor's spec-match check.",
					},
					{ isError: true },
				)
			}

			const fbWriteBranchErr = enforceStageBranch(
				intentArg,
				stageArg || undefined,
			)
			if (fbWriteBranchErr) return fbWriteBranchErr

			// Locate the FB file by id via the canonical resolver (numeric-
			// prefix matching against the file's `NN-slug.md` name).
			const found = findFeedbackFile(intentArg, stageArg, feedbackId)
			if (!found) {
				const dir = stageArg
					? feedbackDir(intentArg, stageArg)
					: feedbackDir(intentArg, "")
				return reply(
					{
						error: "feedback_not_found",
						intent: intentArg,
						stage: stageArg || null,
						feedback_id: feedbackId,
						message: `No feedback file matching ${feedbackId} in ${dir}.`,
					},
					{ isError: true },
				)
			}
			const foundPath = found.path
			const foundFm = found.data

			// Lifecycle enforcement: closed/rejected FBs are terminal and
			// immutable. Pending and addressed (under-fix) accept body
			// rewrites — the fixer hat populates the FB body with diagnosis.
			const status = (foundFm.status as string) || "pending"
			if (status === "closed" || status === "rejected") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: status,
						message: `Cannot rewrite feedback '${feedbackId}' — status is '${status}'. Per the forward-only lifecycle rule, closed and rejected feedback are terminal and immutable. To raise a related concern, file a NEW feedback via haiku_feedback.`,
					},
					{ isError: true },
				)
			}

			// Persist body, preserve FM unchanged.
			writeFileSync(
				foundPath,
				matter.stringify(`${newBody.trimEnd()}\n`, foundFm),
			)
			sealIntentState(intentArg)
			emitTelemetry("haiku.feedback.body_rewritten", {
				intent: intentArg,
				stage: stageArg || "",
				feedback_id: feedbackId,
			})
			return reply({
				ok: true,
				feedback_id: feedbackId,
				stage: stageArg || null,
				intent: intentArg,
				message: `Rewrote body of feedback '${feedbackId}' (status preserved as '${status}').`,
			})
		}

		// ── Feedback advance/reject hat (FB-as-unit model, architecture §5) ──
		// These mirror haiku_unit_advance_hat / haiku_unit_reject_hat but for
		// FB files. Each fixer hat populates the FB body via haiku_feedback_write
		// and then calls advance to progress through the stage's fix_hats:
		// sequence. When the last hat advances, the workflow engine auto-closes the FB.
		case "haiku_feedback_advance_hat": {
			const fbAdvanceHatInputErr = validateToolInput(
				args,
				validateHaikuFeedbackAdvanceHatInputSchema,
				"haiku_feedback_advance_hat",
			)
			if (fbAdvanceHatInputErr) return fbAdvanceHatInputErr
			const intentArg = args.intent as string
			const stageArg = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			if (!intentArg || !feedbackId) {
				return reply(
					{
						error: "missing_args",
						message: "intent and feedback_id are required.",
					},
					{ isError: true },
				)
			}

			const fbBranchErr = enforceStageBranch(intentArg, stageArg || undefined)
			if (fbBranchErr) return fbBranchErr

			// Locate FB file by id via the canonical resolver.
			const advFound = findFeedbackFile(intentArg, stageArg, feedbackId)
			if (!advFound) {
				const fbAdvDir = stageArg
					? feedbackDir(intentArg, stageArg)
					: feedbackDir(intentArg, "")
				return reply(
					{
						error: "feedback_not_found",
						intent: intentArg,
						stage: stageArg || null,
						feedback_id: feedbackId,
						message: `No feedback file matching ${feedbackId} in ${fbAdvDir}.`,
					},
					{ isError: true },
				)
			}
			const advPath = advFound.path
			const advFm = advFound.data
			const advBody = advFound.body

			// Lifecycle: don't advance terminal FBs.
			const advStatus = (advFm.status as string) || "pending"
			if (advStatus === "closed" || advStatus === "rejected") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: advStatus,
						message: `Cannot advance hat on FB '${feedbackId}' — already ${advStatus} (terminal).`,
					},
					{ isError: true },
				)
			}

			// Resolve fix_hats sequence. Stage-scoped: from STAGE.md.
			// Intent-scoped: from the studio's `fix-hats/` directory (mirrors
			// how the orchestrator's intent_completion_fix dispatch resolves
			// the chain — Object.keys(readStudioFixHatPaths(studio)) order).
			let fixHats: string[] = []
			const intentFmPath = join(intentDir(intentArg), "intent.md")
			let studioName = "software"
			if (existsSync(intentFmPath)) {
				const { data: intentFm } = parseFrontmatter(
					readFileSync(intentFmPath, "utf8"),
				)
				studioName = (intentFm.studio as string) || "software"
			}
			if (stageArg) {
				const sd = readStageDef(studioName, stageArg)
				if (sd?.data?.fix_hats && Array.isArray(sd.data.fix_hats)) {
					fixHats = sd.data.fix_hats as string[]
				}
			} else {
				// Intent-scope FB — use studio-level fix-hats.
				const studioFixHatPaths = readStudioFixHatPaths(studioName)
				fixHats = Object.keys(studioFixHatPaths)
			}
			if (fixHats.length === 0) {
				return reply(
					{
						error: "no_fix_hats",
						stage: stageArg || null,
						scope: stageArg ? "stage" : "intent",
						message: stageArg
							? `Stage '${stageArg}' has no \`fix_hats:\` configured in STAGE.md. The fix-loop FB-as-unit model requires a fix_hats sequence.`
							: `Studio '${studioName}' has no fix-hats in \`plugin/studios/${studioName}/fix-hats/\`. Intent-completion fix loops require at least one studio-level fix-hat.`,
					},
					{ isError: true },
				)
			}

			// Determine the CALLING hat — the hat that just finished its work
			// and is calling advance now. The `hat` field on disk represents
			// the hat that LAST advanced (i.e. the prior caller's hat); the
			// caller's hat is the one immediately after it in the fix_hats
			// chain. On the very first call, the caller is fixHats[0].
			//
			// Earlier this handler indexed `isLast` against the stored hat
			// (the prior finisher), which made 2-hat sequences fail to close
			// on the assessor's call: stored=fixer (idx 0), curIdx=0,
			// curIdx === fixHats.length-1 → false for length=2. The fix:
			// index `isLast` against the CALLING hat's position.
			const curHat = (advFm.hat as string) || ""
			const curBolt = (advFm.bolt as number) || 1
			const curIdx = curHat ? fixHats.indexOf(curHat) : -1
			const callingIdx = curIdx + 1
			const callingHat = fixHats[callingIdx]
			if (!callingHat) {
				// curIdx pointed at the last hat already — the FB should have
				// closed on the prior advance. This is a defensive guard for
				// a state that shouldn't be reachable under correct dispatch.
				return reply(
					{
						error: "no_hat_to_advance",
						message: `FB '${feedbackId}' is at hat '${curHat}', already the last hat in fix_hats. The FB should have closed on the prior advance call. State may be inconsistent.`,
					},
					{ isError: true },
				)
			}
			const isLast = callingIdx === fixHats.length - 1

			// Reply-on-closure: when this advance closes the FB, require a
			// short human-readable explanation of what was done. The reply
			// surfaces in the SPA so the requester (often the user who
			// filed the FB) can see HOW the issue was addressed, not just
			// that it was. Mid-chain advances don't need a reply — the
			// terminal hat is the one that owns the user-facing message.
			const replyArg =
				typeof args.reply === "string" ? (args.reply as string).trim() : ""
			if (isLast && !replyArg) {
				return reply(
					{
						error: "reply_required",
						feedback_id: feedbackId,
						calling_hat: callingHat,
						message: `FB '${feedbackId}' is about to close on terminal hat '${callingHat}'. Pass a \`reply\` arg with a short plain-language explanation of what was done so the requester can see how the issue was addressed.`,
					},
					{ isError: true },
				)
			}

			// Append iteration record for the just-completed (calling) hat.
			const iterations = Array.isArray(advFm.iterations)
				? (advFm.iterations as Array<Record<string, unknown>>).slice()
				: []
			iterations.push({
				bolt: curBolt,
				hat: callingHat,
				completed_at: timestamp(),
				result: isLast ? "closed" : "advanced",
			})

			let newStatus = advStatus
			let closedBy: string | undefined
			if (isLast) {
				newStatus = "closed"
				closedBy = `fix-loop:${feedbackId}:bolt-${curBolt}`
			} else {
				newStatus = "addressed"
			}
			// Always store the calling hat in the FM `hat` field so the next
			// advance can correctly compute "the next caller is at storage+1".
			const nextHat = callingHat

			const newFm: Record<string, unknown> = {
				...advFm,
				hat: nextHat,
				iterations,
				status: newStatus,
			}
			if (closedBy) newFm.closed_by = closedBy
			if (isLast && replyArg) {
				// closure_reply is the user-facing record of what changed.
				// closure_reply_unread starts true; the SPA flips it to false
				// when the reviewer dismisses the reply (so unread-replies
				// can be filtered just like pending FBs).
				newFm.closure_reply = { text: replyArg, at: timestamp() }
				newFm.closure_reply_unread = true
			}
			writeFileSync(advPath, matter.stringify(`${advBody.trimEnd()}\n`, newFm))
			sealIntentState(intentArg)

			// Drift-detection lifecycle hook (unit-09): when the fix-loop
			// terminal hat auto-closes the FB, walk drift-markers.json for
			// any open marker linked to this feedback id and clear each.
			// Best-effort: failures are surfaced via telemetry but do not
			// block the advance.
			if (isLast) {
				try {
					clearMarkersForFeedbackSync(
						intentDir(intentArg),
						feedbackId,
						"closed",
						{
							intentSlug: intentArg,
						},
					)
				} catch (err) {
					emitTelemetry("haiku.drift.clear_marker_failed", {
						intent: intentArg,
						feedback_id: feedbackId,
						terminal_status: "closed",
						error: String((err as Error)?.message ?? err),
					})
				}
			}

			emitTelemetry(
				isLast ? "haiku.feedback.closed" : "haiku.feedback.hat_advanced",
				{
					intent: intentArg,
					stage: stageArg || "",
					feedback_id: feedbackId,
					hat: nextHat,
				},
			)
			const nextDispatchedHat = isLast ? null : fixHats[callingIdx + 1]

			// Return the next-hat dispatch block from the sidecar file the
			// dispatch builder wrote at fix-loop entry. The block is keyed by
			// the CALLING hat (the one whose advance triggered this code
			// path), so we look up the sidecar for callingHat's slug.
			//
			// Why a sidecar instead of building inline: the dispatch builder
			// already resolves agent_type, model, parent-instruction, and
			// heading — duplicating that here risks drift. Sidecar = single
			// source of truth.
			//
			// Why this closes #272 review issue 3: an agent that calls
			// `haiku_feedback_reject` instead of advance_hat never reaches
			// this code path, never reads the sidecar, never receives the
			// `next_subagent_dispatch_block` field — so there is no relay
			// block in their context they could mistakenly emit. Mechanics,
			// not LLM compliance.
			let nextSubagentDispatchBlock: string | null = null
			if (!isLast && nextDispatchedHat) {
				const sidecarUnit = stageArg
					? `fix-${feedbackId}`
					: `intent-fix-${feedbackId}`
				try {
					const sidecar = nextRelayPath({
						unit: sidecarUnit,
						hat: callingHat,
						bolt: curBolt,
					})
					if (existsSync(sidecar)) {
						nextSubagentDispatchBlock = readFileSync(sidecar, "utf8")
					}
				} catch {
					/* Best-effort. If the sidecar is missing or unreadable, the
					   agent's prompt tells them to fall back to haiku_run_next. */
				}
			}

			return reply({
				ok: true,
				feedback_id: feedbackId,
				stage: stageArg || null,
				calling_hat: callingHat,
				next_dispatched_hat: nextDispatchedHat,
				next_subagent_dispatch_block: nextSubagentDispatchBlock,
				closed: isLast,
				bolt: curBolt,
				message: isLast
					? `FB '${feedbackId}' closed by ${closedBy} after '${callingHat}' (last hat in fix_hats sequence ${callingIdx + 1}/${fixHats.length}).`
					: `FB '${feedbackId}': '${callingHat}' (${callingIdx + 1}/${fixHats.length}) finished; next hat to dispatch is '${nextDispatchedHat}'. The next-hat dispatch block is in the \`next_subagent_dispatch_block\` field of this response — relay it verbatim to your parent.`,
			})
		}

		case "haiku_feedback_reject_hat": {
			const fbRejectHatInputErr = validateToolInput(
				args,
				validateHaikuFeedbackRejectHatInputSchema,
				"haiku_feedback_reject_hat",
			)
			if (fbRejectHatInputErr) return fbRejectHatInputErr
			const intentArg = args.intent as string
			const stageArg = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			const reason = (args.reason as string) || ""
			if (!intentArg || !feedbackId) {
				return reply(
					{
						error: "missing_args",
						message: "intent and feedback_id are required.",
					},
					{ isError: true },
				)
			}

			const rejBranchErr = enforceStageBranch(intentArg, stageArg || undefined)
			if (rejBranchErr) return rejBranchErr

			const rejFound = findFeedbackFile(intentArg, stageArg, feedbackId)
			if (!rejFound) {
				const fbRejDir = stageArg
					? feedbackDir(intentArg, stageArg)
					: feedbackDir(intentArg, "")
				return reply(
					{
						error: "feedback_not_found",
						feedback_id: feedbackId,
						message: `No feedback file matching ${feedbackId} in ${fbRejDir}.`,
					},
					{ isError: true },
				)
			}
			const rejPath = rejFound.path
			const rejFm = rejFound.data
			const rejBody = rejFound.body

			const rejStatus = (rejFm.status as string) || "pending"
			if (rejStatus === "closed" || rejStatus === "rejected") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: rejStatus,
						message: `Cannot reject hat on FB '${feedbackId}' — already ${rejStatus} (terminal).`,
					},
					{ isError: true },
				)
			}

			// Resolve fix_hats to find prior hat. Stage-scoped: from STAGE.md.
			// Intent-scoped: from the studio's `fix-hats/` directory.
			let fixHatsRej: string[] = []
			const intentFmPath = join(intentDir(intentArg), "intent.md")
			let studioNameRej = "software"
			if (existsSync(intentFmPath)) {
				const { data: intentFm } = parseFrontmatter(
					readFileSync(intentFmPath, "utf8"),
				)
				studioNameRej = (intentFm.studio as string) || "software"
			}
			if (stageArg) {
				const sd = readStageDef(studioNameRej, stageArg)
				if (sd?.data?.fix_hats && Array.isArray(sd.data.fix_hats)) {
					fixHatsRej = sd.data.fix_hats as string[]
				}
			} else {
				const studioFixHatPaths = readStudioFixHatPaths(studioNameRej)
				fixHatsRej = Object.keys(studioFixHatPaths)
			}
			if (fixHatsRej.length === 0) {
				return reply(
					{
						error: "no_fix_hats",
						stage: stageArg || null,
						scope: stageArg ? "stage" : "intent",
						message: stageArg
							? `Stage '${stageArg}' has no \`fix_hats:\` configured.`
							: `Studio '${studioNameRej}' has no fix-hats in \`plugin/studios/${studioNameRej}/fix-hats/\`.`,
					},
					{ isError: true },
				)
			}

			// Mirror the corrected advance_hat semantic (storage `hat` field
			// = the hat that LAST called advance/reject; the CALLING hat is
			// at storage_idx + 1 in the fix_hats chain). The earlier
			// implementation indexed against the storage hat, which under
			// the corrected advance semantic would re-dispatch the WRONG
			// hat (asking the calling hat to retry instead of sending work
			// back to the prior hat to redo).
			const curHatRej = (rejFm.hat as string) || ""
			const curBoltRej = (rejFm.bolt as number) || 1
			const curIdxRej = curHatRej ? fixHatsRej.indexOf(curHatRej) : -1
			const callingIdxRej = curIdxRej + 1
			const callingHatRej = fixHatsRej[callingIdxRej]
			if (!callingHatRej) {
				return reply(
					{
						error: "no_hat_to_reject",
						message: `FB '${feedbackId}' has no hat to reject — already past the last hat in fix_hats (storage at '${curHatRej}').`,
					},
					{ isError: true },
				)
			}

			// Compute the new storage so the next dispatch picks the prior
			// hat (the one whose work the calling hat is rejecting). If the
			// calling hat IS the first hat in the chain, no prior hat exists
			// — bump bolt and let the same hat retry (storage stays empty).
			const newStoredIdxRej = callingIdxRej - 2
			const newStoredHatRej =
				newStoredIdxRej >= 0 ? fixHatsRej[newStoredIdxRej] : ""
			const nextDispatchedHatRej =
				callingIdxRej > 0 ? fixHatsRej[callingIdxRej - 1] : callingHatRej

			// Append rejection iteration record (the calling hat's work was
			// rejected) and bump bolt.
			const iterations = Array.isArray(rejFm.iterations)
				? (rejFm.iterations as Array<Record<string, unknown>>).slice()
				: []
			iterations.push({
				bolt: curBoltRej,
				hat: callingHatRej,
				completed_at: timestamp(),
				result: "rejected",
				reason: reason || "(no reason provided)",
			})

			// Auto-escalate model tier on rejection — mirrors the unit
			// reject_hat path so feedback fix loops inherit the same
			// recovery: when sonnet's first attempt at a fix is rejected,
			// the next bolt redispatches at opus. The FB-level `model:`
			// field is at the top of the start_feedback_hat cascade
			// (feedback > hat > stage > studio), so writing it here
			// guarantees the next dispatch reads the escalated value.
			let escalatedFromTier: string | undefined
			let escalatedToTier: string | undefined
			if (features.modelSelection) {
				const currentModel = rejFm.model as string | undefined
				const next = escalate(currentModel)
				if (currentModel && next) {
					escalatedFromTier = currentModel
					escalatedToTier = next
				}
			}

			const newFm: Record<string, unknown> = {
				...rejFm,
				hat: newStoredHatRej,
				bolt: curBoltRej + 1,
				iterations,
				...(escalatedToTier
					? {
							model: escalatedToTier,
							model_original:
								(rejFm.model_original as string | undefined) ??
								escalatedFromTier,
						}
					: {}),
			}
			writeFileSync(rejPath, matter.stringify(`${rejBody.trimEnd()}\n`, newFm))
			if (escalatedFromTier && escalatedToTier) {
				console.error(
					`[haiku] feedback model escalated: ${escalatedFromTier} → ${escalatedToTier} (FB ${feedbackId} hat rejected, bolt ${curBoltRej + 1})`,
				)
			}
			sealIntentState(intentArg)
			emitTelemetry("haiku.feedback.hat_rejected", {
				intent: intentArg,
				stage: stageArg || "",
				feedback_id: feedbackId,
				hat: callingHatRej,
				new_bolt: String(curBoltRej + 1),
				...(escalatedToTier
					? {
							model_escalated_from: escalatedFromTier,
							model_escalated_to: escalatedToTier,
						}
					: {}),
			})
			return reply({
				ok: true,
				feedback_id: feedbackId,
				rejecting_hat: callingHatRej,
				next_dispatched_hat: nextDispatchedHatRej,
				new_bolt: curBoltRej + 1,
				reason,
				message:
					callingIdxRej > 0
						? `FB '${feedbackId}' hat '${callingHatRej}' rejected — sending back to '${nextDispatchedHatRej}', bolt incremented to ${curBoltRej + 1}.`
						: `FB '${feedbackId}' first hat '${callingHatRej}' rejected — no prior hat to send back to; same hat will retry, bolt incremented to ${curBoltRej + 1}.`,
			})
		}

		case "haiku_feedback_set_targets": {
			const setTargetsInputErr = validateToolInput(
				args,
				validateHaikuFeedbackSetTargetsInputSchema,
				"haiku_feedback_set_targets",
			)
			if (setTargetsInputErr) return setTargetsInputErr
			const intentArg = args.intent as string
			const stageArg = (args.stage as string) || ""
			const feedbackId = formatFeedbackId(args.feedback_id as number)
			const targetUnit =
				args.target_unit === null || args.target_unit === undefined
					? null
					: (args.target_unit as string)
			const targetInvalidates = (args.target_invalidates as string[]) ?? []
			const reasoning =
				typeof args.reasoning === "string"
					? (args.reasoning as string).trim()
					: ""

			const stBranchErr = enforceStageBranch(intentArg, stageArg || undefined)
			if (stBranchErr) return stBranchErr

			const stFound = findFeedbackFile(intentArg, stageArg, feedbackId)
			if (!stFound) {
				return reply(
					{
						error: "feedback_not_found",
						feedback_id: feedbackId,
						message: stageArg
							? `Feedback '${feedbackId}' not found in stage '${stageArg}'.`
							: `Feedback '${feedbackId}' not found (intent-scope).`,
					},
					{ isError: true },
				)
			}

			// Refuse to overwrite already-classified targets.
			// Architecture invariant: once a target is set, the FB belongs
			// there. Retargeting requires reject + recreate (preserves
			// audit trail; stops silent re-routing).
			const existingTargets =
				stFound.data.targets && typeof stFound.data.targets === "object"
					? (stFound.data.targets as Record<string, unknown>)
					: null
			const existingUnit =
				existingTargets &&
				typeof existingTargets.unit !== "undefined" &&
				existingTargets.unit !== null
					? (existingTargets.unit as string)
					: null
			const existingInvalidates =
				existingTargets && Array.isArray(existingTargets.invalidates)
					? (existingTargets.invalidates as string[])
					: []
			if (existingUnit !== null || existingInvalidates.length > 0) {
				return reply(
					{
						error: "targets_already_set",
						feedback_id: feedbackId,
						current_target_unit: existingUnit,
						current_target_invalidates: existingInvalidates,
						message: `Feedback '${feedbackId}' already has classified targets — once set, immutable per the FB-as-unit architecture. To retarget, reject the FB (haiku_feedback_reject) and create a new one with the correct targets.`,
					},
					{ isError: true },
				)
			}

			// Lifecycle guard: don't classify terminal FBs.
			const stStatus = (stFound.data.status as string) || "pending"
			if (stStatus === "closed" || stStatus === "rejected") {
				return reply(
					{
						error: "lifecycle_violation",
						current_status: stStatus,
						message: `Cannot classify FB '${feedbackId}' — already ${stStatus} (terminal).`,
					},
					{ isError: true },
				)
			}

			const targets: Record<string, unknown> = {
				unit: targetUnit,
				invalidates: targetInvalidates,
			}
			if (reasoning) targets.reasoning = reasoning
			const newData = {
				...stFound.data,
				targets,
			}
			writeFileSync(
				stFound.path,
				matter.stringify(`\n${stFound.body}\n`, newData),
			)
			sealIntentState(intentArg)

			return reply({
				ok: true,
				feedback_id: feedbackId,
				target_unit: targetUnit,
				target_invalidates: targetInvalidates,
				reasoning: reasoning || null,
				message: `Feedback '${feedbackId}' classified: target_unit=${targetUnit ?? "null (intent-scope)"}, invalidates=[${targetInvalidates.join(", ")}]${reasoning ? ` — ${reasoning}` : ""}.`,
			})
		}

		case "haiku_version_info": {
			const versionInfoInputErr = validateToolInput(
				args,
				validateHaikuEmptyInputSchema,
				"haiku_version_info",
			)
			if (versionInfoInputErr) return versionInfoInputErr
			const info: Record<string, string> = {
				mcp_version: MCP_VERSION,
				plugin_version: getPluginVersion(),
			}
			return reply(info)
		}

		default:
			return text(`Unknown tool: ${name}`)
	}
}
