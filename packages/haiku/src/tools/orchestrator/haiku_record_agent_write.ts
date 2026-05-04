// tools/orchestrator/haiku_record_agent_write.ts — MCP-tool equivalent
// of the `stamp-agent-write` PostToolUse hook for harnesses that don't
// fire PostToolUse hooks (anything other than Claude Code).
//
// What it does: appends an `entry_type: "agent_write"` row to the
// intent's `action-log.jsonl` carrying the post-write SHA of the named
// file. The next drift-gate tick reads the row and silently absorbs
// the change into the baseline — no `manual_change_assessment` for the
// agent to classify against its own deliberate write.
//
// What it does NOT do: write the file. The agent already wrote the
// file via the harness's standard Write/Edit tool; this MCP tool only
// records that the write happened so attribution is correct.
//
// The hook surface (Claude Code) and this MCP tool surface share the
// same core in `orchestrator/workflow/stamp-agent-write.ts`. Calling
// this tool on Claude Code is harmless (idempotent — the gate dedupes
// by SHA-match), but redundant: the hook stamps automatically.
//
// When NOT to call this tool:
//   - The path is not inside `.haiku/intents/<slug>/`.
//   - The path is workflow-managed (`units/`, `feedback/`, `state.json`,
//     `intent.md`, `drift-assessments/`) — those are outside the drift
//     surface and don't need stamping.
//   - The harness fires PostToolUse hooks — Claude Code agents should
//     skip this; the hook does it for them.
//
// When to call this tool:
//   - You're on a non-CC harness and you just wrote a file inside the
//     drift-tracked surface (`stages/<X>/{artifacts,outputs,knowledge,
//     discovery}/...` or intent-root `knowledge/...`) via the harness's
//     Write/Edit/MultiEdit equivalent.

import { realpathSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { stampAgentWriteForPath } from "../../orchestrator/workflow/stamp-agent-write.js"
import { findHaikuRoot } from "../../state-tools.js"
import { defineTool, validateSlugArgs } from "../define.js"

function errorResponse(code: string, message: string) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ ok: false, code, message }, null, 2),
			},
		],
		isError: true,
	}
}

export default defineTool({
	name: "haiku_record_agent_write",
	description:
		"Record an agent_write entry in the intent's action log for a tracked-surface file the agent just wrote via the harness's Write/Edit tool. Use only on harnesses that don't fire PostToolUse hooks (i.e., NOT Claude Code — on CC, the `stamp-agent-write` hook does this automatically). The next drift-gate tick will silently absorb the change into the baseline so the agent isn't asked to classify its own deliberate writes. Tracked-surface paths: `stages/<X>/{artifacts,outputs,knowledge,discovery}/...` and intent-root `knowledge/...`. Workflow-managed paths (`units/`, `feedback/`, `state.json`, `intent.md`) and paths outside the intent dir don't need (and won't get) a stamp.",
	inputSchema: {
		type: "object" as const,
		properties: {
			intent_slug: {
				type: "string",
				description: "Slug of the intent that owns the file you just wrote.",
			},
			path: {
				type: "string",
				description:
					"Path of the file you just wrote. Either intent-relative (e.g. `stages/design/artifacts/spec.md`) or absolute. The tool resolves it against the intent dir and verifies it falls inside the drift-tracked surface before stamping.",
			},
		},
		required: ["intent_slug", "path"],
	},

	async handle(args) {
		const slug = args.intent_slug as string
		const path = args.path as string

		if (typeof slug !== "string" || slug.trim() === "") {
			return errorResponse(
				"missing_intent_slug",
				"`intent_slug` is required and must be a non-empty string.",
			)
		}
		if (typeof path !== "string" || path.trim() === "") {
			return errorResponse(
				"missing_path",
				"`path` is required and must be a non-empty string.",
			)
		}

		const slugCheck = validateSlugArgs({ intent: slug })
		if (slugCheck) return slugCheck

		const root = findHaikuRoot()
		const intentDir = join(root, "intents", slug)
		const absPath = isAbsolute(path) ? path : join(intentDir, path)

		// Bounds-check absolute paths against the slug-bound intent dir.
		// Without this, a crafted absolute path could stamp another
		// intent's action log even though the request named slug `A`.
		// Use realpath canonicalisation to defeat symlink games (and to
		// reconcile macOS's `/var` → `/private/var` aliasing). The
		// trailing slash anchor prevents `intents/foo` from matching
		// `intents/foo-bar/...`.
		const realIntent = (() => {
			try {
				return realpathSync(intentDir)
			} catch {
				return intentDir
			}
		})()
		const realAbs = (() => {
			try {
				return realpathSync(absPath)
			} catch {
				return absPath
			}
		})()
		if (!realAbs.startsWith(`${realIntent}/`) && realAbs !== realIntent) {
			return errorResponse(
				"path_outside_intent",
				`Absolute path '${path}' resolves outside the intent dir for slug '${slug}'. Either pass an intent-relative path or an absolute path inside ${realIntent}/.`,
			)
		}

		const result = await stampAgentWriteForPath(absPath)

		if (!result.stamped) {
			// Map skip reasons to a structured response. The MCP tool surfaces
			// these explicitly so the agent learns which writes don't need
			// stamping; the hook silently ignores the same conditions.
			const reasonMessages: Record<string, string> = {
				not_in_intent_dir: `Path is not inside an intent directory (resolved: ${absPath}). Only writes inside .haiku/intents/<slug>/ get tracked.`,
				not_in_tracked_surface: `Path is inside the intent dir but not in the drift-tracked surface (resolved: ${absPath}). Tracked locations are stages/<X>/{artifacts,outputs,knowledge,discovery}/... and intent-root knowledge/...`,
				file_missing: `File does not exist on disk (resolved: ${absPath}). Did the write succeed?`,
				read_failed: `Could not read file to compute SHA (resolved: ${absPath}).`,
			}
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								ok: true,
								stamped: false,
								reason: result.reason,
								message:
									reasonMessages[result.reason ?? ""] ??
									"Stamp skipped for unknown reason.",
							},
							null,
							2,
						),
					},
				],
			}
		}

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						{
							ok: true,
							stamped: true,
							path: result.pathRel,
							sha: result.sha,
							tick_counter: result.tickCounter,
							tick_scope: result.tickScope,
							next_step:
								"The next `haiku_run_next` tick will see the agent_write entry and silently update the baseline — no manual_change_assessment finding for this path.",
						},
						null,
						2,
					),
				},
			],
		}
	},
})
