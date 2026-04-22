---
title: Duplicate ReviewPage + AnnotationCanvas components with circular re-export
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:21:44Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

The `haiku-ui` package ships two live `ReviewPage` implementations and two live `AnnotationCanvas` implementations. They are not a strangler-fig cutover — both are imported from production code paths in the same build.

**ReviewPage duplication**
- `packages/haiku-ui/src/components/ReviewPage.tsx:1-1659` — 1659-line "legacy" monolith. Its named export at line 155 re-exports the new composition: `export { ReviewPage } from "../pages/review/ReviewPage"`. The same file still exports `LegacyReviewPage` (line 157), `IntentReview`, `UnitReview`, `RereviewBanner`, `ReviewPageSessionData`, etc.
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx:40` imports from `../../components/ReviewPage` — the legacy file. And `ArtifactsPane` (pages/review/ArtifactsPane.tsx:20-24) imports `IntentReview` / `UnitReview` / `ReviewPageSessionData` from the legacy file.

This is a circular module graph: `components/ReviewPage.tsx` re-exports from `pages/review/ReviewPage.tsx`, which imports back from `components/ReviewPage.tsx`. Not technically a cycle because the imports on each side target different symbols, but the dependency direction is inverted — `components/*` should not depend on `pages/*`. Today `components/ReviewPage.tsx` is BOTH a leaf (`IntentReview`, `UnitReview`) AND an aggregator (re-exports the pages/review composition). That's two incompatible responsibilities in one file.

**AnnotationCanvas duplication**
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx` (499 lines) — used by `components/ReviewPage.tsx:654,1102`. API: `{ imageUrl, onCapture?, onPinsChange? }`. Pin type has `id: string`.
- `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` (784 lines) — used by `pages/review/__tests__/AnnotationCanvas.test.tsx`. Different `AnnotationCanvasProps`, different pin state machine (`"draft" | "saved"`), different listener budget, different persistence.
- Both are shipped. `ArtifactsPane` delegates to legacy `IntentReview` / `UnitReview` which use the 499-line canvas. The 784-line canvas appears unused in the actual runtime graph — only its own tests consume it.

**Fix:** pick one. Either finish the strangler cutover (delete the legacy monolith, migrate `IntentReview` / `UnitReview` leaves into `pages/review/` modules) OR back out the half-done `pages/review/` layer. Shipping both is worst-of-both-worlds: 2× review surface for every future change, two test suites that drift, and new contributors cannot tell which is canonical.
