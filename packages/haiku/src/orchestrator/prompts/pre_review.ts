// orchestrator/prompts/pre_review.ts — Pre-execute spec review.
// Targets are unit SPECS (the .md files under units/), not artifacts
// — artifacts haven't been produced yet. Reviewers return findings
// INLINE (no haiku_feedback). The parent agent aggregates and edits
// the unit specs directly.
//
// Why before execute? Catching spec bugs now (missing inputs,
// unfalsifiable criteria, sibling conflicts, prose-only gates)
// avoids an execute → post-review → reject cycle.

import { join } from "node:path"
import { findHaikuRoot } from "../../state-tools.js"
import {
	filterReviewAgentsByScope,
	readReviewAgentPaths,
} from "../../studio-reader.js"
import {
	batchDispatchDirective,
	inlineFile,
	resolveStudioMandateModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = action.stage as string
	const unitsDir = (action.units_dir as string) || ""

	let agentPaths: Record<string, string> = readReviewAgentPaths(studio, stage)
	agentPaths = filterReviewAgentsByScope(
		agentPaths,
		join(findHaikuRoot(), "intents", slug, "stages", stage, "artifacts"),
		{ studio, stage },
	)

	const sections: string[] = []
	sections.push(`## Pre-Execute Adversarial Review: ${stage}`)
	sections.push(
		`**Review target:** unit SPECS (the .md files in \`${unitsDir}\`), NOT artifacts — artifacts haven't been produced yet. You are auditing the PLAN.`,
	)
	sections.push(
		"**Why before execute?** Catching spec bugs now (missing inputs, unfalsifiable criteria, sibling conflicts, prose-only gates) avoids an execute → post-review → reject cycle. The cost of this review is tiny compared to what it prevents.",
	)

	if (Object.keys(agentPaths).length === 0) {
		sections.push(
			"_No review agents apply to this stage's output types — skipping pre-execute review. Call `haiku_run_next` to advance._",
		)
		return sections.join("\n\n")
	}

	sections.push(
		"### Review Agent Fan-Out (REQUIRED)\n\n**Spawn exactly one subagent per review agent in parallel — no duplicates.** Each subagent's prompt is below.",
	)

	for (const [name, mandatePath] of Object.entries(agentPaths)) {
		const reviewLines: string[] = [
			`You are the **${name}** review agent running in PRE-EXECUTE mode for stage "${stage}" of intent "${slug}".`,
			"",
			"## Required context (inlined below)",
			"Your general review mandate is embedded in this prompt, but your scope for THIS pass is unit SPECS, not artifacts.",
			"",
			inlineFile(mandatePath, `Mandate: ${name}`),
			"",
			"## Pre-Execute Scope (SPEC REVIEW)",
			"Review the unit .md files under the units directory. You will find both pending and completed units there. Your job is to find **spec-level bugs in PENDING units or COVERAGE GAPS** that would cause a rejection cycle after execute.",
			"",
			"**Scope rules (STRICT):**",
			"- **Pending units (status != `completed`)** are your review targets. Flag spec-level issues.",
			"- **Completed units (status = `completed`)** are **context/knowledge, not targets**. Their work has already been executed, validated, and merged. You may READ them to understand what the stage already addresses, but you MUST NOT raise findings against them — no suggestions to rename, rewrite criteria, change `quality_gates`, expand `inputs:`, etc. That work is done.",
			"- **Coverage gaps** — if completed + pending units together leave a gap in what your mandate requires (e.g. an entry point not threat-modeled, a metric the mandate demands not defined), suggest a **NEW UNIT** to fill the gap. Never suggest editing a completed unit.",
			"",
			"**Look for in pending / new units:**",
			"",
			"- **Missing inputs**: unit declares a sweep/audit but its `inputs:` list only covers a subset of files the rule must apply to. Flag when enforcement scope < rule scope.",
			"- **Prose-only gates**: `quality_gates:` entries that are strings instead of executable `{name, command}` objects. These won't actually enforce anything — the workflow engine skips them.",
			"- **Unfalsifiable criteria**: 'responsive design done' vs 'breakpoints at 375/768/1280 with screenshots'. Gates must be measurable. Also flag criteria that LOOK concrete but have no apparent verification path — neither a `quality_gates:` entry, nor a review-agent mandate, nor a stage-appropriate approval condition (visual approval for design, behavioral test for product) plausibly covers them. Name each such criterion and propose a pairing in the suggested fix.",
			"- **Sibling conflicts** between pending units — watch for any of these shapes, not just same-output drift:",
			"  - **Same-output drift**: two units produce or modify the same output (file path, schema, route, artifact) under different rules.",
			"  - **Contradictory criteria**: two units describe the same component or behavior but their acceptance criteria diverge (one says `p95 < 100ms`, another says `async, no latency target`).",
			"  - **Inverted assumptions**: unit A asserts X is true; unit B requires X to be false (one says feature uses pattern P, another says feature MUST NOT use pattern P).",
			"  - **Overlapping inputs, opposite intent**: two units take the same input file/artifact but encode opposite intent for it (e.g. one strengthens a constraint the other relaxes).",
			"  - **Within-stage drift**: naming, types, or contracts that vary across sibling units when the mandate calls for consistency (cross-stage drift is the studio-level reviewer's beat; within-stage drift is yours).",
			"- **Missing `closes:`** on revisit cycles: every new pending unit MUST reference at least one pending FB via `closes: [FB-NN]`.",
			"- **Coverage gaps**: completed + pending together miss something in-scope for your mandate. Suggest a new unit.",
			"",
			"## Write scope (STRICT)",
			"**You MUST NOT edit any file, and you MUST NOT call `haiku_feedback`.** Pre-execute review has no artifacts to critique — nothing has been built for pending units yet. Persisted feedback is for post-execute work only. Return your findings INLINE as your subagent response; the parent agent will aggregate findings from all reviewers and edit the pending unit specs directly (or draft new units for coverage gaps).",
			"",
			"## Output format (MANDATORY)",
			"",
			"Return your findings as markdown with one `## Finding` block per concrete issue:",
			"",
			"```",
			"## Finding: <short-title>",
			'**Affected unit:** <unit-filename> (or "NEW UNIT NEEDED" for coverage gaps)',
			"**Location:** <file:line> (if applicable)",
			"**Issue:** <what's wrong in specific terms>",
			"**Suggested fix:** <diff-level concrete proposal — not vague>",
			"```",
			"",
			"If no issues in pending units and no coverage gaps, return exactly: `No findings.`",
			"",
			"## Instructions",
			"",
			`1. Read every unit file under \`${unitsDir}\`. Partition by status: completed (context) vs pending (targets).`,
			"2. Skim completed units to understand what the stage already addresses — this is knowledge.",
			"3. Identify concrete spec issues in PENDING units per the mandate above.",
			"4. Identify COVERAGE GAPS — things the mandate requires that neither completed nor pending units address. Propose new units by filename + intent.",
			"5. Concrete fixes accelerate resolution: don't write 'scope too narrow' — write the exact replacement.",
			"6. Do NOT critique completed units. Do NOT call `haiku_feedback` — persistence is not wanted here.",
		]

		const preReviewModel = resolveStudioMandateModel({
			mandatePath,
			studio,
			stage,
		})
		const preModelAttr = preReviewModel ? ` model="${preReviewModel}"` : ""
		sections.push(
			`#### Subagent: \`${name}\`\n\n<subagent type="general-purpose"${preModelAttr}>\n${reviewLines.join("\n")}\n</subagent>`,
		)
	}

	sections.push(
		[
			"### Parent Instructions",
			"",
			"Each reviewer returns inline findings as markdown — collect them all.",
			"",
			batchDispatchDirective(Object.keys(agentPaths).length, "review agents"),
			"",
			`If any reviewer returned findings (anything other than \`No findings.\`), aggregate them by unit file, EDIT the relevant unit.md files directly to address each finding, commit, then call \`haiku_run_next { intent: "${slug}" }\` to re-enter review. If every reviewer returned \`No findings.\`, call \`haiku_run_next { intent: "${slug}" }\` to open the user-facing gate. NO feedback files are created at pre-execute — there is nothing built to critique against.`,
		].join("\n"),
	)

	return sections.join("\n\n")
})
