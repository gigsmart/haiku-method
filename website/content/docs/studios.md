---
title: Studios
description: Named lifecycle templates that define how work progresses through stages
order: 31
---

A **studio** is a named lifecycle template that defines which stages run and in what order. Persistence is environment-detected (git vs. filesystem), not studio-configured.

## How Studios Work

When you create an intent with `/haiku:start`, H·AI·K·U selects or prompts for a studio. The studio determines:

- **Which stages** the intent progresses through
- **Execution mode** — single-stage (all disciplines merged) or multi-stage (sequential progression)

Persistence is handled automatically based on the environment — if you're in a git repo, state is committed and pushed. If not, state lives as files on disk.

## Identifying Studios

Every studio has three kinds of identifier, all of which resolve to the same studio:

- **`name`** — the canonical display name shown in browse views (e.g., `application-development`)
- **`slug`** — a short alias for CLI/agent input (e.g., `appdev`)
- **`aliases`** — additional names, typically used for backward compatibility after a rename (e.g., `software`)

You can pass any of these to `haiku_select_studio` or any tool that takes a studio identifier — the loader resolves it. Use `/studios` to browse the portfolio grouped by category with help links into each studio definition.

## Built-in Studios

### Engineering

#### Application Development

The default for user-facing application work — web, mobile, desktop, and services. Full lifecycle from inception through security review.

| Property | Value |
|----------|-------|
| **Name** | `application-development` |
| **Slug** | `appdev` |
| **Aliases** | `software` (legacy) |
| **Stages** | inception, product, design, development, security, operations |

Supports both single-stage (all disciplines merged) and multi-stage (sequential progression) execution modes. For libraries, games, and hardware products, use the specialized studios below.

#### Library Development

Lifecycle for libraries, SDKs, and CLI tools. Differs from application development: no product or design phases — inception directly covers discovery AND API surface, development builds against the contract, and release publishes rather than deploys.

| Property | Value |
|----------|-------|
| **Name** | `library-development` |
| **Slug** | `libdev` |
| **Stages** | inception, development, security, release |

#### Game Development

Lifecycle for games. Concept absorbs discovery (pitches and market fit are inseparable), prototype is a gated fun-validation stage, and polish is its own dedicated stage because game feel needs iteration time that app work does not.

| Property | Value |
|----------|-------|
| **Name** | `game-development` |
| **Slug** | `gamedev` |
| **Stages** | concept, prototype, production, polish, release |

#### Hardware Development

Lifecycle for hardware products — electronics, firmware, manufacturing. Unlike software, hardware has physical constraints, safety regulations, and a one-shot manufacturing gate. Requirements captures compliance upfront because it shapes every downstream decision.

| Property | Value |
|----------|-------|
| **Name** | `hardware-development` |
| **Slug** | `hwdev` |
| **Stages** | inception, requirements, design, firmware, validation, manufacturing |

#### Data Pipeline

Data engineering lifecycle for ETL pipelines, data warehouses, and analytics workflows.

| Property | Value |
|----------|-------|
| **Stages** | discovery, extraction, transformation, validation, deployment |

#### Migration

System and data migration lifecycle for platform transitions, version upgrades, and data moves.

| Property | Value |
|----------|-------|
| **Stages** | assessment, mapping, migrate, validation, cutover |

#### Incident Response

Incident response lifecycle optimized for fast response with structured follow-through.

| Property | Value |
|----------|-------|
| **Stages** | triage, investigate, mitigate, resolve, postmortem |

#### Compliance

Regulatory compliance lifecycle for audits, certifications (SOC2, HIPAA, GDPR, ISO 27001), and policy management.

| Property | Value |
|----------|-------|
| **Stages** | scope, assess, remediate, document, certify |

#### Security Assessment

Structured offensive security lifecycle for penetration testing, vulnerability analysis, and security audits.

| Property | Value |
|----------|-------|
| **Stages** | reconnaissance, enumeration, exploitation, post-exploitation, reporting |

The security-assessment studio is distinct from the software studio's security stage. The software studio's security stage is a defensive review phase within a development lifecycle. The security-assessment studio is a standalone offensive security lifecycle — its stages move from reconnaissance (mapping the attack surface) through exploitation (validating vulnerabilities) to reporting (structured findings with severity ratings and remediation guidance).

### Go-to-Market

#### Sales

Sales cycle lifecycle for managing deals from prospect research through close and handoff.

| Property | Value |
|----------|-------|
| **Stages** | research, qualification, proposal, negotiation, close |

#### Marketing

Campaign and content marketing lifecycle from audience research through launch and measurement.

| Property | Value |
|----------|-------|
| **Stages** | research, strategy, content, launch, measure |

#### Customer Success

Customer success lifecycle from onboarding through adoption, health monitoring, expansion, and renewal.

| Property | Value |
|----------|-------|
| **Stages** | onboarding, adoption, health-check, expansion, renewal |

#### Product Strategy

Product strategy lifecycle for defining what to build and why — discovery through stakeholder alignment.

| Property | Value |
|----------|-------|
| **Stages** | discovery, user-research, prioritization, roadmap, stakeholder-review |

### General Purpose

#### Ideation

Universal lifecycle for creative, analytical, or exploratory work that doesn't fit a specialized domain.

| Property | Value |
|----------|-------|
| **Stages** | research, create, review, deliver |

#### Documentation

Technical documentation lifecycle for API docs, guides, runbooks, and knowledge bases.

| Property | Value |
|----------|-------|
| **Stages** | audit, outline, draft, review, publish |

## Configuring the Default Studio

Set the default studio for new intents in `.haiku/settings.yml`:

```yaml
studio: appdev
```

You can use the canonical name (`application-development`), slug (`appdev`), or any alias (`software`). All resolve to the same studio.

If not set, H·AI·K·U auto-detects: projects with a git remote default to `appdev`, others to `ideation`.

## Creating a Custom Studio

Create a custom studio by adding a `STUDIO.md` file at `.haiku/studios/{name}/STUDIO.md`:

```yaml
---
name: data-pipeline
slug: etl
aliases: [pipeline]
description: ETL and data pipeline development
stages: [discovery, extraction, transformation, validation, deployment]
category: engineering
---
```

The `slug` and `aliases` fields are optional — if omitted, the canonical `name` is used for all identifier forms.

Then create `STAGE.md` files for each stage in `.haiku/studios/{name}/stages/{stage}/STAGE.md`. See [Stages](/docs/stages/) for the stage schema.

## Resolution Order

When H·AI·K·U resolves a studio identifier, it checks:

1. **Project-level** — `.haiku/studios/{name}/STUDIO.md` (first match by directory name, canonical name, slug, or alias wins)
2. **Built-in** — `plugin/studios/{name}/STUDIO.md` (same matching rules)

Project-level studios take precedence over built-in studios with the same directory name — this is how you override a built-in studio.

The loader matches against four identifier fields: directory name, canonical `name`, `slug`, and any `aliases`. Any of them resolves to the same studio.

## Studio Selection During Intent Creation

When you run `/haiku:start`:

1. If `.haiku/settings.yml` has a `studio` field, that studio is used as the default
2. If auto-detected (git repo → `appdev`, no git → `ideation`), that studio is suggested
3. You can override by specifying a different studio using any of its identifier forms

## Next Steps

- [Stages](/docs/stages/) — Understand the stage-based model and STAGE.md schema
- [Persistence](/docs/persistence/) — How work is stored and delivered
- [Core Concepts](/docs/concepts/) — Intents, units, bolts, and more
