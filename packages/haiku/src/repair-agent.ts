// repair-agent.ts — Embedded repair agent using Claude Agent SDK
//
// Spawns a headless Claude Code session scoped to an intent directory.
// The agent can read/write intent state files without going through the
// harness hook pipeline — it runs inside the MCP server process with
// direct filesystem access.
//
// Falls back gracefully when the Agent SDK is not installed.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"

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
	// biome-ignore lint/suspicious/noExplicitAny: SDK type depends on optional peer dep
	let query: any
	try {
		const sdk = await import("@anthropic-ai/claude-agent-sdk")
		query = sdk.query
	} catch {
		// SDK not available — return fallback
		return {
			success: false,
			summary:
				"Claude Agent SDK not available — mechanical repair applied, remaining issues need manual attention",
			fallbackUsed: true,
		}
	}

	// Build the system prompt with full context about what needs repair
	const systemPrompt = buildRepairPrompt(diagnosis)

	// Build the task prompt
	const taskPrompt = buildTaskPrompt(diagnosis)

	const REPAIR_TIMEOUT_MS = 120_000

	try {
		const queryPromise = (async () => {
			let result = ""
			for await (const message of query({
				prompt: taskPrompt,
				options: {
					model: "claude-haiku-4-5-20251001",
					cwd: diagnosis.intentDir,
					additionalDirectories: [diagnosis.studioDir],
					// Edit is intentionally NOT in the allow-list — it was the
					// mechanism that corrupted unit FM (agent edits a single
					// field, gray-matter rewrites, scoped writes silently
					// transform YAML lists into JSON-stuffed scalars). Write is
					// kept for discovery-stub creation only; the system prompt
					// forbids writing to unit/feedback/state.json paths.
					allowedTools: ["Read", "Write", "Glob", "Grep"],
					disallowedTools: ["Bash", "Agent", "WebSearch", "WebFetch", "Edit"],
					permissionMode: "dontAsk",
					maxTurns: 25,
					systemPrompt,
				},
			})) {
				if (message.type === "result") {
					result = message.result || ""
				}
			}
			return result
		})()

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error("repair agent timed out")),
				REPAIR_TIMEOUT_MS,
			),
		)

		const result = await Promise.race([queryPromise, timeoutPromise])

		return {
			success: result.trim().length > 0,
			summary: result || "Repair agent completed but produced no output",
			fallbackUsed: false,
		}
	} catch (err) {
		return {
			success: false,
			summary: `Repair agent failed: ${err instanceof Error ? err.message : String(err)}`,
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

## Constraints (CRITICAL — non-negotiable)

You only have \`Read\`, \`Write\`, \`Glob\`, and \`Grep\` (Edit, Bash, Agent, WebSearch, WebFetch are disallowed). \`Write\` overwrites whole files at any path the cwd reaches, so the path itself is YOUR enforcement: before every \`Write\` call, verify the target path matches the allowlist below. If it doesn't, STOP and add a human-attention item to your summary instead.

### Write-path allowlist (anything outside is forbidden)

- \`intent.md\` — frontmatter edits only; preserve body prose verbatim.
- \`knowledge/*.md\` — create missing discovery artifact stubs (frontmatter-only) when downstream stages expect them.

### Write-path denylist (touch ⇒ corruption)

- \`stages/*/state.json\` — DEAD in v4. The migrator deletes any pre-existing files. Stage status, phase, and gate outcome are derived on demand from per-unit FM (\`iterations[]\`, \`reviews{}\`, \`approvals{}\`) plus branch-merge state. Writing state.json is a no-op the engine never reads back; flag the stage for human attention instead.
- \`stages/*/units/*.md\` — workflow-managed. Mechanical pre-tick repair has already populated any missing \`inputs:\` field before you were invoked. If you think a unit needs changes, that is OUT OF SCOPE — flag it for human attention.
- \`stages/*/feedback/*.md\` — workflow-managed.
- \`stages/*/iterations.jsonl\`, \`stages/*/decisions.jsonl\`, \`stages/*/no-decisions.json\`, \`stages/*/upstream-reconciliation.json\`, \`stages/*/gate-session.json\` — engine-owned sidecar artifacts.
- Source code, tests, application files anywhere — never.

### Other rules

- NEVER delete any existing files.
- NEVER use \`Write\` to "patch" a file by re-reading it and writing a small change — unless you've fully read the existing content and you are preserving everything except the specific field you intended to update. Whole-file rewrites that drop fields silently caused the corruption that necessitated this prompt.

If you find yourself reaching for a path under \`units/\` or \`feedback/\`, STOP. Add the issue to your end-of-run summary as a human-attention item and move on.

## What a Healthy Intent Looks Like

An intent lives at \`.haiku/intents/{slug}/\` with this structure:

\`\`\`
intent.md                          # Intent definition with YAML frontmatter
knowledge/                         # Shared knowledge artifacts
  DISCOVERY.md                     # Domain research from inception
stages/
  {stage-name}/
    elaboration.md                 # (v4) Per-stage conversation gate artifact
    units/
      unit-01-slug.md              # Unit files with YAML frontmatter
      unit-02-slug.md
    artifacts/                     # Stage-specific outputs (optional)
    iterations.jsonl               # (v4) Per-stage iteration log — engine-owned
    decisions.jsonl                # (v4) haiku_decision_record log — engine-owned
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

### Unit Frontmatter (READ-ONLY for this agent)

Unit files in \`stages/*/units/*.md\` are workflow-managed. **You do not edit them.** They show up here only so you understand what a healthy unit looks like when reading state.

### Stage Definitions for Studio "${diagnosis.studio}"

The following stages are defined in the studio. Each stage's \`inputs:\` field in its STAGE.md lists what upstream artifacts it expects:

${stageDefinitions}

## v4 Stage State (read-only, derived)

Stage status, phase, and gate outcome are derived by the workflow engine on demand from per-unit FM and branch-merge state. There is no \`state.json\` to read or write — the v0→v4 migrator deletes the file. The derivation:

- **status**: branch-merge state in git mode (does intent main carry the stage's units?), otherwise per-unit completion (every unit terminal-advanced + every required approval signed).
- **phase**: the earliest milestone the stage hasn't cleared — elaborate (no verified \`elaboration.md\` or no units), execute (units exist but hat sequence not done), review (all hats done but reviews missing), gate (reviews signed but approvals missing).
- **gate_outcome**: \`"advanced"\` iff every unit has every required approval signed; otherwise \`null\`.

If a stage looks "stuck" you suspect should be marked complete: the per-unit FM is the truth, not state.json. Flag the stage in your end-of-run summary; do not invent a state.json.

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

The following stages had no units and were skipped — the v4 cursor will treat them as already-merged when intent main carries no units for them:
${diagnosis.synthesizedStages.map((s) => `- **${s}**`).join("\n")}

No action needed for these stages.`,
		)
	}

	// Stages that need manual review
	if (diagnosis.needsManualReview.length > 0) {
		sections.push(
			`## Stages Needing Review (read-only)

The following stages have units that the v4 cursor cannot mark complete on its own (per-unit FM doesn't yet show terminal advance + every required approval):

${diagnosis.needsManualReview.map((s) => `- **${s}**`).join("\n")}

**Do NOT write state.json or unit files.** Stage status is derived in v4 — there is no file you can edit to mark a stage complete. For each stage listed above:
1. Read the unit files in \`stages/${"{stage}"}/units/\` (read-only).
2. Note in your end-of-run summary: which units appear stuck, what hat sequence they're missing, what role hasn't signed approval.
3. The user will resolve manually via \`haiku_run_next\` ticks (or \`/haiku:revisit\` if a stage needs to be re-opened).`,
		)
	}

	// Phase regression — informational only. Pre-tick already
	// mechanically populated any missing `inputs:` before invoking the
	// SDK; if `phaseRegressed` is still true, it means at least one
	// unit could not be auto-fixed (file read error, etc.) and the
	// residual list is in `unitsMissingInputs`. The agent does NOT
	// edit unit files — flag the residual for human attention.
	if (diagnosis.phaseRegressed) {
		sections.push(
			`## Phase Regression (informational)

The active stage "${diagnosis.activeStage}" was regressed from "execute" back to "elaborate" because some units lack \`inputs:\` declarations and the mechanical auto-fix could not populate them. **Do not edit unit files yourself.** List the affected units below in your end-of-run summary as needing human attention.`,
		)
	}

	if (diagnosis.unitsMissingInputs.length > 0) {
		sections.push(
			`## Units With Unfixable \`inputs:\` (residual after mechanical auto-fix)

The mechanical pre-tick repair tried to populate \`inputs:\` on these units (using \`intent.md\` + every \`knowledge/*.md\` as the fallback) and failed:

${diagnosis.unitsMissingInputs.map((u) => `- \`stages/${diagnosis.activeStage}/units/${u}\``).join("\n")}

