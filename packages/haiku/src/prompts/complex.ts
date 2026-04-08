// prompts/complex.ts — Complex prompt handlers (autopilot, composite, operate, triggers, adopt, quick, pressure-testing)

import { registerPrompt } from "./index.js"
import { completeStage } from "./completions.js"
import { textMsg, findActiveIntents, studioSearchPaths, validateIdentifier } from "./helpers.js"
import { findHaikuRoot, intentDir, parseFrontmatter } from "../state-tools.js"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadActiveIntent(): { slug: string; data: Record<string, unknown>; body: string } | null {
	const intents = findActiveIntents()
	return intents.length > 0 ? intents[0] : null
}


function resolveStudio(intent: { data: Record<string, unknown> }): string {
	return (intent.data.studio as string) || "software"
}

function listOperations(studio: string): { name: string; body: string }[] {
	validateIdentifier(studio, "studio")
	const results: { name: string; body: string }[] = []
	for (const base of studioSearchPaths()) {
		const opsDir = join(base, studio, "operations")
		if (!existsSync(opsDir)) continue
		for (const f of readdirSync(opsDir).filter(f => f.endsWith(".md"))) {
			const raw = readFileSync(join(opsDir, f), "utf8")
			results.push({ name: f.replace(/\.md$/, ""), body: raw })
		}
		// First non-empty directory wins — project-level overrides plugin-level entirely.
		// Unlike hats/agents which merge across paths, a project dir with any operations
		// replaces all built-in operations (intentional: project operations are a full override).
		if (results.length > 0) break
	}
	return results
}

function loadSettings(): Record<string, unknown> {
	try {
		const root = findHaikuRoot()
		const file = join(root, "settings.yml")
		if (!existsSync(file)) return {}
		const raw = readFileSync(file, "utf8")
		const { data } = parseFrontmatter(`---\n${raw}\n---\n`)
		return data
	} catch { return {} }
}

function loadUnitContent(slug: string, stage: string): string[] {
	try {
		const dir = join(intentDir(slug), "stages", stage, "units")
		if (!existsSync(dir)) return []
		return readdirSync(dir)
			.filter(f => f.endsWith(".md"))
			.map(f => readFileSync(join(dir, f), "utf8"))
	} catch { return [] }
}

// ── haiku:autopilot ─────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:autopilot",
	title: "H·AI·K·U Autopilot",
	description: "Full autonomous workflow -- elaborate, plan, build, review, and deliver in one command",
	arguments: [
		{ name: "description", description: "Feature description to build autonomously", required: false },
	],
	handler: async (args) => {
		const desc = args.description || ""
		const active = loadActiveIntent()

		if (!desc && !active) {
			return {
				messages: [
					textMsg("user", "Run haiku:autopilot"),
					textMsg("assistant", "I need a feature description to start autopilot. No active intent found either. Please provide a description of what to build."),
					textMsg("user", "Provide a feature description or use haiku:start first to create an intent."),
				],
			}
		}

		const intentCtx = active
			? `Active intent: "${active.slug}" (studio: ${resolveStudio(active)}, stage: ${active.data.active_stage})\n\n${active.body}`
			: `No active intent. Create one from description: "${desc}"`

		return {
			messages: [
				textMsg("user", `Run autopilot${desc ? `: ${desc}` : ""}`),
				textMsg("assistant", [
					"Starting H·AI·K·U Autopilot. This will run the full lifecycle autonomously.",
					"",
					"Context:",
					intentCtx,
					"",
					"Autopilot mode will:",
					"1. Ensure mode=autopilot is set on the intent (set during /haiku:start creation)",
					"2. If no intent exists, run /haiku:start to create one from the description",
					"3. Run /haiku:resume in a loop, advancing through all stages",
					"4. Override ask gates to auto (only external gates pause autopilot)",
					"5. Pause if elaboration generates >5 units (confirm scope with user)",
					"6. After all stages complete, create a PR for delivery",
					"",
					"Guardrails:",
					"- MUST pause on blockers or ambiguity -- never guess",
					"- MUST pause if >5 units generated (scope check)",
					"- MUST pause before creating PR (delivery check)",
					"- MUST NOT run in cowork mode",
					"- MUST stop immediately on phase-level failures",
				].join("\n")),
				textMsg("user", "Begin the autopilot workflow now. Set mode=autopilot on the intent, then start the stage loop."),
			],
		}
	},
})

