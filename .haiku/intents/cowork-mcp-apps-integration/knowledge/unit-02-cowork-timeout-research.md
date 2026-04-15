# Cowork Tool-Call Timeout — Research Notes

Researcher hat for `unit-02-cowork-timeout-spike`. Pre-spike desk research. **No measurement performed** — empirical numbers are explicitly deferred.

## 1. Timeout constants already in our codebase

Grep of `packages/haiku/src/`:

| File:Line | Constant | Value | Purpose |
|---|---|---|---|
| `sessions.ts:21` | `waitForSession` default `timeoutMs` | `30 * 60 * 1000` (30 min) | Event-based review/question/direction await |
| `server.ts:518` | `MAX_WAIT_Q` | 30 min | Visual question wait |
| `server.ts:667` | `MAX_WAIT_DD` | 30 min | Design direction wait |
| `server.ts:864` | per-attempt wait | 10 min, up to 3 attempts | Gate review retry loop (30 min total) |
| `server.ts:925` | error text | "Review timeout after 3 attempts (30 min total)" | Hard cap |
| `orchestrator.ts:577`, `hooks/quality-gate.ts:122` | quality-gate exec | 30 s | Hook process budget (unrelated) |

Net: H·AI·K·U currently assumes an effective **30-minute blocking tool-call budget**, implemented as one 30 min await (Q, DD) or 3×10 min awaits with reopen-on-timeout (gate review).

## 2. Cowork env-var timeout surface

Unit-01 research (`unit-01-cowork-env-contract.md`) enumerates `CLAUDE_CODE_IS_COWORK` and `CLAUDE_CODE_WORKSPACE_HOST_PATHS`. **Neither encodes a timeout**, and discovery lists no documented Cowork env var for tool-call duration. No `HAIKU_COWORK_*` timeout override exists yet.

## 3. `@modelcontextprotocol/sdk` documented limits

No MCP-spec-level tool-call wall-clock ceiling is published; MCP is transport-agnostic (stdio/SSE/WS). Any ceiling is imposed by the **host** (Cowork), not the protocol. MCP Apps (`ext-apps`) adds `ui://` resources + postMessage but does not alter tool-call timeout semantics. Streaming progress is only via `notifications/progress` — our server does not emit them today.

## 4. Minimum viable probe-tool shape

- Name: `haiku_cowork_timeout_probe`.
- Input: `{ delay_ms: number (1..3_600_000), echo?: string }`.
- Behavior: `await sleep(delay_ms)`; return `{ status: "ok", slept_ms, started_at, finished_at, echo }`.
- Registration gate: only registered when `process.env.HAIKU_COWORK_DEBUG === "1"`. Absent from `list_tools` otherwise.
- No state writes. No Sentry. Logs elapsed to stderr.

## 5. Explicit unknowns (deferred to measurement)

1. Cowork's actual tool-call ceiling (seconds vs minutes vs >30 min).
2. Error shape on timeout (JSON-RPC error code, host-synthesized response, or silent drop).
3. Whether the MCP session survives a timed-out call (subsequent calls OK?) or is torn down.
4. Whether Cowork emits any resume/retry affordance to the server after timeout.
5. Whether `notifications/progress` extends the ceiling (keepalive semantics).
6. Interaction with `updateModelContext()` from MCP Apps — does it reset the wall clock?
