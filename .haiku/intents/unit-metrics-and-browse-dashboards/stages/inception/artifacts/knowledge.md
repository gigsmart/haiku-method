# Discovery Document: Unit Metrics & Browse Dashboards

## Problem Statement

H·AI·K·U runs intents through stages, hats, and bolts but leaves behind no structured record of what those cycles cost in tokens, dollars, or wall-clock time. Operators cannot answer basic questions like which hat burns the most tokens, what an intent cost to produce, or whether cost-per-unit is trending down. Claude Code records every turn's usage in transcript files at `~/.claude/projects/**/*.jsonl`, but the plugin has no mechanism to attribute that data to the specific unit/hat/bolt that spent it.

## Goal

Persist per-bolt metrics on unit state on disk (tokens in, out, cache reads, wall-clock duration, derived USD cost), sourced by parsing Claude Code transcript files, aggregated up to unit totals. Surface the metrics in the browse app through four analytics dashboards: intent-level overview, studio/stage throughput, hat efficiency, and time-series trends across all workstreams. Metrics must survive across sessions, branches, and worktrees and must be queryable without re-parsing transcripts on every dashboard load.

## Success Criteria

**Functional:**
- Every completed unit contains a `metrics` block in its frontmatter with aggregated totals and a per-bolt breakdown.
- Token counts originate from Claude Code transcript files, not from custom instrumentation.
- USD cost is derived from token counts × a versioned, committed model-pricing table.
- The browse app surfaces four dashboard views (intent overview, studio/stage throughput, hat efficiency, time-series trends).
- Local and remote browse providers both render metrics — they display pre-aggregated data, they don't compute.

**Outcome:**
- An operator can answer "what did intent X cost to build?" without shell scripting.
- An operator can see which hats in a studio burn disproportionate tokens and use that signal to tune hat prompts.

## Research Findings

The inception stage produced four research artifacts in `knowledge/`. Each closed a specific unknown that blocked design:

### 1. Transcript Format (`TRANSCRIPT_FORMAT.md` — from unit-01)

Documents the exact on-disk shape of `~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl` as of 2026-04-14. Key findings that downstream design must honor:

- **One API turn is split across multiple JSONL lines** (one per content block), each with the same `message.id` and a byte-identical `usage` object duplicated on every line. A parser that sums across lines without deduping by `message.id` will over-count by the number of content blocks per turn (observed up to 12× in the reference file).
- **`cache_creation_input_tokens` has two sub-buckets** — `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` — which may be priced differently. The pricing table must cover both rates.
- **Subagent turns live in separate sidechain files** at `subagents/agent-{agentId}.jsonl` under the session dir. They carry `isSidechain: true` and an `agentId` field.
- **Timestamp field is `timestamp`**, ISO 8601 UTC with milliseconds.
- **Model IDs observed locally:** `claude-opus-4-6`, `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`, plus `<synthetic>` (zero-usage placeholder that must be skipped).

### 2. Pricing Strategy (`PRICING_STRATEGY.md` — from unit-02)

Recommends a checked-in `plugin/pricing.json` as the single source of truth for per-model USD rates. Discarded alternatives: runtime API fetch (network dependency breaks offline use and reproducibility), operator config file (inconsistent across team members), hardcoded TypeScript constants (buries pricing in code rather than data). Committed to the repo so cost estimates are reproducible across operators and time.

- Schema per entry: `model_id`, `input_per_mtok_usd`, `output_per_mtok_usd`, `cache_read_per_mtok_usd`, `cache_creation_per_mtok_usd` (with per-bucket breakdown for ephemeral_5m/1h), `currency`, `effective_date`, `source_url`.
- Seed table covers 10 model IDs across Opus, Sonnet, Haiku tiers with real public Anthropic rates or explicit `TBD — verify at {source}` placeholders where rates aren't yet published.
- Versioning: each bolt's persisted metrics stamp the `effective_date` of the pricing row used, plus a `pricing_source` commit SHA. This means old numbers stay interpretable after prices change.
- Unknown-model fallback: record tokens only with a `cost_warning`. Skips cost for the unknown model, never fails the bolt, never writes a fake $0.

### 3. Bolt-to-Transcript Correlation (`CORRELATION_STRATEGY.md` — from unit-03)

Recommends **session-ID + timestamp-window intersection** with dedup-by-`message.id` and explicit sidechain file inclusion. Discarded alternatives:

