---
title: >-
  Sidebar visibility breakpoint inconsistent (md vs xl) across sidebar
  components
status: pending
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:22:21Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Mandate check:** "layout grid and breakpoint behavior is consistent across all screens."

The review app has **two** sidebar implementations that disagree on which breakpoint the desktop sidebar should appear at:

- `packages/haiku-ui/src/components/ReviewSidebar.tsx:76` — `hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`
- `packages/haiku-ui/src/components/ReviewPage.tsx:464` — `hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`
- `packages/haiku-ui/src/components/ReviewCurrentPage.tsx:175` — `hidden md:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`
- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:167` — `hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`

The legacy three show the sidebar from `md` (≥ 768 px); the new review composition `FeedbackSidebar` shows it only from `xl` (≥ 1280 px). A user on a 1024 px tablet lands on `ReviewPage` and sees completely different layouts depending on which code path renders it.

The `pages/review/ReviewPage.tsx` also gates mobile-only FAB/Sheet on `useIsMobile()` (≥ 768 px?) while `FeedbackSidebar` gates visibility on `xl` — so between the mobile cutoff and the xl threshold, **neither** path renders a feedback UI.

**Fix:** pick one canonical sidebar breakpoint (the DESIGN-TOKENS §1.3 row says `w-80 xl:w-96`, suggesting xl), update all four call sites, and align `useIsMobile()` to the same threshold. If the legacy md breakpoint is correct, the new FeedbackSidebar is wrong — the design spec needs to resolve which.

**Secondary issue:** `FeedbackSidebar` line 167 has `hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` — the base `w-[var(--sidebar-width)]` class never applies because the element is `hidden` below xl. Confusing and violates the spec pattern of "small sidebar below xl, wide sidebar at xl+." Either drop the base width or drop `hidden xl:flex` in favor of `hidden md:flex`.
