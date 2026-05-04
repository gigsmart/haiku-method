#!/usr/bin/env npx tsx
// Tests for the stamp-agent-write PostToolUse hook + the drift-gate
// agent_write attribution path that closes the bleed window where the
// agent's own Write/Edit on a tracked-surface file would otherwise
// inherit the baseline's `human-implicit` author_class.
//
// Coverage:
//   1. Hook stamps action-log entry for stage-scoped artifact write.
//   2. Hook stamps action-log entry for intent-scope knowledge write.
//   3. Hook skips paths outside `.haiku/intents/`.
//   4. Hook skips workflow-managed paths (units/, feedback/).
//   5. Hook skips paths inside intent dir but outside tracked surface
//      (e.g. drift-assessments/).
//   6. Hook skips when tool_response carries an error.
//   7. Gate suppresses finding when agent_write SHA matches current SHA.
//   8. Gate emits finding (author_class=agent) when agent_write SHA is
//      stale (someone else wrote after).
//   9. Gate prefers human_write over agent_write when both are logged.

import assert from "node:assert"
import { createHash } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-agent-write-"))

const stampAgentWriteHook = (await import("../src/hooks/stamp-agent-write.ts"))
	.default

const { runDriftDetectionGate } = await import(
	"../src/orchestrator/workflow/drift-detection-gate.ts"
)

const { writeBaseline } = await import(
	"../src/orchestrator/workflow/drift-baseline.ts"
)

const { appendActionLogEntry } = await import(
	"../src/orchestrator/workflow/action-log.ts"
)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const r = fn()
		if (r && typeof r.then === "function") {
			return r.then(
				() => {
					passed++
					console.log(`  ✓ ${name}`)
				},
				(e) => {
					failed++
					console.log(`  ✗ ${name}: ${e.message}`)
					if (process.env.VERBOSE) console.error(e)
				},
			)
		}
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	}
}

function sha256(content) {
	return createHash("sha256").update(content).digest("hex")
}

function makeIntentDir(name, opts = {}) {
	const intentDir = join(tmp, name, ".haiku", "intents", "demo-intent")
	const stage = opts.stage || "design"
	const stageDir = join(intentDir, "stages", stage)
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	mkdirSync(join(stageDir, "knowledge"), { recursive: true })
	mkdirSync(join(intentDir, "knowledge"), { recursive: true })
	// Establish a stage state.json with iteration so getCurrentTickCounter
	// returns a known value rather than 0.
	writeFileSync(join(stageDir, "state.json"), JSON.stringify({ iteration: 3 }))
	return { intentDir, stage }
}

function readActionLog(intentDir) {
	const path = join(intentDir, "action-log.jsonl")
	if (!existsSync(path)) return []
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l))
}

async function invokeHook(input) {
	// The hook reads cwd-relative paths, so chdir to the test root for the
	// duration of the call. The PostToolUse hook is best-effort and
	// swallows its own errors; we read the action log to assert behavior.
	const cwd = process.cwd()
	process.chdir(tmp)
	try {
		await stampAgentWriteHook.handle(input, { pluginRoot: tmp })
	} finally {
		process.chdir(cwd)
	}
}

// ── Hook tests ─────────────────────────────────────────────────────────────

console.log("\n=== Hook: stamp on tracked-surface writes ===")

await test("stage-scoped artifact write → agent_write entry stamped", async () => {
	const { intentDir, stage } = makeIntentDir("s01")
	const filePath = join(intentDir, "stages", stage, "artifacts", "spec.md")
	const content = "# spec\n"
	writeFileSync(filePath, content)
	await invokeHook({
		tool_name: "Write",
		tool_input: { file_path: filePath },
		tool_response: {},
	})
	const entries = readActionLog(intentDir)
	assert.strictEqual(entries.length, 1, "one action-log entry")
	assert.strictEqual(entries[0].entry_type, "agent_write")
	assert.strictEqual(entries[0].path, `stages/${stage}/artifacts/spec.md`)
	assert.strictEqual(entries[0].sha, sha256(content))
	assert.strictEqual(entries[0].author_class, "agent")
	assert.strictEqual(entries[0].tick_counter, 3)
	assert.strictEqual(entries[0].tick_scope, "stage")
	// entry_id uses the AGW- prefix to disambiguate from human_write's
	// HWM- prefix in the audit log.
	assert.match(entries[0].entry_id, /^AGW-3-\d{2,}$/)
})

