# Fix FB-33 — Tactical Plan (planner, bolt 1)

**Finding:** `Three packages name-collide on DOM primitives: @haiku/shared, haiku-ui/components, haiku-ui/primitives`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/33-three-packages-name-collide-on-dom-primitives-haiku-shared-h.md`

## TL;DR

The three-layer "collision" is not actually three peer implementations — it
is one canonical layer, one graveyard of dead duplicates, and one new
design-system namespace still coming online. Delete the graveyard, document
the rule, and the collision disappears. Specifically:

1. **`@haiku/shared/components`** is the canonical home for cross-surface
   content primitives (`CriteriaChecklist`, `MarkdownViewer`, `StatusBadge`,
   `FileTree`, `ProgressBar`). Every live caller already imports from here.
2. **`packages/haiku-ui/src/components/{MarkdownViewer,CriteriaChecklist,StatusBadge}.tsx`**
   are **orphaned duplicates — zero importers**. Dead code; delete.
3. **`packages/haiku-ui/src/components/primitives/*`** is the new design-system
   primitives namespace (Button / Badge / Card / Chip / Divider / Input). No
   name-collision with `@haiku/shared` (different component set). The ONE live
   collision is **`Card`**: `components/Card.tsx` (page-layout card with
   `SectionHeading`) vs `components/primitives/Card.tsx` (design-system card
   with `elevation`/`padding` props). Those are two different components
   sharing a name — rename the legacy one (`PageSectionCard` + `SectionHeading`
   stay co-located) so the primitive owns the `Card` identifier.
4. Document the layering rule in `packages/haiku-ui/README.md` so a future
   reviewer can give a consistent answer to "where does a new shared
   component go?".

This fix is **deletion + rename + README**, not a re-architecture. The
collision is mostly bookkeeping debt, not design ambiguity.

## Root cause

Three things happened in sequence and the cleanup step was skipped:

1. **`@haiku/shared` was extracted** (commit `bf7d211f`, "shared package —
   types, utils, components shared between website + review-app") to host
   components consumed by both website and what was then review-app.
2. **review-app was renamed to `haiku-ui`** via `git mv` (commit `80dfc4c8`),
   preserving history — and the old local copies of `MarkdownViewer`,
   `CriteriaChecklist`, `StatusBadge` came along for the ride. Callers had
   already been switched to `@haiku/shared` in a prior cutover (see
   `ReviewPage.tsx:1`, `ReviewCurrentPage.tsx:1`, `QuestionPage.tsx:23`,
   `types.ts:17`, `CriteriaChecklist.tsx:1` — all import from `@haiku/shared`),
   so nothing imports the local files. Nobody ran a `git rm` pass.
3. **Unit-04 shipped the primitive layer** (commit `68695311`, "primitive
   component layer Button/Badge/Card/Chip/Divider/Input + RTL coverage").
   The primitives namespace is architecturally sound — it's a DIFFERENT set
   of components (design-system foundation), co-located with their tests, with
   a clear barrel. The only collision it introduced is `Card` against the
   existing `components/Card.tsx` page-layout card, because the naming
   choice was "Card" for both. That rename is the second action item.

**Evidence for orphan status** (run in worktree root):

```bash
# Local duplicates have zero importers:
$ grep -rn 'from ["'\''][^"'\'']*/MarkdownViewer["'\'']' packages/haiku-ui/src
# (no matches)
$ grep -rn 'from ["'\''][^"'\'']*/CriteriaChecklist["'\'']' packages/haiku-ui/src
# (no matches)
$ grep -rn 'from ["'\''][^"'\'']*/StatusBadge["'\'']' packages/haiku-ui/src
# (no matches)
# All live call sites import from @haiku/shared:
$ grep -rn 'from ["'\'']@haiku/shared["'\'']' packages/haiku-ui/src
packages/haiku-ui/src/types.ts:export type { CriterionItem, MockupInfo } from "@haiku/shared"
packages/haiku-ui/src/pages/question/QuestionPage.tsx: import { MarkdownViewer } from "@haiku/shared"
packages/haiku-ui/src/components/ReviewCurrentPage.tsx:import { StatusBadge } from "@haiku/shared"
packages/haiku-ui/src/components/CriteriaChecklist.tsx:import type { CriterionItem } from "@haiku/shared"
packages/haiku-ui/src/components/ReviewPage.tsx: import { CriteriaChecklist, MarkdownViewer, StatusBadge } from "@haiku/shared"
```

The import on line 1 of the DUPLICATE `components/CriteriaChecklist.tsx` is
the tell: the orphan itself imports a type from the real `@haiku/shared` —
which would make a publish-time circular graph if the local copy were ever
reachable. It is not. Deleting the orphan deletes the near-cycle too.

## Fix approach

Three-part cleanup; each part is independently committable, and all three
together close FB-33 in one bolt.

**Part A — delete the graveyard** (orphan duplicates in `haiku-ui/components`).
Drops ~3 files + their (currently-non-existent) test coverage. Zero call-site
impact.

**Part B — resolve the `Card` name collision.** Rename
`packages/haiku-ui/src/components/Card.tsx` exports from `Card` /
`SectionHeading` to `PageSectionCard` / `SectionHeading` (the latter keeps
its name — it's a heading primitive, not a Card). Update the three live
callers (`DirectionPage.tsx:23`, `QuestionPage.tsx:28`, `ReviewPage.tsx:37`)
to import `PageSectionCard`. This frees the `Card` identifier for the
design-system primitive, which is where new code should go.

**Part C — document the rule.** Add a `## Component layering` section to
`packages/haiku-ui/README.md` that codifies:
- **`@haiku/shared/components`** — cross-surface content primitives
  (markdown rendering, status badges, criteria checklists). Shared between
  website and haiku-ui. Depends on React + react-markdown via
  peerDependencies. **This is where cross-consumer content components go.**
- **`haiku-ui/src/components/primitives/*`** — design-system foundation
  (Button, Card, Chip, etc.). Token-compliant, headless-friendly. **This
  is where new haiku-ui-internal UI building blocks go.**
- **`haiku-ui/src/components/*`** (non-primitives) — page-level composite
  components (ReviewPage, FeedbackPanel, StageProgressStrip). Consume the
  two layers above. **This is where feature code lives.**
- **If a component needs to be used outside haiku-ui** (e.g. in website or
  a future package) → promote to `@haiku/shared`.
- **If a component is a pure design-system atom** (no business logic, used
  by many page-level components) → `haiku-ui/primitives`.
- **Otherwise** → `haiku-ui/components`.

The rule is: **one canonical home per component. No sibling duplicates.**

## Files to modify

### Part A — delete the graveyard

1. **Delete `packages/haiku-ui/src/components/MarkdownViewer.tsx`** (22 lines).
   Orphan — no importers.
2. **Delete `packages/haiku-ui/src/components/CriteriaChecklist.tsx`**
   (~39 lines). Orphan — no importers. (Verify once more immediately before
   deletion since parallel fix chains may be editing sibling files.)
3. **Delete `packages/haiku-ui/src/components/StatusBadge.tsx`**
   (~49 lines, the one with the `colors.idle` docstring referencing
   DESIGN-TOKENS §1.2a and FB-15). **CRITICAL** — read this file immediately
   before deleting. The docstring is load-bearing documentation of a
   contrast fix; if that rule hasn't been ported to the shared copy
   (`packages/shared/src/components/StatusBadge.tsx`), port it before
   deleting. The shared copy uses `colors.pending` (`text-stone-500` on
   `bg-stone-100` = 4.40:1 = AA FAIL per that docstring). **The shared
   copy must carry the same AA-safe `idle` color map** before the duplicate
   is removed. See "Part A prerequisite" below.

#### Part A prerequisite — port the AA-safe `idle` fix to `@haiku/shared`

Diff of `packages/haiku-ui/src/components/StatusBadge.tsx` vs
`packages/shared/src/components/StatusBadge.tsx` shows the local copy has:
- The `colors.idle` key (`text-stone-600` on `bg-stone-100` = AA PASS).
- The `"pending" → "idle"` back-compat routing.
- A comprehensive docstring.

…but the shared copy still has the older `colors.pending` (`text-stone-500`
= AA FAIL). Before deleting the local copy, port those three things into
`packages/shared/src/components/StatusBadge.tsx`. Specifically:

- Replace the `colors.pending` key with `colors.idle` (keep the `complete`
  key — the shared copy has it, the local doesn't; that's an improvement
  the shared copy already offers). Final map: `{ complete, in_progress,
  approved, error, idle }`.
- Add the `pending → idle` back-compat branch:
  ```ts
  const key = normalized === "pending" ? "idle" : normalized
  const colorClass = colors[key] ?? colors.idle
  ```
- Port the docstring verbatim. It documents FB-15 remediation and the
  DESIGN-TOKENS §1.2a cross-component policy; that history must survive.

Keep the shared copy's extras: the `className` prop, the
`status?: string | null` signature, the `typeof status === "string" && status.trim()`
null-tolerance. Do NOT regress to the stricter `status: string` signature
from the local copy. Merge **shared API + local color map + local docstring**,
then delete the local file.

After this prerequisite, Part A step 3 is safe.

### Part B — resolve the `Card` collision

4. **Rename exports in `packages/haiku-ui/src/components/Card.tsx`**:
   - `export function Card(...)` → `export function PageSectionCard(...)`.
   - Keep `export function SectionHeading(...)` as-is — `SectionHeading`
     is not a Card and doesn't collide.
   - Top-of-file docstring: add a one-paragraph note that this is the
     page-scaffolding wrapper used by Question/Direction/legacy-Review
     page containers. **Not to be confused with the design-system
     `Card` primitive in `./primitives/Card.tsx`** — new code should
     prefer the primitive.
5. **Retarget callers**:
   - `packages/haiku-ui/src/pages/direction/DirectionPage.tsx:23` —
     `import { Card, SectionHeading } from "../../components/Card"` →
     `import { PageSectionCard, SectionHeading } from "../../components/Card"`
     plus rename every `<Card>` tag in this file to `<PageSectionCard>`.
   - `packages/haiku-ui/src/pages/question/QuestionPage.tsx:28` — same.
   - `packages/haiku-ui/src/components/ReviewPage.tsx:37` — same; the
     import line is `import { Card, SectionHeading } from "./Card"`.
     Rename the import AND every JSX usage in this file.

   **Read-before-write warning**: `ReviewPage.tsx` is also being actively
   edited by FB-11 / FB-22 / FB-27 fix-loops (those chains are dismantling
   `LegacyReviewPage` and migrating `IntentReview` / `UnitReview` out of
   this file). Before editing, re-read the current file contents and
   verify `<Card>` tags are still in the locations the grep indicates. If
   a parallel chain has already moved `IntentReview` into
   `pages/review/intent/IntentReview.tsx`, the `<Card>` tags will have
   moved with it — chase them into the new file instead.

### Part C — document the rule

6. **Edit `packages/haiku-ui/README.md`**:
   - Add a new `## Component layering` section after the existing
     `## Backend contract` section (so it sits logically before
     `## WebSocket batching` — the new section is about package
     structure, the existing ones are about runtime).
   - Content: the three-layer rule from "Fix approach § Part C" above,
     plus the one-line decision flowchart:
     > Need it outside haiku-ui? → `@haiku/shared`. Pure design-system
     > atom? → `haiku-ui/primitives`. Otherwise → `haiku-ui/components`.
   - Add a bolded warning: **No sibling duplicates. If the same component
     name appears in two layers, that's a bug — resolve it before landing.**

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) orphans gone
test ! -f packages/haiku-ui/src/components/MarkdownViewer.tsx
test ! -f packages/haiku-ui/src/components/CriteriaChecklist.tsx
test ! -f packages/haiku-ui/src/components/StatusBadge.tsx

