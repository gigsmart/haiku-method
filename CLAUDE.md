# H·AI·K·U Project

H·AI·K·U = Human + AI Knowledge Unification — a universal lifecycle framework for structured AI-assisted work.

Three-component project: **plugin** (Claude Code plugin), **paper** (methodology spec), **website** (Next.js 15 static site).

- Paper is the source of truth for methodology concepts
- Plugin is the source of truth for implementation
- Website presents both to users

## Sync Discipline (CRITICAL)

When modifying any component, check if other components need corresponding updates:

| Change Type | Paper | Plugin | Website |
|---|---|---|---|
| New skill | Mention in relevant section | Primary | Update docs if user-facing |
| New studio | Document in Profiles section | Primary | Update docs |
| New stage | Document in relevant profile | Primary | Update docs |
| New hat (in stage) | Document in relevant profile | Add `hats/{hat}.md` file in stage directory | Update docs if user-facing |
| New review agent (in stage) | Document in Quality Enforcement | Add `review-agents/{agent}.md` file in stage directory | Update docs if user-facing |
| New operation template | Document in Operation phase | Add `operations/{op}.md` file in studio directory | Update docs if user-facing |
| New reflection dimension | Document in Reflection phase | Add `reflections/{dim}.md` file in studio directory | Update docs if user-facing |
| New lifecycle phase | Document as new section | Implement | Update docs |
| Terminology change | Update all references | Update all references | Update all references |
| New principle | Document in Principles section | Implement if applicable | Update if referenced |
| Concept refinement | Update definition | Update implementation | Update docs |
| New persistence adapter | Document in Context Preservation | Implement in lib/adapters/ | Update docs if user-facing |

## Key File Locations

- Paper: `website/content/papers/haiku-method.md`
- Plugin metadata: `plugin/.claude-plugin/plugin.json`
- Plugin skills: `plugin/skills/*/SKILL.md`
- Plugin studios: `plugin/studios/*/STUDIO.md`
- Plugin stages: `plugin/studios/*/stages/*/STAGE.md`
- Plugin hats: `plugin/studios/*/stages/*/hats/*.md`
- Plugin review agents: `plugin/studios/*/stages/*/review-agents/*.md`
- Plugin operations: `plugin/studios/*/operations/*.md`
- Plugin reflections: `plugin/studios/*/reflections/*.md`
- Plugin hooks: `plugin/hooks/*.sh` + `plugin/.claude-plugin/hooks.json`
- Plugin libraries: `plugin/lib/*.sh`
- Plugin orchestration: `plugin/lib/orchestrator.sh`, `plugin/lib/stage.sh`, `plugin/lib/studio.sh`
- Plugin persistence adapters: `plugin/lib/adapters/*.sh`
- Plugin providers: `plugin/providers/*.md` (bidirectional translation instructions) + `plugin/schemas/providers/*.json`
- Website docs: `website/content/docs/`
- Infrastructure: `deploy/terraform/`
- Changelog: `CHANGELOG.md` (Keep a Changelog format)

## Concept-to-Implementation Mapping

| Concept | Paper Section | Plugin Implementation | Key Files |
|---|---|---|---|
| Intent | Elaboration phase | `.haiku/intents/{slug}/intent.md` | elaborate/SKILL.md |
| Unit | Elaboration phase | `.haiku/intents/{slug}/stages/{stage}/units/unit-NN-*.md` | elaborate/SKILL.md, dag.sh |
| Bolt | Execution phase | `iteration` field in iteration.json | execute/SKILL.md, orchestrator.sh |
| Studio | Profiles section | `plugin/studios/{name}/STUDIO.md` | studio.sh |
| Stage | Profiles section | `plugin/studios/{name}/stages/{stage}/STAGE.md` | stage.sh, orchestrator.sh |
| Hat | Profiles section | `plugin/studios/{name}/stages/{stage}/hats/{hat}.md` | hat.sh, stage.sh |
| Review Agent | Quality Enforcement | `plugin/studios/{name}/stages/{stage}/review-agents/{agent}.md` | orchestrator.sh, run/SKILL.md |
| Review Gate | Quality Enforcement | `review:` field in STAGE.md (auto/ask/external/await/[external,ask]) | orchestrator.sh |
| Operation Template | Operation phase | `plugin/studios/{name}/operations/{op}.md` | operate/SKILL.md |
| Reflection Dimension | Reflection phase | `plugin/studios/{name}/reflections/{dim}.md` | reflect/SKILL.md |
| Completion Criteria | Throughout | `quality_gates:` in unit/intent frontmatter, harness-enforced | elaborate, execute, advance, quality-gate.sh |
| Backpressure | Principles section | Quality gates enforced by harness, not agent | quality-gate.sh, orchestrator.sh |
| Operating Modes | Operating Modes section | interactive=HITL, /haiku:execute=OHOTL, /haiku:autopilot=AHOTL | execute, autopilot |
| Hard Gates | Execution phase | exit code enforcement in quality-gate.sh | orchestrator.sh |
| Persistence | Context Preservation | `plugin/lib/adapters/*.sh` (filesystem, git) | config.sh, adapters/ |
| Providers | Memory Providers section | `plugin/schemas/providers/*.json`, `plugin/providers/*.md` | config.sh |
| Operations | Operation phase | /haiku:operate skill | operate/SKILL.md |

## H·AI·K·U Terminology (CRITICAL)

| H·AI·K·U Term | Agile Equivalent | Description |
|---|---|---|
| Intent | Feature / Epic | The overall thing being built |
| Unit | Ticket / Story | A discrete piece of work within an intent |
| Bolt | Sprint | The iteration cycle an agent runs within a unit |
| Studio | (no equivalent) | A named lifecycle template (profile implementation) containing stages |
| Stage | (no equivalent) | A lifecycle phase within a studio, containing hats and review gates |
| Hat | Role | A behavioral role scoped to a stage, defined in `hats/{hat}.md` files within the stage directory |
| Review Gate | Quality Gate | A checkpoint between stages (auto, ask, or external) |

### Hierarchy

```
Studio > Stage > Unit > Bolt
```

- **Studio** is NOT the same as Stage. Studio = the lifecycle template. Stage = a phase within it.
- **Unit** is NOT the same as Bolt. Unit = the work itself. Bolt = the iteration cycle within a unit.
- **Hat** is always scoped to a Stage, defined in `stages/{stage}/hats/{hat}.md` files. Project-level augmentation: `.haiku/studios/{studio}/stages/{stage}/hats/{hat}.md`.

## Version Management

- Plugin version in `plugin/.claude-plugin/plugin.json` -- auto-bumped by CI
- Changelog follows Keep a Changelog format at repo root
- Website deploys on push to main when `website/` changes
