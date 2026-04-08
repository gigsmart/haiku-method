---
name: unit-12-claude-md-paper-sync
type: documentation
status: completed
depends_on: [unit-05-stage-definitions, unit-07-dissolve-hats-workflows]
bolt: 0
hat: ""
started_at: 2026-04-03T03:26:43Z
completed_at: 2026-04-03T03:26:43Z
---


# unit-12-claude-md-paper-sync

## Description

Update CLAUDE.md and .claude/rules/ for the new H·AI·K·U terminology, hierarchy, and file locations. Merge the AI-DLC paper content with the haiku-method paper — the haiku-method paper is the canonical source, enriched with AI-DLC's implementation specifics. This is the sync-check unit that ensures all cross-component references are consistent.

## Discipline

documentation - Project configuration files, methodology paper, and cross-reference consistency.

## Domain Entities

- `CLAUDE.md` — project-level Claude Code instructions
- `.claude/rules/sync-check.md` — cross-component sync rules
- `website/content/papers/ai-dlc-2026.md` — AI-DLC methodology paper (to be merged/replaced)
- `TheBushidoCollective/haiku-method` GitHub repo, path `paper/haiku-method.md` — H·AI·K·U methodology paper (canonical source)

Before executing the paper merge steps, clone the haiku-method repo:
```bash
git clone https://github.com/TheBushidoCollective/haiku-method.git /tmp/haiku-method
# Paper is then at: /tmp/haiku-method/paper/haiku-method.md
```

If the repo is private, configure access via `GITHUB_TOKEN` or SSH keys before cloning.

## Technical Specification

### CLAUDE.md Updates

#### Project Description

```markdown
# H·AI·K·U Project

Three-component project: **plugin** (Claude Code plugin), **paper** (methodology spec), **website** (Next.js 15 static site).

H·AI·K·U = Human AI Knowledge Unification — a universal lifecycle framework for structured AI-assisted work.

- Paper is the source of truth for methodology concepts
- Plugin is the source of truth for implementation
- Website presents both to users
```

#### Terminology Table

Replace the existing AI-DLC terminology table:

```markdown
## H·AI·K·U Terminology (CRITICAL)

| H·AI·K·U Term | Agile Equivalent | Description |
|---|---|---|
| Studio | (no equivalent) | Named lifecycle template (e.g., software, ideation, marketing) |
| Stage | (no equivalent) | Lifecycle phase with hats, review gate, and artifact contracts |
| Intent | Feature / Epic | The overall thing being built |
| Unit | Ticket / Story | A discrete piece of work within a stage |
| Bolt | Sprint | The iteration cycle an agent runs within a unit |
| Hat | (no equivalent) | Role the AI assumes within a stage (defined as files in `stages/{stage}/hats/`) |
| Review Gate | (no equivalent) | Checkpoint between stages: auto, ask, or external |

### Hierarchy

Studio -> Stage -> Unit -> Bolt

- Studio is NOT a Stage. Studio = lifecycle template. Stage = phase within that lifecycle.
- Stage is NOT a Unit. Stage = lifecycle phase. Unit = discrete work item.
- Bolt is NOT a Unit. Bolt = iteration cycle. Unit = the work itself.
```

#### Key File Locations

```markdown
## Key File Locations

- Paper: `website/content/papers/haiku-method.md`
- Plugin metadata: `plugin/.claude-plugin/plugin.json`
- Plugin skills: `plugin/skills/*/SKILL.md`
- Plugin studios: `plugin/studios/*/STUDIO.md`
- Plugin stages: `plugin/studios/*/stages/*/STAGE.md`
- Plugin hooks: `plugin/hooks/*.sh` + `plugin/.claude-plugin/hooks.json`
- Plugin libraries: `plugin/lib/*.sh`
- Plugin persistence adapters: `plugin/lib/adapters/*.sh`
- Plugin providers: `plugin/providers/*.md` + `plugin/schemas/providers/*.json`
- Website docs: `website/content/docs/`
- Changelog: `CHANGELOG.md` (Keep a Changelog format)
- Deploy: `deploy/terraform/`
```

#### Concept-to-Implementation Mapping

```markdown
## Concept-to-Implementation Mapping

| Concept | Paper Section | Plugin Implementation | Key Files |
|---|---|---|---|
| Studio | Lifecycle Templates | `plugin/studios/*/STUDIO.md` | studio.sh |
| Stage | Lifecycle Phases | `plugin/studios/*/stages/*/STAGE.md` | stage.sh, orchestrator.sh |
| Hat | Roles & Guidance | `## {hat-name}` sections in STAGE.md | inject-context.sh |
| Intent | Work Items | `.haiku/intents/{slug}/intent.md` | new/SKILL.md, run/SKILL.md |
| Unit | Work Decomposition | `.haiku/intents/{slug}/stages/{stage}/units/unit-NN-*.md` | orchestrator.sh (plan phase) |
| Bolt | Iteration Cycles | `iteration` field in iteration.json | orchestrator.sh (build phase) |
| Review Gate | Quality Checkpoints | `review:` in STAGE.md | orchestrator.sh (gate phase) |
| Persistence | Work Persistence | `plugin/lib/adapters/*.sh` | persistence.sh |
| Knowledge Pool | Accumulated Context | `.haiku/knowledge/` | knowledge.sh |
| Completion Criteria | Exit Conditions | criteria in unit frontmatter, hard-gated | parse.sh |
| Backpressure | Quality Enforcement | Quality gates in stages | quality-gate.sh |
| Operating Modes | HITL/OHOTL/AHOTL | continuous=HITL, /haiku:resume=OHOTL, /haiku:autopilot=AHOTL | run, autopilot |
```

#### Sync Discipline Table

Update the sync discipline table to include studios and stages:

```markdown
| Change Type | Paper | Plugin | Website |
|---|---|---|---|
| New studio | Document in Lifecycle Templates | Primary | Update studios page |
| New stage | Document in Lifecycle Phases | Primary | Update stages docs |
| New skill | Mention in relevant section | Primary | Update docs if user-facing |
| New hat (in stage) | Document in relevant phase | Primary (in STAGE.md) | Update if user-facing |
| New lifecycle concept | Document as new section | Implement | Update docs |
| Terminology change | Update all references | Update all references | Update all references |
| New persistence adapter | Document in Persistence section | Primary | Update persistence docs |
| Concept refinement | Update definition | Update implementation | Update docs |
```

### Sync Check Rules (`.claude/rules/sync-check.md`)

Rewrite for the new hierarchy:

```markdown
# Sync Check Rule

