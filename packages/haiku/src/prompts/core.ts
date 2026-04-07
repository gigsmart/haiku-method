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
interface HatDef {
	content: string          // full markdown body (without frontmatter)
	agent_type?: string      // e.g., "general-purpose", "plan", custom
	model?: string           // e.g., "opus", "sonnet", "haiku"
	raw: string              // full file content
}

function readHatDefs(studio: string, stage: string): Record<string, HatDef> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const hats: Record<string, HatDef> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const hatsDir = join(base, studio, "stages", stage, "hats")
		if (!existsSync(hatsDir)) continue
		for (const f of readdirSync(hatsDir).filter(f => f.endsWith(".md"))) {
			const raw = readFileSync(join(hatsDir, f), "utf8")
			const { data, body } = parseFrontmatter(raw)
			hats[f.replace(/\.md$/, "")] = {
				content: body,
				agent_type: (data.agent_type as string) || undefined,
				model: (data.model as string) || undefined,
				raw,
			}
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
				`Stage has been started by the orchestrator (status: active, phase: elaborate).\n\n` +
				(action.follows
					? `1. Load parent knowledge via \`haiku_knowledge_read\` for each file in parent_knowledge\n2. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`
					: `1. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`),
			)
			break
		}

		case "elaborate": {
			const stage = action.stage as string
			const elaboration = (action.elaboration as string) || "collaborative"
			const stageDef = readStageDef(studio, stage)
			const unitTypes = (stageDef?.data?.unit_types as string[]) || []

			sections.push(`## Elaborate: ${stage}`)
			if (stageDef) {
				sections.push(`${stageDef.body}`)
				if (unitTypes.length > 0) sections.push(`**Allowed unit types:** ${unitTypes.join(", ")}`)
				if (stageDef.data.inputs) sections.push(`**Inputs:** ${JSON.stringify(stageDef.data.inputs)}`)
			}

			// Discovery artifact definitions
			for (const base of studioSearchPaths()) {
				const discoveryDir = join(base, studio, "stages", stage, "discovery")
				if (!existsSync(discoveryDir)) continue
				for (const f of readdirSync(discoveryDir).filter(f => f.endsWith(".md"))) {
					sections.push(`### ${f}\n\n${readFileSync(join(discoveryDir, f), "utf8")}`)
				}
				break
			}

			sections.push(
				`## Scope\n\n` +
				`All units MUST be within this stage's domain${unitTypes.length > 0 ? ` (${unitTypes.join(", ")})` : ""}. ` +
				`Work belonging to other stages goes in the discovery document, not in units.\n\n` +
				`## Mechanics\n\n` +
				(elaboration === "collaborative"
					? `Mode: **collaborative** — engage the user iteratively before finalizing.\n`
					: `Mode: **autonomous** — elaborate independently.\n`) +
				`1. Research and write discovery artifacts\n` +
				`2. Break work into units at \`.haiku/intents/${slug}/stages/${stage}/units/\`\n` +
				`3. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator opens the review and advances the phase automatically`,
			)
			break
		}

		case "start_unit":
		case "continue_unit": {
			const stage = action.stage as string
			const unit = (action.unit as string) || ""
			const hat = (action.hat as string) || (action.first_hat as string) || ""
			const hats = (action.hats as string[]) || []
			const bolt = (action.bolt as number) || 1
			const stageDef = readStageDef(studio, stage)
			const unitTypes = (stageDef?.data?.unit_types as string[]) || []

			// Unit content
			const unitFile = join(dir, "stages", stage, "units", unit.endsWith(".md") ? unit : `${unit}.md`)
			let unitContent = ""
			let unitRefs: string[] = []
			if (existsSync(unitFile)) {
				const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
				unitContent = body
				unitRefs = (data.refs as string[]) || []
			}

			// Hat definition (structured — includes agent_type and model)
			const hatDefs = readHatDefs(studio, stage)
			const hatDef = hatDefs[hat]
			const hatContent = hatDef?.content || `No hat definition found for "${hat}"`
			const hatAgentType = hatDef?.agent_type || "general-purpose"
			const hatModel = hatDef?.model

			sections.push(`## ${unit} — hat: ${hat} (${hats.join(" → ")}) — bolt ${bolt}`)

			// Stage scope (once, concise)
			if (stageDef) {
				sections.push(
					`### Stage: ${stage}\n\n${stageDef.body}\n\n` +
					`**Unit types:** ${unitTypes.length > 0 ? unitTypes.join(", ") : "per stage definition"}. ` +
					`Stay within this stage's scope — do not produce outputs belonging to other stages.`,
				)
			}

			sections.push(`### Unit Spec\n\n${unitContent}`)
			sections.push(`### Hat: ${hat}\n\n${hatContent}`)

			// Refs
			if (unitRefs.length > 0) {
				sections.push(`### Refs`)
				const dirResolved = resolve(dir)
				for (const ref of unitRefs) {
					const refResolved = resolve(dir, ref)
					if (!refResolved.startsWith(dirResolved)) continue
					if (existsSync(join(dir, ref))) {
						const content = readFileSync(join(dir, ref), "utf8")
						sections.push(`#### ${ref}\n\n${content.slice(0, 2000)}${content.length > 2000 ? "\n...(truncated)" : ""}`)
					}
				}
			}

			// Mechanics — one subagent per hat, subagent calls advance/fail tools
			const worktreePath = action.worktree as string || ""
			const hatIdx = hats.indexOf(hat)
			const nextHat = hatIdx < hats.length - 1 ? hats[hatIdx + 1] : null
			const isLastHat = !nextHat

			sections.push(
				`### Mechanics\n\n` +
				`**You are the orchestrator.** Spawn a subagent for the "${hat}" hat.\n` +
				`Agent type: \`${hatAgentType}\`${hatModel ? ` | Model: \`${hatModel}\`` : ""}\n` +
				(worktreePath ? `Worktree: \`${worktreePath}\`\n` : "") +
				`\n**Subagent prompt must include:**\n` +
				`- The hat definition, unit spec, and refs above\n` +
				`- The stage scope constraint\n` +
				(action.action === "start_unit"
					? `- Instruction to call \`haiku_unit_start { intent: "${slug}", stage: "${stage}", unit: "${unit}", hat: "${hat}" }\` first\n`
					: "") +
				`\n**Subagent calls one of these when done:**\n` +
				(isLastHat
					? `- **Success:** \`haiku_unit_complete { intent: "${slug}", stage: "${stage}", unit: "${unit}" }\`\n`
					: `- **Success:** \`haiku_unit_advance_hat { intent: "${slug}", stage: "${stage}", unit: "${unit}", hat: "${nextHat}" }\`\n`) +
				`- **Failure:** \`haiku_unit_fail { intent: "${slug}", stage: "${stage}", unit: "${unit}" }\` — moves back one hat, increments bolt\n` +
				`\n**After subagent returns:** call \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "start_units": {
			const stage = action.stage as string
			const units = (action.units as string[]) || []
			const hats = (action.hats as string[]) || []
			const firstHat = (action.first_hat as string) || hats[0] || ""
			const stageDef = readStageDef(studio, stage)

			sections.push(`## Parallel: ${units.length} units in ${stage}`)
			if (stageDef) {
				sections.push(`${stageDef.body}\n\nStay within this stage's scope — do not produce outputs belonging to other stages.`)
			}
			sections.push(`Hats: ${hats.join(" → ")}\nUnits: ${units.join(", ")}`)

			const worktrees = (action.worktrees as Record<string, string | null>) || {}
			const useTeams = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "true"

			const wave = action.wave as number | undefined
			const totalWaves = action.total_waves as number | undefined

			sections.push(
				`### Mechanics\n\n` +
				(wave !== undefined ? `**Wave ${wave}/${totalWaves ?? "?"}** — ` : "") +
				`${units.length} units to run in parallel.\n` +
				`**You are the orchestrator.** Spawn ${useTeams ? "an agent team" : "one subagent per unit"}. Do NOT do unit work yourself.\n` +
				`Each subagent runs the FIRST hat ("${firstHat}") only. After all subagents complete, call \`haiku_run_next\` — the orchestrator will advance hats or start the next wave.\n\n` +
				`**Each subagent prompt must include:**\n` +
				`- The hat definition for "${firstHat}"\n` +
				`- The unit spec and refs\n` +
				`- The stage scope constraint\n` +
				`- Instruction to call \`haiku_unit_start\` first\n\n` +
				units.map(u => {
					const wt = worktrees[u]
					return `- **${u}**${wt ? ` (worktree: \`${wt}\`)` : ""}: \`haiku_unit_start { intent: "${slug}", stage: "${stage}", unit: "${u}", hat: "${firstHat}" }\``
				}).join("\n") +
				`\n\nAfter all subagents complete: \`haiku_run_next { intent: "${slug}" }\``,
			)
			break
		}

		case "advance_phase": {
			const stage = action.stage as string
			const toPhase = action.to_phase as string
			sections.push(
				`## Advance Phase\n\n` +
				`Phase advanced to "${toPhase}" by the orchestrator.\n\n` +
				`Call \`haiku_run_next { intent: "${slug}" }\` to continue.`,
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
				`3. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator advances to the gate phase automatically`,
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
				`1. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator opens the review UI and blocks until the user responds\n` +
				`2. If approved: the FSM advances automatically\n` +
				`3. If changes_requested: analyze annotations and route to /haiku:refine for the appropriate upstream stage`,
			)
			break
		}

		case "gate_external": {
			const stage = action.stage as string
			sections.push(
				`## Gate: External Review\n\n` +
				`Stage "${stage}" is complete. The gate has been entered by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`1. Push the branch and commit stage artifacts\n` +
				`2. Share the review URL with the reviewer\n` +
				`3. Report: "Awaiting external review. Run /haiku:run when review is complete."`,
			)
			break
		}

		case "gate_await": {
			const stage = action.stage as string
			sections.push(
				`## Gate: Awaiting External Event\n\n` +
				`Stage "${stage}" is complete. The gate has been entered by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`1. Report what is being awaited\n` +
				`2. Stop. Run /haiku:run when the event occurs.`,
			)
			break
		}

		case "advance_stage": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Advance Stage\n\n` +
				`Gate passed. The orchestrator has advanced from "${stage}" to "${nextStage}".\n\n` +
				`### Instructions\n\n` +
				`Call \`haiku_run_next { intent: "${slug}" }\` to continue.`,
			)
			break
		}

		case "stage_complete_discrete": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Stage Complete (Discrete Mode)\n\n` +
				`Stage "${stage}" has been completed by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`Report: "Stage complete. Run /haiku:run to start '${nextStage}'."`,
			)
			break
		}

		case "intent_complete": {
			sections.push(
				`## Intent Complete\n\n` +
				`All stages are done for intent "${slug}". The orchestrator has marked it as completed.\n\n` +
				`### Instructions\n\n` +
				`Report completion summary. Suggest /haiku:review then PR creation.`,
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
				`Call \`haiku_run_next { intent: "${slug}" }\` to continue.`,
			)
			break
		}

		case "outputs_missing": {
			sections.push(`## Missing Required Outputs\n\n${action.message}`)
			break
		}

		case "elaboration_insufficient": {
			sections.push(`## Elaboration Insufficient\n\n${action.message}`)
			break
		}

		case "spec_validation_failed": {
			sections.push(`## Spec Validation Failed\n\n${action.message}`)
			break
		}

		case "review_elaboration": {
			const stage = action.stage as string
			const agents = readReviewAgentDefs(studio, stage)
			sections.push(`## Review Elaboration Artifacts\n\n`)
			sections.push(`Run adversarial review agents on the elaboration specs before the pre-execution gate opens.\n\n`)
			if (Object.keys(agents).length > 0) {
				sections.push(`### Review Agents\n`)
				for (const [name, def] of Object.entries(agents)) {
					sections.push(`#### ${name}\n\n${def.content}`)
				}
			}
			sections.push(
				`### Mechanics\n\n` +
				`1. Spawn one subagent per review agent (in parallel)\n` +
				`2. Each reviews the elaboration specs (units, discovery, knowledge)\n` +
				`3. Fix any HIGH findings\n` +
				`4. Call \`haiku_run_next { intent: "${slug}", elaboration_reviewed: true }\``,
			)
			break
		}

		case "awaiting_external_review": {
			const externalUrl = action.external_review_url as string || ""
			sections.push(
				`## Awaiting External Review\n\n` +
				(externalUrl
					? `The stage is awaiting external review at: ${externalUrl}\n\n`
					: `The stage is awaiting external review but no review URL has been recorded.\n\n`) +
				`Ask the user for the status of the external review. If approved, call \`haiku_run_next { intent: "${slug}" }\` — the FSM will detect the approval and advance.\n\n` +
				(externalUrl ? "" : `If the user provides a review URL, pass it: \`haiku_run_next { intent: "${slug}", external_review_url: "<url>" }\`\n`),
			)
			break
		}

		case "discovery_missing": {
			sections.push(`## Missing Discovery Artifacts\n\n${action.message}`)
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
			`5. Summarize the conversation so far into a concise context block (key decisions, constraints, technical details discussed)\n` +
			`6. Call \`haiku_intent_create\` with description, slug, and the \`context\` argument containing your conversation summary\n` +
			`7. The tool creates directories, writes intent.md, writes CONVERSATION-CONTEXT.md to knowledge/, and opens a review for user confirmation\n` +
			`8. Invoke /haiku:run — the orchestrator opens the review and advances automatically (continuous) or report ready (discrete)`,
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
			(reviewGuidelines ? `### Review Guidelines (REVIEW.md)\n\n${reviewGuidelines.slice(0, 5000)}${reviewGuidelines.length > 5000 ? "\n...(truncated)" : ""}\n\n` : "") +
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
