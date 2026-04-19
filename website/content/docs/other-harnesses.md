---
title: Other Harnesses
description: Use H·AI·K·U with Cursor, Windsurf, Gemini CLI, OpenCode, and Kiro
order: 3
---

H·AI·K·U works with any MCP-compatible AI coding tool. The MCP server detects the harness at startup and adapts its behavior accordingly -- adjusting subagent spawning, skill invocation, quality gate enforcement, and instruction language to match each harness's capabilities.

## Prerequisites

- **Node.js 22+** (required to run the MCP server)
- **git** (H·AI·K·U uses git for persistence and branching)
- Clone the repository or download a release:

```bash
git clone https://github.com/gigsmart/haiku-method.git
```

## Per-Harness Setup

Each harness has its own configuration location and format. In all cases, update `/path/to/haiku-method` to the actual path where you cloned or extracted the repository.

### Cursor

**Config file:** `.cursor/mcp.json` (in your project root)

```json
{
  "mcpServers": {
    "haiku": {
      "command": "/path/to/haiku-method/plugin/bin/haiku",
      "args": ["mcp", "--harness", "cursor"]
    }
  }
}
```

**Notes:**
- Cursor has a ~40 tool limit. H·AI·K·U automatically removes browser UI tools to stay within this budget.
- Subagents are supported with parallel spawning.
- MCP prompts are available but do not surface as native slash commands -- invoke them through the prompt picker.

### Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "haiku": {
      "command": "/path/to/haiku-method/plugin/bin/haiku",
      "args": ["mcp", "--harness", "windsurf"]
    }
  }
}
```

**Notes:**
- No subagent support. Units execute sequentially rather than in parallel.
- ~100 tool limit.
- No MCP elicitation support. Review gates are FSM-enforced rather than interactive.

### Gemini CLI

**Config file:** `~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "haiku": {
      "command": "/path/to/haiku-method/plugin/bin/haiku",
      "args": ["mcp", "--harness", "gemini-cli"]
    }
  }
}
```

**Notes:**
- MCP prompts surface as slash commands (`/haiku:start`, `/haiku:pickup`).
- Experimental subagent support via `@subagent` with parallel spawning, but no isolation.
- Model tiers map differently: H·AI·K·U's `haiku` tier maps to `flash`, and both `sonnet` and `opus` map to `pro`.

### OpenCode

**Config file:** Global config (YAML format)

```yaml
mcpServers:
  haiku:
    command: /path/to/haiku-method/plugin/bin/haiku
    args:
      - mcp
      - --harness
      - opencode
```

**Notes:**
- MCP prompts support is still maturing. Prompts are not yet exposed as slash commands.
- Subagents execute sequentially (no parallel spawning).
- No elicitation support. Review gates are FSM-enforced.

### Kiro

**Config file:** `.kiro/agents/*.yaml` or the Settings UI

```yaml
mcpServers:
  haiku:
    command: /path/to/haiku-method/plugin/bin/haiku
    args:
      - mcp
      - --harness
      - kiro
```

**Notes:**
- Hook system supported (like Claude Code). Quality gates can be hook-enforced.
- MCP prompts surface as slash commands.
- Subagents supported with parallel spawning and isolation.
- MCP elicitation supported for interactive review gates.

## Environment Variable Alternative

Instead of passing `--harness` as a CLI argument, you can set the `HAIKU_HARNESS` environment variable in your MCP server configuration's `env` block:

```json
{
  "mcpServers": {
    "haiku": {
      "command": "/path/to/haiku-method/plugin/bin/haiku",
      "args": ["mcp"],
      "env": {
        "HAIKU_HARNESS": "cursor"
      }
    }
  }
}
```

Valid values: `claude-code`, `cursor`, `windsurf`, `gemini-cli`, `opencode`, `kiro`.

## Feature Comparison

| Feature | Claude Code | Cursor | Windsurf | Gemini CLI | OpenCode | Kiro |
|---|---|---|---|---|---|---|
| Skills as slash commands | Native | Via prompts | Via prompts | Slash commands | Limited | Slash commands |
| Parallel subagents | Yes | Yes | No | Experimental | No | Yes |
| Hook system | Yes | No | No | No | No | Yes |
| Quality gates | Hook-based | FSM-enforced | FSM-enforced | FSM-enforced | FSM-enforced | Hook-based |
| FSM tamper detection | Hook-based | Checksum | Checksum | Checksum | Checksum | Hook-based |
| Browser review UI | Yes | No | No | No | No | No |
| MCP elicitation | Yes | Yes | No | No | No | Yes |

## Getting Started

After configuring your harness:

1. Open your project in the harness.
2. Use the `haiku:status` prompt to check for any active work in the project.
3. Use `haiku:start` to begin a new intent -- the elaboration flow will guide you through defining what you want to build.

## Known Limitations

When running H·AI·K·U outside Claude Code, the following limitations apply:

- **No auto-context injection on session start.** Claude Code injects H·AI·K·U context automatically via hooks. Other harnesses must use the `haiku:status` prompt at the start of each session to load active intent state.
- **No automatic output tracking.** The agent must explicitly register outputs via `haiku_unit_set`. Claude Code's hook system handles this transparently.
- **No context exhaustion warnings.** Claude Code detects when the context window is running low and triggers a graceful checkpoint. Other harnesses do not provide this signal.
- **Browser-based review UI unavailable.** The `haiku-review-server` serves a local web UI for reviewing stage gates. In other harnesses, review gates use MCP elicitation where available, or fall back to FSM-enforced advancement.
