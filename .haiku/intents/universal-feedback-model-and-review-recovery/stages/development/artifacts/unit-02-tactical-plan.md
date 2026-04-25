# Tactical Plan: unit-02 MCP consumes haiku-api

Owner: planner (bolt 1)
Target: refactor `packages/haiku/src/http.ts` to import request/response schemas + types from `haiku-api`, add security hardening (transport invariant, size caps, rate limits, path traversal, cross-session auth, no-secret logging), add `POST /api/revisit/:sessionId`, and cover the new contracts + security invariants with tests.

## Context & Prior Art

- **Unit-01 produced** `packages/haiku-api/` with Zod schemas (`src/schemas/*.ts`), route table (`src/routes.ts`), OpenAPI emitter, and all inferred TS types. Workspace is already wired in root `package.json` (`packages/haiku-api` is listed in `workspaces`).
- **`http.ts` today** declares inline Zod schemas inside each handler (`DecideSchema` at ~line 153, `QuestionAnswerSchema` at ~527, `DirectionSelectSchema` at ~595, `FeedbackCreateSchema` at 990, `FeedbackUpdateSchema` at 1074). Uses `.parse()` (throw-on-error) and generic 400 `"Invalid request body"` envelopes.
- **Existing feedback CRUD** at lines 902–1238 is already wired; this unit replaces the inline schemas with haiku-api imports while tightening the error envelope.
- **Review UI (session 2b)** already POSTs individual feedback via `/api/feedback/*`. The new `POST /api/revisit/:sessionId` is the UI's way to invoke `haiku_revisit` without going through MCP — it must compose `RevisitRequest` → orchestrator revisit call → `RevisitResponse`.
- **`haiku_revisit` MCP tool** exists in orchestrator.ts (line 6743) and accepts `{ intent, stage?, reasons?: Array<{title, body}> }`. The HTTP endpoint will share the same semantics.
- **Review session storage** (`sessions.ts`): review sessions carry `intent_slug`, `target`, and `intent_dir` fields — the revisit endpoint maps `sessionId` → `intent_slug` for the orchestrator.

## Git-history signal

- `packages/haiku/src/http.ts` is a high-churn file (1629 lines, frequent touches by feedback CRUD work). Expect to preserve behavior carefully.
- `packages/haiku-api/` is fresh (unit-01, 1 commit). Low risk for schema changes.
- Inline Zod patterns inside handlers have been stable — simple copy-to-import refactor. Test coverage on happy paths is already strong; the risk is `.parse()` → `.safeParse()` migration changing error shapes downstream (tests on `res.status === 400 && data.error === "Invalid request body"` may need adjustment because the new shape is `{ error: 'validation_failed', issues }`).

## Files to Modify

### `packages/haiku-api/src/` (additive — extend, don't break)

1. **`src/schemas/revisit.ts`** (NEW) — `RevisitRequestSchema`, `RevisitResponseSchema`. Request body: `{ stage?: string, reasons?: Array<{title, body}> }`. Response: `{ ok: true, action: string, stage?: string, feedback_created?: string[], message: string }` — mirror what orchestrator's `revisit()` already returns.
2. **`src/schemas/common.ts`** — add route-metadata helpers:
   - `ValidationErrorSchema` (response shape `{ error: 'validation_failed', issues: ZodIssue[] }`)
   - `RouteTransportSchema = z.enum(['loopback'])` — for the transport invariant on routes
   - `ROUTE_BODY_LIMITS`: default 1 MB (1_048_576), `feedback` override 128 KB (131_072), `revisit` default.
3. **`src/routes.ts`** — add a new route entry for `POST /api/revisit/:sessionId` with `RevisitRequestSchema` / `RevisitResponseSchema`; augment the `RouteSpec` type with optional `transport: 'loopback'` (required at type level for v1) and optional `maxBodyBytes?: number` field; annotate each existing route with `transport: 'loopback'`; annotate feedback routes with `maxBodyBytes: 131072`.
4. **`src/index.ts`** — re-export new schemas (`export * from "./schemas/revisit.js"`).
5. **`test/schemas.test.mjs` + `test/routes.test.mjs`** (existing) — extend to cover new schemas and route metadata.

