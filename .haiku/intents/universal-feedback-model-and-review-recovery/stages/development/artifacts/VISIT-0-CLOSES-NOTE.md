# Visit 0 — `closes:` convention applicability note

**Stage:** `development`
**Visit:** 0 (initial implementation pass — see `stages/development/state.json` -> `"visits": 0`)
**Purpose:** Document, per the remedy offered in FB-52 option (b), why the `closes: [FB-NN]` unit-frontmatter contract from `knowledge/DATA-CONTRACTS.md §5` is not exercised on any of the 15 units in this visit, and how the feedback items surfaced during this visit are instead validated.

---

## Why no unit declares `closes:` on this visit

The `closes:` field is **conditionally required**, not universally required. Two authoritative sources scope it to `visits > 0`:

### 1. `knowledge/DATA-CONTRACTS.md §5.1` — field definition

> `closes` | `string[]` | **conditional** | `[]` | **Required on new units when `visits > 0`** (additive elaborate mode). Each entry must be a valid `FB-NN` reference for a pending feedback item in the same stage.

### 2. `knowledge/DATA-CONTRACTS.md §5.4` — validation rules

> - **When `visits > 0`:** Every new unit (units added during the additive elaborate phase) MUST have a non-empty `closes` array. Units from prior visits (already `completed`) are exempt.
> - **When `visits == 0`:** The `closes` field is optional and defaults to `[]`. Normal elaboration does not require feedback references.

### 3. `features/additive-elaborate.feature:14` — happy-path scenario

> Scenario: First-time elaborate operates in standard mode
>   Given state.json visits is 0 (or absent)
>   And no feedback files exist
>   When the elaborate phase handler fires
>   Then the returned action is the standard elaborate action (not "additive_elaborate")
>   **And the instruction does not mention "closes:" or frozen units**
>   And all units are editable

This stage is in exactly that state: `visits == 0` and the 15 originally-elaborated units in `units/unit-01`..`units/unit-15` were authored during normal (non-additive) elaboration. Per the spec, `closes:` is **correctly absent** from those 15 units.

### Single exception: `unit-16-backend-feedback-regression-gate.md`

After the 15 original units were authored, FB-25 surfaced from `completeness (from product)` adversarial review. FB-25 called out that core backend feedback-model behaviors had no current-visit unit binding them to a regression gate. The response was to author **one new current-visit unit** (`unit-16-backend-feedback-regression-gate.md`) with explicit `closes: [FB-25]` frontmatter, even though state.json still reports `visits: 0`.

This is intentional and spec-consistent:

- §5.4 of `DATA-CONTRACTS.md` says `closes:` is **optional** (not forbidden) when `visits == 0`. Emitting it when the unit genuinely closes a pending feedback item is not a contract violation — it is over-disclosure, which the reviewer explicitly asked for in option (a).
- `features/additive-elaborate.feature:14` only asserts that the standard-elaborate *instruction* does not mention `closes:`. It does not prohibit a unit authored outside the standard-elaborate path (which unit-16 was — it was introduced mid-visit specifically to close FB-25) from declaring the field.

So the factual statement about this stage is: **15 of 16 units correctly omit `closes:` (spec-exempt at visits=0); 1 unit (unit-16) opts in because it was authored specifically to close a specific pending feedback item**. `grep -l '^closes:' stages/development/units/*.md` therefore returns `unit-16-...` and nothing else.

---

## Why the 10 stage-entry feedback items do NOT trigger the `closes:` contract

The 10 feedback items present in `stages/development/feedback/` (FB-01 through FB-10) were **authored during unit execution in this same visit**, not carried over from a prior visit. `closes:` targets cross-visit feedback carry-over; in-visit findings are resolved by the stage's `fix_hats` pipeline (`planner` -> `feedback-assessor`) through `fix-FB-NN-tactical-plan.md` artifacts.

Evidence (from feedback frontmatter, snapshot at FB-52 bolt 2):

