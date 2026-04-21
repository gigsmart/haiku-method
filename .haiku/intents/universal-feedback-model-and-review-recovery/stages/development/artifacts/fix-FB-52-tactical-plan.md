# Fix FB-52 — Tactical Plan (planner, bolt 1)

**Finding:** `closes: [FB-NN]` contract from product spec is not used on any current-visit unit despite 10 open FB items at stage entry.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/52-closes-fb-nn-contract-from-product-spec-is-not-used-on-any-c.md`

## TL;DR

This is a **documentation gap, not a code gap**. The 15 units in this stage correctly omit `closes:` because `state.json` records `visits: 0` — which `knowledge/DATA-CONTRACTS.md §5.4` and `features/additive-elaborate.feature` scenarios "First-time elaborate operates in standard mode" + "visits=0 normal elaborate" explicitly exempt from the `closes:` requirement. The 10 feedback files the reviewer cites were **created during unit execution** (timestamps 2026-04-21T04:39Z through 13:49Z, all after unit authorship), not "at stage entry" as the finding title implies. They cannot be retroactively referenced by `closes:` because (i) the spec forbids declaring `closes:` on already-completed units, and (ii) fix-mode handles them via the parallel fix-loop chains, which is the mechanism the spec prescribes for findings surfaced during a visit — not for findings surfaced in a subsequent additive-elaborate pass.

The real remedy the reviewer offered as option (b): write down, on this stage, why `closes:` was not used in visit 0. That is what this fix does.

## Root cause

Three interacting facts produce the finding:

1. **State is visits=0.** `stages/development/state.json` -> `"visits": 0`. Per `DATA-CONTRACTS.md §5.4`, the `closes:` field is optional when `visits == 0`. `additive-elaborate.feature:14` codifies this: *"First-time elaborate operates in standard mode ... the instruction does not mention 'closes:' or frozen units."*
2. **Feedback files are fix-loop findings, not additive-elaborate triggers.** The 10 FB items (FB-01 through FB-10) were authored by adversarial-review subagents during each unit's reviewer hat bolts, then dispatched to the stage's `fix_hats` pipeline (planner → feedback-assessor) in the same visit. That pipeline writes `fix-FB-NN-tactical-plan.md` artifacts (see `artifacts/fix-FB-01-tactical-plan.md` etc.), not new units.
3. **The `closes:` contract targets a different loop.** `closes:` is the mechanism by which **new units authored in an additive-elaborate pass (visits > 0)** claim pending feedback carried over from a prior visit. It is not the mechanism by which in-visit fix-loop findings are resolved.

The finding conflates these two loops. The stage's actual defect would be the inverse: authoring new units in this visit with `closes: [FB-NN]` entries would itself violate the spec, because fix-mode per-finding chains already own those feedback items and none of them are carried over from a prior visit.

## Remedy

Option (b) from the feedback body: document, inside this stage, why `closes:` does not apply on visit 0 and how the 10 feedback items are validated instead.

### File changes

1. **Create** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/VISIT-0-CLOSES-NOTE.md`

   A single-purpose visit note that:
   - States the stage is in visit 0.
   - Quotes the spec rule from `knowledge/DATA-CONTRACTS.md §5.4`: `closes:` is optional when `visits == 0`.
   - Quotes the happy-path scenario from `features/additive-elaborate.feature` line 14 ("First-time elaborate operates in standard mode").
   - Lists the 10 feedback items created during this visit and maps each one to the unit it surfaced against and the fix-loop artifact that tracks its resolution.
   - States the contract that applies on the *next* visit: if any of FB-01..FB-10 remains pending when this stage enters visit 1, new units authored in that visit MUST declare `closes: [FB-NN]` per §5.4.

2. **No edits to** `units/*.md`, `STAGE.md`, `intent.md`, or the feedback files themselves.

Retroactive `closes:` annotation on existing units (option (a)) is explicitly rejected because:
- Units were authored before the feedback existed (feedback `created_at` > unit-authoring timestamps).
- `DATA-CONTRACTS.md §5.4` restricts `closes:` to units created during an additive-elaborate pass. Adding it to visit-0 units would make the artifacts lie about the mode they were produced in.
- Fix-loop tactical plans (`fix-FB-NN-tactical-plan.md`) already provide the machine-readable unit-to-feedback mapping the reviewer asked for.

## Verification

- [ ] `cat stages/development/state.json | grep visits` shows `"visits": 0`.
- [ ] `stages/development/artifacts/VISIT-0-CLOSES-NOTE.md` exists and references §5.4 of `knowledge/DATA-CONTRACTS.md` plus the specific feature-file scenario.
- [ ] Every FB-NN (01..10) listed in the note is traceable to either a `fix-FB-NN-tactical-plan.md` artifact or an explicit `status: rejected` / `upstream_stage: product` feedback frontmatter (FB-05, FB-06).
- [ ] No `closes:` field appears in `units/*.md` (`grep -l '^closes:' stages/development/units/*.md` still returns empty, by design).
- [ ] `feedback-assessor` hat can now trace the reviewer's concern to a stage artifact that documents the exemption rather than an un-annotated unit set.

## Risks

- **Low:** someone later reads the note without context and assumes `closes:` is never required on this stage. Mitigation: the note explicitly scopes itself to visit 0 and states what will change if the stage revisits.
- **Low:** the feedback-assessor may still reject if it re-reads the finding body literally. Mitigation: the note quotes the exact spec passages and feature scenario, which is the evidence the assessor needs.
