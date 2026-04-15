# PLAN: unit-05-spa-host-bridge

**Unit:** Review SPA host-bridge module + useSession wiring
**Stage:** development
**Hat sequence:** planner → builder → reviewer
**Gzipped size baseline (recorded at unit start):** 949,203 bytes
**Bundle size ceiling (baseline + 50 KB):** 1,000,403 bytes

---

## What this unit does

Adds `packages/haiku/review-app/src/host-bridge.ts` — a module-load-time
transport router that probes once whether the SPA is running inside an MCP
Apps iframe or a plain browser tab, caches that answer for the connection
lifetime, and routes all transport calls through the right path.

Exports: `isMcpAppsHost()`, `getSession()`, `submitDecision()`,
`submitAnswers()`, `submitDesignDirection()`.

Refactors `hooks/useSession.ts` to delegate through the bridge. Adds
`@modelcontextprotocol/ext-apps` to review-app dependencies. No visual
components change.

---

## Files to modify or create

| File | Action | Rationale |
|---|---|---|
| `packages/haiku/review-app/src/host-bridge.ts` | CREATE | New transport router; core deliverable of this unit |
| `packages/haiku/review-app/src/hooks/useSession.ts` | MODIFY | Delegate session fetch and all three submit functions through the bridge; browser-mode behavior must be byte-identical |
| `packages/haiku/review-app/package.json` | MODIFY | Add `@modelcontextprotocol/ext-apps` to `dependencies`; add `vitest` + `@vitest/coverage-v8` + `jsdom` to `devDependencies`; add `"test": "vitest run"` script |
| `packages/haiku/review-app/vitest.config.ts` | CREATE | Set `test.environment: 'jsdom'` so `window.parent` is available in tests |
| `packages/haiku/review-app/src/host-bridge.test.ts` | CREATE | Vitest unit tests covering all 10 feature scenarios |

Do NOT touch: `App.tsx`, `ReviewPage.tsx`, `QuestionPage.tsx`, `DesignPicker.tsx`,
`AnnotationCanvas.tsx`, any file under `components/`, any server-side file, or
`http.ts`. The bridge swaps transport only.

---

## Step-by-step implementation (dependency order)

### Step 0 — Baseline size measurement (first thing the builder does)

Before writing any code, run:

```bash
npm --prefix packages/haiku run prebuild
gzip -c packages/haiku/src/review-app-html.ts | wc -c
```

Record this number. Expected ~949,203 bytes (confirmed at plan time). If it
differs, record the actual value — it is the baseline for criterion 10.
Commit the baseline number in the final commit message.

### Step 1 — Add `@modelcontextprotocol/ext-apps` dependency

1. Check the npm registry: `npm view @modelcontextprotocol/ext-apps version 2>/dev/null || echo "not found"`
2. If found, add to `packages/haiku/review-app/package.json` under `dependencies`.
   Run `npm install --prefix packages/haiku/review-app`.
3. If NOT found on npm, check if the package is available under a different scope
   or as a local path in the monorepo. If unavailable, **do not fabricate it** —
   create a minimal stub at
   `packages/haiku/review-app/src/ext-apps-stub.d.ts` declaring the minimal
   `App` class surface needed for the probe and `callServerTool`, and add a note
   in the commit message. Then escalate via `haiku_unit_reject_hat` with the
   specific blocker.

Also add test dependencies in the same `npm install`:

```
vitest jsdom @vitest/coverage-v8
```

Add `"test": "vitest run"` to the `scripts` block in `package.json`.

