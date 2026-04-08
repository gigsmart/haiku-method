// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"
import { writeHaikuMetadata, logSessionEvent, type HaikuSessionMetadata } from "./session-metadata.js"
import { mergeUnitWorktree } from "./git-worktree.js"

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

function normalizeDates(data: Record<string, unknown>): Record<string, unknown> {
	const result = { ...data }
	for (const key in result) {
		if (result[key] instanceof Date) {
			result[key] = (result[key] as Date).toISOString().split("T")[0]
		}
	}
	return result
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const { data, content } = matter(raw)
	return { data: normalizeDates(data as Record<string, unknown>), body: content.trim() }
}

export function setFrontmatterField(filePath: string, field: string, value: unknown): void {
	const raw = readFileSync(filePath, "utf8")
	const parsed = matter(raw)
	parsed.data[field] = value
	// gray-matter stringify: matter.stringify(content, data)
	writeFileSync(filePath, matter.stringify(parsed.content, normalizeDates(parsed.data as Record<string, unknown>)))
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
	writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

export function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

/**
 * Git add + commit for lifecycle state changes.
 * Non-fatal: git failures are logged but never crash the MCP.
 */
export function gitCommitState(message: string): void {
	try {
		const haikuRoot = findHaikuRoot()
		execFileSync("git", ["add", haikuRoot], { encoding: "utf8", stdio: "pipe" })
		execFileSync("git", ["commit", "-m", message, "--allow-empty"], { encoding: "utf8", stdio: "pipe" })
	} catch {
		// Git failures are non-fatal — state was already written to disk
	}
}

/** Resolve hat sequence for a stage — used by haiku_unit_fail */
function resolveStageHats(intent: string, stage: string): string[] {
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return []
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		const studio = (data.studio as string) || ""
		if (!studio) return []

		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
		for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
			const stageFile = join(base, studio, "stages", stage, "STAGE.md")
			if (!existsSync(stageFile)) continue
			const { data: stageFm } = parseFrontmatter(readFileSync(stageFile, "utf8"))
			return (stageFm.hats as string[]) || []
		}
	} catch { /* */ }
	return []
}

/** Resolve allowed unit types for a stage — used for enforcement */
function resolveAllowedUnitTypes(intent: string, stage: string): string[] {
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return []
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		const studio = (data.studio as string) || ""
		if (!studio) return []

		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
		for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
			const stageFile = join(base, studio, "stages", stage, "STAGE.md")
			if (!existsSync(stageFile)) continue
			const { data: stageFm } = parseFrontmatter(readFileSync(stageFile, "utf8"))
			return (stageFm.unit_types as string[]) || []
		}
	} catch { /* */ }
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
		for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
			const stageFile = join(base, studio, "stages", stage, "STAGE.md")
			if (!existsSync(stageFile)) continue
			const raw = readFileSync(stageFile, "utf8")
			const fm = parseFrontmatter(raw)
			const { content } = matter(raw)
			const desc = (fm.data.description as string) || stage
			const unitTypes = (fm.data.unit_types as string[]) || []
			return `[stage_scope] ${stage}: ${desc}` +
				(unitTypes.length > 0 ? ` | unit_types: ${unitTypes.join(", ")}` : "") +
				` | ${content.trim().slice(0, 500)}`
		}
	} catch { /* */ }
	return ""
}

/**
 * Collect current H·AI·K·U state and write to the caller-provided state file.
 * The state_file path is injected by the pre_tool_use hook — the MCP server
 * never resolves session IDs or config dirs. If no state_file, this is a no-op.
 */
export function syncSessionMetadata(intent: string, stateFile: string | undefined): void {
	if (!stateFile) return
	try {
		const root = findHaikuRoot()
		const intentFile = join(root, "intents", intent, "intent.md")
		if (!existsSync(intentFile)) return
		const { data: intentData } = parseFrontmatter(readFileSync(intentFile, "utf8"))
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
				for (const f of readdirSync(unitsDir).filter(f => f.endsWith(".md"))) {
					const { data: unitData } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
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
		let stageUnitTypes: string[] = []
		if (studio && activeStage) {
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
				const sf = join(base, studio, "stages", activeStage, "STAGE.md")
				if (!existsSync(sf)) continue
				const { data: stageFm } = parseFrontmatter(readFileSync(sf, "utf8"))
				stageDescription = (stageFm.description as string) || activeStage
				stageUnitTypes = (stageFm.unit_types as string[]) || []
				break
			}
		}

		writeHaikuMetadata(stateFile, {
			intent, studio, active_stage: activeStage, phase,
			active_unit: activeUnit, hat, bolt,
			stage_description: stageDescription, stage_unit_types: stageUnitTypes,
			updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
		})
	} catch { /* non-fatal */ }
}

