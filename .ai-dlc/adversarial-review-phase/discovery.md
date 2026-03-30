---
intent: adversarial-review-phase
created: 2026-03-30
status: active
---

# Discovery Log: Adversarial Review Phase

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** Bash (plugin shell libraries), Markdown (skill/hat definitions, specs), YAML (workflows, config), JavaScript (Playwright worker for screenshots), Next.js 15 (website)
**Architecture:** Monorepo with three components: `plugin/` (Claude Code plugin), `website/` (Next.js 15 static site), `website/content/papers/` (methodology paper). Plugin uses skill-based architecture with `skills/*/SKILL.md` definitions, `hats/*.md` role definitions, `lib/*.sh` shell libraries, and `workflows.yml` for named workflow sequences.
**Conventions:**
- Skills use YAML frontmatter for metadata (`description`, `allowed-tools`, `context: fork` for subagents, `user-invocable: false` for internal skills)
- Subagent skills follow a brief-file pattern: orchestrator writes `.briefs/elaborate-{name}.md`, subagent reads brief, does work, writes `.briefs/elaborate-{name}-results.md`
- Hats use YAML frontmatter (`name`, `description`) and structured sections (Overview, Parameters, Prerequisites, Steps, Success Criteria, Error Handling)
- Elaboration phases are numbered (0, 0.5, 1, 2, 2.25, 2.5, 3, 4, 5, 5.5, 5.6, 5.75, 5.8, 5.9, 5.95, 6, 6.25, 6.5+6.75, 7, 8)
- Git commits follow `elaborate({slug}): {action}` format during elaboration
- State management via `lib/state.sh` (file-based, atomic writes)
- Config via `lib/config.sh` with YAML settings at `.ai-dlc/settings.yml`
- Telemetry via `lib/telemetry.sh`
**Concerns:**
- Phase 7 (Spec Review) currently runs a lightweight checklist-style review — completeness, consistency, YAGNI — but does NOT do adversarial analysis (contradictions, hidden complexity, assumption challenges, dependency stress-testing)
- No existing mechanism for auto-applying fixes to specs during elaboration — Phase 7 presents findings to user but has no auto-fix pathway
- The integrate skill handles cross-unit validation post-execution but not pre-execution adversarial review

