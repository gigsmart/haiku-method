"use client"

import { useEffect, useMemo, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  type NodeProps,
} from "reactflow"
import "reactflow/dist/style.css"
import { layoutFlow } from "./mermaid-flow/layout"
import { parseMermaidFlow } from "./mermaid-flow/parser"

interface Props {
  chart: string
  height?: number
  showMiniMap?: boolean
}

function RectNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-md border border-blue-500/60 bg-white px-3 py-2 text-center text-[13px] font-medium leading-snug text-neutral-900 shadow-sm dark:border-blue-400/60 dark:bg-neutral-900 dark:text-neutral-100">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="whitespace-pre-wrap">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

function DiamondNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center text-[13px] font-medium leading-snug text-neutral-900 dark:text-neutral-100">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <polygon
          points="50,2 98,50 50,98 2,50"
          className="fill-amber-50 stroke-amber-500/80 dark:fill-amber-950/40 dark:stroke-amber-400/80"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="relative z-10 max-w-[65%] whitespace-pre-wrap text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

function PillNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-full border border-emerald-500/70 bg-emerald-50 px-4 py-2 text-[13px] font-medium text-neutral-900 dark:border-emerald-400/70 dark:bg-emerald-950/40 dark:text-neutral-100">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="whitespace-pre-wrap text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

function RoundNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-lg border border-neutral-400/70 bg-neutral-50 px-3 py-2 text-[13px] font-medium text-neutral-900 dark:border-neutral-600/70 dark:bg-neutral-800 dark:text-neutral-100">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="whitespace-pre-wrap text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

function StartEndNode() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="h-3 w-3 rounded-full bg-neutral-900 dark:bg-neutral-100" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

function GroupNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="relative h-full w-full rounded-lg border border-dashed border-neutral-400/60 bg-neutral-100/40 dark:border-neutral-600/60 dark:bg-neutral-800/30">
      <div className="absolute left-3 top-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
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

export function MermaidFlow({ chart, height = 600, showMiniMap = false }: Props) {
  const parsed = useMemo(() => parseMermaidFlow(chart), [chart])
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    layoutFlow(parsed)
      .then((r) => {
        if (!cancelled) setLayout(r)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [parsed])

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </pre>
    )
  }

  if (!layout) {
    return (
      <div
        className="animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"
        style={{ height }}
      />
    )
  }

  return (
    <div
      className="not-prose overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
      style={{ height }}
    >
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        {showMiniMap && <MiniMap pannable zoomable className="!bg-white/80 dark:!bg-neutral-900/80" />}
      </ReactFlow>
    </div>
  )
}
