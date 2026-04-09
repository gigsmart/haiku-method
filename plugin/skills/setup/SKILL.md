---
name: setup
description: Configure H·AI·K·U for this project — auto-detect VCS, hosting, CI/CD, and providers
---

# Setup

Configure this project's `.haiku/settings.yml` by auto-detecting the environment.

## Process

### Phase 1: Auto-Detect Environment
Run these detections:
- **VCS:** `git rev-parse --git-dir` or `jj root`
- **Hosting:** `git remote get-url origin`
- **CI/CD:** Look for `.github/workflows`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci`
- **Default branch:** `git symbolic-ref refs/remotes/origin/HEAD`

### Phase 2: Probe MCP Tools for Providers
Use ToolSearch to discover available MCP providers for ticketing, spec, design, and comms.

### Phase 3: Confirm Settings
Present detected settings via `ask_user_visual_question`. Allow adjustments.

### Phase 4: Provider Configuration
For each confirmed provider, collect required config. Read schemas from `$CLAUDE_PLUGIN_ROOT/schemas/providers/{type}.schema.json`.

### Phase 5: Workflow Tuning
Ask about: workflow mode, granularity, default studio, announcement formats, visual review, review agents.

### Phase 6: Write Settings
Write `.haiku/settings.yml` preserving existing fields. Commit.

### Phase 7: Confirmation
Display summary table. Suggest `/haiku:start` to begin first intent.
