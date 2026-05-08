// orchestrator/migrations/v0-to-v4.ts — Soft-scrub migrator from
// pre-v4 (no plugin_version field) to v4.0.0.
//
// Invoked the first time the v4 engine reads an intent that doesn't
// have `plugin_version` set. Walks the intent dir tree once,
// rewrites intent.md / unit.md / feedback.md into the new shape,
// deletes stage `state.json` files, and stamps `plugin_version:
// "4.0.0"` on intent.md.
//
// What gets dropped (deprecated fields):
//   intent.md  : active_stage, phase, completion_review_*, gate_review_*,
//                composite, intent_reviewed, completed_at, iteration,
//                created_at (kept as-is if present), status
//   unit.md    : status, hat, bolt, hat_started_at, completed_at,
//                iteration, scope_reject_attempts, visit
//   feedback   : status, bolt, triaged_at, closed_by, resolution,
//                iteration, visit, integrator_attempts
//                (NOTE: `replies` is preserved — v4 still reads
//                replies from FB FM and surfaces them on the wire)
//
// What gets synthesized:
//   - intent.started_at  : if any unit has a started_at, take the
//                          earliest; else leave null
//   - unit.approvals.user: if old unit had `status: completed`,
//                          synthesize `{ at: <best timestamp>, migrated: true }`
//                          so the cursor doesn't try to re-approve
//                          completed work
//   - feedback.closed_at : if old FB had a terminal status (closed,
//                          answered, addressed, rejected), synthesize
//                          `{ at: <best timestamp> }`
//   - feedback.targets   : `{ unit: null, invalidates: [] }` (best-effort
//                          default — historical closures don't ripple
//                          forward)
//
// What gets preserved as-is:
//   - intent  : title, description, mode, studio, granularity,
//               skip_stages, intent_completion_review, follows,
//               archived, archived_at, started_at (if present)
//   - unit    : title, inputs, outputs, depends_on, quality_gates,
//               model, closes, applicable_skills, started_at (if
//               present), iterations[] (if present)
//   - feedback: title, body, origin, author, author_type, created_at,
//               source_ref, attachment, inline_anchor, iterations[],
//               replies[]
//
// What gets deleted from disk:
//   - .haiku/intents/<slug>/stages/<stage>/state.json (every stage)
//
// Migration is best-effort but never destructive of body content.
// If a fixture fails to parse, the migrator throws and the engine
// surfaces the error rather than silently corrupting state.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import matter from "gray-matter"
import { type MigrationContext, registerMigrator } from "../migrate-registry.js"

const TARGET_VERSION = "4.0.0"

const DEPRECATED_INTENT_FIELDS = new Set([
	"status",
	"active_stage",
	"phase",
	"completed_at",
	"iteration",
	"completion_review_dispatched",
	"completion_review_skipped",
	"completion_review_entered_at",
	"completion_review_dispatched_at",
	"composite",
	"intent_reviewed",
	"gate_review_session_id",
	"gate_review_url",
	"gate_review_context",
	"gate_review_next_stage",
	"gate_review_next_phase",
	"autopilot",
])

const DEPRECATED_UNIT_FIELDS = new Set([
	"status",
	"hat",
	"bolt",
	"hat_started_at",
	"completed_at",
	"iteration",
	"visit",
	"scope_reject_attempts",
])

// `replies` was originally listed as deprecated, but v4 still reads
// `replies` from FB FM in `readFeedbackFiles` (state-tools.ts) and
// surfaces them on the wire. Dropping them in migration would silently
// delete the user/agent conversation thread on every closed v3 FB —
// regression caught by v0-to-v4-realistic-scenario.test.mjs. Keep it.
const DEPRECATED_FB_FIELDS = new Set([
	"status",
	"bolt",
	"triaged_at",
	"closed_by",
	"resolution",
	"iteration",
	"visit",
	"integrator_attempts",
	// upstream_stage was the v3 cross-stage routing hint. v4 routes
	// FBs by file location, not by frontmatter. The migrator strips
	// the field AND relocates the file to the upstream stage when it
	// pointed elsewhere — see relocateFeedbackByUpstreamStage below.
	"upstream_stage",
])

