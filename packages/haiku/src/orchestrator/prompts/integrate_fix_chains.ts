// orchestrator/prompts/integrate_fix_chains.ts — Resolve merge
// conflicts produced by fix chains. One integrator subagent per
// chain works in-place inside that chain's worktree (MERGE_HEAD is
// set). The workflow engine owns the actual commit/merge — integrators ONLY
// stage resolved files. Capped at MAX_INTEGRATOR_ATTEMPTS per
// chain.

import { getCapabilities } from "../../harness.js"
import { MAX_INTEGRATOR_ATTEMPTS } from "../../state-tools.js"
import {
	batchDispatchDirective,
	emitSubagentDispatchBlock,
	resolveStudioMandateModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

interface IntegrateItem {
	feedback_id: string
	feedback_title: string
	feedback_file: string
	worktree: string
	branch: string
	conflict_files: string[]
	attempt: number
}

export default definePromptBuilder(({ slug, studio, action }) => {
	const integrateStage = action.stage as string | null
	const integrateMaxAttempts =
		(action.max_attempts as number) || MAX_INTEGRATOR_ATTEMPTS
	const integrateItems = (action.items as IntegrateItem[]) || []
	// All items in a wave share the same stage (or no stage, in the
	// intent-completion case), so resolve once and reuse — don't push
	// this into the per-item loop.
	const integratorModel = resolveStudioMandateModel({
		studio,
		stage: integrateStage ?? undefined,
	})

	const sections: string[] = []
	sections.push(
		`## Merge Conflict Integration: ${integrateItems.length} chain(s)`,
	)
	sections.push(
		integrateStage
			? `One or more fix chains in stage **${integrateStage}** produced edits that conflict with the stage branch when merging back. An **integrator** subagent per chain will resolve the conflicts in-place inside that chain's worktree. After all integrators return, call \`haiku_run_next { intent: "${slug}" }\` — the workflow engine will commit each resolution and forward-merge into the stage branch.`
			: `One or more intent-completion fix chains conflict with intent main. An **integrator** subagent per chain will resolve the conflicts in-place. After all return, call \`haiku_run_next { intent: "${slug}" }\` to complete the merges.`,
	)
	sections.push(
		`Cap: ${integrateMaxAttempts} integrator attempts per chain. If a chain still has unresolved conflicts after the cap, it escalates to the human.`,
	)

	for (const it of integrateItems) {
		sections.push(
			`\n### Chain \`${it.feedback_id}\` — _${it.feedback_title}_ (attempt ${it.attempt}/${integrateMaxAttempts})\n`,
		)
		const promptLines: string[] = [
			`You are the **integrator** subagent for fix-chain \`${it.feedback_id}\` (${it.feedback_title}). A prior merge attempt produced conflict markers in an isolation worktree; your job is to resolve them so the fix can land on ${integrateStage ? `the stage branch (\`haiku/${slug}/${integrateStage}\`)` : `intent main (\`haiku/${slug}/main\`)`}.`,
			"",
			"## Isolation worktree (REQUIRED)",
			`Do ALL work in the dedicated worktree at:`,
			``,
			`    ${it.worktree}`,
			``,
			`This worktree is on branch \`${it.branch}\` with a merge in progress (MERGE_HEAD is set). Every git command MUST use \`git -C "${it.worktree}"\` — do NOT run bare \`git\` in the parent tree.`,
			"",
			"## Conflict files to resolve",
			...it.conflict_files.map((f) => `- \`${f}\``),
			"",
			"## Required context",
			`Feedback body: \`${it.feedback_file}\` (read for the intent behind the fix).`,
			"",
			"## Instructions",
			"",
			`1. For each conflict file, read its current state in the worktree — the content includes \`<<<<<<<\`, \`=======\`, \`>>>>>>>\` markers.`,
			`2. Resolve the conflict. Preserve BOTH the base-branch advance AND the fix's intent — the fix-chain's original goal was to address feedback \`${it.feedback_id}\`, so the resolution must still close that finding. If the base-branch change already addressed the same concern in a different way, prefer the base-branch version and note it in your return summary.`,
			`3. Write the resolved file (no conflict markers remaining).`,
			`4. Stage the resolution: \`git -C "${it.worktree}" add <file>\` for each resolved file.`,
			`5. **Do NOT commit.** The workflow engine commits the merge on the next \`haiku_run_next\` — this is intentional so merge-in-progress state stays consistent.`,
			`6. **Do NOT run \`git merge --abort\`, \`git reset\`, \`git worktree remove\`, or \`git branch -d\`.** The workflow engine owns those.`,
			`7. Return a one-line summary: \`integrator: resolved <N> file(s) — <short rationale>\`. If you can't resolve a file (ambiguous, requires decisions outside your scope), leave the markers and return \`integrator: unresolved — <reason>\` so the next attempt / human sees why.`,
			"",
			"## Scope (STRICT)",
			"- No edits outside the listed conflict files unless resolution strictly requires it (e.g., a file deleted on one side).",
			"- No new files. No package installs. No test runs.",
			"- Your single job is to make the merge resolvable.",
		]

		sections.push(
			`${emitSubagentDispatchBlock({
				unit: `integrator-${it.feedback_id}`,
				hat: "integrator",
				bolt: it.attempt,
				agentType: "general-purpose",
				model: integratorModel,
				promptBody: promptLines.join("\n"),
				heading: `#### Subagent: \`integrator\``,
			})}\n`,
		)
	}

	const integrateBgLines = getCapabilities().subagents.backgroundSpawn
		? [
				'Map the `<subagent>` attributes to Task tool args: `type` → `subagent_type`; `background="true"` → `run_in_background: true` (always present on integrator dispatches — pass it through; the parent waits on results, so foreground would block this thread); `prompt_file` → prompt body is literally `"Read <path> and execute its instructions exactly."`.',
				"",
			]
		: []
	sections.push(
		[
			"### Parent Instructions (do NOT include in subagent prompts)",
			"",
			...integrateBgLines,
			batchDispatchDirective(integrateItems.length, "integrators"),
			"",
			`After every integrator returns, call \`haiku_run_next { intent: "${slug}" }\` — the workflow engine commits each resolution and forward-merges. If any chain still has unresolved markers, the workflow engine re-dispatches (up to attempt ${integrateMaxAttempts}). If a chain exhausts its integrator budget, it escalates to the human.`,
		].join("\n"),
	)

	return sections.join("\n\n")
})
