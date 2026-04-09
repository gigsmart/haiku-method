---
name: setup
description: Configure H·AI·K·U for this project — auto-detect VCS, hosting, CI/CD, and providers
---

# Setup

Configure `.haiku/settings.yml` by auto-detecting the environment and confirming with the user.

1. **Detect:** VCS (`git`/`jj`), hosting (remote URL), CI/CD (workflow files), default branch.
2. **Providers:** Use ToolSearch to discover available MCP providers for ticketing, spec, design, comms.
3. **Confirm:** Present detected settings via `ask_user_visual_question`. Allow adjustments.
4. **Configure providers:** For each confirmed provider, collect required config from `$CLAUDE_PLUGIN_ROOT/schemas/providers/{type}.schema.json`.
5. **Workflow tuning:** Ask about mode, granularity, default studio, review agents, etc.
6. **Write:** Save `.haiku/settings.yml` preserving existing fields. Commit.
7. **Done:** Display summary. Suggest `/haiku:start`.
