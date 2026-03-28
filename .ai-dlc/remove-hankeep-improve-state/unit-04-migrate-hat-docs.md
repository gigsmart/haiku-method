---
status: pending
last_updated: ""
depends_on:
  - unit-01-foundation-libraries
branch: ai-dlc/remove-hankeep-improve-state/04-migrate-hat-docs
discipline: documentation
pass: ""
workflow: ""
ticket: ""
---

# unit-04-migrate-hat-docs

## Description
Update all `han keep` and `han parse` references in hat documentation files to use the new foundation library API. Hats define role behaviors — agents wearing these hats need correct state management instructions.

## Discipline
documentation - Markdown content updates.

## Domain Entities
6 hat files with 9 total han references:
- planner.md (3): han keep save for current-plan.md, han parse yaml for hat discovery
- red-team.md (2): han keep save for blockers
- hypothesizer.md (1): han keep save for scratchpad
- experimenter.md (1): han keep save for scratchpad
- builder.md (1): han keep load for current-plan
- observer.md (1): han keep save for scratchpad

## Technical Specification

### Replacement Pattern
All hat file references follow the same pattern — replace `han keep save/load` with `dlc_state_save/load`:

```markdown
# Before:
han keep save scratchpad.md "..."
han keep load current-plan.md

# After:
dlc_state_save "$INTENT_DIR" "scratchpad.md" "..."
dlc_state_load "$INTENT_DIR" "current-plan.md"
```

For han parse yaml in planner.md (hat discovery):
```markdown
# Before:
name=$(han parse yaml name -r < "$hat_file")

# After:
name=$(dlc_frontmatter_get "name" "$hat_file")
```

### Note on Recent Fixes
Several hat files were already updated today (2026-03-27) to use `han keep save <filename> "..."` syntax instead of the older `han keep --branch` syntax. These still need migration to `dlc_state_save`.

## Success Criteria
- [ ] Zero `han keep` or `han parse` references remain in any hat .md file
- [ ] All state save/load instructions use dlc_state_save/load API
- [ ] planner.md hat discovery uses dlc_frontmatter_get instead of han parse yaml

## Risks
- **Low risk**: Only 9 references across 6 files, all following the same simple pattern.

## Boundaries
This unit updates hat .md files ONLY. It does NOT modify executable hook code (Unit 2) or skill files (Unit 3).

## Notes
- Small unit, can be completed quickly
- Verify the recently-updated han keep syntax (from today's review fixes) maps cleanly to the new API
