---
title: Customizing H·AI·K·U
description: Tailor studios, stages, hats, and providers to your team's workflow
order: 35
---

H·AI·K·U ships with 12 built-in studios that work out of the box. When your workflow doesn't fit these defaults, you can customize at every level — studios, stages, hats, and providers — without forking the plugin.

All customizations live under `.haiku/` in your project and take precedence over built-in defaults.

## What You Can Customize

| Artifact | Location | Purpose |
|----------|----------|---------|
| **Studio** | `.haiku/studios/{name}/STUDIO.md` | Define a new lifecycle template |
| **Stage** | `.haiku/studios/{name}/stages/{stage}/STAGE.md` | Add a phase to a studio |
| **Hat** | `.haiku/studios/{name}/stages/{stage}/hats/{hat}.md` | Define agent behavior within a stage |
| **Provider instructions** | `.haiku/providers/{type}.md` | Customize how H·AI·K·U talks to Jira, Slack, etc. |
| **Settings** | `.haiku/settings.yml` | Global project configuration |

## Creating a Custom Studio

A studio defines which stages run and in what order. To create one:

1. Create the studio directory and `STUDIO.md`:

```
.haiku/studios/data-pipeline/STUDIO.md
```

```yaml
---
name: data-pipeline
description: ETL and data pipeline development
stages: [discovery, extraction, transformation, validation, deployment]
category: engineering
---
```

2. Create a stage for each entry in the `stages` list (see below).

3. Set it as your default in `.haiku/settings.yml`:

```yaml
studio: data-pipeline
```

Or specify it per-intent when running `/haiku:start`.

## Creating a Custom Stage

Each stage needs a `STAGE.md` and a `hats/` directory with at least one hat file.

```
.haiku/studios/data-pipeline/stages/validation/
  STAGE.md
  hats/
    validator.md
    data-quality-reviewer.md
```

**STAGE.md frontmatter:**

```yaml
---
name: validation
description: Validate data quality and schema compliance
hats: [validator, data-quality-reviewer]
review: ask
unit_types: [validation, data-quality]
inputs:
  - stage: transformation
    output: transformed-data
---
```

### Stage Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Stage identifier (matches directory name) |
| `description` | string | yes | What this stage accomplishes |
| `hats` | list | yes | Ordered hat sequence — agents execute in this order |
| `review` | enum | yes | `auto`, `ask`, `external`, `await`, or `[external, ask]` |
| `gate-protocol` | object | no | Timeout duration, timeout action (`escalate`, `auto-advance`, `block`), and pre-conditions |
| `unit_types` | list | no | Constrains which unit types this stage processes |
| `inputs` | list | no | Artifacts required from prior stages |

### Review Modes

- **`auto`** — Advance without human review if completion criteria pass
- **`ask`** — Pause for human approval before advancing
- **`external`** — Block until external review (e.g., PR approval)
- **`await`** — Block until an external event occurs (e.g., customer response, CI result, stakeholder decision)
- **`[external, ask]`** — Try external first, fall back to ask

## Creating a Custom Hat

Hat files define what an agent does within a stage. Each hat file follows a simple structure:

**`.haiku/studios/data-pipeline/stages/validation/hats/validator.md`:**

```markdown
**Focus:** Run data quality checks against the schema definition and business
rules. Verify row counts, null rates, type conformance, and referential integrity.

**Produces:** Validation report with pass/fail per check, sample failing rows,
and severity ratings.

**Reads:** Transformed data output, schema definitions, business rule document.

**Anti-patterns:**
- Approving data that has unresolved null-rate violations
- Skipping referential integrity checks for "small" datasets
- Trusting row counts without spot-checking distributions
```

### Hat File Sections

| Section | Purpose |
|---------|---------|
| **Focus** | The core responsibility — what this agent concentrates on |
| **Produces** | Artifacts or outputs the hat creates |
| **Reads** | Inputs the hat consumes from prior hats or stages |
| **Anti-patterns** | Common mistakes to avoid — these guide the agent away from bad habits |

These sections are loaded directly into the agent's prompt during execution. Be specific — vague instructions produce vague results.

## Augmenting Built-in Hats

You don't need to replace a built-in hat to customize it. Create a project-level hat file at the same path, and its content is **appended** to the built-in instructions under a `## Project Augmentation` header.

For example, to add project-specific guidance to the software studio's builder hat:

```
.haiku/studios/software/stages/development/hats/builder.md
```

```markdown
**Project-specific guidance:**

- Always use the `trpc` router pattern for new API endpoints
- Run `bun test:e2e` in addition to unit tests before marking complete
- Database migrations must be reversible
```

This augments (not replaces) the built-in builder instructions.

## Customizing Provider Instructions

H·AI·K·U ships with default instructions for each provider category (ticketing, spec, design, comms). To override them for your project:

1. Run `/haiku:setup` — it offers to create override files during provider configuration
2. Or manually create `.haiku/providers/{type}.md` (e.g., `.haiku/providers/jira.md`)

The override file replaces the built-in instructions for that provider type. See [Providers](/docs/providers/) for details.

## Resolution Order

For all customizable artifacts, H·AI·K·U checks project-level first:

| Artifact | Project Path | Built-in Path |
|----------|-------------|---------------|
| Studio | `.haiku/studios/{name}/STUDIO.md` | `plugin/studios/{name}/STUDIO.md` |
| Stage | `.haiku/studios/{name}/stages/{stage}/STAGE.md` | `plugin/studios/{name}/stages/{stage}/STAGE.md` |
| Hat | `.haiku/studios/{name}/stages/{stage}/hats/{hat}.md` | `plugin/studios/{name}/stages/{stage}/hats/{hat}.md` |
| Provider | `.haiku/providers/{type}.md` | `plugin/providers/{category}.md` |

Project-level takes precedence. For hats, project-level **augments** (appends to) the built-in rather than replacing it — unless no built-in exists.

## Scaffolding with `/haiku:scaffold`

Use `/haiku:scaffold` to generate the directory structure and template files for custom artifacts:

```
/haiku:scaffold studio data-pipeline
/haiku:scaffold stage data-pipeline validation
/haiku:scaffold hat data-pipeline validation data-quality-reviewer
```

This creates the files with the correct frontmatter structure, ready for you to fill in.

## Example: Adding a Compliance Stage

To add a compliance stage to the built-in software studio:

1. Create the stage directory:
```
.haiku/studios/software/stages/compliance/
  STAGE.md
  hats/
    compliance-auditor.md
    documentation-writer.md
```

2. Define the stage:
```yaml
---
name: compliance
description: Regulatory compliance verification
hats: [compliance-auditor, documentation-writer]
review: external
unit_types: [compliance]
inputs:
  - stage: development
    output: code
  - stage: security
    output: threat-model
---
```

3. Override the software studio's stage list in your project:
```
.haiku/studios/software/STUDIO.md
```
```yaml
---
name: software
description: Software development with compliance
stages: [inception, design, product, development, operations, security, compliance]
category: engineering
---
```

## Next Steps

- [Studios](/docs/studios/) — Built-in studio details and configuration
- [Stages](/docs/stages/) — Stage schema and built-in stages
- [The Hat System](/docs/hats/) — Understanding hat-based roles
- [Providers](/docs/providers/) — External tool integrations
