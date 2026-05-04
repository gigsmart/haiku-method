---
artifact: discovery
stage: inception
intent: intent-token-spend-analysis
scope: intent
---

# Discovery — Intent Token Spend Analysis

## Problem & Consumers

### Problem statement

H·AI·K·U intents burn a lot of tokens. A single intent in continuous mode commonly walks through six stages, dispatches dozens of per-unit hat subagents, and runs multiple review-fix loops, with each subagent further fanning out into its own `Task` spawns. All of that spend lands in two places on disk — `~/.claude/projects/<project-slug>/*.jsonl` for the parent session and `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-*.jsonl` for each spawned subagent — but those files are not currently correlated against H·AI·K·U's own concepts of intent / stage / hat / unit. The agent driving an intent (and the human watching it) cannot answer simple, load-bearing questions:

- Which intent burned the most tokens last week?
- Which stage is the most expensive — design? execute? review-fix?
- Which hat in the execute phase costs the most, and is that the hat where Opus is actually warranted?
- For a single hat dispatch, how much was spent in the parent session vs. the subagents the hat spawned?
- What's the Opus / Sonnet / Haiku split, and where would routing one tier down save real money?

Without this, model-routing decisions (the existing `model-selection.ts` cascade) are flown blind. We can pick "haiku for this hat" but we cannot tell whether that decision actually saved tokens or just shifted them somewhere else.

### Target consumers

The consumer is the H·AI·K·U MCP server itself, surfaced through a new `haiku_*` tool. Two concrete user personas drive the tool:

1. **The agent during a run.** The orchestrator (or a hat-level subagent) calls the tool to get a structured breakdown so it can reason about routing — e.g., before dispatching the next bolt, ask "where did the last bolt's tokens go?" and adjust model selection accordingly. The agent does not want a CLI report; it wants structured JSON it can pivot on.
2. **The human running an intent.** Through `/haiku:capacity` or a similar surface, the human asks "what did this intent cost?" and gets the same structured data, presented by the agent as prose, a table, or whatever the harness affords. This is the same persona who reads `/haiku:dashboard` and `/haiku:capacity` today.

Both personas already live inside the H·AI·K·U MCP boundary. Neither is shopping a separate library off npm. The "library" framing in this discovery template is a stretch — what's really being added is a new MCP tool inside `packages/haiku`, consumed only by the H·AI·K·U plugin and its harness.

> **Context boundary:** The exact `haiku_*` name, input/output schema, and error model live in the sibling `api-surface` artifact. This artifact does not pre-empt those decisions — it only establishes that the surface is an MCP tool, not a CLI script or web report.

### Adoption path

Because the consumer is the H·AI·K·U plugin itself, "adoption" means: the tool ships in the next plugin release, the orchestrator gains a callsite (or skill — TBD by `api-surface`), and `/haiku:capacity` learns to call it. There is no discovery-evaluate-install funnel. There is no separate npm package. The first use happens the moment a developer with the plugin updated runs an intent and asks "where did my tokens go?".

The downstream consequence: documentation expectations are internal. Users learn the tool exists through the same surfaces they already learn about `/haiku:dashboard` and `/haiku:capacity` — the website docs, the changelog entry, and the tool's own description string surfaced by the MCP `tools/list` call.

## Ecosystem Landscape

### Existing libraries / tools

There is a small but active ecosystem of "where did my Claude Code tokens go" tools, all of which read the same `~/.claude/projects/*.jsonl` corpus this tool will read. None of them know about H·AI·K·U's stage / hat / intent structure.

