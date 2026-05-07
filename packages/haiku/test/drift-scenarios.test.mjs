#!/usr/bin/env npx tsx
// drift-scenarios.test.mjs — P16 (2026-05-06).
//
// Drift detection scenarios. The sweep walks signed reviews / approvals
// / discovery records and flags any git commit that touched the
// witnessed file AFTER the timestamp was recorded.
//
// Cases covered:
//   1. Spec drift: signed review on a unit, then a commit touches the
//      unit.md → drift_detected with kind: "spec"
//   2. Output drift: signed approval on a unit, then a commit touches
//      a declared output path → kind: "output"
//   3. No-drift baseline: signed but no subsequent commit → empty
//   4. Drift on previous stage's unit: signed in stage A, commit
//      lands later → still detected when the cursor sweeps stage A
//   5. Pre-execute (started_at: null) units skipped — sweep doesn't
//      flag drift on pre-execute spec edits

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"

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
	const root = mkdtempSync(join(tmpdir(), "haiku-drift-"))
	const orig = process.cwd()
	try {
		git(root, "init", "-q")
		git(root, "config", "user.email", "test@haiku.test")
		git(root, "config", "user.name", "haiku test")
		git(root, "commit", "--allow-empty", "-q", "-m", "init")
		const intentDir = join(root, ".haiku", "intents", slug)
		mkdirSync(intentDir, { recursive: true })
		process.chdir(root)
		await fn({ root, intentDir, slug })
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(root, { recursive: true, force: true })
	}
}

function writeUnit(intentDir, stage, name, fm, body = "") {
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	const path = join(unitsDir, `${name}.md`)
	writeFileSync(path, matter.stringify(body || `# ${name}\n`, fm))
	return path
}

// Helper: write the initial fixture, commit, THEN read the latest
// commit timestamp from git and return an `at` value 1s later. This
// guarantees `git log --since=at` excludes the fixture-creation
// commit while still including any drift commits we make next.
function setupAndGetSignTime(root) {
	const epoch = git(
		root,
		"log",
		"-1",
		"--format=%cI",
	)
	const dt = new Date(epoch)
	dt.setSeconds(dt.getSeconds() + 1)
	return dt.toISOString()
}

// Force a commit's date so test ordering is deterministic
// regardless of how fast the test runs.
function commitWithDate(root, message, isoDate) {
	execFileSync(
		"git",
		[
			"-c",
			`user.email=t@t`,
			"-c",
			`user.name=t`,
			"commit",
			"-m",
			message,
			"--date",
			isoDate,
			"--allow-empty",
		],
		{
			cwd: root,
			stdio: "pipe",
			env: { ...process.env, GIT_COMMITTER_DATE: isoDate },
		},
	)
}

// ── Spec drift ──────────────────────────────────────────────────────

test("spec drift: signed review + later commit on unit.md → drift_detected", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-spec", async ({ root, intentDir, slug }) => {
		const initAt = "2026-04-01T00:00:00Z"
		const signedAt = "2026-05-01T00:00:00Z"
		const driftAt = "2026-06-01T00:00:00Z"
		const { bodySha256 } = await import(
			"../src/orchestrator/workflow/sign-slot.js"
		)
		const unitPath = writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: signedAt,
			iterations: [
				{
					hat: "verifier",
					started_at: signedAt,
					completed_at: signedAt,
					result: "advance",
				},
			],
			outputs: [],
		})
		// Re-stamp with the body hash now that the file is written —
		// reviews/approvals records carry sign-time witness hashes.
		const initialBodyHash = bodySha256(unitPath)
		writeFileSync(
			unitPath,
			matter.stringify(matter(readFileSync(unitPath, "utf8")).content, {
				title: "u1",
				depends_on: [],
				started_at: signedAt,
				iterations: [
					{
						hat: "verifier",
						started_at: signedAt,
						completed_at: signedAt,
						result: "advance",
					},
				],
				reviews: { spec: { at: signedAt, body_sha256: initialBodyHash } },
				approvals: {
					spec: { at: signedAt, witnesses: {} },
				},
				outputs: [],
			}),
		)
		// Initial commit with deterministic init date.
		execFileSync("git", ["add", "-A"], { cwd: root, stdio: "pipe" })
		execFileSync(
			"git",
			["commit", "-m", "initial unit", "--date", initAt],
			{
				cwd: root,
				stdio: "pipe",
				env: { ...process.env, GIT_COMMITTER_DATE: initAt },
			},
		)
		// Now drift the spec — keep the FM intact (don't blow it away),
		// just change the body. Real drift = a developer edits content,
		// the FM with started_at still resolves so the sweep sees it.
		// IMPORTANT: preserve the body_sha256 stamped on the review
		// slot so the sweep has a baseline to compare against.
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nDrift! Spec changed.\n", {
				title: "u1",
				depends_on: [],
				started_at: signedAt,
				iterations: [
					{
						hat: "verifier",
						started_at: signedAt,
						completed_at: signedAt,
						result: "advance",
					},
				],
				reviews: { spec: { at: signedAt, body_sha256: initialBodyHash } },
				approvals: {
					spec: { at: signedAt, witnesses: {} },
				},
				outputs: [],
			}),
		)
		execFileSync("git", ["add", "-A"], { cwd: root, stdio: "pipe" })
		execFileSync(
			"git",
			["commit", "-m", "drift: spec edit", "--date", driftAt],
			{
				cwd: root,
				stdio: "pipe",
				env: { ...process.env, GIT_COMMITTER_DATE: driftAt },
			},
		)

		const { runDriftSweep } = await import(
			"../src/orchestrator/workflow/drift-sweep.js"
		)
		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		const specDrift = result.events.filter((e) => e.kind === "spec")
		assert.ok(
			specDrift.length >= 1,
			`expected at least one spec drift event; got ${result.events.length} total`,
		)
		assert.strictEqual(specDrift[0].unit, "unit-01")
		assert.strictEqual(specDrift[0].role, "spec")
	})
})

