---
title: useSession.ts exports bypass the typed ApiClient with hardcoded URLs
status: pending
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:22:16Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

`packages/haiku-ui/src/hooks/useSession.ts` defines four raw-transport helpers that duplicate the typed `ApiClient` and hard-code URL paths that the `haiku-api.paths` builders are specifically designed to own:

- Line 60-97 `submitDecision` — calls `fetch("`/review/${sessionId}/decide`")` directly. `api/client.ts:107-115` already exposes `client.submitDecision(sessionId, body)` which uses `paths.reviewDecide(sessionId)` from `haiku-api`.
- Line 101-143 `submitAnswers` — calls `fetch("`/question/${sessionId}/answer`")`. Shadowed by `client.submitAnswer(...)` at `api/client.ts:116-124`.
- Line 147-178 `submitDesignDirection` — calls `fetch("`/direction/${sessionId}/select`")`. Shadowed by `client.submitDirection(...)` at `api/client.ts:125-133`.
- Line 185-195 `tryCloseTab` — calls `navigator.sendBeacon` with a caller-supplied URL and body, no type guarantees.

**Consumers of the raw helpers:**
- `packages/haiku-ui/src/components/ReviewSidebar.tsx:2` imports `submitDecision, tryCloseTab` directly. Lines 103, 152 call the raw version.
- Tests (`DirectionPage.test.tsx:41-44`, `pages/review/__tests__/layout.test.tsx:68-77`) mock the typed `ApiClient` shape.

**Dependency-direction violation:**
`packages/haiku-api/README.md` literally documents the `paths` builder as the single source of truth for HTTP routes ("there are no hand-formatted paths here" — `api/client.ts:7`). The raw helpers in `useSession.ts` invalidate that contract: hand-formatted template strings exist in the UI layer, and they WILL drift from `packages/haiku-api/src/routes.ts` silently.

Also note `api/client.ts:193-205` — `openWebSocket` is defined on the client interface, but `hooks/useSessionWebSocket.ts` (line 21 imports from `haiku-api` directly) does not route through the client. Is it bypassing the injection seam? This deserves confirmation.

**Fix:** delete the raw `submitDecision` / `submitAnswers` / `submitDesignDirection` exports from `useSession.ts`; migrate `ReviewSidebar.tsx` and any remaining consumer to `useApiClient().submitDecision(...)`. `tryCloseTab` should either move onto the ApiClient (if it's part of the contract) or into a clearly-scoped side-effect helper that does not appear alongside the typed entry points.