- *Session-ID only* — over-counts when multiple bolts share a session.
- *Timestamp window only* — under-counts when two worktrees share a clock-adjacent region.
- *Cursor approach* — requires transcript-file stability the harness does not guarantee.
- *PreToolUse/PostToolUse hook accumulation* — breaks when subagents spawn their own Task calls because the hook fires on the parent session, not the sidechain.

**Bolt boundary tool calls** (verified in `packages/haiku/src/state-tools.ts`):

- **Bolt-start:** `haiku_unit_start` (for bolt 1) or `haiku_unit_reject_hat` / `haiku_unit_increment_bolt` (for bolt N+1).
- **Bolt-end:** `haiku_unit_advance_hat` **on the last hat only** (the completion branch) or the same `reject_hat` / `increment_bolt` call that starts the next bolt.
- Non-last-hat `haiku_unit_advance_hat` is a hat boundary *inside* a bolt, not a bolt boundary.

**Minimal new state** on a unit's frontmatter:

```yaml
metrics:
  total_usd: 0.42                # rolled up from bolts
  total_input_tokens: 12345
  total_output_tokens: 4321
  total_cache_read_tokens: 98765
  total_duration_seconds: 180
  bolts:
    - n: 1
      session_ids: ["abc-123"]
      started_at: 2026-04-14T21:40:59Z
      ended_at: 2026-04-14T21:51:30Z
      outcome: completed
      input_tokens: 12345
      output_tokens: 4321
      cache_read_tokens: 98765
      cache_creation_ephemeral_5m_tokens: 1000
      cache_creation_ephemeral_1h_tokens: 500
      duration_seconds: 180
      usd_cost: 0.42
      pricing_effective_date: "2026-04-01"
      pricing_source: "plugin/pricing.json@abc1234"
```

**Subagent attribution — RESOLVED:** Claude Code's `Task` tool spawns subagents in-process, not as child processes. This means `process.env.CLAUDE_SESSION_ID` is identical for the parent and every subagent. The distinguishing keys are the per-line `agentId` field, the `isSidechain: true` flag, and the sidechain file location at `~/.claude/projects/{encoded-cwd}/{sessionId}/subagents/agent-{agentId}.jsonl`. Therefore:

- A bolt's `session_ids[]` only ever contains the parent session ID (usually just one).
- The capture code must also record `agent_id` (nullable — `null` for parent-context work, `agent-{hex}` for subagent-context work) so parallel wave-N subagents don't collide.
- The parser's correlation filter is `session_id match` AND `timestamp within [bolt.started_at, bolt.ended_at]` AND `(agent_id match OR (agent_id null AND isSidechain !== true))`.

This resolves the open design question — no fresh session IDs to enumerate, no speculative multi-session bolts in the common case. Compaction can still split a single bolt across two transcript files for the same session; the session-id + timestamp-window filter handles that naturally.

**Edge cases covered:** compaction mid-work, parallel bolts on one session, user interrupt, transcript rotation, subagent attribution.

### 4. Dashboard Architecture (`DASHBOARD_ARCHITECTURE.md` — from unit-04)

Recommends **Recharts 3.x** as the chart library. Discarded alternatives: Visx (too low-level for four conventional dashboards), Apache ECharts (~350 KB + shaky React 19 wrapper), Chart.js (canvas-only, no Tailwind ergonomics), Tremor (coupled to Tailwind 3), nivo (per-chart-family bloat). Recharts 3.x has first-class React 19 peer support, declarative JSX that matches the browse app's existing component patterns, Tailwind 4 compatibility via className/CSS-vars, TypeScript built in, and a ~100 KB gzipped footprint that's trivial next to the already-shipping mermaid bundle.

**Aggregation strategy: write-time rollups on disk.** Tied to the constraint that GitHub/GitLab remote providers read through GraphQL and cannot run arbitrary JS — so dashboards must read pre-aggregated data from committed files, not scan every unit on load. The plugin writes:

- Per-unit totals into unit frontmatter (`metrics:` block above)
- `stages/{stage}/metrics.json` — stage rollup per intent
- `intents/{slug}/metrics.json` — intent rollup
- Workspace-level `.haiku/metrics/index.json` — cross-intent summary
- `.haiku/metrics/timeseries.ndjson` — append-only event log for time-series trends

All five writes happen inside the same tool call that advances the bolt. Local, GitHub, and GitLab providers all read the same pre-aggregated files — remote providers fetch ≤3 files per dashboard load regardless of intent count.

