---
intent: first-class-passes
created: 2026-03-31
status: active
---

# Discovery Log: First-Class Passes

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** Shell (hooks/lib), TypeScript (shared parser, CLI dashboard, MCP server), Next.js 15 (website)
**Architecture:** Monorepo with three components — plugin (Claude Code plugin), website (Next.js static site), paper (methodology spec). Plugin uses bash hooks and SKILL.md-based agent orchestration.
**Build tools:** Bun (lockfile present: `bun.lock`), Biome (linting/formatting), npm workspaces (`website`, `plugin/shared`, `plugin/mcp-server`, `plugin/cli`)
**Conventions:** YAML frontmatter in markdown files for metadata, bash hooks for lifecycle events, shell libraries in `plugin/lib/`, hat definitions as markdown in `plugin/hats/`, skills as `SKILL.md` files in `plugin/skills/{name}/`
**Concerns:** Hat resolution currently uses override semantics (project `.ai-dlc/hats/` replaces plugin `hats/`), needs to change to augmentation. No pass definition files exist yet (`plugin/passes/` directory missing). Pass types are hardcoded as an enum in settings schema.

