// orchestrator/prompts/start_units.ts — Parallel wave dispatcher for
// the first hat across N units. Two paths:
//   1. Subagent-capable harness — emit one <subagent> block per unit
//      with path-only inlines (each unit reads its own files); parent
//      runs them under the concurrency cap.
//   2. Subagentless — surface stage scope + hat path + per-unit
//      sequential plan; parent agent IS the executor.
//
// The continue_units variant lives next door — same shape but per-
// unit hat/bolt comes from the action payload instead of hardcoded
// to firstHat/bolt=1.

import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { features } from "../../config.js"
import { getCapabilities } from "../../harness.js"
import { type ModelTier, resolveModel } from "../../model-selection.js"
import { resolveStudioFilePath } from "../../orchestrator.js"
import { parseFrontmatter } from "../../state-tools.js"
import {
	readHatDefs,
	readStageDef,
	readStudio,
	resolveStageInputs,
} from "../../studio-reader.js"
import {
	buildInlineSubagentContext,
	buildInterpretationBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"
import { SUBAGENT_ERROR_RECOVERY } from "./SUBAGENT_ERROR_RECOVERY.js"
import { WORKFLOW_CONTRACTS_EXECUTE_BLOCK } from "./WORKFLOW_CONTRACTS_EXECUTE_BLOCK.js"

export default definePromptBuilder(({ slug, studio, action, dir }) => {
	const stage = action.stage as string
	const units = (action.units as string[]) || []
	const hats = (action.hats as string[]) || []
	const firstHat = (action.first_hat as string) || hats[0] || ""

	const sections: string[] = []
	sections.push(WORKFLOW_CONTRACTS_EXECUTE_BLOCK)

	// Resolve file paths (NOT content) — subagents read these
	// themselves. Keeps main-agent AND per-subagent context small.
	const stagePath = resolveStudioFilePath(
		join(studio, "stages", stage, "STAGE.md"),
	)
	const executionPath = resolveStudioFilePath(
		join(studio, "stages", stage, "phases", "EXECUTION.md"),
	)
	const hatPath = resolveStudioFilePath(
		join(studio, "stages", stage, "hats", `${firstHat}.md`),
	)
	const outputsDir = resolveStudioFilePath(
		join(studio, "stages", stage, "outputs"),
	)

	const hatDefs = readHatDefs(studio, stage)
	const hatDef = hatDefs[firstHat]
	const hatAgentType = hatDef?.agent_type || "general-purpose"

	let resolvedModelParallel: ModelTier | undefined
	if (features.modelSelection) {
		const stageDef = readStageDef(studio, stage)
		const studioData = readStudio(studio)
		const { model, source } = resolveModel({
			hat: hatDef?.model,
			stage: stageDef?.data?.default_model as string | undefined,
			studio: studioData?.data?.default_model as string | undefined,
		})
		resolvedModelParallel = model
		if (resolvedModelParallel) {
			console.error(
				`[haiku] parallel wave resolved model: ${resolvedModelParallel} (source: ${source})`,
			)
		}
	}

	// Upstream stage artifacts — labels + relative paths only. Per-unit
	// loop rewrites to absolute against each unit's worktree root.
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
			const found = resolvedInputs.filter((r) => r.exists)
			for (const r of found) {
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

	const inlineCtxParallel = buildInlineSubagentContext(
		slug,
		stage,
		firstHat,
		hats,
		1,
	)
	const parallelCaps = getCapabilities()

	const worktrees = (action.worktrees as Record<string, string | null>) || {}

	if (parallelCaps.subagents.supported) {
		// Subagent-capable harness: per-unit <subagent> blocks. Header text
		// keeps the parent's view minimal — no wave numbering, no hat names,
		// no internal-state leakage. The parent's job is "spawn N subagents,
		// follow each's return instruction." That's the entire contract.
		sections.push(`## Run these ${units.length} subagent(s) in parallel`)

		for (const unitName of units) {
			const unitFile = join(
				dir,
				"stages",
				stage,
				"units",
				unitName.endsWith(".md") ? unitName : `${unitName}.md`,
			)

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

			const wt = worktrees[unitName]
			const unitIntentRoot = wt ? join(wt, ".haiku", "intents", slug) : dir
			const unitAbsPath = join(
				unitIntentRoot,
				"stages",
				stage,
				"units",
				unitName.endsWith(".md") ? unitName : `${unitName}.md`,
			)

			const prompt: string[] = [
				`You are executing unit **${unitName}** as hat **${firstHat}** in stage **${stage}** of studio **${studio}** for intent **${slug}**.`,
				"",
			]
			if (wt) {
				prompt.push(
					`**Unit worktree:** \`${wt}\` (intent dir: \`${unitIntentRoot}\`). Read and write the intent files at this path. **Your FIRST Bash command MUST be \`cd <worktree path>\`.** Every git, npm, node, and shell command that follows must run from inside the worktree. Git commits land on the unit's branch only if you are inside the worktree's tree. Absolute paths below are for Read/Write tool references, but shell-layer work (install, build, test, commit) requires the cwd to be the worktree. Verify with \`pwd\` after \`cd\` if in doubt.

**Bash timeouts are MANDATORY on long-running commands.** Never let a test, build, install, or lint hang the hat indefinitely. Every Bash call that runs \`npm test\`, \`vitest\`, \`npx tsc\`, \`npm run build\`, \`npm install\`, \`playwright\`, or any Node CLI must pass an explicit \`timeout\` parameter:

- typecheck / lint: \`timeout: 120000\` (2 min)
- test runs: \`timeout: 300000\` (5 min)
- builds / install: \`timeout: 600000\` (10 min; the hard cap)

If a command times out, do NOT retry blindly — diagnose why (hanging test, network fetch, infinite loop in a watcher) and fix the underlying cause. A command that legitimately needs more than 10 minutes is a spec problem, not a timeout problem; this wave dispatches the first hat in the stage's hat sequence, so surface it via \`AskUserQuestion\` (or \`haiku_feedback\` with \`resolution: "stage_revisit"\` at the upstream stage) rather than hanging the bolt — do NOT call \`haiku_unit_reject_hat\` on the first hat.`,
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
				prompt.push(inlineFile(hatPath, `Hat: ${firstHat}`))
				const hatInterp = buildInterpretationBlock(readInterpretation(hatPath))
				if (hatInterp) prompt.push("", hatInterp)
			}
			prompt.push(inlineFile(unitAbsPath, `Unit spec: ${unitName}`))
			if (outputsDir)
				prompt.push(`- Stage output templates — \`${outputsDir}/\``)

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
			prompt.push(
				`${step++}. Call \`haiku_unit_start { intent: "${slug}", unit: "${unitName}" }\``,
			)
			if (wt) {
				prompt.push(
					`${step++}. Commit frequently inside the worktree: \`git add -A && git commit -m "..."\`. Do NOT push.`,
				)
			}
			prompt.push(
				`${step++}. Call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unitName}" }\` when done`,
				`${step++}. **If blocked**, you are the first hat in this stage's hat sequence — there is no previous hat to reject back to. Do NOT call \`haiku_unit_reject_hat\`. Instead: surface ambiguity via \`AskUserQuestion\` (or \`ask_user_visual_question\` for visual decisions); if upstream-stage outputs are missing, log a stage_revisit feedback at the upstream stage via \`haiku_feedback { intent: "${slug}", stage: "<earlier-stage>", title: "<upstream gap>", body: "<what's missing>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\`; if you've found a real defect in the spec or upstream artifact, log it via \`haiku_feedback\`. The first hat escalates outward, not backward.`,
				`${step++}. **CRITICAL — Relay the Workflow Result path.** When \`advance_hat\` returns, its tool response contains a result-file path and instructs you to reply with exactly \`Workflow Result: <path>\`. Your FINAL MESSAGE to the parent MUST BE EXACTLY that one line — nothing before, nothing after. Do NOT summarize the work, do NOT describe what you did, do NOT paraphrase the result. The parent reads the file to drive the next workflow action. If the tool returned plaintext instead of a result path (e.g. "job ends here — parent will call haiku_run_next"), relay THAT plaintext verbatim as your final message.`,
				`${step++}. Track outputs in unit frontmatter \`outputs:\` field`,
				`${step++}. If outputs from a previous stage are missing: log a stage_revisit feedback at that stage via \`haiku_feedback { intent: "${slug}", stage: "<earlier-stage>", title: "<missing output>", body: "<what's needed>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\` — the pre-tick gate routes the rewind.`,
				"",
				"**Autonomy:** You are one of a parallel wave — execute without asking the user to confirm per-step. The workflow engine coordinates the wave. Do NOT ask which unit runs first, whether to advance a hat, whether to commit/push. Use `AskUserQuestion`/`ask_user_visual_question` only when genuinely blocked on ambiguous requirements.",
				"",
				SUBAGENT_ERROR_RECOVERY,
			)

			const promptBody = inlineCtxParallel
				? `${inlineCtxParallel}\n\n${prompt.join("\n")}`
				: prompt.join("\n")
			sections.push(
				emitSubagentDispatchBlock({
					unit: unitName,
					hat: firstHat,
					bolt: 1,
					agentType: hatAgentType,
					model: resolvedModelParallel,
					promptBody,
					heading: `### Subagent: ${unitName}`,
					toolAttr: true,
				}),
			)
		}

		{
			const bgClause = parallelCaps.subagents.backgroundSpawn
				? '`background="true"` → `run_in_background: true` (always present on hat dispatches — pass it through; the parent waits on results, so foreground would block this thread); '
				: ""
			sections.push(
				[
					"### Parent Instructions",
					"",
					`Spawn each \`<subagent>\` block above using the Task tool: \`type\` → \`subagent_type\`; \`model\` → \`model\` (omit when absent); ${bgClause}\`prompt_file\` → prompt body is literally \`"Read <path> and execute its instructions exactly."\`. Do not add anything beyond that one-line prompt body — the workflow engine owns the authoritative prompt at the file path.`,
					"",
					`**Run all ${units.length} in parallel.** Each subagent's final message will be one of:`,
					"",
					`(a) \`Workflow Result: <path>\` — read that JSON file. Branch on \`action\`:`,
					`  - \`continue_unit\` (with \`prompt_file\`) — the unit advanced its hat mid-wave. Spawn ONE new subagent against the result file's \`prompt_file\` exactly the way you spawned the original wave entries (one-line prompt body \`"Read <prompt_file> and execute its instructions exactly."\`, same \`subagent_type\`/model/background flags). Do NOT call \`haiku_run_next\` — the wave slot is held by the unit and the engine has already rendered the next-hat dispatch. Continue waiting on the rest of the wave.`,
					`  - any other action (\`advance_phase\`, \`advance_stage\`, \`gate_review\`, \`intent_complete\`, etc.) — the wave is done. Call \`haiku_run_next { intent: "${slug}" }\` to drive the next workflow step.`,
					"",
					`(b) plaintext "job ends here" / "completed (last hat)" — this unit's hat sequence is exhausted. Another subagent in the wave will produce a structured result eventually; do NOT dispatch and do NOT call \`haiku_run_next\` yet.`,
					"",
					`(c) anything else (non-compliant) — fall back to calling \`haiku_run_next { intent: "${slug}" }\`.`,
					"",
					`You do not need to track per-unit hat state — the workflow engine derives it from on-disk state and gives you the next instruction in each result file.`,
					"",
					`Stop driving only when \`haiku_run_next\` returns a terminal action (\`gate_review\`, \`escalate\`, \`intent_complete\`, or \`error\`).`,
				].join("\n"),
			)
		}
	} else {
		// Subagentless harness: sequential execution in current context.
		// Surface stage scope, hat, and upstream paths for the parent
		// agent since it IS the executor.
		if (inlineCtxParallel) sections.push(inlineCtxParallel)
		const sharedLines: string[] = [
			`## Execute ${units.length} unit(s)`,
			"",
			"## Required reading (MUST read fully before starting)",
			"",
		]
		if (stagePath) sharedLines.push(`- Stage scope — \`${stagePath}\``)
		if (executionPath)
			sharedLines.push(`- Execute-phase focus — \`${executionPath}\``)
		if (hatPath) sharedLines.push(`- Hat — \`${hatPath}\``)
		if (outputsDir)
			sharedLines.push(`- Stage output templates — \`${outputsDir}/\``)
		if (upstreamRels.length > 0) {
			sharedLines.push("", "## Available upstream artifacts", "")
			for (const u of upstreamRels) {
				sharedLines.push(`- **${u.label}** — \`${join(dir, u.relPath)}\``)
			}
		}
		sections.push(sharedLines.join("\n"))

		const unitList = units
			.map((u) => {
				const wt = worktrees[u]
				return `1. **${u}**${wt ? ` (worktree: \`${wt}\`)` : ""}:\n   - Call \`haiku_unit_start { intent: "${slug}", unit: "${u}" }\`\n   - Execute the "${firstHat}" hat work directly (see hat definition and unit spec)\n   - When done, call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${u}" }\`\n   - If the advance result shows more hats, continue with the next hat for this unit\n   - When all hats complete, move to the next unit`
			})
			.join("\n")
		sections.push(
			`### Mechanics (Sequential Execution)\n\n${units.length} unit(s) to execute.\n\n**Your harness does not support parallel subagents.** Execute each unit sequentially in this conversation. Complete one unit fully (all hats) before starting the next.\n\n**For each unit:**\n${unitList}\n\n**Output tracking:** When your work produces artifacts (files, designs, specs, code), record them in the unit's frontmatter \`outputs:\` field as paths relative to the intent directory.\n\n**If outputs from a previous stage are missing or incorrect:** log a stage_revisit feedback at that stage via \`haiku_feedback { intent: "${slug}", stage: "<earlier-stage>", title: "<missing output>", body: "<what's needed>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\`. The pre-tick gate handles the rewind.\n\nAfter completing the last unit: the \`advance_hat\` result contains the next workflow action. Follow it directly.`,
		)
	}

	return sections.join("\n\n")
})