### `packages/haiku/package.json`

6. Add `"haiku-api": "*"` (or `"workspace:*"`) to `dependencies` so the MCP package can resolve the workspace. npm workspaces resolves `*` to local via symlink. Use `*` to mirror the `zod` pattern; adjust if the repo's lockfile regen demands `workspace:*`.

### `packages/haiku/src/http.ts` (main refactor surface)

7. **Top-of-file imports.** Replace `import { z } from "zod"` with named schema imports from `haiku-api`:
   ```
   import {
     ReviewDecisionRequestSchema, ReviewDecisionResponseSchema,
     DirectionSelectRequestSchema, DirectionSelectResponseSchema,
     QuestionAnswerRequestSchema, QuestionAnswerResponseSchema,
     FeedbackCreateRequestSchema, FeedbackUpdateRequestSchema,
     FeedbackListResponseSchema, FeedbackCreateResponseSchema,
     FeedbackUpdateResponseSchema, FeedbackDeleteResponseSchema,
     ReviewCurrentPayloadSchema, SessionPayloadSchema,
     RevisitRequestSchema, RevisitResponseSchema,
     WsClientMessageSchema, WsServerMessageSchema,
     FileServeParamsSchema, QuestionImageParamsSchema,
     routes, ROUTE_BODY_LIMITS,
     type ReviewDecisionRequest, type DirectionSelectRequest, ...etc
   } from "haiku-api"
   import { ZodError, type ZodIssue } from "zod"
   ```
   Delete local inline schema constants (`DecideSchema`, `QuestionAnswerSchema`, `DirectionSelectSchema`, `FeedbackCreateSchema`, `FeedbackUpdateSchema`).

8. **New `parseJsonBody<T>(req, schema, { maxBytes })` helper.** Single source of truth for JSON parsing that:
   - Reads body using an explicit size limit (stream counting; reject > maxBytes → return `{ ok: false, status: 413, error: 'payload_too_large' }`)
   - `JSON.parse` inside try/catch (malformed → 400 with `{ error: 'validation_failed', issues: [{code:'invalid_json'}] }`)
   - `schema.safeParse` (failure → 400 with `{ error: 'validation_failed', issues: err.issues }`)
   - Success → `{ ok: true, data }`.
   
   **Shared error envelope helper** `validationErrorResponse(issues)` returns the typed 400.

9. **Rewrite each JSON handler to use the helper + typed schemas.** Touch sites:
   - `handleSessionApi` — switch to returning a typed `SessionPayload`. The current function builds a loose `Record<string, unknown>`; keep the same output but add a final `SessionPayloadSchema.parse(data)` in non-production (or unconditional) to detect drift. Consider `SessionPayloadSchema.safeParse` + `console.error` + fall-through to minimise risk to happy paths.
   - `handleDecidePost` — use `ReviewDecisionRequestSchema` via `parseJsonBody`.
   - `handleQuestionAnswerPost` — use `QuestionAnswerRequestSchema`.
   - `handleDirectionSelectPost` — use `DirectionSelectRequestSchema`.
   - `handleFeedbackPost`/`handleFeedbackPut` — use `FeedbackCreateRequestSchema`/`FeedbackUpdateRequestSchema`; respond typed `FeedbackCreateResponseSchema`/`FeedbackUpdateResponseSchema`. Keep 128 KB cap via `parseJsonBody(req, schema, { maxBytes: 131072 })` (or derive from `ROUTE_BODY_LIMITS.feedback`).
   - `handleFeedbackGet`/`handleFeedbackDelete` — no request body, but shape the response via `FeedbackListResponseSchema` / `FeedbackDeleteResponseSchema`.
   - `handleReviewCurrent` — return a typed `ReviewCurrentPayload`.

