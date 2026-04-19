// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execFileSync, execSync, spawnSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { getPendingVersion, hasPendingUpdate } from "./auto-update.js"
import { features, resolvePluginRoot } from "./config.js"
import { UNIT_FIELDS } from "./fsm-fields.js"
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
import { getCapabilities } from "./harness.js"
import { escalate } from "./model-selection.js"
import {
	resultPathFor,
	setSessionId,
	writeResultFile,
} from "./subagent-prompt-file.js"
import { logSessionEvent, writeHaikuMetadata } from "./session-metadata.js"
import { sealIntentState } from "./state-integrity.js"
import {
	listStudios,
	readOperationDefs,
	readReflectionDefs,
	readStageArtifactDefs,
	resolveStudio,
} from "./studio-reader.js"
import { emitTelemetry } from "./telemetry.js"
import { MCP_VERSION, getPluginVersion } from "./version.js"

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

	const raw = readFileSync(intentPath, "utf8")
	const parsed = matter(raw)
	const data = parsed.data
	const body = parsed.content
	let changed = false
	const applied: AppliedFix[] = []
	const remaining: RepairIssue[] = []

	for (const issue of issues) {
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
			// biome-ignore lint/performance/noDelete: gray-matter YAML serializer crashes on undefined values (#194)
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
				if (!unitEntry.isFile() || !unitEntry.name.endsWith(".md")) continue
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
			!m ||
			!issue.message.includes("Unit has no `inputs:`") ||
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

	// Third pass: fix stage-level state.json issues (completion synthesis)
	const stageRemaining: RepairIssue[] = []
	for (const issue of inputsRemaining) {
		let fixedHere = false

		// Synthesize or update stage completion records for stages before active_stage
		if (
			issue.field.match(/^stages\/[^/]+\/state\.json$/) &&
			issue.message.includes("before active_stage")
		) {
			const stageMatch = issue.field.match(/^stages\/([^/]+)\/state\.json$/)
			if (stageMatch) {
				const stageName = stageMatch[1]
				const stageDir = join(intentRoot, slug, "stages", stageName)
				const stateFile = join(stageDir, "state.json")
				mkdirSync(stageDir, { recursive: true })

				const now = new Date().toISOString()
				const completedState: Record<string, unknown> = {
					stage: stageName,
					status: "completed",
					phase: "gate",
					started_at: data.started_at || data.created_at || now,
					completed_at:
						data.completed_at || data.started_at || data.created_at || now,
					gate_entered_at: null,
					gate_outcome: "advanced",
				}
				writeJson(stateFile, completedState)
				applied.push({
					intent: slug,
					field: issue.field,
					description: `Synthesized completion record for stage '${stageName}' (before active_stage)`,
				})
				fixedHere = true
			}
		}

		if (!fixedHere) stageRemaining.push(issue)
	}

	return { applied, remaining: stageRemaining }
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
			fix: "Set `mode` to 'continuous' or 'discrete'",
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
	if (!repairData.created && !repairData.created_at) {
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

	// l. Stage state consistency
	if (Array.isArray(repairStages) && repairStages.length > 0) {
		const repairStagesDir = join(intentsDir, slug, "stages")
		const repairActiveStage = repairData.active_stage as string | undefined
		const validStatuses = ["pending", "active", "completed"]
		for (const stageName of repairStages as string[]) {
			const repairStageDir = join(repairStagesDir, stageName)
			const repairStateFile = join(repairStageDir, "state.json")
			const activeIdx = repairActiveStage
				? (repairStages as string[]).indexOf(repairActiveStage)
				: -1
			const thisIdx = (repairStages as string[]).indexOf(stageName)
			const isBeforeActive = activeIdx > 0 && thisIdx < activeIdx

			if (existsSync(repairStateFile)) {
				const state = readJson(repairStateFile)
				if (state.status && !validStatuses.includes(state.status as string)) {
					issues.push({
						intent: slug,
						field: `stages/${stageName}/state.json`,
						severity: "error",
						message: `Invalid stage status: '${state.status}'`,
						fix: `Set status to one of: ${validStatuses.join(", ")}`,
					})
				} else if (isBeforeActive && (state.status as string) !== "completed") {
					// Stage before active_stage should be completed — FSM will
					// reset active_stage backwards if it isn't
					issues.push({
						intent: slug,
						field: `stages/${stageName}/state.json`,
						severity: "warning",
						message: `Stage before active_stage has status '${state.status || "pending"}' — should be 'completed'`,
						fix: `Update state.json to status: "completed" (stage is before active_stage '${repairActiveStage}')`,
					})
				}
			} else if (isBeforeActive) {
				// Missing state.json for a stage before active_stage — synthesize
				// a completion record so the FSM doesn't reset backwards
				issues.push({
					intent: slug,
					field: `stages/${stageName}/state.json`,
					severity: "warning",
					message:
						"Missing state.json for stage before active_stage — FSM will reset backwards",
					fix: `Create state.json with status: "completed" (stage is before active_stage '${repairActiveStage}')`,
				})
			}
		}
	}

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
				if (!f.isFile() || !f.name.endsWith(".md")) continue
				if (!REPAIR_UNIT_PATTERN.test(f.name)) {
					issues.push({
						intent: slug,
						field: `stages/${stageName}/units/${f.name}`,
						severity: "warning",
						message: `Unit filename doesn't match expected pattern`,
						fix: "Rename to match pattern: unit-NN-slug-name.md",
					})
				}
				const unitRaw = readFileSync(join(repairUnitsDir, f.name), "utf8")
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
				}
			} catch (err) {
				// Consolidation failed — record so it appears in the repair report
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

/** Cached flag: are we in a git repository? Detected once at startup. */
let _isGitRepo: boolean | null = null

export function isGitRepo(): boolean {
	if (_isGitRepo !== null) return _isGitRepo
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], {
			encoding: "utf8",
			stdio: "pipe",
		})
		_isGitRepo = true
	} catch {
		_isGitRepo = false
	}
	return _isGitRepo
}

// ── Inline quality gates (for hookless harnesses) ─────────────────────────
//
// Mirrors the quality-gate Stop hook logic but runs inside haiku_unit_advance_hat.
// Returns an error object if any gate fails, or null if all pass.

