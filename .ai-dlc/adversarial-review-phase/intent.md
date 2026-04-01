---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: ""
created: 2026-03-30
status: completed
epic: ""
quality_gates: []
---

# Adversarial Spec Review Phase

## Problem
The AI-DLC elaboration workflow validates specs structurally (Phase 7: completeness, consistency, YAGNI) but does not challenge them semantically. Contradictions between units, hidden complexity, unvalidated assumptions, incorrect dependency ordering, and scope issues can slip through to execution — where they're far more expensive to fix. There is no mechanism to adversarially stress-test spec quality before builders consume them.

## Solution
Add Phase 7.5 (Adversarial Spec Review) to the elaboration workflow. A dedicated subagent runs in isolated context (`context: fork`) to objectively evaluate the intent and all unit specs. It produces structured findings with confidence scores and suggested fixes. The orchestrator auto-applies high-confidence deterministic fixes and presents remaining findings to the user for decision.

The subagent follows the established brief-write-invoke-read pattern used by elaborate-discover, elaborate-wireframes, and elaborate-ticket-sync.

## Domain Model

### Entities
- **AdversarialReviewSkill**: Forked subagent skill (`plugin/skills/elaborate/subskills/adversarial-review/SKILL.md`) — reads brief, analyzes specs adversarially, writes structured findings
- **AdversarialReviewBrief**: Input brief (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`) — serialized intent, units, and discovery context
- **AdversarialReviewResults**: Output results (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`) — structured findings with YAML status + finding array
- **Finding**: Single review finding — id, category, confidence, severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target

### Relationships
- AdversarialReviewSkill reads Brief (input), writes Results (output)
- Results contains many Finding objects
- Phase 7.5 Orchestration is part of ElaborateSkill (between Phase 7 and Phase 8)
- Finding references one or more unit files and may trigger auto-fix (when confidence=high + fix_type allows)

### Data Sources
- **Spec Files** (filesystem): intent.md (frontmatter + body), unit-*.md (frontmatter + body), discovery.md (exploration findings)
- **Elaboration Conversation** (NOT available to subagent): intentional isolation for objective review

### Data Gaps
- None. All spec data is locally available to the subagent.

## Success Criteria
- [ ] New skill file exists at `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` with `context: fork`, `agent: general-purpose`, `user-invocable: false`
- [ ] Skill follows the brief-write-invoke-read pattern consistent with elaborate-discover, elaborate-wireframes, and elaborate-ticket-sync
- [ ] Subagent reads intent.md, all unit-*.md files, and discovery.md — produces structured findings in YAML format
- [ ] Each finding includes: id, category (7 types), confidence (high/medium/low), severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target
- [ ] Phase 7.5 section added to `plugin/skills/elaborate/SKILL.md` between Phase 7 and Phase 8
- [ ] Orchestrator auto-applies high-confidence deterministic fixes (add_dependency, mechanical spec_edit, add_criterion) and commits them
- [ ] Orchestrator presents medium/low-confidence findings to user via AskUserQuestion for decision
- [ ] `remove_unit` and `manual` fix types are never auto-applied regardless of confidence

## Context
- Phase sequence: ... → 7 (Spec Review) → **7.5 (Adversarial Spec Review)** → 8 (Handoff)
- Phase 7 handles structural validation (checklist); Phase 7.5 handles semantic validation (adversarial challenge)
- Finding categories: contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary
- Fix types: spec_edit, add_dependency, remove_unit, add_criterion, reorder, manual
- Confidence scoring reuses the reviewer hat's high/medium/low pattern
- Always-on by default — no settings gate needed initially
