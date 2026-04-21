---
title: 'unit-02: stream-handler path-traversal 403 behavior has no test coverage'
status: fixing
origin: adversarial-review
author: reviewer
author_type: agent
created_at: '2026-04-21T04:39:22Z'
iteration: 0
visit: 0
source_ref: unit-02-mcp-consume-haiku-api/reviewer/bolt-2
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding (confidence: high)

The unit spec's completion criterion states:

> Stream handlers call `files.ts` path-refinement before filesystem access; path-traversal fixture set returns 403 (not 200, not 400).

The implementation in `packages/haiku/src/http.ts` ships the 403-on-escape behavior via `serveUnderRoot()` (wrapping `resolvePathSafe()`), but **no test in this unit exercises the stream endpoints with a traversal payload**. I grepped the entire test tree and found zero hits for `/mockups/`, `/wireframe/`, `/stage-artifacts/`, `/files/` across `packages/haiku/test/*.mjs`. The only 403 assertions in the tests are the cross-session feedback-auth tests (`X-Haiku-Session-Id` mismatch).

This violates the reviewer hat's hard rule: "**MUST NOT** approve code that lacks tests for new functionality." The stream-handler refactor + `resolvePathSafe` + 403 envelope is new functionality and has no proof of work.

## Evidence

- `packages/haiku/src/http.ts:475-487` — `serveUnderRoot` returns `{ error: 'forbidden_path_traversal' }` with status 403 on escape.
- `packages/haiku/src/http.ts:489-520` — `handleMockupGet`, `handleWireframeGet`, `handleStageArtifactGet` all call `serveUnderRoot`.
- `packages/haiku/src/http.ts:429-467` — `handleFileGet` returns **404** (not 403) on traversal, with a code comment claiming "historical contract." The unit spec criterion explicitly says "returns 403 (not 200, not 400)." 404 is neither the criterion's required value nor clearly out of scope.
- Tactical plan at `.haiku/intents/.../stages/development/artifacts/unit-02-tactical-plan.md:141` called for "Builder bolt 5 — stream handlers + `resolvePathSafe`. ... add path-traversal fixture tests." The helper landed; the fixture tests did not.
- `grep -rn "mockups\|wireframe\|/files/\|stage-artifact\|serveUnderRoot" packages/haiku/test/*.mjs` returns empty.

## What to add

Add a test block (in `http-feedback.test.mjs` or a new `http-path-traversal.test.mjs`) that, against a live `startHttpServer()`:

1. GET `/mockups/:sid/../../etc/passwd` (and percent-encoded variants `%2E%2E%2F`, `..%2F`) → asserts 403 + `{ error: 'forbidden_path_traversal' }`.
2. Same for `/wireframe/:sid/...` and `/stage-artifacts/:sid/...`.
3. Either (a) add a `/files/:sid/...` traversal test that asserts the actual behavior (currently 404 per code comment) and document the intentional divergence from the unit spec, OR (b) change `handleFileGet` to return 403 on traversal to match the criterion literally. Pick one — the current state where the code comment disagrees with the unit spec and no test exists is not acceptable.
4. A happy-path test for each stream handler to prove the 403 path is not always hit (i.e. legitimate paths under root still 200).

## Secondary: `FileServeParamsSchema` not wired

The unit spec says stream handlers should "validate path params against the `files.ts` schemas' path refinements." `haiku-api`'s `FileServeParamsSchema` + `QuestionImageParamsSchema` exist but `http.ts` does not import them. Path safety is enforced via `resolvePathSafe` + `isValidSlug` instead.

Resolution options: (a) wire `FileServeParamsSchema.safeParse({sessionId, path})` into the stream-handler dispatch and return the uniform 400 envelope on failure, keeping 403 for traversal; or (b) update the unit spec wording if the helper-based approach is preferred. Less critical than (1) above but worth closing the loop.
