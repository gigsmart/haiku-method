// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execFileSync, spawnSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { getPendingVersion, hasPendingUpdate } from "./auto-update.js"
import { features } from "./config.js"
import {
	addTempWorktree,
	commitAndPushFromWorktree,
	consolidateStageBranches,
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
import { escalate } from "./model-selection.js"
import { validateSlugArgs } from "./prompts/helpers.js"
import { logSessionEvent, writeHaikuMetadata } from "./session-metadata.js"
import {
	listStudios,
	readOperationDefs,
	readReflectionDefs,
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
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
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

/** Resolve hat sequence for a stage — used by haiku_unit_advance_hat and haiku_unit_reject_hat */
function resolveStageHats(intent: string, stage: string): string[] {
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return []
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		const studio = (data.studio as string) || ""
		if (!studio) return []

		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
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

		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
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
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
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
			"Reject the current hat's work — moves back to the previous hat and increments bolt. The system resolves stage and hat positions internally.",
		inputSchema: {
			type: "object" as const,
			properties: { intent: { type: "string" }, unit: { type: "string" } },
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
			"Runs a git diff against main/upstream and returns formatted pre-delivery code review instructions with diff, stats, review guidelines, and review-agent config.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: {
					type: "string",
					description: "Optional: intent slug for context",
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
			"Scan intents for metadata issues and auto-apply safe fixes. In a git repo, the default behavior is to scan ALL `haiku/<slug>/main` intent branches sequentially via temporary worktrees, auto-apply safe fixes (overlong title trim, legacy field renames, missing defaults, studio alias migration), commit and push the fixes to each branch, and open a PR/MR back to mainline if the branch was already merged. Pass `intent` to repair a single intent in the current working directory only. Pass `skip_branches: true` to force cwd-only mode in a git repo. Pass `apply: false` to scan without applying fixes.",
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

// ── Tool handlers ──────────────────────────────────────────────────────────

export function handleStateTool(
	name: string,
	args: Record<string, unknown>,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
	const text = (s: string) => ({
		content: [{ type: "text" as const, text: s }],
	})

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
				const missing = unitOutputs.filter((o) => {
					const resolved = resolve(iDir, o)
					if (!resolved.startsWith(`${resolve(iDir)}/`)) return false // escaped — already caught above
					return !existsSync(resolved)
				})
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
							message: `Cannot advance hat: ${missing.length} declared output(s) not found: ${missing.join(", ")}. Create them or remove them from the outputs list.`,
						}),
					)
				}
			}

			// Resolve hat sequence
			const stageHats = resolveStageHats(args.intent as string, advStage)
			const currentIdx = stageHats.indexOf(currentHat)
			const nextIdx = currentIdx + 1
			const isLastHat = nextIdx >= stageHats.length

			if (isLastHat) {
				// ── AUTO-COMPLETE: This was the last hat ──

				// Require at least one tracked output. The track-outputs PostToolUse
				// hook auto-populates this as files are written, so an empty list
				// means the unit produced no concrete artifacts.
				if (unitOutputs.length === 0) {
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
								"Cannot complete unit: no outputs were produced. Every unit must write at least one artifact under the intent directory — either a stage artifact (stages/<stage>/... excluding units/ and state.json) or a knowledge document (knowledge/...). The track-outputs hook auto-populates `outputs:` as files are written; if your work is done but nothing was tracked, add the produced paths manually to the unit's `outputs:` frontmatter field.",
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

				setFrontmatterField(advPath, "status", "completed")
				setFrontmatterField(advPath, "completed_at", timestamp())
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

				// Merge unit worktree back to parent branch (if running in a worktree)
				// In discrete mode, parent is the stage branch; in continuous, it's the intent main branch
				const intentSlug = args.intent as string
				// Use current branch as ground truth: if we're on a stage branch, merge back
				// to the stage branch. If we're on the intent main branch, merge there.
				// This correctly handles continuous, discrete, and hybrid (where the
				// orchestrator already placed us on the right branch).
				const currentBr = getCurrentBranch()
				const onStageBranch = currentBr === `haiku/${intentSlug}/${advStage}`
				const discreteStage = onStageBranch ? advStage : undefined
				const parentBranchName = discreteStage
					? `haiku/${intentSlug}/${discreteStage}`
					: `haiku/${intentSlug}/main`
				const mergeResult = mergeUnitWorktree(
					intentSlug,
					args.unit as string,
					discreteStage,
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

				// Internally call runNext to progress the FSM
				if (_runNext) {
					const next = _runNext(args.intent as string)
					// If other units in this wave are still active, this is a no-op for this agent
					if (next.action === "continue_unit" || next.action === "blocked") {
						return text(
							`completed (last hat)${mergeNote}. Other units still in progress — waiting on wave to finish.${pushWarning(completeGit)}`,
						)
					}
					// Otherwise, return the next FSM action (next wave, phase advance, etc.)
					return text(
						JSON.stringify(
							injectPushWarning(
								{ ...next, _unit_completed: args.unit, _merge: mergeNote },
								completeGit,
							),
							null,
							2,
						),
					)
				}

				return text(
					`completed (last hat)${mergeNote}${pushWarning(completeGit)}`,
				)
			}

			// ── NOT last hat: advance to next ──
			const nextHat = stageHats[nextIdx]

			setFrontmatterField(advPath, "hat", nextHat)
			setFrontmatterField(advPath, "hat_started_at", timestamp())
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
				return text(
					JSON.stringify(
						injectPushWarning({ ...next, _hat_advanced: nextHat }, advGit),
						null,
						2,
					),
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

			const { data: failData } = parseFrontmatter(
				readFileSync(failPath, "utf8"),
			)
			const currentHat = (failData.hat as string) || ""
			const currentBolt = (failData.bolt as number) || 1

			// Enforce max bolt limit
			const MAX_BOLTS_FAIL = 5
			if (currentBolt + 1 > MAX_BOLTS_FAIL) {
				return text(
					JSON.stringify({
						error: "max_bolts_exceeded",
						bolt: currentBolt,
						max: MAX_BOLTS_FAIL,
						message: `Unit has exceeded ${MAX_BOLTS_FAIL} bolt iterations. Escalate to the user — this unit may need to be redesigned or split.`,
					}),
				)
			}

			// Resolve the hat sequence to find the previous hat
			const stageHats = resolveStageHats(args.intent as string, rejectStage)
			const hatIdx = stageHats.indexOf(currentHat)
			const prevHat = hatIdx > 0 ? stageHats[hatIdx - 1] : stageHats[0]

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

			setFrontmatterField(failPath, "hat", prevHat)
			setFrontmatterField(failPath, "bolt", currentBolt + 1)
			setFrontmatterField(failPath, "hat_started_at", timestamp())
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
			return text(
				`rejected — back to ${prevHat}, bolt ${currentBolt + 1}${pushWarning(rejectGit)}`,
			)
		}
		case "haiku_unit_increment_bolt": {
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
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
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
