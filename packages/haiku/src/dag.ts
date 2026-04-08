import type { DAGEdge, DAGGraph, DAGNode, ParsedUnit } from "./types.js"

/**
 * Build a DAG from parsed units using their depends_on fields.
 */
export function buildDAG(units: ParsedUnit[]): DAGGraph {
	const nodes: DAGNode[] = units.map((u) => ({
		id: u.slug,
		status: u.frontmatter.status,
	}))

	const edges: DAGEdge[] = []
	const adjacency = new Map<string, string[]>()

	// Initialize adjacency for all nodes
	for (const u of units) {
		adjacency.set(u.slug, [])
	}

	// Build edges from depends_on
	for (const u of units) {
		const deps = u.frontmatter.depends_on ?? []
		for (const dep of deps) {
			edges.push({ from: dep, to: u.slug })
			const existing = adjacency.get(dep)
			if (existing) {
				existing.push(u.slug)
			}
		}
	}

	return { nodes, edges, adjacency }
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns node IDs in dependency order.
 * Throws if a cycle is detected.
 */
export function topologicalSort(dag: DAGGraph): string[] {
	const inDegree = new Map<string, number>()
	for (const node of dag.nodes) {
		inDegree.set(node.id, 0)
	}
	for (const edge of dag.edges) {
		inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
	}

	const queue: string[] = []
	for (const [id, degree] of inDegree) {
		if (degree === 0) {
			queue.push(id)
		}
	}
	queue.sort()

	const sorted: string[] = []
	while (queue.length > 0) {
		const current = queue.shift()
		if (!current) break
		sorted.push(current)

		const neighbors = dag.adjacency.get(current) ?? []
		for (const neighbor of neighbors) {
			const newDegree = (inDegree.get(neighbor) ?? 1) - 1
			inDegree.set(neighbor, newDegree)
			if (newDegree === 0) {
				// Insert sorted to maintain deterministic order
				const insertIdx = queue.findIndex((q) => q > neighbor)
				if (insertIdx === -1) {
					queue.push(neighbor)
				} else {
					queue.splice(insertIdx, 0, neighbor)
				}
			}
		}
	}

	// Detect cycles: if not all nodes were processed, there is a cycle
	if (sorted.length < dag.nodes.length) {
		const cycleNodes = dag.nodes
			.map((n) => n.id)
			.filter((id) => !sorted.includes(id))
		throw new Error(
			`Circular dependency detected among units: ${cycleNodes.join(", ")}`,
		)
	}

	return sorted
}

/**
 * Group units into dependency waves using topological ordering.
 * Wave 0: units with no dependencies.
 * Wave N: units whose dependencies are all in waves 0 through N-1.
 */
export function computeWaves(dag: DAGGraph): Map<number, string[]> {
	const sorted = topologicalSort(dag) // throws on cycles — caller should catch and report
	const nodeWave = new Map<string, number>()

	for (const nodeId of sorted) {
		const deps = dag.edges.filter((e) => e.to === nodeId).map((e) => e.from)
		if (deps.length === 0) {
			nodeWave.set(nodeId, 0)
		} else {
			const maxDepWave = Math.max(...deps.map((d) => nodeWave.get(d) ?? 0))
			nodeWave.set(nodeId, maxDepWave + 1)
		}
	}

	const waves = new Map<number, string[]>()
	for (const [nodeId, wave] of nodeWave) {
		const group = waves.get(wave) ?? []
		group.push(nodeId)
		waves.set(wave, group)
	}

	return waves
}

/**
 * Get units that are ready to work on: all dependencies completed.
 */
export function getReadyUnits(
	dag: DAGGraph,
	units: ParsedUnit[],
): ParsedUnit[] {
	const statusMap = new Map(dag.nodes.map((n) => [n.id, n.status]))

	return units.filter((u) => {
		if (u.frontmatter.status !== "pending") return false
		const deps = u.frontmatter.depends_on ?? []
		return deps.every((dep) => statusMap.get(dep) === "completed")
	})
}

// WCAG AA accessible colors — high contrast on both light and dark backgrounds
const STATUS_CSS: Record<string, string> = {
	completed: "fill:#166534,stroke:#14532d,color:#fff",
	active: "fill:#1e40af,stroke:#1e3a8a,color:#fff",
	in_progress: "fill:#1e40af,stroke:#1e3a8a,color:#fff",
	pending: "fill:#525252,stroke:#404040,color:#fff",
	blocked: "fill:#991b1b,stroke:#7f1d1d,color:#fff",
}

/**
 * Escape a string for use as a Mermaid node label (inside double quotes).
 * Removes characters that break Mermaid syntax.
 */
function escapeMermaidLabel(str: string): string {
	// Replace double quotes and square brackets which break Mermaid node syntax
	return str
		.replace(/"/g, "&quot;")
		.replace(/\[/g, "&#91;")
		.replace(/\]/g, "&#93;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

/**
 * Sanitize a string for use as a Mermaid node ID.
 * Mermaid node IDs must start with a letter and contain only alphanumerics,
 * underscores, or hyphens. Spaces and other special characters are replaced.
 */
function sanitizeMermaidNodeId(slug: string): string {
	// Replace any character that isn't alphanumeric, underscore, or hyphen with underscore
	const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "_")
	// Ensure the ID starts with a letter (prefix with 'n' if it starts with a digit or underscore)
	return /^[a-zA-Z]/.test(sanitized) ? sanitized : `n_${sanitized}`
}

/**
 * Generate a Mermaid graph definition from a DAG and units.
 * Top-down layout. Only groups units that share the same stage.
 * Cross-stage dependencies show as external reference nodes.
 */
export function toMermaidDefinition(
	dag: DAGGraph,
	units: ParsedUnit[],
): string {
	const lines: string[] = ["graph TD"]

	const unitSlugs = new Set(units.map(u => u.slug))

	// Group units by stage — only stages that have units in this set
	const stageOrder: string[] = []
	const byStage = new Map<string, ParsedUnit[]>()
	for (const unit of units) {
		const stage = unit.frontmatter.stage || "_root"
		if (!byStage.has(stage)) {
			byStage.set(stage, [])
			stageOrder.push(stage)
		}
		byStage.get(stage)!.push(unit)
	}

	// When there are multiple stages, group by stage; otherwise group by wave
	const useStageSubgraphs = stageOrder.length > 1

	if (useStageSubgraphs) {
		for (const stage of stageOrder) {
			const stageUnits = byStage.get(stage) || []
			const stageLabel = escapeMermaidLabel(stage.charAt(0).toUpperCase() + stage.slice(1))
			lines.push(`  subgraph ${sanitizeMermaidNodeId(`stage_${stage}`)}["${stageLabel}"]`)
			for (const unit of stageUnits) {
				const rawLabel = unit.title || unit.slug
				const label = escapeMermaidLabel(rawLabel)
				const nodeId = sanitizeMermaidNodeId(unit.slug)
				lines.push(`    ${nodeId}["${label}"]`)
			}
			lines.push("  end")
		}
	} else {
		// Single stage (or no stage) — group by dependency wave
		const waves = computeWaves(dag)
		const unitMap = new Map(units.map(u => [u.slug, u]))
		const waveNumbers = Array.from(waves.keys()).sort((a, b) => a - b)
		const useWaveSubgraphs = waveNumbers.length > 1

		for (const waveNum of waveNumbers) {
			const waveNodeIds = waves.get(waveNum) ?? []
			// Only include units that are in the provided units list
			const waveUnits = waveNodeIds
				.filter(id => unitMap.has(id))
				.map(id => unitMap.get(id)!)

			if (waveUnits.length === 0) continue

			if (useWaveSubgraphs) {
				lines.push(`  subgraph ${sanitizeMermaidNodeId(`wave_${waveNum}`)}["Wave ${waveNum}"]`)
			}
			for (const unit of waveUnits) {
				const rawLabel = unit.title || unit.slug
				const label = escapeMermaidLabel(rawLabel)
				const nodeId = sanitizeMermaidNodeId(unit.slug)
				lines.push(`    ${nodeId}["${label}"]`)
			}
			if (useWaveSubgraphs) {
				lines.push("  end")
			}
		}
	}

	// Add stage progression arrows (between stage groups)
	if (useStageSubgraphs && stageOrder.length > 1) {
		for (let i = 0; i < stageOrder.length - 1; i++) {
			const currentStageUnits = byStage.get(stageOrder[i]) || []
			const nextStageUnits = byStage.get(stageOrder[i + 1]) || []
			if (currentStageUnits.length > 0 && nextStageUnits.length > 0) {
				// Arrow from last unit of current stage to first unit of next stage
				const lastUnit = currentStageUnits[currentStageUnits.length - 1]
				const firstUnit = nextStageUnits[0]
				lines.push(`  ${sanitizeMermaidNodeId(lastUnit.slug)} -.-> ${sanitizeMermaidNodeId(firstUnit.slug)}`)
			}
		}
	}

	// Add external dependency nodes (deps that reference units not in this set)
	const externalNodes = new Set<string>()
	for (const edge of dag.edges) {
		if (!unitSlugs.has(edge.from)) externalNodes.add(edge.from)
		if (!unitSlugs.has(edge.to)) externalNodes.add(edge.to)
	}
	for (const ext of externalNodes) {
		const nodeId = sanitizeMermaidNodeId(ext)
		const label = escapeMermaidLabel(ext)
		lines.push(`  ${nodeId}["${label} (external)"]:::external`)
	}

	// Edges
	for (const edge of dag.edges) {
		lines.push(
			`  ${sanitizeMermaidNodeId(edge.from)} --> ${sanitizeMermaidNodeId(edge.to)}`,
		)
	}

	// Status-based CSS classes
	const statusGroups = new Map<string, string[]>()
	for (const node of dag.nodes) {
		if (externalNodes.has(node.id)) continue
		const group = statusGroups.get(node.status) ?? []
		group.push(sanitizeMermaidNodeId(node.id))
		statusGroups.set(node.status, group)
	}

	for (const [status, nodeIds] of statusGroups) {
		const css = STATUS_CSS[status] ?? STATUS_CSS.pending
		lines.push(`  classDef ${status} ${css}`)
		lines.push(`  class ${nodeIds.join(",")} ${status}`)
	}

	// External nodes style — dashed border, muted
	if (externalNodes.size > 0) {
		lines.push(`  classDef external fill:#f5f5f5,stroke:#999,stroke-dasharray:5 5,color:#666`)
	}

	return lines.join("\n")
}