// ── haiku:composite ─────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:composite",
	title: "H·AI·K·U Composite Intent",
	description: "Create a composite intent that runs stages from multiple studios in parallel with sync points",
	arguments: [
		{ name: "description", description: "What the composite intent should accomplish", required: false },
	],
	handler: async (args) => {
		const desc = args.description || ""

		return {
			messages: [
				textMsg("user", `Create a composite intent${desc ? `: ${desc}` : ""}`),
				textMsg("assistant", [
					"I will create a composite intent combining stages from multiple studios.",
					"",
					"Step 1: Use ask_user_visual_question or elicitation to gather:",
					"- The work description (if not provided)",
					"- Studio selection (MUST select 2+ studios -- use haiku_studio_list to get available studios)",
					"- Stage selection per studio",
					"- Sync points between studios",
					"",
					desc ? `Description provided: "${desc}"` : "No description provided -- ask the user what they are trying to accomplish.",
					"",
					"Step 2: Present studio selection as a multi-select question. List all available studios with descriptions.",
					"At least 2 selections are REQUIRED. If fewer than 2 are selected, ask again.",
					"",
					"Step 3: For each selected studio, show its stages and let the user pick which to include.",
					"Recommend stages based on the intent description.",
					"",
					"Step 4: Ask where studios need to synchronize.",
					"Suggest sync points based on stage produce/require chains.",
					"",
					"Step 5: Create the intent with composite frontmatter:",
					"```yaml",
					"composite:",
					"  - studio: {studio1}",
					"    stages: [stage1, stage2]",
					"  - studio: {studio2}",
					"    stages: [stage1, stage2]",
					"sync:",
					"  - wait: [studio1:stage2]",
					"    then: [studio2:stage2]",
					"```",
					"",
					"Step 6: Report the created intent with studio/stage overview.",
				].join("\n")),
				textMsg("user", "Start creating the composite intent. Begin with studio selection."),
			],
		}
	},
})

// ── haiku:operate ───────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:operate",
	title: "H·AI·K·U Operate",
	description: "Manage operations -- list, execute, deploy, monitor, and teardown operational tasks",
	arguments: [
		{
			name: "operation",
			description: "Operation name to execute (omit to list all)",
			required: false,
		},
	],
	handler: async (args) => {
		const opName = args.operation || ""
		const active = loadActiveIntent()
		const studio = active ? resolveStudio(active) : "software"
		const ops = listOperations(studio)
		const opsList = ops.length > 0
			? ops.map(o => `- **${o.name}**`).join("\n")
			: "(no operations found in studio)"

		// If specific operation requested, try to load its content
		let opContent = ""
		if (opName) {
			const match = ops.find(o => o.name === opName)
			if (match) opContent = match.body
		}

		if (opName && opContent) {
			return {
				messages: [
					textMsg("user", `Execute operation: ${opName}`),
					textMsg("assistant", [
						`Executing operation **${opName}** from studio **${studio}**.`,
						"",
						"Operation template:",
						"```",
						opContent,
						"```",
						"",
						"Follow the operation template above. For agent-owned operations, execute the companion script.",
						"For human-owned operations, present the checklist and track presentation.",
						"Update operation-status.json after execution.",
					].join("\n")),
					textMsg("user", "Execute this operation now."),
				],
			}
		}

		return {
			messages: [
				textMsg("user", `List and manage operations${opName ? ` (requested: ${opName})` : ""}`),
				textMsg("assistant", [
					`Available operation templates for studio **${studio}**:`,
					opsList,
					"",
					active ? `Active intent: **${active.slug}**` : "No active intent found.",
					"",
					"Modes:",
					"- No arguments: List all operations across all intents",
					"- With intent slug: Show status table for that intent's operations",
					"- With intent + operation: Execute a specific operation",
					"- With --deploy: Generate deployment manifests",
					"- With --status: Show health and overdue operations",
					"- With --teardown: Remove deployments (preserves specs)",
					"",
					"Check .haiku/intents/*/operations/ for intent-specific operation specs.",
					"Operation templates from the studio provide the runbook/checklist structure.",
				].join("\n")),
				textMsg("user", opName ? `Operation "${opName}" not found. Show available operations.` : "Show available operations."),
			],
		}
	},
})