const FB_TERMINAL_STATUSES = new Set([
	"closed",
	"answered",
	"addressed",
	"rejected",
])

function readMatter(path: string): {
	data: Record<string, unknown>
	body: string
} {
	const raw = readFileSync(path, "utf8")
	const parsed = matter(raw)
	return { data: parsed.data as Record<string, unknown>, body: parsed.content }
}

/**
 * Try to migrate a single file. On parse failure, log to stderr and
 * SKIP the file rather than tearing down the whole migration. The
 * intent stays partially un-migrated; the next read of that file will
 * surface the YAML error to the caller (and in normal flow we never
 * silently corrupt a file).
 *
 * The reason this matters: real v3 intents have malformed FBs and
 * units in the wild (missing `---` markers, duplicate keys, etc.).
 * Without this guard, a single bad file blocks the entire migration —
 * the user can't open ANY of their intents in the v4 SPA until they
 * manually fix the YAML. With the guard, the rest of the intent
 * migrates and the bad file is flagged for follow-up.
 */
function tryMigrateFile(
	path: string,
	migrate: () => void,
	context: string,
): void {
	try {
		migrate()
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		console.warn(
			`[haiku-migrate-v0-to-v4] Skipped ${context} at ${path} due to parse error: ${msg}. The file is preserved as-is; fix the YAML and re-tick to migrate.`,
		)
	}
}

function writeMatter(
	path: string,
	data: Record<string, unknown>,
	body: string,
): void {
	const out = matter.stringify(body, data)
	writeFileSync(path, out)
}

function strip(
	data: Record<string, unknown>,
	deprecated: Set<string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(data)) {
		if (!deprecated.has(k)) out[k] = v
	}
	return out
}

function bestTimestamp(candidates: Array<unknown>): string {
	for (const c of candidates) {
		if (typeof c === "string" && c.length > 0) return c
	}
	return new Date().toISOString()
}

// ── Intent.md migrator ───────────────────────────────────────────────

function migrateIntentMd(intentDir: string): void {
	const path = join(intentDir, "intent.md")
	if (!existsSync(path)) return
	tryMigrateFile(
		path,
		() => {
			const { data, body } = readMatter(path)
			const next = strip(data, DEPRECATED_INTENT_FIELDS)
			next.plugin_version = TARGET_VERSION
			if (typeof next.approvals !== "object" || next.approvals === null) {
				next.approvals = {}
			}
			if (next.started_at == null) {
				next.started_at = null
			}
			if (next.sealed_at == null) {
				next.sealed_at = null
			}
			writeMatter(path, next, body)
		},
		"intent.md",
	)
}

// ── Unit.md migrator (for one stage) ─────────────────────────────────

function migrateUnitsInStage(stageDir: string): void {
	const unitsDir = join(stageDir, "units")
	if (!existsSync(unitsDir)) return
	const entries = readdirSync(unitsDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!entry.name.endsWith(".md")) continue
		const path = join(unitsDir, entry.name)
		tryMigrateFile(path, () => migrateUnitFile(path), `unit ${entry.name}`)
	}
}