// ── Tool definitions ───────────────────────────────────────────────────────

export const stateToolDefs = [
	// Intent tools
	{
		name: "haiku_intent_get",
		description: "Read a field from an intent's frontmatter",
		inputSchema: { type: "object" as const, properties: { slug: { type: "string" }, field: { type: "string" } }, required: ["slug", "field"] },
	},
	{
		name: "haiku_intent_list",
		description: "List all intents in the workspace",
		inputSchema: { type: "object" as const, properties: {} },
	},
	// Stage tools
	{
		name: "haiku_stage_get",
		description: "Read a field from a stage's state",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, field: { type: "string" } }, required: ["intent", "stage", "field"] },
	},
	// Unit tools
	{
		name: "haiku_unit_get",
		description: "Read a field from a unit's frontmatter",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" }, field: { type: "string" } }, required: ["intent", "stage", "unit", "field"] },
	},
	{
		name: "haiku_unit_set",
		description: "Set a field in a unit's frontmatter",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" }, field: { type: "string" }, value: { type: "string" } }, required: ["intent", "stage", "unit", "field", "value"] },
	},
	{
		name: "haiku_unit_list",
		description: "List all units in a stage with their status",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" } }, required: ["intent", "stage"] },
	},
	{
		name: "haiku_unit_start",
		description: "Mark a unit as started (sets status, bolt, hat, timestamp)",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" }, hat: { type: "string" } }, required: ["intent", "stage", "unit", "hat"] },
	},
	{
		name: "haiku_unit_complete",
		description: "Mark a unit as completed (sets status, timestamp)",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" } }, required: ["intent", "stage", "unit"] },
	},
	{
		name: "haiku_unit_advance_hat",
		description: "Advance a unit to the next hat in the sequence",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" }, hat: { type: "string" } }, required: ["intent", "stage", "unit", "hat"] },
	},
	{
		name: "haiku_unit_fail",
		description: "Hat failed — moves back one hat and increments bolt count. Called by the subagent when the hat's work doesn't meet expectations.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" } }, required: ["intent", "stage", "unit"] },
	},
	{
		name: "haiku_unit_increment_bolt",
		description: "Increment a unit's bolt counter (new iteration cycle)",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, unit: { type: "string" } }, required: ["intent", "stage", "unit"] },
	},
	// Knowledge tools
	{
		name: "haiku_knowledge_list",
		description: "List knowledge artifacts for an intent",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" } }, required: ["intent"] },
	},
	{
		name: "haiku_knowledge_read",
		description: "Read a knowledge artifact",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, name: { type: "string" } }, required: ["intent", "name"] },
	},
	// Studio tools
	{
		name: "haiku_studio_list",
		description: "List all available studios with their description, stages, and category. Project-level studios (.haiku/studios/) override built-in ones on name collision.",
		inputSchema: { type: "object" as const, properties: {} },
	},
	{
		name: "haiku_studio_get",
		description: "Read a studio's STUDIO.md — returns frontmatter fields and body text. Resolves project-level override first, then built-in.",
		inputSchema: { type: "object" as const, properties: { studio: { type: "string" } }, required: ["studio"] },
	},
	{
		name: "haiku_studio_stage_get",
		description: "Read a stage's STAGE.md from a studio — returns frontmatter fields (hats, review, requires, produces) and body text. Resolves project-level override first, then built-in.",
		inputSchema: { type: "object" as const, properties: { studio: { type: "string" }, stage: { type: "string" } }, required: ["studio", "stage"] },
	},
	// Settings tools
	{
		name: "haiku_settings_get",
		description: "Read a field from .haiku/settings.yml (e.g. studio, stack.compute, providers, workspace, default_announcements, review_agents, operations_runtime). Returns empty string if not set.",
		inputSchema: { type: "object" as const, properties: { field: { type: "string", description: "Dot-separated path (e.g. 'studio', 'stack.compute', 'review_agents')" } }, required: ["field"] },
	},
]

// ── Tool handlers ──────────────────────────────────────────────────────────

