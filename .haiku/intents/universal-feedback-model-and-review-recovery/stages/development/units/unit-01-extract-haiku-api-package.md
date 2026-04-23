---
title: Extract haiku-api package (Zod schemas + OpenAPI emission)
type: implementation
depends_on: []
quality_gates:
  - typecheck
  - test
  - build
inputs:
  - intent.md
  - knowledge/DESIGN-DECISIONS.md
  - knowledge/ARCHITECTURE.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T03:24:59Z'
hat_started_at: '2026-04-21T03:43:50Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T03:24:59Z'
    completed_at: '2026-04-21T03:29:17Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T03:29:17Z'
    completed_at: '2026-04-21T03:43:50Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T03:43:50Z'
    completed_at: '2026-04-21T03:46:45Z'
    result: advance
outputs:
  - package-lock.json
  - package.json
  - packages/haiku-api/README.md
  - packages/haiku-api/package.json
  - packages/haiku-api/scripts/emit-openapi.mjs
  - packages/haiku-api/src/index.ts
  - packages/haiku-api/src/openapi.ts
  - packages/haiku-api/src/routes.ts
  - packages/haiku-api/src/schemas/common.ts
  - packages/haiku-api/src/schemas/direction.ts
  - packages/haiku-api/src/schemas/feedback.ts
  - packages/haiku-api/src/schemas/files.ts
  - packages/haiku-api/src/schemas/question.ts
  - packages/haiku-api/src/schemas/review.ts
  - packages/haiku-api/src/schemas/session.ts
  - packages/haiku-api/src/schemas/websocket.ts
  - packages/haiku-api/src/version.ts
  - packages/haiku-api/test/helpers.mjs
  - packages/haiku-api/test/openapi.test.mjs
  - packages/haiku-api/test/routes.test.mjs
  - packages/haiku-api/test/run-all.mjs
  - packages/haiku-api/test/schemas.test.mjs
  - packages/haiku-api/tsconfig.json
completed_at: '2026-04-21T03:46:45Z'
model: sonnet
---
# Extract haiku-api package

## Prior work context (scope boundary)

This bolt of stage `development` delivers the **UI-facing package extraction + review-app refinement** work called for by the design revisit. The backend universal-feedback-model work described in `intent.md` (the `haiku_feedback` MCP tool, CRUD companions, additive elaborate, `haiku_revisit` reasons, enforce-iteration fix, external-poll extension) **already shipped in prior bolts** of this intent and is present in `packages/haiku/src/*` today. This bolt does NOT re-implement that work; it factors the HTTP contract into its own package, tightens validation, and packages the UI shell cleanly.

## Scope

Create a new `packages/haiku-api/` workspace package that owns the HTTP + WebSocket contract shared by the MCP backend and the agent-collab UI. Zod is the source of truth; OpenAPI is emitted at build time for external consumers and eventual extraction.

**New package: `packages/haiku-api/`**

- `package.json` — private workspace package, name `haiku-api` (unscoped).
- `tsconfig.json` — extends repo base, emits `.d.ts`.
- `src/index.ts` — barrel export for every schema, route constant, WebSocket envelope.
- `src/schemas/`:
  - `session.ts` — `SessionPayload`, `ReviewSession`, `QuestionSession`, `DirectionSession`, `ReviewCurrentPayload`, `HeartbeatResponse`.
  - `review.ts` — `ReviewDecisionRequest`, `ReviewDecisionResponse`.
  - `direction.ts` — `DirectionSelectRequest`, `DirectionSelectResponse`.
  - `question.ts` — `QuestionAnswerRequest`, `QuestionAnswerResponse`.
  - `feedback.ts` — `FeedbackItem`, `FeedbackListResponse`, `FeedbackCreateRequest` (includes optional `anchor: { pageId, x, y, viewportWidth, viewportHeight }` for pin-anchored annotations), `FeedbackUpdateRequest`, `FeedbackDeleteResponse`. Every string field has an explicit `.max()` cap (title ≤ 200, body ≤ 10_000, author ≤ 200, etc.).
  - `revisit.ts` — `RevisitReasonItem` (title ≤ 200, body ≤ 10_000), `RevisitRequest` (reasons array `.max(50)`), `RevisitResponse`.
  - `files.ts` — `FileServeRequest` (path + sessionId params only). **Path Zod refinement** rejects `..` segments, absolute paths, null bytes, and URL-encoded variants (`%2e%2e`, `%2f`, `%00`). Response is raw stream, NOT covered by round-trip tests.
  - `websocket.ts` — `WsClientMessage` (decision | direction-select | answer) + `WsServerMessage` (session-update | ack | error). Every string field `.max()` capped; total serialized frame size ≤ 64 KB enforced by a top-level schema constraint.
  - `auth.ts` — explicit `TransportInvariant: 'loopback'` marker schema for the current MCP security model, plus a `SessionToken` schema skeleton for future non-loopback deployments. Every route entry in `routes.ts` declares `transport: 'loopback' | 'token'`; tightening to `'token'` later is a schema edit, not a code archaeology project.
