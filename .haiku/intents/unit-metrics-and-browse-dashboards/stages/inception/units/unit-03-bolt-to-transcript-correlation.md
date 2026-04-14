---
name: unit-03-bolt-to-transcript-correlation
type: research
depends_on:
  - unit-01-transcript-format-mapping
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/TRANSCRIPT_FORMAT.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T21:53:22Z'
hat_started_at: '2026-04-14T21:57:50Z'
outputs:
  - knowledge/CORRELATION_STRATEGY.md
---

# Research: How to correlate a bolt's execution window to transcript entries

## Scope

Produce a concrete, testable strategy for answering the question: *given that a bolt just finished on unit X in intent Y, which transcript entries should I sum to compute this bolt's metrics?* This is the hardest unknown in the project and blocks the design of the capture mechanism.

## Why

The discovery document flags that `CLAUDE_SESSION_ID` exists as an env var but is not currently recorded on units, that multiple bolts can share one session, and that one bolt can theoretically span sessions. Without a clean mapping, metrics either over-count (attributing other work to the bolt) or under-count (missing tool-call turns). We need an answer before design commits to a capture point.

## Deliverable

A single artifact at `.haiku/intents/unit-metrics-and-browse-dashboards/knowledge/CORRELATION_STRATEGY.md` containing:

- An enumeration of candidate correlation approaches, each with pros/cons: (a) session-id filter only, (b) timestamp window only, (c) session-id + timestamp window intersection, (d) record transcript cursor at bolt start and read until cursor at bolt end, (e) hook into PreToolUse/PostToolUse and accumulate in-process.
- A recommendation of exactly one approach with rationale.
- A precise definition of the "bolt boundary" events the capture mechanism will hook into — which MCP tool calls mark bolt-start and bolt-end.
- A worked example: given a synthetic transcript with 20 entries spanning 3 bolts, show which entries get attributed to which bolt under the recommended approach.
- A description of the minimal state that needs to be added to unit or intent files to support the approach (e.g., "bolt records `session_id` and `started_at` timestamp, read from env at start").
- A list of edge cases and how the recommended approach handles each: (1) bolt spans two sessions because of compaction, (2) two bolts run in parallel on the same session, (3) user interrupts a bolt mid-way, (4) transcript file rotates during a bolt.

## Completion Criteria

- [ ] `CORRELATION_STRATEGY.md` exists in the intent's `knowledge/` directory.
- [ ] The document enumerates at least four candidate approaches with pros and cons.
- [ ] The document recommends exactly one approach and justifies the choice against the alternatives.
- [ ] The document names the exact MCP tool call(s) that mark bolt-start and bolt-end.
- [ ] The document includes a worked example showing entry-to-bolt attribution.
- [ ] The document lists at least four edge cases and describes the behavior of the recommended approach on each.
- [ ] The document specifies the minimal new state (fields, files) that must be added to make the approach work.
