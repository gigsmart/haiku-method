---
title: >-
  N+1 disk read in feedback-assessor dispatch: readFeedbackFiles called per
  close[]
status: fixing
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:23:48Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

Two callsites in `packages/haiku/src/orchestrator.ts` dispatch the feedback-assessor hat and each one performs an N+1 full-directory scan of the feedback folder:

**Callsite 1 — `orchestrator.ts:4958-4970`**
```ts
const feedbackFiles: Array<{ id: string; file: string }> = []
for (const fbId of closes) {
  const found = readFeedbackFiles(slug, stage).find(   // ← full dir read + parse EVERY iteration
    (f) => f.id === fbId,
  )
  if (found) feedbackFiles.push({ id: found.id, file: ... })
}
```

**Callsite 2 — `orchestrator.ts:5510-5523`**
```ts
for (const fbId of closes) {
  const found = readFeedbackFiles(slug, stage).find(   // ← same N+1 bug
    (f) => f.id === fbId,
  )
  if (found) feedbackFiles.push(...)
}
```

`readFeedbackFiles` (state-tools.ts:3114-3158) is NOT cheap:
- `readdirSync` on the feedback dir
- For every `.md` file: `readFileSync(utf8)` + `parseFrontmatter` (gray-matter YAML parse)

For a unit closing K feedback items out of N items in the directory, we do **K × N disk reads + K × N YAML parses**. With K=5 closes and N=20 feedback items in the directory, that's 100 file reads and 100 YAML parses to produce 5 output entries — instead of one directory listing and 5 targeted reads.

## Mandate violation

Performance mandate: "The agent MUST verify that no N+1 query patterns or unbounded data fetches." File-system I/O inside a tight `for…of` loop with no memoization is the classic pattern. This runs on every feedback-assessor dispatch — every fix-bolt where a unit closes feedback items.

## Impact

State-tools runs in the orchestrator's single-threaded synchronous path — while the dispatch builds this prompt, the Node event loop is blocked. Every extra `readFileSync` + YAML parse is blocking wall-clock time the MCP server cannot serve any other request.

Benchmarking the hit: at 10ms per read+parse (reasonable for a 2 KB YAML file on cold disk), K=5 closes with N=20 items = **~1 second** of blocking IO per dispatch, where the non-broken implementation would spend ~50ms.

## Suggested fix

Hoist the read out of the loop, or use `findFeedbackFile` (already defined at state-tools.ts:3188) which does a targeted single-file read.

```ts
// Option A — hoist
const allFeedback = readFeedbackFiles(slug, stage)  // ONE read
for (const fbId of closes) {
  const found = allFeedback.find((f) => f.id === fbId)
  ...
}

// Option B — targeted (slightly less parsing on large stages)
for (const fbId of closes) {
  const found = findFeedbackFile(slug, stage, fbId)
  if (found) feedbackFiles.push({ id: fbId, file: ... })
}
```

Prefer option A — it's one directory listing and N reads total (where N = dir size), regardless of K. Option B is K reads + K directory listings, which is only a win if N is much larger than K.

## File references

- `packages/haiku/src/orchestrator.ts:4958-4970` (first N+1 instance in non-parallel dispatch)
- `packages/haiku/src/orchestrator.ts:5510-5523` (second N+1 instance in parallel/wave dispatch)
- `packages/haiku/src/state-tools.ts:3114-3158` (readFeedbackFiles — the expensive call)
- `packages/haiku/src/state-tools.ts:3188-3217` (findFeedbackFile — the cheap targeted alternative)
