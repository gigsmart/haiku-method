// state-tools.ts — H·AI·K·U resource MCP tools
//
// One tool per resource per operation. Under the hood: frontmatter + JSON files.
// The caller doesn't need to know file paths — just resource identifiers.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"
import { writeHaikuMetadata, logSessionEvent } from "./session-metadata.js"
import { mergeUnitWorktree, getCurrentBranch } from "./git-worktree.js"

// ── Environment detection ──────────────────────────────────────────────────

/** Cached flag: are we in a git repository? Detected once at startup. */
let _isGitRepo: boolean | null = null

export function isGitRepo(): boolean {
	if (_isGitRepo !== null) return _isGitRepo
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8", stdio: "pipe" })
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
 * Git add + commit + push for lifecycle state changes.
 * No-op in non-git environments (filesystem mode).
 * Non-fatal: git failures are logged but never crash the MCP.
 */
export function gitCommitState(message: string): { committed: boolean; pushed: boolean; pushError?: string } {
	if (!isGitRepo()) return { committed: false, pushed: false } // Filesystem mode — no git operations
	try {
		const haikuRoot = findHaikuRoot()
		execFileSync("git", ["add", haikuRoot], { encoding: "utf8", stdio: "pipe" })
		execFileSync("git", ["commit", "-m", message, "--allow-empty"], { encoding: "utf8", stdio: "pipe" })
		try {
			execFileSync("git", ["push"], { encoding: "utf8", stdio: "pipe" })
			return { committed: true, pushed: true }
		} catch (pushErr) {
			const pushError = pushErr instanceof Error ? pushErr.message : String(pushErr)
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
export function validateBranch(intent: string, expectedType: "intent" | "unit", unit?: string): string {
	if (!isGitRepo()) return "" // No branch enforcement in filesystem mode
	const current = getCurrentBranch()
	if (!current) return ""

	if (expectedType === "intent") {
		const expected = `haiku/${intent}/main`
		if (current !== expected) {
			return `⚠️ WRONG BRANCH: Expected '${expected}' but on '${current}'. Run \`git checkout ${expected}\` to switch to the intent branch. Custom branch names break the H·AI·K·U lifecycle.`
		}
	} else if (expectedType === "unit" && unit) {
		const expectedUnit = `haiku/${intent}/${unit}`
		const expectedIntent = `haiku/${intent}/main`
		// Unit work can happen on the unit branch (worktree) or intent branch (non-worktree mode)
		if (current !== expectedUnit && current !== expectedIntent) {
			return `⚠️ WRONG BRANCH: Expected '${expectedUnit}' or '${expectedIntent}' but on '${current}'. Ensure you're working in the correct worktree.`
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
function injectPushWarning(obj: Record<string, unknown>, result: ReturnType<typeof gitCommitState>): Record<string, unknown> {
	if (result.pushed || !result.committed) return obj
	return { ...obj, push_failed: true, push_error: result.pushError || "unknown error", message: `${obj.message || ""}. ⚠️ GIT PUSH FAILED: ${result.pushError || "unknown error"}. Run \`git pull --rebase && git push\` to resolve.` }
}

/**
 * Callback for runNext — registered by orchestrator at startup to avoid circular imports.
 * Used by advance_hat to internally progress the FSM after unit completion.
 */
let _runNext: ((slug: string) => { action: string; [key: string]: unknown }) | null = null
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
function findUnitFile(intent: string, unit: string): { path: string; stage: string } | null {
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
		description: "Mark a unit as started. The system resolves the stage and first hat internally.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, unit: { type: "string" } }, required: ["intent", "unit"] },
	},
	{
		name: "haiku_unit_advance_hat",
		description: "Advance a unit to the next hat in the sequence. When called on the last hat, auto-completes the unit and progresses the FSM. The system resolves the current hat, next hat, and stage internally.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, unit: { type: "string" } }, required: ["intent", "unit"] },
	},
	{
		name: "haiku_unit_reject_hat",
		description: "Reject the current hat's work — moves back to the previous hat and increments bolt. The system resolves stage and hat positions internally.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" }, unit: { type: "string" } }, required: ["intent", "unit"] },
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
	// Aggregate / report tools
	{
		name: "haiku_dashboard",
		description: "Returns a formatted dashboard of all intents showing status, studio, active stage, mode, and per-stage status tables.",
		inputSchema: { type: "object" as const, properties: {} },
	},
	{
		name: "haiku_capacity",
		description: "Returns a capacity report grouped by studio — completed/active counts and median bolt counts per stage.",
		inputSchema: { type: "object" as const, properties: { studio: { type: "string", description: "Optional: filter to a specific studio" } } },
	},
	{
		name: "haiku_reflect",
		description: "Returns detailed reflection data for an intent — per-stage summaries, unit completion counts, bolt counts, and analysis instructions.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string" } }, required: ["intent"] },
	},
	{
		name: "haiku_review",
		description: "Runs a git diff against main/upstream and returns formatted pre-delivery code review instructions with diff, stats, review guidelines, and review-agent config.",
		inputSchema: { type: "object" as const, properties: { intent: { type: "string", description: "Optional: intent slug for context" } } },
	},
	{
		name: "haiku_backlog",
		description: "Manage the backlog: list items, add new items, review items interactively, or promote items to intents.",
		inputSchema: { type: "object" as const, properties: { action: { type: "string", description: "list | add | review | promote (default: list)" }, description: { type: "string", description: "Description for the new backlog item (used with add)" } } },
	},
	{
		name: "haiku_seed",
		description: "Manage seeds (future ideas): list by status, plant a new seed, or check planted seeds for trigger conditions.",
		inputSchema: { type: "object" as const, properties: { action: { type: "string", description: "list | plant | check (default: list)" } } },
	},
	{
		name: "haiku_release_notes",
		description: "Extract release notes from CHANGELOG.md — a specific version or the 5 most recent entries.",
		inputSchema: { type: "object" as const, properties: { version: { type: "string", description: "Optional: specific version to extract (e.g. '1.2.0')" } } },
	},
	{
		name: "haiku_repair",
		description: "Scan intents for metadata issues (missing fields, invalid studios, stages mismatch, legacy fields, unit naming). Returns a diagnostic report with fixes.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Specific intent slug to scan, or omit to scan all" },
			},
		},
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
			// Resolve stage and first hat internally
			const stage = resolveActiveStage(args.intent as string)
			if (!stage) return text(JSON.stringify({ error: "no_active_stage", message: "No active stage found for this intent. Call haiku_run_next first." }))
			const uPath = unitPath(args.intent as string, stage, args.unit as string)
			const stageHats = resolveStageHats(args.intent as string, stage)
			const firstHat = stageHats[0] || ""

			// Enforce unit type matches stage's allowed unit_types
			if (existsSync(uPath)) {
				const { data: unitFm } = parseFrontmatter(readFileSync(uPath, "utf8"))
				const unitType = (unitFm.type as string) || ""
				if (unitType) {
					const allowedTypes = resolveAllowedUnitTypes(args.intent as string, stage)
					if (allowedTypes.length > 0 && !allowedTypes.includes(unitType)) {
						return text(JSON.stringify({
							error: "unit_type_not_allowed",
							unit_type: unitType,
							allowed_types: allowedTypes,
							message: `Unit type '${unitType}' is not allowed in stage '${stage}'. Allowed types: ${allowedTypes.join(", ")}. Convert to knowledge for downstream stages, then call haiku_run_next again.`,
						}))
					}
				}
			}

			setFrontmatterField(uPath, "status", "active")
			setFrontmatterField(uPath, "bolt", 1)
			setFrontmatterField(uPath, "hat", firstHat)
			setFrontmatterField(uPath, "started_at", timestamp())
			setFrontmatterField(uPath, "hat_started_at", timestamp())
			emitTelemetry("haiku.unit.started", { intent: args.intent as string, stage, unit: args.unit as string, hat: firstHat })
			const sf = args.state_file as string | undefined
			if (sf) logSessionEvent(sf, { event: "unit_started", intent: args.intent, stage, unit: args.unit, hat: firstHat })
			const gitResult = gitCommitState(`haiku: start unit ${args.unit as string}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			const scope = resolveStageScope(args.intent as string, stage)
			return text((scope ? `ok\n\n${scope}` : "ok") + pushWarning(gitResult))
		}
		case "haiku_unit_advance_hat": {
			// Resolve stage and unit path internally
			const unitInfo = findUnitFile(args.intent as string, args.unit as string)
			if (!unitInfo) return text(JSON.stringify({ error: "unit_not_found", message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.` }))
			const advPath = unitInfo.path
			const advStage = unitInfo.stage

			const unitRaw = readFileSync(advPath, "utf8")
			const { data: unitFm } = parseFrontmatter(unitRaw)
			const currentHat = (unitFm.hat as string) || ""

			// ── Hat backpressure: prevent rapid-fire advancement ──
			const hatStartedAt = unitFm.hat_started_at as string | undefined
			if (hatStartedAt) {
				const elapsed = (Date.now() - new Date(hatStartedAt).getTime()) / 1000
				if (elapsed < 30) {
					return text(JSON.stringify({ error: "hat_too_fast", elapsed_seconds: Math.round(elapsed), minimum_seconds: 30, message: "Cannot advance hat — the current hat started less than 30 seconds ago. Each hat must do meaningful work before advancing." }))
				}
			}

			// ── Validate declared outputs exist (every hat transition) ──
			const unitOutputs = (unitFm.outputs as string[]) || []
			if (unitOutputs.length > 0) {
				const iDir = intentDir(args.intent as string)
				const escaped = unitOutputs.filter(o => {
					const resolved = resolve(iDir, o)
					return !resolved.startsWith(resolve(iDir) + "/")
				})
				if (escaped.length > 0) {
					return text(JSON.stringify({ error: "unit_outputs_escaped", escaped, message: `Cannot advance hat: ${escaped.length} output path(s) escape the intent directory: ${escaped.join(", ")}. Fix the outputs in the unit frontmatter.` }))
				}
				const missing = unitOutputs.filter(o => {
					const resolved = resolve(iDir, o)
					if (!resolved.startsWith(resolve(iDir) + "/")) return false // escaped — already caught above
					return !existsSync(resolved)
				})
				if (missing.length > 0) {
					const sf = args.state_file as string | undefined
					if (sf) logSessionEvent(sf, { event: "outputs_missing", intent: args.intent, stage: advStage, unit: args.unit, missing })
					return text(JSON.stringify({ error: "unit_outputs_missing", missing, message: `Cannot advance hat: ${missing.length} declared output(s) not found: ${missing.join(", ")}. Create them or remove them from the outputs list.` }))
				}
			}

			// Resolve hat sequence
			const stageHats = resolveStageHats(args.intent as string, advStage)
			const currentIdx = stageHats.indexOf(currentHat)
			const nextIdx = currentIdx + 1
			const isLastHat = nextIdx >= stageHats.length

			if (isLastHat) {
				// ── AUTO-COMPLETE: This was the last hat ──

				// Verify completion criteria are checked
				const unchecked = (unitRaw.match(/- \[ \]/g) || []).length
				if (unchecked > 0) {
					const sf = args.state_file as string | undefined
					if (sf) logSessionEvent(sf, { event: "criteria_not_met", intent: args.intent, stage: advStage, unit: args.unit, unchecked })
					return text(JSON.stringify({ error: "criteria_not_met", unchecked, message: `Cannot complete unit: ${unchecked} completion criteria still unchecked. Address them, then call haiku_unit_advance_hat again.` }))
				}

				setFrontmatterField(advPath, "status", "completed")
				setFrontmatterField(advPath, "completed_at", timestamp())
				emitTelemetry("haiku.unit.completed", { intent: args.intent as string, stage: advStage, unit: args.unit as string })
				{
					const sf = args.state_file as string | undefined
					if (sf) logSessionEvent(sf, { event: "unit_completed", intent: args.intent, stage: advStage, unit: args.unit })
				}
				const completeGit = gitCommitState(`haiku: complete unit ${args.unit as string}`)

				// Merge unit worktree back to intent branch (if running in a worktree)
				const mergeResult = mergeUnitWorktree(args.intent as string, args.unit as string)
				if (!mergeResult.success) {
					const worktreePath = join(process.cwd(), ".haiku", "worktrees", args.intent as string, args.unit as string)
					return text(JSON.stringify({
						action: "merge_conflict",
						status: "completed_merge_failed",
						intent: args.intent,
						unit: args.unit,
						worktree: worktreePath,
						error: mergeResult.message,
						message: `Unit completed but merge to intent branch failed: ${mergeResult.message}. ` +
							`RESOLVE: cd to the intent branch (\`git checkout haiku/${args.intent}/main\`), ` +
							`merge manually (\`git merge haiku/${args.intent}/${args.unit} --no-edit\`), resolve any conflicts, ` +
							`then commit and push. If you cannot resolve, ask the user for help.`,
					}, null, 2))
				}

				syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
				const mergeNote = mergeResult.message === "no worktree" ? "" : ` (${mergeResult.message})`

				// Internally call runNext to progress the FSM
				if (_runNext) {
					const next = _runNext(args.intent as string)
					// If other units in this wave are still active, this is a no-op for this agent
					if (next.action === "continue_unit" || next.action === "blocked") {
						return text(`completed (last hat)${mergeNote}. Other units still in progress — waiting on wave to finish.${pushWarning(completeGit)}`)
					}
					// Otherwise, return the next FSM action (next wave, phase advance, etc.)
					return text(JSON.stringify(injectPushWarning({ ...next, _unit_completed: args.unit, _merge: mergeNote }, completeGit), null, 2))
				}

				return text(`completed (last hat)${mergeNote}${pushWarning(completeGit)}`)
			}

			// ── NOT last hat: advance to next ──
			const nextHat = stageHats[nextIdx]

			setFrontmatterField(advPath, "hat", nextHat)
			setFrontmatterField(advPath, "hat_started_at", timestamp())
			{
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "hat_advanced", intent: args.intent, stage: advStage, unit: args.unit, hat: nextHat })
			}
			emitTelemetry("haiku.hat.transition", { intent: args.intent as string, stage: advStage, unit: args.unit as string, hat: nextHat })
			const advGit = gitCommitState(`haiku: advance hat to ${nextHat} on ${args.unit as string}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			// Internally call runNext — returns continue_unit with next hat context for the parent
			if (_runNext) {
				const next = _runNext(args.intent as string)
				return text(JSON.stringify(injectPushWarning({ ...next, _hat_advanced: nextHat }, advGit), null, 2))
			}

			const hatScope = resolveStageScope(args.intent as string, advStage)
			return text((hatScope ? `advanced to ${nextHat}\n\n${hatScope}` : `advanced to ${nextHat}`) + pushWarning(advGit))
		}
		case "haiku_unit_reject_hat": {
			// Hat failed — move back one hat, increment bolt count
			const rejectInfo = findUnitFile(args.intent as string, args.unit as string)
			if (!rejectInfo) return text(JSON.stringify({ error: "unit_not_found", message: `Unit '${args.unit}' not found in any stage of intent '${args.intent}'.` }))
			const failPath = rejectInfo.path
			const rejectStage = rejectInfo.stage

			const { data: failData } = parseFrontmatter(readFileSync(failPath, "utf8"))
			const currentHat = (failData.hat as string) || ""
			const currentBolt = (failData.bolt as number) || 1

			// Enforce max bolt limit
			const MAX_BOLTS_FAIL = 5
			if (currentBolt + 1 > MAX_BOLTS_FAIL) {
				return text(JSON.stringify({ error: "max_bolts_exceeded", bolt: currentBolt, max: MAX_BOLTS_FAIL, message: `Unit has exceeded ${MAX_BOLTS_FAIL} bolt iterations. Escalate to the user — this unit may need to be redesigned or split.` }))
			}

			// Resolve the hat sequence to find the previous hat
			const stageHats = resolveStageHats(args.intent as string, rejectStage)
			const hatIdx = stageHats.indexOf(currentHat)
			const prevHat = hatIdx > 0 ? stageHats[hatIdx - 1] : stageHats[0]

			setFrontmatterField(failPath, "hat", prevHat)
			setFrontmatterField(failPath, "bolt", currentBolt + 1)
			setFrontmatterField(failPath, "hat_started_at", timestamp())
			{
				const sf = args.state_file as string | undefined
				if (sf) logSessionEvent(sf, { event: "unit_failed", intent: args.intent, stage: rejectStage, unit: args.unit, from_hat: currentHat, to_hat: prevHat, bolt: currentBolt + 1 })
			}
			emitTelemetry("haiku.unit.failed", { intent: args.intent as string, stage: rejectStage, unit: args.unit as string, hat: currentHat, prev_hat: prevHat, bolt: String(currentBolt + 1) })
			const rejectGit = gitCommitState(`haiku: fail ${args.unit as string} — back to ${prevHat}, bolt ${currentBolt + 1}`)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			return text(`rejected — back to ${prevHat}, bolt ${currentBolt + 1}${pushWarning(rejectGit)}`)
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

		// ── Dashboard ──
		case "haiku_dashboard": {
			let root: string
			try { root = findHaikuRoot() } catch { return text("No intents found. Use /haiku:start to create one.") }
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("No intents found. Use /haiku:start to create one.")
			const slugs = readdirSync(intentsDir).filter(d => existsSync(join(intentsDir, d, "intent.md")))
			if (slugs.length === 0) return text("No intents found. Use /haiku:start to create one.")

			let out = "# Dashboard\n"
			for (const slug of slugs) {
				const { data } = parseFrontmatter(readFileSync(join(intentsDir, slug, "intent.md"), "utf8"))
				out += `\n## ${slug}\n`
				out += `- Status: ${data.status || "unknown"}\n`
				out += `- Studio: ${data.studio || "none"}\n`
				out += `- Active Stage: ${data.active_stage || "none"}\n`
				out += `- Mode: ${data.mode || "interactive"}\n`

				const stagesPath = join(intentsDir, slug, "stages")
				if (existsSync(stagesPath)) {
					const stages = readdirSync(stagesPath).filter(s => existsSync(join(stagesPath, s, "state.json")))
					if (stages.length > 0) {
						out += `\n| Stage | Status | Phase |\n|-------|--------|-------|\n`
						for (const s of stages) {
							const state = readJson(join(stagesPath, s, "state.json"))
							out += `| ${s} | ${state.status || "pending"} | ${state.phase || ""} |\n`
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
			try { root = findHaikuRoot() } catch { return text("No .haiku directory found.") }
			const intentsDir = join(root, "intents")
			if (!existsSync(intentsDir)) return text("No intents found.")
			const slugs = readdirSync(intentsDir).filter(d => existsSync(join(intentsDir, d, "intent.md")))

			const median = (arr: number[]): number => {
				if (arr.length === 0) return 0
				const sorted = [...arr].sort((a, b) => a - b)
				const mid = Math.floor(sorted.length / 2)
				return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
			}

			// Group intents by studio
			const byStudio = new Map<string, Array<{ slug: string; status: string; data: Record<string, unknown> }>>()
			for (const slug of slugs) {
				const { data } = parseFrontmatter(readFileSync(join(intentsDir, slug, "intent.md"), "utf8"))
				const studio = (data.studio as string) || "unassigned"
				if (filterStudio && studio !== filterStudio) continue
				if (!byStudio.has(studio)) byStudio.set(studio, [])
				byStudio.get(studio)!.push({ slug, status: (data.status as string) || "unknown", data })
			}

			if (byStudio.size === 0) return text(filterStudio ? `No intents found for studio '${filterStudio}'.` : "No intents found.")

			let out = "# Capacity Report\n"
			for (const [studio, intents] of byStudio) {
				const completed = intents.filter(i => i.status === "completed").length
				const active = intents.filter(i => i.status === "active").length
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
						for (const f of readdirSync(unitsDir).filter(f => f.endsWith(".md"))) {
							const { data: ud } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
							if (typeof ud.bolt === "number") stageBolts.get(stage)!.push(ud.bolt)
						}
					}
				}

				if (stageBolts.size > 0) {
					out += `\n| Stage | Units | Median Bolts |\n|-------|-------|--------------|\n`
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
			try { root = findHaikuRoot() } catch { return text("No .haiku directory found.") }
			const intentFile = join(root, "intents", intentSlug, "intent.md")
			if (!existsSync(intentFile)) return text(`Intent '${intentSlug}' not found.`)

			const { data: intentData } = parseFrontmatter(readFileSync(intentFile, "utf8"))
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
						const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
						let completedUnits = 0
						let totalBolts = 0
						const unitDetails: string[] = []
						for (const f of unitFiles) {
							const { data: ud } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
							const uName = f.replace(".md", "")
							const uBolt = (ud.bolt as number) || 0
							totalBolts += uBolt
							if (ud.status === "completed") completedUnits++
							unitDetails.push(`  - ${uName}: status=${ud.status || "pending"}, bolts=${uBolt}, hat=${ud.hat || "none"}`)
						}
						out += `- Units: ${completedUnits}/${unitFiles.length} completed, Total bolts: ${totalBolts}\n`
						if (unitDetails.length > 0) out += unitDetails.join("\n") + "\n"
					}
				}
			}

			out += "\n## Analysis Instructions\n"
			out += "1. Execution patterns — which units went smoothly, which required retries\n"
			out += "2. Criteria satisfaction\n"
			out += "3. Process observations\n"
			out += "4. Blocker analysis\n"
			out += "\n## Output\n"
			out += "Write reflection.md and settings-recommendations.md to the intent directory.\n"
			return text(out)
		}

		// ── Review ──
		case "haiku_review": {
			// Determine diff base
			let base = "main"
			try {
				const upstream = spawnSync("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], { encoding: "utf8", stdio: "pipe" })
				if (upstream.status === 0 && upstream.stdout.trim()) {
					base = upstream.stdout.trim()
				}
			} catch { /* fallback to main */ }

			// Get diff, stat, and changed files
			let diff = ""
			let stat = ""
			let changedFiles = ""
			try {
				const diffResult = spawnSync("git", ["diff", base + "...HEAD"], { encoding: "utf8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 })
				diff = diffResult.stdout || ""
				const statResult = spawnSync("git", ["diff", "--stat", base + "...HEAD"], { encoding: "utf8", stdio: "pipe" })
				stat = statResult.stdout || ""
				const namesResult = spawnSync("git", ["diff", "--name-only", base + "...HEAD"], { encoding: "utf8", stdio: "pipe" })
				changedFiles = namesResult.stdout || ""
			} catch { /* git not available */ }

			// Truncate diff at 100k chars
			const MAX_DIFF = 100_000
			if (diff.length > MAX_DIFF) {
				diff = diff.slice(0, MAX_DIFF) + "\n\n... [TRUNCATED at 100k chars] ..."
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
					if (agents) reviewAgents = `\n### Review Agents Config\n\`\`\`json\n${JSON.stringify(agents, null, 2)}\n\`\`\`\n`
				}
			} catch { /* no settings */ }

			let out = "## Pre-Delivery Code Review\n"
			out += `Diff base: ${base}\n\n`
			out += `Changed files:\n\`\`\`\n${changedFiles || "none"}\`\`\`\n\n`
			out += `Diff stats:\n\`\`\`\n${stat || "none"}\`\`\`\n`
			if (reviewGuidelines) out += `\n### Review Guidelines\n${reviewGuidelines}\n`
			if (reviewAgents) out += reviewAgents
			out += `\n### Full Diff\n\`\`\`diff\n${diff || "No changes detected."}\n\`\`\`\n`
			out += "\n### Instructions\n"
			out += "1. Spawn review agents in parallel (one per configured agent or area)\n"
			out += "2. Collect findings, deduplicate across agents\n"
			out += "3. Fix all HIGH severity findings before delivery\n"
			out += "4. Report findings summary to the user\n"
			return text(out)
		}

		// ── Backlog ──
		case "haiku_backlog": {
			const action = (args.action as string) || "list"
			let root: string
			try { root = findHaikuRoot() } catch { return text("No .haiku directory found.") }
			const backlogDir = join(root, "backlog")

			switch (action) {
				case "list": {
					if (!existsSync(backlogDir)) return text("No backlog items found.")
					const files = readdirSync(backlogDir).filter(f => f.endsWith(".md"))
					if (files.length === 0) return text("No backlog items found.")

					let out = "# Backlog\n\n| # | Item | Priority | Created |\n|---|------|----------|---------|\n"
					for (let i = 0; i < files.length; i++) {
						const { data } = parseFrontmatter(readFileSync(join(backlogDir, files[i]), "utf8"))
						out += `| ${i + 1} | ${files[i].replace(".md", "")} | ${data.priority || "unset"} | ${data.created_at || "unknown"} |\n`
					}
					return text(out)
				}
				case "add": {
					const desc = (args.description as string) || ""
					let out = "## Add Backlog Item\n\n"
					out += "Create a new file in `.haiku/backlog/` with this template:\n\n"
					out += "```markdown\n---\npriority: medium\ncreated_at: " + timestamp() + "\n---\n\n"
					out += (desc || "Description of the backlog item") + "\n```\n"
					out += "\nFilename should be a slug of the item description (e.g. `improve-error-handling.md`).\n"
					return text(out)
				}
				case "review": {
					if (!existsSync(backlogDir)) return text("No backlog items to review.")
					const files = readdirSync(backlogDir).filter(f => f.endsWith(".md"))
					if (files.length === 0) return text("No backlog items to review.")

					let out = "## Backlog Review\n\nPresent each item to the user and ask: **Keep / Reprioritize / Drop / Promote / Skip**\n\n"
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
					out += "2. Use /haiku:start to create an intent from its description\n"
					out += "3. Delete the backlog file after the intent is created\n"
					return text(out)
				}
				default:
					return text(`Unknown backlog action: '${action}'. Valid actions: list, add, review, promote.`)
			}
		}

		// ── Seed ──
		case "haiku_seed": {
			const action = (args.action as string) || "list"
			let root: string
			try { root = findHaikuRoot() } catch { return text("No .haiku directory found.") }
			const seedsDir = join(root, "seeds")

			switch (action) {
				case "list": {
					if (!existsSync(seedsDir)) return text("No seeds found.")
					const files = readdirSync(seedsDir).filter(f => f.endsWith(".md"))
					if (files.length === 0) return text("No seeds found.")

					// Group by status
					const groups = new Map<string, Array<{ name: string; data: Record<string, unknown> }>>()
					for (const f of files) {
						const { data } = parseFrontmatter(readFileSync(join(seedsDir, f), "utf8"))
						const status = (data.status as string) || "planted"
						if (!groups.has(status)) groups.set(status, [])
						groups.get(status)!.push({ name: f.replace(".md", ""), data })
					}

					let out = "# Seeds\n"
					for (const [status, seeds] of groups) {
						out += `\n## ${status.charAt(0).toUpperCase() + status.slice(1)} (${seeds.length})\n\n`
						out += "| Seed | Trigger | Planted |\n|------|---------|----------|\n"
						for (const s of seeds) {
							out += `| ${s.name} | ${s.data.trigger || "none"} | ${s.data.created_at || "unknown"} |\n`
						}
					}
					return text(out)
				}
				case "plant": {
					let out = "## Plant a Seed\n\n"
					out += "Create a new file in `.haiku/seeds/` with this template:\n\n"
					out += "```markdown\n---\nstatus: planted\ntrigger: \"<condition that should cause this to surface>\"\ncreated_at: " + timestamp() + "\n---\n\n"
					out += "Description of the idea or future work.\n```\n"
					out += "\nFilename should be a slug of the seed idea (e.g. `add-caching-layer.md`).\n"
					return text(out)
				}
				case "check": {
					if (!existsSync(seedsDir)) return text("No seeds to check.")
					const files = readdirSync(seedsDir).filter(f => f.endsWith(".md"))
					const planted = files.filter(f => {
						const { data } = parseFrontmatter(readFileSync(join(seedsDir, f), "utf8"))
						return (data.status as string) === "planted"
					})
					if (planted.length === 0) return text("No planted seeds to check.")

					let out = "## Seed Check\n\nEvaluate each planted seed's trigger condition against the current project state:\n\n"
					for (const f of planted) {
						const { data, body } = parseFrontmatter(readFileSync(join(seedsDir, f), "utf8"))
						out += `### ${f.replace(".md", "")}\n`
						out += `- Trigger: ${data.trigger || "none defined"}\n`
						out += `- Description: ${body.slice(0, 300)}\n\n`
					}
					out += "---\nFor each seed: if the trigger condition is met, update its status to 'surfaced'. If not, leave as 'planted'.\n"
					return text(out)
				}
				default:
					return text(`Unknown seed action: '${action}'. Valid actions: list, plant, check.`)
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
					if (existsSync(p)) { changelogPath = p; break }
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
			let match: RegExpExecArray | null
			while ((match = versionPattern.exec(changelog)) !== null) {
				matches.push({ version: match[1], start: match.index })
			}

			if (matches.length === 0) return text("No versioned entries found in CHANGELOG.md.")

			if (version) {
				// Find the specific version
				const idx = matches.findIndex(m => m.version === version)
				if (idx === -1) return text(`Version '${version}' not found in CHANGELOG.md. Available: ${matches.slice(0, 10).map(m => m.version).join(", ")}`)
				const endIdx = idx + 1 < matches.length ? matches[idx + 1].start : changelog.length
				const section = changelog.slice(matches[idx].start, endIdx).trim()
				return text(`# Release Notes\n\n${section}\n\n---\nTotal releases in changelog: ${matches.length}`)
			}

			// Return 5 most recent
			const recent = matches.slice(0, 5)
			let out = "# Recent Release Notes\n"
			for (let i = 0; i < recent.length; i++) {
				const endIdx = i + 1 < matches.length ? matches[i + 1].start : changelog.length
				out += "\n" + changelog.slice(recent[i].start, endIdx).trim() + "\n"
			}
			out += `\n---\nTotal releases in changelog: ${matches.length}\n`
			return text(out)
		}

		case "haiku_repair": {
			// ── Repair: scan intents for metadata issues ──
			let root: string
			try {
				root = findHaikuRoot()
			} catch {
				return text("No .haiku/ directory found.")
			}

			// Resolve available studios: name → stage names
			const repairStudioMap = new Map<string, string[]>()
			const repairPluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			const repairSearchPaths = [join(root, "studios"), join(repairPluginRoot, "studios")]
			for (const base of repairSearchPaths) {
				if (!existsSync(base)) continue
				for (const d of readdirSync(base, { withFileTypes: true })) {
					if (!d.isDirectory() || repairStudioMap.has(d.name)) continue
					const studioMd = join(base, d.name, "STUDIO.md")
					if (!existsSync(studioMd)) continue
					const { data: stData } = parseFrontmatter(readFileSync(studioMd, "utf8"))
					const stStages = Array.isArray(stData.stages) ? (stData.stages as string[]) : []
					repairStudioMap.set(d.name, stStages)
				}
			}

			// Collect intent slugs to scan
			const repairIntentsDir = join(root, "intents")
			if (!existsSync(repairIntentsDir)) return text("No intents directory found.")

			interface RepairIssue {
				intent: string
				field: string
				severity: "error" | "warning"
				message: string
				fix: string
			}

			let repairSlugs: string[]
			const repairIntentArg = args.intent as string | undefined
			if (repairIntentArg) {
				if (/[/\\]|\.\./.test(repairIntentArg)) return text(`Invalid intent slug: "${repairIntentArg}"`)
				if (!existsSync(join(repairIntentsDir, repairIntentArg, "intent.md"))) {
					return text(`Intent '${repairIntentArg}' not found.`)
				}
				repairSlugs = [repairIntentArg]
			} else {
				repairSlugs = readdirSync(repairIntentsDir, { withFileTypes: true })
					.filter(d => d.isDirectory() && existsSync(join(repairIntentsDir, d.name, "intent.md")))
					.map(d => d.name)
			}

			if (repairSlugs.length === 0) return text("No intents found.")

			// Scan each intent
			const allRepairIssues: RepairIssue[] = []
			const cleanRepairIntents: string[] = []
			const repairUnitPattern = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

			for (const slug of repairSlugs) {
				const repairIntentPath = join(repairIntentsDir, slug, "intent.md")
				const repairRaw = readFileSync(repairIntentPath, "utf8")
				const { data: repairData } = parseFrontmatter(repairRaw)
				const issues: RepairIssue[] = []

				// a. Missing title
				if (!repairData.title || (typeof repairData.title === "string" && repairData.title.trim() === "")) {
					issues.push({ intent: slug, field: "title", severity: "error", message: "Missing title field", fix: "Add `title` field with a descriptive name" })
				}

				// b. Missing studio
				if (!repairData.studio) {
					issues.push({ intent: slug, field: "studio", severity: "error", message: "Missing studio field", fix: "Set `studio` to an available studio" })
				}

				// c. Invalid studio
				const repairStudio = repairData.studio as string | undefined
				if (repairStudio && !repairStudioMap.has(repairStudio)) {
					const available = Array.from(repairStudioMap.keys()).join(", ")
					issues.push({ intent: slug, field: "studio", severity: "error", message: `Studio '${repairStudio}' not found`, fix: `Studio '${repairStudio}' not found. Available: ${available}` })
				}

				// d. Missing stages
				const repairStages = repairData.stages
				if (!Array.isArray(repairStages) || repairStages.length === 0) {
					if (repairStudio && repairStudioMap.has(repairStudio)) {
						const expected = repairStudioMap.get(repairStudio)!.join(", ")
						issues.push({ intent: slug, field: "stages", severity: "error", message: "Missing or empty stages array", fix: `Set \`stages\` to match studio definition: [${expected}]` })
					} else {
						issues.push({ intent: slug, field: "stages", severity: "error", message: "Missing or empty stages array", fix: "Set `stages` to match studio definition" })
					}
				}

				// e. Stages mismatch
				if (Array.isArray(repairStages) && repairStages.length > 0 && repairStudio && repairStudioMap.has(repairStudio)) {
					const expected = repairStudioMap.get(repairStudio)!
					const actual = repairStages as string[]
					if (JSON.stringify(expected) !== JSON.stringify(actual)) {
						issues.push({ intent: slug, field: "stages", severity: "warning", message: "Stages don't match studio definition", fix: `Stages don't match studio definition. Expected: [${expected.join(", ")}], got: [${actual.join(", ")}]` })
					}
				}

				// f. Missing status
				if (!repairData.status) {
					issues.push({ intent: slug, field: "status", severity: "error", message: "Missing status field", fix: "Set `status` to 'active' or 'completed'" })
				}

				// g. Missing mode
				if (!repairData.mode) {
					issues.push({ intent: slug, field: "mode", severity: "error", message: "Missing mode field", fix: "Set `mode` to 'continuous' or 'discrete'" })
				}

				// h. Legacy created field
				if (repairData.created && !repairData.created_at) {
					issues.push({ intent: slug, field: "created", severity: "warning", message: "Legacy `created` field found", fix: "Rename `created` to `created_at`" })
				}

				// i. Missing created_at
				if (!repairData.created && !repairData.created_at) {
					issues.push({ intent: slug, field: "created_at", severity: "warning", message: "Missing created_at field", fix: "Add `created_at` with an ISO date" })
				}

				// j. Invalid active_stage
				if (repairData.active_stage && Array.isArray(repairStages) && repairStages.length > 0) {
					if (!repairStages.includes(repairData.active_stage)) {
						issues.push({ intent: slug, field: "active_stage", severity: "error", message: `active_stage '${repairData.active_stage}' not in stages list`, fix: `active_stage '${repairData.active_stage}' not in stages list` })
					}
				}

				// k. Missing active_stage for active intents
				if (repairData.status === "active" && !repairData.active_stage) {
					issues.push({ intent: slug, field: "active_stage", severity: "warning", message: "Active intent has no active_stage", fix: "Active intent has no active_stage. Set to the first stage." })
				}

				// l. Stage state consistency
				if (Array.isArray(repairStages) && repairStages.length > 0) {
					const repairStagesDir = join(repairIntentsDir, slug, "stages")
					const repairActiveStage = repairData.active_stage as string | undefined
					const validStatuses = ["pending", "active", "completed"]
					for (const stageName of repairStages as string[]) {
						const repairStageDir = join(repairStagesDir, stageName)
						const repairStateFile = join(repairStageDir, "state.json")
						if (existsSync(repairStateFile)) {
							const state = readJson(repairStateFile)
							if (state.status && !validStatuses.includes(state.status as string)) {
								issues.push({ intent: slug, field: `stages/${stageName}/state.json`, severity: "error", message: `Invalid stage status: '${state.status}'`, fix: `Set status to one of: ${validStatuses.join(", ")}` })
							}
						} else if (existsSync(repairStageDir) && repairActiveStage) {
							const activeIdx = (repairStages as string[]).indexOf(repairActiveStage)
							const thisIdx = (repairStages as string[]).indexOf(stageName)
							if (thisIdx < activeIdx) {
								issues.push({ intent: slug, field: `stages/${stageName}/state.json`, severity: "warning", message: "Stage directory exists but has no state.json (before active_stage)", fix: `Create state.json with {"status": "pending", "phase": "elaborate"}` })
							}
						}
					}
				}

				// m. Unit filename format
				if (Array.isArray(repairStages)) {
					for (const stageName of repairStages as string[]) {
						const repairUnitsDir = join(repairIntentsDir, slug, "stages", stageName, "units")
						if (!existsSync(repairUnitsDir)) continue
						for (const f of readdirSync(repairUnitsDir, { withFileTypes: true })) {
							if (!f.isFile() || !f.name.endsWith(".md")) continue
							if (!repairUnitPattern.test(f.name)) {
								issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}`, severity: "warning", message: `Unit filename doesn't match expected pattern`, fix: "Rename to match pattern: unit-NN-slug-name.md" })
							}
						}
					}
				}

				// n. Unit required fields
				if (Array.isArray(repairStages)) {
					for (const stageName of repairStages as string[]) {
						const repairUnitsDir = join(repairIntentsDir, slug, "stages", stageName, "units")
						if (!existsSync(repairUnitsDir)) continue
						for (const f of readdirSync(repairUnitsDir, { withFileTypes: true })) {
							if (!f.isFile() || !f.name.endsWith(".md")) continue
							const unitRaw = readFileSync(join(repairUnitsDir, f.name), "utf8")
							const { data: unitData } = parseFrontmatter(unitRaw)
							if (!unitData.type) {
								issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}:type`, severity: "warning", message: `Unit missing 'type' field`, fix: "Add `type` field to unit frontmatter" })
							}
							if (!unitData.status) {
								issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}:status`, severity: "warning", message: `Unit missing 'status' field`, fix: "Add `status` field to unit frontmatter" })
							}
						}
					}
				}

				// o. Missing unit inputs — every unit must declare its inputs
				if (Array.isArray(repairStages)) {
					for (const stageName of repairStages as string[]) {
						const repairUnitsDir = join(repairIntentsDir, slug, "stages", stageName, "units")
						if (!existsSync(repairUnitsDir)) continue

						// Resolve available upstream artifacts (if stage has inputs declared)
						const existingUpstreamPaths: string[] = []
						if (repairStudio) {
							let stageInputs: Array<{ stage: string; discovery?: string; output?: string }> | null = null
							for (const base of repairSearchPaths) {
								const stageMd = join(base, repairStudio, "stages", stageName, "STAGE.md")
								if (!existsSync(stageMd)) continue
								const { data: stageData } = parseFrontmatter(readFileSync(stageMd, "utf8"))
								if (Array.isArray(stageData.inputs) && stageData.inputs.length > 0) {
									stageInputs = stageData.inputs as Array<{ stage: string; discovery?: string; output?: string }>
								}
								break
							}
							if (stageInputs) {
								const intentPath = join(repairIntentsDir, slug)
								for (const input of stageInputs) {
									for (const base of repairSearchPaths) {
										for (const kind of ["discovery", "outputs"] as const) {
											const artifactDir = join(base, repairStudio, "stages", input.stage, kind)
											if (!existsSync(artifactDir)) continue
											for (const f of readdirSync(artifactDir).filter(af => af.endsWith(".md"))) {
												const raw = readFileSync(join(artifactDir, f), "utf8")
												const { data: aData } = parseFrontmatter(raw)
												const aName = (aData.name as string) || f.replace(/\.md$/, "")
												const wanted = kind === "outputs" ? input.output : input.discovery
												if (aName !== wanted) continue
												const loc = (aData.location as string) || ""
												if (!loc) continue
												const relPath = loc.replace(/^\.haiku\/intents\/\{intent-slug\}\//, "")
												const absPath = join(intentPath, relPath)
												if (existsSync(absPath)) existingUpstreamPaths.push(relPath)
											}
										}
									}
								}
							}
						}

						for (const f of readdirSync(repairUnitsDir, { withFileTypes: true })) {
							if (!f.isFile() || !f.name.endsWith(".md")) continue
							const unitRaw = readFileSync(join(repairUnitsDir, f.name), "utf8")
							const { data: unitData } = parseFrontmatter(unitRaw)
							const unitInputs = (unitData.inputs as string[]) || (unitData.refs as string[]) || []
							if (unitInputs.length === 0) {
								const fix = existingUpstreamPaths.length > 0
									? `Add \`inputs:\` with upstream paths: ${existingUpstreamPaths.join(", ")}`
									: `Add \`inputs:\` with at minimum the intent doc and discovery docs`
								issues.push({
									intent: slug,
									field: `stages/${stageName}/units/${f.name}:inputs`,
									severity: "error",
									message: `Unit has no \`inputs:\` — execution will be blocked`,
									fix,
								})
							}
						}
					}
				}

				if (issues.length === 0) {
					cleanRepairIntents.push(slug)
				} else {
					allRepairIssues.push(...issues)
				}
			}

			// No issues
			if (allRepairIssues.length === 0) {
				return text("All intents passed validation. No repairs needed.")
			}

			// Build diagnostic report
			const issuesByIntent = new Map<string, RepairIssue[]>()
			for (const issue of allRepairIssues) {
				const list = issuesByIntent.get(issue.intent) || []
				list.push(issue)
				issuesByIntent.set(issue.intent, list)
			}

			const reportLines: string[] = [
				"# Intent Repair Report",
				"",
				`Scanned ${repairSlugs.length} intent(s). Found ${allRepairIssues.length} issue(s).`,
				"",
			]

			for (const [slug, issues] of issuesByIntent) {
				const errors = issues.filter(i => i.severity === "error").length
				const warnings = issues.filter(i => i.severity === "warning").length
				reportLines.push(`## ${slug} — ${errors} errors, ${warnings} warnings`)
				reportLines.push("")
				reportLines.push("| # | Severity | Field | Issue | Fix |")
				reportLines.push("|---|----------|-------|-------|-----|")
				issues.forEach((issue, idx) => {
					reportLines.push(`| ${idx + 1} | ${issue.severity} | ${issue.field} | ${issue.message} | ${issue.fix} |`)
				})
				reportLines.push("")
			}

			if (cleanRepairIntents.length > 0) {
				reportLines.push("## Intents with no issues")
				for (const slug of cleanRepairIntents) {
					reportLines.push(`- ${slug}`)
				}
				reportLines.push("")
			}

			reportLines.push(
				"---",
				"",
				"Fix the issues listed above. For each intent:",
				"1. Read the intent.md file",
				"2. Apply the fixes listed in the report",
				"3. For field renames, remove the old field and add the new one",
				"4. For stages mismatches, update the stages array",
				"5. For missing state.json, create them",
				"6. After fixing each intent, report what you changed",
				"",
				"Do NOT auto-fix without confirming with the user first.",
			)

			return text(reportLines.join("\n"))
		}

		default:
			return text(`Unknown tool: ${name}`)
	}
}
