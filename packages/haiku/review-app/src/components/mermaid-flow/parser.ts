export type NodeShape = "rect" | "diamond" | "pill" | "round"

export interface ParsedNode {
  id: string
  label: string
  shape: NodeShape
  parentId: string | null
}

export interface ParsedEdge {
  id: string
  source: string
  target: string
  label?: string
  dashed: boolean
  color?: string
}

export interface ParsedGroup {
  id: string
  label: string
  parentId: string | null
  direction: "TB" | "LR" | "RL" | "BT"
}

export interface ParsedFlow {
  direction: "TB" | "LR" | "RL" | "BT"
  nodes: ParsedNode[]
  edges: ParsedEdge[]
  groups: ParsedGroup[]
}

const STRIP_QUOTES = /^"([\s\S]*)"$/

function unquote(s: string): string {
  const m = s.match(STRIP_QUOTES)
  return m ? m[1] : s
}

function sanitizeLabel(raw: string): string {
  return unquote(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<i>(.*?)<\/i>/gi, "$1")
    .replace(/<b>(.*?)<\/b>/gi, "$1")
}

interface NodeDeclMatch {
  id: string
  label: string
  shape: NodeShape
  rest: string
}

function tryParseNodeDecl(input: string): NodeDeclMatch | null {
  const idMatch = input.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
  if (!idMatch) return null
  const id = idMatch[1]
  let rest = input.slice(id.length)

  const pairs: Array<{ open: string; close: string; shape: NodeShape }> = [
    { open: "([", close: "])", shape: "pill" },
    { open: "{", close: "}", shape: "diamond" },
    { open: "[", close: "]", shape: "rect" },
    { open: "(", close: ")", shape: "round" },
  ]

  for (const { open, close, shape } of pairs) {
    if (rest.startsWith(open)) {
      const end = findMatching(rest, open, close)
      if (end === -1) continue
      const inner = rest.slice(open.length, end)
      rest = rest.slice(end + close.length)
      return { id, label: sanitizeLabel(inner.trim()), shape, rest }
    }
  }

  return { id, label: id, shape: "rect", rest }
}

function findMatching(s: string, open: string, close: string): number {
  let i = open.length
  let depth = 1
  let inQuote = false
  while (i < s.length) {
    const ch = s[i]
    if (ch === '"' && s[i - 1] !== "\\") inQuote = !inQuote
    if (!inQuote) {
      if (s.startsWith(open, i)) {
        depth++
        i += open.length
        continue
      }
      if (s.startsWith(close, i)) {
        depth--
        if (depth === 0) return i
        i += close.length
        continue
      }
    }
    i++
  }
  return -1
}

interface EdgeTokenMatch {
  label?: string
  dashed: boolean
  rest: string
}

function tryParseEdge(input: string): EdgeTokenMatch | null {
  const trimmed = input.trimStart()
  const consumed = input.length - trimmed.length

  const patterns: Array<{ re: RegExp; dashed: boolean; labelGroup: number }> = [
    { re: /^-- "([^"]*)" -->/, dashed: false, labelGroup: 1 },
    { re: /^-\. "([^"]*)" \.->/, dashed: true, labelGroup: 1 },
    { re: /^-{2,3}>\|"([^"]*)"\|/, dashed: false, labelGroup: 1 },
    { re: /^-\.->\|"([^"]*)"\|/, dashed: true, labelGroup: 1 },
    { re: /^-{2,3}>/, dashed: false, labelGroup: 0 },
    { re: /^-\.->/, dashed: true, labelGroup: 0 },
  ]

  for (const { re, dashed, labelGroup } of patterns) {
    const m = trimmed.match(re)
    if (!m) continue
    const label = labelGroup > 0 ? m[labelGroup] : undefined
    return {
      dashed,
      label,
      rest: input.slice(consumed + m[0].length),
    }
  }
  return null
}