**New `BrowseProvider` methods:**

```typescript
listAllMetrics(): Promise<IntentMetricsSummary[]>;
getIntentMetrics(slug: string): Promise<IntentMetrics>;
getStageMetrics(slug: string, stage: string): Promise<StageMetrics>;
listTimeseries(opts?: { sinceIso?: string }): Promise<TimeseriesEvent[]>;
```

**Per-dashboard file map:**

- **Intent overview** — reads `intents/{slug}/metrics.json` + unit frontmatter `metrics:` blocks for the selected intent.
- **Studio/stage throughput** — reads the workspace-level `.haiku/metrics/index.json` + per-intent `metrics.json` files.
- **Hat efficiency** — reads every unit's frontmatter `metrics.bolts[].hat_*` fields across intents in one pass (pre-aggregated into `index.json`).
- **Time-series trends** — reads `.haiku/metrics/timeseries.ndjson` with optional `sinceIso` filter.

**Scale target:** designed for up to 200 intents × 20 units × 10 bolts (~40,000 events) before needing pagination or virtualization.

## UI Impact

- **`website/app/browse/components/PortfolioView.tsx`** — add cost/tokens/duration columns to intent rows.
- **`website/app/browse/components/IntentDetailView.tsx`** — add a metrics summary card and a stage-breakdown visualization.
- **`website/app/browse/components/UnitDetailView.tsx`** — add a per-bolt metrics table.
- **New `website/app/browse/dashboards/` routes** — four new dashboard pages for the four views above.

## Technical Landscape (already-in-place)

- **MCP tool registration** at `packages/haiku/src/server.ts:189–195` combines `orchestratorToolDefs` + `stateToolDefs`. New metrics tools are added by appending a third array.
- **Unit state reader/writer** at `packages/haiku/src/state-tools.ts` (`haiku_unit_start`, `haiku_unit_advance_hat`, `haiku_unit_reject_hat`, `haiku_unit_set`). Bolt boundaries are there — the capture hook needs to fire inside those handlers.
- **Unit frontmatter schema** at `packages/haiku/src/types.ts` / `shared/src/types.ts:30–44`. `HaikuUnit` already has `bolt: number` — needs a `metrics?: UnitMetrics` field added.
- **BrowseProvider interface** at `website/lib/browse/types.ts`. Local implementation at `website/lib/browse/local-provider.ts`, remote at `github-provider.ts` / `gitlab-provider.ts`.
- **Chart library:** Mermaid 11.12.2 is installed but unused in browse components — Recharts will be the first chart library actually rendered in browse.
- **Session ID access:** `CLAUDE_SESSION_ID` is read today at `packages/haiku/src/hooks/inject-state-file.ts:48`, `packages/haiku/src/hooks/inject-context.ts:69`, `packages/haiku/src/hooks/context-monitor.ts:29`, and `packages/haiku/src/sentry.ts:27-28`. The pattern is `(input.session_id as string) || process.env.CLAUDE_SESSION_ID`. No code writes it to unit state today. The capture code inside state-tools.ts boundary handlers can read `process.env.CLAUDE_SESSION_ID` directly at bolt-boundary time without a new plumbing hop.

## Transcript Path Resolution

The project directory under `~/.claude/projects/` is named after the **session's initial cwd** at the moment Claude Code was launched, with every `/` and `.` replaced by `-`. Leading dots (e.g. `/.claude`) become double-dash (`--claude`). Directly verified on this machine 2026-04-14:

- Current worktree cwd: `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/.claude/worktrees/replicated-wondering-pizza`
- Encoded form: `-Volumes-dev-src-github-com-thebushidocollective-haiku-method--claude-worktrees-replicated-wondering-pizza`
- Matching directory entry: present under `~/.claude/projects/` only if a session was *started* inside that worktree. Sessions started elsewhere and then `cd`'d in do NOT create a new project dir — they stay under the original cwd's encoded path.

**Implication for the capture mechanism:** the parser cannot assume `process.cwd()` maps to the transcript directory. The path to search is `~/.claude/projects/{encode(session_initial_cwd)}/{sessionId}.jsonl`, where `session_initial_cwd` is not directly available. Two options the design stage must pick between:

1. **Scan all project dirs** for the `sessionId` UUID — one O(N) directory walk per bolt capture. Acceptable if N ≤ a few hundred.
2. **Write a one-time marker** at session start recording the initial cwd (via an existing Claude Code startup hook), then read the marker to build the exact path.

