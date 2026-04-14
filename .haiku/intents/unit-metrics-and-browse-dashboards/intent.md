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
active_stage: design
intent_reviewed: true
---

# Unit metrics and browse dashboards

## Problem

H·AI·K·U runs intents through stages, hats, and bolts but leaves behind no record of what those cycles cost in tokens, dollars, or wall-clock time. Operators cannot answer basic questions like which hat burns the most tokens, what an intent cost to produce, or whether cost-per-unit is trending down.

## Solution

Persist per-bolt metrics on unit state on disk (tokens in, out, cache reads, wall-clock duration, derived USD cost), sourced by parsing Claude Code transcript files, aggregated up to unit totals. Then add analytics dashboards to the browse app showing intent-level overviews, studio and stage throughput, hat efficiency, and time-series trends.

## Context

Scope decisions from prelaboration: metrics are tokens plus duration plus USD estimates, recorded per bolt and rolled up to unit, sourced from Claude Code transcript files at a user-local path, and surfaced in four dashboards. Metrics must live in the intent directory so they survive across sessions, branches, and worktrees.
