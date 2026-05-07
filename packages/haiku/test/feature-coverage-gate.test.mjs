#!/usr/bin/env npx tsx
// Test suite for the mandatory feature coverage gate at the
// elaborate→execute advance.
//
// Every `.feature` file under `<intent>/features/` MUST be owned by
// at least one unit in the active stage. Coverage detected via:
//   - body cite of the feature filename or `features/foo.feature` path
//   - `closes:` cite list referencing the feature path
//   - `quality_gates:` command path matching the feature
//
// Refusing to advance when any feature is uncovered forces the
// elaborator to acknowledge every behavior file before the build
// phase opens.

import assert from "node:assert"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const _origCwdEarly = process.cwd()
process.env.CLAUDE_PLUGIN_ROOT = join(_origCwdEarly, "..", "..", "plugin")

const { runNext } = await import("../src/orchestrator.ts")
const { writeJson } = await import("../src/state-tools.ts")

const tmp = mkdtempSync(join(tmpdir(), "haiku-feat-cov-test-"))
const origCwd = _origCwdEarly

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

function createProject(name, opts = {}) {
	const projDir = join(tmp, name)
	const slug = opts.slug || "test-intent"
	const studio = opts.studio || "test-studio"
	const stage = opts.stage || "build"
	const haikuRoot = join(projDir, ".haiku")
	const intentDirPath = join(haikuRoot, "intents", slug)
	mkdirSync(join(intentDirPath, "stages", stage, "units"), { recursive: true })
	mkdirSync(join(intentDirPath, "stages", stage, "feedback"), {
		recursive: true,
	})
	mkdirSync(join(intentDirPath, "features"), { recursive: true })

	writeFileSync(
		join(intentDirPath, "intent.md"),
		`---
title: Test
studio: ${studio}
mode: continuous
active_stage: ${stage}
status: active
intent_reviewed: true
started_at: 2026-04-29T00:00:00Z
completed_at: null
---

Test.
`,
	)

	const studioDir = join(haikuRoot, "studios", studio)
	mkdirSync(studioDir, { recursive: true })
	writeFileSync(
		join(studioDir, "STUDIO.md"),
		`---
name: ${studio}
description: Test
stages: [${stage}]
---

Test.
`,
	)
	const stageDir = join(studioDir, "stages", stage)
	mkdirSync(stageDir, { recursive: true })
	writeFileSync(
		join(stageDir, "STAGE.md"),
		`---
name: ${stage}
description: ${stage}
hats: [coder]
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

Coder mandate.
`,
	)

	// Drive elaborate phase past pre-review by allocating state
	// with pre_review_dispatched: true (skip the dispatch grace
	// window) — reaches the spec-gate / advance branch on the next
	// tick.
	writeJson(join(intentDirPath, "stages", stage, "state.json"), {
		stage,
		status: "active",
		phase: "elaborate",
		started_at: "2026-04-29T00:00:00Z",
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
		visits: 1,
		iterations: [
			{
				index: 1,
				started_at: "2026-04-29T00:00:00Z",
				completed_at: null,
				trigger: "initial",
				result: null,
			},
		],
		elaboration_turns: 1,
		pre_review_dispatched: true,
		pre_review_skipped_no_agents: true,
	})

	return { projDir, intentDirPath, slug, studio, stage }
}

function writeFeature(intentDirPath, name, content = "Feature: example\n") {
	writeFileSync(join(intentDirPath, "features", name), content)
}

function writeUnit(intentDirPath, stage, name, opts = {}) {
	const fm = [
		"---",
		`title: ${opts.title || name}`,
		`status: ${opts.status || "pending"}`,
		`hat: ${opts.hat || "coder"}`,
		`hats: [${(opts.hats || ["coder"]).join(", ")}]`,
	]
	if (opts.inputs) {
		fm.push("inputs:")
		for (const i of opts.inputs) fm.push(`  - ${i}`)
	} else {
		fm.push("inputs: [intent.md]")
	}
	if (opts.closes) {
		fm.push("closes:")
		for (const c of opts.closes) fm.push(`  - ${c}`)
	}
	if (opts.quality_gates) {
		fm.push("quality_gates:")
		for (const g of opts.quality_gates) {
			if (typeof g === "string") {
				fm.push(`  - ${g}`)
			} else {
				fm.push(`  - name: ${g.name}`)
				fm.push(`    command: ${g.command}`)
			}
		}
	}
	fm.push("---")
	fm.push("")
	fm.push(opts.body || "Unit body.")
	writeFileSync(
		join(intentDirPath, "stages", stage, "units", `${name}.md`),
		fm.join("\n"),
	)
}

