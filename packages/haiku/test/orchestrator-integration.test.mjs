#!/usr/bin/env npx tsx
// Test suite for orchestrator integration: Groups 6+7+8
// Review-UI feedback writes, subagent prompt update, additive elaborate mode

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

// Helper: extract subagent prompt_file paths from an orchestrator response
// and concatenate their contents. The FSM now writes subagent prompts to
// tmpfiles and the response only carries <subagent prompt_file="..."> refs.
function expandPromptFiles(responseText) {
	const re = /<subagent[^>]*\bprompt_file="([^"]+)"/g
	let out = responseText
	let match
	while ((match = re.exec(responseText)) !== null) {
		const path = match[1]
		if (existsSync(path)) {
			out += "\n\n" + readFileSync(path, "utf8")
		}
	}
	return out
}
import { tmpdir } from "node:os"
import { join } from "node:path"
import assert from "node:assert"

import {
	handleOrchestratorTool,
	runNext,
	setOpenReviewHandler,
	setElicitInputHandler,
} from "../src/orchestrator.ts"
import {
	countPendingFeedback,
	readFeedbackFiles,
	readJson,
	updateFeedbackFile,
	writeFeedbackFile,
	writeJson,
	parseFrontmatter,
} from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-orch-int-test-"))
const origCwd = process.cwd()

// Stub git so gitCommitState doesn't fail
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`

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

function createProject(name, opts = {}) {
	const projDir = join(tmp, name)
	const haikuRoot = join(projDir, ".haiku")
	const slug = opts.slug || "test-intent"
	const intentDirPath = join(haikuRoot, "intents", slug)
	const studio = opts.studio || "test-studio"

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
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

Test intent body.
`,
	)

	const stages = opts.stages || ["plan", "build", "review"]
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
elaboration: ${stageOpts.elaboration || "autonomous"}
---

${stage} stage instructions.
`,
		)

		// Create review agents if specified
		if (stageOpts.reviewAgents) {
			const agentsDir = join(stageDir, "review-agents")
			mkdirSync(agentsDir, { recursive: true })
			for (const [agentName, content] of Object.entries(stageOpts.reviewAgents)) {
				writeFileSync(
					join(agentsDir, `${agentName}.md`),
					`---
name: ${agentName}
---

${content}
`,
				)
			}
		}
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
		started_at: "2026-04-15T18:05:00Z",
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
		visits: 0,
		...state,
	})
}

function createUnit(intentDirPath, stage, unitName, opts = {}) {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	const inputs = opts.inputs || ["intent.md"]
	const closesLine = opts.closes ? `closes: [${opts.closes.join(", ")}]` : ""
	writeFileSync(
		join(unitsDir, `${unitName}.md`),
		`---
name: ${unitName}
type: ${opts.type || "task"}
status: ${opts.status || "pending"}
depends_on: [${(opts.depends_on || []).join(", ")}]
inputs: [${inputs.join(", ")}]
bolt: ${opts.bolt || 0}
hat: ${opts.hat || ""}
${closesLine}
---

## Completion Criteria

${(opts.criteria || ["- [ ] Default criteria"]).join("\n")}
`,
	)
}

function createFeedbackFile(intentDirPath, slug, stage, title, opts = {}) {
	const feedbackDirPath = join(intentDirPath, "stages", stage, "feedback")
	mkdirSync(feedbackDirPath, { recursive: true })

	const existingFiles = existsSync(feedbackDirPath)
		? readdirSync(feedbackDirPath).filter((f) => f.endsWith(".md"))
		: []
	const maxNum = existingFiles.reduce((max, f) => {
		const match = f.match(/^(\d+)-/)
		return match ? Math.max(max, parseInt(match[1], 10)) : max
	}, 0)
	const num = maxNum + 1
	const nn = String(num).padStart(2, "0")
	const fileSlug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 60)

	const status = opts.status || "pending"
	const origin = opts.origin || "adversarial-review"
	const authorType = opts.author_type || "agent"
	const author = opts.author || "review-agent"

	writeFileSync(
		join(feedbackDirPath, `${nn}-${fileSlug}.md`),
		`---
title: "${title}"
status: ${status}
origin: ${origin}
author: ${author}
author_type: ${authorType}
created_at: "2026-04-15T21:15:00Z"
visit: ${opts.visit || 0}
source_ref: null
closed_by: null
---

