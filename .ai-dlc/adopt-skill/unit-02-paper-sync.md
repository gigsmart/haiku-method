---
status: completed
last_updated: "2026-03-30T05:24:00Z"
depends_on: [unit-01-adopt-skill]
branch: ai-dlc/adopt-skill/02-paper-sync
discipline: documentation
pass: ""
workflow: ""
ticket: ""
---

# unit-02-paper-sync

## Description

Update the AI-DLC methodology paper to document the `/adopt` concept as a new entry point into the AI-DLC lifecycle. The paper is the source of truth for methodology concepts — this update ensures the adoption workflow is formally part of the methodology, not just an implementation detail.

## Discipline

documentation - This unit will be executed by `do-technical-documentation` specialized agents.

## Domain Entities

- **Paper**: `website/content/papers/ai-dlc-2026.md` — the methodology specification
- **Adoption concept**: The idea that existing features can be reverse-engineered into AI-DLC intent artifacts, enabling /operate and /followup without having been built through AI-DLC's construction phase

## Data Sources

- **Paper**: `website/content/papers/ai-dlc-2026.md` — read the current structure to determine where the adopt concept fits
- **SKILL.md**: `plugin/skills/adopt/SKILL.md` (from unit-01) — the implemented skill definition, which the paper must accurately reflect
- **Existing lifecycle documentation**: The paper's sections on Inception, Construction, and Operations phases — adopt introduces a new pathway that bypasses Construction

## Technical Specification

Add a section to the paper documenting the adoption pathway. The placement and scope should fit naturally within the paper's existing structure:

### Content to Add

1. **Adoption as a lifecycle entry point**: Document that AI-DLC supports bringing pre-existing features into the lifecycle retroactively. This is the third entry point alongside `/elaborate` (new work) and `/followup` (iteration on existing AI-DLC intents).

2. **How adoption works** (high-level, not implementation detail):
   - User describes the feature and optionally points to code paths
   - Agent explores the codebase and git history to understand the domain
   - Agent generates completed intent artifacts (intent, units, discovery)
   - Agent reverse-engineers success criteria from tests and CI
   - Agent generates an operational plan
   - Feature is now fully integrated into AI-DLC lifecycle

3. **What adoption enables**:
   - `/operate` — operational management for adopted features
   - `/followup` — structured iteration on adopted features
   - Domain knowledge preservation via discovery.md

4. **Pragmatic decomposition**: Document the approach of starting from actual git history but restructuring into clean AI-DLC unit boundaries

### Writing Guidelines

- Match the paper's existing tone and depth — methodology concepts, not implementation details
- Reference the concept using `/adopt` as the concrete entry point
- Do not duplicate the SKILL.md content — the paper describes the methodology, the skill implements it
- Keep additions concise — this is one subsection, not a new major section

## Success Criteria

- [ ] The paper contains a section documenting the adoption pathway as a lifecycle entry point
- [ ] The section accurately describes what /adopt does at a methodology level (not implementation detail)
- [ ] The section explains the three entry points: /elaborate (new), /followup (iterate), /adopt (existing)
- [ ] The paper's existing structure is preserved — the new content fits naturally within the document flow
- [ ] No claims in the paper contradict the actual SKILL.md implementation (cross-reference unit-01 output)

## Risks

- **Paper structure disruption**: Adding content to a large paper risks breaking its narrative flow. Mitigation: Read the full paper structure first, place the section where it logically fits, and keep additions concise.
- **Methodology vs implementation confusion**: The paper should describe the concept, not restate the SKILL.md. Mitigation: Focus on "what and why" in the paper, leave "how" to the skill.

## Boundaries

This unit does NOT handle:
- Writing the SKILL.md — that is unit-01-adopt-skill
- Updating website documentation pages — can be a follow-up intent if needed
- Modifying the CLAUDE.md or project-level documentation
- Updating the changelog (handled by announcements config if enabled)

## Notes

- Read the paper's table of contents and section headers before deciding where to place the new content
- The paper likely has sections on "Inception" (elaboration), "Construction" (execute), and "Operations" (operate) — adoption fits near these as an alternative inception pathway
- Keep the addition to 200-400 words — enough to explain the concept, not a full specification
