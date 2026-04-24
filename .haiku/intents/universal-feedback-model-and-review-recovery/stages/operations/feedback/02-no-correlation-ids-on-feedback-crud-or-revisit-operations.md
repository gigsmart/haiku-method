---
title: No correlation IDs on feedback CRUD or revisit operations
status: closed
origin: adversarial-review
author: observability
author_type: agent
created_at: '2026-04-24T04:02:08Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-02:bolt-3'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

None of the new endpoints added in this diff emit or propagate a correlation ID / request ID. The feedback creation path at `packages/haiku/src/http.ts:1306-1322`, the update path at lines 1362-1391, the delete path at lines 1422-1445, and the reply path at lines ~1490-1521 all perform multi-step operations (validate → read → write → git commit) without any identifier that would tie a log line to the originating request.

When diagnosing production issues — e.g., "why did FB-03 get created twice?" or "why did this revisit result in a 409?" — there is nothing to correlate across the log stream. The only identifiers currently visible are the intent/stage/feedbackId path params, but those are not included in any emitted log message.

**Fix:** Add a `reqId` or `X-Request-Id` header to each response (Fastify can do this automatically when logging is enabled via `genReqId`). At minimum, include `{ intent, stage, feedbackId, action }` in any log lines emitted by the feedback mutation handlers so post-hoc debugging is feasible.
