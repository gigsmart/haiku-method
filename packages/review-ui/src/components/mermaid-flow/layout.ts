import type { Edge, Node } from "@xyflow/react"
import ELK from "elkjs/lib/elk.bundled.js"
import type { ParsedFlow } from "./parser"

let elkInstance: InstanceType<typeof ELK> | null = null
function getElk(): InstanceType<typeof ELK> {
	if (!elkInstance) elkInstance = new ELK()
	return elkInstance
}

const NODE_MIN_WIDTH = 180
const NODE_MAX_WIDTH = 320
const NODE_MIN_HEIGHT = 64
const CHAR_WIDTH = 7.2
const LINE_HEIGHT = 20
const V_PADDING = 32
const H_PADDING = 40

function estimateNodeSize(
	label: string,
	shape: string,
): { width: number; height: number } {
	if (shape === "start_end") return { width: 20, height: 20 }

	const rawLines = label.split("\n")
	const longest = rawLines.reduce((m, l) => Math.max(m, l.length), 1)

	const targetWidth = Math.max(
		NODE_MIN_WIDTH,
		Math.min(NODE_MAX_WIDTH, longest * CHAR_WIDTH + H_PADDING),
	)
	const charsPerLine = Math.max(
		10,
		Math.floor((targetWidth - H_PADDING) / CHAR_WIDTH),
	)
	let totalLines = 0
	for (const line of rawLines)
		totalLines += Math.max(1, Math.ceil(line.length / charsPerLine))

	let width = targetWidth
	let height = Math.max(NODE_MIN_HEIGHT, totalLines * LINE_HEIGHT + V_PADDING)

	if (shape === "diamond") {
		const side = Math.max(width, height) * 1.25
		width = side
		height = side
	}
	return { width, height }
}

export async function layoutFlow(
	parsed: ParsedFlow,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
	const childrenByParent = new Map<
		string | null,
		Array<{ kind: "node" | "group"; id: string; label: string; shape: string }>
	>()

	const push = (
		parentId: string | null,
		entry: { kind: "node" | "group"; id: string; label: string; shape: string },
	) => {
		const list = childrenByParent.get(parentId) ?? []
		list.push(entry)
		childrenByParent.set(parentId, list)
	}

	for (const g of parsed.groups)
		push(g.parentId, {
			kind: "group",
			id: g.id,
			label: g.label,
			shape: "group",
		})
	for (const n of parsed.nodes)
		push(n.parentId, { kind: "node", id: n.id, label: n.label, shape: n.shape })

	const groupDir = new Map<string, string>()
	for (const g of parsed.groups) groupDir.set(g.id, g.direction)

	function buildElkNode(
		parentId: string | null,
	): Array<Record<string, unknown>> {
		const kids = childrenByParent.get(parentId) ?? []
		return kids.map((k) => {
			if (k.kind === "node") {
				const { width, height } = estimateNodeSize(k.label, k.shape)
				return { id: k.id, width, height }
			}
			return {
				id: k.id,
				layoutOptions: {
					"elk.algorithm": "layered",
					"elk.direction": mapDir(groupDir.get(k.id) ?? parsed.direction),
					"elk.padding": "[top=44,left=24,right=24,bottom=24]",
					"elk.layered.spacing.nodeNodeBetweenLayers": "56",
					"elk.spacing.nodeNode": "48",
				},
				children: buildElkNode(k.id),
			}
		})
	}

	const graph = {
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": mapDir(parsed.direction),
			"elk.layered.spacing.nodeNodeBetweenLayers": "80",
			"elk.spacing.nodeNode": "64",
			"elk.spacing.edgeNode": "28",
			"elk.spacing.edgeEdge": "16",
			"elk.spacing.componentComponent": "80",
			"elk.hierarchyHandling": "INCLUDE_CHILDREN",
			"elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
			"elk.layered.layering.strategy": "NETWORK_SIMPLEX",
			"elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
			"elk.layered.considerModelOrder.components": "MODEL_ORDER",
			"elk.layered.crossingMinimization.forceNodeModelOrder": "true",
			"elk.layered.crossingMinimization.semiInteractive": "true",
			"elk.edgeRouting": "ORTHOGONAL",
		},
		children: buildElkNode(null),
		edges: parsed.edges.map((e) => ({
			id: e.id,
			sources: [e.source],
			targets: [e.target],
		})),
	}

	const result = await getElk().layout(graph as never)

	const rfNodes: Node[] = []
	const shapeById = new Map(parsed.nodes.map((n) => [n.id, n.shape]))
	const labelById = new Map<string, string>()
	for (const n of parsed.nodes) labelById.set(n.id, n.label)
	for (const g of parsed.groups) labelById.set(g.id, g.label)

	function walk(
		nodes: Array<Record<string, unknown>>,
		parentId: string | undefined,
		offsetX: number,
		offsetY: number,
	): void {
		for (const n of nodes) {
			const id = n.id as string
			const x = (n.x as number) ?? 0
			const y = (n.y as number) ?? 0
			const width = (n.width as number) ?? NODE_MIN_WIDTH
			const height = (n.height as number) ?? NODE_MIN_HEIGHT
			const isGroup =
				Array.isArray(n.children) && (n.children as unknown[]).length > 0

			const absX = offsetX + x
			const absY = offsetY + y

			if (isGroup) {
				rfNodes.push({
					id,
					type: "group",
					position: { x: parentId ? x : absX, y: parentId ? y : absY },
					data: { label: labelById.get(id) ?? id },
					style: { width, height, zIndex: -1 },
					parentId,
					extent: parentId ? "parent" : undefined,
					selectable: false,
					draggable: false,
					zIndex: -1,
				})
				walk(n.children as Array<Record<string, unknown>>, id, 0, 0)
			} else {
				rfNodes.push({
					id,
					type: shapeById.get(id) ?? "rect",
					position: { x: parentId ? x : absX, y: parentId ? y : absY },
					data: { label: labelById.get(id) ?? id },
					style: { width, height },
					parentId,
					extent: parentId ? "parent" : undefined,
					zIndex: 1,
				})
			}
		}
	}

	walk(
		(result.children ?? []) as Array<Record<string, unknown>>,
		undefined,
		0,
		0,
	)

	const rfEdges: Edge[] = parsed.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		label: e.label,
		animated: false,
		zIndex: 2,
		style: {
			strokeDasharray: e.dashed ? "6 4" : undefined,
			stroke: e.color ?? "#94a3b8",
			strokeWidth: 1.5,
		},
		labelStyle: { fill: "#1f2937", fontSize: 12, fontWeight: 500 },
		labelBgStyle: e.label
			? { fill: "#f8fafc", fillOpacity: 0.9 }
			: { fillOpacity: 0 },
		labelBgPadding: [4, 2] as [number, number],
		labelBgBorderRadius: 3,
	}))

	return { nodes: rfNodes, edges: rfEdges }
}

function mapDir(d: string): string {
	switch (d) {
		case "TB":
		case "TD":
			return "DOWN"
		case "BT":
			return "UP"
		case "LR":
			return "RIGHT"
		case "RL":
			return "LEFT"
		default:
			return "DOWN"
	}
}
