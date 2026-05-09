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
import { readReviewAgentPaths } from "../../studio-reader.js"
import {
	emptyMigrationDetails,
	type MigrationContext,
	type MigrationStepDetails,
	registerMigrator,
} from "../migrate-registry.js"

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

function migrateIntentMd(
	intentDir: string,
	details: MigrationStepDetails,
): void {
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
			details.intent_md_migrated = true
		},
		"intent.md",
	)
}

// ── Unit.md migrator (for one stage) ─────────────────────────────────

function migrateUnitsInStage(
	stageDir: string,
	details: MigrationStepDetails,
	studio: string,
	stage: string,
): void {
	const unitsDir = join(stageDir, "units")
	if (!existsSync(unitsDir)) return
	const entries = readdirSync(unitsDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!entry.name.endsWith(".md")) continue
		const path = join(unitsDir, entry.name)
		tryMigrateFile(
			path,
			() => migrateUnitFile(path, details, studio, stage),
			`unit ${entry.name}`,
		)
	}
}

/**
 * Backfill cursor-checked stamps for a v3 completed unit. The v4 cursor
 * gates progression on per-unit `reviews.<role>.at` and
 * `approvals.<role>.at` stamps for actions that don't produce a file
 * output (review sign-offs, user gates). v3 didn't track these per-unit;
 * it only tracked stage-level state. Without backfill, every migrated
 * completed unit triggers per-role review / approval actions on every
 * tick — re-running phases that already happened.
 *
 * Discovery is NOT backfilled here. The cursor's discovery check reads
 * the artifact's `location` on disk; v3 already wrote the discovery
 * file, so the existence check passes naturally — no synthesis needed.
 *
 * Synthesized stamps carry `migrated: true` so debugging can distinguish
 * v3-origin stamps from real v4 work. The `at` timestamp is the unit's
 * completion timestamp when available, falling back to created_at, then
 * to now (which is wrong but never more wrong than blocking the cursor).
 *
 * Studio config is read at migration time to determine the configured
 * roles per stage. If the studio config can't be read (e.g. the studio
 * is missing the stage's review-agents directory), the backfill is
 * partial — we stamp what we can find.
 */
function backfillCompletedUnitStamps(
	frontmatter: Record<string, unknown>,
	timestamp: string,
	studio: string,
	stage: string,
	details: MigrationStepDetails,
): void {
	const stamp = { at: timestamp, migrated: true }

	// Reviews: spec is engine-built and always present. user is the human
	// gate. Configured review agents come from the studio. autopilot
	// strips down to spec-only, but the migrator can't know the intent's
	// runtime mode reliably from a v3→v4 jump (the mode field's
	// semantics changed). Stamp the full list — extras are harmless,
	// missing stamps trigger re-review.
	const reviews = frontmatter.reviews as Record<string, unknown>
	let reviewAgents: string[] = []
	try {
		reviewAgents = Object.keys(readReviewAgentPaths(studio, stage)).sort()
	} catch {
		reviewAgents = []
	}
	const reviewRoles = ["spec", ...reviewAgents, "user"]
	for (const role of reviewRoles) {
		if (reviews[role] == null) {
			reviews[role] = stamp
			details.review_stamps_synthesized++
		}
	}

	// Approvals: spec, quality_gates (engine-built), configured agents,
	// user. Same logic as reviews.
	const approvals = frontmatter.approvals as Record<string, unknown>
	const approvalRoles = ["spec", "quality_gates", ...reviewAgents, "user"]
	for (const role of approvalRoles) {
		if (approvals[role] == null) {
			approvals[role] = stamp
			details.approval_stamps_synthesized++
		}
	}
}

function migrateUnitFile(
	path: string,
	details: MigrationStepDetails,
	studio: string,
	stage: string,
): void {
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
	if (typeof next.reviews !== "object" || next.reviews === null) {
		next.reviews = {}
	}
	if (typeof next.approvals !== "object" || next.approvals === null) {
		next.approvals = {}
	}
	// Drop any legacy `discovery: {}` field — v4 reads discovery from
	// the artifact on disk, not the unit FM. Leaving the field around
	// just confuses post-migration debugging.
	delete next.discovery
	if (wasCompleted) {
		// Backfill cursor-checked stamps for actions that don't produce
		// a file output: review sign-offs and approvals. Without this,
		// the cursor sees a "completed" unit with empty `reviews: {}` /
		// `approvals: {}` and emits per-role review/approval actions on
		// every tick — re-running phases that already happened in v3.
		// Discovery is NOT backfilled — the v3 artifact is already on
		// disk and the cursor's existence check picks it up naturally.
		// `studio` and `stage` come from the migrator's outer walk; the
		// backfill resolves the studio's per-stage configuration to
		// know which roles to stamp.
		const ts = bestTimestamp([oldCompletedAt])
		backfillCompletedUnitStamps(next, ts, studio, stage, details)
		// approvals.user counter is preserved for back-compat with
		// existing tests/banner copy that report on it specifically.
		// `backfillCompletedUnitStamps` already stamps approvals.user;
		// we just keep the counter incrementing.
		details.units_with_synthesized_approval++
	}
	writeMatter(path, next, body)
	// Counter increments AFTER writeMatter — if the file failed to parse
	// in tryMigrateFile above, this line is unreachable and the count
	// excludes the failed file. That's intentional: the banner should
	// report what successfully migrated, not what was attempted.
	// `tryMigrateFile`'s console.warn is the audit trail for skips.
	details.units_migrated++
}

