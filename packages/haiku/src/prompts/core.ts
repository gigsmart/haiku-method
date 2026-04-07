// prompts/core.ts — Core workflow prompt handlers
//
// Registers the 5 core prompts: haiku:new, haiku:run, haiku:refine, haiku:review, haiku:reflect
// Each handler reads state, optionally triggers side effects, and returns PromptMessage[].

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { McpError, ErrorCode, type GetPromptResult } from "@modelcontextprotocol/sdk/types.js"
import { registerPrompt } from "./index.js"
import { completeIntentSlug, completeStage } from "./completions.js"
import { textMsg, singleMessage, readJson, studioSearchPaths, findActiveIntents, validateIdentifier } from "./helpers.js"
import { findHaikuRoot, intentDir, parseFrontmatter } from "../state-tools.js"
import { runNext, type OrchestratorAction } from "../orchestrator.js"

/** Resolve intent slug from argument or auto-detect from .haiku/intents/ */
function resolveIntent(args: Record<string, string>): { slug: string } | { error: GetPromptResult } {
	if (args.intent) {
		validateIdentifier(args.intent, "intent slug")
		const dir = intentDir(args.intent)
		if (!existsSync(join(dir, "intent.md"))) {
			throw new McpError(ErrorCode.InvalidParams, `Intent not found: ${args.intent}`)
		}
		return { slug: args.intent }
	}

	// Auto-detect using shared helper
	const active = findActiveIntents()
	if (active.length === 0) {
		return { error: singleMessage("No active intent found. Create one with /haiku:new") }
	}
	if (active.length > 1) {
		return { error: singleMessage(`Multiple active intents found: ${active.map(a => a.slug).join(", ")}. Specify one with the intent argument.`) }
	}
	return { slug: active[0].slug }
}

/** Read a studio stage definition file */
function readStageDef(studio: string, stage: string): { data: Record<string, unknown>; body: string } | null {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	for (const base of studioSearchPaths()) {
		const file = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(file)) {
			return parseFrontmatter(readFileSync(file, "utf8"))
		}
	}
	return null
}

/** Read all hat definitions for a stage (project overrides plugin for same-named hats) */
function readHatDefs(studio: string, stage: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const hats: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const hatsDir = join(base, studio, "stages", stage, "hats")
		if (!existsSync(hatsDir)) continue
		for (const f of readdirSync(hatsDir).filter(f => f.endsWith(".md"))) {
			hats[f.replace(/\.md$/, "")] = readFileSync(join(hatsDir, f), "utf8")
		}
	}
	return hats
}

/** Read review agent definitions for a stage (project overrides plugin for same-named agents) */
function readReviewAgentDefs(studio: string, stage: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const agents: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const agentsDir = join(base, studio, "stages", stage, "review-agents")
		if (!existsSync(agentsDir)) continue
		for (const f of readdirSync(agentsDir).filter(f => f.endsWith(".md"))) {
			agents[f.replace(/\.md$/, "")] = readFileSync(join(agentsDir, f), "utf8")
		}
	}
	return agents
}

/** List studios with their metadata (project overrides plugin for same-named studios) */
function listStudios(): Array<{ name: string; data: Record<string, unknown>; body: string }> {
	const seen = new Map<string, { name: string; data: Record<string, unknown>; body: string }>()
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		if (!existsSync(base)) continue
		for (const d of readdirSync(base, { withFileTypes: true })) {
			if (!d.isDirectory()) continue
			const file = join(base, d.name, "STUDIO.md")
			if (!existsSync(file)) continue
			const { data, body } = parseFrontmatter(readFileSync(file, "utf8"))
			seen.set(d.name, { name: d.name, data, body })
		}
	}
	return Array.from(seen.values())
}

// ── haiku:run ───────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:run",
	title: "Run Intent",
	description: "Advance an H·AI·K·U intent through its next stage",
	arguments: [
		{
			name: "intent",
			description: "Intent slug (auto-detected if omitted)",
			required: false,
			completer: completeIntentSlug,
		},
	],
	handler: async (args) => {
		const resolved = resolveIntent(args)
		if ("error" in resolved) return resolved.error

		const slug = resolved.slug
		const action = runNext(slug)

		// Read intent metadata for context
		const dir = intentDir(slug)
		const intentRaw = readFileSync(join(dir, "intent.md"), "utf8")
		const { data: intentData, body: intentBody } = parseFrontmatter(intentRaw)
		const studio = (intentData.studio as string) || "ideation"
		const mode = (intentData.mode as string) || "continuous"

		// Build context message (Message 1)
		const contextParts = [
			`Intent: ${slug}`,
			`Studio: ${studio}`,
			`Mode: ${mode}`,
			`Status: ${intentData.status}`,
			`Active Stage: ${intentData.active_stage || "(none)"}`,
			`Action: ${action.action}`,
		]
		if (action.stage) contextParts.push(`Stage: ${action.stage as string}`)
		if (action.unit) contextParts.push(`Unit: ${action.unit as string}`)
		if (action.hat) contextParts.push(`Hat: ${action.hat as string}`)
		if (action.bolt) contextParts.push(`Bolt: ${action.bolt as string}`)
		const contextText = contextParts.join("\n")

		// Build action-specific instructions
		const instructions = buildRunInstructions(slug, studio, action, dir, intentBody)

		return {
			messages: [
				textMsg("user", contextText),
				textMsg("assistant", `I'll proceed with the "${action.action}" action for intent "${slug}".`),
				textMsg("user", instructions),
			],
		}
	},
})

