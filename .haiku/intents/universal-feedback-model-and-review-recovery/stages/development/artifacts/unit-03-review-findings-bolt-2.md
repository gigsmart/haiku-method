# Unit 03 (haiku-ui extraction) — Reviewer Findings (Bolt 2)

**Decision:** APPROVED.

**Reviewer:** bolt-2, same reviewer identity as bolt-1.

## Verification log (chain-of-verification on each completion criterion)

| Criterion | Verified by | Result |
|---|---|---|
| `packages/haiku-ui/` contains former review-app code | `ls packages/haiku-ui/src/` + git log | PASS — git mv history preserved |
| `packages/haiku/review-app/` removed | `ls packages/haiku/review-app` → "No such file" | PASS |
| Root workspaces include `packages/haiku-ui` | `grep workspaces package.json` | PASS |
| `types.ts` has no local `export type`/`export interface` | `grep '^export type [A-Za-z]+ = \|^export interface ' src/types.ts` → 0 matches | PASS |
| No `as any` in `haiku-ui/src` | `grep -r 'as any' src/` → 0 matches | PASS |
| `npm run build -w haiku-ui` succeeds | direct run | PASS — dist/index.html shell 351B gz |
| `npm run build -w @haiku/haiku` produces MCP binary w/ haiku-ui embedded | direct run | PASS — 6.9MB binary, haiku-ui inlined via `bundle-haiku-ui.mjs` |
| `haiku-ui/dist/index.html` ≤ 500 KB gzipped | measured | **FAIL — inlined blob is 885 KB gzipped** (routed upstream as FB-05) |
| Bundle comparison script exits 0 | `node scripts/compare-bundle.mjs ...` → exit 1 | **FAIL — exits 1** (routed upstream as FB-06) |
| DOM parity test passes all 3 fixtures | `npm test -w haiku-ui` | PASS — real jsdom render + committed snapshots |
| rAF coalescing: 100 bursts → 1 React render | `npm test -w haiku-ui` | PASS — test asserts 1 onUpdate call with tick-99 payload |
| `grep -R review-app-html packages/haiku/src/` → 0 | grep | PASS |
| `npx tsc --noEmit` passes (haiku + haiku-ui) | direct run in each | PASS — both clean |
| `npm test` passes | `npm test -w @haiku/haiku` (512/512) + `npm test -w haiku-ui` (4/4) | PASS |

## FB-02/03 upstream-routing adjudication

Bolt-1 reviewer findings FB-02 (bundle ceiling 500 → 1024 KB) and FB-03 (compare-bundle exits non-zero) were routed upstream by the bolt-2 builder as FB-05 and FB-06 (`upstream_stage: product`), with the reviewer findings themselves marked `status: addressed` / `closed_by: fix-loop:FB-0{2,3}:bolt-2`.

This is the path the bolt-1 reviewer explicitly sanctioned ("Builder should either do the scope work or reject back with upstream findings against the criterion authors"). Independent verification by the bolt-2 reviewer:

- **Pre-move baseline:** `gzip -c stages/development/artifacts/bundle-baseline.html | wc -c` → 952,067 bytes (929.8 KB gz). The 500 KB ceiling was never achievable before this unit's code existed.
- **Post-move blob:** 906,156 bytes (884.9 KB gz). Delta: **−44.8 KB vs pre-move.** Relocation did not regress size.
- **compare-bundle.mjs divergence:** First diff at line 7 — the pre-move build inlined script tags, the post-move build uses `<script type="module" crossorigin src="...">`. This is a vite-config-level invariant (`inlineDynamicImports` + the new ApiClient + rAF + zod schema import). Structural, not fixable inside the stripper.

Both upstream findings have concrete suggested resolution paths (split the unit / reframe the criterion / amend the ceiling). The FSM will surface them per `upstream_finding_surfaced` semantics — no auto-revisit, human adjudicates.

## FB-04 resolution (real scope work)

The bolt-1 reviewer's FB-04 (parity test was a zod schema stub) was **actually fixed**. `packages/haiku-ui/tests/parity.spec.tsx` now:

1. Mocks `ApiClient` with fixture JSON as `fetchSession` return.
2. Routes the SPA via `window.history.replaceState`.
3. Renders `<App>` through `@testing-library/react` under jsdom.
4. Waits for session load AND the downstream title-setter effect to flush.
5. Pipes `container.innerHTML` through `dom-parity-transformer.ts` (strips React internals, auto-id suffixes, runtime animation timings).
6. Snapshots via vitest — committed at `tests/__snapshots__/parity.spec.tsx.snap` (14KB, 3 snapshots).
7. Additionally asserts structural markers (`<header>`, `#main-content`, footer, per-fixture title text).

This is a real rendered-DOM parity test across all three session types. Snapshot file present and non-trivial. The reviewer-sanctioned jsdom alternative to Playwright was explicitly allowed in the bolt-1 FB-04 "Suggested fix" section.

## Code-quality notes (stage 2)

- `src/api/client.ts` — clean ApiClient interface, typed via `haiku-api` `paths` table, no hand-formatted URLs.
- `src/api/context.tsx` — idiomatic React context provider, default client fallback.
- `src/hooks/useSessionWebSocket.ts` — correct rAF coalescing with `pendingRef`/`rafRef`, cleanup on unmount, message validated via `WsServerMessageSchema.safeParse`.
- `src/types.ts` — pure re-export barrel.
- One pre-existing React hydration warning (nested `<button>` in `DesignPicker`'s direction cards — `<button role="radio">` contains `<button>View Full Size</button>`). Out of scope for this unit (relocation, no visual change); future a11y unit will address.

## Quality gates

- typecheck: PASS (both packages)
- test: PASS (haiku 512/512, haiku-ui 4/4)
- build: PASS (haiku-ui → dist, haiku → plugin/bin/haiku with haiku-ui embedded)

## Approval rationale

The unit is a pure relocation + dependency rewiring that preserves rendered output (verified by DOM parity), adds the spec-required new behaviors (ApiClient, rAF coalescing, zod-validated wire messages), and routes the two structurally impossible criteria upstream to the spec author. All real scope work is complete, all tests pass, all lints pass, the MCP binary builds with the new embedded blob.

The bolt-1 reviewer explicitly sanctioned upstream routing as the alternative to self-certification. The bolt-2 builder took that path with direct measurement backing the claim. The measurements are reproducible by the reviewer (done — see above). The upstream findings carry concrete resolution paths.

Approving.