For parallel worktrees: each worktree runs under its own cwd, so when a subagent spawns in a worktree, the session_initial_cwd is still the **parent session's** cwd (subagents are in-process). The sidechain files nest under the parent session's project dir.

## Capture Mechanism — Design-Stage Resolution Required

The research established WHERE to hook (bolt-boundary tool calls in `state-tools.ts`) and WHAT to read (transcripts + pricing.json) but deliberately stopped short of HOW to make the writes atomic and crash-safe. The design stage must pick answers for:

1. **Write-ordering inside the boundary tool call.** The `haiku_unit_advance_hat` / `haiku_unit_reject_hat` / `haiku_unit_increment_bolt` handlers in `state-tools.ts` already mutate the unit's frontmatter. The metrics capture adds a read-transcript-then-write-metrics step. Options:
   - Capture inline, before the existing frontmatter writes, so a single `setFrontmatterField` pass writes metrics + status/bolt/hat.
   - Capture inline, after the existing writes, as a second `setFrontmatterField` pass.
   - Fire-and-forget async via `setImmediate`, accepting that some bolts won't have metrics if the process exits.
2. **Abandoned bolts.** When a bolt starts but never reaches a boundary tool call (user interrupt, process crash, Ctrl-C), no metrics get written. Candidates:
   - On the next `haiku_unit_start` / `haiku_run_next` call, detect stale `hat_started_at` timestamps and backfill metrics from the transcript window.
   - Accept the loss and mark incomplete bolts with `metrics_incomplete: true`.
   - Write a sentinel "bolt started" record to state at bolt-start time so the next boundary call can close it out.
3. **Parser failure.** If transcript parsing throws (upstream format drift, truncated file, permissions error), should the boundary tool call fail, succeed with `parse_warning`, or succeed silently? The discovery's recommended posture is fail-soft — but the design stage must confirm and specify the exact warning field name.
4. **Pricing lookup failure.** If a model ID is not in `pricing.json`, the research said "record tokens only with `cost_warning`". The design stage must pick the exact field name and whether the warning surfaces in browse dashboards.

These are not new research unknowns — they are design decisions on top of the completed research. They belong in the design stage's first phase.

## PII / Secrecy Scope

The capture mechanism copies data *from* the transcript file (which may contain user prompts, file contents, and tool outputs) *into* the intent directory (which gets committed to git and pushed to GitHub/GitLab). To prevent accidental secret leakage, the design stage commits to copying **only** these fields from each transcript entry into unit frontmatter:

