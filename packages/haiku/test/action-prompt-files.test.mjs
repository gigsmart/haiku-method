#!/usr/bin/env npx tsx
// Test suite for file-based action dispatch across the multi-line
// emitters migrated in Task A. Each emitter that previously inlined a
// long instructional `message` body now writes the prompt builder's
// rendered body to a tmpfile and stamps `prompt_file` on the action.
// The inline markdown body is replaced by a one-line "Read the file"
// pointer.
//
// These tests drive `buildRunInstructions` directly with synthesized
// action shapes — they bypass the workflow handlers (which have their
// own pre-conditions) and verify the orchestrator's centralized
// file-backed-action wrapping. The structured fields stay inline on
// the action; only the instructional body moves to disk.

import assert from "node:assert"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const _origCwdEarly = process.cwd()
process.env.CLAUDE_PLUGIN_ROOT = join(_origCwdEarly, "..", "..", "plugin")

const { buildRunInstructions } = await import("../src/orchestrator.ts")

const tmp = mkdtempSync(join(tmpdir(), "haiku-action-pf-test-"))

// Stub git so anything that shells out doesn't blow up.
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`

let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		const result = fn()
		if (result && typeof result.then === "function") await result
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (e.stack) console.log(e.stack)
	}
}

/** Set up a minimal project skeleton with a studio + stage + units dir.
 *  Most prompt builders read studio/stage definitions on disk; the bare
 *  minimum is a STAGE.md so `readStageDef` returns a body. */
function createProject(name, opts = {}) {
	const projDir = join(tmp, name)
	const slug = opts.slug || "test-intent"
	const studio = opts.studio || "test-studio"
	const stage = opts.stage || "build"
	const haikuRoot = join(projDir, ".haiku")
	const intentDirPath = join(haikuRoot, "intents", slug)

	mkdirSync(join(intentDirPath, "stages", stage, "units"), {
		recursive: true,
	})
	mkdirSync(join(intentDirPath, "stages", stage, "feedback"), {
		recursive: true,
	})
	mkdirSync(join(intentDirPath, "stages", stage, "artifacts"), {
		recursive: true,
	})
	writeFileSync(
		join(intentDirPath, "intent.md"),
		`---
title: Test Intent
studio: ${studio}
mode: continuous
active_stage: ${stage}
status: active
intent_reviewed: true
started_at: 2026-04-29T00:00:00Z
completed_at: null
---

Test intent body.
`,
	)

	const studioDir = join(haikuRoot, "studios", studio)
	mkdirSync(studioDir, { recursive: true })
	writeFileSync(
		join(studioDir, "STUDIO.md"),
		`---
name: ${studio}
description: Test studio
stages: [${stage}]
---

Test studio.
`,
	)
	const stageDir = join(studioDir, "stages", stage)
	mkdirSync(stageDir, { recursive: true })
	writeFileSync(
		join(stageDir, "STAGE.md"),
		`---
name: ${stage}
description: ${stage} stage
hats: [coder]
fix_hats: [coder, feedback-assessor]
review: auto
elaboration: autonomous
---

${stage} body.
`,
	)
	mkdirSync(join(stageDir, "hats"), { recursive: true })
	writeFileSync(
		join(stageDir, "hats", "coder.md"),
		`---
name: coder
---

Coder hat mandate.
`,
	)
	writeFileSync(
		join(stageDir, "hats", "feedback-assessor.md"),
		`---
name: feedback-assessor
---

