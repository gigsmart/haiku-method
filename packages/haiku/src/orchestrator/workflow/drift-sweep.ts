// orchestrator/workflow/drift-sweep.ts — Drift detection by content hash.
//
// 2026-05-07: collapsed from the old sidecar-baseline + git-log model
// to a pure content-hash compare. Sign-time records the body sha256
// (for spec witnesses) or a witnesses map of sha256s (for output
// witnesses). The sweep hashes what's there now and compares.
//
// Key invariant: we hash the BODY of unit specs, not the whole file.
// The frontmatter is workflow-managed (every advance_hat appends to
// iterations[], every signing stamps a slot). If we hashed the whole
// file, every engine fm mutation would trip drift on its own
// previously-signed reviews. The body-only hash decouples
// agent/human authored prose from engine bookkeeping.
//
// Output and discovery witnesses are full-file hashes — those files
// are agent-authored and don't carry workflow frontmatter.
//
// Works in both git and filesystem persistence modes — the sweep no
// longer requires a git repo. When git is available, drift events
// can be enriched with the SHAs that touched the path (for the FB
// body), but that's commentary, not the detection signal.

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { primaryRepoRoot } from "../../state-tools.js"
import { isDriftDetectionDisabled } from "./drift-baseline.js"
import { bodySha256, fileSha256 } from "./sign-slot.js"
import { readFileSync } from "node:fs"
import matter from "gray-matter"

export type DriftKind =
	| "spec"
	| "output"
	| "discovery_output"
	| "discovery_mandate"

export type DriftEvent = {
	unit: string
	role: string
	kind: DriftKind
	file: string
	since: string
	commits: string[] // optional git enrichment; empty in fs mode
}

export type DriftSweepResult = {
	events: DriftEvent[]
	scanned: number
	skipped: number
}

/**
 * Optional git enrichment: when git is available, list the SHAs that
 * touched `path` since `sinceISO`. Used to populate the `commits`
 * field on a drift event for human readability. Returns [] in fs
 * mode or when git fails.
 */