function buildRunInstructions(
	slug: string,
	studio: string,
	action: OrchestratorAction,
	dir: string,
	intentBody: string,
): string {
	const actionJson = JSON.stringify(action, null, 2)
	const sections: string[] = []

	sections.push(`## Orchestrator Action\n\n\`\`\`json\n${actionJson}\n\`\`\``)

	switch (action.action) {
		case "start_stage": {
			const stage = action.stage as string
			const hats = (action.hats as string[]) || []
			const stageDef = readStageDef(studio, stage)
			sections.push(`## Stage: ${stage}`)
			sections.push(`Hats: ${hats.join(" -> ")}`)
			if (stageDef) {
				sections.push(`### Stage Definition\n\n${stageDef.body}`)
			}
			if (action.follows) {
				sections.push(
					`### Follow-up Context\n\nThis intent follows "${action.follows}". ` +
					`Load parent knowledge artifacts: ${JSON.stringify(action.parent_knowledge)}`,
				)
			}
			sections.push(
				`### Instructions\n\n` +
				`1. Call \`haiku_stage_start { intent: "${slug}", stage: "${stage}" }\`\n` +
				(action.follows
					? `2. Load parent knowledge via \`haiku_knowledge_read\` for each file in parent_knowledge\n3. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`
					: `2. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`),
			)
			break
		}

		case "decompose": {
			const stage = action.stage as string
			const elaboration = (action.elaboration as string) || "collaborative"
			const stageDef = readStageDef(studio, stage)

			sections.push(`## Elaborate Stage: ${stage}`)
			sections.push(`Elaboration mode: **${elaboration}**`)

			if (stageDef) {
				sections.push(`### Stage Definition\n\n${stageDef.body}`)
				if (stageDef.data.inputs) {
					sections.push(`### Inputs\n\n${JSON.stringify(stageDef.data.inputs)}`)
				}
			}

			// Load discovery definitions
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
				const discoveryDir = join(base, studio, "stages", stage, "discovery")
				if (!existsSync(discoveryDir)) continue
				const files = readdirSync(discoveryDir).filter(f => f.endsWith(".md"))
				if (files.length > 0) {
					sections.push(`### Discovery Definitions\n`)
					for (const f of files) {
						const content = readFileSync(join(discoveryDir, f), "utf8")
						sections.push(`#### ${f}\n\n${content}`)
					}
				}
				break
			}

			if (elaboration === "collaborative") {
				sections.push(
					`### Collaborative Elaboration Instructions\n\n` +
					`This is a **multi-turn conversation**. You MUST:\n` +
					`- Engage the user iteratively -- ask questions, get answers, refine\n` +
					`- Ask about architecture preferences, constraints, priorities, unknowns\n` +
					`- Probe for edge cases and non-obvious requirements\n` +
					`- Validate assumptions before writing them into units\n` +
					`- Present options and tradeoffs when decisions are needed\n` +
					`- Use \`ask_user_visual_question\` for rich content (specs, wireframes, comparisons)\n` +
					`- Continue until both you and the user are confident the plan is solid\n\n` +
					`After units are written, call \`open_review { intent_dir: "${dir}", review_type: "intent" }\` to present the plan. ` +
					`This blocks until the user responds.\n\n` +
					`After approval: \`haiku_stage_set { intent: "${slug}", stage: "${stage}", field: "phase", value: "execute" }\`\n` +
					`Then call \`haiku_run_next { intent: "${slug}" }\``,
				)
			} else {
				sections.push(
					`### Autonomous Elaboration Instructions\n\n` +
					`Elaborate the work into units with completion criteria and a dependency DAG.\n` +
					`Write unit files to \`.haiku/intents/${slug}/stages/${stage}/units/\`.\n` +
					`Call \`open_review { intent_dir: "${dir}", review_type: "intent" }\` to present the final plan. This blocks until the user responds.\n\n` +
					`After approval: \`haiku_stage_set { intent: "${slug}", stage: "${stage}", field: "phase", value: "execute" }\`\n` +
					`Then call \`haiku_run_next { intent: "${slug}" }\``,
				)
			}
			break
		}

		case "start_unit":
		case "continue_unit": {
			const stage = action.stage as string
			const unit = (action.unit as string) || ""
			const hat = (action.hat as string) || (action.first_hat as string) || ""
			const hats = (action.hats as string[]) || []
			const bolt = (action.bolt as number) || 1

			// Load stage definition for scope constraints
			const stageDef = readStageDef(studio, stage)
			const stageDesc = stageDef?.data?.description as string || stage
			const stageOutputTypes = (stageDef?.data?.unit_types as string[]) || []

			// Load unit content
			const unitsDir = join(dir, "stages", stage, "units")
			const unitFile = join(unitsDir, unit.endsWith(".md") ? unit : `${unit}.md`)
			let unitContent = ""
			let unitRefs: string[] = []
			if (existsSync(unitFile)) {
				const raw = readFileSync(unitFile, "utf8")
				const { data, body } = parseFrontmatter(raw)
				unitContent = body
				unitRefs = (data.refs as string[]) || []
			}

			// Load hat definition
			const hatDefs = readHatDefs(studio, stage)
			const hatContent = hatDefs[hat] || `No hat definition found for "${hat}"`

			sections.push(`## Unit: ${unit}`)
			sections.push(`Hat: ${hat} (${hats.join(" -> ")})`)
			sections.push(`Bolt: ${bolt}`)

			sections.push(`### Unit Spec\n\n${unitContent}`)
			sections.push(`### Hat Definition: ${hat}\n\n${hatContent}`)

			// Include ref content
			if (unitRefs.length > 0) {
				sections.push(`### Referenced Artifacts\n`)
				const dirResolved = resolve(dir)
				for (const ref of unitRefs) {
					const refPath = join(dir, ref)
					const refResolved = resolve(dir, ref)
					if (!refResolved.startsWith(dirResolved)) continue
					if (existsSync(refPath)) {
						const content = readFileSync(refPath, "utf8")
						sections.push(`#### ${ref}\n\n${content.slice(0, 2000)}${content.length > 2000 ? "\n...(truncated)" : ""}`)
					} else {
						sections.push(`#### ${ref}\n\n(not found)`)
					}
				}
			}

			// Stage scope constraint — prevents agents from doing work that belongs to downstream stages
			const scopeConstraint =
				`### Stage Scope: ${stage}\n\n` +
				`**${stageDesc}**\n\n` +
				`CRITICAL: You are in the **${stage}** stage. Your work MUST be limited to this stage's purpose.\n` +
				`- Inception/design/product stages produce **knowledge artifacts only** (discovery docs, specs, unit files, design briefs) — do NOT write code, config, or implementation files.\n` +
				`- Development stage produces **code and tests** — do NOT deploy or create infrastructure.\n` +
				`- Operations stage produces **deployment and monitoring config** — do NOT modify application code.\n` +
				`- Security stage produces **threat assessments and security tests** — do NOT refactor application code.\n\n` +
				`If a unit's completion criteria require work outside this stage's scope, mark the criteria as validated (inception) or flag it for a downstream stage — do NOT implement it here.`

			sections.push(scopeConstraint)

			if (action.action === "start_unit") {
				sections.push(
					`### Instructions\n\n` +
					`1. \`haiku_unit_start { intent: "${slug}", stage: "${stage}", unit: "${unit}", hat: "${hat}" }\`\n` +
					`2. Execute the hat's work — stay within the ${stage} stage's scope (see above)\n` +
					`3. When done, advance to next hat or complete the unit\n` +
					`4. Call \`haiku_run_next { intent: "${slug}" }\``,
				)
			} else {
				sections.push(
					`### Instructions\n\n` +
					`1. Continue the "${hat}" hat's work — stay within the ${stage} stage's scope (see above)\n` +
					`2. When hat work is done: \`haiku_unit_advance_hat { intent: "${slug}", stage: "${stage}", unit: "${unit}", hat: "<next_hat>" }\`\n` +
					`3. After all hats, check completion criteria\n` +
					`4. If met: \`haiku_unit_complete { intent: "${slug}", stage: "${stage}", unit: "${unit}" }\`\n` +
					`5. If not: \`haiku_unit_increment_bolt { intent: "${slug}", stage: "${stage}", unit: "${unit}" }\`\n` +
					`6. Call \`haiku_run_next { intent: "${slug}" }\``,
				)
			}
			break
		}

		case "start_units": {
			const stage = action.stage as string
			const units = (action.units as string[]) || []
			const hats = (action.hats as string[]) || []
			const firstHat = (action.first_hat as string) || hats[0] || ""

			// Load stage definition for scope constraints
			const parStageDef = readStageDef(studio, stage)
			const parStageDesc = parStageDef?.data?.description as string || stage

			sections.push(`## Parallel Execution: ${units.length} units`)
			sections.push(`Stage: ${stage} — ${parStageDesc}`)
			sections.push(`Hat sequence: ${hats.join(" -> ")}`)
			sections.push(`Units: ${units.join(", ")}`)

			sections.push(
				`### Stage Scope\n\n` +
				`CRITICAL: All agents are in the **${stage}** stage. They MUST stay within this stage's scope.\n` +
				`Inception/design/product stages produce **knowledge artifacts only** — no code, config, or implementation.\n` +
				`Development produces code. Operations produces infra. Security produces assessments.\n\n` +
				`### Instructions\n\n` +
				`Spawn an Agent per unit using the Agent tool with \`isolation: "worktree"\`.\n` +
				`Each agent runs the full hat sequence for its unit autonomously.\n` +
				`Include the stage scope constraint in each agent's prompt.\n\n` +
				units.map(u =>
					`- **${u}**: \`haiku_unit_start { intent: "${slug}", stage: "${stage}", unit: "${u}", hat: "${firstHat}" }\``,
				).join("\n") +
				`\n\nWait for all agents to complete, then call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "advance_phase": {
			const stage = action.stage as string
			const toPhase = action.to_phase as string
			sections.push(
				`## Advance Phase\n\n` +
				`1. \`haiku_stage_set { intent: "${slug}", stage: "${stage}", field: "phase", value: "${toPhase}" }\`\n` +
				`2. Call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "review": {
			const stage = action.stage as string
			const agents = readReviewAgentDefs(studio, stage)
			sections.push(`## Adversarial Review: ${stage}`)

			if (Object.keys(agents).length > 0) {
				sections.push(`### Review Agents\n`)
				for (const [name, content] of Object.entries(agents)) {
					sections.push(`#### ${name}\n\n${content}`)
				}
			}

			sections.push(
				`### Instructions\n\n` +
				`1. Spawn one subagent per review agent (in parallel), each with the diff and stage outputs\n` +
				`2. Collect findings; if HIGH severity, fix and re-review (up to 3 cycles)\n` +
				`3. \`haiku_stage_set { intent: "${slug}", stage: "${stage}", field: "phase", value: "gate" }\`\n` +
				`4. \`haiku_stage_set { intent: "${slug}", stage: "${stage}", field: "gate_entered_at", value: "${new Date().toISOString()}" }\`\n` +
				`5. Call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "gate_ask": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string | null

			sections.push(
				`## Gate: Awaiting Approval\n\n` +
				`Stage "${stage}" is complete and awaiting your approval to advance` +
				(nextStage ? ` to "${nextStage}"` : "") + `.\n\n` +
				`### Instructions\n\n` +
				`CRITICAL: You MUST call \`open_review\` immediately as your first action. Do NOT skip this step.\n\n` +
				`1. Call \`open_review { intent_dir: "${dir}", review_type: "intent" }\` — this blocks until the user responds\n` +
				`2. If approved: \`haiku_gate_approve { intent: "${slug}", stage: "${stage}" }\` then \`haiku_run_next { intent: "${slug}" }\`\n` +
				`3. If changes_requested: analyze annotations and route to /haiku:refine for the appropriate upstream stage`,
			)
			break
		}

		case "gate_external": {
			const stage = action.stage as string
			sections.push(
				`## Gate: External Review\n\n` +
				`Stage "${stage}" is complete. Push for external review.\n\n` +
				`### Instructions\n\n` +
				`1. Push the branch and commit stage artifacts\n` +
				`2. Share the review URL with the reviewer\n` +
				`3. \`haiku_stage_complete { intent: "${slug}", stage: "${stage}", gate_outcome: "blocked" }\``,
			)
			break
		}

		case "gate_await": {
			const stage = action.stage as string
			sections.push(
				`## Gate: Awaiting External Event\n\n` +
				`Stage "${stage}" is complete, waiting for an external event.\n\n` +
				`### Instructions\n\n` +
				`1. Report what is being awaited\n` +
				`2. \`haiku_stage_complete { intent: "${slug}", stage: "${stage}", gate_outcome: "awaiting" }\`\n` +
				`3. Stop. Run /haiku:run when the event occurs.`,
			)
			break
		}

		case "advance_stage": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Advance Stage\n\n` +
				`Gate passed. Moving from "${stage}" to "${nextStage}".\n\n` +
				`### Instructions\n\n` +
				`1. \`haiku_stage_complete { intent: "${slug}", stage: "${stage}", gate_outcome: "advanced" }\`\n` +
				`2. \`haiku_intent_set { slug: "${slug}", field: "active_stage", value: "${nextStage}" }\`\n` +
				`3. Call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "stage_complete_discrete": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Stage Complete (Discrete Mode)\n\n` +
				`Stage "${stage}" is complete.\n\n` +
				`### Instructions\n\n` +
				`1. \`haiku_stage_complete { intent: "${slug}", stage: "${stage}", gate_outcome: "advanced" }\`\n` +
				`2. \`haiku_intent_set { slug: "${slug}", field: "active_stage", value: "${nextStage}" }\`\n` +
				`3. Report: "Stage complete. Run /haiku:run to start '${nextStage}'."`,
			)
			break
		}

		case "intent_complete": {
			sections.push(
				`## Intent Complete\n\n` +
				`All stages are done for intent "${slug}".\n\n` +
				`### Instructions\n\n` +
				`1. \`haiku_intent_set { slug: "${slug}", field: "status", value: "completed" }\`\n` +
				`2. \`haiku_intent_set { slug: "${slug}", field: "completed_at", value: "${new Date().toISOString().split("T")[0]}" }\`\n` +
				`3. Report completion summary. Suggest /haiku:review then PR creation.`,
			)
			break
		}

		case "blocked": {
			const blockedUnits = (action.blocked_units as string[]) || []
			sections.push(
				`## Blocked\n\n` +
				`Units are blocked: ${blockedUnits.join(", ")}\n\n` +
				`### Instructions\n\n` +
				`Report which units are blocked and why. Ask the user for guidance.`,
			)
			break
		}

		case "composite_run_stage": {
			const stage = action.stage as string
			const compositeStudio = action.studio as string
			const hats = (action.hats as string[]) || []
			sections.push(
				`## Composite: Run ${compositeStudio}:${stage}\n\n` +
				`Hats: ${hats.join(" -> ")}\n\n` +
				`Follow the same instructions as start_stage, but for this composite studio:stage pair.\n\n` +
				`1. \`haiku_stage_start { intent: "${slug}", stage: "${stage}" }\`\n` +
				`2. Call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "error": {
			sections.push(`## Error\n\n${action.message}`)
			break
		}

		case "complete": {
			sections.push(`## Already Complete\n\n${action.message}`)
			break
		}

		default: {
			sections.push(`## Unknown Action: ${action.action}\n\n${JSON.stringify(action, null, 2)}`)
			break
		}
	}

	return sections.join("\n\n")
}

