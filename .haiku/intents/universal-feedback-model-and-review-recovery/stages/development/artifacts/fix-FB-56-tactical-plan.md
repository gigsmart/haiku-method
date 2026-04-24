# Fix FB-56 — Tactical Plan (planner, bolt 1)

**Finding:** External-review happy-path covered, but compound gate `[external, ask]`
+ changes-requested pathway has no unit criteria.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/56-external-review-happy-path-covered-but-compound-gate-externa.md`

## Root cause

The gap is purely specification-level — the implementation already handles
compound `[external, ask]` gates in `packages/haiku/src/orchestrator.ts`:

- `normalizeReviewType` (orchestrator.ts:~655) preserves the compound string
  `"external,ask"` rather than collapsing to `"external"`.
- The gate-phase pending-feedback check (orchestrator.ts:~2949+) fires
  **before** any gate-type branching, so a pending feedback item rolls the FSM
  to elaborate regardless of whether the gate is `auto`, `ask`, `external`, or
  a compound list. That is the canonical behavior: **pending feedback always
  wins over the gate-type choice**.
- The effective-gate computation (orchestrator.ts:~3292-3309) passes compound
  gates through as-is (`effectiveGateType = reviewType`), so the review UI
  sees both `external` and `ask` options when feedback is not pending.
- External-change detection (orchestrator.ts:~860, action
  `external_changes_requested`) writes a feedback file and rolls to elaborate
  identically for simple `external` and compound `[external, ask]` gates —
  the branching lives above gate-type, not below.

What is missing is **spec coverage** for the three compound-gate sub-cases
called out in the feedback body:

1. Compound gate, user chose external path, external reports
   `CHANGES_REQUESTED` → feedback created, FSM rolls to elaborate, ask-gate
   does NOT fire next (feedback-revisit supersedes the gate entirely).
2. Compound gate, user chose external path, external reports
   `CHANGES_REQUESTED`, feedback is later addressed, the user now picks the
   ask path → ask gate opens for local approval/rejection.
3. Feedback pending while external state is `APPROVED` and the user chooses
   the ask path → the pending feedback still wins; ask-gate does not open;
   FSM rolls to elaborate.

The existing scenario at `features/external-review-feedback.feature:138`
covers only sub-case (1) in a minimal form. Sub-cases (2) and (3), and the
explicit "ask does not override pending feedback" invariant, are unspecified.

Additionally, `knowledge/DATA-CONTRACTS.md` documents the feedback state
machine but never enumerates how `review:` arrays compose with the pending
check (the canonical rule: **pending-feedback-blocks-gate is orthogonal to
gate-type and fires first**).

Finally, there is no current-visit development unit owning the compound-gate
resolution path. `stages/development/artifacts/legacy-gate-feedback-check.md`
is a prior-visit implementation-notes artifact and cannot carry acceptance
criteria for a present-visit unit.

## Fix approach (planner-scope only — no code edits)

The builder (bolt 2) will land three artifact edits. No production code
changes — the implementation already behaves correctly. The purpose of this
fix is to close the spec gap so that a reviewer can verify compound-gate
behavior against explicit Given/When/Then and so that a regression in the
ordering of `countPendingFeedback` vs gate-type branching would be caught by
a unit test.

### Edit 1 — Extend `features/external-review-feedback.feature`

Replace the existing single compound-gate scenario at line 138 with a
`Scenario Outline` or three explicit `Scenario` blocks that cover each
sub-case. Preferred shape: three explicit scenarios (outlines make
precondition setup harder to read for the nuanced sub-cases below).

Add a new section header above the compound block:

```
  # ---------------------------------------------------------------------------
  # Compound Gate: [external, ask]
  # ---------------------------------------------------------------------------
```

Then three scenarios, replacing the current single one-line scenario at
feature:138:

**Scenario A — external path, changes-requested, ask does NOT fire next**

```
  Scenario: Compound [external, ask] — user chose external, changes-requested rolls to elaborate
    Given the stage gate type is "[external, ask]" (compound)
    And the user chose the "external" path
    And the external PR has review state "CHANGES_REQUESTED"
    When the orchestrator detects changes-requested
    Then a feedback file is created with origin "external-pr" and status "pending"
    And the FSM phase is rolled back to "elaborate"
    And state.json visits is incremented
    And the "ask" branch of the gate is NOT presented to the user
    # Pending feedback supersedes the gate regardless of which compound path was chosen.