// ── haiku:triggers ──────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:triggers",
	title: "H·AI·K·U Triggers",
	description: "Poll configured providers for events that should create intents or advance gates",
	arguments: [
		{
			name: "category",
			description: "Provider category to poll (e.g., crm, ticketing, comms). Omit to poll all.",
			required: false,
		},
	],
	handler: async (args) => {
		const category = args.category || ""
		const settings = loadSettings()
		const providers = settings.providers ? JSON.stringify(settings.providers, null, 2) : "(no providers configured)"

		return {
			messages: [
				textMsg("user", `Poll triggers${category ? ` for category: ${category}` : ""}`),
				textMsg("assistant", [
					"Polling configured providers for events.",
					"",
					"Provider configuration from .haiku/settings.yml:",
					"```json",
					providers,
					"```",
					"",
					"Steps:",
					"1. Load last poll timestamp from .haiku/trigger-poll.json",
					"2. For each configured provider" + (category ? ` (filtered to: ${category})` : "") + ":",
					"   - Query for events since last poll",
					"   - Match events against studio trigger declarations",
					"   - Check if events satisfy any await gates on active intents",
					"3. Report findings:",
					"   - New intent suggestions from matched triggers",
					"   - Gate advancements for await gates now satisfied",
					"   - State sync for provider changes to active intents",
					"4. Update poll timestamp",
					"",
					"If no providers are configured, report that and suggest configuring providers in .haiku/settings.yml.",
					"If running interactively, ask for confirmation before creating intents or advancing gates.",
				].join("\n")),
				textMsg("user", "Begin polling providers now."),
			],
		}
	},
})

// ── haiku:adopt ─────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:adopt",
	title: "H·AI·K·U Adopt",
	description: "Reverse-engineer an existing feature into H·AI·K·U intent artifacts for /haiku:operate and /haiku:followup",
	arguments: [
		{
			name: "description",
			description: "Description of the existing feature to adopt",
			required: false,
		},
	],
	handler: async (args) => {
		const desc = args.description || ""

		return {
			messages: [
				textMsg("user", `Adopt existing feature${desc ? `: ${desc}` : ""}`),
				textMsg("assistant", [
					"I will reverse-engineer an existing feature into H·AI·K·U artifacts.",
					"",
					desc ? `Feature: "${desc}"` : "No feature description provided -- ask the user what feature to adopt.",
					"",
					"Workflow:",
					"",
					"Phase 0 -- Pre-checks:",
					"- Reject cowork mode (CLAUDE_CODE_IS_COWORK=1)",
					"- Verify git repository",
					"- Check for slug conflicts",
					"",
					"Phase 1 -- Gather description:",
					"- Get feature description (if not provided as argument)",
					"- Ask for code paths (specific directories or search whole repo)",
					"- Ask for git references (PRs, branches, date range, or search by paths)",
					"",
					"Phase 2 -- Feature exploration (spawn 5 parallel subagents):",
					"- Subagent 1: Code path analysis (modules, entry points, dependencies)",
					"- Subagent 2: Git history analysis (commit groups, PR boundaries, timeline)",
					"- Subagent 3: Test analysis (test files, coverage patterns, verified behaviors)",
					"- Subagent 4: CI configuration analysis (pipelines, quality gates)",
					"- Subagent 5: Deployment surface analysis (containers, infra, monitoring)",
					"",
					"Phase 3 -- Propose intent and units (user confirms)",
					"Phase 4 -- Reverse-engineer success criteria from tests",
					"Phase 5 -- Generate operational plan (if operational surface found)",
					"Phase 6 -- Write artifacts (intent.md, unit files, discovery.md, operations/)",
					"Phase 7 -- Handoff (summary + next steps)",
					"",
					"CRITICAL: MUST NOT modify existing code. All artifacts have status: completed.",
					"MUST wait for user confirmation at each gate (Phase 3, 4, 5).",
				].join("\n")),
				textMsg("user", "Begin the adoption process. Start with pre-checks and gathering the feature description."),
			],
		}
	},
})