- [ccusage](https://github.com/ryoppippi/ccusage) — the most popular community tool. Node.js CLI that parses `~/.claude/projects/*.jsonl`, deduplicates messages by `(session_id, message_id, request_id)`, and produces `daily`, `monthly`, `session`, `blocks`, `statusline`, and `mcp` subcommands. Multi-currency support, optional online pricing fetch from LiteLLM. The `mcp` subcommand exposes the same data via MCP, but only at the session/day grain — it has no concept of stage / hat / intent.
- [claude-code-usage](https://github.com/keithah/claude-code-usage) — Python CLI that reads the same jsonl, focuses on per-day / per-session totals plus a 5-hour rolling window matching Anthropic's rate-limit window. Does not handle subagent jsonls in any structured way.
- [Claude Code Costs](https://github.com/philipp-spiess/claude-code-cost) (`npx claude-code-costs`) — focuses on visualisations of cost over time, exports to png/svg.
- [claude-code-tokenizer](https://github.com/markmuskardin/claude-code-tokenizer) — slices the jsonl by directory, tracks tool-call frequency, surfaces a per-project view.
- [vibe-log-cli](https://github.com/vibe-log/vibe-log-cli) — privacy-preserving local analytics over the same logs, plus a hosted cloud option for cross-machine aggregation.
- Anthropic's Console "Spend" view (web only, account-wide) and the [Admin API usage report](https://docs.claude.com/en/api/admin-api/usage-cost/get-usage-report-messages) — the system-of-record for billed dollars, but only at the API-key / day / model grain. Ground truth for *what was billed*, useless for *which hat dispatched the call*.
- [`/cost`](https://docs.claude.com/en/docs/claude-code/costs) — Claude Code's built-in slash command. Per-session / per-day total only, no breakdown beyond "session vs all".

### What works in existing libraries

- **Reading from `~/.claude/projects/*.jsonl` directly is the right move.** Every credible tool in this space does the same thing. The jsonl is local, append-only, replayable, and survives session restarts. ccusage's choice to deduplicate on `(session_id, message_id, request_id)` is the right fingerprint — message replay (e.g., from a forked subagent) would otherwise double-count.
- **Cache-aware accounting.** ccusage and the LiteLLM pricing tables both treat `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`, and `output_tokens` as four separate buckets with separate prices. This tool must do the same — Anthropic's own [pricing page](https://www.anthropic.com/pricing) splits cache writes (1.25× input) and cache reads (0.1× input) explicitly. Reporting "input tokens" without splitting cache buckets misstates spend by 5–10× in cache-heavy workflows.
- **Surface as MCP, not just CLI.** ccusage shipped an MCP variant for the same reason this intent calls for a tool, not a script: an agent can call MCP, an agent cannot pipe a CLI through stdout.
- **Online pricing tables are external (LiteLLM).** ccusage fetches `model_prices_and_context_window.json` from the LiteLLM repo on demand. Pinning an offline copy is fine; building our own table is not.
- **Graceful degradation when files are missing.** Multiple tools handle "this session log is half-written" without crashing — they skip malformed lines and keep going. We need the same posture, especially since subagent jsonls are written live and may be partially flushed mid-run.

### Gaps in existing libraries

This is the gap that justifies the new tool:

- **No tool correlates the parent session jsonl with subagent jsonls under `<session-id>/subagents/`.** ccusage and friends report parent-session totals only, or list subagent files as separate sessions with no parent linkage. They can answer "session XYZ spent N tokens" but not "the `implementer` hat dispatch in unit `unit-03` for intent `foo` spent N tokens, of which K were spent in the subagent it spawned to grep the codebase."
- **No tool maps tokens onto H·AI·K·U concepts (intent / studio / stage / hat / unit / bolt).** The mapping exists implicitly in two artifacts: the prompt-file naming convention `$TMPDIR/haiku-prompts/{session_id}/{unit}-{hat}-{bolt}.prompt.md` (`packages/haiku/src/subagent-prompt-file.ts:10`) and the subagent `meta.json` `description` field, which carries the agent type and (for hat dispatches) the prompt path. No external tool walks that mapping; it requires plugin-internal knowledge.
- **No tool surfaces the per-bolt unit of work.** Bolts are H·AI·K·U's iteration cycle; spend per bolt across iterations is the signal that tells you "this hat's first bolt is cheap but bolt 3 always blows up because the context grows" — exactly the kind of insight a routing decision needs.
- **No tool answers "given Opus / Sonnet / Haiku tiers exist, which hats are the right candidates to drop a tier?"** The cascade lives in `model-selection.ts` (`MODEL_TIERS = ["haiku", "sonnet", "opus"]`) and decides escalation paths on hat failure. We currently can't tell whether the cascade is saving tokens or just shifting them. The new tool's per-model split, sliced by hat, is the missing input.

The new tool fills exactly these gaps and nothing else. Anything else (visualisations, multi-currency, cross-machine sync, billed-dollar reconciliation against the Anthropic Admin API) is sibling territory or out of scope.

> **Context boundary:** Routing *decisions* belong to `model-selection.ts` and the orchestrator, not to this tool. This tool reports; it does not change which model dispatches next. Routing-policy changes downstream of these reports are a separate intent.

## Scope

### Goals

- Produce a structured token-spend analysis for a named H·AI·K·U intent, on demand, from an MCP tool call.
- Read directly from `~/.claude/projects/<project-slug>/*.jsonl` for the parent session and `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-*.jsonl` for spawned subagents. Do not require modifying jsonl contents or adding side-files beyond what already exists.
- Correlate parent-session usage records with subagent-jsonl usage records so a single hat dispatch shows parent-side and subagent-side tokens together (one row per dispatch, broken into the two sources).
- Provide four breakdowns side by side, all derived from the same scan:
  1. Per-intent total spend.
  2. Per-stage and per-hat spend within that intent (using the stage/hat metadata already recorded at dispatch time via prompt-file paths and `meta.json` descriptions).
  3. Per-subagent spend with parent-session correlation, so one hat-dispatch row reports parent-session tokens + spawned-subagent tokens together.
  4. Per-model split (`opus` / `sonnet` / `haiku`, plus any specific model id encountered) for routing decisions.
- Split tokens into the four Anthropic buckets: `input`, `cache_creation`, `cache_read`, `output`. Apply (or expose hooks for) per-model pricing so dollar totals are computable without lying about cache.
- Work for both running and completed intents — no requirement that the intent has reached a terminal state.
- Degrade gracefully when subagent logs are absent, partial, or malformed — return what's available, mark gaps explicitly, never crash the MCP.

### Non-goals

- **Not a CLI.** No `haiku-tokens` binary, no shell pipeline. The surface is an MCP tool reachable through the existing `packages/haiku` server.
- **Not a web report.** The review web UI does not gain a token-spend tab in this intent. The agent presents the data; if we later want a UI surface, that is a separate intent that *consumes* this tool.
- **Not a routing engine.** This tool reports spend. It does not change which model is dispatched next. `model-selection.ts` is unchanged by this work.
- **Not a billing reconciler.** We do not call the Anthropic Admin API, do not reconcile against billed dollars, do not chase the discrepancy between local jsonl tokens and what Anthropic actually charged (which can differ for cached / batched / discounted tiers).
- **Not a historian.** We do not persist a copy of the jsonl, do not build an index, do not maintain a separate database. Every call re-reads the relevant jsonl. Cache aggressively in-process if needed for performance, but disk state belongs to Claude Code, not us.
- **Not multi-project.** The tool answers per-intent, scoped to the project the MCP server is running inside. Cross-project rollups (which `vibe-log-cli` and ccusage do) are a separate concern.
- **Not a JSONL mutator.** We never write to, rotate, or compact `~/.claude/projects/...`. Read-only.
- **Not a session-scope tool.** ccusage already does session-grain analysis well. The differentiator is intent / stage / hat correlation. If a user wants raw per-session totals, they should use ccusage.

### Out of scope for v1

- **Cross-intent rollups** ("which intent type costs the most across the last 30 days") — useful, but answering it well requires walking many intents and aggregating, which is a separate design problem. v1 answers "this intent" only.
- **Real-time streaming totals** during a live run (e.g., a "tokens spent so far" counter pushed to the agent every tick). v1 is request-response: agent calls the tool, gets a snapshot.
- **Cost projection / forecasting** ("at this rate this intent will cost $X by completion"). v1 reports actuals only.
- **Anomaly detection** ("hat `implementer` in unit-03 spent 4× the median bolt"). v1 ships the breakdown; whoever wants anomaly detection can layer it on top.
- **Reflection-stage integration.** It would be reasonable for `/haiku:reflect` to consume this tool's output and write a token-spend section into the reflection artifact. Useful, but a downstream intent — out of scope for v1.

## Non-functional Requirements

### Language / runtime

- **Language:** TypeScript, targeting the same toolchain as the rest of `packages/haiku`. Bun for build/test, ESM modules, Node.js runtime when invoked through the MCP server.
- **Minimum versions:** match the package's existing `engines` field — Node 20+. No new minimum.
- **Platforms:** macOS and Linux (matching Claude Code's supported platforms). Path resolution must use `os.homedir()` and `path.join` for `~/.claude/projects/...`; never assume forward slashes.

### Dependencies

- **Avoid new heavy deps.** The jsonl shape is well-known; line-by-line streaming with `node:readline` over `node:fs.createReadStream` is sufficient. No need to pull in `ndjson`, `JSONStream`, or similar.
- **Pricing table** ships as a local JSON checked into the repo, structured like LiteLLM's `model_prices_and_context_window.json` so we can resync from upstream cleanly. Refresh cadence is a build-time concern, not a runtime concern.
- **No network calls at runtime.** The tool must be answerable with files on disk only — both the jsonl corpus and the bundled pricing table. A network-fetched pricing override is a future enhancement, not a v1 requirement.
- **Reuse existing helpers.** `packages/haiku/src/sessions.ts` and `packages/haiku/src/session-metadata.ts` are referenced in the intent description; they expose session-id resolution and metadata patterns the new tool should align with rather than duplicate.

### Performance expectations

- **Parent session jsonl:** can reach hundreds of MB on long-running intents. The implementation must stream line-by-line, not load into memory. ccusage does the same.
- **Subagent jsonls:** smaller per file (tens of KB to a few MB), but a long intent can spawn 50+ subagents. Walking the `subagents/` directory and streaming each file in parallel is fine.
- **Target:** a typical intent (one session, ~30 subagents, 50–100 MB total) should complete the analysis in well under 5 seconds on a typical laptop. The tool is interactive — agents will call it mid-conversation and humans will run it through `/haiku:capacity` — so latency budget is conversational, not batch.
- **Memory:** O(unique-message-fingerprints) for dedupe, plus per-bucket counters. Should stay well under 100 MB for any realistic intent.

### Documentation expectations

- **Tool description string** in the MCP `tools/list` response must explain what's analyzed, what's returned, and the four breakdowns. This is the consumer's first contact with the tool.
- **Plugin-side docs** in `website/content/docs/` get an entry under the tools index, with an example call and an example response. Same standard as existing tools.
- **Changelog entry** under the next plugin release. Required by the existing `chore(plugin): bump version` workflow.
- **No standalone README.** This is not a separately distributed library.

## Cross-cutting boundaries

These are the constraints from this discovery axis that ripple into sibling artifacts and downstream stages:

- **The MCP-tool surface is fixed.** `api-surface` should design within the MCP-tool envelope (input schema, return shape, error model) — not propose a CLI or a separate package. Already covered above; flagged here so it's not lost in the merge.
- **Read-only file access to `~/.claude/projects/*.jsonl`.** Any sibling artifact that proposes mutating, rotating, or moving those files contradicts this discovery's non-goals. The Claude Code session log format is owned by Claude Code; we observe it, we do not own it.
- **Pricing table is data, not code.** `api-surface` should treat `model_prices_and_context_window.json` (or the bundled equivalent) as a swappable data source — not hardcode prices into the tool's logic. This keeps the tool resilient to Anthropic's pricing changes without a code release.
- **Stage/hat correlation depends on the existing prompt-file naming convention.** `packages/haiku/src/subagent-prompt-file.ts` writes prompts to `$TMPDIR/haiku-prompts/{session_id}/{unit}-{hat}-{bolt}.prompt.md`, and the subagent's `meta.json` `description` references that path. If a downstream intent changes that naming convention, this tool's correlation breaks. Either keep the convention stable, or have the orchestrator write a richer per-dispatch metadata sidecar that the tool can read instead. The choice (convention vs. sidecar) is `api-surface` and execute-stage territory.
