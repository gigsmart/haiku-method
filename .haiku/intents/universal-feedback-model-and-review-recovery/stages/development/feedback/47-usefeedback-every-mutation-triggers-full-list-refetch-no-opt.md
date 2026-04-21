---
title: 'useFeedback: every mutation triggers full-list refetch, no optimistic updates'
status: fixing
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:24:09Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

`packages/haiku-ui/src/hooks/useFeedback.ts` performs a **full list refetch** after every create / update / delete — regardless of the size of the returned list — with no optimistic update path.

Relevant lines:
- `useFeedback.ts:59` — `await fetchFeedback()` after `createFeedback`
- `useFeedback.ts:84` — `await fetchFeedback()` after `updateFeedback`
- `useFeedback.ts:105` — `await fetchFeedback()` after `deleteFeedback`

And the list endpoint (`packages/haiku/src/http.ts:1095`) always calls `readFeedbackFiles` which does full-directory scan + YAML parse of every `.md` file. No ETag, no conditional fetch, no `If-None-Match`.

## Compounding factor

Server-side `readFeedbackFiles` uses **synchronous** `readdirSync`/`readFileSync` (state-tools.ts:3114-3158). On Node's single-threaded event loop, synchronous filesystem IO blocks **every concurrent HTTP request** — not just the refetching client. In the MCP server that also handles WebSocket pushes and orchestrator tool calls, a full-list re-read after each mutation stalls the whole server.

## Concrete scenario

Reviewer triages 10 feedback items by clicking each one's "Close" button. That's:
- 10 PUT requests
- 10 synchronous dir scans server-side
- 10 full-list refetches client-side
- 10 full re-renders of the feedback panel

When the dir contains 50 items, that's 500 file reads to service a workflow that should be 10 targeted writes + 10 optimistic local mutations.

## Mandate violations

- "N+1 query patterns or unbounded data fetches" — the refetch-on-mutate pattern is the HTTP analog of the N+1 query; we over-fetch every unchanged item N times where N = mutations.
- "caching is used where specified, with correct invalidation" — no cache, no ETag, no server-side cache-control header, no client-side stale-while-revalidate.

## Suggested fixes (pick a layer)

1. **Client-side optimistic update** — in `updateFeedback`/`deleteFeedback`, mutate `items` state immediately via `setItems((prev) => prev.map(...))` / `prev.filter(...)`, then reconcile with the server response rather than refetching.
2. **Server returns the updated item** — the PUT handler at `http.ts:1260-1269` already has access to the updated record; include it in the response so the client can splice it in without a follow-up GET.
3. **Add ETag to the list endpoint** — hash the file mtimes or the concatenated frontmatter and emit `ETag` + respect `If-None-Match` for 304s. Cheap on the wire and keeps the server consistent.
4. **Server-side dir-scan cache** — gate `readFeedbackFiles` behind a mtime-invalidated Map. The feedback dir only changes via the mutating handlers, so invalidate at the end of each mutation handler.

## File references

- `packages/haiku-ui/src/hooks/useFeedback.ts:43-109` (all three mutation paths refetch)
- `packages/haiku/src/http.ts:1068-1124` (list handler, no cache headers, sync dir scan)
- `packages/haiku/src/state-tools.ts:3114-3158` (synchronous IO on every call)
- `packages/haiku/src/http.ts:1194-1269` (update handler doesn't return the updated item — only an ack)
