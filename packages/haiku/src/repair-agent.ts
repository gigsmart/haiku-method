// repair-agent.ts — Embedded repair agent using Claude Agent SDK
//
// Spawns a headless Claude Code session scoped to an intent directory.
// The agent can read/write intent state files without going through the
// harness hook pipeline — it runs inside the MCP server process with
// direct filesystem access.
//
// Falls back gracefully when the Agent SDK is not installed.

import { join } from "node:path"
import { existsSync, readdirSync, readFileSync } from "node:fs"

export interface RepairDiagnosis {
	slug: string
	intentDir: string // absolute path to .haiku/intents/{slug}/
	studio: string
	studioDir: string // absolute path to plugin/studios/{studio}/
	activeStage: string
	synthesizedStages: string[] // stages where completion was auto-synthesized
	needsManualReview: string[] // stages with units but not completed
	phaseRegressed: boolean // whether execute->elaborate regression happened
	unitsMissingInputs: string[] // unit filenames missing inputs: field
}

export interface RepairResult {
	success: boolean
	summary: string
	filesModified: string[]
	fallbackUsed: boolean // true if SDK wasn't available and mechanical fallback ran
}

/**
 * Run the embedded repair agent to fix a broken intent.
 * Falls back to a summary message if the Agent SDK is not available.
 */