function migrateUnitFile(path: string): void {
	const { data, body } = readMatter(path)
	const wasCompleted = data.status === "completed"
	const oldCompletedAt =
		typeof data.completed_at === "string" ? data.completed_at : null
	const next = strip(data, DEPRECATED_UNIT_FIELDS)
	// `started_at` is preserved as-is by `strip()` — no re-application
	// needed (it's not in DEPRECATED_UNIT_FIELDS). v4 keeps the same
	// field name and shape.
	if (typeof next.iterations !== "object" || !Array.isArray(next.iterations)) {
		next.iterations = data.iterations ?? []
	}
	// Normalize v3 past-tense result values to the v4 present-tense
	// vocabulary the cursor matches against. v3 wrote `result: "rejected"`
	// / `"advanced"`; v4's `nextHatForUnit` only looks for `"reject"` /
	// `"advance"`. A migrated unit with the past-tense form falls
	// through both checks and is treated as in-flight on the current
	// hat — the wave never progresses. This pass eliminates the drift
	// at the source so cursor logic stays clean.
	if (Array.isArray(next.iterations)) {
		for (const iter of next.iterations as Array<Record<string, unknown>>) {
			if (iter && iter.result === "rejected") iter.result = "reject"
			if (iter && iter.result === "advanced") iter.result = "advance"
		}
	}
	if (typeof next.discovery !== "object" || next.discovery === null) {
		next.discovery = {}
	}
	if (typeof next.reviews !== "object" || next.reviews === null) {
		next.reviews = {}
	}
	if (typeof next.approvals !== "object" || next.approvals === null) {
		next.approvals = {}
	}
	if (wasCompleted) {
		// Synthesize a user approval so the cursor treats this
		// unit as merged-and-approved going forward. The `migrated`
		// flag breadcrumbs that this is synthetic.
		const approvals = next.approvals as Record<string, unknown>
		if (approvals.user == null) {
			approvals.user = {
				at: bestTimestamp([oldCompletedAt]),
				migrated: true,
			}
		}
		next.approvals = approvals
	}
	writeMatter(path, next, body)
}

// ── Feedback.md migrator (for one stage or intent-scope) ─────────────

function migrateFeedbackInDir(feedbackDir: string, intentDir: string): void {
	if (!existsSync(feedbackDir)) return
	const entries = readdirSync(feedbackDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!entry.name.endsWith(".md")) continue
		const path = join(feedbackDir, entry.name)
		tryMigrateFile(
			path,
			() => migrateFeedbackFile(path, intentDir),
			`feedback ${entry.name}`,
		)
	}
}

/**
 * v3-to-v4 FB relocation: v3 FBs carried `upstream_stage:` as a hint
 * that the finding belonged to a different stage than where it was
 * filed. v4 routes by file location instead. This walks the post-
 * migration intent dir and physically relocates any FB whose
 * upstream_stage pointed elsewhere — using the same renumbering
 * machinery as `haiku_feedback_move`.
 *
 * Runs AFTER per-file frontmatter migration (so we read the original
 * upstream_stage field which gets stripped) — but we do it inside
 * migrateFeedbackFile so we have access to the original data block
 * before strip().
 */
function relocateFeedbackIfUpstreamStage(
	currentPath: string,
	originalData: Record<string, unknown>,
	intentDir: string,
): string | null {
	const upstream = originalData.upstream_stage
	if (typeof upstream !== "string" || !upstream) return null
	// Determine the current stage from the file's directory path.
	// Stage feedback dirs end in `/stages/<stage>/feedback/`.
	const currentDir = dirname(currentPath)
	const stageMatch = currentDir.match(/\/stages\/([^/]+)\/feedback\/?$/)
	const currentStage = stageMatch ? stageMatch[1] : ""
	if (currentStage === upstream) return null
	const targetDir = join(intentDir, "stages", upstream, "feedback")
	if (!existsSync(targetDir)) {
		try {
			mkdirSync(targetDir, { recursive: true })
		} catch {
			return null
		}
	}
	// Renumber: find the next free FB-NN in the target dir.
	const existingNums = new Set<number>()
	for (const f of readdirSync(targetDir).filter((x) => x.endsWith(".md"))) {
		const m = f.match(/^(\d+)-/)
		if (m) existingNums.add(Number.parseInt(m[1], 10))
	}
	let nextNum = 1
	while (existingNums.has(nextNum)) nextNum++
	const baseName = currentPath.split("/").pop() ?? ""
	const slugMatch = baseName.match(/^\d+-(.+\.md)$/)
	const newName = slugMatch
		? `${String(nextNum).padStart(2, "0")}-${slugMatch[1]}`
		: `${String(nextNum).padStart(2, "0")}-${baseName}`
	const newPath = join(targetDir, newName)
	if (existsSync(newPath)) return null
	renameSync(currentPath, newPath)
	return newPath
}

