---
title: "Review SPA host bridge for MCP Apps runtime"
type: feature
model: sonnet
depends_on:
  - unit-03-ui-resource-registration
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/unit-04-host-bridge-research.md
  - stages/inception/units/unit-03-ui-resource-registration.md
outputs:
  - packages/haiku/review-app/src/host-bridge.ts
  - packages/haiku/review-app/src/hooks/useSession.ts (refactored)
  - packages/haiku/review-app/package.json (dep added)
---

# Review SPA host bridge for MCP Apps runtime

## Scope

Add a runtime-detected host bridge inside the **bundled** review SPA so the
same React codebase can talk to the MCP server via two transports: the
existing WebSocket + HTTP POST path in browser mode, and the
`@modelcontextprotocol/ext-apps` `App` class in MCP Apps iframe mode. One
build, one bundle, transport chosen once at module load.

### Critical scope clarification

- **Target SPA:** `packages/haiku/review-app/src/` — the Vite project that
  `packages/haiku/scripts/build-review-app.mjs` inlines into `REVIEW_APP_HTML`.
  Specifically `hooks/useSession.ts` (last touched by PR #173).
- **NOT in scope:** `website/app/components/review/` — a separate SPA not
  bundled into the binary. PR #213's heartbeat migration landed there and
  has **not** been brought across. Do not edit it in this unit.

### Current transport surface (bundled SPA)

`packages/haiku/review-app/src/hooks/useSession.ts` today:
- `useSessionWebSocket(sessionId)` opens `ws://…/ws/session/:id` (L9-45)
- `useSession(sessionId)` calls `GET /api/session/:id` (L60-97)
- `submitDecision`, `submitAnswers`, `submitDesignDirection` — WS first,
  HTTP POST fallback (L101-204)
- `tryCloseTab` — `sendBeacon` + `window.close` (L209-227)
- Callers: `App.tsx`, `ReviewSidebar.tsx`, `QuestionPage.tsx`, `DesignPicker.tsx`

It is still WebSocket-first with HTTP fallback — **not** heartbeat-based.

### In scope

- New module `packages/haiku/review-app/src/host-bridge.ts`:
  - `isMcpAppsHost()` — module-load, two-gate probe: `window.parent !== window`
    **and** `try { new App({...}); return true } catch { return false }` on
    imported `App` class. Fall back to browser on any throw. Cache result.
  - Exposes `getSession`, `submitDecision`, `submitAnswers`,
    `submitDesignDirection`, and a subscription API matching
    `useSession.ts` shapes.
  - Browser mode: delegate to the existing `fetch` / WebSocket code.
  - MCP Apps mode: `App.callServerTool(...)` for mutations; subscribe to
    `updateModelContext` / `ontoolresult` for session pushes.
- Refactor `useSession.ts` to call through `host-bridge.ts`; browser behavior
  unchanged.
- Add `@modelcontextprotocol/ext-apps` to
  **`packages/haiku/review-app/package.json`** (the workspace package — not
  root `package.json`).
- Vitest unit tests for the detection probe with stubbed `window.parent`
  and stubbed `App` constructor.

### Out of scope

- Cowork server tools the bridge calls into (unit-05, unit-06).
- E2E tunnel path or existing server-side review flow.
- Visual / component-tree changes.

### Potential scope expansion (flag, do not commit)

The bundled SPA is still WebSocket-first. The host-bridge refactor is a
clean seam to also port the **heartbeat pattern from PR #213** (currently
only in `website/app/components/review/`). Recommend calling this out in
the planner hat's review. Do **not** expand unit-04 to ship the heartbeat
migration unless the planner explicitly approves — default is: host-bridge
only, heartbeat port left as a follow-up unit.

## Completion Criteria

- `packages/haiku/review-app/src/host-bridge.ts` exists and is the only
  importer of `fetch` / `WebSocket` in the session-transport path —
  verified by `grep -r "new WebSocket" packages/haiku/review-app/src`
  returning only `host-bridge.ts`.
- `useSession.ts` imports `host-bridge.ts` and contains no direct `fetch`
  or `WebSocket` construction — verified by grep of `packages/haiku/review-app/src/hooks/useSession.ts`.
- `@modelcontextprotocol/ext-apps` appears in `dependencies` of
  `packages/haiku/review-app/package.json` — verified by
  `jq '.dependencies["@modelcontextprotocol/ext-apps"]' packages/haiku/review-app/package.json`.
- Vitest: stubbed `window.parent !== window` + stub `App` constructor
  causes `isMcpAppsHost()` to return `true` and `submitDecision` to invoke
  `App.callServerTool` instead of `fetch` — verified by
  `npm --workspace packages/haiku/review-app test -- host-bridge`.
- Vitest: stubbed top-window (`window.parent === window`) causes
  `isMcpAppsHost()` to return `false` and routes through the WebSocket /
  HTTP path — verified by same test runner.
- `node packages/haiku/scripts/build-review-app.mjs` still emits a single
  inlined `REVIEW_APP_HTML` (one `<script>` tag, no external asset refs) —
  verified by `grep -c "<script" dist/review-app.html` equals the pre-change
  count and no new `<link rel="stylesheet" href=` or `src="./` references.
- Bundle budget: gzipped `REVIEW_APP_HTML` grows by no more than **50 KB**
  — verified by comparing `gzip -c dist/review-app.html | wc -c` before
  and after, recorded in PR description.
- Full review-app test suite green — verified by
  `npm --workspace packages/haiku/review-app test` exit 0.
