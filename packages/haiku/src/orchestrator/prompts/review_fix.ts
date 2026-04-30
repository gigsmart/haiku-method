// orchestrator/prompts/review_fix.ts — Stage-scope fix loop. Same
// shape as intent_completion_fix but stage-scoped. Per-finding hat
// chain runs serially via relay (each hat calls haiku_feedback_advance_hat
// and returns the next hat's <subagent> block for the parent to spawn);
// chains run in parallel across findings. Dispatch is built in reverse
// hat order so every hat's prompt embeds the next hat's relay block at
// write time. Only the first hat's dispatch block is surfaced to the parent.

import { existsSync } from "node:fs"
import { join } from "node:path"
import { resolvePluginRoot } from "../../config.js"
import { getCapabilities } from "../../harness.js"
import { resolveStudioFilePath } from "../../orchestrator.js"
import {
	findHaikuRoot,
	isGitRepo,
	MAX_FIX_LOOP_BOLTS,
} from "../../state-tools.js"
import { readHatDefs, resolveStudio } from "../../studio-reader.js"
import { writeNextRelaySidecar } from "../../subagent-prompt-file.js"
import {
	buildInterpretationBlock,
	buildPriorFeedbackRejectBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"
import { WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK } from "./WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK.js"

interface FixItem {
	feedback_id: string
	feedback_file: string
	feedback_title: string
	bolt: number
	worktree?: string | null
	branch?: string | null
}

export default definePromptBuilder(({ slug, studio, action }) => {
	const fixStage = action.stage as string
	const fixHatsList = (action.fix_hats as string[]) || []
	const fixMaxBolts = (action.max_bolts as number) || MAX_FIX_LOOP_BOLTS
	const items = (action.items as FixItem[]) || []
	const totalPending = (action.total_pending as number) || items.length
	const escalatedCount = (action.escalated_count as number) || 0
	const haikuRoot = findHaikuRoot()

	const sections: string[] = []
	sections.push(WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK)

	const headerLines = [
		`## Fix Loop: ${items.length} finding(s) in parallel`,
		"",
		`Dispatching the stage's \`fix_hats:\` sequence against ${items.length} pending finding(s) in stage **${fixStage}**. Each finding's hat chain runs serially via relay (${fixHatsList.join(" → ")}); chains run in parallel across findings.`,
	]
	if (escalatedCount > 0) {
		headerLines.push(
			"",
			`> ⚠ ${escalatedCount} additional finding(s) are at the bolt cap and will escalate after this batch completes.`,
		)
	}
	if (totalPending !== items.length + escalatedCount) {
		headerLines.push(
			"",
			`> Total pending: ${totalPending}. Dispatching: ${items.length}. At cap: ${escalatedCount}.`,
		)
	}
	sections.push(headerLines.join("\n"))

	// Load each fix hat's mandate. Fix hats reuse the stage's
	// hats/{hat}.md files — when a hat wants to behave differently in
	// fix mode, it can include a `## Fix-mode scope` section in its
	// mandate. We do NOT maintain separate fix-mode files to avoid
	// duplication and drift.
	const allHats = readHatDefs(studio, fixStage)
	const studioInfo = resolveStudio(studio)
	const studioDir = studioInfo ? studioInfo.dir : studio
	const pluginRoot = resolvePluginRoot()
	const stageBasePath = resolveStudioFilePath(
		join(studioDir, "stages", fixStage, "STAGE.md"),
	)

	sections.push(
		"### Self-Extending Chain Dispatch\n\nEach finding below launches ONE subagent (the first hat). That subagent calls `haiku_feedback_advance_hat` when done and relays the next hat's `<subagent>` block back to the parent for spawning. **The parent spawns the relayed block — the subagent does NOT.** The chain ends when the final hat (assessor) returns without a relay block. Chains run in parallel across findings.\n",
	)

	// Build each finding's fix chain in reverse hat order so every hat's
	// prompt can embed the next hat's relay block at write time. Only the
	// first hat's dispatch block is surfaced to the parent.
	for (const {
		feedback_id: fbId,
		feedback_file: fbFile,
		feedback_title: fbTitle,
		bolt: fixBolt,
		worktree: fbWorktree,
		branch: fbBranch,
	} of items) {
		const fbAbsPath = join(haikuRoot, fbFile)
		sections.push(
			`\n### Finding \`${fbId}\` — _${fbTitle}_ (bolt ${fixBolt}/${fixMaxBolts})\n`,
		)

		let nextHatRelayBlock: string | null = null
		let firstHatBlock = ""

		for (let hatIdx = fixHatsList.length - 1; hatIdx >= 0; hatIdx--) {
			const hat = fixHatsList[hatIdx]
			const hatDef = allHats[hat]
			if (!hatDef) {
				// Warn in the parent-visible output for ANY missing mandate.
				// Even mid-chain hats spawn against the parent (via the relay
				// block) — a missing mandate runs the subagent without scope
				// and silently degrades the chain. Studio config bug; surface it.
				sections.push(
					`\n> **Warning:** hat \`${hat}\` declared in \`fix_hats\` has no mandate file in \`hats/${hat}.md\`. The subagent will run without a mandate — this is likely a studio bug.\n`,
				)
			}
			const hatPath = hatDef
				? join(
						pluginRoot,
						"studios",
						studioDir,
						"stages",
						fixStage,
						"hats",
						`${hat}.md`,
					)
				: null

			const isLast = hatIdx === fixHatsList.length - 1
			const promptLines: string[] = [
				`You are the **${hat}** hat running in **fix-mode** against feedback **${fbId}** (bolt ${fixBolt} of ${fixMaxBolts}) in stage **${fixStage}** of intent **${slug}**.`,
				"",
			]
			if (fbWorktree) {
				promptLines.push(
					"## Isolation worktree (REQUIRED)",
					`Do ALL work for this chain inside the dedicated worktree at:`,
					``,
					`    ${fbWorktree}`,
					``,
					`This worktree is on branch \`${fbBranch}\`, forked from the stage branch at dispatch time. It exists so parallel fix chains cannot clobber each other.`,
					"",
					`**Rules:**`,
					`- All file edits, reads of stage artifacts, and git operations MUST happen inside this path.`,
					`- Use \`git -C "${fbWorktree}" <cmd>\` for every git command, or \`cd\` into it once and operate there. Do NOT run bare \`git\` in the parent tree — you will commit on the wrong branch.`,
					`- Commit frequently inside the worktree with messages like \`haiku: fix ${fbId} bolt ${fixBolt} (${hat})\`. Do NOT push.`,
					`- Do NOT run \`git worktree remove\`, \`git branch -d\`, or \`git merge\` — the workflow engine owns the merge-back on the next \`haiku_run_next\` after this chain's final hat closes the finding.`,
					"",
				)
			} else {
				promptLines.push(
					"## Parallel-batch warning",
					`This fix loop is running in parallel with other findings. Multiple chains may edit the **same files** at overlapping times (no isolation worktree is allocated in this environment). When you edit, read the file immediately before writing so you don't clobber another chain's change. If your edit depends on state another chain may have already fixed, verify the current file content rather than trusting the feedback body's line numbers verbatim. The assessor will catch incomplete fixes and the workflow engine will retry on the next bolt.`,
					"",
				)
			}
			promptLines.push(
				"## Required context (inlined below)",
				"You are NOT wearing this hat to build a new unit. You are wearing it to resolve ONE specific feedback finding on artifacts that already exist.",
				"",
			)
			if (stageBasePath) {
				promptLines.push(inlineFile(stageBasePath, `Stage scope: ${fixStage}`))
			}
			if (hatPath && existsSync(hatPath)) {
				promptLines.push(inlineFile(hatPath, `Hat mandate: ${hat}`))
				const fixInterp = buildInterpretationBlock(readInterpretation(hatPath))
				if (fixInterp) promptLines.push("", fixInterp)
			}
			if (existsSync(fbAbsPath)) {
				promptLines.push(
					inlineFile(fbAbsPath, `Feedback: ${fbId} — ${fbTitle}`),
				)
				const priorReject = buildPriorFeedbackRejectBlock(fbAbsPath)
				if (priorReject) promptLines.push("", priorReject)
			}
			promptLines.push(
				"",
				"## Fix-mode scope (STRICT)",
				`- You are addressing ONE finding: **${fbId}** — _${fbTitle}_.`,
				`- Read the feedback body (above) carefully. It contains file:line references and the reviewer's concern.`,
				`- The artifact(s) the feedback flags live in \`.haiku/intents/${slug}/stages/${fixStage}/\` — edit them in place.`,
				"- Do NOT create a new unit spec. Do NOT modify unit workflow fields. Do NOT touch unrelated artifacts. Stay in scope.",
				"- Do NOT call `haiku_unit_advance_hat` or `haiku_unit_reject_hat` — this is NOT unit execution.",
				"",
				"## Instructions",
				"",
			)
			let step = 1
			if (isGitRepo()) {
				const commitTarget = fbWorktree
					? `the isolation worktree (\`git -C "${fbWorktree}" add -A && git -C "${fbWorktree}" commit -m "..."\`)`
					: "the current branch"
				promptLines.push(
					`${step++}. Work on ${commitTarget}. Commit the fix with a message like \`haiku: fix ${fbId} bolt ${fixBolt} (${hat})\` — do NOT push.`,
				)
			}
			if (isLast) {
				promptLines.push(
					`${step++}. **Assess closure (two-stage, both must pass).**`,
					`   - **Stage A — Spec match.** Read the edited artifact(s) and the feedback body. Does the edit make the finding's requirement true as written? A partial gesture is not a fix.`,
					`   - **Stage B — Quality / regression.** Inspect the diff (\`git show HEAD\`). Does the edit introduce a regression — broken neighboring behavior, scope creep into unrelated files, banned patterns, or violations of the stage's quality rules?`,
					`${step++}. **Decide:**`,
					`   - **A passes AND B passes** → call \`haiku_feedback_advance_hat { intent: "${slug}", stage: "${fixStage}", feedback_id: "${fbId}" }\`. The workflow engine auto-closes the finding (this is the last hat in the fix_hats chain).`,
					`   - **A fails** → leave the feedback status as-is (do NOT call \`haiku_feedback_advance_hat\`). The workflow engine counts this bolt and may dispatch another.`,
					`   - **A passes, B fails** → leave the feedback open AND log the regression as a new finding via \`haiku_feedback({ intent: "${slug}", stage: "${fixStage}", title: "<regression from fix-loop:${fbId}>", body: "<diff hunk + concrete impact>", origin: "adversarial-review", author: "fix-assessor" })\`. Do NOT call \`haiku_feedback_advance_hat\`.`,
					`   - **Finding is invalid** (reviewer misread the artifact) → call \`haiku_feedback_reject { intent: "${slug}", stage: "${fixStage}", feedback_id: "${fbId}", reason: "<concrete reason>" }\`. Do NOT call \`haiku_feedback_advance_hat\`.`,
					`${step++}. Return a one-line summary: \`fix-assessor: closed | open | rejected — <reason>\`. Use a verb of completed action; zero hedging words (\`should\`, \`seems\`, \`probably\`).`,
				)
			} else {
				promptLines.push(
					`${step++}. **Verify the finding before editing.** Read the flagged artifact at the file:line refs in the feedback body. Three failure modes route to \`haiku_feedback_reject\` instead of an edit:\n   - **Stale / misread**: the file no longer matches what the reviewer flagged, or the citation points at the wrong location → \`haiku_feedback_reject { intent: "${slug}", stage: "${fixStage}", feedback_id: "${fbId}", reason: "stale — <what changed>" }\` or \`"misread — <what they cited vs. what's there>"\`.\n   - **Ambiguous / unclear** — *high bar*: rejection is **terminal and permanent**, the finding is gone with no in-band channel for the reviewer to clarify. Reject for ambiguity ONLY when (a) NO charitable interpretation exists, OR (b) multiple interpretations are equally plausible AND each requires a *materially different* fix (not just minor variations). On close calls — when one interpretation is clearly the most charitable given the reviewer's mandate, the surrounding artifact context, and the file:line refs — proceed with that interpretation, **state it as an explicit assumption in your bolt summary** ("assumed the finding meant X based on Y"), and let the assessor's two-stage closure check catch wrong interpretations on bolt N+1. The bolt cap (${MAX_FIX_LOOP_BOLTS}) is the safety net.\n     - When you DO reject for true ambiguity, structure the reason as a clarification request the reviewer can act on: \`"needs clarification — original concern: <one-line restate>; specific ambiguity: <what's unclear>; suggested clarification format: <example, e.g. 'name the input field and the validation rule'>"\`.\n     - ✗ Body says: *"the validation is weak"* → genuinely vague; no charitable interpretation isolates a target. Reject with the structured clarification format.\n     - ✗ Body says: *"rename it to foo"* in one place and *"rename it to bar"* elsewhere → two interpretations with materially different fixes. Reject.\n     - ✓ Body says: *"the validation accepts negative quantities; it must reject them with HTTP 400 and message 'quantity must be positive'"* → actionable. Proceed.\n     - ✓ Body says: *"the error handling here is weak"* with a file:line ref pointing at a try/catch swallowing all exceptions → charitable interpretation is clear (swallow → narrow + rethrow). Proceed; state the assumption in your summary.\n   - **Invalid**: the finding describes correct behavior or doesn't identify a real defect → \`haiku_feedback_reject { ... reason: "<concrete reason invalid>" }\`.\n\n   Otherwise the finding is actionable — proceed. Do NOT acknowledge the finding in prose ("good catch", "you're right"); the fix in code is the acknowledgement.`,
					`${step++}. **Investigate.**\n   - Read the flagged artifact at the references in the feedback body. Establish the **current state** — what makes the finding true right now.\n   - Establish the **desired state** — what specifically would make the finding false.\n   - State the **gap** in one sentence. That's the root cause; the fix is a transition from current to desired.\n   - Look for a **comparable working sibling** — another artifact in this stage, an approved template, a passing test, a previously-shipped version, anything that demonstrates the desired state in a related context. Note the relevant differences. Skip this substep only if the artifact is genuinely greenfield with no comparable reference.${fixBolt > 1 ? `\n   - Bolt ${fixBolt} > 1: read \`git show HEAD\` for the prior bolt's edit. **Did you find a meaningfully different root cause from the prior attempt?** If yes, plan a different shape and proceed. If no, you're about to burn a bolt repeating the prior approach — call \`haiku_feedback_reject\` with reason "needs human escalation — N attempts converged on same surface fix" instead of editing.` : ""}`,
					`${step++}. **Apply the fix** within your hat's mandate. Edit ONLY the artifact(s) flagged by the finding — out-of-scope edits are a scope violation; if you notice a separate issue, log it via \`haiku_feedback\` rather than editing it now. Save changes.`,
					`${step++}. Return a one-line work summary using a verb of completed action (\`edited X\`, \`added Y\`, \`updated Z\`). Zero hedging words (\`should\`, \`seems\`, \`probably\`, \`might\`).`,
				)
				promptLines.push(
					"",
					"## Advance and relay (MANDATORY — do not skip)",
					"",
					`After completing your fix work above:`,
					"",
					`**If you called \`haiku_feedback_reject\`** (stale / invalid finding): do NOT call advance_hat. Return your one-line rejection reason as your final message. Stop here. (You will NOT receive a next-hat dispatch block on this path — there is nothing to relay.)`,
					"",
					`**Otherwise (actionable finding — normal path):**`,
					`1. Call \`haiku_feedback_advance_hat { intent: "${slug}", stage: "${fixStage}", feedback_id: "${fbId}" }\` to record this hat's completion and progress the chain.`,
					`   - On error: return the error message as your final message. Stop here.`,
					`2. **The tool response contains a \`next_subagent_dispatch_block\` field.** Copy its full string contents verbatim as your final message (after your one-line work summary). Your parent will spawn the relayed subagent — do NOT run it yourself. Do NOT paraphrase, summarize, or otherwise modify the block.`,
					"",
					"**CRITICAL:** Your final message must be: (1) your one-line work summary, then (2) the literal contents of the `next_subagent_dispatch_block` field from the advance_hat response. Nothing else. The block is delivered via the tool return value precisely so an agent on the rejection path never sees it.",
				)
			}

			const dispatchBlock = emitSubagentDispatchBlock({
				unit: `fix-${fbId}`,
				hat,
				bolt: fixBolt,
				agentType: hatDef?.agent_type ?? "general-purpose",
				model: hatDef?.model,
				promptBody: promptLines.join("\n"),
				heading: `#### Subagent: \`${hat}\`${isLast ? " (final — validates closure)" : " (relays next hat to parent)"}`,
			})

			// Write the NEXT hat's dispatch block to a sidecar keyed by THIS
			// hat's slug. When this hat advances, advance_hat reads the
			// sidecar and returns its contents in `next_subagent_dispatch_block`.
			// On rejection, advance_hat is never called and the sidecar is
			// never read — the agent has no relay block to mistakenly emit.
			if (!isLast && nextHatRelayBlock) {
				try {
					writeNextRelaySidecar(
						{ unit: `fix-${fbId}`, hat, bolt: fixBolt },
						nextHatRelayBlock,
					)
				} catch {
					/* Best-effort: if the sidecar can't be written, the prompt
					   instructions tell the agent to fall back to haiku_run_next. */
				}
			}

			nextHatRelayBlock = dispatchBlock
			if (hatIdx === 0) {
				firstHatBlock = dispatchBlock
			}
		}

		if (firstHatBlock) {
			sections.push(`${firstHatBlock}\n`)
		}
	}

	const fixBgClause = getCapabilities().subagents.backgroundSpawn
		? '`background="true"` → `run_in_background: true` (always present on fix-loop dispatches — pass it through; the parent waits on results, so foreground would block this thread); '
		: ""
	const waveLines: string[] = [
		"### Parent Instructions",
		"",
		`Spawn each \`<subagent>\` block above using the Task tool: \`type\` → \`subagent_type\`; \`model\` → \`model\` (omit when absent); ${fixBgClause}\`prompt_file\` → prompt body is literally \`"Read <path> and execute its instructions exactly."\`. Do not add anything beyond that one-line prompt body — the workflow engine owns the authoritative prompt at the file path.`,
		"",
		`**Run all ${items.length} in parallel.** When each subagent returns, follow its return instruction. A returned subagent's final message will either include a literal \`<subagent>\` relay block (sourced from the \`next_subagent_dispatch_block\` field of its \`haiku_feedback_advance_hat\` tool response) — spawn that immediately as the next hop in the same chain — or a one-line summary ending with \`call haiku_run_next\`. Spawn relayed blocks before pulling more work; chain completion (no more relay blocks) is what frees a slot for the next pending finding.`,
		"",
		`When ALL chains complete (no relay blocks pending, all chains terminal), call \`haiku_run_next { intent: "${slug}" }\` — the workflow engine decides what happens next.`,
	]
	sections.push(waveLines.join("\n"))

	return sections.join("\n\n")
})
