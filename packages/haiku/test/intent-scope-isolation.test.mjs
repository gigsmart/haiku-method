// intent-scope-isolation.test.mjs — Pins the contract that the engine
// only touches an intent the user is *explicitly* working on.
//
// Two signals count as explicit:
//   1. The caller passed `intent` directly.
//   2. The current git branch is `haiku/<slug>/main` or
//      `haiku/<slug>/<stage>` — the checkout itself is the
//      declaration that this intent is in scope.
//
// In a git repo, those are the ONLY signals. Falling back to "the sole
// active intent on disk" is wrong: a checked-in intent dir with
// `status: active` does not mean the user is working on it right now
// (e.g. you're reviewing main, doing engine work on another worktree,
// or the intent was committed by an unrelated PR — see
// PR #174/#180/#238 for the cowork-mcp-apps-integration accident).
//
// 2026-05-07 incident: the user noticed scratch files
// (`action-log.jsonl`, `.last_action.json`, `stages/development/`)
// showing up in `git status` even on `main` branch. Root cause: the
// `haiku_run_next` auto-resolve fell through to "sole active intent
// on disk" when no intent branch matched, so every workflow tick
// targeted whatever intent dir happened to be on disk with
// `status: active`. Fixed by removing the fallback in git mode.

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import matter from "gray-matter"

// Go through the orchestrator's public dispatcher rather than
// importing the tool file directly — direct imports trigger the
// same bun-loader cycle that broke previous attempts.
const orchestrator = await import("../src/orchestrator.ts")
const handleOrchestratorTool = orchestrator.handleOrchestratorTool

async function runNext(args = {}) {
	return handleOrchestratorTool(
		"haiku_run_next",
		args,
		new AbortController().signal,
	)
}

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `iso-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		git(repoRoot, "init", "-q")
		git(repoRoot, "config", "user.email", "test@haiku.test")
		git(repoRoot, "config", "user.name", "haiku test")
		git(repoRoot, "config", "commit.gpgsign", "false")
		git(repoRoot, "commit", "--allow-empty", "-q", "-m", "init")
		// stay on the default branch (main / master) — NOT an intent branch
		mkdirSync(join(repoRoot, ".haiku", "intents"), { recursive: true })
		await fn({ repoRoot })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

function makeActiveIntent(repoRoot, slug) {
	const dir = join(repoRoot, ".haiku", "intents", slug)
	mkdirSync(dir, { recursive: true })
	writeFileSync(
		join(dir, "intent.md"),
		matter.stringify(`# ${slug}\n`, {
			title: slug,
			studio: "software",
			mode: "continuous",
			status: "active",
			created_at: new Date().toISOString(),
		}),
	)
	return dir
}

test("haiku_run_next refuses to auto-resolve when not on an intent branch (git mode)", async () => {
	if (!HAS_GIT) return
	await withRepo("scope-isolate-1", async ({ repoRoot }) => {
		// Active intent on disk, but the user is on `main` — engine
		// must NOT auto-target it. This is the cowork-mcp-apps-integration
		// 2026-05-07 regression: previously, a single active intent on
		// disk would be silently selected even when the user's branch
		// had nothing to do with it, causing every tick to write into
		// that intent's runtime journals.
		makeActiveIntent(repoRoot, "stranger-intent")
		const result = await runNext()
		assert.strictEqual(result.isError, true, "expected refusal on non-intent branch")
		const text = result.content?.[0]?.text ?? ""
		assert.ok(
			text.toLowerCase().includes("intent branch") ||
				text.toLowerCase().includes("no intent specified"),
			`expected message to call out the non-intent-branch problem; got: ${text}`,
		)
		// Crucially, the message must NOT name the active intent — that
		// would suggest the engine was about to target it.
		assert.ok(
			!text.includes("stranger-intent"),
			`engine should not name the unrelated active intent; got: ${text}`,
		)
	})
})

test("haiku_run_next auto-resolves when on the intent's branch (git mode)", async () => {
	if (!HAS_GIT) return
	await withRepo("scope-isolate-2", async ({ repoRoot }) => {
		const slug = "real-intent"
		makeActiveIntent(repoRoot, slug)
		// Switch to the intent's main branch. Auto-resolve should pick
		// it up from the branch name even without an explicit `intent`.
		git(repoRoot, "checkout", "-q", "-b", `haiku/${slug}/main`)
		const result = await runNext()
		// We don't care about the action shape — we care that the
		// engine didn't return the "no intent specified" refusal.
		const text = result.content?.[0]?.text ?? ""
		assert.ok(
			!text.toLowerCase().includes("not an intent branch"),
			`expected branch-based auto-resolve; got: ${text}`,
		)
	})
})

test("haiku_run_next still accepts explicit `intent` arg on any branch", async () => {
	if (!HAS_GIT) return
	await withRepo("scope-isolate-3", async ({ repoRoot }) => {
		const slug = "explicit-intent"
		makeActiveIntent(repoRoot, slug)
		// On `main` (not the intent branch), explicit `intent` arg
		// flows through. The downstream branch-validation may still
		// reject (we'd be on the wrong branch for that intent), but
		// the auto-resolve refusal should NOT fire — the slug came from
		// the args, not the disk fallback.
		const result = await runNext({ intent: slug })
		const text = result.content?.[0]?.text ?? ""
		assert.ok(
			!text.toLowerCase().includes("not an intent branch") || text.includes(slug),
			`expected explicit slug to flow through; got: ${text}`,
		)
	})
})