10. **Stream handlers path-refinement.** `handleFileGet`, `handleMockupGet`, `handleWireframeGet`, `handleStageArtifactGet`, `handleQuestionImageGet` currently do path resolution inline. Extract and move the shared "resolve path under allowed root, reject if escapes" logic into a `resolvePathSafe(root, requested): { ok: true, path } | { ok: false }` helper. Validate `{sessionId, path}` via `FileServeParamsSchema` (derive from URL match). `handleQuestionImageGet` validates via `QuestionImageParamsSchema` (index is a number). On escape → 403 `{ error: 'forbidden_path_traversal' }`. Keep raw byte responses unchanged.

11. **Add `handleRevisitPost(sessionId, req)`.**
    - Look up `session` by id; require `session.session_type === "review"` (404 otherwise).
    - `parseJsonBody(req, RevisitRequestSchema)` → 400 on failure.
    - Resolve `intent_slug = session.intent_slug`. Call `orchestrator.revisit({ intent: intent_slug, stage: body.stage, reasons: body.reasons })` — NOT `haiku_run_next`.
    - Shape the response into `RevisitResponseSchema`. On error (no active intent, branch-guard failure), return a 409 with a typed envelope.
    - Add a route pattern match in `handleRequest`: `POST /api/revisit/([^/]+)` → `handleRevisitPost`.

12. **WebSocket hardening.**
    - Introduce `WS_MAX_FRAME_BYTES = 64 * 1024`. In `decodeWebSocketFrame`, after resolving `payloadLen`, if `payloadLen > WS_MAX_FRAME_BYTES` return a sentinel `{ tooLarge: true, consumed }`. Caller sends close code **1009 (Message Too Big)** and destroys the socket.
    - Introduce `WS_RATE_LIMIT_PER_SEC = 20` (env `HAIKU_WS_RATE_LIMIT`). Per-connection token-bucket keyed on the socket. On excess, send close code **1008 (Policy Violation)** and destroy.
    - In `handleWebSocketMessage`, replace ad-hoc `msg.type` dispatch with `WsClientMessageSchema.safeParse(JSON.parse(raw))`. On parse failure, emit `{ type: 'error', error: 'invalid_ws_frame', issues }` via `sendToWebSocket` (matches `WsErrorMessageSchema`). All `sendToWebSocket` calls that currently emit ad-hoc `{ ok: true, ... }` must conform to `WsAckMessageSchema` (set `type: 'ack'`). Pure status broadcasts go through `WsSessionUpdateMessageSchema`.

13. **Transport invariant.** In `startHttpServer` (or `listenOnPort`), once the server is listening, read `server.address()` — verify it's a loopback address (`127.0.0.1` or `::1`). If not (e.g. someone forces `0.0.0.0`), log a fatal error and call `process.exit(1)`. Document that legitimate remote access happens via the existing tunnel (loopback bind + tunnel mux); never via a direct external bind.

14. **Cross-session feedback auth.**
    - `handleFeedbackPut`/`handleFeedbackDelete` must verify that the target feedback file's session context matches the request context. Our feedback files are keyed by `{intent, stage, feedback_id}`, not session — **but** the UI calls these endpoints with an implicit session (via referrer / future header). Implementation:
      - Require an `X-Haiku-Session-Id` header (set by the SPA) on mutating feedback calls.
      - Look up the session; if missing or session intent doesn't match the URL's `intent`, respond 403 `{ error: 'forbidden_cross_session' }`.
    - Review the feature spec (`review-ui-feedback.feature`) to confirm the UI already carries a session context — if not, document and expose `credentials: 'include'` plus an explicit header pass-through in the review-app fetch layer as a follow-up note for unit-08 (review-app refactor).

