import type { ParsedUnit, DAGGraph, DAGNode, DAGEdge } from "./types.js";

/**
 * Build a DAG from parsed units using their depends_on fields.
 */
export function buildDAG(units: ParsedUnit[]): DAGGraph {
  const nodes: DAGNode[] = units.map((u) => ({
    id: u.slug,
    status: u.frontmatter.status,
  }));

  const edges: DAGEdge[] = [];
  const adjacency = new Map<string, string[]>();

  // Initialize adjacency for all nodes
  for (const u of units) {
    adjacency.set(u.slug, []);
  }

  // Build edges from depends_on
  for (const u of units) {
    const deps = u.frontmatter.depends_on ?? [];
    for (const dep of deps) {
      edges.push({ from: dep, to: u.slug });
      const existing = adjacency.get(dep);
      if (existing) {
        existing.push(u.slug);
      }
    }
  }

  return { nodes, edges, adjacency };
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns node IDs in dependency order.
 */
export function topologicalSort(dag: DAGGraph): string[] {
  const inDegree = new Map<string, number>();
  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
  }
  for (const edge of dag.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }
  queue.sort();

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const neighbors = dag.adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // Insert sorted to maintain deterministic order
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  return sorted;
}

/**
 * Get units that are ready to work on: all dependencies completed.
 */
export function getReadyUnits(
  dag: DAGGraph,
  units: ParsedUnit[]
): ParsedUnit[] {
  const statusMap = new Map(
    dag.nodes.map((n) => [n.id, n.status])
  );

  return units.filter((u) => {
    if (u.frontmatter.status !== "pending") return false;
    const deps = u.frontmatter.depends_on ?? [];
    return deps.every((dep) => statusMap.get(dep) === "completed");
  });
}

const STATUS_CSS: Record<string, string> = {
  completed: "fill:#4caf50,stroke:#2e7d32,color:#fff",
  in_progress: "fill:#2196f3,stroke:#1565c0,color:#fff",
  pending: "fill:#9e9e9e,stroke:#616161,color:#fff",
  blocked: "fill:#f44336,stroke:#c62828,color:#fff",
};

/**
 * Generate a Mermaid graph TD definition from a DAG and units.
 */
export function toMermaidDefinition(
  dag: DAGGraph,
  units: ParsedUnit[]
): string {
  const lines: string[] = ["graph TD"];

  // Node definitions with labels
  for (const unit of units) {
    const label = unit.title || unit.slug;
    lines.push(`  ${unit.slug}["${label}"]`);
  }

  // Edges
  for (const edge of dag.edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }

  // Status-based CSS classes
  const statusGroups = new Map<string, string[]>();
  for (const node of dag.nodes) {
    const group = statusGroups.get(node.status) ?? [];
    group.push(node.id);
    statusGroups.set(node.status, group);
  }

  for (const [status, nodeIds] of statusGroups) {
    const css = STATUS_CSS[status] ?? STATUS_CSS.pending;
    lines.push(`  classDef ${status} ${css}`);
    lines.push(`  class ${nodeIds.join(",")} ${status}`);
  }

  return lines.join("\n");
}
