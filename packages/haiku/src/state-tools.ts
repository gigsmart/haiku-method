// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"

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

function unitPath(slug: string, stage: string, unit: string): string {
	const name = unit.endsWith(".md") ? unit : `${unit}.md`
	return join(stageDir(slug, stage), "units", name)
}

function stageStatePath(slug: string, stage: string): string {
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

function setFrontmatterField(filePath: string, field: string, value: unknown): void {
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

function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {}
	return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path: string, data: Record<string, unknown>): void {
	mkdirSync(join(path, ".."), { recursive: true })
	writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

/**
 * Git add + commit for lifecycle state changes.
 * Non-fatal: git failures are logged but never crash the MCP.
 */
function gitCommitState(message: string): void {
	try {
		const haikuRoot = findHaikuRoot()
		execSync(`git add "${haikuRoot}"`, { encoding: "utf8", stdio: "pipe" })
		execSync(`git commit -m "${message}" --allow-empty`, { encoding: "utf8", stdio: "pipe" })
	} catch {
		// Git failures are non-fatal — state was already written to disk
	}
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
		name: "haiku_intent_set",
		description: "Set a field in an intent's frontmatter",
		inputSchema: { type: "object" as const, properties: { slug: { type: "string" }, field: { type: "string" }, value: { type: "string" } }, required: ["slug", "field", "value"] },
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
	{
		name: "haiku_stage_set",
		description: "Set a field in a stage's state",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, field: { type: "string" }, value: { type: "string" } }, required: ["intent", "stage", "field", "value"] },
	},
	{
		name: "haiku_stage_start",
		description: "Mark a stage as started (sets status, phase, timestamp)",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" } }, required: ["intent", "stage"] },
	},
	{
		name: "haiku_stage_complete",
		description: "Mark a stage as completed (sets status, timestamp, gate outcome)",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, stage: { type: "string" }, gate_outcome: { type: "string", enum: ["advanced", "paused", "blocked", "awaiting"] } }, required: ["intent", "stage"] },
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
		case "haiku_intent_set": {
			const file = join(intentDir(args.slug as string), "intent.md")
			setFrontmatterField(file, args.field as string, args.value)
			return text("ok")
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
		case "haiku_stage_set": {
			const path = stageStatePath(args.intent as string, args.stage as string)
			const data = readJson(path)
			data[args.field as string] = args.value
			writeJson(path, data)
			// Emit telemetry for phase transitions and gate events
			if (args.field === "phase") {
				emitTelemetry("haiku.stage.phase", { intent: args.intent as string, stage: args.stage as string, phase: args.value as string })
			} else if (args.field === "gate_entered_at") {
				emitTelemetry("haiku.gate.entered", { intent: args.intent as string, stage: args.stage as string })
			}
			return text("ok")
		}
		case "haiku_stage_start": {
			const path = stageStatePath(args.intent as string, args.stage as string)
			const data = readJson(path)
			data.stage = args.stage
			data.status = "active"
			data.phase = "decompose"
			data.started_at = timestamp()
			data.completed_at = null
			data.gate_entered_at = null
			data.gate_outcome = null
			writeJson(path, data)
			emitTelemetry("haiku.stage.started", { intent: args.intent as string, stage: args.stage as string })
			gitCommitState(`haiku: start stage ${args.stage as string}`)
			return text("ok")
		}
		case "haiku_stage_complete": {
			const path = stageStatePath(args.intent as string, args.stage as string)
			const data = readJson(path)
			data.status = "completed"
			data.completed_at = timestamp()
			data.gate_outcome = (args.gate_outcome as string) || "advanced"
			writeJson(path, data)
			emitTelemetry("haiku.stage.completed", { intent: args.intent as string, stage: args.stage as string, gate_outcome: data.gate_outcome as string })
			gitCommitState(`haiku: complete stage ${args.stage as string}`)
			return text("ok")
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
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			setFrontmatterField(path, "status", "active")
			setFrontmatterField(path, "bolt", 1)
			setFrontmatterField(path, "hat", args.hat)
			setFrontmatterField(path, "started_at", timestamp())
			emitTelemetry("haiku.unit.started", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, hat: args.hat as string })
			gitCommitState(`haiku: start unit ${args.unit as string}`)
			return text("ok")
		}
		case "haiku_unit_complete": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			// Verify completion criteria are checked before allowing completion
			const unitRaw = readFileSync(path, "utf8")
			const unchecked = (unitRaw.match(/- \[ \]/g) || []).length
			if (unchecked > 0) {
				return text(JSON.stringify({ error: "criteria_not_met", unchecked, message: `Cannot complete unit: ${unchecked} completion criteria still unchecked` }))
			}
			setFrontmatterField(path, "status", "completed")
			setFrontmatterField(path, "completed_at", timestamp())
			emitTelemetry("haiku.unit.completed", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string })
			gitCommitState(`haiku: complete unit ${args.unit as string}`)
			return text("ok")
		}
		case "haiku_unit_advance_hat": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			setFrontmatterField(path, "hat", args.hat)
			emitTelemetry("haiku.hat.transition", { intent: args.intent as string, stage: args.stage as string, unit: args.unit as string, hat: args.hat as string })
			return text("ok")
		}
		case "haiku_unit_increment_bolt": {
			const path = unitPath(args.intent as string, args.stage as string, args.unit as string)
			const { data } = parseFrontmatter(readFileSync(path, "utf8"))
			const current = (data.bolt as number) || 0
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
