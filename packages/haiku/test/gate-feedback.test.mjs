#!/usr/bin/env npx tsx
// Test suite for gate-phase feedback check and haiku_revisit reasons extension
// Covers auto-revisit.feature and revisit-with-reasons.feature scenarios

import assert from "node:assert"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	handleOrchestratorTool,
	orchestratorToolDefs,
	runNext,
} from "../src/orchestrator.ts"
import { readJson, writeFeedbackFile, writeJson } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-gate-fb-test-"))
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
		started_at: "2026-04-15T18:05:00Z",
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
		visits: 0,
		...state,
	})
}

function _createUnit(intentDirPath, stage, unitName, opts = {}) {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	const inputs = opts.inputs || ["intent.md"]
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
---

## Completion Criteria

${(opts.criteria || ["- [ ] Default criteria"]).join("\n")}
`,
	)
}

function createFeedbackFile(intentDirPath, _slug, stage, title, opts = {}) {
	const feedbackDirPath = join(intentDirPath, "stages", stage, "feedback")
	mkdirSync(feedbackDirPath, { recursive: true })

	const existingFiles = existsSync(feedbackDirPath)
		? readdirSync(feedbackDirPath).filter((f) => f.endsWith(".md"))
		: []
	const maxNum = existingFiles.reduce((max, f) => {
		const match = f.match(/^(\d+)-/)
		return match ? Math.max(max, Number.parseInt(match[1], 10)) : max
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
	// Gate-phase feedback check (auto-revisit.feature)
	// =========================================================================

	console.log(
		"\n=== Gate-phase feedback check: pending feedback triggers rollback ===",
	)

	test("gate handler rolls to elaborate when pending feedback exists", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-1", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Null guard missing")
		createFeedbackFile(intentDirPath, slug, "plan", "Race condition")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
		assert.strictEqual(result.pending_count, 2)
		assert.strictEqual(result.visits, 1)
		assert.strictEqual(result.stage, "plan")

		// Verify state.json was updated
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "elaborate")
		assert.strictEqual(state.visits, 1)
	})

	test("gate handler proceeds normally when no pending feedback exists", () => {
		const { projDir, intentDirPath, slug } = createProject(
			"gate-fb-no-pending",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto" } },
			},
		)
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Old finding", {
			status: "closed",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Another finding", {
			status: "addressed",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		// Should proceed to normal gate logic (auto-advance for auto gate)
		assert.ok(
			result.action === "advance_stage" || result.action === "intent_complete",
			`Expected advance_stage or intent_complete, got: ${result.action}`,
		)
	})

	test("gate handler proceeds when all feedback is resolved", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-resolved", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Finding A", {
			status: "addressed",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Finding B", {
			status: "rejected",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Finding C", {
			status: "closed",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.ok(
			result.action !== "feedback_revisit",
			`Should not trigger feedback_revisit when all resolved, got: ${result.action}`,
		)
	})

	test("mixed pending and resolved feedback still triggers rollback", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-mixed", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Resolved", {
			status: "closed",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Addressed", {
			status: "addressed",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Still open", {
			status: "pending",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
		assert.strictEqual(result.pending_count, 1)
		assert.strictEqual(result.pending_items.length, 1)
		assert.strictEqual(result.pending_items[0].title, "Still open")
	})

	test("visits counter increments on each successive rollback", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-visits", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		// Start at visits: 0 so the first rollback lands at visits: 1, still
		// within MAX_STAGE_ITERATIONS (2). Previously this test started at
		// visits: 2, but the cap was dropped from 5 → 2 to force spec rigor
		// rather than repeated execute cycles.
		createStageState(intentDirPath, "plan", { phase: "gate", visits: 0 })
		createFeedbackFile(intentDirPath, slug, "plan", "Pending item")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
		assert.strictEqual(result.visits, 1)

		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.visits, 1)
	})

	test("escalation leaves stage phase unchanged (does not pre-flip to elaborate)", () => {
		// Regression: the feedback_revisit path used to flip gateState.phase
		// to "elaborate" and write it to disk BEFORE calling maybeEscalate.
		// When escalation fired (iteration cap exceeded), the stage state
		// had already been mutated to elaborate — and a follow-up
		// haiku_revisit call with no `stage` arg would then read phase
		// ="elaborate" and route through revisitEarlierStage, silently
		// jumping active_stage back to the previous stage. The fix: only
		// flip phase AFTER the escalation check passes. On escalation, the
		// stage remains in its original phase so the subsequent revisit
		// correctly stays on the current stage.
		const { projDir, intentDirPath, slug } = createProject(
			"gate-fb-escalation-phase",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto" } },
			},
		)
		// Seed a state that already sits at the iteration cap so the next
		// feedback check triggers escalation rather than revisit.
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			visits: 2,
			iterations: [
				{
					index: 1,
					trigger: "initial",
					started_at: "2026-04-20T17:00:00Z",
					completed_at: "2026-04-20T17:01:00Z",
					result: "feedback-revisit",
				},
				{
					index: 2,
					trigger: "feedback",
					started_at: "2026-04-20T17:01:00Z",
					completed_at: "2026-04-20T17:02:00Z",
					result: "feedback-revisit",
					reason: "1 pending feedback item(s)",
				},
			],
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Still pending")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(
			result.action,
			"escalate",
			`Expected escalate at iteration cap, got: ${result.action}`,
		)

		// The phase must NOT have been pre-flipped to elaborate. Otherwise
		// a follow-up haiku_revisit would jump back to a prior stage.
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(
			state.phase,
			"gate",
			`Stage phase must stay "gate" on escalation so a follow-up haiku_revisit targets the current stage, got: ${state.phase}`,
		)
	})

	test("missing feedback directory treated as zero pending", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-no-dir", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		// No feedback directory at all

		process.chdir(projDir)
		const result = runNext(slug)

		assert.ok(
			result.action !== "feedback_revisit",
			`Should not trigger feedback_revisit when no feedback dir, got: ${result.action}`,
		)
	})

	console.log("\n=== Gate-phase feedback check: structural enforcement ===")

	test("feedback check fires before auto gate type", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-auto", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Blocks auto advance")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
		// Auto-advance does NOT fire
	})

	test("feedback check fires before ask gate type", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-ask", {
			active_stage: "plan",
			stageConfig: { plan: { review: "ask" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Blocks ask gate")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
	})

	test("feedback check fires before external gate type", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-external", {
			active_stage: "plan",
			stageConfig: { plan: { review: "external" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Blocks external gate")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
	})

	test("rollback preserves existing stage state", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-preserve", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", {
			phase: "gate",
			started_at: "2026-04-15T10:00:00Z",
			elaboration_turns: 3,
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Pending")

		process.chdir(projDir)
		runNext(slug)

		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "elaborate")
		assert.strictEqual(state.visits, 1)
		assert.strictEqual(state.started_at, "2026-04-15T10:00:00Z")
		assert.strictEqual(state.status, "active")
		assert.strictEqual(state.elaboration_turns, 3)
	})

	test("human-authored pending feedback routes to gate_review (not feedback_revisit)", () => {
		const { projDir, intentDirPath, slug } = createProject(
			"gate-fb-summaries",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto" } },
			},
		)
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Security issue", {
			origin: "adversarial-review",
			author: "security-agent",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "User concern", {
			origin: "user-visual",
			author: "user",
			author_type: "human",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		// Resolution-aware routing: when any pending item is
		// human-authored with no explicit `resolution`, the FSM must
		// open the review UI rather than auto-firing the fix loop. The
		// reviewer triages each item (pick a resolution or leave for
		// agent triage), then explicitly clicks "Send to agent" which
		// fires haiku_revisit → feedback_dispatch / stage revisit.
		assert.strictEqual(result.action, "gate_review")
		assert.strictEqual(result.stage, "plan")
	})

	test("pure agent-authored pending feedback still auto-dispatches fix loop (no human interrupt)", () => {
		const { projDir, intentDirPath, slug } = createProject(
			"gate-fb-agent-only",
			{
				active_stage: "plan",
				stageConfig: {
					plan: { review: "auto", hats: ["builder", "feedback-assessor"] },
				},
			},
		)
		createStageState(intentDirPath, "plan", { phase: "gate" })
		// Add a fix_hats entry on the STAGE.md so the fix-loop path is
		// available when the gate sees pending agent findings.
		const stagePath = join(
			projDir,
			".haiku",
			"studios",
			"test-studio",
			"stages",
			"plan",
			"STAGE.md",
		)
		const stageContent = readFileSync(stagePath, "utf8")
		writeFileSync(
			stagePath,
			stageContent.replace(
				"hats: [builder, feedback-assessor]",
				"hats: [builder, feedback-assessor]\nfix_hats: [builder, feedback-assessor]",
			),
		)
		mkdirSync(
			join(
				projDir,
				".haiku",
				"studios",
				"test-studio",
				"stages",
				"plan",
				"hats",
			),
			{
				recursive: true,
			},
		)
		writeFileSync(
			join(
				projDir,
				".haiku",
				"studios",
				"test-studio",
				"stages",
				"plan",
				"hats",
				"builder.md",
			),
			"---\nname: builder\n---\nBuild stuff.\n",
		)
		writeFileSync(
			join(
				projDir,
				".haiku",
				"studios",
				"test-studio",
				"stages",
				"plan",
				"hats",
				"feedback-assessor.md",
			),
			"---\nname: feedback-assessor\n---\nAssess fixes.\n",
		)

		createFeedbackFile(intentDirPath, slug, "plan", "Adversarial finding 1", {
			origin: "adversarial-review",
			author: "security-agent",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Adversarial finding 2", {
			origin: "studio-review",
			author: "perf-agent",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		// All items are agent-authored → legacy fix-loop contract
		// stands. The FSM dispatches without human intervention.
		assert.strictEqual(result.action, "review_fix")
		assert.strictEqual(result.items.length, 2)
	})

	// =========================================================================
	// haiku_revisit with reasons (revisit-with-reasons.feature)
	// =========================================================================

	console.log("\n=== haiku_revisit: stopgap without reasons ===")

	await test("revisit without reasons returns stopgap", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-no-reasons",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
		})

		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "revisit_needs_reasons")
		assert.ok(parsed.message.includes("reasons"))

		// Phase should NOT have changed
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "execute")
	})

	await test("revisit with intent and stage but no reasons returns stopgap", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-stage-no-reasons",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			stage: "plan",
		})

		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "revisit_needs_reasons")
	})

	console.log("\n=== haiku_revisit: reasons validation errors ===")

	await test("empty reasons array is rejected", async () => {
		const { projDir, slug } = createProject("revisit-empty-reasons", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [],
		})

		assert.ok(result.isError)
		assert.ok(result.content[0].text.includes("at least one item"))
	})

	await test("reason with empty title is rejected", async () => {
		const { projDir, slug } = createProject("revisit-empty-title", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ title: "", body: "Some detail" }],
		})

		assert.ok(result.isError)
		assert.ok(result.content[0].text.includes("non-empty title"))
	})

	await test("reason with empty body is rejected", async () => {
		const { projDir, slug } = createProject("revisit-empty-body", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ title: "Valid title", body: "" }],
		})

		assert.ok(result.isError)
		assert.ok(result.content[0].text.includes("non-empty body"))
	})

	await test("reason with missing title is rejected", async () => {
		const { projDir, slug } = createProject("revisit-missing-title", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ body: "Some detail" }],
		})

		assert.ok(result.isError)
		assert.ok(result.content[0].text.includes("non-empty title"))
	})

	await test("reasons sent as JSON string are parsed, not iterated per-char", async () => {
		// Some MCP clients serialize nested array args as JSON strings.
		// Before the parse/guard landed, the handler iterated each character
		// of the string as a "reason", yielding undefined titles and crashing
		// inside slugifyTitle. The handler must parse the string first and
		// either produce a valid array or return a clean error.
		const { projDir, slug } = createProject("revisit-json-string-reasons", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: JSON.stringify([{ title: "Title", body: "Body" }]),
		})

		// Either succeeds (parsed and iterated as one object) or returns a
		// structured validation error. MUST NOT throw/crash.
		assert.ok(
			!result.isError ||
				!result.content[0].text.includes("Cannot read properties"),
			`Unexpected crash: ${result.content[0].text}`,
		)
	})

	await test("revisit from elaborate phase requires explicit stage", async () => {
		// Regression: when the current stage's phase was already "elaborate"
		// and the caller omitted `stage`, revisit() used to silently jump to
		// the previous stage. That caused active_stage to flip backwards in
		// every escalate→revisit flow (the feedback_revisit path had already
		// pre-flipped phase to elaborate before escalating, so the follow-up
		// revisit read the lie and rode it back to inception). Now the
		// handler refuses to infer — the caller MUST pass `stage` to
		// disambiguate.
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-elab-ambiguous",
			{
				active_stage: "plan",
				stages: ["design", "plan", "build"],
			},
		)
		// Pre-populate prior stage so the "first stage" branch isn't what
		// we're exercising.
		createStageState(intentDirPath, "design", {
			status: "completed",
			phase: "gate",
		})
		createStageState(intentDirPath, "plan", {
			phase: "elaborate",
			visits: 1,
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ title: "ambiguous", body: "no stage passed" }],
		})

		assert.ok(result.isError || !!result.content[0].text.match(/error/i))
		const msg = result.content[0].text
		assert.ok(
			msg.includes("already in the elaborate phase") ||
				msg.includes("Pass `stage`"),
			`Expected explicit-stage error, got: ${msg}`,
		)
	})

	await test("reasons sent as a non-array is rejected with a clear message", async () => {
		const { projDir, slug } = createProject("revisit-non-array-reasons", {
			active_stage: "plan",
		})
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: { title: "not an array", body: "oops" },
		})

		assert.ok(result.isError)
		assert.ok(
			result.content[0].text.toLowerCase().includes("must be an array"),
			`Expected "must be an array" error, got: ${result.content[0].text}`,
		)
	})

	console.log("\n=== haiku_revisit: reasons create feedback and roll back ===")

	await test("single reason creates feedback and rolls back", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-single-reason",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [
				{
					title: "Null check missing",
					body: "handleSubmit at line 42 dereferences a potentially null ref",
				},
			],
		})

		assert.ok(
			!result.isError,
			`Expected success, got: ${result.content[0].text}`,
		)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "revisit")
		assert.strictEqual(parsed.to_phase, "elaborate")
		assert.strictEqual(parsed.visits, 1)
		assert.strictEqual(parsed.feedback_created.length, 1)
		assert.strictEqual(parsed.feedback_created[0].title, "Null check missing")

		// Verify feedback file was created
		const feedbackDirPath = join(intentDirPath, "stages", "plan", "feedback")
		assert.ok(existsSync(feedbackDirPath))
		const files = readdirSync(feedbackDirPath).filter((f) => f.endsWith(".md"))
		assert.strictEqual(files.length, 1)
		assert.ok(files[0].startsWith("01-"))

		// Verify feedback content
		const raw = readFileSync(join(feedbackDirPath, files[0]), "utf8")
		assert.ok(raw.includes("title: Null check missing"))
		assert.ok(raw.includes("status: pending"))
		assert.ok(raw.includes("origin: agent"))
		assert.ok(raw.includes("author: parent-agent"))
		assert.ok(raw.includes("author_type: agent"))
		assert.ok(raw.includes("handleSubmit at line 42"))

		// Verify state was updated
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "elaborate")
		assert.strictEqual(state.visits, 1)
	})

	await test("multiple reasons create multiple feedback files", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-multi-reason",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [
				{ title: "Null check missing", body: "Parser line 42" },
				{
					title: "Race condition",
					body: "Worker pool starves under concurrency",
				},
			],
		})

		assert.ok(!result.isError)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.feedback_created.length, 2)

		const feedbackDirPath = join(intentDirPath, "stages", "plan", "feedback")
		const files = readdirSync(feedbackDirPath)
			.filter((f) => f.endsWith(".md"))
			.sort()
		assert.strictEqual(files.length, 2)
		assert.ok(files[0].startsWith("01-"))
		assert.ok(files[1].startsWith("02-"))
	})

	await test("reasons-created feedback has sequential numbering after existing files", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-sequential",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		// Create pre-existing feedback
		createFeedbackFile(intentDirPath, slug, "plan", "Prior finding A", {
			status: "addressed",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Prior finding B", {
			status: "addressed",
		})

		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ title: "New issue", body: "Details here" }],
		})

		assert.ok(!result.isError)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.feedback_created[0].feedback_id, "FB-03")
	})

	await test("revisit with reasons increments visits from existing value", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-visits-incr",
			{
				active_stage: "plan",
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute", visits: 2 })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [
				{ title: "Recurring issue", body: "Still broken after two revisits" },
			],
		})

		assert.ok(!result.isError)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.visits, 3)

		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.visits, 3)
	})

	await test("feedback directory auto-created when first revisit-with-reasons fires", async () => {
		const { projDir, intentDirPath, slug } = createProject("revisit-auto-dir", {
			active_stage: "plan",
		})
		createStageState(intentDirPath, "plan", { phase: "execute" })
		// No feedback dir exists

		const feedbackDirPath = join(intentDirPath, "stages", "plan", "feedback")
		assert.ok(!existsSync(feedbackDirPath), "feedback dir should not exist yet")

		process.chdir(projDir)
		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [{ title: "First ever feedback", body: "Details" }],
		})

		assert.ok(!result.isError)
		assert.ok(
			existsSync(feedbackDirPath),
			"feedback dir should have been created",
		)
		const files = readdirSync(feedbackDirPath).filter((f) => f.endsWith(".md"))
		assert.strictEqual(files.length, 1)
	})

	console.log("\n=== haiku_revisit: tool definition ===")

	test("haiku_revisit tool has reasons parameter in schema", () => {
		const tool = orchestratorToolDefs.find((t) => t.name === "haiku_revisit")
		assert.ok(tool)
		assert.ok(
			tool.inputSchema.properties.reasons,
			"reasons property should exist",
		)
		assert.strictEqual(tool.inputSchema.properties.reasons.type, "array")
		assert.ok(tool.inputSchema.properties.reasons.items)
		assert.ok(tool.inputSchema.properties.reasons.items.properties.title)
		assert.ok(tool.inputSchema.properties.reasons.items.properties.body)
	})

	test("haiku_revisit description mentions reasons preference", () => {
		const tool = orchestratorToolDefs.find((t) => t.name === "haiku_revisit")
		assert.ok(tool)
		assert.ok(
			tool.description.includes("reasons"),
			"Description should mention reasons",
		)
		assert.ok(
			tool.description.includes("stopgap"),
			"Description should mention stopgap",
		)
	})

	// =========================================================================
	// Integration: revisit-created feedback blocks gate
	// =========================================================================

	console.log("\n=== Integration: revisit feedback blocks gate ===")

	await test("reasons-created feedback blocks gate on next cycle", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-then-gate",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto" } },
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		// Create feedback via revisit
		await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [
				{ title: "Issue A", body: "Detail A" },
				{ title: "Issue B", body: "Detail B" },
			],
		})

		// Now simulate the stage being at gate again
		const statePath = join(intentDirPath, "stages", "plan", "state.json")
		const state = readJson(statePath)
		state.phase = "gate"
		writeJson(statePath, state)

		const gateResult = runNext(slug)
		// Resolution-aware routing: reasons written by haiku_revisit carry
		// `resolution: stage_revisit`, so run_next auto-dispatches the
		// rollback on the next gate pass (no intermediate prose). Accept
		// either the auto-revisit action or the escalate branch (when the
		// iteration-signature loop detector fires).
		assert.ok(
			gateResult.action === "revisited" ||
				gateResult.action === "feedback_revisit" ||
				gateResult.action === "escalate",
			`Expected revisited, feedback_revisit, or escalate, got: ${gateResult.action}`,
		)
	})

	await test("addressed revisit feedback does not block gate", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-addressed",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto" } },
			},
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		// Create feedback via revisit
		await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
			reasons: [
				{ title: "Issue A", body: "Detail A" },
				{ title: "Issue B", body: "Detail B" },
			],
		})

		// Mark both as addressed
		const feedbackDirPath = join(intentDirPath, "stages", "plan", "feedback")
		const files = readdirSync(feedbackDirPath).filter((f) => f.endsWith(".md"))
		for (const f of files) {
			const filePath = join(feedbackDirPath, f)
			let content = readFileSync(filePath, "utf8")
			content = content.replace("status: pending", "status: addressed")
			writeFileSync(filePath, content)
		}

		// Set to gate
		const statePath = join(intentDirPath, "stages", "plan", "state.json")
		const state = readJson(statePath)
		state.phase = "gate"
		writeJson(statePath, state)

		const gateResult = runNext(slug)
		assert.ok(
			gateResult.action !== "feedback_revisit",
			`Should not trigger feedback_revisit when all addressed, got: ${gateResult.action}`,
		)
	})

	// =========================================================================
	// feedback_revisit payload shape — each pending item carries the fields
	// downstream consumers (review UI, revisit command) rely on.
	// =========================================================================

	console.log("\n=== feedback_revisit payload shape ===")

	test("feedback_revisit pending_items carries id, title, status, origin, author, file", () => {
		const { projDir, intentDirPath, slug } = createProject("gate-fb-payload", {
			active_stage: "plan",
			stageConfig: { plan: { review: "auto" } },
		})
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Payload finding A", {
			status: "pending",
			origin: "adversarial-review",
			author: "reviewer-bot",
		})
		createFeedbackFile(intentDirPath, slug, "plan", "Payload finding B", {
			status: "pending",
			origin: "user-visual",
			author: "alice",
		})

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "feedback_revisit")
		assert.strictEqual(result.pending_count, 2)
		assert.strictEqual(result.pending_items.length, 2)

		// Every pending item must carry the required fields for the review UI
		// and revisit flow to work downstream. Dropping any of these would
		// break the review page or the per-item reject/close flow.
		for (const item of result.pending_items) {
			assert.ok(
				typeof item.feedback_id === "string" && item.feedback_id.length > 0,
			)
			assert.ok(typeof item.title === "string" && item.title.length > 0)
			assert.ok(typeof item.status === "string")
			assert.ok(typeof item.origin === "string")
			assert.ok(typeof item.author === "string")
			assert.ok(typeof item.file === "string" && item.file.length > 0)
		}

		// Origins are preserved (adversarial-review, user-visual); not coerced
		// to a single default.
		const origins = new Set(result.pending_items.map((i) => i.origin))
		assert.ok(origins.has("adversarial-review"))
		assert.ok(origins.has("user-visual"))
	})

	// =========================================================================
	// review_fix dispatch — stages with `fix_hats:` route findings through
	// the fix-hat sequence instead of the feedback_revisit path. Each finding
	// dispatches in order, one per tick, with a per-finding bolt counter.
	// =========================================================================

	console.log("\n=== review_fix dispatch (stage fix_hats) ===")

	test("gate dispatches review_fix when stage has fix_hats + pending feedback", () => {
		const { projDir, intentDirPath, slug, studio } = createProject(
			"review-fix-basic",
			{
				active_stage: "plan",
				stageConfig: {
					plan: {
						review: "auto",
						hats: ["worker"],
					},
				},
			},
		)
		// Add fix_hats to STAGE.md + create feedback-assessor hat file
		const stageFile = join(
			projDir,
			".haiku/studios",
			studio,
			"stages/plan/STAGE.md",
		)
		const updated = readFileSync(stageFile, "utf8").replace(
			"hats: [worker]",
			"hats: [worker]\nfix_hats: [worker, feedback-assessor]",
		)
		writeFileSync(stageFile, updated)
		const hatsDir = join(projDir, ".haiku/studios", studio, "stages/plan/hats")
		mkdirSync(hatsDir, { recursive: true })
		writeFileSync(
			join(hatsDir, "worker.md"),
			`---\nname: worker\n---\nProducer mandate.`,
		)
		writeFileSync(
			join(hatsDir, "feedback-assessor.md"),
			`---\nname: feedback-assessor\n---\nAssessor mandate.`,
		)
		createStageState(intentDirPath, "plan", { phase: "gate" })
		createFeedbackFile(intentDirPath, slug, "plan", "Null guard missing")

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(
			result.action,
			"review_fix",
			`Expected review_fix, got: ${result.action}`,
		)
		assert.ok(Array.isArray(result.items), "expected items[] on review_fix")
		assert.strictEqual(result.items.length, 1)
		assert.strictEqual(result.items[0].feedback_id, "FB-01")
		assert.strictEqual(result.items[0].bolt, 1)
		assert.deepStrictEqual(result.fix_hats, ["worker", "feedback-assessor"])
		assert.strictEqual(result.max_bolts, 3)
	})

	test("review_fix escalates after 3 bolts without closure", () => {
		const { projDir, intentDirPath, slug, studio } = createProject(
			"review-fix-cap",
			{
				active_stage: "plan",
				stageConfig: { plan: { review: "auto", hats: ["worker"] } },
			},
		)
		const stageFile = join(
			projDir,
			".haiku/studios",
			studio,
			"stages/plan/STAGE.md",
		)
		writeFileSync(
			stageFile,
			readFileSync(stageFile, "utf8").replace(
				"hats: [worker]",
				"hats: [worker]\nfix_hats: [worker, feedback-assessor]",
			),
		)
		const hatsDir = join(projDir, ".haiku/studios", studio, "stages/plan/hats")
		mkdirSync(hatsDir, { recursive: true })
		writeFileSync(join(hatsDir, "worker.md"), `---\nname: worker\n---\n.`)
		writeFileSync(
			join(hatsDir, "feedback-assessor.md"),
			`---\nname: feedback-assessor\n---\n.`,
		)
		createStageState(intentDirPath, "plan", { phase: "gate" })
		// Seed a feedback item already at bolt=3 (the cap) — next dispatch escalates.
		const fbDir = join(intentDirPath, "stages/plan/feedback")
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "01-stuck-finding.md"),
			`---
title: "Stuck finding"
status: "fixing"
origin: "adversarial-review"
author: "agent"
author_type: "agent"
created_at: "2026-04-15T00:00:00Z"
visit: 0
source_ref: null
closed_by: null
bolt: 3
upstream_stage: null
---

Cannot be resolved autonomously.`,
		)

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "escalate")
		assert.strictEqual(result.reason, "fix_loop_cap_exceeded")
		assert.strictEqual(result.iteration, 3)
	})

	test("upstream_finding_surfaced when finding's root cause is in another stage", () => {
		const { projDir, intentDirPath, slug, studio } = createProject(
			"upstream-finding",
			{
				active_stage: "build",
				stages: ["plan", "build"],
				stageConfig: {
					plan: { review: "auto", hats: ["planner"] },
					build: { review: "auto", hats: ["builder"] },
				},
			},
		)
		// build stage opts into fix_hats so the finding would otherwise
		// dispatch there — but the upstream_stage field routes it out.
		const buildStage = join(
			projDir,
			".haiku/studios",
			studio,
			"stages/build/STAGE.md",
		)
		writeFileSync(
			buildStage,
			readFileSync(buildStage, "utf8").replace(
				"hats: [builder]",
				"hats: [builder]\nfix_hats: [builder, feedback-assessor]",
			),
		)
		const hatsDir = join(projDir, ".haiku/studios", studio, "stages/build/hats")
		mkdirSync(hatsDir, { recursive: true })
		writeFileSync(join(hatsDir, "builder.md"), `---\nname: builder\n---\n.`)
		writeFileSync(
			join(hatsDir, "feedback-assessor.md"),
			`---\nname: feedback-assessor\n---\n.`,
		)

		// Mark plan as completed so the FSM's consistency check doesn't
		// rewind to it. Without this, runNext's "all stages before
		// active_stage are completed" guard would reset us to plan.
		createStageState(intentDirPath, "plan", {
			status: "completed",
			phase: "gate",
			completed_at: "2026-04-15T00:00:00Z",
			gate_outcome: "advanced",
		})
		createStageState(intentDirPath, "build", { phase: "gate" })
		const fbDir = join(intentDirPath, "stages/build/feedback")
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "01-wrong-plan.md"),
			`---
title: "Plan contradicts spec"
status: "pending"
origin: "adversarial-review"
author: "reviewer"
author_type: "agent"
created_at: "2026-04-15T00:00:00Z"
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: plan
---

Plan from upstream stage is wrong.`,
		)

		process.chdir(projDir)
		const result = runNext(slug)

		assert.strictEqual(result.action, "upstream_finding_surfaced")
		assert.strictEqual(result.upstream_items.length, 1)
		assert.strictEqual(result.upstream_items[0].feedback_id, "FB-01")
		assert.strictEqual(result.upstream_items[0].upstream_stage, "plan")
	})

	// =========================================================================
	// haiku_revisit: resolution-aware routing
	// =========================================================================

	console.log("\n=== haiku_revisit: resolution-aware routing ===")

	await test("no reasons + pending feedback with mixed resolutions routes through revisit()", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-route-mixed",
			{ active_stage: "plan" },
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)
		// One explicit stage_revisit item → forces the safe-default path.
		writeFeedbackFile(slug, "plan", {
			title: "Full rework needed",
			body: "The elaboration missed a requirement.",
			origin: "user-chat",
			author: "user",
			resolution: "stage_revisit",
		})
		// One question — by itself would dispatch, but the stage_revisit
		// item above makes this a rollback path.
		writeFeedbackFile(slug, "plan", {
			title: "Why did you pick this pattern?",
			body: "Just curious.",
			origin: "user-question",
			author: "user",
			resolution: "question",
		})

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${result.content[0].text}`,
		)
		const parsed = JSON.parse(result.content[0].text)
		// Any stage_revisit (or null) pending item makes the revisit
		// action fall through to the normal rollback path.
		assert.ok(
			parsed.action === "revisit" ||
				parsed.action === "revisited" ||
				parsed.action === "error",
			`Expected revisit/revisited/error, got ${parsed.action}`,
		)
		// Not a feedback_dispatch — the safe default wins when any
		// item wants a stage revisit.
		assert.notStrictEqual(parsed.action, "feedback_dispatch")
	})

	await test("no reasons + pending feedback all non-revisit resolutions returns feedback_dispatch", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-route-dispatch",
			{ active_stage: "plan" },
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)
		writeFeedbackFile(slug, "plan", {
			title: "Why this pattern?",
			body: "Asking for context.",
			origin: "user-question",
			author: "user",
			resolution: "question",
		})
		writeFeedbackFile(slug, "plan", {
			title: "Rename helper",
			body: "Rename utils/foo to utils/bar.",
			origin: "user-chat",
			author: "user",
			resolution: "inline_fix",
		})
		writeFeedbackFile(slug, "plan", {
			title: "Upstream contract wrong",
			body: "The prior stage's schema doesn't match.",
			origin: "user-chat",
			author: "user",
			resolution: "upstream_rewind",
		})

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${result.content[0].text}`,
		)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "feedback_dispatch")
		assert.strictEqual(parsed.counts.questions, 1)
		assert.strictEqual(parsed.counts.inline_fixes, 1)
		assert.strictEqual(parsed.counts.upstream_rewinds, 1)
		assert.ok(parsed.message.includes("Reply to questions"))
		assert.ok(parsed.message.includes("Inline fixes"))
		assert.ok(parsed.message.includes("Upstream rewinds"))
		// Stage state must be untouched — the dispatch path doesn't roll
		// back.
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "execute")
	})

	await test("no reasons + no pending feedback still returns revisit_needs_reasons stopgap", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-no-feedback-stopgap",
			{ active_stage: "plan" },
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
		})
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "revisit_needs_reasons")
	})

	await test("no reasons + pending feedback with null resolution routes to feedback_dispatch (needsTriage)", async () => {
		const { projDir, intentDirPath, slug } = createProject(
			"revisit-null-resolution",
			{ active_stage: "plan" },
		)
		createStageState(intentDirPath, "plan", { phase: "execute" })
		process.chdir(projDir)
		// No resolution → agent triages during dispatch. Silent
		// defaulting to stage_revisit was the rollback footgun; now
		// null items go into the needs_triage bucket.
		writeFeedbackFile(slug, "plan", {
			title: "Untagged comment",
			body: "I didn't pick a resolution.",
			origin: "user-chat",
			author: "user",
		})

		const result = await handleOrchestratorTool("haiku_revisit", {
			intent: slug,
		})
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.action, "feedback_dispatch")
		assert.strictEqual(parsed.counts.needs_triage, 1)
		assert.strictEqual(parsed.counts.questions, 0)
		assert.strictEqual(parsed.counts.inline_fixes, 0)
		assert.strictEqual(parsed.counts.upstream_rewinds, 0)
		assert.ok(parsed.message.includes("Triage"))
		// Stage state must be untouched — dispatch path doesn't roll.
		const state = readJson(join(intentDirPath, "stages", "plan", "state.json"))
		assert.strictEqual(state.phase, "execute")
	})

	// ── Cleanup ───────────────────────────────────────────────────────────────

	console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}
