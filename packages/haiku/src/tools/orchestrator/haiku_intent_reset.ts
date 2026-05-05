// tools/orchestrator/haiku_intent_reset.ts — Destructively reset an
// intent: confirm via elicitation, delete every haiku/{slug}/* branch
// (including intent-main), wipe the intent dir, then return an
// instruction telling the caller to recreate via haiku_intent_create
// with the preserved title/description/context.
//
// Confirmation REQUIRES an elicitInput handler (set on server boot).
// Without it, the tool refuses — the action is too destructive to
// proceed silently.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
	branchExists,
	cleanupIntentWorktrees,
	deleteBranch,
	deleteStageBranch,
	getMainlineBranch,
} from "../../git-worktree.js"
import { getElicitInput, resolveStudioStages } from "../../orchestrator.js"
import {
	findHaikuRoot,
	gitCommitState,
	isGitRepo,
	parseFrontmatter,
} from "../../state-tools.js"
import { defineTool } from "../define.js"
import { text } from "./_text.js"

export default defineTool({
	name: "haiku_intent_reset",
	description:
		"Reset an intent — destructively delete all stage branches, the intent main branch, and the intent directory, then return instructions to recreate the intent with the same title/description/context. Requires user confirmation via elicitation.",
	inputSchema: {
		type: "object" as const,
		properties: {
			intent: { type: "string", description: "Intent slug to reset" },
		},
		required: ["intent"],
	},
	async handle(args) {
		const slug = args.intent as string

		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")
		if (!existsSync(intentFile)) {
			return {
				content: [
					{ type: "text" as const, text: `Intent '${slug}' not found.` },
				],
				isError: true,
			}
		}

		const raw = readFileSync(intentFile, "utf8")
		const { data, body } = parseFrontmatter(raw)
		const title = (data.title as string) || ""
		// Description = body minus the H1 heading, trimmed.
		const description = body.replace(/^#\s+.*\n+/, "").trim() || title

		const elicit = getElicitInput()
		if (!elicit) {
			return {
				content: [
					{
						type: "text" as const,
						text: "Reset requires user confirmation via elicitation.",
					},
				],
				isError: true,
			}
		}
		const result = await elicit({
			message: `Reset intent "${slug}"?\n\nThis will DELETE all state (stages, units, knowledge) and recreate the intent with the same description.\n\nDescription: "${description}"`,
			requestedSchema: {
				type: "object" as const,
				properties: {
					confirm: {
						type: "string",
						title: "Confirm Reset",
						description: "This cannot be undone",
						enum: ["Reset", "Cancel"],
					},
				},
				required: ["confirm"],
			},
		})

		if (
			result.action !== "accept" ||
			(result.content as Record<string, string>)?.confirm !== "Reset"
		) {
			return text(
				JSON.stringify({ action: "cancelled", message: "Reset cancelled." }),
			)
		}

		// Read conversation context if it exists (preserve it). Read this
		// BEFORE any branch switch so we read from whatever branch has the
		// ctx file at call time. The intent's most-recent context wins.
		let conversationContext = ""
		const ctxFile = join(iDir, "knowledge", "CONVERSATION-CONTEXT.md")
		if (existsSync(ctxFile)) {
			conversationContext = readFileSync(ctxFile, "utf8").replace(
				/^# Conversation Context\n\n/,
				"",
			)
		}

		const intentFm = parseFrontmatter(raw).data
		const studio = (intentFm.studio as string) || ""

		// Reset must move the primary's HEAD off ALL `haiku/{slug}/*`
		// branches because we are about to delete every one of them
		// including intent-main itself. Git refuses to delete the
		// branch the primary is on. Three checkout strategies, in
		// preference order:
		//
		//   1. Repo mainline (`main`/`master`/etc.) — the natural
		//      home for an idle primary. Skipped when mainline is
		//      held by a foreign worktree (`git checkout` would
		//      refuse) or when the user already has it checked out
		//      somewhere they're working.
		//   2. Detached HEAD at mainline's tip — git always allows
		//      detached checkout regardless of who owns the branch
		//      ref. Functionally equivalent for our delete-then-
		//      delete dance: HEAD points at a commit, not a branch
		//      ref, so the branch refs we're about to delete are no
		//      longer "checked out anywhere on this worktree."
		//   3. Hard error if neither works — surface a precise
		//      message so the user can move their checkout manually
		//      and retry.
		if (isGitRepo()) {
			try {
				const mainlineBranch = getMainlineBranch()
				let currentBranch = ""
				try {
					currentBranch = execFileSync(
						"git",
						["rev-parse", "--abbrev-ref", "HEAD"],
						{ encoding: "utf8", stdio: "pipe" },
					).trim()
				} catch {
					/* non-fatal: detached HEAD */
				}
				if (mainlineBranch && currentBranch !== mainlineBranch) {
					try {
						execFileSync("git", ["checkout", mainlineBranch], {
							encoding: "utf8",
							stdio: "pipe",
						})
					} catch (checkoutErr) {
						// Fall back to detached HEAD at mainline's tip.
						// `git checkout <ref>^0` is the canonical detached-
						// HEAD-at-tip incantation; works whether or not the
						// branch is held elsewhere.
						try {
							execFileSync("git", ["checkout", `${mainlineBranch}^0`], {
								encoding: "utf8",
								stdio: "pipe",
							})
						} catch (detachErr) {
							const checkoutRaw =
								checkoutErr instanceof Error
									? checkoutErr.message
									: String(checkoutErr)
							const detachRaw =
								detachErr instanceof Error
									? detachErr.message
									: String(detachErr)
							throw new Error(
								`could not move HEAD off the haiku branches: \`git checkout ${mainlineBranch}\` failed (${checkoutRaw.split("\n")[0]}) AND detached fallback \`git checkout ${mainlineBranch}^0\` also failed (${detachRaw.split("\n")[0]}). Commit / stash / clean any uncommitted changes here and retry.`,
							)
						}
					}
				}
			} catch (err) {
				const rawErr = err instanceof Error ? err.message : String(err)
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: failed to move HEAD off the haiku branches before resetting intent '${slug}'. ${rawErr}`,
						},
					],
					isError: true,
				}
			}

			// Clean up unit worktrees BEFORE deleting their backing branches
			// — otherwise `git branch -D` refuses because the branch is
			// checked out in a worktree.
			cleanupIntentWorktrees(slug)

			if (studio) {
				const allStudioStages = resolveStudioStages(studio)
				for (const stg of allStudioStages) {
					const stgBranch = `haiku/${slug}/${stg}`
					if (branchExists(stgBranch)) {
						deleteStageBranch(slug, stg)
					}
				}
			}

			// Finally, delete the intent-main branch itself. Without this
			// the subsequent haiku_intent_create's createIntentBranch would
			// checkout the stale haiku/{slug}/main and inherit its history.
			const intentMainBranch = `haiku/${slug}/main`
			if (branchExists(intentMainBranch)) {
				deleteBranch(intentMainBranch)
			}
		}

		rmSync(iDir, { recursive: true, force: true })

		gitCommitState(`haiku: reset intent ${slug} (deleted)`)

		return text(
			JSON.stringify(
				{
					action: "intent_reset",
					slug,
					title,
					description,
					context: conversationContext,
					message: `Intent '${slug}' has been reset. Call haiku_intent_create { title: "${title.replace(/"/g, '\\"')}", description: "${description.replace(/"/g, '\\"').replace(/\n/g, "\\n")}", slug: "${slug}"${conversationContext ? ', context: "<preserved context>"' : ""} } to recreate it.`,
				},
				null,
				2,
			),
		)
	},
})
