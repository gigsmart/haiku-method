// orchestrator/studio.ts — Studio + stage + hat resolution.
//
// Pure read helpers that take a studio identifier (dir / name / slug /
// alias — any will resolve via studio-reader's cache) and return:
//   - resolveStudioFilePath        — first existing path in the studio
//                                    search order (project overrides plugin)
//   - resolveIntentStages          — effective stage list (intersection
//                                    of intent.stages allow-list with
//                                    skip_stages deny-list)
//   - resolveStudioStages          — full stage list from STUDIO.md
//   - resolveStageHats             — hat sequence from STAGE.md
//   - resolveStageFixHats          — fix_hats list (private — used here
//                                    + workflow handler imports inline copy)
//   - resolveUnitHatsInStudio      — stage hats + auto-injected
//                                    feedback-assessor when unit has closes:
//   - resolveStageReview           — review-gate type ("auto" / "ask" /
//                                    "external" / compound CSV)
//   - resolveStageMetadata         — STAGE.md description + body
//   - buildFeedbackAssessorPrompt  — prompt body for the auto-injected
//                                    feedback-assessor hat

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { resolvePluginRoot } from "../config.js"
import { intentDir, parseFrontmatter } from "../state-tools.js"
import { resolveStudio, studioSearchPaths } from "../studio-reader.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

/** Resolve a studio-scoped file path. Returns the first existing
 *  path found in the studio search order (project overrides plugin),
 *  or null if nothing matches. The path returned is what a subagent
 *  should open — NOT the file content. */
export function resolveStudioFilePath(subpath: string): string | null {
	for (const base of studioSearchPaths()) {
		const full = join(base, subpath)
		if (existsSync(full)) return full
	}
	return null
}

/** Compute the effective stage list for an intent.
 *
 *  Resolution order:
 *    1. Start with the studio's full stage list (from STUDIO.md).
 *    2. If `intent.stages` is an explicit non-empty array, intersect
 *       with studio stages (preserves studio order; rejects unknown
 *       stages). This is how `/haiku:quick` restricts a multi-stage
 *       studio to a single stage without enumerating skip_stages.
 *    3. Apply `intent.skip_stages` filter on the result.
 *
 *  Callers that need the full studio list (not intent-filtered)
 *  should call `resolveStudioStages` directly. */
export function resolveIntentStages(
	intent: Record<string, unknown>,
	studio: string,
): string[] {
	const studioStages = resolveStudioStages(studio)
	const explicit = Array.isArray(intent.stages)
		? (intent.stages as string[])
		: []
	const allowed = explicit.length > 0 ? new Set(explicit) : null
	const skipStages = (intent.skip_stages as string[]) || []
	return studioStages.filter((s) => {
		if (allowed && !allowed.has(s)) return false
		if (skipStages.includes(s)) return false
		return true
	})
}

export function resolveStudioStages(studio: string): string[] {
	// Accept any identifier (dir, name, slug, alias); fall back to direct
	// lookup for robustness with legacy callers that pass a dir name already.
	const info = resolveStudio(studio)
	if (info) return info.stages
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const studioFile = join(base, studio, "STUDIO.md")
		if (existsSync(studioFile)) {
			const fm = readFrontmatter(studioFile)
			return (fm.stages as string[]) || []
		}
	}
	return []
}

export function resolveStageHats(studio: string, stage: string): string[] {
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			return (fm.hats as string[]) || []
		}
	}
	return []
}

/** Read the ordered `fix_hats:` list declared on a stage. When set,
 *  pending feedback findings are routed through this sequence
 *  instead of the legacy "draft new units that close feedback" path.
 *  Empty list (or missing field) keeps the legacy behavior. Each
 *  named hat must have a real `hats/{hat}.md` mandate file (validated
 *  at dispatch time); fix hats may live OUTSIDE the main `hats:`
 *  rotation so a `feedback-assessor` hat can exist solely for
 *  fix-mode use without intruding on the execute loop. */
export function resolveStageFixHats(studio: string, stage: string): string[] {
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			const fixHats = fm.fix_hats
			if (Array.isArray(fixHats)) return fixHats as string[]
			return []
		}
	}
	return []
}

/** Build the subagent prompt for the auto-injected `feedback-assessor`
 *  hat. The assessor's job is independent verification of the unit's
 *  `closes:` claims — it reads every feedback body and every output
 *  the unit produced, then decides whether each claim actually
 *  resolves the finding. On approve: workflow engine promotes each
 *  FB item's status to `closed`/`addressed` and the unit completes.
 *  On reject: the unit bolts back to the first hat with a reason
 *  naming the specific unresolved items. */