# (b) no orphan imports lingering
! grep -rqn 'components/MarkdownViewer' packages/haiku-ui/src
! grep -rqn 'components/CriteriaChecklist' packages/haiku-ui/src
! grep -rqn 'components/StatusBadge' packages/haiku-ui/src

# (c) Card collision resolved — legacy file exports PageSectionCard, not Card
grep -q 'export function PageSectionCard' packages/haiku-ui/src/components/Card.tsx
! grep -q 'export function Card(' packages/haiku-ui/src/components/Card.tsx
# (d) Primitive Card still present
grep -q 'export function Card(' packages/haiku-ui/src/components/primitives/Card.tsx

# (e) No live call site imports the legacy Card under that name anymore
! grep -rqn 'import.*\bCard\b.*from.*components/Card["'\'']' packages/haiku-ui/src
# (PageSectionCard is the expected symbol now — this grep should return zero
# matches for the bare `Card` name from that path; `Card` from
# `./primitives` or `./primitives/Card` is still allowed.)

# (f) Shared StatusBadge carries the AA-safe idle map + pending→idle routing
grep -q 'colors.idle' packages/shared/src/components/StatusBadge.tsx
grep -q '"pending" ? "idle"' packages/shared/src/components/StatusBadge.tsx

# (g) README documents the layering rule
grep -q '## Component layering' packages/haiku-ui/README.md