await test("intent-scope knowledge write → agent_write at intent tick scope", async () => {
	const { intentDir } = makeIntentDir("s02")
	const filePath = join(intentDir, "knowledge", "runbook.md")
	const content = "runbook content\n"
	writeFileSync(filePath, content)
	await invokeHook({
		tool_name: "Edit",
		tool_input: { file_path: filePath },
		tool_response: {},
	})
	const entries = readActionLog(intentDir)
	assert.strictEqual(entries.length, 1)
	assert.strictEqual(entries[0].path, "knowledge/runbook.md")
	assert.strictEqual(entries[0].tick_scope, "intent")
})

console.log("\n=== Hook: skip cases ===")

await test("path outside .haiku/intents/ → no action-log entry", async () => {
	const dir = join(tmp, "s03")
	mkdirSync(dir, { recursive: true })
	const filePath = join(dir, "code.ts")
	writeFileSync(filePath, "export {}")
	await invokeHook({
		tool_name: "Write",
		tool_input: { file_path: filePath },
		tool_response: {},
	})
	// Root has no action-log.jsonl because no intent dir was touched.
	assert.ok(
		!existsSync(join(dir, "action-log.jsonl")),
		"no action log written outside intent dir",
	)
})

await test("workflow-managed path (units/) → no action-log entry", async () => {
	const { intentDir, stage } = makeIntentDir("s04")
	const unitDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitDir, { recursive: true })
	const filePath = join(unitDir, "unit-01-foo.md")
	writeFileSync(filePath, "# unit\n")
	await invokeHook({
		tool_name: "Write",
		tool_input: { file_path: filePath },
		tool_response: {},
	})
	assert.strictEqual(readActionLog(intentDir).length, 0)
})

await test("intent-dir path outside tracked surface (drift-assessments/) → no entry", async () => {
	const { intentDir } = makeIntentDir("s05")
	const daDir = join(intentDir, "drift-assessments")
	mkdirSync(daDir, { recursive: true })
	const filePath = join(daDir, "DA-01.json")
	writeFileSync(filePath, "{}")
	await invokeHook({
		tool_name: "Write",
		tool_input: { file_path: filePath },
		tool_response: {},
	})
	assert.strictEqual(readActionLog(intentDir).length, 0)
})

await test("tool_response carries an error → no entry", async () => {
	const { intentDir, stage } = makeIntentDir("s06")
	const filePath = join(intentDir, "stages", stage, "artifacts", "x.md")
	writeFileSync(filePath, "x")
	await invokeHook({
		tool_name: "Write",
		tool_input: { file_path: filePath },
		tool_response: { error: "permission denied" },
	})
	assert.strictEqual(readActionLog(intentDir).length, 0)
})

// ── Gate attribution tests ────────────────────────────────────────────────

console.log("\n=== Gate: agent_write attribution ===")

function makeBaselineEntry(path, content, overrides = {}) {
	return {
		path,
		sha256: sha256(content),
		bytes: Buffer.byteLength(content),
		mtime_ns: Date.now() * 1_000_000,
		is_binary: false,
		author_class: "human-implicit",
		acknowledged_at: new Date().toISOString(),
		acknowledged_via: "baseline-init",
		stage: "design",
		tracking_class: "stage-output",
		...overrides,
	}
}

function makeHaikuRoot(name) {
	const haikuRoot = join(tmp, `${name}-haikuroot`)
	mkdirSync(haikuRoot, { recursive: true })
	return haikuRoot
}

function makeCtx(intentDir, haikuRoot, stage = "design") {
	return {
		intentDir,
		intentSlug: "demo-intent",
		activeStage: stage,
		haikuRoot,
		tickCounter: 1,
	}
}

