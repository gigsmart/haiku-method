---
title: Cowork Mode
description: Use AI-DLC on repositories you don't have checked out locally
order: 13
---

# Cowork Mode

Cowork mode lets you use AI-DLC when you're not inside a git repository — for example, when an orchestrator is coordinating work across multiple repos, or when you're working from a team/cowork Claude session.

## How It Works

When you run `/ai-dlc:elaborate` outside of a git repo, AI-DLC detects this and enters cowork mode:

1. **Get the repo URL** — AI-DLC asks which repository the work targets. If VCS MCP tools (e.g., GitHub MCP) are available, it offers discovered repos as options.
2. **Clone the repo** — The repository is cloned to a temporary workspace.
3. **Proceed normally** — Once cloned, everything works identically to being in a local repo. Settings, providers, hooks, and all other features operate as expected.

The key principle: **cloning eliminates the cowork problem surface**. There are no special cowork code paths after the initial clone.

## Artifact Delivery

In cowork mode, after elaboration writes `.ai-dlc/` artifacts and creates tickets:

- Artifacts are committed on the intent branch (same as normal)
- The intent branch is pushed to the remote automatically
- Builders can pull the branch or clone independently

## Execution in Cowork

The `/ai-dlc:execute` skill handles cowork transparently:

- Ensures remote tracking is configured for the intent branch
- Pulls latest changes before starting each unit
- When spawning builder teammates, includes the repo URL so they can clone independently

## When to Use Cowork

- **Team orchestration** — A lead coordinates work across multiple repos from a single session
- **Remote planning** — Elaborate on a repo you haven't cloned yet
- **CI/CD integration** — Automated systems that need to run AI-DLC workflows

## Next Steps

- **[Providers](/docs/providers/)** — Connect to Jira, Notion, Figma, and Slack
- **[Workflows](/docs/workflows/)** — Understand the hat-based workflow system