// ── haiku:new ───────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:new",
	title: "New Intent",
	description: "Start a new H·AI·K·U intent with studio and stage configuration",
	arguments: [
		{
			name: "description",
			description: "What you want to accomplish (free text)",
			required: false,
		},
	],
	handler: async (args) => {
		// Check for project-level studio constraint
		let projectStudio = ""
		try {
			const root = findHaikuRoot()
			const settingsPath = join(root, "settings.yml")
			if (existsSync(settingsPath)) {
				const raw = readFileSync(settingsPath, "utf8")
				const { data } = parseFrontmatter(`---\n${raw}\n---\n`)
				if (typeof data.studio === "string") projectStudio = data.studio
			}
		} catch {
			// No .haiku dir yet -- that's fine for new intent
		}

		// Check for active intents
		let activeIntents: string[] = []
		try {
			const root = findHaikuRoot()
			const intentsDir = join(root, "intents")
			if (existsSync(intentsDir)) {
				activeIntents = readdirSync(intentsDir, { withFileTypes: true })
					.filter(d => d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")))
					.filter(d => {
						const { data } = parseFrontmatter(readFileSync(join(intentsDir, d.name, "intent.md"), "utf8"))
						return data.status === "active"
					})
					.map(d => d.name)
			}
		} catch {
			// No workspace yet
		}

		// List available studios for the agent to recommend from
		const studios = listStudios()
		const studioSummary = studios.map(s =>
			`- **${s.name}**: ${s.data.description || ""} (stages: ${JSON.stringify(s.data.stages)}, category: ${s.data.category || "general"})`,
		).join("\n")

		// Build the instruction payload
		const contextParts: string[] = []

		if (args.description) {
			contextParts.push(`## Intent Description\n\n${args.description}`)
		}

		if (activeIntents.length > 0) {
			contextParts.push(
				`## Warning: Active Intents\n\n` +
				`The following intents are currently active: ${activeIntents.join(", ")}.\n` +
				`Confirm with the user whether to create a new intent or resume an existing one.`,
			)
		}

		if (projectStudio) {
			contextParts.push(
				`## Studio\n\n` +
				`Project-level studio override: **${projectStudio}**. Use this studio.`,
			)
		} else {
			contextParts.push(
				`## Studio Selection\n\n` +
				`No project-level studio constraint. Recommend a studio based on the intent description.\n\n` +
				`### Available Studios\n\n${studioSummary}\n\n` +
				`### Decision Logic\n\n` +
				`- **Clear signal (one studio is obviously right):** Select it, inform user with one-line rationale\n` +
				`- **Ambiguous (2-3 plausible fits):** Present candidates with rationale, ask user to pick via \`ask_user_visual_question\`\n` +
				`- **No clear fit:** Default to \`ideation\``,
			)
		}

		contextParts.push(
			`## Implementation Steps\n\n` +
			`1. ${args.description ? "Use the provided description" : "Ask the user: 'What do you want to accomplish?' (free text, not a form)"}\n` +
			`2. Convert description to kebab-case slug (max 40 chars)\n` +
			`3. ${projectStudio ? `Use studio "${projectStudio}"` : "Select studio per the logic above"}\n` +
			`4. Default to **continuous** mode (do not ask the user)\n` +
			`5. Write \`.haiku/intents/{slug}/intent.md\` with frontmatter (studio, mode, status: active, created date)\n` +
			`6. Create directories: knowledge/, stages/, state/\n` +
			`7. \`git add .haiku/intents/{slug}/\` && \`git commit -m "haiku: new intent -- {slug}"\`\n` +
			`8. Present intent for review via \`open_review { intent_dir: ".haiku/intents/{slug}", review_type: "intent" }\` — this blocks until the user approves\n` +
			`9. On approval, invoke /haiku:run (continuous) or report ready (discrete)`,
		)

		const instructionText = contextParts.join("\n\n")

		if (args.description) {
			return {
				messages: [
					textMsg("user", `Create a new H·AI·K·U intent: ${args.description}`),
					textMsg("assistant", "I'll set up this intent. Let me configure the workspace."),
					textMsg("user", instructionText),
				],
			}
		}

		// No description -- single message asking the agent to gather it
		return {
			messages: [
				textMsg("user", `Start a new H·AI·K·U intent.`),
				textMsg("assistant", "I'll help you create a new intent. Let me gather the details."),
				textMsg("user", instructionText),
			],
		}
	},
})