await test("agent_write with matching SHA → no finding, baseline silently absorbed", async () => {
	const { intentDir, stage } = makeIntentDir("g01")
	const haikuRoot = makeHaikuRoot("g01")
	const artifactsDir = join(intentDir, "stages", stage, "artifacts")
	const relPath = `stages/${stage}/artifacts/spec.md`
	const original = "# original\n"
	const updated = "# updated by agent\n"

	writeFileSync(join(artifactsDir, "spec.md"), original)
	// Anchor to keep OOM heuristic at bay (1/2 = 50%, not > 50%).
	const anchorContent = "anchor"
	const anchorPath = `stages/${stage}/artifacts/anchor.txt`
	writeFileSync(join(artifactsDir, "anchor.txt"), anchorContent)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[relPath, makeBaselineEntry(relPath, original)],
			[anchorPath, makeBaselineEntry(anchorPath, anchorContent)],
		]),
	})

	// Agent writes new content + stamps action log.
	writeFileSync(join(artifactsDir, "spec.md"), updated)
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "agent_write",
		path: relPath,
		sha: sha256(updated),
		author_class: "agent",
		timestamp: new Date().toISOString(),
		claimed_author_id: null,
		human_author_id: null,
		entry_id: "AGW-1-01",
		tick_counter: 1,
		tick_scope: "stage",
	})

	const result = runDriftDetectionGate(makeCtx(intentDir, haikuRoot, stage))
	const finding = (result.findings ?? []).find((f) => f.path === relPath)
	assert.ok(!finding, "no finding emitted for agent-stamped write")
	// Baseline was silently updated. Disk format is a plain map keyed by
	// path (see writeBaselineSync — Record<string, BaselineEntry>), not a
	// nested `{ entries: ... }` envelope.
	const newBaseline = JSON.parse(
		readFileSync(join(intentDir, "stages", stage, "baseline.json"), "utf8"),
	)
	const updatedEntry = newBaseline[relPath]
	assert.ok(updatedEntry, "updated entry exists in baseline")
	assert.strictEqual(updatedEntry.sha256, sha256(updated))
	assert.strictEqual(updatedEntry.author_class, "agent")
	assert.strictEqual(updatedEntry.acknowledged_via, "agent-write")
})

await test("agent_write with stale SHA → finding emitted, author_class=agent", async () => {
	const { intentDir, stage } = makeIntentDir("g02")
	const haikuRoot = makeHaikuRoot("g02")
	const artifactsDir = join(intentDir, "stages", stage, "artifacts")
	const relPath = `stages/${stage}/artifacts/spec.md`
	const original = "# original\n"
	const agentWrite = "# agent's draft\n"
	const humanOverwrite = "# human re-edit\n"
	writeFileSync(join(artifactsDir, "spec.md"), original)
	const anchorContent = "anchor"
	const anchorPath = `stages/${stage}/artifacts/anchor.txt`
	writeFileSync(join(artifactsDir, "anchor.txt"), anchorContent)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[relPath, makeBaselineEntry(relPath, original)],
			[anchorPath, makeBaselineEntry(anchorPath, anchorContent)],
		]),
	})

	// Agent stamped SHA-A, then human silently overwrote with SHA-B.
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "agent_write",
		path: relPath,
		sha: sha256(agentWrite),
		author_class: "agent",
		timestamp: new Date().toISOString(),
		claimed_author_id: null,
		human_author_id: null,
		entry_id: "AGW-1-01",
		tick_counter: 1,
		tick_scope: "stage",
	})
	writeFileSync(join(artifactsDir, "spec.md"), humanOverwrite)

	const result = runDriftDetectionGate(makeCtx(intentDir, haikuRoot, stage))
	const finding = (result.findings ?? []).find((f) => f.path === relPath)
	assert.ok(finding, "finding emitted on stale agent_write")
	assert.strictEqual(finding.author_class, "agent")
	assert.strictEqual(finding.after_sha256, sha256(humanOverwrite))
})

await test("two agent_write entries in one tick → newest SHA wins (findLast)", async () => {
	const { intentDir, stage } = makeIntentDir("g04")
	const haikuRoot = makeHaikuRoot("g04")
	const artifactsDir = join(intentDir, "stages", stage, "artifacts")
	const relPath = `stages/${stage}/artifacts/spec.md`
	const original = "# original\n"
	const agentFirst = "# agent's first attempt\n"
	const agentSecond = "# agent's second attempt\n"
	writeFileSync(join(artifactsDir, "spec.md"), original)
	const anchorContent = "anchor"
	const anchorPath = `stages/${stage}/artifacts/anchor.txt`
	writeFileSync(join(artifactsDir, "anchor.txt"), anchorContent)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[relPath, makeBaselineEntry(relPath, original)],
			[anchorPath, makeBaselineEntry(anchorPath, anchorContent)],
		]),
	})

	// Agent stamps SHA-A (the first attempt's SHA), then re-writes the
	// file in the same tick and stamps SHA-B (the second attempt). The
	// second entry is the one whose SHA matches the on-disk bytes; the
	// gate must use `findLast` to pick it up.
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "agent_write",
		path: relPath,
		sha: sha256(agentFirst),
		author_class: "agent",
		timestamp: new Date().toISOString(),
		claimed_author_id: null,
		human_author_id: null,
		entry_id: "AGW-1-01",
		tick_counter: 1,
		tick_scope: "stage",
	})
	writeFileSync(join(artifactsDir, "spec.md"), agentSecond)
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "agent_write",
		path: relPath,
		sha: sha256(agentSecond),
		author_class: "agent",
		timestamp: new Date().toISOString(),
		claimed_author_id: null,
		human_author_id: null,
		entry_id: "AGW-1-02",
		tick_counter: 1,
		tick_scope: "stage",
	})

	const result = runDriftDetectionGate(makeCtx(intentDir, haikuRoot, stage))
	const finding = (result.findings ?? []).find((f) => f.path === relPath)
	assert.ok(!finding, "no finding emitted — newest stamp matches on-disk SHA")
})

