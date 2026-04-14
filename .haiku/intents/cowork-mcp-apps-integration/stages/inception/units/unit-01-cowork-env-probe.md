---
title: "Cowork environment probe and workspace handshake"
type: feature
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/CONVERSATION-CONTEXT.md
---

# Cowork environment probe and workspace handshake

## Scope

Add runtime detection for the Cowork host and the workspace-presence handshake. Single probe module that downstream code consults before choosing a transport or writing `.haiku/` state. No changes to the existing HTTP or tunnel code paths.

In scope:
- New detection helper colocated with `packages/haiku/src/state-tools.ts` environment probes (next to `isGitRepo`), exporting `isCoworkHost(): boolean` reading `CLAUDE_CODE_IS_COWORK=1`.
- Workspace presence: parse `CLAUDE_CODE_WORKSPACE_HOST_PATHS` into a list. When empty inside Cowork, invoke the host `request_cowork_directory` handshake before any `.haiku/` write.
- Multi-workspace policy: if the env var lists more than one path, prompt the user to pick (via `elicitInput`) and record the selection for the session.
- Unit tests covering: not-Cowork branch (returns false, no handshake), Cowork with single workspace path, Cowork with multiple paths, Cowork with empty paths (handshake invoked).

Out of scope:
- MCP Apps resource registration (unit-03).
- Review transport changes (unit-05).
- Tool list filtering based on environment.

## Completion Criteria

- `rg -n 'CLAUDE_CODE_IS_COWORK' packages/haiku/src | wc -l` > 0 and `isCoworkHost()` is exported from a single module — verified by grep.
- Running the MCP server with `CLAUDE_CODE_IS_COWORK=1` and empty `CLAUDE_CODE_WORKSPACE_HOST_PATHS` triggers the `request_cowork_directory` call path before any `.haiku/` write — verified by integration test with the handshake mocked.
- Running the MCP server without `CLAUDE_CODE_IS_COWORK` set leaves all existing state-tools behavior byte-identical — verified by existing state-tools test suite passing unchanged.
- Unit tests for all four branches (not-Cowork, single path, multi path, empty path handshake) exist and pass — verified by `npm test` (or the project's test runner) exit 0.
- `packages/haiku/VALIDATION.md` documents the Cowork detection contract — verified by file diff.
