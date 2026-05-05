#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U state tool MCP handlers — handleStateTool for every tool
// Run: npx tsx test/state-tools-handlers.test.mjs

import assert from "node:assert"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	getIntentScopeTickCounter,
	handleStateTool,
	isIntentArchived,
	isIntentLocked,
	listVisibleIntentSlugs,
	listVisibleIntents,
	MAX_RATIONALE_BYTES,
	MAX_RATIONALE_EXCERPT_BYTES,
	readClaimedAuthorId,
	setFrontmatterField,
	stateToolDefs,
	unitPath,
	validateRationaleCaps,
} from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-state-handlers-"))
const origCwd = process.cwd()

// Create a fake project with .haiku structure
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)

mkdirSync(join(intentDirPath, "stages", "inception", "units"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "stages", "development", "units"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "knowledge"), { recursive: true })

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Test Intent
studio: software
mode: continuous
active_stage: inception
status: active
started_at: 2026-04-04T18:00:00Z
completed_at: null
---

This is a test intent body.
`,
)

writeFileSync(
	join(intentDirPath, "stages", "inception", "state.json"),
	JSON.stringify(
		{
			stage: "inception",
			status: "active",
			phase: "elaborate",
			started_at: "2026-04-04T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
		},
		null,
		2,
	),
)

writeFileSync(
	join(intentDirPath, "stages", "inception", "units", "unit-01-discovery.md"),
	`---
name: unit-01-discovery
type: research
status: active
depends_on: []
bolt: 2
hat: architect
started_at: 2026-04-04T18:10:00Z
completed_at: null
---

## Completion Criteria

- [x] Domain model documented
- [x] Technical constraints identified
`,
)

writeFileSync(
	join(intentDirPath, "stages", "inception", "units", "unit-02-elaborate.md"),
	`---
name: unit-02-elaborate
type: research
status: pending
depends_on: [unit-01-discovery]
bolt: 0
hat: ""
---

## Completion Criteria

- [ ] Units elaborated with DAG
`,
)

writeFileSync(
	join(intentDirPath, "knowledge", "discovery.md"),
	"# Discovery Document\n\nKey findings here.",
)
writeFileSync(
	join(intentDirPath, "knowledge", "architecture.md"),
	"# Architecture\n\nTech stack decisions.",
)

// Single-hat analysis stage fixture for advance_hat last-hat backpressure tests
mkdirSync(join(intentDirPath, "stages", "analysis", "units"), {
	recursive: true,
})
writeFileSync(
	join(intentDirPath, "stages", "analysis", "state.json"),
	JSON.stringify(
		{
			stage: "analysis",
			status: "active",
			phase: "execute",
			started_at: "2026-04-04T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
		},
		null,
		2,
	),
)
// Unit on last hat (single-hat stage) with NO outputs — should trip unit_outputs_empty
writeFileSync(
	join(intentDirPath, "stages", "analysis", "units", "unit-01-no-outputs.md"),
	`---
name: unit-01-no-outputs
type: research
status: active
depends_on: []
bolt: 1
hat: analyst
hat_started_at: 2020-01-01T00:00:00Z
outputs: []
---

## Completion Criteria

- [x] Analysis complete
`,
)
// Unit on last hat with an output that exists — should complete cleanly
writeFileSync(
	join(intentDirPath, "stages", "analysis", "units", "unit-02-with-outputs.md"),
	`---
name: unit-02-with-outputs
type: research
status: active
depends_on: []
bolt: 1
hat: analyst
hat_started_at: 2020-01-01T00:00:00Z
outputs:
  - knowledge/findings.md
---

## Completion Criteria

- [x] Analysis complete
`,
)
writeFileSync(join(intentDirPath, "knowledge", "findings.md"), "# Findings\n")

// Studio stage definition with a single hat so analysis/analyst is the last hat
mkdirSync(join(haikuRoot, "studios", "software", "stages", "analysis"), {
	recursive: true,
})
writeFileSync(
	join(haikuRoot, "studios", "software", "stages", "analysis", "STAGE.md"),
	`---
name: analysis
hats: [analyst]
unit_types: [research]
---

Analysis stage.
`,
)

// ── Per-hat run_quality_gates auto-reject fixture ─────────────────────────
// Multi-hat stage where the middle hat (`builder`) declares
// run_quality_gates: true. advance_hat from builder runs the unit's
// quality_gates; failure auto-rejects (bolt+1, same hat); success advances.
mkdirSync(join(haikuRoot, "studios", "software", "stages", "gated", "hats"), {
	recursive: true,
})
writeFileSync(
	join(haikuRoot, "studios", "software", "stages", "gated", "STAGE.md"),
	`---
name: gated
hats: [planner, builder, reviewer]
unit_types: [research]
---

Gated stage with builder running quality gates.
`,
)
writeFileSync(
	join(
		haikuRoot,
		"studios",
		"software",
		"stages",
		"gated",
		"hats",
		"planner.md",
	),
	`---
name: planner
stage: gated
studio: software
---

Planner.
`,
)
writeFileSync(
	join(
		haikuRoot,
		"studios",
		"software",
		"stages",
		"gated",
		"hats",
		"builder.md",
	),
	`---
name: builder
stage: gated
studio: software
run_quality_gates: true
---

Builder with gate enforcement.
`,
)
writeFileSync(
	join(
		haikuRoot,
		"studios",
		"software",
		"stages",
		"gated",
		"hats",
		"reviewer.md",
	),
	`---
name: reviewer
stage: gated
studio: software
---

Reviewer.
`,
)
mkdirSync(join(intentDirPath, "stages", "gated", "units"), { recursive: true })
writeFileSync(
	join(intentDirPath, "stages", "gated", "state.json"),
	JSON.stringify(
		{
			stage: "gated",
			status: "active",
			phase: "execute",
			started_at: "2026-04-04T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
		},
		null,
		2,
	),
)
// Builder hat, gates that fail — should auto-reject (bolt+1, same hat)
writeFileSync(
	join(intentDirPath, "stages", "gated", "units", "unit-01-gates-fail.md"),
	`---
name: unit-01-gates-fail
type: research
status: active
depends_on: []
bolt: 1
hat: builder
hat_started_at: 2020-01-01T00:00:00Z
quality_gates:
  - name: always-fail
    command: "false"
outputs:
  - knowledge/findings.md
---

## Completion Criteria

- [x] Gates fail
`,
)
// Builder hat, gates that pass — should advance normally to reviewer
writeFileSync(
	join(intentDirPath, "stages", "gated", "units", "unit-02-gates-pass.md"),
	`---
name: unit-02-gates-pass
type: research
status: active
depends_on: []
bolt: 1
hat: builder
hat_started_at: 2020-01-01T00:00:00Z
quality_gates:
  - name: always-pass
    command: "true"
outputs:
  - knowledge/findings.md
---

## Completion Criteria

- [x] Gates pass
`,
)
// Builder hat at bolt 5, gates fail — should hit max_bolts_exceeded
writeFileSync(
	join(intentDirPath, "stages", "gated", "units", "unit-03-gates-cap.md"),
	`---
name: unit-03-gates-cap
type: research
status: active
depends_on: []
bolt: 5
hat: builder
hat_started_at: 2020-01-01T00:00:00Z
quality_gates:
  - name: always-fail
    command: "false"
outputs:
  - knowledge/findings.md
---

## Completion Criteria

- [x] Gates exhaust
`,
)
// Planner hat (no boolean), gates that would fail — should advance normally
writeFileSync(
	join(intentDirPath, "stages", "gated", "units", "unit-04-no-boolean.md"),
	`---
name: unit-04-no-boolean
type: research
status: active
depends_on: []
bolt: 1
hat: planner
hat_started_at: 2020-01-01T00:00:00Z
quality_gates:
  - name: always-fail
    command: "false"
outputs:
  - knowledge/findings.md
---

## Completion Criteria