await test("human_write present alongside agent_write → human-via-mcp wins", async () => {
	const { intentDir, stage } = makeIntentDir("g03")
	const haikuRoot = makeHaikuRoot("g03")
	const artifactsDir = join(intentDir, "stages", stage, "artifacts")
	const relPath = `stages/${stage}/artifacts/spec.md`
	const original = "# original\n"
	const updated = "# updated\n"
	writeFileSync(join(artifactsDir, "spec.md"), original)
	const anchorContent = "anchor"
	const anchorPath = `stages/${stage}/artifacts/anchor.txt`
	writeFileSync(join(artifactsDir, "anchor.txt"), anchorContent)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[relPath, makeBaselineEntry(relPath, original)],
			[anchorPath, makeBaselineEntry(anchorPath, anchorContent)],
		]),
	})
	writeFileSync(join(artifactsDir, "spec.md"), updated)

	// Both entries logged, but human_write should take priority and emit
	// a finding (the agent_write SHA matches but human_write supersedes).
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "agent_write",
		path: relPath,
		sha: sha256(updated),
		author_class: "agent",
		timestamp: new Date().toISOString(),
		claimed_author_id: null,
		human_author_id: null,
		entry_id: "AGW-1-01",
		tick_counter: 1,
		tick_scope: "stage",
	})
	await appendActionLogEntry(intentDir, 1, {
		entry_type: "human_write",
		path: relPath,
		sha: sha256(updated),
		author_class: "human-via-mcp",
		timestamp: new Date().toISOString(),
		claimed_author_id: "user@example.com",
		human_author_id: "user@example.com",
		entry_id: "HWM-1-01",
		tick_counter: 1,
		tick_scope: "stage",
	})

	const result = runDriftDetectionGate(makeCtx(intentDir, haikuRoot, stage))
	const finding = (result.findings ?? []).find((f) => f.path === relPath)
	assert.ok(finding, "finding emitted when human_write is logged")
	assert.strictEqual(finding.author_class, "human-via-mcp")
})

// ── MCP tool surface tests (non-CC harness path) ──────────────────────────

console.log("\n=== MCP tool: haiku_record_agent_write ===")

const recordAgentWriteTool = (
	await import("../src/tools/orchestrator/haiku_record_agent_write.ts")
).default

function setupHaikuRoot(name) {
	const haikuRoot = join(tmp, name, ".haiku")
	const intentsDir = join(haikuRoot, "intents")
	mkdirSync(intentsDir, { recursive: true })
	return { haikuRoot, intentsDir }
}

async function callTool(args, haikuRoot) {
	const cwd = process.cwd()
	process.chdir(haikuRoot.replace(/\/\.haiku$/, ""))
	try {
		const result = await recordAgentWriteTool.handle(args, {})
		// Some shared validators (validateSlugArgs) return a plain-text
		// error rather than a JSON envelope — test callers that expect
		// JSON should opt in via tryParseJson.
		const text = result.content[0].text
		let payload = null
		try {
			payload = JSON.parse(text)
		} catch {
			payload = { __raw_text: text }
		}
		return { result, payload }
	} finally {
		process.chdir(cwd)
	}
}