15. **No-secret logging audit.** Search `console.log`/`console.error` in `http.ts` — the only bulk logger is the HTTP 500 error. Add an allow-list constant for log-permissible fields (currently only error message + path). Add an assertion test (below) that proves we don't leak request/response bodies.

16. **Body size cap (non-feedback).** In `listenOnPort`'s Node-to-Web-Request bridge, count bytes as chunks stream. If total > `ROUTE_BODY_LIMITS.default` (1 MB), stop reading and emit a 413. The per-route 128 KB cap (feedback) is enforced inside the `parseJsonBody` helper before `safeParse`. The handler-level cap is the tighter bound; the server-level cap is the backstop.

### `packages/haiku/test/` (new + extended)

17. **`test/http-feedback.test.mjs`** (existing, extend):
    - Malformed JSON body → 400 with `{ error: 'validation_failed' }` (and `issues` array).
    - Feedback body > 128 KB → 413 before parse.
    - Cross-session PUT/DELETE (different `X-Haiku-Session-Id`) → 403.
    - Existing happy-path assertions updated only where error shape changed.
18. **`test/server-tools.test.mjs`** (existing, extend):
    - Request body > 1 MB (global cap) → 413 from the server-level bridge.
    - Transport invariant: mock/override bind address → expect `process.exit` called with non-zero (use a spawned child subprocess with `HAIKU_FORCE_BIND_ADDR=0.0.0.0` env fixture and assert exit code ≠ 0).
    - `POST /api/revisit/:sessionId` happy path: valid body → 200 with `RevisitResponseSchema`-shape; invalid body → 400 typed envelope.
19. **`test/external-review.test.mjs`** (existing, extend):
    - WebSocket frame > 64 KB → client observes socket close with code 1009.
    - WebSocket > 20 msg/sec → close code 1008.
    - (External review detection tests already live here; size-cap tests fit under the "external connections" theme and the spec puts them here explicitly.)
20. **`test/http-path-traversal.test.mjs`** (NEW, optional — fold into `http-feedback.test.mjs` if room).
    - Fixture set: `..`, URL-encoded `%2E%2E`, `%2F`, absolute paths, symlink escape. Assert 403 for each on every stream route.
21. **`test/haiku-api-contract.test.mjs`** (NEW, small). Imports the route table from `haiku-api` and asserts every route has `transport: 'loopback'`. Cheap invariant test that fails loudly if someone drops the annotation later.

### `packages/haiku/scripts/capture-test-baseline.mjs` (NEW, owned by this unit)

22. Node script invoked by the unit reviewer hat to:
    - Resolve parent commit (`git merge-base HEAD $stage-branch`).
    - `git worktree add <tmp> <parent-sha>` and `npm --prefix <tmp>/packages/haiku test --silent -- --reporter=tap` (TAP output has deterministic test names).
    - Parse test names + pass/fail into JSON: `{ recorded_at, head: '<sha>', count, tests: [{name, file, passed}]}`.
    - Write to `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/test-baseline.json`.
    - A sibling `scripts/diff-test-baseline.mjs` (can live in same file under `--mode=diff`) runs `npm test` on HEAD, diffs names, writes `artifacts/test-deltas.json` listing `{added: [...], removed: [...], regressed: [...]}`. Exit non-zero if any test at baseline with `passed: true` is now failing.
    - Spec intent: this captures a *snapshot of current passing tests* before any code change, so the reviewer has a concrete "nothing regressed" assertion. It runs once at unit start and once at end.

**Owner:** builder runs `capture-test-baseline.mjs --mode=capture` right after `haiku_unit_start`; reviewer runs `--mode=diff` before `advance_hat`.

## Implementation Steps (sequential, each commit-worthy)

