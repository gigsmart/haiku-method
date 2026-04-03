---
title: "AI-DLC Meets Agent Teams"
description: "AI-DLC's construction loop now leverages Claude Code's Agent Teams, turning each unit of work into an independent teammate with its own context, worktree, and permission model."
date: 2026-02-05
author: The Bushido Collective
---

Claude Code recently shipped [Agent Teams](https://code.claude.com/docs/en/agent-teams) - an experimental feature that coordinates multiple independent Claude Code instances working together. Each teammate gets its own context window, can message other teammates directly, and shares a task list for self-coordination.

AI-DLC now supports it natively.

## Why Agent Teams Matter for AI-DLC

AI-DLC's construction loop already breaks work into **units** - focused pieces with clear completion criteria, each running in its own git worktree on its own branch. Previously, these units ran as subagents: constrained workers that execute within the parent session and can only report results back to the caller.

Agent Teams changes the game. Instead of subagents, each unit can now run as a **full independent Claude Code session**. The difference matters:

| | Subagents | Agent Teams |
|---|---|---|
| **Context** | Shares parent's context budget | Own full context window |
| **Communication** | Reports back to caller only | Messages any teammate directly |
| **Coordination** | Parent manages everything | Shared task list, self-coordination |
| **Isolation** | Runs within parent session | Fully independent session |

For AI-DLC, this means a builder teammate working on the backend can message the reviewer teammate about an architectural decision. A test writer can ask the planner for clarification on acceptance criteria. Teammates collaborate like a real team, not just workers reporting to a manager.

## How It Works

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled, the `/ai-dlc:execute` loop operates as a team:

1. The **lead session** reads the DAG of units and their dependencies
2. For each ready unit, the lead **spawns a teammate** in that unit's git worktree
3. Teammates work independently, executing the current hat's role (plan, build, review)
4. Teammates **communicate findings** through the shared mailbox
5. When a unit's criteria are satisfied, the teammate marks it complete and the lead advances the workflow

Each teammate automatically receives AI-DLC context via hook injection - the current hat instructions, intent, completion criteria, and workflow state. They start with full project context (CLAUDE.md, MCP servers, skills) just like any Claude Code session.

## One Mode for the Entire Intent

To make Agent Teams work cleanly with AI-DLC, we moved the operating mode from individual hats to the **intent level**.

Previously, each hat carried its own mode. A builder defaulted to OHOTL, a reviewer to HITL. This scattered autonomy decisions across hat definitions and made it impossible to give a consistent permission model to teammates.

Now you choose your mode once during `/ai-dlc:elaborate`. That single decision controls the permission model of every teammate spawned during construction:

| AI-DLC Mode | Agent Teams Mode | What Happens |
|---|---|---|
| **HITL** | `plan` | Teammate plans, lead approves before any implementation |
| **OHOTL** | `acceptEdits` | Teammate works autonomously, lead can intervene |
| **AHOTL** | `bypassPermissions` | Full autonomy, constrained only by completion criteria and backpressure |

The mode is stored in the intent file and inherited by the entire workflow:

```yaml
# .ai-dlc/my-feature/intent.md
---
workflow: default
mode: OHOTL
created: 2026-02-05
status: active
---
```

A senior engineer doing a routine refactor might choose AHOTL - teammates run with full autonomy, and backpressure hooks (linting, tests, type checks) enforce quality automatically. A team exploring unfamiliar territory might choose HITL - every teammate submits a plan that the lead reviews before implementation begins.

The human decides how much oversight they want. The mode is a property of the work, not the worker.

## Dynamic Hat Discovery

We also made workflows more composable. Every hat now carries a `description` in its frontmatter:

```yaml
---
name: "🔨 Builder"
description: Implements code to satisfy completion criteria using backpressure as feedback
---
```

During `/ai-dlc:elaborate`, the system discovers available hats dynamically by reading all hat files rather than referencing a hardcoded table. Drop a new hat file into the `hats/` directory with proper frontmatter and it becomes available for workflows immediately.

All thirteen built-in hats now describe themselves:

| Hat | Role |
|---|---|
| Observer | Gathers data about a bug through systematic observation |
| Hypothesizer | Forms testable theories about bug causes |
| Experimenter | Tests hypotheses through controlled experiments |
| Analyst | Evaluates results and implements the confirmed fix |
| Planner | Creates tactical execution plans for upcoming bolts |
| Builder | Implements code using backpressure as feedback |
| Reviewer | Verifies implementation satisfies completion criteria |
| Test Writer | Creates failing tests that define expected behavior (RED) |
| Implementer | Writes minimal code to make tests pass (GREEN) |
| Refactorer | Improves code quality while keeping tests green (REFACTOR) |
| Designer | Creates visual designs, UI mockups, and UX flows |
| Red Team | Attempts to break the implementation through security testing |
| Blue Team | Fixes vulnerabilities identified by Red Team |

Custom workflows reference hats by slug. The system resolves them at runtime:

```yaml
# .ai-dlc/workflows.yml
adversarial:
  description: Security-focused build with attack/defend cycles
  hats: [planner, builder, red-team, blue-team, reviewer]
```

## The Elaboration Flow

The `/ai-dlc:elaborate` command now asks three questions that shape the entire construction loop:

1. **What are you building?** Define the intent and completion criteria
2. **What workflow fits?** Choose from dynamically discovered workflows and hats
3. **How much autonomy?** Select HITL, OHOTL, or AHOTL for the entire intent

These decisions are captured once, persisted in the intent file, and inherited by every teammate throughout construction. No per-hat configuration. No mode drift. One conversation that defines how the team operates.

## Try It

Enable Agent Teams in your Claude Code settings:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Install or update the AI-DLC plugin:

```
/plugin marketplace add thebushidocollective/ai-dlc
/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project
```

Then run `/ai-dlc:elaborate` to define an intent with a mode, and `/ai-dlc:execute` to start the team.

The changes are backwards-compatible. Without Agent Teams enabled, the construction loop uses subagents as before. Existing intents without a `mode` field default to OHOTL.

---

*Units become teammates. Hats become roles. The intent becomes the team charter.*