await test("MCP tool stamps tracked-surface write with intent-relative path", async () => {
	const { haikuRoot, intentsDir } = setupHaikuRoot("mcp01")
	const slug = "demo-mcp01"
	const intentDir = join(intentsDir, slug)
	const stage = "design"
	const stageDir = join(intentDir, "stages", stage)
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	writeFileSync(join(stageDir, "state.json"), JSON.stringify({ iteration: 7 }))
	const filePath = join(stageDir, "artifacts", "doc.md")
	writeFileSync(filePath, "# doc\n")

	const { payload } = await callTool(
		{ intent_slug: slug, path: `stages/${stage}/artifacts/doc.md` },
		haikuRoot,
	)
	assert.strictEqual(payload.ok, true)
	assert.strictEqual(payload.stamped, true)
	assert.strictEqual(payload.path, `stages/${stage}/artifacts/doc.md`)
	assert.strictEqual(payload.tick_counter, 7)
	const entries = readActionLog(intentDir)
	assert.strictEqual(entries.length, 1)
	assert.strictEqual(entries[0].entry_type, "agent_write")
	assert.strictEqual(entries[0].sha, sha256("# doc\n"))
})

await test("MCP tool resolves absolute paths the same as relative", async () => {
	const { haikuRoot, intentsDir } = setupHaikuRoot("mcp02")
	const slug = "demo-mcp02"
	const intentDir = join(intentsDir, slug)
	const stage = "design"
	const stageDir = join(intentDir, "stages", stage)
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	writeFileSync(join(stageDir, "state.json"), JSON.stringify({ iteration: 1 }))
	const filePath = join(stageDir, "artifacts", "abs.md")
	writeFileSync(filePath, "abs\n")

	const { payload } = await callTool(
		{ intent_slug: slug, path: filePath },
		haikuRoot,
	)
	assert.strictEqual(payload.stamped, true)
	assert.strictEqual(payload.path, `stages/${stage}/artifacts/abs.md`)
})

await test("MCP tool returns ok:true stamped:false for non-tracked path", async () => {
	const { haikuRoot, intentsDir } = setupHaikuRoot("mcp03")
	const slug = "demo-mcp03"
	const intentDir = join(intentsDir, slug)
	const stage = "design"
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	writeFileSync(
		join(intentDir, "stages", stage, "state.json"),
		JSON.stringify({ iteration: 1 }),
	)
	const filePath = join(unitsDir, "unit-01-x.md")
	writeFileSync(filePath, "# unit\n")

	const { payload } = await callTool(
		{ intent_slug: slug, path: `stages/${stage}/units/unit-01-x.md` },
		haikuRoot,
	)
	assert.strictEqual(payload.ok, true)
	assert.strictEqual(payload.stamped, false)
	assert.strictEqual(payload.reason, "not_in_tracked_surface")
})

await test("MCP tool rejects missing intent_slug", async () => {
	const { haikuRoot } = setupHaikuRoot("mcp04")
	const { result, payload } = await callTool(
		{ intent_slug: "", path: "stages/x/artifacts/y.md" },
		haikuRoot,
	)
	assert.strictEqual(result.isError, true)
	assert.strictEqual(payload.code, "missing_intent_slug")
})

await test("MCP tool rejects absolute path that escapes the intent dir", async () => {
	const { haikuRoot, intentsDir } = setupHaikuRoot("mcp06")
	const slug = "demo-mcp06"
	const otherSlug = "other-intent"
	mkdirSync(join(intentsDir, slug, "stages", "design", "artifacts"), {
		recursive: true,
	})
	const otherDir = join(intentsDir, otherSlug, "stages", "design", "artifacts")
	mkdirSync(otherDir, { recursive: true })
	const escapePath = join(otherDir, "evil.md")
	writeFileSync(escapePath, "x")

	const { result, payload } = await callTool(
		{ intent_slug: slug, path: escapePath },
		haikuRoot,
	)
	assert.strictEqual(result.isError, true)
	assert.strictEqual(payload.code, "path_outside_intent")
})

await test("MCP tool rejects path-traversal in intent_slug", async () => {
	const { haikuRoot } = setupHaikuRoot("mcp05")
	const { result } = await callTool(
		{ intent_slug: "../escape", path: "stages/x/artifacts/y.md" },
		haikuRoot,
	)
	assert.strictEqual(result.isError, true)
})

// ── Final summary ─────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed`)

try {
	rmSync(tmp, { recursive: true, force: true })
} catch {
	/* best-effort cleanup */
}

if (failed > 0) process.exit(1)
