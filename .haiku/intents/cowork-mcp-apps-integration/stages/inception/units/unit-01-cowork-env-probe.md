---
title: "Cowork environment probe and workspace handshake"
type: feature
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/CONVERSATION-CONTEXT.md
  - stages/inception/units/unit-01-cowork-env-probe/knowledge/cowork-env-contract.md
outputs:
  - stages/inception/units/unit-01-cowork-env-probe/knowledge/cowork-env-contract.md
  - stages/inception/units/unit-01-cowork-env-probe/knowledge/elaboration-notes.md
---

# Cowork environment probe and workspace handshake

## Scope

Single detection module + workspace handshake. Downstream code consults it before choosing a transport or writing `.haiku/`. No transport, no review-UI, no tool-list filtering changes in this unit.

### In scope

- Export `isCoworkHost(): boolean` from `packages/haiku/src/state-tools.ts` (colocated with `isGitRepo`). Reads `CLAUDE_CODE_IS_COWORK` from the forwarded `_session_context` — treat **any non-empty value** as true (per researcher note, "1" is not guaranteed).
- Export `getCoworkWorkspacePaths(): string[]` that parses `CLAUDE_CODE_WORKSPACE_HOST_PATHS` tolerantly: must handle **both `:` and `;`** separators (POSIX and Windows PATH conventions) until the Cowork doc confirms one — documented as TODO in the helper's JSDoc.
- Forward `CLAUDE_CODE_WORKSPACE_HOST_PATHS` through `packages/haiku/src/hooks/inject-state-file.ts` `vars` list (currently only forwards `CLAUDE_CODE_IS_COWORK` at `inject-state-file.ts:21`). Without this, the MCP server cannot read it.
- Workspace handshake: when `isCoworkHost() && paths.length === 0`, invoke `request_cowork_directory` **before any `.haiku/` write**. Call surface is still unknown (reverse-tool vs elicitation vs JSON-RPC) — implement behind a single `requestCoworkDirectory()` indirection so the call site can be swapped when Cowork docs confirm.
- Multi-workspace policy: `paths.length > 1` → `elicitInput` pick; `== 1` → auto-select; `== 0` → handshake. Selection cached on the session context for the rest of the process lifetime.
- Sentry tag compatibility: `sentry.ts:24-25` must keep working; do not rename or drop `sessionCtx.CLAUDE_CODE_IS_COWORK`.
- Unit tests covering all four branches.

### Out of scope

- MCP Apps `ui://` resource registration (unit-03).
- Review transport swap (unit-05).
- Tool list filtering by environment.
- Replacing the unknown `request_cowork_directory` transport — unit-01 ships the indirection, unit-02 (timeout spike) or a later refine can pin the real shape.

## Completion Criteria

Each criterion must be verifiable by a specific command.

1. **Probe exports exist.** `rg -n '^export function isCoworkHost' packages/haiku/src/state-tools.ts` returns 1 line; `rg -n '^export function getCoworkWorkspacePaths' packages/haiku/src/state-tools.ts` returns 1 line.
2. **Env var is forwarded.** `rg -n 'CLAUDE_CODE_WORKSPACE_HOST_PATHS' packages/haiku/src/hooks/inject-state-file.ts` returns ≥1 line inside the `vars` array (verify by reading context).
3. **Both separators parse.** A test feeds `"/a:/b"` and `"C:\\a;C:\\b"` to `getCoworkWorkspacePaths()` and asserts both return a 2-element array. Test file name is fixed in the spec; test runner exits 0.
4. **Truthy-variant test.** Tests assert `isCoworkHost()` is true for each of `"1"`, `"true"`, `"yes"`, and false for `""` and unset.
5. **Handshake fires only when needed.** Integration test mocks `requestCoworkDirectory`; asserts it is called exactly when `isCoworkHost() === true && paths.length === 0`, and **not called** in the other three branches. Test runner exits 0.
6. **Handshake precedes `.haiku/` writes.** Test with `CLAUDE_CODE_IS_COWORK=1` and empty paths spies on the first `.haiku/` write path and on `requestCoworkDirectory`; asserts the handshake call index < first write call index.
7. **Non-Cowork path is byte-identical.** The existing `state-tools.test.ts` suite runs without modification and passes. `git diff packages/haiku/src/state-tools.test.ts` shows additions only (no edits to existing tests).
8. **Sentry tagging unbroken.** `rg -n 'CLAUDE_CODE_IS_COWORK' packages/haiku/src/sentry.ts` still returns the existing reference; sentry unit test (if present) or a smoke assertion passes.
9. **Contract doc updated.** `packages/haiku/VALIDATION.md` has a new "Cowork detection" section listing the three branches and the unknown-separator caveat — verified by `rg -n '## Cowork detection' packages/haiku/VALIDATION.md`.
10. **No transport/UI code touched.** `git diff --name-only` does **not** include `server.ts`, `orchestrator.ts`, `http.ts`, `tunnel.ts`, or anything under `packages/haiku/src/templates/`.

## Open items deferred (not blockers for this unit)

- Exact `CLAUDE_CODE_WORKSPACE_HOST_PATHS` separator — handled by tolerant parsing, confirm in unit-02 or refine.
- Real shape of `request_cowork_directory` — hidden behind `requestCoworkDirectory()` indirection.
- Cowork capability/version flag for support detection — add when Cowork surfaces one.