- Token counts (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens.ephemeral_5m_input_tokens`, `cache_creation_input_tokens.ephemeral_1h_input_tokens`)
- `model` ID
- `sessionId` UUID
- `agentId` (if subagent)
- `timestamp`

Fields that **MUST NOT** be copied under any circumstance:
- `content` / `message.content` — may contain user prompts or file contents
- `tool_use.input` — may contain arbitrary parameters, file paths, secrets
- `tool_result` bodies — may contain command output, file contents
- Any field whose name contains `text`, `input` (other than the specifically-listed token counts), `output`, `body`, or `content`

The transcript parser is a strict allowlist: only the fields above are extracted; everything else is dropped on the floor. Security stage review will confirm.

## Migration / Backfill

**Decision: no backfill.** Existing completed units and intents stay metric-less permanently. The browse app must render units without a `metrics:` frontmatter block as "no metrics captured" (not an error). Rollup aggregators must tolerate the missing data — summing only over units that have metrics, surfacing the gap in the dashboard as a count (e.g., "12 of 87 units have metrics").

Rationale: transcript files older than a few weeks are rotated or pruned by Claude Code itself, so a backfill attempt would produce an uneven history that reads worse than a clean cutoff date. The cutoff is the first intent created after this feature ships.

## Parallel-Worktree Rollup Race — Design-Stage Resolution Required

The research dashboard doc proposed writing five tiers of pre-aggregated files inside the boundary tool call: per-unit (in unit frontmatter), `stages/{stage}/metrics.json`, `intents/{slug}/metrics.json`, `.haiku/metrics/index.json`, and `.haiku/metrics/timeseries.ndjson`. **Only the first of these is safe for parallel-worktree execution** — unit frontmatter is scoped to the unit's own worktree. The other four live in directories that other worktrees also write to, and wave-0 of this very stage already observed merge conflicts on shared files.

The design stage must pick exactly one strategy for the shared rollups. Candidates:

1. **Unit frontmatter only — reconstruct at read time.** The browse app (or a dedicated MCP read tool) walks all unit frontmatter on load and aggregates on the client. Pros: zero write-time race risk; every unit is the single source of truth for its own metrics. Cons: dashboard load does O(units × bolts) reads instead of O(1) file fetches; remote providers must support fetching many files.
2. **Per-session append-only files.** Each boundary call writes to `.haiku/metrics/sessions/{session_id}.ndjson` instead of shared index files. Since Claude Code sessions are never resumed across worktrees, per-session files never collide. Rollups become a read-time union across all session files. Pros: write-safe; preserves per-bolt detail. Cons: more files, dashboard union cost grows with session count.
3. **Deferred reducer on parent branch.** Boundary calls only write unit-frontmatter metrics. A separate `haiku_rollup_metrics` MCP tool (invoked at stage-complete time on the parent branch, after all unit branches have merged back) reads unit frontmatter and writes the shared rollup files. Pros: single writer, no races; rollup files stay small. Cons: new tool to implement; rollups lag execution by one stage-complete event.
4. **Last-writer-wins with merge drivers.** Accept races on the shared files but provide git merge drivers for `stages/*/metrics.json` and `intents/*/metrics.json` that numerically sum conflicting entries instead of failing. Pros: no tool changes. Cons: custom merge drivers are operator-hostile to set up, brittle to schema changes.

Recommendation to design: start with **option 1** (frontmatter-only + read-time aggregation) plus an append-only workspace-level NDJSON for the time-series view. It is the only option with zero shared-file write races and the only option that works identically across local, GitHub, and GitLab providers without custom merge drivers. If perf becomes a problem at scale, option 3 can be added as an optimization layer.

## Considerations & Risks

- **Transcript format drift** — upstream Claude Code may change field names without notice. Mitigation: treat the parser as a boundary layer; fail soft (no metrics, no cost) rather than blocking the bolt if parse fails. Record a `parse_warning` on the bolt.
- **Pricing staleness** — the committed pricing table will drift from actual billing. Mitigation: every cost estimate stamps the `effective_date` and `pricing_source` commit SHA so the operator can tell how old the number is. Do NOT paper over stale rates with a default.
- **Frontmatter bloat** — per-bolt arrays in unit frontmatter grow the file. Observed today: most units run ≤3 bolts. Acceptable. If a unit runs 10+ bolts, design may split the per-bolt detail into a sidecar — but rollup totals stay in frontmatter so dashboards read one file per unit regardless.
- **Subagent session-id inheritance** — open design question. Flagged explicitly in `CORRELATION_STRATEGY.md` for resolution in the design stage.
- **Merge conflicts in parallel worktrees** — observed during this stage's own execution. The capture mechanism must not write to files outside the unit's worktree during parallel execution, or every wave will conflict. Mitigation: metrics are written to the unit's own frontmatter (in the unit's own worktree) by the tool call itself, not by a post-hook that spans worktrees.

## Downstream Stages

- **design** — formalizes the metrics data model, resolves the subagent session-id inheritance question, wireframes the four dashboards, specifies the pricing.json schema exactly.
- **development** — implements the transcript parser, hooks it into `haiku_unit_advance_hat` / `haiku_unit_reject_hat`, adds new MCP tools, writes the rollup pipeline, builds the dashboard components, writes tests.
- **operations** — migration plan for existing units (fallback: no metrics), docs for the metrics schema and the pricing table.
- **security** — audit transcript parser for path traversal (the transcript paths are user-home-relative), ensure no secrets leak into cost labels.

## Unit Map

| # | Unit | Model | Deliverable | Status |
|---|---|---|---|---|
| 01 | unit-01-transcript-format-mapping | sonnet | `knowledge/TRANSCRIPT_FORMAT.md` | completed |
| 02 | unit-02-pricing-data-source | haiku | `knowledge/PRICING_STRATEGY.md` | completed |
| 03 | unit-03-bolt-to-transcript-correlation | opus | `knowledge/CORRELATION_STRATEGY.md` | completed |
| 04 | unit-04-dashboard-architecture | sonnet | `knowledge/DASHBOARD_ARCHITECTURE.md` | completed |

Wave 0: units 01, 02, 04 (parallel). Wave 1: unit 03 (depends on unit-01's transcript format).
