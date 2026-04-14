---
name: unit-01-transcript-format-mapping
type: research
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
model: sonnet
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T21:40:59Z'
hat_started_at: '2026-04-14T21:44:29Z'
outputs:
  - knowledge/TRANSCRIPT_FORMAT.md
completed_at: '2026-04-14T21:46:15Z'
---

# Research: Claude Code transcript file format and token fields

## Scope

Produce a definitive reference document describing the exact schema of `~/.claude/projects/**/*.jsonl` files as they exist on the operator's machine today, focused on the fields needed for per-bolt metrics capture. This research feeds the development phase's parser implementation.

## Why

The discovery document establishes that metrics must come from Claude Code's transcript files, but the codebase has no existing parser and the upstream format is not documented here. Before design can commit to a schema, we need a grounded answer to: *what does a transcript entry look like, which fields carry token counts, and how are assistant turns delimited?*

## Deliverable

A single artifact at `.haiku/intents/unit-metrics-and-browse-dashboards/knowledge/TRANSCRIPT_FORMAT.md` containing:

- A representative sample of a transcript entry (sanitized — no user content, no API keys).
- The full list of usage fields present on assistant turns (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus any others discovered).
- Documentation of how message boundaries and tool-use entries appear in the stream.
- Notes on timestamp field name and format, so downstream code can filter entries by time window.
- A list of all model IDs observed in the sample data, so the pricing unit knows which IDs to cover.

## Completion Criteria

- [x] `TRANSCRIPT_FORMAT.md` exists in the intent's `knowledge/` directory.
- [x] The document includes at least one real sanitized sample entry from a local transcript file, reproduced inline.
- [x] Every token-bearing field on an assistant turn is named with its JSON path (e.g., `message.usage.input_tokens`).
- [x] The document explicitly names the timestamp field used to sequence entries and gives its format (ISO 8601 / epoch).
- [x] The document lists every distinct `model` ID observed in the sampled transcripts.
- [x] `grep -r "input_tokens\|cache_read" ~/.claude/projects | head -5` output is captured or referenced to prove the fields exist in real data.
