# Discovery — Unit Metrics & Browse Dashboards

## Business Context

### Feature goal & vision

Give H·AI·K·U operators visibility into the real cost and throughput of AI-driven workstreams. Today the plugin executes intents through stages, hats, and bolts, but leaves behind no structured record of what those cycles cost in tokens, dollars, or wall-clock time. When the work ships, there is no way to answer "which hat burns the most tokens?", "what did this intent cost to produce?", or "is our cost-per-unit trending down?".

This intent adds two capabilities:

1. **Per-bolt metrics persisted on disk** — every bolt records tokens in/out/cache, duration, and derived USD cost onto the unit file where it lives. Metrics roll up from bolt to unit to stage to intent without re-parsing transcripts on every query.
2. **Analytics dashboards in the browse app** — the existing `website/app/browse` Next.js UI gains dashboards showing intent-level overviews, studio/stage throughput, hat efficiency, and time-series trends across all local workstreams.

### Origin & context

User request from Jason (plugin owner), 2026-04-14: metrics persisted on units that include token usage, plus dashboards in browse showing workstream analytics.

### Success criteria

**Functional:**

- A completed unit contains a `metrics` block in its frontmatter with aggregated totals and a per-bolt breakdown.
- Token counts originate from Claude Code transcript files at `~/.claude/projects/**/*.jsonl`, not from a custom instrumentation layer.
- USD cost is derived from token counts × a versioned model-pricing table committed to the repo.
- The browse app surfaces four dashboard views: intent overview, studio/stage throughput, hat efficiency, time-series trends.
- Local and remote browse providers both render metrics (they can't compute, only display what's on disk).

**Outcome:**

- An operator can answer "what did intent X cost to build?" without shell scripting.
- An operator can see which hats in a studio burn disproportionate tokens and use that to tune hat prompts.
- Metrics survive across sessions, branches, and worktrees — they live in the intent directory like any other artifact.

## Competitive Landscape

Claude Code itself exposes token counts per message at runtime but does not persist them against any structured unit of work. `ccusage` (community tool) aggregates transcript-level usage but is not scoped to user-defined features or stages. Linear/Jira have throughput analytics but no concept of AI cost. H·AI·K·U is uniquely positioned to correlate cost with the specific hat/stage/unit that spent it, because the plugin already owns that structure on disk.

Gaps & opportunities:

- No existing tool attributes Claude API spend to a feature/epic/role. H·AI·K·U's studio > stage > unit > bolt > hat hierarchy is the natural aggregation key.
- Browse app already has intent/unit views and a provider pattern — adding analytics layers on top is incremental, not greenfield.

## Considerations & Risks

### Technical considerations

- **Transcript location is user-home, not project-root.** `~/.claude/projects/**/*.jsonl` lives outside the git tree. The browse app already supports remote providers (GitHub/GitLab) that have no access to `~/.claude`. Metrics capture must happen at write time (when the bolt runs) and persist into the intent directory so remote browsing still shows them.
- **No session-ID-to-unit mapping today.** `state-tools.ts` reads `CLAUDE_SESSION_ID` for session metadata but does not record it on units or bolts. Without this anchor, correlating transcript entries to bolts is ambiguous — multiple bolts can share one session and one bolt can span sessions.
- **Bolt lifecycle has no explicit end hook.** `haiku_unit_advance_hat` and `haiku_unit_reject_hat` are the closest events to "bolt boundary" but neither runs guaranteed cleanup. Metrics capture must hook into one or both.
- **Pricing is per-model and changes.** Hardcoding costs is brittle. A versioned `pricing.json` in the plugin with a `modelId → {input, output, cacheRead, cacheWrite}` map is the simplest durable solution.
- **Frontmatter bloat.** Existing unit files have ~8 frontmatter fields. Adding a metrics block grows the file but keeps the single-file-per-unit invariant. A sub-object under a `metrics:` key is cleaner than 20 flat keys.

### Business considerations

- **No privacy/compliance impact.** All data is already local to the operator's machine in the transcript files; we're just copying it into the intent directory.
- **Rollout is additive.** Old units without metrics must still render in the browse app (fall back to "no metrics captured").

### Open questions (resolved later in research units)

- Exact schema of `~/.claude/projects/**/*.jsonl` — field names for token counts, message boundaries, tool-use correlation.
- How to correlate a bolt's execution window to transcript entries: session ID filter, timestamp window, or both.
- Source-of-truth for model pricing — a committed JSON table, a runtime API, or operator config.
- Chart library for the browse dashboards, aggregation location (write-time vs read-time), and provider-interface additions.

### Recommended storage shape (for design to formalize)

Recommendation: **nested `metrics:` block in unit frontmatter**, with both rollup totals and a per-bolt `bolts:` array living under the same key. Rationale: keeps units self-contained (survives git operations and worktree moves), reuses the existing `setFrontmatterField()` path for writes, renders directly in `git diff`, and requires no new file types for the browse providers (local / GitHub / GitLab) to resolve. If per-bolt arrays bloat frontmatter past readability, design can split the per-bolt detail into a sidecar later — but the rollup totals belong in frontmatter regardless, so dashboards can read one file per unit and still produce summaries.

### Risks

- **Risk:** Transcript format changes upstream without notice. **Mitigation:** Treat the parser as a boundary layer; fail soft (no metrics) rather than blocking the bolt if parse fails.
- **Risk:** Metrics-capture hook runs after unit state is written, losing the bolt. **Mitigation:** Capture metrics *into* the advancing tool call, not as a separate post-hook.
- **Risk:** Cost estimates drift from actual billing because the pricing table is stale. **Mitigation:** Version the pricing table and surface the `pricing_version` alongside cost estimates so operators know how to trust them.
- **Risk:** Dashboard query reads every unit in every intent on every page load. **Mitigation:** Pre-aggregate rollups at write time so dashboards read summary fields, not per-bolt arrays.

