---
status: pending
last_updated: ""
depends_on:
  - unit-02-mcp-channel-server
  - unit-04-static-dashboard
branch: ai-dlc/visual-review/05-plugin-packaging
discipline: devops
pass: ""
workflow: ""
ticket: ""
---

# unit-05-plugin-packaging

## Description

Package the MCP channel server and static dashboard CLI as distributable components within the AI-DLC plugin. Wire up the MCP server configuration so Claude Code discovers it, create a skill for invoking the dashboard generator, and add documentation for installation and usage.

## Discipline

devops - Plugin configuration, packaging, integration wiring.

## Domain Entities

- **Plugin MCP Config** — `.mcp.json` entry that tells Claude Code how to spawn the review server
- **Dashboard Skill** — A Claude Code skill (`/dashboard`) for generating the static site
- **Channel Config** — The `--channels` flag configuration for enabling the review channel

## Data Sources

- **MCP server** (unit-02): The server entry point at `plugin/mcp-server/src/server.ts`
- **CLI tool** (unit-04): The dashboard entry point at `plugin/cli/src/dashboard.ts`
- **Plugin manifest**: Existing `plugin/.claude-plugin/plugin.json`

## Technical Specification

### 1. MCP Server Registration (`plugin/.mcp.json`)

Add the review server to the plugin's MCP configuration so Claude Code discovers it:

```json
{
  "mcpServers": {
    "ai-dlc-review": {
      "command": "bun",
      "args": ["run", "${CLAUDE_PLUGIN_ROOT}/mcp-server/src/server.ts"]
    }
  }
}
```

This makes the server available as `server:ai-dlc-review` for the `--channels` flag.

### 2. Dashboard Skill (`plugin/skills/dashboard/SKILL.md`)

A user-invocable skill that runs the static dashboard generator:

```markdown
---
name: dashboard
description: Generate a static HTML dashboard of all AI-DLC intents
user_invocable: true
---

# Dashboard

Generate a browseable static HTML site from the project's `.ai-dlc/` directory.

## Usage

`/dashboard` — Generate dashboard with defaults
`/dashboard --output ./docs/ai-dlc` — Custom output directory

## Behavior

1. Run the dashboard CLI: `bun run ${CLAUDE_PLUGIN_ROOT}/cli/src/dashboard.ts --input .ai-dlc/ --output .ai-dlc/dashboard/`
2. Report the output path and suggest opening in browser
3. If `--output` argument provided, use that path instead

## Output

Static HTML site at the output directory. Open `index.html` in a browser to browse.
```

### 3. Channel Plugin Registration

For the review channel to work with `--channels`, it needs to be discoverable. Two approaches depending on the plugin packaging system:

**Approach A (during development):**
```bash
claude --dangerously-load-development-channels server:ai-dlc-review
```

**Approach B (for distribution):**
The `.mcp.json` entry above makes it available as a server. Users start Claude Code with:
```bash
claude --channels server:ai-dlc-review
```

Or if packaged as a plugin channel:
```bash
claude --channels plugin:ai-dlc@ai-dlc
```

### 4. Workspace Configuration

Update the root `package.json` to include the new packages as workspace members:

```json
{
  "workspaces": ["website", "plugin/shared", "plugin/mcp-server", "plugin/cli"]
}
```

Ensure `bun install` at the root resolves workspace dependencies (`@ai-dlc/shared` referenced by mcp-server and cli).

### 5. Dependencies Installation

Add a setup step or document that Bun must be installed and dependencies resolved:

```bash
cd plugin/shared && bun install
cd plugin/mcp-server && bun install
cd plugin/cli && bun install
```

Or from root with workspaces: `bun install`.

### 6. Documentation Updates

Add usage documentation to the plugin:

**plugin/skills/dashboard/SKILL.md** — Skill documentation (above)

**Brief usage notes in plugin README or SKILL.md:**
- How to enable the review channel (`--channels` or `--dangerously-load-development-channels`)
- How to generate the static dashboard (`/dashboard`)
- How the review flow works (agent opens browser → user decides → agent continues)

## Success Criteria

- [ ] `.mcp.json` entry correctly references the MCP server entry point
- [ ] Claude Code discovers and spawns the `ai-dlc-review` MCP server on session start
- [ ] `/dashboard` skill generates the static site when invoked
- [ ] Workspace dependencies resolve correctly (`bun install` from root)
- [ ] Review channel works with `--dangerously-load-development-channels server:ai-dlc-review`
- [ ] Documentation covers installation, channel setup, and dashboard generation

## Risks

- **Bun requirement**: Users must have Bun installed. Mitigation: add Bun detection and installation guidance (similar to existing `plugin/lib/deps.sh` pattern).
- **MCP server startup cost**: Server spawns on Claude Code start even when review isn't needed. Mitigation: the server is lightweight (no HTTP server until `open_review` is called — lazy init per unit-02 spec).

## Boundaries

This unit does NOT handle:
- MCP server implementation (unit-02)
- Review UI templates (unit-03)
- Static site generation logic (unit-04)
- Shared parser library (unit-01)
- Submission to the official Claude Code plugin allowlist (future work)

## Notes

- The MCP server auto-starts when Claude Code launches (standard MCP behavior). The HTTP server inside it only starts on first `open_review` call (lazy init specified in unit-02).
- During the research preview, the `--dangerously-load-development-channels` flag is required. Once the plugin is added to an approved allowlist, `--channels plugin:ai-dlc@ai-dlc` will work without the flag.
- The `/dashboard` skill is simple — it just runs a shell command. The complexity lives in unit-04's CLI tool.
