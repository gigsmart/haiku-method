---
title: >-
  pages/review/FeedbackSidebar.tsx mixes 3 components + internal hook in one
  file
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:23:36Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` exports:
- `FeedbackSidebar` (desktop aside) — line 154
- `FeedbackFloatingButton` (mobile FAB) — line 188
- `FeedbackSheet` (mobile modal) — line 225
- `FeedbackPanelBody` (private helper, line 60)
- `useFeedbackSidebarController` (private hook, line 98)
- `statusAnnouncement` (private helper, line 35)

The docstring comment defends this: *"Mobile variants (FeedbackFloatingButton, FeedbackSheet) live in this file by design — they share ~80% of the desktop plumbing and splitting them would duplicate the useFeedback wiring."*

**Why the defense doesn't hold:**

1. The "shared plumbing" is `useFeedbackSidebarController` — a hook. Hooks cross file boundaries just fine. Move the hook to `pages/review/useFeedbackSidebarController.ts` and the three components can each live in their own file calling the hook.

2. The file violates the surrounding convention. Every other component in the tree — `AnnotationCanvas.tsx`, `ArtifactsPane.tsx`, `FooterBar.tsx`, `ReviewPage.tsx`, etc. — is one top-level component per file. This file breaks that convention without a module-level comment explaining why the cost of the exception is worth paying.

3. More severely: these three components **collide with the canonical `components/feedback/FeedbackSheet.tsx` and `components/feedback/FeedbackFloatingButton.tsx`** (see separate finding on duplicate feedback components). If the intent is to keep the pages/review variants, the file structure makes it impossible to import them without importing `FeedbackSidebar` too — so the canonical-vs-shim split is enforced by bundling, not by module boundaries.

4. Naming: `FeedbackSidebar.tsx` exports three things that are not "sidebars." The file name does not match its contents. A reviewer looking for the FAB will not grep for `FeedbackSidebar`.

**Fix:** split into
- `pages/review/FeedbackSidebar.tsx` — only the desktop aside
- `pages/review/useFeedbackSidebarController.ts` — the shared hook
- If pages/review variants of Sheet/FAB must exist at all (see separate duplication finding), put each in its own file. Better: delete them and use `components/feedback/*`.