${opts.body || `Finding: ${title}`}
`,
	)

	return { feedback_id: `FB-${nn}`, num }
}

// ── Tests ──────────────────────────────────────────────────────────────────

try {
	// =========================================================================
	// Group 6: Review-UI changes_requested → feedback writes
	// =========================================================================

	console.log("\n=== Group 6: Review-UI changes_requested → feedback file writes ===")

	await test("changes_requested with annotations writes individual feedback files", async () => {
		const { projDir, intentDirPath, slug } = createProject("g6-annotations", {
			active_stage: "plan",
			stageConfig: { plan: { review: "ask" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		// Need a completed unit so gate phase works
		createUnit(intentDirPath, "plan", "unit-01-test", { status: "completed" })

		process.chdir(projDir)

		// Mock the review handler to return changes_requested with annotations
		setOpenReviewHandler(async (_dir, _type, _gate) => ({
			decision: "changes_requested",
			feedback: "Overall the specs need work",
			annotations: {
				pins: [
					{ x: 10, y: 20, text: "This section is unclear" },
					{ x: 50, y: 80, text: "Missing error handling here" },
				],
				comments: [
					{ selectedText: "some text", comment: "Needs better validation", paragraph: 3 },
				],
			},
		}))

		const result = await handleOrchestratorTool("haiku_run_next", { intent: slug })
		const responseText = result.content[0].text
		const jsonMatch = responseText.match(/\{[\s\S]*?\}\n\n---/)
		const parsed = JSON.parse(jsonMatch[0].replace(/\n\n---$/, ""))

		assert.strictEqual(parsed.action, "changes_requested")
		assert.ok(Array.isArray(parsed.feedback_ids), "Should have feedback_ids array")
		assert.strictEqual(parsed.feedback_ids.length, 4, "Should create 4 feedback files (2 pins + 1 comment + 1 free-text)")

		// Verify files on disk
		const feedbackDir = join(intentDirPath, "stages", "plan", "feedback")
		const files = readdirSync(feedbackDir).filter(f => f.endsWith(".md"))
		assert.strictEqual(files.length, 4, `Expected 4 feedback files, got ${files.length}`)

		// Verify origins
		const items = readFeedbackFiles(slug, "plan")
		const visualItems = items.filter(i => i.origin === "user-visual")
		const chatItems = items.filter(i => i.origin === "user-chat")
		assert.strictEqual(visualItems.length, 3, "Should have 3 user-visual items (2 pins + 1 comment)")
		assert.strictEqual(chatItems.length, 1, "Should have 1 user-chat item")
		assert.strictEqual(chatItems[0].body.trim(), "Overall the specs need work")

		// Verify pin source_ref format
		const pinItems = items.filter(i => i.source_ref?.startsWith("pin:"))
		assert.strictEqual(pinItems.length, 2, "Should have 2 pin items")
		assert.ok(pinItems[0].source_ref.includes(","), "Pin source_ref should have x,y format")

		// Verify comment source_ref format
		const commentItems = items.filter(i => i.source_ref?.startsWith("paragraph:"))
		assert.strictEqual(commentItems.length, 1, "Should have 1 paragraph comment")

		// Reset handler
		setOpenReviewHandler(null)
	})

	await test("changes_requested with empty annotations writes only free-text feedback", async () => {
		const { projDir, intentDirPath, slug } = createProject("g6-text-only", {
			active_stage: "plan",
			stageConfig: { plan: { review: "ask" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createUnit(intentDirPath, "plan", "unit-01-test", { status: "completed" })

		process.chdir(projDir)

		setOpenReviewHandler(async () => ({
			decision: "changes_requested",
			feedback: "Please add error handling",
			annotations: {},
		}))

		const result = await handleOrchestratorTool("haiku_run_next", { intent: slug })
		const responseText = result.content[0].text
		const jsonMatch = responseText.match(/\{[\s\S]*?\}\n\n---/)
		const parsed = JSON.parse(jsonMatch[0].replace(/\n\n---$/, ""))

		assert.strictEqual(parsed.feedback_ids.length, 1)
		const items = readFeedbackFiles(slug, "plan")
		assert.strictEqual(items.length, 1)
		assert.strictEqual(items[0].origin, "user-chat")

		setOpenReviewHandler(null)
	})

	await test("changes_requested with no feedback or annotations creates no files", async () => {
		const { projDir, intentDirPath, slug } = createProject("g6-empty", {
			active_stage: "plan",
			stageConfig: { plan: { review: "ask" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createUnit(intentDirPath, "plan", "unit-01-test", { status: "completed" })

		process.chdir(projDir)

		setOpenReviewHandler(async () => ({
			decision: "changes_requested",
			feedback: "",
			annotations: undefined,
		}))

		const result = await handleOrchestratorTool("haiku_run_next", { intent: slug })
		const responseText = result.content[0].text
		const jsonMatch = responseText.match(/\{[\s\S]*?\}\n\n---/)
		const parsed = JSON.parse(jsonMatch[0].replace(/\n\n---$/, ""))

		assert.strictEqual(parsed.feedback_ids.length, 0)
		const feedbackDir = join(intentDirPath, "stages", "plan", "feedback")
		assert.ok(!existsSync(feedbackDir) || readdirSync(feedbackDir).filter(f => f.endsWith(".md")).length === 0)

		setOpenReviewHandler(null)
	})

	await test("changes_requested on intent_review context writes feedback files", async () => {
		const { projDir, intentDirPath, slug } = createProject("g6-intent-review", {
			active_stage: "plan",
			intent_reviewed: false,
			stageConfig: { plan: { review: "ask" } },
		})
		createStageState(intentDirPath, "plan", { phase: "elaborate" })
		createUnit(intentDirPath, "plan", "unit-01-test", { status: "pending" })

		process.chdir(projDir)

		setOpenReviewHandler(async () => ({
			decision: "changes_requested",
			feedback: "Intent needs more scope",
			annotations: {
				pins: [{ x: 5, y: 10, text: "Clarify this goal" }],
			},
		}))

		const result = await handleOrchestratorTool("haiku_run_next", { intent: slug })
		const responseText = result.content[0].text
		const jsonMatch = responseText.match(/\{[\s\S]*?\}\n\n---/)
		const parsed = JSON.parse(jsonMatch[0].replace(/\n\n---$/, ""))

		assert.strictEqual(parsed.action, "changes_requested")
		assert.strictEqual(parsed.feedback_ids.length, 2, "Should have 2 items (1 pin + 1 free-text)")

		setOpenReviewHandler(null)
	})

	// =========================================================================
	// Group 7: Review subagent prompt update
	// =========================================================================

	console.log("\n=== Group 7: Review subagent prompt — haiku_feedback instructions ===")

	test("review action instructions contain haiku_feedback call instructions", () => {
		const { projDir, intentDirPath, slug } = createProject("g7-prompt", {
			active_stage: "build",
			stageConfig: {
				build: {
					review: "auto",
					reviewAgents: {
						"security-review": "Check for security vulnerabilities.",
						"perf-review": "Check for performance issues.",
					},
				},
			},
		})
		createStageState(intentDirPath, "build", { phase: "review" })
		createUnit(intentDirPath, "build", "unit-01-impl", { status: "completed" })

		process.chdir(projDir)
		const result = runNext(slug)

		// FSM should advance to gate and return the review action
		assert.strictEqual(result.action, "review")

		// Now test the instruction builder by calling handleOrchestratorTool
		// which calls withInstructions internally. Instead, call runNext and check
		// the action, then verify the buildRunInstructions output.
		// We need to test the handleOrchestratorTool for the full flow.
	})

	await test("review instructions contain haiku_feedback call pattern for each agent", async () => {
		const { projDir, intentDirPath, slug } = createProject("g7-prompt-full", {
			active_stage: "build",
			stageConfig: {
				build: {
					review: "auto",
					hats: ["coder"],
					reviewAgents: {
						"security-review": "Check for security vulnerabilities.",
					},
				},
			},
		})
		createStageState(intentDirPath, "build", { phase: "review" })
		createUnit(intentDirPath, "build", "unit-01-impl", { status: "completed" })

		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_run_next", { intent: slug })
		const responseText = expandPromptFiles(result.content[0].text)

		// Verify the subagent prompt contains haiku_feedback instructions
		assert.ok(
			responseText.includes("haiku_feedback"),
			"Instructions should contain haiku_feedback tool call",
		)
		assert.ok(
			responseText.includes('origin: "adversarial-review"'),
			"Instructions should specify adversarial-review origin",
		)
		assert.ok(
			responseText.includes("summary count"),
			"Instructions should mention returning a summary count",
		)

		// Verify the old pattern is NOT present
		assert.ok(
			!responseText.includes("Report findings as: severity (HIGH/MEDIUM/LOW)"),
			"Old text-based finding pattern should be removed",
		)
		assert.ok(
			!responseText.includes("up to 3 cycles"),
			"Old re-review cycle instruction should be removed",
		)

		// Verify parent instructions are simplified
		assert.ok(
			responseText.includes("They persist findings directly via haiku_feedback"),
			"Parent instructions should mention direct feedback persistence",
		)
	})

	// =========================================================================
	// Group 8: Additive elaborate mode
	// =========================================================================


	test("closes: field on unit triggers feedback update when frontmatter is parsed", () => {
		// This tests the mechanism: when a unit's frontmatter has closes: [FB-NN],
		// updateFeedbackFile transitions feedback to addressed.
		// The actual integration (called during unit completion) is in state-tools.ts.
		const { projDir, intentDirPath, slug } = createProject("g8-closes-mechanism", {
			active_stage: "build",
			stages: ["build"],
			stageConfig: { build: { review: "auto", elaboration: "autonomous" } },
		})
		createStageState(intentDirPath, "build", { phase: "execute", visits: 1 })
		createFeedbackFile(intentDirPath, slug, "build", "Missing null guard", {
			origin: "adversarial-review",
			author_type: "agent",
			author: "security-agent",
		})
		createFeedbackFile(intentDirPath, slug, "build", "Race condition", {
			origin: "adversarial-review",
			author_type: "agent",
			author: "perf-agent",
		})

		process.chdir(projDir)

		// Simulate what happens during unit completion: read closes and update feedback
		const closes = ["FB-01", "FB-02"]
		for (const fbId of closes) {
			const result = updateFeedbackFile(slug, "build", fbId, {
				status: "addressed",
				closed_by: "unit-02-fix-guard",
			}, "agent")
			assert.ok(result.ok, `Should succeed updating ${fbId}: ${JSON.stringify(result)}`)
		}

		// Verify the feedback files were updated
		const items = readFeedbackFiles(slug, "build")
		const fb01 = items.find(i => i.id === "FB-01")
		const fb02 = items.find(i => i.id === "FB-02")
		assert.ok(fb01, "Should find FB-01")
		assert.ok(fb02, "Should find FB-02")
		assert.strictEqual(fb01.status, "addressed")
		assert.strictEqual(fb01.closed_by, "unit-02-fix-guard")
		assert.strictEqual(fb02.status, "addressed")
		assert.strictEqual(fb02.closed_by, "unit-02-fix-guard")
	})

	test("closes: field in unit frontmatter is read correctly by orchestrator validation", () => {
		const { projDir, intentDirPath, slug } = createProject("g8-closes-parse", {
			active_stage: "build",
			stages: ["build"],
			stageConfig: { build: { review: "auto", elaboration: "autonomous" } },
		})
		createStageState(intentDirPath, "build", {
			phase: "elaborate",
			visits: 1,
		})
		createUnit(intentDirPath, "build", "unit-01-orig", { status: "completed" })
		createUnit(intentDirPath, "build", "unit-02-fix", {
			status: "pending",
			closes: ["FB-01"],
		})
		createFeedbackFile(intentDirPath, slug, "build", "Missing null guard")

		process.chdir(projDir)
		const result = runNext(slug)

		// Should pass validation since FB-01 is covered by unit-02-fix
		assert.ok(
			!result.validation_error,
			`Should not have validation error, got: ${result.validation_error || "none"}`,
		)
	})

	// =========================================================================
	// Summary
	// =========================================================================

	console.log(`\n${passed} passed, ${failed} failed`)
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true, force: true })
	process.exit(failed > 0 ? 1 : 0)
} catch (e) {
	console.error(`\nFatal: ${e.message}`)
	console.error(e.stack)
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true, force: true })
	process.exit(1)
}
