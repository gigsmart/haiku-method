import { describe, expect, it } from "vitest"
import { parseMermaidFlow } from "../src/components/mermaid-flow/parser"

describe("parseMermaidFlow", () => {
	it("parses a simple LR flowchart with two nodes and one edge", () => {
		const src = `flowchart LR
  A[Start] --> B[End]`
		const parsed = parseMermaidFlow(src)

		expect(parsed.direction).toBe("LR")
		expect(parsed.nodes).toHaveLength(2)
		const ids = parsed.nodes.map((n) => n.id).sort()
		expect(ids).toEqual(["A", "B"])
		expect(parsed.edges).toHaveLength(1)
		expect(parsed.edges[0]).toMatchObject({ source: "A", target: "B" })
	})

	it("defaults to TB direction when none is declared", () => {
		const src = "flowchart\n  X --> Y"
		const parsed = parseMermaidFlow(src)
		expect(parsed.direction).toBe("TB")
	})

	it("captures edge labels from quoted pipe syntax", () => {
		const src = `flowchart TB\n  A -->|"yes"| B`
		const parsed = parseMermaidFlow(src)
		expect(parsed.edges[0]?.label).toBe("yes")
	})

	it("handles diamond-shaped decision nodes", () => {
		const src = "flowchart TB\n  D{Decide} --> E[End]"
		const parsed = parseMermaidFlow(src)
		const decide = parsed.nodes.find((n) => n.id === "D")
		expect(decide?.shape).toBe("diamond")
	})
})