export async function runRepairAgent(
	diagnosis: RepairDiagnosis,
): Promise<RepairResult> {
	// Try to import the SDK dynamically — it might not be installed
	let query: any
	try {
		// @ts-ignore — SDK may not be installed; dynamic import is guarded by try/catch
		const sdk = await import("@anthropic-ai/claude-agent-sdk")
		query = sdk.query
	} catch {
		// SDK not available — return fallback
		return {
			success: false,
			summary:
				"Claude Agent SDK not available — mechanical repair applied, remaining issues need manual attention",
			filesModified: [],
			fallbackUsed: true,
		}
	}

	// Build the system prompt with full context about what needs repair
	const systemPrompt = buildRepairPrompt(diagnosis)

	// Build the task prompt
	const taskPrompt = buildTaskPrompt(diagnosis)

	try {
		let result = ""
		const filesModified: string[] = []

		for await (const message of query({
			prompt: taskPrompt,
			options: {
				model: "claude-haiku-4-5-20251001",
				cwd: diagnosis.intentDir,
				additionalDirectories: [diagnosis.studioDir],
				allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
				disallowedTools: ["Bash", "Agent", "WebSearch", "WebFetch"],
				permissionMode: "dontAsk",
				maxTurns: 25,
				systemPrompt,
			},
		})) {
			if (message.type === "result") {
				result = message.result || ""
			}
		}

		return {
			success: true,
			summary: result,
			filesModified,
			fallbackUsed: false,
		}
	} catch (err) {
		return {
			success: false,
			summary: `Repair agent failed: ${err instanceof Error ? err.message : String(err)}`,
			filesModified: [],
			fallbackUsed: true,
		}
	}
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the system prompt that tells the repair agent what it is and what
 * the file structures look like.
 */
function buildRepairPrompt(diagnosis: RepairDiagnosis): string {
	// Read the studio's STAGE.md files so the agent knows what a healthy
	// intent looks like for each stage.
	const stageDefinitions = readStageDefinitions(diagnosis.studioDir)

	return `You are a H·AI·K·U intent repair agent. Your single purpose is to fix metadata and state in H·AI·K·U intent files that are in an inconsistent state after migration from a legacy system.

## Constraints (CRITICAL)

- You MUST NOT modify unit body content (the markdown below the frontmatter)
- You MUST NOT create source code, tests, or application files
- You MUST NOT delete any existing files
- You CAN modify: intent.md frontmatter, stage state.json files, unit frontmatter (inputs, depends_on, status fields)
- You CAN create: missing discovery artifact stubs (empty .md files with frontmatter only), missing stage directories and state.json files

## What a Healthy Intent Looks Like

An intent lives at \`.haiku/intents/{slug}/\` with this structure:

\`\`\`
intent.md                          # Intent definition with YAML frontmatter
knowledge/                         # Shared knowledge artifacts
  DISCOVERY.md                     # Domain research from inception
stages/
  {stage-name}/
    state.json                     # Stage FSM state
    units/
      unit-01-slug.md              # Unit files with YAML frontmatter
      unit-02-slug.md
    artifacts/                     # Stage-specific outputs (optional)
\`\`\`

### intent.md Frontmatter

\`\`\`yaml
---
title: "Intent title"
studio: software
stages: [inception, design, product, development, operations, security]
mode: continuous
active_stage: development
status: active            # One of: active, completed, paused
started_at: 2025-01-15T00:00:00Z
completed_at: null
---
\`\`\`

### state.json Format

Each stage has a \`state.json\` that tracks the stage FSM:

\`\`\`json
{
  "stage": "inception",
  "status": "completed",       // One of: pending, active, completed
  "phase": "gate",             // One of: elaborate, execute, review, gate
  "started_at": "2025-01-15T00:00:00Z",
  "completed_at": "2025-01-16T00:00:00Z",
  "gate_entered_at": null,
  "gate_outcome": "advanced"   // One of: advanced, blocked, requested_changes, or null
}
\`\`\`

For a completed stage: status = "completed", phase = "gate", gate_outcome = "advanced".
For an active stage: status = "active", phase is one of elaborate/execute/review/gate.
For a pending stage: status = "pending", phase = "" or absent.

### Unit Frontmatter

\`\`\`yaml
---
name: unit-01-feature-name
type: fullstack
status: completed          # One of: pending, active, completed
depends_on: []
inputs: [intent.md, knowledge/DISCOVERY.md, stages/design/DESIGN-BRIEF.md]
bolt: 0
hat: ""
started_at: "2025-01-15T00:00:00Z"
completed_at: "2025-01-16T00:00:00Z"
---
\`\`\`

The \`inputs:\` field lists relative paths from the intent root that this unit depends on. These tell the FSM what upstream artifacts must exist before execution. The paths reference:
- \`intent.md\` — the intent definition itself
- \`knowledge/DISCOVERY.md\` — inception's discovery output
- \`stages/{stage}/{ARTIFACT}.md\` — discovery outputs from prior stages

### Stage Definitions for Studio "${diagnosis.studio}"

The following stages are defined in the studio. Each stage's \`inputs:\` field in its STAGE.md lists what upstream artifacts it expects:

${stageDefinitions}

## Valid Values Reference

- Stage status: \`pending\`, \`active\`, \`completed\`
- Stage phase: \`elaborate\`, \`execute\`, \`review\`, \`gate\` (or empty string for pending)
- Gate outcome: \`advanced\`, \`blocked\`, \`requested_changes\`, or \`null\`
- Unit status: \`pending\`, \`active\`, \`completed\`

## Working Directory

You are running from the intent directory: \`${diagnosis.intentDir}\`
You also have read access to the studio definition at: \`${diagnosis.studioDir}\`

All file paths you read/write should be relative to the intent directory unless reading studio definitions.`
}

/**
 * Build the task-specific prompt describing exactly what needs to be repaired
 * in this intent.
 */
function buildTaskPrompt(diagnosis: RepairDiagnosis): string {
	const sections: string[] = []

	sections.push(
		`Repair intent "${diagnosis.slug}" (studio: ${diagnosis.studio}, active stage: ${diagnosis.activeStage}).`,
	)

	// What was already done mechanically
	if (diagnosis.synthesizedStages.length > 0) {
		sections.push(
			`## Already Fixed (Mechanical Synthesis)

The following stages had no units and were automatically marked as completed with synthesized completion records:
${diagnosis.synthesizedStages.map((s) => `- **${s}**: state.json created with status=completed, gate_outcome=advanced`).join("\n")}

No action needed for these stages — they are done.`,
		)
	}

	// Stages that need manual review
	if (diagnosis.needsManualReview.length > 0) {
		sections.push(
			`## Stages Needing Review

The following stages have units but are NOT marked as completed. Examine each stage:

${diagnosis.needsManualReview.map((s) => `- **${s}**`).join("\n")}

For each stage listed above:
1. Read the stage's \`state.json\` (at \`stages/${"{stage}"}/state.json\`)
2. Read all unit files in \`stages/${"{stage}"}/units/\`
3. If ALL units have \`status: completed\`, the stage is legitimately complete — update state.json:
   - Set \`status\` to \`"completed"\`
   - Set \`phase\` to \`"gate"\`
   - Set \`gate_outcome\` to \`"advanced"\`
   - Set \`completed_at\` to the current timestamp
4. If some units are still pending/active, leave the stage as-is but make sure state.json exists with \`status: "active"\``,
		)
	}

	// Phase regression
	if (diagnosis.phaseRegressed) {
		sections.push(
			`## Phase Regression

The active stage "${diagnosis.activeStage}" was regressed from "execute" back to "elaborate" because units are missing \`inputs:\` declarations. The stage's state.json already reflects this (phase="elaborate"). Your job is to add the missing inputs to the units listed below.`,
		)
	}

	// Units missing inputs
	if (diagnosis.unitsMissingInputs.length > 0) {
		sections.push(
			`## Units Missing \`inputs:\` Declarations

The following unit files in the active stage "${diagnosis.activeStage}" have no \`inputs:\` field or it is empty:

${diagnosis.unitsMissingInputs.map((u) => `- \`stages/${diagnosis.activeStage}/units/${u}\``).join("\n")}

To fix each unit:

1. Read the studio's STAGE.md for "${diagnosis.activeStage}" at \`${diagnosis.studioDir}/stages/${diagnosis.activeStage}/STAGE.md\` to see what upstream artifacts this stage expects (the \`inputs:\` field in STAGE.md frontmatter lists them as \`stage: X, discovery: Y\` pairs)
2. Read the unit's content to understand what it does
3. Add an \`inputs:\` field to the unit's YAML frontmatter with the relevant upstream artifact paths

Input paths are relative to the intent root. Common patterns:
- \`intent.md\` — the intent definition
- \`knowledge/DISCOVERY.md\` — inception's discovery document
- \`stages/design/DESIGN-BRIEF.md\` — design stage's brief
- \`stages/design/DESIGN-TOKENS.md\` — design stage's tokens
- \`stages/product/ACCEPTANCE-CRITERIA.md\` — product stage's criteria
- \`stages/product/BEHAVIORAL-SPEC.md\` — product stage's behavioral spec
- \`stages/product/DATA-CONTRACTS.md\` — product stage's data contracts

Not every unit needs all inputs — read the unit's content and the stage definition to determine which are relevant. At minimum, every unit should have \`intent.md\` and \`knowledge/DISCOVERY.md\` as inputs, plus any stage-specific artifacts listed in the STAGE.md \`inputs:\` field.`,
		)
	}

	// Check for missing discovery artifacts
	const missingDiscovery = findMissingDiscoveryArtifacts(diagnosis)
	if (missingDiscovery.length > 0) {
		sections.push(
			`## Missing Discovery Artifact Stubs

The following discovery artifacts are expected by downstream stages but don't exist in the intent directory. Create stub files with frontmatter only (no body content — the elaboration phase will fill them in):

${missingDiscovery
	.map(
		(d) => `- \`${d.path}\` — expected by stage "${d.neededBy}"
  Create with frontmatter:
  \`\`\`yaml
  ---
  name: ${d.name}
  status: stub
  created_by: repair-agent
  ---
  \`\`\``,
	)
	.join("\n\n")}`,
		)
	}

	sections.push(
		`## When Done