1. **Planner (this bolt, no code changes).** Commit only this plan file.
2. **Builder bolt 1 — haiku-api additions.** Add `revisit.ts` schema, `ValidationErrorSchema`, route metadata (transport + maxBodyBytes), re-exports, schema tests. `npx tsc --noEmit -p packages/haiku-api` passes. Commit: `haiku(unit-02/builder): add revisit schema and route metadata to haiku-api`.
3. **Builder bolt 2 — wire `haiku-api` into MCP workspace.** Add dep to `packages/haiku/package.json`. Run `npm install` (or `bun install`) to update lockfile. Smoke: `packages/haiku` imports `haiku-api` cleanly. Commit: `haiku(unit-02/builder): add haiku-api workspace dep to MCP package`.
4. **Builder bolt 3 — `parseJsonBody` + validation envelope.** Introduce the helper; no callers yet. Unit tests for the helper against synthetic requests. Commit: `haiku(unit-02/builder): parseJsonBody helper with size caps and typed 400`.
5. **Builder bolt 4 — JSON handler refactor.** Replace inline schemas with haiku-api imports in `handleDecidePost`, `handleQuestionAnswerPost`, `handleDirectionSelectPost`, `handleFeedbackPost`, `handleFeedbackPut`. Keep all response shapes identical, but error envelopes now `{error:'validation_failed', issues}`. Update any tests asserting the old 400 body text. Commit: `haiku(unit-02/builder): JSON handlers consume haiku-api schemas`.
6. **Builder bolt 5 — stream handlers + `resolvePathSafe`.** Extract helper, wire into each stream handler, add path-traversal fixture tests. Commit: `haiku(unit-02/builder): stream handlers use shared path-refinement helper`.
7. **Builder bolt 6 — `handleRevisitPost`.** Wire the new endpoint, add route-table entry + tests. Commit: `haiku(unit-02/builder): POST /api/revisit/:sessionId bridges review UI to haiku_revisit`.
8. **Builder bolt 7 — WebSocket hardening.** Size cap + rate limit + `WsClientMessageSchema` dispatch. Tests in `external-review.test.mjs`. Commit: `haiku(unit-02/builder): WS frame size cap + rate limit + typed dispatch`.
9. **Builder bolt 8 — transport invariant + server-level body cap.** `process.exit` on non-loopback bind; stream-counting 1 MB body cap in the bridge. Tests in `server-tools.test.mjs`. Commit: `haiku(unit-02/builder): loopback bind assertion + 1 MB body cap`.
10. **Builder bolt 9 — cross-session feedback auth.** Header-based session auth on feedback PUT/DELETE. Tests in `http-feedback.test.mjs`. Commit: `haiku(unit-02/builder): cross-session feedback mutation guard`.
11. **Builder bolt 10 — baseline script + logger audit.** Add `capture-test-baseline.mjs`; run it and commit the baseline JSON. Audit `http.ts` logger calls; add the allow-list + no-secret-logging assertion test. Commit: `haiku(unit-02/builder): test baseline capture + no-secret logger audit`.
12. **Verification pass (builder tail).** `npx tsc --noEmit` at repo root (or `npm run typecheck` in `packages/haiku` and `packages/haiku-api`). `npm test` in `packages/haiku`. Resolve any cascading test breakage (especially around the error envelope shape change). Commit: `haiku(unit-02/builder): typecheck and test pass`.
13. **Reviewer hat.** Run `capture-test-baseline.mjs --mode=diff`; assert no regressions. Re-check all spec scenarios pass. Mark artifacts outputs in unit frontmatter.

## Test-Coverage Mapping (Scope → .feature → new tests)

