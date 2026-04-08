---
title: "Skills to MCP Prompts — Design Brief"
---

## Design Brief

### User-Facing Surfaces

This intent has **no new visual surfaces**. All interaction happens through:

1. **MCP prompt slash commands** — text-based, rendered by the MCP client (Claude Code, Cursor, etc.)
2. **Existing visual review pages** — unchanged, already built
3. **Elicitation forms** — rendered by the MCP client's native UI, not designed by us

### Interface Design: Prompt Naming & Arguments

#### Naming Convention

All prompts use the `haiku:` namespace prefix. Names are lowercase, hyphen-separated:

| Prompt | Title | Description Pattern |
| --- | --- | --- |
| `haiku:start` | Start Intent | Create a new H·AI·K·U intent |
| `haiku:resume` | Run Intent | Advance an intent through its stages |
| `haiku:refine` | Refine | Amend specs mid-execution |
| `haiku:review` | Review | Pre-delivery code review |
| `haiku:reflect` | Reflect | Post-completion analysis |

Supporting/reporting/niche prompts follow the same pattern.

#### Argument Naming

Arguments use lowercase, hyphen-separated names matching the domain model:

- `intent` — intent slug (completable)
- `stage` — stage name (completable, context-aware via intent's studio)
- `studio` — studio name (completable)
- `template` — template name (completable, context-aware via studio)
- `description` — free-text description (no completion)

#### Message Format

All prompts return `PromptMessage[]` following a consistent structure:

```
User:    "[Context] The user wants to {action}. Here is the current state: {state}"
Assistant: "I'll proceed with {action}. Let me {first step}."
User:    "[Instructions] {detailed instructions with stage metadata, hat definitions, etc.}"
```

The first user message provides context. The assistant message primes the model's intent. The final user message contains the actionable instructions.

### Design Tokens

Not applicable — no visual surfaces to style. Existing review pages retain their current design tokens.

### Responsive/Accessibility

Not applicable — prompts are text-based, rendered by the MCP client which handles its own accessibility.

### Design Gaps

None — this is a backend-only change with text-based interfaces.