// ── Output drift ────────────────────────────────────────────────────

test("output drift: signed approval + commit on declared output → drift_detected", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-output", async ({ root, intentDir, slug }) => {
		const fixedAt = "2026-05-01T00:00:00Z"
		const outputRel = "stages/design/SPEC.md"
		const outputAbs = join(intentDir, outputRel)
		mkdirSync(join(intentDir, "stages", "design"), { recursive: true })
		writeFileSync(outputAbs, "Original spec.\n")
		const { buildApprovalRecord, buildReviewRecord } = await import(
			"../src/orchestrator/workflow/sign-slot.js"
		)
		const unitPath = writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: fixedAt,
			iterations: [
				{
					hat: "verifier",
					started_at: fixedAt,
					completed_at: fixedAt,
					result: "advance",
				},
			],
			outputs: [outputRel],
		})
		// Re-stamp with witness hashes (review hashes the unit body,
		// approval hashes declared outputs).
		writeFileSync(
			unitPath,
			matter.stringify(matter(readFileSync(unitPath, "utf8")).content, {
				title: "u1",
				depends_on: [],
				started_at: fixedAt,
				iterations: [
					{
						hat: "verifier",
						started_at: fixedAt,
						completed_at: fixedAt,
						result: "advance",
					},
				],
				reviews: { spec: buildReviewRecord(unitPath) },
				approvals: {
					spec: buildApprovalRecord(intentDir, [outputRel]),
					user: buildApprovalRecord(intentDir, [outputRel]),
				},
				outputs: [outputRel],
			}),
		)
		git(root, "add", "-A")
		git(root, "commit", "-m", "initial", "--date", fixedAt)
		// Drift the output.
		writeFileSync(outputAbs, "Modified spec — drift.\n")
		git(root, "add", "-A")
		git(root, "commit", "-m", "drift: output edited")

		const { runDriftSweep } = await import(
			"../src/orchestrator/workflow/drift-sweep.js"
		)
		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		const outputDrift = result.events.filter((e) => e.kind === "output")
		assert.ok(
			outputDrift.length >= 1,
			`expected output drift event; got events: ${JSON.stringify(result.events)}`,
		)
	})
})

// ── No-drift baseline ───────────────────────────────────────────────

test("no drift baseline: signed unit with no subsequent commits → empty event list", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-clean", async ({ root, intentDir, slug }) => {
		const placeholderAt = "2026-05-01T00:00:00Z"
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: placeholderAt,
			iterations: [
				{
					hat: "verifier",
					started_at: placeholderAt,
					completed_at: placeholderAt,
					result: "advance",
				},
			],
			reviews: { spec: { at: placeholderAt } },
			approvals: { spec: { at: placeholderAt } },
			outputs: [],
		})
		git(root, "add", "-A")
		git(root, "commit", "-m", "clean state")
		const signedAt = setupAndGetSignTime(root)
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: signedAt,
			iterations: [
				{
					hat: "verifier",
					started_at: signedAt,
					completed_at: signedAt,
					result: "advance",
				},
			],
			reviews: { spec: { at: signedAt } },
			approvals: { spec: { at: signedAt } },
			outputs: [],
		})
		git(root, "add", "-A")
		git(root, "commit", "-m", "sign")

		const { runDriftSweep } = await import(
			"../src/orchestrator/workflow/drift-sweep.js"
		)
		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		assert.deepStrictEqual(result.events, [])
	})
})

