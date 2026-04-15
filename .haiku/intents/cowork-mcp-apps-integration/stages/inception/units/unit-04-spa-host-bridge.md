---
title: Review SPA host bridge for MCP Apps runtime
type: feature
depends_on:
  - unit-03-ui-resource-registration
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-03-ui-resource-registration.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:34:41Z'
hat_started_at: '2026-04-15T04:35:17Z'
outputs:
  - knowledge/unit-04-host-bridge-research.md
completed_at: '2026-04-15T04:37:16Z'
---

# Review SPA host bridge for MCP Apps runtime

## Scope

Add a runtime-detected host bridge inside the review SPA that chooses between the existing `fetch` + WebSocket + HTTP POST transport (browser path) and the `@modelcontextprotocol/ext-apps` `App` class (MCP Apps iframe path). One React codebase, one build, two transports — feature detection at boot.

In scope:
- New module `packages/haiku/review-app/src/host-bridge.ts` that:
  - Detects whether the SPA is running inside an MCP Apps iframe (probe: `window.parent !== window` plus attempt to construct `App` from `@modelcontextprotocol/ext-apps`; fall back to browser mode if either is false).
  - Exposes `getSession(id)`, `submitDecision(...)`, `submitAnswers(...)`, `submitDesignDirection(...)`, and a subscription API that matches the existing shapes used by `useSession.ts`.
  - In browser mode, delegates to the current `fetch` / WebSocket implementation already in `packages/haiku/review-app/src/hooks/useSession.ts`.
  - In MCP Apps mode, uses `App.callServerTool(...)` for decision submission and subscribes to `updateModelContext` / `ontoolresult` for session pushes.
- Refactor `useSession.ts` to call through `host-bridge.ts` instead of `fetch` / WebSocket directly — behavior unchanged for browser mode.
- Add `@modelcontextprotocol/ext-apps` to `packages/haiku/review-app/package.json` dependencies.
- Unit tests for the bridge's detection logic with both fake iframes and browser DOM.

Out of scope:
- The new Cowork tools the bridge calls back into (created in unit-05 and unit-06).
- Visual regressions — component tree is untouched.
- The existing tunnel / E2E encryption path — untouched.

## Completion Criteria

- `packages/haiku/review-app/src/host-bridge.ts` exists and is imported by `useSession.ts` — verified by grep.
- Running the review-app in browser dev mode (`npm run dev` inside `review-app/`) loads a session via the existing HTTP endpoints with no console errors — verified by browser smoke test.
- Mocking `window.parent !== window` and injecting a stub `App` causes the bridge to route through `callServerTool` instead of `fetch` — verified by a Vitest unit test.
- `packages/haiku/scripts/build-review-app.mjs` still produces a single inlined `REVIEW_APP_HTML` with no additional external assets — verified by re-running the build and checking the output is a single `<script>`-inlined HTML file.
- Bundle size delta is documented in the PR description — `@modelcontextprotocol/ext-apps` adds no more than 50KB gzipped to `REVIEW_APP_HTML` — verified by before/after size check in CI.
- Existing review-app test suite passes unchanged — verified by test runner exit code.
