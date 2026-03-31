---
intent_slug: adopt-skill
worktree_path: .ai-dlc/worktrees/adopt-skill
project_maturity: established
provider_config: {"spec":null,"ticketing":null,"design":null,"comms":null,"vcsHosting":"github","ciCd":"github-actions"}
---

# Intent Description

Build a new `/adopt` slash command that reverse-engineers existing features (built before AI-DLC or without it) into full AI-DLC intent artifacts. The purpose is to bring pre-existing features into the AI-DLC lifecycle so they can benefit from `/operate` (operational management — monitoring, runbooks, deployment procedures) and `/followup` (structured iteration).

## Core Workflow

1. **Input gathering**: The user describes the feature in natural language, optionally points to specific code paths/files/directories, and the agent cross-references git history (PRs, commits, branches) to build a complete picture.

2. **Domain discovery**: The agent explores the codebase, analyzing the feature's code, tests, CI configuration, and git history to understand the domain model, entities, relationships, and data sources.

3. **Artifact generation**: The agent produces full AI-DLC artifacts:
   - `intent.md` — problem/solution/domain model, with status reflecting the feature is already built
   - `unit-*.md` files — pragmatic decomposition (start from actual git history but restructure into clean AI-DLC unit boundaries where the real history was messy), all with `status: completed`
   - `discovery.md` — domain knowledge for future reference
   - Success criteria — reverse-engineered from existing tests, CI checks, and validation in the codebase

4. **Operational plan**: After creating artifacts, automatically generate an operational plan so `/operate` is immediately usable.

5. **Enable /followup**: The adopted intent serves as a valid `iterates_on` target for future `/followup` intents.

## Clarification Answers

**Q: How should the feature identify what to reverse-engineer?**
A: Combination — user describes it, optionally points to code, and the agent cross-references git history.

**Q: What AI-DLC artifacts should be generated?**
A: Full artifact set — intent.md, unit files (status: completed), and discovery.md with domain knowledge.

**Q: What's the primary goal?**
A: Both — enable operational management via /operate AND structured iteration via /followup.

**Q: Should units map to actual history or ideal decomposition?**
A: Pragmatic blend — start from actual history but restructure into clean AI-DLC units where the real history was messy. Prioritize useful structure over historical accuracy.

**Q: How should it be invoked?**
A: `/adopt` — a new slash command.

**Q: Should it auto-generate an operational plan?**
A: Yes — after creating intent artifacts, automatically generate the operational plan so /operate is immediately usable.

**Q: Should it reverse-engineer success criteria?**
A: Yes, from tests + CI — analyze test suites and CI config to reconstruct what the feature's success criteria would have been.

## Discovery File Path

.ai-dlc/adopt-skill/discovery.md
