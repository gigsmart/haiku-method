# AI-DLC Project

Three-component project: **plugin** (Claude Code plugin), **paper** (methodology spec), **website** (Next.js 15 static site).

- Paper is the source of truth for methodology concepts
- Plugin is the source of truth for implementation
- Website presents both to users

## Sync Discipline (CRITICAL)

When modifying any component, check if other components need corresponding updates:

| Change Type | Paper | Plugin | Website |
|---|---|---|---|
| New skill | Mention in relevant section | Primary | Update docs if user-facing |
| New hat/workflow | Document in Construction section | Primary | Update docs |
| New lifecycle phase | Document as new section | Implement | Update docs |
| Terminology change | Update all references | Update all references | Update all references |
| New principle | Document in Principles section | Implement if applicable | Update if referenced |
| Concept refinement | Update definition | Update implementation | Update docs |

## Key File Locations

- Paper: `website/content/papers/ai-dlc-2026.md`
- Plugin metadata: `plugin/.claude-plugin/plugin.json`
- Plugin skills: `plugin/skills/*/SKILL.md`
- Plugin hats: `plugin/hats/*.md`
- Plugin workflows: `plugin/workflows.yml`
- Plugin hooks: `plugin/hooks/*.sh` + `plugin/.claude-plugin/hooks.json`
- Plugin libraries: `plugin/lib/*.sh`
- Plugin providers: `plugin/providers/*.md` + `plugin/schemas/providers/*.json`
- Website docs: `website/content/docs/`
- Changelog: `CHANGELOG.md` (Keep a Changelog format)

## Concept-to-Implementation Mapping

| Concept | Paper Section | Plugin Implementation | Key Files |
|---|---|---|---|
| Intent | Inception phase | `.ai-dlc/{slug}/intent.md` | elaborate/SKILL.md |
| Unit | Inception phase | `.ai-dlc/{slug}/unit-NN-*.md` | elaborate/SKILL.md, dag.sh |
| Bolt | Construction phase | `iteration` field in iteration.json | execute/SKILL.md, advance/SKILL.md |
| Pass | Iteration Through Passes | `passes:`/`active_pass:` in intent, `pass:` in unit | elaborate (Phase 5.95), execute (Step 5c), dag.sh |
| Completion Criteria | Throughout | criteria in unit frontmatter, hard-gated | elaborate, execute, advance |
| Backpressure | Principles section | Quality gates in builder/reviewer hats | builder.md, reviewer.md |
| Operating Modes | HITL/OHOTL/AHOTL section | interactive=HITL, /execute=OHOTL, /autopilot=AHOTL | execute, autopilot |
| Workflows | Named Workflows section | plugin/workflows.yml, 5 named workflows | workflows.yml, hats/*.md |
| Hard Gates | Construction phase | exit code enforcement in /advance | advance/SKILL.md |
| Providers | Memory Providers section | plugin/schemas/providers/*.json, plugin/providers/*.md | config.sh, hats |
| Operations | Operations phase | /operate skill | operate/SKILL.md |

## AI-DLC Terminology (CRITICAL)

| AI-DLC Term | Agile Equivalent | Description |
|---|---|---|
| Intent | Feature / Epic | The overall thing being built |
| Unit | Ticket / Story | A discrete piece of work within an intent |
| Bolt | Sprint | The iteration cycle an agent runs within a unit |
| Pass | (no equivalent) | Typed iteration through a disciplinary lens (design/product/dev) |

Bolt is NOT interchangeable with Unit. Bolt = the timeframe/cycle. Unit = the work itself.

## Version Management

- Plugin version in `plugin/.claude-plugin/plugin.json` -- auto-bumped by CI
- Changelog follows Keep a Changelog format at repo root
- Website deploys on push to main when `website/` changes
