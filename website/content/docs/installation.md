---
title: Installation
description: Install AI-DLC in your Claude Code project
order: 2
---

AI-DLC is distributed as a Claude Code plugin. This guide covers installation methods and prerequisites.

## Prerequisites

### Claude Code

AI-DLC requires [Claude Code](https://claude.ai/code), Anthropic's AI-powered development environment. Ensure you have Claude Code installed and configured.

### Han CLI (Recommended)

AI-DLC uses [Han CLI](https://han.guru) for state management (`han keep` commands). While the plugin works without it, you'll get the best experience with Han installed.

**Install Han via curl (recommended):**

```bash
curl -fsSL https://han.guru/install.sh | bash
```

**Or via Homebrew:**

```bash
brew install thebushidocollective/tap/han
```

**Verify installation:**

```bash
han --version
```

## Installation Methods

### Method 1: Via Claude Code (Recommended)

Install directly from within a Claude Code session:

```
/plugin marketplace add thebushidocollective/ai-dlc
/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project
```

### Method 2: Via Han

If you have Han installed, use the plugin manager (must be npx, project-scoped):

```bash
npx han plugin install thebushidocollective/ai-dlc --scope project
```

### Method 3: Manual Configuration

Add the plugin to your Claude Code settings file manually.

**User-level installation** (`~/.claude/settings.json`):

```json
{
  "plugins": [
    "github:thebushidocollective/ai-dlc"
  ]
}
```

**Project-level installation** (`.claude/settings.json` in your project):

```json
{
  "plugins": [
    "github:thebushidocollective/ai-dlc"
  ]
}
```

## Verification

After installation, verify the plugin is working:

1. Start a new Claude Code session in your project
2. Type `/elaborate` - you should see the elaboration flow start
3. If `/elaborate` works, your installation is successful

If commands aren't recognized, restart your Claude Code session.

## Recommended Companion Plugins

AI-DLC works best with backpressure plugins that provide quality gates:

### TypeScript Projects

```bash
npx han plugin install jutsu-typescript --scope project
npx han plugin install jutsu-biome --scope project
```

### Python Projects

```bash
npx han plugin install jutsu-python --scope project
npx han plugin install jutsu-ruff --scope project
```

### Go Projects

```bash
npx han plugin install jutsu-go --scope project
```

> **Note:** Han plugins follow the same installation pattern. To install via Claude Code directly, use `/plugin marketplace add` and `/plugin install` with the appropriate marketplace identifier for each plugin.

These plugins provide:
- **Type checking** that blocks on errors
- **Linting** that maintains code quality
- **Formatting** that keeps code consistent

## Project Setup

### Create the AI-DLC Directory

AI-DLC stores its artifacts in `.ai-dlc/` at your project root:

```
your-project/
  .ai-dlc/
    add-oauth-login/         # Intent directory
      intent.md              # Intent definition
      unit-01-setup.md       # Unit files
      unit-02-callback.md
  src/
  tests/
  ...
```

The directory is created automatically when you run `/elaborate` for the first time.

### Git Configuration

Add AI-DLC artifacts to version control:

```bash
# AI-DLC artifacts should be committed
git add .ai-dlc/
```

The `.ai-dlc/` directory contains:
- Intent definitions
- Unit specifications
- Progress tracking

These are valuable documentation that should be preserved.

### Gitignore (Optional)

If you prefer not to commit AI-DLC artifacts:

```gitignore
# .gitignore
.ai-dlc/
```

However, committing is recommended - it provides:
- Work history and context
- Team collaboration
- Recovery from context resets

## Troubleshooting

### Commands Not Recognized

**Symptom:** `/elaborate` or `/execute` don't activate

**Solutions:**
1. Restart Claude Code session
2. Verify plugin is in settings.json
3. Check for typos in plugin path

### Han Commands Fail

**Symptom:** `han keep` commands return errors

**Solutions:**
1. Verify Han is installed: `han --version`
2. Ensure Han is in PATH
3. Reinstall: `curl -fsSL https://han.guru/install.sh | bash`

### Plugin Conflicts

**Symptom:** Unexpected behavior or command conflicts

**Solutions:**
1. Check for duplicate plugins in settings
2. Ensure compatible plugin versions
3. Disable conflicting plugins temporarily

## Next Steps

- **[Quick Start](/docs/quick-start/)** - Build your first feature with AI-DLC
- **[Core Concepts](/docs/concepts/)** - Understand intents, units, and hats
- **[Workflows](/docs/workflows/)** - Learn about different development patterns
