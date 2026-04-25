# haiku-api

Wire contract shared by the H·AI·K·U MCP backend (`packages/haiku`) and the
agent-collab UI (`packages/haiku/review-app`). Zod is the source of truth;
TypeScript types are inferred via `z.infer<>`; OpenAPI 3.1 is emitted at build
time for external consumers (GitHub / GitLab integrations, SDK generators, and
anything else that wants a published spec instead of hand-written fetch code).

## Package purpose

Before this package existed, three parallel copies of the review contract
lived in the tree:

- hand-written inline Zod schemas inside `packages/haiku/src/http.ts`
- hand-written TS interfaces in `packages/haiku/review-app/src/types.ts`
- hand-written JSON response shapes at each `Response.json({...})` call site

`haiku-api` lifts all three into one schema set. The MCP backend, the SPA, and
any external tool read from the same definitions. If the contract drifts, the
schema file is the place to look — not grep across three directories.

Unit scope: this package is source-only. Neither the MCP backend nor the
review-app consumes it yet — that happens in unit-02 (MCP) and unit-03+ (UI).

## Schema organization

`src/schemas/` holds one file per route group:

| File | Schemas |
|---|---|
| `common.ts` | Shared primitives: `FeedbackOriginSchema`, `FeedbackStatusSchema`, `PinSchema`, `InlineCommentSchema`, `ReviewAnnotationsSchema`, `QuestionAnnotationsSchema`, `SessionTypeSchema`, `SessionStatusSchema` |
| `review.ts` | `POST /review/:id/decide` — `ReviewDecisionRequestSchema`, `ReviewDecisionResponseSchema` |
| `direction.ts` | `POST /direction/:id/select` — `DirectionSelectRequestSchema`, `DirectionSelectResponseSchema` |
| `question.ts` | `POST /question/:id/answer` — `QuestionAnswerRequestSchema`, `QuestionAnswerResponseSchema` |
| `feedback.ts` | `/api/feedback/:intent/:stage[/:id]` — `FeedbackItemSchema`, `FeedbackListResponseSchema`, `FeedbackCreateRequestSchema`/`Response`, `FeedbackUpdateRequestSchema`/`Response`, `FeedbackDeleteResponseSchema` |
| `files.ts` | Path parameter shapes for `/files/:id/:path`, `/mockups/...`, `/wireframe/...`, `/stage-artifacts/...`, `/question-image/:id/:index` |
| `session.ts` | `GET /api/session/:id` discriminated-union payload; `GET /api/review/current` payload; heartbeat envelope |
| `websocket.ts` | `/ws/session/:id` client (`decide`/`answer`/`select`) and server (`ack`/`error`/`session-update`) envelopes |

`src/routes.ts` is the canonical route table — every HTTP route and the
WebSocket upgrade path, each with an operationId, request/response schema
refs, and a summary. `paths.session(id)` etc. give you path builders so
consumers don't hand-format templates.

`src/openapi.ts` walks the route table and emits OpenAPI 3.1.

## Scripts

```bash
# Typecheck only
npm run typecheck -w haiku-api

# Build dist/ + emit dist/openapi.json
npm run build -w haiku-api

# Run schema round-trip + routes-coverage + OpenAPI tests
npm run test -w haiku-api
```

## Regenerating the OpenAPI document

`npm run build -w haiku-api` chains `tsc` and then
`node scripts/emit-openapi.mjs`, which writes `dist/openapi.json`. Commit
the built file alongside generated-artifact changes if your downstream tooling
(SDK generators, contract tests) expects it in VCS; otherwise the file is
produced on CI.

## External consumer usage

Until unit-02+ re-exports from this package, external consumers should read
`dist/openapi.json` directly:

```bash
npm run build -w haiku-api
cp packages/haiku-api/dist/openapi.json path/to/your/spec-dir/
```

Any OpenAPI-aware client generator (openapi-generator-cli, orval, kubb, etc.)
can consume the file. Once the MCP and SPA are wired up, external Node
projects can `import { routes, FeedbackItemSchema } from "haiku-api"` from the
workspace to stay in type-sync.

## Schema / feature traceability

The product stage ships `.feature` files under
`.haiku/intents/universal-feedback-model-and-review-recovery/features/` that
exercise the backend behavior. Every schema in this package includes a
"Traversed by" comment at the top of its `schemas/*.ts` file and in
`test/schemas.test.mjs`, linking the schema to the `.feature` file(s) that
cross it on the wire. Example: `FeedbackCreateRequestSchema` is traversed by
`feedback-crud.feature`, `review-ui-feedback.feature`, and
`external-review-feedback.feature`.

If the repo adopts a Cucumber-compatible runner in a later unit, the
step definitions hang off the same Zod schemas exported from this package.
No duplicate contract maintenance.
