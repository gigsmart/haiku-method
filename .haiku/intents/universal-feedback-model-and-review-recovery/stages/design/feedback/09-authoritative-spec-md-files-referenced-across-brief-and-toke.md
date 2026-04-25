---
title: >-
  Authoritative spec .md files referenced across brief and tokens do not exist
  in artifacts
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:19:57Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-09:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF and DESIGN-TOKENS repeatedly cross-reference a family of markdown spec files at paths like `stages/design/artifacts/{spec}.md`, each declared as the single source of truth for a concrete policy. None of these files exist in the tree:

**Referenced but missing:**

| File | Referenced by | Role claimed |
|---|---|---|
| `stages/design/artifacts/state-coverage-grid.md` | DESIGN-BRIEF §2 lines 117–119 | "template" / canonical rows for every §2 component's six-state grid — a hard gate per "design-reviewer hat walks this grid row-by-row before approval" |
| `stages/design/artifacts/component-inventory.md` | DESIGN-BRIEF §9 line 907 + Retired Components note line 601 | "per-component rationale" cross-reference; §9 explicitly says "§9 deliberately does not duplicate those rows" |
| `stages/design/artifacts/footer-button-copy-spec.md` | DESIGN-BRIEF §2 lines 265, 538, 646 + DESIGN-TOKENS | Brief says it "is an alias pointing at this table — if the two disagree, this table wins" — but the alias file is absent |
| `stages/design/artifacts/touch-target-audit.md` | DESIGN-BRIEF §4 lines 692, DESIGN-TOKENS §1.7.1 lines 195, 200 | "per-control audit and fix matrix"; the gate greps for specific patterns using this file |
| `stages/design/artifacts/aria-landmark-spec.md` | DESIGN-BRIEF §2 line 208, §6 lines 806–823 (×5), DESIGN-TOKENS §2.2 line 286, §2.2 line 311 | Canonical emoji source (§6), dialog contract, landmark spec, focus-trap pattern |
| `stages/design/artifacts/aria-live-sequencing-spec.md` | DESIGN-BRIEF §6 lines 801, 809, 823 | Canonical live-region copy, coalescing rules, card sequencing |
| `stages/design/artifacts/contrast-and-type-audit.md` | DESIGN-BRIEF §6 line 768, DESIGN-TOKENS §1.7 line 170, §2.3 line 371, 398 | Full measured contrast audit; cited 4× as the source of specific ratio numbers |
| `stages/design/artifacts/motion-and-reduced-motion-spec.md` | DESIGN-TOKENS §5 line 571 | Per-animation reduced-motion policy |

## Verification

```
find .haiku/intents/universal-feedback-model-and-review-recovery -name "state-coverage*" -o -name "component-inventory*" -o -name "footer-button-copy*" -o -name "touch-target*" -o -name "aria-landmark*" -o -name "aria-live-sequencing*" -o -name "contrast-and-type-audit*" -o -name "motion-and-reduced-motion*"
# → no matches
```

The `stages/design/artifacts/` directory contains only `.html` artifacts + `state-signaling-inventory.html`. Zero `.md` spec files.

## Impact

- The "design-reviewer hat walks this grid row-by-row before approval" clause in DESIGN-BRIEF §2 line 119 can never pass — the grid does not exist, so the gate cannot be enforced.
- The brief's own cross-reference logic collapses: it defers authoritative details to files that aren't there. Readers have no ground truth for footer-button copy (alias only), aria-live sequencing (cited but empty), touch-target audit (gate greps reference missing file), contrast audit (specific ratio numbers cited with no source).
- Sync-check rule (from `.claude/rules/sync-check.md`) cannot verify DESIGN-BRIEF <-> paper <-> implementation because the per-component specs have nothing to compare against.
- The FB-56 extension clause (§2 line 119): "Adding a new component to §2 without simultaneously adding a row in the grid is a hard fail at the design-reviewer gate" — this is already failed for every §2 component, because the grid itself doesn't exist.

## Fix

Either (a) create each referenced `.md` file with the content the brief promises it contains, or (b) fold the referenced content into DESIGN-BRIEF / DESIGN-TOKENS sections and remove every external cross-reference. Option (a) matches the authoring intent (each file was clearly planned as a focused per-dimension spec); option (b) is lighter weight but collapses the brief into a single mega-document.

Minimum viable fix: materialize the four most-cited files (`state-coverage-grid.md`, `footer-button-copy-spec.md`, `aria-landmark-spec.md`, `contrast-and-type-audit.md`) before the design-reviewer gate can pass.

## Files
- Everywhere in `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md` that references `artifacts/*.md`
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:170, 286, 311, 371, 398, 571`
- Missing from: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/`
