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

### Engineering

#### Software

The default for code-producing work. Full software development lifecycle from inception through security review.

| Property | Value |
|----------|-------|
| **Stages** | inception, design, product, development, operations, security |
| **Persistence** | git |
| **Delivery** | Pull request |

Supports both single-stage (all disciplines merged) and multi-stage (sequential progression) execution modes.

#### Data Pipeline

Data engineering lifecycle for ETL pipelines, data warehouses, and analytics workflows.

| Property | Value |
|----------|-------|
| **Stages** | discovery, extraction, transformation, validation, deployment |
| **Persistence** | git |
| **Delivery** | Pull request |

#### Migration

System and data migration lifecycle for platform transitions, version upgrades, and data moves.

| Property | Value |
|----------|-------|
| **Stages** | assessment, mapping, migrate, validation, cutover |
| **Persistence** | git |
| **Delivery** | Pull request |

#### Incident Response

Incident response lifecycle optimized for fast response with structured follow-through.

| Property | Value |
|----------|-------|
| **Stages** | triage, investigate, mitigate, resolve, postmortem |
| **Persistence** | git |
| **Delivery** | Pull request |

#### Compliance

Regulatory compliance lifecycle for audits, certifications (SOC2, HIPAA, GDPR, ISO 27001), and policy management.

| Property | Value |
|----------|-------|
| **Stages** | scope, assess, remediate, document, certify |
| **Persistence** | git |
| **Delivery** | Pull request |

#### Security Assessment

Structured offensive security lifecycle for penetration testing, vulnerability analysis, and security audits.

| Property | Value |
|----------|-------|
| **Stages** | reconnaissance, enumeration, exploitation, post-exploitation, reporting |
| **Persistence** | git |
| **Delivery** | Pull request |

The security-assessment studio is distinct from the software studio's security stage. The software studio's security stage is a defensive review phase within a development lifecycle. The security-assessment studio is a standalone offensive security lifecycle — its stages move from reconnaissance (mapping the attack surface) through exploitation (validating vulnerabilities) to reporting (structured findings with severity ratings and remediation guidance).

### Go-to-Market

#### Sales

Sales cycle lifecycle for managing deals from prospect research through close and handoff.

| Property | Value |
|----------|-------|
| **Stages** | research, qualification, proposal, negotiation, close |
| **Persistence** | filesystem |
| **Delivery** | Local |

#### Marketing

Campaign and content marketing lifecycle from audience research through launch and measurement.

| Property | Value |
|----------|-------|
| **Stages** | research, strategy, content, launch, measure |
| **Persistence** | filesystem |
| **Delivery** | Local |

#### Customer Success

Customer success lifecycle from onboarding through adoption, health monitoring, expansion, and renewal.

| Property | Value |
|----------|-------|
| **Stages** | onboarding, adoption, health-check, expansion, renewal |
| **Persistence** | filesystem |
| **Delivery** | Local |

#### Product Strategy

Product strategy lifecycle for defining what to build and why — discovery through stakeholder alignment.

| Property | Value |
|----------|-------|
| **Stages** | discovery, user-research, prioritization, roadmap, stakeholder-review |
| **Persistence** | filesystem |
| **Delivery** | Local |

### General Purpose

#### Ideation

Universal lifecycle for creative, analytical, or exploratory work that doesn't fit a specialized domain.

| Property | Value |
|----------|-------|
| **Stages** | research, create, review, deliver |
| **Persistence** | filesystem |
| **Delivery** | Local |

#### Documentation

Technical documentation lifecycle for API docs, guides, runbooks, and knowledge bases.

| Property | Value |
|----------|-------|
| **Stages** | audit, outline, draft, review, publish |
| **Persistence** | git |
| **Delivery** | Pull request |

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