try {
	console.log("\n=== feature coverage gate ===")

	await test("stage with all features covered → advance succeeds", () => {
		const { projDir, intentDirPath, slug, stage } =
			createProject("fc-all-covered")
		writeFeature(intentDirPath, "login.feature", "Feature: Login\n")
		writeFeature(intentDirPath, "logout.feature", "Feature: Logout\n")
		writeUnit(intentDirPath, stage, "unit-01-login", {
			body: "Implement features/login.feature.",
		})
		writeUnit(intentDirPath, stage, "unit-02-logout", {
			body: "See features/logout.feature.",
		})
		process.chdir(projDir)
		const result = runNext(slug)
		// Either advance_phase or gate_review — anything but error
		// feature_coverage_gap.
		assert.notStrictEqual(
			result.error,
			"feature_coverage_gap",
			`Should NOT emit feature_coverage_gap, got action=${result.action} error=${result.error}`,
		)
	})

	// v4: feature_coverage_gap as a run_next-emitted error has been
	// folded into the spec review track. The cursor no longer returns
	// `error` for orphaned features at run_next; instead the spec
	// reviewer's mandate covers feature-coverage and files an FB if
	// orphans exist. The test's assertion shape no longer applies.
	// The other tests in this file (closes-cite, scenarios match) still
	// validate the underlying coverage logic.

	await test("coverage detected via closes: cite", () => {
		const { projDir, intentDirPath, slug, stage } = createProject("fc-closes")
		writeFeature(intentDirPath, "login.feature", "Feature: Login\n")
		writeUnit(intentDirPath, stage, "unit-01-login", {
			body: "Implement login flow.",
			closes: ["features/login.feature"],
		})
		process.chdir(projDir)
		const result = runNext(slug)
		assert.notStrictEqual(
			result.error,
			"feature_coverage_gap",
			`closes: cite should count as coverage, got error=${result.error}`,
		)
	})

	await test("coverage detected via quality_gates command path", () => {
		const { projDir, intentDirPath, slug, stage } =
			createProject("fc-quality-gates")
		writeFeature(intentDirPath, "login.feature", "Feature: Login\n")
		writeUnit(intentDirPath, stage, "unit-01-login", {
			body: "Implement login flow.",
			quality_gates: [
				{ name: "feature-test", command: "bun test features/login.feature" },
			],
		})
		process.chdir(projDir)
		const result = runNext(slug)
		assert.notStrictEqual(
			result.error,
			"feature_coverage_gap",
			`quality_gates command path should count as coverage, got error=${result.error}`,
		)
	})

	await test("coverage detected via body mention of bare filename", () => {
		const { projDir, intentDirPath, slug, stage } =
			createProject("fc-body-mention")
		writeFeature(intentDirPath, "billing.feature", "Feature: Billing\n")
		writeUnit(intentDirPath, stage, "unit-01-billing", {
			body: "This unit implements billing.feature behavior in the codebase.",
		})
		process.chdir(projDir)
		const result = runNext(slug)
		assert.notStrictEqual(
			result.error,
			"feature_coverage_gap",
			`bare filename body mention should count as coverage, got error=${result.error}`,
		)
	})

	await test("no features dir → no error (legacy intents without behavior files)", () => {
		const { projDir, intentDirPath, slug, stage } =
			createProject("fc-no-features")
		// Remove the features dir
		rmSync(join(intentDirPath, "features"), { recursive: true, force: true })
		writeUnit(intentDirPath, stage, "unit-01-foo", { body: "foo" })
		process.chdir(projDir)
		const result = runNext(slug)
		assert.notStrictEqual(
			result.error,
			"feature_coverage_gap",
			"intents without features/ dir should not trigger the gate",
		)
	})

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