| Completion criterion | Feature file | New/extended test |
|---|---|---|
| Malformed JSON body → 400 envelope | feedback-crud.feature (L176–192) | http-feedback.test.mjs |
| Body > 1 MB → 413 | (security invariant — no feature) | server-tools.test.mjs |
| Feedback body > 128 KB → 413 | feedback-crud.feature | http-feedback.test.mjs |
| WS frame > 64 KB → 1009 | (security invariant) | external-review.test.mjs |
| WS > 20 msg/s → 1008 | (security invariant) | external-review.test.mjs |
| Path traversal → 403 | (security invariant; partially covered already) | http-feedback.test.mjs or new http-path-traversal.test.mjs |
| Cross-session PUT/DELETE → 403 | (security invariant) | http-feedback.test.mjs |
| Non-loopback bind → exit non-zero | (security invariant) | server-tools.test.mjs |
| New revisit endpoint | revisit-with-reasons.feature | server-tools.test.mjs + http-feedback.test.mjs |
| Typed 400 envelope | feedback-crud.feature happy + sad paths | http-feedback.test.mjs |
| haiku-api schemas in all handlers | (structural — typecheck) | haiku-api-contract.test.mjs + `npx tsc --noEmit` |

The builder MUST implement a step for each `.feature` scenario from the product stage to be exercised either as a new test case or as an augmentation to an existing one. Feature files driving this unit: `feedback-crud.feature`, `review-ui-feedback.feature`, `external-review-feedback.feature`, `revisit-with-reasons.feature`, `additive-elaborate.feature` (where feedback/revisit endpoints feed into the UI flow). No BDD runner is wired up — scenarios become asserts in `.test.mjs` files. Each scenario table becomes one `await test(...)` with an `assert.deepStrictEqual` on the response shape.

## Risks & Mitigations

1. **Error envelope shape change breaks existing tests.** `http-feedback.test.mjs` currently asserts `data.error.includes("Invalid request body")`. After refactor, `data.error === 'validation_failed'` and the message detail is in `data.issues[]`. **Mitigation:** update those asserts in the same bolt that changes the handler; do not split.
2. **Workspace dep resolution.** `"haiku-api": "*"` with npm workspaces resolves to a symlink at install time. Bun workspaces (`bun run build`) may require `"workspace:*"`. **Mitigation:** start with `"*"`; if `bun install` fails, switch to `"workspace:*"`. Verify with `node -e "require('haiku-api')"` after install.
3. **`haiku-api` dist not built.** The MCP package imports from the `haiku-api` package export (`"./dist/index.js"`). If `dist/` isn't built, resolution fails. **Mitigation:** (a) add a conditional `exports` entry pointing to `src/index.ts` for dev/tsx consumption, or (b) make the MCP build script run `haiku-api` build first, or (c) add `"types": "./src/index.ts"` + a conditional `"types-source"` export. Simplest fix: add `"./src/index.ts"` as the `types` for dev and keep `dist` for prod. Verify with the existing `tsx` test runner (tests import `http.ts` via `npx tsx`, which supports TS-to-TS imports if the path resolves).
4. **Transport invariant exit in tests.** Tests themselves start the server. If the `process.exit` short-circuits a test process, the runner reports a spurious fail. **Mitigation:** gate the exit behind an env flag that defaults to on in production (`HAIKU_TRANSPORT_ASSERT=1`) and off only when the test framework explicitly opts out. Better: have tests bind on loopback (they already do) so the assertion passes naturally; the non-loopback test uses a child subprocess (spawn node) so it can exit in isolation.
5. **Cross-session auth regression on existing UI.** If the SPA doesn't already send `X-Haiku-Session-Id`, adding the header check breaks mutating feedback flows. **Mitigation:** check `review-app/src/` for the fetch layer; it currently posts to `/api/feedback/...` without a session header. Either (a) make the header optional with a warning log for v1 (defer strict enforcement to a follow-up unit), or (b) plumb the header through the SPA in the same bolt. Given the unit spec says "enforced as tests" and the Out-of-Scope line is "Review-app refactor (unit-03+)", route (a) is the safer play — add the header check, require it in tests, mark as logging-warn in production until unit-08 plumbs it through. Document the gap in the commit message and in `artifacts/unit-02-cross-session-auth.md`.
6. **`handleReviewCurrent` response shape drift.** The current implementation builds a loose JSON object; `ReviewCurrentPayloadSchema` is strict. Fields currently optional but missing from the schema (e.g. a typo) cause `.parse()` failures. **Mitigation:** `safeParse` + log a warning + return the object anyway for v1. Type-only enforcement via `ReviewCurrentPayload satisfies ...` at the return line.
7. **WebSocket frame rate limit false positives during burst-y legitimate traffic.** 20 msg/sec is the spec; a rapid pointer-drag annotation stream could exceed this. **Mitigation:** config via env (`HAIKU_WS_RATE_LIMIT`); tests use the default; leave a note that tuning may be needed.
8. **Plan-wide risk: the refactor is large but low-value for happy paths.** The unit's value is the *security contract*. The refactor is the vehicle. If any bolt blows up on the refactor (e.g. type inference mismatches between inline and imported schemas), degrade gracefully: keep the refactor scoped to one handler family at a time (JSON, stream, WS) and ensure each family lands green before moving on.