### Step 2 — Create `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
  },
});
```

### Step 3 — Create `packages/haiku/review-app/src/host-bridge.ts`

The module structure (in order):

1. **Import** `App` from `@modelcontextprotocol/ext-apps`.
   Import `SessionData`, `QuestionAnswer`, `ReviewAnnotations` from `../types`
   (or `./types` depending on path — adjust to actual location).

2. **Module-level probe IIFE** (runs exactly once at import time):

   ```typescript
   const _isMcpAppsHost: boolean = (() => {
     if (typeof window === "undefined" || window.parent === window) return false;
     try {
       new App({ /* minimal required args from package docs */ });
       return true;
     } catch {
       return false;
     }
   })();
   ```

   The IIFE result is stored in `_isMcpAppsHost`. The probe never re-runs.

3. **Console log** immediately after the IIFE (NOT inside `isMcpAppsHost()`):

   ```typescript
   console.log(`isMcpAppsHost() == ${_isMcpAppsHost}`);
   ```

   Exact format: `"isMcpAppsHost() == true"` or `"isMcpAppsHost() == false"`.
   One call, at module load.

4. **`export function isMcpAppsHost(): boolean`** — returns `_isMcpAppsHost`.
   No side effects. 10 calls → 1 probe invocation.

5. **`export async function getSession(id: string): Promise<SessionData>`**

   MCP Apps path:
   - Session data is hydrated from the tool result content passed by the host
     via `App.ontoolresult` / `updateModelContext`. Read the `@modelcontextprotocol/ext-apps`
     docs for the exact API. If the data is available synchronously (it should be,
     as the SPA only loads after the tool result is delivered), parse and return it.
   - No HTTP request.

   Browser path:
   ```typescript
   const res = await fetch(`/api/session/${id}`, {
     headers: { "bypass-tunnel-reminder": "1" },
   });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   return res.json() as Promise<SessionData>;
   ```
   Byte-identical to the current `useSession.ts` `fetchSession` implementation.

6. **`export async function submitDecision(...)`**

   Signature (must match existing callers in `ReviewSidebar.tsx`):
   ```typescript
   export async function submitDecision(
     sessionId: string,
     decision: "approved" | "changes_requested" | "external_review",
     feedback: string,
     annotations?: ReviewAnnotations,
     wsRef?: React.RefObject<WebSocket | null>,
   ): Promise<void>
   ```

   MCP Apps path:
   ```typescript
   await App.callServerTool("haiku_cowork_review_submit", {
     session_type: "review",
     session_id: sessionId,
     decision,
     feedback,
     ...(annotations ? { annotations } : {}),
   });
   ```

   Browser path (byte-identical to current `useSession.ts`):
   - Try `trySendViaWs(wsRef, { type: "decide", decision, feedback, annotations })`
   - On failure, HTTP POST to `/review/${sessionId}/decide`
   - Keep `keepalive: true`, same headers

7. **`export async function submitAnswers(...)`**

   Signature (must match existing callers in `QuestionPage.tsx`):
   ```typescript
   export async function submitAnswers(
     sessionId: string,
     answers: QuestionAnswer[],
     wsRef?: React.RefObject<WebSocket | null>,
     feedback?: string,
     annotations?: { comments?: Array<{ selectedText: string; comment: string; paragraph: number }> },
   ): Promise<void>
   ```

   MCP Apps path: `App.callServerTool("haiku_cowork_review_submit", { session_type: "question", ... })`.
   Browser path: WS → HTTP POST to `/question/${sessionId}/answer` (byte-identical).

8. **`export async function submitDesignDirection(...)`**

   Signature (must match existing callers in `DesignPicker.tsx`):
   ```typescript
   export async function submitDesignDirection(
     sessionId: string,
     archetype: string,
     parameters: Record<string, number>,
     wsRef?: React.RefObject<WebSocket | null>,
   ): Promise<void>
   ```

   MCP Apps path: `App.callServerTool("haiku_cowork_review_submit", { session_type: "design_direction", ... })`.
   Browser path: WS → HTTP POST to `/direction/${sessionId}/select` (byte-identical).

9. **`trySendViaWs` helper** — move or copy from `useSession.ts` into
   `host-bridge.ts` (it is needed by the browser path). Update the import in
   `useSession.ts` if moved. If copied, keep both in sync or prefer move+re-export.

**Key constraints:**
- `tryCloseTab`, `window.close`, `navigator.sendBeacon` MUST NOT appear in
  `host-bridge.ts` (criterion 12). These stay in `useSession.ts`.
- `useSessionWebSocket` MUST NOT move — it stays in `useSession.ts`.

### Step 4 — Refactor `hooks/useSession.ts`

After `host-bridge.ts` exists:

1. Add import: `import { getSession, submitDecision, submitAnswers, submitDesignDirection } from "../host-bridge";`
   (adjust relative path as needed — file is at `src/hooks/useSession.ts`,
   bridge is at `src/host-bridge.ts`, so `../host-bridge`).

2. Replace the inline `fetchSession` body inside `useSession` hook with a call to
   `getSession(sessionId)`.

3. Replace the bodies of the exported `submitDecision`, `submitAnswers`, and
   `submitDesignDirection` functions with thin wrappers that forward all args to
   the bridge functions. The exported function signatures do NOT change.

4. The `useSession` hook's React state management (`setSession`, `setLoading`,
   `setError`, cancellation flag) stays intact — only the data-fetch call
   changes.

5. `tryCloseTab`, `trySendViaWs` (if not moved), `useSessionWebSocket` are unchanged.

Verification: after refactor, `rg "from.*host-bridge" src/hooks/useSession.ts`
returns ≥ 1 hit.

### Step 5 — Write Vitest tests in `host-bridge.test.ts`

**Module isolation is required.** Because `_isMcpAppsHost` is set at import time
by a module-level IIFE, each test scenario that needs a different probe result
must use `vi.isolateModules()` + `vi.resetModules()` to re-import the module with
fresh globals.

Pattern for each scenario:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isMcpAppsHost probe", () => {
  it("returns true when both gates pass", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { ...globalThis.window, parent: {} }); // parent !== window
    // stub App constructor to not throw
    vi.mock("@modelcontextprotocol/ext-apps", () => ({
      App: class { constructor() {} },
    }));
    const { isMcpAppsHost } = await import("./host-bridge");
    expect(isMcpAppsHost()).toBe(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  // ... other scenarios
});
```

