// orchestrator/migrate-registry.ts — Plugin-version-keyed migration
// graph for intent state.
//
// Why a graph (not a flat Record):
//   - v4 only needs one migrator (v0 → v4.0.0), and a flat
//     Record<from, Migrator> works.
//   - But future shape changes will add v5, v6, etc. Some refactors
//     will register v5→v6 directly; some will register v4→v6 as a
//     skip-step. A graph + shortest-path lookup means callers don't
//     have to hand-write every (from, to) pair — the registry
//     discovers the chain.
//
// The graph keys are plugin version strings ("0" for pre-v4, then
// semver strings for v4 and onward). The "0" sentinel means
// "intent.md has no plugin_version field, so it predates v4."
//
// Discovery semantics:
//   - migrate(intent, currentTarget) walks from intent.plugin_version
//     to currentTarget via shortest-path BFS over registered edges.
//   - If no path exists, throw — an unmigrated intent on a too-new
//     engine is a hard error, not a silent skip.
//   - Each migrator step is responsible for stamping the target
//     version into intent.md so the chain progresses.
//
// Migrator contract:
//   - Pure-ish: reads + writes the intent's directory tree.
//   - Synchronous (matches the rest of the engine).
//   - Idempotent re-runs are not required — the version stamp ensures
//     a migrator runs at most once per intent.
//   - Throwing aborts the migration; the engine surfaces the error
//     and refuses to drive the workflow until manually resolved.

export type MigrationContext = {
	intentDir: string
	repoRoot: string
}

/**
 * Per-step migration counts. Migrators populate these so the engine can
 * surface a clear "what just happened" notice to the agent — without it,
 * agents see deleted v3 state files and incorrectly report data loss.
 *
 * Each field is cumulative across the migrator's walk of the intent dir.
 * Intent-md migration is tracked as a boolean (one file).
 */
export type MigrationStepDetails = {
	intent_md_migrated: boolean
	/**
	 * `units_migrated` and `*_synthesized_approval` count UNITS — once
	 * per file. The `*_stamps_synthesized` counters below count STAMPS
	 * — once per role-slot written. A v3 unit with three review agents
	 * contributes 1 to `units_with_synthesized_approval` and 5 to
	 * `review_stamps_synthesized` (spec + 3 agents + user). The naming
	 * is explicit so banner copy and tests don't conflate the two.
	 */
	units_migrated: number
	units_with_synthesized_approval: number
	review_stamps_synthesized: number
	approval_stamps_synthesized: number
	feedback_migrated: number
	feedback_with_synthesized_closure: number
	feedback_relocated: number
	state_json_deleted: number
	drift_artifacts_deleted: number
	stages_merged_stamped: number
}

export function emptyMigrationDetails(): MigrationStepDetails {
	return {
		intent_md_migrated: false,
		units_migrated: 0,
		units_with_synthesized_approval: 0,
		review_stamps_synthesized: 0,
		approval_stamps_synthesized: 0,
		feedback_migrated: 0,
		feedback_with_synthesized_closure: 0,
		feedback_relocated: 0,
		state_json_deleted: 0,
		drift_artifacts_deleted: 0,
		stages_merged_stamped: 0,
	}
}

export type Migrator = (
	ctx: MigrationContext,
) => MigrationStepDetails | undefined

type Edge = { to: string; migrator: Migrator }

const edges = new Map<string, Edge[]>()

export function registerMigrator(
	from: string,
	to: string,
	migrator: Migrator,
): void {
	if (from === to) {
		throw new Error(
			`registerMigrator: from == to (${from}) — migrators must change the version`,
		)
	}
	const existing = edges.get(from) ?? []
	if (existing.some((e) => e.to === to)) {
		throw new Error(`registerMigrator: duplicate edge ${from} → ${to}`)
	}
	existing.push({ to, migrator })
	edges.set(from, existing)
}

/**
 * Walk shortest path of registered edges from `from` to `to`. Returns
 * the ordered list of migrators to apply, or null if no path exists.
 */
