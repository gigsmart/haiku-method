---
title: Skills to MCP Prompts — Discovery
---

# Discovery

## Current Architecture

Skills are markdown files (`plugin/skills/*/SKILL.md`) that Claude Code loads as text context. The agent interprets the prose and follows (or doesn't follow) the instructions. Skills have no enforcement mechanism.

The MCP server (`packages/haiku/src/server.ts`) already handles:
- 22 tools (state, orchestrator, review)
- HTTP server for visual review pages
- Session management for blocking tools

## Target Architecture

The MCP server adds `prompts/list` + `prompts/get` capabilities. Each skill becomes a prompt that returns `PromptMessage[]` — a multi-message conversation with context, state, and instructions baked in.

### MCP Prompts Spec (2025-11-25)

- `prompts/list` returns available prompts with name, description, arguments
- `prompts/get { name, arguments }` returns `{ messages: PromptMessage[] }`
- Each `PromptMessage` has `role` (user/assistant) and `content` (text/image/resource)
- Clients surface prompts as slash commands (e.g., `/haiku:resume`)
- Arguments support auto-completion via the completion API

### Prompt Construction Strategy

Each prompt handler:
1. Reads current state (intent, stage, units, settings)
2. Reads stage metadata (STAGE.md, hats, review agents, elaboration mode)
3. Constructs a multi-message conversation:
   - User message: "Run intent X"
   - Assistant message: "I see the intent state. Let me proceed."
   - User message: Full context + instructions based on current action
4. Executes side effects (open_review, ask_user_visual_question) BEFORE returning
5. Returns the messages for the agent to follow

### Prompts to Implement (21)

**Core workflow:**
1. `haiku:start` — create intent (args: description, template, params)
2. `haiku:resume` — advance stages (args: intent-slug)
3. `haiku:refine` — upstream side-trip (args: stage)
4. `haiku:review` — pre-delivery review (args: intent-slug)
5. `haiku:reflect` — post-completion analysis (args: intent-slug)

**Supporting:**
6. `haiku:composite` — multi-studio intent (args: description)
7. `haiku:autopilot` — fully autonomous (args: description)
8. `haiku:setup` — configure providers
9. `haiku:migrate` — .ai-dlc → .haiku
10. `haiku:scaffold` — generate studio structure (args: name)
11. `haiku:operate` — post-delivery ops (args: operation)
12. `haiku:triggers` — poll external events

**Reporting:**
13. `haiku:dashboard` — intent status overview
14. `haiku:backlog` — list all intents
15. `haiku:capacity` — workload analysis
16. `haiku:release-notes` — generate changelog

**Niche:**
17. `haiku:adopt` — adopt external work
18. `haiku:quick` — fast single-stage
19. `haiku:seed` — seed project
20. `haiku:ideate` — brainstorm
21. `haiku:pressure-testing` — stress test

### Deprecated (DELETE)
- elaborate, execute, construct, resume, cleanup, compound

### Internal (server-side logic, not prompts)
- fundamentals (embed in prompts), completion-criteria (orchestrator), backpressure (hooks), blockers (orchestrator), followup (in new prompt), reset (MCP tool)

## Key Decisions

1. **Multi-message prompts** — server constructs full conversation context, not just instruction text
2. **Side effects before return** — server calls open_review before returning the prompt for visual reviews
3. **Elicitation for structured questions** — server uses `elicitation/create` (form mode) for non-visual structured questions (studio selection, mode choice, gate approvals, confirmations). This bypasses the agent entirely — the MCP server asks the user directly via the client's native UI
4. **Visual review stays as open_review** — for rich content that needs annotation, inline comments, and design review. Uses the website-hosted review pages (local HTTPS server pattern)
5. **Hat definitions inlined** — server reads hat/stage files and includes them in the prompt, no file reading by the agent
6. **Elaboration mode drives prompt** — collaborative stages get multi-turn conversation instructions, autonomous stages get concise directives
7. **Completions for argument auto-complete** — intent slugs, stage names, studio names, template names
8. **Big bang migration** — all skills converted at once, deprecated stubs deleted
9. **Plugin skill files removed** — the MCP server IS the source of truth for prompt behavior

## MCP Capabilities Used

| Capability | Purpose | Status |
|-----------|---------|--------|
| `prompts` | Slash commands — /haiku:start, /haiku:resume, etc. | Implement now |
| `completions` | Auto-complete for intent slugs, studios, stages | Implement now |
| `elicitation.form` | Structured questions to user (studio picker, mode, gate approval) | Implement now |
| `tools` | State management, orchestration, visual review | Already done |
| `sampling` | Server-driven LLM calls for review agents, wireframe generation, auto-elaboration | **Future** — Claude Code doesn't support sampling yet. When it does, review agents and design generation can run server-side via sampling instead of agent-spawned subagents. |