// ── haiku:quick ─────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:quick",
	title: "H·AI·K·U Quick Mode",
	description: "Quick mode for small tasks -- skip full elaboration/planning when the task is trivial",
	arguments: [
		{
			name: "stage",
			description: "Stage to use (defaults to development if omitted or not a valid stage name)",
			required: false,
			completer: completeStage,
		},
		{
			name: "description",
			description: "What to do (required)",
			required: true,
		},
	],
	handler: async (args) => {
		const stage = args.stage || "development"
		const desc = args.description || ""

		return {
			messages: [
				textMsg("user", `Quick mode (${stage}): ${desc}`),
				textMsg("assistant", [
					`Running quick mode for: "${desc}" using stage: **${stage}**`,
					"",
					"Quick mode is for trivial tasks (fix typos, rename variables, update configs, small refactors touching 1-2 files).",
					"If the task is bigger than that, stop and recommend /haiku:start + /haiku:resume instead.",
					"",
					"Steps:",
					"1. Pre-checks: reject cowork mode, check for active intent conflicts, validate scope",
					"2. Create temporary .haiku/quick/ artifacts (gitignored, for hook integration)",
					`3. Run hat loop for stage "${stage}" using subagents:`,
					"   - Resolve hat sequence from stage definition (e.g., planner -> builder -> reviewer)",
					"   - Each hat runs as a subagent with hat-specific instructions",
					"   - Reviewer rejection loops back to builder (max 3 cycles)",
					"4. Pre-delivery review via /haiku:review",
					"5. Create PR (always delivers via PR, even for small tasks)",
					"6. Cleanup: remove .haiku/quick/ artifacts",
					"",
					"Guardrails:",
					"- MUST NOT create worktrees -- work in current directory",
					"- MUST refuse if another active intent exists",
					"- MUST stop and recommend /haiku:start if task is not trivial",
					"- 3-cycle review limit -- escalate if exceeded",
					"- Single session -- no resume capability",
				].join("\n")),
				textMsg("user", "Begin quick mode execution now."),
			],
		}
	},
})

// ── haiku:pressure-testing ──────────────────────────────────────────────────

