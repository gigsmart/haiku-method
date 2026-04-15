import {
	Background,
	Controls,
	Handle,
	MiniMap,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"
import { layoutFlow } from "./mermaid-flow/layout"
import { parseMermaidFlow } from "./mermaid-flow/parser"

interface Props {
	chart: string
	height?: number
	showMiniMap?: boolean
	fallback?: ReactNode
}

type LabeledNode = Node<{ label: string }>

function RectNode({ data }: NodeProps<LabeledNode>) {
	return (
		<div className="relative flex h-full w-full items-center justify-center rounded-md border border-teal-500/60 bg-stone-900 px-3 py-2 text-center text-[13px] font-medium leading-snug text-stone-100 shadow-sm">
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
			/>
			<div className="whitespace-pre-wrap">{data.label}</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
			/>
		</div>
	)
}

function DiamondNode({ data }: NodeProps<LabeledNode>) {
	return (
		<div className="relative flex h-full w-full items-center justify-center text-[13px] font-medium leading-snug text-stone-100">
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full"
				preserveAspectRatio="none"
				viewBox="0 0 100 100"
				aria-hidden="true"
			>
				<polygon
					points="50,2 98,50 50,98 2,50"
					className="fill-amber-950/60 stroke-amber-400/80"
					strokeWidth={1.2}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
			/>
			<div className="relative z-10 max-w-[65%] whitespace-pre-wrap text-center">
				{data.label}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
			/>
		</div>
	)
}

function PillNode({ data }: NodeProps<LabeledNode>) {
	return (
		<div className="relative flex h-full w-full items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-950/40 px-4 py-2 text-[13px] font-medium text-stone-100">
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
			/>
			<div className="whitespace-pre-wrap text-center">{data.label}</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
			/>
		</div>
	)
}

function RoundNode({ data }: NodeProps<LabeledNode>) {
	return (
		<div className="relative flex h-full w-full items-center justify-center rounded-lg border border-stone-600/70 bg-stone-800 px-3 py-2 text-[13px] font-medium text-stone-100">
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
			/>
			<div className="whitespace-pre-wrap text-center">{data.label}</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
			/>
		</div>
	)
}

function StartEndNode() {
	return (
		<div className="relative flex h-full w-full items-center justify-center">
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-transparent !border-0"
			/>
			<div className="h-3 w-3 rounded-full bg-stone-100" />
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-transparent !border-0"
			/>
		</div>
	)
}

function GroupNode({ data }: NodeProps<LabeledNode>) {
	return (
		<div className="relative h-full w-full rounded-lg border border-dashed border-stone-600/60 bg-stone-800/30">
			<div className="absolute left-3 top-1 text-xs font-semibold uppercase tracking-wide text-stone-300">
				{data.label}
			</div>
		</div>
	)
}

const nodeTypes = {
	rect: RectNode,
	diamond: DiamondNode,
	pill: PillNode,
	round: RoundNode,
	start_end: StartEndNode,
	group: GroupNode,
}

type LayoutResult = Awaited<ReturnType<typeof layoutFlow>>

export function MermaidFlow({
	chart,
	height = 520,
	showMiniMap = false,
	fallback,
}: Props) {
	const parsed = useMemo(() => parseMermaidFlow(chart), [chart])
	const [layout, setLayout] = useState<LayoutResult | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let cancelled = false
		layoutFlow(parsed)
			.then((r) => {
				if (!cancelled) setLayout(r)
			})
			.catch((e) => {
				if (!cancelled) {
					console.error("[MermaidFlow] ELK layout failed, falling back:", e)
					setFailed(true)
				}
			})
		return () => {
			cancelled = true
		}
	}, [parsed])

	if (failed) return <>{fallback ?? null}</>

	if (!layout) {
		return (
			<div
				className="animate-pulse rounded-lg bg-stone-900"
				style={{ height }}
			/>
		)
	}

	const styledEdges = layout.edges.map((e) => ({
		...e,
		style: { ...e.style, stroke: e.style?.stroke ?? "#78716c" },
		labelStyle: { fill: "#e7e5e4", fontSize: 12, fontWeight: 500 },
		labelBgStyle: e.label
			? { fill: "#1c1917", fillOpacity: 0.85 }
			: { fillOpacity: 0 },
	}))

	return (
		<div
			className="overflow-hidden rounded-lg border border-stone-800 bg-stone-950"
			style={{ height }}
		>
			<ReactFlow
				nodes={layout.nodes}
				edges={styledEdges}
				nodeTypes={nodeTypes}
				fitView
				fitViewOptions={{ padding: 0.15 }}
				nodesDraggable
				nodesConnectable={false}
				elementsSelectable
			>
				<Background gap={20} size={1} color="#44403c" />
				<Controls showInteractive={false} />
				{showMiniMap && (
					<MiniMap pannable zoomable className="!bg-stone-900/80" />
				)}
			</ReactFlow>
		</div>
	)
}