- `src/routes.ts` — typed route table. Per-route: `{ method, path, request, response, transport }`. Path helpers: `routes.session(id)`, `routes.revisit(id)`, etc.
- `src/openapi.ts` — combines schemas + routes into an OpenAPI 3.1 document.
- `scripts/emit-openapi.mjs` — runs at build time, writes `dist/openapi.json`. **Post-emit secret-leak scan**: fails the build if the output matches `/password|secret|token|api[_-]?key|bearer/i` anywhere. Schema `example` fields are opt-in per schema; default is no examples emitted.
- `scripts/audit-openapi-parity.mjs` — boots the MCP on an ephemeral port, walks `dist/openapi.json` paths, probes each `(path, method)` with a schema-valid synthetic request, asserts the response status matches the operation's `responses` allow-list. Bounded probe set (one per path-method), 30s wall-clock budget. Used by unit-15.
- `README.md` — purpose, schema organization, how to regenerate OpenAPI, how external consumers use the spec.

**Source migration:**
- Hand-authored types in `packages/haiku/review-app/src/types.ts` become Zod schemas under `haiku-api/src/schemas/`; TS types are re-exported via `z.infer`.
- Session/review/direction/question payload shapes currently inline in `packages/haiku/src/http.ts` become Zod schemas in `haiku-api/src/schemas/`.

**Root `package.json`:**
- Add `packages/haiku-api` to workspaces.
- `openapi.json` is committed to `packages/haiku-api/` at repo root (not under `dist/`) so PR diffs on the spec are visible. `scripts/emit-openapi.mjs` writes both locations; a drift check in CI fails if committed vs fresh-build differ.

## Out of scope

- MCP refactor to consume the package (unit-02).
- Review-app / UI refactor (unit-03+).

## Completion Criteria

- `packages/haiku-api/` exists with the structure above.
- Every HTTP route served by `packages/haiku/src/http.ts` today has a matching Zod schema (request + response) in `haiku-api/src/schemas/`, including the asset/stream routes (`files`, `mockups`, `wireframe`, `stage-artifacts`, `question-image`) — each typed as `{ params: Zod, response: 'raw-stream' }` with path refinements.
- Every WebSocket message handled by `handleWebSocketMessage` has a matching envelope in `websocket.ts`.
- `FeedbackCreateRequest` accepts an optional `anchor` block for pin-anchored annotations; type test confirms the shape compiles.
- `FileServeRequest.path` rejects the adversarial fixture set `['../', '%2e%2e%2f', '/etc/passwd', 'foo\\x00.png', '\\..\\', '.', '', 'a\\0b']` — each asserted via a round-trip test that expects `safeParse` to fail.
- `npm run build -w haiku-api` emits `packages/haiku-api/openapi.json` with paths, components, and operationIds matching the HTTP surface. Secret-leak scan runs and passes.
- `npm run test -w haiku-api` runs a schema round-trip test (parse valid + reject invalid) for every JSON schema. Stream schemas test path-param validation only.
- `npx tsc --noEmit` passes repo-wide.
- Biome lints cleanly on the new package.