registerPrompt({
	name: "haiku:pressure-testing",
	title: "H·AI·K·U Pressure Testing",
	description: "Adversarial challenge prompt for hat definitions using Evaluation-Driven Development",
	arguments: [
		{
			name: "hat",
			description: "Hat name to pressure-test (e.g., builder, reviewer, planner). Omit to list available hats.",
			required: false,
		},
	],
	handler: async (args) => {
		const hatName = args.hat || ""

		// Try to load hat definition if specified
		let hatContent = ""
		if (hatName) {
			validateIdentifier(hatName, "hat name")
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			// Search across all stages for the hat
			const stagesDir = join(pluginRoot, "studios", "software", "stages")
			if (existsSync(stagesDir)) {
				for (const stage of readdirSync(stagesDir, { withFileTypes: true })) {
					if (!stage.isDirectory()) continue
					const hatFile = join(stagesDir, stage.name, "hats", `${hatName}.md`)
					if (existsSync(hatFile)) {
						hatContent = readFileSync(hatFile, "utf8")
						break
					}
				}
			}
			// Also check project-level overrides
			if (!hatContent) {
				try {
					const root = findHaikuRoot()
					const projStages = join(root, "studios", "software", "stages")
					if (existsSync(projStages)) {
						for (const stage of readdirSync(projStages, { withFileTypes: true })) {
							if (!stage.isDirectory()) continue
							const hatFile = join(projStages, stage.name, "hats", `${hatName}.md`)
							if (existsSync(hatFile)) {
								hatContent = readFileSync(hatFile, "utf8")
								break
							}
						}
					}
				} catch { /* no .haiku dir */ }
			}
		}

		// List available hats if none specified or hat not found
		const availableHats: string[] = []
		if (!hatName || !hatContent) {
			const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
			const stagesDir = join(pluginRoot, "studios", "software", "stages")
			if (existsSync(stagesDir)) {
				for (const stage of readdirSync(stagesDir, { withFileTypes: true })) {
					if (!stage.isDirectory()) continue
					const hatsDir = join(stagesDir, stage.name, "hats")
					if (!existsSync(hatsDir)) continue
					for (const h of readdirSync(hatsDir).filter(f => f.endsWith(".md"))) {
						const name = h.replace(/\.md$/, "")
						if (!availableHats.includes(name)) availableHats.push(name)
					}
				}
			}
		}

		if (hatName && hatContent) {
			// Load current unit implementations for context
			const active = loadActiveIntent()
			let unitContext = ""
			if (active) {
				const stage = (active.data.active_stage as string) || "development"
				const units = loadUnitContent(active.slug, stage)
				if (units.length > 0) {
					unitContext = `\n\nActive intent "${active.slug}" has ${units.length} unit(s) in stage "${stage}" available for pressure testing context.`
				}
			}

			return {
				messages: [
					textMsg("user", `Pressure-test the ${hatName} hat`),
					textMsg("assistant", [
						`Running Evaluation-Driven Development (RED-GREEN-REFACTOR) on the **${hatName}** hat.`,
						"",
						"Hat definition loaded. Applying TDD cycle:",
						"",
						"Step 1 -- Design Pressure Scenario:",
						"- Combine 3+ pressure types (time, sunk cost, authority, economic, exhaustion, social, pragmatic)",
						"- Target the hat's most important constraints",
						"- Present scenario to user for approval before proceeding",
						"",
						"Step 2 -- RED Phase (baseline without anti-rationalization table):",
						"- Run scenario with a subagent that has hat instructions minus anti-rationalization table",
						"- Document verbatim: decisions made, rationalizations used, sections violated",
						"",
						"Step 3 -- GREEN Phase (full hat definition):",
						"- Run same scenario with full hat definition including anti-rationalization table",
						"- Agent MUST cite specific hat sections, acknowledge temptations",
						"- PASS if correct decision citing hat sections; FAIL if rationalized past them",
						"",
						"Step 4 -- REFACTOR Phase:",
						"- If GREEN failed: capture rationalization, add to anti-rationalization table, re-run",
						"- If GREEN passed: document that hat held under pressure",
						"",
						"Step 5 -- Commit artifacts to .haiku/pressure-tests/",
						unitContext,
					].join("\n")),
					textMsg("user", "Begin pressure testing. Design a pressure scenario and present it for approval."),
				],
			}
		}

		return {
			messages: [
				textMsg("user", `Pressure-test a hat${hatName ? ` (requested: ${hatName})` : ""}`),
				textMsg("assistant", [
					hatName ? `Hat "${hatName}" not found.` : "No hat specified.",
					"",
					"Available hats:",
					availableHats.map(h => `- ${h}`).join("\n") || "(none found -- check CLAUDE_PLUGIN_ROOT)",
					"",
					"Select a hat to pressure-test. Each hat will go through the RED-GREEN-REFACTOR cycle",
					"to verify its instructions hold up under multi-pressure adversarial scenarios.",
				].join("\n")),
				textMsg("user", "Select a hat from the list above."),
			],
		}
	},
})