function migrateFeedbackFile(path: string, intentDir: string): void {
	const { data, body } = readMatter(path)
	const oldStatus =
		typeof data.status === "string" ? (data.status as string) : ""
	const oldClosedBy = typeof data.closed_by === "string" ? data.closed_by : null
	const next = strip(data, DEPRECATED_FB_FIELDS)
	if (typeof next.iterations !== "object" || !Array.isArray(next.iterations)) {
		next.iterations = data.iterations ?? []
	}
	// Normalize v3 past-tense result values (matches the unit migrator).
	if (Array.isArray(next.iterations)) {
		for (const iter of next.iterations as Array<Record<string, unknown>>) {
			if (iter && iter.result === "rejected") iter.result = "reject"
			if (iter && iter.result === "advanced") iter.result = "advance"
		}
	}
	if (typeof next.targets !== "object" || next.targets === null) {
		next.targets = { unit: null, invalidates: [] as string[] }
	}
	if (next.closed_at == null) {
		if (FB_TERMINAL_STATUSES.has(oldStatus)) {
			next.closed_at = bestTimestamp([oldClosedBy, data.created_at])
		} else {
			next.closed_at = null
		}
	}
	// Write the migrated frontmatter to the original path first. The
	// upstream-stage relocation is independent — relocating after the
	// rewrite keeps the file's content correct regardless of whether
	// the relocate step succeeds.
	writeMatter(path, next, body)
	// v3 used `upstream_stage:` as a routing hint when an FB on stage A
	// actually targeted stage B. v4 routes by file location. Move the
	// file now (with renumbering) so the stage that actually owns the
	// finding sees it on the next cursor walk. `data` is the ORIGINAL
	// pre-strip frontmatter, which still carries upstream_stage —
	// after `strip()` the field is gone, but we kept the reference.
	relocateFeedbackIfUpstreamStage(path, data, intentDir)
}

// ── Top-level migrator ───────────────────────────────────────────────

function v0ToV4(ctx: MigrationContext): void {
	const { intentDir } = ctx

	// 1. Intent.md
	migrateIntentMd(intentDir)

	// 2. Per-stage walks
	const stagesDir = join(intentDir, "stages")
	if (existsSync(stagesDir)) {
		for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const stageDir = join(stagesDir, entry.name)

			// 2a. Units
			migrateUnitsInStage(stageDir)

			// 2b. Stage-scope feedback
			migrateFeedbackInDir(join(stageDir, "feedback"), intentDir)

			// 2c. Stage state.json — delete unconditionally
			const stateJson = join(stageDir, "state.json")
			if (existsSync(stateJson)) {
				rmSync(stateJson, { force: true })
			}

			// 2d. Pre-v4 drift artifacts — delete unconditionally. The
			// v4 cursor uses body-sha256-in-fm as the drift witness, so
			// the legacy baseline.json manifest, baseline-content/
			// snapshot dir, and drift-markers.json sidecar are all
			// strict noise after migration.
			for (const stale of [
				"baseline.json",
				"drift-markers.json",
				"baseline-content",
			]) {
				const stalePath = join(stageDir, stale)
				if (existsSync(stalePath)) {
					rmSync(stalePath, { recursive: true, force: true })
				}
			}
		}
	}

	// 3. Intent-scope feedback
	migrateFeedbackInDir(join(intentDir, "feedback"), intentDir)

	// 4. Intent-scope drift artifacts. Same reasoning as the per-stage
	// pass: v4 doesn't write or read these, so leaving them around just
	// confuses git status / diffs after migration.
	for (const stale of [
		"baseline.json",
		"drift-markers.json",
		"baseline-content",
	]) {
		const stalePath = join(intentDir, stale)
		if (existsSync(stalePath)) {
			rmSync(stalePath, { recursive: true, force: true })
		}
	}
}

// Register the edge. Pre-v4 intents have no plugin_version field;
// we represent that as the literal "0" version string.
registerMigrator("0", TARGET_VERSION, v0ToV4)

export const __testOnly = {
	migrateIntentMd,
	migrateUnitsInStage,
	migrateFeedbackInDir,
	v0ToV4,
}
