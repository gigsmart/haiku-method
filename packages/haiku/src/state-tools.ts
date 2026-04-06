// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { emitTelemetry } from "./telemetry.js"

// ── Path resolution ────────────────────────────────────────────────────────

function findHaikuRoot(): string {
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

function intentDir(slug: string): string {
	return join(findHaikuRoot(), "intents", slug)
}

function stageDir(slug: string, stage: string): string {
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

function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) return { data: {}, body: raw }
	const data: Record<string, unknown> = {}
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^([\w][\w-]*):\s*(.*)$/)
		if (kv) {
			const [, k, v] = kv
			if (v === "null") data[k] = null
			else if (v === "true") data[k] = true
			else if (v === "false") data[k] = false
			else if (/^-?\d+$/.test(v)) data[k] = parseInt(v, 10)
			else if (v.startsWith("[") && v.endsWith("]")) {
				data[k] = v.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
			} else {
				data[k] = v.replace(/^["']|["']$/g, "")
			}
		}
	}
	return { data, body: match[2].trim() }
}

function setFrontmatterField(filePath: string, field: string, value: unknown): void {
	const raw = readFileSync(filePath, "utf8")
	const { data, body } = parseFrontmatter(raw)
	data[field] = value
	const lines = Object.entries(data).map(([k, v]) => {
		if (v === null) return `${k}: null`
		if (Array.isArray(v)) return `${k}: [${v.join(", ")}]`
		return `${k}: ${v}`
	})
	writeFileSync(filePath, `---\n${lines.join("\n")}\n---\n${body ? `\n${body}` : ""}`)
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

		default:
			return text(`Unknown tool: ${name}`)
	}
}
