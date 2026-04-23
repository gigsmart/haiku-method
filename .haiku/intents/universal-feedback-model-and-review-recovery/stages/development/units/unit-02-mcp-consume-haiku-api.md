---
title: 'MCP consumes haiku-api (validation, authz, size caps)'
type: implementation
depends_on:
  - unit-01-extract-haiku-api-package
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/ARCHITECTURE.md
status: completed
bolt: 4
hat: reviewer
started_at: '2026-04-21T03:55:47Z'
hat_started_at: '2026-04-21T04:56:00Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T03:55:47Z'
    completed_at: '2026-04-21T04:02:12Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T04:02:12Z'
    completed_at: '2026-04-21T04:26:33Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T04:26:33Z'
    completed_at: '2026-04-21T04:31:35Z'
    result: reject
    reason: >-
      Missing test coverage for a declared completion criterion: "Path traversal
      on file-serve routes → 403." Implementation is correct (serveUnderRoot
      returns 403 via resolvePathSafe) but no test exercises it against
      /mockups/:id/, /wireframe/:id/, or /stage-artifacts/:id/. The existing
      path-traversal tests in http-feedback.test.mjs only cover the feedback
      slug validator (400). Add a small fixture set (e.g. "../etc/passwd",
      "%2E%2E%2Fetc", encoded/symlink cases) against
      mockup/wireframe/stage-artifact endpoints asserting 403 +
      {error:'forbidden_path_traversal'}. Also consider whether handleFileGet
      should return 403 or 404 on escape — the implementation currently returns
      404 with a "backwards-compatible contract" comment, but the unit spec
      explicitly lists handleFileGet as one of the stream handlers that must
      return 403. Either align the behavior (preferred) or document the 404
      carve-out in the unit spec. All other completion criteria pass: typecheck
      clean in both packages, 505+108 tests pass, test-baseline diff shows 0
      regressions, security invariants (1 MB/128 KB caps, WS 1008/1009,
      transport invariant, cross-session guard) all tested.
  - hat: builder
    started_at: '2026-04-21T04:31:35Z'
    completed_at: '2026-04-21T04:34:27Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T04:34:27Z'
    completed_at: '2026-04-21T04:39:29Z'
    result: reject
    reason: >-
      Completion criterion "Stream handlers ... path-traversal fixture set
      returns 403 (not 200, not 400)" has no test coverage. The 403 branch in
      serveUnderRoot / resolvePathSafe is reachable by code but no test in
      packages/haiku/test/*.mjs exercises the /mockups, /wireframe,
      /stage-artifacts, or /files stream endpoints with a traversal payload.
      handleFileGet also returns 404 (not 403) on traversal, disagreeing with
      the unit spec. See FB-01 for required test fixtures and the
      FileServeParamsSchema wiring follow-up.
  - hat: builder
    started_at: '2026-04-21T04:39:29Z'
    completed_at: '2026-04-21T04:42:41Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T04:42:41Z'
    completed_at: '2026-04-21T04:48:43Z'
    result: reject
    reason: >-
      Missing path-traversal 403 tests on stream handlers (explicit completion
      criterion: handleFileGet/Mockup/Wireframe/StageArtifact); one local type
      literal (DecodeResult) remains in http.ts; FileServeParamsSchema in
      haiku-api not wired into stream handlers. See
      artifacts/unit-02-review-findings.md for evidence + required fixes.
  - hat: builder
    started_at: '2026-04-21T04:48:43Z'
    completed_at: '2026-04-21T04:56:00Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T04:56:00Z'
    completed_at: '2026-04-21T04:59:02Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-02-tactical-plan.md
  - stages/development/artifacts/test-baseline.json
  - stages/development/artifacts/test-deltas.json
  - package-lock.json
  - packages/haiku-api/src/index.ts
  - packages/haiku-api/src/routes.ts
  - packages/haiku-api/src/schemas/common.ts
  - packages/haiku-api/src/schemas/revisit.ts
  - packages/haiku-api/test/routes.test.mjs
  - packages/haiku-api/test/schemas.test.mjs
  - packages/haiku/package.json
  - packages/haiku/scripts/capture-test-baseline.mjs
  - packages/haiku/src/http.ts
  - packages/haiku/test/external-review.test.mjs
  - packages/haiku/test/http-feedback.test.mjs
  - packages/haiku/test/server-tools.test.mjs
  - stages/development/artifacts/unit-02-review-findings.md
  - packages/haiku/test/http-streams.test.mjs
completed_at: '2026-04-21T04:59:02Z'
model: sonnet
---
# MCP consumes haiku-api

Refactor `packages/haiku/src/http.ts` to use `haiku-api` for validation + shared types. **User-visible behavior unchanged for happy paths**; new rejection paths added for malformed / oversized / unauthorized requests.

## Scope

- Add `haiku-api` as a workspace dep in `packages/haiku/package.json`.
- Import schemas from `haiku-api` at every JSON route handler in `http.ts`:
  - `handleSessionApi` returns `SessionPayload`
  - `handleReviewGet`, `handleDecidePost` validate against review schemas
  - `handleDirectionGet`, `handleDirectionSelectPost` validate against direction schemas
  - `handleQuestionGet`, `handleQuestionAnswerPost` validate against question schemas
  - `handleFeedbackGet/Post/Put/Delete` validate against feedback schemas
  - `handleReviewCurrent` returns `ReviewCurrentPayload`
  - New `handleRevisitPost` (route: `POST /api/revisit/:sessionId`, body: `RevisitRequest`, response: `RevisitResponse`) feeds into the existing revisit MCP plumbing.
- Stream handlers (`handleFileGet`, `handleMockupGet`, `handleWireframeGet`, `handleStageArtifactGet`, `handleQuestionImageGet`) validate path params against the `files.ts` schemas' path refinements. Responses remain raw streams.
- Replace ad-hoc request-body parsing with `schema.safeParse(...)` + uniform 400 on parse failure with body `{ error: 'validation_failed', issues: ZodIssue[] }`.
- WebSocket `handleWebSocketMessage` parses incoming frames via `WsClientMessage.safeParse`, emits `WsServerMessage`.
- Delete all type literals local to `http.ts`; types flow from `haiku-api`.

**Security hardening (declared as contract, enforced as tests):**
- **Transport invariant.** Every route in `haiku-api/routes.ts` declares `transport: 'loopback'`. `http.ts` asserts the bound socket's address is a loopback address at server start — process exits non-zero if bound to a non-loopback interface.
- **Request-body size caps.** Default 1 MB; per-route override via schema metadata (e.g. feedback bodies capped at 128 KB via `haiku-api` schema). Bodies over the cap are rejected 413 before schema parsing.
- **WebSocket frame caps.** Inbound frames over 64 KB closed with code 1009. Per-connection rate limit: 20 messages/second (configurable via env); excess frames closed with code 1008.
- **Path traversal.** `handleFileGet` + siblings resolve the requested path under a session-scoped artifact root and reject with 403 if `path.resolve(root, requested)` escapes root.
- **Cross-session feedback auth.** `handleFeedbackPut` / `handleFeedbackDelete` verify the target feedback item's owning session matches the request session context; mismatch returns 403.
- **No secret logging.** Verify logger calls in `http.ts` don't log request bodies or response bodies by default; any logged field must be in an explicit allow-list.

## Out of scope

- Changing behavior of existing happy-path endpoints.
- Review-app refactor (unit-03+).

## Completion Criteria

- Every JSON handler in `http.ts` imports its request/response schema from `haiku-api`; grep for TypeScript type definitions in `http.ts` returns zero (types come from the schema package).
- Every handler uses `safeParse` and returns 400 with `{error:'validation_failed', issues}` on parse failure.
- Stream handlers call `files.ts` path-refinement before filesystem access; path-traversal fixture set returns 403 (not 200, not 400).
- New revisit endpoint handles `POST /api/revisit/:sessionId` per schema.
- New tests at `packages/haiku/test/http-feedback.test.mjs`, `server-tools.test.mjs`, `external-review.test.mjs`:
  - Malformed JSON body → 400 with typed error envelope.
  - Body > 1 MB → 413.
  - Feedback body > 128 KB → 413.
  - WebSocket frame > 64 KB → socket closes with 1009.
  - WebSocket > 20 msg/sec → socket closes with 1008.
  - Path traversal on file-serve routes → 403.
  - Cross-session PUT/DELETE on feedback → 403.
  - Server bound to non-loopback → process exits non-zero at start.
- **Test baseline.** `scripts/capture-test-baseline.mjs` (new, owned by this unit) runs `npm test --silent` on the parent commit before any code changes, records pass count + test names in `stages/development/artifacts/test-baseline.json`. At unit completion: every test name present at baseline with `passed: true` is still `passed: true` on HEAD; new tests added by this unit are enumerated in `artifacts/test-deltas.json`.
- `npx tsc --noEmit` passes.
