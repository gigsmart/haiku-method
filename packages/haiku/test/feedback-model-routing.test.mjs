// feedback-model-routing.test.mjs — feedback-hat dispatch follows the
// same model cascade as unit-hat dispatch (feedback > hat > stage >
// studio), and feedback-hat REJECT escalates the model tier the same
// way unit-hat reject does.
//
// Pre-fix: every fix-hat subagent inherited the parent's model
// (typically Opus). The overtime-ac session debug showed this cost
// ~$200 per stage with 4 rounds of AC iteration — Sonnet would have
// done the mechanical edits at 5x cheaper output.
//
// Post-fix:
//   - The studio's `default_model: sonnet` flows to fix-hat dispatches
//     via the cascade.
//   - Per-FB / per-hat overrides escalate when needed.
//   - On hat reject, the FB FM gets `model` bumped to the next tier
//     (haiku→sonnet→opus), so the next bolt's dispatch picks up the
//     escalated value.

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

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

/** buildRunInstructions writes the prompt body to a tmpfile and the
 *  returned wrapper just points at it. Pull the file path out and
 *  read the real prompt for assertions. */
function readPromptBody(wrapper) {
	const m = wrapper.match(/"prompt_file":\s*"([^"]+)"/)
	if (!m) throw new Error("no prompt_file in dispatch wrapper")
	return readFileSync(m[1], "utf8")
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `fb-mr-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

test("start_feedback_hat dispatch resolves model from studio default and emits it in the prompt", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-mr-cascade", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "fbm",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "fbm",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		makeFeedback({
			intentDir,
			stage: "design",
			id: "FB-001",
			title: "fix typo",
			body: "Mechanical text edit",
			origin: "user-chat",
			author: "user",
		})

		const { buildRunInstructions } = await import(`${SRC}/orchestrator.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const wrapper = buildRunInstructions(
			slug,
			"fbm",
			{
				action: "start_feedback_hat",
				intent: slug,
				stage: "design",
				hat: "builder",
				feedback_ids: ["FB-001"],
				terminal: false,
			},
			"",
		)
		const prompt = readPromptBody(wrapper)
		assert.ok(
			/model: "sonnet"/.test(prompt),
			`expected the prompt to instruct \`model: "sonnet"\` from the studio default; got:\n${prompt.slice(0, 800)}`,
		)
		assert.ok(
			/source: studio/.test(prompt),
			`expected source: studio in the model annotation; got:\n${prompt.slice(0, 800)}`,
		)
	})
})

test("start_feedback_hat picks up FB-level model override at the top of the cascade", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-mr-fbm", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "fbm2",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "fbm2",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		// Author the FB with an explicit `model: opus` override —
		// simulates either an agent-side decision (this fix needs a
		// stronger model) or a post-reject escalation.
		const fbDir = join(intentDir, "stages", "design", "feedback")
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "001-needs-opus.md"),
			matter.stringify("body", {
				title: "needs opus",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				created_at: "2026-05-07T00:00:00Z",
				source_ref: null,
				model: "opus",
				targets: { unit: null, invalidates: [] },
				iterations: [],
				closed_at: null,
			}),
		)

		const { buildRunInstructions } = await import(`${SRC}/orchestrator.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const wrapper = buildRunInstructions(
			slug,
			"fbm2",
			{
				action: "start_feedback_hat",
				intent: slug,
				stage: "design",
				hat: "builder",
				feedback_ids: ["FB-001"],
				terminal: false,
			},
			"",
		)
		const prompt = readPromptBody(wrapper)
		assert.ok(
			/model: "opus"/.test(prompt),
			`expected the prompt to instruct \`model: "opus"\` from FB-level override; got:\n${prompt.slice(0, 800)}`,
		)
		assert.ok(
			/source: unit/.test(prompt),
			`expected source: unit (the FB-level slot of the cascade); got:\n${prompt.slice(0, 800)}`,
		)
	})
})

test("haiku_feedback_reject_hat escalates the FB model tier on rejection (sonnet → opus)", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-mr-escalate", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "fbm3",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "fbm3",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		// Author an FB at sonnet, with one in-flight iteration so
		// reject_hat sees a "calling hat" to reject.
		const fbDir = join(intentDir, "stages", "design", "feedback")
		mkdirSync(fbDir, { recursive: true })
		const fbPath = join(fbDir, "001-fix-typo.md")
		writeFileSync(
			fbPath,
			matter.stringify("body", {
				title: "fix typo",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				created_at: "2026-05-07T00:00:00Z",
				source_ref: null,
				model: "sonnet",
				targets: { unit: null, invalidates: [] },
				// Storage `hat` is "" (no prior hat completed); calling
				// hat is the first fix_hat (builder).
				hat: "",
				bolt: 1,
				iterations: [],
				closed_at: null,
			}),
		)

		const { handleStateTool } = await import(`${SRC}/state-tools.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const result = handleStateTool("haiku_feedback_reject_hat", {
			intent: slug,
			stage: "design",
			feedback_id: 1,
			reason: "needs more context — escalating",
		})
		assert.ok(
			!result.isError,
			`reject_hat failed: ${JSON.stringify(result, null, 2)}`,
		)

		const after = matter(readFileSync(fbPath, "utf8")).data
		assert.equal(
			after.model,
			"opus",
			`expected model escalated to opus after sonnet reject; got ${after.model}`,
		)
		assert.equal(
			after.model_original,
			"sonnet",
			`expected model_original=sonnet preserved; got ${after.model_original}`,
		)
		assert.equal(
			after.bolt,
			2,
			`expected bolt incremented to 2; got ${after.bolt}`,
		)
	})
})

test("haiku_feedback_reject_hat does NOT escalate when already at opus (top tier)", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-mr-no-escalate", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "fbm4",
			stages: [
				{
					name: "design",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "fbm4",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		const fbDir = join(intentDir, "stages", "design", "feedback")
		mkdirSync(fbDir, { recursive: true })
		const fbPath = join(fbDir, "001-fix-typo.md")
		writeFileSync(
			fbPath,
			matter.stringify("body", {
				title: "fix typo",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				created_at: "2026-05-07T00:00:00Z",
				source_ref: null,
				model: "opus",
				targets: { unit: null, invalidates: [] },
				hat: "",
				bolt: 1,
				iterations: [],
				closed_at: null,
			}),
		)

		const { handleStateTool } = await import(`${SRC}/state-tools.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const result = handleStateTool("haiku_feedback_reject_hat", {
			intent: slug,
			stage: "design",
			feedback_id: 1,
			reason: "still stuck",
		})
		assert.ok(!result.isError)

		const after = matter(readFileSync(fbPath, "utf8")).data
		assert.equal(
			after.model,
			"opus",
			`expected model unchanged (already at top tier); got ${after.model}`,
		)
		assert.equal(
			after.model_original,
			undefined,
			`expected model_original NOT set when no escalation occurred; got ${after.model_original}`,
		)
	})
})
