---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **AdversarialReviewSkill**: Forked subagent skill (`plugin/skills/elaborate/subskills/adversarial-review/SKILL.md`) — Reads brief, performs adversarial analysis of specs, writes structured findings. Fields: description, context (fork), agent (general-purpose), user-invocable (false), allowed-tools, review categories, anti-rationalization rules
- **AdversarialReviewBrief**: Input brief (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`) — Serialized intent, units, and discovery context for the subagent
- **AdversarialReviewResults**: Output results (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`) — Structured findings with YAML status + finding array
- **Finding**: Single review finding — Fields: id, category, confidence (high/medium/low), severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target
- **Phase7.5Orchestration**: Phase 7.5 section in elaborate SKILL.md — Writes brief, invokes subagent, auto-applies high-confidence fixes, presents low-confidence findings to user
- **ElaborateSkill**: The orchestrator — modified to include Phase 7.5 between existing Phase 7 (Spec Review) and Phase 8 (Handoff)

### Relationships
- AdversarialReviewSkill reads AdversarialReviewBrief (input)
- AdversarialReviewSkill writes AdversarialReviewResults (output)
- AdversarialReviewResults contains many Finding objects
- Phase7.5Orchestration is part of ElaborateSkill (inserted between Phase 7 and Phase 8)
- Finding references one or more unit files and may auto-fix them (when confidence=high and fix_type allows it)

### Data Sources
- **Spec Files** (filesystem):
  - Available: intent.md (frontmatter + body), unit-*.md (frontmatter + body), discovery.md (all exploration findings)
  - Missing: Nothing — all spec data is available locally
  - Real sample: YAML frontmatter with `depends_on: [unit-01-setup]`, markdown body with `## Success Criteria` sections

### Data Gaps
- No critical data gaps. All spec files are locally available to the subagent via filesystem.
- The subagent runs in forked context (no access to elaboration conversation) — this is intentional for objective evaluation.

## Key Findings

- **Phase 7 gap identified:** Current spec review (Phase 7) does lightweight checklist validation (completeness, consistency, YAGNI) but does NOT do adversarial analysis — no contradiction detection, no dependency stress-testing, no hidden complexity probing, no assumption challenging
- **Established subagent pattern:** Three existing subagent skills (elaborate-discover, elaborate-wireframes, elaborate-ticket-sync) follow a consistent brief-write-invoke-read pattern with `context: fork`, `agent: general-purpose`, `user-invocable: false`. The new skill should follow this exact pattern.
- **Confidence scoring pattern exists:** The reviewer hat uses high/medium/low confidence scoring. The adversarial review should reuse this pattern for triaging findings into auto-fix (high), user-confirm (medium), and informational (low).
- **Auto-fix boundary defined:** The subagent writes findings only (does NOT modify specs). The orchestrator applies fixes. High-confidence + deterministic fix types (add_dependency, mechanical spec_edit, add_criterion) can auto-apply. remove_unit and manual always go to user.
- **Seven finding categories identified:** contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary — covering the full adversarial review scope requested in the brief
- **External research validates approach:** Adversarial code review patterns (ASDLC.io, Block research on dialectical autocoding) confirm that session isolation, skeptical-by-default, and structured finding formats are best practices
- **Architecture decision: dedicated skill file** (not inline) for consistency, testability, and avoiding further growth of the 2000+ line elaborate SKILL.md
- **No settings gate needed initially:** The phase adds value without cost. Always-on by default; can add opt-out setting later if requested.

## Open Questions

- Should the adversarial review also validate wireframes against unit specs (if wireframes exist), or is that out of scope for Phase 7.5?
- Should the review include an anti-rationalization table (like the Red Team hat) to prevent the subagent from declaring specs "clean" without thorough analysis?
- When the adversarial review finds issues that require rethinking the unit decomposition (e.g., "these two units should be merged"), should that be presented as a manual finding or should the orchestrator offer to re-run decomposition?
- Should the brief include the full discovery.md content or just a summary? Full content enables better validation but increases brief size.

## Mockups Generated

- No UI mockups — this intent has no user-facing interface (pure plugin infrastructure)
