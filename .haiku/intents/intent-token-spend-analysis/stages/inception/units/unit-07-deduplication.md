---
title: Message deduplication and coverage counters
model: sonnet
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: researcher
started_at: '2026-05-05T13:49:46Z'
hat_started_at: '2026-05-05T13:49:46Z'
iterations:
  - hat: researcher
    started_at: '2026-05-05T13:49:46Z'
    completed_at: null
    result: null
---
# Message deduplication and coverage counters

Discovery calls out ccusage's deduplication fingerprint `(session_id, message_id, request_id)` as "the right fingerprint" — necessary to prevent double-counting replayed messages (a forked subagent re-emitting the parent's earlier message, a session restart that re-reads stale lines, a session log that was rotated and concatenated). Without explicit dedup, totals over the same input can vary across runs depending on file enumeration order, which silently breaks the byte-identity guarantee from unit-04.

This unit pins the dedup contract and tightens the `coverage.*` counter taxonomy in api-surface so duplicates are accounted-for rather than dropped invisibly.

## Fingerprint definition

For every parsed jsonl event with a token-bearing `usage` field, the dedup fingerprint is the tuple `(session_id, message_id, request_id)` extracted from the event object's top-level fields. All three fields are written by Claude Code on every assistant-role message (the source of token-bearing events).

- `session_id` — the parent or subagent session uuid, identifies the session log file.
- `message_id` — Anthropic API message id (`msg_…`), unique per assistant message within a session.
- `request_id` — Anthropic API request id (`req_…`), unique per API call. A retry produces a new `request_id` even with the same `message_id`; we want to count the *successful* terminal request, so dedup on the full triple ensures we count the final attempt only.

Events missing any one of the three fields are ineligible for dedup and counted as `events_skipped_unparseable` (see counter taxonomy below).

## In-memory dedup structure

- **Type:** a JavaScript `Set<string>` keyed by `${session_id}|${message_id}|${request_id}` — the literal pipe-joined string. No interning of components, no nested map; the analyzer is single-shot per call so the simple shape is fine.
- **Lifecycle:** the set is created at the start of `analyzeTokenSpend()` and discarded when the call returns. Different concurrent calls do not share the set; dedup is per-analysis-invocation.
- **Memory bound:** O(unique fingerprints) — the discovery NFR target says under 100 MB total memory for any realistic intent. Each fingerprint string is well under 200 bytes; even 100K events stay under 20 MB.
- **Insert order:** events are processed in file-then-line order; the FIRST occurrence of a fingerprint is counted, subsequent occurrences are skipped (and counted in `events_skipped_duplicate`, see below). Determinism: sort the file list lexicographically before opening to make insert order reproducible.

## Counter taxonomy update

api-surface §`coverage` currently exposes:

```ts
events_parsed: integer
events_skipped_unparseable: integer
events_skipped_no_usage: integer
```

This unit adds a fourth required counter, both to the api-surface schema and to the analyzer:

```ts
events_skipped_duplicate: integer  // events whose fingerprint was already counted in this analysis
```

`events_skipped_duplicate` is a top-level required field on `coverage` (peer to the existing three). Surfaced because it's a direct measure of correctness pressure — a non-zero value signals that the input had replayed messages and dedup is doing real work; a regression to zero across known-replay inputs flags a dedup bug.

Counter relationships (all checked by a unit-test gate):
- `events_parsed = unique-fingerprint events whose usage was successfully accounted for`.
- `events_skipped_unparseable = events that couldn't be JSON.parsed OR were missing one of {session_id, message_id, request_id}`.
- `events_skipped_no_usage = parseable events with all three id fields but no token-bearing usage block (e.g. system events, errors, empty assistant messages)`.
- `events_skipped_duplicate = events that had all three id fields, had usage, but whose fingerprint was already counted`.
- For any input: `total_lines_read == events_parsed + events_skipped_unparseable + events_skipped_no_usage + events_skipped_duplicate`. The four buckets partition every line.

## File-enumeration determinism

- File list for the parent session: every `*.jsonl` directly under `~/.claude/projects/<project_slug>/`, sorted lexicographically.
- File list for subagent sessions: every `agent-*.jsonl` under `~/.claude/projects/<project_slug>/<session_id>/subagents/` for each parent session id encountered, sorted lexicographically per directory.
- Sorting is required to make `events_skipped_duplicate` deterministic across runs (without it, the OS's filesystem-iteration order would decide which event "wins" the fingerprint slot).

## Quality gates

```yaml
quality_gates:
  - name: dedup-fingerprint-correctness
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "fingerprint"
  - name: dedup-replay-not-double-counted
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "replay"
  - name: coverage-counters-partition-lines
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "partition"
```

The test file `packages/haiku/test/token-spend-dedup.test.mjs` (authored in development stage) covers fixtures where: (a) the same fingerprint appears in two locations in the same file, (b) the same fingerprint appears in a parent session and a subagent jsonl, (c) one fingerprint is missing `request_id`, (d) the four `events_skipped_*` counters plus `events_parsed` sum to the file's line count.

## Stability tier

- The fingerprint definition `(session_id, message_id, request_id)` and the pipe-join key shape: **Internal** — analyzer detail, not consumer-facing. Changing the key shape doesn't affect any observable contract.
- The `events_skipped_duplicate` counter on `coverage`: **Stable** — added to api-surface §`coverage.required` array as part of this unit's schema work.
- The "first occurrence wins" rule: **Stable** — the rule combined with file-list lexicographic sorting is what makes `events_parsed` totals deterministic across runs (load-bearing for unit-04's byte-identity guarantee).
- The lexicographic file-list sort: **Stable**, same rationale.

## Open questions

- Should we expose a `events_duplicate_fingerprints[]` array listing the offending triples for debugging? **Proposed default:** no in v1 — surfaces a debugging facility most consumers don't need; can land as a future opt-in alongside `include_raw_events`. Veto-able.
- Should missing-`request_id` events fall back to dedup on `(session_id, message_id)` only? **Proposed default:** no — `request_id` is what disambiguates retries; dropping it would silently merge retries with the original. Treat them as `events_skipped_unparseable` instead. Veto-able.

## Completion criteria

- §"Fingerprint definition" names the three id fields and the rationale for using all three (retry disambiguation).
- §"In-memory dedup structure" specifies the data structure (Set), the lifecycle (per-call), the memory bound, and the insert-order rule.
- §"Counter taxonomy update" adds `events_skipped_duplicate` to api-surface `coverage` and lists the four-way partition invariant.
- §"File-enumeration determinism" specifies lexicographic sorting for both parent and subagent file lists.
- §"Quality gates" lists three executable gate commands targeting a named test file with grep filters.
- §"Stability tier" classifies the new counter as Stable and the internal fingerprint structure as Internal, with rationale.
- §"Open questions" lists deferred decisions with proposed defaults.
