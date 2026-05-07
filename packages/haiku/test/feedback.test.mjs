#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U feedback helpers and haiku_feedback tool
// Run: npx tsx test/feedback.test.mjs

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
	countPendingFeedback,
	deleteFeedbackFile,
	deriveAuthorType,
	FEEDBACK_ORIGINS,
	feedbackDir,
	findFeedbackFile,
	handleStateTool,
	readFeedbackFiles,
	slugifyTitle,
	updateFeedbackFile,
	writeFeedbackFile,
} from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-feedback-test-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-feedback-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Test Feedback Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

This is a test intent for feedback testing.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{
			stage: stageName,
			status: "active",
			phase: "elaborate",
			started_at: "2026-04-15T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
			visits: 0,
		},
		null,
		2,
	),
)

// Stub git so gitCommitState doesn't fail or actually commit
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  \u2713 ${name}`)
	} catch (e) {
		failed++
		console.log(`  \u2717 ${name}: ${e.message}`)
	}
}

function getTextResult(result) {
	return result.content[0].text
}

// Write a stub unit spec so feedback closed_by=unit-NN-slug passes the
// ghost-unit guard in updateFeedbackFile. Real lifecycle lands a proper
// unit spec during additive elaboration; tests stub it to keep scope
// local.
function writeUnitStub(unitSlug, stage = stageName) {
	writeFileSync(
		join(intentDirPath, "stages", stage, "units", `${unitSlug}.md`),
		"---\ntitle: stub\n---\n\nstub unit for feedback closed_by tests.\n",
	)
}

// ── Tests ──────────────────────────────────────────────────────────────────

try {
	// ── slugifyTitle ──────────────────────────────────────────────────────────

	console.log("\n=== slugifyTitle ===")

	test("basic slugification", () => {
		assert.strictEqual(slugifyTitle("Missing null check"), "missing-null-check")
	})

	test("collapses consecutive hyphens", () => {
		assert.strictEqual(
			slugifyTitle("Hello   World!!!   Test"),
			"hello-world-test",
		)
	})

	test("truncates to max length", () => {
		const long = "a".repeat(100)
		const result = slugifyTitle(long, 60)
		assert.ok(result.length <= 60)
	})

	test("strips trailing hyphens", () => {
		assert.strictEqual(slugifyTitle("test---"), "test")
	})

	// ── deriveAuthorType ─────────────────────────────────────────────────────

	console.log("\n=== deriveAuthorType ===")

	test("agent origins return agent", () => {
		assert.strictEqual(deriveAuthorType("agent"), "agent")
		assert.strictEqual(deriveAuthorType("adversarial-review"), "agent")
	})

	test("human origins return human", () => {
		assert.strictEqual(deriveAuthorType("user-visual"), "human")
		assert.strictEqual(deriveAuthorType("user-chat"), "human")
		assert.strictEqual(deriveAuthorType("user-question"), "human")
		assert.strictEqual(deriveAuthorType("external-pr"), "human")
		assert.strictEqual(deriveAuthorType("external-mr"), "human")
	})

	// ── writeFeedbackFile ────────────────────────────────────────────────────

	console.log("\n=== writeFeedbackFile ===")

	test("creates feedback file with correct frontmatter", () => {
		const result = writeFeedbackFile(intentSlug, stageName, {
			title: "Missing null check in handler",
			body: "The handler at line 42 does not check for null.",
			origin: "adversarial-review",
			author: "security-review-agent",
			source_ref: "https://github.com/org/repo/pull/42",
		})

		assert.strictEqual(result.feedback_id, "FB-001")
		assert.ok(result.file.includes("001-missing-null-check-in-handler.md"))

		const dir = feedbackDir(intentSlug, stageName)
		const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
		assert.strictEqual(files.length, 1)
		assert.ok(files[0].startsWith("001-"))

		// Verify frontmatter content
		const raw = readFileSync(join(dir, files[0]), "utf8")
		assert.ok(raw.includes("title: Missing null check in handler"))
		assert.ok(raw.includes("status: pending"))
		assert.ok(raw.includes("origin: adversarial-review"))
		assert.ok(raw.includes("author: security-review-agent"))
		assert.ok(raw.includes("author_type: agent"))
		assert.ok(raw.includes("visit: 0"))
		assert.ok(
			raw.includes("source_ref: 'https://github.com/org/repo/pull/42'") ||
				raw.includes('source_ref: "https://github.com/org/repo/pull/42"') ||
				raw.includes("source_ref: https://github.com/org/repo/pull/42"),
			`source_ref not found in frontmatter: ${raw.split("---")[1]}`,
		)
		assert.ok(raw.includes("closed_by: null"))
		assert.ok(raw.includes("The handler at line 42 does not check for null."))
	})

	test("auto-increments sequential numbering", () => {
		const result = writeFeedbackFile(intentSlug, stageName, {
			title: "Second feedback item",
			body: "Another finding.",
		})

		assert.strictEqual(result.feedback_id, "FB-002")
		assert.ok(result.file.includes("002-second-feedback-item.md"))
	})

	test("defaults origin to agent and author to agent", () => {
		const result = writeFeedbackFile(intentSlug, stageName, {
			title: "Third item with defaults",
			body: "Testing defaults.",
		})

		assert.strictEqual(result.feedback_id, "FB-003")

		const dir = feedbackDir(intentSlug, stageName)
		const file = readdirSync(dir)
			.filter((f) => f.startsWith("003-"))
			.pop()
		const raw = readFileSync(join(dir, file), "utf8")
		assert.ok(raw.includes("origin: agent"))
		assert.ok(raw.includes("author: agent"))
		assert.ok(raw.includes("author_type: agent"))
	})

	test("human origin sets correct author_type and default author", () => {
		const result = writeFeedbackFile(intentSlug, stageName, {
			title: "Visual issue from user",
			body: "Button overlaps.",
			origin: "user-visual",
		})

		assert.strictEqual(result.feedback_id, "FB-004")

		const dir = feedbackDir(intentSlug, stageName)
		const file = readdirSync(dir)
			.filter((f) => f.startsWith("004-"))
			.pop()
		const raw = readFileSync(join(dir, file), "utf8")
		assert.ok(raw.includes("origin: user-visual"))
		assert.ok(raw.includes("author: user"))
		assert.ok(raw.includes("author_type: human"))
	})

	test("auto-creates feedback directory if missing", () => {
		// Create a new stage without a feedback dir
		const newStage = "security"
		mkdirSync(join(intentDirPath, "stages", newStage), { recursive: true })
		writeFileSync(
			join(intentDirPath, "stages", newStage, "state.json"),
			JSON.stringify(
				{ stage: newStage, status: "active", phase: "elaborate", visits: 2 },
				null,
				2,
			),
		)

		const dir = feedbackDir(intentSlug, newStage)
		assert.ok(!existsSync(dir), "feedback dir should not exist yet")

		const result = writeFeedbackFile(intentSlug, newStage, {
			title: "Security finding",
			body: "XSS vulnerability found.",
		})

		assert.strictEqual(result.feedback_id, "FB-001")
		assert.ok(existsSync(dir), "feedback dir should be created")

		// Verify visit count is read from state.json
		const file = readdirSync(dir).filter((f) => f.endsWith(".md"))[0]
		const raw = readFileSync(join(dir, file), "utf8")
		assert.ok(raw.includes("visit: 2"))
	})

	// ── readFeedbackFiles ────────────────────────────────────────────────────

	console.log("\n=== readFeedbackFiles ===")

	test("returns all parsed feedback items sorted by number", () => {
		const items = readFeedbackFiles(intentSlug, stageName)
		assert.strictEqual(items.length, 4)
		assert.strictEqual(items[0].id, "FB-001")
		assert.strictEqual(items[1].id, "FB-002")
		assert.strictEqual(items[2].id, "FB-003")
		assert.strictEqual(items[3].id, "FB-004")
	})

	test("parsed items have all expected fields", () => {
		const items = readFeedbackFiles(intentSlug, stageName)
		const first = items[0]
		assert.strictEqual(first.title, "Missing null check in handler")
		assert.strictEqual(first.status, "pending")
		assert.strictEqual(first.origin, "adversarial-review")
		assert.strictEqual(first.author, "security-review-agent")
		assert.strictEqual(first.author_type, "agent")
		assert.strictEqual(first.visit, 0)
		assert.ok(first.body.includes("The handler at line 42"))
		assert.ok(first.file.includes("feedback/001-"))
	})

	test("returns empty array for nonexistent directory", () => {
		const items = readFeedbackFiles(intentSlug, "nonexistent-stage")
		assert.deepStrictEqual(items, [])
	})

	// ── countPendingFeedback ─────────────────────────────────────────────────

	console.log("\n=== countPendingFeedback ===")

	test("counts all pending items", () => {
		const count = countPendingFeedback(intentSlug, stageName)
		assert.strictEqual(count, 4) // all 4 items are pending
	})

	test("returns 0 for empty stage", () => {
		const count = countPendingFeedback(intentSlug, "nonexistent-stage")
		assert.strictEqual(count, 0)
	})

	// ── findFeedbackFile ─────────────────────────────────────────────────────

	console.log("\n=== findFeedbackFile ===")

	test("finds by FB-NN identifier", () => {
		const found = findFeedbackFile(intentSlug, stageName, "FB-001")
		assert.ok(found)
		assert.ok(found.filename.startsWith("001-"))
		assert.strictEqual(found.data.title, "Missing null check in handler")
	})

	test("finds by bare numeric prefix", () => {
		const found = findFeedbackFile(intentSlug, stageName, "02")
		assert.ok(found)
		assert.ok(found.filename.startsWith("002-"))
	})

	test("returns null for nonexistent id", () => {
		const found = findFeedbackFile(intentSlug, stageName, "FB-099")
		assert.strictEqual(found, null)
	})

	// ── updateFeedbackFile ───────────────────────────────────────────────────

	console.log("\n=== updateFeedbackFile ===")

	test("updates status field", () => {
		const result = updateFeedbackFile(intentSlug, stageName, "FB-001", {
			status: "addressed",
		})
		assert.ok(result.ok)
		if (result.ok) {
			assert.deepStrictEqual(result.updated_fields, ["status"])
		}

		const found = findFeedbackFile(intentSlug, stageName, "FB-001")
		assert.strictEqual(found.data.status, "addressed")
	})

	test("updates closed_by field", () => {
		writeUnitStub("unit-05-fix-null")
		const result = updateFeedbackFile(intentSlug, stageName, "FB-002", {
			closed_by: "unit-05-fix-null",
		})
		assert.ok(result.ok)
		if (result.ok) {
			assert.deepStrictEqual(result.updated_fields, ["closed_by"])
		}

		const found = findFeedbackFile(intentSlug, stageName, "FB-002")
		assert.strictEqual(found.data.closed_by, "unit-05-fix-null")
	})

	test("rejects closed_by that references a ghost unit", () => {
		// The unit-99-ghost.md file is never created on disk. The guard
		// must refuse the close — otherwise prior revisits could leave
		// findings marked closed_by=unit-NN when the unit spec was never
		// produced or was deleted by a subsequent revisit cycle.
		const result = updateFeedbackFile(intentSlug, stageName, "FB-002", {
			closed_by: "unit-99-ghost",
		})
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("does not exist"))
			assert.ok(result.error.includes("unit-99-ghost"))
		}
	})

	test("accepts fix-loop marker as closed_by without unit file check", () => {
		// Fix-loop bolt markers don't match the unit-NN-slug pattern,
		// so the ghost-unit guard leaves them alone.
		const result = updateFeedbackFile(intentSlug, stageName, "FB-002", {
			closed_by: "fix-loop:FB-002:bolt-1",
		})
		assert.ok(result.ok)
	})

	test("updates multiple fields at once", () => {
		writeUnitStub("unit-06-defaults")
		const result = updateFeedbackFile(intentSlug, stageName, "FB-003", {
			status: "addressed",
			closed_by: "unit-06-defaults",
		})
		assert.ok(result.ok)
		if (result.ok) {
			assert.ok(result.updated_fields.includes("status"))
			assert.ok(result.updated_fields.includes("closed_by"))
		}
	})

	test("rejects when no updatable fields provided", () => {
		const result = updateFeedbackFile(intentSlug, stageName, "FB-001", {})
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("at least one"))
		}
	})

	test("rejects invalid status enum", () => {
		const result = updateFeedbackFile(intentSlug, stageName, "FB-001", {
			status: "invalid-status",
		})
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("status must be one of"))
		}
	})

	test("rejects nonexistent feedback id", () => {
		const result = updateFeedbackFile(intentSlug, stageName, "FB-099", {
			status: "addressed",
		})
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("not found"))
		}
	})

	test("agent cannot close human-authored feedback", () => {
		// FB-004 is human-authored (origin: user-visual).
		// Agents close via `closed_by`; the workflow forbids setting it on
		// human-authored items.
		const result = updateFeedbackFile(
			intentSlug,
			stageName,
			"FB-004",
			{ closed_by: "unit-05-fix-null" },
			"agent",
		)
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(
				result.error.includes("agents cannot close human-authored feedback"),
			)
		}
	})

	test("human can close human-authored feedback", () => {
		const result = updateFeedbackFile(
			intentSlug,
			stageName,
			"FB-004",
			{ status: "closed" },
			"human",
		)
		assert.ok(result.ok)
	})

	// ── deleteFeedbackFile ───────────────────────────────────────────────────

	console.log("\n=== deleteFeedbackFile ===")

	test("cannot delete pending feedback", () => {
		// FB-002 was updated to have closed_by but its status is still pending
		// Let's make sure FB-002 is pending first
		updateFeedbackFile(intentSlug, stageName, "FB-002", { status: "pending" })
		const result = deleteFeedbackFile(intentSlug, stageName, "FB-002")
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("cannot delete pending"))
		}
	})

	test("agent cannot delete human-authored feedback", () => {
		// FB-004 has been closed, but it's human-authored
		const result = deleteFeedbackFile(intentSlug, stageName, "FB-004", "agent")
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("agents cannot delete human-authored"))
		}
	})

	test("human can delete non-pending human-authored feedback", () => {
		// FB-004 is closed and human-authored
		const result = deleteFeedbackFile(intentSlug, stageName, "FB-004", "human")
		assert.ok(result.ok)

		// Verify file is gone
		const found = findFeedbackFile(intentSlug, stageName, "FB-004")
		assert.strictEqual(found, null)
	})

	test("deletes addressed agent-authored feedback", () => {
		// FB-001 was set to addressed earlier
		const result = deleteFeedbackFile(intentSlug, stageName, "FB-001", "agent")
		assert.ok(result.ok)

		const found = findFeedbackFile(intentSlug, stageName, "FB-001")
		assert.strictEqual(found, null)
	})

	test("returns error for nonexistent feedback id", () => {
		const result = deleteFeedbackFile(intentSlug, stageName, "FB-099")
		assert.ok(!result.ok)
		if (!result.ok) {
			assert.ok(result.error.includes("not found"))
		}
	})

	// ── countPendingFeedback after mutations ─────────────────────────────────

	console.log("\n=== countPendingFeedback after mutations ===")

	test("count reflects deletions and status changes", () => {
		// FB-001: deleted. FB-002: status=pending but closed_by set → counted
		// resolved because any closed_by signals closure. FB-003: status=addressed
		// (also resolved). FB-004: deleted. No pending items remain.
		const count = countPendingFeedback(intentSlug, stageName)
		assert.strictEqual(count, 0)
	})

	// ── haiku_feedback MCP tool (end-to-end) ─────────────────────────────────

	console.log("\n=== haiku_feedback MCP tool ===")

	test("creates feedback via MCP tool", () => {
		// After deletions: FB-001 deleted, FB-004 deleted. Remaining: FB-002, FB-003.
		// Highest prefix is 03, so next number is 04.
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "MCP test feedback",
			body: "Created via the MCP tool.",
			origin: "agent",
		})

		assert.ok(
			!result.isError,
			`Expected success, got error: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.feedback_id, "FB-004")
		assert.strictEqual(parsed.status, "pending")
		assert.ok(parsed.file.includes("004-mcp-test-feedback.md"))
		assert.ok(parsed.message.includes("FB-004 created"))
	})

	test("MCP tool persists inline_anchor when an agent attaches an excerpt", () => {
		// adversarial-review and studio-review hats attach an inline_anchor
		// so the SPA can flash the underlying span when the reviewer
		// clicks the feedback card. The wire shape is snake_case;
		// writeFeedbackFile normalises to camelCase before persisting.
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "Citation missing for claim",
			body: "Body asserts X but no citation provided.",
			origin: "adversarial-review",
			inline_anchor: {
				selected_text: "this claim has no citation backing it",
				paragraph: 3,
				location: "Unit: Threat model",
				file_path: `.haiku/intents/${intentSlug}/stages/${stageName}/units/unit-01-threat-model.md`,
				comment_id: "agent-anchor-001",
				content_sha: "deadbeef".repeat(8),
			},
		})
		assert.ok(
			!result.isError,
			`expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		// Verify the anchor landed on disk in the expected snake_case shape.
		const fbPath = join(projDir, parsed.file)
		const raw = readFileSync(fbPath, "utf8")
		assert.ok(
			raw.includes("inline_anchor:"),
			`expected inline_anchor block in FM, got:\n${raw.slice(0, 800)}`,
		)
		assert.ok(raw.includes("selected_text: this claim has no citation"))
		assert.ok(raw.includes("paragraph: 3"))
		assert.ok(raw.includes("comment_id: agent-anchor-001"))
		assert.ok(raw.includes("content_sha: " + "deadbeef".repeat(8)))
	})

	test("MCP tool rejects malformed inline_anchor (missing selected_text)", () => {
		// The schema forces selected_text + paragraph + location at the
		// gate. A half-built anchor is rejected before it can land on disk.
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "Bad anchor test",
			body: "body",
			inline_anchor: {
				paragraph: 0,
				location: "somewhere",
				// selected_text intentionally omitted
			},
		})
		assert.ok(result.isError, "expected gate rejection")
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some((e) =>
				e.path?.startsWith("/inline_anchor"),
			),
			`expected /inline_anchor in errors; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool rejects missing intent", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: "",
			stage: stageName,
			title: "Test",
			body: "Test",
		})
		assert.ok(result.isError)
		// SCHEMA IS THE SSOT — empty `intent` violates `minLength: 1`,
		// surfaces via the AJV gate as `haiku_feedback_input_invalid`
		// with the failing field-path in `errors[]`.
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/intent"),
			`expected /intent in errors; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool accepts missing stage (intent-scope feedback)", () => {
		// `stage` is now optional — omitting it logs an intent-scope finding
		// used by the studio-level pre-intent-completion review layer.
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: "",
			title: "Intent-scope finding",
			body: "Cross-stage concern logged by studio-level review",
		})
		assert.ok(!result.isError, getTextResult(result))
		const parsed = JSON.parse(getTextResult(result))
		assert.ok(parsed.feedback_id.startsWith("FB-"))
		// Intent-scope file lives outside any stage directory
		assert.ok(
			parsed.file.includes(`/intents/${intentSlug}/feedback/`),
			`expected intent-scope path, got: ${parsed.file}`,
		)
		assert.ok(!parsed.file.includes("/stages/"))
	})

	test("MCP tool rejects missing title", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "",
			body: "Test",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/title"),
			`expected /title in errors; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool rejects missing body", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "Test",
			body: "",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/body"),
			`expected /body in errors; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool rejects title over 120 chars", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "x".repeat(121),
			body: "Test",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some(
				(e) => e.path === "/title" && /maxLength/i.test(e.keyword),
			),
			`expected /title maxLength violation; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool rejects nonexistent intent", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: "nonexistent-intent",
			stage: stageName,
			title: "Test",
			body: "Test",
		})
		assert.ok(result.isError)
		assert.ok(
			getTextResult(result).includes("intent 'nonexistent-intent' not found"),
		)
	})

	test("MCP tool rejects invalid origin", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: stageName,
			title: "Test",
			body: "Test",
			origin: "invalid-origin",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/origin" && e.keyword === "enum"),
			`expected /origin enum violation; got ${JSON.stringify(parsed.errors)}`,
		)
	})

	test("MCP tool rejects nonexistent stage", () => {
		const result = handleStateTool("haiku_feedback", {
			intent: intentSlug,
			stage: "nonexistent-stage",
			title: "Test",
			body: "Test",
		})
		assert.ok(result.isError)
		assert.ok(
			getTextResult(result).includes("stage 'nonexistent-stage' not found"),
		)
	})

	test("MCP tool accepts all valid origins", () => {
		for (const origin of FEEDBACK_ORIGINS) {
			const result = handleStateTool("haiku_feedback", {
				intent: intentSlug,
				stage: stageName,
				title: `Origin test ${origin}`,
				body: "Testing origin.",
				origin,
			})
			assert.ok(
				!result.isError,
				`Origin '${origin}' should be valid but got error: ${getTextResult(result)}`,
			)
		}
	})

	// ── haiku_feedback_update MCP tool ────────────────────────────────────────

	console.log("\n=== haiku_feedback_update MCP tool ===")

	// v4: haiku_feedback_update is removed. Closure runs through
	// haiku_feedback_advance_hat on the terminal fix-hat;
	// targets.invalidates is set at create time. The 7 deleted tests
	// here asserted v3 update semantics (status field, closed_by
	// agent-vs-human guard, addressed lifecycle stage). All gone with
	// the tool.
	test("haiku_feedback_update returns feedback_update_removed_in_v4", () => {
		const result = handleStateTool("haiku_feedback_update", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 2,
			status: "addressed",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "feedback_update_removed_in_v4")
	})

	// ── haiku_feedback_delete MCP tool ──────────────────────────────────────

	console.log("\n=== haiku_feedback_delete MCP tool ===")

	test("MCP delete rejects pending feedback", () => {
		// FB-004 is pending (from the MCP create test)
		const result = handleStateTool("haiku_feedback_delete", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 4,
		})
		assert.ok(result.isError)
		assert.ok(getTextResult(result).includes("cannot delete pending"))
	})

	test("MCP delete rejects human-authored feedback (agent context)", () => {
		// v4: create a human-authored FB inline (the prior update-test that
		// shared this fixture is gone). Close it via direct frontmatter
		// stamp so the pending-guard passes — agents must use a
		// terminal feedback-assessor advance in the real flow.
		writeFeedbackFile(intentSlug, stageName, {
			title: "v4 human delete-guard fixture",
			body: "Human authored, closed.",
			origin: "user-visual",
		})
		const items = readFeedbackFiles(intentSlug, stageName)
		const humanItem = items.find(
			(i) => i.title === "v4 human delete-guard fixture",
		)
		assert.ok(humanItem, "Expected human item to exist")
		// v4: stamp closed_at directly on the FB so it's no longer
		// "open" (closed_at == null). The delete-pending guard reads
		// closed_at, not the legacy status field.
		// item.file is repo-relative from .haiku root; resolve to abs.
		const fbAbs = `${process.cwd()}/${humanItem.file}`
		try {
			const raw = readFileSync(fbAbs, "utf8")
			if (raw.includes("closed_at: null")) {
				writeFileSync(
					fbAbs,
					raw.replace(/closed_at: null/, `closed_at: ${new Date().toISOString()}`),
				)
			} else if (!raw.includes("closed_at:")) {
				// Pre-v4 fixture without closed_at — add it.
				writeFileSync(
					fbAbs,
					raw.replace(
						/^---\n/m,
						`---\nclosed_at: ${new Date().toISOString()}\n`,
					),
				)
			}
		} catch {
			/* fallback: not found at expected abs path; the delete call below
			 * will return its own error, which the assertion can match against */
		}

		const result = handleStateTool("haiku_feedback_delete", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: Number.parseInt(humanItem.id.replace(/^FB-/, ""), 10),
		})
		assert.ok(result.isError)
		assert.ok(
			getTextResult(result).includes("agents cannot delete human-authored"),
		)
	})

	// v4: "addressed" is no longer a status. The delete-when-addressed
	// path went away with haiku_feedback_update. To delete, close the
	// FB via terminal feedback-assessor advance, then delete.

	test("MCP delete rejects nonexistent feedback", () => {
		const result = handleStateTool("haiku_feedback_delete", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 99,
		})
		assert.ok(result.isError)
		assert.ok(getTextResult(result).includes("not found"))
	})

	test("MCP delete rejects missing feedback_id", () => {
		const result = handleStateTool("haiku_feedback_delete", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: "",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_delete_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/feedback_id"),
			"Expected an error on /feedback_id",
		)
	})

	// ── haiku_feedback_reject MCP tool ──────────────────────────────────────

	console.log("\n=== haiku_feedback_reject MCP tool ===")

	test("rejects agent-authored feedback with reason", () => {
		// FB-004 is pending, agent-authored
		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 4,
			reason: "False positive -- already handled",
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.feedback_id, "FB-004")
		assert.strictEqual(parsed.status, "rejected")
		assert.ok(parsed.message.includes("FB-004 rejected"))
		assert.ok(parsed.message.includes("False positive"))

		// Verify on disk
		const found = findFeedbackFile(intentSlug, stageName, "FB-004")
		assert.strictEqual(found.data.status, "rejected")
		assert.ok(
			found.body.includes(
				"**Rejection reason:** False positive -- already handled",
			),
		)
	})

	test("MCP reject fails on human-authored feedback", () => {
		const items = readFeedbackFiles(intentSlug, stageName)
		const humanItem = items.find((i) => i.author_type === "human")
		assert.ok(humanItem, "Expected a human-authored item")

		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: Number.parseInt(humanItem.id.replace(/^FB-/, ""), 10),
			reason: "Should not work",
		})
		assert.ok(result.isError)
		assert.ok(
			getTextResult(result).includes("agents cannot reject human-authored"),
		)
	})

	test("MCP reject fails on already rejected feedback", () => {
		// FB-004 was just rejected
		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 4,
			reason: "Double reject",
		})
		assert.ok(result.isError)
		assert.ok(getTextResult(result).includes("already 'rejected'"))
	})

	test("MCP reject fails without reason", () => {
		// Create a new agent item to test this
		writeFeedbackFile(intentSlug, stageName, {
			title: "Agent item for reject reason test",
			body: "Test body.",
		})
		const items = readFeedbackFiles(intentSlug, stageName)
		const newItem = items.find(
			(i) => i.title === "Agent item for reject reason test",
		)

		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: Number.parseInt(newItem.id.replace(/^FB-/, ""), 10),
			reason: "",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_reject_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/reason"),
			"Expected an error on /reason",
		)
	})

	test("MCP reject fails for nonexistent feedback", () => {
		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: stageName,
			feedback_id: 99,
			reason: "Does not exist",
		})
		assert.ok(result.isError)
		assert.ok(getTextResult(result).includes("not found"))
	})

	// ── haiku_feedback_list MCP tool ────────────────────────────────────────

	console.log("\n=== haiku_feedback_list MCP tool ===")

	test("lists all feedback for a specific stage", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: intentSlug,
			stage: stageName,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.intent, intentSlug)
		assert.strictEqual(parsed.stage, stageName)
		assert.ok(parsed.count > 0, "Expected at least some items")
		assert.ok(Array.isArray(parsed.items))

		// Each item should have expected fields
		const first = parsed.items[0]
		assert.ok(first.feedback_id)
		assert.ok(first.title)
		assert.ok(first.status)
		assert.ok(first.origin)
		assert.ok(first.author)
		assert.ok(first.author_type)
	})

	test("lists open feedback (closed: false filter)", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: intentSlug,
			stage: stageName,
			closed: false,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		// v4: open = closed_at is null. The list returns matching items;
		// callers don't get a status field on items anymore.
		assert.ok(Array.isArray(parsed.items))
	})

	test("lists feedback across all stages", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: intentSlug,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.stage, null)
		assert.ok(parsed.count > 0)

		// Cross-stage items should include a 'stage' field
		const hasStageField = parsed.items.some((i) => i.stage !== undefined)
		assert.ok(
			hasStageField,
			"Cross-stage listing should include stage field on items",
		)
	})

	test("closed: true filter returns only closed items", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: intentSlug,
			stage: stageName,
			closed: true,
		})
		assert.ok(
			!result.isError,
			`Expected success, got: ${getTextResult(result)}`,
		)
		const parsed = JSON.parse(getTextResult(result))
		// Every returned item must be closed (closed_at set OR legacy
		// terminal status). Prior tests in this file may close FBs as
		// a side-effect; we assert filter correctness, not exact count.
		for (const item of parsed.items) {
			const isClosed =
				(typeof item.closed_at === "string" && item.closed_at.length > 0) ||
				item.status === "closed" ||
				item.status === "rejected" ||
				item.status === "addressed"
			assert.ok(
				isClosed,
				`closed:true filter returned an open item: ${JSON.stringify(item)}`,
			)
		}
	})

	test("MCP list rejects nonexistent intent", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: "nonexistent-intent",
		})
		assert.ok(result.isError)
		assert.ok(
			getTextResult(result).includes("intent 'nonexistent-intent' not found"),
		)
	})

	test("MCP list rejects invalid closed filter (must be boolean)", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: intentSlug,
			closed: "yes",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_list_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/closed"),
			"Expected an error on /closed",
		)
	})

	test("MCP list rejects missing intent", () => {
		const result = handleStateTool("haiku_feedback_list", {
			intent: "",
		})
		assert.ok(result.isError)
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_feedback_list_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/intent"),
			"Expected an error on /intent",
		)
	})

	// ── Cleanup ───────────────────────────────────────────────────────────────

	console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}
