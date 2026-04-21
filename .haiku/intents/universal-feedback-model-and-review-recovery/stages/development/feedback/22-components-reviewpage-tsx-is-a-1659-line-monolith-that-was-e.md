---
title: >-
  components/ReviewPage.tsx is a 1659-line monolith that was explicitly not
  split
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:22:49Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

`packages/haiku-ui/src/components/ReviewPage.tsx` is 1659 lines. It hosts `LegacyReviewPage` (the old composition), `IntentReview`, `UnitReview`, `RereviewBanner`, `ReviewPageSessionData`, inline helpers for section-finding, image-URL detection, draft storage (localStorage DRAFT_STORAGE_KEY), `FeedbackPanel` integration, two call sites of the legacy AnnotationCanvas, two call sites of `Tabs`, and the tab content for both intent and unit review modes.

The `pages/review/ArtifactsPane.tsx:1-15` comment is blunt about leaving this in place: *"This unit does not rewrite those views — the tactical plan §14 is explicit that the ~1400-LOC monolith stays in place; only the top-level composition responsibility moves."*

**Architectural concerns:**

1. **Module-boundary violation** — `components/ReviewPage.tsx` is a page-level composition masquerading as a leaf component. It lives in `components/` (the shared leaf-component directory), but it owns routing-adjacent concerns (session state, annotation capture, submission orchestration, draft persistence). That's page-layer work. `pages/review/ReviewPage.tsx` claims that responsibility — but only for the top-level shell, delegating right back into the legacy file for everything below the sidebar.

2. **Single-file cohesion failure** — one file exports four top-level components (`ReviewPage`, `LegacyReviewPage`, `IntentReview`, `UnitReview`) plus helper types and a localStorage side effect. Future changes to one leaf view force everyone else's reviewers to re-read 1659 lines. Any bug-fix touches a merge-conflict hotspot.

3. **Test blast-radius** — anything testing intent or unit review mode has to render the whole file. No way to isolate the tab composition or the annotation wiring without dragging in the full graph.

**What should happen:** `IntentReview`, `UnitReview`, `RereviewBanner`, and the parsed-session type should each live in their own module under `pages/review/intent/` and `pages/review/unit/` (or similar). The localStorage draft helper should be hoisted into `hooks/useReviewDraft.ts`. The FeedbackPanel composition should be plain composition, not buried.

**Why this is load-bearing for the architecture mandate:** the unit-07 tactical plan's "don't rewrite the monolith" carve-out was reasonable as a single-unit cost cap. Across 15 units of development stage, that carve-out has become a permanent fixture — and it is actively blocking the `pages/review/*` refactor from completing. The 1659-line file is the reason `ArtifactsPane` is a thin wrapper, the reason the two AnnotationCanvas implementations coexist, and the reason the FAB/Sheet duplicates exist. Refusing to split it propagates debt everywhere downstream.
