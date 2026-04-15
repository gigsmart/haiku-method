---
title: Cowork environment probe and workspace handshake
type: feature
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/CONVERSATION-CONTEXT.md
  - knowledge/unit-01-cowork-env-contract.md
outputs:
  - knowledge/unit-01-cowork-env-contract.md
  - knowledge/unit-01-elaboration-notes.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:29:06Z'
hat_started_at: '2026-04-15T04:29:44Z'
completed_at: '2026-04-15T04:30:23Z'
---

# MCP Apps capability negotiation + workspace handshake

## Scope

Detect whether the connected MCP host supports the **MCP Apps extension** via spec-compliant capability negotiation (modelcontextprotocol.io/extensions/overview#negotiation), and expose a single accessor that downstream code consults before choosing a transport. No environment variable detection. Plus a workspace handshake for hosts that don't expose filesystem paths to the server.

### In scope

- **Server-side capability declaration.** In `packages/haiku/src/server.ts:158` capabilities block, add `experimental: { apps: {} }` (or whatever the MCP Apps spec keys it under) so the `initialize` handshake advertises support to the client.
- **Negotiated-capability accessor.** Export `hostSupportsMcpApps(): boolean` from `packages/haiku/src/state-tools.ts` (colocated with `isGitRepo`). Reads from `server.getClientCapabilities()` (MCP SDK API) — true iff the client echoed back the same `apps` capability during initialize. Caches the result on first read; the value cannot change for the life of the connection.
- **Workspace path accessor.** Export `getMcpHostWorkspacePaths(): string[]` from the same module. Pulls workspace folder paths from whatever the negotiated host capability surfaces — preferred path is reading from the `roots` capability (`server.listRoots()`) per MCP spec, falling back to `null` if the host did not advertise `roots`. **No env-var coupling.**
- **Workspace handshake.** When `hostSupportsMcpApps() === true && getMcpHostWorkspacePaths().length === 0`, invoke a single `requestHostWorkspace()` indirection (using `roots/list_changed` notification or `elicitInput` depending on what the negotiated capability set supports) **before any `.haiku/` write**. The exact call surface is hidden behind the indirection so the implementation can swap once we measure host behavior in unit-08.
- **Multi-workspace policy.** `roots.length > 1` → `elicitInput` pick; `== 1` → auto-select; `== 0` → handshake. Selection cached on the session context.
- **Sentry tag compatibility.** Sentry `sentry.ts:24-25` may still reference `CLAUDE_CODE_IS_COWORK` for telemetry tagging — that's a separate concern and is **not** removed by this unit. Tagging keeps working.
- **Unit tests** covering: client advertises `apps` capability → `hostSupportsMcpApps()` returns true; client does not → returns false; multi-root pick; single-root auto; zero-root handshake.

### Out of scope

- The `_meta.ui.resourceUri` envelope helper (unit-03).
- The Cowork branch of `_openReviewAndWait` (unit-05).
- `ask_user_visual_question` and `pick_design_direction` Cowork branches (unit-06).
- Tool list filtering — every tool stays advertised; runtime branching alone changes behavior.
- Removing `CLAUDE_CODE_IS_COWORK` references in Sentry — out of scope, separate cleanup.

## Completion Criteria

Each criterion must be verifiable by a specific command.

1. **Capability advertised.** `rg -n 'experimental.*apps' packages/haiku/src/server.ts` returns ≥1 line inside the `Server` constructor capabilities block.
2. **Accessor exists.** `rg -n '^export function hostSupportsMcpApps' packages/haiku/src/state-tools.ts` returns 1 line; same for `getMcpHostWorkspacePaths`.
3. **Negotiation path works.** Integration test boots the server with a stub client that advertises `apps` in its `initialize` response → `hostSupportsMcpApps()` returns `true`. Stub client without the capability → `false`. Test runner exits 0.
4. **Caching is idempotent.** Calling `hostSupportsMcpApps()` ten times against a single connection invokes `server.getClientCapabilities()` at most once — verified by spy.
5. **Handshake fires only when needed.** Integration test asserts `requestHostWorkspace()` is called exactly when `hostSupportsMcpApps() === true && roots.length === 0`, and **not called** in the other three branches.
6. **Handshake precedes `.haiku/` writes.** Test spies on the first `.haiku/` write path and on `requestHostWorkspace()`; asserts the handshake call index < first write call index.
7. **Non-MCP-Apps path is byte-identical.** The existing `state-tools.test.ts` suite runs without modification and passes. `git diff packages/haiku/src/state-tools.test.ts` shows additions only.
8. **No env-var detection of Cowork.** `rg -n 'CLAUDE_CODE_IS_COWORK' packages/haiku/src/state-tools.ts packages/haiku/src/hooks/` returns zero hits (Sentry's existing reference at `sentry.ts:24-25` is allowed and out of scope).
9. **Contract doc updated.** `packages/haiku/VALIDATION.md` has a new "MCP Apps capability negotiation" section linking the spec — verified by `rg -n '## MCP Apps capability negotiation' packages/haiku/VALIDATION.md`.
10. **No transport/UI code touched.** `git diff --name-only` does **not** include `orchestrator.ts`, `http.ts`, `tunnel.ts`, or anything under `packages/haiku/src/templates/`. `server.ts` is touched **only** for the capabilities block (criterion 1).

## Open items deferred (not blockers for this unit)

- Exact zod shape for the `experimental.apps` capability — derive from `@modelcontextprotocol/ext-apps` once the dep lands in unit-04.
- Real shape of `requestHostWorkspace()` — hidden behind the indirection, pinned in unit-08 once we observe a real host.
