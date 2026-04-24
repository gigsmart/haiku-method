// guard-fsm-fields — PreToolUse hook for Write/Edit
//
// Blocks direct file edits that attempt to spoof FSM-controlled fields on
// haiku state files (intent.md, stage state.json, unit.md). On hookless
// harnesses, tampering is caught by the checksum in `state-integrity.ts`;
// on hook-capable harnesses (Claude Code/Kiro), the checksum is a no-op so
// THIS hook is the primary line of defense. Keep the blocked-field list in
// sync with `fsm-fields.ts` / `state-integrity.ts`, or agents will find a
// way to mutate FSM state without either gate catching it.
//
// What's blocked:
//   - `status: completed` on any state file (the canonical check-in field)
//   - Intent-completion review flags (`phase: awaiting_completion_review`,
//     `completion_review_dispatched: true`, `completion_review_skipped`).
//     These drive the pre-intent-completion review branch in `runNext`;
//     a hand-edited `true` skips or shortcuts the studio-level review
//     without the FSM ever actually running it.
//
// Other field transitions (status → pending/active/blocked, phase →
// elaborate/execute/review/gate) remain agent-editable for legitimate
// state repair via `/haiku:repair` and similar tools.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function out(s: string): void {
	process.stderr.write(s)
}

/**
 * Compute the FULL file content that will exist on disk after the
 * proposed edit. Regex-matching only the Edit `new_string` slice is
 * unsafe — an agent can set `old_string: "active"`,
 * `new_string: "awaiting_completion_review"` and produce
 * `phase: awaiting_completion_review` in the file without the slice
 * itself ever containing the field name. We reconstruct the post-write
 * content so the regexes operate on reality, not on a sliver of it.
 */
function projectedContent(
	toolName: string,
	absPath: string,
	toolInput: Record<string, unknown>,
): string | null {
	if (toolName === "Write") {
		return (toolInput.content as string) || ""
	}
	if (toolName === "Edit") {
		const oldStr = (toolInput.old_string as string) || ""
		const newStr = (toolInput.new_string as string) || ""
		const replaceAll = toolInput.replace_all === true
		if (!existsSync(absPath)) return newStr // file being created via Edit is rare; fall back
		const current = readFileSync(absPath, "utf8")
		if (!oldStr) return current + newStr
		return replaceAll
			? current.split(oldStr).join(newStr)
			: current.replace(oldStr, newStr)
	}
	if (toolName === "MultiEdit") {
		const edits =
			(toolInput.edits as Array<{
				old_string?: string
				new_string?: string
				replace_all?: boolean
			}>) || []
		let projected = existsSync(absPath) ? readFileSync(absPath, "utf8") : ""
		for (const e of edits) {
			const o = e.old_string || ""
			const n = e.new_string || ""
			if (!o) {
				projected = projected + n
				continue
			}
			projected =
				e.replace_all === true
					? projected.split(o).join(n)
					: projected.replace(o, n)
		}
		return projected
	}
	return null
}

export async function guardFsmFields(
	input: Record<string, unknown>,
): Promise<void> {
	const toolName = (input.tool_name as string) || ""
	if (toolName !== "Write" && toolName !== "Edit" && toolName !== "MultiEdit")
		return

	const toolInput = (input.tool_input || {}) as Record<string, unknown>
	const filePath = (toolInput.file_path as string) || ""
	if (!filePath) return

	const absPath = resolve(process.cwd(), filePath)

	// Only guard haiku state files.
	const isIntentFile = /\.haiku\/intents\/[^/]+\/intent\.md$/.test(absPath)
	const isStageState =
		/\.haiku\/intents\/[^/]+\/stages\/[^/]+\/state\.json$/.test(absPath)
	const isUnitFile =
		/\.haiku\/intents\/[^/]+\/stages\/[^/]+\/units\/[^/]+\.md$/.test(absPath)
	if (!(isIntentFile || isStageState || isUnitFile)) return

	const content = projectedContent(toolName, absPath, toolInput) ?? ""
	if (!content) return

	const kind = isIntentFile ? "intent" : isStageState ? "stage" : "unit"

	// Detect status=completed writes in either YAML frontmatter or JSON body.
	// YAML: `status: completed` (optionally quoted)
	// JSON: `"status": "completed"`
	const yamlCompleted = /^\s*status:\s*["']?completed\b["']?/m.test(content)
	const jsonCompleted = /"status"\s*:\s*"completed"/.test(content)

	if (yamlCompleted || jsonCompleted) {
		out(
			`BLOCKED: Cannot directly set status to "completed" on ${kind} files. ` +
				`Completion is FSM-controlled — use the MCP tools (haiku_run_next, ` +
				`haiku_unit_advance_hat) so scope validation, feedback closure, ` +
				`worktree merge-back, and integrity sealing run. Setting status to ` +
				`other values (pending, active, blocked) via direct edit is fine.`,
		)
		process.exit(2)
	}

	// Intent-only guards: hand-editing completion-review phase flags would
	// let an agent enter or exit the studio-level adversarial review
	// without the FSM actually running it. These fields are written only
	// by `fsmEnterIntentCompletionReview`, `runIntentCompletionReview`, and
	// the gate-rejection handler — every legitimate path reseals the
	// integrity checksum. A direct edit would also skip the reseal.
	if (isIntentFile) {
		const entering =
			/^\s*phase:\s*["']?awaiting_completion_review\b["']?/m.test(content)
		const dispatchedTrue = /^\s*completion_review_dispatched:\s*true\b/m.test(
			content,
		)
		const skippedTrue = /^\s*completion_review_skipped:\s*true\b/m.test(content)
		if (entering || dispatchedTrue || skippedTrue) {
			const offending = entering
				? "phase: awaiting_completion_review"
				: dispatchedTrue
					? "completion_review_dispatched: true"
					: "completion_review_skipped: true"
			out(
				`BLOCKED: Cannot directly set \`${offending}\` on intent files. ` +
					`The intent-completion review phase is FSM-controlled — call ` +
					`haiku_run_next to enter it, or approve the gate_review to exit. ` +
					`Hand-editing this field would short-circuit the studio-level ` +
					`adversarial review without running it.`,
			)
			process.exit(2)
		}
	}
}
