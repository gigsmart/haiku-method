---
title: "MCP Apps protocol and ext-apps SDK research"
type: research
depends_on: []
inputs: ["intent.md"]
---

# MCP Apps Protocol Research

## Scope

Research the MCP Apps extension protocol and `@modelcontextprotocol/ext-apps` SDK. Document the server-side registration pattern, client-side App class API, and the postMessage communication protocol. Determine how to integrate with our existing MCP server (stdio transport, not HTTP).

## Completion Criteria

- Document covers `registerAppTool()`, `registerAppResource()`, `RESOURCE_MIME_TYPE` usage with stdio-based MCP servers
- Document covers App class methods: `connect()`, `ontoolresult`, `callServerTool()`, `updateModelContext()`, `sendMessage()`
- Document identifies whether `updateModelContext()` triggers agent continuation in Cowork (or if an alternative mechanism is needed)
- Document describes the `ui://` resource scheme and how hosts resolve/cache resources
- Document covers CSP, permissions, and security sandbox constraints
- Findings written to `knowledge/MCP-APPS-PROTOCOL.md`
