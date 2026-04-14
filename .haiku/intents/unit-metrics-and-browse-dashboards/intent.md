---
title: >-
  Add per-bolt metrics persistence to H·AI·K·U units (tokens in/out/cache,
  wall-clock duration, and derived USD cost estimates), sourced by parsing
  Claude Code transcript files (~/.claude/projects/**/*.jsonl) and aggregated up
  to unit totals. Then add workstream analytics dashboards to the browse app
  showing intent-level overviews, studio/stage throughput, hat efficiency, and
  time-series trends across all workstreams. Metrics live in unit state on disk
  so they survive across sessions and are queryable without re-parsing
  transcripts.
studio: software
mode: continuous
status: active
created_at: '2026-04-14'
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
---

# Add per-bolt metrics persistence to H·AI·K·U units (tokens in/out/cache, wall-clock duration, and derived USD cost estimates), sourced by parsing Claude Code transcript files (~/.claude/projects/**/*.jsonl) and aggregated up to unit totals. Then add workstream analytics dashboards to the browse app showing intent-level overviews, studio/stage throughput, hat efficiency, and time-series trends across all workstreams. Metrics live in unit state on disk so they survive across sessions and are queryable without re-parsing transcripts.

User wants observability into H·AI·K·U workstreams. Decisions from prelaboration: (1) Metrics scope = tokens (in/out/cache), wall-clock duration, USD cost estimates. (2) Granularity = per bolt, rolled up to unit. (3) Data source = Claude Code transcript files at ~/.claude/projects/**/*.jsonl — parse assistant turns for usage data. (4) Dashboards in browse app = intent-level overview, studio/stage throughput, hat efficiency, time-series trends. Metrics must persist on disk in unit state so they're queryable without re-parsing transcripts each time.