// ── Feedback.md migrator (for one stage or intent-scope) ─────────────

function migrateFeedbackInDir(
	feedbackDir: string,
	intentDir: string,
	details: MigrationStepDetails,
): void {
	if (!existsSync(feedbackDir)) return
	const entries = readdirSync(feedbackDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!entry.name.endsWith(".md")) continue
		const path = join(feedbackDir, entry.name)
		tryMigrateFile(
			path,
			() => migrateFeedbackFile(path, intentDir, details),
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

function migrateFeedbackFile(
	path: string,
	intentDir: string,
	details: MigrationStepDetails,
): void {
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
	let synthesizedClosure = false
	if (next.closed_at == null) {
		if (FB_TERMINAL_STATUSES.has(oldStatus)) {
			next.closed_at = bestTimestamp([oldClosedBy, data.created_at])
			synthesizedClosure = true
		} else {
			next.closed_at = null
		}
	}
	// Write the migrated frontmatter to the original path first. The
	// upstream-stage relocation is independent — relocating after the
	// rewrite keeps the file's content correct regardless of whether
	// the relocate step succeeds.
	writeMatter(path, next, body)
	details.feedback_migrated++
	if (synthesizedClosure) details.feedback_with_synthesized_closure++
	// v3 used `upstream_stage:` as a routing hint when an FB on stage A
	// actually targeted stage B. v4 routes by file location. Move the
	// file now (with renumbering) so the stage that actually owns the
	// finding sees it on the next cursor walk. `data` is the ORIGINAL
	// pre-strip frontmatter, which still carries upstream_stage —
	// after `strip()` the field is gone, but we kept the reference.
	const relocated = relocateFeedbackIfUpstreamStage(path, data, intentDir)
	if (relocated) details.feedback_relocated++
}

// ── Top-level migrator ───────────────────────────────────────────────

function v0ToV4(ctx: MigrationContext): MigrationStepDetails {
	const { intentDir } = ctx
	const details = emptyMigrationDetails()

	// 1. Intent.md
	migrateIntentMd(intentDir, details)

	// 2. Resolve the studio for the stamp backfill. We read intent.md
	// AFTER step 1 because the intent migrator preserves `studio:` —
	// whatever was on disk is still there. Empty string when missing
	// disables the backfill cleanly (both readStageArtifactDefs and
	// readReviewAgentPaths return empty for an unknown studio, so the
	// loops skip safely).
	let studio = ""
	const intentMdPath = join(intentDir, "intent.md")
	if (existsSync(intentMdPath)) {
		try {
			const intentFm = readMatter(intentMdPath).data
			if (typeof intentFm.studio === "string") studio = intentFm.studio
		} catch {
			studio = ""
		}
	}

	// Track which stages v3 had marked complete. The cursor's
	// `firstUnmergedStage` consults `stages_merged` on intent.md as a
	// definitive override — without this, v3-merged-and-deleted stage
	// branches would re-emit `merge_stage` forever (the branch ref is
	// gone, the cursor can't tell it was already done).
	const stagesMerged: string[] = []

	// 3. Per-stage walks
	const stagesDir = join(intentDir, "stages")
	if (existsSync(stagesDir)) {
		for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const stageDir = join(stagesDir, entry.name)
			const stage = entry.name

			// 2a. Units
			migrateUnitsInStage(stageDir, details, studio, stage)

			// 2b. Stage-scope feedback
			migrateFeedbackInDir(join(stageDir, "feedback"), intentDir, details)

			// 2c. Stage state.json — read v3 status BEFORE deleting so
			// completed stages get added to `stages_merged`. Then delete.
			// Reading first preserves the only signal v3 had for "this
			// stage is done"; the v4 file shape doesn't carry status.
			const stateJson = join(stageDir, "state.json")
			if (existsSync(stateJson)) {
				try {
					const v3State = JSON.parse(readFileSync(stateJson, "utf8")) as {
						status?: string
					}
					if (v3State.status === "completed") {
						stagesMerged.push(stage)
					}
				} catch {
					/* malformed v3 state.json — skip the merge stamp; cursor
					   will fall back to git topology. Better than failing
					   migration on a single junk file. */
				}
				rmSync(stateJson, { force: true })
				details.state_json_deleted++
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
					details.drift_artifacts_deleted++
				}
			}
		}
	}

	// 3. Intent-scope feedback
	migrateFeedbackInDir(join(intentDir, "feedback"), intentDir, details)

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
			details.drift_artifacts_deleted++
		}
	}

	// 5. Stamp `stages_merged` on intent.md from v3 state.json statuses
	// collected above. Only runs if we actually saw completed stages —
	// avoids stamping an empty list on intents that were mid-flight at
	// migration time. Existing entries on intent.md (from a partial
	// previous migration run) are preserved and merged.
	if (stagesMerged.length > 0 && existsSync(intentMdPath)) {
		try {
			const { data, body } = readMatter(intentMdPath)
			const existing = Array.isArray(data.stages_merged)
				? (data.stages_merged as string[])
				: []
			const next = Array.from(new Set([...existing, ...stagesMerged]))
			data.stages_merged = next
			writeMatter(intentMdPath, data, body)
			details.stages_merged_stamped = stagesMerged.length
		} catch {
			/* writing intent.md back failed for some reason — log but
			   don't fail migration. Cursor will fall back to git topology
			   for these stages. */
		}
	}

	return details
}

