// tools/orchestrator/haiku_intent_create.ts — Create a new intent.
// `/haiku:start` always creates a new intent — never resumes. Use
// `/haiku:pickup` to resume an existing one. Forks `haiku/{slug}/main`
// directly off the mainline ref WITHOUT
// checking out the repo mainline (locked / dirty mainline checkouts
// in another worktree don't block intent creation, and intent files
// only ever land on the haiku branch — mainline stays clean). The
// working tree lands on the intent's own branch, so the intent is
// resumable via `git switch`.
//
// Title is required and must be a deliberate 3–8 word summary, not a
// truncated description. Slug auto-derives from title when omitted.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	branchExists,
	createIntentBranch,
	resolveMainlineRef,
} from "../../git-worktree.js"
import { validateIdentifier } from "../../prompts/helpers.js"
import { logSessionEvent } from "../../session-metadata.js"
import {
	findHaikuRoot,
	gitCommitState,
	intentTitleNeedsRepair,
	isGitRepo,
	timestamp,
} from "../../state-tools.js"
import { emitTelemetry } from "../../telemetry.js"
import { defineTool } from "../define.js"
import { text } from "./_text.js"

export default defineTool({
	name: "haiku_intent_create",
	description:
		"Create a new intent. Returns the slug + path. Title is required (crisp 3–8 word summary, ≤80 chars, single line). Studio is selected separately via haiku_select_studio. Always creates a fresh intent — `/haiku:start` does not resume; use `/haiku:pickup` for that.",
	inputSchema: {
		type: "object" as const,
		properties: {
			title: { type: "string" },
			description: { type: "string" },
			slug: { type: "string" },
			context: { type: "string" },
			mode: { type: "string" },
			stages: { type: "array", items: { type: "string" } },
			state_file: { type: "string" },
		},
		required: ["title", "description"],
	},
	handle(args) {
		const description = args.description as string
		const titleInput = args.title as string | undefined
		let slug = args.slug as string | undefined

		// Title is required: must be a crisp, human-readable summary the
		// agent writes deliberately. We do NOT derive it by truncating the
		// description.
		if (!titleInput || typeof titleInput !== "string") {
			return text(
				JSON.stringify({
					error: "missing_title",
					message:
						'haiku_intent_create requires a `title` parameter — a crisp 3–8 word summary (≤80 chars, single line, no trailing period). Write it deliberately; do NOT pass a truncated description. Example: title: "Add archivable intents".',
				}),
			)
		}
		// Reject newlines explicitly before normalization — otherwise `\s+`
		// would collapse them to spaces and hide the intent (a multi-line
		// title input is a sign the agent pasted a paragraph, not wrote a
		// title).
		if (/[\r\n]/.test(titleInput)) {
			return text(
				JSON.stringify({
					error: "invalid_title",
					message:
						"`title` must be a single line — got newlines. Rewrite as a crisp 3–8 word summary (≤80 chars) and call again.",
				}),
			)
		}
		const title = titleInput.trim().replace(/\s+/g, " ")
		if (intentTitleNeedsRepair(title)) {
			return text(
				JSON.stringify({
					error: "invalid_title",
					message: `\`title\` must be non-empty and ≤80 chars after trimming. Got ${title.length} chars. Rewrite as a 3–8 word summary and call again.`,
				}),
			)
		}

		if (!slug) {
			slug = title
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, "")
				.replace(/\s+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50)
				.replace(/-$/, "")
		}

		slug = validateIdentifier(slug, "intent slug")

		const stateFile = args.state_file as string | undefined

		// Fork the intent's main branch directly off the mainline ref and
		// switch the working tree to it BEFORE any filesystem checks or
		// writes for the new intent. We never check out the repo mainline:
		//   - `git branch <new> <ref>` forks from any ref without touching
		//     the working tree, so a locked or stale mainline checkout in
		//     another worktree doesn't block us.
		//   - The working tree lands on `haiku/{slug}/main`, the intent's
		//     own branch — making it resumable via plain `git switch`.
		//   - Intent files (intent.md, knowledge/*) only ever land on the
		//     haiku branch; mainline stays clean.
		// The existsSync check on iDir then runs against the intent's
		// branch:
		//   - If `haiku/{slug}/main` already existed, the fork is a no-op,
		//     checkout reveals the existing files, and we return
		//     intent_exists.
		//   - If a legacy intent dir lives on mainline (pre-fix repos), the
		//     fresh fork inherits it, and existsSync still catches it.
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentMainBranch = `haiku/${slug}/main`
		if (isGitRepo()) {
			try {
				const mainlineRef = resolveMainlineRef()
				if (!branchExists(intentMainBranch)) {
					createIntentBranch(slug, mainlineRef || undefined)
				}
				let currentBranch = ""
				try {
					currentBranch = execFileSync(
						"git",
						["rev-parse", "--abbrev-ref", "HEAD"],
						{ encoding: "utf8", stdio: "pipe" },
					).trim()
				} catch {
					/* non-fatal: detached HEAD or similar */
				}
				if (currentBranch !== intentMainBranch) {
					execFileSync("git", ["checkout", intentMainBranch], {
						encoding: "utf8",
						stdio: "pipe",
					})
				}
			} catch (err) {
				const raw = err instanceof Error ? err.message : String(err)
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: failed to switch to intent branch '${intentMainBranch}'. Stash or commit uncommitted changes, or remove the worktree holding '${intentMainBranch}' if it's checked out elsewhere, then retry. Raw git error: ${raw}`,
						},
					],
					isError: true,
				}
			}
		}

		if (existsSync(join(iDir, "intent.md"))) {
			return text(
				JSON.stringify({
					error: "intent_exists",
					slug,
					message: `Intent '${slug}' already exists`,
				}),
			)
		}

		mkdirSync(join(iDir, "knowledge"), { recursive: true })
		mkdirSync(join(iDir, "stages"), { recursive: true })

		// Build intent.md with frontmatter + body (no studio — selected
		// separately). Title and description are distinct: title is a
		// short human-readable summary the agent wrote deliberately;
		// description is the full narrative body.
		const context = args.context as string | undefined
		const mode = (args.mode as string) || "continuous"
		const stagesOverride = args.stages as string[] | undefined
		const descriptionBody = (description || "").trim()
		const intentContent = [
			"---",
			`title: "${title.replace(/"/g, '\\"')}"`,
			`studio: ""`,
			`mode: ${mode}`,
			"status: active",
			...(stagesOverride
				? [`stages:\n${stagesOverride.map((s) => `  - ${s}`).join("\n")}`]
				: []),
			`created_at: ${timestamp()}`,
			"---",
			"",
			`# ${title}`,
			"",
			...(descriptionBody ? [descriptionBody, ""] : []),
			...(context ? [context, ""] : []),
		].join("\n")

		writeFileSync(join(iDir, "intent.md"), intentContent)

		// Seed `.gitattributes` for engine-owned append-only event
		// streams. Both `action-log.jsonl` and `write-audit.jsonl` are
		// written from EVERY branch the engine touches (intent main,
		// stage branches, fix-chain worktrees, discovery worktrees).
		// Without `merge=union`, every fix-chain that ran a workflow
		// tick conflicts with the base on the JSONL append, the
		// integrator can't cleanly resolve the loss-prone "did you
		// mean to drop the other side's events?" question, and the
		// integrator cap eventually trips — leaving the chain's real
		// content stranded on a dead worktree. `merge=union` is the
		// textbook fix for append-only logs: git concatenates both
		// sides' lines automatically, no integrator involvement
		// needed.
		writeFileSync(
			join(iDir, ".gitattributes"),
			[
				"# Engine-owned append-only event streams. `merge=union` tells git",
				"# to concatenate both sides on conflict — these files are pure",
				"# event streams and never benefit from manual conflict resolution.",
				"action-log.jsonl merge=union",
				"write-audit.jsonl merge=union",
				"",
			].join("\n"),
		)

		// Stage + commit `.gitattributes` ON THE INTENT MAIN BRANCH
		// before any stage / unit / fix-chain / discovery worktree
		// can fork from it. The bulk `gitCommitState` call below
		// would normally pick this up, but it swallows errors (e.g.
		// pre-commit hook failure) silently — so attempt an explicit
		// commit here first. Failure is non-fatal: the next commit
		// will retry, and `ensureIntentGitAttributes` is the
		// belt-and-braces auto-repair on legacy intents anyway.
		if (isGitRepo()) {
			try {
				const rel = `.haiku/intents/${slug}/.gitattributes`
				execFileSync("git", ["add", "--", rel], { stdio: "pipe" })
				execFileSync(
					"git",
					[
						"commit",
						"-m",
						`haiku: seed .gitattributes (merge=union for event streams) for ${slug}`,
						"--",
						rel,
					],
					{ stdio: "pipe" },
				)
			} catch {
				// Pre-commit hook, dirty index, etc. — non-fatal. The
				// `gitCommitState` below will pick it up if the user's
				// hook tolerates the bulk add; otherwise the auto-repair
				// in `ensureIntentGitAttributes` fires on the next
				// worktree-creation tick.
			}
		}

		// Also write conversation context to knowledge for
		// discoverability.
		if (context) {
			const knowledgeDir = join(iDir, "knowledge")
			mkdirSync(knowledgeDir, { recursive: true })
			writeFileSync(
				join(knowledgeDir, "CONVERSATION-CONTEXT.md"),
				`# Conversation Context\n\n${context}\n`,
			)
		}

		gitCommitState(`haiku: create intent ${slug}`)

		emitTelemetry("haiku.intent.created", { intent: slug })
		if (stateFile)
			logSessionEvent(stateFile, { event: "intent_created", intent: slug })

		return text(
			JSON.stringify(
				{
					action: "intent_created",
					slug,
					path: `.haiku/intents/${slug}`,
					message: `Intent '${slug}' created. Call haiku_run_next { intent: "${slug}" } to begin.`,
				},
				null,
				2,
			),
		)
	},
})
