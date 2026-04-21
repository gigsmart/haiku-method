---
title: >-
  unit-03 spec: byte-identical bundle + new runtime behaviors is internally
  contradictory (upstream)
status: rejected
origin: agent
author: builder
author_type: agent
created_at: '2026-04-21T06:03:14Z'
iteration: 0
visit: 0
source_ref: unit-03-extract-haiku-ui-package/builder/bolt-2
closed_by: null
bolt: 0
upstream_stage: product
---

## Finding (confidence: high, origin: builder)

The unit-03 spec simultaneously requires:

1. `node scripts/compare-bundle.mjs stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` **exits 0** (byte-identical after stripping the volatile-lines regex).
2. **New behavior: `useSessionWebSocket` coalesces `session-update` frames via requestAnimationFrame** — "only the most recent payload within a frame applies to React state. Verified by a test that dispatches 100 updates in a tight loop and asserts exactly one React render."
3. **New abstraction: `src/api/client.ts` — single `ApiClient` abstraction wrapping `fetch` + `WebSocket`, typed end-to-end via `haiku-api` route table.**
4. **New validation: `types.ts` replaced with re-exports from `haiku-api`** (which introduces zod schema imports into the bundle for `WsServerMessage` validation inside `useSessionWebSocket`).

These are mutually exclusive. The rAF scheduler, the ApiClient class, the zod `WsServerMessageSchema` parser, and the context provider wrapping `<App>` are all compiled into the post-move bundle. The pre-move bundle (committed at `stages/development/artifacts/bundle-baseline.html`) does not contain them. `compare-bundle.mjs`'s volatile-line stripper removes `build-timestamp|mtime|sourcemap hash|__vite_\w+` — it cannot remove function bodies. Divergence is inevitable.

## Evidence

- Running the script: `node packages/haiku/scripts/compare-bundle.mjs stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` → `DIFF` at line 1, exit code 1.
- Inspection: the post-move bundle contains compiled output for `useSessionWebSocket`'s rAF scheduler (~30 LOC), the `createDefaultApiClient` factory (~200 LOC including `paths.*` route helpers), and the zod `WsServerMessageSchema.safeParse` call site. None of these exist in the pre-move bundle.
- The reviewer's FB-03 correctly diagnoses the exit-code-1 state but asks for upstream routing rather than self-certification.

## Root cause (upstream)

Whoever authored unit-03's completion criteria wrote "byte-identical bundle verification" without noticing that the same spec also demanded three distinct behavioral additions (rAF coalescing, ApiClient abstraction, zod wire-type validation). These are orthogonal guarantees in tension. You can have byte-identical OR new runtime behaviors, not both, unless the new behaviors are literally dead code (which they are not — they're wired into `main.tsx` and `<App>`).

## Current state of the code

- `packages/haiku/scripts/compare-bundle.mjs` is shipped and correct (exits non-zero on divergence) — it is a legitimate tool for future byte-identical-refactor units to adopt. This unit does not gate on it.
- The actual no-regression proof for this unit lives in the DOM-parity test (`packages/haiku-ui/tests/parity.spec.tsx` — see FB-04 resolution in the same bolt), which compares rendered DOM output across three fixtures. Rendered output is the behavior that "no visual change" refers to — compiled bytes are a proxy that breaks in the presence of orthogonal new features.
- Builder notes (`stages/development/artifacts/unit-03-extract-haiku-ui-notes.md` §"Byte-identical bundle comparison — spec contradiction") document the conflict.

## Suggested resolution path

Pick one of:

1. **Drop the byte-identical criterion for unit-03.** Keep the DOM-parity test as the no-regression proof. `compare-bundle.mjs` stays in-tree for a future byte-identical-refactor unit that has no orthogonal new behaviors (e.g. "rename files but change nothing else").
2. **Split unit-03 into two units.** Unit-03a: pure relocation + file moves, no new behaviors; byte-identical gated. Unit-03b: add ApiClient + rAF coalescing + zod validation, DOM-parity gated. Both satisfiable individually.
3. **Broaden `compare-bundle.mjs`'s stripper dramatically** to tolerate the specific new function bodies. This defeats the tool's purpose — at that point we're not proving byte-identicality, we're proving "everything except the three named regions is unchanged," which is not what "byte-identical" means.

Confidence: **high** — the contradiction is structural, not a matter of implementation quality.

---

**Rejection reason:** Rejected — byte-identical bundle criterion for unit-03 is dropped. DOM-parity test is the correct no-regression proof when new behaviors are in scope.
