---
status: pending
last_updated: ""
depends_on:
  - unit-01-foundation-libraries
branch: ai-dlc/remove-hankeep-improve-state/03-migrate-skill-docs
discipline: documentation
pass: ""
workflow: ""
ticket: ""
---

# unit-03-migrate-skill-docs

## Description
Update all `han keep` and `han parse` references in skill documentation (SKILL.md files) to use the new foundation library API. These are instructions that agents follow during construction — they must reference the correct commands.

## Discipline
documentation - Markdown content updates.

## Domain Entities
15 skill files with 145 total han references:
- advance/SKILL.md (35): han keep save/load for iteration state, han parse json/yaml
- execute/SKILL.md (34): han keep save/load for iteration state, state management examples
- elaborate/SKILL.md (13): han keep save, han parse yaml for intent discovery
- refine/SKILL.md (12): han keep save/load for iteration and plan state
- reset/SKILL.md (11): han keep clear/delete for state cleanup
- fundamentals/SKILL.md (10): han keep/parse in concept explanations
- reflect/SKILL.md (9): han keep save/load for reflection state
- resume/SKILL.md (5): han keep load for state restoration
- operate/SKILL.md (5): han keep save/load for operation state
- fail/SKILL.md (4): han keep save/load for iteration state
- blockers/SKILL.md (3): han keep save/delete for blocker management
- followup/SKILL.md (2): han keep load for prior intent context
- completion-criteria/SKILL.md (1): han keep reference
- backpressure/SKILL.md (1): han hook stats reference

## Technical Specification

### Replacement Patterns for Documentation

Replace `han keep` references with file-based state:
```markdown
# Before:
han keep save iteration.json "$STATE"
han keep load iteration.json --quiet

# After:
dlc_state_save "$INTENT_DIR" "iteration.json" "$STATE"
dlc_state_load "$INTENT_DIR" "iteration.json"
```

Replace `han parse` references with parse.sh functions:
```markdown
# Before:
STATUS=$(echo "$JSON" | han parse json status -r --default active)

# After:
STATUS=$(echo "$JSON" | dlc_json_get "status" "active")
```

Replace `han parse yaml-set` with frontmatter functions:
```markdown
# Before:
han parse yaml-set status "complete" < "$file" > "$file.tmp" && mv "$file.tmp" "$file"

# After:
dlc_frontmatter_set "status" "complete" "$file"
```

Replace `han hook stats` references:
```markdown
# Before:
han hook stats

# After (remove or replace with):
# Hook statistics are available via Claude Code's built-in metrics
```

### Key Considerations
- Skills contain both instructional text AND code examples. Both must be updated.
- Some skills show `han keep` in user-facing output strings (e.g., "Run `han keep save ...`"). These must reference the new API.
- `fundamentals/SKILL.md` has explanatory content about han keep as a concept — this needs rewriting to explain file-based state.
- `reset/SKILL.md` uses `han keep clear --branch` for cleanup — needs equivalent file-based cleanup pattern.

## Success Criteria
- [ ] Zero `han keep`, `han parse`, or `han hook` references remain in any skill SKILL.md file
- [ ] All code examples in skills use dlc_state_save/load/delete and dlc_json_get/dlc_yaml_get patterns
- [ ] fundamentals/SKILL.md explains file-based state (not han keep)
- [ ] reset/SKILL.md uses file-based cleanup (rm -rf state directory) instead of han keep clear
- [ ] All state references use the `.ai-dlc/{slug}/state/` directory pattern

## Risks
- **Volume**: 145 references across 15 files is a large documentation sweep. Mitigation: Use grep to find all occurrences systematically, process file by file.
- **Context sensitivity**: Some references are in conditional logic or error handling paths that require understanding the surrounding code. Mitigation: Read full context around each reference before replacing.

## Boundaries
This unit updates SKILL.md files ONLY. It does NOT modify executable hook code (Unit 2) or hat files (Unit 4).

## Notes
- Process files in descending order of reference count (advance first, backpressure last) to get the highest-impact files done first
- The execute/SKILL.md and advance/SKILL.md files are the most complex — they contain full state management workflows
