// numeric-id-migration.test.mjs — Pins the migration contract for the
// 2026-05-07 numeric-id refactor. Two surfaces, same shape:
//
//   - feedback: `feedback_id: <integer>` on every MCP tool input;
//     filenames pad to 3 digits (`NNN-slug.md`); legacy 2-digit names
//     (`08-slug.md`) still resolve via numeric-prefix matching so an
//     intent authored before this change keeps working.
//
//   - units: `unit: <string>` (slug stays human-readable for
//     depends_on graphs); `unitPath()` resolves either width by
//     `(number, slug)` parts so an agent that calls into a 2-digit
//     intent with `unit-001-foo` and one that calls into a 3-digit
//     intent with `unit-01-foo` both find the file.
//
// Concretely tests:
//   1. FB lookup: 2-digit on disk + agent passes integer 8 → resolves
//   2. FB lookup: 3-digit on disk + agent passes integer 8 → resolves
//   3. Unit path: 2-digit on disk + agent passes 3-digit slug → resolves
//   4. Unit path: 3-digit on disk + agent passes 2-digit slug → resolves

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
import { join } from "node:path"
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
	const repoRoot = mkdtempSync(join(tmpdir(), `nim-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		git(repoRoot, "init", "-q")
		git(repoRoot, "config", "user.email", "test@haiku.test")
		git(repoRoot, "config", "user.name", "haiku test")
		git(repoRoot, "config", "commit.gpgsign", "false")
		git(repoRoot, "commit", "--allow-empty", "-q", "-m", "init")
		git(repoRoot, "checkout", "-q", "-b", `haiku/${slug}/main`)
		const intentDir = join(repoRoot, ".haiku", "intents", slug)
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "intent.md"),
			matter.stringify("# t\n", {
				title: "t",
				studio: "software",
				mode: "discrete",
			}),
		)
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

function writeFb(intentDir, stage, filename, fm, body = "body") {
	const fbDir = join(intentDir, "stages", stage, "feedback")
	mkdirSync(fbDir, { recursive: true })
	writeFileSync(join(fbDir, filename), matter.stringify(body, fm))
}

function writeUnit(intentDir, stage, filename, fm, body = "body") {
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	writeFileSync(join(unitsDir, filename), matter.stringify(body, fm))
}

const baseFm = {
	origin: "user-chat",
	author: "user",
	author_type: "human",
	status: "pending",
	created_at: new Date().toISOString(),
	targets: { unit: null, invalidates: [] },
}

test("FB lookup: legacy 2-digit on disk resolves with integer 8", async () => {
	if (!HAS_GIT) return
	await withRepo("nim-fb2", async ({ intentDir, slug }) => {
		writeFb(intentDir, "design", "08-legacy.md", { title: "legacy 2dig", ...baseFm })
		const { handleStateTool } = await import("../src/state-tools.ts")
		const r = handleStateTool("haiku_feedback_read", {
			intent: slug,
			stage: "design",
			feedback_id: 8,
		})
		assert.ok(!r.isError, `expected lookup to succeed; got: ${JSON.stringify(r)}`)
		const parsed = JSON.parse(r.content[0].text)
		assert.strictEqual(parsed.title, "legacy 2dig")
	})
})

test("FB lookup: 3-digit on disk resolves with integer 8", async () => {
	if (!HAS_GIT) return
	await withRepo("nim-fb3", async ({ intentDir, slug }) => {
		writeFb(intentDir, "design", "008-modern.md", { title: "modern 3dig", ...baseFm })
		const { handleStateTool } = await import("../src/state-tools.ts")
		const r = handleStateTool("haiku_feedback_read", {
			intent: slug,
			stage: "design",
			feedback_id: 8,
		})
		assert.ok(!r.isError, `expected lookup to succeed; got: ${JSON.stringify(r)}`)
		const parsed = JSON.parse(r.content[0].text)
		assert.strictEqual(parsed.title, "modern 3dig")
	})
})

test("FB write: new file uses 3-digit zero padding", async () => {
	if (!HAS_GIT) return
	await withRepo("nim-fbwrite", async ({ intentDir, slug }) => {
		// stage dir must exist for haiku_feedback to resolve target
		mkdirSync(join(intentDir, "stages", "design", "feedback"), { recursive: true })
		const { handleStateTool } = await import("../src/state-tools.ts")
		const r = handleStateTool("haiku_feedback", {
			intent: slug,
			stage: "design",
			title: "padding test",
			body: "body",
			origin: "user-chat",
			author: "user",
		})
		assert.ok(!r.isError, `expected create to succeed; got: ${JSON.stringify(r)}`)
		const parsed = JSON.parse(r.content[0].text)
		// On-disk filename should be NNN-padded
		assert.ok(
			parsed.file?.match(/\/feedback\/\d{3}-/),
			`new FB file should use 3-digit padding; got: ${parsed.file}`,
		)
		// Returned id should be FB-NNN canonical
		assert.ok(
			/^FB-\d{3}$/.test(parsed.feedback_id),
			`expected canonical FB-NNN id; got: ${parsed.feedback_id}`,
		)
	})
})

test("unitPath: legacy 2-digit on disk resolves when agent asks for 3-digit", async () => {
	if (!HAS_GIT) return
	await withRepo("nim-u2", async ({ intentDir, slug }) => {
		writeUnit(intentDir, "design", "unit-01-foo.md", {
			title: "u-foo-2dig",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const { unitPath } = await import("../src/state-tools.ts")
		// Agent passes 3-digit; engine resolves to the 2-digit file.
		const path = unitPath(slug, "design", "unit-001-foo")
		assert.ok(
			path.endsWith("unit-01-foo.md"),
			`expected 2-digit file resolution; got: ${path}`,
		)
	})
})

test("unitPath: 3-digit on disk resolves when agent asks with 2-digit", async () => {
	if (!HAS_GIT) return
	await withRepo("nim-u3", async ({ intentDir, slug }) => {
		writeUnit(intentDir, "design", "unit-001-foo.md", {
			title: "u-foo-3dig",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const { unitPath } = await import("../src/state-tools.ts")
		const path = unitPath(slug, "design", "unit-01-foo")
		assert.ok(
			path.endsWith("unit-001-foo.md"),
			`expected 3-digit file resolution; got: ${path}`,
		)
	})
})

test("unitPath: exact match wins when both widths could resolve", async () => {
	if (!HAS_GIT) return
	// This shouldn't happen in practice (validateUnitNaming rejects
	// duplicate numbers in the same stage), but be defensive: if an
	// exact filename match exists, use it. The width-flexible fallback
	// only fires when there's no exact match.
	await withRepo("nim-uexact", async ({ intentDir, slug }) => {
		writeUnit(intentDir, "design", "unit-001-foo.md", {
			title: "exact match",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const { unitPath } = await import("../src/state-tools.ts")
		const path = unitPath(slug, "design", "unit-001-foo")
		assert.ok(
			path.endsWith("unit-001-foo.md"),
			`expected exact match; got: ${path}`,
		)
	})
})

test("depends_on: width-flexible cross-reference between mixed-width siblings", async () => {
	if (!HAS_GIT) return
	// A unit being written with depends_on referencing a sibling by a
	// different digit width should validate. Critical for migration:
	// a fresh 3-digit unit declares `depends_on: [unit-01-foo]` against
	// a legacy 2-digit sibling and should not be rejected.
	await withRepo("nim-deps", async ({ intentDir, slug }) => {
		// Pre-existing legacy sibling on disk
		writeUnit(intentDir, "design", "unit-01-foo.md", {
			title: "legacy",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		const { handleStateTool } = await import("../src/state-tools.ts")
		// New 3-digit unit references the legacy via 3-digit name —
		// width-flexible match should resolve.
		const r = handleStateTool("haiku_unit_write", {
			intent: slug,
			stage: "design",
			unit: "unit-002-bar",
			body: "## Plan\n\nDoes the thing.\n\n## Completion criteria\n\n- thing exists\n",
			frontmatter: {
				title: "bar",
				depends_on: ["unit-001-foo"], // 3-digit pointer to a 2-digit file
			},
		})
		assert.ok(
			!r.isError,
			`expected width-flexible depends_on to resolve; got: ${JSON.stringify(r)}`,
		)
	})
})
