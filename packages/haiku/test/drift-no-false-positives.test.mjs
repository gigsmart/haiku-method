// drift-no-false-positives.test.mjs
//
// The body-sha256 model decouples agent-authored content from
// engine-managed frontmatter. These tests pin three behaviors:
//
//   1. Engine FM mutations (advancing hats, appending iterations,
//      stamping reviews/approvals) DO NOT trip drift on previously
//      signed reviews. The body hash is unchanged.
//
//   2. Pure file reads (readFileSync, etc.) DO NOT trip drift. No
//      writes happen → nothing changes.
//
//   3. The first sweep on a legacy slot (no body_sha256) does NOT
//      flag drift — it's a baseline grace period. The next sign
//      will populate the hash.

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

async function withRepo(slug, fn) {
	const root = mkdtempSync(join(tmpdir(), "drift-noprob-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		git(root, "init", "-q", "-b", "main")
		git(root, "config", "user.email", "t@t")
		git(root, "config", "user.name", "t")
		git(root, "config", "commit.gpgsign", "false")
		git(root, "commit", "--allow-empty", "-q", "-m", "init")
		const intentDir = join(root, ".haiku", "intents", slug)
		mkdirSync(join(intentDir, "stages", "design", "units"), {
			recursive: true,
		})
		await fn({ root, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
}

test("engine FM mutation does NOT trip drift on previously signed review", async () => {
	if (!HAS_GIT) return
	await withRepo("no-trip-engine", async ({ root, intentDir }) => {
		const { bodySha256 } = await import(`${SRC}/orchestrator/workflow/sign-slot.ts`)
		const { runDriftSweep } = await import(
			`${SRC}/orchestrator/workflow/drift-sweep.ts`
		)
		const unitPath = join(intentDir, "stages", "design", "units", "unit-01.md")
		const body = "# u1\n\nThe agent's prose is here.\n"
		// Sign-time: write the unit, capture the body hash, stamp it
		// on the review slot.
		writeFileSync(
			unitPath,
			matter.stringify(body, {
				title: "u1",
				started_at: "2026-05-01T00:00:00Z",
				iterations: [
					{
						hat: "verifier",
						started_at: "2026-05-01T00:00:00Z",
						completed_at: "2026-05-01T00:00:00Z",
						result: "advance",
					},
				],
				reviews: {
					spec: {
						at: "2026-05-01T00:00:00Z",
						body_sha256: bodySha256(unitPath),
					},
				},
				approvals: {},
				outputs: [],
			}),
		)
		// We have to compute the hash AFTER writing — so re-write
		// once with the correct sha. (In real flow signSlot does
		// this in one go; the test is being explicit.)
		const realHash = bodySha256(unitPath)
		const raw = readFileSync(unitPath, "utf8")
		const parsed = matter(raw)
		const data = parsed.data
		data.reviews.spec.body_sha256 = realHash
		writeFileSync(unitPath, matter.stringify(parsed.content, data))

		// Engine FM mutation: append a new iteration (mimics what
		// haiku_unit_advance_hat does on every hat dispatch).
		const raw2 = readFileSync(unitPath, "utf8")
		const parsed2 = matter(raw2)
		const fm = parsed2.data
		fm.iterations = [
			...fm.iterations,
			{
				hat: "builder",
				started_at: new Date().toISOString(),
				completed_at: new Date().toISOString(),
				result: "advance",
			},
		]
		writeFileSync(unitPath, matter.stringify(parsed2.content, fm))
		git(root, "add", "-A")
		git(root, "commit", "-q", "-m", "haiku: engine appended iteration")

		// Sweep — must NOT report drift, because the body is unchanged.
		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		assert.equal(
			result.events.length,
			0,
			`engine FM mutation tripped drift: ${JSON.stringify(result.events)}`,
		)
	})
})

test("file read does NOT trip drift", async () => {
	if (!HAS_GIT) return
	await withRepo("no-trip-read", async ({ root, intentDir }) => {
		const { bodySha256 } = await import(`${SRC}/orchestrator/workflow/sign-slot.ts`)
		const { runDriftSweep } = await import(
			`${SRC}/orchestrator/workflow/drift-sweep.ts`
		)
		const unitPath = join(intentDir, "stages", "design", "units", "unit-01.md")
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nbody\n", {
				title: "u1",
				started_at: "2026-05-01T00:00:00Z",
				iterations: [
					{
						hat: "verifier",
						started_at: "2026-05-01T00:00:00Z",
						completed_at: "2026-05-01T00:00:00Z",
						result: "advance",
					},
				],
				reviews: {
					spec: {
						at: "2026-05-01T00:00:00Z",
						body_sha256: "placeholder",
					},
				},
				approvals: {},
				outputs: [],
			}),
		)
		const realHash = bodySha256(unitPath)
		const raw = readFileSync(unitPath, "utf8")
		const parsed = matter(raw)
		parsed.data.reviews.spec.body_sha256 = realHash
		writeFileSync(unitPath, matter.stringify(parsed.content, parsed.data))
		git(root, "add", "-A")
		git(root, "commit", "-q", "-m", "stamped sha")

		// Read the file 50 times — purely reads, no writes.
		for (let i = 0; i < 50; i++) {
			readFileSync(unitPath, "utf8")
		}

		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		assert.equal(
			result.events.length,
			0,
			`pure reads tripped drift: ${JSON.stringify(result.events)}`,
		)
	})
})

test("real body change DOES trip drift", async () => {
	if (!HAS_GIT) return
	await withRepo("trip-real", async ({ root, intentDir }) => {
		const { bodySha256 } = await import(`${SRC}/orchestrator/workflow/sign-slot.ts`)
		const { runDriftSweep } = await import(
			`${SRC}/orchestrator/workflow/drift-sweep.ts`
		)
		const unitPath = join(intentDir, "stages", "design", "units", "unit-01.md")
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\noriginal body\n", {
				title: "u1",
				started_at: "2026-05-01T00:00:00Z",
				iterations: [
					{
						hat: "verifier",
						started_at: "2026-05-01T00:00:00Z",
						completed_at: "2026-05-01T00:00:00Z",
						result: "advance",
					},
				],
				reviews: { spec: { at: "2026-05-01T00:00:00Z", body_sha256: "x" } },
				approvals: {},
				outputs: [],
			}),
		)
		const realHash = bodySha256(unitPath)
		const raw1 = readFileSync(unitPath, "utf8")
		const parsed1 = matter(raw1)
		parsed1.data.reviews.spec.body_sha256 = realHash
		writeFileSync(unitPath, matter.stringify(parsed1.content, parsed1.data))

		// Real body change — agent edits prose.
		const raw2 = readFileSync(unitPath, "utf8")
		const parsed2 = matter(raw2)
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nrewritten body\n", parsed2.data),
		)
		git(root, "add", "-A")
		git(root, "commit", "-q", "-m", "real drift")

		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		const specDrift = result.events.filter((e) => e.kind === "spec")
		assert.ok(
			specDrift.length >= 1,
			`real body change should trip drift; got events: ${JSON.stringify(result.events)}`,
		)
	})
})

