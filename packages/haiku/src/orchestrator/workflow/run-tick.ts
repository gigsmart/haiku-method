// orchestrator/workflow/run-tick.ts — v4 workflow tick.
//
// Pure observation: read disk → run migrators if needed → call
// cursor.derivePosition → map CursorAction to OrchestratorAction →
// return. No mutating side effects. Anyone can call run_next; same
// disk state → same answer every time.
//
// Replaces v3's "derive-state → handler dispatch with mutating
// pre-tick repair" chain. The cursor walks Track C (drift) → Track B
// (feedback) → Track A (intent) on every call and returns the next
// instruction. Bolt counts, status flags, and hat positions are all
// derived from on-disk frontmatter.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { broadcastIntent } from "../../intent-broadcaster.js"
import type { OrchestratorAction } from "../../orchestrator.js"
import { intentDir } from "../../state-tools.js"
import { emitTelemetry } from "../../telemetry.js"
import { getPluginVersion } from "../../version.js"
import { migrateIntent } from "../migrate-registry.js"
// Importing the migrator file for its side effect: registerMigrator
// runs at module load and adds the v0→v4 edge to the registry.
import "../migrations/v0-to-v4.js"
import {
	type CursorAction,
	type CursorPosition,
	derivePosition,
} from "./cursor.js"

/** Result of a single workflow tick. */
export interface WorkflowTickResult {
	readonly position: CursorPosition
	readonly action: OrchestratorAction | null
}

/**
 * Drive one workflow tick and return the next OrchestratorAction.
 * Pure: no disk writes (other than migrator output, which is
 * conceptually a one-time read-time fixup).
 */
export function runWorkflowTick(
	slug: string,
	root?: string,
): WorkflowTickResult | null {
	// `intentDir` resolves against the current haiku root (cwd-driven);
	// the optional `root` arg here is reserved for future fixture
	// override but currently unused.
	void root
	// Sad-path guard: `intentDir(slug)` walks up from cwd to find a
	// `.haiku/` directory and throws if none exists. Return null so
	// `dispatchOrchestratorAction` can surface a structured "intent
	// not found" error instead of letting a stray throw bubble out
	// of every haiku_run_next call placed outside an initialized
	// project.
	let iDir: string
	try {
		iDir = intentDir(slug)
	} catch {
		return null
	}
	const intentMdPath = join(iDir, "intent.md")
	if (!existsSync(intentMdPath)) return null

	// Migrators: stamp the intent at the current plugin version, run
	// any needed transforms. Idempotent — once stamped, this is a no-op.
	//
	// Gating rule: only run migrators when the running plugin is v4 or
	// later. Pre-v4 plugin builds (3.x) coexist with un-migrated v0
	// intents and should leave them alone. CI auto-bumps the plugin
	// version on merge to main; once a v4.x build ships, this gate
	// flips and every intent gets migrated on first read.
	const target = getPluginVersion()
	const targetMajor = Number(target.split(".")[0] ?? "0")
	let intentFm = parseIntentFm(intentMdPath)
	if (targetMajor >= 4) {
		const sourceVersion =
			typeof intentFm.plugin_version === "string"
				? (intentFm.plugin_version as string)
				: "0"
		// Compare by major version only. The migrate registry has edges
		// keyed by major (`"0" → "4.0.0"`), not full semver. CI auto-
		// bumps the patch on every merge to main, so an exact compare
		// (`sourceVersion !== target`) would fire `migrateIntent("4.0.0",
		// "4.0.1")` after the first post-ship bump → `findChain` finds
		// no edge → throws → every tick on every v4 intent returns
		// `action: "error"`. Compare majors and skip migration when
		// they match. This means a same-major intent stays on disk with
		// `plugin_version: "4.0.0"` even when the running plugin is
		// `4.0.1`; that's intentional — the FM stamp marks the schema
		// generation, not the build that last touched it.
		const sourceMajor = Number(sourceVersion.split(".")[0] ?? "0") || 0
		if (sourceMajor !== targetMajor) {
			try {
				migrateIntent(
					{ intentDir: iDir, repoRoot: root ?? "" },
					sourceVersion,
					target,
				)
				intentFm = parseIntentFm(intentMdPath)
			} catch (err) {
				emitTelemetry("haiku.migrate.failed", {
					intent: slug,
					from: sourceVersion,
					to: target,
					error: String((err as Error)?.message ?? err),
				})
				return {
					position: {
						track: "intent",
						action: { kind: "intent_review" },
					},
					action: {
						action: "error",
						intent: slug,
						message: `Migration from plugin_version='${sourceVersion}' to '${target}' failed: ${String((err as Error)?.message ?? err)}. Resolve manually before continuing.`,
					},
				}
			}
		}
	}

	// Pre-cursor selection gates. Each emits a structured `select_*`
	// action when the corresponding field is missing on intent.md.
	// haiku_run_next intercepts these, runs the SPA picker inline,
	// writes the chosen value, and re-ticks — so the agent never sees
	// a "Call haiku_select_*" instruction. The tick simply blocks until
	// the user picks. Direct callers (tests, foreign callers of
	// runWorkflowTick) get the structured action and can decide how to
	// handle it.
	const studio = (intentFm.studio as string) || ""
	if (!studio) {
		return {
			position: { track: "intent", action: null },
			action: {
				action: "select_studio",
				intent: slug,
				message: `Intent '${slug}' has no studio.`,
			},
		}
	}

	const mode = (intentFm.mode as string) || ""
	if (!mode) {
		return {
			position: { track: "intent", action: null },
			action: {
				action: "select_mode",
				intent: slug,
				message: `Intent '${slug}' has no mode.`,
			},
		}
	}

	const stages = Array.isArray(intentFm.stages)
		? (intentFm.stages as unknown[])
		: []
	if (mode === "quick" && stages.length === 0) {
		return {
			position: { track: "intent", action: null },
			action: {
				action: "select_stage",
				intent: slug,
				message: `Intent '${slug}' is in quick mode with no stage selected.`,
			},
		}
	}

	// Cursor walk — pure read. Returns the next CursorAction (or null
	// for mid-wave noop).
	const position = derivePosition({ slug, intentDir: iDir, studio })
	const action = position.action
		? cursorActionToOrchestratorAction(slug, position.action)
		: null

	return broadcastTick(slug, { position, action })
}