Cover all 10 feature scenarios:

| Feature scenario | Test assertion |
|---|---|
| Both gates pass → true, logged | `isMcpAppsHost() === true`; `console.log` spy asserts one call with `"isMcpAppsHost() == true"` |
| MCP mode submitDecision via callServerTool | `App.callServerTool` called with correct args; `fetch` not called |
| MCP mode getSession avoids HTTP fetch | `fetch` not called during `getSession()` in MCP mode |
| window.parent === window → false, logged | `isMcpAppsHost() === false`; log contains `"== false"` |
| App constructor throws → false, no re-throw | gate 1 passes, gate 2 throws; `isMcpAppsHost() === false`; no unhandled rejection |
| Cached: 10 calls → 1 probe | Count `App` constructor calls across 10 `isMcpAppsHost()` invocations: expect 1 |
| Browser mode WS open → WS sent, callServerTool not called | Mock open WS; call `submitDecision`; assert WS.send called |
| Browser mode WS closed → HTTP POST, callServerTool not called | Mock closed WS; call `submitDecision`; assert `fetch` POST called |
| callServerTool rejects → error propagates | `App.callServerTool` rejects; assert `submitDecision` rejects |
| Probe before DOMContentLoaded (deferred DOM) | Stub `window` as undefined or missing `parent`; assert `isMcpAppsHost() === false`, no throw |

### Step 6 — Run tests and check coverage

```bash
cd packages/haiku/review-app && npm test
```

All tests must pass. If any fail, fix before proceeding.

### Step 7 — Rebuild bundle and check gzip size

```bash
npm --prefix packages/haiku run prebuild
gzip -c packages/haiku/src/review-app-html.ts | wc -c
```

The result must be ≤ 1,000,403 bytes (baseline + 50 KB). Record the actual
value. If over budget, investigate whether `@modelcontextprotocol/ext-apps`
can be dynamically imported or stubbed more aggressively.

### Step 8 — Typecheck

```bash
cd packages/haiku/review-app && npx tsc --noEmit
```

Fix all errors. Common issues:
- Missing type declarations for `@modelcontextprotocol/ext-apps` — add a stub
  `declare module` in `vite-env.d.ts` if the package ships without types.
- React import in `host-bridge.ts` — if `React.RefObject` is used in the
  signature, the import is needed.

### Step 9 — Commit

```bash
git -C packages/haiku/review-app add src/host-bridge.ts src/host-bridge.test.ts \
    src/hooks/useSession.ts package.json vitest.config.ts
git commit -m "feat(unit-05): add host-bridge transport router + refactor useSession

Gzipped baseline: 949,203 bytes
Gzipped after build: <record actual value here>
Budget ceiling: 1,000,403 bytes"
```

---

## Completion criteria verification commands

| # | Criterion | Command |
|---|---|---|
| 1 | Module exists with `isMcpAppsHost` export | `test -f packages/haiku/review-app/src/host-bridge.ts && rg -n '^export function isMcpAppsHost' packages/haiku/review-app/src/host-bridge.ts` |
| 2 | Imported by useSession | `rg -n "from ['\"].*host-bridge['\"]" packages/haiku/review-app/src/hooks/useSession.ts` |
| 3 | Dependency added | `grep '"@modelcontextprotocol/ext-apps"' packages/haiku/review-app/package.json` |
| 4 | Two-gate probe test passes | `cd packages/haiku/review-app && npm test` (probe-true scenario passes) |
| 5 | Caching: 10 calls → 1 probe | `cd packages/haiku/review-app && npm test` (caching test passes) |
| 6 | MCP mode uses callServerTool | `cd packages/haiku/review-app && npm test` (MCP submitDecision test passes) |
| 7 | Browser mode uses fetch | `cd packages/haiku/review-app && npm test` (browser submitDecision test passes) |
| 8 | Console log on module load | `rg -n 'console\.log.*isMcpAppsHost' packages/haiku/review-app/src/host-bridge.ts` (≥ 1 hit); log test passes |
| 9 | Bundle stays single inline HTML | `npm --prefix packages/haiku run prebuild && grep -c 'REVIEW_APP_HTML' packages/haiku/src/review-app-html.ts` (returns 1) |
| 10 | Gzip budget ≤ 1,000,403 bytes | `gzip -c packages/haiku/src/review-app-html.ts \| wc -c` |
| 11 | Existing tests pass unchanged | `cd packages/haiku/review-app && npm test` (all tests exit 0) |
| 12 | No browser-chrome assumptions | `rg -n 'window\.close\|navigator\.sendBeacon\|tryCloseTab' packages/haiku/review-app/src/host-bridge.ts` (0 hits) |
| 13 | Typecheck clean | `cd packages/haiku/review-app && npx tsc --noEmit` (exit 0) |