function findChain(from: string, to: string): Migrator[] | null {
	if (from === to) return []
	const queue: Array<{ version: string; chain: Migrator[] }> = [
		{ version: from, chain: [] },
	]
	const seen = new Set<string>([from])
	while (queue.length > 0) {
		const head = queue.shift()
		if (!head) break
		const next = edges.get(head.version) ?? []
		for (const edge of next) {
			if (seen.has(edge.to)) continue
			const newChain = [...head.chain, edge.migrator]
			if (edge.to === to) return newChain
			seen.add(edge.to)
			queue.push({ version: edge.to, chain: newChain })
		}
	}
	return null
}

export type MigrationResult = {
	from: string
	to: string
	steps: number
	chain: string[] // version-pair labels for diagnostics
	details: MigrationStepDetails // aggregated across every migrator step
}

/**
 * Migrate the intent at `ctx.intentDir` from its current
 * `plugin_version` to `targetVersion`.
 *
 * Returns the chain that ran. Throws if no path exists.
 */
export function migrateIntent(
	ctx: MigrationContext,
	currentVersion: string,
	targetVersion: string,
): MigrationResult {
	if (currentVersion === targetVersion) {
		return {
			from: currentVersion,
			to: targetVersion,
			steps: 0,
			chain: [],
			details: emptyMigrationDetails(),
		}
	}
	const chain = findChain(currentVersion, targetVersion)
	if (chain === null) {
		throw new Error(
			`migrateIntent: no migration path from ${currentVersion} to ${targetVersion} for intent at ${ctx.intentDir}`,
		)
	}
	const labels: string[] = []
	const aggregate = emptyMigrationDetails()
	let v = currentVersion
	for (const step of chain) {
		// Find the edge label by introspecting the registered edges
		// for the current version that match the migrator instance.
		const edge = (edges.get(v) ?? []).find((e) => e.migrator === step)
		if (edge) {
			labels.push(`${v}→${edge.to}`)
			v = edge.to
		}
		const stepDetails = step(ctx)
		if (stepDetails) {
			// Aggregate: boolean OR, numeric sum.
			aggregate.intent_md_migrated =
				aggregate.intent_md_migrated || stepDetails.intent_md_migrated
			aggregate.units_migrated += stepDetails.units_migrated
			aggregate.units_with_synthesized_approval +=
				stepDetails.units_with_synthesized_approval
			aggregate.review_stamps_synthesized +=
				stepDetails.review_stamps_synthesized
			aggregate.approval_stamps_synthesized +=
				stepDetails.approval_stamps_synthesized
			aggregate.feedback_migrated += stepDetails.feedback_migrated
			aggregate.feedback_with_synthesized_closure +=
				stepDetails.feedback_with_synthesized_closure
			aggregate.feedback_relocated += stepDetails.feedback_relocated
			aggregate.state_json_deleted += stepDetails.state_json_deleted
			aggregate.drift_artifacts_deleted += stepDetails.drift_artifacts_deleted
			aggregate.stages_merged_stamped += stepDetails.stages_merged_stamped
		}
	}
	return {
		from: currentVersion,
		to: targetVersion,
		steps: chain.length,
		chain: labels,
		details: aggregate,
	}
}

/**
 * For diagnostics: list every reachable version from `from`.
 */
export function migrationsAvailable(from: string): string[] {
	const reachable = new Set<string>()
	const queue = [from]
	while (queue.length > 0) {
		const v = queue.shift()
		if (!v) break
		const next = edges.get(v) ?? []
		for (const edge of next) {
			if (!reachable.has(edge.to)) {
				reachable.add(edge.to)
				queue.push(edge.to)
			}
		}
	}
	return [...reachable].sort()
}

// Test-only escape hatch.
export const __testOnly = {
	clearRegistry: () => edges.clear(),
	edgeCount: () => {
		let n = 0
		for (const list of edges.values()) n += list.length
		return n
	},
}
