---
title: Studios
description: Named lifecycle templates that define how work progresses through stages
order: 31
---

A **studio** is a named lifecycle template that defines which stages run and in what order. Studios also declare the persistence adapter used for workspace management and delivery.

## How Studios Work

When you create an intent with `/haiku:new`, H·AI·K·U selects or prompts for a studio. The studio determines:

- **Which stages** the intent progresses through
- **Persistence type** — how work is stored and delivered (git branches + PRs, or filesystem snapshots)
- **Execution mode** — single-stage (all disciplines merged) or multi-stage (sequential progression)

## Built-in Studios

### Software Studio

The default for code-producing work. Full software development lifecycle from inception through security review.

| Property | Value |
|----------|-------|
| **Stages** | inception, design, product, development, operations, security |
| **Persistence** | git (branches + pull requests) |
| **Delivery** | Pull request |

```yaml
# STUDIO.md frontmatter
---
name: software
description: Standard software development lifecycle
stages: [inception, design, product, development, operations, security]
persistence:
  type: git
  delivery: pull-request
---
```

Supports both single-stage (all disciplines merged into one pass) and multi-stage (sequential discipline progression) execution modes. Single-stage is the default for most work.

### Ideation Studio

General-purpose lifecycle for creative, analytical, or exploratory work that doesn't fit a specialized domain. Works for content creation, research projects, documentation initiatives, or any work that follows a gather-create-review-deliver pattern.

| Property | Value |
|----------|-------|
| **Stages** | research, create, review, deliver |
| **Persistence** | filesystem (version snapshots) |
| **Delivery** | Local |

```yaml
# STUDIO.md frontmatter
---
name: ideation
description: Universal lifecycle for any creative or analytical work
stages: [research, create, review, deliver]
persistence:
  type: filesystem
  delivery: local
---
```

## Configuring the Default Studio

Set the default studio for new intents in `.haiku/settings.yml`:

```yaml
studio: software
```

If not set, H·AI·K·U auto-detects: projects with a git remote default to `software`, others to `ideation`.

## Creating a Custom Studio

Create a custom studio by adding a `STUDIO.md` file at `.haiku/studios/{name}/STUDIO.md`:

```yaml
---
name: data-pipeline
description: ETL and data pipeline development
stages: [discovery, extraction, transformation, validation, deployment]
persistence:
  type: git
  delivery: pull-request
---
```

Then create `STAGE.md` files for each stage in `.haiku/studios/{name}/stages/{stage}/STAGE.md`. See [Stages](/docs/stages/) for the stage schema.

## Resolution Order

When H·AI·K·U resolves a studio name, it checks:

1. **Project-level** — `.haiku/studios/{name}/STUDIO.md`
2. **Built-in** — `plugin/studios/{name}/STUDIO.md`

Project-level studios take precedence. This means you can override a built-in studio by creating a project-level studio with the same name.

## Studio Selection During Intent Creation

When you run `/haiku:new`:

1. If `.haiku/settings.yml` has a `studio` field, that studio is used as the default
2. If auto-detected (git repo → software, no git → ideation), that studio is suggested
3. You can override by specifying a different studio

## Next Steps

- [Stages](/docs/stages/) — Understand the stage-based model and STAGE.md schema
- [Persistence](/docs/persistence/) — How work is stored and delivered
- [Core Concepts](/docs/concepts/) — Intents, units, bolts, and more