## UI Impact

Affected surfaces (all in `website/app/browse`):

- **Portfolio view** (`PortfolioView.tsx`) — add cost/tokens/duration columns to intent rows.
- **Intent detail view** (`IntentDetailView.tsx`) — add a metrics summary card and a stage-breakdown visualization.
- **Unit detail view** (`UnitDetailView.tsx`) — add a per-bolt metrics table.
- **New dashboards section** — new routes/components under `website/app/browse/dashboards/` for the four dashboard views (intent overview, studio/stage throughput, hat efficiency, time-series trends).

## Technical Landscape

### Entity inventory (current state)

- **Intent** — `.haiku/intents/{slug}/intent.md` with frontmatter (title, studio, stages, active_stage, status, timestamps). No metrics today.
- **Unit** — `.haiku/intents/{slug}/stages/{stage}/units/unit-NN-*.md` with frontmatter (`name`, `type`, `status`, `depends_on`, `bolt`, `hat`, `started_at`, `completed_at`). `bolt` is a single integer counter, not a history.
- **Stage state** — `.haiku/intents/{slug}/stages/{stage}/state.json` (phase, timestamps, gate_outcome).
- **Session metadata** — separate `.json` + `.jsonl` event log via `session-metadata.ts`, not part of unit state.

### API surface (current MCP tools)

State-mutation tools in `packages/haiku/src/state-tools.ts`:

- `haiku_unit_get` / `haiku_unit_set` (lines ~1899–1926) — scalar frontmatter field access.
- `haiku_unit_start` (line ~2266) — initializes `bolt=1`, `hat={first}`, `started_at`.
- `haiku_unit_advance_hat` (line ~2311) — advances hat; auto-completes unit on last hat.
- `haiku_unit_reject_hat` (line ~2587) — rejects hat, increments bolt, moves back one hat.
- `haiku_unit_increment_bolt` (line ~2674) — manual bolt bump.
- `haiku_unit_list` (line ~2247) — lists all units in a stage.

Tool registration: `server.ts` lines 189–195 combine `orchestratorToolDefs` + `stateToolDefs`. Adding metrics tools means adding a new defs array and splicing it in.

### Architecture patterns

- MCP tools return JSON action payloads; orchestrator never writes unit state directly — it delegates to state-tools.
- Frontmatter access goes through `gray-matter` + `setFrontmatterField()` utilities.
- Browse app reads intent/unit data via `BrowseProvider` interface (`website/lib/browse/types.ts`). Local and remote providers both implement `listIntents()`, `getIntent(slug)`, `readFile(path)`, `getSettings()`.
- `HaikuUnit` type in `shared/src/types.ts` already has a `bolt: number` field — needs a `metrics` field added.

### Existing code structure (relevant files)

- `packages/haiku/src/orchestrator.ts` — FSM action handling, hat/bolt progression logic.
- `packages/haiku/src/state-tools.ts` — unit state mutation tools.
- `packages/haiku/src/server.ts` — MCP server tool registration.
- `packages/haiku/src/session-metadata.ts` — session event logging (separate from unit state).
- `packages/haiku/src/context-monitor.ts` — PostToolUse runtime token monitoring (does not persist).
- `website/app/browse/page.tsx` — browse app entry.
- `website/app/browse/components/*.tsx` — Portfolio, IntentDetail, UnitDetail, Kanban views.
- `website/lib/browse/{local,github,gitlab}-provider.ts` — data source implementations.
- `website/lib/browse/types.ts` — `BrowseProvider` interface + `HaikuUnit` parsing.

### Non-functional requirements

- **Performance:** Metrics capture must add < 100ms per bolt-advance tool call. Dashboard aggregation must read rollups, not scan every unit file.
- **Correctness:** Token counts must match what Claude Code's transcript recorded (we're a faithful copy, not a re-derivation). USD cost is a derived estimate and must label itself as such.
- **Compatibility:** Old units without metrics must render in all browse views without errors.
- **Offline:** No network calls during metrics capture or dashboard rendering.

### Constraints

- Unit state format is markdown frontmatter — keep it parseable by hand and readable in `git diff`.
- Browse app must work over local filesystem, GitHub, and GitLab providers — metrics must be persisted *in the intent directory* (not `~/.claude`) so remote providers can read them.
- Pricing table must be committed to the repo so cost estimates are reproducible across operators and time (checked-in version = checked-in answer).

## Overlap Awareness

No other active `haiku/*/main` branches in origin modify the same files this intent plans to touch (`state-tools.ts`, `orchestrator.ts`, `website/app/browse/**`). Safe to proceed.

## Dependency Chain Forward (non-binding)

Downstream stages (design, development) will produce:

- **design** — data model for the metrics block, pricing.json schema, dashboard wireframes, bolt-to-transcript correlation strategy.
- **development** — transcript parser, metrics capture hook in `haiku_unit_advance_hat` / `haiku_unit_reject_hat`, new MCP tools (`haiku_bolt_record_metrics`, `haiku_unit_rollup_metrics`), browse app dashboard components, tests.
- **operations** — migration for existing units (no-op fallback), docs for the metrics schema and pricing table.
- **security** — review transcript parser for path traversal, ensure no secrets leak into cost labels.

This intent's **inception stage** produces only the discovery document and research units that close the remaining unknowns before design can proceed.