Before completing any work that modifies the plugin, paper, or website, verify cross-component consistency:

## After modifying plugin/studios/ or plugin/studios/*/stages/:
- [x] Is the studio/stage documented in the paper?
- [x] Does the website docs section reference it (if user-facing)?
- [x] Do the requires/produces chains form a valid pipeline?

## After modifying plugin/skills/:
- [x] Is the skill documented in the CLI reference?
- [x] Does the website docs section reference it (if user-facing)?

## After modifying the paper:
- [x] Does the plugin implement what the paper describes?
- [x] If aspirational (not yet implemented), is it clearly marked as such?

## After modifying website/content/:
- [x] Are claims about the methodology accurate to the paper?
- [x] Are claims about the plugin accurate to the implementation?

## After adding or renaming terminology:
- [x] Updated in paper
- [x] Updated in plugin fundamentals skill
- [x] Updated in all stage/skill files that reference it
- [x] Updated in website docs
- [x] Updated in CLAUDE.md terminology table

## Terminology reminders:
- Studio = lifecycle template (software, ideation, etc.)
- Stage = lifecycle phase with hats and review gate
- Unit = discrete work item within a stage
- Bolt = iteration cycle within a unit (tracked as `iteration` in state)
- Hat = role the AI assumes, defined as files in `stages/{stage}/hats/`
- Studio -> Stage -> Unit -> Bolt is the four-layer hierarchy
```

### Paper Merge

The haiku-method paper at `/tmp/haiku-method/paper/haiku-method.md` (cloned from `TheBushidoCollective/haiku-method`) is the canonical methodology document. The AI-DLC paper at `website/content/papers/ai-dlc-2026.md` contains implementation-specific details.

Merge strategy:

1. **Copy haiku-method paper** to `website/content/papers/haiku-method.md` as the primary paper
2. **Enrich** with AI-DLC's implementation specifics where the haiku-method paper is abstract:
   - Concrete studio definitions (software, ideation)
   - STAGE.md schema details
   - Persistence adapter architecture
   - Claude Code plugin integration specifics
3. **Archive** the AI-DLC paper:
   - Keep `ai-dlc-2026.md` as a historical reference
   - Add a frontmatter note: `archived: true, superseded_by: haiku-method.md`
   - Or remove it entirely if the haiku-method paper covers everything
4. **Update website** to reference the new paper location

### Content to Preserve from AI-DLC Paper

The AI-DLC paper has implementation details the haiku-method paper may lack:

- Bolt cycle mechanics (plan -> build -> quality gates -> review)
- Completion criteria specification format
- Quality gate (backpressure) implementation details
- Knowledge pool structure and usage
- Worktree management for parallel execution
- Telemetry event model

These should be incorporated into the haiku-method paper's relevant sections.

### Content to Adopt from Haiku-Method Paper

The haiku-method paper has broader conceptual material:

- Domain-agnostic methodology philosophy
- Non-software studio examples
- Universal lifecycle principles
- The H·AI·K·U acronym explanation and brand narrative
- Business-level value proposition

## Success Criteria

- [x] CLAUDE.md updated with H·AI·K·U terminology table (Studio -> Stage -> Unit -> Bolt)
- [x] CLAUDE.md updated with new concept-to-implementation mapping
- [x] CLAUDE.md updated with new key file locations (studios, stages, adapters, deploy)
- [x] CLAUDE.md sync discipline table includes studios, stages, and persistence adapters
- [x] `.claude/rules/sync-check.md` rewritten for studio/stage hierarchy
- [x] Haiku-method paper copied to `website/content/papers/haiku-method.md`
- [x] Haiku-method paper enriched with AI-DLC implementation specifics
- [x] AI-DLC paper archived or removed
- [x] No "AI-DLC" references remain in CLAUDE.md (except historical context)
- [x] No `.ai-dlc/` path references remain in CLAUDE.md
- [x] No `/ai-dlc:` command references remain in CLAUDE.md
- [x] Paper accurately describes the implemented system (studios, stages, persistence)
- [x] All cross-component references verified (paper matches plugin matches website)

## Risks

- **Paper merge complexity**: The haiku-method paper is 88KB. Merging two large documents requires careful editorial judgment about what to keep, combine, or cut. Mitigation: the haiku-method paper is canonical — default to its structure and add AI-DLC specifics in clearly marked sections.
- **CLAUDE.md drift**: CLAUDE.md is read by the AI agent on every session. Incorrect file paths or terminology here cascades into bad behavior. Mitigation: verify every file path and command reference exists.
- **Sync check completeness**: The new sync-check rules must catch all cross-component drift scenarios. Mitigation: enumerate all component pairs and verify each has a check.

## Boundaries

This unit covers CLAUDE.md, sync-check rules, and the paper merge. It does NOT write website pages (units 10-11), modify plugin code (units 01-08), or handle deployment (unit-09). It is purely a documentation and configuration sync unit.
