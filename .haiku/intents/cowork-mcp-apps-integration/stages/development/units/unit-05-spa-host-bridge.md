---
title: Review SPA host-bridge module + useSession wiring
type: feature
model: sonnet
depends_on:
  - unit-02-ui-resource-registration
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - features/host-bridge-detection.feature
  - stages/design/artifacts/host-bridge-status.html
  - .haiku/knowledge/ARCHITECTURE.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-15T16:05:00Z'
hat_started_at: '2026-04-15T16:21:58Z'
outputs:
  - knowledge/unit-05-dev-spa-host-bridge-implementation.md
completed_at: '2026-04-15T16:27:15Z'
---

# Review SPA host-bridge module

## Scope

Add `packages/haiku/review-app/src/host-bridge.ts` — a runtime-detected transport router inside the **bundled** review SPA (not the `website/app/components/review/` SPA). The bridge selects between the existing fetch+WebSocket+HTTP-POST path (browser mode) and the `@modelcontextprotocol/ext-apps` `App.callServerTool` path (MCP Apps iframe mode) at module load time, then caches the result for the connection lifetime.

### In scope

- **New file `packages/haiku/review-app/src/host-bridge.ts`** exporting:
  - `isMcpAppsHost(): boolean` — two-gate probe (`window.parent !== window` AND `new App({...})` construction succeeds), cached at module load.
  - `getSession(id: string): Promise<SessionData>` — delegates to browser mode via existing fetch OR MCP Apps mode via `App.callServerTool`/`ontoolresult`.
  - `submitDecision(...)`, `submitAnswers(...)`, `submitDesignDirection(...)` — same delegation pattern.
  - All four functions match the existing shapes consumed by `packages/haiku/review-app/src/hooks/useSession.ts`.
- **Refactor `hooks/useSession.ts`** to call through the bridge instead of `fetch` / WebSocket directly. Browser mode behavior is byte-identical — delete nothing that non-MCP-Apps hosts need.
- **Add `@modelcontextprotocol/ext-apps`** to `packages/haiku/review-app/package.json` dependencies. Run `npm install` in that workspace.
- **Console log** the detection outcome: `console.log("isMcpAppsHost() == true|false")` once on module load for evidence capture (required by unit-08 of inception and the `accessibility-iframe.feature` genuine-iframe assertion).
- **Unit tests.** Vitest with mocked `window.parent` and stubbed `App` class: probe returns true when both gates pass, false when either fails. Decision submit in MCP Apps mode calls `App.callServerTool`; browser mode calls `fetch`.

### Out of scope

- The `website/app/components/review/` SPA — out of scope entirely. The heartbeat pattern from PR #213 stays in the website SPA; this unit does not port it.
- SPA visual components — `App.tsx`, `ReviewPage.tsx`, `QuestionPage.tsx`, `DesignPicker.tsx`, `AnnotationCanvas.tsx` are untouched. The bridge swaps transport only.
- Cowork-mode server handlers (units 03 and 04).

## Completion Criteria

1. **New module exists.** `test -f packages/haiku/review-app/src/host-bridge.ts && rg -n '^export function isMcpAppsHost' packages/haiku/review-app/src/host-bridge.ts` returns 1.
2. **Imported by useSession.** `rg -n "from ['\"]\\./\\.\\./host-bridge['\"]|from ['\"]\\.\\.?/host-bridge['\"]" packages/haiku/review-app/src/hooks/useSession.ts` returns ≥ 1 hit.
3. **Dependency added.** `grep '"@modelcontextprotocol/ext-apps"' packages/haiku/review-app/package.json` returns 1 hit.
4. **Two-gate probe in Vitest.** Mock `window.parent !== window` + stub `App` construction; assert `isMcpAppsHost() === true`. Flip either gate → `false`.
5. **Caching.** `isMcpAppsHost()` called 10 times invokes the probe exactly once (module-level var).
6. **MCP Apps mode routes via callServerTool.** Vitest asserts `App.callServerTool` is called (not `fetch`) when submitting a decision in MCP Apps mode.
7. **Browser mode routes via fetch.** Vitest asserts the existing `fetch` path is invoked when `isMcpAppsHost() === false`.
8. **Console log emitted.** Vitest captures `console.log` and asserts one call with `"isMcpAppsHost() == true"` or `"== false"` on module load.
9. **Bundle still inlines as one HTML file.** `npm --prefix packages/haiku run prebuild` succeeds; `packages/haiku/src/review-app-html.ts` contains a single `REVIEW_APP_HTML` export whose value is an HTML string (no external asset references).
10. **Gzipped size budget.** `gzip -c packages/haiku/src/review-app-html.ts | wc -c` should not exceed the pre-intent value by more than 50 KB. (Recorded baseline: TBD at unit start.) Captured in commit message.
11. **Existing review-app tests pass unchanged.** `cd packages/haiku/review-app && npm test` (or the project's test runner for this workspace) exits 0.
12. **No browser-chrome assumptions introduced.** `rg -n 'window\.close|navigator\.sendBeacon|tryCloseTab' packages/haiku/review-app/src/host-bridge.ts` returns 0 hits.
13. **Typecheck clean.** `cd packages/haiku/review-app && npx tsc --noEmit` exit 0.
