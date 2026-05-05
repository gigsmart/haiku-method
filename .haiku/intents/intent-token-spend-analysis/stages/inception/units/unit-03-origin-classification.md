---
title: Origin classification — user / agent / engine
model: sonnet
depends_on:
  - unit-01-burn-skill-and-spa
status: pending
---
# Origin classification — user / agent / engine

Adds origin attribution to the spend report. Every token consumed in an intent originates from one of three sources, and the engine-vs-agent-vs-user split is the single most actionable signal for engine-side optimization (it tells you how much of your spend is framework overhead vs real work vs user typing).

## Definition of the three origins

- **`user`** — tokens billed to user-authored content. The user's prompts (typed in the chat), files the user pastes, slash-command arguments the user supplies. Identified in the parent jsonl by `role: "user"` messages whose content has no `is_meta: true` marker AND no `tool_result` block AND no system-reminder wrapping (Claude Code injects system reminders inside `role: "user"` envelopes; those are engine-origin, not user-origin).
- **`agent`** — tokens billed to assistant reasoning + tool-use generation. The model's output: thinking blocks, text replies, tool_use requests. Identified by `role: "assistant"` messages.
- **`engine`** — tokens billed to H·AI·K·U-injected content. Workflow contract blocks, prompt files the engine writes to `$TMPDIR/haiku-prompts/`, MCP tool results returned by `haiku_*` calls, hook outputs (`PreToolUse`, `UserPromptSubmit`, etc.), system-reminder injections (the `<system-reminder>` wrapped messages), and anything carried by `_session_context`. Identified by: (a) `tool_result` content blocks whose `tool_use_id` resolved to a `haiku_*` MCP call OR a hook output, (b) system-reminder content blocks inside `role: "user"` envelopes, (c) `is_meta: true` content blocks.

The classifier is a per-content-block decision, not a per-message decision. A single message may carry both user-origin and engine-origin content (e.g. a user prompt followed by a system-reminder hook injection); the analyzer attributes the relevant token slice to each.

## Output schema additions

Two additions to the api-surface output:

```ts
by_origin: [{
  origin: "user" | "agent" | "engine",
  spend: SpendBucket,
}]
```

`by_origin` is a required top-level field, peer to `by_tick` / `by_stage` / etc.

Plus an additive optional sub-field on every existing `SpendBucket` for callers who want the origin breakdown inline:

```ts
SpendBucket {
  // existing required fields unchanged: input_tokens, output_tokens,
  // cache_creation_input_tokens, cache_read_input_tokens, total_tokens,
  // message_count
  by_origin?: {
    user?: SpendBucketCore,    // omitted when zero
    agent?: SpendBucketCore,
    engine?: SpendBucketCore,
  }
}
```

`SpendBucketCore` is `SpendBucket` minus the `by_origin` recursion (just the six counters + message_count). The optional inline split lets the SPA show "of this hat's 50k tokens, 30k was engine-injected" without re-keying every renderer.

## Attribution rule

Per parent-session message:
1. Walk each `content[]` block.
2. For `text` and `thinking` blocks on `role: "assistant"` → **agent**.
3. For `tool_use` blocks on `role: "assistant"` → **agent** (the model's request).
4. For `tool_result` blocks on `role: "user"` → look up the `tool_use_id`. If the matching `tool_use.name` starts with `mcp__plugin_haiku_haiku__` (any `haiku_*` MCP tool) OR matches a hook output marker → **engine**. Otherwise → **agent** (it's a tool result for an SDK-level tool the agent invoked).
5. For `text` blocks on `role: "user"` → check for system-reminder wrapping (`<system-reminder>...</system-reminder>` pattern that Claude Code uses) → **engine** if wrapped, **user** otherwise.
6. For any block with `is_meta: true` → **engine** regardless of role.

Per subagent jsonl message: subagent prompts are written by the engine (the prompt file at `$TMPDIR/haiku-prompts/...`), so the subagent's first user-role message (the `Read <prompt_file> and execute its instructions exactly.` envelope plus the prompt body) is **engine**. All subsequent assistant-role output is **agent**. Tool results inside the subagent follow the same per-block rule as the parent.

Token counters in the jsonl are per-message, not per-block. When a single message mixes origin classes, the analyzer apportions the message's input/output token counts proportionally to the byte-length of each origin's content blocks. This is approximate but reproducible — and the alternative (treating mixed messages as wholly engine-origin) over-attributes user-origin token spend to the engine bucket.

## Stability tier

- `by_origin[]` as a top-level required field: **Stable** per api-surface §Semver Policy.
- The three origin enum values (`user`, `agent`, `engine`): **Stable**. Adding a fourth value (e.g. `mcp_external` for non-haiku MCP servers) is non-breaking; renaming or removing one is breaking.
- `SpendBucket.by_origin` optional sub-field: **Stable** as optional. Promoting it to required is breaking.
- The classification rule (§"Attribution rule" above) is **Internal** — it's a derivation, not a contract. We may refine the heuristic (e.g. tighten engine detection of new hook output markers) without bumping major, provided the bucket totals stay within ±1% on the same input.

## Open questions

- Should hook stderr / log lines be classified as `engine` even when the hook isn't a `haiku_*` hook? **Proposed default:** yes — any hook output is framework overhead, not agent thinking. Veto-able.
- Should we add a fourth origin value `mcp_external` for non-haiku MCP tool results (Atlassian, Notion, Slack, etc.)? **Proposed default:** no — they're caller-driven, not engine-injected; classify them as `agent` (the agent chose to call them). Veto-able.
- Should the apportionment for mixed-origin messages use byte length, character count, or token count via a tokenizer? **Proposed default:** byte length (cheap, deterministic, no tokenizer dependency). Veto-able.

## Completion criteria

- §"Definition of the three origins" gives a concrete identification rule per origin, naming the jsonl shape it inspects.
- §"Output schema additions" specifies both the new top-level `by_origin[]` field and the optional inline `SpendBucket.by_origin` sub-field with type signatures.
- §"Attribution rule" enumerates the per-block classification for parent and subagent messages, and pins the apportionment rule for mixed-origin messages.
- §"Stability tier" classifies every new field as Stable or Internal with rationale; calls out which changes are breaking.
- §"Open questions" lists every deferred decision with proposed default or `(needs human escalation)`.
