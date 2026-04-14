# Cowork Environment Contract — Research Notes

Researcher hat notes for `unit-01-cowork-env-probe`. Factual only. No implementation.

## 1. Environment variables the plugin must detect

| Var | Purpose | Values seen in docs/discovery |
|---|---|---|
| `CLAUDE_CODE_IS_COWORK` | Truthy when the Claude Code runtime is hosted inside Cowork (sandboxed, no port-bind). | `"1"` = inside Cowork. Unset/empty = not Cowork. Treat any non-empty value as true for probe semantics. |
| `CLAUDE_CODE_WORKSPACE_HOST_PATHS` | Host filesystem paths of workspace folders the user has opened in Cowork. Empty (`""` or unset) means no folder open. | Colon-delimited (POSIX `PATH`-style) list of absolute host paths. Discovery does not explicitly pin the separator — treat as TODO; confirm against Cowork docs before shipping. |

### Current references in `packages/haiku/src/` (grep result)

Not zero — two existing touch points:

- `packages/haiku/src/hooks/inject-state-file.ts:21` — `CLAUDE_CODE_IS_COWORK` is already forwarded into `_session_context` by the PreToolUse hook (runs in the Claude Code process, not the MCP server process).
- `packages/haiku/src/sentry.ts:24-25` — reads `sessionCtx.CLAUDE_CODE_IS_COWORK` to tag Sentry scope.

`CLAUDE_CODE_WORKSPACE_HOST_PATHS` is **not** forwarded today. The MCP server process cannot read it directly because Cowork env is scoped to the Claude Code process; the hook is the only reliable channel. unit-01 implementation will need to add this var to the `vars` list in `inject-state-file.ts` alongside the new `isCoworkHost()` helper in `state-tools.ts`.

## 2. `request_cowork_directory` handshake — known vs unknown

**Known (from DISCOVERY.md):**
- It is the Cowork host mechanism for asking the user to open a workspace folder when none is present.
- The plugin is expected to invoke it before any `.haiku/` write in Cowork when `CLAUDE_CODE_WORKSPACE_HOST_PATHS` is empty.

**Unknown / needs Cowork docs confirmation:**
- Call surface: is it a **reverse tool call** (Cowork advertises it as a client-exposed tool the server invokes), an **MCP elicitation** (`elicitInput` with a structured schema), or a **server-initiated request** over JSON-RPC? DISCOVERY wording is ambiguous.
- Return shape: does it return the chosen path synchronously, a list of new `CLAUDE_CODE_WORKSPACE_HOST_PATHS`, or just a success signal that requires a subsequent re-read of the env?
- Failure modes: user dismisses, timeout, Cowork version without support.
- Idempotency: safe to call more than once per session? Does Cowork coalesce?

## 3. Multi-workspace selection policy — options

If `CLAUDE_CODE_WORKSPACE_HOST_PATHS` parses to >1 path:

1. **Prompt (recommended, matches unit spec):** call `elicitInput` with the list and let the user pick. Deterministic, user-controlled, explicit. Selection cached for the session.
2. **First wins:** take `paths[0]`. Fast, zero UX, but hides multi-workspace ambiguity and can silently write to the wrong repo.
3. **Most-recent / heuristic:** pick by `mtime` or cwd match. Adds FS I/O and hidden rules.

Unit spec already mandates option 1 ("prompt the user to pick via `elicitInput`"). Record as: prompt on >1, auto-select on ==1, handshake on ==0.

## 4. Open questions (escalate to Cowork docs)

1. Exact separator used inside `CLAUDE_CODE_WORKSPACE_HOST_PATHS` (`:` vs `;` vs newline vs JSON array).
2. Shape and transport of `request_cowork_directory` (tool vs elicitation vs JSON-RPC).
3. Whether the env var is re-read after handshake or the new path is returned inline.
4. Whether Cowork exposes a version/capability flag so the probe can detect `request_cowork_directory` support before calling it.
5. Is `CLAUDE_CODE_IS_COWORK` guaranteed to be `"1"` exactly, or can it be any truthy string?