// ── haiku:refine ────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:refine",
	title: "Refine",
	description: "Refine intent, unit, or upstream stage outputs mid-execution",
	arguments: [
		{
			name: "stage",
			description: "Target stage for upstream refinement (e.g., 'design')",
			required: false,
			completer: completeStage,
		},
	],
	handler: async (args) => {
		// Resolve intent
		const resolved = resolveIntent({})
		if ("error" in resolved) return resolved.error
		const slug = resolved.slug

		const dir = intentDir(slug)
		const intentRaw = readFileSync(join(dir, "intent.md"), "utf8")
		const { data: intentData, body: intentBody } = parseFrontmatter(intentRaw)
		const studio = (intentData.studio as string) || "ideation"
		const activeStage = (intentData.active_stage as string) || ""

		// Load active stage state
		let currentPhase = ""
		if (activeStage) {
			const stateJson = readJson(join(dir, "stages", activeStage, "state.json"))
			currentPhase = (stateJson.phase as string) || ""
		}

		const contextParts = [
			`Intent: ${slug}`,
			`Studio: ${studio}`,
			`Active Stage: ${activeStage}`,
			`Phase: ${currentPhase}`,
		]

		if (args.stage) {
			// Stage-scoped refinement
			const targetStage = args.stage
			const stageDef = readStageDef(studio, targetStage)

			// List existing units in target stage
			const targetUnitsDir = join(dir, "stages", targetStage, "units")
			let existingUnits: string[] = []
			if (existsSync(targetUnitsDir)) {
				existingUnits = readdirSync(targetUnitsDir).filter(f => f.endsWith(".md")).map(f => f.replace(/\.md$/, ""))
			}

			const instructions =
				`## Stage-Scoped Refinement: ${targetStage}\n\n` +
				`${contextParts.join("\n")}\n\n` +
				(stageDef ? `### Stage Definition\n\n${stageDef.body}\n\n` : "") +
				`### Existing Units\n\n${existingUnits.length > 0 ? existingUnits.map(u => `- ${u}`).join("\n") : "(none)"}\n\n` +
				`### Instructions\n\n` +
				`1. Show existing stage outputs (completed units and their artifacts)\n` +
				`2. Create a new unit in \`.haiku/intents/${slug}/stages/${targetStage}/units/\` for the new/updated output\n` +
				`3. Run the target stage's hat sequence for this unit only (do NOT re-run completed units)\n` +
				`4. Persist the updated output\n` +
				`5. Return to the current stage (${activeStage}) -- this is a scoped side-trip\n` +
				`6. Commit: \`git add .haiku/intents/${slug}/stages/${targetStage}/ && git commit -m "refine: add output to ${targetStage} stage"\``

			return {
				messages: [
					textMsg("user", `Refine stage:${targetStage} for intent ${slug}`),
					textMsg("assistant", "I'll run targeted refinement on the upstream stage."),
					textMsg("user", instructions),
				],
			}
		}

		// No specific target -- provide general refinement instructions
		const instructions =
			`## Refinement Options\n\n` +
			`${contextParts.join("\n")}\n\n` +
			`### Intent Description\n\n${intentBody}\n\n` +
			`### Instructions\n\n` +
			`Ask the user what to refine:\n\n` +
			`1. **Intent-level spec** -- Refine problem statement, solution approach, or success criteria\n` +
			`2. **Specific unit** -- Refine a unit's spec, criteria, or boundaries\n` +
			`3. **Upstream stage output** -- Add or update an output from a prior stage\n\n` +
			`Use \`ask_user_visual_question\` to present these options.\n\n` +
			`After refinement:\n` +
			`- Preserve all frontmatter fields when rewriting files\n` +
			`- Re-queue affected units (set status: pending, reset hat to first hat)\n` +
			`- Commit changes`

		return {
			messages: [
				textMsg("user", `Refine intent ${slug}`),
				textMsg("assistant", "Let me load the current state so we can identify what to refine."),
				textMsg("user", instructions),
			],
		}
	},
})

