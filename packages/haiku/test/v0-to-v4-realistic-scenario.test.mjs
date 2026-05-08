#!/usr/bin/env npx tsx
// v0-to-v4-realistic-scenario.test.mjs — Beyond the basic happy path
// in v0-to-v4-migrator.test.mjs, this exercises a richer fixture that
// resembles a real in-flight v3 intent, so we catch shape mismatches
// the simple test would miss.
//
// What this fixture covers:
//   1. Multi-stage intent: design (fully merged), build (in-flight),
//      polish (untouched)
//   2. Unit.status: completed | in_progress | rejected | pending
//   3. Stage state.json variants: post-gate, mid-execute, mid-review
//   4. Stage-scope feedback w/ user replies (the conversation thread —
//      MUST survive the migration; v4 FB FM still carries `replies`)
//   5. Intent-scope feedback (under .haiku/intents/<slug>/feedback/)
//   6. Mixed authors: agent + human + system

import assert from "node:assert"
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
import { test } from "node:test"
import matter from "gray-matter"

function makeRichV3Fixture() {
	const root = mkdtempSync(join(tmpdir(), "haiku-v3-realistic-"))
	const slug = "ingest-pipeline-rebuild"
	const intentDir = join(root, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })

	// ── intent.md ──────────────────────────────────────────────────────
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# Rebuild ingest pipeline\n\nReplaces the legacy CSV pipeline.\n", {
			title: "Rebuild ingest pipeline",
			studio: "software",
			mode: "discrete",
			active_stage: "build",
			phase: "execute",
			status: "active",
			composite: false,
			intent_reviewed: true,
			completion_review_dispatched: false,
			gate_review_session_id: "old-session-xyz",
			gate_review_url: "https://review.example/abc",
			started_at: "2026-04-15T09:00:00Z",
			created_at: "2026-04-15T08:55:00Z",
			intent_completion_review: true,
		}),
	)

	// ── Stage 1: design (fully merged into intent main) ────────────────
	const designDir = join(intentDir, "stages", "design")
	mkdirSync(join(designDir, "units"), { recursive: true })
	mkdirSync(join(designDir, "feedback"), { recursive: true })

	writeFileSync(
		join(designDir, "state.json"),
		JSON.stringify({
			stage: "design",
			status: "completed",
			phase: "gate",
			started_at: "2026-04-15T09:00:00Z",
			completed_at: "2026-04-16T18:00:00Z",
			gate_outcome: "advanced",
		}),
	)

	writeFileSync(
		join(designDir, "units", "unit-01-schema.md"),
		matter.stringify("# unit-01-schema\n\nOriginal-event schema.\n", {
			title: "Define event schema",
			status: "completed",
			hat: "verifier",
			bolt: 1,
			hat_started_at: "2026-04-16T16:00:00Z",
			completed_at: "2026-04-16T17:00:00Z",
			started_at: "2026-04-15T10:00:00Z",
			scope_reject_attempts: 0,
			outputs: ["stages/design/schema.md"],
			depends_on: [],
			model: "sonnet",
			iterations: [
				{ hat: "researcher", started_at: "2026-04-15T10:00:00Z", completed_at: "2026-04-15T11:00:00Z", result: "advance" },
				{ hat: "distiller", started_at: "2026-04-15T11:00:00Z", completed_at: "2026-04-15T13:00:00Z", result: "advance" },
				{ hat: "verifier", started_at: "2026-04-16T16:00:00Z", completed_at: "2026-04-16T17:00:00Z", result: "advance" },
			],
		}),
	)

	// Closed feedback on design w/ a user reply thread (must survive).
	writeFileSync(
		join(designDir, "feedback", "01-schema-naming.md"),
		matter.stringify("Field `evt_id` is inconsistent with the rest of the codebase.\n", {
			title: "Schema naming",
			origin: "adversarial-review",
			author: "naming-conventions-reviewer",
			author_type: "agent",
			status: "closed",
			bolt: 1,
			triaged_at: "2026-04-16T10:00:00Z",
			closed_by: "fix-loop:FB-001:bolt-1",
			resolution: "inline_fix",
			created_at: "2026-04-16T09:30:00Z",
			replies: [
				{
					author: "user",
					author_type: "human",
					body: "Agreed; rename to `event_id`.",
					created_at: "2026-04-16T09:45:00Z",
				},
				{
					author: "agent",
					author_type: "agent",
					body: "Renamed across schema + downstream consumers.",
					created_at: "2026-04-16T11:00:00Z",
				},
			],
		}),
	)

	// ── Stage 2: build (in-flight) ─────────────────────────────────────
	const buildDir = join(intentDir, "stages", "build")
	mkdirSync(join(buildDir, "units"), { recursive: true })
	mkdirSync(join(buildDir, "feedback"), { recursive: true })

	writeFileSync(
		join(buildDir, "state.json"),
		JSON.stringify({
			stage: "build",
			status: "active",
			phase: "execute",
			started_at: "2026-04-17T09:00:00Z",
			gate_review_session_id: "stale-session-abc",
		}),
	)

	// In-progress unit — last iteration has no result yet
	writeFileSync(
		join(buildDir, "units", "unit-01-ingest-worker.md"),
		matter.stringify("# unit-01-ingest-worker\n", {
			title: "Build the ingest worker",
			status: "in_progress",
			hat: "builder",
			bolt: 2,
			hat_started_at: "2026-04-19T14:00:00Z",
			started_at: "2026-04-17T10:00:00Z",
			outputs: [],
			depends_on: ["unit-01-schema"],
			iterations: [
				{ hat: "planner", started_at: "2026-04-17T10:00:00Z", completed_at: "2026-04-17T12:00:00Z", result: "advance" },
				{ hat: "builder", started_at: "2026-04-19T14:00:00Z" },
			],
		}),
	)

	// Rejected unit — last iteration result: rejected
	writeFileSync(
		join(buildDir, "units", "unit-02-cli-flag.md"),
		matter.stringify("# unit-02-cli-flag\n", {
			title: "Add --legacy CLI flag",
			status: "rejected",
			hat: "verifier",
			bolt: 1,
			started_at: "2026-04-18T10:00:00Z",
			scope_reject_attempts: 1,
			outputs: [],
			iterations: [
				{ hat: "planner", started_at: "2026-04-18T10:00:00Z", completed_at: "2026-04-18T10:30:00Z", result: "advance" },
				{ hat: "verifier", started_at: "2026-04-18T11:00:00Z", completed_at: "2026-04-18T11:30:00Z", result: "rejected", reason: "Out of scope" },
			],
		}),
	)

	// Open user-chat FB
	writeFileSync(
		join(buildDir, "feedback", "01-rate-limit.md"),
		matter.stringify("Need a per-tenant rate limit; the global limit lets noisy tenants starve quiet ones.\n", {
			title: "Per-tenant rate limit needed",
			origin: "user-chat",
			author: "user",
			author_type: "human",
			status: "pending",
			bolt: 0,
			created_at: "2026-04-19T08:30:00Z",
		}),
	)

	// ── Stage 3: polish (untouched — no state, no units, no feedback) ──
	mkdirSync(join(intentDir, "stages", "polish"), { recursive: true })

	// ── Intent-scope FB (under .haiku/intents/<slug>/feedback/) ────────
	mkdirSync(join(intentDir, "feedback"), { recursive: true })
	writeFileSync(
		join(intentDir, "feedback", "01-cross-stage-naming.md"),
		matter.stringify("Need a unified glossary across stages; `event` vs `record` is inconsistent.\n", {
			title: "Cross-stage glossary",
			origin: "studio-review",
			author: "completeness",
			author_type: "agent",
			status: "addressed",
			bolt: 1,
			triaged_at: "2026-04-18T15:00:00Z",
			closed_by: null,
			created_at: "2026-04-18T14:00:00Z",
		}),
	)

	return { root, intentDir, slug }
}

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}

