---
title: "Execution"
description: "Do the work through structured workflows"
phase_number: 2
color: "indigo"
---

## What Happens in Execution

Execution is where the plan becomes reality. The AI agent works through each unit using a structured workflow: plan, build, review, and advance.

This is not unstructured "just do it." Every iteration cycle (called a bolt) follows the same disciplined pattern. The agent plans its approach, executes the work, submits it for adversarial review, and only advances when quality gates are satisfied.

## Key Activities

- **Plan the approach**: Before writing a single line or producing any deliverable, the agent articulates its plan. This is visible to the team and can be redirected before work begins.
- **Build the deliverable**: The agent executes the planned work. In software, this means writing code. In other domains, it means producing the artifacts specified in the unit.
- **Adversarial review**: A separate review process evaluates the work against the completion criteria. This is not a rubber stamp — it actively looks for gaps, errors, and unmet criteria.
- **Quality gates**: Work that fails review does not advance. The agent receives specific feedback and iterates. There is no "close enough."

## How the AI Agent Behaves

The agent switches between distinct roles (called hats) during execution. A planner hat focuses on approach. A builder hat focuses on production. A reviewer hat focuses on quality.

These are not the same mindset. The separation is deliberate — it prevents the agent from marking its own homework.

In supervised mode, the team directs each step. In observed mode, the agent executes independently but the team monitors and can intervene. In autonomous mode, the agent works within defined boundaries without interruption.

## Across Domains

| Domain | Execution Looks Like |
|---|---|
| **Software** | Code implementation, test writing, build verification, PR creation |
| **Marketing** | Content creation, asset production, copy review, brand compliance check |
| **Operations** | Runbook execution, configuration changes, validation checks, rollback verification |
| **Research** | Data collection, analysis execution, finding synthesis, peer review |

## Outputs

- **Completed deliverables**: The work product for each unit, verified against criteria
- **Review records**: What was checked, what passed, what was iterated
- **Iteration history**: How many bolts it took and what changed between them