export function buildFeedbackAssessorPrompt(opts: {
	slug: string
	studio: string
	stage: string
	unit: string
	bolt: number
	worktreePath: string
	intentRoot: string
	unitAbsPath: string
	closes: string[]
	feedbackFiles: Array<{ id: string; file: string }>
	unitOutputs: string[]
}): string {
	const {
		slug,
		stage,
		unit,
		bolt,
		worktreePath,
		intentRoot,
		unitAbsPath,
		closes,
		feedbackFiles,
		unitOutputs,
	} = opts
	const lines: string[] = []
	lines.push(
		`You are the **feedback-assessor** hat for unit **${unit}** (bolt ${bolt}) in stage **${stage}** of intent **${slug}**.`,
		"",
		"## Role",
		"",
		"You are the independent verifier. The prior hats produced work claiming to close specific feedback items. You decide — by reading the feedback bodies and the unit's actual outputs — whether each claimed closure is valid. The designer/reviewer cannot self-certify; that is why this hat exists.",
		"",
	)
	if (worktreePath) {
		lines.push(
			`**Unit worktree:** \`${worktreePath}\` (intent dir: \`${intentRoot}\`). Read and write at this path — it contains prior-hat commits not yet merged. **Your FIRST Bash command MUST be \`cd <worktree path>\`.** Every git, npm, node, and shell command that follows must run from inside the worktree. Git commits land on the unit's branch only if you are inside the worktree's tree. Absolute paths below are for Read/Write tool references, but shell-layer work (install, build, test, commit) requires the cwd to be the worktree. Verify with \`pwd\` after \`cd\` if in doubt.

**Bash timeouts are MANDATORY on long-running commands.** Never let a test, build, install, or lint hang the hat indefinitely. Every Bash call that runs \`npm test\`, \`vitest\`, \`npx tsc\`, \`npm run build\`, \`npm install\`, \`playwright\`, or any Node CLI must pass an explicit \`timeout\` parameter:

- typecheck / lint: \`timeout: 120000\` (2 min)
- test runs: \`timeout: 300000\` (5 min)
- builds / install: \`timeout: 600000\` (10 min; the hard cap)

If a command times out, do NOT retry blindly — diagnose why (hanging test, network fetch, infinite loop in a watcher) and fix the underlying cause. A command that legitimately needs more than 10 minutes is a spec problem, not a timeout problem; surface it via \`haiku_unit_reject_hat\` rather than hanging the bolt.`,
			"",
		)
	}
	lines.push(
		"## Required reading",
		"",
		`- Unit spec (for \`closes:\` array + output list) — \`${unitAbsPath}\``,
	)
	for (const out of unitOutputs) {
		lines.push(`- Unit output — \`${join(intentRoot, out)}\``)
	}
	lines.push("", "## Feedback items the unit claims to close", "")
	for (const fb of feedbackFiles) {
		lines.push(
			`- **${fb.id}** — \`${join(intentRoot, fb.file)}\` (read the full body)`,
		)
	}
	if (closes.length === 0) {
		lines.push(
			"- _(none — this assessor was spawned but the unit has no `closes:` references; advance immediately)_",
		)
	}
	lines.push(
		"",
		"## Assessment procedure",
		"",
		"For each feedback item above:",
		"1. Read the feedback body in full. Extract the concrete requirement(s) it is asserting must change.",
		"2. Read the unit's outputs listed above (or glob the unit's artifacts dir if not listed).",
		"3. Judge independently: does the output *demonstrably* resolve the finding? Be strict — a partial gesture is not a fix.",
		"4. Record your verdict per feedback item: **closed** (resolved) or **still-pending** (not resolved, with a specific reason).",
		"",
		"## Outcome",
		"",
		`- **All items closed:** call \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unit}" }\`. The workflow engine will promote each feedback item to \`closed\` (agent-authored) or \`addressed\` (human-authored) automatically.`,
		`- **Any still-pending:** call \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unit}", reason: "<which items aren't closed and why>" }\`. The unit bolts back to the first hat. The failing feedback items stay \`pending\` — they will be re-addressed on the next bolt.`,
		"",
		"## Guardrails",
		"",
		"- Do NOT edit any artifacts. You verify only.",
		"- Do NOT call `haiku_feedback_update` yourself — advance_hat does the status promotion atomically.",
		"- Be specific in reject reasons: name each feedback id (FB-NN) that isn't closed and one-line why.",
		"- Trust the unit's output list but also scan the artifacts directory — if a claimed close hinges on an artifact the unit didn't list, flag it.",
	)
	return lines.join("\n")
}

/** Append `feedback-assessor` as the terminal hat when a unit
 *  declares `closes:` items. Mirrors state-tools.ts's
 *  resolveUnitHats. */
export function resolveUnitHatsInStudio(
	studio: string,
	stage: string,
	slug: string,
	unit: string,
): string[] {
	const stageHats = resolveStageHats(studio, stage)
	const dir = intentDir(slug)
	const unitFile = join(
		dir,
		"stages",
		stage,
		"units",
		unit.endsWith(".md") ? unit : `${unit}.md`,
	)
	if (!existsSync(unitFile)) return stageHats
	try {
		const { data } = parseFrontmatter(readFileSync(unitFile, "utf8"))
		const closes = (data.closes as string[]) || []
		if (closes.length > 0 && !stageHats.includes("feedback-assessor")) {
			return [...stageHats, "feedback-assessor"]
		}
	} catch {
		/* non-fatal */
	}
	return stageHats
}

export function resolveStageReview(studio: string, stage: string): string {
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			const review = fm.review
			// Return every declared review kind joined with commas so
			// downstream callers (which use `.includes("external")`,
			// `.includes("ask")`, etc.) see all kinds. Previously this
			// collapsed `[external, ask]` to just `"external"`, silently
			// dropping the "ask" half of the gate.
			if (Array.isArray(review)) return (review as string[]).join(",")
			return (review as string) || "auto"
		}
	}
	return "auto"
}

export function resolveStageMetadata(
	studio: string,
	stage: string,
): {
	description: string
	body: string
	/** True when the stage's STAGE.md frontmatter declares
	 *  `requires_design_direction: true` — gates elaborate behind a
	 *  pick_design_direction selection (P3, 2026-05-06). */
	requires_design_direction?: boolean
} | null {
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	const pluginRoot = resolvePluginRoot()
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, dir, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const raw = readFileSync(stageFile, "utf8")
			const fm = readFrontmatter(stageFile)
			const { content } = matter(raw)
			return {
				description: (fm.description as string) || stage,
				body: content.trim(),
				requires_design_direction:
					fm.requires_design_direction === true ? true : undefined,
			}
		}
	}
	return null
}