Assessor mandate.
`,
	)

	return { projDir, intentDirPath, slug, studio, stage }
}

/** Assert the basic file-backed shape: action carries `prompt_file`,
 *  message is short, file exists and has substantial content, the
 *  rendered markdown body references the path. */
function assertFileBacked(action, rendered) {
	assert.ok(
		typeof action.prompt_file === "string" && action.prompt_file.length > 0,
		`action.prompt_file should be set, got ${action.prompt_file}`,
	)
	assert.ok(
		existsSync(action.prompt_file),
		`prompt_file should exist on disk: ${action.prompt_file}`,
	)
	assert.ok(
		typeof action.message === "string",
		"action.message should be a string",
	)
	assert.ok(
		action.message.split("\n").length <= 2,
		`action.message should be ≤2 lines, got: ${JSON.stringify(action.message)}`,
	)
	assert.ok(
		action.message.includes(action.prompt_file),
		"action.message should reference the prompt_file path",
	)
	const body = readFileSync(action.prompt_file, "utf8")
	assert.ok(
		body.length > 100,
		`prompt_file body should be substantial, got ${body.length} chars`,
	)
	assert.ok(
		rendered.includes(action.prompt_file),
		"rendered markdown should reference the prompt_file path",
	)
}

try {
	console.log("\n=== action emitters: file-based dispatch ===")

	await test("pre_review action is file-backed with review-agent fan-out", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-pre-review")
		// Need a review-agent to make pre_review emit content
		const agentsDir = join(
			intentDirPath,
			"..",
			"..",
			"studios",
			studio,
			"stages",
			stage,
			"review-agents",
		)
		mkdirSync(agentsDir, { recursive: true })
		writeFileSync(
			join(agentsDir, "security.md"),
			`---
name: security
---

