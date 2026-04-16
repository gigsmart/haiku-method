#!/usr/bin/env npx tsx
// Test suite for external review detection — checkExternalState and
// external_changes_requested orchestrator action
// Run: npx tsx test/external-review.test.mjs

import assert from "node:assert"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	checkExternalState,
	runNext,
} from "../src/orchestrator.ts"
import {
	parseFrontmatter,
	readJson,
	writeJson,
} from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-ext-review-test-"))
const origCwd = process.cwd()
const fakeBin = join(tmp, "fake-bin")
mkdirSync(fakeBin, { recursive: true })

// Default stub: git noop
writeFileSync(join(fakeBin, "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(fakeBin, "git"), 0o755)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const result = fn()
		if (result && typeof result.then === "function") {
			return result.then(
				() => {
					passed++
					console.log(`  \u2713 ${name}`)
				},
				(e) => {
					failed++
					console.log(`  \u2717 ${name}: ${e.message}`)
				},
			)
		}
		passed++
		console.log(`  \u2713 ${name}`)
	} catch (e) {
		failed++
		console.log(`  \u2717 ${name}: ${e.message}`)
	}
}

// Helper: stub a CLI tool in fake-bin
function stubCli(name, script) {
	const path = join(fakeBin, name)
	writeFileSync(path, `#!/bin/sh\n${script}\n`)
	chmodSync(path, 0o755)
}

// Helper: remove a CLI stub
function removeCli(name) {
	const path = join(fakeBin, name)
	if (existsSync(path)) rmSync(path)
}

// Helper: create a full project with .haiku, studio, stages
function createProject(name, opts = {}) {
	const projDir = join(tmp, name)
	const haikuRoot = join(projDir, ".haiku")
	const slug = opts.slug || "test-intent"
	const intentDirPath = join(haikuRoot, "intents", slug)
	const studio = opts.studio || "test-studio"
	const stages = opts.stages || ["plan", "build", "review"]

	mkdirSync(join(intentDirPath, "stages"), { recursive: true })
	writeFileSync(
		join(intentDirPath, "intent.md"),
		`---
title: ${opts.title || "Test Intent"}
studio: ${studio}
mode: ${opts.mode || "continuous"}
active_stage: ${opts.active_stage || ""}
status: ${opts.status || "active"}
intent_reviewed: ${opts.intent_reviewed !== undefined ? opts.intent_reviewed : true}
started_at: 2026-04-04T18:00:00Z
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
stages: [${stages.join(", ")}]
---

A test studio.
`,
	)

	for (const stage of stages) {
		const stageDir = join(studioDir, "stages", stage)
		mkdirSync(stageDir, { recursive: true })
		const stageOpts = opts.stageConfig?.[stage] || {}
		writeFileSync(
			join(stageDir, "STAGE.md"),
			`---
name: ${stage}
description: ${stage} stage
hats: [${(stageOpts.hats || ["worker"]).join(", ")}]
review: ${stageOpts.review || "auto"}
---

${stage} stage instructions.
`,
		)
	}

	return { projDir, haikuRoot, intentDirPath, slug, studio }
}

function createStageState(intentDirPath, stage, state) {
	const stageDir = join(intentDirPath, "stages", stage)
	mkdirSync(join(stageDir, "units"), { recursive: true })
	writeJson(join(stageDir, "state.json"), {
		stage,
		status: "active",
		phase: "elaborate",
		started_at: "2026-04-04T18:05:00Z",
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
		visits: 0,
		...state,
	})
}