After making all repairs, summarize:
1. Which state.json files were updated and what changed
2. Which unit frontmatter files were updated (and what inputs were added)
3. Which discovery artifact stubs were created
4. Any issues that could not be automatically resolved and need human attention`,
	)

	return sections.join("\n\n")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read all STAGE.md files from the studio directory and return a formatted
 * summary the repair agent can use.
 */
function readStageDefinitions(studioDir: string): string {
	const stagesDir = join(studioDir, "stages")
	if (!existsSync(stagesDir)) return "(no stages directory found)"

	const stages: string[] = []
	let entries: string[]
	try {
		entries = readdirSync(stagesDir).filter((d) =>
			existsSync(join(stagesDir, d, "STAGE.md")),
		)
	} catch {
		return "(could not read stages directory)"
	}

	for (const stageName of entries) {
		const stageMd = join(stagesDir, stageName, "STAGE.md")
		try {
			const raw = readFileSync(stageMd, "utf8")
			// Extract frontmatter
			const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
			const frontmatter = fmMatch ? fmMatch[1] : "(no frontmatter)"
			stages.push(`### ${stageName}\n\`\`\`yaml\n${frontmatter}\n\`\`\``)
		} catch {
			stages.push(`### ${stageName}\n(could not read STAGE.md)`)
		}
	}

	return stages.join("\n\n")
}