export function handleStateTool(name: string, args: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
	const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] })

	switch (name) {
		// ── Intent ──
		case "haiku_intent_get": {
			const file = join(intentDir(args.slug as string), "intent.md")
			if (!existsSync(file)) return text("")
			const { data } = parseFrontmatter(readFileSync(file, "utf8"))
			const val = data[args.field as string]
			return text(val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val))
		}
		case "haiku_intent_list": {
			const root = findHaikuRoot()
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("[]")
			const slugs = readdirSync(intentsDir).filter(d => existsSync(join(intentsDir, d, "intent.md")))
			const intents = slugs.map(slug => {
				const { data } = parseFrontmatter(readFileSync(join(intentsDir, slug, "intent.md"), "utf8"))
				return { slug, studio: data.studio, status: data.status, active_stage: data.active_stage }
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
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			if (!existsSync(path)) return text("")
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const val = data[args.field as string]
			return text(val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val))
		}
		case "haiku_unit_set": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			setFrontmatterField(path, args.field as string, args.value)
			return text("ok")
		}
		case "haiku_unit_list": {
			const dir = join(stageDir(args.intent as string, args.stage as string), "units")
			if (!existsSync(dir)) return text("[]")
			const files = readdirSync(dir).filter(f => f.endsWith(".md"))
			const units = files.map(f => {
				const { data } = parseFrontmatter(readFileSync(join(dir, f), "utf8"))
				return { name: f.replace(".md", ""), status: data.status, bolt: data.bolt, hat: data.hat }
			})
			return text(JSON.stringify(units, null, 2))
		}
		case "haiku_unit_start": {
			const uPath = unitPath(args.intent as string, args.stage as string, args.unit as string)

			// Enforce unit type matches stage's allowed unit_types
			if (existsSync(uPath)) {
				const { data: unitFm } = parseFrontmatter(readFileSync(uPath, "utf8"))
				const unitType = (unitFm.type as string) || ""
				if (unitType) {
					const allowedTypes = resolveAllowedUnitTypes(args.intent as string, args.stage as string)
					if (allowedTypes.length > 0 && !allowedTypes.includes(unitType)) {
						return text(JSON.stringify({
							error: "unit_type_not_allowed",
							unit_type: unitType,
							allowed_types: allowedTypes,
							message: `Unit type '${unitType}' is not allowed in stage '${args.stage}'. Allowed types: ${allowedTypes.join(", ")}. Convert to knowledge for downstream stages, then call haiku_run_next again.`,
						}))
					}
				}
			}

			setFrontmatterField(uPath, "status", "active")
			setFrontmatterField(uPath, "bolt", 1)
			setFrontmatterField(uPath, "hat", args.hat)
			setFrontmatterField(uPath, "started_at", timestamp())
			emitTelemetry("haiku.unit.started", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, hat: args.hat as string })
			const sf = args.state_file as string | undefined
			if (sf) logSessionEvent(sf, { event: "unit_started", intent: args.intent, stage: args.stage, unit: args.unit, hat: args.hat })
			gitCommitState(`haiku: start unit ${args.unit as string}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			const scope = resolveStageScope(args.intent as string, args.stage as string)
			return text(scope ? `ok\n\n${scope}` : "ok")
		}
		case "haiku_unit_complete": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			const unitRaw = readFileSync(path, "utf8")
			const { data: unitFm } = parseFrontmatter(unitRaw)

			// Verify the unit went through all hats
			const currentHat = (unitFm.hat as string) || ""
			const stageHats = resolveStageHats(args.intent as string, args.stage as string)
			if (stageHats.length > 0) {
				if (!currentHat) {
					return text(JSON.stringify({ error: "hat_sequence_incomplete", current_hat: "", remaining_hats: stageHats, message: `Cannot complete unit: hat sequence never started. Start with the first hat: "${stageHats[0]}".` }))
				}
				const hatIdx = stageHats.indexOf(currentHat)
				const isLastHat = hatIdx === stageHats.length - 1
				if (!isLastHat) {
					const sf = args.state_file as string | undefined
					if (sf) logSessionEvent(sf, { event: "hat_sequence_incomplete", intent: args.intent, stage: args.stage, unit: args.unit, current_hat: currentHat, expected_last: stageHats[stageHats.length - 1] })
					return text(JSON.stringify({ error: "hat_sequence_incomplete", current_hat: currentHat, remaining_hats: stageHats.slice(hatIdx + 1), message: `Cannot complete unit: hat sequence not finished. Current hat: "${currentHat}", remaining: ${stageHats.slice(hatIdx + 1).join(" → ")}. Advance through all hats before completing.` }))
				}
			}

			// Verify completion criteria are checked
			const unchecked = (unitRaw.match(/- \[ \]/g) || []).length
			if (unchecked > 0) {
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "criteria_not_met", intent: args.intent, stage: args.stage, unit: args.unit, unchecked })
				return text(JSON.stringify({ error: "criteria_not_met", unchecked, message: `Cannot complete unit: ${unchecked} completion criteria still unchecked. Address them, then call haiku_unit_complete again.` }))
			}

			// Verify declared outputs exist (paths relative to intent directory)
			const unitOutputs = (unitFm.outputs as string[]) || []
			if (unitOutputs.length > 0) {
				const iDir = intentDir(args.intent as string)
				const escaped = unitOutputs.filter(o => {
					const resolved = resolve(iDir, o)
					return !resolved.startsWith(resolve(iDir) + "/")
				})
				if (escaped.length > 0) {
					return text(JSON.stringify({ error: "unit_outputs_escaped", escaped, message: `Cannot complete unit: ${escaped.length} output path(s) escape the intent directory: ${escaped.join(", ")}. Fix the outputs in the unit frontmatter.` }))
				}
				const missing = unitOutputs.filter(o => {
					const resolved = resolve(iDir, o)
					if (!resolved.startsWith(resolve(iDir) + "/")) return false // escaped — already caught above
					return !existsSync(resolved)
				})
				if (missing.length > 0) {
					const sf = args.state_file as string | undefined
					if (sf) logSessionEvent(sf, { event: "outputs_missing", intent: args.intent, stage: args.stage, unit: args.unit, missing })
					return text(JSON.stringify({ error: "unit_outputs_missing", missing, message: `Cannot complete unit: ${missing.length} declared output(s) not found: ${missing.join(", ")}. Create them, then call haiku_unit_complete again.` }))
				}
			}

			setFrontmatterField(path, "status", "completed")
			setFrontmatterField(path, "completed_at", timestamp())
			emitTelemetry("haiku.unit.completed", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string })
			{
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "unit_completed", intent: args.intent, stage: args.stage, unit: args.unit })
			}
			gitCommitState(`haiku: complete unit ${args.unit as string}`)

			// Merge unit worktree back to intent branch (if running in a worktree)
			const mergeResult = mergeUnitWorktree(args.intent as string, args.unit as string)
			if (!mergeResult.success) {
				return text(JSON.stringify({ status: "completed_merge_failed", message: mergeResult.message }))
			}

			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			return text(mergeResult.message === "no worktree" ? "ok" : `ok (${mergeResult.message})`)
		}
		case "haiku_unit_advance_hat": {
			// Advance to the next hat. If this was the last hat, auto-complete the unit.
			const advPath = unitPath(args.intent as string, args.stage as string, args.unit as string)
			const nextHat = args.hat as string
			setFrontmatterField(advPath, "hat", nextHat)
			{
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "hat_advanced", intent: args.intent, stage: args.stage, unit: args.unit, hat: nextHat })
			}
			emitTelemetry("haiku.hat.transition", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, hat: nextHat })
			gitCommitState(`haiku: advance hat to ${nextHat} on ${args.unit as string}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			const hatScope = resolveStageScope(args.intent as string, args.stage as string)
			return text(hatScope ? `advanced to ${nextHat}\n\n${hatScope}` : `advanced to ${nextHat}`)
		}
		case "haiku_unit_fail": {
			// Hat failed — move back one hat, increment bolt count
			const failPath = unitPath(args.intent as string, args.stage as string, args.unit as string)
			const { data: failData } = parseFrontmatter(readFileSync(failPath, "utf8"))
			const currentHat = (failData.hat as string) || ""
			const currentBolt = (failData.bolt as number) || 1

			// Enforce max bolt limit
			const MAX_BOLTS_FAIL = 5
			if (currentBolt + 1 > MAX_BOLTS_FAIL) {
				return text(JSON.stringify({ error: "max_bolts_exceeded", bolt: currentBolt, max: MAX_BOLTS_FAIL, message: `Unit has exceeded ${MAX_BOLTS_FAIL} bolt iterations. Escalate to the user — this unit may need to be redesigned or split.` }))
			}

			// Resolve the hat sequence to find the previous hat
			const stageHats = resolveStageHats(args.intent as string, args.stage as string)
			const hatIdx = stageHats.indexOf(currentHat)
			const prevHat = hatIdx > 0 ? stageHats[hatIdx - 1] : stageHats[0]

			setFrontmatterField(failPath, "hat", prevHat)
			setFrontmatterField(failPath, "bolt", currentBolt + 1)
			{
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "unit_failed", intent: args.intent, stage: args.stage, unit: args.unit, from_hat: currentHat, to_hat: prevHat, bolt: currentBolt + 1 })
			}
			emitTelemetry("haiku.unit.failed", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, hat: currentHat, prev_hat: prevHat, bolt: String(currentBolt + 1) })
			gitCommitState(`haiku: fail ${args.unit as string} — back to ${prevHat}, bolt ${currentBolt + 1}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			return text(`failed — back to ${prevHat}, bolt ${currentBolt + 1}`)
		}
		case "haiku_unit_increment_bolt": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const current = (data.bolt as number) || 0

			// Enforce max bolt limit
			const MAX_BOLTS_INC = 5
			if (current + 1 > MAX_BOLTS_INC) {
				return text(JSON.stringify({ error: "max_bolts_exceeded", bolt: current, max: MAX_BOLTS_INC, message: `Unit has exceeded ${MAX_BOLTS_INC} bolt iterations. Escalate to the user — this unit may need to be redesigned or split.` }))
			}

			setFrontmatterField(path, "bolt", current + 1)
			emitTelemetry("haiku.bolt.iteration", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, bolt: String(current + 1) })
			return text(String(current + 1))
		}

		// ── Knowledge ──
		case "haiku_knowledge_list": {
			const dir = join(intentDir(args.intent as string), "knowledge")
			if (!existsSync(dir)) return text("[]")
			const files = readdirSync(dir).filter(f => f.endsWith(".md"))
			return text(JSON.stringify(files))
		}
		case "haiku_knowledge_read": {
			const path = join(intentDir(args.intent as string), "knowledge", args.name as string)
			if (!existsSync(path)) return text("")
			return text(readFileSync(path, "utf8"))
		}

		// ── Studio ──
		case "haiku_studio_list": {
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			const studios = new Map<string, Record<string, unknown>>()
			// Built-in studios first
			const builtinDir = join(pluginRoot, "studios")
			if (existsSync(builtinDir)) {
				for (const name of readdirSync(builtinDir)) {
					const studioFile = join(builtinDir, name, "STUDIO.md")
					if (existsSync(studioFile)) {
						const { data, body } = parseFrontmatter(readFileSync(studioFile, "utf8"))
						studios.set(name, { name, ...data, body: body.slice(0, 200) })
					}
				}
			}
			// Project-level overrides
			try {
				const projectDir = join(findHaikuRoot(), "studios")
				if (existsSync(projectDir)) {
					for (const name of readdirSync(projectDir)) {
						const studioFile = join(projectDir, name, "STUDIO.md")
						if (existsSync(studioFile)) {
							const { data, body } = parseFrontmatter(readFileSync(studioFile, "utf8"))
							studios.set(name, { name, ...data, body: body.slice(0, 200), source: "project" })
						}
					}
				}
			} catch { /* no .haiku dir */ }
			return text(JSON.stringify([...studios.values()], null, 2))
		}
		case "haiku_studio_get": {
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			const studioName = args.studio as string
			// Project override first
			let studioFile = ""
			try { studioFile = join(findHaikuRoot(), "studios", studioName, "STUDIO.md") } catch { /* */ }
			if (!studioFile || !existsSync(studioFile)) {
				studioFile = join(pluginRoot, "studios", studioName, "STUDIO.md")
			}
			if (!existsSync(studioFile)) return text("")
			const raw = readFileSync(studioFile, "utf8")
			const { data, body } = parseFrontmatter(raw)
			return text(JSON.stringify({ ...data, body }, null, 2))
		}
		case "haiku_studio_stage_get": {
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			const stName = args.studio as string
			const sgName = args.stage as string
			let stageFile = ""
			try { stageFile = join(findHaikuRoot(), "studios", stName, "stages", sgName, "STAGE.md") } catch { /* */ }
			if (!stageFile || !existsSync(stageFile)) {
				stageFile = join(pluginRoot, "studios", stName, "stages", sgName, "STAGE.md")
			}
			if (!existsSync(stageFile)) return text("")
			const raw = readFileSync(stageFile, "utf8")
			const { data, body } = parseFrontmatter(raw)
			return text(JSON.stringify({ ...data, body }, null, 2))
		}

		// ── Settings ──
		case "haiku_settings_get": {
			const field = args.field as string
			let settingsPath = ""
			try { settingsPath = join(findHaikuRoot(), "settings.yml") } catch { /* */ }
			if (!settingsPath || !existsSync(settingsPath)) return text("")
			const raw = readFileSync(settingsPath, "utf8")
			const settings = parseYaml(raw)
			const val = getNestedField(settings, field)
			if (val == null) return text("")
			return text(typeof val === "object" ? JSON.stringify(val) : String(val))
		}

		default:
			return text(`Unknown tool: ${name}`)
	}
}
