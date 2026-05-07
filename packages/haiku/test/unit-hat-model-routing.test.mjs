// unit-hat-model-routing.test.mjs — start_unit_hat dispatch picks up
// the model cascade per-unit so escalated units (post-reject bumped
// to opus) carry their tier without dragging the wave's siblings up.
//
// Pre-fix: start_unit_hat emitted no model annotation in v4. Even
// though haiku_unit_reject_hat correctly bumps the unit FM model
// field, the next bolt's dispatch ignored it — the agent inherited
// the parent's model.

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
import { initTestRepo, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

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

function readPromptBody(wrapper) {
	const m = wrapper.match(/"prompt_file":\s*"([^"]+)"/)
	if (!m) throw new Error("no prompt_file in dispatch wrapper")
	return readFileSync(m[1], "utf8")
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), `unit-mr-${slug}-`))
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

test("start_unit_hat falls back to studio default when units carry no per-unit model", async () => {
	if (!HAS_GIT) return
	await withRepo("uhmr-cascade", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "uhmr",
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
			studio: "uhmr",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		// Two units, neither with per-unit model — both inherit studio default.
		const unitsDir = join(intentDir, "stages", "design", "units")
		mkdirSync(unitsDir, { recursive: true })
		writeFileSync(
			join(unitsDir, "unit-01.md"),
			matter.stringify("body", { title: "u1" }),
		)
		writeFileSync(
			join(unitsDir, "unit-02.md"),
			matter.stringify("body", { title: "u2" }),
		)

		const { buildRunInstructions } = await import(`${SRC}/orchestrator.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const wrapper = buildRunInstructions(
			slug,
			"uhmr",
			{
				action: "start_unit_hat",
				intent: slug,
				stage: "design",
				hat: "builder",
				units: ["unit-01", "unit-02"],
				terminal: false,
			},
			"",
		)
		const prompt = readPromptBody(wrapper)
		// Both units annotated with the studio default (sonnet).
		assert.ok(
			/`unit-01`.*\(model: sonnet\)/.test(prompt),
			`expected unit-01 annotated as sonnet; got:\n${prompt.slice(0, 800)}`,
		)
		assert.ok(
			/`unit-02`.*\(model: sonnet\)/.test(prompt),
			`expected unit-02 annotated as sonnet; got:\n${prompt.slice(0, 800)}`,
		)
		assert.ok(
			/Per-unit model:/.test(prompt),
			`expected the dispatch instruction to call out per-unit model; got:\n${prompt.slice(0, 800)}`,
		)
	})
})

test("start_unit_hat picks up per-unit model overrides — escalated units stay escalated", async () => {
	if (!HAS_GIT) return
	await withRepo("uhmr-mixed", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "uhmr2",
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
			studio: "uhmr2",
			mode: "continuous",
			extraFm: { stages: ["design"] },
		})
		const unitsDir = join(intentDir, "stages", "design", "units")
		mkdirSync(unitsDir, { recursive: true })
		// unit-01 is at studio default; unit-02 was rejected once and
		// escalated to opus (model: opus + model_original: sonnet stamped
		// by haiku_unit_reject_hat).
		writeFileSync(
			join(unitsDir, "unit-01.md"),
			matter.stringify("body", { title: "u1" }),
		)
		writeFileSync(
			join(unitsDir, "unit-02.md"),
			matter.stringify("body", {
				title: "u2",
				model: "opus",
				model_original: "sonnet",
			}),
		)

		const { buildRunInstructions } = await import(`${SRC}/orchestrator.ts`)
		const { clearStudioCache } = await import(`${SRC}/studio-reader.ts`)
		clearStudioCache()
		const wrapper = buildRunInstructions(
			slug,
			"uhmr2",
			{
				action: "start_unit_hat",
				intent: slug,
				stage: "design",
				hat: "builder",
				units: ["unit-01", "unit-02"],
				terminal: false,
			},
			"",
		)
		const prompt = readPromptBody(wrapper)
		assert.ok(
			/`unit-01`.*\(model: sonnet\)/.test(prompt),
			`unit-01 should still be sonnet (studio default); got:\n${prompt.slice(0, 800)}`,
		)
		assert.ok(
			/`unit-02`.*\(model: opus\)/.test(prompt),
			`unit-02 should be opus (escalated); got:\n${prompt.slice(0, 800)}`,
		)
	})
})