interface MissingDiscoveryArtifact {
	name: string
	path: string // relative path within the intent directory
	neededBy: string // stage that needs this artifact
}

/**
 * Check which discovery artifacts are expected by completed or active stages
 * but don't exist in the intent directory.
 */
function findMissingDiscoveryArtifacts(
	diagnosis: RepairDiagnosis,
): MissingDiscoveryArtifact[] {
	const missing: MissingDiscoveryArtifact[] = []
	const stagesDir = join(diagnosis.studioDir, "stages")

	if (!existsSync(stagesDir)) return missing

	// Map of discovery artifact name -> the stage that produces it
	// (based on the output/discovery templates in the studio)
	const discoveryLocations: Record<string, string> = {
		discovery: "knowledge/DISCOVERY.md",
		"design-brief": "stages/design/DESIGN-BRIEF.md",
		"design-tokens": "stages/design/DESIGN-TOKENS.md",
		"acceptance-criteria": "stages/product/ACCEPTANCE-CRITERIA.md",
		"behavioral-spec": "stages/product/BEHAVIORAL-SPEC.md",
		"data-contracts": "stages/product/DATA-CONTRACTS.md",
		"coverage-mapping": "stages/product/COVERAGE-MAPPING.md",
		architecture: "stages/development/ARCHITECTURE.md",
		"threat-model": "stages/security/THREAT-MODEL.md",
		"vuln-report": "stages/security/VULN-REPORT.md",
		runbook: "stages/operations/RUNBOOK.md",
	}

	// Read the active stage's STAGE.md to find what inputs it expects
	const activeStageMd = join(stagesDir, diagnosis.activeStage, "STAGE.md")
	if (!existsSync(activeStageMd)) return missing

	try {
		const raw = readFileSync(activeStageMd, "utf8")
		const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
		if (!fmMatch) return missing

		// Parse the inputs: field from frontmatter
		// Format: inputs:\n  - stage: inception\n    discovery: discovery
		const inputsMatch = fmMatch[1].match(
			/inputs:\s*\n((?:\s+-\s+[\s\S]*?)(?=\n\w|\n---|$))/,
		)
		if (!inputsMatch) return missing

		// Extract each input entry's discovery field
		const inputEntries = Array.from(
			inputsMatch[1].matchAll(/discovery:\s*(\S+)/g),
		)
		for (const match of inputEntries) {
			const artifactName = match[1]
			const localPath = discoveryLocations[artifactName]
			if (localPath) {
				const fullPath = join(diagnosis.intentDir, localPath)
				if (!existsSync(fullPath)) {
					missing.push({
						name: artifactName,
						path: localPath,
						neededBy: diagnosis.activeStage,
					})
				}
			}
		}
	} catch {
		// If we can't read stage definitions, skip discovery check
	}

	return missing
}
