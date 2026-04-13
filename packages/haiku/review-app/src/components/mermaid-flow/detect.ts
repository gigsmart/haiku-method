import { parseMermaidFlow } from "./parser"

export function isFlowchartSource(chart: string): boolean {
  return /^\s*(flowchart|graph|stateDiagram(-v2)?)\b/.test(chart)
}

export function canRenderAsFlow(chart: string): boolean {
  if (!isFlowchartSource(chart)) return false
  try {
    const parsed = parseMermaidFlow(chart)
    return parsed.nodes.length > 0
  } catch {
    return false
  }
}