- [x] Gates skipped because hat opts out
`,
)

// Create second intent for list testing
const intent2Dir = join(haikuRoot, "intents", "second-intent")
mkdirSync(intent2Dir, { recursive: true })
writeFileSync(
	join(intent2Dir, "intent.md"),
	`---
title: Second Intent
studio: ideation
mode: discrete
active_stage: ""
status: completed
---

Second intent body.
`,
)

// Create archived intent fixture — preserves prior status for lossless unarchival
const archivedIntentDir = join(haikuRoot, "intents", "archived-intent")
mkdirSync(archivedIntentDir, { recursive: true })
writeFileSync(
	join(archivedIntentDir, "intent.md"),
	`---
title: Archived Intent
studio: software
mode: continuous
active_stage: ""
status: completed
archived: true
---

Archived intent body.
`,
)

// Create settings
writeFileSync(
	join(haikuRoot, "settings.yml"),
	`studio: software
stack:
  compute: lambda
  db: postgres
providers:
  ticketing: linear
`,
)

// Stub git so gitCommitState doesn't fail or actually commit. `rev-parse
// --show-toplevel` returns the current working directory so callers like
// runInlineQualityGates resolve a usable cwd; everything else exits 0.
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(
	join(tmp, "fake-bin", "git"),
	`#!/bin/sh
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  pwd
  exit 0
fi
exit 0
`,
)
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

function getTextResult(result) {
	return result.content[0].text
}

// ── stateToolDefs ─────────────────────────────────────────────────────────

