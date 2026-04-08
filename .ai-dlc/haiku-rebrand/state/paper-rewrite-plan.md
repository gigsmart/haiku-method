# Paper Rewrite Plan

## Premise

The current paper is the haiku-method paper with AI-DLC implementation bolted on. It needs to be rewritten from the plugin's reality — what it actually does, not what was once aspirational.

Source of truth: the plugin implementation on branch `ai-dlc/haiku-rebrand/main`.

## Structure

### Section 1: The Problem
- AI collaboration fails predictably (the 6 failure modes from the methodology page)
- No structure, no quality enforcement, no completion criteria, no mode selection, no learning loop, no domain awareness
- Brief, 1 page max

### Section 2: The 4-Phase Model (Universal)
- Elaboration → Execution → Operation → Reflection
- This is the universal pattern any structured work follows
- Each phase feeds the next; reflection feeds back into elaboration
- Planning happens at 3 levels within this cycle:
  1. Intent (broad: what and why)
  2. Units within stages (collaborative: what success looks like per chunk)
  3. Bolts with planner hat (tactical: what the next hat needs to do)
- This section is domain-agnostic — no software, no code, no git

### Section 3: Studios (Domain Templates)
- Studios map the 4 phases to domain-specific stages
- A studio defines: stage order, persistence type, delivery mechanism
- Built-in studios:
  - **Ideation** (default): research → create → review → deliver (filesystem persistence)
  - **Software**: inception → design → product → development → operations → security (git persistence)
- Custom studios: any team can define their own
- Studios are the answer to "no domain awareness" — security teams aren't forced into dev sprints

### Section 4: Stages (The Implementation Layer)
- Each stage has:
  - STAGE.md (metadata: hats, review gate, inputs, unit types)
  - `hats/{hat}.md` files (per-hat instructions)
  - `outputs/` directory (stage output definitions with scope)
- The stage loop: for each unit → run hat sequence → review gate
- Hats: fresh agent per hat, no context bleed, adversarial separation
- Review gates: auto / ask / external (explain each concretely)
  - Array support: `[external, ask]` for autopilot compatibility
  - Discrete mode: every gate is effectively external (handoff between people)
- Input/output contracts: stages declare what they consume and produce
  - Output scopes: project (accumulates), intent (per-feature), stage (working context), repo (source tree)

### Section 5: Units and Bolts (The Work)
- Units: discrete pieces of work with verifiable completion criteria
- Organized as a DAG (dependency graph) within each stage
- Bolts: one cycle through the stage's hat sequence for a unit
  - Plan → Build → Review (for development)
  - Threat-model → Red-team → Blue-team → Security-review (for security)
  - Each stage defines its own hat sequence
- Hat output handoff: each hat produces structured output that flows to the next
- Quality gates: declared in frontmatter, enforced by hooks, machine-verified

### Section 6: Persistence (How Work is Saved)
- Abstracted behind adapters — the core loop doesn't know or care
- Git adapter: worktrees, commits, branches, PRs
- Filesystem adapter: directories, timestamps, local delivery
- Studio declares which adapter via `persistence.type`
- Custom adapters possible (Notion, etc.)

### Section 7: Modes of Operation
- Continuous (default): AI drives the pipeline, human reviews at gates
- Discrete: human invokes each stage, AI runs within stages
- Planning levels apply in both modes:
  - Intent planning: always collaborative (human + AI)
  - Unit planning: always collaborative
  - Bolt planning: AI-driven (planner hat)

### Section 8: The H·AI·K·U Plugin Implementation
- Two commands: `/haiku:new` (create intent + start first stage) and `/haiku:resume` (continue)
- Plugin architecture: skills (SKILL.md), hooks (shell), libraries (shell)
- Key libraries: orchestrator.sh, studio.sh, stage.sh, hat.sh, persistence.sh, state.sh
- Hook system: context injection, quality gates, backpressure, iteration enforcement
- Knowledge architecture: global pool (`.haiku/knowledge/`) + intent artifacts
- Settings and configuration

### Section 9: Beyond Software
- How non-software domains use H·AI·K·U
- Marketing studio example
- Hardware/manufacturing studio example
- The point: same 4-phase cycle, different stages, different persistence

### Section 10: Conclusion
- Brief, forward-looking

## What to READ before writing

1. `plugin/studios/*/STUDIO.md` — studio definitions
2. `plugin/studios/*/stages/*/STAGE.md` — all stage definitions
3. `plugin/studios/*/stages/*/hats/*.md` — all hat files
4. `plugin/studios/*/stages/*/outputs/*.md` — all output definitions
5. `plugin/lib/orchestrator.sh` — stage loop
6. `plugin/lib/hat.sh` — hat resolution
7. `plugin/lib/persistence.sh` + `plugin/lib/adapters/*.sh` — persistence
8. `plugin/skills/new/SKILL.md` — /haiku:new
9. `plugin/skills/run/SKILL.md` — /haiku:resume
10. `plugin/hooks/quality-gate.sh` — quality enforcement
11. `plugin/hooks/inject-context.sh` — context injection
12. `CLAUDE.md` — current project config
13. `plugin/schemas/settings.schema.json` — settings model

## What NOT to include

- Aspirational features not in the plugin (hierarchical workspaces, MCP-backed storage, five memory layers)
- Named workflows (deleted — hat sequences are per-stage)
- Passes (legacy shim)
- Han ecosystem references
- Anything from the original haiku-method paper that isn't implemented

## Tone

Academic but accessible. The methodology paper for a practitioner who wants to understand how H·AI·K·U works and why. Not marketing, not a tutorial.
