---
title: >-
  unit-06: Lighthouse harness fixture paths use /api/sessions/ (plural) but real
  endpoint is /api/session/ (singular)
status: fixing
origin: adversarial-review
author: reviewer
author_type: agent
created_at: '2026-04-21T13:18:24Z'
iteration: 0
visit: 0
source_ref: 'packages/haiku-ui/scripts/audit-lighthouse.mjs:45-52'
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

`packages/haiku-ui/scripts/audit-lighthouse.mjs` registers fixture handlers under `/api/sessions/<id>` (plural):

```js
const FIXTURE_FILES = {
  "/api/sessions/demo": join(FIXTURES, "review-session.json"),
  "/api/sessions/test-review-1": join(FIXTURES, "review-session.json"),
  "/api/sessions/demo-question": join(FIXTURES, "question-session.json"),
  "/api/sessions/test-question-1": join(FIXTURES, "question-session.json"),
  "/api/sessions/demo-direction": join(FIXTURES, "direction-session.json"),
  "/api/sessions/test-direction-1": join(FIXTURES, "direction-session.json"),
}
```

But the canonical contract in `packages/haiku-api/src/routes.ts:80` is **singular**:

```ts
export const paths = {
  session: (id: string) => `/api/session/${id}`,
```

The `ApiClient.fetchSession()` call in `packages/haiku-ui/src/api/client.ts:90` uses `paths.session(id)` — which hits `/api/session/demo`. That request falls through the fixture-match, the script's generic "SPA fallback" branch returns `index.html`, and `parseJsonOrThrow` fails with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.

## Evidence (reproduced locally)

Booted the harness's dist-server manually and dumped the DOM via headless Chrome:

- `GET /review/current` → renders correctly (uses `/api/review/current`, which the script *does* handle).
- `GET /review/demo` → renders **error state** "Session not found — Unexpected token '<', '<!DOCTYPE '... is not valid JSON".
- `GET /question/demo` → same error state.
- `GET /direction/demo` → same error state.

Three of the four pinned URLs in `lighthouserc.json` (`/review/demo`, `/question/demo`, `/direction/demo`) measure an error page, not the loaded SPA. The Lighthouse "accessibility" score on those URLs is not measuring what the unit spec says it measures.

## Impact

The Lighthouse gate ("a11y ≥ 0.95 per URL") is effectively measuring the error-state DOM's accessibility, not the shell+page composition the unit was built to gate. The Lighthouse harness was added as a regression guard against the icon-only-missing-label and missing-skip-link classes of issue — neither of those regressions can regress out of the actual loaded shell, because Lighthouse never sees the loaded shell on three of four URLs.

Additionally, the actual run `node packages/haiku-ui/scripts/audit-lighthouse.mjs` in this environment exits with code **1**, not the required 0:

```
Run #1...failed!
Runtime error encountered: The page did not paint any content (NO_FCP)
Error: Lighthouse failed with exit code 1
```

This violates the completion criterion: `node packages/haiku-ui/scripts/audit-lighthouse.mjs exits 0 with a11y score ≥ 0.95 on each pinned URL`.

## Suggested fix

Change the fixture registry keys to match the real API:

```js
const FIXTURE_FILES = {
  "/api/session/demo": join(FIXTURES, "review-session.json"),
  "/api/session/test-review-1": join(FIXTURES, "review-session.json"),
  "/api/session/demo-question": join(FIXTURES, "question-session.json"),
  "/api/session/test-question-1": join(FIXTURES, "question-session.json"),
  "/api/session/demo-direction": join(FIXTURES, "direction-session.json"),
  "/api/session/test-direction-1": join(FIXTURES, "direction-session.json"),
}
```

…and the dispatch line:

```js
if (pathname.startsWith("/api/session/")) {
```

Import `paths` from `haiku-api` directly so this can't drift again:

```js
import { paths } from "haiku-api"
// ... FIXTURE_FILES[paths.session("demo")] = ...
```

Then re-run `node packages/haiku-ui/scripts/audit-lighthouse.mjs` and confirm:
1. Each URL dumps the real shell + page (not the "Session not found" error state).
2. The command exits 0.
3. All four a11y scores are ≥ 0.95.

## Confidence

**High.** Direct source-path read, reproduced with headless Chrome DOM dump against the harness's own server. The singular/plural mismatch is a textual diff between two files.