Security review mandate.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "pre_review",
			intent: slug,
			studio,
			stage,
			units_dir: `.haiku/intents/${slug}/stages/${stage}/units/`,
			message: "placeholder long message",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
		const body = readFileSync(action.prompt_file, "utf8")
		assert.ok(
			body.includes("Pre-Execute Adversarial Review"),
			"pre_review body should contain its section header",
		)
	})

	await test("review action is file-backed with adversarial review block", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-review")
		const agentsDir = join(
			intentDirPath,
			"..",
			"..",
			"studios",
			studio,
			"stages",
			stage,
			"review-agents",
		)
		mkdirSync(agentsDir, { recursive: true })
		writeFileSync(
			join(agentsDir, "correctness.md"),
			`---
name: correctness
---

Correctness review mandate.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "review",
			intent: slug,
			studio,
			stage,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
		const body = readFileSync(action.prompt_file, "utf8")
		assert.ok(
			body.includes("Adversarial Review"),
			"review body should contain Adversarial Review header",
		)
		assert.ok(
			body.includes("haiku_feedback"),
			"review body should reference haiku_feedback",
		)
	})

	await test("review_fix action is file-backed with per-FB chain blocks", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-review-fix")
		writeFileSync(
			join(intentDirPath, "stages", stage, "feedback", "FB-01.md"),
			`---
id: FB-01
title: test finding
status: pending
origin: adversarial-review
author: tester
---

Finding body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "review_fix",
			intent: slug,
			studio,
			stage,
			fix_hats: ["coder", "feedback-assessor"],
			max_bolts: 3,
			items: [
				{
					feedback_id: "FB-01",
					feedback_file: `intents/${slug}/stages/${stage}/feedback/FB-01.md`,
					feedback_title: "test finding",
					bolt: 1,
				},
			],
			total_pending: 1,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
		const body = readFileSync(action.prompt_file, "utf8")
		assert.ok(
			body.includes("Fix Loop"),
			"review_fix body should contain Fix Loop",
		)
		assert.ok(
			body.includes("FB-01"),
			"review_fix body should mention the finding ID",
		)
	})

	await test("gate_review action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-gate-review")
		process.chdir(projDir)
		const action = {
			action: "gate_review",
			intent: slug,
			studio,
			stage,
			next_phase: "execute",
			gate_type: "ask",
			gate_context: "elaborate_to_execute",
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		// gate_review body is short — file-backed only when builder
		// returns a non-trivial body. The infrastructure should still
		// stamp it.
		assert.ok(
			action.prompt_file && existsSync(action.prompt_file),
			"gate_review should be file-backed when its builder returns a body",
		)
		assert.ok(
			rendered.includes(action.prompt_file),
			"gate_review rendered markdown should reference the prompt_file",
		)
	})

	await test("intent_completion_review action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } = createProject(
			"pf-icr",
			{ stage: "build" },
		)
		// Studio-level review agents
		const studioReviewDir = join(
			intentDirPath,
			"..",
			"..",
			"studios",
			studio,
			"review-agents",
		)
		mkdirSync(studioReviewDir, { recursive: true })
		writeFileSync(
			join(studioReviewDir, "intent-quality.md"),
			`---
name: intent-quality
---

Intent quality mandate.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "intent_completion_review",
			intent: slug,
			studio,
			stage,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
		const body = readFileSync(action.prompt_file, "utf8")
		assert.ok(
			body.length > 200,
			"intent_completion_review body should be substantial",
		)
	})

	await test("intent_completion_fix action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio } = createProject("pf-icf", {
			stage: "build",
		})
		const studioFixHatsDir = join(
			intentDirPath,
			"..",
			"..",
			"studios",
			studio,
			"fix-hats",
		)
		mkdirSync(studioFixHatsDir, { recursive: true })
		writeFileSync(
			join(studioFixHatsDir, "fixer.md"),
			`---
name: fixer
---

Fixer mandate.
`,
		)
		mkdirSync(join(intentDirPath, "feedback"), { recursive: true })
		writeFileSync(
			join(intentDirPath, "feedback", "FB-01.md"),
			`---
id: FB-01
title: intent finding
status: pending
origin: studio-review
author: tester
---

Finding body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "intent_completion_fix",
			intent: slug,
			studio,
			fix_hats: ["fixer"],
			max_bolts: 3,
			items: [
				{
					feedback_id: "FB-01",
					feedback_file: `intents/${slug}/feedback/FB-01.md`,
					feedback_title: "intent finding",
					bolt: 1,
				},
			],
			total_pending: 1,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
		const body = readFileSync(action.prompt_file, "utf8")
		assert.ok(
			body.includes("FB-01"),
			"intent_completion_fix body should mention the finding ID",
		)
	})

	await test("feedback_dispatch action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-fb-dispatch")
		writeFileSync(
			join(intentDirPath, "stages", stage, "feedback", "FB-01.md"),
			`---
id: FB-01
title: question
status: pending
origin: user-chat
author: user
resolution: question
---

What about edge case X?
`,
		)
		process.chdir(projDir)
		// feedback_dispatch's prompt-builder body is short — its real
		// instructional payload lives in `action.message`, which the
		// orchestrator already builds substantively. We test the wrap by
		// providing a long message so the rendered body crosses the
		// threshold the centralized wrap looks for.
		const longMessage = [
			"## Feedback dispatch (per-item playbook)",
			"",
			"For each item below, follow the per-resolution playbook:",
			"",
			"- needs_triage → classify with haiku_feedback_move or reject",
			"- question → answer inline",
			"- inline_fix → edit the artifact in place",
			"",
			"Read every feedback file in full — the title is only a handle.",
		].join("\n")
		const action = {
			action: "feedback_dispatch",
			intent: slug,
			studio,
			stage,
			counts: { needs_triage: 0, questions: 1, inline_fixes: 0 },
			items: [
				{
					feedback_id: "FB-01",
					feedback_file: `intents/${slug}/stages/${stage}/feedback/FB-01.md`,
					feedback_title: "question",
					resolution: "question",
				},
			],
			message: longMessage,
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("feedback_triage action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-fb-triage")
		writeFileSync(
			join(intentDirPath, "stages", stage, "feedback", "FB-01.md"),
			`---
id: FB-01
title: untriaged finding
status: pending
origin: user-chat
author: user
---

Body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "feedback_triage",
			intent: slug,
			studio,
			stage,
			items: [
				{
					feedback_id: "FB-01",
					stage,
					feedback_file: `intents/${slug}/stages/${stage}/feedback/FB-01.md`,
					feedback_title: "untriaged finding",
					origin: "user-chat",
					author: "user",
				},
			],
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("start_units action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-start-units")
		writeFileSync(
			join(intentDirPath, "stages", stage, "units", "unit-01-foo.md"),
			`---
title: foo
status: pending
hat: coder
hats: [coder]
inputs: [intent.md]
---

Unit body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "start_units",
			intent: slug,
			studio,
			stage,
			units: ["unit-01-foo"],
			hats: ["coder"],
			first_hat: "coder",
			wave: 1,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("continue_units action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-cont-units")
		writeFileSync(
			join(intentDirPath, "stages", stage, "units", "unit-01-foo.md"),
			`---
title: foo
status: in_progress
hat: coder
hats: [coder]
current_hat: coder
bolt: 2
inputs: [intent.md]
---

Unit body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "continue_units",
			intent: slug,
			studio,
			stage,
			units: [
				{
					name: "unit-01-foo",
					hat: "coder",
					bolt: 2,
					worktree: null,
				},
			],
			hats: ["coder"],
			wave: 1,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("start_unit action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-start-unit")
		writeFileSync(
			join(intentDirPath, "stages", stage, "units", "unit-01-foo.md"),
			`---
title: foo
status: pending
hat: coder
hats: [coder]
inputs: [intent.md]
---

Unit body.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "start_unit",
			intent: slug,
			studio,
			stage,
			unit: "unit-01-foo",
			unit_file: `intents/${slug}/stages/${stage}/units/unit-01-foo.md`,
			title: "foo",
			hat: "coder",
			hats: ["coder"],
			bolt: 1,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("integrate_fix_chains action is file-backed", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-integrate")
		process.chdir(projDir)
		const action = {
			action: "integrate_fix_chains",
			intent: slug,
			studio,
			stage,
			scope: stage,
			max_attempts: 3,
			items: [
				{
					feedback_id: "FB-01",
					feedback_title: "test finding",
					feedback_file: `intents/${slug}/stages/${stage}/feedback/FB-01.md`,
					worktree: "/tmp/wt-FB-01",
					branch: "fix/FB-01",
					conflict_files: ["foo.md"],
					attempt: 1,
				},
			],
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assertFileBacked(action, rendered)
	})

	await test("non-migrated actions still inline their body (advance_phase)", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-no-migrate")
		process.chdir(projDir)
		const action = {
			action: "advance_phase",
			intent: slug,
			studio,
			stage,
			from_phase: "elaborate",
			to_phase: "execute",
			message: "Auto-gate: specs validated — advancing to execution.",
		}
		const _rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		assert.strictEqual(
			action.prompt_file,
			undefined,
			"advance_phase should NOT be file-backed — it's a terse status action",
		)
	})

	await test("file-backed action JSON in rendered output carries prompt_file", () => {
		const { projDir, intentDirPath, slug, studio, stage } =
			createProject("pf-json-shape")
		const agentsDir = join(
			intentDirPath,
			"..",
			"..",
			"studios",
			studio,
			"stages",
			stage,
			"review-agents",
		)
		mkdirSync(agentsDir, { recursive: true })
		writeFileSync(
			join(agentsDir, "correctness.md"),
			`---
name: correctness
---

Mandate.
`,
		)
		process.chdir(projDir)
		const action = {
			action: "review",
			intent: slug,
			studio,
			stage,
			message: "placeholder",
		}
		const rendered = buildRunInstructions(slug, studio, action, intentDirPath)
		// The first ```json block should contain the action with prompt_file.
		const m = rendered.match(/```json\n([\s\S]+?)\n```/)
		assert.ok(
			m,
			"rendered output should contain a JSON code block for the action",
		)
		const parsed = JSON.parse(m[1])
		assert.strictEqual(parsed.action, "review")
		assert.ok(
			parsed.prompt_file,
			"rendered action JSON should include prompt_file",
		)
		assert.ok(
			existsSync(parsed.prompt_file),
			`prompt_file in rendered JSON should exist: ${parsed.prompt_file}`,
		)
	})

	console.log(`\n${passed} passed, ${failed} failed`)
	process.chdir(_origCwdEarly)
	rmSync(tmp, { recursive: true, force: true })
	process.exit(failed > 0 ? 1 : 0)
} catch (e) {
	console.error(`\nFatal: ${e.message}`)
	console.error(e.stack)
	process.chdir(_origCwdEarly)
	rmSync(tmp, { recursive: true, force: true })
	process.exit(1)
}