| FB | `source_ref` | `status` | Resolution path |
|----|--------------|----------|-----------------|
| FB-01 | `unit-02-mcp-consume-haiku-api/reviewer/bolt-2` | `closed` | `closed_by: fix-loop:FB-01:bolt-2` |
| FB-02 | `unit-03-extract-haiku-ui-package/reviewer/bolt-1` | `addressed` | `closed_by: fix-loop:FB-02:bolt-2` |
| FB-03 | `unit-03-extract-haiku-ui-package/reviewer/bolt-1` | `addressed` | `closed_by: fix-loop:FB-03:bolt-2` |
| FB-04 | `unit-03-extract-haiku-ui-package/reviewer/bolt-1` | `addressed` | `closed_by: fix-loop:FB-04:bolt-2` |
| FB-05 | `unit-03-extract-haiku-ui-package/builder/bolt-2` | `rejected` | `upstream_stage: product` (routed out of this stage) |
| FB-06 | `unit-03-extract-haiku-ui-package/builder/bolt-2` | `rejected` | `upstream_stage: product` (routed out of this stage) |
| FB-07 | `unit-08-feedback-components reviewer bolt 1` | `closed` | `closed_by: fix-loop:FB-07:bolt-2` |
| FB-08 | `packages/haiku-ui/scripts/audit-lighthouse.mjs:45-52` | `closed` | `closed_by: fix-loop:FB-08:bolt-2` |
| FB-09 | `packages/haiku-ui/scripts/audit-lighthouse.mjs` | `closed` | `closed_by: fix-loop:FB-09:bolt-2` |
| FB-10 | `unit-06-shell-and-routing/reviewer/bolt-2` | `closed` | `closed_by: fix-loop:FB-10:bolt-2` |

Every item has a traceable resolution path through fix-mode artifacts or explicit upstream routing. Reviewer traceability from FB to the unit that surfaced it is available through `source_ref`; reviewer traceability from FB to the fix that closes it is available through either `closed_by` or the matching `fix-FB-NN-tactical-plan.md` artifact.

Retroactively annotating the 15 originally-elaborated units with `closes: [FB-NN]` would **violate** two spec rules:

1. `DATA-CONTRACTS.md §5.4` scopes `closes:` to "new units (units added during the additive elaborate phase)." The original 15 units were not.
2. `features/additive-elaborate.feature:14` explicitly says the instruction for visit 0 "does not mention 'closes:' or frozen units." Agents generating those 15 units correctly did not emit the field.

The one unit authored **after** feedback existed and specifically to close an FB — unit-16 — does carry the field, demonstrating that the `closes:` contract is exercised in this stage when it is semantically applicable.

---

## What happens on the next visit

If this stage enters visit 1 with any of FB-01..FB-10 still `pending` (or any new pending feedback accumulated between now and then), `DATA-CONTRACTS.md §5.4` and `additive-elaborate.feature:26` ("Additive elaborate includes pending feedback in instruction") activate:

- Completed units from visit 0 become frozen and read-only.
- Any new unit authored in visit 1 MUST declare `closes: [FB-NN]` for each feedback item it claims to address.
- DAG validation rejects new units without `closes:` (`additive-elaborate.feature:75`) and new units referencing non-existent feedback IDs (`additive-elaborate.feature:82`).

Until then, the stage correctly operates in standard (non-additive) mode, and the absence of `closes:` on units is spec-compliant behavior, not a contract violation.

---

## Cross-references

- Spec: `knowledge/DATA-CONTRACTS.md §5` ("Unit Frontmatter Additions")
- Feature: `features/additive-elaborate.feature` (scenarios at lines 14, 26, 40, 75, 82, 113)
- Coverage: `knowledge/COVERAGE-MAPPING.md` -> SC-7 "Additive elaborate mode" (expects visits=0 normal elaborate as happy path)
- This note was produced in response to `feedback/52-closes-fb-nn-contract-from-product-spec-is-not-used-on-any-c.md` option (b).
