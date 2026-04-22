---
title: primitives/ directory is 5/6 dead code — premature generalization
status: closed
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:22:32Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-18:bolt-2'
bolt: 2
upstream_stage: null
---

`packages/haiku-ui/src/components/primitives/` ships 6 components. Only one is consumed.

Grep across the entire `haiku-ui/src` tree for primitives imports returns exactly one non-test consumer:
```
packages/haiku-ui/src/pages/direction/DirectionPage.tsx:24: import { Input } from "../../components/primitives"
```

Unused:
- `primitives/Badge.tsx` (50 LOC) — zero imports
- `primitives/Button.tsx` (72 LOC) — zero imports
- `primitives/Card.tsx` (45 LOC) — zero imports; the file's own comment admits it is a "sibling of the existing src/components/Card.tsx" that "downstream units migrate callers" (line 12-15). Downstream units landed; no callers migrated.
- `primitives/Chip.tsx` (50 LOC) — zero imports
- `primitives/Divider.tsx` (33 LOC) — zero imports

The tests (`primitives/__tests__/*`) test them in isolation — so the test count gives the illusion of coverage, but no real consumer validates any integration.

**Architectural concern — premature abstraction:** a "primitives" layer introduces a new module boundary with its own tokens, naming conventions, and accessibility contract. That cost is justifiable only if consumers actually use it. Landing 5 never-used primitives while the legacy `components/Card.tsx` and inline buttons remain everywhere creates the worst case: two patterns live, reviewers must decide which to use per site, and the new one has no battle-testing.

The sibling `components/Card.tsx` (consumed by `DirectionPage.tsx:23` and `QuestionPage.tsx:28`) has a different API and different token defaults than `primitives/Card.tsx`. Using the wrong one in a new component is now a live foot-gun.

**Fix:** either (a) do a real migration wave that replaces `components/Card.tsx`, ad-hoc buttons, etc. with the primitives and deletes the legacy equivalents, or (b) delete `primitives/Badge|Button|Card|Chip|Divider.tsx` and their tests until a real consumer appears. Shipping dead primitives with "downstream units migrate callers" in the comment as the justification is debt with interest.