// ── haiku:review ────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:review",
	title: "Review",
	description: "Pre-delivery code review with multi-agent fix loop",
	arguments: [
		{
			name: "intent",
			description: "Intent slug (optional, for context)",
			required: false,
			completer: completeIntentSlug,
		},
	],
	handler: async (args) => {
		// Compute git diff
		let diffBase = "main"
		let fullDiff = ""
		let diffStat = ""
		let changedFiles = ""

		try {
			// Determine diff base
			try {
				const upstreamResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], { encoding: "utf8", stdio: "pipe" })
				const upstream = (upstreamResult.stdout || "").trim()
				if (upstreamResult.status === 0 && upstream) diffBase = upstream
			} catch {
				try {
					const defaultResult = spawnSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], { encoding: "utf8", stdio: "pipe" })
					const defaultBranch = (defaultResult.stdout || "").trim().replace(/^refs\/remotes\/origin\//, "")
					if (defaultResult.status === 0 && defaultBranch) diffBase = defaultBranch
				} catch {
					// fallback to main
				}
			}

			// Use spawnSync to avoid shell injection via diffBase
			const diffResult = spawnSync("git", ["diff", `${diffBase}...HEAD`], { encoding: "utf8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 })
			fullDiff = diffResult.status === 0 ? (diffResult.stdout || "") : ""
			if (!fullDiff) {
				const fallback = spawnSync("git", ["diff", `${diffBase}..HEAD`], { encoding: "utf8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 })
				fullDiff = fallback.stdout || ""
			}

			const statResult = spawnSync("git", ["diff", "--stat", `${diffBase}...HEAD`], { encoding: "utf8", stdio: "pipe" })
			diffStat = statResult.status === 0 ? (statResult.stdout || "") : ""
			if (!diffStat) {
				const fallback = spawnSync("git", ["diff", "--stat", `${diffBase}..HEAD`], { encoding: "utf8", stdio: "pipe" })
				diffStat = fallback.stdout || ""
			}

			const filesResult = spawnSync("git", ["diff", "--name-only", `${diffBase}...HEAD`], { encoding: "utf8", stdio: "pipe" })
			changedFiles = filesResult.status === 0 ? (filesResult.stdout || "") : ""
			if (!changedFiles) {
				const fallback = spawnSync("git", ["diff", "--name-only", `${diffBase}..HEAD`], { encoding: "utf8", stdio: "pipe" })
				changedFiles = fallback.stdout || ""
			}
		} catch {
			// Git might not be available or no diff
		}

		if (!fullDiff.trim()) {
			return singleMessage(`No changes to review against \`${diffBase}\`.`)
		}

		// Load review guidelines
		let reviewGuidelines = ""
		try {
			if (existsSync("REVIEW.md")) {
				reviewGuidelines = readFileSync("REVIEW.md", "utf8")
			}
		} catch { /* */ }

		let claudeMd = ""
		try {
			if (existsSync("CLAUDE.md")) {
				claudeMd = readFileSync("CLAUDE.md", "utf8")
			}
		} catch { /* */ }

		// Load review agent config from settings
		let reviewAgentsConfig = "{}"
		try {
			const root = findHaikuRoot()
			const settingsPath = join(root, "settings.yml")
			if (existsSync(settingsPath)) {
				const raw = readFileSync(settingsPath, "utf8")
				const { data } = parseFrontmatter(`---\n${raw}\n---\n`)
				if (data.review_agents) {
					reviewAgentsConfig = JSON.stringify(data.review_agents)
				}
			}
		} catch { /* */ }

		// Truncate diff if too large
		const MAX_DIFF_SIZE = 100_000
		let diffContent = fullDiff
		let truncated = false
		if (fullDiff.length > MAX_DIFF_SIZE) {
			diffContent = fullDiff.slice(0, MAX_DIFF_SIZE)
			truncated = true
		}

		const instructions =
			`## Pre-Delivery Code Review\n\n` +
			`**Diff base:** ${diffBase}\n` +
			`**Changed files:**\n\`\`\`\n${changedFiles}\n\`\`\`\n\n` +
			`**Diff stats:**\n\`\`\`\n${diffStat}\n\`\`\`\n\n` +
			(reviewGuidelines ? `### Review Guidelines (REVIEW.md)\n\n${reviewGuidelines}\n\n` : "") +
			(claudeMd ? `### Project Instructions (CLAUDE.md)\n\n${claudeMd.slice(0, 5000)}${claudeMd.length > 5000 ? "\n...(truncated)" : ""}\n\n` : "") +
			`### Review Agents Config\n\n${reviewAgentsConfig}\n\n` +
			`### Full Diff\n\n\`\`\`diff\n${diffContent}\n\`\`\`\n` +
			(truncated ? `\n**Note:** Diff truncated at ${MAX_DIFF_SIZE} chars. Read individual files for full context.\n\n` : "\n") +
			`### Instructions\n\n` +
			`1. Spawn specialized review agents **in parallel** (correctness, security, performance, architecture, test_quality)\n` +
			`2. Each agent gets the full diff, review guidelines, and a focused mandate\n` +
			`3. Collect findings as YAML; deduplicate by file+line keeping higher severity\n` +
			`4. Filter out LOW findings unless total < 5\n` +
			`5. For HIGH findings: fix directly, commit, re-review (up to 3 cycles)\n` +
			`6. Report: APPROVED (no HIGH remaining) or NEEDS ATTENTION (user decides)\n` +
			`7. Offer: "Push and create PR" or "Done"`

		return {
			messages: [
				textMsg("user", `Review changes${args.intent ? ` for intent ${args.intent}` : ""}`),
				textMsg("assistant", "I'll run a multi-agent code review against the current diff."),
				textMsg("user", instructions),
			],
		}
	},
})