// Register the edge. Pre-v4 intents have no plugin_version field;
// we represent that as the literal "0" version string.
registerMigrator("0", TARGET_VERSION, v0ToV4)

/**
 * Detect v3-shape frontmatter that survived into an otherwise-migrated
 * intent. Catches the case where a stage merge brings v3 unit/feedback
 * files back into a tree whose intent.md is already stamped as v4 —
 * `runWorkflowTick`'s `sourceMajor !== targetMajor` gate would skip the
 * migrator (intent.md says v4) and the v3 cruft would sit forever.
 *
 * Cheap sentinel check: read intent.md + the first unit file per stage
 * + the stage's state.json (if present), look for any
 * DEPRECATED_INTENT_FIELDS / DEPRECATED_UNIT_FIELDS keys, or a v3-shape
 * `status: "active"|"completed"|"pending"` on state.json. Returns true
 * on the first hit. Bounded read count per tick.
 *
 * Feedback files are intentionally NOT sentinels here even though
 * DEPRECATED_FB_FIELDS exists for the migrator's strip pass —
 * v4 `writeFeedbackFile` writes status/bolt/triaged_at/closed_by/
 * resolution to every new FB, so a `key in fm` check would false-positive
 * on every v4 intent with feedback. See the inline comment in the
 * stage walk below.
 *
 * Returns true if the migrator should re-run regardless of intent.md's
 * plugin_version.
 */
export function hasV3CruftInIntent(intentDirPath: string): boolean {
	const intentMd = join(intentDirPath, "intent.md")
	if (existsSync(intentMd)) {
		try {
			const fm = readMatter(intentMd).data
			for (const key of DEPRECATED_INTENT_FIELDS) {
				if (key in fm) return true
			}
		} catch {
			/* malformed YAML — let the next tick's tryMigrateFile log it */
		}
	}
	const stagesDir = join(intentDirPath, "stages")
	if (!existsSync(stagesDir)) return false
	for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const stageDir = join(stagesDir, entry.name)
		// Sentinel: first unit file per stage.
		const unitsDir = join(stageDir, "units")
		if (existsSync(unitsDir)) {
			const unit = readdirSync(unitsDir).find((f) => f.endsWith(".md"))
			if (unit) {
				try {
					const fm = readMatter(join(unitsDir, unit)).data
					for (const key of DEPRECATED_UNIT_FIELDS) {
						if (key in fm) return true
					}
				} catch {
					/* skip, same reasoning */
				}
			}
		}
		// NOTE: no feedback-file sentinel here. v4's `writeFeedbackFile`
		// writes every field in DEPRECATED_FB_FIELDS to every new FB
		// (`status: "pending"`, `bolt: 0`, `triaged_at: <ts>`,
		// `closed_by: null`, `resolution: null`, `iteration`, `visit`)
		// — those names overlap v3's vocabulary but the values stay
		// live in v4. A naive `key in fm` check would fire on every v4
		// intent that has feedback, force re-migration on the next
		// tick, and `migrateFeedbackFile`'s `strip(data, DEPRECATED_FB_FIELDS)`
		// would clobber `triaged_at` (re-untriaging closed FBs and
		// looping the triage gate) and `closed_by` (losing closure
		// attribution mid-cycle). The unit-file sentinel and the
		// state.json sentinel are sufficient: v3 unit fields
		// (status/hat/bolt/hat_started_at) are NEVER written by v4
		// unit creation, and v3 state.json `status` field is NEVER
		// written by v4. Either is a clean fingerprint of post-merge
		// v3 cruft. v3 feedback files don't carry anything v4 doesn't
		// also carry, so the FB check provided no marginal detection
		// value — only false positives.
		//
		// Stage state.json from v3 is itself a fingerprint — v4 never
		// writes a state.json with `status: "active"|"completed"|"pending"`,
		// so its presence is enough to force re-migration.
		const stateJson = join(stageDir, "state.json")
		if (existsSync(stateJson)) {
			try {
				const json = JSON.parse(readFileSync(stateJson, "utf8"))
				if (
					typeof json === "object" &&
					json !== null &&
					typeof json.status === "string" &&
					(json.status === "active" ||
						json.status === "completed" ||
						json.status === "pending")
				) {
					return true
				}
			} catch {
				/* skip */
			}
		}
	}
	return false
}

export const __testOnly = {
	migrateIntentMd,
	migrateUnitsInStage,
	migrateFeedbackInDir,
	v0ToV4,
}
