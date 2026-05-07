// orchestrator/workflow/drift-sweep.ts — Track C of the cursor walk.
//
// Detects out-of-band edits to artifacts that are signed by reviews,
// approvals, or discovery records. Returns a list of drift events.
// The cursor turns each event into a `drift_detected` action; the
// agent files an FB targeting the affected unit; the feedback track
// handles the consequences.
//
// Why drift detection lives here (and not in the merge / advance_hat
// path): tool-level invalidation already clears reviews + approvals
// when the agent calls haiku_unit_write or haiku_unit_set. The drift
// sweep is the secondary catch for edits that bypassed the tools —
// someone editing unit-NN.md directly in their editor, or making a
// manual git commit on the stage branch that edits a unit's outputs.
//
// Witness mechanism: each signed record carries an `at` timestamp.
// Drift sweep walks `git log --since=<at> -- <path>` against the
// witnessed paths. Any commit since `at` that touched the path is
// drift. Git is the byte witness; we don't carry SHAs in the schema.
//
// Skipped: units without `started_at` (pre-execute, fair game to
// change). Drift sweep on those would generate noise during normal
// elaboration.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import matter from "gray-matter"
import { primaryRepoRoot } from "../../state-tools.js"

export type DriftKind =
	| "spec"
	| "output"
	| "discovery_output"
	| "discovery_mandate"

export type DriftEvent = {
	unit: string
	role: string // for spec/output: review/approval role key. for discovery: agent name.
	kind: DriftKind
	file: string // repo-relative path that drifted
	since: string // the witness timestamp
	commits: string[] // commit shas that touched the path since `since`
}

export type DriftSweepResult = {
	events: DriftEvent[]
	scanned: number // number of records checked
	skipped: number // number of records skipped (e.g. unstarted units)
}

/**
 * Returns commit hashes that touched `path` since `sinceISO`.
 * Empty array if no drift. Best-effort — non-git directories return
 * empty.
 */
function gitLogSinceTimestamp(
	cwd: string,
	path: string,
	sinceISO: string,
): string[] {
	try {
		const out = execFileSync(
			"git",
			[
				"log",
				`--since=${sinceISO}`,
				"--format=%H",
				"--",
				path,
			],
			{ encoding: "utf8", stdio: "pipe", cwd },
		).trim()
		if (out.length === 0) return []
		return out.split("\n").filter((s) => s.length > 0)
	} catch {
		return []
	}
}

function readFm(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, "utf8")
		const parsed = matter(raw)
		return parsed.data as Record<string, unknown>
	} catch {
		return null
	}
}

function pickAt(record: unknown): string | null {
	if (record === null || typeof record !== "object") return null
	const r = record as Record<string, unknown>
	return typeof r.at === "string" && r.at.length > 0 ? r.at : null
}

function listUnitsInStage(stageDir: string): string[] {
	const unitsDir = join(stageDir, "units")
	if (!existsSync(unitsDir)) return []
	return readdirSync(unitsDir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => join(unitsDir, e.name))
}

/**
 * Discovery output path convention:
 *   `<intent-dir>/stages/<stage>/discovery/<agent>.md`
 *
 * Mandate path convention:
 *   `<repo-root>/plugin/studios/<studio>/stages/<stage>/discovery/<agent>.md`
 */
function discoveryOutputPath(
	intentDir: string,
	stage: string,
	agent: string,
): string {
	return join(intentDir, "stages", stage, "discovery", `${agent}.md`)
}

function discoveryMandatePath(
	repoRoot: string,
	studio: string,
	stage: string,
	agent: string,
): string {
	return join(
		repoRoot,
		"plugin",
		"studios",
		studio,
		"stages",
		stage,
		"discovery",
		`${agent}.md`,
	)
}

/**
 * Walk all signed reviews/approvals on every unit in the active stage,
 * plus all signed discovery records, plus intent-scope approvals on
 * intent.md. Returns a list of drift events.
 */
