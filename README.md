# H·AI·K·U

**Human + AI Knowledge Unification** — A lifecycle orchestration system for any structured work.

Studios, stages, and quality gates — disciplined form, reliable results.

## What It Is

H·AI·K·U is a Claude Code plugin that structures AI-assisted work into focused, iterative cycles with quality enforcement. It works for any domain — software development, sales, marketing, compliance, incident response, and more.

**Four-layer hierarchy:**

```
Studio > Stage > Unit > Bolt
```

- **Studio** — A lifecycle template (software, sales, compliance, etc.)
- **Stage** — A phase within the studio with its own hats and review gate
- **Unit** — A discrete piece of work with completion criteria
- **Bolt** — One iteration cycle through the hat sequence for a unit

## Installation

```
/install gigsmart/haiku-method
```

No external dependencies. The plugin ships a single binary (`plugin/bin/haiku`) that handles MCP tools, hooks, and state management.

## Quick Start

```
/haiku:start              # Create a new intent — describe what you want to do
/haiku:resume              # The orchestrator tells you what to do next
```

That's it. The orchestrator (`haiku_run_next`) drives the stage loop. You follow the actions it returns.

## 12 Built-In Studios

### Engineering
| Studio | Stages |
|--------|--------|
| **Software** | inception → design → product → development → operations → security |
| **Data Pipeline** | discovery → extraction → transformation → validation → deployment |
| **Migration** | assessment → mapping → migrate → validation → cutover |
| **Incident Response** | triage → investigate → mitigate → resolve → postmortem |
| **Compliance** | scope → assess → remediate → document → certify |
| **Security Assessment** | reconnaissance → enumeration → exploitation → post-exploitation → reporting |

### Go-to-Market
| Studio | Stages |
|--------|--------|
| **Sales** | research → qualification → proposal → negotiation → close |
| **Marketing** | research → strategy → content → launch → measure |
| **Customer Success** | onboarding → adoption → health-check → expansion → renewal |
| **Product Strategy** | discovery → user-research → prioritization → roadmap → stakeholder-review |

### General Purpose
| Studio | Stages |
|--------|--------|
| **Ideation** | research → create → review → deliver |
| **Documentation** | audit → outline → draft → review → publish |

## The Stage Loop

Every stage runs the same five-step cycle:

1. **Decompose** — Break the stage into units with completion criteria and a dependency DAG
2. **Execute** — For each unit, run the bolt loop through the stage's hat sequence
3. **Adversarial Review** — Spawn review agents (per-stage + cross-stage) to verify the work
4. **Persist** — Save stage outputs to their scoped locations
5. **Gate** — Evaluate the review gate: `auto`, `ask`, `external`, or `await`

## Commands

| Command | Purpose |
|---------|---------|
| `/haiku:start` | Create a new intent |
| `/haiku:resume` | Advance through stages (orchestrator-driven) |
| `/haiku:composite` | Create multi-studio intent with sync points |
| `/haiku:refine` | Amend specs mid-execution or refine upstream stages |
| `/haiku:review` | Pre-delivery code review |
| `/haiku:reflect` | Post-completion analysis |
| `/haiku:operate` | Post-delivery operational tasks |
| `/haiku:capacity` | Historical throughput analysis |
| `/haiku:triggers` | Poll providers for events |
| `/haiku:setup` | Configure providers and quality gates |
| `/haiku:start --template <name>` | Create from a template (10 templates across 7 studios) |

## Architecture

One binary: `plugin/bin/haiku`

| Mode | Usage | Purpose |
|------|-------|---------|
| `haiku mcp` | MCP server (stdio) | 16 state tools + orchestrator + review tools |
| `haiku hook <name>` | Hook execution | 10 hooks (quality gates, context injection, etc.) |
| `haiku migrate` | CLI command | Migrate .ai-dlc/ intents to .haiku/ |

Source in `packages/haiku/` (TypeScript), compiled to a single bundled binary.

### State Model

State lives in committed artifacts, not ephemeral files:

| Level | Location | Key Fields |
|-------|----------|------------|
| Intent | `intent.md` frontmatter | studio, active_stage, status, started_at, completed_at |
| Stage | `stages/{stage}/state.json` | phase, status, started_at, gate_outcome |
| Unit | `unit-*.md` frontmatter | bolt, hat, status, started_at, completed_at |

MCP tools (`haiku_intent_*`, `haiku_stage_*`, `haiku_unit_*`) are the primary interface.

### Providers

Six bidirectional provider categories for external tool integration:

| Category | Examples | Purpose |
|----------|----------|---------|
| Ticketing | Jira, Linear, GitHub Issues | Work tracking, portfolio visibility |
| Spec | Notion, Confluence, Google Docs | Specifications, documentation |
| Design | Figma, Canva, Pencil | Design artifacts and tokens |
| Comms | Slack, Teams, Discord | Notifications, gate resolution |
| CRM | Salesforce, HubSpot | Deal/opportunity sync, cross-studio triggers |
| Knowledge | Notion, Confluence | Cross-studio context sharing |

Claude mediates the translation — providers don't need to understand H·AI·K·U's schema.

## Browse

Explore any H·AI·K·U workspace in the browser:

- **Local:** Drop a project folder at [haikumethod.ai/browse](https://haikumethod.ai/browse)
- **Remote:** Connect to GitHub/GitLab repos with OAuth

## Customization

Everything is file-based and overridable:

```
.haiku/studios/{name}/STUDIO.md              # Custom studio
.haiku/studios/{name}/stages/{stage}/STAGE.md # Custom stage
.haiku/studios/{name}/stages/{stage}/hats/    # Custom hats
.haiku/studios/{name}/stages/{stage}/review-agents/ # Custom review agents
.haiku/studios/{name}/operations/             # Custom operations
.haiku/studios/{name}/reflections/            # Custom reflections
.haiku/studios/{name}/templates/              # Custom intent templates
.haiku/providers/{type}.md                    # Custom provider instructions
```

Use `/haiku:scaffold` to generate any of these.

## Development

```bash
cd packages/haiku
npm install
npm run build     # builds to plugin/bin/haiku
npm run typecheck
npm test
```

## Learn More

- [Website](https://haikumethod.ai) — Browse studios, stages, and documentation
- [Paper](https://haikumethod.ai/paper) — The full methodology
- [Gap Analysis](https://haikumethod.ai/haiku-gaps.html) — Platform architecture and solutions

## License

Apache-2.0 — See [LICENSE](LICENSE) for details.
