// orchestrator/prompts/elaborate.ts — The heaviest prompt builder.
// Three top-level branches by action shape:
//   1. Iterative re-entry — stage was entered with completed units
//      from a prior iteration. Treat completed units as knowledge,
//      decide whether new work is needed for this iteration.
//   2. Revisit (iteration > 1) — pending feedback drove a roll-back
//      to elaborate; emit the focused additive-elaboration block.
//   3. Fresh elaborate — full rendering: stage def, workflow contracts,
//      review-agent lenses (inlined), upstream input REFERENCES (paths
//      only — agent reads on demand), prior-stage REFERENCES, optional
//      discovery fan-out (early-return if any artifacts are pending),
//      then output expectations + design-provider hint + approach
//      selection + scope/mechanics.
//
// File-based dispatch (2026-04-29): the workflow handler writes the
// rendered body to a tmpfile and stamps `prompt_file` on the action.
// The registered prompt builder below short-circuits when
// `action.prompt_file` is set and emits a one-line "Read the prompt
// file" instruction. The full body is built via
// `buildElaboratePromptBody`, exported so the workflow handler can
// invoke it without going through `buildRunInstructions`.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
	createDiscoveryWorktree,
	discoveryBranchName,
} from "../../git-worktree.js"
import { getCapabilities } from "../../harness.js"
import {
	buildOutputRequirements,
	resolveIntentStages,
	resolveStudioFilePath,
} from "../../orchestrator.js"
import { parseFrontmatter } from "../../state-tools.js"
import {
	filterReviewAgentsByScope,
	readPhaseOverride,
	readReviewAgentPaths,
	readStageDef,
	resolveStageInputs,
	studioSearchPaths,
} from "../../studio-reader.js"
import {
	batchDispatchDirective,
	emitSubagentDispatchBlock,
	inlineFile,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"
import type { PromptBuilderContext } from "./types.js"
import { WORKFLOW_CONTRACTS_ELABORATE_BLOCK } from "./WORKFLOW_CONTRACTS_ELABORATE_BLOCK.js"

interface PendingFeedback {
	feedback_id: string
	title: string
	origin: string
	author: string
	status: string
	file: string
}

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

/** Strip the YAML frontmatter from a review-agent file body so the
 *  inlined "lens" content is just the mandate prose. */
function readReviewAgentBody(absPath: string): string {
	if (!existsSync(absPath)) return ""
	const raw = readFileSync(absPath, "utf8")
	try {
		const { body } = parseFrontmatter(raw)
		return (body || raw).trim()
	} catch {
		return raw.trim()
	}
}

/** Build the "## Review-Agent Lenses (carry these while drafting)"
 *  section. Pulls every per-stage review agent that scopes to this
 *  stage's declared outputs (via `applies_to:` glob) and inlines its
 *  body under a per-agent subheading. The intent is that the
 *  elaborator drafts WITH the review lenses in mind, not blindly,
 *  so the post-draft review pass produces fewer findings. */
function buildReviewAgentLensSection(
	studio: string,
	stage: string,
	dir: string,
): string | null {
	const agentPaths = filterReviewAgentsByScope(
		readReviewAgentPaths(studio, stage),
		join(dir, "stages", stage, "artifacts"),
		{ studio, stage },
	)
	const names = Object.keys(agentPaths).sort()
	if (names.length === 0) return null
	const lines: string[] = [
		"## Review-Agent Lenses (carry these while drafting)",
		"",
		'You will be reviewed against the following lenses. These are NOT a checklist to apply after drafting — a well-written unit shows the lens was applied because the spec was written with the lens in mind. Carry every lens while you write. There is no "review your work" step; if a lens wasn\'t internalized during drafting, no later check will save you.',
		"",
	]
	for (const name of names) {
		const body = readReviewAgentBody(agentPaths[name])
		if (!body) continue
		const heading = name
			.split(/[-_]/)
			.map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
			.join(" ")
		lines.push(`### ${heading} lens`, "", body, "")
	}
	return lines.join("\n").trimEnd()
}

// Exported so the workflow handler (`handlers/elaborate.ts`) can write the
// rendered body to a tmpfile and stamp `prompt_file` on the action, without
// going through `buildRunInstructions`. The registered prompt builder below
// short-circuits when `action.prompt_file` is set, so this is the only call
// site that produces the full body.
export function buildElaboratePromptBody(ctx: PromptBuilderContext): string {
	return renderElaborate(ctx)
}

function renderElaborate(ctx: PromptBuilderContext): string {
	const { slug, studio, action, dir } = ctx
	const stage = action.stage as string
	const elaboration = (action.elaboration as string) || "collaborative"
	const stageDef = readStageDef(studio, stage)
	const iteration =
		(action.iteration as number) || (action.visits as number) || 0
	const completedUnits = (action.completed_units as string[]) || []
	const pendingUnitsList = (action.pending_units as string[]) || []
	const iterative = Boolean(action.iterative)
	const pendingFeedback = (action.pending_feedback as PendingFeedback[]) || []
	const validationError = action.validation_error as string | undefined

	const sections: string[] = []

	// Iterative re-entry mode: stage was entered with completed units
	// from a prior iteration. The agent decides whether this iteration
	// needs new/modified work, with completed units treated as
	// knowledge (not rework).
	if (iterative) {
		sections.push(`## Iterative Re-Entry: ${stage} (iteration #${iteration})`)
		if (stageDef) {
			sections.push(`${stageDef.body}`)
		}
		sections.push(
			`You're re-entering this stage with prior work already landed on the stage branch. **Completed units below are knowledge** — their artifacts are part of the current stage baseline and must NOT be re-done or modified. Your job is to decide whether this iteration of the intent needs new work, and if so, draft new units for it.`,
		)

		if (completedUnits.length > 0) {
			const completedLines: string[] = [
				`### Completed Units (knowledge — read-only)`,
				"",
			]
			for (const name of completedUnits) {
				const unitFile = join(dir, "stages", stage, "units", `${name}.md`)
				if (!existsSync(unitFile)) {
					completedLines.push(`- **${name}** — _(file missing)_`)
					continue
				}
				const fm = readFrontmatter(unitFile)
				const title = (fm.title as string) || name
				const hat = (fm.hat as string) || ""
				const outputs = Array.isArray(fm.outputs)
					? (fm.outputs as string[])
					: []
				const summary = [
					`- **${name}** — ${title}`,
					hat ? `  - hat: \`${hat}\`` : null,
					outputs.length > 0
						? `  - outputs: ${outputs.map((o) => `\`${o}\``).join(", ")}`
						: null,
					`  - file: \`.haiku/intents/${slug}/stages/${stage}/units/${name}.md\``,
				]
					.filter(Boolean)
					.join("\n")
				completedLines.push(summary)
			}
			sections.push(completedLines.join("\n"))
		}

		if (pendingUnitsList.length > 0) {
			sections.push(
				`### Pending Units (targets for this iteration)\n\n${pendingUnitsList.map((n) => `- \`${n}\``).join("\n")}\n\nThese units exist but haven't been executed. If they're still relevant, leave them. Revise their specs if the intent has evolved. Reject individual units by deleting their file (not advised unless clearly obsolete).`,
			)
		}

		sections.push(WORKFLOW_CONTRACTS_ELABORATE_BLOCK)

		const lenses = buildReviewAgentLensSection(studio, stage, dir)
		if (lenses) sections.push(lenses)

		sections.push(
			[
				"### Decide — what does this iteration need?",
				"",
				"**Step 1: Enumerate what changed.** Since the prior iteration of this stage:",
				`- Which preceding stages' artifacts have been added, revised, or removed? (Look under \`.haiku/intents/${slug}/stages/*/\`.)`,
				`- Has \`.haiku/intents/${slug}/intent.md\` evolved?`,
				`- Is there new feedback from downstream stages that affects this stage's scope?`,
				"",
				"**Step 2: Decide the response.** Based on what changed, pick one:",
				"",
				"**A. New units are needed.** Draft them as `unit-NN-<slug>.md` under `.haiku/intents/.../stages/<stage>/units/`. Continue the file-naming sequence from the highest existing number. Each new unit's `inputs:` MUST reference the prior-stage artifacts it builds on. Then call `haiku_run_next`.",
				"",
				"**B. Pending units need revision.** Edit their `.md` files in place (the workflow engine guard permits editing units whose `status` is NOT `completed`). Then call `haiku_run_next`.",
				"",
				"**C. No changes needed — nothing has evolved that warrants new work in this stage.** Call `haiku_run_next` immediately without adding or modifying any units. The workflow engine compares the pre-elaborate unit count to the post-elaborate count; if unchanged AND no pending units exist, it advances directly to the gate (skipping pre-review + execute + review — there's nothing new to review or execute).",
				"",
				"**Be honest about C.** If the intent genuinely hasn't evolved in ways that affect this stage, choosing C is correct. Making busy-work units just to look thorough wastes effort and creates maintenance drag.",
			].join("\n"),
		)
		return sections.join("\n\n")
	}

	// Revisit mode (iteration > 1): emit a focused additive-elaboration
	// block instead of re-running discovery/input-resolution. The prior
	// iteration handled all that; we're here to address new feedback
	// with new units.
	if (iteration > 1) {
		sections.push(`## Revisit Elaborate: ${stage} (iteration #${iteration})`)
		if (validationError) {
			sections.push(`### Validation Error\n\n${validationError}`)
		}
		if (completedUnits.length > 0) {
			sections.push(
				`### Frozen Completed Units (read-only)\n\nThe following units from prior iterations are **completed and immutable** — do NOT modify or re-queue them:\n\n${completedUnits.map((u) => `- \`${u}\``).join("\n")}`,
			)
		}
		if (pendingFeedback.length > 0) {
			sections.push(
				`### Pending Feedback (MUST address — READ EACH FILE IN FULL)\n\n${pendingFeedback
					.map(
						(f) =>
							`- **${f.feedback_id}** — ${f.title}\n  - file: \`${f.file}\`\n  - origin: ${f.origin} · author: ${f.author}`,
					)
					.join(
						"\n",
					)}\n\nYou MUST open every file above and read it completely before drafting units. The title is only a handle; the body carries requirements, tests, and acceptance criteria.`,
			)
		}
		const lenses = buildReviewAgentLensSection(studio, stage, dir)
		if (lenses) sections.push(lenses)
		sections.push(
			`### Responsibilities\n\n- Read every \`pending_feedback[].file\` in full before drafting — the title is only a handle.\n- Draft one or more new units whose \`closes:\` frontmatter references the feedback items they resolve.\n- Every pending feedback item MUST be referenced by at least one new unit's \`closes:\` (orphans block advancement).\n- Ask the user clarifying questions (\`AskUserQuestion\` with options[]) when trade-offs are unclear; iterate across turns.\n- When the user approves the drafted units, call \`haiku_run_next\` to advance.\n\nInputs (read directly — do not inline summaries, open the actual files):\n- every \`pending_feedback[].file\` listed above\n- \`stage_metadata\` (STAGE.md body + review agents)\n- \`completed_units\` (read-only reference)\n- \`intent.md\` for overall goals`,
		)
		sections.push(
			`### Mechanics\n\n1. Continue the existing file-naming sequence: if the last unit is \`unit-0N-...\`, start new units at \`unit-0(N+1)-...\`.\n2. Each new unit MUST declare \`closes: [FB-NN]\` for every feedback id it addresses.\n3. Every pending feedback item MUST be referenced by at least one new unit's \`closes:\` (orphans block advancement).\n4. Use the unit-file naming convention: \`unit-NN-slug.md\` (kebab-case slug, zero-padded NN).\n5. Call \`haiku_run_next { intent: "${slug}" }\` when done — the orchestrator re-validates and advances.`,
		)
		return sections.join("\n\n")
	}

	// Fresh elaborate.
	sections.push(`## Elaborate: ${stage}`)
	if (stageDef) {
		sections.push(`${stageDef.body}`)
	}

	const elaborationOverride = readPhaseOverride(studio, stage, "ELABORATION")
	if (elaborationOverride) {
		sections.push(
			`### Phase: Elaboration Override\n\n${elaborationOverride.body}`,
		)
	}

	sections.push(WORKFLOW_CONTRACTS_ELABORATE_BLOCK)

	// Review-agent lenses — inlined while drafting so the unit specs
	// are written with the review lenses in mind, not blindly.
	const lenses = buildReviewAgentLensSection(studio, stage, dir)
	if (lenses) sections.push(lenses)

	// Upstream context — REFERENCES, not inlined bodies. The
	// agent reads each file on demand. This used to inline up to
	// 3000 chars per artifact, which inflated the prompt
	// dramatically without substantively helping the drafter.
	const upstreamReferenceLines: string[] = []
	let upstreamRefPaths: string[] = []
	if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
		const inputs = stageDef.data.inputs as Array<{
			stage: string
			discovery?: string
			output?: string
		}>
		const resolved = resolveStageInputs(studio, inputs, dir, slug)
		const found = resolved.filter((r) => r.exists)
		const missing = resolved.filter((r) => !r.exists)

		if (found.length > 0) {
			upstreamRefPaths = found.map((r) =>
				r.resolvedPath.startsWith(`${dir}/`)
					? r.resolvedPath.slice(dir.length + 1)
					: r.resolvedPath,
			)
			for (const r of found) {
				const relPath = r.resolvedPath.startsWith(`${dir}/`)
					? r.resolvedPath.slice(dir.length + 1)
					: r.resolvedPath
				upstreamReferenceLines.push(
					`- **${r.stage}/${r.artifactName}** (${r.kind}) — \`${relPath}\``,
				)
			}
		}

		if (missing.length > 0) {
			sections.push(
				`## ⚠ Missing Upstream Artifacts\n\nThe following inputs are declared but do not exist on disk:\n\n${missing.map((r) => `- **${r.stage}/${r.artifactName}** (${r.kind}) — expected at \`${r.resolvedPath}\``).join("\n")}\n\nThese may not have been produced yet, or may have been saved to a different location. If they are critical for this stage, log a stage_revisit feedback at the producing stage via \`haiku_feedback { intent, stage: "<producing-stage>", title: "<missing artifact>", body: "<what's needed>", origin: "agent", resolution: "stage_revisit" }\` and call \`haiku_run_next\` — the pre-tick gate routes the rewind.`,
			)
		}
	}

	// Prior-stage reference enumeration — every preceding stage's dir
	// is listed by path, no content inlined. The drafter reads what's
	// relevant on demand.
	const priorStageReferenceLines: string[] = []
	{
		const orderedStages = resolveIntentStages(
			existsSync(join(dir, "intent.md"))
				? readFrontmatter(join(dir, "intent.md"))
				: {},
			studio,
		)
		const myIdx = orderedStages.indexOf(stage)
		const priorStages = myIdx > 0 ? orderedStages.slice(0, myIdx) : []
		for (const prior of priorStages) {
			const priorDir = `.haiku/intents/${slug}/stages/${prior}`
			priorStageReferenceLines.push(
				`- **${prior}**`,
				`  - knowledge / discovery: \`${priorDir}/knowledge/\` (+ project-scope \`.haiku/knowledge/\` produced during that stage)`,
				`  - unit specs: \`${priorDir}/units/unit-*.md\``,
				`  - stage outputs: any files under \`${priorDir}/\` outside \`units/\` (\`.md\` reports, \`artifacts/\`)`,
				`  - resolved feedback: \`${priorDir}/feedback/*.md\``,
			)
		}
	}

	if (
		upstreamReferenceLines.length > 0 ||
		priorStageReferenceLines.length > 0
	) {
		const refSection: string[] = [
			"## Upstream Context (read as needed during drafting)",
			"",
			"Paths only — do **not** require the bodies to be inlined here. Open files on demand with the Read tool when you need their substance. The list is the **minimum** the studio declared; the prior-stage block underneath enumerates everything else available across the intent's history.",
		]
		if (upstreamReferenceLines.length > 0) {
			refSection.push("", "### Declared Inputs (from STAGE.md)")
			refSection.push("", ...upstreamReferenceLines)
		}
		if (priorStageReferenceLines.length > 0) {
			refSection.push(
				"",
				"### Prior-Stage Artifacts (read what's relevant)",
				"",
				"Each preceding stage in this intent has committed artifacts that may inform unit decomposition:",
				"",
				...priorStageReferenceLines,
				"",
				"Do NOT limit yourself to the declared `inputs:` list when drafting units — it is the **minimum**, not the maximum. When a unit references an artifact you discovered via prior-stage enumeration, add that path to the unit's own `inputs:` frontmatter so the execution agents (one per hat) have the same context.",
			)
		}
		sections.push(refSection.join("\n"))

		// Unit-inputs requirement — list the declared paths so the
		// drafter knows what minimum set must end up in each unit's
		// `inputs:` frontmatter.
		if (upstreamRefPaths.length > 0) {
			sections.push(
				`## Unit Inputs Requirement (MANDATORY)\n\nEvery unit **MUST** have a non-empty \`inputs:\` field in its frontmatter. At minimum, every unit should reference the intent document and discovery docs. Units will be **blocked from execution** if \`inputs:\` is empty.\n\nAvailable upstream artifacts:\n\`\`\`yaml\ninputs:\n${upstreamRefPaths.map((p) => `  - ${p}`).join("\n")}\n\`\`\`\nInclude all inputs relevant to the unit's scope. Frontend/UI units should reference design artifacts. Backend units should reference behavioral specs and data contracts.`,
			)
		}
	}

	// Discovery fan-out — one subagent per declared discovery artifact,
	// each in its own isolation worktree off the stage branch. The
	// pattern mirrors fix-chain worktrees: subagents write in their own
	// tree, the workflow engine merges back on the next `haiku_run_next`.
	const discoveryArtifactsAll: Array<{
		name: string
		templatePath: string
		outputPath: string | null
	}> = []
	{
		const seen = new Set<string>()
		for (const base of [...studioSearchPaths()].reverse()) {
			const discoveryDir = join(base, studio, "stages", stage, "discovery")
			if (!existsSync(discoveryDir)) continue
			for (const f of readdirSync(discoveryDir).filter((f) =>
				f.endsWith(".md"),
			)) {
				if (seen.has(f)) continue
				seen.add(f)
				const templatePath = join(discoveryDir, f)
				// Parse the template's frontmatter for its `location:` field.
				// Resolves studio-agnostically: `.haiku/knowledge/...` paths go
				// under the repo root (process.cwd()); anything else is
				// treated as relative to the intent dir. Templates without a
				// `location:` fall back to the legacy <NAME>.md convention
				// under `knowledge/` so older studios still work.
				const tplRaw = readFileSync(templatePath, "utf8")
				const { data: tplFM } = parseFrontmatter(tplRaw)
				const loc = (tplFM as { location?: unknown }).location
				let outputPath: string | null = null
				if (typeof loc === "string" && loc.length > 0) {
					if (loc.startsWith(".haiku/")) {
						outputPath = join(process.cwd(), loc)
					} else if (loc.startsWith("/")) {
						outputPath = loc
					} else {
						outputPath = join(dir, loc)
					}
				}
				discoveryArtifactsAll.push({
					name: f.replace(/\.md$/i, "").toLowerCase(),
					templatePath,
					outputPath,
				})
			}
		}
	}

	// Filter out artifacts whose output files already exist on disk
	// (produced on a prior tick, already merged). Uses the template's
	// declared `location:` path when present so this works across
	// studios with different output conventions.
	const knowledgeDir = join(dir, "knowledge")
	const discoveryArtifacts = discoveryArtifactsAll.filter((a) => {
		if (a.outputPath) return !existsSync(a.outputPath)
		const candidate = join(knowledgeDir, `${a.name.toUpperCase()}.md`)
		return !existsSync(candidate)
	})

	if (discoveryArtifacts.length > 0) {
		const artifactNames = discoveryArtifacts
			.map((a) => `\`${a.name}\``)
			.join(", ")
		const plural = discoveryArtifacts.length !== 1 ? "s" : ""
		const intentPath = join(dir, "intent.md")
		const stagePath = resolveStudioFilePath(
			join(studio, "stages", stage, "STAGE.md"),
		)

		let fanOutText = `## Discovery Fan-Out (REQUIRED)\n\nThis stage produces ${discoveryArtifacts.length} discovery artifact${plural}: ${artifactNames}.\n\n**Spawn one subagent per artifact** using the EXACT content between \`<subagent>\` tags as the prompt. Each subagent writes inside its own isolation worktree — the workflow engine merges their work back into the stage branch on the next \`haiku_run_next\`.\n\n${batchDispatchDirective(discoveryArtifacts.length, "discovery subagents")}\n\n`

		for (const a of discoveryArtifacts) {
			const wt = createDiscoveryWorktree(slug, stage, a.name)
			const lines: string[] = [
				`You are researching and producing the "${a.name}" discovery artifact for intent "${slug}" in stage "${stage}" of studio "${studio}".`,
				"",
			]
			if (wt) {
				lines.push(
					"## Isolation worktree (REQUIRED)",
					`Do ALL work for this subagent inside the dedicated worktree at:`,
					``,
					`    ${wt}`,
					``,
					`This worktree is on branch \`${discoveryBranchName(slug, stage, a.name)}\`, forked from the stage branch at dispatch time.`,
					"",
					`**Rules:**`,
					`- Write the populated discovery artifact INSIDE this worktree path (under \`${wt}/.haiku/intents/${slug}/knowledge/\` per the template's \`location:\`).`,
					`- If you commit, use \`git -C "${wt}" add -A && git -C "${wt}" commit -m "..."\`. Do NOT push.`,
					`- Do NOT run \`git worktree remove\`, \`git branch -d\`, or \`git merge\` — the workflow engine owns merge-back.`,
					"",
				)
			}
			lines.push(
				"## Required context (inlined below)",
				"The intent goal, stage scope, and your discovery template are embedded below — no need to fan out Read tool calls for them.",
				"",
				inlineFile(intentPath, "Intent goal"),
			)
			if (stagePath) lines.push(inlineFile(stagePath, "Stage scope"))
			lines.push(
				inlineFile(
					a.templatePath,
					`Discovery template: ${a.name} (content guide + quality signals + output location)`,
				),
			)
			lines.push(
				"",
				"## Scope (STRICT)",
				"",
				`- You research **only** the axis defined by the "${a.name}" template. Other discovery artifacts in this stage are being researched by **sibling subagents in parallel** — do NOT investigate adjacent domains, do NOT pre-empt their work, do NOT leave notes for them.`,
				"- If you encounter information that belongs primarily in a sibling artifact, do NOT write it to the sibling's file path — that creates merge conflicts at the integrator step. Note it briefly as a *context boundary* in your own artifact (e.g. *\"depends on auth model — see security artifact\"*) and let the sibling agent author the substance. Cross-cutting constraints that genuinely shape multiple axes (security boundaries, hard dependencies) should be noted in your artifact too, in the boundary section, so they're not lost if the sibling misses them.",
				"- Your write path is ONE file at the template's `location:`. Any other file write — sibling artifacts, intent.md, unit specs, knowledge files outside your `location:` — is a scope violation.",
				"- Do NOT attempt to summarize or synthesize across sibling artifacts. The elaborate phase does that on the next workflow tick, after all discovery merges back.",
				"",
				"## Instructions",
				"",
				"1. Research the problem space along the axis defined by your template.",
				"2. Use the template's Content Guide as the document structure.",
				"3. Meet the template's Quality Signals as your acceptance bar.",
				"4. Write the populated document to the stage's discovery path as defined in the template's `location:` frontmatter above — **inside your isolation worktree** when one is allocated. **This is your ONLY write path** — any file written elsewhere is a scope violation.",
				"5. Be thorough on YOUR axis — this artifact informs all downstream work. Thoroughness within scope is the goal; thoroughness across scope is a violation.",
			)
			fanOutText += `${emitSubagentDispatchBlock({
				unit: "discovery",
				hat: a.name,
				bolt: 1,
				agentType: "general-purpose",
				promptBody: lines.join("\n"),
				heading: `### Subagent: \`${a.name}\``,
			})}\n\n`
		}

		const elabBgLine = getCapabilities().subagents.backgroundSpawn
			? ' Each `<subagent>` carries `background="true"` — pass `run_in_background: true` to the Task tool so the parent thread stays responsive while discovery agents run.'
			: ""
		fanOutText += `### Parent Instructions (do NOT include in subagent prompts)\n\nSpawn each subagent above using the EXACT content between \`<subagent>\` tags as the prompt.${elabBgLine} When ALL subagents return, call \`haiku_run_next { intent: "${slug}" }\` — the workflow engine merges their isolation worktrees back into the stage branch (resolving conflicts via the integrator if needed) and then emits the unit-decomposition instructions. **Do NOT proceed to decomposition in this response** — wait for the next workflow tick so the merged knowledge artifacts are visible.`

		sections.push(fanOutText)

		// Early return — the rest of the elaborate response (output
		// expectations, scope, mechanics, decomposition instructions)
		// only makes sense once discovery has landed on the stage branch.
		// Emit them on the next tick.
		return sections.join("\n\n")
	}

	// Output template definitions — inform the elaboration agent what
	// this stage must produce.
	const outputExpectations = buildOutputRequirements(
		studio,
		stage,
		"## Stage Output Expectations\n\nThis stage must ultimately produce the following outputs during execution. Plan units accordingly:",
	)
	if (outputExpectations) sections.push(outputExpectations)

	// Detect design stages and add MCP provider instructions.
	const stageHats = (stageDef?.data?.hats as string[]) || []
	const isDesignStage =
		stage.includes("design") ||
		stageHats.some((h) => h.includes("designer") || h.includes("design")) ||
		stageDef?.body?.includes("pick_design_direction")
	if (isDesignStage) {
		sections.push(
			"## Design Provider MCPs\n\n" +
				"If design provider MCPs are available (look for tools named `mcp__pencil__*`, `mcp__openpencil__*`, or `mcp__figma__*`), " +
				"use them for wireframe generation instead of raw HTML. Check your available tools list.\n\n" +
				"These providers offer structured design primitives (components, layout, styling) that produce " +
				"higher-fidelity wireframes than inline HTML snippets.",
		)
	}

	// Approach selection — present 2–3 approaches when there is a real
	// architectural choice in front of the agent. Iteration === 1 only
	// (iter > 1 paths returned earlier). The instruction is permissive:
	// stages with a single forced approach skip it after stating why.
	sections.push(
		[
			"## Approach Selection (before decomposing units)",
			"",
			"If this stage has a meaningful architectural choice in front of it (e.g. *which* data model, *which* auth strategy, *which* deployment topology), pause and articulate **2–3 approaches** before drafting units. Each approach gets:",
			"",
			"- one-sentence description of what's built and how",
			"- the tradeoff axis the choice turns on (speed/safety, cost/flexibility, reversibility, etc.)",
			"- a recommendation with one-sentence justification",
			"",
			elaboration === "collaborative"
				? `**In collaborative mode:** Use \`ask_user_visual_question\` to let the user pick. Record the resolved choice via \`haiku_decision_record\` (source: \`user\`). Only after the user picks (or you've stated explicitly that no architectural choice exists at this stage) should you draft units.`
				: "**In autonomous mode:** Choose the approach independently and state your rationale in one sentence. Do NOT prompt the user — autonomous mode means the agent decides. If the choice has cross-cutting risk, surface it inline in the elaborate output so a reviewer can challenge it later.",
			"",
			"**Skip this only when:** discovery has already narrowed to a single forced approach, OR the stage's work is mechanical (no architectural choice — e.g. a runbook against a fixed deployment pipeline). In that case, state the forced approach in one sentence in the elaborate output and proceed to unit decomposition.",
			"",
			"**Do NOT** dump three full design docs as units and ask the reviewer to pick later. The choice is upstream of decomposition; commit to one approach, then decompose it.",
		].join("\n"),
	)

	sections.push(
		`## Scope\n\nAll units MUST be within this stage's domain. Work belonging to other stages goes in the discovery document, not in units.\n\n## Mechanics\n\n${
			elaboration === "collaborative"
				? "Mode: **collaborative** — knowledge unification with the user happens at decision points, not as ritual. (H·AI·K·U = Human + AI Knowledge **Unification**.)\n\n" +
					"### What collaboration means here\n\n" +
					"This stage advances when at least one **decision** is recorded in the stage's `decision_log` (via `haiku_decision_record`), OR you honestly declare `no_decisions: true` with a rationale. A decision is a real architectural choice between concrete options — not a question for the sake of asking. Two valid sources:\n\n" +
					'- **`source: "user"`** — you presented options the user couldn\'t reasonably resolve from the codebase, and they picked.\n' +
					'- **`source: "autonomous-acknowledged"`** — you made the call from clear conventions and surfaced the choice for veto-style approval, and the user did not push back.\n\n' +
					"Both count. The user feels meaningfully involved when they shape real decisions OR review and accept your reasoned choices — not when they're interrogated about defaults.\n\n" +
					"### Quality bar for user-facing questions\n\n" +
					"Every question to the user MUST clear this bar before being asked:\n\n" +
					"- **Real decision**: it can't be answered by reading the codebase, manifest files, prior stages' outputs, or existing conventions.\n" +
					'- **≥2 concrete options**: you\'ve articulated the alternatives. *"Should we add tests?"* fails (one-option default). *"Cypress or Playwright?"* passes.\n' +
					"- **Tradeoff axis**: each option carries a known tradeoff (speed/safety, cost/flexibility, reversibility, etc.). If all options are equivalent, the choice doesn't need user input.\n" +
					'- **Records as a decision**: after the user picks, call `haiku_decision_record { decision, options, choice, source: "user", rationale? }`.\n\n' +
					"#### Banned question patterns (do NOT ask these)\n\n" +
					'- **Yes/no on defaults**: *"Should we follow your existing patterns?"* (obvious yes), *"Want tests?"* (covered by quality gates).\n' +
					'- **Codebase-answerable**: *"What test runner do you use?"* — read `package.json` / `pyproject.toml` / `Cargo.toml`.\n' +
					'- **Permission-asking**: *"Is it OK if I extend the User model?"* — make the choice and surface it autonomously instead.\n' +
					'- **Confirmation-seeking**: *"Does this approach sound good?"* with no concrete alternatives to compare against.\n\n' +
					"### One question at a time (NEVER batch)\n\n" +
					"Even when you have multiple questions, ask ONE, wait for the answer, then ask the next. Cognition breaks down for both sides if a deeper conversation has to happen on each — batched questions get half-answers and lose context when any one branches.\n\n" +
					'- **DO**: `AskUserQuestion({ question: "Auth strategy?", options: [...] })` → wait → `AskUserQuestion({ question: "Database?", options: [...] })`.\n' +
					"- **DO NOT**: batch questions in a single `ask_user_visual_question` call with multiple entries in `questions[]`. The visual layout doesn't help if any one branches into a deeper conversation.\n" +
					'- **DO NOT**: dump numbered questions as plain text (*"1. Auth? 2. Database? 3. Caching?"*). Use the structured tool, one at a time.\n\n' +
					"### Surface autonomous decisions for veto-style approval\n\n" +
					"For decisions you can resolve from the codebase or clear conventions, don't ask — **decide and surface**:\n\n" +
					'1. State the decision: *"I\'m using `<library X>` for HTTP because `package.json` already includes it."*\n' +
					'2. State the alternative considered: *"(Considered `<library Y>`, but no existing usage.)"*\n' +
					"3. Invite veto: *\"Reply 'change' if you'd prefer otherwise.\"*\n" +
					'4. If no pushback by the next turn, call `haiku_decision_record { source: "autonomous-acknowledged", ... }`.\n\n' +
					"Most decisions in a routine stage should be autonomous-acknowledged; only the genuinely-unresolvable ones earn a user-facing question. The user gets agency without busy-work.\n\n" +
					"### Honest no-decisions declaration\n\n" +
					'If the work is purely conventional with NO architectural choices in scope (a doc update following an established style guide; a routine ops runbook against a fixed pipeline), call `haiku_decision_record { intent: "...", no_decisions: true, rationale: "<why this stage has no choices>" }` and proceed. **Faking a decision to satisfy the gate is the failure mode this design exists to prevent** — be honest.\n\n' +
					"### Tools for asking (when a question is genuinely needed)\n\n" +
					"| Question type | Tool |\n" +
					"|---|---|\n" +
					"| Scope decisions, tradeoffs, A/B/C choices | `AskUserQuestion` with `options[]` |\n" +
					"| Specs, comparisons, detailed options (markdown) | `ask_user_visual_question` MCP tool |\n" +
					"| Visual artifacts, wireframes, designs | `ask_user_visual_question` with `image_paths` |\n" +
					"| Design direction with previews | `pick_design_direction` MCP tool |\n\n" +
					'Always provide pre-selected `options[]`. Include an *"Other (let me specify)"* option when the list may not be exhaustive. Never dump option lists as plain conversation text.\n\n'
				: "Mode: **autonomous** — elaborate independently. When you DO need user input (genuine blockers, ambiguity that the codebase can't resolve), use `AskUserQuestion` with pre-selected `options[]` — never plain-text option lists. Autonomous mode does not require `haiku_decision_record` calls; the gate only enforces decisions in collaborative mode.\n\n"
		}**Elaboration produces the PLAN, not the deliverables:**\n1. Research the problem space and write discovery artifacts to \`knowledge/\`\n2. Define units with scope, completion criteria, and dependencies — NOT the actual work product\n   - A unit spec says WHAT will be produced and HOW to verify it\n   - The execution phase produces the actual deliverables\n   - Do NOT write full specs, schemas, or implementations during elaboration\n3. Write unit files to \`.haiku/intents/${slug}/stages/${stage}/units/\`\n4. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator validates and opens the review gate\n\n**Unit file naming convention (REQUIRED):**\nFiles MUST be named \`unit-NN-slug.md\` where:\n- \`NN\` is a zero-padded sequence number (01, 02, 03...)\n- \`slug\` is a kebab-case descriptor (e.g., \`user-auth\`, \`data-model\`)\n- Example: \`unit-01-data-model.md\`, \`unit-02-api-endpoints.md\`\n\nFiles that don't match this pattern will not appear in the review UI and will block advancement.`,
	)

	// Check for ticketing provider.
	try {
		const settingsPath = join(process.cwd(), ".haiku", "settings.yml")
		if (existsSync(settingsPath)) {
			const settingsRaw = readFileSync(settingsPath, "utf8")
			if (settingsRaw.includes("ticketing")) {
				sections.push(
					"## Ticketing Integration\n\n" +
						"A ticketing provider is configured. During elaboration:\n" +
						"1. Create an epic for this intent (or link to existing one if `epic:` is set in intent.md)\n" +
						"2. For each unit created, create a ticket linked to the epic\n" +
						"3. Store ticket key in unit frontmatter: `ticket: PROJ-123`\n" +
						"4. Map unit `depends_on` to ticket blocked-by relationships\n" +
						"5. Include the H·AI·K·U browse link in ticket descriptions\n\n" +
						"See ticketing provider instructions for details on content format and status mapping.",
				)
			}
		}
	} catch {
		/* non-fatal */
	}

	return sections.join("\n\n")
}

export default definePromptBuilder((ctx) => {
	// File-based dispatch: when the workflow handler has already
	// rendered the body to a tmpfile and stamped `prompt_file` on the
	// action, the registered prompt builder emits a one-line "Read
	// this file" pointer. The full body lives at `prompt_file` and
	// is the authoritative instruction set for this tick.
	const promptFile = ctx.action.prompt_file as string | undefined
	if (promptFile) {
		return [
			"## Elaboration Prompt (file-based)",
			"",
			`The full elaboration prompt for this tick is at:`,
			"",
			`    ${promptFile}`,
			"",
			"Read that file with the Read tool and execute its instructions exactly. The file is the canonical, authoritative elaboration prompt — do not paraphrase, summarize, or skip any of it. The file inlines the workflow contracts, the per-stage review-agent lenses you'll be evaluated against, and the action-specific guidance for this tick.",
		].join("\n")
	}
	// Fallback: build the body inline. Hit when a caller bypasses the
	// workflow handler's file-write (rare — primarily exists for
	// compatibility tests that still invoke the prompt builder
	// directly without the handler in front of it).
	return renderElaborate(ctx)
})
