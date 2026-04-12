---
title: "Review SPA bundling strategy for MCP Apps"
type: research
depends_on:
  - unit-02-mcp-apps-protocol
inputs: ["intent.md"]
---

# Review SPA Bundling Strategy

## Scope

Determine the best approach to bundle the review UI as a self-contained HTML file suitable for serving as a `ui://` MCP App resource. Evaluate the existing review-app-html.ts (server-side generated) vs the website React SPA components, and decide which to adapt.

## Completion Criteria

- Document evaluates both approaches (template-based vs React SPA) with pros/cons for MCP Apps use
- Document specifies the chosen bundling tool (vite-plugin-singlefile or alternative) and build pipeline
- Document estimates bundle size and identifies any concerns for inline delivery
- Document describes how session data flows without an HTTP API (tool result → ontoolresult vs alternative)
- Document describes how review decisions flow back (callServerTool → haiku MCP tool)
- Findings written to `knowledge/BUNDLING-STRATEGY.md`
