# Fix FB-18 — Tactical Plan (planner, bolt 1)

**Finding:** `primitives/ directory is 5/6 dead code — premature generalization`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/18-primitives-directory-is-5-6-dead-code-premature-generalizati.md`

## TL;DR

Pick option (b) from the feedback body: **delete the 5 unused primitives
and their tests now**. Keep `Input.tsx` (the one real consumer is
`pages/direction/DirectionPage.tsx:24`). Dissolve the
`components/primitives/` barrel and inline `Input` into
`components/Input.tsx` so the folder goes away entirely — no empty
namespace, no aspirational comments, no half-abstraction.

A full migration wave (option (a)) — porting every `components/Card.tsx`
/ inline button call site onto the primitives — is legitimate work but
it is **unit-sized**, not fix-bolt-sized. Shipping it inside this fix
loop would (1) exceed the one-bolt scope the hat mandate enforces, and
(2) collide with parallel fix chains already touching
`DirectionPage.tsx`, `QuestionPage.tsx`, `Tabs.tsx`,
`StageProgressStrip.tsx`, `FeedbackFloatingButton`, etc. If the design
team decides primitives are the canonical path, a follow-up unit
(`unit-NN-primitive-migration-wave.md`) picks that up with the full
design-token enforcement story behind it. Until then: no dead
abstractions shipped to prod.

## Root cause

Unit-04 (`unit-04-design-token-system.md`) shipped the primitives
layer as a speculative foundation. The unit scope explicitly called
out the primitive components as deliverables (lines 48-60, 76, 121)
and included "Every primitive component has a vitest + RTL test"
as a completion criterion (line 121). The builder satisfied that
criterion by producing 6 files with tests, but only `Input` was wired
into a real consumer. The barrel comment
(`src/components/primitives/index.ts:5`) explicitly says
"Downstream units migrate callers from the legacy components in
`src/components/*.tsx` to these primitives" — that migration never
happened. Unit-05 through unit-15 kept reaching for the legacy
`components/Card.tsx` (`DirectionPage.tsx:23`, `QuestionPage.tsx:28`)
and ad-hoc buttons instead of the new primitives.

Net state today:
- `primitives/Badge.tsx` (50 LOC) — zero non-test imports.
- `primitives/Button.tsx` (72 LOC) — zero non-test imports.
- `primitives/Card.tsx` (45 LOC) — zero non-test imports; docstring
  admits it is a "sibling of the existing src/components/Card.tsx."
- `primitives/Chip.tsx` (50 LOC) — zero non-test imports.
- `primitives/Divider.tsx` (33 LOC) — zero non-test imports.
- `primitives/Input.tsx` (37 LOC) — **one** real consumer
  (`pages/direction/DirectionPage.tsx:24`).

Total dead code: ~250 LOC source + ~293 LOC test. Plus the module
boundary itself (barrel, folder, aspirational comment) which is a
cognitive-load tax every reviewer pays on every PR in this package.

## Fix approach

**Strategy: delete the 5 orphans, dissolve the primitives/ folder,
inline `Input` into `components/Input.tsx`.**

- The feedback explicitly lists this as option (b) and frames it as
  "delete ... until a real consumer appears." Assessor is primed for
  this outcome.
- Keeping only `Input` under `components/primitives/` would leave the
  folder as a 1-file stub with a misleading barrel comment. Either
  the folder is a real abstraction with multiple members, or it's a
  pretend abstraction. There is no third option that survives
  review. Dissolve it.
- Moving `Input.tsx` to `components/Input.tsx` is a one-import rewire
  (just `DirectionPage.tsx:24`). Low blast radius; surfaces clearly
  in grep.
- Update `unit-04-design-token-system.md` deliverables list and
  remove the "Every primitive component has a vitest + RTL test"
  completion criterion — that criterion is what incentivized the
  speculative build-out in the first place. Replace it with a
  reality-aligned criterion that only names the primitives that
  actually ship.
- Update `unit-05-a11y-foundations.md` deliverables to drop
  `primitives/Button.tsx` (it was listed there speculatively; the
  a11y unit did not actually produce or consume it).

## Files to modify

### Delete from the tree

1. `packages/haiku-ui/src/components/primitives/Badge.tsx`
2. `packages/haiku-ui/src/components/primitives/Button.tsx`
3. `packages/haiku-ui/src/components/primitives/Card.tsx`
4. `packages/haiku-ui/src/components/primitives/Chip.tsx`
5. `packages/haiku-ui/src/components/primitives/Divider.tsx`
6. `packages/haiku-ui/src/components/primitives/__tests__/Badge.test.tsx`
7. `packages/haiku-ui/src/components/primitives/__tests__/Button.test.tsx`
8. `packages/haiku-ui/src/components/primitives/__tests__/Card.test.tsx`
9. `packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx`
10. `packages/haiku-ui/src/components/primitives/__tests__/Divider.test.tsx`
11. `packages/haiku-ui/src/components/primitives/index.ts` (barrel)
12. `packages/haiku-ui/src/components/primitives/` folder itself
    (after moving Input.tsx — should be empty, `rmdir` it).

### Move

13. `packages/haiku-ui/src/components/primitives/Input.tsx` →
    `packages/haiku-ui/src/components/Input.tsx`.
    The file content transfers verbatim; no internal changes needed.
14. `packages/haiku-ui/src/components/primitives/__tests__/Input.test.tsx` →
    `packages/haiku-ui/src/components/__tests__/Input.test.tsx`.
    Update the relative import on line 3 from `from "../Input"` to
    `from "../Input"` (same relative path — the test lives next to
    the component in both layouts, so this may be a no-op depending
    on how the test was authored; read the file first and confirm).

### Rewire callers

15. `packages/haiku-ui/src/pages/direction/DirectionPage.tsx:24` —
    change `import { Input } from "../../components/primitives"` to
    `import { Input } from "../../components/Input"`.
    This is the ONLY external import of any primitive.

### Unit-spec alignment

16. `.haiku/intents/.../stages/development/units/unit-04-design-token-system.md`:
    - Remove lines 48-60 from `outputs:` (all six primitive files,
      all six test files, and the barrel). Leave only the
      `components/Input.tsx` and `components/__tests__/Input.test.tsx`
      additions if the builder wants to reflect the new layout, or
      leave the outputs block silent on primitives (the unit shipped;
      the FB-18 fix-bolt adjusts the footprint).
    - Line 76 (`Scope` block): change the bullet
      `packages/haiku-ui/src/components/primitives/ — Button, Badge,
      Card, Chip, Divider, Input — typed variants matching
      DESIGN-TOKENS §2.` to
      `packages/haiku-ui/src/components/Input.tsx — typed Input
      variant matching DESIGN-TOKENS §2. Other primitives (Button,
      Badge, Card, Chip, Divider) deferred to a follow-up migration
      unit once consumers exist (see FB-18).`
    - Line 121 (`Completion Criteria`): replace
      `Every primitive component has a vitest + RTL test at
      packages/haiku-ui/src/components/primitives/__tests__/<name>.test.tsx
      asserting variant output + disabled state.` with
      `Input component has a vitest + RTL test at
      packages/haiku-ui/src/components/__tests__/Input.test.tsx
      asserting variant output + disabled state.`
17. `.haiku/intents/.../stages/development/units/unit-05-a11y-foundations.md`:
    - Remove line 54 (`packages/haiku-ui/src/components/primitives/Button.tsx`)
      from the `outputs:` list. That file no longer exists and
      unit-05 did not actually ship it (git blame confirms unit-04
      authored it).
18. `.haiku/intents/.../stages/development/units/unit-14-question-and-direction-pages.md`:
    - Line 103: the acceptance
      `Parameter inputs use canonical primitives (grep in
      DirectionPage.tsx for non-primitive <input> tags returns zero).`
      — rewrite to `Parameter inputs use the canonical Input
      component (grep in DirectionPage.tsx for non-Input <input>
      tags returns zero).` The spirit is preserved; the folder name
      goes away.

### Artifacts

19. `.haiku/intents/.../stages/development/artifacts/unit-04-tactical-plan.md`
    — if the planner's original tactical plan (bolt 1 of unit-04)
    enshrined the 6-primitive expansion, annotate it with a dated
    postscript: "Reduced to a single `Input` primitive by FB-18 fix
    bolt — aspirational primitives (Button/Badge/Card/Chip/Divider)
    deleted until consumers exist." Do NOT rewrite the plan's body;
    the historical record stays intact.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) Dead primitives are gone
test ! -e packages/haiku-ui/src/components/primitives/Badge.tsx
test ! -e packages/haiku-ui/src/components/primitives/Button.tsx
test ! -e packages/haiku-ui/src/components/primitives/Card.tsx
test ! -e packages/haiku-ui/src/components/primitives/Chip.tsx
test ! -e packages/haiku-ui/src/components/primitives/Divider.tsx
test ! -e packages/haiku-ui/src/components/primitives/index.ts

# (b) Orphan tests are gone
test ! -e packages/haiku-ui/src/components/primitives/__tests__/Badge.test.tsx
test ! -e packages/haiku-ui/src/components/primitives/__tests__/Button.test.tsx
test ! -e packages/haiku-ui/src/components/primitives/__tests__/Card.test.tsx
test ! -e packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx
test ! -e packages/haiku-ui/src/components/primitives/__tests__/Divider.test.tsx

# (c) The primitives/ folder itself is gone (after the move)
test ! -d packages/haiku-ui/src/components/primitives

# (d) Input is in its new home
test -f packages/haiku-ui/src/components/Input.tsx
test -f packages/haiku-ui/src/components/__tests__/Input.test.tsx

# (e) No stale imports reference the primitives barrel
! grep -rq 'components/primitives' packages/haiku-ui/src

# (f) DirectionPage imports Input from the new path
grep -q 'from "../../components/Input"' packages/haiku-ui/src/pages/direction/DirectionPage.tsx

# (g) TypeScript compiles
pnpm --filter haiku-ui typecheck
# or, if the workspace prefers: npx tsc --noEmit -p packages/haiku-ui

# (h) Test suite green (no missing modules, no broken imports)
pnpm --filter haiku-ui test

# (i) Bundle size — should drop by roughly the LOC we deleted,
#     modulo tree-shaking. Capture before/after for the commit.
pnpm --filter haiku-ui build
```

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
2. **Read every file immediately before writing.** This fix loop
   runs in parallel with other chains. In particular:
   - `pages/direction/DirectionPage.tsx` may be touched by FB-19 /
     FB-32 (design-direction / schema fixes) or by contrast/focus-ring
     chains. Re-read before rewriting the one import line.
   - `unit-04-design-token-system.md` and
     `unit-05-a11y-foundations.md` may be touched by other
     fix chains adjusting deliverables. Re-read before rewriting
     the outputs list.
3. Commit as a **single cohesive commit** with message
   `haiku: fix FB-18 bolt 1 (builder)`. The feedback is narrow and
   the fix is mechanical — one commit, no intermediate push.
4. Run verification commands (a)-(h) and paste the output into the
   commit message. (i) is nice-to-have but not required for closure.
5. If `pnpm --filter haiku-ui test` surfaces unrelated pre-existing
   failures, **do not use them as an excuse** — the no-excuses
   policy applies. Triage, note them in the commit body, and fix
   anything your deletions touched.

## Risks

- **Parallel-chain clobber (medium)** — `unit-04-design-token-system.md`
  is a popular target for output-list edits across the fix wave. If
  another chain has already rewritten the outputs block, reconcile
  by additive edit (remove the primitives lines, keep any other
  chain's additions). Mitigation: re-read the unit file immediately
  before writing.
- **`@haiku/shared` barrel re-exports (low)** — grep confirms zero
  matches, but the builder should re-run
  `grep -r "components/primitives" packages/` across all packages
  (not just haiku-ui) before committing. If any package outside
  haiku-ui depends on the barrel, that's a red flag — surface it in
  the commit body; do not paper over it with a compatibility shim.
- **Tree-shaking illusion (low)** — it's tempting to argue "the
  primitives are tree-shaken, so they cost zero bundle." The bundle
  cost is real (see FB-21 on 919 KB gzipped) but the *actual* cost
  being challenged here is architectural, not runtime. Dead code at
  the source level is dead code, tree-shaken or not. Do not ship a
  weakened version of this fix that keeps the files and adds
  `/* @__PURE__ */` annotations.
- **Design-team dissent (low)** — if someone argues the primitives
  should stay as the canonical target for a future migration wave,
  the answer is: write the migration wave, ship it, then the
  primitives are real. Shipping aspirational abstractions and
  calling them canonical is exactly the anti-pattern FB-18 names.

## Out of scope

- Full migration of legacy `components/Card.tsx`, ad-hoc buttons,
  inline badges, etc. to a new primitives layer. That's a separate
  unit. If the design team wants it, file it and prioritize it.
- Rewriting `components/Card.tsx` to match the deleted
  `primitives/Card.tsx` API. The legacy Card stays as-is; the
  duplicate just goes away.
- Paper / website sync. This is an internal package cleanup; no
  methodology concepts change.
- Re-opening the design-token-system unit to add new primitives.
  Unit-04 is `status: completed`; adjusting its deliverables list
  for a fix-loop is fine, but do not flip `status` or add new
  iterations.

## Done when

- All five dead primitive source files are deleted.
- All five orphan test files are deleted.
- `primitives/index.ts` is deleted; `primitives/` folder is removed.
- `Input.tsx` + its test live under
  `packages/haiku-ui/src/components/` and
  `packages/haiku-ui/src/components/__tests__/`.
- `DirectionPage.tsx:24` imports `Input` from the new path.
- Grep for `components/primitives` across `packages/haiku-ui/src`
  returns zero matches.
- `pnpm --filter haiku-ui typecheck` and
  `pnpm --filter haiku-ui test` pass.
- Unit-04, unit-05, and unit-14 deliverables / acceptance lines no
  longer reference the deleted primitives.
- Feedback-assessor closes FB-18 on the next bolt.
