---
title: Origin classification — user / agent / engine
model: sonnet
depends_on:
  - unit-01-burn-skill-and-spa
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: pending
---
# Origin classification — user / agent / engine

Adds origin attribution to the spend report. Every token consumed in an intent originates from one of three sources, and the engine-vs-agent-vs-user split is the single most actionable signal for engine-side optimization (it tells you how much of your spend is framework overhead vs real work vs user typing).

## Definition of the three origins

- **`user`** — tokens billed to user-authored content. The user's prompts (typed in the chat), files the user pastes, slash-command arguments the user supplies. Identified in the parent jsonl by `role: "user"` messages whose content has no `is_meta: true` marker AND no `tool_result` block AND no `<system-reminder>...</system-reminder>` wrapping (Claude Code injects system reminders inside `role: "user"` envelopes; those are engine-origin, not user-origin).
- **`agent`** — tokens billed to assistant reasoning + tool-use generation. The model's output: thinking blocks, text replies, tool_use requests. Identified by `role: "assistant"` messages.
- **`engine`** — tokens billed to H·AI·K·U-injected content. Workflow contract blocks, prompt files the engine writes to `$TMPDIR/haiku-prompts/`, MCP tool results returned by `haiku_*` calls, hook outputs, system-reminder injections, and anything carried by `_session_context`.

The classifier is a per-content-block decision, not a per-message decision. A single message may carry both user-origin and engine-origin content (e.g. a user prompt followed by a system-reminder hook injection); the analyzer attributes the relevant token slice to each via byte-length apportionment (see §Attribution rule).

## Output schema additions

Two additions, both reflected in `knowledge/API-SURFACE.md`:

1. New top-level required field `by_origin: [{origin, spend: SpendBucketCore}]` — peer to `by_tick` / `by_stage` / etc. The three rows (one per origin enum value) are always present even when their spend is zero; consumers MUST NOT assume row count > 0 for any specific origin.
2. New optional sub-field `SpendBucket.by_origin?: {user?, agent?, engine?}` (each value is a `SpendBucketCore`, defined in api-surface `definitions`). Inline split lets the SPA show "of this hat's 50k tokens, 30k was engine-injected" without re-keying every renderer. Origins with zero spend are omitted from the inline object — never present-but-zero.

`SpendBucketCore` is the base spend shape (six counters + `message_count`) without the recursive `by_origin` sub-field. It exists in api-surface `definitions` to break the recursion.

## Attribution rule

Per parent-session message:
1. Walk each `content[]` block.
2. For `text` and `thinking` blocks on `role: "assistant"` → **agent**.
3. For `tool_use` blocks on `role: "assistant"` → **agent** (the model's request).
4. For `tool_result` blocks on `role: "user"` → look up the corresponding `tool_use_id` in the same session log. Look at the matching `tool_use.name`:
   - Name starts with `mcp__plugin_haiku_haiku__` (any `haiku_*` MCP tool) → **engine**.
   - Otherwise → **agent** (it's a tool result for an SDK-level tool the agent invoked, e.g. `Read`, `Bash`, or a non-haiku MCP tool).
5. For `text` blocks on `role: "user"` → check for system-reminder wrapping. The marker is the literal substring `<system-reminder>` appearing in the block's text content (Claude Code wraps engine-injected reminders in this tag). If present → **engine**. Otherwise → **user**.
6. For any block with `is_meta: true` (top-level message metadata flag set by Claude Code for engine-injected content) → **engine** regardless of role.

Hook outputs always arrive via either path (4) (when the hook executes a `haiku_*` MCP tool) or path (5) (when the hook injects content via system-reminder). There is no separate "hook output marker" — hook origin is detected through one of those two channels.

Per subagent jsonl message: subagent prompts are written by the engine (the prompt file at `$TMPDIR/haiku-prompts/...`), so the subagent's first user-role message — the `Read <prompt_file> and execute its instructions exactly.` envelope plus the prompt body — is **engine**. All subsequent assistant-role output is **agent**. Tool results inside the subagent follow the same per-block rule as the parent.

Token counters in the jsonl are per-message, not per-block. When a single message mixes origin classes, the analyzer apportions the message's input/output token counts proportionally to the byte-length of each origin's content blocks. This is approximate but reproducible, and the alternative (treating mixed messages as wholly engine-origin) over-attributes user-origin token spend to the engine bucket. The ±1% tolerance for heuristic refinements is captured in api-surface §Semver Policy.

## Stability tier

- `by_origin[]` as a top-level required field: **Stable** per api-surface §Semver Policy.
- The three origin enum values (`user`, `agent`, `engine`): **Stable**. Adding a fourth value at the end of the enum (e.g. `mcp_external` for non-haiku MCP servers) is non-breaking; renaming or removing one is breaking.
- `SpendBucket.by_origin` optional sub-field: **Stable as optional**. Promoting it to required is breaking.
- The classification rule (§"Attribution rule" above) is **Internal** — it's a derivation, not a contract. We may refine the heuristic (e.g. tighten `<system-reminder>` detection or add a new haiku_* tool prefix) without bumping major, provided `by_origin` bucket totals stay within ±1% on the same input. The ±1% tolerance and its rationale appear in api-surface §Semver Policy.

## Open questions

- Should hook stderr / log lines be classified as `engine` even when the hook isn't a `haiku_*` hook? **Proposed default:** yes — any hook output is framework overhead, not agent thinking. Hook outputs always arrive via the system-reminder channel or via a tool_result whose name starts with `mcp__plugin_haiku_haiku__`, so the existing rule already captures them; this open question is a no-op confirmation. Veto-able.
- Should we add a fourth origin value `mcp_external` for non-haiku MCP tool results (Atlassian, Notion, Slack, etc.)? **Proposed default:** no — they're caller-driven, not engine-injected; classify them as `agent` (the agent chose to call them). Veto-able.
- Should the apportionment for mixed-origin messages use byte length, character count, or token count via a tokenizer? **Proposed default:** byte length (cheap, deterministic, no tokenizer dependency). Veto-able.

## Completion criteria

- §"Definition of the three origins" gives a concrete identification rule per origin, naming the jsonl shape it inspects (including the literal `<system-reminder>` marker substring).
- §"Output schema additions" specifies both the new top-level `by_origin[]` field and the optional inline `SpendBucket.by_origin` sub-field; references `SpendBucketCore` as defined in api-surface.
- §"Attribution rule" enumerates the per-block classification for parent and subagent messages, and pins the byte-length apportionment rule for mixed-origin messages. Hook outputs explicitly route through the existing `<system-reminder>` and `mcp__plugin_haiku_haiku__` channels — no separate "hook marker".
- §"Stability tier" classifies every new field as Stable or Internal with rationale; calls out which changes are breaking. The ±1% heuristic-refinement tolerance is captured in api-surface §Semver Policy.
- §"Open questions" lists every deferred decision with proposed default or `(needs human escalation)`.