export function parseMermaidFlow(source: string): ParsedFlow {
  const nodes = new Map<string, ParsedNode>()
  const edges: ParsedEdge[] = []
  const groups: ParsedGroup[] = []
  const linkStyles = new Map<number, string>()

  const lines = source.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("%%"))

  let direction: ParsedFlow["direction"] = "TB"
  const groupStack: string[] = []
  let edgeCounter = 0

  const firstLine = lines[0] ?? ""
  const dirMatch = firstLine.match(/^(?:flowchart|graph)\s+(TB|TD|LR|RL|BT)/)
  if (dirMatch) direction = (dirMatch[1] === "TD" ? "TB" : dirMatch[1]) as typeof direction

  function getOrCreateNode(id: string, label?: string, shape: NodeShape = "rect"): ParsedNode {
    const existing = nodes.get(id)
    if (existing) {
      if (label && label !== id && existing.label === existing.id) {
        existing.label = label
        existing.shape = shape
      }
      return existing
    }
    const parentId = groupStack.length > 0 ? groupStack[groupStack.length - 1] : null
    if (groups.some((g) => g.id === id)) {
      return { id, label: label ?? id, shape, parentId }
    }
    const node: ParsedNode = { id, label: label ?? id, shape, parentId }
    nodes.set(id, node)
    return node
  }

  for (let li = 1; li < lines.length; li++) {
    const raw = lines[li]

    if (raw.startsWith("subgraph ")) {
      const m = raw.match(/^subgraph\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[(?:"([^"]*)"|([^\]]*))\])?/)
      if (m) {
        const id = m[1]
        const label = sanitizeLabel(m[2] ?? m[3] ?? id)
        const parentId = groupStack.length > 0 ? groupStack[groupStack.length - 1] : null
        groups.push({ id, label, parentId, direction })
        groupStack.push(id)
      }
      continue
    }

    if (raw === "end") {
      groupStack.pop()
      continue
    }

    if (raw.startsWith("direction ")) {
      const d: ParsedFlow["direction"] = raw.slice("direction ".length).trim() as ParsedFlow["direction"]
      if (groupStack.length > 0) {
        const g = groups.find((x) => x.id === groupStack[groupStack.length - 1])
        if (g) g.direction = d
      } else {
        direction = d
      }
      continue
    }

    const linkStyle = raw.match(/^linkStyle\s+(\d+)\s+(.+)$/)
    if (linkStyle) {
      const idx = Number.parseInt(linkStyle[1], 10)
      const style = linkStyle[2]
      const colorMatch = style.match(/stroke:\s*(#[0-9a-fA-F]{3,8})/)
      if (colorMatch) linkStyles.set(idx, colorMatch[1])
      continue
    }

    parseStatement(raw)
  }

  function parseStatement(stmt: string): void {
    let cursor = stmt
    let lastNodeId: string | null = null

    while (cursor.length > 0) {
      const nodeDecl = tryParseNodeDecl(cursor)
      if (!nodeDecl) break

      const node = getOrCreateNode(nodeDecl.id, nodeDecl.label, nodeDecl.shape)
      lastNodeId = node.id
      cursor = nodeDecl.rest.trimStart()

      const edge = tryParseEdge(cursor)
      if (!edge) break

      cursor = edge.rest.trimStart()
      const nextDecl = tryParseNodeDecl(cursor)
      if (!nextDecl) break

      getOrCreateNode(nextDecl.id, nextDecl.label, nextDecl.shape)

      const edgeId = `e${edgeCounter}`
      edges.push({
        id: edgeId,
        source: lastNodeId!,
        target: nextDecl.id,
        label: edge.label,
        dashed: edge.dashed,
        color: linkStyles.get(edgeCounter),
      })
      edgeCounter++
      cursor = cursor
    }
  }

  for (let i = 0; i < edges.length; i++) {
    if (!edges[i].color && linkStyles.has(i)) edges[i].color = linkStyles.get(i)
  }

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges,
    groups,
  }
}
