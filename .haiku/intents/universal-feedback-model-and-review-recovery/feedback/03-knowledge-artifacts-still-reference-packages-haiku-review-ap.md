---
title: >-
  Knowledge artifacts still reference packages/haiku/review-app/ —
  implementation lives at packages/haiku-ui/
status: closed
origin: studio-review
author: cross-stage-consistency
author_type: agent
created_at: '2026-04-24T19:30:00Z'
visit: 0
source_ref: null
addressed_by: null
bolt: 3
closed_by: 'intent-fix:FB-03:bolt-3'
---

Every shared knowledge artifact produced by inception, product, and design references the review app at `packages/haiku/review-app/src/`. Development unit-03 made a deliberate architectural decision to extract this into a standalone `packages/haiku-ui/` workspace package, which is where the actual code lives. The knowledge artifacts were never updated to reflect this.

**Stale references found in:**
- `knowledge/ARCHITECTURE.md` (section titled "Review App (under `packages/haiku/review-app/src/`)")
- `knowledge/IMPLEMENTATION-MAP.md` — Group 12 file table lists `packages/haiku/review-app/src/components/ReviewPage.tsx`, `ReviewSidebar.tsx`, `hooks/useSession.ts`, `types.ts`
- `knowledge/IMPLEMENTATION-MAP.md` — File Change Summary section lists `packages/haiku/review-app/src/components/ReviewPage.tsx`, `ReviewSidebar.tsx`, `hooks/useSession.ts`, `types.ts`
- `knowledge/DISCOVERY.md` (section "Review App Architecture (`packages/haiku/review-app/`)")
- `knowledge/DESIGN-TOKENS.md` (references `review-app/` rendering path)

**Actual implementation:**
- `packages/haiku-ui/src/components/ReviewPage.tsx` ✓
- `packages/haiku-ui/src/components/ReviewSidebar.tsx` ✓
- `packages/haiku-ui/src/hooks/useFeedback.ts` ✓ (separate hook, not merged into useSession)
- `packages/haiku-ui/src/types.ts` ✓ (re-exports from haiku-api, no local FeedbackItem definition)

Additionally, `knowledge/IMPLEMENTATION-MAP.md` Group 12 says `useSession.ts` should gain `useFeedback` as an added hook. The actual implementation put `useFeedback` in a dedicated `packages/haiku-ui/src/hooks/useFeedback.ts` file — a better design, but a divergence from the stated plan.

**Impact:** Any future agent or human following the IMPLEMENTATION-MAP will look for files that don't exist and miss files that do. Cross-referencing design artifacts against the implementation map will produce incorrect paths. If the security or operations stage referenced these paths in findings, those findings would point to non-existent locations.

**Fix:** Update `knowledge/ARCHITECTURE.md`, `knowledge/IMPLEMENTATION-MAP.md`, `knowledge/DISCOVERY.md`, and `knowledge/DESIGN-TOKENS.md` to replace all `packages/haiku/review-app/src/` references with `packages/haiku-ui/src/`. Update the useFeedback hook description to reflect the standalone file rather than useSession augmentation.