---

## Risks and mitigations

### R1 — `@modelcontextprotocol/ext-apps` not on npm (HIGH)

This is the biggest unknown. The package is referenced throughout the design
specs but not yet in any `package.json` in the repo. If `npm install` fails:
- Check the `@modelcontextprotocol` org on npm for the correct package name.
- Check if it ships as part of `@modelcontextprotocol/sdk` (imported differently).
- If truly unavailable: create a minimal stub, mark criteria 3/4/6/8 as blocked,
  and call `haiku_unit_reject_hat` with the specific error. Do not fabricate.

### R2 — `App` constructor signature unknown until Step 1 (MEDIUM)

The two-gate probe's `new App({ ... })` arguments depend on the actual package API.
Wrong args → constructor throws → probe returns false → MCP Apps path never active.
Mitigation: read the package README and TypeScript declarations immediately after
`npm install` before writing the probe in Step 3.

### R3 — Module-level IIFE requires Vitest isolation (MEDIUM)

Each test scenario that needs a different probe result must call `vi.resetModules()`
before re-importing `host-bridge.ts`. Without isolation, the first import's cached
`_isMcpAppsHost` value poisons all subsequent tests. Use `vi.isolateModules()` or
the `beforeEach(() => vi.resetModules())` pattern. Not doing this is the most
likely source of flaky tests.

### R4 — Bundle size from ext-apps package (MEDIUM)

If `@modelcontextprotocol/ext-apps` is large and not tree-shakeable, it could push
the bundle past the 50 KB gzip budget. Mitigation: check `npm view @modelcontextprotocol/ext-apps dist.unpackedSize` before installing. If the package is oversized,
consider a dynamic `import()` so it is not inlined into the SPA bundle in the
browser-mode path — but this adds complexity. Check size first.

### R5 — DOM timing in sandboxed iframes (LOW)

Feature scenario 9 tests that the probe handles a deferred DOM. In practice, Vite
bundles load as ES modules after the document is parsed, so `window` is always
defined. The risk is mainly in jsdom test environments. Mitigation: the `typeof
window === 'undefined'` guard in the IIFE handles this cleanly and returns false
safely in any non-browser context.

### R6 — Browser-mode byte-identity (MEDIUM)

Criterion 7 requires the browser path to be byte-identical to the current
`useSession.ts` implementation. The builder must diff the browser-path code
before and after refactor. Common drift: adding/removing headers, changing
fallback URL paths, altering WS message field names.

### R7 — No test runner configured today (LOW — known gap)

`packages/haiku/review-app/package.json` has no `"test"` script. The builder
adds Vitest + jsdom in Step 1. If forgotten, all test criteria (4–8, 11) fail.
The `vitest.config.ts` must set `test.environment: 'jsdom'` explicitly.

---

## Feature scenario coverage map

All 10 scenarios in `features/host-bridge-detection.feature` are covered:

| Scenario | Test name |
|---|---|
| Both gates pass → MCP mode selected and cached | `probe: both gates pass returns true and logs` |
| MCP mode submitDecision via callServerTool | `submitDecision: MCP mode calls callServerTool` |
| MCP mode getSession avoids HTTP fetch | `getSession: MCP mode avoids fetch` |
| window.parent === window → browser mode | `probe: window.parent equals window returns false` |
| App constructor throws → browser mode | `probe: App constructor throws returns false` |
| Detection cached for connection lifetime | `probe: cached — 10 calls, 1 probe invocation` |
| Browser mode WS first | `submitDecision: browser mode uses WebSocket` |
| Browser mode HTTP POST fallback | `submitDecision: browser mode falls back to HTTP POST` |
| callServerTool rejects → error propagates | `submitDecision: MCP error propagates to caller` |
| Probe before DOMContentLoaded | `probe: deferred DOM guard returns false safely` |