export function runDriftSweep(args: {
	intentDir: string
	stage: string
	studio: string
	repoRoot?: string
}): DriftSweepResult {
	const repoRoot = args.repoRoot ?? primaryRepoRoot()
	const events: DriftEvent[] = []
	let scanned = 0
	let skipped = 0

	const stageDir = join(args.intentDir, "stages", args.stage)
	const unitPaths = listUnitsInStage(stageDir)

	for (const unitPath of unitPaths) {
		const fm = readFm(unitPath)
		if (!fm) continue
		const unitName = (() => {
			const base = unitPath.split("/").pop() ?? ""
			return base.replace(/\.md$/, "")
		})()

		// Skip pre-execute units — they have no started_at, so any
		// signed reviews/approvals (rare but possible) are also moot.
		if (fm.started_at == null) {
			skipped++
			continue
		}

		const unitRel = relative(repoRoot, unitPath)

		// reviews.<role> → witnessed against the spec body (the unit
		// .md itself). Any commit since `at` that touched unit.md is
		// potential drift on the spec.
		const reviews = (fm.reviews as Record<string, unknown>) ?? {}
		for (const [role, record] of Object.entries(reviews)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue // unsigned slot, nothing to check
			const commits = gitLogSinceTimestamp(repoRoot, unitRel, at)
			if (commits.length > 0) {
				events.push({
					unit: unitName,
					role,
					kind: "spec",
					file: unitRel,
					since: at,
					commits,
				})
			}
		}

		// approvals.<role> → witnessed against declared output paths.
		// Any commit since `at` that touched any output path is drift.
		const approvals = (fm.approvals as Record<string, unknown>) ?? {}
		const outputs = Array.isArray(fm.outputs) ? (fm.outputs as string[]) : []
		for (const [role, record] of Object.entries(approvals)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			for (const out of outputs) {
				const outRel = relative(repoRoot, join(args.intentDir, out))
				const commits = gitLogSinceTimestamp(repoRoot, outRel, at)
				if (commits.length > 0) {
					events.push({
						unit: unitName,
						role,
						kind: "output",
						file: outRel,
						since: at,
						commits,
					})
				}
			}
		}

		// discovery.<agent> → two witnesses: the agent's mandate file
		// (under plugin/studios/...) and the unit's discovery output
		// (under <intent>/stages/<stage>/discovery/...). Either drift
		// fires the agent's drift event.
		const discovery = (fm.discovery as Record<string, unknown>) ?? {}
		for (const [agent, record] of Object.entries(discovery)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			const outputAbs = discoveryOutputPath(args.intentDir, args.stage, agent)
			const outputRel = relative(repoRoot, outputAbs)
			const outputCommits = gitLogSinceTimestamp(repoRoot, outputRel, at)
			if (outputCommits.length > 0) {
				events.push({
					unit: unitName,
					role: agent,
					kind: "discovery_output",
					file: outputRel,
					since: at,
					commits: outputCommits,
				})
			}
			const mandateAbs = discoveryMandatePath(
				repoRoot,
				args.studio,
				args.stage,
				agent,
			)
			const mandateRel = relative(repoRoot, mandateAbs)
			const mandateCommits = gitLogSinceTimestamp(repoRoot, mandateRel, at)
			if (mandateCommits.length > 0) {
				events.push({
					unit: unitName,
					role: agent,
					kind: "discovery_mandate",
					file: mandateRel,
					since: at,
					commits: mandateCommits,
				})
			}
		}
	}

	// Intent-scope approvals on intent.md. Witnessed against the
	// intent body (intent.md itself).
	const intentMdPath = join(args.intentDir, "intent.md")
	const intentFm = readFm(intentMdPath)
	if (intentFm) {
		const intentApprovals =
			(intentFm.approvals as Record<string, unknown>) ?? {}
		const intentRel = relative(repoRoot, intentMdPath)
		for (const [role, record] of Object.entries(intentApprovals)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			const commits = gitLogSinceTimestamp(repoRoot, intentRel, at)
			if (commits.length > 0) {
				events.push({
					unit: "(intent)",
					role,
					kind: "spec",
					file: intentRel,
					since: at,
					commits,
				})
			}
		}
	}

	return { events, scanned, skipped }
}

// Test-only escape hatch.
export const __testOnly = {
	gitLogSinceTimestamp,
	discoveryOutputPath,
	discoveryMandatePath,
}