test("realistic v3 → v4 — multi-stage migration leaves no v3 fields on intent.md", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(join(intentDir, "intent.md"))
		// v3 fields stripped
		assert.strictEqual(fm.active_stage, undefined)
		assert.strictEqual(fm.phase, undefined)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.composite, undefined)
		assert.strictEqual(fm.intent_reviewed, undefined)
		assert.strictEqual(fm.completion_review_dispatched, undefined)
		assert.strictEqual(fm.gate_review_session_id, undefined)
		assert.strictEqual(fm.gate_review_url, undefined)
		// v4 fields stamped
		assert.strictEqual(fm.plugin_version, "4.0.0")
		assert.deepStrictEqual(fm.approvals, {})
		assert.strictEqual(fm.sealed_at, null)
		// preserved
		assert.strictEqual(fm.title, "Rebuild ingest pipeline")
		assert.strictEqual(fm.studio, "software")
		assert.strictEqual(fm.mode, "discrete")
		assert.strictEqual(fm.started_at, "2026-04-15T09:00:00Z")
		assert.strictEqual(fm.intent_completion_review, true)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — completed unit gets synthetic user approval, in-progress unit does not", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const completedFm = readFm(
			join(intentDir, "stages", "design", "units", "unit-01-schema.md"),
		)
		assert.ok(completedFm.approvals?.user, "completed unit must get synthetic user approval")
		assert.strictEqual(completedFm.approvals.user.migrated, true)
		assert.strictEqual(completedFm.iterations.length, 3)
		assert.strictEqual(completedFm.iterations[2].result, "advance")
		// preserved
		assert.deepStrictEqual(completedFm.outputs, ["stages/design/schema.md"])
		assert.strictEqual(completedFm.model, "sonnet")

		const inProgressFm = readFm(
			join(intentDir, "stages", "build", "units", "unit-01-ingest-worker.md"),
		)
		// No synthetic approval — unit is still in-flight
		assert.deepStrictEqual(
			inProgressFm.approvals,
			{},
			"in-progress unit must NOT get synthetic approval",
		)
		// iterations preserved including the open last entry
		assert.strictEqual(inProgressFm.iterations.length, 2)
		assert.strictEqual(inProgressFm.iterations[1].hat, "builder")
		assert.strictEqual(inProgressFm.iterations[1].result, undefined)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — rejected unit's iterations[] are preserved (with v4 normalization), status field stripped", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "build", "units", "unit-02-cli-flag.md"),
		)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.iterations.length, 2)
		// v3 wrote past-tense `result: "rejected"` / `"advanced"`. v4's
		// cursor only matches present-tense `"reject"` / `"advance"`.
		// The migrator normalizes to v4 vocabulary so a migrated unit's
		// iterations don't fall through both checks and sit forever as
		// "in-flight on the current hat" (PR #323 review issue #2).
		assert.strictEqual(fm.iterations[1].result, "reject")
		assert.strictEqual(fm.iterations[1].reason, "Out of scope")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — every per-stage state.json is deleted, including in-flight ones", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		assert.strictEqual(
			existsSync(join(intentDir, "stages", "design", "state.json")),
			false,
		)
		assert.strictEqual(
			existsSync(join(intentDir, "stages", "build", "state.json")),
			false,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — closed FB user reply thread MUST survive migration", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "design", "feedback", "01-schema-naming.md"),
		)
		// v3 fields stripped
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.bolt, undefined)
		assert.strictEqual(fm.triaged_at, undefined)
		assert.strictEqual(fm.closed_by, undefined)
		assert.strictEqual(fm.resolution, undefined)
		// closed_at synthesized (terminal status was "closed")
		assert.ok(typeof fm.closed_at === "string")
		// Replies thread preserved — losing the conversation on
		// migration would silently delete user data.
		assert.ok(Array.isArray(fm.replies), "replies must remain an array post-migration")
		assert.strictEqual(fm.replies.length, 2)
		assert.strictEqual(fm.replies[0].author, "user")
		assert.strictEqual(fm.replies[0].body, "Agreed; rename to `event_id`.")
		assert.strictEqual(fm.replies[1].author, "agent")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — open human-authored FB stays open (no synthetic closed_at)", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "build", "feedback", "01-rate-limit.md"),
		)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.closed_at, null, "open FBs MUST NOT get a synthetic closed_at")
		assert.strictEqual(fm.author_type, "human")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — intent-scope feedback (no stage path) migrates", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "feedback", "01-cross-stage-naming.md"),
		)
		// v3 fields stripped
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.bolt, undefined)
		assert.strictEqual(fm.triaged_at, undefined)
		// closed_at synthesized (status was "addressed", a terminal status)
		assert.ok(typeof fm.closed_at === "string")
		// targets defaulted
		assert.deepStrictEqual(fm.targets, { unit: null, invalidates: [] })
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — malformed YAML in one FB does NOT abort the migration", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		// Drop a deliberately broken FB next to the others. The
		// migrator must skip it (with a warning) and continue migrating
		// every other file. Without this guard, a single bad FB blocks
		// the entire migration — every legitimate file is left
		// half-migrated and the user can't open the intent at all.
		writeFileSync(
			join(intentDir, "stages", "design", "feedback", "99-broken.md"),
			"---\ntitle: broken\norigin: user-chat\nstatus: pending\n  malformed: : :: bad: indent\n---\nbody",
		)
		const origWarn = console.warn
		const warnings = []
		console.warn = (...args) => {
			warnings.push(args.join(" "))
		}
		try {
			const { __testOnly } = await import(
				"../src/orchestrator/migrations/v0-to-v4.js"
			)
			__testOnly.v0ToV4({ intentDir, repoRoot: root })
		} finally {
			console.warn = origWarn
		}

		// Sanity: every other FB still migrated. The good neighbour FB-001
		// on the design stage must have its v3 fields stripped.
		const goodFm = readFm(
			join(
				intentDir,
				"stages",
				"design",
				"feedback",
				"01-schema-naming.md",
			),
		)
		assert.strictEqual(goodFm.status, undefined)

		// And the migrator emitted a warning that named the broken file.
		const skipped = warnings.find((w) => w.includes("99-broken.md"))
		assert.ok(
			skipped,
			"Migrator must log a skip warning naming the malformed file (so the user has a breadcrumb to find it).",
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — FB with upstream_stage relocates to that stage's feedback/", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		// Drop a v3 FB on `build` whose upstream_stage points at `design`.
		// Migrator MUST move it to design/feedback/ with renumbering, AND
		// the upstream_stage field must be stripped from the FM.
		writeFileSync(
			join(intentDir, "stages", "build", "feedback", "98-cross-stage.md"),
			matter.stringify(
				"The schema needs a tenant_id column — that's design's call.\n",
				{
					title: "Schema needs tenant_id",
					origin: "agent",
					author: "builder",
					author_type: "agent",
					status: "pending",
					upstream_stage: "design",
					created_at: "2026-04-19T12:00:00Z",
				},
			),
		)
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		// Source must be gone.
		assert.strictEqual(
			existsSync(
				join(intentDir, "stages", "build", "feedback", "98-cross-stage.md"),
			),
			false,
			"FB should have moved out of build/feedback/",
		)
		// Target must have a renumbered FB containing the original body.
		const designFbDir = join(intentDir, "stages", "design", "feedback")
		const designFiles = readFileSync ? null : null // satisfy ts; use require
		const fs = await import("node:fs")
		const allDesign = fs.readdirSync(designFbDir).filter((f) => f.endsWith(".md"))
		const relocated = allDesign.find((f) =>
			f.includes("cross-stage"),
		)
		assert.ok(
			relocated,
			`expected a cross-stage FB to land in design/feedback/; got: ${allDesign.join(", ")}`,
		)
		const fm = readFm(join(designFbDir, relocated))
		// upstream_stage must be stripped on the relocated copy.
		assert.strictEqual(fm.upstream_stage, undefined)
		// Body preserved.
		const relocatedRaw = fs.readFileSync(join(designFbDir, relocated), "utf8")
		assert.match(relocatedRaw, /tenant_id column/)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — mid-wave unit recovery: in-flight iterations[] preserved", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		// The build stage's unit-01 is in-flight — last iteration is
		// `builder` with no result yet. This is the canonical "user
		// upgraded mid-wave" case: the migrator must NOT corrupt the
		// open iteration (no synthetic result, no synthetic completion
		// timestamp). The cursor on first v4 tick must see the open
		// last-iteration and treat the unit as still in-flight.
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "build", "units", "unit-01-ingest-worker.md"),
		)
		// v3 fields stripped
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.hat, undefined)
		assert.strictEqual(fm.bolt, undefined)
		assert.strictEqual(fm.hat_started_at, undefined)
		// iterations[] preserved INCLUDING the open last entry
		assert.strictEqual(fm.iterations.length, 2)
		assert.strictEqual(fm.iterations[0].hat, "planner")
		assert.strictEqual(fm.iterations[0].result, "advance")
		assert.strictEqual(fm.iterations[1].hat, "builder")
		// Critical: in-flight iteration must NOT have a synthetic result
		// stamped — the cursor uses last-iteration-result to drive next
		// dispatch. If the migrator wrote `result: "advance"` here,
		// the cursor would falsely think the unit is past builder.
		assert.strictEqual(
			fm.iterations[1].result,
			undefined,
			"in-flight iteration must keep result: undefined (no synthesized terminal)",
		)
		// approvals.user must NOT be synthetically stamped — the unit
		// wasn't completed under v3.
		assert.deepStrictEqual(
			fm.approvals,
			{},
			"in-flight unit must NOT receive a synthesized user approval",
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("realistic v3 → v4 — empty stage (no units, no FBs) is left alone, no crash", async () => {
	const { root, intentDir } = makeRichV3Fixture()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		// `polish` stage has no units, no FBs, no state.json. Migrator
		// must not crash; the directory simply persists.
		assert.ok(existsSync(join(intentDir, "stages", "polish")))
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