## Out of Scope (explicit, from unit spec)

- Changing happy-path behavior of existing endpoints.
- Review-app refactor (unit-03+).
- Rewriting the WebSocket frame parser beyond the size cap + rate limit (the existing parser is fine).
- Authentication (session-based is the only layer). The transport invariant is the closest we get — loopback-only is the auth boundary for v1.

## Verification Commands

- `npx tsc --noEmit` (repo root — or `npm --workspace packages/haiku run typecheck` + `npm --workspace packages/haiku-api run typecheck`)
- `npm --workspace packages/haiku test` (runs all `.test.mjs` via `test/run-all.mjs`)
- `npm --workspace packages/haiku-api test` (routes + schemas + openapi tests)
- `node packages/haiku/scripts/capture-test-baseline.mjs --mode=diff` (regression check)
- Ad-hoc: `node -e "require('haiku-api').routes.forEach(r => r.transport || (console.error('bad', r.operationId), process.exit(1)))"` — proves every route declares transport. This is the test-21 invariant.

## Quality Gates (unit frontmatter)

- `typecheck` — `npx tsc --noEmit` passes in both packages.
- `test` — `npm test` exits 0 in `packages/haiku` with zero regressions vs. baseline.

## Outputs for unit frontmatter

The `outputs:` field auto-detects from tracked writes, but declare explicitly for clarity:

- `packages/haiku-api/src/schemas/revisit.ts`
- `packages/haiku-api/src/schemas/common.ts` (edit)
- `packages/haiku-api/src/routes.ts` (edit)
- `packages/haiku-api/src/index.ts` (edit)
- `packages/haiku/package.json` (edit — workspace dep)
- `packages/haiku/src/http.ts` (refactor)
- `packages/haiku/test/http-feedback.test.mjs` (extend)
- `packages/haiku/test/server-tools.test.mjs` (extend)
- `packages/haiku/test/external-review.test.mjs` (extend)
- `packages/haiku/test/haiku-api-contract.test.mjs` (NEW)
- `packages/haiku/scripts/capture-test-baseline.mjs` (NEW)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/test-baseline.json` (NEW — generated)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/test-deltas.json` (NEW — generated)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-02-tactical-plan.md` (this file)

## Handoff note to builder

- Start with bolt-2 order (haiku-api changes first — cheap typecheck loop). Everything else depends on workspace resolution working.
- `parseJsonBody` is the single most-reused new helper — get it right before fanning out to handlers.
- The error-envelope migration will ripple through existing tests. Fix tests in the same commit as the handler change — do not defer.
- The "transport invariant" and "no-secret logging" are one-line adds each but carry high strategic weight. Do NOT skip them.
- When in doubt on WS frame handling, compare with the existing frame-buffer overflow guard in `http.ts` line 869 (`frameBuffer.length > 1024 * 1024`) — that's the current ad-hoc cap. The new cap (64 KB per frame) is tighter and matches the spec.