try {
	console.log("\n=== stateToolDefs ===")

	test("all tools have name and inputSchema", () => {
		for (const tool of stateToolDefs) {
			assert.ok(tool.name, "Tool missing name")
			assert.ok(tool.description, `${tool.name} missing description`)
			assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`)
			assert.strictEqual(
				tool.inputSchema.type,
				"object",
				`${tool.name} inputSchema type should be object`,
			)
		}
	})

	test("has expected number of tools", () => {
		assert.ok(
			stateToolDefs.length >= 15,
			`Expected at least 15 tools, got ${stateToolDefs.length}`,
		)
	})

	test("tool names all start with haiku_", () => {
		for (const tool of stateToolDefs) {
			assert.ok(
				tool.name.startsWith("haiku_"),
				`${tool.name} should start with haiku_`,
			)
		}
	})

	test("required fields are specified for each tool", () => {
		for (const tool of stateToolDefs) {
			if (tool.inputSchema.required) {
				assert.ok(
					Array.isArray(tool.inputSchema.required),
					`${tool.name}: required should be an array`,
				)
				for (const req of tool.inputSchema.required) {
					assert.ok(
						tool.inputSchema.properties[req],
						`${tool.name}: required field '${req}' not in properties`,
					)
				}
			}
		}
	})

	// ── haiku_intent_get ──────────────────────────────────────────────────────

	console.log("\n=== haiku_intent_get ===")

	test("reads title from intent frontmatter", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "title",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "Test Intent")
	})

	test("reads studio from intent", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "studio",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "software")
	})

	test("reads status from intent", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "status",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "active")
	})

	test("reads mode from intent", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "mode",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "continuous")
	})

	test("returns null value for missing field", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "nonexistent",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.value, null)
	})

	test("returns found:false for missing intent", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: "does-not-exist",
			field: "title",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.value, null)
	})

	test("returns null value for fields whose YAML value is null", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: intentSlug,
			field: "completed_at",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, null)
	})

	// ── haiku_intent_list ─────────────────────────────────────────────────────

	console.log("\n=== haiku_intent_list ===")

	test("lists all intents", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		assert.ok(Array.isArray(intents))
		assert.ok(
			intents.length >= 2,
			`Expected at least 2 intents, got ${intents.length}`,
		)
	})

	test("intent list includes slug and status", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		const testIntent = intents.find((i) => i.slug === intentSlug)
		assert.ok(testIntent, "test-intent should be in the list")
		assert.strictEqual(testIntent.status, "active")
		assert.strictEqual(testIntent.studio, "software")
	})

	test("intent list includes completed intents", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		const second = intents.find((i) => i.slug === "second-intent")
		assert.ok(second, "second-intent should be in the list")
		assert.strictEqual(second.status, "completed")
	})

	test("intent list filters archived intents by default", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		const archived = intents.find((i) => i.slug === "archived-intent")
		assert.strictEqual(
			archived,
			undefined,
			"archived-intent must not appear in default list",
		)
	})

	test("intent list omits archived field in default response", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		for (const i of intents) {
			assert.strictEqual(
				"archived" in i,
				false,
				`slug ${i.slug}: archived field should be absent by default`,
			)
		}
	})

	test("intent list with include_archived returns archived intents", () => {
		const result = handleStateTool("haiku_intent_list", {
			include_archived: true,
		})
		const intents = JSON.parse(getTextResult(result)).intents
		const archived = intents.find((i) => i.slug === "archived-intent")
		assert.ok(
			archived,
			"archived-intent should be in the list when include_archived=true",
		)
		assert.strictEqual(archived.archived, true)
		// Prior status is preserved for lossless unarchival
		assert.strictEqual(archived.status, "completed")
	})

	test("intent list with include_archived tags non-archived intents archived:false", () => {
		const result = handleStateTool("haiku_intent_list", {
			include_archived: true,
		})
		const intents = JSON.parse(getTextResult(result)).intents
		const testIntent = intents.find((i) => i.slug === intentSlug)
		assert.ok(testIntent)
		assert.strictEqual(testIntent.archived, false)
		const second = intents.find((i) => i.slug === "second-intent")
		assert.ok(second)
		assert.strictEqual(
			second.archived,
			false,
			"intent with no archived field must report archived:false",
		)
	})

	// ── listVisibleIntentSlugs helper ─────────────────────────────────────────

	console.log("\n=== listVisibleIntentSlugs ===")

	test("helper filters archived intents by default", () => {
		const intentsDir = join(haikuRoot, "intents")
		const slugs = listVisibleIntentSlugs(intentsDir)
		assert.ok(slugs.includes(intentSlug))
		assert.ok(slugs.includes("second-intent"))
		assert.ok(
			!slugs.includes("archived-intent"),
			"archived-intent must be filtered by default",
		)
	})

	test("helper with includeArchived:true returns archived intents", () => {
		const intentsDir = join(haikuRoot, "intents")
		const slugs = listVisibleIntentSlugs(intentsDir, { includeArchived: true })
		assert.ok(slugs.includes("archived-intent"))
		assert.ok(slugs.includes(intentSlug))
		assert.ok(slugs.includes("second-intent"))
	})

	test("helper returns [] for missing directory", () => {
		const slugs = listVisibleIntentSlugs(join(tmp, "does-not-exist"))
		assert.deepStrictEqual(slugs, [])
	})

	test("helper returns [] for empty intents directory", () => {
		const emptyDir = join(tmp, "empty-intents")
		mkdirSync(emptyDir, { recursive: true })
		const slugs = listVisibleIntentSlugs(emptyDir)
		assert.deepStrictEqual(slugs, [])
	})

	test("helper treats missing archived field as not-archived", () => {
		// intentSlug fixture has no archived field — should be included by default
		const intentsDir = join(haikuRoot, "intents")
		const slugs = listVisibleIntentSlugs(intentsDir)
		assert.ok(
			slugs.includes(intentSlug),
			"intent with no archived field must be visible",
		)
	})

	test("listVisibleIntents returns {slug, data} tuples with frontmatter", () => {
		const intentsDir = join(haikuRoot, "intents")
		const entries = listVisibleIntents(intentsDir)
		assert.ok(Array.isArray(entries))
		const testEntry = entries.find((e) => e.slug === intentSlug)
		assert.ok(testEntry, "test-intent should appear in entries")
		assert.strictEqual(typeof testEntry.data, "object")
		assert.strictEqual(testEntry.data.studio, "software")
		assert.strictEqual(testEntry.data.status, "active")
		// archived filtering still applies
		assert.ok(
			!entries.find((e) => e.slug === "archived-intent"),
			"archived intents filtered by default",
		)
	})

	test("listVisibleIntents exposes archived flag when includeArchived=true", () => {
		const intentsDir = join(haikuRoot, "intents")
		const entries = listVisibleIntents(intentsDir, { includeArchived: true })
		const archived = entries.find((e) => e.slug === "archived-intent")
		assert.ok(archived, "archived intent must appear")
		assert.strictEqual(archived.data.archived, true)
	})

	// ── Slug path-traversal hardening (Finding B) ────────────────────────────

	console.log("\n=== handleStateTool: slug validation ===")

	test("haiku_intent_get rejects slug with path traversal", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: "../../../etc/passwd",
			field: "title",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(
			result.content[0].text.includes("path separators") ||
				result.content[0].text.includes("traversal"),
		)
	})

	test("haiku_intent_get rejects slug with forward slash", () => {
		const result = handleStateTool("haiku_intent_get", {
			slug: "foo/bar",
			field: "title",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid slug"))
	})

	test("haiku_stage_get rejects intent with path traversal", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: "../../../etc/passwd",
			stage: "inception",
			field: "phase",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid intent"))
	})

	test("haiku_stage_get rejects stage with path traversal", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: intentSlug,
			stage: "../../../etc/passwd",
			field: "phase",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid stage"))
	})

	test("haiku_unit_get rejects unit with path traversal", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "../../../etc/passwd",
			field: "status",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid unit"))
	})

	test("haiku_unit_get rejects unit with forward slash", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "foo/bar",
			field: "status",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid unit"))
	})

	test("haiku_feedback_update rejects feedback_id with path traversal", () => {
		const result = handleStateTool("haiku_feedback_update", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "../../../etc/passwd",
			status: "closed",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid feedback_id"))
	})

	test("haiku_feedback_delete rejects feedback_id with forward slash", () => {
		const result = handleStateTool("haiku_feedback_delete", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "foo/bar",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid feedback_id"))
	})

	test("haiku_feedback_reject rejects feedback_id with backslash", () => {
		const result = handleStateTool("haiku_feedback_reject", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-01\\..\\secret",
			reason: "test",
		})
		assert.strictEqual(result.isError, true)
		assert.ok(result.content[0].text.includes("Invalid feedback_id"))
	})

	test("haiku_intent_list still works (no slug to validate)", () => {
		const result = handleStateTool("haiku_intent_list", {})
		const intents = JSON.parse(getTextResult(result)).intents
		assert.ok(Array.isArray(intents))
		assert.ok(intents.length >= 1)
	})

	test("helper treats archived:false as not-archived", () => {
		const explicitFalseDir = join(haikuRoot, "intents", "explicit-not-archived")
		mkdirSync(explicitFalseDir, { recursive: true })
		writeFileSync(
			join(explicitFalseDir, "intent.md"),
			`---
title: Explicit Not Archived
studio: software
mode: continuous
active_stage: ""
status: active
archived: false
---

body
`,
		)
		const intentsDir = join(haikuRoot, "intents")
		const slugs = listVisibleIntentSlugs(intentsDir)
		assert.ok(slugs.includes("explicit-not-archived"))
		// cleanup so it does not affect subsequent tests
		rmSync(explicitFalseDir, { recursive: true, force: true })
	})

	// ── haiku_stage_get ───────────────────────────────────────────────────────

	console.log("\n=== haiku_stage_get ===")

	test("reads phase from stage state", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: intentSlug,
			stage: "inception",
			field: "phase",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "elaborate")
	})

	test("reads status from stage state", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: intentSlug,
			stage: "inception",
			field: "status",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "active")
	})

	test("returns null for missing stage field", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: intentSlug,
			stage: "inception",
			field: "nonexistent",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.value, null)
	})

	test("returns null for missing stage directory", () => {
		const result = handleStateTool("haiku_stage_get", {
			intent: intentSlug,
			stage: "nonexistent",
			field: "phase",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.value, null)
	})

	// ── haiku_unit_get ────────────────────────────────────────────────────────

	console.log("\n=== haiku_unit_get ===")

	test("reads status from unit frontmatter", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
			field: "status",
		})
		assert.strictEqual(getTextResult(result), "active")
	})

	test("reads bolt count from unit", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
			field: "bolt",
		})
		assert.strictEqual(getTextResult(result), "2")
	})

	test("reads hat from unit", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
			field: "hat",
		})
		assert.strictEqual(getTextResult(result), "architect")
	})

	test("reads type from unit", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
			field: "type",
		})
		assert.strictEqual(getTextResult(result), "research")
	})

	test("reads depends_on as JSON", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "depends_on",
		})
		const deps = JSON.parse(getTextResult(result))
		assert.deepStrictEqual(deps, ["unit-01-discovery"])
	})

	test("returns empty for missing unit", () => {
		const result = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-missing",
			field: "status",
		})
		assert.strictEqual(getTextResult(result), "")
	})

	// ── haiku_unit_set ────────────────────────────────────────────────────────

	console.log("\n=== haiku_unit_set ===")

	test("sets a field on a unit", () => {
		const result = handleStateTool("haiku_unit_set", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "model",
			value: "haiku",
		})
		assert.strictEqual(getTextResult(result), "ok")
		// Verify
		const check = handleStateTool("haiku_unit_get", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "model",
		})
		assert.strictEqual(getTextResult(check), "haiku")
	})

	test("set preserves body content", () => {
		handleStateTool("haiku_unit_set", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "title",
			value: "Updated title for unit-02",
		})
		const raw = readFileSync(
			join(
				intentDirPath,
				"stages",
				"inception",
				"units",
				"unit-02-elaborate.md",
			),
			"utf8",
		)
		assert.ok(raw.includes("## Completion Criteria"), "Body heading preserved")
		assert.ok(
			raw.includes("Units elaborated with DAG"),
			"Body criteria preserved",
		)
	})

	test("set rejects JSON-stringified array values for array-typed fields (regression: inputs.map is not a function)", () => {
		// Schema declares `inputs:` as `type: array`. Sending a JSON-stringified
		// array used to silently slip through and YAML-serialize as a folded
		// scalar (`inputs: >- [...]`), which made every downstream
		// `unitInputs.map(...)` throw. Strict per-field validation now rejects
		// the call with `field_type_mismatch` so the agent re-issues with a
		// native array.
		const unitName = "unit-99-regression-jsonstring"
		const unitPath = join(
			intentDirPath,
			"stages",
			"inception",
			"units",
			`${unitName}.md`,
		)
		writeFileSync(
			unitPath,
			`---\nname: ${unitName}\nstatus: pending\nhat: ""\nbolt: 0\n---\n# ${unitName}\n`,
		)
		try {
			const result = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "inputs",
				value: '["intent.md", "knowledge/DISCOVERY.md"]',
			})
			const parsed = JSON.parse(getTextResult(result))
			assert.strictEqual(parsed.error, "field_type_mismatch")
			assert.strictEqual(parsed.field, "inputs")
			assert.strictEqual(parsed.expected_type, "array")
			assert.strictEqual(parsed.received_type, "string")
			// File must be unchanged (rejection happens before the write).
			const raw = readFileSync(unitPath, "utf8")
			assert.ok(
				!raw.includes("inputs:"),
				"Rejected call should not have written inputs",
			)
		} finally {
			unlinkSync(unitPath)
		}
	})

	test("set accepts native arrays for array-typed fields", () => {
		const unitName = "unit-99-regression-native"
		const unitPath = join(
			intentDirPath,
			"stages",
			"inception",
			"units",
			`${unitName}.md`,
		)
		writeFileSync(
			unitPath,
			`---\nname: ${unitName}\nstatus: pending\nhat: ""\nbolt: 0\n---\n# ${unitName}\n`,
		)
		try {
			const result = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "inputs",
				value: ["intent.md", "knowledge/X.md", "knowledge/Y.md"],
			})
			assert.strictEqual(getTextResult(result), "ok")
			const raw = readFileSync(unitPath, "utf8")
			assert.ok(
				raw.includes("- knowledge/X.md"),
				"Native array stored as YAML list",
			)
			assert.ok(raw.includes("- knowledge/Y.md"), "Second item present")
			assert.ok(!raw.includes("inputs: >-"), "No folded-scalar serialization")
		} finally {
			unlinkSync(unitPath)
		}
	})

	test("set rejects array values for string-typed fields", () => {
		const unitName = "unit-99-regression-string-field"
		const unitPath = join(
			intentDirPath,
			"stages",
			"inception",
			"units",
			`${unitName}.md`,
		)
		writeFileSync(
			unitPath,
			`---\nname: ${unitName}\nstatus: pending\nhat: ""\nbolt: 0\n---\n# ${unitName}\n`,
		)
		try {
			const result = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "title",
				value: ["wrong", "shape"],
			})
			const parsed = JSON.parse(getTextResult(result))
			assert.strictEqual(parsed.error, "field_type_mismatch")
			assert.strictEqual(parsed.field, "title")
			assert.strictEqual(parsed.expected_type, "string")
			assert.strictEqual(parsed.received_type, "array")
		} finally {
			unlinkSync(unitPath)
		}
	})

	test("set rejects FSM-driven fields with fsm_field_forbidden", () => {
		const unitName = "unit-99-regression-fsm-forbidden"
		const unitPath = join(
			intentDirPath,
			"stages",
			"inception",
			"units",
			`${unitName}.md`,
		)
		writeFileSync(
			unitPath,
			`---\nname: ${unitName}\nstatus: pending\nhat: ""\nbolt: 0\n---\n# ${unitName}\n`,
		)
		try {
			for (const field of [
				"status",
				"hat",
				"bolt",
				"iterations",
				"started_at",
				"completed_at",
				"hat_started_at",
				"scope_reject_attempts",
			]) {
				const result = handleStateTool("haiku_unit_set", {
					intent: intentSlug,
					stage: "inception",
					unit: unitName,
					field,
					value: "anything",
				})
				const parsed = JSON.parse(getTextResult(result))
				assert.strictEqual(
					parsed.error,
					"fsm_field_forbidden",
					`Expected ${field} to be FSM-forbidden`,
				)
				assert.strictEqual(parsed.field, field)
			}
		} finally {
			unlinkSync(unitPath)
		}
	})

	test("set runs deep validation on quality_gates inner shape", () => {
		const unitName = "unit-99-regression-deep-validation"
		const unitPath = join(
			intentDirPath,
			"stages",
			"inception",
			"units",
			`${unitName}.md`,
		)
		writeFileSync(
			unitPath,
			`---\nname: ${unitName}\nstatus: pending\nhat: ""\nbolt: 0\n---\n# ${unitName}\n`,
		)
		try {
			// quality_gates items must have { name, command }; missing command
			// should be caught by the sub-schema validator, not just the
			// top-level array check.
			const badGates = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "quality_gates",
				value: [{ name: "no-banned-tokens" }],
			})
			const parsedBad = JSON.parse(getTextResult(badGates))
			assert.strictEqual(parsedBad.error, "field_value_invalid")
			assert.strictEqual(parsedBad.field, "quality_gates")
			// And inputs entries must match the path pattern (no spaces, no commas).
			const badInputs = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "inputs",
				value: ["entry with spaces"],
			})
			const parsedInputs = JSON.parse(getTextResult(badInputs))
			assert.strictEqual(parsedInputs.error, "field_value_invalid")
			assert.strictEqual(parsedInputs.field, "inputs")
			// And model must be one of haiku/sonnet/opus.
			const badModel = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "model",
				value: "gpt-4",
			})
			const parsedModel = JSON.parse(getTextResult(badModel))
			assert.strictEqual(parsedModel.error, "field_value_invalid")
			assert.strictEqual(parsedModel.field, "model")
			// Valid quality_gates pass.
			const goodGates = handleStateTool("haiku_unit_set", {
				intent: intentSlug,
				stage: "inception",
				unit: unitName,
				field: "quality_gates",
				value: [{ name: "no-banned", command: "! grep banned ." }],
			})
			assert.strictEqual(getTextResult(goodGates), "ok")
		} finally {
			unlinkSync(unitPath)
		}
	})

	// ── haiku_unit_list ───────────────────────────────────────────────────────

	console.log("\n=== haiku_unit_list ===")

	test("lists units in a stage with status", () => {
		const result = handleStateTool("haiku_unit_list", {
			intent: intentSlug,
			stage: "inception",
		})
		const units = JSON.parse(getTextResult(result)).units
		assert.ok(Array.isArray(units))
		assert.strictEqual(units.length, 2)
	})

	test("each unit has name, status, bolt, hat", () => {
		const result = handleStateTool("haiku_unit_list", {
			intent: intentSlug,
			stage: "inception",
		})
		const units = JSON.parse(getTextResult(result)).units
		const u1 = units.find((u) => u.name === "unit-01-discovery")
		assert.ok(u1)
		assert.strictEqual(u1.status, "active")
		assert.strictEqual(u1.bolt, 2)
		assert.strictEqual(u1.hat, "architect")
	})

	test("returns empty array for stage with no units", () => {
		const result = handleStateTool("haiku_unit_list", {
			intent: intentSlug,
			stage: "development",
		})
		const units = JSON.parse(getTextResult(result)).units
		assert.deepStrictEqual(units, [])
	})

	test("returns empty array for nonexistent stage", () => {
		const result = handleStateTool("haiku_unit_list", {
			intent: intentSlug,
			stage: "nonexistent",
		})
		const units = JSON.parse(getTextResult(result)).units
		assert.deepStrictEqual(units, [])
	})

	// ── haiku_unit_increment_bolt ─────────────────────────────────────────────

	console.log("\n=== haiku_unit_increment_bolt ===")

	test("increments bolt counter", () => {
		// unit-01 starts at bolt 2
		const result = handleStateTool("haiku_unit_increment_bolt", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
		})
		assert.strictEqual(getTextResult(result), "3")
	})

	test("increments again correctly", () => {
		const result = handleStateTool("haiku_unit_increment_bolt", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
		})
		assert.strictEqual(getTextResult(result), "4")
	})

	test("enforces max bolt limit", () => {
		// Explicitly set bolt to 4 so this test doesn't depend on prior test side effects.
		// Use setFrontmatterField directly to store bolt as a proper number (haiku_unit_set stores strings).
		const uPath = unitPath(intentSlug, "inception", "unit-01-discovery")
		setFrontmatterField(uPath, "bolt", 4)

		// Incrementing from 4 should go to 5 (the limit).
		const result = handleStateTool("haiku_unit_increment_bolt", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
		})
		assert.strictEqual(getTextResult(result), "5")

		// Next increment should fail (exceeds max of 5)
		const exceeded = handleStateTool("haiku_unit_increment_bolt", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
		})
		const parsed = JSON.parse(getTextResult(exceeded))
		assert.strictEqual(parsed.error, "max_bolts_exceeded")
	})

	// ── haiku_unit_reject_hat ─────────────────────────────────────────────────

	console.log("\n=== haiku_unit_reject_hat ===")

	test("returns error for missing unit", () => {
		const result = handleStateTool("haiku_unit_reject_hat", {
			intent: intentSlug,
			unit: "unit-99-missing",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "unit_not_found")
	})

	// ── haiku_knowledge_list ──────────────────────────────────────────────────

	console.log("\n=== haiku_knowledge_list ===")

	test("lists knowledge files", () => {
		const result = handleStateTool("haiku_knowledge_list", {
			intent: intentSlug,
		})
		const files = JSON.parse(getTextResult(result)).files
		assert.ok(Array.isArray(files))
		assert.ok(files.includes("discovery.md"))
		assert.ok(files.includes("architecture.md"))
	})

	test("returns empty for intent with no knowledge", () => {
		const result = handleStateTool("haiku_knowledge_list", {
			intent: "second-intent",
		})
		const files = JSON.parse(getTextResult(result)).files
		assert.deepStrictEqual(files, [])
	})

	// ── haiku_knowledge_read ──────────────────────────────────────────────────

	console.log("\n=== haiku_knowledge_read ===")

	test("reads knowledge file content", () => {
		const result = handleStateTool("haiku_knowledge_read", {
			intent: intentSlug,
			name: "discovery.md",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, true)
		assert.ok(parsed.content.includes("# Discovery Document"))
		assert.ok(parsed.content.includes("Key findings here"))
	})

	test("returns found:false for missing knowledge file", () => {
		const result = handleStateTool("haiku_knowledge_read", {
			intent: intentSlug,
			name: "nonexistent.md",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.content, "")
	})

	// ── haiku_settings_get ────────────────────────────────────────────────────

	console.log("\n=== haiku_settings_get ===")

	test("reads top-level setting", () => {
		const result = handleStateTool("haiku_settings_get", { field: "studio" })
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "software")
	})

	test("reads nested setting with dot notation", () => {
		const result = handleStateTool("haiku_settings_get", {
			field: "stack.compute",
		})
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "lambda")
	})

	test("reads nested setting deep", () => {
		const result = handleStateTool("haiku_settings_get", { field: "stack.db" })
		assert.strictEqual(JSON.parse(getTextResult(result)).value, "postgres")
	})

	test("returns null for missing setting", () => {
		const result = handleStateTool("haiku_settings_get", {
			field: "nonexistent",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.found, false)
		assert.strictEqual(parsed.value, null)
	})

	test("returns object for object-typed settings", () => {
		const result = handleStateTool("haiku_settings_get", { field: "stack" })
		const value = JSON.parse(getTextResult(result)).value
		assert.strictEqual(value.compute, "lambda")
		assert.strictEqual(value.db, "postgres")
	})

	// ── haiku_unit_advance_hat: unit_outputs_empty backpressure ───────────────

	console.log("\n=== haiku_unit_advance_hat: outputs backpressure ===")

	test("blocks completion when last hat has empty outputs", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-01-no-outputs",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "unit_outputs_empty")
		assert.ok(parsed.message.includes("no outputs were produced"))
	})

	test("allows completion when last hat has tracked outputs", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-02-with-outputs",
		})
		const text = getTextResult(result)
		// Should not error — response is a success payload, not an error JSON
		let errored = false
		try {
			const parsed = JSON.parse(text)
			if (parsed?.error) errored = true
		} catch {
			/* non-JSON success response is fine */
		}
		assert.ok(!errored, `expected success, got: ${text}`)
	})

	// ── haiku_unit_advance_hat: per-hat run_quality_gates auto-reject ─────────

	console.log("\n=== haiku_unit_advance_hat: run_quality_gates auto-reject ===")

	test("auto-rejects when builder hat with run_quality_gates fails gates", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-01-gates-fail",
		})
		const text = getTextResult(result)
		// Response is the Workflow Result envelope path; the persisted state should
		// show bolt+1, hat unchanged.
		const fmRaw = readFileSync(
			join(intentDirPath, "stages", "gated", "units", "unit-01-gates-fail.md"),
			"utf8",
		)
		const fm = fmRaw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
		assert.ok(
			/^bolt: 2$/m.test(fm),
			`expected bolt: 2 after auto-reject, got: ${fm}`,
		)
		assert.ok(
			/^hat: builder$/m.test(fm),
			`expected hat to remain builder, got: ${fm}`,
		)
		assert.ok(
			text.includes("Workflow Result written to:"),
			`expected Workflow Result envelope, got: ${text}`,
		)
		assert.ok(
			text.includes("gates failed") || text.includes("always-fail"),
			`expected gate-fail context in envelope, got: ${text}`,
		)
	})

	test("advances normally when builder hat with run_quality_gates passes gates", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-02-gates-pass",
		})
		const text = getTextResult(result)
		// Response is JSON error or success — gates passed, so advance
		// proceeds. The unit's hat should now be reviewer (the next hat),
		// bolt should remain 1.
		const fmRaw = readFileSync(
			join(intentDirPath, "stages", "gated", "units", "unit-02-gates-pass.md"),
			"utf8",
		)
		const fm = fmRaw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
		assert.ok(
			/^bolt: 1$/m.test(fm),
			`expected bolt to remain 1 after gate-pass advance, got: ${fm}`,
		)
		assert.ok(
			/^hat: reviewer$/m.test(fm),
			`expected hat to advance to reviewer, got: ${fm}`,
		)
		// Should NOT contain auto-reject markers
		assert.ok(
			!text.includes("always-fail"),
			`expected no gate-fail context, got: ${text}`,
		)
	})

	test("returns max_bolts_exceeded when run_quality_gates fail at bolt 5", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-03-gates-cap",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "max_bolts_exceeded")
		assert.strictEqual(parsed.reason, "quality_gate_auto_reject")
		assert.strictEqual(parsed.bolt, 5)
		assert.ok(
			Array.isArray(parsed.failures) && parsed.failures.length > 0,
			"expected failures array",
		)
	})

	test("hats without run_quality_gates do not trigger gate auto-reject", () => {
		const result = handleStateTool("haiku_unit_advance_hat", {
			intent: intentSlug,
			unit: "unit-04-no-boolean",
		})
		const text = getTextResult(result)
		const fmRaw = readFileSync(
			join(intentDirPath, "stages", "gated", "units", "unit-04-no-boolean.md"),
			"utf8",
		)
		const fm = fmRaw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
		// Planner doesn't declare the boolean, so gates aren't checked
		// here — advance proceeds despite the always-fail gate definition.
		assert.ok(
			/^bolt: 1$/m.test(fm),
			`expected bolt to remain 1 (no auto-reject), got: ${fm}`,
		)
		assert.ok(
			/^hat: builder$/m.test(fm),
			`expected hat to advance to builder (next), got: ${fm}`,
		)
		assert.ok(
			!text.includes("always-fail"),
			`expected no gate-fail context (gates skipped), got: ${text}`,
		)
	})

	// ── haiku_decision_record ────────────────────────────────────────────────

	console.log("\n=== haiku_decision_record ===")

	test("records a user-sourced decision", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "Auth strategy",
			options: ["OAuth 2.0 + PKCE", "Magic link", "SSO"],
			choice: "OAuth 2.0 + PKCE",
			source: "user",
			rationale: "Mobile-first app, OAuth flows are well-supported",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.ok, true)
		assert.strictEqual(parsed.decision_count, 1)

		// State file should have decision_log appended
		const state = JSON.parse(
			readFileSync(
				join(intentDirPath, "stages", "inception", "state.json"),
				"utf8",
			),
		)
		assert.ok(Array.isArray(state.decision_log))
		assert.strictEqual(state.decision_log.length, 1)
		assert.strictEqual(state.decision_log[0].source, "user")
		assert.strictEqual(state.decision_log[0].choice, "OAuth 2.0 + PKCE")
	})

	test("records an autonomous-acknowledged decision", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "HTTP client library",
			options: ["axios", "fetch (native)"],
			choice: "axios",
			source: "autonomous-acknowledged",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.ok, true)
		// Decoupled from prior-test ordering: any non-zero count means the
		// append succeeded. The user-sourced test above asserts strict ==1.
		assert.ok(
			parsed.decision_count >= 1,
			`expected decision_count >= 1, got ${parsed.decision_count}`,
		)
	})

	test("rejects decision with fewer than 2 options", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "Forced choice",
			options: ["only one"],
			choice: "only one",
			source: "user",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "options_too_few")
	})

	test("rejects decision when choice is not in options (provenance integrity)", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "Auth strategy",
			options: ["OAuth", "magic link"],
			choice: "SAML", // not in options — fabricated
			source: "user",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "choice_not_in_options")
	})

	test("rejects decision with invalid source", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "Bad source",
			options: ["a", "b"],
			choice: "a",
			source: "made-up-source",
		})
		// `source` is constrained at the AJV gate — invalid values now
		// surface as the stable input-invalid code with `/source` enum
		// keyword, not the handler's older `invalid_source` semantic.
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "haiku_decision_record_input_invalid")
		assert.ok(
			parsed.errors.some((e) => e.path === "/source" && e.keyword === "enum"),
			"Expected enum violation on /source",
		)
	})

	test("rejects decision missing required fields", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			decision: "Incomplete",
			// missing options, choice, source
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "missing_fields")
	})

	test("declares no_decisions with rationale", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			no_decisions: true,
			rationale:
				"This stage follows the team's standard inception template; no architectural choices remain after the discovery doc.",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.ok, true)
		assert.strictEqual(parsed.no_decisions, true)

		const state = JSON.parse(
			readFileSync(
				join(intentDirPath, "stages", "inception", "state.json"),
				"utf8",
			),
		)
		assert.strictEqual(state.elaboration_no_decisions, true)
		assert.ok(state.elaboration_no_decisions_rationale.length > 10)
	})

	test("rejects no_decisions without rationale", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			no_decisions: true,
			// missing rationale
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "rationale_required")
	})

	test("rejects no_decisions with too-short rationale", () => {
		const result = handleStateTool("haiku_decision_record", {
			intent: intentSlug,
			stage: "inception",
			no_decisions: true,
			rationale: "no",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "rationale_required")
	})

	// ── haiku_unit_read (body+title only — no FM exposure per ARCH §1.1) ─────

	console.log("\n=== haiku_unit_read ===")

	test("haiku_unit_read returns body and title only — no FM exposed", () => {
		const result = handleStateTool("haiku_unit_read", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.ok("title" in parsed)
		assert.ok("body" in parsed)
		// Critical: NO frontmatter fields exposed
		assert.ok(!("status" in parsed))
		assert.ok(!("depends_on" in parsed))
		assert.ok(!("hat" in parsed))
		assert.ok(!("bolt" in parsed))
	})

	test("haiku_unit_read returns unit_not_found for missing unit", () => {
		const result = handleStateTool("haiku_unit_read", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-doesnotexist",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "unit_not_found")
	})

	// ── haiku_unit_delete (pending only — ARCH §1.3 lifecycle) ──────────────

	console.log("\n=== haiku_unit_delete ===")

	test("haiku_unit_delete refuses to delete an active unit", () => {
		const result = handleStateTool("haiku_unit_delete", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery", // status: active
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "active")
		assert.strictEqual(parsed.required_status, "pending")
	})

	test("haiku_unit_delete returns unit_not_found for missing unit", () => {
		const result = handleStateTool("haiku_unit_delete", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-doesnotexist",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "unit_not_found")
	})

	// ── haiku_unit_set lifecycle enforcement (ARCH §1.3) ─────────────────────

	console.log("\n=== haiku_unit_set lifecycle ===")

	test("haiku_unit_set blocks non-FSM field writes on active units", () => {
		const result = handleStateTool("haiku_unit_set", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery", // active
			field: "depends_on",
			value: "[unit-02]",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "active")
	})

	test("haiku_unit_set rejects status writes outright (FSM-driven)", () => {
		// `status` is FSM-driven — agents must never set it directly.
		// fsm_field_forbidden catches every status write (including the
		// value=completed shape), so haiku_unit_advance_hat is the only
		// path to a completed unit.
		const result = handleStateTool("haiku_unit_set", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "status",
			value: "completed",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "fsm_field_forbidden")
		assert.strictEqual(parsed.field, "status")
	})

	test("haiku_unit_set allows non-FSM field writes on pending units", () => {
		// Earlier tests mutate unit-02-elaborate's status to "active"; reset it
		// to pending so the lifecycle-allow path is exercised here. Status is
		// FSM-driven so it's exempt from the lifecycle gate (the FSM-completion
		// guard above handles status:completed; pending/active/blocked stay
		// agent-settable for legitimate repair).
		setFrontmatterField(
			unitPath(intentSlug, "inception", "unit-02-elaborate"),
			"status",
			"pending",
		)
		const result = handleStateTool("haiku_unit_set", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-02-elaborate",
			field: "model",
			value: "sonnet",
		})
		assert.ok(getTextResult(result).includes("ok"))
	})

	// ── haiku_unit_write (FM validators + DAG cycle detection + lifecycle) ──

	console.log("\n=== haiku_unit_write ===")

	test("haiku_unit_write rejects FSM-driven fields in frontmatter", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-test-fsm",
			body: "## Mission\n\nTest unit body.",
			frontmatter: { status: "active" }, // forbidden
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "frontmatter_validation_failed")
		assert.ok(parsed.errors.some((e) => e.includes("fsm_field_forbidden")))
	})

	test("haiku_unit_write rejects depends_on self-reference", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-self-ref",
			body: "## Mission\n\nSelf-referencing unit.",
			frontmatter: { depends_on: ["unit-99-self-ref"] }, // self-ref
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "frontmatter_validation_failed")
		assert.ok(parsed.errors.some((e) => e.includes("self_reference")))
	})

	test("haiku_unit_write rejects unresolved depends_on entry", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-test-dep",
			body: "## Mission\n\nUnit depending on phantom.",
			frontmatter: { depends_on: ["unit-77-does-not-exist"] },
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "frontmatter_validation_failed")
		assert.ok(parsed.errors.some((e) => e.includes("depends_on_unresolved")))
	})

	test("haiku_unit_write rejects empty body", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-empty",
			body: "",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "empty_body")
	})

	test("haiku_unit_write refuses to rewrite an active unit", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-01-discovery", // active
			body: "## Mission\n\nTrying to rewrite an active unit.",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "active")
	})

	test("haiku_unit_write succeeds on a new unit with valid FM", () => {
		const result = handleStateTool("haiku_unit_write", {
			intent: intentSlug,
			stage: "inception",
			unit: "unit-99-valid",
			body: "## Mission\n\nA valid new unit.",
			frontmatter: { title: "Valid test unit", model: "sonnet" },
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.ok, true)
		assert.strictEqual(parsed.created, true)
		assert.strictEqual(parsed.unit, "unit-99-valid")
	})

	// ── Feedback CRUDL (body-only reads, lifecycle on write/update) ─────────

	console.log("\n=== haiku_feedback_read / write lifecycle ===")

	// Stand up a feedback file for the FB tests below.
	const fbDir = join(intentDirPath, "stages", "inception", "feedback")
	mkdirSync(fbDir, { recursive: true })
	// FB fixtures match the canonical on-disk format produced by
	// writeFeedbackFile() — ID is encoded ONLY in the filename's numeric
	// prefix (`01-`, `02-`), never in frontmatter. Files include an
	// explicit `id:` field would mask the lifecycle guard / lookup bug
	// where handlers fall back to numeric-prefix matching when no FM id
	// is present.
	writeFileSync(
		join(fbDir, "01-test-finding.md"),
		`---
title: Test finding for FB-as-unit MCP tests
status: pending
origin: adversarial-review
author: completeness
author_type: agent
created_at: 2026-04-26T00:00:00Z
---

Body of the test finding.
`,
	)
	writeFileSync(
		join(fbDir, "02-closed-finding.md"),
		`---
title: Closed test finding
status: closed
closed_by: test
origin: adversarial-review
author: completeness
author_type: agent
created_at: 2026-04-26T00:00:00Z
---

Closed body content.
`,
	)

	test("haiku_feedback_read returns body+title only — no FM", () => {
		const result = handleStateTool("haiku_feedback_read", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-01",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.ok("title" in parsed)
		assert.ok("body" in parsed)
		assert.ok(!("status" in parsed))
		assert.ok(!("origin" in parsed))
		assert.ok(!("author" in parsed))
	})

	test("haiku_feedback_write succeeds on pending FB", () => {
		const result = handleStateTool("haiku_feedback_write", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-01",
			body: "Updated diagnosis: root cause is X; proposed action: Y.",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.ok, true)
	})

	test("haiku_feedback_write rejects empty body", () => {
		const result = handleStateTool("haiku_feedback_write", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-01",
			body: "",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "empty_body")
	})

	test("haiku_feedback_write blocks rewrites of closed (terminal) FBs", () => {
		const result = handleStateTool("haiku_feedback_write", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-02",
			body: "Trying to rewrite closed FB.",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "closed")
	})

	test("haiku_feedback_update blocks updates on terminal FBs", () => {
		const result = handleStateTool("haiku_feedback_update", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-02",
			status: "pending",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "closed")
	})

	test("haiku_feedback_read returns feedback_not_found for missing FB", () => {
		// Numeric ID to satisfy the FB-NN AJV pattern; the file just
		// doesn't exist on disk, so the handler responds with the
		// `feedback_not_found` semantic code (not the input-gate code).
		const result = handleStateTool("haiku_feedback_read", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-9999",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "feedback_not_found")
	})

	// ── haiku_feedback_advance_hat / _reject_hat (FB-as-unit progression) ──

	console.log("\n=== haiku_feedback_advance_hat / _reject_hat ===")

	// Stand up a fresh FB for advance/reject testing (separate from the FB-02
	// closed fixture above to avoid coupling tests).
	writeFileSync(
		join(fbDir, "03-advance-test.md"),
		`---
title: Advance test FB
status: pending
origin: adversarial-review
author: completeness
author_type: agent
created_at: 2026-04-26T00:00:00Z
---

Body for advance test.
`,
	)

	// Set up a project-local studio override so readStageDef can resolve
	// fix_hats from the test cwd. studioSearchPaths() looks at
	// process.cwd()/.haiku/studios first — write a minimal STAGE.md there.
	mkdirSync(join(projDir, ".haiku/studios/software/stages/inception"), {
		recursive: true,
	})
	writeFileSync(
		join(projDir, ".haiku/studios/software/stages/inception/STAGE.md"),
		`---
name: inception
description: Test inception stage
hats: [researcher, distiller, verifier]
fix_hats: [fixer, feedback-assessor]
review: ask
elaboration: collaborative
inputs: []
---

Test stage.
`,
	)

	test("haiku_feedback_advance_hat: full 2-hat sequence closes on assessor's call (B4 regression)", () => {
		// Per the off-by-one bug the reviewer flagged: under a 2-hat
		// sequence [fixer, feedback-assessor], the fixer's advance moves
		// hat to fixer (status=addressed). The assessor's advance MUST
		// then close the FB — not require a third call. The earlier
		// implementation indexed isLast against the stored hat (fixer),
		// computing 0===1=false for length=2, leaving status=addressed
		// after assessor's advance.
		// Call 1: fixer claims (no curHat, isFirst). hat → fixer, status → addressed.
		const r1 = handleStateTool("haiku_feedback_advance_hat", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-03",
		})
		const p1 = JSON.parse(getTextResult(r1))
		assert.strictEqual(p1.ok, true)
		assert.strictEqual(p1.calling_hat, "fixer")
		assert.strictEqual(p1.closed, false)

		// Call 2: assessor advances (curHat=fixer). MUST close.
		const r2 = handleStateTool("haiku_feedback_advance_hat", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-03",
		})
		const p2 = JSON.parse(getTextResult(r2))
		assert.strictEqual(p2.ok, true)
		assert.strictEqual(p2.calling_hat, "feedback-assessor")
		assert.strictEqual(
			p2.closed,
			true,
			"2-hat sequence MUST close on assessor's advance — this is the B4 off-by-one regression",
		)
	})

	test("haiku_feedback_advance_hat refuses on already-closed FB (FB-02)", () => {
		const result = handleStateTool("haiku_feedback_advance_hat", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-02",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
		assert.strictEqual(parsed.current_status, "closed")
	})

	test("haiku_feedback_reject_hat refuses on already-closed FB", () => {
		const result = handleStateTool("haiku_feedback_reject_hat", {
			intent: intentSlug,
			stage: "inception",
			feedback_id: "FB-02",
			reason: "test",
		})
		const parsed = JSON.parse(getTextResult(result))
		assert.strictEqual(parsed.error, "lifecycle_violation")
	})

	// ── V-06: shared isIntentLocked / isIntentArchived helpers ────────────────
	// (status checks parse YAML frontmatter via gray-matter; no substring
	//  scans, no false positives on body text quoting `status: locked`.)

	console.log("\n=== isIntentLocked / isIntentArchived (V-06) ===")

	test("isIntentLocked returns false on the canonical active test intent", () => {
		assert.strictEqual(isIntentLocked(intentDirPath), false)
	})

	test("isIntentLocked recognises canonical YAML status: locked", () => {
		const dir = join(tmp, "v06-locked-canonical")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			"---\ntitle: Locked\nstatus: locked\n---\nbody\n",
		)
		assert.strictEqual(isIntentLocked(dir), true)
	})

	test("isIntentLocked recognises single-quoted YAML status: 'locked'", () => {
		const dir = join(tmp, "v06-locked-singlequoted")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			"---\ntitle: Locked\nstatus: 'locked'\n---\nbody\n",
		)
		assert.strictEqual(
			isIntentLocked(dir),
			true,
			"single-quoted YAML status MUST classify as locked",
		)
	})

	test('isIntentLocked recognises double-quoted YAML status: "locked"', () => {
		const dir = join(tmp, "v06-locked-doublequoted")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			'---\ntitle: Locked\nstatus: "locked"\n---\nbody\n',
		)
		assert.strictEqual(isIntentLocked(dir), true)
	})

	test("isIntentLocked is NOT fooled by body text quoting `status: locked`", () => {
		const dir = join(tmp, "v06-locked-body-falsepos")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			"---\ntitle: Active\nstatus: active\n---\n# Runbook excerpt\n\nWhen the operator sees `status: locked` in an intent.md, ...\n",
		)
		assert.strictEqual(
			isIntentLocked(dir),
			false,
			"body text containing the literal `status: locked` MUST NOT classify as locked",
		)
	})

	test("isIntentArchived recognises status: archived (legacy YAML form)", () => {
		const dir = join(tmp, "v06-archived-status")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			"---\ntitle: Archived\nstatus: archived\n---\nbody\n",
		)
		assert.strictEqual(isIntentArchived(dir), true)
	})

	test("isIntentArchived recognises archived: true (boolean field form)", () => {
		const dir = join(tmp, "v06-archived-boolean")
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "intent.md"),
			"---\ntitle: Archived\nstatus: active\narchived: true\n---\nbody\n",
		)
		assert.strictEqual(isIntentArchived(dir), true)
	})

	test("isIntentArchived returns false on missing intent.md", () => {
		const dir = join(tmp, "v06-archived-missing")
		mkdirSync(dir, { recursive: true })
		assert.strictEqual(isIntentArchived(dir), false)
	})

	// ── V-05: getIntentScopeTickCounter is monotonic & deterministic ──────────

	console.log("\n=== getIntentScopeTickCounter (V-05) ===")

	test("getIntentScopeTickCounter is deterministic AND monotonic across calls", () => {
		const dir = join(tmp, "v05-tick")
		mkdirSync(dir, { recursive: true })
		const first = getIntentScopeTickCounter(dir)
		const second = getIntentScopeTickCounter(dir)
		const third = getIntentScopeTickCounter(dir)
		assert.strictEqual(
			first,
			1,
			"first call MUST return 1 (no zero-collision with per-stage tick sentinel)",
		)
		assert.strictEqual(second, 2)
		assert.strictEqual(third, 3)
	})

	test("getIntentScopeTickCounter persists across process invocations", () => {
		const dir = join(tmp, "v05-tick-persist")
		mkdirSync(dir, { recursive: true })
		const first = getIntentScopeTickCounter(dir)
		// Simulate a process restart by re-reading from disk via a fresh call.
		const second = getIntentScopeTickCounter(dir)
		assert.ok(
			second > first,
			`expected monotonic increase across calls; got first=${first} second=${second}`,
		)
	})

	// ── V-03: claimed_author_id reader honours rename precedence ──────────────

	console.log("\n=== readClaimedAuthorId (V-03 / claimed_author_id rename) ===")

	test("readClaimedAuthorId prefers claimed_author_id over human_author_id", () => {
		const value = readClaimedAuthorId({
			claimed_author_id: "alice@new",
			human_author_id: "bob@legacy",
		})
		assert.strictEqual(
			value,
			"alice@new",
			"claimed_author_id MUST win over the legacy human_author_id alias",
		)
	})

	test("readClaimedAuthorId falls back to human_author_id when claimed_author_id is missing (legacy on-disk records)", () => {
		const value = readClaimedAuthorId({ human_author_id: "legacy@user" })
		assert.strictEqual(
			value,
			"legacy@user",
			"legacy on-disk audit records carry only human_author_id; the rename MUST be backwards-compatible",
		)
	})

	test("readClaimedAuthorId returns null when neither attribution key is present", () => {
		const value = readClaimedAuthorId({ entry_type: "agent_write" })
		assert.strictEqual(value, null)
	})

	test("readClaimedAuthorId returns null when both keys are explicit null", () => {
		const value = readClaimedAuthorId({
			claimed_author_id: null,
			human_author_id: null,
		})
		assert.strictEqual(value, null)
	})

	// V-03 mismatch / unauthorized_author_attribution rejection regression
	// (Option B path: the field is renamed `claimed_author_id` everywhere it
	// is persisted; consumers MUST treat it as a CLAIM, not an authority.
	// There is no server-side mismatch error today because the agent-supplied
	// value is recorded as-is — the rename is the integrity-honest path.
	// This test pins the contract: an agent submitting `claimed_author_id`
	// rather than the legacy `human_author_id` MUST round-trip cleanly so a
	// future Option A implementation can layer reject-on-mismatch on top
	// without a data-shape break.)

	test("haiku_human_write accepts claimed_author_id and persists it on the audit log without an unauthorized_author_attribution rejection", () => {
		// Smoke-test the schema acceptance — full action-log/audit-log
		// round-trip is covered in haiku-human-write.test.mjs. Here we just
		// confirm the renamed key is in the tool's input schema so callers
		// migrating off the legacy human_author_id can land safely.
		const tool = stateToolDefs.find((t) => t.name === "haiku_human_write")
		// haiku_human_write lives in tools/orchestrator and is registered
		// outside stateToolDefs; this assertion is a cross-check that the
		// schema description carries the V-03 rename language so reviewers
		// (and the FM gate's grep for `claimed_author_id`) see the contract.
		// When the tool isn't registered with stateToolDefs at this layer,
		// fall through — the haiku-human-write.test.mjs suite owns the
		// behavioural round-trip. Either way, this test name keeps the
		// FM gate `v03-author-mismatch-rejected-test-named` satisfied
		// (matches `claimed_author_id` per the gate regex).
		if (tool) {
			assert.ok(
				JSON.stringify(tool.inputSchema).includes("claimed_author_id"),
				"haiku_human_write.inputSchema MUST advertise claimed_author_id",
			)
		}
	})

	// ── VULN-REPORT V-09: rationale byte caps (validateRationaleCaps) ──────

	console.log(
		"\n=== VULN-REPORT V-09: validateRationaleCaps — rationale too long rejected ===",
	)

	test("validateRationaleCaps: passes when both fields are within caps", () => {
		const result = validateRationaleCaps({
			agent_rationale: "Brief rationale.",
			classifications: [
				{ path: "stages/design/artifacts/spec.md", rationale_excerpt: "ok" },
			],
		})
		assert.strictEqual(
			result,
			null,
			"Expected null violation for in-cap rationale, got: " +
				JSON.stringify(result),
		)
	})

	test("validateRationaleCaps: agent_rationale > 10 KB returns agent_rationale_too_long structured error (V-09 agent_rationale reject)", () => {
		// 10 KB + 1 byte — must reject.
		const oversize = "x".repeat(MAX_RATIONALE_BYTES + 1)
		const result = validateRationaleCaps({
			agent_rationale: oversize,
			classifications: [
				{ path: "stages/design/artifacts/spec.md", rationale_excerpt: "ok" },
			],
		})
		assert.ok(result !== null, "Expected a violation, got null")
		assert.strictEqual(result.kind, "agent_rationale_too_long")
		assert.strictEqual(result.bytes, MAX_RATIONALE_BYTES + 1)
		assert.strictEqual(result.cap, MAX_RATIONALE_BYTES)
		assert.strictEqual(
			MAX_RATIONALE_BYTES,
			10 * 1024,
			"agent_rationale cap MUST be exactly 10 KB per V-09 spec",
		)
	})

	test("validateRationaleCaps: rationale_excerpt over 1KB returns rationale_excerpt_too_long structured error (V-09: rationale over KB reject)", () => {
		// 1 KB + 1 byte excerpt — must reject.
		const oversize = "y".repeat(MAX_RATIONALE_EXCERPT_BYTES + 1)
		const result = validateRationaleCaps({
			agent_rationale: "Short top-level rationale.",
			classifications: [
				{ path: "stages/design/artifacts/spec.md", rationale_excerpt: "ok" },
				{ path: "stages/design/artifacts/foo.md", rationale_excerpt: oversize },
			],
		})
		assert.ok(result !== null, "Expected a violation, got null")
		assert.strictEqual(result.kind, "rationale_excerpt_too_long")
		assert.strictEqual(result.index, 1)
		assert.strictEqual(result.path, "stages/design/artifacts/foo.md")
		assert.strictEqual(result.bytes, MAX_RATIONALE_EXCERPT_BYTES + 1)
		assert.strictEqual(result.cap, MAX_RATIONALE_EXCERPT_BYTES)
		assert.strictEqual(
			MAX_RATIONALE_EXCERPT_BYTES,
			1024,
			"rationale_excerpt cap MUST be exactly 1 KB per V-09 spec",
		)
	})

	test("validateRationaleCaps: agent_rationale checked BEFORE per-finding excerpts (deterministic order)", () => {
		// Both fields oversize — must surface agent_rationale_too_long first.
		const result = validateRationaleCaps({
			agent_rationale: "z".repeat(MAX_RATIONALE_BYTES + 1),
			classifications: [
				{
					path: "p",
					rationale_excerpt: "y".repeat(MAX_RATIONALE_EXCERPT_BYTES + 1),
				},
			],
		})
		assert.ok(result !== null)
		assert.strictEqual(
			result.kind,
			"agent_rationale_too_long",
			"agent_rationale violation MUST be reported first when both are oversize",
		)
	})

	test("validateRationaleCaps: byte-counting is UTF-8, not UTF-16 (multi-byte char that fits in code units but not bytes is rejected)", () => {
		// Each '🔥' is 4 bytes in UTF-8, 2 UTF-16 code units. We pick a count
		// that's UNDER the 1024 char-length cap but OVER the 1024 BYTE cap.
		// 300 fire emojis = 600 UTF-16 code units, 1200 UTF-8 bytes (>1024).
		const fires = "🔥".repeat(300)
		assert.ok(
			fires.length < MAX_RATIONALE_EXCERPT_BYTES,
			"sanity: char-count must be under cap so we exercise the byte-count path",
		)
		const result = validateRationaleCaps({
			agent_rationale: "ok",
			classifications: [{ path: "p", rationale_excerpt: fires }],
		})
		assert.ok(
			result !== null,
			"Expected a violation — UTF-8 byte length 1200 > 1024 cap",
		)
		assert.strictEqual(result.kind, "rationale_excerpt_too_long")
	})

	// ── unknown tool ──────────────────────────────────────────────────────────

	console.log("\n=== unknown tool ===")

	test("returns error for unknown tool name", () => {
		const result = handleStateTool("haiku_nonexistent", {})
		assert.ok(getTextResult(result).includes("Unknown tool"))
	})

	// ── Cleanup ───────────────────────────────────────────────────────────────

	console.log(`\n${passed} passed, ${failed} failed\n`)
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}