try {
	// ── checkExternalState: GitHub PR ─────────────────────────────────────

	console.log("\n=== checkExternalState: GitHub PR ===")

	test("GitHub PR approved returns status approved", () => {
		stubCli("gh", 'echo \'["OPEN", "APPROVED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "approved")
		assert.strictEqual(result.provider, "github")
		assert.strictEqual(result.url, "https://github.com/org/repo/pull/42")
	})

	test("GitHub PR merged returns status approved", () => {
		stubCli("gh", 'echo \'["MERGED", ""]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "approved")
		assert.strictEqual(result.provider, "github")
	})

	test("GitHub PR CHANGES_REQUESTED returns status changes_requested", () => {
		stubCli("gh", 'echo \'["OPEN", "CHANGES_REQUESTED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "changes_requested")
		assert.strictEqual(result.provider, "github")
	})

	test("GitHub PR REVIEW_REQUIRED returns status pending", () => {
		stubCli("gh", 'echo \'["OPEN", "REVIEW_REQUIRED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "pending")
		assert.strictEqual(result.provider, "github")
	})

	test("GitHub PR empty reviewDecision returns status pending", () => {
		stubCli("gh", 'echo \'["OPEN", ""]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "pending")
	})

	// ── checkExternalState: GitLab MR ────────────────────────────────────

	console.log("\n=== checkExternalState: GitLab MR ===")

	test("GitLab MR approved returns status approved", () => {
		stubCli(
			"glab",
			'echo \'{"state": "opened", "approved": true}\'',
		)
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://gitlab.com/org/repo/-/merge_requests/7",
		)
		assert.strictEqual(result.status, "approved")
		assert.strictEqual(result.provider, "gitlab")
	})

	test("GitLab MR merged returns status approved", () => {
		stubCli(
			"glab",
			'echo \'{"state": "merged", "approved": false}\'',
		)
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://gitlab.com/org/repo/-/merge_requests/7",
		)
		assert.strictEqual(result.status, "approved")
		assert.strictEqual(result.provider, "gitlab")
	})

	test("GitLab MR non-approved open returns status changes_requested", () => {
		stubCli(
			"glab",
			'echo \'{"state": "opened", "approved": false}\'',
		)
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://gitlab.com/org/repo/-/merge_requests/7",
		)
		assert.strictEqual(result.status, "changes_requested")
		assert.strictEqual(result.provider, "gitlab")
	})

	test("GitLab MR closed returns status pending", () => {
		stubCli(
			"glab",
			'echo \'{"state": "closed", "approved": false}\'',
		)
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://gitlab.com/org/repo/-/merge_requests/7",
		)
		assert.strictEqual(result.status, "pending")
	})

	// ── checkExternalState: error handling ────────────────────────────────

	console.log("\n=== checkExternalState: error handling ===")

	test("gh CLI not available returns status unknown", () => {
		removeCli("gh")
		// Ensure fake-bin is first so the missing stub takes effect
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "unknown")
	})

	test("glab CLI not available returns status unknown", () => {
		removeCli("glab")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://gitlab.com/org/repo/-/merge_requests/7",
		)
		assert.strictEqual(result.status, "unknown")
	})

	test("unknown URL returns status unknown", () => {
		const result = checkExternalState(
			"https://unknown-vcs.example.com/review/123",
		)
		assert.strictEqual(result.status, "unknown")
		assert.strictEqual(result.provider, undefined)
	})

	test("gh CLI returning invalid JSON returns status unknown", () => {
		stubCli("gh", "echo 'not json at all'")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "unknown")
	})

	test("gh CLI returning non-zero exit returns status unknown", () => {
		stubCli("gh", "exit 1")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const result = checkExternalState(
			"https://github.com/org/repo/pull/42",
		)
		assert.strictEqual(result.status, "unknown")
	})

	// ── Orchestrator: external_changes_requested action ──────────────────

	console.log("\n=== Orchestrator: external_changes_requested ===")

	// Restore git stub for orchestrator tests
	stubCli("git", "exit 0")

	test("external changes_requested creates feedback and rolls back to elaborate", () => {
		// Stub gh to return CHANGES_REQUESTED
		stubCli("gh", 'echo \'["OPEN", "CHANGES_REQUESTED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-changes-requested",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		// Set up build stage as completed + blocked (waiting for external review)
		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
			visits: 0,
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "external_changes_requested")
		assert.strictEqual(result.stage, "build")
		assert.strictEqual(result.provider, "github")
		assert.ok(result.feedback_id, "should have a feedback_id")
		assert.ok(result.feedback_file, "should have a feedback_file path")
		assert.strictEqual(result.visits, 1)
		assert.ok(
			result.message.includes("requested changes"),
			`message should mention requested changes, got: ${result.message}`,
		)

		// Verify feedback file was created
		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		assert.ok(
			existsSync(fbDir),
			"feedback directory should exist",
		)
		const fbFiles = readdirSync(fbDir).filter((f) =>
			f.endsWith(".md"),
		)
		assert.strictEqual(fbFiles.length, 1, "should have 1 feedback file")

		// Verify feedback file content
		const fbContent = readFileSync(join(fbDir, fbFiles[0]), "utf8")
		const { data: fbData } = parseFrontmatter(fbContent)
		assert.strictEqual(fbData.status, "pending")
		assert.strictEqual(fbData.origin, "external-pr")
		assert.strictEqual(fbData.author, "user")
		assert.strictEqual(fbData.author_type, "human")
		assert.strictEqual(
			fbData.source_ref,
			"https://github.com/org/repo/pull/42",
		)

		// Verify state was rolled back
		const stateFile = join(
			intentDirPath,
			"stages",
			"build",
			"state.json",
		)
		const stateData = readJson(stateFile)
		assert.strictEqual(stateData.phase, "elaborate")
		assert.strictEqual(stateData.status, "active")
		assert.strictEqual(stateData.visits, 1)
		assert.strictEqual(stateData.gate_outcome, null)
	})

	test("external approved proceeds normally — no feedback created", () => {
		// Stub gh to return APPROVED
		stubCli("gh", 'echo \'["OPEN", "APPROVED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-approved",
			{
				active_stage: "build",
				stages: ["plan", "build"],
			},
		)

		// Plan completed
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		// Build completed + blocked
		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		// Should advance (intent complete since build is last stage)
		assert.strictEqual(result.action, "intent_complete")

		// No feedback directory
		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		assert.ok(
			!existsSync(fbDir) ||
				readdirSync(fbDir).filter((f) => f.endsWith(".md")).length === 0,
			"no feedback file should be created for approved PRs",
		)
	})

	test("external pending returns awaiting_external_review — no feedback", () => {
		// Stub gh to return REVIEW_REQUIRED (pending)
		stubCli("gh", 'echo \'["OPEN", "REVIEW_REQUIRED"]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-pending",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "awaiting_external_review")

		// No feedback
		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		assert.ok(
			!existsSync(fbDir) ||
				readdirSync(fbDir).filter((f) => f.endsWith(".md")).length === 0,
			"no feedback file for pending review",
		)
	})

	test("external unknown status returns awaiting_external_review", () => {
		// gh CLI fails
		stubCli("gh", "exit 1")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-unknown",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "awaiting_external_review")
	})

	test("no external URL falls through to gate review UI", () => {
		const { projDir, intentDirPath, slug } = createProject(
			"ext-no-url",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			// No external_review_url
		})

		process.chdir(projDir)
		const result = runNext(slug)

		// Without a URL, the code falls through to the gate review UI
		assert.strictEqual(result.action, "gate_review")
	})

	test("GitLab MR changes_requested creates feedback with external-mr origin", () => {
		stubCli(
			"glab",
			'echo \'{"state": "opened", "approved": false}\'',
		)
		// Restore git stub
		stubCli("git", "exit 0")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-gitlab-changes",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url:
				"https://gitlab.com/org/repo/-/merge_requests/7",
			visits: 0,
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "external_changes_requested")
		assert.strictEqual(result.provider, "gitlab")

		// Verify feedback file has external-mr origin
		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		const fbFiles = readdirSync(fbDir).filter((f) =>
			f.endsWith(".md"),
		)
		assert.strictEqual(fbFiles.length, 1)
		const { data } = parseFrontmatter(
			readFileSync(join(fbDir, fbFiles[0]), "utf8"),
		)
		assert.strictEqual(data.origin, "external-mr")
		assert.strictEqual(data.author_type, "human")
	})

	test("multiple external review rounds create sequential feedback files", () => {
		stubCli("gh", 'echo \'["OPEN", "CHANGES_REQUESTED"]\'')
		stubCli("git", "exit 0")
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-multi-round",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		// First round: build is blocked
		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
			visits: 0,
		})

		process.chdir(projDir)
		const result1 = runNext(slug)
		assert.strictEqual(result1.action, "external_changes_requested")
		assert.strictEqual(result1.visits, 1)

		// Simulate: agent addressed feedback, pushed fixes, resubmitted,
		// reviewer requested changes again. Mark prior feedback as addressed
		// (otherwise the pending feedback check blocks before external review),
		// then reset state to blocked.
		const fbDirRound1 = join(intentDirPath, "stages", "build", "feedback")
		for (const f of readdirSync(fbDirRound1).filter((f) => f.endsWith(".md"))) {
			const filePath = join(fbDirRound1, f)
			let content = readFileSync(filePath, "utf8")
			content = content.replace("status: pending", "status: addressed")
			writeFileSync(filePath, content)
		}

		const stateFile = join(
			intentDirPath,
			"stages",
			"build",
			"state.json",
		)
		const stateData = readJson(stateFile)
		stateData.status = "completed"
		stateData.phase = "gate"
		stateData.gate_outcome = "blocked"
		writeJson(stateFile, stateData)

		const result2 = runNext(slug)
		assert.strictEqual(result2.action, "external_changes_requested")
		assert.strictEqual(result2.visits, 2)

		// Verify two feedback files exist
		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		const fbFiles = readdirSync(fbDir)
			.filter((f) => f.endsWith(".md"))
			.sort()
		assert.strictEqual(
			fbFiles.length,
			2,
			`expected 2 feedback files, got ${fbFiles.length}: ${fbFiles.join(", ")}`,
		)
		assert.ok(fbFiles[0].startsWith("01-"))
		assert.ok(fbFiles[1].startsWith("02-"))
	})

	test("COMMENTED state returns pending — no feedback created", () => {
		// COMMENTED is not actionable
		stubCli("gh", 'echo \'["OPEN", ""]\'')
		process.env.PATH = `${fakeBin}:${process.env.PATH}`

		const { projDir, intentDirPath, slug } = createProject(
			"ext-commented",
			{
				active_stage: "build",
				stageConfig: { build: { review: "external" } },
			},
		)

		// Prior stage must be completed to avoid consistency reset
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			status: "completed",
			gate_outcome: "advanced",
		})

		createStageState(intentDirPath, "build", {
			phase: "gate",
			status: "completed",
			gate_outcome: "blocked",
			external_review_url: "https://github.com/org/repo/pull/42",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "awaiting_external_review")

		const fbDir = join(
			intentDirPath,
			"stages",
			"build",
			"feedback",
		)
		assert.ok(
			!existsSync(fbDir) ||
				readdirSync(fbDir).filter((f) => f.endsWith(".md")).length === 0,
			"COMMENTED state should not create feedback",
		)
	})

	// ── Cleanup ───────────────────────────────────────────────────────────

	console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}
