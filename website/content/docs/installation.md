---
title: Installation
description: Install H·AI·K·U in your Claude environment
order: 2
---

H·AI·K·U is distributed as a Claude plugin that works in both Claude Code and Cowork. This guide covers installation methods and prerequisites.

## Prerequisites

### Claude Code or Cowork

H·AI·K·U requires [Claude Code](https://claude.ai/code) or [Claude Cowork](https://claude.ai/cowork), Anthropic's AI-powered development environments. Ensure you have either Claude Code or Cowork installed and configured.

H·AI·K·U also works with other MCP-compatible harnesses including Cursor, Windsurf, Gemini CLI, OpenCode, and Kiro. See [Other Harnesses](/docs/other-harnesses/) for setup instructions.

## Installation Methods

### Method 1: Via Plugin Install (Recommended)

Install directly from within a Claude Code or Cowork session:

```
/plugin marketplace add gigsmart/haiku-method
/plugin install haiku --scope project
```

### Method 2: Manual Configuration

Add the plugin to your Claude settings file manually.

**User-level installation** (`~/.claude/settings.json`):

```json
{
  "plugins": [
    "github:gigsmart/haiku-method"
  ]
}
```

**Project-level installation** (`.claude/settings.json` in your project):

```json
{
  "plugins": [
    "github:gigsmart/haiku-method"
  ]
}
```

## Verification

After installation, verify the plugin is working:

1. Start a new Claude session in your project
2. Type `/haiku:start` - you should see the inception flow start
3. If `/haiku:start` works, your installation is successful

If commands aren't recognized, restart your Claude session.

## Quality Gates

H·AI·K·U has built-in quality gating -- no external plugins needed. Quality gates are defined in your intent frontmatter and enforced automatically by the `quality-gate` hook during execution. You can configure gates for type checking, linting, testing, and any other validation your project requires.

See [Core Concepts](/docs/concepts/) for details on how quality gates integrate with the stage pipeline.

## Project Setup

### Create the H·AI·K·U Directory

H·AI·K·U stores its artifacts in `.haiku/` at your project root:

```
your-project/
  .haiku/
    add-oauth-login/         # Intent directory
      intent.md              # Intent definition
      unit-01-setup.md       # Unit files
      unit-02-callback.md
  src/
  tests/
  ...
```

The directory is created automatically when you run `/haiku:start` for the first time.

### Git Configuration

Add H·AI·K·U artifacts to version control:

```bash
# H·AI·K·U artifacts should be committed
git add .haiku/
```

The `.haiku/` directory contains:
- Intent definitions
- Unit specifications
- Progress tracking

These are valuable documentation that should be preserved.

### Gitignore (Optional)

If you prefer not to commit H·AI·K·U artifacts:

```gitignore
# .gitignore
.haiku/
```

However, committing is recommended - it provides:
- Work history and context
- Team collaboration
- Recovery from context resets

## Troubleshooting

### Commands Not Recognized

**Symptom:** `/haiku:start` or `/haiku:pickup` don't activate

**Solutions:**
1. Restart Claude session
2. Verify plugin is in settings.json
3. Check for typos in plugin path

### Plugin Conflicts

**Symptom:** Unexpected behavior or command conflicts

**Solutions:**
1. Check for duplicate plugins in settings
2. Ensure compatible plugin versions
3. Disable conflicting plugins temporarily

## Next Steps

- **[Quick Start](/docs/quick-start/)** - Build your first feature with H·AI·K·U
- **[Core Concepts](/docs/concepts/)** - Understand intents, units, and stages
- **[Studios & Stages](/docs/studios/)** - Learn about studios and their stage pipelines
- **[CLI Reference](/docs/cli-reference/)** - Full command reference
