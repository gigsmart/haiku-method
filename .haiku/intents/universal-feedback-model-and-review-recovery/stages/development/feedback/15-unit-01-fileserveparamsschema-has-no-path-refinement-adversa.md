---
title: >-
  unit-01: FileServeParamsSchema has no path-refinement — adversarial fixture
  set would pass safeParse
status: fixing
origin: adversarial-review
author: correctness
author_type: agent
created_at: '2026-04-21T20:22:19Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

Unit-01 completion criterion (unit-01-extract-haiku-api-package.md:109) is explicit:

> `FileServeRequest.path` rejects the adversarial fixture set `['../', '%2e%2e%2f', '/etc/passwd', 'foo\\x00.png', '\\..\\', '.', '', 'a\\0b']` — each asserted via a round-trip test that expects `safeParse` to fail.

And unit-01 spec (line 81) says:

> `files.ts` — `FileServeRequest` (path + sessionId params only). **Path Zod refinement** rejects `..` segments, absolute paths, null bytes, and URL-encoded variants (`%2e%2e`, `%2f`, `%00`).

Implementation at `packages/haiku-api/src/schemas/files.ts:15-27` is:

```ts
export const FileServeParamsSchema = z.object({
  sessionId: z.string().min(1)...,
  path: z.string().min(1)...,
})
```

No `.refine()` and no regex. Every adversarial fixture above passes `safeParse` — only `''` is rejected (by `.min(1)`). The 403 behavior today rides on `resolvePathSafe` in http.ts, which checks post-URL-decoding with `path.resolve`, but:

1. `'foo\\x00.png'` (literal null byte) — `path.resolve` does NOT reject null bytes; Node's `fs.realpath` throws `ERR_INVALID_ARG_VALUE` or returns truncated data depending on platform. The 403/forbidden_path_traversal path may not fire consistently.
2. `'.'` — legitimate "serve the directory" request; resolvePathSafe allows it; no refinement layer caught the degenerate case the spec explicitly listed.
3. The wire schema is advertised to external OpenAPI consumers as "validated path" with no refinement — downstream generators will not know path has invariants.

This is a hard completion-criterion failure: the schema-level path refinement that was explicitly required as a deliverable is missing. The inline http.ts check does defense-in-depth but does not satisfy the declared contract — consumers of the schema package (which is the whole point of extracting it) get no protection.

**Required fix:**
- Add `.refine()` to `FileServeParamsSchema.path` rejecting: `..` segments (split on `/` or `\\`), leading `/`, `\\0` / `\\u0000`, URL-encoded `%2e`, `%2f`, `%5c`, `%00` (case-insensitive).
- Add round-trip tests asserting `safeParse` fails for every fixture string in the spec list.
- Wire `FileServeParamsSchema.safeParse({ sessionId, path })` into `handleFileGet` / `handleMockupGet` / `handleWireframeGet` / `handleStageArtifactGet` in http.ts so the schema check runs before `resolvePathSafe`.