function gitLogSinceTimestamp(
	cwd: string,
	path: string,
	sinceISO: string,
): string[] {
	try {
		const out = execFileSync(
			"git",
			["log", `--since=${sinceISO}`, "--format=%H", "--", path],
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

function pickBodySha(record: unknown): string | null {
	if (record === null || typeof record !== "object") return null
	const r = record as Record<string, unknown>
	return typeof r.body_sha256 === "string" && r.body_sha256.length === 64
		? r.body_sha256
		: null
}

function pickWitnesses(record: unknown): Record<string, string> | null {
	if (record === null || typeof record !== "object") return null
	const r = record as Record<string, unknown>
	const w = r.witnesses
	if (w === null || typeof w !== "object" || Array.isArray(w)) return null
	const out: Record<string, string> = {}
	for (const [k, v] of Object.entries(w as Record<string, unknown>)) {
		if (typeof v === "string" && v.length === 64) out[k] = v
	}
	return out
}

function listUnitsInStage(stageDir: string): string[] {
	const unitsDir = join(stageDir, "units")
	if (!existsSync(unitsDir)) return []
	return readdirSync(unitsDir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => join(unitsDir, e.name))
}

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
 * Walk all signed reviews/approvals/discovery on every unit in the
 * active stage, plus intent-scope approvals on intent.md. For each
 * signed slot, hash the witnessed body/files and compare to the
 * stored hash. Mismatch = drift.
 */
export function runDriftSweep(args: {
	intentDir: string
	stage: string
	studio: string
	repoRoot?: string
}): DriftSweepResult {
	const repoRoot = args.repoRoot ?? primaryRepoRoot()
	const haikuRoot = join(repoRoot, ".haiku")
	if (isDriftDetectionDisabled(haikuRoot)) {
		return { events: [], scanned: 0, skipped: 0 }
	}
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
		if (fm.started_at == null) {
			skipped++
			continue
		}
		const unitRel = relative(repoRoot, unitPath)

		// reviews.<role> witnesses the unit body. Hash it now and
		// compare to the stored body_sha256. When the slot has no
		// body_sha256 (legacy intent or pre-refactor stamp), we treat
		// this tick as a baseline-set: skip drift detection for that
		// slot. The next sign call will populate the hash.
		const reviews = (fm.reviews as Record<string, unknown>) ?? {}
		for (const [role, record] of Object.entries(reviews)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			const stored = pickBodySha(record)
			if (!stored) continue // legacy slot, no baseline yet
			const current = bodySha256(unitPath)
			if (current && current !== stored) {
				events.push({
					unit: unitName,
					role,
					kind: "spec",
					file: unitRel,
					since: at,
					commits: gitLogSinceTimestamp(repoRoot, unitRel, at),
				})
			}
		}

		// approvals.<role> witnesses declared output paths. The slot
		// stores a `witnesses: { <relPath>: <sha256> }` map. For each
		// entry: hash the file now, compare to stored. Mismatch =
		// drift on that specific output. Files declared in fm.outputs
		// but absent from witnesses (e.g. created after sign) are
		// ignored — they'll show up next time the slot is re-signed.
		const approvals = (fm.approvals as Record<string, unknown>) ?? {}
		for (const [role, record] of Object.entries(approvals)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			const witnesses = pickWitnesses(record)
			if (!witnesses) continue // legacy slot, no baseline yet
			for (const [outRel, storedHash] of Object.entries(witnesses)) {
				const outAbs = join(args.intentDir, outRel)
				const currentHash = fileSha256(outAbs)
				if (!currentHash) continue // file deleted; not a drift signal here
				if (currentHash !== storedHash) {
					events.push({
						unit: unitName,
						role,
						kind: "output",
						file: relative(repoRoot, outAbs),
						since: at,
						commits: gitLogSinceTimestamp(
							repoRoot,
							relative(repoRoot, outAbs),
							at,
						),
					})
				}
			}
		}

		// discovery.<agent> witnesses the discovery output file plus
		// the studio mandate. Same hash-compare model. Both witnessed
		// files use full-file hashes (no frontmatter stripping); the
		// mandate is plugin-source markdown without runtime fm churn,
		// and discovery outputs are agent-authored.
		const discovery = (fm.discovery as Record<string, unknown>) ?? {}
		for (const [agent, record] of Object.entries(discovery)) {
			scanned++
			const at = pickAt(record)
			if (!at) continue
			const r = record as Record<string, unknown>
			const outputAbs = discoveryOutputPath(args.intentDir, args.stage, agent)
			const outputStored =
				typeof r.output_sha256 === "string" ? r.output_sha256 : null
			if (outputStored) {
				const outputCurrent = fileSha256(outputAbs)
				if (outputCurrent && outputCurrent !== outputStored) {
					events.push({
						unit: unitName,
						role: agent,
						kind: "discovery_output",
						file: relative(repoRoot, outputAbs),
						since: at,
						commits: gitLogSinceTimestamp(
							repoRoot,
							relative(repoRoot, outputAbs),
							at,
						),
					})
				}
			}
			const mandateAbs = discoveryMandatePath(
				repoRoot,
				args.studio,
				args.stage,
				agent,
			)
			const mandateStored =
				typeof r.mandate_sha256 === "string" ? r.mandate_sha256 : null
			if (mandateStored) {
				const mandateCurrent = fileSha256(mandateAbs)
				if (mandateCurrent && mandateCurrent !== mandateStored) {
					events.push({
						unit: unitName,
						role: agent,
						kind: "discovery_mandate",
						file: relative(repoRoot, mandateAbs),
						since: at,
						commits: gitLogSinceTimestamp(
							repoRoot,
							relative(repoRoot, mandateAbs),
							at,
						),
					})
				}
			}
		}
	}

	// Intent-scope approvals on intent.md — body-hash witness. Same
	// rules as unit reviews: hash the body (post-frontmatter), skip
	// if no stored hash.
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
			const stored = pickBodySha(record)
			if (!stored) continue
			const current = bodySha256(intentMdPath)
			if (current && current !== stored) {
				events.push({
					unit: "(intent)",
					role,
					kind: "spec",
					file: intentRel,
					since: at,
					commits: gitLogSinceTimestamp(repoRoot, intentRel, at),
				})
			}
		}
	}

	// Dedup against open drift FBs by source_ref. Once an agent files
	// an FB for a drift event, we suppress re-emission until the FB
	// closes — otherwise Track C (drift) would always win over Track B
	// (the fix loop) and the loop could never complete.
	const filedRefs = collectOpenDriftSourceRefs(args.intentDir)
	const filtered = events.filter((e) => {
		const ref = `drift:${e.kind}:${e.file}`
		return !filedRefs.has(ref)
	})

	return { events: filtered, scanned, skipped }
}

function collectOpenDriftSourceRefs(intentDir: string): Set<string> {
	const refs = new Set<string>()
	const fbDirs: string[] = []
	const stagesDir = join(intentDir, "stages")
	if (existsSync(stagesDir)) {
		for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			fbDirs.push(join(stagesDir, entry.name, "feedback"))
		}
	}
	fbDirs.push(join(intentDir, "feedback"))
	for (const dir of fbDirs) {
		if (!existsSync(dir)) continue
		for (const f of readdirSync(dir)) {
			if (!f.endsWith(".md")) continue
			const fm = readFm(join(dir, f))
			if (!fm) continue
			if (fm.origin !== "drift") continue
			if (typeof fm.closed_at === "string" && fm.closed_at.length > 0)
				continue
			const ref = fm.source_ref
			if (typeof ref === "string" && ref.length > 0) refs.add(ref)
		}
	}
	return refs
}