# (h) Typecheck + tests
npm run typecheck -w haiku-ui
npm run test -w haiku-ui
npm run typecheck -w @haiku/shared 2>/dev/null || true
npm run test -w @haiku/shared 2>/dev/null || true

# (i) Build still produces a valid bundle (no missing modules from the rename)
npm run build -w haiku-ui
```

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
   Do NOT push.
2. Commit in **one cohesive commit** with message
   `haiku: fix FB-33 bolt 2 (builder)`. Body should list:
   - Files deleted (the three orphans).
   - Files renamed / import-updated (`Card.tsx` → `PageSectionCard` export;
     three call-site updates).
   - Shared `StatusBadge.tsx` updated with AA-safe `idle` color map.
   - README updated with layering rule.
3. **Read-before-write every file** — this bolt runs in parallel with
   other fix chains. `ReviewPage.tsx` is especially contentious (FB-11,
   FB-22, FB-27, FB-53 all touch it). If a sibling chain has already
   moved the `<Card>` call sites out of `ReviewPage.tsx`, chase them into
   the new location rather than re-adding them.
4. Run verification commands (a)-(i) and paste the pass/fail output into
   the commit message.
5. If typecheck surfaces a caller of the deleted orphans that grep
   missed (dynamic require, string-path import), port that caller to
   `@haiku/shared` — do NOT restore the orphan.

## Risks

- **Parallel-chain clobber on `ReviewPage.tsx` (high)** — FB-11, FB-22,
  FB-27, FB-53 are all mid-flight on this monolith. The `<Card>` JSX tag
  rename in this file is the most likely conflict point. Mitigation:
  read-before-write, and if `IntentReview` / `UnitReview` have been
  migrated into `pages/review/intent/` etc. by another chain, chase the
  `<Card>` tags into those new files. The rename is mechanical enough
  to survive a merge-conflict pass.
- **StatusBadge port breaks website consumers (medium)** — `@haiku/shared`
  is consumed by both `haiku-ui` and `website`. The color-map change
  (`pending` → `idle`) is backwards-compatible via the `pending → idle`
  routing branch, but if any website caller passes `status="pending"`
  and inspects the output DOM `class` attribute in a test, that
  assertion will now see `text-stone-600` instead of `text-stone-500`.
  Mitigation: run `npm run test -w website` before committing; the
  test assertion change is a true fix (it reflects AA compliance),
  not a regression.
- **Hidden dynamic import of the orphan (low)** — `grep` may miss a
  computed-string import. Mitigation: after deletion, run
  `npm run build -w haiku-ui` — esbuild will surface any unresolved
  import at build time, not just typecheck time.
- **`SectionHeading` identity tangled with `Card`** — `SectionHeading`
  is co-exported from the legacy `Card.tsx`. The plan keeps it in place
  (it's not part of the collision) but the builder should double-check
  no import statement elsewhere assumes `SectionHeading` is on the
  primitives barrel. (Current grep shows it is imported only via the
  `./Card` or `../../components/Card` path alongside the legacy Card,
  so the rename leaves `SectionHeading` in its correct home.)
- **README drift (low)** — the layering rule documented in the README
  must agree with actual package structure forever after. If a future
  unit adds a new package (e.g. `@haiku/tokens`), the rule needs
  updating. Mitigation: the README section is short and focused; it
  will be obvious when it needs updating.

## Out of scope

- Migrating `ReviewPage` / `FeedbackPanel` / `RevisitModal` call sites
  to the primitive `Card`. That's a design-system adoption unit, not a
  cleanup fix. The primitive `Card` stays available; legacy call sites
  keep using `PageSectionCard` until a dedicated migration unit
  addresses them.
- Consolidating the `primitives/Badge` with `@haiku/shared`'s
  `StatusBadge`. They are different components (`Badge` is a generic
  pill primitive; `StatusBadge` wraps `Badge`-shaped DOM with a
  status-specific color map and aria-label). No collision.
- Paper / website sync. This is an internal package refactor; no
  paper concepts change. CLAUDE.md's "Concept-to-Implementation Mapping"
  is unaffected.

## Done when

- `packages/haiku-ui/src/components/MarkdownViewer.tsx`,
  `CriteriaChecklist.tsx`, `StatusBadge.tsx` are deleted.
- `packages/shared/src/components/StatusBadge.tsx` has the AA-safe
  `idle` color map + `pending → idle` back-compat branch + the
  DESIGN-TOKENS §1.2a docstring.
- `packages/haiku-ui/src/components/Card.tsx` exports `PageSectionCard`
  (not `Card`); all three call sites updated.
- `packages/haiku-ui/README.md` has a `## Component layering` section
  documenting the three-layer rule.
- Typecheck, tests, and build all pass across `haiku-ui`, `@haiku/shared`,
  and `website`.
- Feedback-assessor closes FB-33 on the next bolt.
