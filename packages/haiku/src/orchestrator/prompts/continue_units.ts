// orchestrator/prompts/continue_units.ts — Parallel wave continuation.
// Same shape as start_units but per-unit hat/bolt come from the
// action payload (the workflow engine has tracked which unit is on which hat).
// Always subagent-capable path — continue_units is only emitted on
// harnesses with subagents.support === true (the workflow engine keeps the
// hookless harness on a single sequential unit at a time).

import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { features } from "../../config.js"
import { getCapabilities } from "../../harness.js"
import { type ModelTier, resolveModel } from "../../model-selection.js"
import {
	buildFeedbackAssessorPrompt,
	resolveStudioFilePath,
} from "../../orchestrator.js"
import { parseFrontmatter, readFeedbackFiles } from "../../state-tools.js"
import {
	readHatDefs,
	readStageDef,
	readStudio,
	resolveStageInputs,
} from "../../studio-reader.js"
import {
	buildInterpretationBlock,
	buildPriorRejectBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"
import { SUBAGENT_ERROR_RECOVERY } from "./SUBAGENT_ERROR_RECOVERY.js"

interface UnitEntry {
	name: string
	hat: string
	bolt: number
	worktree: string | null
}

export default definePromptBuilder(({ slug, studio, action, dir }) => {
	const stage = action.stage as string
	const entries = (action.units as UnitEntry[]) || []

	const stagePath = resolveStudioFilePath(
		join(studio, "stages", stage, "STAGE.md"),
	)
	const executionPath = resolveStudioFilePath(
		join(studio, "stages", stage, "phases", "EXECUTION.md"),
	)
	const outputsDir = resolveStudioFilePath(
		join(studio, "stages", stage, "outputs"),
	)

	// Shared upstream artifacts (resolved to relative paths; each unit
	// rewrites to absolute against its own worktree root).
	const upstreamRels: Array<{ label: string; relPath: string }> = []
	{
		const stageDef = readStageDef(studio, stage)
		if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
			const inputs = stageDef.data.inputs as Array<{
				stage: string
				discovery?: string
				output?: string
			}>
			const resolvedInputs = resolveStageInputs(studio, inputs, dir, slug)
			for (const r of resolvedInputs.filter((x) => x.exists)) {
				const relPath = r.resolvedPath.startsWith(`${dir}/`)
					? r.resolvedPath.slice(dir.length + 1)
					: r.resolvedPath
				upstreamRels.push({
					label: `${r.stage}/${r.artifactName}`,
					relPath,
				})
			}
		}
	}

	const hatDefs = readHatDefs(studio, stage)
	const stageHats = (action.hats as string[]) || []
	const firstStageHat = stageHats[0] || ""

	const sections: string[] = []
	sections.push(`## Run these ${entries.length} subagent(s) in parallel`)

	for (const entry of entries) {
		const { name: unitName, hat, bolt, worktree: wt } = entry
		const hatPath = resolveStudioFilePath(
			join(studio, "stages", stage, "hats", `${hat}.md`),
		)
		const hatDef = hatDefs[hat]
		const hatAgentType = hatDef?.agent_type || "general-purpose"

		let resolvedModel: ModelTier | undefined
		if (features.modelSelection) {
			const stageDef = readStageDef(studio, stage)
			const studioData = readStudio(studio)
			const { model } = resolveModel({
				hat: hatDef?.model,
				stage: stageDef?.data?.default_model as string | undefined,
				studio: studioData?.data?.default_model as string | undefined,
			})
			resolvedModel = model
		}

		const unitFile = join(
			dir,
			"stages",
			stage,
			"units",
			unitName.endsWith(".md") ? unitName : `${unitName}.md`,
		)

		const unitIntentRoot = wt ? join(wt, ".haiku", "intents", slug) : dir
		const unitAbsPath = join(
			unitIntentRoot,
			"stages",
			stage,
			"units",
			unitName.endsWith(".md") ? unitName : `${unitName}.md`,
		)

		// Feedback-assessor hat gets a distinct prompt — its job is to
		// verify the unit's `closes:` claims, not produce artifacts.
		if (hat === "feedback-assessor") {
			const unitFm = existsSync(unitFile)
				? parseFrontmatter(readFileSync(unitFile, "utf8")).data
				: {}
			const closes = (unitFm.closes as string[]) || []
			const unitOutputs = (unitFm.outputs as string[]) || []
			const feedbackFiles: Array<{ id: string; file: string }> = []
			const allFeedback = readFeedbackFiles(slug, stage)
			for (const fbId of closes) {
				const found = allFeedback.find((f) => f.id === fbId)
				if (found) {
					feedbackFiles.push({
						id: found.id,
						file: found.file.startsWith(".haiku/intents/")
							? found.file.slice(`.haiku/intents/${slug}/`.length)
							: found.file,
					})
				}
			}
			const assessorPrompt = buildFeedbackAssessorPrompt({
				slug,
				studio,
				stage,
				unit: unitName,
				bolt,
				worktreePath: wt || "",
				intentRoot: unitIntentRoot,
				unitAbsPath,
				closes,
				feedbackFiles,
				unitOutputs,
			})
			sections.push(
				emitSubagentDispatchBlock({
					unit: unitName,
					hat: "feedback-assessor",
					bolt,
					agentType: hatAgentType,
					model: resolvedModel,
					promptBody: assessorPrompt,
					heading: `### Subagent: ${unitName} (feedback-assessor · bolt ${bolt})`,
				}),
			)
			continue
		}

		let unitInputs: string[] = []
		if (existsSync(unitFile)) {
			const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
			unitInputs = (data.inputs as string[]) || (data.refs as string[]) || []
		}
		const unitInputPaths: string[] = []
		if (unitInputs.length > 0) {
			const dirResolved = resolve(dir)
			for (const ref of unitInputs) {
				const refResolved = resolve(dir, ref)
				if (
					!refResolved.startsWith(`${dirResolved}/`) &&
					refResolved !== dirResolved
				)
					continue
				if (existsSync(join(dir, ref))) unitInputPaths.push(ref)
			}
		}

		const prompt: string[] = [
			`You are continuing unit **${unitName}** as hat **${hat}** (bolt ${bolt}) in stage **${stage}** of studio **${studio}** for intent **${slug}**.`,
			"",
		]
		if (wt) {
			prompt.push(
				`**Unit worktree:** \`${wt}\` (intent dir: \`${unitIntentRoot}\`). Read and write the intent files at this path — it contains any prior-hat commits not yet merged to the parent branch. **Your FIRST Bash command MUST be \`cd <worktree path>\`.** Every git, npm, node, and shell command that follows must run from inside the worktree. Git commits land on the unit's branch only if you are inside the worktree's tree. Absolute paths below are for Read/Write tool references, but shell-layer work (install, build, test, commit) requires the cwd to be the worktree. Verify with \`pwd\` after \`cd\` if in doubt.

**Bash timeouts are MANDATORY on long-running commands.** Never let a test, build, install, or lint hang the hat indefinitely. Every Bash call that runs \`npm test\`, \`vitest\`, \`npx tsc\`, \`npm run build\`, \`npm install\`, \`playwright\`, or any Node CLI must pass an explicit \`timeout\` parameter:

- typecheck / lint: \`timeout: 120000\` (2 min)
- test runs: \`timeout: 300000\` (5 min)
- builds / install: \`timeout: 600000\` (10 min; the hard cap)

If a command times out, do NOT retry blindly — diagnose why (hanging test, network fetch, infinite loop in a watcher) and fix the underlying cause. A command that legitimately needs more than 10 minutes is a spec problem, not a timeout problem; surface it via \`haiku_unit_reject_hat\` rather than hanging the bolt.`,
				"",
			)
		}
		prompt.push(
			"## Required context (inlined below)",
			"Everything you need for this hat is embedded in this prompt — no need to fan out Read tool calls for the required files. If you need VISUAL artifacts (SVG, PNG, PDF), open them by path as listed in the unit spec.",
			"",
		)
		if (stagePath) prompt.push(inlineFile(stagePath, "Stage scope"))
		if (executionPath)
			prompt.push(inlineFile(executionPath, "Execute-phase focus"))
		if (hatPath) {
			prompt.push(inlineFile(hatPath, `Hat: ${hat}`))
			const hatInterp = buildInterpretationBlock(readInterpretation(hatPath))
			if (hatInterp) prompt.push("", hatInterp)
		}
		prompt.push(inlineFile(unitAbsPath, `Unit spec: ${unitName}`))
		if (outputsDir) prompt.push(`- Stage output templates — \`${outputsDir}/\``)

		const priorRejectBlock = buildPriorRejectBlock(unitFile)
		if (priorRejectBlock) prompt.push("", priorRejectBlock)

		if (unitInputPaths.length > 0) {
			prompt.push(
				"",
				"## Unit inputs (MUST read — scoped to this unit)",
				"Inputs may be markdown, HTML, SVG, PNG/JPG, or PDF — fetch each with the appropriate tool.",
				"",
				...unitInputPaths.map((p) => `- \`${join(unitIntentRoot, p)}\``),
			)
		}
		if (upstreamRels.length > 0) {
			prompt.push(
				"",
				"## Available upstream artifacts (stage-wide — read what's relevant)",
				"Not required reading — open only what your unit's scope needs.",
				"",
				...upstreamRels.map(
					(u) => `- **${u.label}** — \`${join(unitIntentRoot, u.relPath)}\``,
				),
			)
		}

		prompt.push("", "## Instructions", "")
		let step = 1
		if (wt) {
			prompt.push(
				`${step++}. Commit frequently inside the worktree: \`git add -A && git commit -m "..."\`. Do NOT push.`,
			)
		}
		const isFirstHat = hat === firstStageHat
		prompt.push(
			`${step++}. When done: call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unitName}" }\``,
			isFirstHat
				? `${step++}. **If blocked**, you are the first hat in this stage's hat sequence — there is no previous hat to reject back to. Do NOT call \`haiku_unit_reject_hat\`. Instead: surface ambiguity via \`AskUserQuestion\` (or \`ask_user_visual_question\` for visual decisions); if upstream-stage outputs are missing, log a stage_revisit feedback at the upstream stage via \`haiku_feedback { intent: "${slug}", stage: "<earlier-stage>", title: "<upstream gap>", body: "<what's missing>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\`; if you've found a real defect in the spec or upstream artifact, log it via \`haiku_feedback\`. The first hat escalates outward, not backward.`
				: `${step++}. If blocked: call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unitName}" }\``,
			`${step++}. **CRITICAL — Relay the Workflow Result path.** When \`advance_hat\`${isFirstHat ? "" : " or `reject_hat`"} returns, its tool response contains a result-file path and instructs you to reply with exactly \`Workflow Result: <path>\`. Your FINAL MESSAGE to the parent MUST BE EXACTLY that one line — nothing before, nothing after. Do NOT summarize the work, do NOT describe what you did, do NOT paraphrase the result. The parent reads the file to drive the next workflow action. If the tool returned plaintext instead of a result path (e.g. "job ends here — parent will call haiku_run_next"), relay THAT plaintext verbatim as your final message.`,
			`${step++}. Track outputs in unit frontmatter \`outputs:\` field`,
			`${step++}. If outputs from a previous stage are missing: log a stage_revisit feedback at that stage via \`haiku_feedback { intent: "${slug}", stage: "<earlier-stage>", title: "<missing output>", body: "<what's needed>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\` — the pre-tick gate routes the rewind.`,
			"",
			"**Autonomy:** You are one of a parallel wave — execute without asking the user to confirm per-step. The workflow engine coordinates the wave. Do NOT ask which unit runs first, whether to advance a hat, whether to commit/push. Use `AskUserQuestion`/`ask_user_visual_question` only when genuinely blocked on ambiguous requirements.",
			"",
			SUBAGENT_ERROR_RECOVERY,
		)

		sections.push(
			emitSubagentDispatchBlock({
				unit: unitName,
				hat,
				bolt,
				agentType: hatAgentType,
				model: resolvedModel,
				promptBody: prompt.join("\n"),
				heading: `### Subagent: ${unitName} (${hat} · bolt ${bolt})`,
			}),
		)
	}

	{
		const bgClause = getCapabilities().subagents.backgroundSpawn
			? '`background="true"` → `run_in_background: true` (always present on hat dispatches — pass it through; the parent waits on results, so foreground would block this thread); '
			: ""
		sections.push(
			[
				"### Parent Instructions",
				"",
				`Spawn each \`<subagent>\` block above using the Task tool: \`type\` → \`subagent_type\`; \`model\` → \`model\` (omit when absent); ${bgClause}\`prompt_file\` → prompt body is literally \`"Read <path> and execute its instructions exactly."\`. Do not add anything beyond that one-line prompt body — the workflow engine owns the authoritative prompt at the file path.`,
				"",
				`**Run all ${entries.length} in parallel.** Each subagent's final message will be one of:`,
				"",
				`(a) \`Workflow Result: <path>\` — read that JSON file. Branch on \`action\`:`,
				`  - \`continue_unit\` (with \`prompt_file\`) — the unit advanced its hat mid-wave. Spawn ONE new subagent against the result file's \`prompt_file\` exactly the way you spawned the original wave entries (one-line prompt body \`"Read <prompt_file> and execute its instructions exactly."\`, same \`subagent_type\`/model/background flags). Do NOT call \`haiku_run_next\` — the wave slot is held by the unit and the engine has already rendered the next-hat dispatch. Continue waiting on the rest of the wave.`,
				`  - any other action (\`advance_phase\`, \`advance_stage\`, \`gate_review\`, \`intent_complete\`, etc.) — the wave is done. Call \`haiku_run_next { intent: "${slug}" }\` to drive the next workflow step.`,
				"",
				`(b) plaintext "job ends here" / "completed (last hat)" — this unit's hat sequence is exhausted. Another subagent in the wave will produce a structured result eventually; do NOT dispatch and do NOT call \`haiku_run_next\` yet.`,
				"",
				`(c) anything else (non-compliant) — fall back to calling \`haiku_run_next { intent: "${slug}" }\`.`,
				"",
				`Stop driving only when \`haiku_run_next\` returns a terminal action (\`gate_review\`, \`escalate\`, \`intent_complete\`, or \`error\`).`,
			].join("\n"),
		)
	}

	return sections.join("\n\n")
})
