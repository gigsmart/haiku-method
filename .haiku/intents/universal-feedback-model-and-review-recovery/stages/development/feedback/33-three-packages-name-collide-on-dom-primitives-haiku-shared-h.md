---
title: >-
  Three packages name-collide on DOM primitives: @haiku/shared,
  haiku-ui/components, haiku-ui/primitives
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:23:23Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

The dependency graph around shared UI building blocks has three parallel layers with overlapping responsibility, no documented layering rule, and live name collisions.

**Layer inventory** (all active in the current build):

1. `@haiku/shared` (`packages/shared/`) — exports include `CriteriaChecklist`, `MarkdownViewer`, `StatusBadge`, plus parser types `CriterionItem`, `MockupInfo`. Ingested by `haiku-ui/src/types.ts:17` and `haiku-ui/src/components/ReviewCurrentPage.tsx:1`. Depends on `react-markdown`, `remark-gfm`.
2. `haiku-ui/src/components/` leaf components — `MarkdownViewer.tsx`, `CriteriaChecklist.tsx`, `StatusBadge.tsx` all exist here AS WELL. Grep:
   - `packages/haiku-ui/src/components/MarkdownViewer.tsx:9: export function MarkdownViewer`
   - `packages/haiku-ui/src/components/CriteriaChecklist.tsx:7: export function CriteriaChecklist`
   - And these components are imported from `@haiku/shared` on the same line as legacy imports: `components/ReviewPage.tsx:1: import { CriteriaChecklist, MarkdownViewer, StatusBadge } from "@haiku/shared"`.
3. `haiku-ui/src/components/primitives/` — new-architecture Button/Card/Chip/Badge/Divider/Input primitives.

**Concrete collisions:**
- `CriteriaChecklist` exists in both `@haiku/shared/src/components/` and `haiku-ui/src/components/CriteriaChecklist.tsx`. Consumers use both depending on import path.
- `MarkdownViewer` same pattern.
- `Card` in `haiku-ui/src/components/Card.tsx` vs `haiku-ui/src/components/primitives/Card.tsx`. Both exported, different APIs.
- `StatusBadge` in `@haiku/shared` vs `haiku-ui/src/components/StatusBadge.tsx`.

**Layering question no one has answered:** is `@haiku/shared` supposed to be (a) a platform-agnostic design-system package consumed by multiple app surfaces, or (b) a dumping ground for legacy components? The `shared/package.json` has `peerDependencies` on React + react-dom (good — shared should not pin React), but the HAIKU-UI package then duplicates the components anyway.

**Architectural impact:**
1. New code has three places it could put a shared component — reviewers cannot give a consistent answer.
2. Bumping a dep (e.g. `react-markdown`) requires coordinating across `shared/package.json` AND `haiku-ui/package.json` because both declare it.
3. Changes to `CriteriaChecklist` spec must touch both implementations or drift.

**Fix:** pick one canonical home per component and delete the others. If `@haiku/shared` is the design system, the three collided components should only live there and `haiku-ui/components/MarkdownViewer.tsx`, `CriteriaChecklist.tsx`, `StatusBadge.tsx` should be deleted. If `@haiku/shared` is legacy, rip it out and consolidate in `haiku-ui/`. Document the rule in `haiku-ui/README.md`.