function runInlineQualityGates(
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

		// Per-gate timeout defaults to 30s; override via HAIKU_GATE_TIMEOUT_MS.
		const gateTimeoutMs =
			Number.parseInt(process.env.HAIKU_GATE_TIMEOUT_MS ?? "", 10) || 30000
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

export function findHaikuRoot(): string {
	// Walk up from cwd looking for .haiku/
	let dir = process.cwd()
	for (let i = 0; i < 20; i++) {
		if (existsSync(join(dir, ".haiku"))) return join(dir, ".haiku")
		const parent = join(dir, "..")
		if (parent === dir) break
		dir = parent
	}
	throw new Error("No .haiku/ directory found")
}

export function intentDir(slug: string): string {
	return join(findHaikuRoot(), "intents", slug)
}

/**
 * Return the unit's worktree intent dir if the worktree exists on disk,
 * else the main intent dir. Used to validate unit-produced artifacts BEFORE
 * the worktree merges back to the parent branch — otherwise validation
 * runs against the parent's (still stale) copy and false-reports missing.
 */
export function unitIntentDir(slug: string, unit: string): string {
	const workTreePath = join(findHaikuRoot(), "worktrees", slug, unit)
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
	const wtRoot = join(findHaikuRoot(), "worktrees", slug, unit)
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
	return join(stageDir(slug, stage), "units", name)
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
		const regex = new RegExp(
			`^${esc
				.replace(/\*\*/g, "\x00")
				.replace(/\*/g, "[^/]*")
				.replace(/\x00/g, ".*")}$`,
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
	const worktreePath = join(
		findHaikuRoot(),
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
 *   - Always-allowed FSM metadata paths
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
		// Stage FSM bookkeeping
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
		`state/**`,
		`.integrity.json`,
		// Discovery knowledge (populated by early hats, read by later)
		`knowledge/**`,
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
 * Always-allowed FSM metadata paths (state.json, iteration.json, unit
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
	const existing = new Set<string>(((data.outputs as string[]) || []).map((o) => o))
	const unitBase = unit.replace(/\.md$/, "")
	const bookkeeping = new Set<string>([
		`stages/${stage}/units/${unitBase}.md`,
		`stages/${stage}/state.json`,
		`stages/${stage}/iteration.json`,
		`.integrity.json`,
	])
	const bookkeepingPrefixes = [
		`stages/${stage}/feedback/`,
		`state/`,
	]
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
 * (output templates + always-allowed FSM metadata). Called at unit
 * completion (last hat advance_hat) BEFORE the worktree merges back.
 *
 * Scope source of truth:
 *   - Stage's output templates' `location:` + `scope:` fields (intent|repo)
 *   - Templates with `scope: repo` and descriptive locations ("(project
 *     source tree)") grant a repo-wide wildcard
 *   - Always-allowed FSM metadata (unit spec, state files, feedback dir,
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

/** Maximum number of agent-invoked iterations allowed before the FSM
 *  escalates to the human. User-invoked revisits (`trigger: "user-revisit"`)
 *  are NOT capped — explicit user intent always wins. */
export const MAX_STAGE_ITERATIONS = 5

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

/** Normalized iteration count — prefer the iterations array, fall back to
 *  the legacy `visits` scalar so existing state files stay readable. */
export function getStageIterationCount(
	stageState: Record<string, unknown>,
): number {
	const arr = stageState.iterations as StageIteration[] | undefined
	if (Array.isArray(arr)) return arr.length
	const legacy = stageState.visits as number | undefined
	return typeof legacy === "number" ? legacy : 0
}

/** Read the iterations array with a migration fallback from `visits: N`. */
function readIterations(
	stageState: Record<string, unknown>,
): StageIteration[] {
	const arr = stageState.iterations as StageIteration[] | undefined
	if (Array.isArray(arr)) return arr.slice()
	const legacyVisits = (stageState.visits as number) || 0
	if (legacyVisits <= 0) return []
	// Synthesize a minimal iterations array so the new code path sees
	// something it can append to. Legacy entries are marked unknown.
	const now = timestamp()
	return Array.from({ length: legacyVisits }, (_, i) => ({
		index: i + 1,
		started_at: now,
		completed_at: i < legacyVisits - 1 ? now : null,
		trigger: "initial" as StageIterationTrigger,
		result: i < legacyVisits - 1 ? ("advanced" as StageIterationResult) : null,
	}))
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
	const path = stageStatePath(slug, stage)
	const state = readJson(path)
	const iters = readIterations(state)
	const now = timestamp()
	if (iters.length > 0) {
		const last = iters[iters.length - 1]
		if (!last.completed_at) last.completed_at = now
		if (!last.result) last.result = prevResult
	}
	const signature = entry.feedbackTitles
		? computeFeedbackSignature(entry.feedbackTitles)
		: ""
	iters.push({
		index: iters.length + 1,
		started_at: now,
		completed_at: null,
		trigger: entry.trigger,
		result: null,
		...(entry.reason ? { reason: entry.reason } : {}),
		...(signature ? { feedback_signature: signature } : {}),
	})
	state.iterations = iters
	// Maintain `visits` as a shadow for any legacy reader that still
	// dereferences it. New code should use getStageIterationCount.
	state.visits = iters.length
	writeJson(path, state)

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
	const path = stageStatePath(slug, stage)
	const state = readJson(path)
	const iters = readIterations(state)
	if (iters.length === 0) {
		// No prior iteration recorded — synthesize an "initial" one so the
		// history isn't blank.
		iters.push({
			index: 1,
			started_at: timestamp(),
			completed_at: timestamp(),
			trigger: "initial",
			result,
			...(reason ? { reason } : {}),
		})
	} else {
		const last = iters[iters.length - 1]
		if (!last.completed_at) last.completed_at = timestamp()
		last.result = result
		if (reason) last.reason = reason
	}
	state.iterations = iters
	state.visits = iters.length
	writeJson(path, state)
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
	const { data, content } = matter(raw)
	return {
		data: normalizeDates(data as Record<string, unknown>),
		body: content.trim(),
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

/** Write a unit frontmatter field to BOTH the parent worktree's copy AND
 *  the unit's dedicated worktree (if one exists). The dual write is what
 *  keeps the FSM's reads (parent) in sync with the merge commits produced
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
	// findHaikuRoot() returns the `.haiku` directory itself; worktrees live
	// under `<haikuRoot>/worktrees/{slug}/{unit}`.
	const worktreeBase = join(findHaikuRoot(), "worktrees", slug, unit)
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
		const haikuRoot = findHaikuRoot()
		execFileSync("git", ["add", haikuRoot], { encoding: "utf8", stdio: "pipe" })
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

/**
 * Callback for runNext — registered by orchestrator at startup to avoid circular imports.
 * Used by advance_hat to internally progress the FSM after unit completion.
 */
let _runNext:
	| ((slug: string) => { action: string; [key: string]: unknown })
	| null = null
export function setRunNextHandler(handler: typeof _runNext): void {
	_runNext = handler
}

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
		return {
			content: [
				{
					type: "text",
					text: `Error: stage-branch enforcement failed for intent '${intent}', stage '${stage ?? "(none)"}' — ${guard.message}. Resolve manually and retry.`,
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
			const sf = stageStatePath(intent, activeStage)
			const stageState = readJson(sf)
			phase = (stageState.phase as string) || ""
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
	"external-pr",
	"external-mr",
	"user-visual",
	"user-chat",
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
 *   addressed  — an independent actor (feedback-assessor hat, human via the
 *                review UI, or another agent) verified the closure.
 *   closed     — terminal; the feedback author confirmed resolution.
 *   rejected   — terminal; rejected with reason.
 */
export const FEEDBACK_STATUSES = [
	"pending",
	"addressed",
	"closed",
	"rejected",
] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/** Origins that imply a human author. */
const HUMAN_ORIGINS: ReadonlySet<string> = new Set([
	"user-visual",
	"user-chat",
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

/** Path to the feedback directory for an intent stage. */
export function feedbackDir(slug: string, stage: string): string {
	return join(stageDir(slug, stage), "feedback")
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

/** Zero-pad a number to two digits. */
function zeroPad(n: number): string {
	return n.toString().padStart(2, "0")
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

	// Read current iteration count from stage state
	const stateFile = stageStatePath(slug, stage)
	const stageState = readJson(stateFile)
	const iteration = getStageIterationCount(stageState)

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
	}

	const content = matter.stringify(`\n${opts.body}\n`, frontmatter)
	writeFileSync(filePath, content)

	const relPath = `.haiku/intents/${slug}/stages/${stage}/feedback/${filename}`
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

		items.push({
			id: `FB-${zeroPad(num)}`,
			num,
			slug: fileSlug,
			file: `.haiku/intents/${slug}/stages/${stage}/feedback/${f}`,
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
		})
	}

	return items
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

	// Normalize: "FB-03" → "03", "03" → "03"
	const nn = feedbackId.replace(/^FB-/i, "")
	const prefix = `${nn}-`

	const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
	const match = files.find((f) => f.startsWith(prefix))
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
	},
	callerContext: "agent" | "human" = "agent",
): { ok: true; updated_fields: string[] } | { ok: false; error: string } {
	const found = findFeedbackFile(slug, stage, feedbackId)
	if (!found) {
		return {
			ok: false,
			error: `Error: feedback '${feedbackId}' not found in stage '${stage}'`,
		}
	}

	// At least one updatable field must be provided
	if (fields.status === undefined && fields.closed_by === undefined) {
		return {
			ok: false,
			error:
				"Error: at least one of 'status' or 'closed_by' must be provided",
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

	// Apply updates
	const updated: string[] = []
	const newData = { ...found.data }

	if (fields.status !== undefined) {
		newData.status = fields.status
		updated.push("status")
	}
	if (fields.closed_by !== undefined) {
		if (fields.closed_by === null) {
			delete newData.closed_by
		} else {
			newData.closed_by = fields.closed_by
		}
		updated.push("closed_by")
	}

	writeFileSync(found.path, matter.stringify(`\n${found.body}\n`, newData))
	return { ok: true, updated_fields: updated }
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
			error: `Error: feedback '${feedbackId}' not found in stage '${stage}'`,
		}
	}

	// Guard: cannot delete pending items
	if (found.data.status === "pending") {
		return {
			ok: false,
			error:
				"Error: cannot delete pending feedback. Address, close, or reject it first.",
		}
	}

	// Guard: agents cannot delete human-authored items
	if (callerContext === "agent" && found.data.author_type === "human") {
		return {
			ok: false,
			error:
				"Error: agents cannot delete human-authored feedback. Use the review UI.",
		}
	}

	unlinkSync(found.path)
	return { ok: true }
}

// ── Tool definitions ───────────────────────────────────────────────────────

export const stateToolDefs = [
	// Intent tools
	{
		name: "haiku_intent_get",
		description: "Read a field from an intent's frontmatter",
		inputSchema: {
			type: "object" as const,
			properties: { slug: { type: "string" }, field: { type: "string" } },
			required: ["slug", "field"],
		},
	},
	{
		name: "haiku_intent_list",
		description: "List all intents in the workspace",
		inputSchema: {
			type: "object" as const,
			properties: {
				include_archived: {
					type: "boolean",
					description:
						"When true, include archived intents in the result and add an 'archived' field to each response object. Defaults to false.",
				},
			},
		},
	},
	// Stage tools
	{
		name: "haiku_stage_get",
		description: "Read a field from a stage's state",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				stage: { type: "string" },
				field: { type: "string" },
			},
			required: ["intent", "stage", "field"],
		},
	},
	// Unit tools
	{
		name: "haiku_unit_get",
		description: "Read a field from a unit's frontmatter",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				stage: { type: "string" },
				unit: { type: "string" },
				field: { type: "string" },
			},
			required: ["intent", "stage", "unit", "field"],
		},
	},
	{
		name: "haiku_unit_set",
		description: "Set a field in a unit's frontmatter",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				stage: { type: "string" },
				unit: { type: "string" },
				field: { type: "string" },
				value: { type: "string" },
			},
			required: ["intent", "stage", "unit", "field", "value"],
		},
	},
	{
		name: "haiku_unit_list",
		description: "List all units in a stage with their status",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" }, stage: { type: "string" } },
			required: ["intent", "stage"],
		},
	},
	{
		name: "haiku_unit_start",
		description:
			"Mark a unit as started. The system resolves the stage and first hat internally.",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" }, unit: { type: "string" } },
			required: ["intent", "unit"],
		},
	},
	{
		name: "haiku_unit_advance_hat",
		description:
			"Advance a unit to the next hat in the sequence. When called on the last hat, auto-completes the unit and progresses the FSM. The system resolves the current hat, next hat, and stage internally.",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" }, unit: { type: "string" } },
			required: ["intent", "unit"],
		},
	},
	{
		name: "haiku_unit_reject_hat",
		description:
			"Reject the current hat's work — moves back to the previous hat and increments bolt. Pass `reason` so the unit's iteration history records why the hat was rejected (what failed, which criterion wasn't met).",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				unit: { type: "string" },
				reason: {
					type: "string",
					description:
						"Short explanation of why the current hat's output was rejected (e.g. 'touch targets <44px on mobile', 'missing dark-mode tokens'). Recorded in the unit's iterations history.",
				},
			},
			required: ["intent", "unit"],
		},
	},
	{
		name: "haiku_unit_increment_bolt",
		description: "Increment a unit's bolt counter (new iteration cycle)",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				stage: { type: "string" },
				unit: { type: "string" },
			},
			required: ["intent", "stage", "unit"],
		},
	},
	// Knowledge tools
	{
		name: "haiku_knowledge_list",
		description: "List knowledge artifacts for an intent",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" } },
			required: ["intent"],
		},
	},
	{
		name: "haiku_knowledge_read",
		description: "Read a knowledge artifact",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" }, name: { type: "string" } },
			required: ["intent", "name"],
		},
	},
	// Studio tools
	{
		name: "haiku_studio_list",
		description:
			"List all available studios with their description, stages, and category. Project-level studios (.haiku/studios/) override built-in ones on name collision.",
		inputSchema: { type: "object" as const, properties: {} },
	},
	{
		name: "haiku_studio_get",
		description:
			"Read a studio's STUDIO.md — returns frontmatter fields and body text. Resolves project-level override first, then built-in.",
		inputSchema: {
			type: "object" as const,
			properties: { studio: { type: "string" } },
			required: ["studio"],
		},
	},
	{
		name: "haiku_studio_stage_get",
		description:
			"Read a stage's STAGE.md from a studio — returns frontmatter fields (hats, review, requires, produces) and body text. Resolves project-level override first, then built-in.",
		inputSchema: {
			type: "object" as const,
			properties: { studio: { type: "string" }, stage: { type: "string" } },
			required: ["studio", "stage"],
		},
	},
	// Settings tools
	{
		name: "haiku_settings_get",
		description:
			"Read a field from .haiku/settings.yml (e.g. studio, stack.compute, providers, workspace, default_announcements, review_agents, operations_runtime). Returns empty string if not set.",
		inputSchema: {
			type: "object" as const,
			properties: {
				field: {
					type: "string",
					description:
						"Dot-separated path (e.g. 'studio', 'stack.compute', 'review_agents')",
				},
			},
			required: ["field"],
		},
	},
	// Aggregate / report tools
	{
		name: "haiku_dashboard",
		description:
			"Returns a formatted dashboard of all intents showing status, studio, active stage, mode, and per-stage status tables.",
		inputSchema: { type: "object" as const, properties: {} },
	},
	{
		name: "haiku_capacity",
		description:
			"Returns a capacity report grouped by studio — completed/active counts and median bolt counts per stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				studio: {
					type: "string",
					description: "Optional: filter to a specific studio",
				},
			},
		},
	},
	{
		name: "haiku_reflect",
		description:
			"Returns detailed reflection data for an intent — per-stage summaries, unit completion counts, bolt counts, and analysis instructions.",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" } },
			required: ["intent"],
		},
	},
	{
		name: "haiku_review",
		description:
			"Runs a git diff against main/upstream and returns formatted pre-delivery code review instructions with diff, stats, review guidelines, and review-agent config. Pass open_pane: true to open the always-available review pane in the browser instead.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: {
					type: "string",
					description: "Optional: intent slug for context",
				},
				open_pane: {
					type: "boolean",
					description:
						"If true, opens the always-available review pane in the browser showing current intent state. No other arguments needed.",
				},
			},
		},
	},
	{
		name: "haiku_backlog",
		description:
			"Manage the backlog: list items, add new items, review items interactively, or promote items to intents.",
		inputSchema: {
			type: "object" as const,
			properties: {
				action: {
					type: "string",
					description: "list | add | review | promote (default: list)",
				},
				description: {
					type: "string",
					description: "Description for the new backlog item (used with add)",
				},
			},
		},
	},
	{
		name: "haiku_seed",
		description:
			"Manage seeds (future ideas): list by status, plant a new seed, or check planted seeds for trigger conditions.",
		inputSchema: {
			type: "object" as const,
			properties: {
				action: {
					type: "string",
					description: "list | plant | check (default: list)",
				},
			},
		},
	},
	// Feedback tools
	{
		name: "haiku_feedback",
		description:
			"Create a feedback item for an intent stage. Writes a markdown file with frontmatter tracking status, origin, and author.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: { type: "string", description: "Stage name" },
				title: {
					type: "string",
					description: "Short title for the feedback item (max 120 chars)",
				},
				body: {
					type: "string",
					description: "Markdown body describing the finding",
				},
				origin: {
					type: "string",
					description:
						"Source: adversarial-review | external-pr | external-mr | user-visual | user-chat | agent (default: agent)",
				},
				source_ref: {
					type: "string",
					description:
						"Optional reference — PR URL, review agent name, annotation ID",
				},
				author: {
					type: "string",
					description: "Who created it (default: agent)",
				},
			},
			required: ["intent", "stage", "title", "body"],
		},
	},
	{
		name: "haiku_feedback_update",
		description:
			"Update mutable fields on an existing feedback item. Agents cannot close human-authored feedback.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: { type: "string", description: "Stage name" },
				feedback_id: {
					type: "string",
					description: "FB-NN identifier or numeric prefix",
				},
				status: {
					type: "string",
					description: "New status: pending | closed | rejected",
				},
				closed_by: {
					type: "string",
					description:
						"Unit slug whose work the feedback-assessor validated as closing this feedback item (set only by the feedback-assessor hat or via the human review UI).",
				},
			},
			required: ["intent", "stage", "feedback_id"],
		},
	},
	{
		name: "haiku_feedback_delete",
		description:
			"Delete a feedback file. Cannot delete pending items. Agents cannot delete human-authored items.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: { type: "string", description: "Stage name" },
				feedback_id: {
					type: "string",
					description: "FB-NN identifier or numeric prefix",
				},
			},
			required: ["intent", "stage", "feedback_id"],
		},
	},
	{
		name: "haiku_feedback_reject",
		description:
			"Reject an agent-authored feedback item with a reason. Sets status to rejected and appends rejection reason to body.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: { type: "string", description: "Stage name" },
				feedback_id: {
					type: "string",
					description: "FB-NN identifier or numeric prefix",
				},
				reason: {
					type: "string",
					description: "Explanation for why this feedback is being rejected",
				},
			},
			required: ["intent", "stage", "feedback_id", "reason"],
		},
	},
	{
		name: "haiku_feedback_list",
		description:
			"List feedback items with optional filtering. Omit stage to list across all stages.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				stage: {
					type: "string",
					description: "Stage name (optional — omit to list all stages)",
				},
				status: {
					type: "string",
					description:
						"Filter by status: pending | addressed | closed | rejected",
				},
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_release_notes",
		description:
			"Extract release notes from CHANGELOG.md — a specific version or the 5 most recent entries.",
		inputSchema: {
			type: "object" as const,
			properties: {
				version: {
					type: "string",
					description: "Optional: specific version to extract (e.g. '1.2.0')",
				},
			},
		},
	},
	{
		name: "haiku_repair",
		description:
			"Scan intents for metadata issues and auto-apply safe fixes. In a git repo, scans all intent branches sequentially, auto-applies safe fixes, syncs changes, and opens PRs/MRs for already-merged branches. In filesystem mode, scans intents in the current working directory. Pass `intent` to repair a single intent only. Pass `skip_branches: true` to force cwd-only mode in a git repo. Pass `apply: false` to scan without applying fixes.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: {
					type: "string",
					description:
						"Specific intent slug to scan in the current working directory (skips multi-branch mode)",
				},
				apply: {
					type: "boolean",
					description: "Auto-apply safe mechanical fixes (default: true)",
				},
				skip_branches: {
					type: "boolean",
					description:
						"Force cwd-only mode even when in a git repo (default: false)",
				},
			},
		},
	},
	{
		name: "haiku_version_info",
		description:
			"Return the running MCP binary version and plugin version. " +
			"MCP version is baked into the binary at build time; plugin version is read from plugin.json at runtime.",
		inputSchema: { type: "object" as const, properties: {} },
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
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
	const text = (s: string) => ({
		content: [{ type: "text" as const, text: s }],
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
			const file = join(intentDir(args.slug as string), "intent.md")
			if (!existsSync(file)) return text("")
			const { data } = parseFrontmatter(readFileSync(file, "utf8"))
			const val = data[args.field as string]
			return text(
				val == null
					? ""
					: typeof val === "object"
						? JSON.stringify(val)
						: String(val),
			)
		}
		case "haiku_intent_list": {
			const root = findHaikuRoot()
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("[]")
			const includeArchived = args.include_archived === true
			// Single-pass: listVisibleIntents already parsed each intent.md once
			// for the archived-flag filter. Reuse the parsed `data` object for
			// the response body — do NOT call parseFrontmatter again.
			const entries = listVisibleIntents(intentsDir, { includeArchived })
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
				return base
			})
			return text(JSON.stringify(intents, null, 2))
		}

		// ── Stage ──
		case "haiku_stage_get": {
			const path = stageStatePath(args.intent as string, args.stage as string)
			const data = readJson(path)
			const val = data[args.field as string]
			return text(val == null ? "" : String(val))
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
			// Guard FSM-controlled fields for hookless harnesses.
			// When hooks are available (Claude Code, Kiro), the guard-fsm-fields
			// PreToolUse hook blocks direct file writes. For hookless harnesses,
			// validate here inside the MCP tool itself.
			//
			// Shared with state-integrity.ts via fsm-fields.ts so the write
			// guard and the tamper detector cannot drift out of alignment.
			const fsmProtectedFields = new Set<string>(UNIT_FIELDS)
			const field = args.field as string
			if (!getCapabilities().hooks && fsmProtectedFields.has(field)) {
				return text(
					JSON.stringify({
						error: "fsm_field_protected",
						field,
						message: `Cannot set '${field}' directly — it is controlled by the FSM. Use haiku_run_next, haiku_unit_start, haiku_unit_advance_hat, or haiku_unit_reject_hat instead.`,
					}),
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
			setFrontmatterField(path, args.field as string, args.value)
			return text("ok")
		}
		case "haiku_unit_list": {
			const dir = join(
				stageDir(args.intent as string, args.stage as string),
				"units",
			)
			if (!existsSync(dir)) return text("[]")
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
			return text(JSON.stringify(units, null, 2))
		}
		case "haiku_unit_start": {
			// Resolve stage and first hat internally
			const stage = resolveActiveStage(args.intent as string)
			if (!stage)
				return text(
					JSON.stringify({
						error: "no_active_stage",
						message:
							"No active stage found for this intent. Call haiku_run_next first.",
					}),
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
					return text(
						JSON.stringify({
							error: "unit_already_active",
							unit: args.unit,
							hat: existingFm.hat || "",
							message: `Unit '${args.unit}' is already active (hat: ${existingFm.hat || "unknown"}). Do not start it again — continue working on it or call haiku_unit_advance_hat when done.`,
						}) + (scope ? `\n\n${scope}` : ""),
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
				return text(
					JSON.stringify({
						error: "unit_not_found",
						message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.`,
					}),
				)
			const advPath = unitInfo.path
			const advStage = unitInfo.stage

			// Re-enforce if findUnitFile resolved to a different stage (rare but
			// possible for cross-stage go-backs); idempotent when already aligned.
			const advBranchErr = enforceStageBranch(
				args.intent as string,
				advStage,
			)
			if (advBranchErr) return advBranchErr

			const unitRaw = readFileSync(advPath, "utf8")
			const { data: unitFm } = parseFrontmatter(unitRaw)

			// Guard: reject if unit is already completed
			if (unitFm.status === "completed") {
				return text(
					JSON.stringify({
						error: "unit_already_completed",
						unit: args.unit,
						message: `Unit '${args.unit}' is already completed. Cannot advance hat on a completed unit.`,
					}),
				)
			}

			const currentHat = (unitFm.hat as string) || ""

			// ── Hat backpressure: prevent rapid-fire advancement ──
			const hatStartedAt = unitFm.hat_started_at as string | undefined
			if (hatStartedAt) {
				const elapsed = (Date.now() - new Date(hatStartedAt).getTime()) / 1000
				if (elapsed < 30) {
					return text(
						JSON.stringify({
							error: "hat_too_fast",
							elapsed_seconds: Math.round(elapsed),
							minimum_seconds: 30,
							message:
								"Cannot advance hat — the current hat started less than 30 seconds ago. Each hat must do meaningful work before advancing.",
						}),
					)
				}
			}

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
					return text(
						JSON.stringify({
							error: "unit_outputs_escaped",
							escaped,
							message: `Cannot advance hat: ${escaped.length} output path(s) escape the intent directory: ${escaped.join(", ")}. Fix the outputs in the unit frontmatter.`,
						}),
					)
				}
				const missing = unitOutputs.filter(
					(o) =>
						!unitOutputExists(
							args.intent as string,
							args.unit as string,
							o,
						),
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
					return text(
						JSON.stringify({
							error: "unit_outputs_missing",
							missing,
							message: `Cannot advance hat: ${missing.length} declared output(s) not found in unit worktree or main intent dir: ${missing.join(", ")}. Create them (in the unit worktree if you have one, otherwise in the main intent dir) or remove them from the outputs list.`,
						}),
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

			if (isLastHat) {
				// ── AUTO-COMPLETE: This was the last hat ──

				// ── Quality gate enforcement for hookless harnesses ──
				// When hooks are available (Claude Code, Kiro), the Stop hook runs
				// quality_gates commands. For hookless harnesses, run them here
				// before allowing the unit to complete.
				//
				// Run unconditionally on unit completion — runInlineQualityGates
				// is a no-op when the unit has no quality_gates defined, so this
				// works for any stage/hat combination including custom studios
				// that use non-standard hat names.
				if (!getCapabilities().hooks) {
					const qualityGates = runInlineQualityGates(
						args.intent as string,
						advPath,
					)
					if (qualityGates) {
						return text(JSON.stringify(qualityGates))
					}
				}

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
						return text(
							JSON.stringify({
								error: "unit_scope_violation",
								violations: scopeResult.violations,
								scope: scopeResult.scope,
								message:
									`Cannot complete unit: ${scopeResult.violations.length} file(s) were written outside the stage's declared scope.\n\n` +
									`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
									`Allowed paths (stage output templates + FSM metadata):\n${allowedSummary}\n\n` +
									`To resolve (in the unit worktree): (a) drop ALL unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${advStage})\` — recommended if the unit just started and few commits landed; or (b) amend the bad file out of the latest commit with \`git rm <file> && git commit --amend --no-edit\`; or (c) whole-commit rollback with \`git revert --no-edit <commit-sha>\` for each bad commit.\n\nNOTE: \`git checkout HEAD -- <file>\` does NOT work on committed files (it's a no-op when the file matches HEAD). Use one of the above.\n\nAlternatively: (d) update the stage's output template \`location:\` / \`scope:\` if this pattern is legitimate, or (e) call \`haiku_revisit\` if the scope itself is wrong.`,
							}),
						)
					}
				}

				// Re-read the unit frontmatter: validateUnitScope may have
				// auto-populated outputs[] from the git diff.
				const unitRawAfterPopulate = readFileSync(advPath, "utf8")
				const { data: unitFmAfter } = parseFrontmatter(unitRawAfterPopulate)
				const unitOutputsAfter = (unitFmAfter.outputs as string[]) || []

				// Clean scope — reset the reject-attempts counter. Otherwise a
				// counter bumped by a prior reject cycle would persist through
				// a clean advance and falsely escalate the next reject cycle.
				// Reseal immediately because subsequent early returns
				// (unit_outputs_empty / criteria_not_met) would otherwise exit
				// with an unsealed counter write, tripping tamper detection
				// on the next runNext.
				if (
					(((unitFmAfter.scope_reject_attempts as number) ?? 0) as number) > 0
				) {
					setFrontmatterField(advPath, "scope_reject_attempts", 0)
					sealIntentState(args.intent as string)
				}

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
					return text(
						JSON.stringify({
							error: "unit_outputs_empty",
							message:
								"Cannot complete unit: no outputs were produced. Every unit must write at least one artifact that the FSM can detect (stage artifact under `stages/<stage>/...` excluding `units/`/`state.json`, knowledge document under `knowledge/`, or a file matching a stage output template `location:`). The FSM auto-populates `outputs:` from the git diff at advance time; if you've written files but they're not showing up, verify they've been committed in the unit worktree, or add them explicitly to the unit's `outputs:` frontmatter field.",
						}),
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
					return text(
						JSON.stringify({
							error: "criteria_not_met",
							unchecked,
							message: `Cannot complete unit: ${unchecked} completion criteria still unchecked. Address them, then call haiku_unit_advance_hat again.`,
						}),
					)
				}

				// Scope enforcement already ran above (moved before the
				// outputs-empty check so validateUnitScope can auto-populate
				// outputs[] before we validate non-emptiness).

				completeUnitIteration(advPath, "advance")
				// Dual-write: parent (for FSM reads) AND unit worktree (so
				// the merge commit captures the completion state).
				setUnitFrontmatterField(
					args.intent as string,
					advStage,
					args.unit as string,
					"status",
					"completed",
				)
				setUnitFrontmatterField(
					args.intent as string,
					advStage,
					args.unit as string,
					"completed_at",
					timestamp(),
				)
				// Reseal: UNIT_FIELDS write before _runNext triggers verify.
				sealIntentState(args.intent as string)

				// Feedback closure is the exclusive responsibility of the
				// `feedback-assessor` hat. The unit's `closes:` field is the
				// CLAIM (written at elaborate time); the assessor reads that
				// claim, verifies the unit's outputs against each feedback
				// body, and — on advance — sets `closed_by` on the feedback
				// items it validated. Any other hat completing the unit does
				// NOT touch feedback state; it cannot self-certify.
				if (currentHat === FEEDBACK_ASSESSOR_HAT) {
					const unitRaw2 = readFileSync(advPath, "utf8")
					const unitParsed = parseFrontmatter(unitRaw2)
					const closes = (unitParsed.data.closes as string[]) || []
					for (const fbId of closes) {
						const found = findFeedbackFile(
							args.intent as string,
							advStage,
							fbId,
						)
						// Agents cannot close human-authored feedback — the
						// human author must do that themselves. Leave such
						// items untouched; the review UI will surface them.
						if (found?.data.author_type === "human") continue
						updateFeedbackFile(
							args.intent as string,
							advStage,
							fbId,
							{ status: "closed", closed_by: args.unit as string },
							"agent",
						)
					}
				}

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
				// the MCP's parent worktree happens to be on — the FSM works
				// in the scope of the stage, not the parent worktree.
				// `mergeUnitWorktree` uses a temp worktree so the MCP's
				// checkout is never disturbed.
				const intentSlug = args.intent as string
				const parentBranchName = `haiku/${intentSlug}/${advStage}`
				const mergeResult = mergeUnitWorktree(
					intentSlug,
					args.unit as string,
					advStage,
				)
				if (!mergeResult.success) {
					const worktreePath = join(
						process.cwd(),
						".haiku",
						"worktrees",
						intentSlug,
						args.unit as string,
					)
					return text(
						JSON.stringify(
							{
								action: "merge_conflict",
								status: "completed_merge_failed",
								intent: args.intent,
								unit: args.unit,
								worktree: worktreePath,
								error: mergeResult.message,
								message: `Unit completed but merge to parent branch failed: ${mergeResult.message}. RESOLVE: cd to the parent branch (\`git checkout ${parentBranchName}\`), merge manually (\`git merge haiku/${intentSlug}/${args.unit} --no-edit\`), resolve any conflicts, then commit and push. If you cannot resolve, ask the user for help.`,
							},
							null,
							2,
						),
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

				// Internally call runNext to progress the FSM state, but DO NOT
				// return orchestration-level actions (start_units, start_unit) to
				// the caller — those are for the PARENT agent, not the subagent
				// that just finished its hat. The subagent's job ends here; the
				// parent calls haiku_run_next after all wave subagents return.
				//
				// Phase/stage transitions (advance_phase, advance_stage, review,
				// intent_complete) are returned so the last caller can propagate
				// the signal back to the parent via its final message.
				if (_runNext) {
					const next = _runNext(args.intent as string)
					const subagentLocalActions = new Set([
						"continue_unit",
						"continue_units",
						"blocked",
						"start_units",
						"start_unit",
					])
					if (subagentLocalActions.has(next.action as string)) {
						return text(
							`Unit ${args.unit} completed (last hat)${mergeNote}. FSM next action (${next.action}) is for the parent orchestrator — this subagent's job ends here. The parent will call haiku_run_next when all wave subagents return.${pushWarning(completeGit)}`,
						)
					}
					// Phase/stage-level transitions (advance_phase, review, advance_stage,
					// intent_complete, etc.) — return so the last wave subagent can
					// signal the transition back to the parent.
					const payload = injectPushWarning(
						{ ...next, _unit_completed: args.unit, _merge: mergeNote },
						completeGit,
					)
					const resultPath = resultPathFor({
						unit: args.unit as string,
						hat: currentHat,
						bolt: (unitFm.bolt as number) || 1,
					})
					writeResultFile(resultPath, payload)
					return text(
						`FSM Result written to: ${resultPath}\n\n` +
							`YOUR FINAL MESSAGE TO THE PARENT MUST BE EXACTLY ONE LINE:\n\n` +
							`FSM Result: ${resultPath}\n\n` +
							`Do NOT add prose, summary, or description. The parent reads the file to drive the next FSM action (phase/stage/intent transition).`,
					)
				}

				return text(
					`completed (last hat)${mergeNote}${pushWarning(completeGit)}`,
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
					return text(
						JSON.stringify({
							error: "unit_scope_violation",
							hat: currentHat,
							violations: scopeResult.violations,
							scope: scopeResult.scope,
							message:
								`Cannot advance hat '${currentHat}': ${scopeResult.violations.length} file(s) were written outside the stage's declared scope.\n\n` +
								`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
								`Allowed paths (stage output templates + FSM metadata):\n${allowedSummary}\n\n` +
								`Revert the out-of-bounds commits in the unit worktree: drop all unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${advStage})\`, or amend a single file out with \`git rm <file> && git commit --amend --no-edit\`, or \`git revert --no-edit <commit-sha>\` for a whole commit. NOTE: \`git checkout HEAD -- <file>\` is a no-op on committed files. Or update the stage's output template if this pattern is legitimate. Do NOT advance with scope violations — downstream hats will run blind.`,
						}),
					)
				}
			}

			// Clean scope — reset the reject-attempts counter.
			{
				const { data: advFm } = parseFrontmatter(readFileSync(advPath, "utf8"))
				if (
					(((advFm.scope_reject_attempts as number) ?? 0) as number) > 0
				) {
					setFrontmatterField(advPath, "scope_reject_attempts", 0)
				}
			}

			const nextHat = stageHats[nextIdx]

			completeUnitIteration(advPath, "advance")
			setFrontmatterField(advPath, "hat", nextHat)
			setFrontmatterField(advPath, "hat_started_at", timestamp())
			startUnitIteration(advPath, nextHat)
			// Reseal: UNIT_FIELDS write before _runNext triggers verify.
			sealIntentState(args.intent as string)
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
			// Internally call runNext — returns continue_unit with next hat context for the parent
			if (_runNext) {
				const next = _runNext(args.intent as string)
				const payload = injectPushWarning(
					{ ...next, _hat_advanced: nextHat },
					advGit,
				)
				const resultPath = resultPathFor({
					unit: args.unit as string,
					hat: currentHat,
					bolt: (unitFm.bolt as number) || 1,
				})
				writeResultFile(resultPath, payload)
				return text(
					`FSM Result written to: ${resultPath}\n\n` +
						`YOUR FINAL MESSAGE TO THE PARENT MUST BE EXACTLY ONE LINE:\n\n` +
						`FSM Result: ${resultPath}\n\n` +
						`Do NOT add prose, summary, or description. The parent reads the file to drive the next FSM action.`,
				)
			}

			const hatScope = resolveStageScope(args.intent as string, advStage)
			return text(
				(hatScope
					? `advanced to ${nextHat}\n\n${hatScope}`
					: `advanced to ${nextHat}`) + pushWarning(advGit),
			)
		}
		case "haiku_unit_reject_hat": {
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
				return text(
					JSON.stringify({
						error: "unit_not_found",
						message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.`,
					}),
				)
			const failPath = rejectInfo.path
			const rejectStage = rejectInfo.stage

			// Re-enforce for cross-stage case; idempotent when already aligned.
			const rejectBranchErr = enforceStageBranch(
				args.intent as string,
				rejectStage,
			)
			if (rejectBranchErr) return rejectBranchErr

			const { data: failData } = parseFrontmatter(
				readFileSync(failPath, "utf8"),
			)
			const currentHat = (failData.hat as string) || ""
			const currentBolt = (failData.bolt as number) || 1

			// Enforce max bolt limit FIRST — this is the absolute escape
			// hatch. Must run before the scope gate so a repeatedly-rejected
			// unit with a committed scope violation can still hit MAX_BOLTS
			// and escalate to the user instead of deadlocking.
			const MAX_BOLTS_FAIL = 5
			if (currentBolt + 1 > MAX_BOLTS_FAIL) {
				return text(
					JSON.stringify({
						error: "max_bolts_exceeded",
						bolt: currentBolt,
						max: MAX_BOLTS_FAIL,
						message: `Unit has exceeded ${MAX_BOLTS_FAIL} bolt iterations. Escalate to the user — this unit may need to be redesigned, split, or have a persistent scope violation manually reverted (\`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${rejectStage})\` in the unit worktree).`,
					}),
				)
			}

			// Scope-validate before rollback. CRITICAL: we increment a
			// separate `scope_reject_attempts` counter on every scope-failure
			// return so that repeated failures accumulate toward MAX_BOLTS.
			// Without the counter bump the bolt field never advances (it only
			// moves on SUCCESSFUL reject), and the agent loops forever.
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
					// Persisted counter of scope-violation returns from reject_hat.
					// Accumulates across calls so MAX_BOLTS_FAIL trips even when
					// the agent never clears the violation. Reset to 0 on any
					// successful scope-clean reject (see below).
					const { data: attemptsFm } = parseFrontmatter(
						readFileSync(failPath, "utf8"),
					)
					const prevAttempts =
						Number(attemptsFm.scope_reject_attempts as number | undefined) || 0
					const newAttempts = prevAttempts + 1
					setFrontmatterField(failPath, "scope_reject_attempts", newAttempts)
					sealIntentState(args.intent as string)

					if (newAttempts >= MAX_BOLTS_FAIL) {
						return text(
							JSON.stringify({
								error: "max_bolts_exceeded",
								reason: "persistent_scope_violation",
								attempts: newAttempts,
								max: MAX_BOLTS_FAIL,
								violations: scopeResult.violations,
								message: `Unit has hit ${newAttempts} consecutive scope-violation rejects. Escalate to the user. The worktree still contains out-of-scope commits that must be reverted manually: \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${rejectStage})\` in the unit worktree.`,
							}),
						)
					}

					return text(
						JSON.stringify({
							error: "unit_scope_violation_on_reject",
							bolt: currentBolt,
							scope_reject_attempts: newAttempts,
							max_attempts: MAX_BOLTS_FAIL,
							violations: scopeResult.violations,
							scope: scopeResult.scope,
							message:
								`Cannot reject hat: the unit worktree still contains ${scopeResult.violations.length} out-of-scope write(s) that must be reverted first. ` +
								`Attempt ${newAttempts}/${MAX_BOLTS_FAIL} — after ${MAX_BOLTS_FAIL} scope-violation rejects, the FSM escalates to the user.\n\n` +
								`Out-of-bounds files:\n${scopeResult.violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
								`Revert the out-of-bounds commits in the unit worktree: drop all unit commits with \`git reset --hard $(git merge-base HEAD haiku/${args.intent as string}/${rejectStage})\`, or amend a single file out with \`git rm <file> && git commit --amend --no-edit\`, or \`git revert --no-edit <commit-sha>\` for a whole commit. NOTE: \`git checkout HEAD -- <file>\` is a NO-OP on committed files and will not clear the violation. After the revert, call reject_hat again.`,
						}),
					)
				}

				// Clean scope — reset the persistent counter.
				const { data: cleanFm } = parseFrontmatter(
					readFileSync(failPath, "utf8"),
				)
				if (
					(((cleanFm.scope_reject_attempts as number) ?? 0) as number) > 0
				) {
					setFrontmatterField(failPath, "scope_reject_attempts", 0)
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
						`[haiku] model escalated: ${currentModel} → ${escalated} (hat rejected, bolt ${currentBolt + 1})`,
					)
				}
			}

			const rejectReason = (args.reason as string) || undefined
			completeUnitIteration(failPath, "reject", rejectReason)
			setFrontmatterField(failPath, "hat", prevHat)
			setFrontmatterField(failPath, "bolt", currentBolt + 1)
			setFrontmatterField(failPath, "hat_started_at", timestamp())
			startUnitIteration(failPath, prevHat)
			// Reseal: UNIT_FIELDS write; next haiku_run_next triggers verify.
			sealIntentState(args.intent as string)
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
				`haiku: fail ${args.unit as string} — back to ${prevHat}, bolt ${currentBolt + 1}`,
			)
			syncSessionMetadata(
				args.intent as string,
				args.state_file as string | undefined,
			)
			{
				const resultPath = resultPathFor({
					unit: args.unit as string,
					hat: currentHat,
					bolt: currentBolt,
				})
				writeResultFile(resultPath, {
					action: "continue_unit",
					intent: args.intent,
					stage: rejectStage,
					unit: args.unit,
					hat: prevHat,
					bolt: currentBolt + 1,
					reason: rejectReason ?? null,
					_rejected_from: currentHat,
					_push_warning: pushWarning(rejectGit) || undefined,
				})
				return text(
					`FSM Result written to: ${resultPath}\n\n` +
						`YOUR FINAL MESSAGE TO THE PARENT MUST BE EXACTLY ONE LINE:\n\n` +
						`FSM Result: ${resultPath}\n\n` +
						`Do NOT add prose or summary. Parent reads the file to drive the rebolt.`,
				)
			}
		}
		case "haiku_unit_increment_bolt": {
			const boltBranchErr = enforceStageBranch(
				args.intent as string,
				args.stage as string,
			)
			if (boltBranchErr) return boltBranchErr
			const path = unitPath(
				args.intent as string,
				args.stage as string,
				args.unit as string,
			)
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const current = (data.bolt as number) || 0

			// Enforce max bolt limit
			const MAX_BOLTS_INC = 5
			if (current + 1 > MAX_BOLTS_INC) {
				return text(
					JSON.stringify({
						error: "max_bolts_exceeded",
						bolt: current,
						max: MAX_BOLTS_INC,
						message: `Unit has exceeded ${MAX_BOLTS_INC} bolt iterations. Escalate to the user — this unit may need to be redesigned or split.`,
					}),
				)
			}

			setFrontmatterField(path, "bolt", current + 1)
			// Reseal: bolt is in UNIT_FIELDS.
			sealIntentState(args.intent as string)
			emitTelemetry("haiku.bolt.iteration", {
				intent: args.intent as string,
				stage: args.stage as string,
				unit: args.unit as string,
				bolt: String(current + 1),
			})
			return text(String(current + 1))
		}

		// ── Knowledge ──
		case "haiku_knowledge_list": {
			const dir = join(intentDir(args.intent as string), "knowledge")
			if (!existsSync(dir)) return text("[]")
			const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
			return text(JSON.stringify(files))
		}
		case "haiku_knowledge_read": {
			const path = join(
				intentDir(args.intent as string),
				"knowledge",
				args.name as string,
			)
			if (!existsSync(path)) return text("")
			return text(readFileSync(path, "utf8"))
		}

		// ── Studio ──
		case "haiku_studio_list": {
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
			return text(JSON.stringify(studios, null, 2))
		}
		case "haiku_studio_get": {
			const studio = resolveStudio(args.studio as string)
			if (!studio) return text("")
			return text(
				JSON.stringify(
					{
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
					},
					null,
					2,
				),
			)
		}
		case "haiku_studio_stage_get": {
			const studio = resolveStudio(args.studio as string)
			if (!studio) return text("")
			const sgName = args.stage as string
			const stageFile = join(studio.path, "stages", sgName, "STAGE.md")
			if (!existsSync(stageFile)) return text("")
			const raw = readFileSync(stageFile, "utf8")
			const { data, body } = parseFrontmatter(raw)
			return text(
				JSON.stringify(
					{
						...data,
						body,
						studio: studio.name,
						studio_dir: studio.dir,
						stage_md: stageFile,
					},
					null,
					2,
				),
			)
		}

		// ── Settings ──
		case "haiku_settings_get": {
			const field = args.field as string
			let settingsPath = ""
			try {
				settingsPath = join(findHaikuRoot(), "settings.yml")
			} catch {
				/* */
			}
			if (!settingsPath || !existsSync(settingsPath)) return text("")
			const raw = readFileSync(settingsPath, "utf8")
			const settings = parseYaml(raw)
			const val = getNestedField(settings, field)
			if (val == null) return text("")
			return text(typeof val === "object" ? JSON.stringify(val) : String(val))
		}

		// ── Dashboard ──
		case "haiku_dashboard": {
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No intents found. Use /haiku:start to create one.")
			}
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir))
				return text("No intents found. Use /haiku:start to create one.")
			const entries = listVisibleIntents(intentsDir)
			if (entries.length === 0)
				return text("No intents found. Use /haiku:start to create one.")

			let out = "# Dashboard\n"
			for (const { slug, data } of entries) {
				out += `\n## ${slug}\n`
				out += `- Status: ${data.status || "unknown"}\n`
				out += `- Studio: ${data.studio || "none"}\n`
				out += `- Active Stage: ${data.active_stage || "none"}\n`
				out += `- Mode: ${data.mode || "interactive"}\n`

				const isDiscrete =
					(data.mode as string) === "discrete" ||
					(data.mode as string) === "hybrid"

				const stagesPath = join(intentsDir, slug, "stages")
				if (existsSync(stagesPath)) {
					const stages = readdirSync(stagesPath).filter((s) =>
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
							const state = readJson(join(stagesPath, s, "state.json"))
							out += `| ${s} | ${state.status || "pending"} | ${state.phase || ""} |\n`
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
			return text(out)
		}

		// ── Capacity ──
		case "haiku_capacity": {
			const filterStudio = (args.studio as string) || ""
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No .haiku directory found.")
			}
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("No intents found.")
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
				byStudio
					.get(studio)
					?.push({ slug, status: (data.status as string) || "unknown", data })
			}

			if (byStudio.size === 0)
				return text(
					filterStudio
						? `No intents found for studio '${filterStudio}'.`
						: "No intents found.",
				)

			let out = "# Capacity Report\n"
			for (const [studio, intents] of byStudio) {
				const completed = intents.filter((i) => i.status === "completed").length
				const active = intents.filter((i) => i.status === "active").length
				out += `\n## Studio: ${studio}\n`
				out += `- Total intents: ${intents.length}\n`
				out += `- Completed: ${completed}\n`
				out += `- Active: ${active}\n`

				// Collect bolt counts per stage across all intents in this studio
				const stageBolts = new Map<string, number[]>()
				for (const intent of intents) {
					const stagesPath = join(intentsDir, intent.slug, "stages")
					if (!existsSync(stagesPath)) continue
					for (const stage of readdirSync(stagesPath)) {
						const unitsDir = join(stagesPath, stage, "units")
						if (!existsSync(unitsDir)) continue
						if (!stageBolts.has(stage)) stageBolts.set(stage, [])
						for (const f of readdirSync(unitsDir).filter((f) =>
							f.endsWith(".md"),
						)) {
							const { data: ud } = parseFrontmatter(
								readFileSync(join(unitsDir, f), "utf8"),
							)
							if (typeof ud.bolt === "number")
								stageBolts.get(stage)?.push(ud.bolt)
						}
					}
				}

				if (stageBolts.size > 0) {
					out +=
						"\n| Stage | Units | Median Bolts |\n|-------|-------|--------------|\n"
					for (const [stage, bolts] of stageBolts) {
						out += `| ${stage} | ${bolts.length} | ${median(bolts)} |\n`
					}
				}
			}
			return text(out)
		}

		// ── Reflect ──
		case "haiku_reflect": {
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
			let out = "## Intent Metadata\n"
			out += `- Slug: ${intentSlug}\n`
			out += `- Studio: ${intentData.studio || "none"}\n`
			out += `- Mode: ${intentData.mode || "interactive"}\n`
			out += `- Status: ${intentData.status || "unknown"}\n`
			out += `- Created: ${intentData.created_at || "unknown"}\n`
			out += `- Completed: ${intentData.completed_at || "in progress"}\n`

			const stagesPath = join(root, "intents", intentSlug, "stages")
			if (existsSync(stagesPath)) {
				out += "\n## Per-Stage Summary\n"
				for (const stage of readdirSync(stagesPath)) {
					const state = readJson(join(stagesPath, stage, "state.json"))
					out += `\n### ${stage}\n`
					out += `- Status: ${state.status || "pending"}\n`
					out += `- Phase: ${state.phase || ""}\n`
					out += `- Started: ${state.started_at || "not started"}\n`
					out += `- Completed: ${state.completed_at || "in progress"}\n`

					const unitsDir = join(stagesPath, stage, "units")
					if (existsSync(unitsDir)) {
						const unitFiles = readdirSync(unitsDir).filter((f) =>
							f.endsWith(".md"),
						)
						let completedUnits = 0
						let totalBolts = 0
						const unitDetails: string[] = []
						for (const f of unitFiles) {
							const { data: ud } = parseFrontmatter(
								readFileSync(join(unitsDir, f), "utf8"),
							)
							const uName = f.replace(".md", "")
							const uBolt = (ud.bolt as number) || 0
							totalBolts += uBolt
							if (ud.status === "completed") completedUnits++
							unitDetails.push(
								`  - ${uName}: status=${ud.status || "pending"}, bolts=${uBolt}, hat=${ud.hat || "none"}`,
							)
						}
						out += `- Units: ${completedUnits}/${unitFiles.length} completed, Total bolts: ${totalBolts}\n`
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
			// open_pane mode: return instructions for the agent to open the browser
			if (args.open_pane) {
				return text(
					"To open the always-available review pane, the HTTP server must be running. The server starts automatically during gate reviews. Use GET /api/review/current to fetch the current intent state as JSON, and open /review/current in a browser to view the read-only overview.\n\nThis is a read-only view — no Approve/Request Changes buttons are shown outside of a gate review.",
				)
			}

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
			const action = (args.action as string) || "list"
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No .haiku directory found.")
			}
			const backlogDir = join(root, "backlog")

			switch (action) {
				case "list": {
					if (!existsSync(backlogDir)) return text("No backlog items found.")
					const files = readdirSync(backlogDir).filter((f) => f.endsWith(".md"))
					if (files.length === 0) return text("No backlog items found.")

					let out =
						"# Backlog\n\n| # | Item | Priority | Created |\n|---|------|----------|---------|\n"
					for (let i = 0; i < files.length; i++) {
						const { data } = parseFrontmatter(
							readFileSync(join(backlogDir, files[i]), "utf8"),
						)
						out += `| ${i + 1} | ${files[i].replace(".md", "")} | ${data.priority || "unset"} | ${data.created_at || "unknown"} |\n`
					}
					return text(out)
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
					return text(out)
				}
				case "review": {
					if (!existsSync(backlogDir))
						return text("No backlog items to review.")
					const files = readdirSync(backlogDir).filter((f) => f.endsWith(".md"))
					if (files.length === 0) return text("No backlog items to review.")

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
					return text(out)
				}
				case "promote": {
					let out = "## Promote Backlog Item\n\n"
					out += "To promote a backlog item to an intent:\n"
					out += "1. Read the backlog item file\n"
					out +=
						"2. Use /haiku:start to create an intent from its description\n"
					out += "3. Delete the backlog file after the intent is created\n"
					return text(out)
				}
				default:
					return text(
						`Unknown backlog action: '${action}'. Valid actions: list, add, review, promote.`,
					)
			}
		}

		// ── Seed ──
		case "haiku_seed": {
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
					out += `\`\`\`markdown\n---\nstatus: planted\ntrigger: \"<condition that should cause this to surface>\"\ncreated_at: ${timestamp()}\n---\n\n`
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
			const version = (args.version as string) || ""
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
			if (!changelogPath) return text("No CHANGELOG.md found.")

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
				return text("No versioned entries found in CHANGELOG.md.")

			if (version) {
				// Find the specific version
				const idx = matches.findIndex((m) => m.version === version)
				if (idx === -1)
					return text(
						`Version '${version}' not found in CHANGELOG.md. Available: ${matches
							.slice(0, 10)
							.map((m) => m.version)
							.join(", ")}`,
					)
				const endIdx =
					idx + 1 < matches.length ? matches[idx + 1].start : changelog.length
				const section = changelog.slice(matches[idx].start, endIdx).trim()
				return text(
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
			return text(out)
		}

		case "haiku_repair": {
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

			// Multi-branch path: in a git repo, no single-intent restriction, branches not skipped.
			// Runs whether or not active haiku/<slug>/main branches exist — the archived pass
			// handles the case where all intents have already been merged and their branches deleted.
			if (isGitRepo() && !repairIntentArg && !repairSkipBranches) {
				try {
					const { summaries, mainline, archivedSummary } =
						repairAllBranches(repairAutoApply)
					if (summaries.length > 0 || archivedSummary) {
						return text(
							buildMultiBranchReport(summaries, mainline, archivedSummary),
						)
					}
					// No active branches AND no archived intents — fall through to cwd repair
				} catch (err) {
					return text(
						`Multi-branch repair failed: ${err instanceof Error ? err.message : String(err)}`,
					)
				}
			}

			// Single-cwd path
			try {
				findHaikuRoot()
			} catch {
				return text("No .haiku/ directory found.")
			}

			let cwdResult: RepairCwdResult
			try {
				cwdResult = repairCwd(undefined, repairIntentArg, repairAutoApply)
			} catch (err) {
				return text(
					`Repair failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}

			if (repairIntentArg && cwdResult.scanned === 0) {
				return text(`Intent '${repairIntentArg}' not found.`)
			}
			if (cwdResult.scanned === 0) return text("No intents found.")

			return text(buildRepairReport(cwdResult))
		}

		// ── Feedback ──
		case "haiku_feedback": {
			const intent = args.intent as string
			const stage = args.stage as string
			const title = args.title as string
			const body = args.body as string
			const origin = (args.origin as string) || undefined
			const sourceRef = (args.source_ref as string) || undefined
			const author = (args.author as string) || undefined

			// Validation
			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!stage)
				return {
					content: [{ type: "text", text: "Error: stage is required" }],
					isError: true,
				}
			if (!title)
				return {
					content: [{ type: "text", text: "Error: title is required" }],
					isError: true,
				}
			if (!body)
				return {
					content: [{ type: "text", text: "Error: body is required" }],
					isError: true,
				}
			if (title.length > 120)
				return {
					content: [
						{
							type: "text",
							text: "Error: title must be 120 characters or fewer",
						},
					],
					isError: true,
				}

			// Validate intent exists
			const intentFile = join(intentDir(intent), "intent.md")
			if (!existsSync(intentFile))
				return {
					content: [
						{ type: "text", text: `Error: intent '${intent}' not found` },
					],
					isError: true,
				}

			// Validate origin enum
			if (origin && !(FEEDBACK_ORIGINS as readonly string[]).includes(origin)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: origin must be one of: ${FEEDBACK_ORIGINS.join(", ")}`,
						},
					],
					isError: true,
				}
			}

			// Enforce branch BEFORE any stage-dir check/create — otherwise a
			// mkdirSync on intent main leaks an empty stage dir onto the wrong
			// branch, and the subsequent write lands on whatever branch git
			// was on at call time.
			const feedbackBranchErr = enforceStageBranch(intent, stage)
			if (feedbackBranchErr) return feedbackBranchErr

			// Validate stage exists
			const stgDir = stageDir(intent, stage)
			if (!existsSync(stgDir)) {
				// Auto-create stage dir if the intent has it declared but dir doesn't exist yet
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

			const result = writeFeedbackFile(intent, stage, {
				title,
				body,
				origin,
				author,
				source_ref: sourceRef ?? null,
			})

			const gitResult = gitCommitState(
				`feedback: create ${result.feedback_id} in ${stage}`,
			)
			const response: Record<string, unknown> = {
				feedback_id: result.feedback_id,
				file: result.file,
				status: "pending",
				message: `Feedback ${result.feedback_id} created.`,
			}
			return text(
				JSON.stringify(injectPushWarning(response, gitResult), null, 2),
			)
		}

		case "haiku_feedback_update": {
			const intent = args.intent as string
			const stage = args.stage as string
			const feedbackId = args.feedback_id as string

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!stage)
				return {
					content: [{ type: "text", text: "Error: stage is required" }],
					isError: true,
				}
			if (!feedbackId)
				return {
					content: [{ type: "text", text: "Error: feedback_id is required" }],
					isError: true,
				}

			const updateFields: { status?: string; closed_by?: string } = {}
			if (args.status !== undefined) updateFields.status = args.status as string
			if (args.closed_by !== undefined)
				updateFields.closed_by = args.closed_by as string

			const feedbackUpdateBranchErr = enforceStageBranch(intent, stage)
			if (feedbackUpdateBranchErr) return feedbackUpdateBranchErr

			const updateResult = updateFeedbackFile(
				intent,
				stage,
				feedbackId,
				updateFields,
				"agent",
			)

			if (!updateResult.ok) {
				return {
					content: [{ type: "text", text: updateResult.error }],
					isError: true,
				}
			}

			const updateGitResult = gitCommitState(
				`feedback: update ${feedbackId} in ${stage}`,
			)

			const found = findFeedbackFile(intent, stage, feedbackId)
			const updateResponse: Record<string, unknown> = {
				feedback_id: feedbackId,
				file: found
					? `.haiku/intents/${intent}/stages/${stage}/feedback/${found.filename}`
					: undefined,
				updated_fields: updateResult.updated_fields,
				message: `Feedback ${feedbackId} updated.`,
			}
			return text(
				JSON.stringify(
					injectPushWarning(updateResponse, updateGitResult),
					null,
					2,
				),
			)
		}

		case "haiku_feedback_delete": {
			const intent = args.intent as string
			const stage = args.stage as string
			const feedbackId = args.feedback_id as string

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!stage)
				return {
					content: [{ type: "text", text: "Error: stage is required" }],
					isError: true,
				}
			if (!feedbackId)
				return {
					content: [{ type: "text", text: "Error: feedback_id is required" }],
					isError: true,
				}

			const feedbackDeleteBranchErr = enforceStageBranch(intent, stage)
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
				`feedback: delete ${feedbackId} from ${stage}`,
			)

			const deleteResponse: Record<string, unknown> = {
				feedback_id: feedbackId,
				deleted: true,
				message: `Feedback ${feedbackId} deleted from stage '${stage}'.`,
			}
			return text(
				JSON.stringify(
					injectPushWarning(deleteResponse, deleteGitResult),
					null,
					2,
				),
			)
		}

		case "haiku_feedback_reject": {
			const intent = args.intent as string
			const stage = args.stage as string
			const feedbackId = args.feedback_id as string
			const reason = args.reason as string

			if (!intent)
				return {
					content: [{ type: "text", text: "Error: intent is required" }],
					isError: true,
				}
			if (!stage)
				return {
					content: [{ type: "text", text: "Error: stage is required" }],
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
			// Reading first would spuriously report "not found".
			const feedbackRejectBranchErr = enforceStageBranch(intent, stage)
			if (feedbackRejectBranchErr) return feedbackRejectBranchErr

			// Find the feedback file
			const rejectFound = findFeedbackFile(intent, stage, feedbackId)
			if (!rejectFound) {
				return {
					content: [
						{
							type: "text",
							text: `Error: feedback '${feedbackId}' not found in stage '${stage}'`,
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

			const rejectGitResult = gitCommitState(
				`feedback: reject ${feedbackId} in ${stage}`,
			)

			const rejectResponse: Record<string, unknown> = {
				feedback_id: feedbackId,
				status: "rejected",
				message: `Feedback ${feedbackId} rejected: ${reason}`,
			}
			return text(
				JSON.stringify(
					injectPushWarning(rejectResponse, rejectGitResult),
					null,
					2,
				),
			)
		}

		case "haiku_feedback_list": {
			const intent = args.intent as string
			const stageFilt = (args.stage as string) || undefined
			const statusFilt = (args.status as string) || undefined

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

			// Validate status filter enum
			if (
				statusFilt &&
				!(FEEDBACK_STATUSES as readonly string[]).includes(statusFilt)
			) {
				return {
					content: [
						{
							type: "text",
							text: `Error: status must be one of: ${FEEDBACK_STATUSES.join(", ")}`,
						},
					],
					isError: true,
				}
			}

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

			// Collect feedback items across stages
			const allItems: Array<Record<string, unknown>> = []
			for (const stg of stagesToList) {
				const items = readFeedbackFiles(intent, stg)
				for (const item of items) {
					if (statusFilt && item.status !== statusFilt) continue
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
					}
					// Include stage field when listing across stages
					if (!stageFilt) {
						entry.stage = stg
					}
					allItems.push(entry)
				}
			}

			const listResponse: Record<string, unknown> = {
				intent,
				stage: stageFilt || null,
				count: allItems.length,
				items: allItems,
			}
			return text(JSON.stringify(listResponse, null, 2))
		}

		case "haiku_version_info": {
			const info: Record<string, string> = {
				mcp_version: MCP_VERSION,
				plugin_version: getPluginVersion(),
			}
			const pending = getPendingVersion()
			if (pending) info.pending_update = pending
			if (hasPendingUpdate())
				info.update_note =
					"A new version has been downloaded and will activate on the next tool call."
			return text(JSON.stringify(info, null, 2))
		}

		default:
			return text(`Unknown tool: ${name}`)
	}
}