// ── Pre-execute unit skip ───────────────────────────────────────────

test("pre-execute unit (started_at: null) is skipped from drift sweep", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-pre-execute", async ({ root, intentDir, slug }) => {
		const fixedAt = "2026-05-01T00:00:00Z"
		const unitPath = writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: { spec: { at: fixedAt } }, // Stale review on unstarted unit (rare)
			approvals: {},
			outputs: [],
		})
		git(root, "add", "-A")
		git(root, "commit", "-m", "initial", "--date", fixedAt)
		// Edit the spec — this WOULD normally count as drift, but
		// pre-execute units are always fair game and the sweep skips them.
		writeFileSync(unitPath, "# u1\n\nEdited.\n")
		git(root, "add", "-A")
		git(root, "commit", "-m", "edit on pre-execute unit")

		const { runDriftSweep } = await import(
			"../src/orchestrator/workflow/drift-sweep.js"
		)
		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		assert.strictEqual(result.events.length, 0)
		assert.ok(result.skipped >= 1)
	})
})

// ── Previous stage drift ────────────────────────────────────────────

test("drift on a previous stage's signed unit: cursor can sweep that stage independently", async () => {
	if (!HAS_GIT) return
	await withRepo("drift-prev-stage", async ({ root, intentDir, slug }) => {
		const initAt = "2026-04-01T00:00:00Z"
		const signedAt = "2026-05-01T00:00:00Z"
		const driftAt = "2026-06-01T00:00:00Z"
		// Set up TWO stages. Sign and approve stage A's unit. Drift it.
		const { bodySha256 } = await import(
			"../src/orchestrator/workflow/sign-slot.js"
		)
		const aUnitPath = writeUnit(intentDir, "a", "unit-01", {
			title: "a-unit",
			depends_on: [],
			started_at: signedAt,
			iterations: [
				{
					hat: "verifier",
					started_at: signedAt,
					completed_at: signedAt,
					result: "advance",
				},
			],
			outputs: [],
		})
		const initialAHash = bodySha256(aUnitPath)
		writeFileSync(
			aUnitPath,
			matter.stringify(matter(readFileSync(aUnitPath, "utf8")).content, {
				title: "a-unit",
				depends_on: [],
				started_at: signedAt,
				iterations: [
					{
						hat: "verifier",
						started_at: signedAt,
						completed_at: signedAt,
						result: "advance",
					},
				],
				reviews: { spec: { at: signedAt, body_sha256: initialAHash } },
				approvals: {
					spec: { at: signedAt, witnesses: {} },
					user: { at: signedAt, witnesses: {} },
				},
				outputs: [],
			}),
		)
		writeUnit(intentDir, "b", "unit-01", {
			title: "b-unit",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			outputs: [],
		})
		execFileSync("git", ["add", "-A"], { cwd: root, stdio: "pipe" })
		execFileSync(
			"git",
			["commit", "-m", "two stages", "--date", initAt],
			{
				cwd: root,
				stdio: "pipe",
				env: { ...process.env, GIT_COMMITTER_DATE: initAt },
			},
		)
		// Drift stage A's unit while we're working on stage B.
		// Keep the FM intact (drift = body edit, not FM erasure).
		// Preserve body_sha256 baseline so the sweep can detect drift.
		writeFileSync(
			aUnitPath,
			matter.stringify("# a-unit\n\nDRIFT in previous stage.\n", {
				title: "a-unit",
				depends_on: [],
				started_at: signedAt,
				iterations: [
					{
						hat: "verifier",
						started_at: signedAt,
						completed_at: signedAt,
						result: "advance",
					},
				],
				reviews: { spec: { at: signedAt, body_sha256: initialAHash } },
				approvals: {
					spec: { at: signedAt, witnesses: {} },
					user: { at: signedAt, witnesses: {} },
				},
				outputs: [],
			}),
		)
		execFileSync("git", ["add", "-A"], { cwd: root, stdio: "pipe" })
		execFileSync(
			"git",
			["commit", "-m", "drift: edit prev-stage unit", "--date", driftAt],
			{
				cwd: root,
				stdio: "pipe",
				env: { ...process.env, GIT_COMMITTER_DATE: driftAt },
			},
		)

		const { runDriftSweep } = await import(
			"../src/orchestrator/workflow/drift-sweep.js"
		)
		// Sweep stage A explicitly — the drift sweep is per-stage; the
		// cursor's Track C iterates stages and calls this for each.
		const result = runDriftSweep({
			intentDir,
			stage: "a",
			studio: "test",
			repoRoot: root,
		})
		assert.ok(
			result.events.length >= 1,
			"drift on previous stage's signed unit must surface",
		)
		assert.strictEqual(result.events[0].unit, "unit-01")
	})
})