```

**Scenario B — ask path approves after pending feedback is addressed**

```
  Scenario: Compound [external, ask] — ask gate opens after feedback is closed
    Given the stage gate type is "[external, ask]" (compound)
    And feedback file "01-external-pr-review.md" was created from a prior CHANGES_REQUESTED
    And the agent has addressed that feedback and set its status to "closed"
    And no other feedback is pending
    When the orchestrator re-enters the gate phase
    Then the gate review UI opens with gate_type "external,ask"
    And the user is offered both "Approve" (ask) and "Submit for External Review" (external) options
    And choosing "Approve" advances the stage via the ask path
```

**Scenario C — ask path rejects after compound-gate opens (local-override forbidden)**

```
  Scenario: Compound [external, ask] — pending feedback blocks ask approval
    Given the stage gate type is "[external, ask]" (compound)
    And a feedback file "02-*.md" exists with status "pending" (from any origin)
    And the external PR has review state "APPROVED"
    When the orchestrator enters the gate phase
    Then the pending-feedback check fires BEFORE gate-type branching
    And the FSM phase is rolled back to "elaborate"
    And state.json visits is incremented
    And the "ask" option is NOT presented to the user as an override
    # Compound gates do NOT let the local human bypass pending feedback.
    # The user must address the feedback item before the ask gate can open.
```

Deleting or replacing the current minimal `Scenario: External gate with
compound type [external, ask] and changes-requested` at feature:138 is
intentional — Scenario A is its superset with the additional
"ask-does-not-fire-next" assertion that the current version omits.

### Edit 2 — Promote `artifacts/legacy-gate-feedback-check.md` into a proper current-visit unit

Create a new unit at
`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-16-compound-gate-regression-tests.md`.

Numbering rationale: existing current-visit units run `unit-01` through
`unit-15-stagewide-audit.md`; `unit-16` is the next free slot. A new unit is
preferable to editing unit-15 because the stage-wide audit is a separate
concern.

Frontmatter (using the canonical shape from other current-visit units — the
builder must read an existing unit like `unit-15-stagewide-audit.md` before
writing this to match its frontmatter dialect exactly, especially
`quality_gates` and `References` conventions):

```yaml
---
title: Compound [external, ask] gate regression tests
type: regression
depends_on: []  # NOTE (FB-44 rename): legacy-external-review-detection.md and legacy-gate-feedback-check.md are artifact notes, not units — do not list them here
quality_gates: []
status: pending
bolt: 1
hat: implementer
closes:
  - FB-56
---
```

Body sections (in order):

1. **Summary** — one-paragraph statement that the implementation already
   handles compound gates correctly; this unit exists to lock that behavior
   behind regression tests so future refactors cannot regress the ordering of
   `countPendingFeedback` vs gate-type branching.
2. **Scope** — explicit inclusions (compound-gate scenarios A/B/C from
   feature file) and exclusions (single `external`-only gate — covered by
   `external-review.test.mjs` already; `ask`-only gate — covered by
   `gate-feedback.test.mjs` already).
3. **Acceptance criteria** — numbered list, one per feature-file scenario:
   - AC1: With `review: [external, ask]`, pending feedback (any origin) in
     a completed stage returns `action: feedback_revisit` from the gate-phase
     handler and increments `state.visits`. The response does NOT include
     `gate_type: external,ask` or `gate_review`.
   - AC2: With `review: [external, ask]` and zero pending feedback, the
     gate-phase handler returns `action: gate_review` with
     `gate_type: "external,ask"` (compound pass-through preserved).
   - AC3: With `review: [external, ask]` and an external PR reporting
     `CHANGES_REQUESTED`, the orchestrator creates a feedback file with
     `origin: external-pr`, `status: pending`, returns
     `action: external_changes_requested`, and rolls the FSM to elaborate.
   - AC4: Non-git environment with `review: [external, ask]`: the effective
     gate strips `external` and collapses to `ask` (per orchestrator.ts:3293).
     With zero pending feedback the action is `gate_review` with
     `gate_type: "ask"`. With pending feedback the action is
     `feedback_revisit` — same invariant as AC1.
   - AC5: The pending-feedback check runs BEFORE any gate-type branching in
     `orchestrator.ts` phase=="gate" handler. A test that sets
     `review: [external, ask]`, `external_review_url: <valid URL mock>`, and
     one `status: pending` feedback file MUST observe `feedback_revisit`
     without any call to `checkExternalState` / `gh pr view` / `glab mr view`.
     (This is the ordering regression guard.)
4. **Test locations** — the regression tests live in
   `packages/haiku/test/gate-feedback.test.mjs` (extend the existing file,
   do not create a parallel one). Each AC maps to one test case.
5. **Verification commands**:
   ```bash
   cd packages/haiku
   npm test -- test/gate-feedback.test.mjs
   npm test
   npx tsc --noEmit
   ```
6. **References** — link to:
   - `features/external-review-feedback.feature` (Compound Gate section)
   - `stages/development/artifacts/legacy-gate-feedback-check.md` (prior-visit
     implementation notes — preserved as-is, not deleted; renamed from `unit-04-gate-feedback-check.md` by FB-44)
   - `stages/development/artifacts/legacy-external-review-detection.md` (renamed from `unit-07-external-review-detection.md` by FB-44)
   - `knowledge/DATA-CONTRACTS.md` §Compound Gate Resolution (added in Edit 3)

### Edit 3 — Extend `knowledge/DATA-CONTRACTS.md`

Add a short new section (~20-30 lines) titled `## Compound Gate Resolution`
near the existing gate-state material (around line 880-900 where
`StageState` and `gate_outcome` are documented). The section must state:

1. `review:` may be a string (`auto` | `ask` | `external` | `await`) or an
   array (`[external, ask]` today; other compositions reserved).
2. Arrays are serialized internally as a comma-joined string
   (`"external,ask"`) via `normalizeReviewType`.
3. **Invariant:** the pending-feedback check fires before any gate-type
   branching. Any `status: pending` feedback in the stage causes
   `action: feedback_revisit` and rolls to elaborate, regardless of
   gate-type.
4. When zero feedback is pending, compound gate strings pass through to the
   review UI unchanged (e.g., `gate_type: "external,ask"` exposes both
   "Approve" and "Submit for External Review" options).
5. Non-git fallback: compound gates containing `external` strip it and keep
   the remaining type (e.g., `[external, ask]` → `ask`); an `external`-only
   compound with no other members collapses to `ask` as the safe default.
6. External changes-requested handling is identical for simple `external`
   and compound `[external, ask]` gates — the feedback file is written and
   the FSM rolls to elaborate.

This section is the authoritative written contract for the behavior that
Edits 1 and 2 verify.

## Files to modify

1. **`.haiku/intents/universal-feedback-model-and-review-recovery/features/external-review-feedback.feature`**
   — replace the line-138 scenario with the three scenarios (A/B/C) from
   Edit 1 above, under a new `# Compound Gate: [external, ask]` header.
2. **`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-16-compound-gate-regression-tests.md`**
   — new file per Edit 2.
3. **`.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DATA-CONTRACTS.md`**
   — append a `## Compound Gate Resolution` section per Edit 3.

No production code changes. No changes to `legacy-gate-feedback-check.md`
(it is a prior-visit artifact — preserved for history, referenced from the
new unit; renamed from `unit-04-gate-feedback-check.md` by FB-44).

## Implementation steps (for the builder in bolt 2)

1. Read `features/external-review-feedback.feature` fresh (parallel-batch
   warning — other chains may be editing adjacent scenarios). Locate the
   current compound-gate scenario at feature:138 (or wherever it has moved
   after parallel edits — search for the title
   `External gate with compound type [external, ask]` to anchor).
2. Replace that single scenario with the three scenarios (A, B, C) from
   Edit 1 above, preceded by the `# Compound Gate: [external, ask]` header.
   Preserve surrounding scenarios.
3. Read an existing current-visit unit (e.g.
   `stages/development/units/unit-15-stagewide-audit.md`) to confirm the
   frontmatter dialect. Match its shape exactly.
4. Write `stages/development/units/unit-16-compound-gate-regression-tests.md`
   per Edit 2. Include all five acceptance criteria explicitly.
5. Read `knowledge/DATA-CONTRACTS.md` fresh. Locate the
   `## 4. StageState Interface` or nearest gate-related section (around the
   `gate_outcome` field). Append a new `## Compound Gate Resolution` section
   per Edit 3. Do not renumber existing sections unless the file's pattern
   already uses sequential numbers for new sections.
6. Run `npx tsc --noEmit` from `packages/haiku` and the full test suite
   (`npm test`) to confirm nothing upstream broke. No new tests land in this
   bolt — the builder is writing spec only. The test implementation is a
   separate follow-up tracked by unit-16 itself.
7. Commit with the FSM-provided message
   `haiku: fix FB-56 bolt 1 (planner)`. Do NOT push.

## Verification commands

