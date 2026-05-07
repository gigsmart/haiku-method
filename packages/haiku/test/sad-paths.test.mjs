// Sad-path coverage. Each test forces the engine into a degenerate
// state (intent missing, intent.md without studio, malformed
// frontmatter, stale FBs, etc.) and asserts the response is well-
// formed: a stable action name, a non-empty message that names the
// fix, no crash.

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

const { dispatchOrchestratorAction } = await import(
	`${SRC}/orchestrator/workflow/run-tick.ts`
)

function gitInit(root) {
	execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root })
	execFileSync("git", ["config", "user.email", "t@t"], { cwd: root })
	execFileSync("git", ["config", "user.name", "t"], { cwd: root })
	execFileSync(
		"git",
		["commit", "--allow-empty", "-q", "-m", "init"],
		{ cwd: root },
	)
}

function fm(o, body = "") {
	const lines = ["---"]
	for (const [k, v] of Object.entries(o)) {
		if (v === null) lines.push(`${k}: null`)
		else if (typeof v === "object")
			lines.push(`${k}: ${JSON.stringify(v)}`)
		else if (typeof v === "string") lines.push(`${k}: ${JSON.stringify(v)}`)
		else lines.push(`${k}: ${v}`)
	}
	lines.push("---", body)
	return lines.join("\n")
}

test("sad: intent slug not found returns error with a non-empty message", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-notfound-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		const r = dispatchOrchestratorAction("does-not-exist", "")
		assert.equal(r.action, "error")
		assert.ok(typeof r.message === "string" && r.message.length > 10)
		assert.match(r.message, /not found/i)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("sad: intent.md missing studio field returns select_studio with hint", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-nostudio-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					mode: "continuous",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: {},
					sealed_at: null,
				},
				"# x\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		assert.equal(r.action, "select_studio")
		assert.ok(typeof r.message === "string" && r.message.length > 10)
		assert.match(r.message, /studio/i)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("tick gate: intent.md missing mode (studio set) returns select_mode", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-nomode-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					studio: "synth",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: {},
					sealed_at: null,
				},
				"# x\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		assert.equal(r.action, "select_mode")
		assert.match(r.message, /mode/i)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("tick gate: quick mode with no stages returns select_stage", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-nostage-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					studio: "synth",
					mode: "quick",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: {},
					sealed_at: null,
				},
				"# x\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		assert.equal(r.action, "select_stage")
		assert.match(r.message, /stage/i)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("tick gate: non-quick mode with no stages does NOT trigger select_stage (continuous fills stages later)", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-continuousnostage-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					studio: "synth",
					mode: "continuous",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: {},
					sealed_at: null,
				},
				"# x\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		// Continuous mode without stages array shouldn't dead-end on
		// select_stage — the studio's stage list is the source of truth
		// here, not intent.md.stages. So whatever the cursor returns,
		// it's NOT select_stage.
		assert.notEqual(r.action, "select_stage")
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("sad: malformed intent.md frontmatter is surfaced as an error or hard fault, not a silent crash", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-malformed-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		// Frontmatter open but never closed — gray-matter will treat
		// the whole file as body. The cursor must NOT crash; it
		// surfaces some error/select_studio/etc. with a message.
		writeFileSync(
			join(intentDir, "intent.md"),
			"---\ntitle: x\nstudio: nonsense\n# Body\n",
		)
		// Either dispatch returns a structured error or it succeeds with
		// some fallback action. The contract: never throw, never return
		// undefined.
		let r
		try {
			r = dispatchOrchestratorAction("x", "")
		} catch (err) {
			// A throw here would be the bug — surface it with the path
			// to the actual intent.md so the user knows what to fix.
			assert.fail(
				`dispatchOrchestratorAction threw on malformed intent.md: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
		assert.ok(r != null, "dispatch returned null/undefined on malformed FM")
		assert.ok(typeof r.action === "string")
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("sad: closed FB doesn't re-trigger the fix loop", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-stalefb-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(join(intentDir, "feedback"), { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					studio: "synth",
					mode: "continuous",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: {},
					sealed_at: null,
				},
				"# x\n",
			),
		)
		// FB with terminal status (closed) sitting in the dir. The
		// cursor's Track B walk must not pick it as actionable.
		writeFileSync(
			join(intentDir, "feedback", "FB-001.md"),
			fm(
				{
					feedback_id: "FB-001",
					title: "old",
					origin: "user-chat",
					author: "u",
					status: "closed",
					closed_at: "2026-04-15T00:00:00Z",
					triaged_at: "2026-04-14T00:00:00Z",
				},
				"# closed\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		// Whatever the cursor returns, it must NOT be a feedback-track
		// action against this closed FB.
		assert.notEqual(r.action, "start_feedback_hat")
		assert.notEqual(r.action, "close_feedback")
		// dispatch may return select_studio because synth doesn't
		// exist; that's a different sad path. The point is closed FB
		// doesn't drive the response.
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("sad: intent with sealed_at set returns sealed (no further work)", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-sealed-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		execFileSync("git", ["checkout", "-q", "-b", "haiku/x/main"], { cwd: root })
		const intentDir = join(root, ".haiku", "intents", "x")
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			fm(
				{
					title: "x",
					studio: "synth",
					mode: "continuous",
					plugin_version: "4.0.0",
					started_at: "2026-04-01T00:00:00Z",
					approvals: { spec: { at: "2026-05-01T00:00:00Z" } },
					sealed_at: "2026-05-05T00:00:00Z",
				},
				"# x\n",
			),
		)
		const r = dispatchOrchestratorAction("x", "")
		assert.equal(r.action, "sealed")
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("sad: empty .haiku/intents dir doesn't crash dispatch", () => {
	const root = mkdtempSync(join(tmpdir(), "sad-empty-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		gitInit(root)
		mkdirSync(join(root, ".haiku", "intents"), { recursive: true })
		// No specific intent slug — dispatch errors with not-found.
		const r = dispatchOrchestratorAction("missing", "")
		assert.equal(r.action, "error")
		assert.match(r.message, /not found/i)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})
