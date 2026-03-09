---
status: completed
depends_on: [unit-04-reflection-phase]
branch: ai-dlc/methodology-evolution/06-ai-dlc-integration
discipline: backend
workflow: ""
ticket: ""
---

# unit-06: AI-DLC HAIKU Integration

## Description
Refactor the AI-DLC plugin to become the software development profile of HAIKU. AI-DLC either depends on the HAIKU core plugin (extending it with software-specific features) or references the HAIKU methodology while maintaining its own implementation. Existing AI-DLC users must experience zero breakage.

## Discipline
backend

## Domain Entities
- Profile (AI-DLC as a HAIKU implementation), Quality Gate, Hat, Storage Backend

## Data Sources
- HAIKU core plugin (unit-02, 03, 04 output) — the universal plugin to extend
- AI-DLC plugin source (`plugin/` in AI-DLC repo) — current implementation
- Discovery log — detailed analysis of AI-DLC architecture, git dependencies, hat system

## Technical Specification

### Integration Strategy
Two options (decide during planning):

**Option A: AI-DLC depends on HAIKU plugin**
- HAIKU is a Claude Code plugin dependency
- AI-DLC plugin extends HAIKU with software-specific overrides
- AI-DLC adds its own hats, gates, and workflows ON TOP of HAIKU core
- Benefits: single source of truth for core methodology
- Challenges: plugin dependency system in Claude Code may not support this natively

**Option B: AI-DLC references HAIKU methodology independently**
- AI-DLC remains a standalone plugin
- Rename Construction -> Execution in AI-DLC
- Add Operation and Reflection phases to AI-DLC
- Port storage abstraction concepts (but keep git-first since AI-DLC IS the software profile)
- Benefits: simpler, no cross-plugin dependency
- Challenges: code duplication between HAIKU and AI-DLC

The builder should evaluate both options and recommend the best approach based on Claude Code's plugin architecture constraints.

### What AI-DLC Adds to HAIKU (the software profile)
- **Git-specific storage**: Worktrees, branches, han keep (HAIKU core has this via storage abstraction, AI-DLC ensures it's the default)
- **Software quality gates**: tests, lint, typecheck, build, security scan (configured in settings, not hardcoded)
- **Code-specific hats**: builder (extends executor with code-writing instructions), refactorer, test-writer, designer (UI/UX)
- **VCS integration**: PR/MR creation, branch management, git strategy (unit/intent/trunk)
- **CI/CD awareness**: Auto-detect GitHub Actions, GitLab CI, etc.
- **Software-specific workflows**: adversarial (red-team/blue-team), hypothesis (observer/hypothesizer/experimenter/analyst)

### Phase Renames in AI-DLC
- `/construct` -> `/execute` (with `/construct` as deprecated alias that warns and calls `/execute`)
- "Construction" -> "Execution" in all user-facing messages, hook output, skill descriptions
- "Builder" hat -> "Builder" (keep for AI-DLC since it's specifically about building software, but it's a specialization of HAIKU's "executor")
- State keys: `iteration.json` format stays compatible (add `phase` field, keep `hat` field)

### Backward Compatibility Requirements
- Existing `.ai-dlc/` directory structure continues to work
- Existing `iteration.json` state loads correctly (migration: add missing `phase` field with sensible default)
- `/construct` still works (deprecated alias)
- All existing tests pass
- Users who haven't updated their intents can still `/resume` and `/construct`

### New Features from HAIKU
- Operation phase: AI-DLC intents can now produce `operations.md` during execution (for deployment runbooks, monitoring setup, maintenance tasks)
- Reflection phase: Completed intents can `/reflect` to capture learnings
- These are opt-in — existing workflows don't require them

## Success Criteria
- [ ] AI-DLC plugin references or extends HAIKU for software development
- [ ] `/construct` works as deprecated alias for `/execute`
- [ ] All existing AI-DLC tests pass unchanged
- [ ] Existing intents with old state format load correctly (migration)
- [ ] Software-specific quality gates (tests/lint/types) are configured in settings, not hardcoded
- [ ] Operation phase available for AI-DLC intents (opt-in)
- [ ] Reflection phase available for AI-DLC intents (opt-in)
- [ ] No breakage for users who don't update their workflows

## Risks
- **Breakage of existing workflows**: Any change to state format, skill names, or hook behavior could break in-progress intents. Mitigation: thorough backward compat testing, migration logic for state format, deprecated aliases for renamed commands.
- **Plugin dependency complexity**: If Option A (dependency), Claude Code may not support plugin-to-plugin dependencies well. Mitigation: evaluate early, fall back to Option B if needed.

## Boundaries
This unit modifies the AI-DLC plugin. It does NOT modify the HAIKU core plugin (units 02-04). It does NOT update the AI-DLC website (unit-08).

## Notes
- This is the most sensitive unit — backward compatibility is paramount
- Consider writing a migration guide for existing AI-DLC users
- The builder should read ALL existing AI-DLC tests before making changes
- Keep AI-DLC's "builder" hat name (it's domain-appropriate for software) but have it extend HAIKU's "executor" concept
