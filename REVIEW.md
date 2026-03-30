# Code Review Guidelines

## Cross-Component Sync

This is a three-component project (plugin, paper, website). The most critical review check is **sync drift**:

- If a PR adds a new skill (`plugin/skills/`), verify the concept is documented in the paper (`website/content/papers/ai-dlc-2026.md`)
- If a PR adds a new hat or workflow (`plugin/hats/`, `plugin/workflows.yml`), verify the paper's Named Workflows or Construction section covers it
- If a PR modifies the paper's terminology or definitions, verify the plugin's fundamentals skill (`plugin/skills/fundamentals/SKILL.md`) and affected hats/skills are updated
- If a PR adds or changes user-facing features, verify `website/content/docs/` has corresponding documentation

## Terminology Consistency

Flag any usage that confuses these distinct concepts:

- **Intent** = the overall thing being built (like an Epic)
- **Unit** = a discrete piece of work within an intent (like a Story)
- **Bolt** = the iteration cycle an agent runs within a unit (like a Sprint). Tracked as `iteration` in state files, NOT the same as Unit
- **Pass** = a typed disciplinary iteration (design/product/dev), optional

## Plugin-Specific

### Skills and Hats
- Skills must have a `SKILL.md` in their directory
- Hat instructions must include graceful degradation for provider/MCP calls (never block on provider failures)
- Hard gates (`PLAN_APPROVED`, `TESTS_PASS`, `CRITERIA_MET`) must use `exit 1` enforcement, not advisory language

### Shell Scripts (hooks, lib)
- Must handle missing files/state gracefully (check existence before reading)
- Must suppress errors appropriately (`2>/dev/null`, `|| true`) for non-critical operations
- Must not block core workflow on optional features (providers, visual comparison, telemetry)

### State Files
- Changes to `iteration.json` structure must be backward-compatible
- New frontmatter fields in intent/unit specs must have sensible defaults

## Paper-Specific

- No time estimates (hours, days, weeks, "Week 1-2" patterns) anywhere in the paper
- New concepts must include: definition, Agile equivalent (if applicable), and relationship to existing concepts
- Principles must follow the existing pattern: statement, rationale, concrete example

## Website-Specific

- Next.js 15 App Router with static export — no server-side features
- Content in `website/content/` uses MDX

## Skip

- Version bump commits (`[skip ci]` in message)
- Auto-generated changelog entries
- `plugin/.claude-plugin/marketplace.json` version field (auto-synced)