/**
 * Convenience entrypoint: drive a tick and surface the OrchestratorAction
 * (or a stable error). Used by haiku_run_next.
 */
export function dispatchOrchestratorAction(
	slug: string,
	root?: string,
): OrchestratorAction {
	const tick = runWorkflowTick(slug, root)
	if (!tick) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}
	if (tick.action) return tick.action
	// null action = mid-wave noop. Surface as a stable "wait for
	// outstanding subagents" signal so the parent doesn't loop on it.
	return {
		action: "noop",
		intent: slug,
		message: `Mid-wave noop. In-flight subagents are still working — wait for them to terminate, then retick.`,
	}
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseIntentFm(path: string): Record<string, unknown> {
	const raw = readFileSync(path, "utf8")
	const parsed = matter(raw)
	return parsed.data as Record<string, unknown>
}

/**
 * Map a CursorAction to the OrchestratorAction shape every legacy
 * caller expects. The `action` field is the cursor's `kind`; the rest
 * of the discriminated union spreads as-is.
 */
function cursorActionToOrchestratorAction(
	slug: string,
	cursor: CursorAction,
): OrchestratorAction {
	return {
		...cursor,
		action: cursor.kind,
		intent: slug,
	} as OrchestratorAction
}

/** Wrap a tick result with a broadcast to the per-intent live-state
 *  pub/sub. */
function broadcastTick(
	slug: string,
	result: WorkflowTickResult,
): WorkflowTickResult {
	if (result.action) {
		broadcastIntent(slug, {
			type: "tick_committed",
			action: (result.action as { action?: string }).action ?? "unknown",
		})
	}
	return result
}

// v3 compatibility shims — kept transiently so callers that imported
// these names continue to type-check. M3 prompt audit will remove
// them when the new dispatch tools land.
export const WORKFLOW_STATES: ReadonlyArray<string> = []
export function dispatchHandler(): null {
	return null
}