**Do NOT edit these files.** Surface them in your end-of-run summary as needing human attention. The workflow engine will refuse to advance until inputs are present, so the user will see the issue and resolve it manually.`,
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
1. Which discovery artifact stubs were created (and their paths)
2. Which stages are stuck and why (read-only observations only — do not write state.json)
3. Any issues that could not be automatically resolved and need human attention (residual unit \`inputs:\` problems, unit content concerns, anything you spotted but cannot touch)`,
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
			const { data: stageFm } = matter(raw)
			const frontmatter =
				Object.keys(stageFm).length > 0
					? Object.entries(stageFm)
							.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
							.join("\n")
					: "(no frontmatter)"
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

	// Build discovery locations dynamically from the studio's discovery templates.
	// Each stage may have a discovery/ directory containing *.md templates with
	// `name` and `location` fields in their frontmatter.
	const discoveryLocations: Record<string, string> = {}
	let stageEntries: string[]
	try {
		stageEntries = readdirSync(stagesDir).filter((d) =>
			existsSync(join(stagesDir, d, "STAGE.md")),
		)
	} catch {
		return missing
	}

	for (const stageName of stageEntries) {
		const discoveryDir = join(stagesDir, stageName, "discovery")
		if (!existsSync(discoveryDir)) continue
		try {
			for (const file of readdirSync(discoveryDir).filter((f) =>
				f.endsWith(".md"),
			)) {
				const { data } = matter(readFileSync(join(discoveryDir, file), "utf8"))
				const name =
					(data.name as string) || file.replace(/\.md$/, "").toLowerCase()
				const location = (data.location as string) || ""
				// Resolve {intent-slug} template variable out of the location path
				// to get the relative path within an intent directory
				if (location) {
					discoveryLocations[name] = location
						.replace(/\{intent-slug\}/g, "")
						.replace(/^\.haiku\/intents\/\//, "")
				}
			}
		} catch {
			// Skip unreadable discovery directories
		}
	}

	// Read the active stage's STAGE.md to find what inputs it expects
	const activeStageMd = join(stagesDir, diagnosis.activeStage, "STAGE.md")
	if (!existsSync(activeStageMd)) return missing

	try {
		const raw = readFileSync(activeStageMd, "utf8")
		const { data: stageFm } = matter(raw)
		const inputs =
			(stageFm.inputs as Array<{
				stage?: string
				discovery?: string
				output?: string
			}>) || []
		for (const input of inputs) {
			if (input.discovery) {
				const localPath = discoveryLocations[input.discovery]
				if (localPath) {
					const fullPath = join(diagnosis.intentDir, localPath)
					if (!existsSync(fullPath)) {
						missing.push({
							name: input.discovery,
							path: localPath,
							neededBy: diagnosis.activeStage,
						})
					}
				}
			}
		}
	} catch {
		// If we can't read stage definitions, skip discovery check
	}

	return missing
}