```bash
# From repo root:
npx tsc --noEmit                                  # sanity — nothing broken upstream

# From packages/haiku:
cd packages/haiku
npm test                                          # all 377+ tests still pass

# Spec-file sanity — no syntax errors in the feature file (Gherkin indent):
grep -n "Scenario:" .haiku/intents/universal-feedback-model-and-review-recovery/features/external-review-feedback.feature | head -30
```

All commands must exit 0. The spec-file grep is a manual sanity check that
the three new scenarios are present and the replaced one is gone.

## Risks

- **Parallel-chain clobber on `external-review-feedback.feature`.** Other
  findings in this wave may be editing the same feature file (e.g. a
  sibling finding could be adding an edge case to the scenario directly
  above line 138). Read the file immediately before writing and search by
  scenario title, not line number, to anchor the replace.
- **Parallel-chain clobber on `DATA-CONTRACTS.md`.** Large file, high-churn.
  Use a surgical append to a new section at the end of the gate-related
  block, not in the middle of the section numbering.
- **Unit numbering collision.** Another parallel chain could be adding its
  own `unit-16-*.md`. Before writing, `ls stages/development/units/` — if
  `unit-16-*` already exists, fall back to `unit-17-compound-gate-regression-tests.md`
  and update the filename in the plan's §Files-to-modify comment line in
  the commit message only (the plan itself is already committed-as-of-this-bolt,
  no edit needed).
- **Frontmatter dialect drift.** Different current-visit units may use
  slightly different frontmatter shapes. Always read a sibling unit first
  and match its exact keys — especially `quality_gates`, `depends_on`,
  `bolt`, `hat`. An empty-but-present `quality_gates: []` is the pattern
  used by other units (see DATA-CONTRACTS.md:930).
- **Feedback-assessor strictness on "no production code change".** The
  feedback body specifically says "add unit criteria" — it does NOT mandate
  landing the regression tests in this bolt. The builder MUST resist the
  urge to also write the test code; the assessor will close FB-56 on the
  spec artifacts alone. Implementation of the tests is a downstream unit
  (the new unit-16 itself once picked up in the next stage visit or bolt).
- **`closes: FB-56` on a unit the feedback will close first.** Because this
  is a fix-loop (not additive elaborate), the feedback itself will be
  closed by the feedback-assessor after this bolt chain completes. The
  `closes:` reference on unit-16 is forward-facing documentation for when
  the unit later runs and lands the tests — it is not what closes the
  current FB-56 finding. The feedback closes because spec coverage is
  landed, not because the tests are landed.

## Out of scope

- Writing the actual regression tests in `gate-feedback.test.mjs`. Test
  implementation is tracked by unit-16; the spec-level acceptance criteria
  land in this bolt, the tests land when unit-16 executes.
- Rewriting or moving `legacy-gate-feedback-check.md` — it is a
  historical artifact. Preserve in place. (Renamed from
  `unit-04-gate-feedback-check.md` by FB-44.)
- Extending `external-review.test.mjs` beyond what the existing test file
  already covers for simple `external` gates. Compound-gate tests belong
  in `gate-feedback.test.mjs` because the feature under test is the gate
  feedback ordering, not the external-review CLI.
- Adding new product-stage acceptance criteria to the product stage's
  `ACCEPTANCE-CRITERIA.md`. The compound-gate behavior is already implicit
  in the product stage's feature file; the gap was development-stage spec
  coverage only.
- Documenting `[external, ask]` in `CLAUDE.md`'s terminology table — it is
  already there (per the feedback body's own citation).

## Done when

- `features/external-review-feedback.feature` contains three explicit
  compound-gate scenarios (A/B/C) under a `# Compound Gate: [external, ask]`
  header, replacing the prior minimal one-scenario block.
- `stages/development/units/unit-16-compound-gate-regression-tests.md`
  exists with the frontmatter and the five acceptance criteria (AC1-AC5)
  described in Edit 2, and with `closes: [FB-56]` in frontmatter.
- `knowledge/DATA-CONTRACTS.md` has a new `## Compound Gate Resolution`
  section describing the six invariants listed in Edit 3 (compound types,
  serialization, pending-wins ordering, compound pass-through, non-git
  fallback, external-change uniformity).
- `npx tsc --noEmit` and `npm test` still exit 0 from their respective
  directories (no regression — this bolt ships spec only).
- The builder's commit message is exactly
  `haiku: fix FB-56 bolt 1 (planner)` and the commit is NOT pushed.