test("legacy slot (no body_sha256) is treated as baseline — no drift", async () => {
	if (!HAS_GIT) return
	await withRepo("legacy-baseline", async ({ root, intentDir }) => {
		const { runDriftSweep } = await import(
			`${SRC}/orchestrator/workflow/drift-sweep.ts`
		)
		const unitPath = join(intentDir, "stages", "design", "units", "unit-01.md")
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nbody\n", {
				title: "u1",
				started_at: "2026-05-01T00:00:00Z",
				iterations: [
					{
						hat: "verifier",
						started_at: "2026-05-01T00:00:00Z",
						completed_at: "2026-05-01T00:00:00Z",
						result: "advance",
					},
				],
				// Legacy: only `at`, no `body_sha256`.
				reviews: { spec: { at: "2026-05-01T00:00:00Z" } },
				approvals: { spec: { at: "2026-05-01T00:00:00Z" } },
				outputs: [],
			}),
		)
		git(root, "add", "-A")
		git(root, "commit", "-q", "-m", "legacy intent")
		// Even after a body edit, sweep returns 0 events — legacy
		// slots have no baseline to compare against.
		const raw = readFileSync(unitPath, "utf8")
		const parsed = matter(raw)
		writeFileSync(unitPath, matter.stringify("# u1\n\nlater edit\n", parsed.data))
		git(root, "add", "-A")
		git(root, "commit", "-q", "-m", "post-legacy edit")

		const result = runDriftSweep({
			intentDir,
			stage: "design",
			studio: "test",
			repoRoot: root,
		})
		assert.equal(
			result.events.length,
			0,
			`legacy slot must be a grace baseline; got: ${JSON.stringify(result.events)}`,
		)
	})
})

test("filesystem mode (no git): drift detection still works via sha256", async () => {
	// The sweep must NOT depend on git for the detection signal.
	// Build an intent without git init, run the sweep directly.
	const root = mkdtempSync(join(tmpdir(), "drift-fsmode-"))
	const orig = process.cwd()
	process.chdir(root)
	try {
		const intentDir = join(root, ".haiku", "intents", "fs-mode")
		mkdirSync(join(intentDir, "stages", "design", "units"), {
			recursive: true,
		})
		const { bodySha256 } = await import(`${SRC}/orchestrator/workflow/sign-slot.ts`)
		const { runDriftSweep } = await import(
			`${SRC}/orchestrator/workflow/drift-sweep.ts`
		)
		const unitPath = join(intentDir, "stages", "design", "units", "unit-01.md")
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nfs mode body\n", {
				title: "u1",
				started_at: "2026-05-01T00:00:00Z",
				iterations: [
					{
						hat: "verifier",
						started_at: "2026-05-01T00:00:00Z",
						completed_at: "2026-05-01T00:00:00Z",
						result: "advance",
					},
				],
				reviews: { spec: { at: "2026-05-01T00:00:00Z", body_sha256: "x" } },
				approvals: {},
				outputs: [],
			}),
		)
		const realHash = bodySha256(unitPath)
		const raw1 = readFileSync(unitPath, "utf8")
		const parsed1 = matter(raw1)
		parsed1.data.reviews.spec.body_sha256 = realHash
		writeFileSync(unitPath, matter.stringify(parsed1.content, parsed1.data))

		// Drift the body — no git, no commit.
		const raw2 = readFileSync(unitPath, "utf8")
		const parsed2 = matter(raw2)
		writeFileSync(
			unitPath,
			matter.stringify("# u1\n\nfs mode DRIFT\n", parsed2.data),
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
			`fs-mode drift detection: expected spec event; got: ${JSON.stringify(result.events)}`,
		)
		// commits[] is empty in fs mode — no git to enrich with.
		assert.deepEqual(specDrift[0].commits, [])
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})