// ── haiku:reflect ───────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:reflect",
	title: "Reflect",
	description: "Analyze a completed H·AI·K·U intent cycle and produce reflection artifacts",
	arguments: [
		{
			name: "intent",
			description: "Intent slug (auto-detected if omitted)",
			required: false,
			completer: completeIntentSlug,
		},
	],
	handler: async (args) => {
		const resolved = resolveIntent(args)
		if ("error" in resolved) return resolved.error
		const slug = resolved.slug

		const dir = intentDir(slug)
		const intentRaw = readFileSync(join(dir, "intent.md"), "utf8")
		const { data: intentData, body: intentBody } = parseFrontmatter(intentRaw)
		const studio = (intentData.studio as string) || "ideation"

		// Gather per-stage metrics
		const stageSummaries: string[] = []
		const stagesDir = join(dir, "stages")
		if (existsSync(stagesDir)) {
			for (const stageName of readdirSync(stagesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
				const stateJson = readJson(join(stagesDir, stageName, "state.json"))
				const unitsDir = join(stagesDir, stageName, "units")
				let unitSummary = "(no units)"
				let totalBolts = 0
				let completedCount = 0
				let totalCount = 0

				if (existsSync(unitsDir)) {
					const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
					totalCount = unitFiles.length
					const unitDetails: string[] = []
					for (const f of unitFiles) {
						const { data } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
						const bolt = (data.bolt as number) || 0
						totalBolts += bolt
						if (data.status === "completed") completedCount++
						unitDetails.push(`  - ${f.replace(".md", "")}: status=${data.status}, bolt=${bolt}, hat=${data.hat || ""}`)
					}
					unitSummary = unitDetails.join("\n")
				}

				stageSummaries.push(
					`### ${stageName}\n` +
					`- Status: ${stateJson.status || "pending"}\n` +
					`- Phase: ${stateJson.phase || "pending"}\n` +
					`- Started: ${stateJson.started_at || "N/A"}\n` +
					`- Completed: ${stateJson.completed_at || "N/A"}\n` +
					`- Units: ${completedCount}/${totalCount} completed\n` +
					`- Total bolts: ${totalBolts}\n` +
					`- Units:\n${unitSummary}`,
				)
			}
		}

		const metrics =
			`## Intent Metadata\n\n` +
			`- **Slug:** ${slug}\n` +
			`- **Studio:** ${studio}\n` +
			`- **Mode:** ${intentData.mode || "continuous"}\n` +
			`- **Status:** ${intentData.status}\n` +
			`- **Created:** ${intentData.created || "N/A"}\n` +
			`- **Completed:** ${intentData.completed_at || "N/A"}\n\n` +
			`## Intent Description\n\n${intentBody}\n\n` +
			`## Per-Stage Summary\n\n${stageSummaries.join("\n\n")}`

		const instructions =
			`${metrics}\n\n` +
			`## Analysis Instructions\n\n` +
			`Perform a structured reflection analysis:\n\n` +
			`1. **Execution patterns** -- Which units went smoothly? Which required retries?\n` +
			`2. **Criteria satisfaction** -- How well were success criteria met?\n` +
			`3. **Process observations** -- What approaches worked? What was painful?\n` +
			`4. **Blocker analysis** -- Were blockers systemic or one-off?\n` +
			`5. **Session patterns** -- Analyze session transcripts for tool failures, retries, context loss\n\n` +
			`## Output\n\n` +
			`Write:\n` +
			`1. \`.haiku/intents/${slug}/reflection.md\` -- Full reflection artifact\n` +
			`2. \`.haiku/intents/${slug}/settings-recommendations.md\` -- Concrete settings changes\n\n` +
			`Present findings to user for validation. Then offer next steps:\n` +
			`- **Apply Settings** -- auto-apply recommendations\n` +
			`- **Iterate** -- create a new version with learnings pre-loaded\n` +
			`- **Close** -- capture learnings to .claude/memory/ and archive intent`

		return {
			messages: [
				textMsg("user", `Reflect on intent ${slug}`),
				textMsg("assistant", "I'll analyze the execution cycle and produce reflection artifacts."),
				textMsg("user", instructions),
			],
		}
	},
})
