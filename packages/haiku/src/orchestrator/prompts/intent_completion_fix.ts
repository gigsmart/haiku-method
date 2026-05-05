// orchestrator/prompts/intent_completion_fix.ts — Studio-level fix
// loop. Per-finding chain: studio fix-hats run serially via relay (each
// hat calls haiku_feedback_advance_hat and returns the next hat's
// <subagent> block for the parent to spawn); chains run in parallel
// across findings. Dispatch is built in reverse hat order so every
// hat's prompt embeds the next hat's relay block at write time. Only
// the first hat's dispatch block is surfaced to the parent.

import { existsSync } from "node:fs"
import { join } from "node:path"
import { getCapabilities } from "../../harness.js"
import {
	findHaikuRoot,
	isGitRepo,
	MAX_FIX_LOOP_BOLTS,
} from "../../state-tools.js"
import { readStudioFixHatPaths } from "../../studio-reader.js"
import { writeNextRelaySidecar } from "../../subagent-prompt-file.js"
import {
	buildInterpretationBlock,
	buildPriorFeedbackRejectBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
	resolveStudioMandateModel,
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
	const fixHatsList = (action.fix_hats as string[]) || []
	const fixMaxBolts = (action.max_bolts as number) || MAX_FIX_LOOP_BOLTS
	const items = (action.items as FixItem[]) || []
	const totalPending = (action.total_pending as number) || items.length
	const escalatedCount = (action.escalated_count as number) || 0
	const haikuRoot = findHaikuRoot()
	const fixHatPaths = readStudioFixHatPaths(studio)

	const sections: string[] = []
	sections.push(WORKFLOW_CONTRACTS_FIX_LOOP_BLOCK)

	const icHeader = [
		`## Intent-Completion Fix Loop: ${items.length} finding(s) in parallel`,
		"",
		`Studio-level findings will be addressed by dispatching the studio's \`fix-hats/\` sequence against each finding. Per-finding sequence: ${fixHatsList.join(" → ")} (serial within chain via relay). Chains run in parallel across findings.`,
	]
	if (escalatedCount > 0) {
		icHeader.push(
			"",
			`> ⚠ ${escalatedCount} additional finding(s) are at the bolt cap and will escalate after this batch completes.`,
		)
	}
	if (totalPending !== items.length + escalatedCount) {
		icHeader.push(
			"",
			`> Total pending: ${totalPending}. Dispatching: ${items.length}. At cap: ${escalatedCount}.`,
		)
	}
	sections.push(icHeader.join("\n"))

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
			const hatPath = fixHatPaths[hat]
			if (!hatPath) {
				// Warn for ANY missing mandate, not just the first hat. Mid-chain
				// hats spawn against the parent via the relay block — a missing
				// mandate runs the subagent without scope and silently degrades
				// the chain. Studio config bug; surface it.
				sections.push(
					`\n> **Warning:** studio fix-hat \`${hat}\` has no mandate file in \`plugin/studios/${studio}/fix-hats/${hat}.md\`. The subagent will run without a mandate — this is likely a studio bug.\n`,
				)
			}
			const isLast = hatIdx === fixHatsList.length - 1

			const promptLines: string[] = [
				`You are the **${hat}** studio fix-hat running against intent-scope feedback **${fbId}** (bolt ${fixBolt} of ${fixMaxBolts}) for intent **${slug}**.`,
				"",
			]
			if (fbWorktree) {
				promptLines.push(
					"## Isolation worktree (REQUIRED)",
					`Do ALL work for this chain inside the dedicated worktree at:`,
					``,
					`    ${fbWorktree}`,
					``,
					`This worktree is on branch \`${fbBranch}\`, forked from intent main at dispatch time. It exists so parallel fix chains cannot clobber each other.`,
					"",
					`**Rules:**`,
					`- All file edits, reads, and git operations MUST happen inside this path.`,
					`- Use \`git -C "${fbWorktree}" <cmd>\` or \`cd\` into the worktree once. Do NOT run bare \`git\` in the parent tree.`,
					`- Commit frequently with \`haiku: intent-fix ${fbId} bolt ${fixBolt} (${hat})\`. Do NOT push.`,
					`- Do NOT run \`git worktree remove\`, \`git branch -d\`, or \`git merge\` — the workflow engine owns merge-back on the next \`haiku_run_next\` after the assessor closes the finding.`,
					"",
				)
			} else {
				promptLines.push(
					"## Parallel-batch warning",
					`This fix loop is running in parallel with other findings. Multiple chains may edit the **same files** at overlapping times (no isolation worktree is allocated in this environment). When you edit, read the file immediately before writing so you don't clobber another chain's change. The assessor will catch incomplete fixes and the workflow engine will retry on the next bolt.`,
					"",
				)
			}
			promptLines.push(
				"## Required context (inlined below)",
				"You are addressing ONE whole-intent finding. Your mandate is studio-wide, not stage-specific — you reconcile artifacts across the whole intent against studio standards.",
				"",
			)
			if (hatPath && existsSync(hatPath)) {
				promptLines.push(inlineFile(hatPath, `Fix-hat mandate: ${hat}`))
				const studioFixInterp = buildInterpretationBlock(
					readInterpretation(hatPath),
				)
				if (studioFixInterp) promptLines.push("", studioFixInterp)
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
				`- The artifact(s) the feedback flags live under \`.haiku/intents/${slug}/stages/*/\` — edit them in place.`,
				"- Do NOT create a new unit spec. Do NOT modify unit workflow fields. Do NOT touch unrelated artifacts.",
				"- Do NOT call `haiku_unit_advance_hat` or `haiku_unit_reject_hat`.",
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
					`${step++}. Work on ${commitTarget}. Commit with a message like \`haiku: intent-fix ${fbId} bolt ${fixBolt} (${hat})\` — do NOT push.`,
				)
			}
			if (isLast) {
				promptLines.push(
					`${step++}. **Assess closure (two-stage, both must pass).**`,
					`   - **Stage A — Spec match.** Does the edit make the finding's requirement true as written?`,
					`   - **Stage B — Quality / regression.** Inspect the diff (\`git show HEAD\`). Does the edit introduce a regression — broken neighboring behavior, scope creep, or violations of studio-wide standards?`,
					`${step++}. **Decide:**`,
					`   - **A passes AND B passes** → call \`haiku_feedback_advance_hat { intent: "${slug}", feedback_id: "${fbId}" }\` (omit \`stage\`). The workflow engine auto-closes the finding (this is the last hat in the fix_hats chain).`,
					`   - **A fails** → leave status unchanged. Do NOT call \`haiku_feedback_advance_hat\`. The workflow engine counts this bolt.`,
					`   - **A passes, B fails** → leave the original open AND log the regression as a new finding via \`haiku_feedback({ intent: "${slug}", title: "<regression from intent-fix:${fbId}>", body: "<diff hunk + impact>", origin: "studio-review", author: "fix-assessor" })\`. Omit \`stage\`. Do NOT call \`haiku_feedback_advance_hat\`.`,
					`   - **Finding is invalid** → call \`haiku_feedback_reject { intent: "${slug}", feedback_id: "${fbId}", reason: "<concrete reason>" }\` — omit \`stage\`. Do NOT call \`haiku_feedback_advance_hat\`.`,
					`${step++}. Return \`fix-assessor: closed | open | rejected — <reason>\`. Verb of completed action; zero hedging.`,
				)
			} else {
				promptLines.push(
					`${step++}. **Verify the finding before editing.** Read the flagged artifact(s) and check three failure modes routing to \`haiku_feedback_reject\` (omit \`stage\` — intent scope) instead of an edit:\n   - **Stale / misread**: the artifact no longer matches what the reviewer flagged, or the citation points at the wrong location → reason: \`"stale — <what changed>"\` or \`"misread — <what they cited vs. what's there>"\`.\n   - **Ambiguous / unclear** — *high bar*: rejection is **terminal and permanent**, the finding is gone with no in-band channel for the reviewer to clarify. Reject for ambiguity ONLY when NO charitable interpretation exists OR multiple equally-plausible interpretations would require materially different cross-stage fixes. On close calls — when one interpretation is clearly the most charitable given the reviewer's mandate, the surrounding artifact context, and how the concern surfaces across stages — proceed with that interpretation, state it as an explicit assumption in your bolt summary, and let the assessor's two-stage closure check catch wrong interpretations on the next bolt (cap: ${MAX_FIX_LOOP_BOLTS}). When you DO reject for true ambiguity, structure the reason as a clarification request the reviewer can act on: \`"needs clarification — original concern: <one-line restate>; specific ambiguity: <what's unclear>; suggested clarification format: <example>"\`.\n   - **Invalid**: the finding describes correct cross-stage behavior or doesn't identify a real defect → reason: \`"<concrete reason invalid>"\`.\n\n   Otherwise the finding is actionable — proceed. Do NOT acknowledge the finding in prose ("good catch", "you're right").`,
					`${step++}. **Investigate.**\n   - Read the flagged artifact(s). Establish the **current state** — what makes the finding true right now.\n   - Establish the **desired state** — what specifically would make the finding false.\n   - State the **gap** in one sentence. That's the root cause; the fix is a transition from current to desired across whichever stages the finding spans.\n   - Look for a **comparable working sibling** — another stage's artifact that already meets the studio-wide standard, an approved template, a previously-shipped intent that handled this concern correctly. Note the relevant differences. Skip this substep only if the concern is genuinely novel with no comparable reference.${fixBolt > 1 ? `\n   - Bolt ${fixBolt} > 1: read \`git show HEAD\` for the prior bolt's edit. **Did you find a meaningfully different root cause from the prior attempt?** If yes, plan a different shape and proceed. If no, call \`haiku_feedback_reject\` with reason "needs human escalation — N attempts converged on same surface fix" instead of editing.` : ""}`,
					`${step++}. **Apply the fix** within your mandate. Edit ONLY the artifact(s) the finding flags — out-of-scope edits are a scope violation; log unrelated issues via \`haiku_feedback\` rather than editing them now. Save changes.`,
					`${step++}. Return a one-line work summary using a verb of completed action. Zero hedging (\`should\`, \`seems\`, \`probably\`, \`might\`).`,
				)
				promptLines.push(
					"",
					"## Advance and relay (MANDATORY — do not skip)",
					"",
					"After completing your fix work above:",
					"",
					`**If you called \`haiku_feedback_reject\`** (stale / invalid finding): do NOT call advance_hat. Return your one-line rejection reason as your final message. Stop here. (You will NOT receive a next-hat dispatch block on this path — there is nothing to relay.)`,
					"",
					"**Otherwise (actionable finding — normal path):**",
					`1. Call \`haiku_feedback_advance_hat { intent: "${slug}", feedback_id: "${fbId}" }\` (omit \`stage\` — intent scope) to record this hat's completion and progress the chain.`,
					"   - On error: return the error message as your final message. Stop here.",
					"2. **The tool response contains a `next_subagent_dispatch_block` field.** Copy its full string contents verbatim as your final message (after your one-line work summary). Your parent will spawn the relayed subagent — do NOT run it yourself. Do NOT paraphrase, summarize, or otherwise modify the block.",
					"",
					"**CRITICAL:** Your final message must be: (1) your one-line work summary, then (2) the literal contents of the `next_subagent_dispatch_block` field from the advance_hat response. Nothing else. The block is delivered via the tool return value precisely so an agent on the rejection path never sees it.",
				)
			}

			const fixHatModel = hatPath
				? resolveStudioMandateModel({ mandatePath: hatPath, studio })
				: undefined
			const dispatchBlock = emitSubagentDispatchBlock({
				unit: `intent-fix-${fbId}`,
				hat,
				bolt: fixBolt,
				agentType: "general-purpose",
				model: fixHatModel,
				promptBody: promptLines.join("\n"),
				heading: `#### Subagent: \`${hat}\`${isLast ? " (final — validates closure)" : " (relays next hat to parent)"}`,
			})

			// Write the NEXT hat's dispatch block to a sidecar keyed by THIS
			// hat's slug. advance_hat reads it on actionable-path completion;
			// rejection path never reads it.
			if (!isLast && nextHatRelayBlock) {
				try {
					writeNextRelaySidecar(
						{ unit: `intent-fix-${fbId}`, hat, bolt: fixBolt },
						nextHatRelayBlock,
					)
				} catch {
					/* Best-effort. */
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

	const icBgClause = getCapabilities().subagents.backgroundSpawn
		? '`background="true"` → `run_in_background: true` (always present on fix-loop dispatches — pass it through; the parent waits on results, so foreground would block this thread); '
		: ""
	const icWaveLines: string[] = [
		"### Parent Instructions",
		"",
		`Spawn each \`<subagent>\` block above using the Task tool: \`type\` → \`subagent_type\`; \`model\` → \`model\` (omit when absent); ${icBgClause}\`prompt_file\` → prompt body is literally \`"Read <path> and execute its instructions exactly."\`. Do not add anything beyond that one-line prompt body — the workflow engine owns the authoritative prompt at the file path.`,
		"",
		`**Run all ${items.length} in parallel.** When each subagent returns, follow its return instruction. A returned subagent's final message will either include a literal \`<subagent>\` relay block (sourced from the \`next_subagent_dispatch_block\` field of its \`haiku_feedback_advance_hat\` tool response) — spawn that immediately as the next hop in the same chain — or a one-line summary ending with \`call haiku_run_next\`. Spawn relayed blocks before pulling more work; chain completion (no more relay blocks) is what frees a slot for the next pending finding.`,
		"",
		`When ALL chains complete, call \`haiku_run_next { intent: "${slug}" }\` — the workflow engine decides what happens next.`,
	]
	sections.push(icWaveLines.join("\n"))

	return sections.join("\n\n")
})
