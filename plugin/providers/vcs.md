---
category: vcs
description: Bidirectional VCS provider — sync H·AI·K·U state to/from version control systems
---

# VCS Provider — Default Instructions

## Inbound: Provider → H·AI·K·U

On session start, check the VCS provider for events that affect active intents:

- **Branch state** — detect current branch, verify it matches the intent branch naming convention (`haiku/{slug}/main`)
- **Remote status** — check if local branch is ahead/behind remote; surface push needs
- **PR/MR status** — if a PR/MR exists for the intent branch, surface its review state (open, approved, changes requested, merged)
- **Merge conflicts** — detect if the intent branch has conflicts with the default branch; surface resolution needs before delivery

### Translation (Provider → H·AI·K·U)

| Provider Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| Branch | Intent | `haiku/{slug}/main` maps to the active intent |
| Pull Request / Merge Request | Delivery gate | PR state maps to stage gate outcome |
| PR review comments | Review feedback | Surface as context for review agents |
| Merge conflict | Blocker | Flag intent as needing conflict resolution |
| Remote ahead/behind | Sync state | Behind = pull needed; ahead = push needed |
| Default branch (main/master) | Base branch | Target for PR creation |

**Key principle:** The VCS provider manages code delivery mechanics. It does not interpret code content — that's the stage hats' job. VCS handles branching, committing, pushing, and PR lifecycle.

## Outbound: H·AI·K·U → Provider

### Commit & Push (During Execution)

When the studio's `persistence.type` is `git`:

- **Every orchestrator state change** → commit `.haiku/` state to the intent branch
- **After every commit** → push to remote (when `auto_push` is enabled)
- Push failures are non-fatal — the commit is preserved locally and will push on the next successful attempt

State changes that trigger commit + push:
- Stage start / complete
- Unit start / complete / fail
- Hat advance
- Intent create / complete
- Go back (stage or phase)

### PR/MR Creation (At Stage Boundaries)

When the studio's `persistence.delivery` is `pull-request` and `auto_pr` is enabled:

- **Intent completion** → create PR from `haiku/{slug}/main` to the default branch
- PR title: intent description or title from intent.md frontmatter
- PR body: summary of stages completed, units delivered, and review outcomes

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | Provider Concept | Translation |
|---|---|---|
| Intent slug | Branch name | `haiku/{slug}/main` |
| Stage completion | Commit | State committed at each stage boundary |
| Unit completion | Commit | State committed per unit lifecycle event |
| Intent completion | Pull Request | PR created from intent branch to default branch |
| Review gate outcome | PR status | Gate approval maps to PR readiness |
| Go back | Commit | State rollback committed as new state |

### Branch Naming

All intent branches follow: `haiku/{slug}/main`

Unit worktrees (when enabled) branch from the intent branch as: `haiku/{slug}/units/{unit-name}`

## Sync: Event Discovery

On session start (or when `/haiku:resume` is invoked), check the VCS provider for relevant events:

```
1. Detect current branch — verify it matches the active intent
2. Check remote tracking: ahead/behind counts
3. If behind remote: pull to sync
4. If PR exists: check review status (approved, changes requested, merged)
5. Surface merge conflicts with default branch if any
```

This is pull-based — not real-time. It runs when the user starts working.

## Provider Config

Provider-specific configuration lives under `providers.vcs.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`

**Never create top-level provider keys** (e.g., no top-level `github:` key). All config goes under `providers.vcs.config`.

When config fields are present, use them for VCS operations:
- `auto_push` → push to remote after every commit (default: true)
- `auto_pr` → create PR at intent completion (default: true)
- `default_branch` → base branch for PRs (default: "main")
- `remote` → git remote name (default: "origin")
