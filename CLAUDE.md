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
| New prompt | Mention in relevant section | Add handler in `prompts/*.ts` | Update docs if user-facing |
| New studio | Document in Profiles section | Primary | Update docs |
| New stage | Document in relevant profile | Primary | Update docs |
| New hat (in stage) | Document in relevant profile | Add `hats/{hat}.md` file in stage directory | Update docs if user-facing |
| New review agent (in stage) | Document in Quality Enforcement | Add `review-agents/{agent}.md` file in stage directory | Update docs if user-facing |
| New phase override (in stage) | Mention in Stages section if needed | Add `phases/{PHASE}.md` file in stage directory | Update docs if user-facing |
| New operation template | Document in Operation phase | Add `operations/{op}.md` file in studio directory | Update docs if user-facing |
| New reflection dimension | Document in Reflection phase | Add `reflections/{dim}.md` file in studio directory | Update docs if user-facing |
| New lifecycle phase | Document as new section | Implement | Update docs |
| Terminology change | Update all references | Update all references | Update all references |
| New principle | Document in Principles section | Implement if applicable | Update if referenced |
| Concept refinement | Update definition | Update implementation | Update docs |
| Persistence change | N/A (environment-detected) | Update state-tools.ts isGitRepo | Update docs if user-facing |
| New harness support | N/A | Add entry to HARNESS_REGISTRY in `harness.ts`, update rewriting rules in `harness-instructions.ts` | Update docs if user-facing |

## Key File Locations

- Paper: `website/content/papers/haiku-method.md`
- Plugin metadata: `plugin/.claude-plugin/plugin.json`
- Plugin prompts: `packages/haiku/src/prompts/*.ts` (MCP prompt handlers — all behavior lives here)
- Plugin studios: `plugin/studios/*/STUDIO.md`
- Plugin stages: `plugin/studios/*/stages/*/STAGE.md`
- Plugin hats: `plugin/studios/*/stages/*/hats/*.md`
- Plugin review agents: `plugin/studios/*/stages/*/review-agents/*.md`
- Plugin phase overrides: `plugin/studios/*/stages/*/phases/*.md`
- Plugin operations: `plugin/studios/*/operations/*.md`
- Plugin reflections: `plugin/studios/*/reflections/*.md`
- Plugin intent templates: `plugin/studios/*/templates/*.md`
- Plugin hooks: `plugin/hooks/*.sh` + `plugin/.claude-plugin/hooks.json`
- Plugin libraries: `plugin/lib/*.sh`
- Plugin orchestration: `plugin/lib/orchestrator.sh`, `plugin/lib/stage.sh`, `plugin/lib/studio.sh`
- Plugin environment detection: `packages/haiku/src/state-tools.ts` (isGitRepo)
- Plugin harness support: `packages/haiku/src/harness.ts` (capability registry), `packages/haiku/src/harness-instructions.ts` (instruction adaptation)
- Plugin providers: `plugin/providers/*.md` (bidirectional translation instructions) + `plugin/schemas/providers/*.json`
- Website docs: `website/content/docs/`
- Infrastructure: `deploy/terraform/`
- Changelog: `CHANGELOG.md` (Keep a Changelog format)

## Concept-to-Implementation Mapping

| Concept | Paper Section | Plugin Implementation | Key Files |
|---|---|---|---|
| Intent | Elaboration phase | `.haiku/intents/{slug}/intent.md` | prompts/core.ts |
| Unit | Elaboration phase | `.haiku/intents/{slug}/stages/{stage}/units/unit-NN-*.md` | prompts/core.ts |
| Bolt | Execution phase | `iteration` field in iteration.json | orchestrator.ts |
| Studio | Profiles section | `plugin/studios/{name}/STUDIO.md` | studio.sh |
| Stage | Profiles section | `plugin/studios/{name}/stages/{stage}/STAGE.md` | stage.sh, orchestrator.ts |
| Hat | Profiles section | `plugin/studios/{name}/stages/{stage}/hats/{hat}.md` | prompts/core.ts |
| Review Agent | Quality Enforcement | `plugin/studios/{name}/stages/{stage}/review-agents/{agent}.md` | orchestrator.ts, prompts/core.ts |
| Phase Override | Stages section | `plugin/studios/{name}/stages/{stage}/phases/{PHASE}.md` | orchestrator.ts |
| Review Gate | Quality Enforcement | `review:` field in STAGE.md — `auto` (harness advances), `ask` (local human approval), `external` (blocks for external review system), `await` (blocks for external event), or compound list like `[external, ask]` (user chooses path) | orchestrator.ts |
| Operation Template | Operation phase | `plugin/studios/{name}/operations/{op}.md` | prompts/complex.ts |
| Reflection Dimension | Reflection phase | `plugin/studios/{name}/reflections/{dim}.md` | prompts/core.ts |
| Completion Criteria | Throughout | `quality_gates:` in unit/intent frontmatter, harness-enforced | orchestrator.ts, quality-gate.sh |
| Backpressure | Principles section | Quality gates enforced by harness, not agent | quality-gate.sh, orchestrator.ts |
| Operating Modes | Operating Modes section | interactive=HITL, /haiku:pickup=OHOTL, /haiku:autopilot=AHOTL | prompts/core.ts, prompts/complex.ts |
| Hard Gates | Execution phase | exit code enforcement in quality-gate.sh | orchestrator.ts |
| Persistence | Context Preservation | Environment-detected via `isGitRepo()` (git or filesystem) | state-tools.ts, git-worktree.ts |
| Providers | Memory Providers section | `plugin/schemas/providers/*.json`, `plugin/providers/*.md` | config.sh |
| Harness | N/A (implementation detail) | `--harness <name>` MCP arg or `HAIKU_HARNESS` env var; capability registry in `harness.ts`, instruction adaptation in `harness-instructions.ts` | harness.ts, harness-instructions.ts, orchestrator.ts, server.ts |
| Operations | Operation phase | /haiku:operate prompt | prompts/complex.ts |

## H·AI·K·U Terminology (CRITICAL)

| H·AI·K·U Term | Agile Equivalent | Description |
|---|---|---|
| Intent | Feature / Epic | The overall thing being built |
| Unit | Ticket / Story | A discrete piece of work within an intent |
| Bolt | Sprint | The iteration cycle an agent runs within a unit |
| Studio | (no equivalent) | A named lifecycle template (profile implementation) containing stages |
| Stage | (no equivalent) | A lifecycle phase within a studio, containing hats and review gates |
| Hat | Role | A behavioral role scoped to a stage, defined in `hats/{hat}.md` files within the stage directory |
| Review Gate | Quality Gate | A checkpoint between stages controlling advancement. `auto` = harness-only (no human). `ask` = local review UI, human approves/rejects via MCP response. `external` = blocks until external system (GitHub/GitLab) approves; signal detected primarily by branch merge detection, with URL-based CLI probing as fallback. `await` = blocks until an external event occurs (not a review — e.g., customer response, pipeline). Compound: `[external, ask]` = user chooses between external submission or local approval. |

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
