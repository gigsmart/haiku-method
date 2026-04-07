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

	// Only use subgraph if there are multiple stages
	const useSubgraphs = stageOrder.length > 1

	for (const stage of stageOrder) {
		const stageUnits = byStage.get(stage) || []
		if (useSubgraphs) {
			const stageLabel = escapeMermaidLabel(stage.charAt(0).toUpperCase() + stage.slice(1))
			lines.push(`  subgraph ${sanitizeMermaidNodeId(`stage_${stage}`)}["${stageLabel}"]`)
		}
		for (const unit of stageUnits) {
			const rawLabel = unit.title || unit.slug
			const label = escapeMermaidLabel(rawLabel)
			const nodeId = sanitizeMermaidNodeId(unit.slug)
			lines.push(`    ${nodeId}["${label}"]`)
		}
		if (useSubgraphs) {
			lines.push("  end")
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
